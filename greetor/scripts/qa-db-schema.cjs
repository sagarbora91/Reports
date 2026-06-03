/* qa-db-schema.cjs - Phase 0 schema-integrity proof for Saagar Greetor.
 *
 * Independently of db.js (which needs the Capacitor plugin / sql.js wasm at
 * runtime), this proves the schema db.js applies is sound: it loads the SINGLE
 * source of truth (db-schema.js), applies EVERY statement in DBSchema.SCHEMA to
 * a real in-memory SQLite DB, asserts all 7 tables + 4 indexes exist, then
 * inserts one sample row per table THROUGH the db-schema mappers and reads it
 * back equal. GREEN with counts; non-zero exit on any failure.
 *
 * Mirrors scripts/qa-sqlite-roundtrip.cjs (node:sqlite DatabaseSync).
 * node:sqlite is experimental on Node 20/22 and stable on Node 24+. The npm
 * script and CI run this with --experimental-sqlite so it works regardless; on
 * a Node that lacks the module entirely it prints a notice and exits 2 (so it
 * never produces a false PASS). Run from repo root OR greetor:
 *     node --experimental-sqlite greetor/scripts/qa-db-schema.cjs
 *     node --experimental-sqlite scripts/qa-db-schema.cjs
 */
"use strict";
const path = require("path");
const fs = require("fs");
global.window = global; // db-schema.js sets window.DBSchema

// Resolve www/db-schema.js robustly whether run from repo root or greetor/.
function resolveSchema() {
  const candidates = [
    path.join(__dirname, "..", "www", "db-schema.js"),          // greetor/scripts/ -> greetor/www
    path.join(process.cwd(), "greetor", "www", "db-schema.js"), // repo root
    path.join(process.cwd(), "www", "db-schema.js"),            // inside greetor/
    path.join(__dirname, "db-schema.js")                        // co-located fallback
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  throw new Error("Cannot locate www/db-schema.js (looked in: " + candidates.join(", ") + ")");
}

const DBSchema = require(resolveSchema());

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(c, m) { if (c) PASS++; else { FAIL++; FAILS.push(m); console.log("  x " + m); } }

// stable canonical JSON (sorted keys) for order-independent deep compare
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
  }
  return JSON.stringify(x);
}

let DatabaseSync;
try { DatabaseSync = require("node:sqlite").DatabaseSync; }
catch (e) { console.log("node:sqlite unavailable: " + e.message + "\n(use Node 22.5+/24, or run with --experimental-sqlite)"); process.exit(2); }

const db = new DatabaseSync(":memory:");

// -- 1. Apply EVERY DDL statement (exactly what db.js does at open). -----------
console.log("# APPLY SCHEMA");
ok(Array.isArray(DBSchema.SCHEMA) && DBSchema.SCHEMA.length > 0, "DBSchema.SCHEMA is a non-empty array");
DBSchema.SCHEMA.forEach(function (ddl, i) {
  try { db.exec(ddl); }
  catch (e) { ok(false, "DDL #" + i + " failed: " + e.message + "  ::  " + ddl.slice(0, 60)); }
});
// Idempotency: every statement is IF NOT EXISTS, so applying twice must be a no-op.
try { DBSchema.SCHEMA.forEach(function (ddl) { db.exec(ddl); }); ok(true, "schema re-apply is idempotent (IF NOT EXISTS)"); }
catch (e) { ok(false, "schema not idempotent: " + e.message); }

// -- 2. Assert all 7 tables + 4 indexes exist (read sqlite_master). ------------
console.log("\n# OBJECTS PRESENT");
const EXPECT_TABLES = ["records", "users", "audit_log", "comms_log", "comms_templates", "footfall", "meta"];
const EXPECT_INDEXES = ["idx_records_visitDate", "idx_records_mobile", "idx_records_leadStatus", "idx_records_createdBy"];

const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(function (r) { return r.name; });
const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(function (r) { return r.name; });

EXPECT_TABLES.forEach(function (t) { ok(tableNames.indexOf(t) !== -1, "table exists: " + t); });
EXPECT_INDEXES.forEach(function (i) { ok(indexNames.indexOf(i) !== -1, "index exists: " + i); });
ok(tableNames.length === EXPECT_TABLES.length, "exactly " + EXPECT_TABLES.length + " tables (found " + tableNames.length + ": " + tableNames.slice().sort().join(", ") + ")");
ok(indexNames.length === EXPECT_INDEXES.length, "exactly " + EXPECT_INDEXES.length + " indexes (found " + indexNames.length + ")");

// -- 3. Insert one sample row per table THROUGH the mappers, read back equal. --
console.log("\n# MAPPER ROUND-TRIP (one row per table)");

function insertRow(table, row) {
  const cols = Object.keys(row);
  const stmt = db.prepare("INSERT INTO " + table + " (" + cols.join(",") + ") VALUES (" + cols.map(function () { return "?"; }).join(",") + ")");
  stmt.run.apply(stmt, cols.map(function (c) { var v = row[c]; return v === undefined ? null : v; }));
}

