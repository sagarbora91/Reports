// ---------------------------------------------------------------------------
// CapacitorSqlDriver — the SqlDriver the SqliteBackend uses ON DEVICE. Wraps
// the raw @capacitor-community/sqlite plugin (accessed the same no-bundler way
// shell.js reaches its plugins: window.Capacitor.Plugins.CapacitorSQLite).
//
// Device-only: every method runs behind the SqliteBackend, which only activates
// when the Owner opts in on a device. On web/harness this object is defined but
// never instantiated. Validated by the on-device smoke test (Inc.4) — the Node
// suite exercises the SAME SqliteBackend through the sql.js driver instead.
//
// Implements: open / close / exec / run / query / batch (all async).
// ---------------------------------------------------------------------------
function CapacitorSqlDriver(dbName) {
  this.dbName = dbName || 'saagar_audit';
}
CapacitorSqlDriver.prototype._plugin = function () {
  const SQ = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite;
  if (!SQ) throw new Error('CapacitorSQLite plugin unavailable');
  return SQ;
};
CapacitorSqlDriver.prototype.open = async function () {
  const SQ = this._plugin();
  // Create a no-encryption connection (idempotent — ignore "already exists"),
  // then open it. version 1; readonly false.
  try {
    await SQ.createConnection({ database: this.dbName, encrypted: false, mode: 'no-encryption', version: 1, readonly: false });
  } catch (e) {
    if (!/exist/i.test(String(e && e.message || e))) throw e;   // connection already created — fine
  }
  await SQ.open({ database: this.dbName, readonly: false });
  // WAL journal for crash-safe commits; ignore if the platform rejects it.
  try { await SQ.execute({ database: this.dbName, statements: 'PRAGMA journal_mode=WAL;', transaction: false }); } catch (_) {}
};
CapacitorSqlDriver.prototype.close = async function () {
  const SQ = this._plugin();
  try { await SQ.close({ database: this.dbName, readonly: false }); } catch (_) {}
  try { await SQ.closeConnection({ database: this.dbName, readonly: false }); } catch (_) {}
};
CapacitorSqlDriver.prototype.exec = async function (sql) {
  // Multi-statement DDL/pragma. transaction:false so PRAGMA isn't wrapped.
  await this._plugin().execute({ database: this.dbName, statements: sql, transaction: false });
};
CapacitorSqlDriver.prototype.run = async function (sql, params) {
  const r = await this._plugin().run({ database: this.dbName, statement: sql, values: params || [], transaction: false });
  return { changes: (r && r.changes && r.changes.changes) || 0 };
};
CapacitorSqlDriver.prototype.query = async function (sql, params) {
  const r = await this._plugin().query({ database: this.dbName, statement: sql, values: params || [] });
  return (r && r.values) || [];
};
CapacitorSqlDriver.prototype.batch = async function (stmts) {
  // executeSet runs the whole set atomically (one transaction) — exactly the
  // BEGIN…COMMIT semantics _flushOne relies on. A failure rolls the set back.
  const set = stmts.map(function (s) { return { statement: s.sql, values: s.params || [] }; });
  await this._plugin().executeSet({ database: this.dbName, set: set, transaction: true });
};

if (typeof window !== 'undefined') window.CapacitorSqlDriver = CapacitorSqlDriver;
