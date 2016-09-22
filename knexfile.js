module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || 'postgres://localhost/bookshelf-cti-postgis-experiments'
  }
};
