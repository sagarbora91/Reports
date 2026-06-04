/* dpdp.js — Saagar Greetor DPDP (consent + data-retention) layer.
 *
 * SQLite Phase 2b: rewritten to be DB-backed for the ONE function that touches
 * persisted records (pruneOldRecords). It NEVER touches window.GreetorDB
 * directly — the only data access goes through window.Repo (the single DB access
 * point), so this module runs unchanged in Node by injecting a node:sqlite test
 * adapter via Repo.setDb(). Records are the source of truth; the old `state`
 * argument is gone from pruneOldRecords.
 *
 * BYTE-IDENTITY is the only hard requirement. pruneOldRecords reproduces the
 * EXACT observable output of the previous pure-over-`state` implementation:
 *   - retention months still come from localStorage (DPDP prefs are CLIENT-side,
 *     not in the DB), via the UNCHANGED getRetentionMonths()/getPrefs();
 *   - the cutoff date is computed by the UNCHANGED cutoffDate() (now - N months);
 *   - the purge predicate is byte-identical to the old loop's `vd && vd < cutoff`
 *     (a record with an empty/missing visitDate is KEPT, never purged);
 *   - `kept` is the count of NON-purged records (total - purged), exactly like
 *     the old `kept.length` (which also retained empty-visitDate rows);
 *   - photos are collected from EACH purged record in original app-order and
 *     Photo.remove() is invoked BEFORE the DELETE, matching the old ordering;
 *   - lastPurgeAt is stamped in localStorage (NOT the DB);
 *   - the retention-purge audit event fires only when purged > 0.
 *
 * EVERY other function is a PURE/SYNC helper (consent flags, mobile/name masking,
 * the cutoff date math, the localStorage prefs accessors) and is UNCHANGED — no
 * DB access. They stay synchronous and are exported verbatim.
 *
 * Plain <script> module: sets window.DPDP AND module.exports (Node).
 */
