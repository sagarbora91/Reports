/* sqlite-node-adapter.cjs — a Node test adapter that makes the built-in
 * node:sqlite `DatabaseSync` engine speak the EXACT same async contract as
 * window.GreetorDB (greetor/www/db.js). It exists so the data layers — which
 * are rewritten to talk ONLY to window.Repo, and Repo talks ONLY to its
 * injected DB handle — can run unchanged under Node by doing:
 *
 *     const { DatabaseSync } = require("node:sqlite");
 *     const makeAdapter = require("./sqlite-node-adapter.cjs");
 *     const db = new DatabaseSync(":memory:");
 *     DBSchema.SCHEMA.forEach(function (ddl) { db.exec(ddl); });
 *     Repo.setDb(makeAdapter(db));          // <- inject; now Repo.query/run/... hit real SQLite
 *
 * Mirrors the node:sqlite pattern already used by qa-sqlite-roundtrip.cjs /
 * qa-db-schema.cjs (require("node:sqlite").DatabaseSync). node:sqlite is
 * experimental on Node 20/22 and stable on Node 24+; callers run with
 * --experimental-sqlite where needed (it is a harmless no-op on Node 24+).
 *
 * CONTRACT (must match GreetorDB exactly — see spec.adapterContract / db.js):
 *   adapter.query(sql, params)  -> Promise<rows[]>   (array of PLAIN objects,
 *                                  column name -> string|number|null)
 *   adapter.run(sql, params)    -> Promise<{changes:number, lastId:number}>
 *                                  changes = rows affected;
 *                                  lastId  = SELECT last_insert_rowid()
 *                                            (0 on a composite-PK / no-insert op
 *                                            is the GreetorDB convention — see note)
 *   adapter.exec(sql)           -> Promise<void>     (multi-statement DDL, no params)
 *   adapter.transaction(fn)     -> Promise<T>        (BEGIN; try{ COMMIT } catch{ ROLLBACK; rethrow })
 *                                  fn receives the adapter itself, so callers can
 *                                  `await api.run(...)` / `await api.query(...)`
 *                                  inside, exactly like GreetorDB.transaction.
 *
 * Dual-export: module.exports for Node (the primary use), and window.makeAdapter
 * / window.TestAdapterFactory if ever loaded via <script> in a non-bundler page.
 */
"use strict";

(function (root) {
  "use strict";

  // Normalise node:sqlite return values to GreetorDB's plain-number contract.
  // Older Node returns `changes`/`lastInsertRowid` as BigInt; GreetorDB always
  // hands callers plain JS numbers, and BigInt would serialise differently
  // (canonical JSON / byte-identity), so coerce every numeric here.
  function num(v) {
    if (typeof v === "bigint") return Number(v);
    return (v == null) ? 0 : Number(v);
  }

  // Bind params positionally. node:sqlite's prepared-statement methods take
  // variadic positional args (stmt.all(...params) / stmt.run(...params)); an
  // empty/absent params array means "no bindings". We pass undefined-as-null so
  // an explicit JS undefined never throws a binding error (matches db.js, which
  // maps undefined -> null on the write path).
  function bindArgs(params) {
    if (!params || !params.length) return [];
    return params.map(function (v) { return v === undefined ? null : v; });
  }

  /**
   * makeAdapter(databaseSyncInstance) -> { query, run, exec, transaction }
   * @param {import("node:sqlite").DatabaseSync} db an OPEN DatabaseSync instance
   *        with the schema already applied (DBSchema.SCHEMA via db.exec).
   */
  function makeAdapter(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
      throw new Error("makeAdapter: expected an open node:sqlite DatabaseSync instance.");
    }

    var adapter = {
      // SELECT — returns an array of plain row objects, identical to GreetorDB.
      // node:sqlite's stmt.all() already yields plain objects keyed by column
      // name with string|number|null values, so no row-shape massaging needed.
      query: function query(sql, params) {
        try {
          var stmt = db.prepare(sql);
          var args = bindArgs(params);
          var rows = args.length ? stmt.all.apply(stmt, args) : stmt.all();
          return Promise.resolve(rows);
        } catch (e) {
          return Promise.reject(e);
        }
      },

      // INSERT / UPDATE / DELETE — returns {changes, lastId}. lastId comes from
      // SELECT last_insert_rowid() per spec.adapterContract (NOT stmt.lastInsertRowid)
      // so behaviour matches db.js's webRun()/nativeRun() exactly. For a
      // composite-PK insert (footfall: store,date) SQLite still assigns an
      // implicit rowid, so last_insert_rowid() is non-zero there too — which is
      // fine: data layers in this phase never read footfall's lastId.
      run: function run(sql, params) {
        try {
          var stmt = db.prepare(sql);
          var args = bindArgs(params);
          var res = args.length ? stmt.run.apply(stmt, args) : stmt.run();
          var last = db.prepare("SELECT last_insert_rowid() AS id").get();
          return Promise.resolve({
            changes: num(res && res.changes),
            lastId: num(last && last.id)
          });
        } catch (e) {
          return Promise.reject(e);
        }
      },

      // Multi-statement DDL / migrations — no params, no result. db.exec runs the
      // whole script (semicolon-separated), mirroring GreetorDB.exec / nativeExec.
      exec: function exec(sql) {
        try {
          db.exec(sql);
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      },

      // BEGIN/COMMIT/ROLLBACK around an async fn. fn receives `adapter` so nested
      // query/run inside the txn use the same handle (identical to db.js, where
      // fn receives the api). On ANY throw inside fn we ROLLBACK and re-throw the
      // ORIGINAL error; a rollback that itself fails is swallowed so the caller
      // still sees the root cause (same deliberate choice as db.js.transaction).
      transaction: function transaction(fn) {
        return Promise.resolve().then(function () {
          db.prepare("BEGIN").run();
          return Promise.resolve()
            .then(function () { return fn(adapter); })
            .then(function (out) {
              db.prepare("COMMIT").run();
              return out;
            })
            .catch(function (e) {
              try { db.prepare("ROLLBACK").run(); } catch (_) { /* unrecoverable txn; surface original */ }
              throw e;
            });
        });
      }
    };

    return adapter;
  }

  root.makeAdapter = makeAdapter;
  root.TestAdapterFactory = makeAdapter;
  if (typeof module !== "undefined" && module.exports) module.exports = makeAdapter;
})(typeof window !== "undefined" ? window : globalThis);
