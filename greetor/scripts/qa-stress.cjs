/* Stress + code test over the generated 6-month dataset.
   Runs every data-layer function at scale, asserts correctness, times the
   heavy ones, checks blob size, and render-smokes every UI module (OWNER +
   GREETOR) with light DOM shims. Run: node greetor/scripts/qa-stress.cjs */
"use strict";
const path = require("path");
global.window = global;
const WWW = path.join(__dirname, "..", "www");

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(c, m) { if (c) PASS++; else { FAIL++; FAILS.push(m); console.log("  ✗ " + m); } }
function timed(label, fn) { const t = Date.now(); const r = fn(); const ms = Date.now() - t; console.log("  ⏱ " + label + ": " + ms + "ms"); return { r, ms }; }

// ---- data layers ----
require(path.join(WWW, "masters.js"));
require(path.join(WWW, "customers.js"));
require(path.join(WWW, "reports.js"));
require(path.join(WWW, "comms.js"));
require(path.join(WWW, "targets.js"));
require(path.join(WWW, "footfall.js"));
require(path.join(WWW, "charts.js"));
require(path.join(WWW, "dpdp.js"));
const { Masters, Customers, Reports, Comms, Targets, Footfall, Charts, DPDP } = global;

// ---- the generated seed ----
require(path.join(WWW, "seed-data.js"));
const seed = global.DEMO_SEED;
ok(!!seed && Array.isArray(seed.records) && seed.records.length > 2000, "seed loaded with 2000+ records (" + (seed.records ? seed.records.length : 0) + ")");

function clone() { return JSON.parse(JSON.stringify(seed)); }

console.log("\n# MASTERS (consistency with generated records)");
const st = clone();
ok(Masters.storeNames(st).length === 3, "3 stores");
// every record's store/category/brand is a valid active master value
let badRef = 0;
st.records.forEach(r => {
  if (Masters.storeNames(st).indexOf(r.store) === -1) badRef++;
  else if (r.category && Masters.categories(st, r.store).indexOf(r.category) === -1) badRef++;
  else if (r.brand && Masters.brands(st, r.store).indexOf(r.brand) === -1) badRef++;
});
ok(badRef === 0, "all records reference valid masters store/category/brand (bad=" + badRef + ")");

console.log("\n# CUSTOMERS @scale");
const cs = clone();
const listT = timed("Customers.list(2600)", () => Customers.list(cs, {}));
const list = listT.r;
ok(list.length > 0, "customer list non-empty (" + list.length + " unique)");
ok(listT.ms < 500, "list under 500ms");
const repeat = list.filter(c => c.visitCount > 1);
ok(repeat.length > 0, "has repeat customers (" + repeat.length + ")");
const stats = Customers.stats(cs);
ok(stats.totalRecords === cs.records.length, "stats.totalRecords matches");
ok(stats.converted === cs.records.filter(r => r.leadStatus === "Converted").length, "stats.converted matches");
ok(stats.totalSaleValue > 0, "stats.totalSaleValue > 0 (" + Customers.formatINR(stats.totalSaleValue) + ")");
// byMobile on a known repeat customer
const someMobile = repeat[0].mobile;
const cust = Customers.byMobile(cs, someMobile);
ok(cust && cust.visits.length === repeat[0].visitCount, "byMobile visit history complete");
// pipeline
const pipe = Customers.pipeline(cs);
const pipeTotal = pipe.reduce((s, p) => s + p.count, 0);
ok(pipeTotal === cs.records.length, "pipeline buckets cover all records (" + pipeTotal + ")");
// search + sorts don't throw
["recent", "visits", "value", "name"].forEach(s => ok(Customers.list(cs, { sort: s }).length === list.length, "sort " + s + " ok"));
ok(Customers.list(cs, { search: someMobile.slice(0, 5) }).length >= 1, "search by mobile prefix finds someone");
ok(Customers.formatINR(1234567) === "₹12,34,567", "formatINR lakh grouping");

