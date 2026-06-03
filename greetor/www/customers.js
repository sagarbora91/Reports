/* customers.js — Saagar Greetor customer/CRM data layer (SQLite Phase 2).
 *
 * REWRITTEN to async, DB-backed. The data layer NEVER touches window.GreetorDB
 * directly — every read/write goes through window.Repo (the single DB access
 * point), so this module runs unchanged in Node by injecting a node:sqlite test
 * adapter via Repo.setDb(). The DB is the source of truth; the old `state`
 * argument is gone.
 *
 * BYTE-IDENTITY is the only hard requirement: every public method reproduces the
 * EXACT observable output of the previous pure-over-`state` implementation on the
 * real 2,612-row seed. The intricate transforms (per-mobile customer building,
 * visit/pipeline sorting) are UNCHANGED pure functions — we just FETCH the rows
 * via Repo (ORDER BY ord ⇒ original app-order, so grouping insertion-order and
 * sort tie-breaks match the old in-memory array) and feed them to the SAME pure
 * code. Pure helpers (formatINR, date math, mobile validation) stay sync.
 *
 * Plain <script> module: sets window.Customers AND module.exports (Node).
 */
(function (root) {
  "use strict";

  var MOBILE_RE = /^[6-9]\d{9}$/;
  var FALLBACK_STAGES = ["Open", "Hot", "Warm", "Cold", "Converted", "Closed"];

  // ── Repo handle (the ONLY DB access point) ──────────────────────────────────
  // Resolved lazily at call time so neither load order nor a post-load
  // Repo.setDb() can break routing (mirrors repo.js's own db() resolution).
  function repo() {
    var r = root.Repo;
    if (!r) {
      throw new Error("Customers: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) before customers.js.");
    }
    return r;
  }

  // ── pure helpers (sync — unchanged) ─────────────────────────────────────────

  function validMobile(m) {
    return typeof m === "string" && MOBILE_RE.test(m);
  }

  function parseDate(str) {
    // Returns a comparable string YYYY-MM-DD or '' for sorting
    return typeof str === "string" ? str.slice(0, 10) : "";
  }

  function daysBetween(dateStr) {
    // dateStr: 'YYYY-MM-DD'; returns integer days to today
    if (!dateStr) return 0;
    var parts = dateStr.split("-");
    if (parts.length < 3) return 0;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = today - d;
    return Math.max(0, Math.round(diff / 86400000));
  }

  function sortedVisits(visits) {
    return visits.slice().sort(function (a, b) {
      var da = parseDate(a.visitDate);
      var db = parseDate(b.visitDate);
      if (db !== da) return db > da ? 1 : -1;
      var ca = a.createdAt || "";
      var cb = b.createdAt || "";
      return cb > ca ? 1 : -1;
    });
  }

  function buildCustomer(mobile, records) {
    var visits = sortedVisits(records);
    var name = "";
    for (var i = 0; i < visits.length; i++) {
      if (visits[i].customerName) { name = visits[i].customerName; break; }
    }
    var dates = records.map(function (r) { return parseDate(r.visitDate); }).filter(Boolean).sort();
    var firstVisitDate = dates[0] || "";
    var lastVisitDate = dates[dates.length - 1] || "";
    var status = visits.length ? (visits[0].leadStatus || "") : "";
    var converted = records.some(function (r) { return r.leadStatus === "Converted"; });
    var totalSaleValue = records.reduce(function (s, r) { return s + (Number(r.saleValue) || 0); }, 0);
    var storeSet = {};
    records.forEach(function (r) { if (r.store) storeSet[r.store] = true; });
    return {
      mobile: mobile,
      name: name,
      visitCount: records.length,
      visits: visits,
      firstVisitDate: firstVisitDate,
      lastVisitDate: lastVisitDate,
      lastVisitAgoDays: daysBetween(lastVisitDate),
      status: status,
      converted: converted,
      totalSaleValue: totalSaleValue,
      stores: Object.keys(storeSet)
    };
  }

  // groupByMobile — UNCHANGED pure transform, now over an explicit records[]
  // array (the rows fetched from Repo) instead of state.records. Insertion order
  // is preserved (rows arrive ORDER BY ord ⇒ original app-order), so the customer
  // list's pre-sort order and every sort's tie-break are byte-identical.
  function groupByMobile(records) {
    var map = {};
    var recs = Array.isArray(records) ? records : [];
    recs.forEach(function (r) {
      if (!validMobile(r.mobile)) return;
      if (!map[r.mobile]) map[r.mobile] = [];
      map[r.mobile].push(r);
    });
    return map;
  }

  function formatINR(n) {
    try {
      var num = Math.round(Number(n) || 0);
      if (!isFinite(num)) num = 0;
      var str = String(Math.abs(num));
      var result = "";
      if (str.length <= 3) {
        result = str;
      } else {
        var last3 = str.slice(-3);
        var rest = str.slice(0, str.length - 3);
        var parts = [];
        while (rest.length > 2) {
          parts.unshift(rest.slice(-2));
          rest = rest.slice(0, rest.length - 2);
        }
        if (rest.length) parts.unshift(rest);
        result = parts.join(",") + "," + last3;
      }
      return "₹" + (num < 0 ? "-" : "") + result;
    } catch (e) {
      return "₹0";
    }
  }

  // ── async, DB-backed API ────────────────────────────────────────────────────

  async function list(opts) {
    try {
      opts = opts || {};
      // FETCH all records (ORDER BY ord) then reuse the EXACT old transform.
      var records = await repo().records.all();
      var map = groupByMobile(records);
      var customers = Object.keys(map).map(function (mob) {
        return buildCustomer(mob, map[mob]);
      });

      var search = (opts.search || "").trim().toLowerCase();
      if (search) {
        customers = customers.filter(function (c) {
          return c.mobile.indexOf(search) !== -1 ||
            c.name.toLowerCase().indexOf(search) !== -1;
        });
      }

      var sort = opts.sort || "recent";
      if (sort === "visits") {
        customers.sort(function (a, b) { return b.visitCount - a.visitCount; });
      } else if (sort === "name") {
        customers.sort(function (a, b) {
          var na = a.name.toLowerCase();
          var nb = b.name.toLowerCase();
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
      } else if (sort === "value") {
        customers.sort(function (a, b) { return b.totalSaleValue - a.totalSaleValue; });
      } else {
        customers.sort(function (a, b) {
          return a.lastVisitDate < b.lastVisitDate ? 1 : a.lastVisitDate > b.lastVisitDate ? -1 : 0;
        });
      }
      return customers;
    } catch (e) {
      return [];
    }
  }

  async function byMobile(mobile) {
    try {
      if (!validMobile(mobile)) return null;
      // Targeted fetch (uses idx_records_mobile, ORDER BY ord).
      var records = await repo().records.byMobile(mobile);
      if (!records || !records.length) return null;
      return buildCustomer(mobile, records);
    } catch (e) {
      return null;
    }
  }

  async function stats() {
    try {
      var records = await repo().records.all();
      var map = groupByMobile(records);
      var mobiles = Object.keys(map);
      var totalCustomers = mobiles.length;
      var repeatCustomers = mobiles.filter(function (m) { return map[m].length > 1; }).length;
      var totalRecords = records.length;
      var converted = records.filter(function (r) { return r.leadStatus === "Converted"; }).length;
      var hotCount = records.filter(function (r) { return r.leadStatus === "Hot"; }).length;
      var totalSaleValue = records.reduce(function (s, r) { return s + (Number(r.saleValue) || 0); }, 0);
      var conversionPct = totalRecords ? Math.round((converted / totalRecords) * 1000) / 10 : 0;
      return {
        totalCustomers: totalCustomers,
        repeatCustomers: repeatCustomers,
        totalRecords: totalRecords,
        converted: converted,
        conversionPct: conversionPct,
        totalSaleValue: totalSaleValue,
        hotCount: hotCount
      };
    } catch (e) {
      return { totalCustomers: 0, repeatCustomers: 0, totalRecords: 0, converted: 0, conversionPct: 0, totalSaleValue: 0, hotCount: 0 };
    }
  }

  async function pipelineStages() {
    try {
      // Masters config lives in the meta KV table (key 'masters', JSON string).
      // Parse it and feed a synthetic { masters } state to Masters.globalList —
      // identical result to the old pipelineStages(state) since the stored JSON
      // is a faithful round-trip of state.masters.
      if (root.Masters && typeof root.Masters.globalList === "function") {
        var raw = await repo().meta.get("masters");
        var masters = null;
        if (raw != null) {
          try { masters = JSON.parse(raw); } catch (e) { masters = null; }
        }
        if (masters != null) {
          var stages = root.Masters.globalList({ masters: masters }, "leadStatuses");
          if (Array.isArray(stages) && stages.length) return stages;
        }
      }
    } catch (e) {}
    return FALLBACK_STAGES.slice();
  }

  async function pipeline() {
    try {
      var stages = await pipelineStages();
      var records = await repo().records.all();
      var stageSet = {};
      stages.forEach(function (s) { stageSet[s] = []; });
      var other = [];

      records.forEach(function (r) {
        var ls = r.leadStatus || "";
        if (stageSet.hasOwnProperty(ls)) {
          stageSet[ls].push(r);
        } else {
          other.push(r);
        }
      });

      function sortRecs(recs) {
        return recs.slice().sort(function (a, b) {
          var da = parseDate(a.visitDate);
          var db = parseDate(b.visitDate);
          return da < db ? 1 : da > db ? -1 : 0;
        });
      }

      var result = stages.map(function (s) {
        return { stage: s, count: stageSet[s].length, records: sortRecs(stageSet[s]) };
      });

      if (other.length) {
        result.push({ stage: "Other", count: other.length, records: sortRecs(other) });
      }
      return result;
    } catch (e) {
      return [];
    }
  }

  async function setStage(recordId, stage) {
    try {
      var rec = await repo().records.byId(recordId);
      if (!rec) return;                       // unknown id → no-op (do not throw)
      var changes = { leadStatus: stage };
      if (stage === "Converted" && !rec.convertedAt) {
        changes.convertedAt = new Date().toISOString();
      }
      changes.updatedAt = new Date().toISOString();
      await repo().records.update(recordId, changes);
    } catch (e) {}
  }

  async function convertToSale(recordId, saleValue) {
    try {
      var rec = await repo().records.byId(recordId);
      if (!rec) return;                       // unknown id → no-op
      var changes = {
        leadStatus: "Converted",
        convertedAt: new Date().toISOString(),
        saleValue: Number(saleValue) || 0,
        updatedAt: new Date().toISOString()
      };
      await repo().records.update(recordId, changes);
    } catch (e) {}
  }

  // ── public API (window.Customers, dual-export) ──────────────────────────────
  var api = {
    // async, DB-backed
    list: list,
    byMobile: byMobile,
    stats: stats,
    pipelineStages: pipelineStages,
    pipeline: pipeline,
    setStage: setStage,
    convertToSale: convertToSale,
    // pure helpers (sync) — formatINR is exported (Reports.formatINR delegates
    // here); buildCustomer/groupByMobile exported for reuse + harness parity.
    formatINR: formatINR,
    buildCustomer: buildCustomer,
    groupByMobile: groupByMobile
  };

  root.Customers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

}(typeof window !== "undefined" ? window : globalThis));
