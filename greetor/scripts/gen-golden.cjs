/* gen-golden.cjs — capture the GOLDEN outputs of the CURRENT (sync,
 * state/records-based) Reports + Customers data layers on the real 2,612-row
 * seed, BEFORE they are rewritten to async SQL. The later diff-harness re-runs
 * the SAME (layer, fn, inputs) matrix against the REWRITTEN async layers (over
 * Repo + node:sqlite via sqlite-node-adapter.cjs) and asserts every output is
 * byte-identical to what this file recorded. Byte-identity is the ONLY hard
 * requirement of SQLite Phase 2, so this fixture is the contract.
 *
 * IMPORTANT: this script requires the CURRENT modules AS-IS (pure functions over
 * arrays/state). It must be run on the pre-rewrite tree to mint the golden file.
 * Output: greetor/scripts/qa-fixtures/golden-datalayers.json
 *         { "<Layer>.<fn>(<inputsLabel>)": "<canonical-json-or-raw-string>", ... }
 *
 * Run (from repo root OR greetor/):
 *     node greetor/scripts/gen-golden.cjs
 *     node scripts/gen-golden.cjs
 *
 * DETERMINISM (so re-running on any calendar day mints the identical fixture and
 * so the rewrite's harness can pin the same clock):
 *   - Date is FROZEN to FIXED_NOW for the whole run. The current layers call
 *     new Date() lazily inside functions (todayStr / monthStart / addDays /
 *     daysBetween / setStage / convertToSale), so freezing before any call is
 *     sufficient and total. FIXED_NOW is the seed's newest visit day at noon UTC
 *     — chosen so 'today'/'month' ranges and lastVisitAgoDays match a real demo
 *     "now" (the seed was generated with today === its max visitDate).
 *   - 'all' range is treated as the UNFILTERED record set (the spec's
 *     "no filter, all records in DB"); resolveRange has no 'all' key, so we must
 *     NOT route it through filterByRange (which would fall back to 'today').
 *   - Mutating cases (setStage / convertToSale) run on a DEEP CLONE of the seed
 *     so cases never contaminate each other and the original seed is provably
 *     untouched; we record the resulting record state, the touched recordId, and
 *     a proof that exactly one record changed.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

// node:sqlite scripts run with `global.window = global` so the dual-export
// modules (which do `window.X = ...`) populate globals we can read back.
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
var SCRIPTS_DIR = path.join(WWW, "..", "scripts");
var OUT_DIR = path.join(SCRIPTS_DIR, "qa-fixtures");
var OUT_FILE = path.join(OUT_DIR, "golden-datalayers.json");

// ── FREEZE the clock BEFORE loading any layer (they read new Date() lazily) ──
// FIXED_NOW = seed's max visitDate at 12:00:00.000Z. Local-time fields the code
// derives (todayStr/monthStart use getFullYear/getMonth/getDate) resolve to the
// same calendar day for any machine timezone west of +12, and the seed's own
// generator used local midnight..20:00 visit times, so noon-UTC keeps 'today'
// stable. If a future seed shifts its max date, update FIXED_NOW to match.
var FIXED_NOW = "2026-06-03T12:00:00.000Z";
(function freezeDate() {
  var RealDate = Date;
  function FrozenDate() {
    if (!(this instanceof FrozenDate)) {
      // Date() called as a function -> string, like the real thing.
      return new RealDate(FIXED_NOW).toString();
    }
    if (arguments.length === 0) return new RealDate(FIXED_NOW);
    // Forward every other constructor form (timestamp, ISO string, y,m,d,...).
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

// ── load CURRENT modules (order matters: Masters before Customers/Reports; ──
// Customers before Reports because Reports.formatINR delegates to Customers). ──
require(path.join(WWW, "masters.js"));     // Customers.pipelineStages -> Masters.globalList
require(path.join(WWW, "customers.js"));
require(path.join(WWW, "reports.js"));
require(path.join(WWW, "seed-data.js"));   // window.DEMO_SEED

var Reports = global.Reports;
var Customers = global.Customers;
var SEED = global.DEMO_SEED;

if (!Reports || !Customers) throw new Error("Reports/Customers did not load — check www module order.");
if (!SEED || !Array.isArray(SEED.records) || SEED.records.length < 2000) {
  throw new Error("seed-data.js did not load a full DEMO_SEED (records=" + (SEED && SEED.records ? SEED.records.length : 0) + ")");
}

// ── canonical, order-PRESERVING JSON. Mirrors qa-sqlite-roundtrip.cjs canon(): ──
// object keys are sorted (so key insertion order can't cause spurious diffs),
// but ARRAY order is preserved verbatim (sort/insertion order IS observable
// output for these layers and must be byte-identical). Strings (CSV) are stored
// raw, NOT canonicalised, so CRLF / quoting / column order are compared exactly.
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canon(x[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(x);
}
// A golden value is either a raw string (CSV outputs) or canon(value) (objects/
// arrays). We tag which, so the harness compares the right way and humans can
// read CSV goldens directly.
function rawOf(value) {
  return (typeof value === "string") ? value : canon(value);
}
function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
// Golden stores the SHA-256 of the canonical output, NOT the output itself: the
// fixture stays tiny + reviewable while byte-identity is enforced exactly (one
// changed byte changes the hash). The exact seed is snapshotted next to it so
// the harness/CI is deterministic without re-running gen-seed (calendar-anchored).
function goldenOf(value) { return sha256(rawOf(value)); }

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── reports caller pattern: filter state.records by range, THEN run the fn. ──
// 'all' == unfiltered (spec). Everything else goes through the REAL pure helper
// filterByRange exactly as the app's report screen does today.
function recordsForRange(rangeKey, customStart, customEnd) {
  if (rangeKey === "all") return SEED.records;
  return Reports.filterByRange(SEED.records, rangeKey, customStart, customEnd);
}

var golden = {};
function put(key, value) {
  if (Object.prototype.hasOwnProperty.call(golden, key)) {
    throw new Error("duplicate golden key: " + key);
  }
  golden[key] = goldenOf(value);
}

// ── pick deterministic recordIds / mobiles from the seed for the cases that ──
// need a concrete target. Deterministic = first match in seed order, so the ──
// harness can recompute the SAME targets without hard-coding ids. ──
function firstRecordWhere(pred) {
  for (var i = 0; i < SEED.records.length; i++) { if (pred(SEED.records[i])) return SEED.records[i]; }
  return null;
}
function mobileWithVisitCount(exact, atLeast) {
  var by = {};
  SEED.records.forEach(function (r) {
    if (typeof r.mobile === "string" && /^[6-9]\d{9}$/.test(r.mobile)) {
      (by[r.mobile] = by[r.mobile] || []).push(r);
    }
  });
  var keys = Object.keys(by);
  for (var i = 0; i < keys.length; i++) {
    var n = by[keys[i]].length;
    if (exact != null && n === exact) return keys[i];
    if (atLeast != null && n >= atLeast) return keys[i];
  }
  return null;
}

// =====================================================================
// Reports.summary — one golden per range key (today, 7d, 30d, month,
// custom 3-month, all). filterByRange THEN summary; 'all' unfiltered.
// =====================================================================
[
  ["today", "today", undefined, undefined],
  ["7d", "7d", undefined, undefined],
  ["30d", "30d", undefined, undefined],
  ["month", "month", undefined, undefined],
  ["custom 2026-01-01..2026-03-31", "custom", "2026-01-01", "2026-03-31"],
  ["all", "all", undefined, undefined]
].forEach(function (c) {
  var label = c[0], rk = c[1], cs = c[2], ce = c[3];
  put("Reports.summary(" + label + ")", Reports.summary(recordsForRange(rk, cs, ce)));
});

// =====================================================================
// Reports.breakdown — (range, field) pairs. filterByRange THEN breakdown.
// =====================================================================
[
  ["today", "greetor"],
  ["7d", "reason"],
  ["month", "category"],
  ["month", "budget"],
  ["month", "leadStatus"]
].forEach(function (c) {
  var rk = c[0], field = c[1];
  put("Reports.breakdown(" + rk + ", " + field + ")", Reports.breakdown(recordsForRange(rk), field));
});

// =====================================================================
// Reports.visitsCSV — raw 28-column CSV string (CRLF). Stored verbatim.
// =====================================================================
["today", "7d", "month"].forEach(function (rk) {
  put("Reports.visitsCSV(" + rk + ")", Reports.visitsCSV(recordsForRange(rk)));
});

// =====================================================================
// Reports.dailySummaryCSV — raw 7-column CSV string (CRLF). month only.
// =====================================================================
put("Reports.dailySummaryCSV(month)", Reports.dailySummaryCSV(recordsForRange("month")));

// =====================================================================
// Customers.list — opts variants. Current sig: list(state, opts).
// =====================================================================
[
  ["{}", {}],
  ["{sort:visits}", { sort: "visits" }],
  ["{sort:name}", { sort: "name" }],
  ["{sort:value}", { sort: "value" }],
  ["{sort:recent}", { sort: "recent" }],
  ["{search:97}", { search: "97" }],
  ["{search:Aditya}", { search: "Aditya" }]
].forEach(function (c) {
  var label = c[0], opts = c[1];
  put("Customers.list(" + label + ")", Customers.list(SEED, opts));
});

// =====================================================================
// Customers.byMobile — 1-visit, 3+visit (repeat), invalid, valid-not-in-db.
// Record the resolved mobile alongside so the harness targets the same one.
// =====================================================================
var mob1 = mobileWithVisitCount(1, null);
var mob3 = mobileWithVisitCount(null, 3);
put("Customers.byMobile(single-visit mobile=" + mob1 + ")", Customers.byMobile(SEED, mob1));
put("Customers.byMobile(repeat mobile=" + mob3 + ")", Customers.byMobile(SEED, mob3));
put("Customers.byMobile(invalid=123)", Customers.byMobile(SEED, "123"));
put("Customers.byMobile(valid-not-in-db=9999999999)", Customers.byMobile(SEED, "9999999999"));

// =====================================================================
// Customers.stats — whole DB.
// =====================================================================
put("Customers.stats()", Customers.stats(SEED));

// =====================================================================
// Customers.pipeline — whole DB, stages from Masters leadStatuses.
// =====================================================================
put("Customers.pipeline()", Customers.pipeline(SEED));

// (pipelineStages itself is part of pipeline; capture it too for the harness.)
put("Customers.pipelineStages()", Customers.pipelineStages(SEED));

// =====================================================================
// Customers.setStage — MUTATING. Run each on a fresh deep clone so cases are
// independent and the seed is provably untouched. Capture the changed record
// (canon) + a one-record-changed proof. Clock is frozen, so updatedAt /
// convertedAt stamps are deterministic (FIXED_NOW).
// =====================================================================
function captureMutation(keyLabel, recordId, mutateFn) {
  var clone = deepClone(SEED);
  // locate the same record inside the clone by id
  var before = null, idx = -1;
  for (var i = 0; i < clone.records.length; i++) {
    if (clone.records[i].recordId === recordId) { before = deepClone(clone.records[i]); idx = i; break; }
  }
  mutateFn(clone, recordId);
  var after = (idx >= 0) ? clone.records[idx] : null;
  // prove exactly one record differs from the original seed
  var changed = 0;
  for (var j = 0; j < clone.records.length; j++) {
    if (canon(clone.records[j]) !== canon(SEED.records[j])) changed++;
  }
  put(keyLabel, {
    recordId: recordId,
    before: before,
    after: after,
    recordsChanged: changed
  });
}

// stage='Hot' on a non-Converted record (no convertedAt stamp expected)
var recForHot = firstRecordWhere(function (r) { return r.leadStatus !== "Converted"; });
captureMutation(
  "Customers.setStage(recordId=" + (recForHot && recForHot.recordId) + ", stage=Hot)",
  recForHot && recForHot.recordId,
  function (state, id) { Customers.setStage(state, id, "Hot"); }
);

// stage='Converted' on a record with NO convertedAt -> convertedAt must stamp.
// (rowToRecord omits convertedAt when absent, so "no convertedAt key" is the
// real pre-state for most non-converted rows.)
var recForConv = firstRecordWhere(function (r) {
  return r.leadStatus !== "Converted" && (r.convertedAt == null || r.convertedAt === "");
});
captureMutation(
  "Customers.setStage(recordId=" + (recForConv && recForConv.recordId) + ", stage=Converted)",
  recForConv && recForConv.recordId,
  function (state, id) { Customers.setStage(state, id, "Converted"); }
);

// stage='Closed' on a non-Closed record
var recForClosed = firstRecordWhere(function (r) { return r.leadStatus !== "Closed"; });
captureMutation(
  "Customers.setStage(recordId=" + (recForClosed && recForClosed.recordId) + ", stage=Closed)",
  recForClosed && recForClosed.recordId,
  function (state, id) { Customers.setStage(state, id, "Closed"); }
);

// =====================================================================
// Customers.convertToSale — MUTATING. saleValue numeric, string-coerced, and 0.
// Always stamps leadStatus='Converted', convertedAt, updatedAt (frozen clock).
// Use distinct seed records so the goldens are independent and meaningful.
// =====================================================================
var convTargets = [];
for (var ci = 0; ci < SEED.records.length && convTargets.length < 3; ci++) {
  if (SEED.records[ci].leadStatus !== "Converted") convTargets.push(SEED.records[ci].recordId);
}
captureMutation(
  "Customers.convertToSale(recordId=" + convTargets[0] + ", saleValue=25000)",
  convTargets[0],
  function (state, id) { Customers.convertToSale(state, id, 25000); }
);
captureMutation(
  "Customers.convertToSale(recordId=" + convTargets[1] + ", saleValue='50000')",
  convTargets[1],
  function (state, id) { Customers.convertToSale(state, id, "50000"); }
);
captureMutation(
  "Customers.convertToSale(recordId=" + convTargets[2] + ", saleValue=0)",
  convTargets[2],
  function (state, id) { Customers.convertToSale(state, id, 0); }
);

// ── write fixture (stable key order for a clean, reviewable diff) ──
var ordered = {};
Object.keys(golden).sort().forEach(function (k) { ordered[k] = golden[k]; });

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(ordered, null, 2) + "\n");
// Snapshot the EXACT seed the golden was minted from, so the diff-harness (and
// CI) is deterministic regardless of gen-seed's calendar-day anchoring.
fs.writeFileSync(path.join(OUT_DIR, "seed-snapshot.json"), JSON.stringify(SEED));

console.log("golden-datalayers.json written: " + OUT_FILE);
console.log("  keys: " + Object.keys(ordered).length);
console.log("  FIXED_NOW (frozen clock): " + FIXED_NOW);
console.log("  seed: records=" + SEED.records.length +
  " validMobiles(1-visit)=" + mob1 + " (repeat)=" + mob3);
Object.keys(ordered).forEach(function (k) {
  var v = ordered[k];
  console.log("  - " + k + "  [" + v.length + " chars]");
});
