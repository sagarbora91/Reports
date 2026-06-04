/* qa-migration.cjs — the SAFETY-PROOF GATE for the Phase 4 one-time migration.
 *
 * Proves window.Migrate.run (greetor/www/migrate.js) is safe to point at a real
 * existing install: it moves the legacy whole-blob Store state into SQLite ONCE,
 * WITH PROOF, and can never silently corrupt or half-migrate the data. Concretely
 * this harness asserts, over a REAL node:sqlite database (via the same
 * sqlite-node-adapter the data-layer gate uses):
 *
 *   HAPPY PATH
 *     1. Migrate.run(source, {db}) returns { ok:true, counts, backup, hashes }.
 *     2. The returned backup is a valid saagar_greetor_v2 JSON envelope whose
 *        array counts match the source (the verified-backup gate's contract).
 *     3. result.counts per table === DBSchema.disassemble(source) counts.
 *     4. Reading EVERY table back and running DBSchema.assemble yields a state
 *        that is canon BYTE-IDENTICAL to the source (no row lost/added/mutated).
 *        (DEMO_SEED is proven to round-trip through assemble∘disassemble by
 *        qa-sqlite-roundtrip.cjs, so equality against the raw source is exact.)
 *
 *   BACKUP GATE (no good backup -> no migration, no DB writes)
 *     5. Migrate.run(null) and Migrate.run("garbage") THROW, and the DB is still
 *        empty afterwards (nothing was inserted before the gate failed).
 *
 *   READ-BACK FAILURE -> CALLER ROLLS BACK -> DB EMPTY
 *     6. Inject a fault that DROPS one record during insert: Migrate.run THROWS
 *        (read-back COUNT mismatch), and after Migrate.rollback(db) every owned
 *        table is empty (so the caller leaves 'migrated' unset and the next boot
 *        retries from the still-intact Store).
 *     7. Inject a fault that MUTATES one read-back row (same count, different
 *        content): Migrate.run THROWS (read-back CONTENT-HASH mismatch), and
 *        after rollback the DB is empty.
 *
 * Run (from repo root OR greetor/):
 *     node --experimental-sqlite greetor/scripts/qa-migration.cjs
 *     node --experimental-sqlite scripts/qa-migration.cjs
 * (--experimental-sqlite is required on Node 20/22 and a harmless no-op on 24+.)
 *
 * EXIT: 0 iff every assertion PASSES; non-zero on ANY fail (or a missing
 * node:sqlite / module, so CI never produces a false green).
 *
 * Structure mirrors qa-diff-datalayers.cjs: global.window = global; locate www +
 * scripts robustly; load db-schema + migrate + the adapter; build an in-memory
 * DatabaseSync with DBSchema.SCHEMA applied; inject via the adapter.
 */
"use strict";

var fs = require("fs");
var path = require("path");

// node:sqlite dual-export modules do `window.X = ...`; expose them as globals.
global.window = global;

// ── locate greetor/www and greetor/scripts robustly (repo root OR greetor/) ──
function firstExisting(cands, what) {
  for (var i = 0; i < cands.length; i++) { if (fs.existsSync(cands[i])) return cands[i]; }
  throw new Error("Cannot locate " + what + " (looked in: " + cands.join(", ") + ")");
}
var WWW = firstExisting([
  path.join(__dirname, "..", "www"),
  path.join(process.cwd(), "greetor", "www"),
  path.join(process.cwd(), "www")
], "greetor/www");
var SCRIPTS_DIR = firstExisting([
  __dirname,
  path.join(WWW, "..", "scripts")
], "greetor/scripts");
var ADAPTER_PATH = firstExisting([
  path.join(SCRIPTS_DIR, "sqlite-node-adapter.cjs")
], "sqlite-node-adapter.cjs");

// ── load db-schema, migrate, the adapter, and a real source state ────────────
require(path.join(WWW, "db-schema.js"));    // window.DBSchema
require(path.join(WWW, "migrate.js"));      // window.Migrate
var makeAdapter = require(ADAPTER_PATH);    // node:sqlite -> GreetorDB contract

var DBSchema = global.DBSchema;
var Migrate = global.Migrate;

var DatabaseSync;
try { DatabaseSync = require("node:sqlite").DatabaseSync; }
catch (e) {
  console.log("node:sqlite unavailable: " + e.message +
    "\n(use Node 22.5+/24, or run with --experimental-sqlite)");
  process.exit(2);
}

if (!DBSchema || typeof DBSchema.disassemble !== "function") {
  console.log("FATAL: DBSchema failed to load."); process.exit(2);
}
if (!Migrate || typeof Migrate.run !== "function" || typeof Migrate.rollback !== "function") {
  console.log("FATAL: Migrate (migrate.js) failed to load."); process.exit(2);
}