console.log("\n# REPORTS @scale");
const rs = clone();
["today", "7d", "30d", "month", "custom"].forEach(rg => {
  const f = Reports.filterByRange(rs.records, rg, "2000-01-01", "2100-01-01");
  ok(Array.isArray(f), "range " + rg + " returns array (" + f.length + ")");
});
const r30 = Reports.filterByRange(rs.records, "30d");
ok(r30.length <= rs.records.length && r30.length > 0, "30d subset non-empty (" + r30.length + ")");
const sum = Reports.summary(rs.records);
ok(sum.walkins === rs.records.length, "summary.walkins == record count");
ok(sum.uniqueCustomers > 0, "summary.uniqueCustomers > 0 (" + sum.uniqueCustomers + ")");
["reason", "store", "greetor", "category", "brand", "leadStatus", "source"].forEach(fld => {
  const b = Reports.breakdown(rs.records, fld);
  ok(b.length > 0 && b[0].count >= (b[1] ? b[1].count : 0), "breakdown " + fld + " sorted desc (" + b.length + " keys)");
});
const csvT = timed("visitsCSV(2600)", () => Reports.visitsCSV(rs.records));
const csv = csvT.r;
const lines = csv.split("\n");
ok(lines.length === rs.records.length + 1, "visitsCSV has header + 1 row/record (" + lines.length + ")");
ok(lines[0].split(",").length === 28, "visitsCSV 28 columns");
ok(csvT.ms < 1000, "visitsCSV under 1s");
// CSV safety: a value with comma/quote must be quoted+escaped
const inj = clone(); inj.records = [{ recordId: "x", visitDate: "2026-01-01", visitTime: "10:00", store: "Titan World", createdByName: 'A,"B', mobile: "9876543210", customerName: 'q"q', reason: "x", leadStatus: "Open" }];
const icsv = Reports.visitsCSV(inj.records);
ok(icsv.indexOf('"A,""B"') !== -1, "CSV quotes+escapes comma & quote");
const dcsv = Reports.dailySummaryCSV(rs.records);
ok(dcsv.split("\n").length > 30, "dailySummaryCSV one row/day (" + dcsv.split("\n").length + ")");

console.log("\n# COMMS @scale");
const ms = clone();
const rWithMobile = ms.records.find(r => /^[6-9]\d{9}$/.test(r.mobile));
ok(Comms.applicableTemplates(ms, rWithMobile).length > 0, "applicableTemplates non-empty");
ok(Comms.fillTemplate("Hi {name} at {store}", rWithMobile).indexOf("{") === -1, "fillTemplate substitutes");
const ownerAuth = { id: seed.users[0].id, role: "OWNER" };
const greetorAuth = { id: seed.users[2].id, role: "GREETOR" };
const allLog = Comms.log(ms, { auth: ownerAuth });
const grLog = Comms.log(ms, { auth: greetorAuth });
ok(allLog.length >= grLog.length, "owner sees >= greetor in message log (DPDP scope: " + allLog.length + " vs " + grLog.length + ")");
ok(grLog.every(e => e.byUserId === greetorAuth.id), "greetor log is own-only");
ok(typeof Comms.endOfDaySummary(ms, ms.records[0].visitDate, "OWNER", null) === "string", "EOD summary builds");

console.log("\n# TARGETS + FOOTFALL @scale");
const ts = clone();
["daily", "weekly", "monthly"].forEach(p => {
  const a = Targets.attainment(ts, p, ts.records, null);
  ok(a && a.walkins && typeof a.walkins.actual === "number", "attainment " + p + " ok (" + a.walkins.actual + "/" + a.walkins.target + ")");
});
const lb = Targets.leaderboard(ts, Targets.recordsInPeriod(ts.records, "monthly"), "monthly");
// primary sort key is conversions (then walkins, then saleValue)
ok(lb.length > 0 && lb[0].conversions >= (lb[1] ? lb[1].conversions : 0), "leaderboard ranked by conversions (" + lb.length + " greetors)");
const ff = clone();
const today = new Date().toISOString().slice(0, 10);
const ffTotal = Footfall.totalForRange(ff, "2000-01-01", "2100-01-01");
ok(ffTotal > 0, "footfall total > 0 (" + ffTotal + ")");
const capturedAll = ff.records.length;
ok(Footfall.trueConversionPct(capturedAll, 280, ffTotal) >= 0, "trueConversionPct computes");
const cov = Footfall.captureCoverage(capturedAll, ffTotal);
ok(cov === null || (cov >= 0 && cov <= 100), "captureCoverage in range (" + cov + "%)");

