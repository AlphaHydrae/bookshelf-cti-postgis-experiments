var _ = require('lodash'),
    Promise = require('bluebird');

var knex = require('knex')({
  client: 'postgresql',
  connection: 'postgres://localhost/bookshelf-cti-postgis-experiments'
});

var st = require('knex-postgis')(knex);

var bookshelf = require('bookshelf')(knex);
bookshelf.plugin('registry');
bookshelf.plugin('virtuals');

var Thing = bookshelf.model('Thing', {
  tableName: 'things',

  virtuals: {
    type: function() {
      return this.get('thing_table');
    },

    geom: function() {
      return this.related('garden').get('geom') || this.related('singlePoint').get('geom');
    },

    message: function() {
      return this.related('trafficSign').get('message');
    }
  },

  serialize: function() {
    return _.omit(bookshelf.Model.prototype.serialize.apply(this, arguments), 'thing_table', 'singlePoint', 'streetLight', 'trafficSign', 'garden');
  },

  singlePoint: function() {
    return this.hasOne('SinglePoint', 'id');
  },

  streetLight: function() {
    return this.hasOne('StreetLight', 'id').through('SinglePoint', 'id', 'id')
  },

  trafficSign: function() {
    return this.hasOne('TrafficSign', 'id').through('SinglePoint', 'id', 'id')
  },

  garden: function() {
    return this.hasOne('Garden', 'id');
  }
});

var SinglePoint = bookshelf.model('SinglePoint', {
  tableName: 'single_points',

  parse: function(attrs) {

    var base = bookshelf.Model.prototype.parse.apply(this, arguments);
    if (base && _.isString(base.geom)) {
      base.geom = JSON.parse(base.geom);
    }

    return base;
  },

  serialize: function() {

    var base = bookshelf.Model.prototype.serialize.apply(this, arguments);
    if (_.isString(base.geom)) {
      base.geom = JSON.parse(base.geom);
    }

    return base;
  },

  thing: function() {
    return this.belongsTo('Thing');
  }
});

var StreetLight = bookshelf.model('StreetLight', {
  tableName: 'street_lights',

  singlePoint: function() {
    return this.belongsTo('SinglePoint');
  }
});

var TrafficSign = bookshelf.model('TrafficSign', {
  tableName: 'traffic_signs',

  singlePoint: function() {
    return this.belongsTo('SinglePoint');
  }
});

var Garden = bookshelf.model('Garden', {
  tableName: 'gardens',

  parse: function(attrs) {

    var base = bookshelf.Model.prototype.parse.apply(this, arguments);
    if (base && _.isString(base.geom)) {
      base.geom = JSON.parse(base.geom);
    }

    return base;
  },

  serialize: function() {

    var base = bookshelf.Model.prototype.serialize.apply(this, arguments);
    if (_.isString(base.geom)) {
      base.geom = JSON.parse(base.geom);
    }

    return base;
  },

  thing: function() {
    return this.belongsTo('Thing');
  }
});

knex.on('query', function(query) {
  console.log(query.sql + ' with bindings ' + JSON.stringify(query.bindings));
  console.log();
});

Promise.resolve()
  .then(wipe)
  .then(_.partial(createStreetLight, 'Light 1', 0, 0))
  .then(_.partial(createStreetLight, 'Light 2', 1, 0))
  .then(_.partial(createStreetLight, 'Light 3', 0, 1))
  .then(_.partial(createTrafficSign, 'Sign 1', 'STOP', 2, 2))
  .then(_.partial(createTrafficSign, 'Sign 2', 'BOOM', 2, 4))
  .then(_.partial(createGarden, 'Green', [ '2 2', '2 3', '3 3', '3 2', '2 2' ]))
  .then(fetchAll)
  .then(fetchArea)
  .catch(function(err) {
    console.warn(err.stack);
  })
  .then(function() {
    return knex.destroy();
  });

function wipe() {
  return knex('things').delete();
}

function columnAsGeoJson(name) {
  return function(qb) {
    qb.select('*', st.asGeoJSON(name));
  };
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

function fetchAll() {
  return Thing.fetchAll().then(function(things) {

    return things.load(eagerLoad(things)).then(function(result) {
      result.each(function(record) {
        console.log(JSON.stringify(record.toJSON()));
      });
      console.log();
    });
  });
}

function fetchArea() {

  return Thing.collection().query(function(qb) {
    qb
      .leftOuterJoin('gardens', 'things.id', 'gardens.id')
      .leftOuterJoin('single_points', 'things.id', 'single_points.id')
      .whereRaw("ST_Intersects(coalesce(single_points.geom, gardens.geom), ST_GeomFromText('POLYGON((1 1,1 2,2 2,2 1,1 1))', 4326))");
  }).fetch().then(function(things) {
    return things.load(eagerLoad(things)).then(function() {
      return things.each(function(thing) {
        console.log(JSON.stringify(thing.toJSON()));
      });
    });
  });
}

function createGarden(name, polygon) {
  return Promise.resolve()
    .then(_.partial(_createThing, 'gardens', name))
    .then(_.partial(_createGarden, _, polygon));
}

function createStreetLight(name, lng, lat) {
  return Promise.resolve()
    .then(_.partial(_createThing, 'street_lights', name))
    .then(_.partial(_createSinglePoint, _, lng, lat))
    .then(_createStreetLight);
}

function createTrafficSign(name, message, lng, lat) {
  return Promise.resolve()
    .then(_.partial(_createThing, 'traffic_signs', name))
    .then(_.partial(_createSinglePoint, _, lng, lat))
    .then(_.partial(_createTrafficSign, _, message));
}

function _createGarden(thing, polygon) {
  return new Garden({
    id: thing.attributes.id,
    geom: st.geomFromText('POLYGON((' + polygon.join(', ') + '))', 4326)
  }).save({}, { method: 'insert' });
}

function _createStreetLight(singlePoint) {
  return new StreetLight({
    id: singlePoint.attributes.id
  }).save({}, { method: 'insert' });
}

function _createTrafficSign(singlePoint, message) {
  return new TrafficSign({
    id: singlePoint.attributes.id,
    message: message
  }).save({}, { method: 'insert' });
}

function _createSinglePoint(thing, lng, lat) {
  return new SinglePoint({
    id: thing.attributes.id,
    geom: st.geomFromText('POINT(' + lng + ' ' + lat + ')', 4326)
  }).save({}, { method: 'insert' });
}

function _createThing(type, name) {
  return new Thing({ thing_table: type, name: name }).save();
}
