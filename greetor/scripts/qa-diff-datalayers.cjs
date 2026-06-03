/* qa-diff-datalayers.cjs — the BYTE-IDENTITY GATE for SQLite Phase 2.
 *
 * Proves the REWRITTEN async, DB-backed data layers (greetor/www/reports.js +
 * customers.js, talking ONLY through window.Repo) produce output byte-identical
 * to the PRE-rewrite pure-over-state layers, on the real 2,612-row seed. The
 * golden contract was minted by scripts/gen-golden.cjs into
 * scripts/qa-fixtures/golden-datalayers.json; this harness re-runs the SAME
 * (layer, fn, inputs) matrix against the rewritten layers over a real
 * node:sqlite database (via scripts/sqlite-node-adapter.cjs injected into Repo)
 * and asserts canon(new) === golden[key] for EVERY key. Byte-identity is the
 * ONLY hard requirement of Phase 2, so green here == the rewrite is safe.
 *
 * Structure mirrors scripts/qa-sqlite-roundtrip.cjs / qa-db-schema.cjs
 * (global.window = global; node:sqlite DatabaseSync(':memory:'); apply
 * DBSchema.SCHEMA; disassemble(seed) + bulk-insert all tables). The difference:
 * instead of reassembling and re-running the OLD sync layers, it injects the
 * adapter into Repo and drives the NEW async layers.
 *
 * Run (from repo root OR greetor/):
 *     node --experimental-sqlite greetor/scripts/qa-diff-datalayers.cjs
 *     node --experimental-sqlite scripts/qa-diff-datalayers.cjs
 * (--experimental-sqlite is required on Node 20/22 and a harmless no-op on 24+.)
 *
 * EXIT: 0 iff every golden key PASSES; non-zero on ANY fail (or on a missing
 * node:sqlite / fixture, so CI never produces a false green).
 *
 * ── Why the harness reproduces the golden EXACTLY ─────────────────────────
 *  1. CLOCK. setStage/convertToSale stamp new Date().toISOString(), and
 *     Customers.byMobile/list compute lastVisitAgoDays from "today". The golden
 *     was minted with the clock FROZEN to FIXED_NOW; we freeze to the SAME value
 *     BEFORE loading any layer (they read new Date() lazily inside functions),
 *     so every stamp / age is identical.
 *  2. CANON. Same order-PRESERVING canonical JSON as gen-golden.cjs: object keys
 *     sorted (insertion order can't cause spurious diffs) but ARRAY order kept
 *     verbatim (sort order IS observable output). CSV strings compared RAW.
 *  3. 'all' RANGE. The spec's 'all' == the UNFILTERED record set. resolveRange
 *     has no 'all' key (Reports.summary('all') would fall back to 'today'), so —
 *     exactly like the generator's recordsForRange('all') — we run the PURE
 *     transform (Reports.summaryPure) over Repo.records.all() directly.
 *  4. MUTATIONS. Each golden's `before` is PRISTINE seed state and its
 *     `recordsChanged` proves exactly one record differs from the original seed.
 *     Several cases target the SAME recordId, so we rebuild a FRESH database for
 *     every mutation case (the generator used a fresh deep clone per case) — no
 *     case can contaminate another, and the seed is provably untouched.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

// node:sqlite dual-export modules do `window.X = ...`; expose them as globals.
global.window = global;

// ── locate greetor/www and greetor/scripts robustly (repo root OR greetor/) ──
function firstExisting(cands, what) {
  for (var i = 0; i < cands.length; i++) { if (fs.existsSync(cands[i])) return cands[i]; }
  throw new Error("Cannot locate " + what + " (looked in: " + cands.join(", ") + ")");
}
var WWW = firstExisting([
  path.join(__dirname, "..", "www"),               // greetor/scripts/ -> greetor/www
  path.join(process.cwd(), "greetor", "www"),      // repo root
  path.join(process.cwd(), "www")                  // inside greetor/
], "greetor/www");
var SCRIPTS_DIR = firstExisting([
  __dirname,                                        // greetor/scripts (normal)
  path.join(WWW, "..", "scripts")                  // derived from www
], "greetor/scripts");
var FIXTURE = firstExisting([
  path.join(SCRIPTS_DIR, "qa-fixtures", "golden-datalayers.json")
], "qa-fixtures/golden-datalayers.json");
var ADAPTER_PATH = firstExisting([
  path.join(SCRIPTS_DIR, "sqlite-node-adapter.cjs")
], "sqlite-node-adapter.cjs");

// ── FREEZE the clock to the SAME instant the golden was minted with. Must run ──
// BEFORE any layer loads (they read new Date() lazily inside their functions).
// Keep this byte-identical to gen-golden.cjs's FIXED_NOW + freezeDate(). ──
var FIXED_NOW = "2026-06-03T12:00:00.000Z";
(function freezeDate() {
  var RealDate = Date;
  function FrozenDate() {
    if (!(this instanceof FrozenDate)) {
      return new RealDate(FIXED_NOW).toString();
    }
    if (arguments.length === 0) return new RealDate(FIXED_NOW);
    var args = Array.prototype.slice.call(arguments);
    var Bound = Function.prototype.bind.apply(RealDate, [null].concat(args));
    return new Bound();
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = function () { return new RealDate(FIXED_NOW).getTime(); };
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  global.Date = FrozenDate;
})();

// ── 1. load db-schema, repo, the REWRITTEN layers, the adapter + seed ────────
// Order matters: db-schema before repo; masters before customers (pipelineStages
// -> Masters.globalList); customers before reports (Reports.formatINR delegates
// to Customers.formatINR). The rewritten layers reach the DB lazily via Repo, so
// requiring them here (no DB yet) is safe — nothing queries until we await.
require(path.join(WWW, "db-schema.js"));   // window.DBSchema
require(path.join(WWW, "repo.js"));        // window.Repo
require(path.join(WWW, "masters.js"));     // window.Masters
require(path.join(WWW, "customers.js"));   // window.Customers (async, DB-backed)
require(path.join(WWW, "reports.js"));     // window.Reports   (async, DB-backed)
var makeAdapter = require(ADAPTER_PATH);   // node:sqlite -> GreetorDB contract

var DBSchema = global.DBSchema;
var Repo = global.Repo;
var Reports = global.Reports;
var Customers = global.Customers;
// Load the EXACT seed the golden was minted from (committed snapshot), so the
// gate is deterministic regardless of gen-seed's calendar-day anchoring.
var SEED = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, "qa-fixtures", "seed-snapshot.json"), "utf8"));

var DatabaseSync;
try { DatabaseSync = require("node:sqlite").DatabaseSync; }
catch (e) {
  console.log("node:sqlite unavailable: " + e.message +
    "\n(use Node 22.5+/24, or run with --experimental-sqlite)");
  process.exit(2);
}

// ── canonical JSON — byte-identical to gen-golden.cjs canon() ─────────────────
// object keys SORTED; ARRAY order PRESERVED; primitives via JSON.stringify.
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canon(x[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(x);
}
// A golden value is a RAW string (CSV) or canon(value); the harness produces the
// same: CSV results compared raw (===), structured results compared via canon().
function goldenOf(value) {
  return (typeof value === "string") ? value : canon(value);
}

// ── DB construction: apply schema + bulk-insert disassembled seed. ─────────────
// Mirrors qa-sqlite-roundtrip.cjs insertAll(). Returns a fresh adapter-backed DB
// so mutation cases can each start from a pristine seed.
function insertAll(db, table, rows) {
  if (!rows.length) return;
  var cols = Object.keys(rows[0]);
  var stmt = db.prepare("INSERT INTO " + table + " (" + cols.join(",") +
    ") VALUES (" + cols.map(function () { return "?"; }).join(",") + ")");
  db.prepare("BEGIN").run();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    stmt.run.apply(stmt, cols.map(function (c) { var v = r[c]; return v === undefined ? null : v; }));
  }
  db.prepare("COMMIT").run();
}

function buildSeededDb() {
  var db = new DatabaseSync(":memory:");
  DBSchema.SCHEMA.forEach(function (ddl) { db.exec(ddl); });
  var dis = DBSchema.disassemble(SEED);
  insertAll(db, "records", dis.records);
  insertAll(db, "users", dis.users);
  insertAll(db, "audit_log", dis.audit_log);
  insertAll(db, "comms_log", dis.comms_log);
  insertAll(db, "comms_templates", dis.comms_templates);
  insertAll(db, "footfall", dis.footfall);
  insertAll(db, "meta", dis.meta);
  return db;
}

// Inject a freshly-seeded DB into Repo and return the raw handle (for asserts).
function freshRepoDb() {
  var db = buildSeededDb();
  Repo.setDb(makeAdapter(db));
  return db;
}

// ── result accounting + a single per-key assertion ──────────────────────────
var PASS = 0, FAIL = 0; var FAILS = [];
function previewDiff(actual, expected) {
  // first differing offset + a small window, so a CSV/JSON mismatch is locatable
  var n = Math.min(actual.length, expected.length), i = 0;
  while (i < n && actual[i] === expected[i]) i++;
  var from = Math.max(0, i - 20);
  return "  @ offset " + i + " (len got=" + actual.length + " want=" + expected.length + ")" +
    "\n      got : " + JSON.stringify(actual.slice(from, i + 30)) +
    "\n      want: " + JSON.stringify(expected.slice(from, i + 30));
}
function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
// Golden stores SHA-256 of the canonical output. Runners return the RAW
// canonical string (so we can preview it on failure); we hash here and compare.
function check(key, actualRaw, expectedHash) {
  var h = sha256(actualRaw);
  if (h === expectedHash) {
    PASS++;
    console.log("  PASS  " + key);
  } else {
    FAIL++;
    FAILS.push(key);
    console.log("  FAIL  " + key + "  (sha got=" + h.slice(0, 12) + " want=" + String(expectedHash).slice(0, 12) + ")");
    console.log("      actual[0:240]: " + JSON.stringify(String(actualRaw).slice(0, 240)));
  }
}

// ── load the golden fixture ───────────────────────────────────────────
var GOLDEN = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
var GOLDEN_KEYS = Object.keys(GOLDEN);

// Sanity: the same modules + seed the generator used.
if (!Reports || !Customers || !Repo || !DBSchema) {
  console.log("FATAL: a required module failed to load (Reports/Customers/Repo/DBSchema).");
  process.exit(2);
}
if (!SEED || !Array.isArray(SEED.records) || SEED.records.length < 2000) {
  console.log("FATAL: seed-data.js did not load a full DEMO_SEED (records=" +
    (SEED && SEED.records ? SEED.records.length : 0) + ")");
  process.exit(2);
}

// ── key parsing: recover the (fn, inputs) each golden key encodes ─────────────
// The generator names keys "<Layer>.<fn>(<label>)". We recompute each fn's
// inputs from the label so the harness needs no hard-coded id/mobile list — it
// reads them straight out of the key, the same deterministic targets the
// generator picked from seed order.
function labelOf(key) {
  var open = key.indexOf("(");
  return key.slice(open + 1, key.length - 1); // strip "Layer.fn(" and trailing ")"
}

// Reports.summary range from label: "today"|"7d"|"30d"|"month"|"all"|
// "custom 2026-01-01..2026-03-31".
function parseSummaryRange(label) {
  if (label.indexOf("custom ") === 0) {
    var span = label.slice("custom ".length);          // "2026-01-01..2026-03-31"
    var parts = span.split("..");
    return { rangeKey: "custom", cs: parts[0], ce: parts[1] };
  }
  return { rangeKey: label, cs: undefined, ce: undefined };
}

// Records in range, mirroring gen-golden.cjs recordsForRange: 'all' is UNFILTERED
// (NOT through filterByRange); everything else uses the pure filterByRange the
// app's report screen uses. We always source rows from Repo (the new data path).
async function recordsForRange(rangeKey, cs, ce) {
  var all = await Repo.records.all();                   // SELECT * ... ORDER BY ord
  if (rangeKey === "all") return all;                   // spec: unfiltered
  return Reports.filterByRange(all, rangeKey, cs, ce);  // SAME pure helper
}

// ── the assertion plan, key-driven so every fixture key is exercised ─────────
// Each runner returns the harness's golden string for its key (raw CSV or
// canon(value)). Async because the rewritten layers are async.

// READ-ONLY families share ONE seeded DB (no writes mutate it).
async function runReadKey(key) {
  var label = labelOf(key);

  if (key.indexOf("Reports.summary(") === 0) {
    var r = parseSummaryRange(label);
    if (r.rangeKey === "all") {
      // unfiltered -> pure transform over all rows (the rewritten summary() would
      // route 'all' through resolveRange and fall back to 'today').
      return goldenOf(Reports.summaryPure(await recordsForRange("all")));
    }
    return goldenOf(await Reports.summary(r.rangeKey, r.cs, r.ce));
  }

  if (key.indexOf("Reports.breakdown(") === 0) {
    // label: "<range>, <field>"
    var bi = label.split(", ");
    var brange = bi[0], bfield = bi[1];
    return goldenOf(await Reports.breakdown(brange, bfield));
  }

  if (key.indexOf("Reports.visitsCSV(") === 0) {
    return goldenOf(await Reports.visitsCSV(label)); // label == rangeKey
  }

  if (key.indexOf("Reports.dailySummaryCSV(") === 0) {
    return goldenOf(await Reports.dailySummaryCSV(label));
  }

  if (key.indexOf("Customers.list(") === 0) {
    // labels: "{}" | "{sort:visits}" | "{sort:name}" | "{sort:value}" |
    //         "{sort:recent}" | "{search:97}" | "{search:Aditya}"
    var opts = {};
    var inner = label.slice(1, -1); // strip { }
    if (inner) {
      var kv = inner.split(":");
      opts[kv[0]] = kv.slice(1).join(":"); // value may contain ':' — preserve
    }
    return goldenOf(await Customers.list(opts));
  }

  if (key.indexOf("Customers.byMobile(") === 0) {
    // labels: "single-visit mobile=…" | "repeat mobile=…" | "invalid=123" |
    //         "valid-not-in-db=9999999999"
    var eq = label.indexOf("=");
    var mobile = label.slice(eq + 1);
    return goldenOf(await Customers.byMobile(mobile));
  }

  if (key === "Customers.stats()") {
    return goldenOf(await Customers.stats());
  }

  if (key === "Customers.pipeline()") {
    return goldenOf(await Customers.pipeline());
  }

  if (key === "Customers.pipelineStages()") {
    return goldenOf(await Customers.pipelineStages());
  }

  return null; // not a read key
}

// MUTATION families: each on a FRESH seeded DB, reproducing the generator's
// {recordId, before, after, recordsChanged} proof via the NEW API (write through
// Customers.*, re-read through Repo, count changed rows vs the pristine seed).
function isMutationKey(key) {
  return key.indexOf("Customers.setStage(") === 0 ||
         key.indexOf("Customers.convertToSale(") === 0;
}

// label: "recordId=<id>, stage=<stage>" or "recordId=<id>, saleValue=<v>"
function parseMutationLabel(label) {
  var parts = label.split(", ");
  var recordId = parts[0].slice("recordId=".length);
  var argTok = parts[1];                          // "stage=Hot" | "saleValue=25000" | "saleValue='50000'"
  var argEq = argTok.indexOf("=");
  var argName = argTok.slice(0, argEq);           // "stage" | "saleValue"
  var argRaw = argTok.slice(argEq + 1);           // "Hot" | "25000" | "'50000'" | "0"
  return { recordId: recordId, argName: argName, argRaw: argRaw };
}

// Apply the write with the EXACT argument type the generator used: stage is a
// string; saleValue is a NUMBER unless quoted in the label ('50000' -> the
// generator passed the STRING "50000" to exercise Number() coercion).
async function applyMutation(m) {
  if (m.argName === "stage") {
    await Customers.setStage(m.recordId, m.argRaw);
  } else { // saleValue
    var quoted = m.argRaw.length >= 2 && m.argRaw[0] === "'" && m.argRaw[m.argRaw.length - 1] === "'";
    var saleValue = quoted ? m.argRaw.slice(1, -1) : Number(m.argRaw);
    await Customers.convertToSale(m.recordId, saleValue);
  }
}

async function runMutationKey(key) {
  var m = parseMutationLabel(labelOf(key));

  // Fresh DB == pristine seed for THIS case (cases share recordIds).
  freshRepoDb();

  // Snapshot the pristine record set (ORDER BY ord == seed order) and the target
  // record BEFORE the write — this is the generator's `before` (deep clone of the
  // pre-state) and the baseline for the one-record-changed proof.
  var beforeAll = await Repo.records.all();
  var before = await Repo.records.byId(m.recordId);

  // Apply the write through the NEW async API.
  await applyMutation(m);

  // Re-read via the new API: `after` is the post-write record; recordsChanged is
  // the count of records that differ from the pristine snapshot (positional,
  // since recordsAll() is ORDER BY ord on both reads).
  var after = await Repo.records.byId(m.recordId);
  var afterAll = await Repo.records.all();
  var changed = 0;
  for (var i = 0; i < afterAll.length; i++) {
    if (canon(afterAll[i]) !== canon(beforeAll[i])) changed++;
  }

  return goldenOf({
    recordId: m.recordId,
    before: before,
    after: after,
    recordsChanged: changed
  });
}

// ── main ──────────────────────────────────────────────────────────
(async function main() {
  console.log("# SQLite Phase 2 — DATA-LAYER BYTE-IDENTITY GATE");
  console.log("  fixture : " + FIXTURE);
  console.log("  seed    : records=" + SEED.records.length +
    " users=" + (SEED.users ? SEED.users.length : 0));
  console.log("  FIXED_NOW (frozen clock): " + FIXED_NOW);
  console.log("  golden keys: " + GOLDEN_KEYS.length);
  console.log("");

  // Partition keys: read-only vs mutation. Read keys run against ONE shared
  // seeded DB; mutation keys each rebuild their own.
  var readKeys = GOLDEN_KEYS.filter(function (k) { return !isMutationKey(k); });
  var mutKeys  = GOLDEN_KEYS.filter(isMutationKey);

  // ── read-only matrix (single seeded DB) ──
  console.log("# READ-ONLY (Reports + Customers reads) — shared seeded DB");
  freshRepoDb();
  for (var i = 0; i < readKeys.length; i++) {
    var key = readKeys[i];
    var expected = GOLDEN[key];
    var actual;
    try {
      actual = await runReadKey(key);
    } catch (e) {
      FAIL++; FAILS.push(key);
      console.log("  FAIL  " + key + "  (threw: " + (e && e.message || e) + ")");
      continue;
    }
    if (actual === null) {
      FAIL++; FAILS.push(key);
      console.log("  FAIL  " + key + "  (no runner matched this key — fixture/harness drift)");
      continue;
    }
    check(key, actual, expected);
  }

  // ── mutation matrix (fresh seeded DB per case; verify write + re-read) ──
  console.log("\n# MUTATIONS (setStage / convertToSale) — fresh seeded DB per case");
  for (var j = 0; j < mutKeys.length; j++) {
    var mkey = mutKeys[j];
    var mexpected = GOLDEN[mkey];
    var mactual;
    try {
      mactual = await runMutationKey(mkey);
    } catch (e2) {
      FAIL++; FAILS.push(mkey);
      console.log("  FAIL  " + mkey + "  (threw: " + (e2 && e2.message || e2) + ")");
      continue;
    }
    check(mkey, mactual, mexpected);
  }

  // ── coverage guard: every fixture key must have been asserted exactly once ──
  var asserted = PASS + FAIL;
  if (asserted !== GOLDEN_KEYS.length) {
    FAIL++;
    FAILS.push("COVERAGE");
    console.log("\n  FAIL  COVERAGE — asserted " + asserted + " of " +
      GOLDEN_KEYS.length + " golden keys.");
  }

  console.log("\n========== RESULT ==========");
  console.log("PASS=" + PASS + "  FAIL=" + FAIL + "  (of " + GOLDEN_KEYS.length + " golden keys)");
  if (FAIL) {
    console.log("\nFAILURES:");
    FAILS.forEach(function (f) { console.log(" - " + f); });
    process.exit(1);
  } else {
    console.log("\nALL GREEN — the rewritten async/DB-backed Reports + Customers are " +
      "byte-identical to the pre-rewrite layers on the real seed. Phase 2 gate PASSED.");
  }
})().catch(function (e) {
  // Never let an unexpected rejection produce a false green.
  console.log("\nFATAL (unhandled): " + (e && e.stack || e));
  process.exit(1);
});
