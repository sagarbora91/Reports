/* reports.js — Saagar Greetor reporting/analytics layer (SQLite Phase 2).
 *
 * Rewritten to be ASYNC and DB-backed. The data layer NEVER touches the DB
 * directly: every row comes from window.Repo (which itself routes through
 * window.GreetorDB on device / an injected node:sqlite adapter under test).
 *
 * BYTE-IDENTITY CONTRACT
 * ----------------------
 * The observable output of every analytic (summary / breakdown / visitsCSV /
 * dailySummaryCSV / formatINR / resolveRange / rangeLabel) MUST be identical to
 * the previous pure-over-`records` implementation on the real seed. To guarantee
 * that, the intricate transforms (the summary loop, breakdown grouping+sort, the
 * 28-column CSV assembly, the daily roll-up) are kept EXACTLY as they were —
 * byte-for-byte pure functions over a `records` array — and the new async
 * methods only change HOW the array is obtained:
 *
 *     OLD caller:  Reports.summary(Reports.filterByRange(state.records, key, cs, ce))
 *     NEW method:  await Reports.summary(key, cs, ce)
 *                    -> rows = await Repo.records.all()        // ORDER BY ord
 *                    -> recs = filterByRange(rows, key, cs, ce)// SAME pure filter
 *                    -> return summaryPure(recs)               // SAME pure transform
 *
 * Repo.records.all() returns domain records mapped by DBSchema.rowToRecord in
 * `ord` order — i.e. the original app-array order. Because the pure transforms
 * are unchanged and they receive the rows in the same order the old code saw in
 * state.records, sort-stability ties, NULL/""/0 encoding (enforced by the
 * mappers), INR formatting, CSV column order/quoting/CRLF and date-range
 * inclusivity are all preserved by construction.
 *
 * Pure helpers (formatINR, date math, range resolution, csv escaping) stay SYNC
 * and are exported unchanged so sync callers and the diff-harness can use them.
 *
 * Plain <script> module: sets window.Reports AND module.exports (Node). The
 * async methods reach the DB lazily through window.Repo, so this file works
 * unchanged in Node when a test adapter is injected via Repo.setDb().
 */
