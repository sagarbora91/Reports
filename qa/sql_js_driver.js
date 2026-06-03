// sql.js (wasm SQLite) driver implementing the async SqlDriver interface, for
// NODE TESTS ONLY. Never bundled into the app (not in scripts/inline.py).
// Lets qa/sqlite_tests.js exercise the real SqliteBackend SQL against a real
// SQLite engine before it ever runs on a device.
//
// sql.js is synchronous; we wrap every call in a resolved Promise so the
// driver contract (all async) matches the device Capacitor driver exactly.
const initSqlJs = require('sql.js');

// makeSqlJsDriver(bytes?) — fresh in-memory DB, or reopen from exported bytes
// (used to simulate an app "reload" across the real on-disk byte format).
async function makeSqlJsDriver(bytes) {
  const SQL = await initSqlJs();
  let db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  return {
    _raw: () => db,
    export() { return db.export(); },           // Uint8Array of the DB — the "disk" image
    async open() { /* already open */ },
    async close() { db.close(); },
    async exec(sql) { db.exec(sql); },           // multi-statement DDL/pragma
    async run(sql, params) { db.run(sql, params || []); return { changes: db.getRowsModified() }; },
    async query(sql, params) {
      const stmt = db.prepare(sql);
      if (params && params.length) stmt.bind(params);
      const out = [];
      while (stmt.step()) out.push(stmt.getAsObject());
      stmt.free();
      return out;
    },
    async batch(stmts) {
      db.run('BEGIN');
      try {
        for (const s of stmts) db.run(s.sql, s.params || []);
      } catch (e) {
        try { db.run('ROLLBACK'); } catch (_) {}
        throw e;
      }
      db.run('COMMIT');
    },
  };
}

module.exports = { makeSqlJsDriver };
