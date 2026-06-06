/* gen-seed-1yr.cjs — generate 1 YEAR of demo data (40 walk-ins/day × 365 ≈ 14,600
 * records) for Saagar Greetor. Standalone (does NOT load the app's async modules,
 * which is why the old gen-seed.cjs broke). Reuses the exact users (PINs) + master
 * lists from scripts/seed-base.json so demo logins keep working:
 *   Owner 1234 · Manager 2345 · Greetors 3456/4567/5678
 * Emits greetor/www/seed-data.js  ->  window.DEMO_SEED (whole-state object that
 * DBSchema.disassemble understands; loaded directly into SQLite at first boot).
 * Run: node greetor/scripts/gen-seed-1yr.cjs */
"use strict";
const fs = require("fs");
const path = require("path");

const SCRIPTS = __dirname;
const base = JSON.parse(fs.readFileSync(path.join(SCRIPTS, "seed-base.json"), "utf8"));
const users = base.users;
const masters = base.masters;
const templates = base.commsTemplates || [];
const MY_STORE = base.my_store || "Titan World";

// ── deterministic RNG (mulberry32 — good distribution, reproducible) ──
let _s = 20260606 >>> 0;
function rnd() {
  _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// monotonic counters → IDs are GUARANTEED unique (no birthday collisions)
let _rid = 0, _aid = 0, _cid = 0;
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function int(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
function chance(p) { return rnd() < p; }
function weighted(pairs) { let t = 0; for (const p of pairs) t += p[1]; let r = rnd() * t; for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; } return pairs[0][0]; }
function pad(n) { return String(n).padStart(2, "0"); }
function hex(n) { let s = ""; for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(rnd() * 16)]; return s; }

const nm = (arr) => (arr || []).filter((x) => x && x.active !== false).map((x) => x.name).filter(Boolean);
const storeNames   = nm(masters.stores);
const reasonsAll   = nm(masters.reasons);
const reasonsTop   = nm((masters.reasons || []).filter((r) => r.top)) ;
const leadStatuses = nm(masters.leadStatuses);
const customerTypes= nm(masters.customerTypes);
const sources      = nm(masters.sources);
const occasions    = nm(masters.occasions);
const budgets      = nm(masters.budgets);
const forWhoms     = nm(masters.forWhoms);
const timelines    = nm(masters.timelines);

// who captures (greetors + manager); owner rarely captures
const capturers = users.filter((u) => u.role === "GREETOR" || u.role === "MANAGER");
const storeWeights = storeNames.map((s) => s === MY_STORE ? [s, 5] : (/helios/i.test(s) ? [s, 3] : [s, 2]));

function catFor(store) {
  const cat = masters.catalogs && masters.catalogs[store];
  if (!cat || !cat.categories || !cat.categories.length) return { category: "General", subCategory: "", brand: "Not Brand Specific" };
  const cats = cat.categories.filter((x) => x.active !== false);
  const c = pick(cats);
  const subs = (c.subs || []).filter((x) => x.active !== false);
  const sub = subs.length ? pick(subs) : null;
  return { category: c.name, subCategory: sub ? sub.name : "", brand: cat.defaultBrand || "Not Brand Specific" };
}

function saleFor(budget) {
  const map = { "Below ₹5k": [2000, 5000], "₹5k-10k": [5000, 10000], "₹10k-25k": [10000, 25000], "₹25k-50k": [25000, 50000], "₹50k-1L": [50000, 100000], "₹1L-2.5L": [100000, 250000], "₹2.5L-5L": [250000, 500000], "Above ₹5L": [500000, 900000] };
  const r = map[budget] || [8000, 40000];
  return int(r[0], r[1]);
}

// customer pool — uniform draws create natural repeats (~unique < total)
const FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan","Priya","Ananya","Diya","Aadhya","Saanvi","Riya","Anika","Sneha","Pooja","Neha","Suresh","Mahesh","Rakesh","Ganesh","Ramesh","Sunita","Kavita","Lata","Manisha","Vaishali","Amit","Sachin","Nikhil","Pranav","Omkar","Snehal","Madhuri","Jyoti","Swati","Prerna"];
const LAST = ["Patil","Kulkarni","Joshi","Deshmukh","Pawar","Shinde","More","Jadhav","Bora","Kale","Rao","Gaikwad","Salunke","Chavan","Bhosale","Mane","Sawant","Naik","Kadam","Mali"];
const POOL = 9000;
const customers = [];
for (let i = 0; i < POOL; i++) customers.push({ mobile: "9" + String(int(100000000, 999999999)), name: pick(FIRST) + " " + pick(LAST) });

const END = new Date("2026-06-06T00:00:00.000Z");
const DAYS = 365, PER_DAY = 40, AUDIT_WINDOW_DAYS = 90;

const records = [], auditLog = [], commsLog = [], footfallEntries = {};

