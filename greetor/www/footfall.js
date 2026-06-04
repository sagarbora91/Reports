/* footfall.js — Saagar Greetor walk-in/footfall denominator layer (SQLite Phase 2b).
 *
 * REWRITTEN to async, DB-backed. The data layer NEVER touches window.GreetorDB
 * directly — every read/write goes through window.Repo (the single DB access
 * point), so this module runs unchanged in Node by injecting a node:sqlite test
 * adapter via Repo.setDb(). The DB is the source of truth; the old `state`
 * argument is gone.
 *
 * BYTE-IDENTITY is the only hard requirement: every public method reproduces the
 * EXACT observable output of the previous pure-over-`state` implementation on the
 * real seed.
 *
 *   • Footfall lives in the `footfall` table (composite PK store,date), which
 *     already exists by DDL — there is no data to seed, so ensureSeeded is a
 *     no-op (the old code only initialised an in-memory { entries:{} } shape).
 *   • set/get/totalForRange delegate to the matching Repo.footfall.* helpers.
 *     `set` first re-applies the OLD count coercion (Math.max(0, Math.round(...)))
 *     so the persisted value is byte-identical to the previous implementation for
 *     ANY input, then hands off to Repo.footfall.set (which stamps `at` fresh).
 *   • totalForRange uses Repo.footfall.totalForRange — a SQL COALESCE(SUM(count),0)
 *     over an INCLUSIVE [start,end] window, optionally scoped to one store —
 *     byte-identical to the old loop (range inclusive on both bounds; the store
 *     filter is skipped entirely when no store is given; empty range → 0).
 *
 * Pure helpers (trueConversionPct, captureCoverage, keyFor) stay SYNC and are
 * exported UNCHANGED so sync callers and the diff-harness can use them.
 *
 * Plain <script> module: sets window.Footfall AND module.exports (Node).
 */
(function (global) {
  "use strict";

  // Resolve Repo lazily at call time (not at load) so load order and a
  // post-load Repo.setDb() both work, and Node can inject a test adapter
  // (mirrors repo.js / customers.js / reports.js Repo resolution).
  function repo() {
    var r = global.Repo;
    if (!r) {
      throw new Error(
        "Footfall: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) " +
        "before footfall.js, or inject a test adapter via Repo.setDb()."
      );
    }
    return r;
  }

  // ── pure helpers (sync — unchanged) ─────────────────────────────────────────

  // Kept for API parity with the old in-memory keying. Pure; no DB access.
  function keyFor(store, date) {
    return (store || "") + "|" + (date || "");
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

  // ── async, DB-backed API ────────────────────────────────────────────────────

  // The footfall table is created by DDL (db-schema.js SCHEMA), so there is no
  // data to seed and no in-memory shape to initialise. Migration calls this on
  // boot for symmetry with the other layers; it is an async no-op returning void.
  async function ensureSeeded() {
    return;
  }

  // Back-compat alias of the old touch(state) → ensureSeeded(state). No-op now.
  async function touch() {
    return;
  }

  // Upsert one (store,date) footfall row. Re-apply the OLD count coercion
  // (Math.max(0, Math.round(Number(count)||0))) BEFORE delegating so the stored
  // value is byte-identical for any input; Repo.footfall.set stamps `at` fresh
  // (new Date().toISOString()) exactly like the old implementation.
  async function set(store, date, count, user) {
    var safeCount = Math.max(0, Math.round(Number(count) || 0));
    await repo().footfall.set(
      store,
      date,
      safeCount,
      user && user.id,
      user && user.name
    );
  }

  // Returns the mapped footfall entry { store, date, count, byUserId, byName, at }
  // (via DBSchema.rowToFootfall) or null — matching the old
  // state.footfall.entries[key] || null.
  async function get(store, date) {
    return repo().footfall.get(store, date);
  }

  // SUM(count) over an INCLUSIVE [startDate, endDate] window, optionally scoped to
  // one store. Delegates to the SQL aggregate in Repo (COALESCE → 0 for an empty
  // range; store filter omitted when `store` is falsy) — byte-identical to the
  // old loop over entries.
  async function totalForRange(startDate, endDate, store) {
    return repo().footfall.totalForRange(startDate, endDate, store);
  }

  // ── public API (window.Footfall, dual-export) ───────────────────────────────
  var api = {
    // async, DB-backed
    ensureSeeded: ensureSeeded,
    touch: touch,
    get: get,
    set: set,
    totalForRange: totalForRange,
    // pure helpers (sync) — unchanged
    keyFor: keyFor,
    trueConversionPct: trueConversionPct,
    captureCoverage: captureCoverage
  };

  global.Footfall = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

}(typeof window !== "undefined" ? window : globalThis));
