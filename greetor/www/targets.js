(function () {
  "use strict";

  function today() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function weekStart() {
    var d = new Date();
    d.setDate(d.getDate() - 6);
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function monthStart() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-01";
  }

  function zeroPeriods() {
    return {
      daily: { walkins: 0, conversions: 0 },
      weekly: { walkins: 0, conversions: 0 },
      monthly: { walkins: 0, conversions: 0 }
    };
  }

  function ensureSeeded(state) {
    if (!state) return state;
    if (!state.targets) {
      state.targets = {
        store: zeroPeriods(),
        greetor: {}
      };
    }
    if (!state.targets.store) state.targets.store = zeroPeriods();
    if (!state.targets.greetor) state.targets.greetor = {};
    return state;
  }

  function touch(state) {
    ensureSeeded(state);
    return state;
  }

  var PERIODS = ["daily", "weekly", "monthly"];

  function periodLabel(p) {
    if (p === "daily") return "Today";
    if (p === "weekly") return "This week";
    if (p === "monthly") return "This month";
    return String(p || "");
  }

  function get(state) {
    if (!state || !state.targets) return null;
    return state.targets;
  }

  function setStoreTarget(state, period, metric, value) {
    try {
      ensureSeeded(state);
      if (!state.targets.store[period]) state.targets.store[period] = { walkins: 0, conversions: 0 };
      state.targets.store[period][metric] = Number(value) || 0;
    } catch (e) { /* never throw */ }
  }

  function setGreetorTarget(state, userId, period, metric, value) {
    try {
      ensureSeeded(state);
      if (!userId) return;
      var key = String(userId);
      if (!state.targets.greetor[key]) state.targets.greetor[key] = zeroPeriods();
      if (!state.targets.greetor[key][period]) state.targets.greetor[key][period] = { walkins: 0, conversions: 0 };
      state.targets.greetor[key][period][metric] = Number(value) || 0;
    } catch (e) { /* never throw */ }
  }

  function recordsInPeriod(records, period) {
    try {
      if (!Array.isArray(records)) return [];
      var t = today();
      var ws = weekStart();
      var ms = monthStart();
      return records.filter(function (r) {
        var vd = r && r.visitDate ? String(r.visitDate) : "";
        if (!vd) return false;
        if (period === "daily") return vd === t;
        if (period === "weekly") return vd >= ws && vd <= t;
        if (period === "monthly") return vd >= ms && vd <= t;
        return false;
      });
    } catch (e) {
      return [];
    }
  }

  function pct(actual, target) {
    return target > 0 ? Math.round(actual / target * 100) : null;
  }

  function attainment(state, period, records, userId) {
    try {
      ensureSeeded(state);
      var periodRecords = recordsInPeriod(records, period);
      var filtered = periodRecords;
      var tgt;
      if (userId) {
        var key = String(userId);
        filtered = periodRecords.filter(function (r) {
          return r && String(r.createdByUserId) === key;
        });
        tgt = (state.targets.greetor[key] && state.targets.greetor[key][period])
          ? state.targets.greetor[key][period]
          : { walkins: 0, conversions: 0 };
      } else {
        tgt = (state.targets.store && state.targets.store[period])
          ? state.targets.store[period]
          : { walkins: 0, conversions: 0 };
      }
      var actualWalkins = filtered.length;
      var actualConversions = filtered.filter(function (r) {
        return r && r.leadStatus === "Converted";
      }).length;
      var tgtWalkins = Number(tgt.walkins) || 0;
      var tgtConversions = Number(tgt.conversions) || 0;
      return {
        walkins: { actual: actualWalkins, target: tgtWalkins, pct: pct(actualWalkins, tgtWalkins) },
        conversions: { actual: actualConversions, target: tgtConversions, pct: pct(actualConversions, tgtConversions) }
      };
    } catch (e) {
      return {
        walkins: { actual: 0, target: 0, pct: null },
        conversions: { actual: 0, target: 0, pct: null }
      };
    }
  }

  function leaderboard(state, records, period) {
    try {
      var periodRecords = recordsInPeriod(records, period);
      var map = {};
      periodRecords.forEach(function (r) {
        if (!r) return;
        var key = r.createdByUserId != null ? String(r.createdByUserId) : "unknown";
        if (!map[key]) {
          map[key] = {
            userId: key,
            name: r.createdByName || "Unknown",
            walkins: 0,
            conversions: 0,
            saleValue: 0
          };
        }
        map[key].walkins += 1;
        if (r.leadStatus === "Converted") {
          map[key].conversions += 1;
          map[key].saleValue += Number(r.saleValue) || 0;
        }
      });
      var list = Object.keys(map).map(function (k) {
        var entry = map[k];
        entry.conversionPct = entry.walkins > 0
          ? Math.round(entry.conversions / entry.walkins * 100)
          : 0;
        return entry;
      });
      list.sort(function (a, b) {
        if (b.conversions !== a.conversions) return b.conversions - a.conversions;
        if (b.walkins !== a.walkins) return b.walkins - a.walkins;
        return b.saleValue - a.saleValue;
      });
      return list;
    } catch (e) {
      return [];
    }
  }

  window.Targets = {
    PERIODS: PERIODS,
    ensureSeeded: ensureSeeded,
    touch: touch,
    periodLabel: periodLabel,
    get: get,
    setStoreTarget: setStoreTarget,
    setGreetorTarget: setGreetorTarget,
    recordsInPeriod: recordsInPeriod,
    attainment: attainment,
    leaderboard: leaderboard
  };

}());