for (let d = DAYS - 1; d >= 0; d--) {
  const day = new Date(END.getTime() - d * 86400000);
  const ymd = day.toISOString().slice(0, 10);
  const dayCaptures = {};
  for (let n = 0; n < PER_DAY; n++) {
    const store = weighted(storeWeights);
    dayCaptures[store] = (dayCaptures[store] || 0) + 1;
    const g = pick(capturers);
    const cb = catFor(store);
    const cust = customers[int(0, POOL - 1)];
    const budget = pick(budgets);
    const ls = weighted([["Open", 26], ["Hot", 14], ["Warm", 16], ["Cold", 10], ["Converted", 22], ["Closed", 12]]);
    const converted = ls === "Converted";
    const hh = int(10, 20), mm = int(0, 59);
    const visitTime = pad(hh) + ":" + pad(mm);
    const createdAt = ymd + "T" + pad(hh) + ":" + pad(mm) + ":00.000Z";
    const rid = "NP-" + (_rid++).toString(16).toUpperCase().padStart(7, "0") + hex(5);
    const rec = {
      recordId: rid, createdAt: createdAt, updatedAt: createdAt,
      createdByUserId: g.id, createdByName: g.name,
      store: store, visitDate: ymd, visitTime: visitTime,
      source: pick(sources), mobile: cust.mobile, customerName: cust.name,
      customerType: pick(customerTypes), category: cb.category, subCategory: cb.subCategory, brand: cb.brand,
      gender: pick(forWhoms), occasion: pick(occasions), budget: budget,
      urgency: pick(timelines), greetor: g.name,
      reason: chance(0.72) && reasonsTop.length ? pick(reasonsTop) : pick(reasonsAll),
      followUp: chance(0.5) ? "Yes" : "No",
      leadStatus: ls, photos: [], consent_at: chance(0.92) ? createdAt : "",
      saleValue: converted ? saleFor(budget) : 0
    };
    if (rec.followUp === "Yes" && !converted) {
      rec.followDate = new Date(day.getTime() + int(1, 14) * 86400000).toISOString().slice(0, 10);
      rec.followTime = pad(int(10, 18)) + ":00";
    }
    if (converted) rec.convertedAt = ymd + "T" + pad(int(hh, 21)) + ":" + pad(mm) + ":00.000Z";
    records.push(rec);

    if (d < AUDIT_WINDOW_DAYS) {
      auditLog.push({ id: "a" + (_aid++).toString(16) + hex(6), at: createdAt, userId: g.id, userName: g.name, role: g.role, action: "create", summary: "Created entry — " + cust.mobile + " · " + store + " · " + rec.reason, detail: { recordId: rid } });
      if (converted && chance(0.85)) auditLog.push({ id: "a" + (_aid++).toString(16) + hex(6), at: rec.convertedAt, userId: g.id, userName: g.name, role: g.role, action: "convert", summary: "Converted — ₹" + rec.saleValue, detail: { recordId: rid } });
    }
    if (chance(0.06) && templates.length) {
      const tpl = pick(templates);
      commsLog.push({ id: "c" + (_cid++).toString(16) + hex(6), at: createdAt, byUserId: g.id, byName: g.name, channel: chance(0.8) ? "whatsapp" : "sms", recordId: rid, mobile: cust.mobile, customerName: cust.name, templateId: tpl.id, templateName: tpl.name, text: String(tpl.text || "").replace(/\{\{?\s*name\s*\}?\}/gi, cust.name).slice(0, 300), timestamp: createdAt });
    }
  }
  for (const store of storeNames) {
    const cap = dayCaptures[store] || 0;
    const count = cap > 0 ? Math.round(cap * (1.6 + rnd() * 1.4)) + int(0, 6) : int(0, 8);
    footfallEntries[store + "|" + ymd] = { store: store, date: ymd, count: count, byUserId: users[1] ? users[1].id : users[0].id, byName: users[1] ? users[1].name : users[0].name, at: END.toISOString() };
  }
}

const tg = { store: { daily: { walkins: 30, conversions: 8 }, weekly: { walkins: 200, conversions: 50 }, monthly: { walkins: 850, conversions: 200 } }, greetor: {} };
for (const g of capturers) tg.greetor[g.id] = { daily: { walkins: 12, conversions: 3 }, weekly: { walkins: 80, conversions: 20 }, monthly: { walkins: 340, conversions: 85 } };

const state = {
  users: users, current_user_id: null, my_store: MY_STORE,
  records: records, reminder_enabled: true, auditLog: auditLog,
  masters: masters, commsLog: commsLog, commsTemplates: templates,
  targets: tg, footfall: { entries: footfallEntries }
};

const out = "// AUTO-GENERATED demo data — 40 walk-ins/day x 365 days. Do NOT hand-edit.\n" +
  "// Demo logins — Owner 1234 / Manager 2345 / Greetors 3456,4567,5678\n" +
  "window.DEMO_SEED = " + JSON.stringify(state) + ";\n";
fs.writeFileSync(path.join(__dirname, "..", "www", "seed-data.js"), out);
const mb = (out.length / 1048576).toFixed(2);
console.log("WROTE www/seed-data.js  records=" + records.length + " audit=" + auditLog.length + " comms=" + commsLog.length + " footfall=" + Object.keys(footfallEntries).length + " size=" + mb + "MB");