(function (root) {
  "use strict";

  var PREFS_KEY = "saagar_greetor_dpdp";

  // ── Repo handle (the ONLY DB access point) ──────────────────────────────────
  // Resolved lazily at call time so neither load order nor a post-load
  // Repo.setDb() can break routing (mirrors repo.js's own db() resolution and
  // the Phase-2 reports/customers layers).
  function repo() {
    var r = root.Repo;
    if (!r) {
      throw new Error("DPDP: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) before dpdp.js.");
    }
    return r;
  }

  // ── localStorage prefs (CLIENT-side; unchanged, sync) ───────────────────────
  // DPDP retention config is a device preference, never persisted to the DB, so
  // these accessors keep using localStorage exactly as before. In Node (tests),
  // localStorage may be absent; getPrefs swallows that and returns the defaults,
  // so a 0-month retention (the safe default) makes pruneOldRecords a no-op.

  function getPrefs() {
    try {
      var raw = (typeof localStorage !== "undefined" && localStorage)
        ? localStorage.getItem(PREFS_KEY) : null;
      var parsed = raw ? JSON.parse(raw) : {};
      return {
        retentionMonths: typeof parsed.retentionMonths === "number" ? parsed.retentionMonths : 0,
        lastPurgeAt: parsed.lastPurgeAt || null
      };
    } catch (e) {
      return { retentionMonths: 0, lastPurgeAt: null };
    }
  }

  function setPrefs(partial) {
    var current = getPrefs();
    var merged = {
      retentionMonths: current.retentionMonths,
      lastPurgeAt: current.lastPurgeAt
    };
    if (partial && typeof partial === "object") {
      if (typeof partial.retentionMonths === "number") {
        merged.retentionMonths = partial.retentionMonths;
      }
      if ("lastPurgeAt" in partial) {
        merged.lastPurgeAt = partial.lastPurgeAt;
      }
    }
    try {
      if (typeof localStorage !== "undefined" && localStorage) {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      }
    } catch (e) { /* storage full / absent — swallow */ }
    return merged;
  }

  function getRetentionMonths() {
    return getPrefs().retentionMonths;
  }

  function setRetentionMonths(n) {
    var num = Number(n) || 0;
    if (num < 0) num = 0;
    if (num > 36) num = 36;
    setPrefs({ retentionMonths: num });
  }

  // --- Consent (PURE/SYNC — unchanged) ---

  function hasConsent(record) {
    return !!(record && record.consent_at);
  }

  function markConsent(record) {
    if (record && typeof record === "object") {
      record.consent_at = new Date().toISOString();
    }
    return record;
  }

  function removeConsent(record) {
    if (record && typeof record === "object") {
      record.consent_at = "";
    }
    return record;
  }

  function requiresConsent(record) {
    return !!(record && record.mobile && String(record.mobile).trim().length > 0);
  }

  function consentOK(record) {
    return !requiresConsent(record) || hasConsent(record);
  }

  // --- Retention date math (PURE/SYNC — unchanged) ---

  function padTwo(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function cutoffDate(months) {
    var m = Number(months) || 0;
    if (m <= 0) return "";
    var d = new Date();
    d.setMonth(d.getMonth() - m);
    return (
      d.getFullYear() +
      "-" +
      padTwo(d.getMonth() + 1) +
      "-" +
      padTwo(d.getDate())
    );
  }

  // --- Retention purge (ASYNC, DB-backed via Repo only) ---
  //
  // Mirrors the old pure-over-state pruneOldRecords byte-for-byte, changing only
  // HOW records are obtained/removed (Repo instead of state.records):
  //   OLD: months=getRetentionMonths(); loop state.records; split kept/purged on
  //        `vd && vd < cutoff`; collect purged photos; Photo.remove each;
  //        state.records = kept; setPrefs(lastPurgeAt); audit if purged>0;
  //        return {purged, kept: kept.length, cutoff}.
  //   NEW: fetch rows via Repo.records.all() (ORDER BY ord == original app-order,
  //        so photo-collection order is identical); apply the SAME predicate in
  //        pure JS to find the doomed rows; Photo.remove each photo (same order);
  //        DELETE the doomed rows via Repo; everything else (prefs, audit, return
  //        shape) unchanged. kept = total - purged (== the old kept.length, which
  //        also retained empty/missing-visitDate rows).
  async function pruneOldRecords() {
    var months = getRetentionMonths();

    // Fetch all records ONCE via Repo (ORDER BY ord == the order the old loop saw
    // state.records in). total == records.length in the old code.
    var records = await repo().records.all();
    var total = records.length;

    if (months <= 0) {
      // Disabled: no-op. Old code returned kept = records.length (the full set).
      return { purged: 0, kept: total, cutoff: "" };
    }

    var cutoff = cutoffDate(months);
    var purged = 0;
    var purgedIds = [];
    // Audit fix #4: collect photos from purged records and remove the files —
    // orphan watermarked JPEGs would otherwise outlive the retention window and
    // break the DPDP guarantee on personal data. Collected in original app-order
    // (records arrive ORDER BY ord), byte-identical to the old loop.
    var photosToRemove = [];

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var vd = (rec && typeof rec.visitDate === "string") ? rec.visitDate : "";
      if (vd && vd < cutoff) {
        purged++;
        purgedIds.push(rec.recordId);
        if (rec && Array.isArray(rec.photos)) {
          for (var pi = 0; pi < rec.photos.length; pi++) photosToRemove.push(rec.photos[pi]);
        }
      }
    }

    if (photosToRemove.length && typeof root !== "undefined" && root.Photo && typeof root.Photo.remove === "function") {
      for (var ri = 0; ri < photosToRemove.length; ri++) {
        try { root.Photo.remove(photosToRemove[ri]); } catch (_) {}
      }
    }

    // Delete the doomed rows. The WHERE predicate is byte-identical to the JS
    // split above (`visitDate` present, non-empty, and < cutoff), so the DB ends
    // up with exactly the `kept` set the old code produced. We already have the
    // purged COUNT from the loop (== this DELETE's `changes`); kept = total -
    // purged matches the old `kept.length` (empty/missing-visitDate rows stay).
    if (purged > 0) {
      await repo().run(
        "DELETE FROM records WHERE visitDate IS NOT NULL AND visitDate != '' AND visitDate < ?",
        [cutoff]
      );
    }

    var kept = total - purged;

    setPrefs({ lastPurgeAt: new Date().toISOString() });

    if (purged > 0 && typeof root !== "undefined" && typeof root.logAudit === "function") {
      try {
        root.logAudit(
          "retention-purge",
          "Purged " + purged + " record(s) older than " + cutoff,
          { cutoff: cutoff, count: purged }
        );
      } catch (e) { /* guard */ }
    }

    return { purged: purged, kept: kept, cutoff: cutoff };
  }

  async function runBootPurge() {
    return pruneOldRecords();
  }

  // --- Mask (PURE/SYNC — unchanged) ---

  function maskMobile(mobile) {
    if (typeof mobile !== "string") return mobile === undefined || mobile === null ? "" : String(mobile);
    var digits = mobile.replace(/\D/g, "");
    if (digits.length !== 10) return mobile;
    return digits.slice(0, 5) + " *****";
  }

  function maskName(name) {
    if (typeof name !== "string" || name.trim() === "") return "";
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return parts[0] + " " + parts[1].charAt(0) + ".";
  }

  // --- Export (dual: window.DPDP + module.exports) ---

  var api = {
    PREFS_KEY: PREFS_KEY,
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    getRetentionMonths: getRetentionMonths,
    setRetentionMonths: setRetentionMonths,
    hasConsent: hasConsent,
    markConsent: markConsent,
    removeConsent: removeConsent,
    requiresConsent: requiresConsent,
    consentOK: consentOK,
    cutoffDate: cutoffDate,
    // async, DB-backed (signature drops the state arg)
    pruneOldRecords: pruneOldRecords,
    runBootPurge: runBootPurge,
    maskMobile: maskMobile,
    maskName: maskName
  };

  root.DPDP = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof window !== "undefined" ? window : globalThis));
