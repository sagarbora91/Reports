/* targets.js — Saagar Greetor targets / attainment / leaderboard layer
 * (SQLite Phase 2b).
 *
 * REWRITTEN to async, DB-backed. The data layer NEVER touches window.GreetorDB
 * directly — config (the `targets` object) lives in the meta KV table and is read
 * via Repo.targets.get() / written via Repo.targets.set(); records come from
 * Repo.records.all(). So this module runs unchanged in Node by injecting a
 * node:sqlite test adapter via Repo.setDb(). The old `state` argument is gone.
 *
 * BYTE-IDENTITY is the only hard requirement: every public method reproduces the
 * EXACT observable output of the previous pure-over-`state` implementation on the
 * real 2,612-row seed. The intricate transforms (the period filter, the
 * attainment counts, the leaderboard grouping + multi-field sort) are UNCHANGED
 * pure functions — we just FETCH the rows via Repo (ORDER BY ord ⇒ original
 * app-array order, so the leaderboard map's insertion order and every sort
 * tie-break match the old in-memory array) and feed them to the SAME pure code.
 * Pure helpers (date math, zeroPeriods, periodLabel, pct) stay sync.
 *
 *     OLD caller:  Targets.leaderboard(state, Targets.recordsInPeriod(all, p), p)
 *     NEW method:  await Targets.leaderboard(p)
 *                    -> records = await Repo.records.all()  // ORDER BY ord
 *                    -> periodRecs = recordsInPeriodPure(records, p) // SAME filter
 *                    -> return leaderboardPure(periodRecs)  // SAME grouping+sort
 *
 * The meta-backed `targets` object is a faithful JSON round-trip of the old
 * state.targets (DBSchema.disassemble writes JSON.stringify(state.targets) to
 * meta('targets'); Repo.targets.get() JSON.parses it back), so object key order
 * and the {store:{daily/weekly/monthly},greetor:{}} shape are preserved exactly.
 *
 * Plain <script> module: sets window.Targets AND module.exports (Node).
 */
