import sqlite3InitModule from './vendor/sqlite-fts4/sqlite3.mjs'

const sqlite3 = await sqlite3InitModule()
const db = new sqlite3.oo1.DB(':memory:')
console.log('version', sqlite3.version.libVersion)
for (const sql of [
  "CREATE VIRTUAL TABLE a USING fts4(x, tokenize=porter)",
  "CREATE VIRTUAL TABLE b USING fts3(x)",
  "CREATE VIRTUAL TABLE c USING fts5(x)",
  "SELECT unhex('ab'), json_valid('[]')"
]) {
  try {
    db.exec(sql)
    console.log('ok  ', sql)
  } catch (error) {
    console.log('fail', sql, String(error.message ?? error))
  }
}
