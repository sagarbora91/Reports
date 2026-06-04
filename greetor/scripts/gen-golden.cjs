/* gen-golden.cjs — capture the GOLDEN outputs of the CURRENT (sync,
 * state/records-based) data layers on the real 2,612-row seed, BEFORE they are
 * rewritten to async SQL. The later diff-harness re-runs the SAME (layer, fn,
 * inputs) matrix against the REWRITTEN async layers (over Repo + node:sqlite via
 * sqlite-node-adapter.cjs) and asserts every output is byte-identical to what
 * this file recorded. Byte-identity is the ONLY hard requirement of the SQLite
 * migration, so this fixture is the contract.
 *
 * Phase 2  captured Reports + Customers.
 * Phase 2b ADDS the remaining 5 layers: Comms, Targets, Footfall, Masters, DPDP
 *          (the existing Reports/Customers captures below are kept verbatim).
 *
 * IMPORTANT: this script requires the CURRENT modules AS-IS (pure functions over
 * arrays/state). The orchestrator runs it with ALL layers temporarily restored
 * to their sync form, so every captured fn here is the sync/state version.
 * Output: greetor/scripts/qa-fixtures/golden-datalayers.json
 *         { "<Layer>.<fn>(<inputsLabel>)": "<sha256-of-canonical-or-raw>", ... }
 *
 * Run (from repo root OR greetor/):
 *     node greetor/scripts/gen-golden.cjs
 *     node scripts/gen-golden.cjs
 *
 * DETERMINISM (so re-running on any calendar day mints the identical fixture and
 * so the rewrite's harness can pin the same clock):
 *   - Date is FROZEN to FIXED_NOW for the whole run. The current layers call
 *     new Date() lazily inside functions (todayStr / monthStart / addDays /
 *     daysBetween / setStage / convertToSale / logMessage / footfall.set /
 *     cutoffDate), so freezing before any call is sufficient and total. FIXED_NOW
 *     is the seed's newest visit day at noon UTC — chosen so 'today'/'month'
 *     ranges and lastVisitAgoDays match a real demo "now".
 *   - 'all' range is treated as the UNFILTERED record set (the spec's
 *     "no filter, all records in DB"); resolveRange has no 'all' key, so we must
 *     NOT route it through filterByRange (which would fall back to 'today').
 *   - Mutating cases (setStage / convertToSale / Comms.logMessage / Footfall.set
 *     / DPDP.pruneOldRecords) run on a DEEP CLONE of the seed so cases never
 *     contaminate each other and the original seed is provably untouched.
 *   - DPDP reads retention prefs from localStorage (client-side, NOT the DB). We
 *     install a tiny in-memory localStorage stub and set the retention before
 *     each pruneOldRecords case; the diff-harness installs the SAME stub.
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

// ── in-memory localStorage stub (DPDP retention prefs live client-side) ──────
// dpdp.js reads/writes localStorage; Node has none. The diff-harness installs an
// identical stub, so DPDP.getRetentionMonths()/setPrefs round-trip the same way
// on both sides. We drive retentionMonths explicitly per pruneOldRecords case.
(function installLocalStorage() {
  if (typeof global.localStorage !== "undefined" && global.localStorage) return;
  var mem = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
})();

// ── load CURRENT modules (order matters: Masters before Customers/Reports; ──
// Customers before Reports because Reports.formatINR delegates to Customers). ──
require(path.join(WWW, "masters.js"));     // Customers.pipelineStages -> Masters.globalList
require(path.join(WWW, "customers.js"));
require(path.join(WWW, "reports.js"));
require(path.join(WWW, "comms.js"));       // window.Comms
require(path.join(WWW, "targets.js"));     // window.Targets
require(path.join(WWW, "footfall.js"));    // window.Footfall
require(path.join(WWW, "dpdp.js"));        // window.DPDP
require(path.join(WWW, "seed-data.js"));   // window.DEMO_SEED

var Reports = global.Reports;
var Customers = global.Customers;
var Comms = global.Comms;
var Targets = global.Targets;
var Footfall = global.Footfall;
var Masters = global.Masters;
var DPDP = global.DPDP;
var SEED = global.DEMO_SEED;

if (!Reports || !Customers) throw new Error("Reports/Customers did not load — check www module order.");
if (!Comms || !Targets || !Footfall || !Masters || !DPDP) {
  throw new Error("A Phase-2b layer did not load (Comms/Targets/Footfall/Masters/DPDP).");
}
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

// #####################################################################
// ##  PHASE 2b — Comms / Targets / Footfall / Masters / DPDP         ##
// ##  All captured from the CURRENT sync (state-based) layers.        ##
// #####################################################################

// ── deterministic Phase-2b targets picked from the seed (so the harness can ──
// recompute the same ones from the key label). ──
var PERIOD_DAILY = "daily";
// a userId that has records on the seed's 'today' (FIXED_NOW date)
var TODAY_STR = "2026-06-03";
function firstTodayUserId() {
  for (var i = 0; i < SEED.records.length; i++) {
    var r = SEED.records[i];
    if (r && r.visitDate === TODAY_STR && r.createdByUserId != null && r.createdByUserId !== "") {
      return String(r.createdByUserId);
    }
  }
  return "";
}
var TODAY_USER = firstTodayUserId();
// a recordId that has comms_log entries (for Comms.log(recordId=...))
function firstRecordIdWithLog() {
  var log = Array.isArray(SEED.commsLog) ? SEED.commsLog : [];
  for (var i = 0; i < log.length; i++) {
    if (log[i] && log[i].recordId != null && log[i].recordId !== "") return String(log[i].recordId);
  }
  return "";
}
var LOG_RECORD_ID = firstRecordIdWithLog();
// a byUserId that appears in comms_log (for Comms.log GREETOR role-scope)
function firstLogUserId() {
  var log = Array.isArray(SEED.commsLog) ? SEED.commsLog : [];
  for (var i = 0; i < log.length; i++) {
    if (log[i] && log[i].byUserId != null && log[i].byUserId !== "") return String(log[i].byUserId);
  }
  return "";
}
var LOG_USER_ID = firstLogUserId();
// a (store,date) footfall pair that EXISTS in the seed (for Footfall.get read)
function firstFootfallEntry() {
  var ff = (SEED.footfall && SEED.footfall.entries) || {};
  var keys = Object.keys(ff);
  return keys.length ? ff[keys[0]] : null;
}
var FF_SEED = firstFootfallEntry();

// drop the volatile, uid()-generated id so logMessage is reproducible (both the
// old sync layer and the rewrite generate a RANDOM id; every OTHER field —
// at(frozen), channel, recordId, … — is deterministic and IS compared).
function normLogEntry(e) {
  if (!e || typeof e !== "object") return e;
  var out = {};
  Object.keys(e).forEach(function (k) { if (k !== "id") out[k] = e[k]; });
  return out;
}

// ── Comms.ensureSeeded — read-back the templates AFTER ensureSeeded. On the ──
// already-seeded snapshot this is a no-op; we capture the resulting template ──
// set (names+scopes+active, id-stripped) so the harness asserts the SAME set ──
// over Repo.commsTemplates.all(). (Seed ids are random; compare by shape.) ──
function tmplShape(t) {
  return { name: t.name, scope: t.scope, store: t.store != null ? t.store : "", reason: t.reason != null ? t.reason : "", text: t.text, active: !!t.active };
}
(function commsEnsureSeeded() {
  var clone = deepClone(SEED);
  Comms.ensureSeeded(clone);
  var tmpls = (clone.commsTemplates || []).map(tmplShape);
  put("Comms.ensureSeeded()", { count: tmpls.length, templates: tmpls });
})();

// ── Comms.applicableTemplates — two records (one matching a reason template, ──
// one matching none). Pure filter over state.commsTemplates. id-stripped shape. ──
[
  ["reason=Price too high, store=Tanishq Jewellery", { store: "Tanishq Jewellery", reason: "Price too high" }],
  ["reason=, store=Helios", { store: "Helios", reason: "" }]
].forEach(function (c) {
  var label = c[0], rec = c[1];
  var out = Comms.applicableTemplates(SEED, rec).map(tmplShape);
  put("Comms.applicableTemplates(" + label + ")", out);
});

// ── Comms.fillTemplate — pure substitution (no {date} token so it's clock- ──
// independent and fully deterministic). ──
put(
  "Comms.fillTemplate(text=Hello {name}, visit {store} for {category})",
  Comms.fillTemplate("Hello {name}, visit {store} for {category}",
    { customerName: "Rajesh", store: "Titan World", category: "Smart Watches" })
);

// ── Comms.logMessage — MUTATING (unshift into commsLog). Capture the returned ──
// entry (id-stripped) + the resulting log length. Run on a clone. ──
(function commsLogMessage() {
  var clone = deepClone(SEED);
  if (!Array.isArray(clone.commsLog)) clone.commsLog = [];
  var entry = {
    byUserId: "u1", byName: "Greetor1", channel: "WhatsApp", recordId: "r1",
    mobile: "9876543210", customerName: "Rajesh", templateId: "t1",
    templateName: "Thank you", text: "Hello Rajesh"
  };
  var before = clone.commsLog.length;
  var ret = Comms.logMessage(clone, entry);
  put("Comms.logMessage(entry=u1/WhatsApp/r1)", {
    returned: normLogEntry(ret),
    countBefore: before,
    countAfter: clone.commsLog.length
  });
})();

// ── Comms.log — by recordId (read) and by GREETOR role-scope (read). ──
put("Comms.log(recordId=" + LOG_RECORD_ID + ")",
  Comms.log(SEED, { recordId: LOG_RECORD_ID }).map(normLogEntry));
put("Comms.log(auth GREETOR id=" + LOG_USER_ID + ")",
  Comms.log(SEED, { auth: { role: "GREETOR", id: LOG_USER_ID } }).map(normLogEntry));

// ── Comms.endOfDaySummary — full day (MANAGER) + greetor-scoped. Multiline ──
// string; stored raw. formatINR delegates to Customers.formatINR (loaded). ──
put("Comms.endOfDaySummary(date=" + TODAY_STR + ", MANAGER)",
  Comms.endOfDaySummary(SEED, TODAY_STR, "MANAGER", null));
put("Comms.endOfDaySummary(date=" + TODAY_STR + ", GREETOR, userId=" + TODAY_USER + ")",
  Comms.endOfDaySummary(SEED, TODAY_STR, "GREETOR", TODAY_USER));

// ── Targets.ensureSeeded — read-back targets AFTER ensureSeeded (no-op on the ──
// already-seeded snapshot). Capture the resulting targets object. ──
(function targetsEnsureSeeded() {
  var clone = deepClone(SEED);
  Targets.ensureSeeded(clone);
  put("Targets.ensureSeeded()", Targets.get(clone));
})();

// ── Targets.setStoreTarget — MUTATING. Set daily.walkins=50, read back the ──
// whole targets object. Run on a clone. ──
(function targetsSetStore() {
  var clone = deepClone(SEED);
  Targets.setStoreTarget(clone, "daily", "walkins", 50);
  put("Targets.setStoreTarget(daily, walkins, 50)", Targets.get(clone));
})();

// ── Targets.recordsInPeriod — daily + weekly windows (frozen clock). ──
put("Targets.recordsInPeriod(daily)", Targets.recordsInPeriod(SEED.records, "daily"));
put("Targets.recordsInPeriod(weekly)", Targets.recordsInPeriod(SEED.records, "weekly"));

// ── Targets.attainment — store level (userId=null) + greetor level. Uses the ──
// seed's existing targets. ──
put("Targets.attainment(daily, store)", Targets.attainment(SEED, "daily", SEED.records, null));
put("Targets.attainment(daily, userId=" + TODAY_USER + ")",
  Targets.attainment(SEED, "daily", SEED.records, TODAY_USER));

// ── Targets.leaderboard — daily + weekly aggregation (multi-field sort). ──
put("Targets.leaderboard(daily)", Targets.leaderboard(SEED, SEED.records, "daily"));
put("Targets.leaderboard(weekly)", Targets.leaderboard(SEED, SEED.records, "weekly"));

// ── Footfall.set — MUTATING (Titan World, today, 150). Read back the entry. ──
var FF_USER = { id: "u1", name: "Greetor1" };
(function footfallSet() {
  var clone = deepClone(SEED);
  Footfall.set(clone, "Titan World", TODAY_STR, 150, FF_USER);
  put("Footfall.set(Titan World, " + TODAY_STR + ", 150)", Footfall.get(clone, "Titan World", TODAY_STR));
})();

// ── Footfall.get — read back the JUST-SET entry on a clone (self-contained so ──
// it doesn't depend on the seed having a Titan World|today row). ──
(function footfallGet() {
  var clone = deepClone(SEED);
  Footfall.set(clone, "Titan World", TODAY_STR, 150, FF_USER);
  put("Footfall.get(Titan World, " + TODAY_STR + ")", Footfall.get(clone, "Titan World", TODAY_STR));
})();

// ── Footfall.totalForRange — all-stores week (read-only over seed footfall) ──
// and one-store/one-day reflecting the just-set 150 (mutating clone). ──
put("Footfall.totalForRange(2026-05-28, " + TODAY_STR + ", all)",
  Footfall.totalForRange(SEED, "2026-05-28", TODAY_STR, null));
(function footfallTotalStore() {
  var clone = deepClone(SEED);
  Footfall.set(clone, "Titan World", TODAY_STR, 150, FF_USER);
  put("Footfall.totalForRange(" + TODAY_STR + ", " + TODAY_STR + ", Titan World)",
    Footfall.totalForRange(clone, TODAY_STR, TODAY_STR, "Titan World"));
})();

// ── Footfall pure ratio helpers (no DB; fully deterministic). ──
put("Footfall.trueConversionPct(2500, 100, 3000)", Footfall.trueConversionPct(2500, 100, 3000));
put("Footfall.captureCoverage(2500, 3000)", Footfall.captureCoverage(2500, 3000));

// ── Masters.ensureSeeded — read-back masters AFTER ensureSeeded (no-op on the ──
// already-seeded snapshot). Capture the resulting masters object (canon, so ──
// the random uid()s inside are compared verbatim — both sides read the SAME ──
// committed seed masters from meta, so they match). ──
(function mastersEnsureSeeded() {
  var clone = deepClone(SEED);
  Masters.ensureSeeded(clone);
  put("Masters.ensureSeeded()", clone.masters);
})();

// ── Masters read accessors — exact lists from the seed masters. ──
put("Masters.storeNames(false)", Masters.storeNames(SEED, false));
put("Masters.globalList(leadStatuses, false)", Masters.globalList(SEED, "leadStatuses", false));
put("Masters.globalList(budgets)", Masters.globalList(SEED, "budgets", false));
put("Masters.reasonsTop()", Masters.reasonsTop(SEED));
put("Masters.reasonsAll()", Masters.reasonsAll(SEED));
put("Masters.categories(Titan World, false)", Masters.categories(SEED, "Titan World", false));
put("Masters.subCategories(Titan World, Smart Watches)", Masters.subCategories(SEED, "Titan World", "Smart Watches"));
put("Masters.brands(Helios)", Masters.brands(SEED, "Helios"));
put("Masters.defaultBrand(Tanishq Jewellery)", Masters.defaultBrand(SEED, "Tanishq Jewellery"));
put("Masters.defaultBrand(Helios)", Masters.defaultBrand(SEED, "Helios"));

// ── DPDP.pruneOldRecords — MUTATING. retention=6 (cutoff = FIXED_NOW - 6mo) ──
// and retention=0 (disabled). Drive retentionMonths via the localStorage stub. ──
// Capture the {purged, kept, cutoff} return triple. Run on a clone. ──
(function dpdpPrune6() {
  DPDP.setPrefs({ retentionMonths: 6 });
  var clone = deepClone(SEED);
  put("DPDP.pruneOldRecords(retention=6)", DPDP.pruneOldRecords(clone));
})();
(function dpdpPrune0() {
  DPDP.setPrefs({ retentionMonths: 0 });
  var clone = deepClone(SEED);
  put("DPDP.pruneOldRecords(retention=0)", DPDP.pruneOldRecords(clone));
})();

// ── DPDP.maskMobile — pure (valid + invalid). ──
put("DPDP.maskMobile(9876543210)", DPDP.maskMobile("9876543210"));
put("DPDP.maskMobile(invalid)", DPDP.maskMobile("invalid"));

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
console.log("  phase-2b targets: todayUser=" + TODAY_USER + " logRecordId=" + LOG_RECORD_ID +
  " logUserId=" + LOG_USER_ID);
Object.keys(ordered).forEach(function (k) {
  var v = ordered[k];
  console.log("  - " + k + "  [" + v.length + " chars]");
});
