# Bookshelf, Class Table Inheritance & PostGIS

Why not?

## Requirements

* PostgreSQL 9+
* PostGIS 2+
* A database named `bookshelf-cti-postgis-experiments`
  (or you can set the `$DATABASE_URL` environment variable)
  with PostGIS extensions loaded

## Usage

```
npm install -g knex
npm install
knex migrate:latest
npm start
```

## Domain model

```
                    +----->Thing<------+
                    |                  |
                    |                  |
                    +                  +
       +----->SinglePoint            Garden
       |             ^
       |             |
       +             +
StreetLight       TrafficSign
```
