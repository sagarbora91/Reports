/* repo.js — Saagar Greetor data-access layer (SQLite Phase 2).
 *
 * THE single DB access point for the data layers (reports.js, customers.js, …).
 * Data layers NEVER touch window.GreetorDB directly — they go through window.Repo
 * so they can run unchanged in Node by injecting a test adapter via Repo.setDb().
 *
 * Two responsibilities, nothing more:
 *   1. An INJECTABLE db handle. Defaults to window.GreetorDB; Repo.setDb(handle)
 *      overrides it (Node tests inject a node:sqlite adapter). Every query/run/
 *      exec/transaction call is routed through whatever handle is currently set,
 *      resolved LAZILY at call time (so setDb() after load still takes effect,
 *      and the default works even if GreetorDB loaded after this file).
 *   2. Per-entity async CRUD that returns DOMAIN objects via the db-schema
 *      mappers (window.DBSchema). The mappers are the single source of truth for
 *      the NULL/""/0 encoding rules; repo only calls them — it never re-encodes.
 *
 * Plain <script> module: sets window.Repo AND module.exports (Node). Never throws
 * synchronously at load (a missing GreetorDB/DBSchema only surfaces when an async
 * method is actually awaited).
 *
 * Contract mirrored EXACTLY (see GreetorDB in db.js):
 *   db.query(sql, params)        -> Promise<rows[]>        (plain-object rows)
 *   db.run(sql, params)          -> Promise<{changes, lastId}>
 *   db.exec(sql)                 -> Promise<void>
 *   db.transaction(async fn)     -> Promise<T>             (BEGIN/COMMIT/ROLLBACK)
 *   db.bulkInsert(table, rows)   -> Promise<{changes}>     (pass-through; Phase 4)
 */
