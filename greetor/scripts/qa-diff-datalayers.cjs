/* qa-diff-datalayers.cjs — the BYTE-IDENTITY GATE for the SQLite migration.
 *
 * Proves the REWRITTEN async, DB-backed data layers (reports.js + customers.js
 * from Phase 2, and comms.js + targets.js + footfall.js + masters.js + dpdp.js
 * from Phase 2b — all talking ONLY through window.Repo) produce output
 * byte-identical to the PRE-rewrite pure-over-state layers, on the real 2,612-row
 * seed. The golden contract was minted by scripts/gen-golden.cjs into
 * scripts/qa-fixtures/golden-datalayers.json; this harness re-runs the SAME
 * (layer, fn, inputs) matrix against the rewritten layers over a real
 * node:sqlite database (via scripts/sqlite-node-adapter.cjs injected into Repo)
 * and asserts sha256(canon(new)) === golden[key] for EVERY key. Byte-identity is
 * the ONLY hard requirement, so green here == the rewrite is safe.
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
 *  1. CLOCK. setStage/convertToSale/logMessage/footfall.set stamp
 *     new Date().toISOString(), and date-window helpers compute from "today".
 *     The golden was minted with the clock FROZEN to FIXED_NOW; we freeze to the
 *     SAME value BEFORE loading any layer (they read new Date() lazily inside
 *     functions), so every stamp / window / cutoff is identical.
 *  2. CANON + HASH. Same order-PRESERVING canonical JSON as gen-golden.cjs:
 *     object keys sorted (insertion order can't cause spurious diffs) but ARRAY
 *     order kept verbatim (sort order IS observable output). CSV strings compared
 *     RAW. Golden stores sha256(canonical); we hash the same way and compare.
 *  3. 'all' RANGE. The spec's 'all' == the UNFILTERED record set. resolveRange
 *     has no 'all' key (Reports.summary('all') would fall back to 'today'), so —
 *     exactly like the generator's recordsForRange('all') — we run the PURE
 *     transform (Reports.summaryPure) over Repo.records.all() directly.
 *  4. MUTATIONS. Each golden's mutating case ran on a fresh deep clone of the
 *     seed in the generator; here every mutation case rebuilds a FRESH database
 *     so no case can contaminate another and the seed is provably untouched.
 *  5. DPDP retention lives in localStorage (client-side), not the DB. We install
 *     the SAME in-memory stub the generator used and drive retentionMonths per
 *     case, so cutoff math is identical.
 *  6. VOLATILE IDS. Comms.logMessage generates a uid() (random) on both sides;
 *     the id is stripped from the captured/compared entry (every other field is
 *     deterministic). Seed-derived random ids (templates/masters) are handled by
 *     comparing template SHAPE for ensureSeeded, and by reading the SAME committed
 *     seed masters from meta for the masters captures.
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

// ── in-memory localStorage stub — byte-identical to gen-golden.cjs. DPDP reads ──
// retention prefs from here (client-side), not the DB. We drive retentionMonths ──
// per pruneOldRecords case below. ──
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

// ── 1. load db-schema, repo, the REWRITTEN layers, the adapter + seed ────────
// Order matters: db-schema before repo; masters before customers (pipelineStages
// -> Masters.globalList); customers before reports (Reports.formatINR delegates
// to Customers.formatINR); comms after customers (endOfDaySummary delegates to
// Customers.formatINR). The rewritten layers reach the DB lazily via Repo, so
// requiring them here (no DB yet) is safe — nothing queries until we await.
require(path.join(WWW, "db-schema.js"));   // window.DBSchema
require(path.join(WWW, "repo.js"));        // window.Repo
require(path.join(WWW, "masters.js"));     // window.Masters (async, DB-backed)
require(path.join(WWW, "customers.js"));   // window.Customers (async, DB-backed)
require(path.join(WWW, "reports.js"));     // window.Reports   (async, DB-backed)
require(path.join(WWW, "comms.js"));       // window.Comms     (async, DB-backed)
require(path.join(WWW, "targets.js"));     // window.Targets   (async, DB-backed)
require(path.join(WWW, "footfall.js"));    // window.Footfall  (async, DB-backed)
require(path.join(WWW, "dpdp.js"));        // window.DPDP      (async, DB-backed)
var makeAdapter = require(ADAPTER_PATH);   // node:sqlite -> GreetorDB contract

var DBSchema = global.DBSchema;
var Repo = global.Repo;
var Reports = global.Reports;
var Customers = global.Customers;
var Comms = global.Comms;
var Targets = global.Targets;
var Footfall = global.Footfall;
var Masters = global.Masters;
var DPDP = global.DPDP;
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
// same: CSV results compared raw, structured results compared via canon(). We
// return the RAW canonical string from each runner (so failures can preview it).
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
if (!Comms || !Targets || !Footfall || !Masters || !DPDP) {
  console.log("FATAL: a Phase-2b layer failed to load (Comms/Targets/Footfall/Masters/DPDP).");
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

// ── normalisers mirroring gen-golden.cjs ─────────────────────────────────────
// Drop the volatile uid()-generated id from a comms-log entry (both sides random).
function normLogEntry(e) {
  if (!e || typeof e !== "object") return e;
  var out = {};
  Object.keys(e).forEach(function (k) { if (k !== "id") out[k] = e[k]; });
  return out;
}
// Template SHAPE (id-stripped) — ensureSeeded compares the set, not random ids.
function tmplShape(t) {
  return { name: t.name, scope: t.scope, store: t.store != null ? t.store : "", reason: t.reason != null ? t.reason : "", text: t.text, active: !!t.active };
}

// ── the assertion plan, key-driven so every fixture key is exercised ─────────
// Each runner returns the harness's golden string for its key (raw CSV or
// canon(value)). Async because the rewritten layers are async.

// READ-ONLY families share ONE seeded DB (no writes mutate it). Returns null if
// the key is not a read key (so the dispatcher can try the mutation runner).
async function runReadKey(key) {
  var label = labelOf(key);

  // ── Reports ──
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

  // ── Customers (reads) ──
  if (key.indexOf("Customers.list(") === 0) {
    var opts = {};
    var inner = label.slice(1, -1); // strip { }
    if (inner) {
      var kv = inner.split(":");
      opts[kv[0]] = kv.slice(1).join(":"); // value may contain ':' — preserve
    }
    return goldenOf(await Customers.list(opts));
  }
  if (key.indexOf("Customers.byMobile(") === 0) {
    var eq = label.indexOf("=");
    var mobile = label.slice(eq + 1);
    return goldenOf(await Customers.byMobile(mobile));
  }
  if (key === "Customers.stats()") return goldenOf(await Customers.stats());
  if (key === "Customers.pipeline()") return goldenOf(await Customers.pipeline());
  if (key === "Customers.pipelineStages()") return goldenOf(await Customers.pipelineStages());

  // ── Comms (reads) ──
  if (key.indexOf("Comms.ensureSeeded(") === 0) {
    // ensureSeeded is idempotent; the snapshot DB is already seeded, so calling
    // it is a no-op. Read back the templates (id-stripped shape) and capture the
    // same {count, templates} the generator did.
    await Comms.ensureSeeded();
    var tmpls = (await Repo.commsTemplates.all()).map(tmplShape);
    return goldenOf({ count: tmpls.length, templates: tmpls });
  }
  if (key.indexOf("Comms.applicableTemplates(") === 0) {
    // label: "reason=<r>, store=<s>"
    var parts = label.split(", ");
    var reason = parts[0].slice("reason=".length);
    var store = parts[1].slice("store=".length);
    var out = (await Comms.applicableTemplates({ store: store, reason: reason })).map(tmplShape);
    return goldenOf(out);
  }
  if (key.indexOf("Comms.fillTemplate(") === 0) {
    // label: "text=<the literal template text>" (only one fillTemplate golden;
    // its inputs are fixed, so reconstruct them directly rather than parsing).
    return goldenOf(Comms.fillTemplate("Hello {name}, visit {store} for {category}",
      { customerName: "Rajesh", store: "Titan World", category: "Smart Watches" }));
  }
  if (key.indexOf("Comms.log(recordId=") === 0) {
    var rid = label.slice("recordId=".length);
    return goldenOf((await Comms.log({ recordId: rid })).map(normLogEntry));
  }
  if (key.indexOf("Comms.log(auth GREETOR id=") === 0) {
    var gid = label.slice("auth GREETOR id=".length);
    return goldenOf((await Comms.log({ auth: { role: "GREETOR", id: gid } })).map(normLogEntry));
  }
  if (key.indexOf("Comms.endOfDaySummary(") === 0) {
    // labels: "date=<d>, MANAGER" | "date=<d>, GREETOR, userId=<u>"
    var segs = label.split(", ");
    var dateStr = segs[0].slice("date=".length);
    var role = segs[1];
    var userId = null;
    if (segs[2] && segs[2].indexOf("userId=") === 0) userId = segs[2].slice("userId=".length);
    return goldenOf(await Comms.endOfDaySummary(dateStr, role, userId));
  }

  // ── Targets (reads) ──
  if (key === "Targets.ensureSeeded()") {
    // idempotent on the already-seeded snapshot; read back the targets object.
    await Targets.ensureSeeded();
    return goldenOf(await Targets.get());
  }
  if (key.indexOf("Targets.recordsInPeriod(") === 0) {
    return goldenOf(await Targets.recordsInPeriod(label)); // label == period
  }
  if (key.indexOf("Targets.attainment(") === 0) {
    // labels: "daily, store" | "daily, userId=<u>"
    var ap = label.split(", ");
    var aperiod = ap[0];
    var auserId = null;
    if (ap[1] && ap[1].indexOf("userId=") === 0) auserId = ap[1].slice("userId=".length);
    return goldenOf(await Targets.attainment(aperiod, auserId));
  }
  if (key.indexOf("Targets.leaderboard(") === 0) {
    return goldenOf(await Targets.leaderboard(label)); // label == period
  }

  // ── Footfall (reads) ──
  if (key.indexOf("Footfall.totalForRange(") === 0 && label.indexOf(", all") !== -1) {
    // all-stores read over the seed: "2026-05-28, 2026-06-03, all"
    var fp = label.split(", ");
    return goldenOf(await Footfall.totalForRange(fp[0], fp[1], null));
  }
  if (key.indexOf("Footfall.trueConversionPct(") === 0) {
    var tp = label.split(", ").map(Number);
    return goldenOf(Footfall.trueConversionPct(tp[0], tp[1], tp[2]));
  }
  if (key.indexOf("Footfall.captureCoverage(") === 0) {
    var cp = label.split(", ").map(Number);
    return goldenOf(Footfall.captureCoverage(cp[0], cp[1]));
  }

  // ── Masters (reads) ──
  if (key === "Masters.ensureSeeded()") {
    // idempotent on the already-seeded snapshot; read back the masters object.
    await Masters.ensureSeeded();
    return goldenOf(await Repo.masters.get());
  }
  if (key.indexOf("Masters.storeNames(") === 0) {
    var inc = label === "true";
    return goldenOf(await Masters.storeNames(inc));
  }
  if (key.indexOf("Masters.globalList(") === 0) {
    // labels: "leadStatuses, false" | "budgets"
    var gp = label.split(", ");
    var gtype = gp[0];
    var ginc = gp[1] === "true";
    return goldenOf(await Masters.globalList(gtype, ginc));
  }
  if (key === "Masters.reasonsTop()") return goldenOf(await Masters.reasonsTop());
  if (key === "Masters.reasonsAll()") return goldenOf(await Masters.reasonsAll());
  if (key.indexOf("Masters.categories(") === 0) {
    // label: "<store>, <bool>"
    var lastComma = label.lastIndexOf(", ");
    var cstore = label.slice(0, lastComma);
    var cinc = label.slice(lastComma + 2) === "true";
    return goldenOf(await Masters.categories(cstore, cinc));
  }
  if (key.indexOf("Masters.subCategories(") === 0) {
    // label: "<store>, <category>"
    var sc = label.split(", ");
    return goldenOf(await Masters.subCategories(sc[0], sc[1]));
  }
  if (key.indexOf("Masters.brands(") === 0) {
    return goldenOf(await Masters.brands(label)); // label == store
  }
  if (key.indexOf("Masters.defaultBrand(") === 0) {
    return goldenOf(await Masters.defaultBrand(label)); // label == store
  }

  // ── DPDP (pure reads) ──
  if (key.indexOf("DPDP.maskMobile(") === 0) {
    return goldenOf(DPDP.maskMobile(label));
  }

  return null; // not a read key
}

// ── MUTATION families: each on a FRESH seeded DB, reproducing the generator's
// captured value via the NEW API (write through the layer, re-read through Repo).
function isMutationKey(key) {
  return key.indexOf("Customers.setStage(") === 0 ||
         key.indexOf("Customers.convertToSale(") === 0 ||
         key.indexOf("Comms.logMessage(") === 0 ||
         key.indexOf("Targets.setStoreTarget(") === 0 ||
         key.indexOf("Footfall.set(") === 0 ||
         key.indexOf("Footfall.get(") === 0 ||
         (key.indexOf("Footfall.totalForRange(") === 0 && labelOf(key).indexOf(", all") === -1) ||
         key.indexOf("DPDP.pruneOldRecords(") === 0;
}

// ── Customers mutation (setStage / convertToSale): label
// "recordId=<id>, stage=<stage>" or "recordId=<id>, saleValue=<v>"
function parseCustomersMutationLabel(label) {
  var parts = label.split(", ");
  var recordId = parts[0].slice("recordId=".length);
  var argTok = parts[1];                          // "stage=Hot" | "saleValue=25000" | "saleValue='50000'"
  var argEq = argTok.indexOf("=");
  var argName = argTok.slice(0, argEq);           // "stage" | "saleValue"
  var argRaw = argTok.slice(argEq + 1);           // "Hot" | "25000" | "'50000'" | "0"
  return { recordId: recordId, argName: argName, argRaw: argRaw };
}

async function runCustomersMutation(key) {
  var m = parseCustomersMutationLabel(labelOf(key));
  freshRepoDb();
  var beforeAll = await Repo.records.all();
  var before = await Repo.records.byId(m.recordId);
  if (m.argName === "stage") {
    await Customers.setStage(m.recordId, m.argRaw);
  } else { // saleValue: NUMBER unless quoted in the label (string-coercion case)
    var quoted = m.argRaw.length >= 2 && m.argRaw[0] === "'" && m.argRaw[m.argRaw.length - 1] === "'";
    var saleValue = quoted ? m.argRaw.slice(1, -1) : Number(m.argRaw);
    await Customers.convertToSale(m.recordId, saleValue);
  }
  var after = await Repo.records.byId(m.recordId);
  var afterAll = await Repo.records.all();
  var changed = 0;
  for (var i = 0; i < afterAll.length; i++) {
    if (canon(afterAll[i]) !== canon(beforeAll[i])) changed++;
  }
  return goldenOf({ recordId: m.recordId, before: before, after: after, recordsChanged: changed });
}

// ── Comms.logMessage mutation: fresh DB, insert the fixed entry, capture the
// returned (id-stripped) entry + comms_log row count before/after.
async function runCommsLogMessage() {
  freshRepoDb();
  var before = (await Repo.commsLog.all()).length;
  var entry = {
    byUserId: "u1", byName: "Greetor1", channel: "WhatsApp", recordId: "r1",
    mobile: "9876543210", customerName: "Rajesh", templateId: "t1",
    templateName: "Thank you", text: "Hello Rajesh"
  };
  var ret = await Comms.logMessage(entry);
  var after = (await Repo.commsLog.all()).length;
  return goldenOf({ returned: normLogEntry(ret), countBefore: before, countAfter: after });
}

// ── Targets.setStoreTarget mutation: fresh DB, set, read back targets object.
// label: "<period>, <metric>, <value>"
async function runTargetsSetStore(key) {
  var p = labelOf(key).split(", ");
  var period = p[0], metric = p[1], value = Number(p[2]);
  freshRepoDb();
  await Targets.setStoreTarget(period, metric, value);
  return goldenOf(await Targets.get());
}

// ── Footfall.set / get / totalForRange(store) mutations: fresh DB, set the
// fixed (Titan World, today, 150) row, then read back via the requested fn. The
// generator captured each on its own clone after the SAME set, so these are
// self-contained and don't depend on the seed having that footfall row.
var FF_STORE = "Titan World";
var FF_DATE = "2026-06-03";
var FF_COUNT = 150;
var FF_USER = { id: "u1", name: "Greetor1" };
async function runFootfallSet() {
  freshRepoDb();
  await Footfall.set(FF_STORE, FF_DATE, FF_COUNT, FF_USER);
  return goldenOf(await Footfall.get(FF_STORE, FF_DATE));
}
async function runFootfallGet() {
  freshRepoDb();
  await Footfall.set(FF_STORE, FF_DATE, FF_COUNT, FF_USER);
  return goldenOf(await Footfall.get(FF_STORE, FF_DATE));
}
async function runFootfallTotalStore(key) {
  // label: "<start>, <end>, <store>"
  var p = labelOf(key).split(", ");
  freshRepoDb();
  await Footfall.set(FF_STORE, FF_DATE, FF_COUNT, FF_USER);
  return goldenOf(await Footfall.totalForRange(p[0], p[1], p[2]));
}

// ── DPDP.pruneOldRecords mutation: fresh DB, drive retentionMonths via the
// localStorage stub (parsed from the label), run prune, capture {purged, kept,
// cutoff}. label: "retention=<n>".
async function runDpdpPrune(key) {
  var months = Number(labelOf(key).slice("retention=".length)) || 0;
  DPDP.setPrefs({ retentionMonths: months });
  freshRepoDb();
  var res = await DPDP.pruneOldRecords();
  return goldenOf(res);
}

async function runMutationKey(key) {
  if (key.indexOf("Customers.setStage(") === 0 ||
      key.indexOf("Customers.convertToSale(") === 0) return runCustomersMutation(key);
  if (key.indexOf("Comms.logMessage(") === 0) return runCommsLogMessage();
  if (key.indexOf("Targets.setStoreTarget(") === 0) return runTargetsSetStore(key);
  if (key.indexOf("Footfall.set(") === 0) return runFootfallSet();
  if (key.indexOf("Footfall.get(") === 0) return runFootfallGet();
  if (key.indexOf("Footfall.totalForRange(") === 0) return runFootfallTotalStore(key);
  if (key.indexOf("DPDP.pruneOldRecords(") === 0) return runDpdpPrune(key);
  return null;
}

// ── main ──────────────────────────────────────────────────────────
(async function main() {
  console.log("# SQLite migration — DATA-LAYER BYTE-IDENTITY GATE (Phase 2 + 2b)");
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
  console.log("# READ-ONLY (Reports/Customers/Comms/Targets/Footfall/Masters/DPDP) — shared seeded DB");
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
  console.log("\n# MUTATIONS (setStage/convertToSale/logMessage/setStoreTarget/footfall.set+get/totalForRange(store)/pruneOldRecords) — fresh seeded DB per case");
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
    if (mactual === null) {
      FAIL++; FAILS.push(mkey);
      console.log("  FAIL  " + mkey + "  (no runner matched this mutation key — fixture/harness drift)");
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
    console.log("\nALL GREEN — the rewritten async/DB-backed data layers (Reports + Customers + " +
      "Comms + Targets + Footfall + Masters + DPDP) are byte-identical to the pre-rewrite " +
      "layers on the real seed. Phase 2 + 2b gate PASSED.");
  }
})().catch(function (e) {
  // Never let an unexpected rejection produce a false green.
  console.log("\nFATAL (unhandled): " + (e && e.stack || e));
  process.exit(1);
});