// Prefer the committed seed snapshot the other gates use (deterministic); fall
// back to seed-data.js's window.DEMO_SEED. Either is a real ~2,612-row state.
function loadSourceState() {
  var snap = path.join(SCRIPTS_DIR, "qa-fixtures", "seed-snapshot.json");
  if (fs.existsSync(snap)) {
    try { return JSON.parse(fs.readFileSync(snap, "utf8")); } catch (e) { /* fall through */ }
  }
  require(path.join(WWW, "seed-data.js"));   // window.DEMO_SEED
  return global.DEMO_SEED;
}
var SOURCE = loadSourceState();
if (!SOURCE || !Array.isArray(SOURCE.records) || SOURCE.records.length < 2000) {
  console.log("FATAL: source state did not load a full seed (records=" +
    (SOURCE && SOURCE.records ? SOURCE.records.length : 0) + ")");
  process.exit(2);
}

var OWNED = (Migrate.OWNED_TABLES && Migrate.OWNED_TABLES.length)
  ? Migrate.OWNED_TABLES
  : ["records", "users", "audit_log", "comms_log", "comms_templates", "footfall", "meta"];

// ── canonical JSON — byte-identical to the other QA harnesses ────────────────
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canon(x[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(x);
}

// ── result accounting ───────────────────────────────────────────────────────
var PASS = 0, FAIL = 0; var FAILS = [];
function ok(cond, msg) {
  if (cond) { PASS++; console.log("  PASS  " + msg); }
  else { FAIL++; FAILS.push(msg); console.log("  FAIL  " + msg); }
}

// ── DB helpers ──────────────────────────────────────────────────────────────
// freshDb mirrors the REAL pre-migration DB: db.js applies the schema AND stamps
// infrastructure meta keys (schema_version always; secret_hash on native first
// run) BEFORE boot()'s migration runs. We stamp the same here so the migration's
// meta read-back (which legitimately sees MORE meta rows than disassemble emits)
// is exercised exactly as it will be on a real device — otherwise the test would
// run against an empty meta table and give false confidence about the subset gate.
function freshDb() {
  var db = new DatabaseSync(":memory:");
  DBSchema.SCHEMA.forEach(function (ddl) { db.exec(ddl); });
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)").run("1");
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('secret_hash', ?)").run("deadbeef".repeat(8));
  return db;
}
function countRow(db, table) {
  return db.prepare("SELECT COUNT(*) AS n FROM " + table).get().n;
}
function totalRows(db) {
  var t = 0;
  for (var i = 0; i < OWNED.length; i++) t += Number(countRow(db, OWNED[i])) || 0;
  return t;
}
// Rows in the DATA tables only (everything except meta). "No migrated data" is
// expressed against this, because freshDb() pre-stamps infrastructure meta keys
// (schema_version/secret_hash) exactly like the real app does before migration.
function dataRows(db) {
  var t = 0;
  for (var i = 0; i < OWNED.length; i++) {
    if (OWNED[i] === "meta") continue;
    t += Number(countRow(db, OWNED[i])) || 0;
  }
  return t;
}
// Re-read every owned table and assemble the whole-state object (the exact path
// index.html's assembleStateFromDB / backup uses).
function assembleFromDb(db) {
  var tables = {};
  for (var i = 0; i < OWNED.length; i++) {
    tables[OWNED[i]] = db.prepare("SELECT * FROM " + OWNED[i]).all();
  }
  return DBSchema.assemble(tables);
}

