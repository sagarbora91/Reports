/* comms.js — Saagar Greetor customer-communication data layer (SQLite Phase 2b).
 *
 * REWRITTEN to async, DB-backed. The data layer NEVER touches window.GreetorDB
 * directly — every read/write goes through window.Repo (the single DB access
 * point), so this module runs unchanged in Node by injecting a node:sqlite test
 * adapter via Repo.setDb(). The old in-memory `state` argument (state.commsLog /
 * state.commsTemplates / state.records) is gone; templates live in the
 * comms_templates table, the message log in comms_log, and records come from the
 * records table — all reached only through Repo.
 *
 * BYTE-IDENTITY is the only hard requirement: every public method reproduces the
 * EXACT observable output of the previous pure-over-`state` implementation on the
 * real 2,612-row seed. The intricate transforms (applicableTemplates' scope
 * partition + dedup, endOfDaySummary's reason/greetor aggregation + multiline
 * formatting) are kept byte-for-byte as PURE functions over plain arrays — the
 * async methods only change HOW the array is obtained:
 *
 *     OLD caller:  Comms.applicableTemplates(state, record)
 *     NEW method:  await Comms.applicableTemplates(record)
 *                    -> tmpls = await Repo.commsTemplates.all()  // ORDER BY ord
 *                    -> return applicableTemplatesPure(tmpls, record) // SAME pure
 *
 * Repo.commsTemplates.all() / Repo.commsLog.all() / Repo.records.all() return
 * domain objects mapped by DBSchema in `ord` order == the original app-array
 * order, so the pure transforms see rows in the exact order the old pure-over-
 * state code did. Partition insertion order, dedup-by-id order, sort-stability
 * ties, NULL/""/0 encoding (enforced by the mappers) and the en-IN date string
 * are all preserved by construction.
 *
 * Pure helpers (fillTemplate, waUrl, smsUrl, uid, date math) stay SYNC and are
 * exported unchanged so sync callers and the diff-harness can use them.
 *
 * Plain <script> module: sets window.Comms AND module.exports (Node). The async
 * methods reach the DB lazily through window.Repo, so this file works unchanged
 * in Node when a test adapter is injected via Repo.setDb().
 */
