/* Generate ~6 months of schema-accurate dummy data for Saagar Greetor.
   Builds the seed THROUGH the app's own data layers so it can never drift
   from the real schema. Emits greetor/www/seed-data.js (window.DEMO_SEED).
   Run: node greetor/scripts/gen-seed.cjs
   NOT shipped logic — only its output (seed-data.js) ships. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---- window shim so the IIFE modules attach to a global we can read ----
global.window = global;
const WWW = path.join(__dirname, "..", "www");
require(path.join(WWW, "masters.js"));
require(path.join(WWW, "comms.js"));
require(path.join(WWW, "targets.js"));
require(path.join(WWW, "footfall.js"));
const { Masters, Comms, Targets, Footfall } = global;

// ---- deterministic PRNG (reproducible seed) ----
let _s = 1234567;
function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function int(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
function chance(p) { return rnd() < p; }
function weighted(pairs) { // [[val,w],...]
  let t = 0; for (const p of pairs) t += p[1];
  let r = rnd() * t;
  for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; }
  return pairs[0][0];
}

// ---- date helpers ----
function iso(d) { return d.toISOString(); }
function ymd(d) { return d.toISOString().slice(0, 10); }
function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

// ---- PBKDF2 PIN hash matching the app's WebCrypto exactly ----
function randomSalt() { return crypto.randomBytes(16).toString("hex"); }
function hashPin(pin, salt) { return crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256").toString("hex"); }
function mkUser(name, role, pin) {
  const salt = randomSalt();
  return { id: "u" + crypto.randomBytes(5).toString("hex"), name, role,
    pin_salt: salt, pin_hash: hashPin(pin, salt),
    created_at: new Date().toISOString(), is_active: true };
}

// ---- build base state via the real data layers ----
const state = { users: [], current_user_id: null, my_store: "Titan World",
  records: [], reminder_enabled: true, auditLog: [] };
Masters.ensureSeeded(state);
Comms.ensureSeeded(state);
Targets.ensureSeeded(state);
Footfall.ensureSeeded(state);

// Users (real working PINs)
const owner   = mkUser("Sagar Bora", "OWNER", "1234");
const manager = mkUser("Priya Kale", "MANAGER", "2345");
const g1 = mkUser("Anu Patil",  "GREETOR", "3456");
const g2 = mkUser("Ravi More",   "GREETOR", "4567");
const g3 = mkUser("Sneha Joshi", "GREETOR", "5678");
state.users = [owner, manager, g1, g2, g3];
const greetors = [g1, g2, g3, manager]; // manager also captures sometimes

// valid masters values to draw from
const stores = Masters.storeNames(state);                    // 3 stores
const sources = Masters.globalList(state, "sources");
const custTypes = Masters.globalList(state, "customerTypes");
const forWhoms = Masters.globalList(state, "forWhoms");
const occasions = Masters.globalList(state, "occasions");
const budgets = Masters.globalList(state, "budgets");
const timelines = Masters.globalList(state, "timelines");
const reasonsTop = Masters.reasonsTop(state);
const reasonsAll = Masters.reasonsAll(state);
const TEMPLATES = Comms.rawTemplates(state);

// name pools
const FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan",
  "Priya","Ananya","Diya","Aadhya","Saanvi","Riya","Anika","Sneha","Pooja","Neha",
  "Suresh","Mahesh","Rakesh","Ganesh","Ramesh","Sunita","Kavita","Lata","Manisha","Vaishali"];
const LAST = ["Patil","Kulkarni","Joshi","Deshmukh","Pawar","Shinde","More","Jadhav","Bora","Kale",
  "Naik","Gupta","Sharma","Agarwal","Rao","Reddy","Shah","Mehta","Iyer","Nair"];
function fullName() { return pick(FIRST) + " " + pick(LAST); }

// customer mobile pool (some reused → repeat customers)
const mobilePool = [];
for (let i = 0; i < 700; i++) {
  mobilePool.push(String(int(6, 9)) + String(int(100000000, 999999999)));
}

// budget band → rough sale value range (INR)
const SALE_BY_BUDGET = {
  "Not discussed": [3000, 25000], "Below ₹5k": [1500, 5000], "₹5k-10k": [5000, 10000],
  "₹10k-25k": [10000, 25000], "₹25k-50k": [25000, 50000], "₹50k-1L": [50000, 100000],
  "₹1L-2.5L": [100000, 250000], "₹2.5L-5L": [250000, 500000], "Above ₹5L": [500000, 1200000],
};

function uid() { return "NP-" + crypto.randomBytes(6).toString("hex").toUpperCase(); }

// festival spike days (random ~6 across the window)
const FEST = new Set();

const today = new Date(); today.setHours(0, 0, 0, 0);
const DAYS = 182;
let recCount = 0, convCount = 0, withMobile = 0, repeats = 0, quickCount = 0;
const seenMobiles = {};

// choose festival days
for (let f = 0; f < 6; f++) FEST.add(int(2, DAYS - 2));

for (let dOff = DAYS; dOff >= 0; dOff--) {
  const day = new Date(today); day.setDate(day.getDate() - dOff);
  const dow = day.getDay(); // 0 Sun .. 6 Sat
  let base;
  if (dow === 0) base = int(14, 20);
  else if (dow === 6) base = int(16, 24);
  else if (dow === 5) base = int(12, 16);
  else base = int(8, 14);
  if (FEST.has(dOff)) base = Math.round(base * 2.5);

  // per-store footfall estimate (Manager EOD) — higher than captured
  const dayStoreCaptured = {};

  for (let n = 0; n < base; n++) {
    const store = weighted([["Titan World", 5], ["Helios", 3], ["Tanishq Jewellery", 2]]);
    const cats = Masters.categories(state, store);
    const category = pick(cats);
    const subs = Masters.subCategories(state, store, category);
    const subCategory = subs.length ? pick(subs) : "";
    const brand = pick(Masters.brands(state, store));
    const g = weighted([[g1, 4], [g2, 3], [g3, 3], [manager, 1]]);

    const visit = new Date(day);
    visit.setHours(int(10, 20), int(0, 59), int(0, 59), 0);

    const isQuick = chance(0.10);
    const hasMobile = isQuick ? false : chance(0.78);
    let mobile = "";
    if (hasMobile) {
      // ~30% reuse → repeat customer
      mobile = chance(0.30) ? pick(mobilePool.slice(0, 350)) : pick(mobilePool);
      withMobile++;
      if (seenMobiles[mobile]) repeats++; seenMobiles[mobile] = true;
    }
    const customerName = (!isQuick && chance(0.7)) ? fullName() : "";
    const budget = isQuick ? "Not discussed" : pick(budgets);
    const reason = chance(0.7) ? pick(reasonsTop) : pick(reasonsAll);
    const status = isQuick ? "Open" : weighted([
      ["Open", 38], ["Hot", 12], ["Warm", 15], ["Cold", 13], ["Converted", 13], ["Closed", 9]]);
    const followUp = (!isQuick && (status === "Hot" || status === "Warm" || chance(0.25))
      && status !== "Converted" && status !== "Closed") ? "Yes" : "No";

    const rec = {
      recordId: uid(),
      createdAt: iso(visit), updatedAt: iso(visit),
      createdByUserId: g.id, createdByName: g.name,
      store, visitDate: ymd(visit), visitTime: hhmm(visit),
      source: isQuick ? "Walk-in" : pick(sources),
      mobile, customerName,
      customerType: isQuick ? "Walk-by" : pick(custTypes),
      category, subCategory, brand,
      gender: isQuick ? "" : pick(forWhoms),
      occasion: isQuick ? "" : pick(occasions),
      budget, urgency: isQuick ? "" : pick(timelines),
      greetor: g.name, cro: chance(0.5) ? pick(greetors).name : "",
      reason,
      competitor: chance(0.15) ? pick(["Online", "Local jeweller", "Another Titan store", "Ethos"]) : "",
      remarks: chance(0.2) ? pick(["Wants to check with family", "Will come back weekend", "Budget tight", "Liked the design", "Asked for more options"]) : "",
      followUp,
      leadStatus: status,
      followDate: "", followTime: "",
      photos: [], consent_at: "",
    };
    if (followUp === "Yes") {
      const fd = new Date(visit); fd.setDate(fd.getDate() + int(1, 14));
      rec.followDate = ymd(fd); rec.followTime = pick(["10:00", "11:00", "12:00", "16:00", "17:30"]);
    }
    if (mobile && (followUp === "Yes" || chance(0.5))) rec.consent_at = iso(visit);
    if (status === "Converted") {
      const range = SALE_BY_BUDGET[budget] || [5000, 50000];
      rec.saleValue = int(range[0], range[1]);
      rec.convertedAt = iso(visit);
      convCount++;
    }
    if (isQuick) { rec.quick = true; quickCount++; }

    state.records.push(rec);
    recCount++;
    dayStoreCaptured[store] = (dayStoreCaptured[store] || 0) + 1;

    // audit create entry
    state.auditLog.push({
      id: "a" + crypto.randomBytes(5).toString("hex"),
      at: iso(visit), userId: g.id, userName: g.name, role: g.role,
      action: "create",
      summary: "Created entry — " + (customerName || mobile || "walk-in") + " · " + store + " · " + reason,
      detail: { recordId: rec.recordId },
    });
    if (status === "Converted") {
      state.auditLog.push({
        id: "a" + crypto.randomBytes(5).toString("hex"),
        at: iso(visit), userId: g.id, userName: g.name, role: g.role,
        action: "convert", summary: "Converted — " + (customerName || mobile) + " · ₹" + rec.saleValue,
        detail: { recordId: rec.recordId, saleValue: rec.saleValue },
      });
    }

    // some sent messages (comms log) for hot/converted with mobile
    if (mobile && (status === "Hot" || status === "Converted") && chance(0.4)) {
      const tpl = pick(TEMPLATES);
      Comms.logMessage(state, {
        byUserId: g.id, byName: g.name,
        channel: chance(0.85) ? "whatsapp" : "sms",
        recordId: rec.recordId, mobile, customerName: customerName || "",
        templateId: tpl ? tpl.id : "", templateName: tpl ? tpl.name : "",
        text: tpl ? Comms.fillTemplate(tpl.text, rec) : "Thank you for visiting.",
        timestamp: iso(visit),
      });
    }
  }

  // footfall estimate per store/day (higher than captured → coverage < 100%)
  for (const st of stores) {
    const cap = dayStoreCaptured[st] || 0;
    if (cap > 0 || chance(0.3)) {
      const est = Math.max(cap, Math.round(cap * (1.5 + rnd() * 1.5)) + int(2, 8));
      Footfall.set(state, st, ymd(day), est, { id: manager.id, name: manager.name });
    }
  }
}

// newest-first to match app convention (records.unshift)
state.records.reverse();
state.auditLog.reverse();
if (state.auditLog.length > 5000) state.auditLog.length = 5000;

// store targets
Targets.setStoreTarget(state, "daily", "walkins", 18);
Targets.setStoreTarget(state, "daily", "conversions", 3);
Targets.setStoreTarget(state, "weekly", "walkins", 110);
Targets.setStoreTarget(state, "weekly", "conversions", 18);
Targets.setStoreTarget(state, "monthly", "walkins", 480);
Targets.setStoreTarget(state, "monthly", "conversions", 80);

// ---- emit seed-data.js ----
const banner = "// AUTO-GENERATED demo data (~6 months) for testing. Do NOT hand-edit.\n"
  + "// Loaded on a fresh install only (see boot() in index.html). Erase via Settings → Erase all data.\n"
  + "// Demo logins — Owner Sagar Bora PIN 1234 · Manager Priya Kale 2345 · Greetors Anu 3456 / Ravi 4567 / Sneha 5678\n";
const out = banner + "window.DEMO_SEED = " + JSON.stringify(state) + ";\n";
fs.writeFileSync(path.join(WWW, "seed-data.js"), out);

const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
console.log("seed-data.js written.");
console.log("records=" + recCount + " conversions=" + convCount + " withMobile=" + withMobile
  + " repeats=" + repeats + " quick=" + quickCount);
console.log("auditLog=" + state.auditLog.length + " commsLog=" + state.commsLog.length
  + " footfall=" + Object.keys(state.footfall.entries).length);
console.log("state blob = " + (bytes / 1024 / 1024).toFixed(2) + " MB  (localStorage ~5MB cap)");