// ── main ──────────────────────────────────────────────────────────
(async function main() {
  console.log("# SQLite migration — SAFETY-PROOF GATE (Phase 4)");
  console.log("  www     : " + WWW);
  console.log("  source  : records=" + SOURCE.records.length +
    " users=" + (SOURCE.users ? SOURCE.users.length : 0));
  console.log("  owned   : " + OWNED.join(", "));
  console.log("");

  var dis = DBSchema.disassemble(SOURCE);

  // ── 1–4: HAPPY PATH ────────────────────────────────────────────────────────
  console.log("# HAPPY PATH — Migrate.run over a fresh DB");
  var hp = freshDb();
  ok(dataRows(hp) === 0, "fresh DB starts empty of data (meta has only infra keys)");
  var hpAdapter = makeAdapter(hp);
  var result;
  try {
    result = await Migrate.run(SOURCE, { db: hpAdapter });
  } catch (e) {
    ok(false, "Migrate.run(happy) should NOT throw — threw: " + (e && e.message || e));
    result = null;
  }

  if (result) {
    ok(result.ok === true, "Migrate.run returned ok:true");

    // (2) returned backup is a valid verified envelope with matching counts.
    var backupOk = false, backupWhy = "";
    try {
      var parsed = JSON.parse(result.backup);
      var envOk = parsed && parsed._format === "saagar_greetor_v2" && parsed.state &&
                  Array.isArray(parsed.state.records);
      var countsOk = envOk &&
        parsed.state.records.length === (SOURCE.records || []).length &&
        (parsed.state.users || []).length === (SOURCE.users || []).length &&
        (parsed.state.auditLog || []).length === (SOURCE.auditLog || []).length &&
        (parsed.state.commsLog || []).length === (SOURCE.commsLog || []).length &&
        (parsed.state.commsTemplates || []).length === (SOURCE.commsTemplates || []).length;
      backupOk = !!countsOk;
      if (!envOk) backupWhy = "(envelope/state missing)";
      else if (!countsOk) backupWhy = "(array counts diverged)";
    } catch (e) { backupWhy = "(backup did not parse: " + (e && e.message || e) + ")"; }
    ok(backupOk, "returned backup is a valid saagar_greetor_v2 envelope w/ matching counts " + (backupOk ? "" : backupWhy));

    // (3) per-table counts match the disassembled source. result.counts is the
    // SOURCE count for every table (incl. meta). DB rows match the source EXACTLY
    // for data tables; for meta the DB has the source rows PLUS the 2 infra keys
    // (schema_version/secret_hash) freshDb stamped, so we assert DB-meta >= source.
    var countsMatch = true, firstBadCount = "";
    for (var i = 0; i < OWNED.length; i++) {
      var t = OWNED[i];
      var want = (dis[t] || []).length;
      var got = (result.counts && result.counts[t] != null) ? result.counts[t] : -1;
      var dbn = Number(countRow(hp, t)) || 0;
      var dbOk = (t === "meta") ? (dbn >= want) : (dbn === want);
      if (got !== want || !dbOk) { countsMatch = false; if (!firstBadCount) firstBadCount = t + " (want=" + want + " result=" + got + " db=" + dbn + ")"; }
    }
    ok(countsMatch, "per-table counts match source (result.counts === source; DB data tables ===, meta superset)" + (countsMatch ? "" : " — first bad: " + firstBadCount));

    // (4) assemble(read-back) is canon byte-identical to the source state.
    var recon = assembleFromDb(hp);
    ok(canon(recon) === canon(SOURCE), "WHOLE STATE byte-identical after migrate + read-back");
    if (canon(recon) !== canon(SOURCE)) {
      // tiny diagnostic: which top-level keys differ
      var keys = {}; Object.keys(SOURCE).forEach(function (k) { keys[k] = 1; }); Object.keys(recon).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        if (canon(SOURCE[k]) !== canon(recon[k])) console.log("      differs at key: " + k);
      });
    }
  }

  // ── 5: BACKUP GATE — bad oldState THROWS before any DB write ─────────────────
  console.log("\n# BACKUP GATE — no good backup => throw, DB untouched");
  for (var bg = 0; bg < 2; bg++) {
    var badInput = (bg === 0) ? null : "this is not a state object";
    var label = (bg === 0) ? "null" : "non-object string";
    var gdb = freshDb();
    var gAdapter = makeAdapter(gdb);
    var threw = false;
    try { await Migrate.run(badInput, { db: gAdapter }); }
    catch (e) { threw = true; }
    ok(threw, "Migrate.run(" + label + ") THROWS at the backup gate");
    ok(dataRows(gdb) === 0, "Migrate.run(" + label + ") wrote NO data to the DB");
  }

  // ── 6: DROP-A-ROW fault => read-back COUNT mismatch => throw => rollback empty
  console.log("\n# FAULT (drop a row on insert) — read-back COUNT mismatch => throw => rollback empty");
  {
    var d6 = freshDb();
    var a6 = makeAdapter(d6);
    // Wrap run(): silently SKIP the INSERT for exactly one record row so the
    // transaction commits with one fewer record than the source. The migration's
    // read-back COUNT gate (using the REAL query) must then fail.
    var realRun6 = a6.run.bind(a6);
    var dropped = false;
    var victimId = (dis.records[0] && dis.records[0].recordId) || null;
    a6.run = function (sql, params) {
      if (!dropped && /INSERT\s+INTO\s+records\b/i.test(sql)) {
        // params order matches DBSchema.REC_COLS; recordId is the first column.
        var rid = params && params.length ? params[0] : null;
        if (rid === victimId) { dropped = true; return Promise.resolve({ changes: 0, lastId: 0 }); }
      }
      return realRun6(sql, params);
    };
    var threw6 = false, msg6 = "";
    try { await Migrate.run(SOURCE, { db: a6 }); }
    catch (e) { threw6 = true; msg6 = (e && e.message) || ""; }
    ok(threw6, "Migrate.run THROWS when a record row is dropped on insert");
    ok(dropped, "the drop-a-row fault actually fired (skipped recordId=" + victimId + ")");
    ok(/COUNT mismatch/i.test(msg6) || /count/i.test(msg6), "thrown error names a read-back COUNT mismatch");
    // The DB now holds N-1 records (insert committed minus the dropped row); the
    // caller's catch path rolls back. Restore the real run for the rollback.
    a6.run = realRun6;
    await Migrate.rollback(a6);
    ok(totalRows(d6) === 0, "after Migrate.rollback the DB is EMPTY (next boot can retry)");
  }

  // ── 7: MUTATE-A-ROW fault => read-back CONTENT mismatch => throw => rollback ──
  console.log("\n# FAULT (mutate a read-back row) — read-back CONTENT mismatch => throw => rollback empty");
  {
    var d7 = freshDb();
    var a7 = makeAdapter(d7);
    // Wrap query(): on the records read-back, return the real rows but with one
    // field corrupted (same COUNT, different CONTENT) so the COUNT gate passes and
    // the CONTENT-HASH gate trips. Only touch the records SELECT * read-back.
    var realQuery7 = a7.query.bind(a7);
    var mutated = false;
    a7.query = function (sql, params) {
      var p = realQuery7(sql, params);
      if (/^\s*SELECT\s+\*\s+FROM\s+records\s*$/i.test(sql)) {
        return p.then(function (rows) {
          if (rows && rows.length) {
            var clone = rows.map(function (r) {
              var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); return o;
            });
            clone[0].customerName = String(clone[0].customerName || "") + "__CORRUPTED__";
            mutated = true;
            return clone;
          }
          return rows;
        });
      }
      return p;
    };
    var threw7 = false, msg7 = "";
    try { await Migrate.run(SOURCE, { db: a7 }); }
    catch (e) { threw7 = true; msg7 = (e && e.message) || ""; }
    ok(threw7, "Migrate.run THROWS when a read-back row's content is corrupted");
    ok(mutated, "the mutate-a-row fault actually fired on the records read-back");
    ok(/CONTENT mismatch/i.test(msg7) || /content/i.test(msg7), "thrown error names a read-back CONTENT mismatch");
    // Real rows ARE in the DB (insert + commit succeeded; only the read-back was
    // faked). Restore the real query, roll back, assert empty.
    a7.query = realQuery7;
    await Migrate.rollback(a7);
    ok(totalRows(d7) === 0, "after Migrate.rollback the DB is EMPTY (next boot can retry)");
  }

  // ── 8: CORRUPT A MIGRATED META VALUE => meta subset gate trips => throw ───────
  // Proves the meta SUBSET semantics still catch corruption of a row the migration
  // actually wrote (masters/targets/settings), not just the data tables. We mutate
  // the read-back value of the 'settings' meta key so it no longer matches source.
  console.log("\n# FAULT (corrupt a migrated meta value) — meta subset gate => throw => rollback empty");
  {
    var d8 = freshDb();
    var a8 = makeAdapter(d8);
    var realQuery8 = a8.query.bind(a8);
    var metaMutated = false;
    a8.query = function (sql, params) {
      var p = realQuery8(sql, params);
      if (/^\s*SELECT\s+\*\s+FROM\s+meta\s*$/i.test(sql)) {
        return p.then(function (rows) {
          if (rows && rows.length) {
            var clone = rows.map(function (r) {
              var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); return o;
            });
            for (var m = 0; m < clone.length; m++) {
              if (clone[m].key === "settings") { clone[m].value = '{"tampered":true}'; metaMutated = true; }
            }
            return clone;
          }
          return rows;
        });
      }
      return p;
    };
    var threw8 = false, msg8 = "";
    try { await Migrate.run(SOURCE, { db: a8 }); }
    catch (e) { threw8 = true; msg8 = (e && e.message) || ""; }
    ok(threw8, "Migrate.run THROWS when a migrated meta value is corrupted on read-back");
    ok(metaMutated, "the meta-value fault actually fired on the meta read-back");
    ok(/meta VALUE mismatch/i.test(msg8) || /meta/i.test(msg8), "thrown error names a meta value mismatch");
    a8.query = realQuery8;
    await Migrate.rollback(a8);
    ok(totalRows(d8) === 0, "after Migrate.rollback the DB is EMPTY (next boot can retry)");
  }

  // ── summary ──
  console.log("\n========== RESULT ==========");
  console.log("PASS=" + PASS + "  FAIL=" + FAIL);
  if (FAIL) {
    console.log("\nFAILURES:");
    FAILS.forEach(function (f) { console.log(" - " + f); });
    process.exit(1);
  } else {
    console.log("\nALL GREEN — Migrate.run moves the legacy state into SQLite with a verified " +
      "backup + read-back proof, and FAILS CLOSED (throw + rollback to empty) on any count/content " +
      "mismatch. Phase 4 migration gate PASSED.");
  }
})().catch(function (e) {
  console.log("\nFATAL (unhandled): " + (e && e.stack || e));
  process.exit(1);
});