(function (root) {
  "use strict";

  // ── injectable db handle ──────────────────────────────────────────────────
  // null means "use the default" (window.GreetorDB), resolved lazily at call
  // time so neither load order nor a post-load setDb() can break routing.
  var _db = null;

  function setDb(handle) {
    // Pass null/undefined to fall back to the default (window.GreetorDB).
    _db = handle != null ? handle : null;
  }

  function db() {
    var h = _db != null ? _db : root.GreetorDB;
    if (!h) {
      throw new Error(
        "Repo: no DB handle — window.GreetorDB is unavailable and Repo.setDb() " +
        "was not called. Load db.js (+ db-schema.js) first, or inject a test adapter."
      );
    }
    return h;
  }

  function schema() {
    var s = root.DBSchema;
    if (!s) {
      throw new Error("Repo: window.DBSchema unavailable — load db-schema.js before repo.js.");
    }
    return s;
  }

  // ── raw pass-throughs (the ONLY place the data layers reach SQL) ───────────
  // async wrappers so a synchronous throw from db()/handle resolution becomes a
  // rejected promise (never a sync throw at the call site).
  async function query(sql, params) { return db().query(sql, params || []); }
  async function run(sql, params)   { return db().run(sql, params || []); }
  async function exec(sql)          { return db().exec(sql); }
  async function transaction(fn)    { return db().transaction(fn); }

  // ── records ───────────────────────────────────────────────────────────────
  // Record PK is recordId (TEXT, app-generated) and rows carry an `ord` integer
  // that reproduces the original array order. ORDER BY ord everywhere a stable
  // app-order is expected; the data layers re-sort in JS where byte-identity
  // needs an exact comparator, so this layer just hands back ord-ordered rows.

  async function recordsAll() {
    var S = schema();
    var rows = await query("SELECT * FROM records ORDER BY ord", []);
    return rows.map(S.rowToRecord);
  }

  async function recordsById(recordId) {
    var S = schema();
    var rows = await query("SELECT * FROM records WHERE recordId=?", [recordId]);
    return rows.length ? S.rowToRecord(rows[0]) : null;
  }

  async function recordsByMobile(mobile) {
    var S = schema();
    var rows = await query("SELECT * FROM records WHERE mobile=? ORDER BY ord", [mobile]);
    return rows.map(S.rowToRecord);
  }

  // Next ord value (append at the end of current app-order). COALESCE handles an
  // empty table (-> 0). Kept as a helper so insert/upsert agree on placement.
  async function nextOrd() {
    var rows = await query("SELECT COALESCE(MAX(ord), -1) AS m FROM records", []);
    var m = (rows && rows[0] && rows[0].m != null) ? Number(rows[0].m) : -1;
    return m + 1;
  }

  function recCols(S) {
    // Explicit, mapper-defined column order. Prefer REC_COLS; fall back to the
    // keys a freshly-mapped row produces (recordToRow emits all 34 columns).
    return (S.REC_COLS && S.REC_COLS.length)
      ? S.REC_COLS
      : Object.keys(S.recordToRow({}, 0));
  }

  function insertSql(table, cols) {
    var ph = cols.map(function () { return "?"; }).join(",");
    return "INSERT INTO " + table + " (" + cols.join(",") + ") VALUES (" + ph + ")";
  }
  function replaceSql(table, cols) {
    var ph = cols.map(function () { return "?"; }).join(",");
    return "INSERT OR REPLACE INTO " + table + " (" + cols.join(",") + ") VALUES (" + ph + ")";
  }
  function valuesFor(row, cols) {
    return cols.map(function (c) { var v = row[c]; return v === undefined ? null : v; });
  }

  async function recordsInsert(recordObj) {
    var S = schema();
    var ord = await nextOrd();
    var row = S.recordToRow(recordObj, ord);
    var cols = recCols(S);
    var res = await run(insertSql("records", cols), valuesFor(row, cols));
    // records PK is the TEXT recordId, so SQLite's lastId (rowid) is not the id
    // callers want; the durable id is the recordId on the mapped row. Fall back
    // to last_insert_rowid only if a row somehow lacks a recordId.
    var id = (row.recordId != null && row.recordId !== "")
      ? row.recordId
      : (res && res.lastId) || null;
    return { id: id, record: S.rowToRecord(row) };
  }

  async function recordsUpdate(recordId, changes) {
    var S = schema();
    var existing = await recordsById(recordId);
    if (!existing) return;                       // no-op on unknown id (callers expect this)
    // Preserve the row's existing ord so an UPDATE never reshuffles app-order.
    var ordRows = await query("SELECT ord FROM records WHERE recordId=?", [recordId]);
    var ord = (ordRows && ordRows[0] && ordRows[0].ord != null) ? ordRows[0].ord : null;
    var merged = {};
    var k;
    for (k in existing) if (Object.prototype.hasOwnProperty.call(existing, k)) merged[k] = existing[k];
    if (changes) for (k in changes) if (Object.prototype.hasOwnProperty.call(changes, k)) merged[k] = changes[k];
    var row = S.recordToRow(merged, ord);
    var cols = recCols(S).filter(function (c) { return c !== "recordId"; });
    var setClause = cols.map(function (c) { return c + "=?"; }).join(",");
    var vals = valuesFor(row, cols);
    vals.push(recordId);
    await run("UPDATE records SET " + setClause + " WHERE recordId=?", vals);
  }

  async function recordsDelete(recordId) {
    await run("DELETE FROM records WHERE recordId=?", [recordId]);
  }

  async function recordsUpsert(recordObj) {
    var S = schema();
    // Keep an existing row's ord; otherwise append at the end.
    var ord = null;
    if (recordObj && recordObj.recordId != null) {
      var ordRows = await query("SELECT ord FROM records WHERE recordId=?", [recordObj.recordId]);
      if (ordRows && ordRows[0] && ordRows[0].ord != null) ord = ordRows[0].ord;
    }
    if (ord == null) ord = await nextOrd();
    var row = S.recordToRow(recordObj, ord);
    var cols = recCols(S);
    await run(replaceSql("records", cols), valuesFor(row, cols));
    return S.rowToRecord(row);
  }

  // ── users ─────────────────────────────────────────────────────────────────
  async function usersAll() {
    var S = schema();
    var rows = await query("SELECT * FROM users ORDER BY ord", []);
    return rows.map(S.rowToUser);
  }

  // ── meta (KV) ──────────────────────────────────────────────────────────────
  // Returns the RAW stored string (callers that store JSON parse it themselves,
  // e.g. Customers.pipelineStages reads meta('masters') and JSON.parses it).
  async function metaGet(key) {
    var rows = await query("SELECT value FROM meta WHERE key=?", [key]);
    return (rows.length && rows[0].value != null) ? rows[0].value : null;
  }

  async function metaSet(key, value) {
    await run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
  }

  // ── footfall (composite PK store,date) ─────────────────────────────────────
  async function footfallGet(store, date) {
    var S = schema();
    var rows = await query("SELECT * FROM footfall WHERE store=? AND date=?", [store, date]);
    return rows.length ? S.rowToFootfall(rows[0]) : null;
  }

  async function footfallSet(store, date, count, byUserId, byName) {
    // `at` stamped now (ISO-8601), matching the app convention used by
    // footfallToRow / footfall.js. count coerced to a number (0 if not numeric).
    var at = new Date().toISOString();
    var cnt = (typeof count === "number") ? count : (Number(count) || 0);
    await run(
      "INSERT OR REPLACE INTO footfall (store, date, count, byUserId, byName, at) VALUES (?, ?, ?, ?, ?, ?)",
      [store, date, cnt, (byUserId != null ? byUserId : null), (byName != null ? byName : null), at]
    );
  }

  // ── public API (window.Repo, dual-export) ──────────────────────────────────
  var api = {
    // injection + raw pass-throughs
    setDb: setDb,
    query: query,
    run: run,
    exec: exec,
    transaction: transaction,

    // per-entity async CRUD returning domain objects via DBSchema mappers
    records: {
      all: recordsAll,
      byId: recordsById,
      byMobile: recordsByMobile,
      insert: recordsInsert,
      update: recordsUpdate,
      "delete": recordsDelete,
      upsert: recordsUpsert
    },
    users: {
      all: usersAll
    },
    meta: {
      get: metaGet,
      set: metaSet
    },
    footfall: {
      get: footfallGet,
      set: footfallSet
    }
  };

  root.Repo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