console.log("\n# DPDP retention (on a copy)");
const dp = clone();
global.localStorage = { _d: {}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };
global.localStorage.setItem("saagar_greetor_dpdp", JSON.stringify({ retentionMonths: 3, lastPurgeAt: null }));
const before = dp.records.length;
const res = DPDP.pruneOldRecords(dp);
ok(res.purged > 0 && dp.records.length === before - res.purged, "retention(3mo) purges old records (" + res.purged + " of " + before + ")");
ok(DPDP.maskMobile("9876543210") !== "9876543210" && DPDP.maskMobile("9876543210").length > 0, "maskMobile masks");

console.log("\n# UI RENDER SMOKE @scale (OWNER + GREETOR)");
// light DOM + host shims
global.escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
global.toast = () => {}; global.render = () => {}; global.openModal = () => {}; global.closeModal = () => {};
global.$ = () => null;
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute(){}, appendChild(){}, click(){}, remove(){} }), body: { appendChild(){}, removeChild(){} } };
global.canSafe = () => true; global.can = () => true;
let CUR = { id: seed.users[0].id, name: seed.users[0].name, role: "OWNER" };
global.AuthSession = { current: () => CUR };
let SMOKE_STATE = clone();
global.Store = { load: () => SMOKE_STATE, save: s => { SMOKE_STATE = s; } };
global.reportRange = "30d"; global.reportCustomStart = ""; global.reportCustomEnd = "";
global.leadsView = "pipeline"; global.leadsCustomerMobile = ""; global._custSearch = ""; global._custSort = "recent";
global.commsView = "log"; global.mastersView = "home"; global.pipelineCollapsed = {};

require(path.join(WWW, "reports-ui.js"));
require(path.join(WWW, "customers-ui.js"));
require(path.join(WWW, "pipeline-ui.js"));
require(path.join(WWW, "comms-ui.js"));
require(path.join(WWW, "masters-ui.js"));

function smoke(label, fn) {
  try { const html = fn(); ok(typeof html === "string" && html.length > 50, label + " renders (" + (html ? html.length : 0) + " chars)"); }
  catch (e) { ok(false, label + " THREW: " + e.message); }
}
["OWNER", "GREETOR"].forEach(role => {
  CUR = role === "OWNER" ? { id: seed.users[0].id, name: seed.users[0].name, role: "OWNER" }
                         : { id: seed.users[2].id, name: seed.users[2].name, role: "GREETOR" };
  SMOKE_STATE = clone();
  const rt = timed(role + " ReportsUI.render", () => global.ReportsUI.render(SMOKE_STATE));
  ok(rt.ms < 1500, role + " reports render under 1.5s");
  smoke(role + " ReportsUI", () => rt.r);
  global.leadsView = "pipeline";
  smoke(role + " PipelineUI", () => global.PipelineUI.render(SMOKE_STATE));
  global.leadsCustomerMobile = "";
  smoke(role + " CustomersUI.list", () => global.CustomersUI.render(SMOKE_STATE));
  // customer detail for a real repeat mobile
  global.leadsCustomerMobile = repeat[0].mobile;
  smoke(role + " CustomersUI.detail", () => global.CustomersUI.render(SMOKE_STATE));
  global.leadsCustomerMobile = "";
  smoke(role + " CommsUI.renderLog", () => global.CommsUI.renderLog(SMOKE_STATE));
  smoke(role + " CommsUI.renderTemplates", () => global.CommsUI.renderTemplates(SMOKE_STATE));
  smoke(role + " MastersUI", () => global.MastersUI.render(SMOKE_STATE));
});

console.log("\n========== RESULT ==========");
console.log("PASS=" + PASS + "  FAIL=" + FAIL);
if (FAIL) { console.log("\nFAILURES:"); FAILS.forEach(f => console.log(" - " + f)); process.exit(1); }
else console.log("ALL GREEN");
