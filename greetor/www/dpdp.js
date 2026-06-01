(function () {
  "use strict";

  var PREFS_KEY = "saagar_greetor_dpdp";

  function getPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
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
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    } catch (e) { /* storage full — swallow */ }
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

  // --- Consent ---

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

  // --- Retention ---

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

  function pruneOldRecords(state) {
    var months = getRetentionMonths();
    var records = (state && Array.isArray(state.records)) ? state.records : [];

    if (months <= 0) {
      return { purged: 0, kept: records.length, cutoff: "" };
    }

    var cutoff = cutoffDate(months);
    var kept = [];
    var purged = 0;
    // Audit fix #4: collect photos from purged records and remove the files
    // — orphan watermarked JPEGs would otherwise outlive the retention window
    // and break the DPDP guarantee on personal data.
    var photosToRemove = [];

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var vd = (rec && typeof rec.visitDate === "string") ? rec.visitDate : "";
      if (vd && vd < cutoff) {
        purged++;
        if (rec && Array.isArray(rec.photos)) {
          for (var pi = 0; pi < rec.photos.length; pi++) photosToRemove.push(rec.photos[pi]);
        }
      } else {
        kept.push(rec);
      }
    }

    if (photosToRemove.length && typeof window !== "undefined" && window.Photo && typeof window.Photo.remove === "function") {
      for (var ri = 0; ri < photosToRemove.length; ri++) {
        try { window.Photo.remove(photosToRemove[ri]); } catch (_) {}
      }
    }

    if (state && Array.isArray(state.records)) {
      state.records = kept;
    }

    setPrefs({ lastPurgeAt: new Date().toISOString() });

    if (purged > 0 && typeof window !== "undefined" && typeof window.logAudit === "function") {
      try {
        window.logAudit(
          "retention-purge",
          "Purged " + purged + " record(s) older than " + cutoff,
          { cutoff: cutoff, count: purged }
        );
      } catch (e) { /* guard */ }
    }

    return { purged: purged, kept: kept.length, cutoff: cutoff };
  }

  function runBootPurge(state) {
    return pruneOldRecords(state);
  }

  // --- Mask ---

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

  // --- Export ---

  window.DPDP = {
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
    pruneOldRecords: pruneOldRecords,
    runBootPurge: runBootPurge,
    maskMobile: maskMobile,
    maskName: maskName
  };
}());
