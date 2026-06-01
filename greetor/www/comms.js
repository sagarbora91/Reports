/* comms.js — Saagar Greetor: pure data/helper layer for customer communication.
   No DOM, no imports. Loaded as a plain <script>. Teammates own index.html + comms-ui.js. */
(function () {
  "use strict";

  var MOBILE_RE = /^[6-9]\d{9}$/;

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

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function todayLocal() {
    var d = new Date();
    var yy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart("0", 2);
    var dd = String(d.getDate()).padStart("0", 2);
    return yy + "-" + mm + "-" + dd;
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

  function ensureSeeded(state) {
    if (!state) return state;
    if (!Array.isArray(state.commsLog)) {
      state.commsLog = [];
    }
    if (!Array.isArray(state.commsTemplates) || state.commsTemplates.length === 0) {
      state.commsTemplates = SEED_TEMPLATES.map(function (t) {
        return {
          id: uid(),
          name: t.name,
          scope: t.scope,
          store: t.store,
          reason: t.reason,
          text: t.text,
          active: true
        };
      });
    }
    return state;
  }

  function rawTemplates(state) {
    if (!state || !Array.isArray(state.commsTemplates)) return [];
    return state.commsTemplates.slice();
  }

  function applicableTemplates(state, record) {
    if (!state || !Array.isArray(state.commsTemplates) || !record) return [];
    var seen = {};
    var generals = [];
    var stores = [];
    var reasons = [];
    state.commsTemplates.forEach(function (t) {
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

  function addTemplate(state, fields) {
    if (!state || !fields) return null;
    var name = (fields.name || "").trim();
    var text = (fields.text || "").trim();
    if (!name || !text) return null;
    if (!Array.isArray(state.commsTemplates)) state.commsTemplates = [];
    var t = {
      id: uid(),
      name: name,
      scope: fields.scope || "general",
      store: fields.store || "",
      reason: fields.reason || "",
      text: text,
      active: true
    };
    state.commsTemplates.push(t);
    return t;
  }

  function updateTemplate(state, id, fields) {
    if (!state || !id || !fields) return false;
    if (!Array.isArray(state.commsTemplates)) return false;
    for (var i = 0; i < state.commsTemplates.length; i++) {
      if (state.commsTemplates[i].id === id) {
        var t = state.commsTemplates[i];
        if (fields.name !== undefined) t.name = fields.name;
        if (fields.scope !== undefined) t.scope = fields.scope;
        if (fields.store !== undefined) t.store = fields.store;
        if (fields.reason !== undefined) t.reason = fields.reason;
        if (fields.text !== undefined) t.text = fields.text;
        return true;
      }
    }
    return false;
  }

  function toggleTemplate(state, id) {
    if (!state || !id) return;
    if (!Array.isArray(state.commsTemplates)) return;
    for (var i = 0; i < state.commsTemplates.length; i++) {
      if (state.commsTemplates[i].id === id) {
        state.commsTemplates[i].active = !state.commsTemplates[i].active;
        return;
      }
    }
  }

  function removeTemplate(state, id) {
    if (!state || !id) return;
    if (!Array.isArray(state.commsTemplates)) return;
    state.commsTemplates = state.commsTemplates.filter(function (t) {
      return t.id !== id;
    });
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

  function logMessage(state, entry) {
    if (!state) return null;
    if (!Array.isArray(state.commsLog)) state.commsLog = [];
    var logEntry = {};
    logEntry.id = uid();
    logEntry.at = nowISO();
    // copy all fields from entry
    var keys = Object.keys(entry || {});
    for (var i = 0; i < keys.length; i++) {
      logEntry[keys[i]] = entry[keys[i]];
    }
    state.commsLog.unshift(logEntry);
    if (state.commsLog.length > 2000) {
      state.commsLog = state.commsLog.slice(0, 2000);
    }
    return logEntry;
  }

  function log(state, opts) {
    if (!state || !Array.isArray(state.commsLog)) return [];
    var rows = state.commsLog;
    if (opts && opts.recordId) {
      rows = rows.filter(function (e) { return e.recordId === opts.recordId; });
    }
    // Audit R3 (DPDP / anti-poaching): scope at the data layer so EVERY caller
    // — not just renderLog — respects it. A GREETOR sees only messages they
    // sent; Manager/Owner see the full log for oversight.
    if (opts && opts.auth && opts.auth.role === 'GREETOR') {
      rows = rows.filter(function (e) { return e.byUserId === opts.auth.id; });
    }
    return rows;
  }

  function endOfDaySummary(state, dateStr, role, userId) {
    try {
      if (!state) return "";
      var date = dateStr || todayLocalSafe();
      var allRecords = Array.isArray(state.records) ? state.records : [];
      var dayRecords = allRecords.filter(function (r) {
        return r && r.visitDate === date;
      });
      if (role === "GREETOR" && userId) {
        dayRecords = dayRecords.filter(function (r) {
          return r.createdByUserId === userId;
        });
      }

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
          window.Customers && typeof window.Customers.formatINR === "function"
            ? window.Customers.formatINR
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
    } catch (e) {
      return "";
    }
  }

  window.Comms = {
    uid: uid,
    touch: function (state) { return state; },
    ensureSeeded: ensureSeeded,
    rawTemplates: rawTemplates,
    applicableTemplates: applicableTemplates,
    fillTemplate: fillTemplate,
    addTemplate: addTemplate,
    updateTemplate: updateTemplate,
    toggleTemplate: toggleTemplate,
    removeTemplate: removeTemplate,
    waUrl: waUrl,
    smsUrl: smsUrl,
    logMessage: logMessage,
    log: log,
    endOfDaySummary: endOfDaySummary
  };
}());
