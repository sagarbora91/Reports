/* repo.js — Saagar Greetor data-access layer (SQLite Phase 2 + 2b).
 *
 * THE single DB access point for the data layers (reports.js, customers.js,
 * comms.js, targets.js, footfall.js, masters.js, dpdp.js, …). Data layers NEVER
 * touch window.GreetorDB directly — they go through window.Repo so they can run
 * unchanged in Node by injecting a test adapter via Repo.setDb().
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

  // ── shared INSERT/REPLACE helpers ───────────────────────────────────────────
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

  // Next ord value for any table that carries an `ord` integer (append at the end
  // of current app-order). COALESCE handles an empty table (-> 0).
  async function nextOrdFor(table) {
    var rows = await query("SELECT COALESCE(MAX(ord), -1) AS m FROM " + table, []);
    var m = (rows && rows[0] && rows[0].m != null) ? Number(rows[0].m) : -1;
    return m + 1;
  }

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

  // Next ord value (append at the end of current app-order). Kept as a named
  // helper so insert/upsert agree on placement (delegates to nextOrdFor).
  async function nextOrd() {
    return nextOrdFor("records");
  }

  function recCols(S) {
    // Explicit, mapper-defined column order. Prefer REC_COLS; fall back to the
    // keys a freshly-mapped row produces (recordToRow emits all 34 columns).
    return (S.REC_COLS && S.REC_COLS.length)
      ? S.REC_COLS
      : Object.keys(S.recordToRow({}, 0));
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

  // DISTINCT non-empty reasons, ascending (used by aggregate helpers that need
  // the set of reasons seen in records). Mirrors a SQL DISTINCT + ORDER BY; the
  // data layers that need a specific JS tie-break fetch rows instead.
  async function recordsReasonsDistinct() {
    var rows = await query(
      "SELECT DISTINCT reason FROM records WHERE reason IS NOT NULL AND reason != '' ORDER BY reason",
      []
    );
    return rows.map(function (r) { return r.reason; });
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

  // ── meta-backed config singletons (targets / masters) ──────────────────────
  // These live in the meta KV table as JSON strings (key 'targets' / 'masters'),
  // exactly as DBSchema.disassemble writes them. The accessors parse on read and
  // stringify on write so the data layers deal in plain objects. A missing key,
  // a JSON 'null', or unparseable value all resolve to null (the data layer's
  // ensureSeeded then writes the default), matching the old `state.targets ==
  // null` / `!state.masters.version` checks.
  function parseMeta(raw) {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  async function targetsGet() {
    return parseMeta(await metaGet("targets"));
  }
  async function targetsSet(obj) {
    await metaSet("targets", JSON.stringify(obj != null ? obj : null));
  }
  async function mastersGet() {
    return parseMeta(await metaGet("masters"));
  }
  async function mastersSet(obj) {
    await metaSet("masters", JSON.stringify(obj != null ? obj : null));
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

  // SUM(count) over an inclusive [startDate, endDate] window, optionally scoped
  // to one store. COALESCE -> 0 for an empty range (SUM of no rows is NULL). The
  // store filter is OMITTED entirely when no store is given (rather than relying
  // on a `? IS NULL` guard) so binding stays unambiguous and the result is a
  // plain integer — byte-identical to footfall.js's loop over entries.
  async function footfallTotalForRange(startDate, endDate, store) {
    var rows;
    if (store) {
      rows = await query(
        "SELECT COALESCE(SUM(count), 0) AS t FROM footfall WHERE date >= ? AND date <= ? AND store = ?",
        [startDate, endDate, store]
      );
    } else {
      rows = await query(
        "SELECT COALESCE(SUM(count), 0) AS t FROM footfall WHERE date >= ? AND date <= ?",
        [startDate, endDate]
      );
    }
    var t = (rows && rows[0] && rows[0].t != null) ? Number(rows[0].t) : 0;
    return t;
  }

  // ── comms_log (PK id, ord = original app-order) ─────────────────────────────
  // The mapper (DBSchema.rowToCommsLog) maps the `ts` column back to entry.
  // timestamp and omits NULL columns, so the domain objects this hands back match
  // the old in-memory commsLog entries exactly. ORDER BY ord everywhere a stable
  // order is expected (the data layer re-filters in JS but never re-sorts).
  async function commsLogAll() {
    var S = schema();
    var rows = await query("SELECT * FROM comms_log ORDER BY ord", []);
    return rows.map(S.rowToCommsLog);
  }

  async function commsLogByRecordId(recordId) {
    var S = schema();
    var rows = await query("SELECT * FROM comms_log WHERE recordId=? ORDER BY ord", [recordId]);
    return rows.map(S.rowToCommsLog);
  }

  var CLOG_COLS = ["id", "at", "byUserId", "byName", "channel", "recordId", "mobile", "customerName", "templateId", "templateName", "text", "ts", "ord"];

  async function commsLogInsert(entry) {
    var S = schema();
    var ord = await nextOrdFor("comms_log");
    var row = S.commsLogToRow(entry || {}, ord);
    await run(insertSql("comms_log", CLOG_COLS), valuesFor(row, CLOG_COLS));
    var id = (row.id != null && row.id !== "") ? row.id : null;
    return { id: id, entry: S.rowToCommsLog(row) };
  }

  async function commsLogDelete(id) {
    await run("DELETE FROM comms_log WHERE id=?", [id]);
  }

  // ── comms_templates (PK id, ord = original app-order) ───────────────────────
  // store/reason default to "" (NOT NULL) in the mapper — the data layer's scope
  // matching relies on that empty-string encoding, so we never re-encode here.
  async function commsTemplatesAll() {
    var S = schema();
    var rows = await query("SELECT * FROM comms_templates ORDER BY ord", []);
    return rows.map(S.rowToTmpl);
  }

  async function commsTemplatesById(id) {
    var S = schema();
    var rows = await query("SELECT * FROM comms_templates WHERE id=?", [id]);
    return rows.length ? S.rowToTmpl(rows[0]) : null;
  }

  var TMPL_COLS = ["id", "name", "scope", "store", "reason", "text", "active", "ord"];

  async function commsTemplatesInsert(template) {
    var S = schema();
    var ord = await nextOrdFor("comms_templates");
    var row = S.tmplToRow(template || {}, ord);
    await run(insertSql("comms_templates", TMPL_COLS), valuesFor(row, TMPL_COLS));
    var id = (row.id != null && row.id !== "") ? row.id : null;
    return { id: id, template: S.rowToTmpl(row) };
  }

  // Partial update: only the columns present in `changes` are written, encoded
  // through tmplToRow's rules (store/reason -> "" if null; active -> 1/0). id and
  // ord are never touched. Mirrors the old updateTemplate's field-by-field set.
  async function commsTemplatesUpdate(id, changes) {
    var S = schema();
    if (!changes) return;
    var encoded = S.tmplToRow(changes, 0);   // full encode; we cherry-pick keys
    var cols = [];
    ["name", "scope", "store", "reason", "text", "active"].forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(changes, c)) cols.push(c);
    });
    if (!cols.length) return;
    var setClause = cols.map(function (c) { return c + "=?"; }).join(",");
    var vals = cols.map(function (c) { var v = encoded[c]; return v === undefined ? null : v; });
    vals.push(id);
    await run("UPDATE comms_templates SET " + setClause + " WHERE id=?", vals);
  }

  async function commsTemplatesDelete(id) {
    await run("DELETE FROM comms_templates WHERE id=?", [id]);
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
      upsert: recordsUpsert,
      reasonsDistinct: recordsReasonsDistinct
    },
    users: {
      all: usersAll
    },
    meta: {
      get: metaGet,
      set: metaSet
    },
    // meta-backed config singletons (parsed/stringified JSON)
    targets: {
      get: targetsGet,
      set: targetsSet
    },
    masters: {
      get: mastersGet,
      set: mastersSet
    },
    footfall: {
      get: footfallGet,
      set: footfallSet,
      totalForRange: footfallTotalForRange
    },
    commsLog: {
      all: commsLogAll,
      byRecordId: commsLogByRecordId,
      insert: commsLogInsert,
      "delete": commsLogDelete
    },
    commsTemplates: {
      all: commsTemplatesAll,
      byId: commsTemplatesById,
      insert: commsTemplatesInsert,
      update: commsTemplatesUpdate,
      "delete": commsTemplatesDelete
    }
  };

  root.Repo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
