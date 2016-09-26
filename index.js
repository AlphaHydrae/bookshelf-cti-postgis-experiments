var _ = require('lodash'),
    chalk = require('chalk'),
    Promise = require('bluebird'),
    wellKnown = require('wellknown');

var knex = require('knex')({
  client: 'postgresql',
  connection: 'postgres://localhost/bookshelf-cti-postgis-experiments'
});

knex.on('query', logKnexQueries);

var st = require('knex-postgis')(knex);

var bookshelf = require('bookshelf')(knex);
bookshelf.plugin('registry');
bookshelf.plugin('virtuals');
bookshelf.plugin(ctiPlugin);
bookshelf.plugin(gisPlugin);

// Domain model
// ------------

var Thing = bookshelf.model('Thing', {
  tableName: 'things',

  cti: {
    children: {
      garden: 'Garden',
      singlePoint: 'SinglePoint'
    },

    delegate: {
      geom: [ 'garden', 'singlePoint' ],
      message: 'trafficSign'
    }
  },

  virtuals: {
    type: {
      get: function() {
        return this.get('thing_table');
      },

      set: function(table) {
        return this.set('thing_table', table);
      }
    }
  },

  serialize: function() {
    return _.omit(bookshelf.Model.prototype.serialize.apply(this, arguments), 'thing_table', 'streetLight', 'trafficSign');
  },

  streetLight: function() {
    return this.hasOne('StreetLight', 'id').through('SinglePoint', 'id', 'id')
  },

  trafficSign: function() {
    return this.hasOne('TrafficSign', 'id').through('SinglePoint', 'id', 'id')
  }
});

var SinglePoint = bookshelf.model('SinglePoint', {
  tableName: 'single_points',

  cti: {
    parent: { target: 'thing', model: 'Thing' },
    delegate: {
      name: 'thing'
    }
  },

  geoAttributes: [ 'geom' ]
});

var StreetLight = bookshelf.model('StreetLight', {
  tableName: 'street_lights',

  cti: {
    concrete: true,
    parent: { target: 'singlePoint', model: 'SinglePoint' },
    delegate: {
      name: 'singlePoint',
      geom: 'singlePoint'
    }
  }
});

var TrafficSign = bookshelf.model('TrafficSign', {
  tableName: 'traffic_signs',

  cti: {
    concrete: true,
    parent: { target: 'singlePoint', model: 'SinglePoint' },
    delegate: {
      name: 'singlePoint',
      geom: 'singlePoint'
    }
  }
});

var Garden = bookshelf.model('Garden', {
  tableName: 'gardens',

  cti: {
    concrete: true,
    parent: { target: 'thing', model: 'Thing' },
    delegate: {
      name: 'thing'
    }
  },

  geoAttributes: [ 'geom' ]
});

// Demo
// ----

var thingsToCreate = [
  new StreetLight({
    name: 'Light 1',
    geom: { type: 'Point', coordinates: [ 0, 0 ] }
  }),
  new StreetLight({
    name: 'Light 2',
    geom: { type: 'Point', coordinates: [ 1, 0 ] }
  }),
  new StreetLight({
    name: 'Light 3',
    geom: { type: 'Point', coordinates: [ 0, 1 ] }
  }),
  new TrafficSign({
    name: 'Sign 1',
    message: 'STOP',
    geom: { type: 'Point', coordinates: [ 2, 2 ] }
  }),
  new TrafficSign({
    name: 'Sign 2',
    message: 'SLOW',
    geom: { type: 'Point', coordinates: [ 2, 4 ] }
  }),
  new Garden({
    name: 'Green Garden',
    geom: { type: 'Polygon', coordinates: [ [ [ 2, 2 ], [ 2, 3 ], [ 3, 3 ], [ 3, 2 ], [ 2, 2 ] ] ] }
  })
];

Promise.resolve()
  .then(clearData)
  .then(createThings)
  .then(fetchAll)
  .then(fetchArea)
  .catch(function(err) {
    console.warn(err.stack);
  })
  .then(function() {
    return knex.destroy();
  });

function clearData() {
  console.log(chalk.bold('Clearing all data'));
  return knex('things').delete();
}

function createThings() {
  return _.reduce(thingsToCreate, function(memo, thingToCreate) {
    return memo
      .return(chalk.bold('\nCreating ' + thingToCreate.get('name')))
      .then(_.bind(console.log, console))
      .return()
      .then(_.bind(thingToCreate.save, thingToCreate));
  }, Promise.resolve());
}

function fetchAll() {
  console.log(chalk.bold('\nFetching all things'));

  return Thing.fetchAll().then(function(things) {
    return things.load(eagerLoad(things)).then(logCollection);
  });
}

function fetchArea() {
  console.log(chalk.bold('\nFetching things in polygon'));

  return Thing.collection().query(function(qb) {
    qb
      .leftOuterJoin('gardens', 'things.id', 'gardens.id')
      .leftOuterJoin('single_points', 'things.id', 'single_points.id')
      .whereRaw("ST_Intersects(coalesce(single_points.geom, gardens.geom), ST_GeomFromText('POLYGON((1 1,1 2,2 2,2 1,1 1))', 4326))");
  }).fetch().then(function(things) {
    return things.load(eagerLoad(things)).then(logCollection);
  });
}

// Utility functions
// -----------------

function columnAsGeoJson(name) {
  return function(qb) {
    qb.select('*', st.asGeoJSON(name));
  };
}

