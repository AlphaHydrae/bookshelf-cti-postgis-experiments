# Bookshelf, Class Table Inheritance & PostGIS

Why not?

## Requirements

* PostgreSQL 9+
* PostGIS 2+
* A database named `bookshelf-cti-postgis-experiments` with PostGIS extensions loaded

## Usage

```
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