// --- records ---
const recIn = {
  recordId: "g_qa_1", createdAt: "2026-06-03T10:00:00.000Z", updatedAt: "2026-06-03T10:05:00.000Z",
  createdByUserId: "u1", createdByName: "QA Greetor", store: "Titan World", visitDate: "2026-06-03",
  visitTime: "10:00", source: "Walk-in", mobile: "9876543210", customerName: "QA Customer",
  customerType: "New Customer", category: "Analog Watches", subCategory: "Men", brand: "Titan",
  gender: "Men", occasion: "Gifting", budget: "5k-10k", urgency: "Within a week",
  greetor: "QA Greetor", cro: "CRO One", reason: "Price too high", competitor: "Brand X",
  remarks: "interested, will return", followUp: "Yes", leadStatus: "Hot", followDate: "2026-06-10",
  followTime: "11:00", consent_at: "2026-06-03T10:00:00.000Z", saleValue: 7500, convertedAt: "",
  quick: false, photos: ["p1.jpg", "p2.jpg"]
};
insertRow("records", DBSchema.recordToRow(recIn, 0));
const recOut = DBSchema.rowToRecord(db.prepare("SELECT * FROM records WHERE recordId=?").get("g_qa_1"));
ok(canon(recOut) === canon(DBSchema.rowToRecord(DBSchema.recordToRow(recIn, 0))), "records: row->record stable through DB");
ok(recOut.recordId === "g_qa_1" && recOut.mobile === "9876543210" && recOut.photos.length === 2 && recOut.saleValue === 7500,
   "records: key fields + photos[] JSON + saleValue read back correctly");

// --- users ---
const userIn = { id: "u1", name: "QA Greetor", role: "GREETOR", pin_salt: "abc123", pin_hash: "deadbeef", created_at: "2026-01-01T00:00:00.000Z", is_active: true, phone: "9000000000" };
insertRow("users", DBSchema.userToRow(userIn, 0));
const userOut = DBSchema.rowToUser(db.prepare("SELECT * FROM users WHERE id=?").get("u1"));
ok(canon(userOut) === canon(userIn), "users: round-trip equal");

// --- audit_log ---
const auditIn = { id: "a1", at: "2026-06-03T10:00:00.000Z", userId: "u1", userName: "QA Greetor", role: "GREETOR", action: "create", summary: "created walk-in", detail: { recordId: "g_qa_1", n: 1 } };
insertRow("audit_log", DBSchema.auditToRow(auditIn, 0));
const auditOut = DBSchema.rowToAudit(db.prepare("SELECT * FROM audit_log WHERE id=?").get("a1"));
ok(canon(auditOut) === canon(auditIn), "audit_log: round-trip equal (incl. JSON detail)");

// --- comms_log ---
const commsIn = { id: "c1", at: "2026-06-03T10:00:00.000Z", byUserId: "u1", byName: "QA Greetor", channel: "whatsapp", recordId: "g_qa_1", mobile: "9876543210", customerName: "QA Customer", templateId: "t1", templateName: "Thank you", text: "Thanks for visiting!", timestamp: "2026-06-03T10:00:00.000Z" };
insertRow("comms_log", DBSchema.commsLogToRow(commsIn, 0));
const commsOut = DBSchema.rowToCommsLog(db.prepare("SELECT * FROM comms_log WHERE id=?").get("c1"));
ok(canon(commsOut) === canon(commsIn), "comms_log: round-trip equal (ts<->timestamp)");

// --- comms_templates ---
const tmplIn = { id: "t1", name: "Thank you", scope: "global", store: "", reason: "", text: "Thanks for visiting {name}!", active: true };
insertRow("comms_templates", DBSchema.tmplToRow(tmplIn, 0));
const tmplOut = DBSchema.rowToTmpl(db.prepare("SELECT * FROM comms_templates WHERE id=?").get("t1"));
ok(canon(tmplOut) === canon(tmplIn), "comms_templates: round-trip equal");

// --- footfall (composite PK store,date) ---
const ffIn = { store: "Titan World", date: "2026-06-03", count: 42, byUserId: "u1", byName: "QA Greetor", at: "2026-06-03T20:00:00.000Z" };
insertRow("footfall", DBSchema.footfallToRow(ffIn));
const ffOut = DBSchema.rowToFootfall(db.prepare("SELECT * FROM footfall WHERE store=? AND date=?").get("Titan World", "2026-06-03"));
ok(canon(ffOut) === canon(ffIn), "footfall: round-trip equal (composite PK)");

// --- meta (KV) ---
insertRow("meta", { key: "schema_version", value: "1" });
const metaOut = db.prepare("SELECT value FROM meta WHERE key=?").get("schema_version");
ok(metaOut && metaOut.value === "1", "meta: KV row read back equal");

// row counts (one per table)
console.log("\n# COUNTS");
const counts = {};
EXPECT_TABLES.forEach(function (t) { counts[t] = db.prepare("SELECT COUNT(*) n FROM " + t).get().n; });
EXPECT_TABLES.forEach(function (t) { ok(counts[t] === 1, t + " has exactly 1 row"); });

console.log("\n========== RESULT ==========");
console.log("tables=" + tableNames.length + "  indexes=" + indexNames.length +
  "  rows={" + EXPECT_TABLES.map(function (t) { return t + ":" + counts[t]; }).join(", ") + "}");
console.log("PASS=" + PASS + "  FAIL=" + FAIL);
if (FAIL) { console.log("\nFAILURES:"); FAILS.forEach(function (f) { console.log(" - " + f); }); process.exit(1); }
else { console.log("\nALL GREEN -- DBSchema.SCHEMA applies cleanly; 7 tables + 4 indexes present; every table round-trips through its mappers."); }