function logKnexQueries(query) {

  var message = query.sql;

  if (query.bindings) {
    _.each(query.bindings, function(binding) {
      message = message.replace(/\?/, binding);
    });
  }

  if (!message.match(/;$/)) {
    message = message + ';';
  }

  console.log(chalk.cyan(message));
}

function eagerLoad(records) {

  var load = {};

  var types = _.uniq(records.map(function(record) {
    return record.get('type');
  }));

  var hasGardens = _.includes(types, 'gardens'),
      hasStreetLights = _.includes(types, 'street_lights'),
      hasTrafficSigns = _.includes(types, 'traffic_signs');

  if (hasGardens) {
    load.garden = columnAsGeoJson('geom');
  }

  if (hasStreetLights || hasTrafficSigns) {
    load.singlePoint = columnAsGeoJson('geom');

    if (hasStreetLights) {
      load.streetLight = _.noop;
    }

    if (hasTrafficSigns) {
      load.trafficSign = _.noop;
    }
  }

  return load;
}

function logCollection(collection) {
  collection.each(function(record) {
    console.log(chalk.yellow(JSON.stringify(record.toJSON())));
  });
}

// Plugins
// -------

function gisPlugin(bookshelf) {

  var proto = bookshelf.Model.prototype;

  bookshelf.Model = bookshelf.Model.extend({
    format: function(attrs) {

      var base = proto.format.apply(this, arguments);
      if (!base) {
        return base;
      }

      var geoAttrs = this.geoAttributes || [];
      _.each(this.geoAttributes || [], function(attr) {
        if (_.isObject(base[attr])) {
          base[attr] = wellKnown.stringify(base[attr]);
        }
      });

      return base;
    },

    parse: function(attrs) {

      var base = proto.parse.apply(this, arguments);
      if (!base) {
        return base;
      }

      var geoAttrs = this.geoAttributes || [];
      _.each(this.geoAttributes || [], function(attr) {
        if (_.isString(base[attr])) {
          base[attr] = JSON.parse(base[attr]);
        }
      });

      return base;
    }
  });
}

function ctiPlugin(bookshelf) {

  var proto = bookshelf.Model.prototype;

  bookshelf.Model = bookshelf.Model.extend({
    initialize: function(attrs) {

      proto.initialize.apply(this, arguments);
      if (!_.isObject(this.cti)) {
        return;
      }

      var type = this.cti.type || this.tableName,
          typeAttr = this.cti.typeAttribute || 'type',
          isConcrete = this.cti.concrete,
          parentModel = this.cti.parent,
          chilModels = this.cti.children;

      // set virtuals
      var set = _.bind(this.set, this);
      _.each(this.virtuals, function(value, key) {
        if (_.has(attrs, key)) {
          set(key, attrs[key]);
        }
      });

      // set parent type
      if (isConcrete) {
        this.set(typeAttr, type);
      }

      // create parent
      this.on('creating', this._ctiCreateParent, this);
    },

    serialize: function() {

      var base = proto.serialize.apply(this, arguments);
      if (this.cti.children) {
        _.each(this.cti.children, function(model, target) {
          delete base[target];
        });
      }

      return base;
    },

    save: function(key, val, options) {

      var attrs;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === "object") {
        attrs = key || {};
        options = val || {};
      } else {
        (attrs = {})[key] = val;
        options = options || {};
      }

      var save = _.bind(proto.save, this);

      if (options._ctiTransaction || (!this.cti.concrete && this.cti.parent)) {
        return save(attrs, options);
      }

      return new Promise(function(resolve, reject) {
        return bookshelf.transaction(function() {
          var promise = save(attrs, options);
          promise.then(resolve, reject);
          return promise;
        });
      });
    },

    _ctiCreateParent: function() {
      if (!this.cti.parent) {
        return;
      }

      var set = _.bind(this.set, this);
      return this.related(this.cti.parent.target).save({}, {
        _ctiTransaction: true
      }).then(function(parent) {
        set('id', parent.get('id'));
      });
    }
  }, {
    extended: function(child) {

      var proto = child.prototype;

      var cti = proto.cti;
      if (!cti) {
        return;
      }

      var typeAttr = cti.typeAttribute || 'type',
          childModels = cti.children || [];

      _.defaults(proto, {
        virtuals: {}
      });

      _.defaults(cti, {
        delegate: {}
      });

      if (cti.parent) {
        proto[cti.parent.target] = function() {
          return this.belongsTo(cti.parent.model);
        };

        if (!_.has(cti.delegate, typeAttr)) {
          cti.delegate[typeAttr] = cti.parent.target;
        }
      }

      _.each(childModels, function(model, target) {

        var modelOptions = _.isObject(model) ? model : { model: model };
        _.defaults(modelOptions, {
          foreignKey: 'id'
        }),

        proto[target] = function() {
          return this.hasOne(modelOptions.model, modelOptions.foreignKey);
        };
      });

      if (cti.delegate) {

        _.each(cti.delegate, function(targets, attr) {
          if (!_.has(proto.virtuals, attr)) {
            targets = _.isArray(targets) ? targets : [ targets ];

            proto.virtuals[attr] = {
              get: function() {

                var related = _.bind(this.related, this);

                var target = _.find(targets, function(target) {
                  return related(target).get(attr);
                });

                return target ? this.related(target).get(attr) : undefined;
              },

              set: function(value) {
                if (targets.length >= 2) {
                  throw new Error('Set not supported for multiple delegates');
                }

                var related = _.bind(this.related, this);

                var target = targets[0];

                return target ? this.related(target).set(attr, value) : undefined;
              }
            };
          }
        });
      }
    }
  });
}
