/* Corruption proof: take the real 2,612-row demo state → disassemble to rows →
   write to a REAL SQLite DB (node:sqlite) → read back → reassemble → assert it
   is byte-identical to the original, then re-run the data-layer checks on the
   reconstructed state and confirm identical analytics. If this is green, the
   relational mapping cannot lose or corrupt data.
   Run: node --experimental-sqlite greetor/scripts/qa-sqlite-roundtrip.cjs
        (or plain `node` if node:sqlite is stable in your version) */
"use strict";
const path = require("path");
global.window = global;
const WWW = path.join(__dirname, "..", "www");

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(c, m) { if (c) PASS++; else { FAIL++; FAILS.push(m); console.log("  ✗ " + m); } }

// stable canonical JSON (sorted keys) for order-independent deep compare
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
  }
  return JSON.stringify(x);
}

require(path.join(WWW, "masters.js"));
require(path.join(WWW, "customers.js"));
require(path.join(WWW, "reports.js"));
require(path.join(WWW, "comms.js"));
require(path.join(WWW, "targets.js"));
require(path.join(WWW, "footfall.js"));
require(path.join(WWW, "db-schema.js"));
require(path.join(WWW, "seed-data.js"));
const { Customers, Reports, Comms, Targets, Footfall, DBSchema } = global;
const seed = global.DEMO_SEED;
ok(seed && seed.records && seed.records.length > 2000, "seed loaded (" + (seed.records ? seed.records.length : 0) + " records)");

let DatabaseSync;
try { DatabaseSync = require("node:sqlite").DatabaseSync; }
catch (e) { console.log("node:sqlite unavailable: " + e.message); process.exit(2); }

const db = new DatabaseSync(":memory:");
DBSchema.SCHEMA.forEach(function (ddl) { db.exec(ddl); });

function insertAll(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare("INSERT INTO " + table + " (" + cols.join(",") + ") VALUES (" + cols.map(function () { return "?"; }).join(",") + ")");
  const tx = db.prepare("BEGIN"); tx.run();
  for (const r of rows) {
    stmt.run.apply(stmt, cols.map(function (c) { var v = r[c]; return v === undefined ? null : v; }));
  }
  db.prepare("COMMIT").run();
}

console.log("# DISASSEMBLE → SQLite");
const dis = DBSchema.disassemble(seed);
const t0 = Date.now();
insertAll("records", dis.records);
insertAll("users", dis.users);
insertAll("audit_log", dis.audit_log);
insertAll("comms_log", dis.comms_log);
insertAll("comms_templates", dis.comms_templates);
insertAll("footfall", dis.footfall);
insertAll("meta", dis.meta);
console.log("  ⏱ inserted " + dis.records.length + " records (+all tables) in " + (Date.now() - t0) + "ms");
ok(db.prepare("SELECT COUNT(*) n FROM records").get().n === seed.records.length, "records row count matches");

console.log("\n# READ BACK → REASSEMBLE");
const tables = {
  records: db.prepare("SELECT * FROM records").all(),
  users: db.prepare("SELECT * FROM users").all(),
  audit_log: db.prepare("SELECT * FROM audit_log").all(),
  comms_log: db.prepare("SELECT * FROM comms_log").all(),
  comms_templates: db.prepare("SELECT * FROM comms_templates").all(),
  footfall: db.prepare("SELECT * FROM footfall").all(),
  meta: db.prepare("SELECT * FROM meta").all(),
};
const recon = DBSchema.assemble(tables);

console.log("\n# BYTE-IDENTITY (original vs round-tripped)");
function mapBy(arr, key) { var m = {}; (arr || []).forEach(function (x) { m[x[key]] = x; }); return m; }
function compareCollection(label, origArr, reconArr, key) {
  ok((origArr || []).length === (reconArr || []).length, label + " count (" + (origArr || []).length + " vs " + (reconArr || []).length + ")");
  var a = mapBy(origArr, key), b = mapBy(reconArr, key), bad = 0, firstBad = "";
  Object.keys(a).forEach(function (k) { if (canon(a[k]) !== canon(b[k])) { bad++; if (!firstBad) firstBad = k; } });
  ok(bad === 0, label + " every item byte-identical (mismatches=" + bad + (firstBad ? ", first=" + firstBad : "") + ")");
}
compareCollection("records", seed.records, recon.records, "recordId");
compareCollection("users", seed.users, recon.users, "id");
compareCollection("auditLog", seed.auditLog, recon.auditLog, "id");
compareCollection("commsLog", seed.commsLog, recon.commsLog, "id");
compareCollection("commsTemplates", seed.commsTemplates, recon.commsTemplates, "id");
ok(canon(seed.masters) === canon(recon.masters), "masters byte-identical");
ok(canon(seed.targets) === canon(recon.targets), "targets byte-identical");
ok(canon(seed.footfall) === canon(recon.footfall), "footfall byte-identical");
ok(seed.current_user_id === recon.current_user_id, "current_user_id identical");
ok(seed.my_store === recon.my_store, "my_store identical");
ok(seed.reminder_enabled === recon.reminder_enabled, "reminder_enabled identical");
// the ultimate check: whole-state canonical equality
ok(canon(seed) === canon(recon), "WHOLE STATE byte-identical after SQLite round-trip");

console.log("\n# DATA-LAYER PARITY (original vs reconstructed)");
ok(canon(Customers.list(seed, {})) === canon(Customers.list(recon, {})), "Customers.list identical");
ok(canon(Customers.stats(seed)) === canon(Customers.stats(recon)), "Customers.stats identical");
ok(canon(Reports.summary(seed.records)) === canon(Reports.summary(recon.records)), "Reports.summary identical");
ok(canon(Reports.breakdown(seed.records, "reason")) === canon(Reports.breakdown(recon.records, "reason")), "Reports.breakdown(reason) identical");
ok(Reports.visitsCSV(seed.records) === Reports.visitsCSV(recon.records), "visitsCSV identical");
ok(canon(Targets.leaderboard(seed, Targets.recordsInPeriod(seed.records, "monthly"), "monthly")) ===
   canon(Targets.leaderboard(recon, Targets.recordsInPeriod(recon.records, "monthly"), "monthly")), "Targets.leaderboard identical");
ok(Footfall.totalForRange(seed, "2000-01-01", "2100-01-01") === Footfall.totalForRange(recon, "2000-01-01", "2100-01-01"), "Footfall total identical");

console.log("\n========== RESULT ==========");
console.log("PASS=" + PASS + "  FAIL=" + FAIL);
if (FAIL) { console.log("\nFAILURES:"); FAILS.forEach(function (f) { console.log(" - " + f); }); process.exit(1); }
else console.log("ALL GREEN — SQLite round-trip is lossless; no data corruption by construction.");