(function (global) {
  "use strict";

  // Resolve Repo lazily at call time (not at load) so load order and a
  // post-load Repo.setDb() both work, and Node can inject an adapter.
  function repo() {
    var r = global.Repo;
    if (!r) {
      throw new Error(
        "Reports: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) " +
        "before reports.js, or inject a test adapter via Repo.setDb()."
      );
    }
    return r;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function addDays(ymd, delta) {
    var d = new Date(ymd + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function monthStart() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-01";
  }

  function isValidMobile(m) {
    return typeof m === "string" && /^[6-9]\d{9}$/.test(m.trim());
  }

  // ── formatINR ─────────────────────────────────────────────────────────────

  function formatINR(n) {
    try {
      var num = Number(n);
      if (!isFinite(num) || isNaN(num)) return "₹0";
      if (num === 0) return "₹0";
      var neg = num < 0;
      var abs = Math.round(Math.abs(num));
      var s = "" + abs;
      var result = "";
      if (s.length <= 3) {
        result = s;
      } else {
        var last3 = s.slice(-3);
        var rest = s.slice(0, s.length - 3);
        var groups = [];
        while (rest.length > 2) {
          groups.unshift(rest.slice(-2));
          rest = rest.slice(0, rest.length - 2);
        }
        if (rest.length) groups.unshift(rest);
        result = groups.join(",") + "," + last3;
      }
      return "₹" + (neg ? "-" : "") + result;
    } catch (e) {
      return "₹0";
    }
  }

  // ── RANGES ────────────────────────────────────────────────────────────────

  var RANGES = ["today", "7d", "30d", "month", "custom"];

  var RANGE_LABELS = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    month: "This month",
    custom: "Custom"
  };

  function rangeLabel(key) {
    return RANGE_LABELS[key] || key || "";
  }

  function resolveRange(rangeKey, customStart, customEnd) {
    var today = todayStr();
    var start, end, label;
    switch (rangeKey) {
      case "today":
        start = today; end = today; label = "Today"; break;
      case "7d":
        start = addDays(today, -6); end = today; label = "Last 7 days"; break;
      case "30d":
        start = addDays(today, -29); end = today; label = "Last 30 days"; break;
      case "month":
        start = monthStart(); end = today; label = "This month"; break;
      case "custom":
        start = (customStart && customStart <= today) ? customStart : today;
        end   = (customEnd   && customEnd   <= today) ? customEnd   : today;
        if (start > end) { var tmp = start; start = end; end = tmp; }
        label = "Custom";
        break;
      default:
        start = today; end = today; label = "Today";
    }
    return { startDate: start, endDate: end, label: label };
  }

  // ── filterByRange ─────────────────────────────────────────────────────────
  // PURE/SYNC. Resolves the date window and filters a records ARRAY in place.
  // The async methods below obtain the array via Repo, then call this with the
  // EXACT same semantics the old callers used on state.records.

  function filterByRange(records, rangeKey, customStart, customEnd) {
    try {
      if (!Array.isArray(records)) return [];
      var range = resolveRange(rangeKey, customStart, customEnd);
      var s = range.startDate, e = range.endDate;
      return records.filter(function (r) {
        var vd = r && r.visitDate;
        return typeof vd === "string" && vd >= s && vd <= e;
      });
    } catch (ex) {
      return [];
    }
  }

  // ── summary ───────────────────────────────────────────────────────────────

  var CLOSED_STATUSES = { Converted: true, Closed: true };

  // PURE: unchanged transform over a records array. Kept byte-identical.
  function summaryPure(records) {
    var zero = {
      walkins: 0, conversions: 0, conversionPct: 0,
      totalSale: 0, hot: 0, followPending: 0, uniqueCustomers: 0
    };
    try {
      if (!Array.isArray(records) || records.length === 0) return zero;
      var walkins = records.length;
      var conversions = 0, totalSale = 0, hot = 0, followPending = 0;
      var mobiles = {};
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (!r) continue;
        var ls = r.leadStatus;
        if (ls === "Converted") { conversions++; totalSale += Number(r.saleValue) || 0; }
        if (ls === "Hot") hot++;
        if (r.followUp === "Yes" && !CLOSED_STATUSES[ls]) followPending++;
        var mob = r.mobile && r.mobile.trim ? r.mobile.trim() : "";
        if (isValidMobile(mob)) mobiles[mob] = true;
      }
      var convPct = walkins > 0 ? Math.round((conversions / walkins) * 1000) / 10 : 0;
      return {
        walkins: walkins,
        conversions: conversions,
        conversionPct: convPct,
        totalSale: totalSale,
        hot: hot,
        followPending: followPending,
        uniqueCustomers: Object.keys(mobiles).length
      };
    } catch (ex) {
      return zero;
    }
  }

  // ── breakdown ─────────────────────────────────────────────────────────────

  var GREETOR_FIELDS = { greetor: true };

  function getFieldValue(r, field) {
    if (field === "greetor") {
      return (r.createdByName && r.createdByName.trim()) ||
             (r.greetor && r.greetor.trim()) || "";
    }
    var v = r[field];
    return (v !== undefined && v !== null) ? ("" + v).trim() : "";
  }

  // PURE: unchanged grouping + descending-count sort over a records array.
  function breakdownPure(records, field) {
    try {
      if (!Array.isArray(records) || records.length === 0) return [];
      var counts = {};
      var total = records.length;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (!r) { total--; continue; }
        var key = getFieldValue(r, field) || "(none)";
        counts[key] = (counts[key] || 0) + 1;
      }
      if (total <= 0) return [];
      var result = Object.keys(counts).map(function (k) {
        var c = counts[k];
        return { key: k, count: c, pct: Math.round((c / total) * 1000) / 10 };
      });
      result.sort(function (a, b) { return b.count - a.count; });
      return result;
    } catch (ex) {
      return [];
    }
  }

  // ── CSV helpers ───────────────────────────────────────────────────────────

  var VISIT_COLS = [
    "recordId","visitDate","visitTime","store","greetor","cro","mobile","customerName",
    "customerType","category","subCategory","brand","gender","occasion","budget","urgency",
    "source","reason","competitor","remarks","followUp","leadStatus","followDate","followTime",
    "saleValue","convertedAt","createdByName","createdAt"
  ];

  function csvCell(v) {
    var s = (v === undefined || v === null) ? "" : "" + v;
    if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1 || s.indexOf("\r") !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvRow(cells) {
    return cells.map(csvCell).join(",");
  }

  function recordToVisitRow(r) {
    var greeName = (r.createdByName && r.createdByName.trim()) || r.greetor || "";
    var cells = VISIT_COLS.map(function (col) {
      if (col === "greetor") return greeName;
      if (col === "saleValue") return (r.leadStatus === "Converted" && r.saleValue !== undefined && r.saleValue !== "") ? r.saleValue : "";
      return r[col] !== undefined && r[col] !== null ? r[col] : "";
    });
    return csvRow(cells);
  }

  function sortByDateTime(a, b) {
    var da = (a.visitDate || "") + " " + (a.visitTime || "");
    var db = (b.visitDate || "") + " " + (b.visitTime || "");
    return da < db ? -1 : da > db ? 1 : 0;
  }

  // PURE: unchanged CSV assembly over a records array (sort + 28-col rows + CRLF).
  function visitsCSVPure(records) {
    try {
      if (!Array.isArray(records)) return "";
      var sorted = records.slice().sort(sortByDateTime);
      var lines = [csvRow(VISIT_COLS)];
      for (var i = 0; i < sorted.length; i++) {
        if (sorted[i]) lines.push(recordToVisitRow(sorted[i]));
      }
      return lines.join("\r\n");
    } catch (ex) {
      return "";
    }
  }

  // ── dailySummaryCSV ───────────────────────────────────────────────────────

  function topReason(dayRecords) {
    if (!dayRecords.length) return "(none)";
    var counts = {};
    for (var i = 0; i < dayRecords.length; i++) {
      var r = dayRecords[i];
      var v = (r.reason && r.reason.trim()) || "(none)";
      counts[v] = (counts[v] || 0) + 1;
    }
    var best = "(none)", bestN = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
    return best;
  }

  // PURE: unchanged daily roll-up over a records array.
  function dailySummaryCSVPure(records) {
    try {
      if (!Array.isArray(records)) return "";
      var byDate = {};
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (!r || !r.visitDate) continue;
        var d = r.visitDate;
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(r);
      }
      var dates = Object.keys(byDate).sort();
      var header = "date,walkins,conversions,conversion_pct,total_sale_value,hot_count,top_reason";
      var lines = [header];
      for (var j = 0; j < dates.length; j++) {
        var date = dates[j];
        var recs = byDate[date];
        var s = summaryPure(recs);
        lines.push(csvRow([
          date,
          s.walkins,
          s.conversions,
          s.conversionPct,
          s.totalSale,
          s.hot,
          topReason(recs)
        ]));
      }
      return lines.join("\r\n");
    } catch (ex) {
      return "";
    }
  }

  // ── async DB-backed range fetch ─────────────────────────────────────────────
  // The ONE place these analytics touch data. Repo.records.all() returns domain
  // records (DBSchema.rowToRecord) in `ord` order == the original state.records
  // order, so the pure transforms below see rows in the exact order the old
  // pure-over-state code did. We then reuse the SAME pure filterByRange so the
  // date window (inclusive on both bounds) is identical.
  async function recordsInRange(rangeKey, customStart, customEnd) {
    var all = await repo().records.all();
    return filterByRange(all, rangeKey, customStart, customEnd);
  }

  // ── async public analytics (DB-backed; byte-identical output) ───────────────

  async function summary(rangeKey, customStart, customEnd) {
    var recs = await recordsInRange(rangeKey, customStart, customEnd);
    return summaryPure(recs);
  }

  async function breakdown(rangeKey, field, customStart, customEnd) {
    var recs = await recordsInRange(rangeKey, customStart, customEnd);
    return breakdownPure(recs, field);
  }

  async function visitsCSV(rangeKey, customStart, customEnd) {
    var recs = await recordsInRange(rangeKey, customStart, customEnd);
    return visitsCSVPure(recs);
  }

  async function dailySummaryCSV(rangeKey, customStart, customEnd) {
    var recs = await recordsInRange(rangeKey, customStart, customEnd);
    return dailySummaryCSVPure(recs);
  }

  // ── public API ────────────────────────────────────────────────────────────

  var api = {
    RANGES: RANGES,

    // pure helpers (sync) — exported unchanged for sync callers + diff-harness
    rangeLabel: rangeLabel,
    resolveRange: resolveRange,
    filterByRange: filterByRange,

    // async, DB-backed analytics (new signatures drop the records/state arg)
    summary: summary,
    breakdown: breakdown,
    visitsCSV: visitsCSV,
    dailySummaryCSV: dailySummaryCSV,

    // pure transforms exposed for the diff-harness (verify SQL path == JS path)
    summaryPure: summaryPure,
    breakdownPure: breakdownPure,
    visitsCSVPure: visitsCSVPure,
    dailySummaryCSVPure: dailySummaryCSVPure,

    formatINR: function (n) {
      if (global.Customers && typeof global.Customers.formatINR === "function") {
        return global.Customers.formatINR(n);
      }
      return formatINR(n);
    }
  };

  global.Reports = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

}(typeof window !== "undefined" ? window : globalThis));