(function (root) {
  "use strict";

  // ── Repo handle (the ONLY DB access point) ──────────────────────────────────
  // Resolved lazily at call time so neither load order nor a post-load
  // Repo.setDb() can break routing (mirrors repo.js's own db() resolution).
  function repo() {
    var r = root.Repo;
    if (!r) {
      throw new Error("Targets: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) before targets.js.");
    }
    return r;
  }

  // ── pure helpers (sync — unchanged from the pre-rewrite implementation) ──────
  // These read new Date() lazily, exactly as before, so a frozen clock in the
  // harness pins today()/weekStart()/monthStart() to the same calendar day.

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

  function defaultTargets() {
    return {
      store: zeroPeriods(),
      greetor: {}
    };
  }

  var PERIODS = ["daily", "weekly", "monthly"];

  function periodLabel(p) {
    if (p === "daily") return "Today";
    if (p === "weekly") return "This week";
    if (p === "monthly") return "This month";
    return String(p || "");
  }

  function pct(actual, target) {
    return target > 0 ? Math.round(actual / target * 100) : null;
  }

  // recordsInPeriodPure — UNCHANGED pure transform, now over an explicit
  // records[] array (the rows fetched from Repo) instead of state.records. The
  // date window is inclusive on BOTH bounds, exactly as the old filter; records
  // arrive ORDER BY ord ⇒ original app-array order, so the filtered subset is
  // byte-identical (and downstream grouping/sort tie-breaks too).
  function recordsInPeriodPure(records, period) {
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

  // attainmentPure — UNCHANGED pure transform over (targetsObj, records[]). Splits
  // out the count/target/pct math from the OLD attainment() verbatim so the async
  // wrapper only changes how targetsObj + records are obtained.
  function attainmentPure(targetsObj, periodRecords, period, userId) {
    try {
      var tg = targetsObj || defaultTargets();
      if (!tg.store) tg.store = zeroPeriods();
      if (!tg.greetor) tg.greetor = {};
      var filtered = periodRecords;
      var tgt;
      if (userId) {
        var key = String(userId);
        filtered = periodRecords.filter(function (r) {
          return r && String(r.createdByUserId) === key;
        });
        tgt = (tg.greetor[key] && tg.greetor[key][period])
          ? tg.greetor[key][period]
          : { walkins: 0, conversions: 0 };
      } else {
        tgt = (tg.store && tg.store[period])
          ? tg.store[period]
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

  // leaderboardPure — UNCHANGED pure transform over a period-filtered records[].
  // Grouping is by createdByUserId in INSERTION order (rows arrive ORDER BY ord ⇒
  // original app-array order, so Object.keys(map) yields the same pre-sort order
  // the old code saw). The multi-field comparator (conversions desc, then walkins
  // desc, then saleValue desc) is byte-identical — NOT delegated to SQL ORDER BY
  // (whose NULL tie-break semantics differ).
  function leaderboardPure(periodRecords) {
    try {
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

  // ── async, DB-backed API ────────────────────────────────────────────────────

  // ensureSeeded — write the default targets structure to meta('targets') only if
  // it is missing. Idempotent: a complete object (the seed's case) is a pure read,
  // no write. Mirrors the OLD ensureSeeded's patch-missing-sub-keys behaviour
  // (it filled state.targets / .store / .greetor) but persists via Repo only when
  // something was actually absent, so a second call is a no-op. Never throws.
  async function ensureSeeded() {
    try {
      var t = await repo().targets.get();
      if (!t) {
        await repo().targets.set(defaultTargets());
        return;
      }
      var changed = false;
      if (!t.store) { t.store = zeroPeriods(); changed = true; }
      if (!t.greetor) { t.greetor = {}; changed = true; }
      if (changed) await repo().targets.set(t);
    } catch (e) { /* never throw */ }
  }

  // get — async accessor for the whole targets object. Returns null when missing,
  // matching the OLD get(state) -> (state.targets || null).
  async function get() {
    try {
      var t = await repo().targets.get();
      return t != null ? t : null;
    } catch (e) {
      return null;
    }
  }

  // setStoreTarget — read-modify-write the targets object. Defaults the structure
  // exactly like the OLD ensureSeeded + per-period guard, coerces value via
  // Number(value) || 0, and persists. Never throws (matches old try/catch).
  async function setStoreTarget(period, metric, value) {
    try {
      var t = await repo().targets.get();
      if (!t) t = defaultTargets();
      if (!t.store) t.store = zeroPeriods();
      if (!t.greetor) t.greetor = {};
      if (!t.store[period]) t.store[period] = { walkins: 0, conversions: 0 };
      t.store[period][metric] = Number(value) || 0;
      await repo().targets.set(t);
    } catch (e) { /* never throw */ }
  }

  // setGreetorTarget — read-modify-write a per-greetor target. Same defaulting and
  // coercion semantics as the OLD setGreetorTarget (returns silently on falsy
  // userId; creates missing userId/period structs). Never throws.
  async function setGreetorTarget(userId, period, metric, value) {
    try {
      if (!userId) return;
      var t = await repo().targets.get();
      if (!t) t = defaultTargets();
      if (!t.store) t.store = zeroPeriods();
      if (!t.greetor) t.greetor = {};
      var key = String(userId);
      if (!t.greetor[key]) t.greetor[key] = zeroPeriods();
      if (!t.greetor[key][period]) t.greetor[key][period] = { walkins: 0, conversions: 0 };
      t.greetor[key][period][metric] = Number(value) || 0;
      await repo().targets.set(t);
    } catch (e) { /* never throw */ }
  }

  // recordsInPeriod — fetch all records (ORDER BY ord) then reuse the EXACT pure
  // period filter. New sig drops the records arg; the array is sourced from Repo.
  async function recordsInPeriod(period) {
    try {
      var records = await repo().records.all();
      return recordsInPeriodPure(records, period);
    } catch (e) {
      return [];
    }
  }

  // attainment — fetch the targets object + the period's records, then reuse the
  // EXACT count/target/pct math. New sig: attainment(period, userId?).
  async function attainment(period, userId) {
    try {
      var t = await repo().targets.get();
      var records = await repo().records.all();
      var periodRecords = recordsInPeriodPure(records, period);
      return attainmentPure(t, periodRecords, period, userId);
    } catch (e) {
      return {
        walkins: { actual: 0, target: 0, pct: null },
        conversions: { actual: 0, target: 0, pct: null }
      };
    }
  }

  // leaderboard — fetch all records, period-filter via the EXACT pure filter, then
  // reuse the EXACT grouping + multi-field sort. New sig: leaderboard(period).
  async function leaderboard(period) {
    try {
      var records = await repo().records.all();
      var periodRecords = recordsInPeriodPure(records, period);
      return leaderboardPure(periodRecords);
    } catch (e) {
      return [];
    }
  }

  // ── public API (window.Targets, dual-export) ────────────────────────────────
  var api = {
    PERIODS: PERIODS,

    // async, DB-backed (new signatures drop the state/records arg)
    ensureSeeded: ensureSeeded,
    get: get,
    setStoreTarget: setStoreTarget,
    setGreetorTarget: setGreetorTarget,
    recordsInPeriod: recordsInPeriod,
    attainment: attainment,
    leaderboard: leaderboard,

    // pure helpers (sync) — exported unchanged for sync callers + the diff-harness
    periodLabel: periodLabel,
    zeroPeriods: zeroPeriods,

    // pure transforms exposed for the harness (verify the DB path == the JS path)
    recordsInPeriodPure: recordsInPeriodPure,
    attainmentPure: attainmentPure,
    leaderboardPure: leaderboardPure
  };

  root.Targets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

}(typeof window !== "undefined" ? window : globalThis));
