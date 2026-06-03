/* db-schema.js — pure (no-plugin) SQLite schema + object↔row mappers for
   Saagar Greetor. The ONE place that defines how the app's state maps to
   relational rows. Used by the repo at runtime AND by the Node round-trip
   test that proves the mapping is lossless (no data corruption by design).
   Sets window.DBSchema; also module.exports for Node. */
(function (root) {
  "use strict";

  // ── DDL ──────────────────────────────────────────────────────────────────
  var SCHEMA = [
    "CREATE TABLE IF NOT EXISTS records (recordId TEXT PRIMARY KEY, createdAt TEXT, updatedAt TEXT, createdByUserId TEXT, createdByName TEXT, store TEXT, visitDate TEXT, visitTime TEXT, source TEXT, mobile TEXT, customerName TEXT, customerType TEXT, category TEXT, subCategory TEXT, brand TEXT, gender TEXT, occasion TEXT, budget TEXT, urgency TEXT, greetor TEXT, cro TEXT, reason TEXT, competitor TEXT, remarks TEXT, followUp TEXT, leadStatus TEXT, followDate TEXT, followTime TEXT, consent_at TEXT, saleValue REAL, convertedAt TEXT, quick INTEGER, photos TEXT, ord INTEGER)",
    "CREATE INDEX IF NOT EXISTS idx_records_visitDate ON records(visitDate)",
    "CREATE INDEX IF NOT EXISTS idx_records_mobile ON records(mobile)",
    "CREATE INDEX IF NOT EXISTS idx_records_leadStatus ON records(leadStatus)",
    "CREATE INDEX IF NOT EXISTS idx_records_createdBy ON records(createdByUserId)",
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, role TEXT, pin_salt TEXT, pin_hash TEXT, created_at TEXT, is_active INTEGER, phone TEXT, ord INTEGER)",
    "CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, at TEXT, userId TEXT, userName TEXT, role TEXT, action TEXT, summary TEXT, detail TEXT, ord INTEGER)",
    "CREATE TABLE IF NOT EXISTS comms_log (id TEXT PRIMARY KEY, at TEXT, byUserId TEXT, byName TEXT, channel TEXT, recordId TEXT, mobile TEXT, customerName TEXT, templateId TEXT, templateName TEXT, text TEXT, ts TEXT, ord INTEGER)",
    "CREATE TABLE IF NOT EXISTS comms_templates (id TEXT PRIMARY KEY, name TEXT, scope TEXT, store TEXT, reason TEXT, text TEXT, active INTEGER, ord INTEGER)",
    "CREATE TABLE IF NOT EXISTS footfall (store TEXT, date TEXT, count INTEGER, byUserId TEXT, byName TEXT, at TEXT, PRIMARY KEY(store,date))",
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
  ];

  // Explicit record column order (mappers + INSERT rely on this).
  var REC_COLS = ["recordId","createdAt","updatedAt","createdByUserId","createdByName","store","visitDate","visitTime","source","mobile","customerName","customerType","category","subCategory","brand","gender","occasion","budget","urgency","greetor","cro","reason","competitor","remarks","followUp","leadStatus","followDate","followTime","consent_at","saleValue","convertedAt","quick","photos","ord"];
  // Plain string fields that always exist on a record (copied verbatim).
  var REC_STR = ["recordId","createdAt","updatedAt","createdByUserId","createdByName","store","visitDate","visitTime","source","mobile","customerName","customerType","category","subCategory","brand","gender","occasion","budget","urgency","greetor","cro","reason","competitor","remarks","followUp","leadStatus","followDate","followTime","consent_at"];

  function recordToRow(rec, ord) {
    var row = {};
    for (var i = 0; i < REC_STR.length; i++) { var k = REC_STR[i]; row[k] = (rec[k] != null ? rec[k] : (k === "consent_at" ? "" : "")); }
    row.saleValue = (typeof rec.saleValue === "number") ? rec.saleValue : null;
    row.convertedAt = rec.convertedAt != null && rec.convertedAt !== "" ? rec.convertedAt : null;
    row.quick = rec.quick ? 1 : null;
    row.photos = JSON.stringify(Array.isArray(rec.photos) ? rec.photos : []);
    row.ord = ord;
    return row;
  }
  function rowToRecord(r) {
    var rec = {};
    for (var i = 0; i < REC_STR.length; i++) { var k = REC_STR[i]; rec[k] = r[k] != null ? r[k] : ""; }
    rec.photos = r.photos ? JSON.parse(r.photos) : [];
    if (r.saleValue != null) rec.saleValue = r.saleValue;
    if (r.convertedAt != null && r.convertedAt !== "") rec.convertedAt = r.convertedAt;
    if (r.quick === 1 || r.quick === true) rec.quick = true;
    return rec;
  }

  function userToRow(u, ord) {
    return { id: u.id, name: u.name, role: u.role, pin_salt: u.pin_salt, pin_hash: u.pin_hash,
      created_at: u.created_at || null, is_active: u.is_active ? 1 : 0, phone: u.phone != null ? u.phone : null, ord: ord };
  }
  function rowToUser(r) {
    var u = { id: r.id, name: r.name, role: r.role, pin_salt: r.pin_salt, pin_hash: r.pin_hash,
      created_at: r.created_at, is_active: r.is_active === 1 || r.is_active === true };
    if (r.phone != null) u.phone = r.phone;
    return u;
  }

  function auditToRow(a, ord) {
    return { id: a.id, at: a.at, userId: a.userId != null ? a.userId : null, userName: a.userName != null ? a.userName : null,
      role: a.role != null ? a.role : null, action: a.action, summary: a.summary != null ? a.summary : "",
      detail: a.detail != null ? JSON.stringify(a.detail) : null, ord: ord };
  }
  function rowToAudit(r) {
    return { id: r.id, at: r.at, userId: r.userId, userName: r.userName, role: r.role,
      action: r.action, summary: r.summary != null ? r.summary : "", detail: r.detail != null ? JSON.parse(r.detail) : null };
  }

  var CLOG = ["id","at","byUserId","byName","channel","recordId","mobile","customerName","templateId","templateName","text","ts"];
  function commsLogToRow(e, ord) {
    var row = {}; for (var i = 0; i < CLOG.length; i++) { var k = CLOG[i]; row[k === "ts" ? "ts" : k] = e[k === "ts" ? "ts" : k] != null ? e[k === "ts" ? "ts" : k] : null; }
    // 'ts' column mirrors entry.timestamp if present, else entry.ts
    row.ts = (e.ts != null ? e.ts : (e.timestamp != null ? e.timestamp : null));
    row.ord = ord; return row;
  }
  function rowToCommsLog(r) {
    var e = {};
    ["id","at","byUserId","byName","channel","recordId","mobile","customerName","templateId","templateName","text"].forEach(function (k) { if (r[k] != null) e[k] = r[k]; });
    if (r.ts != null) e.timestamp = r.ts;
    return e;
  }

  function tmplToRow(t, ord) {
    return { id: t.id, name: t.name, scope: t.scope, store: t.store != null ? t.store : "", reason: t.reason != null ? t.reason : "",
      text: t.text, active: t.active ? 1 : 0, ord: ord };
  }
  function rowToTmpl(r) {
    return { id: r.id, name: r.name, scope: r.scope, store: r.store != null ? r.store : "", reason: r.reason != null ? r.reason : "",
      text: r.text, active: r.active === 1 || r.active === true };
  }

  function footfallToRow(e) {
    return { store: e.store, date: e.date, count: (typeof e.count === "number" ? e.count : 0),
      byUserId: e.byUserId != null ? e.byUserId : null, byName: e.byName != null ? e.byName : null, at: e.at != null ? e.at : null };
  }
  function rowToFootfall(r) {
    var e = { store: r.store, date: r.date, count: r.count, byUserId: r.byUserId, byName: r.byName, at: r.at };
    return e;
  }

  // ── whole-state ↔ table rows ──────────────────────────────────────────────
  function disassemble(state) {
    var out = { records: [], users: [], audit_log: [], comms_log: [], comms_templates: [], footfall: [], meta: [] };
    (state.records || []).forEach(function (r, i) { out.records.push(recordToRow(r, i)); });
    (state.users || []).forEach(function (u, i) { out.users.push(userToRow(u, i)); });
    (state.auditLog || []).forEach(function (a, i) { out.audit_log.push(auditToRow(a, i)); });
    (state.commsLog || []).forEach(function (e, i) { out.comms_log.push(commsLogToRow(e, i)); });
    (state.commsTemplates || []).forEach(function (t, i) { out.comms_templates.push(tmplToRow(t, i)); });
    var ff = (state.footfall && state.footfall.entries) || {};
    Object.keys(ff).forEach(function (k) { out.footfall.push(footfallToRow(ff[k])); });
    // config singletons → meta
    out.meta.push({ key: "masters", value: JSON.stringify(state.masters != null ? state.masters : null) });
    out.meta.push({ key: "targets", value: JSON.stringify(state.targets != null ? state.targets : null) });
    out.meta.push({ key: "settings", value: JSON.stringify({
      current_user_id: state.current_user_id != null ? state.current_user_id : null,
      my_store: state.my_store != null ? state.my_store : null,
      reminder_enabled: state.reminder_enabled !== false
    }) });
    return out;
  }

  function assemble(t) {
    var metaMap = {};
    (t.meta || []).forEach(function (m) { try { metaMap[m.key] = JSON.parse(m.value); } catch (e) { metaMap[m.key] = null; } });
    var settings = metaMap.settings || {};
    var state = {
      users: (t.users || []).slice().sort(byOrd).map(rowToUser),
      current_user_id: settings.current_user_id != null ? settings.current_user_id : null,
      my_store: settings.my_store != null ? settings.my_store : null,
      records: (t.records || []).slice().sort(byOrd).map(rowToRecord),
      reminder_enabled: settings.reminder_enabled !== false,
      auditLog: (t.audit_log || []).slice().sort(byOrd).map(rowToAudit),
      masters: metaMap.masters != null ? metaMap.masters : undefined,
      commsTemplates: (t.comms_templates || []).slice().sort(byOrd).map(rowToTmpl),
      commsLog: (t.comms_log || []).slice().sort(byOrd).map(rowToCommsLog),
      targets: metaMap.targets != null ? metaMap.targets : undefined,
      footfall: { entries: {} }
    };
    (t.footfall || []).forEach(function (r) { state.footfall.entries[r.store + "|" + r.date] = rowToFootfall(r); });
    // drop undefined masters/targets keys so assemble matches a state that lacked them
    if (state.masters === undefined) delete state.masters;
    if (state.targets === undefined) delete state.targets;
    return state;
  }
  function byOrd(a, b) { return (a.ord || 0) - (b.ord || 0); }

  var api = {
    SCHEMA: SCHEMA, REC_COLS: REC_COLS,
    recordToRow: recordToRow, rowToRecord: rowToRecord,
    userToRow: userToRow, rowToUser: rowToUser,
    auditToRow: auditToRow, rowToAudit: rowToAudit,
    commsLogToRow: commsLogToRow, rowToCommsLog: rowToCommsLog,
    tmplToRow: tmplToRow, rowToTmpl: rowToTmpl,
    footfallToRow: footfallToRow, rowToFootfall: rowToFootfall,
    disassemble: disassemble, assemble: assemble
  };
  root.DBSchema = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
