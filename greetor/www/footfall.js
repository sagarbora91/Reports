(function (global) {
  "use strict";

  function ensureSeeded(state) {
    if (!state.footfall || typeof state.footfall !== "object") {
      state.footfall = { entries: {} };
    }
    if (!state.footfall.entries || typeof state.footfall.entries !== "object") {
      state.footfall.entries = {};
    }
    return state;
  }

  function touch(state) {
    ensureSeeded(state);
  }

  function keyFor(store, date) {
    return (store || "") + "|" + (date || "");
  }

  function get(state, store, date) {
    ensureSeeded(state);
    var key = keyFor(store, date);
    return state.footfall.entries[key] || null;
  }

  function set(state, store, date, count, user) {
    ensureSeeded(state);
    var key = keyFor(store, date);
    var safeCount = Math.max(0, Math.round(Number(count) || 0));
    state.footfall.entries[key] = {
      store: store,
      date: date,
      count: safeCount,
      byUserId: user && user.id,
      byName: user && user.name,
      at: new Date().toISOString()
    };
  }

  function remove(state, store, date) {
    ensureSeeded(state);
    var key = keyFor(store, date);
    if (Object.prototype.hasOwnProperty.call(state.footfall.entries, key)) {
      delete state.footfall.entries[key];
    }
  }

  function totalForRange(state, startDate, endDate, store) {
    ensureSeeded(state);
    var total = 0;
    var entries = state.footfall.entries;
    var keys = Object.keys(entries);
    for (var i = 0; i < keys.length; i++) {
      var entry = entries[keys[i]];
      if (entry.date < startDate || entry.date > endDate) { continue; }
      if (store && entry.store !== store) { continue; }
      total += Number(entry.count) || 0;
    }
    return total;
  }

  function trueConversionPct(captured, conversions, footfallEstimate) {
    var cap = Number(captured) || 0;
    var est = Number(footfallEstimate) || 0;
    var denominator = Math.max(cap, est);
    if (denominator <= 0) { return 0; }
    var conv = Number(conversions) || 0;
    return Math.round((conv / denominator) * 1000) / 10;
  }

  function captureCoverage(captured, footfallEstimate) {
    var est = Number(footfallEstimate) || 0;
    if (est <= 0) { return null; }
    var cap = Number(captured) || 0;
    return Math.round((Math.min(cap, est) / est) * 1000) / 10;
  }

  global.Footfall = {
    ensureSeeded: ensureSeeded,
    touch: touch,
    keyFor: keyFor,
    get: get,
    set: set,
    remove: remove,
    totalForRange: totalForRange,
    trueConversionPct: trueConversionPct,
    captureCoverage: captureCoverage
  };

}(typeof window !== "undefined" ? window : this));
