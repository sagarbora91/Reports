(function (global) {
  "use strict";

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

  function summary(records) {
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

  function breakdown(records, field) {
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

  function visitsCSV(records) {
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

  function dailySummaryCSV(records) {
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
        var s = summary(recs);
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

  // ── public API ────────────────────────────────────────────────────────────

  global.Reports = {
    RANGES: RANGES,
    rangeLabel: rangeLabel,
    resolveRange: resolveRange,
    filterByRange: filterByRange,
    summary: summary,
    breakdown: breakdown,
    visitsCSV: visitsCSV,
    dailySummaryCSV: dailySummaryCSV,
    formatINR: function (n) {
      if (global.Customers && typeof global.Customers.formatINR === "function") {
        return global.Customers.formatINR(n);
      }
      return formatINR(n);
    }
  };

}(window));