(function (root) {
  "use strict";

  var MOBILE_RE = /^[6-9]\d{9}$/;

  // ── Repo handle (the ONLY DB access point) ──────────────────────────────────
  // Resolved lazily at call time so neither load order nor a post-load
  // Repo.setDb() can break routing (mirrors repo.js's own db() resolution and
  // the Phase-2 reports.js / customers.js pattern).
  function repo() {
    var r = root.Repo;
    if (!r) {
      throw new Error("Comms: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) before comms.js.");
    }
    return r;
  }

  // ── seed templates (unchanged) ──────────────────────────────────────────────
  // store/reason are EMPTY STRINGS (not NULL) — the scope matching and the
  // db-schema mapper both rely on that encoding. active is always true in seed.
  var SEED_TEMPLATES = [
    {
      name: "Thank you for visiting",
      scope: "general",
      store: "",
      reason: "",
      text: "Hello {name}, thank you for visiting {store} today. Do let me know if you’d like any help with your selection — happy to assist."
    },
    {
      name: "Follow-up",
      scope: "general",
      store: "",
      reason: "",
      text: "Hello {name}, following up on your visit to {store}. Are you still considering the {category}? I’d be glad to help you decide."
    },
    {
      name: "Special offer",
      scope: "general",
      store: "",
      reason: "",
      text: "Hello {name}, we have a special offer at {store} this week that may suit what you liked. Would you like me to share the details?"
    },
    {
      name: "Price concern",
      scope: "reason",
      store: "",
      reason: "Price too high",
      text: "Hello {name}, thank you for visiting {store}. We may have options closer to your budget — would you like me to show you a few?"
    }
  ];

  // ── pure helpers (sync — unchanged) ─────────────────────────────────────────

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // padStart polyfill-safe wrapper
  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function todayLocalSafe() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // PURE: scope partition + dedup over a templates ARRAY. Byte-identical to the
  // old applicableTemplates(state, record) body — generals first (insertion
  // order), then store matches, then reason matches, deduped by id (first wins).
  function applicableTemplatesPure(templates, record) {
    if (!Array.isArray(templates) || !record) return [];
    var seen = {};
    var generals = [];
    var stores = [];
    var reasons = [];
    templates.forEach(function (t) {
      if (!t.active) return;
      if (t.scope === "general") {
        generals.push(t);
      } else if (t.scope === "store" && record.store && t.store === record.store) {
        stores.push(t);
      } else if (t.scope === "reason" && record.reason && t.reason === record.reason) {
        reasons.push(t);
      }
    });
    var result = [];
    generals.concat(stores).concat(reasons).forEach(function (t) {
      if (!seen[t.id]) {
        seen[t.id] = true;
        result.push(t);
      }
    });
    return result;
  }

  // PURE: unchanged. Replaces {name}/{store}/{reason}/{brand}/{category}/{date}/
  // {followDate}/{mobile}; unknown keys -> "". {date} uses the device locale's
  // en-IN date string for "now" (frozen clock under test).
  function fillTemplate(text, record) {
    if (typeof text !== "string") return "";
    if (!record || typeof record !== "object") record = {};
    var today = new Date().toLocaleDateString("en-IN");
    var map = {
      name: record.customerName || "",
      store: record.store || "",
      reason: record.reason || "",
      brand: record.brand || "",
      category: record.category || "",
      date: today,
      followDate: record.followDate || "",
      mobile: record.mobile || ""
    };
    try {
      return text.replace(/\{(\w+)\}/g, function (match, key) {
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : "";
      });
    } catch (e) {
      return text;
    }
  }

  function waUrl(mobile, text) {
    if (typeof mobile !== "string" || !MOBILE_RE.test(mobile)) return "";
    try {
      return "https://wa.me/91" + mobile + "?text=" + encodeURIComponent(text || "");
    } catch (e) {
      return "";
    }
  }

  function smsUrl(mobile, text) {
    if (typeof mobile !== "string" || !MOBILE_RE.test(mobile)) return "";
    try {
      return "sms:+91" + mobile + "?body=" + encodeURIComponent(text || "");
    } catch (e) {
      return "";
    }
  }

  // PURE: filter a commsLog ARRAY by recordId + GREETOR role-scope. Byte-identical
  // to the old log(state, opts) body (Audit R3 anti-poaching: a GREETOR sees only
  // messages they sent; Manager/Owner see the full log).
  function logFilterPure(rows, opts) {
    if (!Array.isArray(rows)) return [];
    if (opts && opts.recordId) {
      rows = rows.filter(function (e) { return e.recordId === opts.recordId; });
    }
    if (opts && opts.auth && opts.auth.role === "GREETOR") {
      rows = rows.filter(function (e) { return e.byUserId === opts.auth.id; });
    }
    return rows;
  }

  // PURE: the whole end-of-day roll-up over a records ARRAY. Byte-identical to the
  // old endOfDaySummary body from the day-filter onward (the async wrapper does
  // the visitDate / GREETOR filtering, then hands the day's records here). Kept as
  // a pure function so the multiline string, top-3 reason ordering, per-greetor
  // counts and INR formatting are reproduced exactly.
  function summarizeDay(dayRecords, date) {
    var total = dayRecords.length;
    var conversions = dayRecords.filter(function (r) {
      return r.convertedAt || r.leadStatus === "Converted";
    });
    var totalSale = conversions.reduce(function (sum, r) {
      return sum + (parseFloat(r.saleValue) || 0);
    }, 0);

    var formatINR;
    try {
      formatINR =
        root.Customers && typeof root.Customers.formatINR === "function"
          ? root.Customers.formatINR
          : null;
    } catch (e) {
      formatINR = null;
    }
    var saleStr = formatINR ? formatINR(totalSale) : "₹" + totalSale;

    // top 3 reasons
    var reasonCounts = {};
    dayRecords.forEach(function (r) {
      if (r.reason) {
        reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
      }
    });
    var reasonEntries = Object.keys(reasonCounts).map(function (k) {
      return { name: k, count: reasonCounts[k] };
    });
    reasonEntries.sort(function (a, b) { return b.count - a.count; });
    var top3 = reasonEntries.slice(0, 3);

    // per-greetor counts
    var greetorCounts = {};
    dayRecords.forEach(function (r) {
      var name = r.createdByName || "Unknown";
      greetorCounts[name] = (greetorCounts[name] || 0) + 1;
    });

    var lines = [];
    lines.push("Saagar Greetor — " + date);
    lines.push("Total walk-ins: " + total);
    lines.push(
      "Conversions: " +
        conversions.length +
        " | Total sale: " +
        saleStr
    );
    if (top3.length > 0) {
      lines.push("Top reasons:");
      top3.forEach(function (r) {
        lines.push("  " + r.name + " x" + r.count);
      });
    }
    var greetorNames = Object.keys(greetorCounts);
    if (greetorNames.length > 0) {
      lines.push("Per greetor:");
      greetorNames.forEach(function (name) {
        lines.push("  " + name + ": " + greetorCounts[name]);
      });
    }
    lines.push("— Saagar Greetor");
    return lines.join("\n");
  }

  // ── async, DB-backed API ────────────────────────────────────────────────────

  // ensureSeeded — idempotent. On a pristine DB (no templates) inserts the 4
  // SEED_TEMPLATES with app-generated ids (uid(), deterministic under the frozen
  // clock) and active=true; on a seeded DB (count > 0) it is a no-op. Side effect
  // only — returns nothing (the DB mutation IS the result), mirroring the spec.
  async function ensureSeeded() {
    try {
      var existing = await repo().commsTemplates.all();
      if (Array.isArray(existing) && existing.length > 0) return; // already seeded
      for (var i = 0; i < SEED_TEMPLATES.length; i++) {
        var t = SEED_TEMPLATES[i];
        await repo().commsTemplates.insert({
          id: uid(),
          name: t.name,
          scope: t.scope,
          store: t.store,
          reason: t.reason,
          text: t.text,
          active: true
        });
      }
    } catch (e) {}
  }

  // rawTemplates — all templates (active + inactive), ORDER BY ord. Old sig was
  // sync over state.commsTemplates; now async over the table. Returns the same
  // domain objects (DBSchema.rowToTmpl) in the same order.
  async function rawTemplates() {
    try {
      return await repo().commsTemplates.all();
    } catch (e) {
      return [];
    }
  }

  // applicableTemplates — fetch active+inactive templates (ORDER BY ord) then run
  // the EXACT pure partition. SQL does NOT pre-filter: the scope/dedup logic is
  // pure JS only (so insertion order and first-wins dedup are byte-identical).
  // opts is accepted for forward-compat with the spec signature; unused here.
  async function applicableTemplates(record, opts) {
    try {
      if (!record) return [];
      var templates = await repo().commsTemplates.all();
      return applicableTemplatesPure(templates, record);
    } catch (e) {
      return [];
    }
  }

  // addTemplate — insert a new active template. Validates name+text like the old
  // helper (returns null on missing/blank), generates the id, and returns the
  // inserted domain object. Scope/store/reason default exactly as before.
  async function addTemplate(fields) {
    if (!fields) return null;
    var name = (fields.name || "").trim();
    var text = (fields.text || "").trim();
    if (!name || !text) return null;
    var t = {
      id: uid(),
      name: name,
      scope: fields.scope || "general",
      store: fields.store || "",
      reason: fields.reason || "",
      text: text,
      active: true
    };
    try {
      var res = await repo().commsTemplates.insert(t);
      return (res && res.template) ? res.template : t;
    } catch (e) {
      return null;
    }
  }

  // updateTemplate — partial field update by id (only provided fields written).
  // Returns true if the template exists, false otherwise — same boolean contract
  // as the old helper (which scanned state.commsTemplates for the id).
  async function updateTemplate(id, fields) {
    if (!id || !fields) return false;
    try {
      var existing = await repo().commsTemplates.byId(id);
      if (!existing) return false;
      var changes = {};
      if (fields.name !== undefined) changes.name = fields.name;
      if (fields.scope !== undefined) changes.scope = fields.scope;
      if (fields.store !== undefined) changes.store = fields.store;
      if (fields.reason !== undefined) changes.reason = fields.reason;
      if (fields.text !== undefined) changes.text = fields.text;
      await repo().commsTemplates.update(id, changes);
      return true;
    } catch (e) {
      return false;
    }
  }

  // toggleTemplate — flip a template's active flag by id (no-op on unknown id),
  // matching the old in-place mutation semantics.
  async function toggleTemplate(id) {
    if (!id) return;
    try {
      var existing = await repo().commsTemplates.byId(id);
      if (!existing) return;
      await repo().commsTemplates.update(id, { active: !existing.active });
    } catch (e) {}
  }

  // removeTemplate — delete a template by id (no-op on unknown id).
  async function removeTemplate(id) {
    if (!id) return;
    try {
      await repo().commsTemplates["delete"](id);
    } catch (e) {}
  }

  // logMessage — append a message-log entry. Stamps id (uid()) + at (now ISO) at
  // call time and copies all caller fields verbatim, EXACTLY like the old
  // logMessage(state, entry) — so the returned entry's shape/keys are identical.
  // The built entry is persisted via Repo (comms_log) and returned. Role-scoping
  // is the CALLER's responsibility (old log() does the scoping on read).
  async function logMessage(entry) {
    var logEntry = {};
    logEntry.id = uid();
    logEntry.at = nowISO();
    // copy all fields from entry verbatim (byUserId, byName, channel, recordId,
    // mobile, customerName, templateId, templateName, text, ts, …)
    var keys = Object.keys(entry || {});
    for (var i = 0; i < keys.length; i++) {
      logEntry[keys[i]] = entry[keys[i]];
    }
    try {
      await repo().commsLog.insert(logEntry);
    } catch (e) {}
    return logEntry;
  }

  // log — read the message log, filtered by recordId and/or GREETOR role-scope.
  // Fetch all entries (ORDER BY ord == original app-order) then reuse the EXACT
  // pure filter. NOTE: the old in-memory log unshifted new entries (newest first)
  // and the DB returns ord-order; the byte-identity contract is over the SEED's
  // stored ord-order, which the harness mints from the same DB rows.
  async function log(opts) {
    try {
      var rows = await repo().commsLog.all();
      return logFilterPure(rows, opts);
    } catch (e) {
      return [];
    }
  }

  // endOfDaySummary — fetch all records, filter to the target day (and to the
  // GREETOR's own records when scoped), then run the EXACT pure roll-up. dateStr
  // defaults to today (frozen clock under test). Output is the same multiline
  // string the old endOfDaySummary(state, …) produced.
  async function endOfDaySummary(dateStr, role, userId) {
    try {
      var date = dateStr || todayLocalSafe();
      var allRecords = await repo().records.all();
      var dayRecords = (Array.isArray(allRecords) ? allRecords : []).filter(function (r) {
        return r && r.visitDate === date;
      });
      if (role === "GREETOR" && userId) {
        dayRecords = dayRecords.filter(function (r) {
          return r.createdByUserId === userId;
        });
      }
      return summarizeDay(dayRecords, date);
    } catch (e) {
      return "";
    }
  }

  // ── public API (window.Comms, dual-export) ──────────────────────────────────
  var api = {
    // pure helpers (sync) — exported unchanged for sync callers + diff-harness
    uid: uid,
    touch: function (state) { return state; },
    fillTemplate: fillTemplate,
    waUrl: waUrl,
    smsUrl: smsUrl,

    // async, DB-backed (new signatures drop the state arg, query via Repo)
    ensureSeeded: ensureSeeded,
    rawTemplates: rawTemplates,
    applicableTemplates: applicableTemplates,
    addTemplate: addTemplate,
    updateTemplate: updateTemplate,
    toggleTemplate: toggleTemplate,
    removeTemplate: removeTemplate,
    logMessage: logMessage,
    log: log,
    endOfDaySummary: endOfDaySummary,

    // pure transforms exposed for the diff-harness (verify DB path == JS path)
    applicableTemplatesPure: applicableTemplatesPure,
    logFilterPure: logFilterPure,
    summarizeDay: summarizeDay
  };

  root.Comms = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof window !== "undefined" ? window : globalThis));
