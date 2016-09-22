var _ = require('lodash');

exports.up = function(knex, Promise) {

  var tablesToCreate = [
    createThingsTable,
    createGardens,
    createSinglePointsTable,
    createStreetLightsTable,
    createTrafficSignsTable
  ];

  return _.reduce(tablesToCreate, function(memo, createFunc) {
    return memo.return(knex).then(createFunc);
  }, Promise.resolve());
};

exports.down = function(knex, Promise) {

  var tablesToDrop = 'street_lights traffic_signs single_points gardens things';

  return _.reduce(tablesToDrop.split(/\s+/), function(memo, table) {
    return memo.then(_.bind(knex.schema.dropTable, knex.schema, table));
  }, Promise.resolve());
};

function createThingsTable(knex) {
  return knex.schema.createTable('things', function(t) {
    t.bigIncrements('id').primary();
    t.string('name').notNull();
  });
}

function createSinglePointsTable(knex) {
  return knex.schema.createTable('single_points', function(t) {
    t.bigInteger('id').primary().references('id').inTable('things').onDelete('cascade');
    t.specificType('geom', 'geography(POINT,4326)');
  });
}

function createStreetLightsTable(knex) {
  return knex.schema.createTable('street_lights', function(t) {
    t.bigInteger('id').primary().references('id').inTable('single_points').onDelete('cascade');
  });
}

function createTrafficSignsTable(knex) {
  return knex.schema.createTable('traffic_signs', function(t) {
    t.bigInteger('id').primary().references('id').inTable('single_points').onDelete('cascade');
    t.string('message');
  });
}

function createGardens(knex) {
  return knex.schema.createTable('gardens', function(t) {
    t.bigInteger('id').primary().references('id').inTable('things').onDelete('cascade');
    t.specificType('geom', 'geography(POLYGON,4326)');
  });
}
