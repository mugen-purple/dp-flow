const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('./migrations');

function createDatabase(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const databasePath = path.join(userDataPath, 'dp-flow.sqlite3');
  const database = new DatabaseSync(databasePath);

  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  runMigrations(database);

  return { database, databasePath };
}

module.exports = { createDatabase };
