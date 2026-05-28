(function () {
  "use strict";

  var MOBILE_RE = /^[6-9]\d{9}$/;
  var FALLBACK_STAGES = ["Open", "Hot", "Warm", "Cold", "Converted", "Closed"];

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

  function groupByMobile(state) {
    var map = {};
    var records = (state && Array.isArray(state.records)) ? state.records : [];
    records.forEach(function (r) {
      if (!validMobile(r.mobile)) return;
      if (!map[r.mobile]) map[r.mobile] = [];
      map[r.mobile].push(r);
    });
    return map;
  }

  function list(state, opts) {
    try {
      opts = opts || {};
      var map = groupByMobile(state);
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

  function byMobile(state, mobile) {
    try {
      if (!validMobile(mobile)) return null;
      var map = groupByMobile(state);
      if (!map[mobile]) return null;
      return buildCustomer(mobile, map[mobile]);
    } catch (e) {
      return null;
    }
  }

  function stats(state) {
    try {
      var records = (state && Array.isArray(state.records)) ? state.records : [];
      var map = groupByMobile(state);
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

  function pipelineStages(state) {
    try {
      if (window.Masters && typeof window.Masters.globalList === "function") {
        var stages = window.Masters.globalList(state, "leadStatuses");
        if (Array.isArray(stages) && stages.length) return stages;
      }
    } catch (e) {}
    return FALLBACK_STAGES.slice();
  }

  function pipeline(state) {
    try {
      var stages = pipelineStages(state);
      var records = (state && Array.isArray(state.records)) ? state.records : [];
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

  function findRecord(state, recordId) {
    var records = (state && Array.isArray(state.records)) ? state.records : [];
    for (var i = 0; i < records.length; i++) {
      if (records[i].recordId === recordId) return records[i];
    }
    return null;
  }

  function setStage(state, recordId, stage) {
    try {
      var rec = findRecord(state, recordId);
      if (!rec) return;
      rec.leadStatus = stage;
      if (stage === "Converted" && !rec.convertedAt) {
        rec.convertedAt = new Date().toISOString();
      }
      rec.updatedAt = new Date().toISOString();
    } catch (e) {}
  }

  function convertToSale(state, recordId, saleValue) {
    try {
      var rec = findRecord(state, recordId);
      if (!rec) return;
      rec.leadStatus = "Converted";
      rec.convertedAt = new Date().toISOString();
      rec.saleValue = Number(saleValue) || 0;
      rec.updatedAt = new Date().toISOString();
    } catch (e) {}
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

  window.Customers = {
    list: list,
    byMobile: byMobile,
    stats: stats,
    pipelineStages: pipelineStages,
    pipeline: pipeline,
    setStage: setStage,
    convertToSale: convertToSale,
    formatINR: formatINR
  };

}());
