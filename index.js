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

  serialize: function() {

    var id = this.get('id'),
        base = bookshelf.Model.prototype.serialize.apply(this, arguments);

    _.each([ 'singlePoint', 'streetLight', 'trafficSign', 'garden' ], function(attr) {
      if (_.isObject(base[attr]) && base[attr].id != id) {
        delete base[attr];
      } else if (_.isObject(base[attr]) && base[attr].id == id) {
        base.type = attr;
      }
    });

    return base;
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
  .catch(function(err) {
    console.warn(err.stack);
  })
  .then(knex.destroy);

function wipe() {
  return knex('things').delete();
}

function createGarden(name, polygon) {
  return Promise.resolve()
    .then(_.partial(_createThing, name))
    .then(_.partial(_createGarden, _, polygon));
}

function createStreetLight(name, lng, lat) {
  return Promise.resolve()
    .then(_.partial(_createThing, name))
    .then(_.partial(_createSinglePoint, _, lng, lat))
    .then(_createStreetLight);
}

function createTrafficSign(name, message, lng, lat) {
  return Promise.resolve()
    .then(_.partial(_createThing, name))
    .then(_.partial(_createSinglePoint, _, lng, lat))
    .then(_.partial(_createTrafficSign, _, message));
}

function fetchAll() {
  return Thing.fetchAll().then(function(things) {

    function columnAsGeoJson(name) {
      return function(qb) {
        qb.select('*', st.asGeoJSON(name));
      };
    }

    var eagerLoad = {
      singlePoint: columnAsGeoJson('geom'),
      streetLight: _.noop,
      trafficSign: _.noop,
      garden: columnAsGeoJson('geom')
    };

    return things.load(eagerLoad).then(function(result) {
      result.each(function(record) {
        console.log(JSON.stringify(record.serialize()));
      });
    });
  });
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

function _createThing(name) {
  return new Thing({ name: name }).save();
}
