'use strict';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORE_KEY = 'saagar_audit_v1';

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Store.empty();
      const s = JSON.parse(raw);
      return Object.assign(Store.empty(), s);
    } catch (e) {
      console.error('localStorage corrupted, resetting', e);
      return Store.empty();
    }
  },
  save(s) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) {
      // Most common cause: localStorage quota (~5 MB). Hits when many photos
      // accumulate. We surface a toast but DON'T crash the flow — caller can
      // decide whether to retry, clear old data, etc.
      console.error('Store.save failed:', e);
      if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) {
        try {
          const t = document.getElementById('toast');
          if (t) {
            t.textContent = 'Storage full — export and clear old audits';
            t.hidden = false;
            setTimeout(() => { t.hidden = true; }, 4000);
          }
        } catch (_) {}
      }
      throw e;
    }
  },
  empty() {
    return {
      audits: [],
      cros: [],
      users: [],
      caps: [],
      escalations: [],
      templates: [],          // audit templates (editable checklists)
      current_audit_id: null,
      current_user_id: null,
      auditor_name: '',
    };
  },
};

// ---------------------------------------------------------------------------
// Audit templates — checklists are DATA now, not code. Built-ins (daily,
// weekly) are seeded from the factory constants below; the user can edit them
// and create new daily/weekly/monthly/custom templates in the builder UI.
//
// Template shape:
//   { id, name, name_mr, frequency, cro_mode, built_in, active,
//     sections: [ {id, name, name_mr, critical} ],
//     checkpoints: [ {id, section_id, text, text_mr, evidence, weight,
//                     critical, allows_na, photo_required_on_fail, order} ],
//     created_at, updated_at, version }
//
//   frequency : 'daily' | 'weekly' | 'monthly' | 'custom'
//   cro_mode  : 'store'  (one score)
//             | 'per_cro' (run the whole checklist once per CRO)
//             | 'matrix'  (mark every checkpoint P/F/NA per CRO; per-CRO score)
// ---------------------------------------------------------------------------

// Factory default DAILY template — rebuilt from the code constants so
// "reset to default" always has a clean source of truth.
function factoryDailyTemplate() {
  const sections = SOPS.slice().sort((a, b) => a.display_order - b.display_order)
    .map(s => ({ id: s.id, name: s.name, name_mr: tSop(s.id, s.name), critical: !!s.critical }));
  const checkpoints = CHECKPOINTS.slice()
    .sort((a, b) => a.order - b.order)
    .map(c => ({
      id: c.id, section_id: c.sop_id,
      text: c.text, text_mr: tCheckpoint(c.id, c.text),
      evidence: c.evidence || '',
      weight: c.weight, critical: !!c.critical,
      allows_na: !!c.allows_na,
      photo_required_on_fail: !!c.photo_required_on_fail,
      order: c.order,
    }));
  return {
    id: 'tpl_daily', name: 'Daily Audit', name_mr: 'दैनिक ऑडिट',
    frequency: 'daily', cro_mode: 'store', built_in: true, active: true,
    sections, checkpoints,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1,
  };
}

// Factory default WEEKLY template — from WEEKLY_CHECKPOINTS (grouped).
function factoryWeeklyTemplate() {
  const groupOrder = ['operations', 'cash_weekly', 'reporting_service', 'inventory_weekly'];
  const seen = {};
  const sections = [];
  WEEKLY_CHECKPOINTS.forEach(c => {
    if (!seen[c.group]) {
      seen[c.group] = true;
      sections.push({ id: c.group, name: c.group_en, name_mr: c.group_mr || c.group_en, critical: !!c.critical });
    }
  });
  sections.sort((a, b) => groupOrder.indexOf(a.id) - groupOrder.indexOf(b.id));
  const checkpoints = WEEKLY_CHECKPOINTS.slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((c, i) => ({
      id: c.id, section_id: c.group,
      text: c.text, text_mr: c.text_mr || '',
      evidence: c.evidence || '',
      weight: c.weight, critical: !!c.critical,
      allows_na: !!c.allows_na,
      photo_required_on_fail: !!c.photo_required_on_fail,
      order: i + 1,
    }));
  return {
    id: 'tpl_weekly', name: 'Weekly Audit', name_mr: 'साप्ताहिक ऑडिट',
    frequency: 'weekly', cro_mode: 'store', built_in: true, active: true,
    sections, checkpoints,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1,
  };
}

const Templates = {
  all(state) { return (state || Store.load()).templates || []; },
  active(state) { return Templates.all(state).filter(t => t.active); },
  byId(state, id) { return Templates.all(state).find(t => t.id === id) || null; },

  // Seed built-ins on first run (or restore a deleted built-in).
  ensureSeeded() {
    const state = Store.load();
    state.templates = state.templates || [];
    let changed = false;
    if (!state.templates.some(t => t.id === 'tpl_daily')) {
      state.templates.push(factoryDailyTemplate()); changed = true;
    }
    if (!state.templates.some(t => t.id === 'tpl_weekly')) {
      state.templates.push(factoryWeeklyTemplate()); changed = true;
    }
    if (changed) Store.save(state);
  },

  save(tpl) {
    const state = Store.load();
    tpl.updated_at = new Date().toISOString();
    const i = state.templates.findIndex(t => t.id === tpl.id);
    if (i >= 0) state.templates[i] = tpl; else state.templates.push(tpl);
    Store.save(state);
  },

  create({ name, frequency, cro_mode }) {
    const state = Store.load();
    const tpl = {
      id: 'tpl_' + uuid(),
      name: name || 'New audit',
      name_mr: '',
      frequency: frequency || 'daily',
      cro_mode: cro_mode || 'store',
      built_in: false, active: true,
      sections: [{ id: 's_' + uuid(), name: 'Section 1', name_mr: '', critical: false }],
      checkpoints: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1,
    };
    state.templates.push(tpl);
    Store.save(state);
    return tpl;
  },

  remove(id) {
    const state = Store.load();
    state.templates = state.templates.filter(t => t.id !== id);
    Store.save(state);
  },

  resetToDefault(id) {
    if (id === 'tpl_daily') Templates.save(factoryDailyTemplate());
    else if (id === 'tpl_weekly') Templates.save(factoryWeeklyTemplate());
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() { return new Date().toISOString().slice(0, 10); }

// Daily-reminder toggle in Settings. Delegates to SaagarShell so the
// scheduling logic stays in one place.
window.onDailyReminderToggle = async function (on) {
  if (!window.SaagarShell) return;
  window.SaagarShell.setDailyReminderEnabled(on);
  try {
    if (on) {
      const ok = await window.SaagarShell.scheduleDailyReminder();
      if (ok) {
        toast('Daily reminder set for 10:00 AM');
      } else {
        toast('Could not schedule — check notification permission');
        // Roll the checkbox back so the UI matches the real state.
        window.SaagarShell.setDailyReminderEnabled(false);
        const cb = document.getElementById('dailyReminderToggle');
        if (cb) cb.checked = false;
      }
    } else {
      await window.SaagarShell.cancelDailyReminder();
      toast('Daily reminder turned off');
    }
  } catch (e) {
    console.error(e);
    toast('Reminder change failed');
  }
};

// Show/hide the backdate reason field whenever the audit date != today.
// Inlined onchange so it survives renderAuditTab re-renders.
window.toggleBackdateField = function () {
  const dateEl = document.getElementById('auditDate');
  const field  = document.getElementById('backdateField');
  if (!dateEl || !field) return;
  const isBackdated = dateEl.value && dateEl.value !== today();
  field.hidden = !isBackdated;
  if (isBackdated) {
    const ta = document.getElementById('backdateReason');
    if (ta && document.activeElement !== ta) ta.focus();
  }
};

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------------------------------------------------------------------
// CAPs — Corrective Action Plans (spec §9)
//
// Every audit FAIL spawns a CAP. CAP lifecycle:
//   open → done → verified → closed
//   open → aged (auto, when deadline < today)
//   done → open (GM rejects verification)
//
// Roles: anyone can mark Done. Only GM / Owner verify, reject or close.
// ---------------------------------------------------------------------------

const CAP_STATUSES = ['open', 'done', 'verified', 'closed', 'aged'];
// Backwards-compat: callers that read CAP_STATUS_LABEL[s] will keep working
// in English. New callers should use tCapStatus(s) for the localized label.
const CAP_STATUS_LABEL = new Proxy(
  { open: 'Open', done: 'Done', verified: 'Verified', closed: 'Closed', aged: 'Aged' },
  { get(target, prop) { return typeof I18n !== 'undefined' ? tCapStatus(prop) : target[prop]; } }
);

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function nextCapId(existingCaps, dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const week = isoWeekOf(d);
  const prefix = `CAP-${year}-W${String(week).padStart(2, '0')}-`;
  const used = existingCaps
    .map(c => c.id || '')
    .filter(id => id.startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return prefix + String(next).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Walks an audit's results and creates one CAP per FAIL.
function autoCreateCapsForAudit(audit) {
  const state = Store.load();
  const existing = state.caps || [];
  // Skip if CAPs for this audit already exist (replay-safe).
  if (existing.some(c => c.audit_id === audit.id)) return [];

  const deadline = addDays(audit.date, 7);
  const newCaps = [];
  const cps = checkpointsFor(audit);
  const cpById = {};
  cps.forEach(c => { cpById[c.id] = c; });

  // Collect FAILs from whichever results shape this audit uses.
  const fails = []; // { cpId, r }
  if (auditIsPerCro(audit)) {
    Object.keys(audit.cro_results || {}).forEach(croId => {
      Object.entries(audit.cro_results[croId]).forEach(([cpId, r]) => {
        if (r.result === 'F') fails.push({ cpId, r: Object.assign({}, r, { cro_id: croId }) });
      });
    });
  } else {
    Object.entries(audit.results || {}).forEach(([cpId, r]) => {
      if (r.result === 'F') fails.push({ cpId, r });
    });
  }

  fails.forEach(({ cpId, r }) => {
    const cp = cpById[cpId]
      || CHECKPOINTS.find(c => c.id === cpId)
      || WEEKLY_CHECKPOINTS.find(c => c.id === cpId);
    if (!cp) return;
    newCaps.push({
      id: nextCapId(existing.concat(newCaps), audit.date),
      audit_id: audit.id,
      audit_date: audit.date,
      checkpoint_id: cpId,
      sop_id: cp.section_id || cp.sop_id || cp.group || null,
      finding: r.finding || '',
      cro_id: r.cro_id || null,
      photos: r.photos || [],
      why1: '', why2: '', why3: '', why4: '', why5: '',
      root_cause: '',
      action_steps: [],
      responsible_user_id: audit.auditor_id || null,
      deadline,
      status: 'open',
      created_at: new Date().toISOString(),
      done_at: null,
      verified_at: null, verified_by: null, verify_notes: null,
      closed_at: null, closed_by: null,
    });
  });
  state.caps = existing.concat(newCaps);
  Store.save(state);
  return newCaps;
}

// Age open CAPs whose deadline has passed. Idempotent — call on every render.
function ageOverdueCaps() {
  const state = Store.load();
  const t = today();
  let changed = false;
  (state.caps || []).forEach(c => {
    if (c.status === 'open' && c.deadline && c.deadline < t) {
      c.status = 'aged';
      changed = true;
    }
  });
  if (changed) Store.save(state);
}

const Caps = {
  list(state) { return state.caps || []; },
  byId(state, id) { return (state.caps || []).find(c => c.id === id) || null; },
  byAudit(state, auditId) { return (state.caps || []).filter(c => c.audit_id === auditId); },

  save(cap) {
    const state = Store.load();
    state.caps = state.caps || [];
    const i = state.caps.findIndex(c => c.id === cap.id);
    if (i >= 0) state.caps[i] = cap; else state.caps.push(cap);
    Store.save(state);
  },

  // Status transitions
  markDone(id) {
    const state = Store.load();
    const c = Caps.byId(state, id);
    if (!c) return;
    c.status = 'done';
    c.done_at = new Date().toISOString();
    Caps.save(c);
  },
  verify(id, verifiedBy, notes) {
    const state = Store.load();
    const c = Caps.byId(state, id);
    if (!c) return;
    c.status = 'verified';
    c.verified_at = new Date().toISOString();
    c.verified_by = verifiedBy;
    c.verify_notes = notes || '';
    Caps.save(c);
  },
  reject(id, rejectedBy, notes) {
    const state = Store.load();
    const c = Caps.byId(state, id);
    if (!c) return;
    c.status = 'open';
    c.done_at = null;
    c.verify_notes = notes || '';
    c.last_rejected_by = rejectedBy;
    Caps.save(c);
  },
  close(id, closedBy) {
    const state = Store.load();
    const c = Caps.byId(state, id);
    if (!c) return;
    c.status = 'closed';
    c.closed_at = new Date().toISOString();
    c.closed_by = closedBy;
    Caps.save(c);
  },
};

// ---------------------------------------------------------------------------
// Escalation engine (spec §7)
//
// Seven triggers checked at audit-submit time. Each fires a pre-composed
// 4-part English WhatsApp message (what happened / evidence / impact /
// requested action) and points at the GM or Owner phone number.
// ---------------------------------------------------------------------------

const ESC_TRIGGERS = {
  1: 'Daily Critical band',
  2: 'Recurring checkpoint failure',
  3: 'Cash variance',
  4: 'Inventory variance',
  5: 'Theft / security / legal',
  6: 'Customer complaint',
  7: 'Declining trend',
};

// Keyword sniffing — finding text gets compared to these (case-insensitive).
const T5_KEYWORDS = [
  'theft', 'thief', 'steal', 'stole', 'stolen', 'missing cash',
  'missing stock', 'missing inventory', 'police', 'lawyer', 'legal notice',
  'lawsuit', 'fraud', 'fraudulent', 'suspicious', 'tampered',
];
const T6_KEYWORDS = [
  'complaint', 'complained', 'angry customer', 'irate customer',
  'dissatisfied', 'refund denied', 'manager called', 'social media',
  'twitter', 'facebook post', 'review', 'demand',
];

function findKeyword(text, keywords) {
  if (!text) return null;
  const lower = text.toLowerCase();
  return keywords.find(k => lower.includes(k)) || null;
}

// Build a 4-part English message per Spec §7.
function composeMessage({ what, evidence, impact, action }) {
  return [
    `What happened: ${what}`,
    `Evidence: ${evidence}`,
    `Impact: ${impact}`,
    `Requested action: ${action}`,
  ].join('\n\n');
}

function fmtDateShort(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Pure: returns a list of *new* escalation drafts for this audit. Drafts have
// no id / raised_at yet — saveEscalations stamps them.
function evaluateEscalationsForAudit(audit, state) {
  const out = [];
  const score = audit.score;
  const fails = Object.entries(audit.results || {})
    .filter(([_, r]) => r.result === 'F')
    .map(([cpId, r]) => ({ cpId, ...r }));

  // -- T1: Daily Critical band (<80%) -----------------------------------
  if (score && score.pct < 80) {
    const cashOrInvFail = fails.some(f =>
      f.cpId.startsWith('6.') || f.cpId.startsWith('7.'));
    const failBySop = {};
    fails.forEach(f => {
      const cp = CHECKPOINTS.find(c => c.id === f.cpId);
      const sop = cp && SOPS.find(s => s.id === cp.sop_id);
      const key = sop ? sop.name : 'Other';
      failBySop[key] = (failBySop[key] || 0) + 1;
    });
    const sopBreakdown = Object.entries(failBySop)
      .map(([k, n]) => `${k} (${n})`).join(', ');
    out.push({
      trigger_number: 1,
      trigger_label: ESC_TRIGGERS[1],
      severity: 'critical',
      recipient_role: cashOrInvFail ? 'OWNER' : 'GM',
      message: composeMessage({
        what: `Daily audit on ${fmtDateShort(audit.date)} scored ${score.pct.toFixed(1)}% (Critical, target 90%+).`,
        evidence: `${fails.length} FAILs across ${sopBreakdown || 'multiple SOPs'}. Auditor: ${audit.auditor_name || '—'}.`,
        impact: cashOrInvFail
          ? 'Compliance band breached AND a Cash or Inventory critical FAILed — direct loss risk.'
          : 'Compliance band breached. Today\'s operations do not meet store standards.',
        action: `Review the audit in the app and call ${audit.auditor_name || 'the SM'} before tomorrow's opening.`,
      }),
    });
  }

  // -- T2: Recurring checkpoint failure (5+ days in last 7) -------------
  const auditDate = new Date(audit.date);
  const cutoff = new Date(auditDate); cutoff.setDate(cutoff.getDate() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = (state.audits || []).filter(a =>
    isFinalized(a) && a.date >= cutoffStr && a.date <= audit.date);
  const failCounts = {};
  const failDates = {};
  recent.forEach(a => {
    Object.entries(a.results || {}).forEach(([cpId, r]) => {
      if (r.result !== 'F') return;
      failCounts[cpId] = (failCounts[cpId] || 0) + 1;
      (failDates[cpId] = failDates[cpId] || []).push(a.date);
    });
  });
  Object.entries(failCounts).forEach(([cpId, count]) => {
    if (count >= 5) {
      const cp = CHECKPOINTS.find(c => c.id === cpId);
      out.push({
        trigger_number: 2,
        trigger_label: ESC_TRIGGERS[2],
        severity: 'high',
        recipient_role: 'GM',
        message: composeMessage({
          what: `Checkpoint ${cpId} "${cp ? cp.text : 'unknown'}" failed ${count} times in the last 7 days.`,
          evidence: `Failure dates: ${failDates[cpId].map(fmtDateShort).join(', ')}.`,
          impact: 'Recurring failure on the same point — process or training gap, not a one-off mistake.',
          action: 'Open a Pattern CAP in the app, run a 5 Whys with the responsible staff, set a 7-day deadline.',
        }),
      });
    }
  });

  // -- T3: Cash variance > ₹500 (proxy: any Cash SOP FAIL today) --------
  const cashFails = fails.filter(f => f.cpId.startsWith('6.'));
  if (cashFails.length > 0) {
    const findings = cashFails
      .filter(f => f.finding)
      .map(f => `${f.cpId}: ${f.finding}`)
      .join(' | ') || `${cashFails.length} cash checkpoint FAIL(s) without text`;
    // Check yesterday too — if cash failed yesterday too, escalate to Owner.
    const yest = new Date(auditDate); yest.setDate(yest.getDate() - 1);
    const yestStr = yest.toISOString().slice(0, 10);
    const yesterdayAudit = (state.audits || []).find(a =>
      isFinalized(a) && a.date === yestStr);
    const yesterdayCash = yesterdayAudit && Object.entries(yesterdayAudit.results || {})
      .some(([cpId, r]) => r.result === 'F' && cpId.startsWith('6.'));
    out.push({
      trigger_number: 3,
      trigger_label: ESC_TRIGGERS[3],
      severity: yesterdayCash ? 'critical' : 'high',
      recipient_role: yesterdayCash ? 'OWNER' : 'GM',
      message: composeMessage({
        what: `Cash SOP FAILed on ${fmtDateShort(audit.date)}${yesterdayCash ? ' — and also yesterday.' : '.'}`,
        evidence: findings,
        impact: yesterdayCash
          ? 'Cash control failure on consecutive days — direct money risk, possible theft or systemic gap.'
          : 'Direct cash risk. Could mask process error, undercounting or worse.',
        action: 'Re-count EOD cash, review the cash sheet, and call the auditor today.',
      }),
    });
  }

  // -- T4 (inventory variance) & T7 (declining trend) are weekly-only and
  //    live in evaluateWeeklyEscalations(), run when a weekly audit submits.

  // -- T5: Theft / security / legal keywords — one escalation per audit -
  const t5Hits = fails
    .map(f => ({ f, hit: findKeyword(f.finding, T5_KEYWORDS) }))
    .filter(x => x.hit);
  if (t5Hits.length > 0) {
    const evidence = t5Hits
      .map(x => `CP ${x.f.cpId}: "${x.f.finding}"`)
      .join('  |  ');
    const hitWords = Array.from(new Set(t5Hits.map(x => x.hit))).join(', ');
    out.push({
      trigger_number: 5,
      trigger_label: ESC_TRIGGERS[5],
      severity: 'critical',
      recipient_role: 'OWNER',
      message: composeMessage({
        what: `Audit finding flags a security or legal red flag (keywords: ${hitWords}).`,
        evidence,
        impact: 'Possible theft, security breach, or legal exposure. Could be loss-of-licence territory.',
        action: 'Investigate immediately. Preserve evidence — CCTV, registers, cash count. Don\'t let staff close the store before you arrive.',
      }),
    });
  }

  // -- T6: Customer complaint — one escalation per audit ----------------
  const t6Hits = fails
    .map(f => ({ f, hit: findKeyword(f.finding, T6_KEYWORDS) }))
    .filter(x => x.hit);
  if (t6Hits.length > 0) {
    const evidence = t6Hits
      .map(x => `CP ${x.f.cpId}: "${x.f.finding}"`)
      .join('  |  ');
    const hitWords = Array.from(new Set(t6Hits.map(x => x.hit))).join(', ');
    out.push({
      trigger_number: 6,
      trigger_label: ESC_TRIGGERS[6],
      severity: 'high',
      recipient_role: 'OWNER',
      message: composeMessage({
        what: `Audit finding flags a customer complaint that needs management (keywords: ${hitWords}).`,
        evidence,
        impact: 'Brand reputation. Customer may escalate publicly (social media, regulator, Titan corporate).',
        action: 'Call the customer today. Brief the Owner. Document the resolution.',
      }),
    });
  }

  // -- T7: Declining trend — weekly-only (see evaluateWeeklyEscalations).

  return out;
}

// Weekly-only escalations, run when a weekly audit is submitted.
//  T4 — Inventory variance: any weekly Inventory checkpoint FAILed (proxy for
//       a > ~1% variance; the engine has no live stock count, the GM's FAIL is
//       the signal). Routed to the Owner — stock loss is direct money risk.
//  T7 — Declining trend: this week's pct is lower than each of the prior two
//       weekly audits (a three-week slide), routed to the Owner.
function evaluateWeeklyEscalations(audit, state) {
  const out = [];
  const score = audit.score;
  const set = checkpointsFor(audit);
  const isInv = cp => cp.group === 'inventory_weekly' || /^IW\./.test(cp.id);
  const fails = Object.entries(audit.results || {})
    .filter(([, r]) => r.result === 'F')
    .map(([cpId, r]) => ({ cpId, ...r }));

  // -- T4: Inventory variance (weekly) ---------------------------------
  const invIds = new Set(set.filter(isInv).map(c => c.id));
  const invFails = fails.filter(f => invIds.has(f.cpId));
  if (invFails.length > 0) {
    const evidence = invFails
      .map(f => f.finding ? `${f.cpId}: ${f.finding}` : `${f.cpId}: inventory checkpoint FAIL`)
      .join('  |  ');
    out.push({
      trigger_number: 4,
      trigger_label: ESC_TRIGGERS[4],
      severity: 'critical',
      recipient_role: 'OWNER',
      message: composeMessage({
        what: `Weekly inventory control FAILed in Week ${audit.week_number}, ${audit.year} (${invFails.length} checkpoint${invFails.length > 1 ? 's' : ''}).`,
        evidence,
        impact: 'Inventory variance/shrinkage is direct stock loss and can mask theft. Titan stock is high value.',
        action: 'Order a physical re-count of the flagged lines, reconcile against the system, and review who handled stock this week.',
      }),
    });
  }

  // -- T7: Declining trend across three weekly audits ------------------
  if (score) {
    const prior = (state.audits || [])
      .filter(a => a.id !== audit.id && frequencyOf(a) === 'weekly' && isFinalized(a) && a.score)
      .filter(a => a.year < audit.year || (a.year === audit.year && a.week_number < audit.week_number))
      .sort((a, b) => (b.year - a.year) || (b.week_number - a.week_number));
    if (prior.length >= 2) {
      const w0 = score.pct;            // this week
      const w1 = prior[0].score.pct;   // last week
      const w2 = prior[1].score.pct;   // two weeks ago
      if (w0 < w1 && w1 < w2) {
        out.push({
          trigger_number: 7,
          trigger_label: ESC_TRIGGERS[7],
          severity: 'high',
          recipient_role: 'OWNER',
          message: composeMessage({
            what: `Weekly compliance has fallen three weeks running: ${w2.toFixed(1)}% → ${w1.toFixed(1)}% → ${w0.toFixed(1)}%.`,
            evidence: `Weeks ${prior[1].week_number}, ${prior[0].week_number} and ${audit.week_number} of ${audit.year}.`,
            impact: 'A sustained slide is a systemic problem, not a bad day — left alone it compounds.',
            action: 'Sit in on the next weekly review, pick the top recurring failure, and own a CAP personally until the trend reverses.',
          }),
        });
      }
    }
  }

  return out;
}

const Escalations = {
  list(state) { return state.escalations || []; },
  byId(state, id) { return (state.escalations || []).find(e => e.id === id) || null; },
  unsent(state) { return (state.escalations || []).filter(e => !e.sent_at); },

  // Save a batch of new escalations from evaluateEscalationsForAudit.
  saveDrafts(drafts, audit) {
    const state = Store.load();
    state.escalations = state.escalations || [];
    // Idempotent: skip if this trigger # for this audit already exists.
    const newOnes = drafts
      .filter(d => !state.escalations.some(e =>
        e.audit_id === audit.id && e.trigger_number === d.trigger_number))
      .map(d => Object.assign({}, d, {
        id: 'esc-' + uuid(),
        audit_id: audit.id,
        raised_at: new Date().toISOString(),
        sent_at: null,
        sent_via: null,
        sent_by: null,
      }));
    state.escalations = state.escalations.concat(newOnes);
    Store.save(state);
    return newOnes;
  },

  markSent(id, sentBy, via) {
    const state = Store.load();
    const e = Escalations.byId(state, id);
    if (!e) return;
    e.sent_at = new Date().toISOString();
    e.sent_via = via || 'whatsapp';
    e.sent_by = sentBy || null;
    Store.save(state);
  },

  dismiss(id, dismissedBy) {
    const state = Store.load();
    const e = Escalations.byId(state, id);
    if (!e) return;
    e.sent_at = new Date().toISOString();
    e.sent_via = 'dismissed';
    e.sent_by = dismissedBy || null;
    Store.save(state);
  },
};

// Run on audit submit. Returns the count of new escalations.
function processEscalationsForAudit(audit) {
  const state = Store.load();
  const drafts = evaluateEscalationsForAudit(audit, state);
  const saved = Escalations.saveDrafts(drafts, audit);
  return saved.length;
}

// Run on weekly audit submit (T4 inventory + T7 declining trend).
function processWeeklyEscalations(audit) {
  const state = Store.load();
  const drafts = evaluateWeeklyEscalations(audit, state);
  const saved = Escalations.saveDrafts(drafts, audit);
  return saved.length;
}

// Render the unsent escalation cards that show on top of the Audit tab.
function renderEscalationCards(state, auth) {
  const unsent = Escalations.unsent(state).sort((a, b) =>
    (b.raised_at || '').localeCompare(a.raised_at || ''));
  if (unsent.length === 0) return '';

  return unsent.map(e => {
    const recipient = findRecipient(state, e.recipient_role);
    const hasPhone = recipient && recipient.phone;
    const audit = (state.audits || []).find(a => a.id === e.audit_id);
    const preview = (e.message || '').split('\n').slice(0, 2).join(' · ').slice(0, 180);
    const sevClass = e.severity === 'critical' ? 'crit' : (e.severity === 'high' ? 'high' : 'norm');

    return `
      <div class="alert-card ${sevClass}">
        <div class="alert-head">
          <span class="alert-sev ${sevClass}">${escapeHtml(e.severity.toUpperCase())}</span>
          <span class="alert-trigger">T${e.trigger_number} · ${escapeHtml(e.trigger_label)}</span>
        </div>
        <div class="alert-body">
          ${escapeHtml(preview)}${(e.message && e.message.length > 180) ? '…' : ''}
        </div>
        <div class="alert-recip">
          For <strong>${escapeHtml(recipient ? recipient.name : e.recipient_role)}</strong>
          ${recipient ? `(${escapeHtml(roleLabel(recipient.role))})` : ''}
          ${hasPhone
            ? `· ${escapeHtml(displayPhone(recipient.phone))}`
            : `<span style="color:var(--red)">· no phone on file</span>`}
        </div>
        <div class="alert-actions">
          ${hasPhone
            ? `<button class="btn btn-whatsapp" data-action="esc-send" data-id="${escapeHtml(e.id)}">📱 Send on WhatsApp</button>`
            : `<button class="btn btn-ghost" data-action="esc-preview" data-id="${escapeHtml(e.id)}">View message</button>`}
          <button class="btn btn-ghost" data-action="esc-dismiss" data-id="${escapeHtml(e.id)}">Dismiss</button>
        </div>
      </div>`;
  }).join('');
}

function escalationPreviewModal(escId) {
  const state = Store.load();
  const e = Escalations.byId(state, escId);
  if (!e) return;
  const recipient = findRecipient(state, e.recipient_role);
  openModal(`
    <h3>Escalation message</h3>
    <p class="muted">T${e.trigger_number} · ${escapeHtml(e.trigger_label)} · for <strong>${escapeHtml(recipient ? recipient.name : e.recipient_role)}</strong></p>
    <pre style="white-space:pre-wrap;background:var(--gray-100);padding:12px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.5">${escapeHtml(e.message)}</pre>
    ${!recipient || !recipient.phone
      ? `<p class="error">No phone number set for ${escapeHtml(recipient ? recipient.name : e.recipient_role)}. Add one in Settings → Users to enable WhatsApp send.</p>`
      : ''}
    <button class="btn btn-ghost" data-action="esc-copy" data-id="${escapeHtml(escId)}">Copy message</button>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="modal-cancel">Close</button>
  `);
}

// ---------------------------------------------------------------------------
// Crypto — PIN hashing via Web Crypto PBKDF2 (no library needed).
// ---------------------------------------------------------------------------

async function hashPin(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(pin, salt, expected) {
  return (await hashPin(pin, salt)) === expected;
}

function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Users + auth
// ---------------------------------------------------------------------------

const Users = {
  listActive(state) { return state.users.filter(u => u.is_active); },
  listAll(state) { return state.users.slice(); },
  byId(state, id) { return state.users.find(u => u.id === id) || null; },

  async create({ name, role, pin, phone }) {
    const state = Store.load();
    const salt = randomSalt();
    const pin_hash = await hashPin(pin, salt);
    const u = {
      id: uuid(), name, role, pin_salt: salt, pin_hash,
      phone: normalizePhone(phone || ''),
      created_at: new Date().toISOString(), is_active: true,
    };
    state.users.push(u);
    Store.save(state);
    return u;
  },

  setPhone(userId, phone) {
    const state = Store.load();
    const u = Users.byId(state, userId);
    if (!u) return;
    u.phone = normalizePhone(phone || '');
    Store.save(state);
  },

  async changePin(userId, newPin) {
    const state = Store.load();
    const u = Users.byId(state, userId);
    if (!u) return false;
    u.pin_salt = randomSalt();
    u.pin_hash = await hashPin(newPin, u.pin_salt);
    Store.save(state);
    return true;
  },

  setActive(userId, active) {
    const state = Store.load();
    const u = Users.byId(state, userId);
    if (!u) return;
    u.is_active = !!active;
    Store.save(state);
  },
};

const AuthSession = {
  current(state) {
    state = state || Store.load();
    if (!state.current_user_id) return null;
    const u = Users.byId(state, state.current_user_id);
    if (!u || !u.is_active) return null;
    return u;
  },
  login(userId) {
    const state = Store.load();
    state.current_user_id = userId;
    Store.save(state);
  },
  logout() {
    const state = Store.load();
    state.current_user_id = null;
    Store.save(state);
  },
};

function roleLabel(r) {
  return { OWNER: 'Owner', GM: 'GM', SM: 'Store Manager' }[r] || r;
}

// Phone helpers. India default: if 10 digits, prepend '91'.
function normalizePhone(input) {
  if (!input) return '';
  const digits = String(input).replace(/[^\d]/g, '');
  if (digits.length === 0) return '';
  if (digits.length === 10) return '91' + digits;
  return digits;
}

function displayPhone(p) {
  if (!p) return '';
  if (p.length === 12 && p.startsWith('91')) {
    return '+91 ' + p.slice(2, 7) + ' ' + p.slice(7);
  }
  return '+' + p;
}

function whatsappLink(phone, message) {
  const p = normalizePhone(phone || '');
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

// Build a plain-text summary of one submitted audit, ready to paste into
// WhatsApp / Telegram / email. Includes date, score band, top FAILs with
// CRO attribution, audit notes if any. Kept short enough that the chat
// preview reads cleanly.
function buildAuditWhatsappText(a, state) {
  const s = a.score || scoreAudit(a.results);
  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));
  const fails = CHECKPOINTS
    .map(cp => ({ cp, r: a.results[cp.id] || {} }))
    .filter(x => x.r.result === 'F')
    .slice(0, 6);
  const failLines = fails.length
    ? fails.map(({ cp, r }) => {
        const who = r.cro_id && croById[r.cro_id] ? ` — ${croById[r.cro_id].name}` : '';
        const find = r.finding ? `: ${r.finding}` : '';
        return `• CP ${cp.id}${find}${who}`;
      }).join('\n')
    : '(no fails)';

  const lines = [
    `📋 Saagar Audit — ${fmtDate(a.date)}`,
    `Score: ${s.pct.toFixed(1)}% ${bandLabel(s.band)} (${s.raw}/${s.max})`,
    `By: ${a.auditor_name || 'unknown'} · ${s.p}P · ${s.f}F · ${s.na}NA`,
  ];
  if (a.backdate_reason) lines.push(`⚠ Backdated: ${a.backdate_reason}`);
  if (a.notes)           lines.push(`📝 Notes: ${a.notes}`);
  lines.push('');
  lines.push(`Fails (${s.f}):`);
  lines.push(failLines);
  lines.push('');
  lines.push('— from Saagar Audit');
  return lines.join('\n');
}

// Open WhatsApp with the audit summary text pre-filled. No specific
// recipient — user picks the chat after WhatsApp opens.
function shareAuditToWhatsApp(auditId) {
  const state = Store.load();
  const a = audit(auditId, state);
  if (!a) return;
  const text = buildAuditWhatsappText(a, state);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

// Pick the first active user matching a role (Owner takes precedence if multiple).
function findRecipient(state, role) {
  return state.users.find(u => u.is_active && u.role === role) || null;
}

// In-memory lockout — 5 wrong PINs within 60s → 60-second lockout.
const LoginGuard = {
  attempts: 0,
  lockedUntil: 0,
  register(success) {
    if (success) { this.attempts = 0; this.lockedUntil = 0; return; }
    this.attempts++;
    if (this.attempts >= 5) {
      this.lockedUntil = Date.now() + 60 * 1000;
      this.attempts = 0;
    }
  },
  isLocked() { return this.lockedUntil > Date.now(); },
  secondsLeft() { return Math.max(0, Math.ceil((this.lockedUntil - Date.now()) / 1000)); },
};

// ---------------------------------------------------------------------------
// Image compression — keeps localStorage footprint small.
// ---------------------------------------------------------------------------

// Approximate size of a base64 data URL in KB.
function dataUrlSizeKb(dataUrl) {
  const b64 = (dataUrl.split(',')[1] || '');
  return Math.round((b64.length * 0.75) / 1024);
}

// ---------------------------------------------------------------------------
// GPS — single fetch, cached for 5 min so we don't ping on every photo.
// ---------------------------------------------------------------------------

let _gpsCache = null;
function getCachedGps() {
  return new Promise(resolve => {
    if (_gpsCache && (Date.now() - _gpsCache.ts < 5 * 60 * 1000)) {
      resolve(_gpsCache);
      return;
    }
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        _gpsCache = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: Date.now(),
        };
        resolve(_gpsCache);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

// ---------------------------------------------------------------------------
// Photo capture — opens the system camera, watermarks the JPEG with
// date · time · auditor · checkpoint · GPS coords, returns a data URL.
// ---------------------------------------------------------------------------

function pickFromCamera() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files && input.files[0] || null;
      try { document.body.removeChild(input); } catch (_) {}
      resolve(f);
    };
    document.body.appendChild(input);
    input.click();
  });
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.onload = () => resolve(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Watermarked photo: resizes to maxDim=1024, draws a navy/gold bar at the
// bottom carrying date+time+auditor+CP+GPS. Result is a JPEG data URL.
async function capturePhotoWithStamp({ cpId, quality = 0.72, maxDim = 1024 } = {}) {
  const file = await pickFromCamera();
  if (!file) return null;

  const [img, gps] = await Promise.all([fileToImage(file), getCachedGps()]);
  const state = Store.load();
  const auth = AuthSession.current(state);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const auditor = auth ? auth.name : '';
  const gpsStr = gps ? `${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°` : '';

  // Resize image
  const longest = Math.max(img.width, img.height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  // Watermark bar height ~13% of image height, minimum 90px
  const barH = Math.max(90, Math.round(h * 0.13));
  const pad = Math.round(barH * 0.16);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h + barH;
  const ctx = canvas.getContext('2d');

  // 1. Original photo
  ctx.drawImage(img, 0, 0, w, h);

  // 2. Navy bar
  ctx.fillStyle = '#0d2340';
  ctx.fillRect(0, h, w, barH);
  // Thin gold line on top of the bar
  ctx.fillStyle = '#d4a843';
  ctx.fillRect(0, h, w, Math.max(2, Math.round(barH * 0.04)));

  // 3. Big line: date + time
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d4a843';
  const fs1 = Math.round(barH * 0.27);
  ctx.font = `bold ${fs1}px system-ui, -apple-system, Arial, sans-serif`;
  ctx.fillText(`${dateStr}  ·  ${timeStr}`, pad, h + pad);

  // 4. Sub line: auditor + CP id
  ctx.fillStyle = '#ffffff';
  const fs2 = Math.round(barH * 0.20);
  ctx.font = `${fs2}px system-ui, -apple-system, Arial, sans-serif`;
  const line2Parts = [];
  if (auditor) line2Parts.push(auditor);
  if (cpId) line2Parts.push(`CP ${cpId}`);
  if (line2Parts.length) {
    ctx.fillText(line2Parts.join('  ·  '), pad, h + pad + Math.round(fs1 * 1.25));
  }

  // 5. GPS line (smaller, lighter)
  if (gpsStr) {
    ctx.fillStyle = '#a1a1aa';
    const fs3 = Math.round(barH * 0.16);
    ctx.font = `${fs3}px system-ui, -apple-system, Arial, sans-serif`;
    ctx.fillText(gpsStr, pad, h + pad + Math.round(fs1 * 1.25) + Math.round(fs2 * 1.3));
  }

  // 6. Saagar brand on the right
  ctx.fillStyle = '#d4a843';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const fs4 = Math.round(barH * 0.30);
  ctx.font = `italic bold ${fs4}px Georgia, 'Times New Roman', serif`;
  ctx.fillText('Saagar', w - pad, h + barH / 2);

  return canvas.toDataURL('image/jpeg', quality);
}

// ---------------------------------------------------------------------------
// Score (Spec §6.1 – §6.2)
// ---------------------------------------------------------------------------

// Equal-weight scoring: every checkpoint counts as 1. Score = % of marked
// checkpoints that passed. N/A drops out of both numerator and denominator.
// The `weight` field on checkpoints is intentionally ignored (scoring model
// chosen: all points equal).
function scoreAudit(results, cps) {
  const set = cps || CHECKPOINTS;
  let raw = 0, max = 0, p = 0, f = 0, na = 0;
  set.forEach(cp => {
    const r = (results[cp.id] || {}).result;
    if (r === 'P') { raw += 1; max += 1; p++; }
    else if (r === 'F') { max += 1; f++; }
    else if (r === 'NA') { na++; }
  });
  const pct = max > 0 ? Math.round((raw / max) * 1000) / 10 : 100;
  return { raw, max, pct, band: bandFor(pct), p, f, na, total: set.length };
}

// How many checkpoints the daily template currently has — used to weight the
// daily component of the weekly score (replaces the old hardcoded 68).
function dailyTemplateCount() {
  const tpl = Templates.byId(null, 'tpl_daily');
  return (tpl && tpl.checkpoints.length) || CHECKPOINTS.length;
}

// Shared band function so daily + weekly agree on the boundaries (Spec §6.2).
function bandFor(pct) {
  if (pct >= 95) return 'excellent';
  if (pct >= 90) return 'good';
  if (pct >= 85) return 'fair';
  if (pct >= 80) return 'poor';
  return 'critical';
}

// ---------------------------------------------------------------------------
// Weekly score (Spec §6.5).
//
//   daily_contribution = round(avg_of_7_daily_pcts / 100 * 68, 1)
//        (a missing day counts as 0%)
//   weekly_raw = sum of weighted points where weekly checkpoint == P
//   weekly_max = sum of weights where weekly checkpoint in (P, F)  [NA excluded]
//   total_raw  = daily_contribution + weekly_raw
//   total_max  = 68 + weekly_max
//   compliance = round(total_raw / total_max * 100, 1)
//
// Canonical (Workbook §5.2): daily %s 92.2/91.1/90.0/88.8/93.3/89.7/91.4,
// weekly Ops 7/10, Cash 10/16, R&S 4/6, Inv 22/24 → 104.8/124 = 84.5% Poor.
// ---------------------------------------------------------------------------

const DAILY_MAX_WEIGHTED = 68; // sum of daily checkpoint weights (Spec §2)

function round1(x) { return Math.round(x * 10) / 10; }

// dailyPcts: array of up to 7 numbers (compliance % per day). Missing days
// should be passed as 0 (caller fills gaps). weeklyResults: { cpId: 'P'|'F'|'NA' }.
// Equal-weight weekly score. The daily component is weighted by the daily
// template's current checkpoint COUNT (dailyMax) — not a hardcoded 68 — so an
// edited daily checklist flows through correctly. The weekly-only component
// counts each weekly checkpoint as 1.
function scoreWeekly(dailyPcts, weeklyResults, cps, dailyMax) {
  const set = cps || WEEKLY_CHECKPOINTS;
  const dMax = dailyMax || dailyTemplateCount();
  // Daily component — always averaged over 7 slots (missing = 0%).
  const slots = 7;
  const filled = dailyPcts.slice(0, slots);
  while (filled.length < slots) filled.push(0);
  const avgDaily = filled.reduce((a, b) => a + b, 0) / slots;
  const dailyContribution = round1((avgDaily / 100) * dMax);

  // Weekly-only component (equal weight: each checkpoint = 1).
  let weeklyRaw = 0, weeklyMax = 0, p = 0, f = 0, na = 0;
  set.forEach(cp => {
    const r = (weeklyResults || {})[cp.id];
    if (r === 'P') { weeklyRaw += 1; weeklyMax += 1; p++; }
    else if (r === 'F') { weeklyMax += 1; f++; }
    else if (r === 'NA') { na++; }
  });

  const totalRaw = round1(dailyContribution + weeklyRaw);
  const totalMax = dMax + weeklyMax;
  const pct = totalMax > 0 ? round1((totalRaw / totalMax) * 100) : 100;

  return {
    avgDaily: round1(avgDaily),
    dailyContribution,
    weeklyRaw, weeklyMax,
    raw: totalRaw, max: totalMax,
    pct, band: bandFor(pct),
    p, f, na, total: set.length,
  };
}

// Self-test of the weekly formula mechanics (equal-weight model). Uses clean
// synthetic invariants rather than the old weighted spec example.
function _selfTestWeeklyScore() {
  // 1. All 7 days 100% + every weekly checkpoint passed → 100%.
  const allPass = {};
  WEEKLY_CHECKPOINTS.forEach(c => { allPass[c.id] = 'P'; });
  const top = scoreWeekly([100,100,100,100,100,100,100], allPass, WEEKLY_CHECKPOINTS, 68);
  // 2. All 7 days 0% + every weekly checkpoint failed → 0%.
  const allFail = {};
  WEEKLY_CHECKPOINTS.forEach(c => { allFail[c.id] = 'F'; });
  const bottom = scoreWeekly([0,0,0,0,0,0,0], allFail, WEEKLY_CHECKPOINTS, 68);
  const ok = (top.pct === 100 && top.band === 'excellent'
    && bottom.pct === 0 && bottom.band === 'critical');
  if (!ok) {
    console.error('WEEKLY SCORE SELF-TEST FAILED', { top: top.pct, bottom: bottom.pct });
  } else {
    console.log('Weekly score self-test OK (equal-weight: 100%↔0% invariants hold)');
  }
  return ok;
}

function bandLabel(band) {
  return tBand(band);
}

// ---------------------------------------------------------------------------
// i18n — single source of truth: window.I18N_DATA loaded from i18n_data.js.
// Locale persisted in localStorage. Switch reloads via render().
// ---------------------------------------------------------------------------

const I18n = {
  current: 'en',
  init() {
    const saved = localStorage.getItem('saagar_locale');
    if (saved === 'mr' || saved === 'en') this.current = saved;
  },
  set(loc) {
    if (loc !== 'en' && loc !== 'mr') return;
    this.current = loc;
    localStorage.setItem('saagar_locale', loc);
    render();
    renderTabBar();
  },
  // Pulls a localized string. Falls back to English, then to the key itself.
  t(category, key, fallback) {
    const data = window.I18N_DATA;
    if (!data) return fallback != null ? fallback : key;
    const cur = data[this.current] && data[this.current][category];
    if (cur && cur[key] != null && cur[key] !== '') return cur[key];
    const en = data.en && data.en[category];
    if (en && en[key] != null && en[key] !== '') return en[key];
    return fallback != null ? fallback : key;
  },
};

function tBand(code)           { return I18n.t('bands', code, code); }
function tCapStatus(s)         { return I18n.t('cap_statuses', s, s); }
function tAuditStatus(s)       { return I18n.t('audit_statuses', s, s); }
function tSop(id, fallback)    { return I18n.t('sop_names', id, fallback || id); }
function tCheckpoint(cpId, fb) { return I18n.t('checkpoints', cpId, fb); }
function tUi(key, fb)          { return I18n.t('ui_strings', key, fb != null ? fb : key); }

// Updates tab bar labels in-place. Called on locale change so the topbar
// nav stays in sync without a full DOM rebuild.
function renderTabBar() {
  const tabs = {
    audit:     tUi('tab.audit',     'Audit'),
    history:   tUi('tab.history',   'History'),
    caps:      tUi('tab.caps',      'CAPs'),
    reference: tUi('tab.reference', 'Reference'),
    settings:  tUi('tab.settings',  'Settings'),
  };
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    const k = t.dataset.tab;
    if (tabs[k] == null) return;
    // First child is normally the leading text node; the .tab-badge span is a
    // following child. Replace just the text content without disturbing the
    // badge element.
    let textNode = t.firstChild;
    if (!textNode || textNode.nodeType !== 3) {
      textNode = document.createTextNode('');
      t.insertBefore(textNode, t.firstChild || null);
    }
    textNode.nodeValue = tabs[k];
  });
}

// ---------------------------------------------------------------------------
// Audit lifecycle
// ---------------------------------------------------------------------------

function currentAudit(state) {
  return state.audits.find(a => a.id === state.current_audit_id) || null;
}

function audit(id, state) {
  return state.audits.find(a => a.id === id) || null;
}

// A finalized audit is one that counts as "done" — submitted OR verified.
// (Verifying a daily audit moves it to status 'verified'; it must still show
// in history, trends, weekly rollups and exports.)
function isFinalized(a) {
  return !!(a && (a.status === 'submitted' || a.status === 'verified'));
}

function startNewAudit({ date, auditorName, auditorId, croIds, backdateReason, templateId }) {
  const state = Store.load();
  const tplId = templateId || 'tpl_daily';
  // If an unsubmitted draft already exists for this date + template, replace it.
  state.audits = state.audits.filter(
    a => !(a.date === date && a.status === 'draft' && (a.template_id || 'tpl_daily') === tplId)
  );
  const tpl = Templates.byId(state, tplId);
  const perCro = !!(tpl && tpl.cro_mode && tpl.cro_mode !== 'store');
  const newAudit = {
    id: uuid(),
    template_id: tplId,
    audit_type: 'daily',         // legacy field kept for back-compat
    date,
    auditor_id: auditorId || null,
    auditor_name: auditorName,
    cros: croIds.slice(),
    status: 'draft',
    results: {},
    started_at: new Date().toISOString(),
    submitted_at: null,
    backdate_reason: (backdateReason || '').trim(),
  };
  if (perCro) {
    newAudit.cro_mode = 'per_cro';
    newAudit.cro_order = croIds.slice();     // score these CROs, in order
    newAudit.current_cro_index = 0;
    newAudit.cro_results = {};
  }
  state.audits.push(newAudit);
  state.current_audit_id = newAudit.id;
  state.auditor_name = auditorName;
  Store.save(state);
  return newAudit;
}

// Current ISO week + year (year that owns the week, via the Thursday rule).
function currentIsoWeekYear() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return { week: isoWeekOf(now), year: d.getUTCFullYear() };
}

// Start a GM-led weekly audit for an ISO week. Replaces any existing weekly
// draft for the same week.
function startWeeklyAudit({ weekNumber, year, gmId, gmName, templateId }) {
  const state = Store.load();
  const tplId = templateId || 'tpl_weekly';
  state.audits = state.audits.filter(
    a => !(frequencyOf(a) === 'weekly' && a.week_number === weekNumber && a.year === year && a.status === 'draft')
  );
  const newAudit = {
    id: uuid(),
    template_id: tplId,
    audit_type: 'weekly',        // legacy field kept for back-compat
    week_number: weekNumber,
    year: year,
    date: today(),               // submission date; daily contribution pulled by week
    auditor_id: gmId || null,
    auditor_name: gmName || '',
    cros: [],
    status: 'draft',
    results: {},
    started_at: new Date().toISOString(),
    submitted_at: null,
  };
  state.audits.push(newAudit);
  state.current_audit_id = newAudit.id;
  Store.save(state);
  return newAudit;
}

// Entry card on the Audit tab (GM/Owner) — shows this week's daily coverage.
function renderWeeklyEntryCard(state, tpl) {
  const tplId = tpl ? tpl.id : 'tpl_weekly';
  const name = tpl ? tpl.name : 'Weekly audit';
  const { week, year } = currentIsoWeekYear();
  const dailyPcts = dailyPctsForWeek(week, year, state);
  const avg = dailyPcts.length ? round1(dailyPcts.reduce((a, b) => a + b, 0) / dailyPcts.length) : null;
  const submittedWeekly = state.audits.find(
    a => frequencyOf(a) === 'weekly' && (a.template_id || 'tpl_weekly') === tplId
      && a.week_number === week && a.year === year && isFinalized(a)
  );
  return `
    <div class="card" style="border-color:var(--gold);background:var(--gold-pale)">
      <h2>${escapeHtml(name)} · Week ${week}, ${year}</h2>
      <p class="muted">${dailyPcts.length} of 7 daily audits submitted this week${avg != null ? ` · avg ${avg}%` : ''}.</p>
      ${submittedWeekly
        ? `<p class="muted">Submitted: ${submittedWeekly.score.pct.toFixed(1)}% · ${bandLabel(submittedWeekly.score.band)}</p>`
        : ''}
      <div class="spacer-12"></div>
      <button class="btn btn-primary" data-action="start-weekly-audit" data-week="${week}" data-year="${year}" data-tpl="${escapeHtml(tplId)}">
        ${submittedWeekly ? 'Re-run weekly audit' : 'Start weekly audit'}
      </button>
    </div>
  `;
}

function markCheckpoint(checkpointId, result, opts = {}) {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return;
  const bucket = writableBucket(a);
  const existing = bucket[checkpointId] || {};
  bucket[checkpointId] = {
    result,
    finding: opts.finding != null ? opts.finding : (existing.finding || ''),
    // In per-CRO mode the result is implicitly the current CRO; in store mode
    // the caller may attribute a specific CRO.
    cro_id: auditIsPerCro(a) ? currentCroId(a) : (opts.croId != null ? opts.croId : (existing.cro_id || null)),
    photos: opts.photos != null ? opts.photos : (existing.photos || []),
    at: new Date().toISOString(),
  };
  Store.save(state);
}

// Attach a photo to a checkpoint independent of its verdict — used by the
// per-checkpoint photo button. Creates an "unmarked" result row if needed.
function addPhotoToCheckpoint(checkpointId, dataUrl) {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return;
  const bucket = writableBucket(a);
  const existing = bucket[checkpointId] || {
    result: null, finding: '', cro_id: auditIsPerCro(a) ? currentCroId(a) : null, photos: [], at: null,
  };
  existing.photos = (existing.photos || []).concat([dataUrl]);
  bucket[checkpointId] = existing;
  Store.save(state);
}

function removePhotoFromCheckpoint(checkpointId, photoIdx) {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return;
  const r = resultsBucket(a)[checkpointId];
  if (!r || !r.photos) return;
  r.photos.splice(photoIdx, 1);
  Store.save(state);
}

// Working photo draft, used by the fail modal between opening and saving.
const FailDraft = {
  photos: [],
  reset() { FailDraft.photos = []; },
  add(dataUrl) { FailDraft.photos.push(dataUrl); },
  removeAt(i) { FailDraft.photos.splice(i, 1); },
};

// Returns the checkpoint set for an audit: weekly audits walk
// WEEKLY_CHECKPOINTS, everything else walks the 68 daily CHECKPOINTS.
// By construction this is identical to the old behavior for daily audits.
function checkpointsFor(audit) {
  // Submitted audits carry a frozen snapshot — always render from that so a
  // later template edit never changes a past record.
  if (audit && audit.template_snapshot && Array.isArray(audit.template_snapshot.checkpoints))
    return audit.template_snapshot.checkpoints;
  // In-progress audits use the live template.
  if (audit && audit.template_id) {
    const tpl = Templates.byId(null, audit.template_id);
    if (tpl && Array.isArray(tpl.checkpoints)) return tpl.checkpoints;
  }
  // Legacy audits (pre-templates) fall back to the hard-wired sets.
  return (audit && audit.audit_type === 'weekly') ? WEEKLY_CHECKPOINTS : CHECKPOINTS;
}

// The template (or frozen snapshot) behind an audit; null for pure-legacy.
function templateFor(audit) {
  if (audit && audit.template_snapshot) return audit.template_snapshot;
  if (audit && audit.template_id) return Templates.byId(null, audit.template_id);
  return null;
}

// Effective frequency: template's if present, else the legacy audit_type.
function frequencyOf(audit) {
  const tpl = templateFor(audit);
  if (tpl) return tpl.frequency;
  return audit && audit.audit_type === 'weekly' ? 'weekly' : 'daily';
}

// --- Per-CRO mode helpers -------------------------------------------------
// A per-CRO audit runs the same checklist once per CRO, sequentially.
// Results live in audit.cro_results[croId][cpId]; store-mode uses
// audit.results[cpId]. resultsBucket() returns the active object so the rest
// of the run flow can stay shape-agnostic.

function auditIsPerCro(audit) {
  return !!(audit && audit.cro_mode && audit.cro_mode !== 'store');
}

function currentCroId(audit) {
  if (!auditIsPerCro(audit)) return null;
  const order = audit.cro_order || [];
  return order[audit.current_cro_index || 0] || null;
}

// Read-only view of the active results object.
function resultsBucket(audit) {
  if (auditIsPerCro(audit)) {
    const cid = currentCroId(audit);
    return (audit.cro_results && audit.cro_results[cid]) || {};
  }
  return audit.results || {};
}

// Writable results object — creates the nested structure as needed. Caller
// must Store.save() after mutating.
function writableBucket(audit) {
  if (auditIsPerCro(audit)) {
    const cid = currentCroId(audit);
    audit.cro_results = audit.cro_results || {};
    audit.cro_results[cid] = audit.cro_results[cid] || {};
    return audit.cro_results[cid];
  }
  audit.results = audit.results || {};
  return audit.results;
}

function nextUnmarkedIndex(audit) {
  const cps = checkpointsFor(audit);
  const bucket = resultsBucket(audit);
  // Pass 1: any checkpoint truly untouched (no row, or photo-only row with
  // no verdict). The audit walks through these in spec order first.
  for (let i = 0; i < cps.length; i++) {
    const r = bucket[cps[i].id];
    if (!r || !r.result) return i;
  }
  // Pass 2: any checkpoint the user explicitly SKIPped. Those re-enter the
  // flow at the end so the user is forced to give a final verdict before
  // they can review + submit.
  for (let i = 0; i < cps.length; i++) {
    const r = bucket[cps[i].id];
    if (r && r.result === 'SKIP') return i;
  }
  return cps.length; // all done
}

// How many checkpoints the user has SKIPped so far. Used to surface
// "X to revisit" both during the linear walk and on the review screen.
function skippedCount(audit) {
  let n = 0;
  const bucket = resultsBucket(audit);
  checkpointsFor(audit).forEach(cp => {
    const r = bucket[cp.id];
    if (r && r.result === 'SKIP') n++;
  });
  return n;
}

// Returns the submitted daily compliance %s for a given ISO week+year.
function dailyPctsForWeek(weekNumber, year, state) {
  const pcts = [];
  (state.audits || []).forEach(a => {
    if (a.audit_type === 'weekly') return;
    if (!isFinalized(a) || !a.score) return;
    const d = new Date(a.date);
    if (d.getFullYear() === year && isoWeekOf(d) === weekNumber) {
      pcts.push(a.score.pct);
    }
  });
  return pcts;
}

function submitAudit() {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return null;
  // Pull free-text notes from the review screen, if present.
  const notesEl = document.getElementById('auditNotes');
  if (notesEl) a.notes = notesEl.value.trim();

  const cps = checkpointsFor(a);
  const freq = frequencyOf(a);

  // Freeze the checklist into the audit so later template edits can't alter
  // this record's score or wording.
  const liveTpl = templateFor(a);
  if (liveTpl && !a.template_snapshot) {
    a.template_snapshot = {
      name: liveTpl.name, name_mr: liveTpl.name_mr,
      frequency: liveTpl.frequency, cro_mode: liveTpl.cro_mode,
      sections: JSON.parse(JSON.stringify(liveTpl.sections || [])),
      checkpoints: JSON.parse(JSON.stringify(liveTpl.checkpoints || [])),
    };
  }

  if (freq === 'weekly') {
    // Daily contribution is computed from the 7 submitted daily audits of
    // the same ISO week — the GM does not re-enter daily data.
    const dailyPcts = dailyPctsForWeek(a.week_number, a.year, state);
    const verdicts = {};
    Object.keys(a.results || {}).forEach(id => {
      verdicts[id] = a.results[id].result;
    });
    a.score = scoreWeekly(dailyPcts, verdicts, cps);
    a.daily_pcts_used = dailyPcts;
    a.status = 'submitted';
    a.submitted_at = new Date().toISOString();
    state.current_audit_id = null;
    Store.save(state);
    const newCaps = autoCreateCapsForAudit(a);
    const newEscalations = processWeeklyEscalations(a);
    return { audit: a, capsCreated: newCaps.length, escalationsRaised: newEscalations };
  }

  // Per-CRO: pooled aggregate score + per-CRO breakdown.
  if (auditIsPerCro(a)) {
    const sp = scorePerCro(a, cps);
    a.score = sp.aggregate;
    a.score_by_cro = sp.byCro;
    a.status = 'submitted';
    a.submitted_at = new Date().toISOString();
    state.current_audit_id = null;
    Store.save(state);
    const newCaps = autoCreateCapsForAudit(a);
    const newEscalations = freq === 'daily' ? processEscalationsForAudit(a) : 0;
    return { audit: a, capsCreated: newCaps.length, escalationsRaised: newEscalations };
  }

  // Daily / monthly / custom — simple % score over the template's set.
  const s = scoreAudit(a.results, cps);
  a.status = 'submitted';
  a.submitted_at = new Date().toISOString();
  a.score = s;
  state.current_audit_id = null;
  Store.save(state);
  const newCaps = autoCreateCapsForAudit(a);
  // Escalation engine is daily-tuned; only run it for daily-frequency audits.
  const newEscalations = freq === 'daily' ? processEscalationsForAudit(a) : 0;
  return { audit: a, capsCreated: newCaps.length, escalationsRaised: newEscalations };
}

// ---------------------------------------------------------------------------
// Rendering — auth gate + tabs
// ---------------------------------------------------------------------------

// Transient PIN entry buffer for the auth screens.
const PinBuf = {
  value: '',
  shake: false,
  reset() { this.value = ''; this.shake = false; },
};

function render() {
  const state = Store.load();
  const auth = AuthSession.current(state);

  // Gate 1: no users at all → first-time setup
  if (state.users.length === 0) {
    document.body.classList.add('locked');
    document.getElementById('auth-screen').innerHTML = renderFirstTimeSetup();
    return;
  }
  // Gate 2: users exist but no one logged in → login screen
  if (!auth) {
    document.body.classList.add('locked');
    document.getElementById('auth-screen').innerHTML = renderLoginScreen(state);
    return;
  }

  // Authenticated — show normal UI
  ageOverdueCaps(); // before reading state again for CAPs
  const freshState = Store.load();
  document.body.classList.remove('locked');
  renderUserBadge(auth);
  document.getElementById('tab-audit').innerHTML = renderAuditTab(freshState, auth);
  document.getElementById('tab-history').innerHTML = renderHistoryTab(freshState, auth);
  document.getElementById('tab-caps').innerHTML = renderCapsTab(freshState, auth);
  const refTab = document.getElementById('tab-reference');
  if (refTab) refTab.innerHTML = renderReferenceTab();
  document.getElementById('tab-settings').innerHTML = renderSettingsTab(freshState, auth);
  renderCapsBadge(freshState);
}

function renderCapsBadge(state) {
  const badge = document.getElementById('capsBadge');
  if (!badge) return;
  const need = (state.caps || []).filter(c => c.status === 'open' || c.status === 'aged').length;
  if (need === 0) { badge.hidden = true; badge.textContent = ''; return; }
  badge.hidden = false;
  badge.textContent = String(need);
}

function renderUserBadge(user) {
  const el = document.getElementById('userBadge');
  if (!el) return;
  el.innerHTML = `
    <span class="name">${escapeHtml(user.name)}</span>
    <span class="role">${escapeHtml(user.role)}</span>
    <button data-action="logout" title="Switch user">⏏</button>
  `;
}

// --- Auth screens ---

function renderFirstTimeSetup() {
  const isConfirm = PinBuf.value.startsWith('CONFIRM:');
  const stage = window._setupStage || 'name';
  return `
    <div class="auth-wrap">
      <div class="auth-brand">
        <div class="serif">Saagar Audit</div>
        <div class="sub">FIRST-TIME SETUP</div>
      </div>
      <div class="auth-card">
        ${stage === 'name' ? `
          <h2>Welcome, Owner</h2>
          <p>Let's set up your account. You can add a Store Manager and a GM after this.</p>
          <label class="field">
            <span>Your name</span>
            <input type="text" id="ownerName" placeholder="e.g. Sagar Bora" autocomplete="off" autocapitalize="words">
          </label>
          <div id="setupErr" class="error" hidden></div>
          <button class="btn btn-primary" data-action="setup-name-next">Continue</button>
        ` : stage === 'pin' ? `
          <h2>Choose a 4-digit PIN</h2>
          <p>You'll use this to log in. Pick something you'll remember.</p>
          ${renderPinPad()}
          <div id="setupErr" class="error" hidden></div>
        ` : stage === 'confirm' ? `
          <h2>Confirm your PIN</h2>
          <p>Type it again to make sure.</p>
          ${renderPinPad()}
          <div id="setupErr" class="error" hidden></div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderLoginScreen(state) {
  const active = Users.listActive(state).sort((a, b) => {
    const order = { OWNER: 0, GM: 1, SM: 2 };
    return (order[a.role] - order[b.role]) || a.name.localeCompare(b.name);
  });
  const selected = window._loginUserId || (active[0] && active[0].id);
  const locked = LoginGuard.isLocked();
  return `
    <div class="auth-wrap">
      <div class="auth-brand">
        <div class="serif">Saagar Audit</div>
        <div class="sub">SIGN IN</div>
      </div>
      <div class="auth-card">
        <h2>Welcome back</h2>
        <p>Pick your name and enter your 4-digit PIN.</p>
        <label class="field">
          <span>Name</span>
          <select id="loginUser">
            ${active.map(u => `
              <option value="${escapeHtml(u.id)}" ${u.id === selected ? 'selected' : ''}>
                ${escapeHtml(u.name)} — ${escapeHtml(roleLabel(u.role))}
              </option>`).join('')}
          </select>
        </label>
        ${locked
          ? `<p class="error" style="text-align:center">Too many wrong PINs. Try again in ${LoginGuard.secondsLeft()}s.</p>`
          : renderPinPad()}
        <div id="loginErr" class="error" hidden></div>
      </div>
    </div>
  `;
}

function renderPinPad() {
  const dots = '<div class="pin-dots' + (PinBuf.shake ? ' shake' : '') + '">' +
    [0,1,2,3].map(i => `<span class="dot ${PinBuf.value.length > i ? 'filled' : ''}"></span>`).join('') +
    '</div>';
  return dots + `
    <div class="numpad">
      <button data-key="1">1</button><button data-key="2">2</button><button data-key="3">3</button>
      <button data-key="4">4</button><button data-key="5">5</button><button data-key="6">6</button>
      <button data-key="7">7</button><button data-key="8">8</button><button data-key="9">9</button>
      <button class="muted" data-key="forgot">Forgot?</button>
      <button data-key="0">0</button>
      <button data-key="back">⌫</button>
    </div>
  `;
}

function renderAuditTab(state, auth) {
  const a = currentAudit(state);
  if (a) return renderInProgressAudit(a);
  return renderStartAudit(state, auth);
}

// Which templates a role may run.
function canRunTemplate(auth, tpl) {
  if (!auth) return false;
  if (tpl.frequency === 'weekly') return auth.role === 'GM' || auth.role === 'OWNER';
  if (tpl.frequency === 'monthly') return auth.role === 'OWNER';
  return true; // daily / custom — anyone
}

// Selected non-weekly template on the Start screen.
const StartState = { templateId: null };

function renderStartAudit(state, auth) {
  const active = Templates.active(state).filter(t => canRunTemplate(auth, t));
  const weeklies = active.filter(t => t.frequency === 'weekly');
  const others = active.filter(t => t.frequency !== 'weekly');

  if (!StartState.templateId || !others.some(t => t.id === StartState.templateId)) {
    StartState.templateId = others.length ? others[0].id : null;
  }
  const selected = others.find(t => t.id === StartState.templateId);

  return `
    ${renderEscalationCards(state, auth)}
    ${weeklies.map(t => renderWeeklyEntryCard(state, t)).join('')}
    ${others.length > 1 ? `
      <div class="card">
        <h2>Start an audit</h2>
        <div class="template-picker">
          ${others.map(t => `
            <button class="tpl-pick ${t.id === StartState.templateId ? 'active' : ''}" data-action="pick-template" data-id="${escapeHtml(t.id)}">
              ${escapeHtml(t.name)}
            </button>`).join('')}
        </div>
      </div>` : ''}
    ${selected ? renderTemplateStartConfig(state, auth, selected)
      : (weeklies.length === 0 ? '<div class="card"><p class="muted">No audit templates available for your role. Ask the Owner to add one in Settings → Audit templates.</p></div>' : '')}
  `;
}

// Date + CROs + Start, for a single non-weekly template.
function renderTemplateStartConfig(state, auth, tpl) {
  const cros = state.cros;
  const todays = state.audits.find(
    x => x.date === today() && isFinalized(x) && (x.template_id || 'tpl_daily') === tpl.id
  );
  const showPinchHitHint = tpl.frequency === 'daily' && auth && auth.role !== 'SM';
  return `
    <div class="card">
      <h2>${escapeHtml(tpl.name)}</h2>
      <p class="muted">${escapeHtml(fmtDate(today()))} &middot; auditor: <strong>${escapeHtml(auth.name)}</strong> (${escapeHtml(roleLabel(auth.role))})</p>
      ${showPinchHitHint
        ? `<p class="tiny" style="color:var(--amber);margin-top:4px">Daily audits are usually run by the Store Manager. You can still proceed.</p>`
        : ''}
      ${todays
        ? `<div class="card" style="background:var(--green-pale);border-color:var(--green);margin-top:12px">
            <strong>Submitted today</strong>
            <p>${todays.score.pct.toFixed(1)}% &middot; ${bandLabel(todays.score.band)}${todays.auditor_name ? ' &middot; by ' + escapeHtml(todays.auditor_name) : ''}</p>
          </div>`
        : ''}
      <div class="spacer-12"></div>
      <label class="field">
        <span>Audit date</span>
        <input type="date" id="auditDate" value="${today()}" max="${today()}" onchange="toggleBackdateField()">
      </label>
      <div class="field" id="backdateField" hidden>
        <span style="font-size:13px;color:var(--amber);font-weight:600">Backdated audit — please record why</span>
        <textarea id="backdateReason" maxlength="200" rows="2"
                  placeholder="e.g. phone died yesterday; logging late so the day isn't missed"
                  style="margin-top:6px"></textarea>
        <p class="tiny muted" style="margin:4px 0 0">Stored with the audit, shown on the report and exports.</p>
      </div>
      <div class="field">
        <div class="row-spread">
          <span style="font-size:13px;color:var(--gray-600)">CROs on duty</span>
          <button class="iconbtn" style="color:var(--navy);font-size:14px" data-action="add-cro">+ Add CRO</button>
        </div>
        ${cros.length === 0
          ? '<p class="muted">No CROs yet. Tap "+ Add CRO" above to add your floor staff.</p>'
          : cros.map(c => `
            <div class="cro-row">
              <label>
                <input type="checkbox" class="cro-check" value="${escapeHtml(c.id)}">
                ${escapeHtml(c.name)}
                <span class="pill">${escapeHtml(c.counter)}</span>
              </label>
            </div>`).join('')}
      </div>
      <div id="startError" class="error" hidden></div>
      <button class="btn btn-primary" data-action="start-audit" data-tpl="${escapeHtml(tpl.id)}">Start ${escapeHtml(tpl.name)}</button>
    </div>
    <p class="tiny" style="text-align:center;margin-top:16px">${tpl.checkpoints.length} point(s) &middot; target 90%+ &middot; score = % passed</p>
  `;
}

// Live P/F/NA counts over whichever checkpoint set this audit uses.
function liveCounts(audit) {
  let p = 0, f = 0, na = 0;
  const bucket = resultsBucket(audit);
  checkpointsFor(audit).forEach(cp => {
    const r = (bucket[cp.id] || {}).result;
    if (r === 'P') p++; else if (r === 'F') f++; else if (r === 'NA') na++;
  });
  return { p, f, na };
}

function _localMr(s) {
  return (I18n.current === 'mr' && s && !String(s).startsWith('[REVIEW]')) ? s : null;
}

// Unified display info for a checkpoint, across all three shapes:
//   template checkpoint  → section via template.sections, text/text_mr
//   legacy weekly        → group/group_en/group_mr, text/text_mr
//   legacy daily         → sop_id via SOPS, tCheckpoint() for MR
// Returns { sectionLabel, critical, text }.
function cpDisplay(audit, cp) {
  const tpl = templateFor(audit);
  if (tpl) {
    const section = (tpl.sections || []).find(s => s.id === cp.section_id);
    const sectionLabel = section ? (_localMr(section.name_mr) || section.name) : '';
    return {
      sectionLabel,
      critical: !!cp.critical,
      text: _localMr(cp.text_mr) || cp.text,
    };
  }
  if (audit.audit_type === 'weekly') {
    return {
      sectionLabel: _localMr(cp.group_mr) || cp.group_en,
      critical: !!cp.critical,
      text: _localMr(cp.text_mr) || cp.text,
    };
  }
  const sop = SOPS.find(s => s.id === cp.sop_id);
  return {
    sectionLabel: sop ? tSop(sop.id, sop.name) : '',
    critical: sop ? !!sop.critical : false,
    text: tCheckpoint(cp.id, cp.text),
  };
}

// Back-compat shim — some callers still ask for just the text.
function cpText(audit, cp) { return cpDisplay(audit, cp).text; }

function renderInProgressAudit(a) {
  const cps = checkpointsFor(a);
  const freq = frequencyOf(a);
  const idx = nextUnmarkedIndex(a);
  if (idx >= cps.length) {
    // Per-CRO: finished this CRO. Move to the next, or review if last.
    if (auditIsPerCro(a)) {
      const order = a.cro_order || [];
      const ci = a.current_cro_index || 0;
      if (ci < order.length - 1) return renderCroHandoff(a, ci);
    }
    return renderReviewAudit(a);
  }

  const cp = cps[idx];
  const disp = cpDisplay(a, cp);
  const live = liveCounts(a);
  const pct = Math.round(((idx) / cps.length) * 100);
  const allowsNa = cp.allows_na;
  const isFreshSession = !sessionStorage.getItem('audit_session_' + a.id + '_' + (a.current_cro_index || 0));
  if (idx > 0 && isFreshSession) sessionStorage.setItem('audit_session_' + a.id + '_' + (a.current_cro_index || 0), '1');

  // Per-CRO banner: which CRO are we scoring right now.
  let croBanner = '';
  if (auditIsPerCro(a)) {
    const st = Store.load();
    const cro = (st.cros || []).find(c => c.id === currentCroId(a));
    const order = a.cro_order || [];
    croBanner = `<div class="cro-banner">Scoring <strong>${escapeHtml(cro ? cro.name : 'CRO')}</strong> · ${(a.current_cro_index || 0) + 1} of ${order.length}</div>`;
  }

  // Are we revisiting something the user already SKIPped? That happens once
  // every truly-unmarked checkpoint has a verdict.
  const currentResult = resultsBucket(a)[cp.id];
  const isRevisitingSkip = currentResult && currentResult.result === 'SKIP';
  const skipped = skippedCount(a);

  return `
    ${croBanner}
    ${idx > 0 && isFreshSession ? `
      <div class="resume-banner">
        <h3>Resuming ${freq === 'weekly' ? 'weekly ' : ''}audit</h3>
        <p class="muted" style="margin:0">Picked up at checkpoint ${idx + 1} of ${cps.length}. ${live.p} pass, ${live.f} fail, ${live.na} N/A so far.</p>
      </div>` : ''}
    ${isRevisitingSkip ? `
      <div class="resume-banner" style="background:#fff8e1;border-left-color:var(--amber)">
        <h3>Revisiting skipped checkpoint${skipped > 1 ? ` (${skipped} left)` : ''}</h3>
        <p class="muted" style="margin:0">All other checkpoints are done. Give this one a final verdict before you can submit.</p>
      </div>` : ''}
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="cp-meta">
      <span class="sop-chip ${disp.critical ? 'critical' : ''}">${escapeHtml(disp.sectionLabel)}</span>
      <span>${escapeHtml(cp.id)}</span>
      <span style="margin-left:auto">${idx + 1} of ${cps.length}${skipped > 0 && !isRevisitingSkip ? ` &middot; ${skipped} skipped` : ''}</span>
    </div>
    <div class="card">
      <div class="cp-text">${escapeHtml(disp.text)}</div>
      ${cp.evidence ? `<div class="cp-evidence">Evidence: ${escapeHtml(cp.evidence)}</div>` : ''}
      ${cp.photo_required_on_fail
        ? `<div class="photo-required-badge">Photo required if FAIL</div>`
        : ''}
    </div>
    ${renderCheckpointPhotoStrip(a, cp.id)}
    <div class="btn-row">
      <button class="btn btn-pass" data-action="mark" data-verdict="P">PASS</button>
      <button class="btn btn-fail" data-action="mark" data-verdict="F">FAIL</button>
      ${allowsNa ? `<button class="btn btn-na" data-action="mark" data-verdict="NA">N / A</button>` : ''}
    </div>
    ${!isRevisitingSkip ? `
      <button class="btn btn-ghost" data-action="mark" data-verdict="SKIP"
              style="margin-top:8px;color:var(--amber);border:1px dashed var(--amber)">
        ⏭ Skip — come back later
      </button>` : ''}
    <div class="minicounts">
      <div class="minicount p"><span class="n">${live.p}</span><span class="lbl">PASS</span></div>
      <div class="minicount f"><span class="n">${live.f}</span><span class="lbl">FAIL</span></div>
      <div class="minicount na"><span class="n">${live.na}</span><span class="lbl">N/A</span></div>
    </div>
    <div class="spacer-24"></div>
    <button class="btn btn-ghost" data-action="cancel-audit">Cancel audit</button>
  `;
}

// Per-checkpoint photo strip — shows existing photos and an Add Photo
// button. Photos attach to the current checkpoint's result row even if no
// verdict has been chosen yet; markCheckpoint() preserves them.
function renderCheckpointPhotoStrip(audit, cpId) {
  const r = resultsBucket(audit)[cpId] || {};
  const photos = r.photos || [];
  const tiles = photos.map((url, i) => `
    <div class="cp-photo-tile">
      <img src="${url}" alt="Photo ${i + 1}">
      <button class="photo-remove" data-action="remove-cp-photo" data-cp="${escapeHtml(cpId)}" data-i="${i}" title="Remove">×</button>
    </div>`).join('');
  return `
    <div class="cp-photos">
      <div class="cp-photos-head">
        <span>Evidence photos${photos.length ? ` · ${photos.length}` : ''}</span>
        <button class="cp-photo-add" data-action="add-cp-photo" data-cp="${escapeHtml(cpId)}">
          <span>📷</span> ${photos.length === 0 ? 'Take photo' : 'Add another'}
        </button>
      </div>
      ${photos.length > 0 ? `<div class="cp-photo-grid">${tiles}</div>` : ''}
    </div>
  `;
}

// Per-CRO scoring: each CRO scored on the same checklist; aggregate is the
// pooled pass-rate across all CROs.
function scorePerCro(audit, cps) {
  const order = audit.cro_order || [];
  const byCro = {};
  let totP = 0, totF = 0, totNa = 0, totMax = 0;
  order.forEach(cid => {
    const res = (audit.cro_results && audit.cro_results[cid]) || {};
    const sc = scoreAudit(res, cps);
    byCro[cid] = sc;
    totP += sc.p; totF += sc.f; totNa += sc.na; totMax += (sc.p + sc.f);
  });
  const pct = totMax > 0 ? Math.round((totP / totMax) * 1000) / 10 : 100;
  return {
    byCro,
    aggregate: { raw: totP, max: totMax, pct, band: bandFor(pct), p: totP, f: totF, na: totNa, total: cps.length * order.length },
  };
}

// Shown between CROs in a per-CRO audit: the just-finished CRO's score + a
// button to start the next one.
function renderCroHandoff(a, ci) {
  const st = Store.load();
  const order = a.cro_order || [];
  const cps = checkpointsFor(a);
  const doneCro = (st.cros || []).find(c => c.id === order[ci]);
  const nextCro = (st.cros || []).find(c => c.id === order[ci + 1]);
  const sc = scoreAudit((a.cro_results && a.cro_results[order[ci]]) || {}, cps);
  return `
    <div class="card score-card">
      <p class="tiny">CRO ${ci + 1} of ${order.length} done</p>
      <div class="score-pct ${sc.band}">${sc.pct.toFixed(1)}%</div>
      <div class="score-band ${sc.band}">${escapeHtml(doneCro ? doneCro.name : 'CRO')}</div>
      <p class="muted">${sc.p} pass &middot; ${sc.f} fail &middot; ${sc.na} N/A</p>
    </div>
    <button class="btn btn-primary" data-action="next-cro">Next: ${escapeHtml(nextCro ? nextCro.name : 'CRO')} (${ci + 2} of ${order.length}) →</button>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="cancel-audit">Discard draft</button>
  `;
}

function renderReviewAudit(a) {
  const cps = checkpointsFor(a);
  const isWeekly = frequencyOf(a) === 'weekly';
  let s, extra = '';
  if (isWeekly) {
    const dailyPcts = dailyPctsForWeek(a.week_number, a.year, Store.load());
    const verdicts = {};
    Object.keys(a.results || {}).forEach(id => { verdicts[id] = a.results[id].result; });
    s = scoreWeekly(dailyPcts, verdicts, cps);
    extra = `<p class="muted">Daily contribution ${s.dailyContribution}/${dailyTemplateCount()} (avg ${s.avgDaily}% over ${dailyPcts.length} day${dailyPcts.length === 1 ? '' : 's'}) + weekly ${s.weeklyRaw}/${s.weeklyMax}</p>`;
  } else if (auditIsPerCro(a)) {
    const sp = scorePerCro(a, cps);
    s = sp.aggregate;
    const st = Store.load();
    extra = `<div style="margin-top:10px;text-align:left">${(a.cro_order || []).map(cid => {
      const cro = (st.cros || []).find(c => c.id === cid);
      const cs = sp.byCro[cid];
      return `<div class="cro-rank"><span>${escapeHtml(cro ? cro.name : 'CRO')}</span><span class="pct ${cs.band}">${cs.pct.toFixed(1)}%</span></div>`;
    }).join('')}</div>`;
  } else {
    s = scoreAudit(a.results, cps);
  }
  return `
    <div class="card score-card">
      <p class="tiny">${isWeekly ? `WEEKLY DRAFT · Week ${a.week_number}, ${a.year}` : 'DRAFT'} &middot; review before submit</p>
      <div class="score-pct ${s.band}">${s.pct.toFixed(1)}%</div>
      <div class="score-band ${s.band}">${bandLabel(s.band)}</div>
      <p class="muted">${s.raw} of ${s.max} points &middot; ${s.p} pass &middot; ${s.f} fail &middot; ${s.na} N/A</p>
      ${extra}
    </div>
    <div class="card">
      <label class="field" style="margin:0">
        <span>Audit notes <span class="muted" style="font-weight:400">(optional)</span></span>
        <textarea id="auditNotes" maxlength="500" rows="3"
                  placeholder="Context for this audit — e.g. rain today, low footfall, 3 staff out, festival rush"
                  >${escapeHtml(a.notes || '')}</textarea>
        <p class="tiny muted" style="margin:6px 0 0">
          Shown on the report, in the History detail and the CSV. Use for one-off context that doesn't fit a checkpoint.
        </p>
      </label>
    </div>
    <button class="btn btn-primary" data-action="submit-audit">Submit audit</button>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="cancel-audit">Discard draft</button>
  `;
}

// ---------------------------------------------------------------------------
// Trends — pure compute helpers (unit-tested) + a chart view inside History.
// All operate on submitted non-weekly audits.
// ---------------------------------------------------------------------------

// Flat [{cpId, result}] across either results shape (store or per-CRO).
function allResultEntries(audit) {
  const out = [];
  if (auditIsPerCro(audit)) {
    Object.values(audit.cro_results || {}).forEach(bucket => {
      Object.entries(bucket).forEach(([cpId, r]) => out.push({ cpId, result: r.result }));
    });
  } else {
    Object.entries(audit.results || {}).forEach(([cpId, r]) => out.push({ cpId, result: r.result }));
  }
  return out;
}

// cpId → section label, across template / legacy-daily / legacy-weekly shapes.
function sectionLabelMap(audit) {
  const map = {};
  const tpl = templateFor(audit);
  const cps = checkpointsFor(audit);
  if (tpl && tpl.sections) {
    const byId = {}; tpl.sections.forEach(s => { byId[s.id] = s.name; });
    cps.forEach(c => { map[c.id] = byId[c.section_id] || c.section_id || 'Other'; });
  } else {
    cps.forEach(c => {
      if (c.sop_id) { const sop = SOPS.find(s => s.id === c.sop_id); map[c.id] = sop ? sop.name : c.sop_id; }
      else if (c.group_en) map[c.id] = c.group_en;
      else map[c.id] = 'Other';
    });
  }
  return map;
}

function avg1(arr) { return arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null; }

function trendByWeek(audits, weeks) {
  weeks = weeks || 12;
  const now = new Date();
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ref = new Date(now); ref.setDate(ref.getDate() - i * 7);
    buckets.push({ week: isoWeekOf(ref), year: ref.getFullYear(), pcts: [] });
  }
  audits.forEach(a => {
    if (!a.score) return;
    const d = new Date(a.date), wk = isoWeekOf(d), yr = d.getFullYear();
    const b = buckets.find(x => x.week === wk && x.year === yr);
    if (b) b.pcts.push(a.score.pct);
  });
  return buckets.map(b => {
    const avg = avg1(b.pcts);
    return { label: 'W' + b.week, avgPct: avg, count: b.pcts.length, band: avg != null ? bandFor(avg) : null };
  });
}

function trendByWeekday(audits) {
  const days = [[], [], [], [], [], [], []]; // JS getDay: 0=Sun..6=Sat
  audits.forEach(a => { if (a.score) days[new Date(a.date).getDay()].push(a.score.pct); });
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return order.map((d, i) => {
    const avg = avg1(days[d]);
    return { name: names[i], avgPct: avg, count: days[d].length, band: avg != null ? bandFor(avg) : null };
  });
}

function trendBySection(audits, days) {
  days = days || 28;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const agg = {};
  audits.forEach(a => {
    if (a.date < cutoffStr) return;
    const map = sectionLabelMap(a);
    allResultEntries(a).forEach(({ cpId, result }) => {
      if (result !== 'P' && result !== 'F') return;
      const sec = map[cpId] || 'Other';
      agg[sec] = agg[sec] || { pass: 0, total: 0 };
      agg[sec].total++;
      if (result === 'P') agg[sec].pass++;
    });
  });
  return Object.entries(agg).map(([section, v]) => {
    const pct = v.total ? Math.round((v.pass / v.total) * 1000) / 10 : 0;
    return { section, passRate: pct, fails: v.total - v.pass, total: v.total, band: bandFor(pct) };
  }).sort((a, b) => a.passRate - b.passRate); // worst first
}

const HistoryView = { mode: 'list' }; // 'list' | 'trends'

function renderTrends(dailyAudits) {
  if (dailyAudits.length === 0) {
    return '<div class="card"><p class="muted">No submitted daily audits yet — trends appear once you have a few.</p></div>';
  }
  const weeks = trendByWeek(dailyAudits, 12);
  const wkMax = 100;
  const weekday = trendByWeekday(dailyAudits);
  const sections = trendBySection(dailyAudits, 28);

  const weekBars = weeks.map(w => `
    <div class="t-col" title="${w.label}: ${w.avgPct == null ? 'no data' : w.avgPct + '%'}">
      <div class="t-bar-wrap">
        ${w.avgPct == null ? '' : `<div class="t-bar ${w.band}" style="height:${Math.max(2, (w.avgPct / wkMax) * 100)}%"></div>`}
      </div>
      <div class="t-col-label">${w.label}</div>
    </div>`).join('');

  const dayCells = weekday.map(d => `
    <div class="t-cell ${d.avgPct == null ? 'empty' : d.band}">
      <div class="t-cell-day">${d.name}</div>
      <div class="t-cell-pct">${d.avgPct == null ? '—' : d.avgPct + '%'}</div>
      <div class="t-cell-n">${d.count ? d.count + ' audit' + (d.count > 1 ? 's' : '') : ''}</div>
    </div>`).join('');

  const secBars = sections.length === 0
    ? '<p class="muted" style="font-size:13px">No section data in the last 4 weeks.</p>'
    : sections.map(s => `
      <div class="t-sec-row">
        <div class="t-sec-head"><span>${escapeHtml(s.section)}</span><span class="pct ${s.band}">${s.passRate}%</span></div>
        <div class="t-sec-track"><div class="t-sec-fill ${s.band}" style="width:${s.passRate}%"></div></div>
        <div class="tiny muted">${s.fails} fail(s) of ${s.total} checks</div>
      </div>`).join('');

  return `
    <div class="card">
      <h2>12-week compliance</h2>
      <p class="muted">Average daily score per week.</p>
      <div class="t-bars">${weekBars}</div>
    </div>
    <div class="card">
      <h2>By day of week</h2>
      <p class="muted">Which days run weakest. Average daily score per weekday.</p>
      <div class="t-heat">${dayCells}</div>
    </div>
    <div class="card">
      <h2>By section · last 4 weeks</h2>
      <p class="muted">Pass-rate per section, weakest first — where to focus.</p>
      ${secBars}
    </div>
  `;
}

function renderHistoryTab(state, auth) {
  // SM sees own audits only; GM and Owner see all.
  const submitted = state.audits
    .filter(a => isFinalized(a))
    .filter(a => {
      if (!auth || auth.role !== 'SM') return true;
      return a.auditor_id === auth.id || !a.auditor_id; // legacy audits with no auditor_id are visible too
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Sub-view toggle (List | Trends)
  const toggle = `
    <div class="template-picker" style="margin-bottom:12px">
      <button class="tpl-pick ${HistoryView.mode === 'list' ? 'active' : ''}" data-action="history-view" data-mode="list">Audits</button>
      <button class="tpl-pick ${HistoryView.mode === 'trends' ? 'active' : ''}" data-action="history-view" data-mode="trends">📊 Trends</button>
    </div>`;

  if (HistoryView.mode === 'trends') {
    const dailyAudits = submitted.filter(a => frequencyOf(a) !== 'weekly');
    return toggle + renderTrends(dailyAudits);
  }

  if (submitted.length === 0) {
    return toggle + `<div class="card"><h2>No submitted audits yet</h2><p class="muted">Once you submit a daily audit it'll appear here.</p></div>`;
  }

  // CRO performance summary — count FAILs attributed per CRO in last 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));
  const croFailCounts = {};
  submitted.filter(a => a.date >= cutoff).forEach(a => {
    Object.values(a.results).forEach(r => {
      if (r.result === 'F' && r.cro_id) {
        croFailCounts[r.cro_id] = (croFailCounts[r.cro_id] || 0) + 1;
      }
    });
  });
  const ranked = Object.entries(croFailCounts)
    .filter(([id]) => croById[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const croSummaryHtml = ranked.length > 0 ? `
    <div class="cro-summary">
      <h3>CROs with most fails (last 30 days)</h3>
      ${ranked.map(([id, n]) => `
        <div class="cro-rank">
          <span>${escapeHtml(croById[id].name)} <span class="muted" style="font-size:12px">· ${escapeHtml(croById[id].counter)}</span></span>
          <span class="badge">${n} fail${n > 1 ? 's' : ''}</span>
        </div>`).join('')}
    </div>` : '';

  return toggle + croSummaryHtml + submitted.map(a => {
    const s = a.score;
    const backdatedChip = a.backdate_reason
      ? ` &middot; <span style="color:var(--amber);font-weight:600">backdated</span>`
      : '';
    const isWeekly = a.audit_type === 'weekly';
    const title = isWeekly
      ? `Weekly · Week ${a.week_number}, ${a.year}`
      : escapeHtml(fmtDate(a.date));
    const verifiedChip = a.status === 'verified'
      ? ` &middot; <span style="color:var(--green,#166534);font-weight:600">✓ verified</span>`
      : '';
    return `
      <div class="hist-row" data-action="open-history" data-id="${a.id}">
        <div>
          <strong>${title}</strong>
          <div class="tiny">${isWeekly ? '<span class="role-pill GM" style="font-size:9px">WEEKLY</span> ' : ''}${s.p} P &middot; ${s.f} F &middot; ${s.na} N/A &middot; by ${escapeHtml(a.auditor_name || '—')}${backdatedChip}${verifiedChip}</div>
        </div>
        <div class="pct ${s.band}">${s.pct.toFixed(1)}%</div>
      </div>`;
  }).join('') + `
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="export-csv">Export all to CSV</button>
  `;
}

// ---------------------------------------------------------------------------
// CAPs tab
// ---------------------------------------------------------------------------

function renderCapsTab(state, auth) {
  const all = Caps.list(state).slice();
  if (all.length === 0) {
    return `
      <div class="card">
        <h2>No CAPs yet</h2>
        <p class="muted">CAPs (Corrective Action Plans) are created automatically when an audit has FAILs. You'll see them here.</p>
      </div>`;
  }

  const filter = window._capsFilter || 'open';
  const counts = {
    all: all.length,
    open: all.filter(c => c.status === 'open').length,
    aged: all.filter(c => c.status === 'aged').length,
    done: all.filter(c => c.status === 'done').length,
    verified: all.filter(c => c.status === 'verified').length,
    closed: all.filter(c => c.status === 'closed').length,
  };

  const filtered = filter === 'all'
    ? all
    : all.filter(c => c.status === filter);

  // Sort: aged first (most urgent), then open by deadline asc, then by created desc
  filtered.sort((a, b) => {
    const r = { aged: 0, open: 1, done: 2, verified: 3, closed: 4 };
    const ra = r[a.status] || 9, rb = r[b.status] || 9;
    if (ra !== rb) return ra - rb;
    if (a.deadline !== b.deadline) return (a.deadline || '').localeCompare(b.deadline || '');
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));
  const userById = Object.fromEntries(state.users.map(u => [u.id, u]));
  const sopById = Object.fromEntries(SOPS.map(s => [s.id, s]));
  const t = today();

  const filterChips = ['open', 'aged', 'done', 'verified', 'closed', 'all'].map(f => {
    const n = counts[f] || 0;
    const active = (filter === f) ? 'active' : '';
    const label = f === 'all' ? 'All' : CAP_STATUS_LABEL[f];
    return `<button class="filter-chip ${active}" data-action="cap-filter" data-filter="${f}">${label}${n > 0 ? ` · ${n}` : ''}</button>`;
  }).join('');

  const rows = filtered.map(c => {
    const sop = sopById[c.sop_id];
    const cp = CHECKPOINTS.find(x => x.id === c.checkpoint_id);
    const responsible = userById[c.responsible_user_id];
    const cro = c.cro_id ? croById[c.cro_id] : null;
    const daysToDeadline = c.deadline
      ? Math.round((new Date(c.deadline) - new Date(t)) / (24 * 60 * 60 * 1000))
      : null;
    const deadlineLabel = c.status === 'closed' || c.status === 'verified'
      ? ''
      : daysToDeadline === null ? ''
        : daysToDeadline < 0 ? `<span class="cap-deadline overdue">${Math.abs(daysToDeadline)}d overdue</span>`
        : daysToDeadline === 0 ? `<span class="cap-deadline today">due today</span>`
        : `<span class="cap-deadline">due in ${daysToDeadline}d</span>`;
    return `
      <div class="cap-row ${c.status}" data-action="open-cap" data-id="${escapeHtml(c.id)}">
        <div class="cap-row-top">
          <span class="cap-id">${escapeHtml(c.id)}</span>
          <span class="cap-pill ${c.status}">${escapeHtml(CAP_STATUS_LABEL[c.status])}</span>
        </div>
        <div class="cap-row-mid">
          <span class="cap-cp ${sop && sop.critical ? 'critical' : ''}">${escapeHtml(sop ? sop.name : c.sop_id)} · ${escapeHtml(c.checkpoint_id)}</span>
        </div>
        <div class="cap-row-text">${escapeHtml(cp ? cp.text : '')}</div>
        ${c.finding ? `<div class="cap-row-finding">${escapeHtml(c.finding)}</div>` : ''}
        <div class="cap-row-bottom">
          ${cro ? `<span class="cap-meta">CRO: ${escapeHtml(cro.name)}</span>` : ''}
          ${responsible
            ? `<span class="cap-meta">Owner: ${escapeHtml(responsible.name)}${responsible.is_active === false ? ' (inactive)' : ''}</span>`
            : (c.responsible_user_id ? `<span class="cap-meta" style="color:var(--red)">Owner: (deleted)</span>` : '')}
          ${deadlineLabel}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="filter-chips">${filterChips}</div>
    ${rows || '<p class="muted" style="text-align:center;padding:20px">No CAPs in this filter.</p>'}
  `;
}

// ---------------------------------------------------------------------------
// CAP detail modal
// ---------------------------------------------------------------------------

function capDetailModal(capId) {
  const state = Store.load();
  const auth = AuthSession.current(state);
  const c = Caps.byId(state, capId);
  if (!c) return;
  const cp = CHECKPOINTS.find(x => x.id === c.checkpoint_id);
  const sop = SOPS.find(s => s.id === c.sop_id);
  const cro = c.cro_id ? state.cros.find(x => x.id === c.cro_id) : null;
  const userOptions = state.users
    .filter(u => u.is_active)
    .map(u => `<option value="${escapeHtml(u.id)}" ${u.id === c.responsible_user_id ? 'selected' : ''}>${escapeHtml(u.name)} — ${escapeHtml(roleLabel(u.role))}</option>`)
    .join('');

  const isVerifier = auth && (auth.role === 'OWNER' || auth.role === 'GM');
  const isReadOnly = c.status === 'closed';

  const actionStepsHtml = c.action_steps.length === 0
    ? '<p class="muted" style="font-size:13px">No action steps yet. Add some below.</p>'
    : c.action_steps.map((s, i) => `
        <label class="step-row">
          <input type="checkbox" data-action="toggle-step" data-cap="${escapeHtml(c.id)}" data-i="${i}" ${s.done ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
          <span class="${s.done ? 'step-done' : ''}">${escapeHtml(s.text)}</span>
          ${!isReadOnly ? `<button class="iconbtn" style="color:var(--red);margin-left:auto" data-action="remove-step" data-cap="${escapeHtml(c.id)}" data-i="${i}">×</button>` : ''}
        </label>`).join('');

  const photosHtml = (c.photos && c.photos.length)
    ? `<div class="photo-grid" style="margin-top:8px">${c.photos.map(p => `<div class="photo-tile"><img src="${p}" alt=""></div>`).join('')}</div>`
    : '';

  const verifyNotesHtml = c.verify_notes
    ? `<div style="background:var(--gray-100);padding:10px;border-radius:8px;margin-top:8px;font-size:13px"><strong>Verifier note:</strong> ${escapeHtml(c.verify_notes)}</div>`
    : '';

  // Status-aware action buttons
  let actionButtons = '';
  if (c.status === 'open' || c.status === 'aged') {
    const allStepsDone = c.action_steps.length > 0 && c.action_steps.every(s => s.done);
    const labelWhenNotReady = c.action_steps.length === 0
      ? 'Add at least one action step first'
      : 'Tick all action steps to mark done';
    actionButtons = `
      <button class="btn btn-primary" data-action="cap-mark-done" data-id="${escapeHtml(c.id)}" ${allStepsDone ? '' : 'disabled'}>
        ${allStepsDone ? 'Mark all done →' : labelWhenNotReady}
      </button>`;
  } else if (c.status === 'done') {
    if (isVerifier) {
      actionButtons = `
        <button class="btn btn-primary" data-action="cap-verify" data-id="${escapeHtml(c.id)}">Verify</button>
        <button class="btn btn-ghost" data-action="cap-reject" data-id="${escapeHtml(c.id)}" style="color:var(--red);border-color:var(--red)">Reject (re-open)</button>
      `;
    } else {
      actionButtons = `<p class="muted" style="text-align:center">Waiting for GM or Owner to verify.</p>`;
    }
  } else if (c.status === 'verified') {
    if (isVerifier) {
      actionButtons = `<button class="btn btn-primary" data-action="cap-close" data-id="${escapeHtml(c.id)}">Close CAP</button>`;
    } else {
      actionButtons = `<p class="muted" style="text-align:center">Waiting for GM or Owner to close.</p>`;
    }
  } else if (c.status === 'closed') {
    actionButtons = `<p class="muted" style="text-align:center">CAP closed on ${escapeHtml(new Date(c.closed_at).toLocaleDateString('en-IN'))}.</p>`;
  }

  openModal(`
    <h3>${escapeHtml(c.id)}</h3>
    <p class="muted">${escapeHtml(sop ? sop.name : c.sop_id)} · checkpoint ${escapeHtml(c.checkpoint_id)} · <span class="cap-pill ${c.status}">${escapeHtml(CAP_STATUS_LABEL[c.status])}</span></p>

    <div style="background:var(--red-pale);border-left:3px solid var(--red);padding:10px 12px;border-radius:6px;margin-top:12px">
      <div style="font-weight:600;font-size:13px;color:var(--red);margin-bottom:4px">Finding</div>
      <div>${escapeHtml(cp ? cp.text : '')}${c.finding ? `<br><em style="color:var(--gray-600)">${escapeHtml(c.finding)}</em>` : ''}</div>
      ${cro ? `<div style="font-size:12px;margin-top:6px">CRO involved: <strong>${escapeHtml(cro.name)}</strong></div>` : ''}
    </div>
    ${photosHtml}

    <h4 style="margin-top:18px;margin-bottom:4px">5 Whys</h4>
    <p class="muted" style="margin:0 0 8px;font-size:12px">Drill down from symptom to root cause. Aim for 5 levels.</p>
    ${[1, 2, 3, 4, 5].map(n => `
      <label class="field" style="margin-bottom:8px">
        <span style="font-size:12px">Why ${n}?</span>
        <input type="text" class="cap-why" data-n="${n}" value="${escapeHtml(c['why' + n] || '')}" ${isReadOnly ? 'disabled' : ''} placeholder="Because…">
      </label>`).join('')}

    <label class="field" style="margin-top:6px">
      <span>Root cause</span>
      <textarea class="cap-rootcause" maxlength="300" ${isReadOnly ? 'disabled' : ''} placeholder="One sentence summary of the underlying cause">${escapeHtml(c.root_cause || '')}</textarea>
    </label>

    <h4 style="margin-top:18px;margin-bottom:4px">Action steps</h4>
    <p class="muted" style="margin:0 0 8px;font-size:12px">3 to 5 concrete steps. Tick each off as it's done.</p>
    <div id="capStepsList">${actionStepsHtml}</div>
    ${!isReadOnly ? `
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" id="capNewStep" placeholder="Add an action step" style="flex:1">
        <button class="btn btn-secondary" data-action="add-step" data-cap="${escapeHtml(c.id)}" style="width:auto;padding:10px 16px">Add</button>
      </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      <label class="field" style="margin:0">
        <span>Responsible</span>
        <select class="cap-responsible" ${isReadOnly ? 'disabled' : ''}>
          <option value="">— unassigned —</option>
          ${userOptions}
        </select>
      </label>
      <label class="field" style="margin:0">
        <span>Deadline</span>
        <input type="date" class="cap-deadline-input" value="${escapeHtml(c.deadline || '')}" ${isReadOnly ? 'disabled' : ''}>
      </label>
    </div>

    ${verifyNotesHtml}

    ${!isReadOnly ? `<button class="btn btn-ghost" data-action="cap-save-edits" data-id="${escapeHtml(c.id)}" style="margin-top:14px">Save changes</button>` : ''}

    <div style="margin-top:14px;display:grid;gap:10px">
      ${actionButtons}
      <button class="btn btn-ghost" data-action="modal-cancel">Close</button>
    </div>
  `);
}

// ---------------------------------------------------------------------------
// Reference tab — bilingual content from window.REFERENCE_DATA.
// ---------------------------------------------------------------------------

const RefState = { sub: 'bands', glossaryFilter: '' };

function renderReferenceTab() {
  const data = window.REFERENCE_DATA;
  if (!data) {
    return '<div class="card"><p class="muted">Reference content not loaded.</p></div>';
  }
  const chips = [
    { id: 'bands',    label: I18n.current === 'mr' ? 'श्रेणी'    : 'Bands' },
    { id: 'triggers', label: I18n.current === 'mr' ? 'अलर्ट्स'   : 'Triggers' },
    { id: 'evidence', label: I18n.current === 'mr' ? 'पुरावा'    : 'Evidence' },
    { id: 'glossary', label: I18n.current === 'mr' ? 'शब्दकोश'   : 'Glossary' },
  ];
  let content = '';
  if (RefState.sub === 'bands')    content = renderRefBands(data.rating_scale);
  if (RefState.sub === 'triggers') content = renderRefTriggers(data.escalation_triggers);
  if (RefState.sub === 'evidence') content = renderRefEvidence(data.evidence);
  if (RefState.sub === 'glossary') content = renderRefGlossary(data.glossary);
  return `
    <div class="ref-subnav">
      ${chips.map(c => `
        <button class="ref-chip ${RefState.sub === c.id ? 'active' : ''}" data-action="ref-sub" data-id="${c.id}">${escapeHtml(c.label)}</button>
      `).join('')}
    </div>
    <div id="ref-content">${content}</div>
  `;
}

function pickLang(item, fieldEn) {
  // For items shaped { en: 'x', mr: 'y' } OR { label_en: 'x', label_mr: 'y' }
  // OR a top-level title_en/title_mr pair.
  const enKey = fieldEn;
  const mrKey = fieldEn.endsWith('_en') ? fieldEn.slice(0, -3) + '_mr' : 'mr';
  if (I18n.current === 'mr' && item && item[mrKey]) return item[mrKey];
  return item ? item[enKey] : '';
}

function renderRefBands(rs) {
  if (!rs || !rs.bands) return '<p class="muted">No band data.</p>';
  const title = I18n.current === 'mr' && rs.title_mr ? rs.title_mr : (rs.title_en || 'Compliance rating bands');
  const warning = rs.warning && (I18n.current === 'mr' && rs.warning.mr ? rs.warning.mr : rs.warning.en);
  return `
    <h2 style="font-family:'DM Serif Display',serif;color:var(--navy);font-size:22px;margin-bottom:10px">${escapeHtml(title)}</h2>
    ${rs.bands.map(b => `
      <div class="ref-band" style="border-left-color:${b.color || '#999'}">
        <div class="ref-band-head">
          <strong style="color:${b.color || '#999'}">${escapeHtml(pickLang(b, 'label_en'))}</strong>
          <span class="muted" style="font-size:13px">${b.min_pct}% – ${b.max_pct}%</span>
        </div>
        <p class="muted" style="margin:4px 0 0;font-size:14px">${escapeHtml(pickLang(b, 'description_en') || '')}</p>
      </div>`).join('')}
    ${rs.tier_targets ? `
      <h3 style="font-family:'DM Serif Display',serif;color:var(--navy);font-size:16px;margin:18px 0 8px">${I18n.current === 'mr' ? 'दर्जा लक्ष्ये' : 'Tier targets'}</h3>
      ${rs.tier_targets.map(t => `
        <div class="ref-tier-row">
          <span>${escapeHtml(pickLang(t, 'label_en') || t.tier)}</span>
          <strong>${t.target_pct}%</strong>
        </div>`).join('')}` : ''}
    ${warning ? `<div class="ref-warning">⚠️ ${escapeHtml(warning)}</div>` : ''}
  `;
}

function renderRefTriggers(et) {
  if (!et || !et.triggers) return '<p class="muted">No trigger data.</p>';
  const title = I18n.current === 'mr' && et.title_mr ? et.title_mr : (et.title_en || 'Escalation triggers');
  const mf = et.message_format;
  return `
    <h2 style="font-family:'DM Serif Display',serif;color:var(--navy);font-size:22px;margin-bottom:10px">${escapeHtml(title)}</h2>
    ${mf ? `
      <div class="card">
        <h3 style="font-size:14px;letter-spacing:1px;text-transform:uppercase;color:var(--gold);margin:0 0 6px">${I18n.current === 'mr' ? 'संदेश रचना' : 'Message format'}</h3>
        <p class="muted" style="margin:0 0 8px;font-size:13px">${escapeHtml(I18n.current === 'mr' && mf.intro_mr ? mf.intro_mr : mf.intro_en || '')}</p>
        <ol style="margin:0;padding-left:20px;font-size:13px">
          ${(mf.parts || []).map(p => `<li>${escapeHtml(pickLang(p, 'label_en'))}</li>`).join('')}
        </ol>
      </div>` : ''}
    ${et.triggers.map(tr => `
      <div class="ref-trigger">
        <div class="ref-trigger-head">
          <span class="ref-trigger-num">T${tr.number}</span>
          <strong>${escapeHtml(pickLang(tr, 'label_en'))}</strong>
        </div>
        <div class="ref-trigger-meta">
          <span class="muted">${I18n.current === 'mr' ? 'मर्यादा' : 'Threshold'}: <strong>${escapeHtml(pickLang(tr, 'threshold_en'))}</strong></span>
          <span class="muted">${I18n.current === 'mr' ? 'कोणाला' : 'To'}: <strong>${escapeHtml(tr.to || '—')}</strong></span>
          <span class="muted">${I18n.current === 'mr' ? 'कधी' : 'When'}: <strong>${escapeHtml(tr.when || '—')}</strong></span>
        </div>
        ${tr.channel ? `<div class="ref-trigger-meta"><span class="muted">${I18n.current === 'mr' ? 'चॅनेल' : 'Channel'}: ${(Array.isArray(tr.channel) ? tr.channel : [tr.channel]).map(c => `<span class="ref-channel-pill">${escapeHtml(c)}</span>`).join(' ')}</span></div>` : ''}
      </div>`).join('')}
  `;
}

function renderRefEvidence(ev) {
  if (!ev) return '<p class="muted">No evidence data.</p>';
  const title = I18n.current === 'mr' && ev.title_mr ? ev.title_mr : (ev.title_en || 'Strong vs weak evidence');
  const strong = ev.strong || [];
  const weak = ev.weak || [];
  return `
    <h2 style="font-family:'DM Serif Display',serif;color:var(--navy);font-size:22px;margin-bottom:10px">${escapeHtml(title)}</h2>
    <div class="ref-evidence-grid">
      <div>
        <h3 class="ref-evidence-head" style="color:var(--green)">✓ ${I18n.current === 'mr' ? 'मजबूत पुरावा' : 'Strong evidence'}</h3>
        ${strong.map(s => `<div class="ref-evidence-row strong">${escapeHtml(pickLang(s, 'en'))}</div>`).join('')}
      </div>
      <div>
        <h3 class="ref-evidence-head" style="color:var(--red)">✗ ${I18n.current === 'mr' ? 'कमजोर पुरावा' : 'Weak evidence'}</h3>
        ${weak.map(s => `<div class="ref-evidence-row weak">${escapeHtml(pickLang(s, 'en'))}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderRefGlossary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '<p class="muted">No glossary data.</p>';
  const filter = (RefState.glossaryFilter || '').toLowerCase();
  const filtered = filter
    ? rows.filter(r =>
        (r.en || '').toLowerCase().includes(filter) ||
        (r.mr || '').toLowerCase().includes(filter) ||
        (r.meaning_en || '').toLowerCase().includes(filter))
    : rows;
  return `
    <input type="search" id="glossarySearch" class="glossary-search"
      placeholder="${I18n.current === 'mr' ? 'शोधा...' : 'Search…'}"
      value="${escapeHtml(RefState.glossaryFilter || '')}"
      autocomplete="off">
    <p class="muted" style="font-size:12px;margin:6px 0 14px">${filtered.length} ${I18n.current === 'mr' ? 'नोंदी' : 'entries'}</p>
    ${filtered.map(r => `
      <div class="ref-gloss-row">
        <div class="ref-gloss-term">
          <strong>${escapeHtml(r.en || '')}</strong>
          ${r.mr ? `<span class="muted"> · ${escapeHtml(r.mr)}</span>` : ''}
        </div>
        <div class="ref-gloss-meaning">${escapeHtml((I18n.current === 'mr' && r.meaning_mr) ? r.meaning_mr : (r.meaning_en || ''))}</div>
      </div>`).join('')}
    ${filtered.length === 0 ? '<p class="muted" style="text-align:center;padding:20px">No matches.</p>' : ''}
  `;
}

// ---------------------------------------------------------------------------
// Template Builder (Owner) — create/edit audit checklists as data.
// Lives inside the Settings tab; Builder.editingId !== null shows the editor.
// ---------------------------------------------------------------------------

const Builder = {
  editingId: null,
  open(id) { this.editingId = id; render(); switchTab('settings'); },
  close() { this.editingId = null; render(); },
};

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' };
const CRO_MODE_LABELS = {
  store: 'Once for the store',
  per_cro: 'Score each CRO separately',
};

function renderTemplatesCard(state) {
  const tpls = Templates.all(state);
  return `
    <div class="card">
      <h2>Audit templates</h2>
      <p class="muted">Create and edit the checklists your staff run. Add daily, weekly, monthly or custom audits — no code needed.</p>
      ${tpls.map(t => `
        <div class="user-row">
          <div class="info">
            <div class="name">${escapeHtml(t.name)}
              <span class="role-pill ${t.frequency === 'weekly' ? 'GM' : (t.frequency === 'monthly' ? 'OWNER' : 'SM')}">${escapeHtml(FREQ_LABELS[t.frequency] || t.frequency)}</span>
              ${t.active ? '' : '<span class="role-pill inactive">OFF</span>'}
            </div>
            <div class="meta">${t.checkpoints.length} point(s) · ${(t.sections || []).length} section(s) · ${escapeHtml(CRO_MODE_LABELS[t.cro_mode] || t.cro_mode)}${t.built_in ? ' · built-in' : ''}</div>
          </div>
          <button class="iconbtn" style="color:var(--navy)" data-action="builder-open" data-id="${escapeHtml(t.id)}">Edit ›</button>
        </div>`).join('')}
      <div class="spacer-12"></div>
      <button class="btn btn-secondary" data-action="builder-new">+ New audit template</button>
    </div>
  `;
}

function renderTemplateEditor(tpl) {
  const sectionsHtml = (tpl.sections || []).map(sec => {
    const cps = tpl.checkpoints.filter(c => c.section_id === sec.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    return `
      <div class="card" style="margin-bottom:10px">
        <div class="row-spread">
          <input type="text" class="builder-section-name" data-section="${escapeHtml(sec.id)}"
                 value="${escapeHtml(sec.name)}" placeholder="Section name"
                 style="font-weight:600;border:1px solid var(--gray-200);flex:1;margin-right:8px">
          <button class="iconbtn" style="color:var(--red)" data-action="builder-del-section" data-tpl="${escapeHtml(tpl.id)}" data-section="${escapeHtml(sec.id)}">✕</button>
        </div>
        <div class="spacer-12"></div>
        ${cps.length === 0 ? '<p class="muted" style="font-size:13px">No points yet.</p>' : cps.map((c, i) => `
          <div class="builder-cp-row">
            <div class="builder-cp-text">
              ${escapeHtml(c.text)}
              <div class="builder-cp-flags">
                ${c.allows_na ? '<span class="mini-flag">N/A ok</span>' : ''}
                ${c.photo_required_on_fail ? '<span class="mini-flag photo">📷 required</span>' : ''}
              </div>
            </div>
            <div class="builder-cp-actions">
              <button class="iconbtn" data-action="builder-move-cp" data-tpl="${escapeHtml(tpl.id)}" data-cp="${escapeHtml(c.id)}" data-dir="up" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="iconbtn" data-action="builder-move-cp" data-tpl="${escapeHtml(tpl.id)}" data-cp="${escapeHtml(c.id)}" data-dir="down" ${i === cps.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="iconbtn" data-action="builder-edit-cp" data-tpl="${escapeHtml(tpl.id)}" data-cp="${escapeHtml(c.id)}">✎</button>
              <button class="iconbtn" style="color:var(--red)" data-action="builder-del-cp" data-tpl="${escapeHtml(tpl.id)}" data-cp="${escapeHtml(c.id)}">✕</button>
            </div>
          </div>`).join('')}
        <div class="spacer-12"></div>
        <button class="btn btn-ghost" data-action="builder-add-cp" data-tpl="${escapeHtml(tpl.id)}" data-section="${escapeHtml(sec.id)}" style="font-size:14px;padding:10px">+ Add point to ${escapeHtml(sec.name)}</button>
      </div>`;
  }).join('');

  return `
    <div class="row-spread" style="margin-bottom:12px">
      <button class="btn btn-ghost" data-action="builder-close" style="width:auto;padding:8px 14px">‹ Back</button>
      <span class="tiny">${tpl.checkpoints.length} point(s)</span>
    </div>
    <div class="card">
      <label class="field">
        <span>Audit name</span>
        <input type="text" id="builderName" value="${escapeHtml(tpl.name)}" data-tpl="${escapeHtml(tpl.id)}">
      </label>
      <label class="field">
        <span>How often?</span>
        <select id="builderFreq" data-tpl="${escapeHtml(tpl.id)}">
          ${Object.keys(FREQ_LABELS).map(f => `<option value="${f}" ${tpl.frequency === f ? 'selected' : ''}>${FREQ_LABELS[f]}</option>`).join('')}
        </select>
      </label>
      <label class="field" style="margin-bottom:0">
        <span>Who is scored?</span>
        <select id="builderCroMode" data-tpl="${escapeHtml(tpl.id)}">
          ${Object.keys(CRO_MODE_LABELS).map(m => `<option value="${m}" ${tpl.cro_mode === m ? 'selected' : ''}>${CRO_MODE_LABELS[m]}</option>`).join('')}
        </select>
      </label>
      <p class="tiny muted" style="margin-top:6px">"Once for the store" = one score (cash, inventory, display). "Score each CRO separately" = run the same checklist for every CRO on duty and score each person (grooming).</p>
    </div>

    <h2 style="font-family:'DM Serif Display',serif;color:var(--navy);font-size:18px;margin:16px 0 8px">Sections &amp; points</h2>
    ${sectionsHtml}
    <button class="btn btn-secondary" data-action="builder-add-section" data-tpl="${escapeHtml(tpl.id)}">+ Add section</button>

    <div class="spacer-24"></div>
    <div class="card" style="border-color:var(--gray-200)">
      ${tpl.built_in
        ? `<button class="btn btn-ghost" data-action="builder-reset" data-tpl="${escapeHtml(tpl.id)}">↺ Reset to original (undo all my edits)</button>`
        : `<button class="btn btn-ghost" data-action="builder-delete" data-tpl="${escapeHtml(tpl.id)}" style="color:var(--red);border-color:var(--red)">Delete this template</button>`}
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="builder-toggle-active" data-tpl="${escapeHtml(tpl.id)}">${tpl.active ? 'Turn OFF (hide from Start)' : 'Turn ON'}</button>
    </div>
  `;
}

function builderNewModal() {
  openModal(`
    <h3>New audit template</h3>
    <label class="field"><span>Name</span>
      <input type="text" id="newTplName" placeholder="e.g. Monthly Owner Audit" autocapitalize="words"></label>
    <label class="field" style="margin-bottom:0"><span>How often?</span>
      <select id="newTplFreq">
        ${Object.keys(FREQ_LABELS).map(f => `<option value="${f}">${FREQ_LABELS[f]}</option>`).join('')}
      </select></label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-create-tpl">Create</button>
    </div>
  `);
}

function builderCpModal(tplId, sectionId, cpId) {
  const tpl = Templates.byId(null, tplId);
  if (!tpl) return;
  const cp = cpId ? tpl.checkpoints.find(c => c.id === cpId) : null;
  const sections = tpl.sections || [];
  const selSection = cp ? cp.section_id : sectionId;
  openModal(`
    <h3>${cp ? 'Edit point' : 'Add point'}</h3>
    <label class="field"><span>Checkpoint text</span>
      <textarea id="cpText" maxlength="200" rows="2" placeholder="e.g. Name badge worn">${cp ? escapeHtml(cp.text) : ''}</textarea></label>
    <label class="field"><span>Section</span>
      <select id="cpSection">
        ${sections.map(s => `<option value="${escapeHtml(s.id)}" ${s.id === selSection ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select></label>
    <label class="cro-row" style="cursor:pointer"><input type="checkbox" id="cpNa" ${cp && cp.allows_na ? 'checked' : ''} style="width:18px;height:18px;margin-right:8px"> Allow "N/A" on this point</label>
    <label class="cro-row" style="cursor:pointer"><input type="checkbox" id="cpPhoto" ${cp && cp.photo_required_on_fail ? 'checked' : ''} style="width:18px;height:18px;margin-right:8px"> Photo required if this fails</label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-cp" data-tpl="${escapeHtml(tplId)}" data-cp="${escapeHtml(cpId || '')}">${cp ? 'Save' : 'Add'}</button>
    </div>
  `);
}

function renderSettingsTab(state, auth) {
  const isOwner = auth && auth.role === 'OWNER';
  // Builder takes over the Settings tab when editing a template.
  if (isOwner && Builder.editingId) {
    const tpl = Templates.byId(state, Builder.editingId);
    if (tpl) return renderTemplateEditor(tpl);
    Builder.editingId = null;
  }
  return `
    <div class="card">
      <h2>My account</h2>
      <p class="muted">Signed in as <strong>${escapeHtml(auth.name)}</strong> &middot; ${escapeHtml(roleLabel(auth.role))}${auth.phone ? ' &middot; ' + escapeHtml(displayPhone(auth.phone)) : ''}</p>
      <div class="lang-row" role="group" aria-label="Language">
        <span class="lang-row-label">Language</span>
        <button class="lang-pill ${I18n.current === 'en' ? 'active' : ''}" data-action="set-locale" data-locale="en">English</button>
        <button class="lang-pill ${I18n.current === 'mr' ? 'active' : ''}" data-action="set-locale" data-locale="mr">मराठी</button>
      </div>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="set-my-phone">${auth.phone ? 'Change my phone' : 'Add my phone for WhatsApp escalations'}</button>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="change-my-pin">Change my PIN</button>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="logout">Sign out</button>
    </div>

    ${isOwner ? `
    <div class="card">
      <h2>Users</h2>
      <p class="muted">Owner can add a Store Manager and a GM. Each gets their own PIN and an optional phone for WhatsApp escalations.</p>
      ${Users.listAll(state).map(u => `
        <div class="user-row">
          <div class="info">
            <div class="name">${escapeHtml(u.name)} <span class="role-pill ${u.is_active ? u.role : 'inactive'}">${escapeHtml(u.is_active ? roleLabel(u.role) : 'INACTIVE')}</span></div>
            <div class="meta">
              ${u.phone ? escapeHtml(displayPhone(u.phone)) + ' &middot; ' : ''}Added ${escapeHtml(new Date(u.created_at).toLocaleDateString('en-IN'))}${u.id === auth.id ? ' · that\'s you' : ''}
            </div>
          </div>
          ${u.id === auth.id
            ? ''
            : `<button class="iconbtn" style="color:var(--navy)" data-action="user-menu" data-id="${u.id}">⋯</button>`}
        </div>`).join('')}
      <div class="spacer-12"></div>
      <button class="btn btn-secondary" data-action="add-user">+ Add user</button>
    </div>` : ''}

    ${isOwner ? renderTemplatesCard(state) : ''}

    <div class="card">
      <h2>CROs</h2>
      <p class="muted">Floor staff at Titan World &amp; Helios counters. They appear in the "CROs on duty" picker and the FAIL detail dropdown.</p>
      ${state.cros.length === 0
        ? '<p class="muted">No CROs yet.</p>'
        : state.cros.map(c => `
          <div class="cro-row">
            <span>${escapeHtml(c.name)}<span class="pill">${escapeHtml(c.counter)}</span></span>
            <button class="iconbtn" style="color:var(--red)" data-action="remove-cro" data-id="${c.id}">Remove</button>
          </div>`).join('')}
      <div class="spacer-12"></div>
      <button class="btn btn-secondary" data-action="add-cro">+ Add CRO</button>
    </div>

    <div class="card">
      <h2>Notifications</h2>
      <p class="muted">A daily reminder at 10:00 AM nudges you (or your Store Manager) to run the day's audit. Tap to open straight into the start screen.</p>
      <label class="row-spread" style="margin-top:4px;cursor:pointer">
        <span><strong>Daily audit reminder</strong> <span class="muted" style="font-weight:400">· 10:00 AM</span></span>
        <input type="checkbox" id="dailyReminderToggle"
               ${(window.SaagarShell && window.SaagarShell.isDailyReminderEnabled()) ? 'checked' : ''}
               onchange="onDailyReminderToggle(this.checked)"
               style="width:42px;height:24px;cursor:pointer">
      </label>
    </div>

    <div class="card">
      <h2>Backup &amp; restore</h2>
      <p class="muted">${state.audits.length} audit(s), ${state.cros.length} CRO(s), ${state.users.length} user(s) and ${(state.caps || []).length} CAP(s) stored on this device. One backup file bundles everything — share to Drive, OneDrive, WhatsApp or any other app.</p>
      <button class="btn btn-primary" data-action="backup-drive">Back up to Google Drive</button>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="restore-backup">Restore from backup file</button>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="export-csv">Export all audits to CSV</button>
    </div>

    ${isOwner ? `
    <div class="card">
      <h2>Danger zone</h2>
      <button class="btn btn-ghost" data-action="clear-data" style="color:var(--red);border-color:var(--red)">Erase all data on this device</button>
    </div>` : ''}

    <p class="tiny" style="text-align:center">Saagar Audit &middot; v0.2.0</p>
  `;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal" data-modal>${html}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function failModal(checkpoint, cros) {
  // Seed the draft with photos already attached to this checkpoint (could
  // have been added via the per-checkpoint photo strip before the user
  // chose FAIL). Without this, saving the FAIL would overwrite them.
  FailDraft.reset();
  const _s = Store.load();
  const _a = currentAudit(_s);
  const _row = _a && resultsBucket(_a)[checkpoint.id];
  const _existing = _row && _row.photos;
  if (Array.isArray(_existing) && _existing.length > 0) {
    _existing.forEach(p => FailDraft.add(p));
  }
  const required = checkpoint.photo_required_on_fail;
  const croOptions = ['<option value="">— not attributed —</option>']
    .concat(cros.map(c => `<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.counter)}</option>`))
    .join('');
  openModal(`
    <h3>FAIL — CP ${escapeHtml(checkpoint.id)}</h3>
    <p class="muted">${escapeHtml(checkpoint.text)}</p>
    <label class="field">
      <span>What did you find? <span style="color:var(--red)">*</span></span>
      <textarea id="failFinding" maxlength="200" placeholder="e.g. CRO Suresh had no name badge at opening"></textarea>
    </label>
    <label class="field">
      <span>CRO involved (optional)</span>
      <select id="failCro">${croOptions}</select>
    </label>
    <div class="field">
      <span style="display:block;font-size:13px;color:var(--gray-600);margin-bottom:6px">
        Photo evidence ${required ? '<span class="req-pill">REQUIRED</span>' : '<span class="muted" style="font-size:11px">(optional)</span>'}
      </span>
      <div id="failPhotoGrid" class="photo-grid"></div>
      <button class="btn btn-ghost" type="button" data-action="add-fail-photo" style="margin-top:8px">
        📷 Take photo
      </button>
    </div>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-fail">Save &amp; next</button>
    </div>
  `);
  renderFailPhotoGrid();
}

function renderFailPhotoGrid() {
  const root = document.getElementById('failPhotoGrid');
  if (!root) return;
  if (FailDraft.photos.length === 0) {
    root.innerHTML = '<p class="muted" style="font-size:13px;margin:0">No photos yet.</p>';
    return;
  }
  root.innerHTML = FailDraft.photos.map((url, i) => `
    <div class="photo-tile">
      <img src="${url}" alt="Photo ${i + 1}">
      <button class="photo-remove" data-action="remove-fail-photo" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');
}

function naModal(checkpoint) {
  openModal(`
    <h3>N/A — CP ${escapeHtml(checkpoint.id)}</h3>
    <p class="muted">${escapeHtml(checkpoint.text)}</p>
    <label class="field">
      <span>Why is this not applicable today?</span>
      <textarea id="naReason" maxlength="200" placeholder="e.g. counter closed today, no high-value sales"></textarea>
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-na">Mark N/A</button>
    </div>
  `);
}

function addCroModal() {
  openModal(`
    <h3>Add CRO</h3>
    <label class="field">
      <span>Name</span>
      <input type="text" id="croName" placeholder="e.g. Suresh">
    </label>
    <label class="field">
      <span>Counter</span>
      <select id="croCounter">
        <option value="Titan">Titan World</option>
        <option value="Helios">Helios</option>
      </select>
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-cro">Add</button>
    </div>
  `);
}

function addUserModal() {
  openModal(`
    <h3>Add user</h3>
    <p class="muted">Owner adds Store Manager and GM accounts. Each user gets their own 4-digit PIN and (optionally) a phone number for WhatsApp escalations.</p>
    <label class="field">
      <span>Name</span>
      <input type="text" id="newUserName" placeholder="e.g. Priya Joshi" autocapitalize="words">
    </label>
    <label class="field">
      <span>Role</span>
      <select id="newUserRole">
        <option value="SM">Store Manager (runs daily audits)</option>
        <option value="GM">GM (verifies audits, manages CAPs)</option>
      </select>
    </label>
    <label class="field">
      <span>Phone (10 digits, optional)</span>
      <input type="tel" id="newUserPhone" inputmode="tel" placeholder="e.g. 9876543210">
    </label>
    <label class="field">
      <span>4-digit PIN</span>
      <input type="tel" id="newUserPin" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <label class="field">
      <span>Confirm PIN</span>
      <input type="tel" id="newUserPinConfirm" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-user">Add user</button>
    </div>
  `);
}

function setPhoneModal(userId) {
  const state = Store.load();
  const u = userId ? Users.byId(state, userId) : AuthSession.current(state);
  if (!u) return;
  openModal(`
    <h3>${userId ? 'Phone for ' + escapeHtml(u.name) : 'My phone number'}</h3>
    <p class="muted">Used to open a WhatsApp message when an escalation fires. Leave blank to clear.</p>
    <label class="field">
      <span>Phone (10 digits or country-coded)</span>
      <input type="tel" id="phoneInput" inputmode="tel" value="${escapeHtml(u.phone || '')}" placeholder="e.g. 9876543210">
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-phone" data-id="${escapeHtml(u.id)}">Save</button>
    </div>
  `);
}

function changePinModal() {
  openModal(`
    <h3>Change your PIN</h3>
    <label class="field">
      <span>Current PIN</span>
      <input type="tel" id="pinCurrent" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <label class="field">
      <span>New PIN</span>
      <input type="tel" id="pinNew" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <label class="field">
      <span>Confirm new PIN</span>
      <input type="tel" id="pinNewConfirm" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-my-pin">Save</button>
    </div>
  `);
}

function resetPinModal(userId) {
  const state = Store.load();
  const u = Users.byId(state, userId);
  if (!u) return;
  openModal(`
    <h3>Reset PIN for ${escapeHtml(u.name)}</h3>
    <p class="muted">Set a new 4-digit PIN. They'll use this to sign in next time.</p>
    <label class="field">
      <span>New PIN</span>
      <input type="tel" id="resetPinNew" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <label class="field">
      <span>Confirm</span>
      <input type="tel" id="resetPinConfirm" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••">
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-reset-pin" data-id="${escapeHtml(u.id)}">Save new PIN</button>
    </div>
  `);
}

function userMenuModal(userId) {
  const state = Store.load();
  const u = Users.byId(state, userId);
  if (!u) return;
  openModal(`
    <h3>${escapeHtml(u.name)}</h3>
    <p class="muted">${escapeHtml(roleLabel(u.role))} &middot; ${u.is_active ? 'active' : 'inactive'}${u.phone ? ' &middot; ' + escapeHtml(displayPhone(u.phone)) : ''}</p>
    <div style="display:grid;gap:10px;margin-top:14px">
      <button class="btn btn-secondary" data-action="user-set-phone" data-id="${escapeHtml(u.id)}">${u.phone ? 'Change phone' : 'Add phone number'}</button>
      <button class="btn btn-secondary" data-action="user-reset-pin" data-id="${escapeHtml(u.id)}">Reset PIN</button>
      ${u.is_active
        ? `<button class="btn btn-ghost" data-action="user-deactivate" data-id="${escapeHtml(u.id)}" style="color:var(--red);border-color:var(--red)">Deactivate user</button>`
        : `<button class="btn btn-ghost" data-action="user-reactivate" data-id="${escapeHtml(u.id)}">Reactivate user</button>`}
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
    </div>
  `);
}

function perCroHistoryDetailModal(a, tpl, croById) {
  const s = a.score;
  const cps = checkpointsFor(a);
  const cpById = {};
  cps.forEach(c => { cpById[c.id] = c; });
  const order = a.cro_order || Object.keys(a.cro_results || {});

  const croCards = order.map(cid => {
    const cro = croById[cid];
    const cs = (a.score_by_cro && a.score_by_cro[cid]) || scoreAudit((a.cro_results && a.cro_results[cid]) || {}, cps);
    const res = (a.cro_results && a.cro_results[cid]) || {};
    const fails = Object.entries(res).filter(([, r]) => r.result === 'F').map(([cpId, r]) => {
      const cp = cpById[cpId];
      const photoHtml = (r.photos || []).length
        ? `<div class="detail-photos">${r.photos.map(p => `<img src="${p}" alt="">`).join('')}</div>` : '';
      return `<div class="result-row"><span class="cp-id">${escapeHtml(cpId)}</span>
        <div class="cp-body"><div>${escapeHtml(cp ? cp.text : '')}</div>
        ${r.finding ? `<div class="cp-finding">${escapeHtml(r.finding)}</div>` : ''}${photoHtml}</div>
        <span class="verdict-pill F">F</span></div>`;
    }).join('');
    return `
      <div class="detail-sop">
        <div class="detail-sop-header">
          ${escapeHtml(cro ? cro.name : 'CRO')}
          <span class="count"><span class="pct ${cs.band}">${cs.pct.toFixed(1)}%</span> · ${cs.f} fail(s)</span>
        </div>
        ${fails || '<p class="muted" style="font-size:13px;padding:6px">No failures — clean.</p>'}
      </div>`;
  }).join('');

  openModal(`
    <h3>${escapeHtml(tpl ? tpl.name : 'Audit')} · ${escapeHtml(fmtDate(a.date))}</h3>
    <p class="muted">Per-CRO · submitted ${escapeHtml(new Date(a.submitted_at).toLocaleString('en-IN'))} by ${escapeHtml(a.auditor_name || '—')}</p>
    <div class="score-card" style="padding:12px">
      <div class="score-pct ${s.band}" style="font-size:48px">${s.pct.toFixed(1)}%</div>
      <div class="score-band ${s.band}">${bandLabel(s.band)} · pooled across ${order.length} CRO(s)</div>
      <p class="muted">${s.p} pass · ${s.f} fail · ${s.na} N/A</p>
    </div>
    ${verifyControlsHtml(a)}
    <div class="row">
      <button class="btn btn-secondary" data-action="print-audit" data-id="${escapeHtml(a.id)}">📄 Print / Save as PDF</button>
      <button class="btn btn-ghost" data-action="modal-cancel">Close</button>
    </div>
    ${croCards}
  `);
}

function historyDetailModal(a) {
  const s = a.score;
  const state = Store.load();
  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));
  const isWeekly = frequencyOf(a) === 'weekly';
  const tpl = templateFor(a);

  // Per-CRO audits get a dedicated detail view: per-CRO scores + their fails.
  if (auditIsPerCro(a)) {
    return perCroHistoryDetailModal(a, tpl, croById);
  }

  // Group results by the template's sections (preferred), else by the legacy
  // SOP (daily) or weekly group.
  let groups;
  if (tpl) {
    groups = (tpl.sections || []).map(sec => ({
      sop: { name: (_localMr(sec.name_mr) || sec.name), critical: !!sec.critical },
      cps: tpl.checkpoints.filter(c => c.section_id === sec.id),
    })).filter(g => g.cps.length);
    // Any checkpoints not in a known section → catch-all bucket.
    const grouped = new Set(groups.flatMap(g => g.cps.map(c => c.id)));
    const orphans = tpl.checkpoints.filter(c => !grouped.has(c.id));
    if (orphans.length) groups.push({ sop: { name: 'Other', critical: false }, cps: orphans });
  } else if (isWeekly) {
    const order = ['operations', 'cash_weekly', 'reporting_service', 'inventory_weekly'];
    groups = order.map(g => {
      const cps = WEEKLY_CHECKPOINTS.filter(c => c.group === g);
      return {
        sop: { name: cps[0] ? cps[0].group_en : g, critical: cps[0] ? cps[0].critical : false },
        cps,
      };
    }).filter(g => g.cps.length);
  } else {
    groups = SOPS.slice().sort((x, y) => x.number - y.number).map(sop => ({
      sop, cps: CHECKPOINTS.filter(c => c.sop_id === sop.id),
    }));
  }

  const groupsHtml = groups.map(({ sop, cps }) => {
    const rowsHtml = cps.map(cp => {
      const r = a.results[cp.id] || { result: 'NA', finding: '(not marked)', photos: [] };
      const v = r.result;
      const cro = r.cro_id ? croById[r.cro_id] : null;
      const photos = (r.photos || []);
      const photoHtml = photos.length
        ? `<div class="detail-photos">${photos.map(p => `<img src="${p}" alt="">`).join('')}</div>`
        : '';
      const detailHtml = (v === 'F' || v === 'NA') && r.finding
        ? `<div class="cp-finding">${escapeHtml(r.finding)}${cro ? ` · <em>${escapeHtml(cro.name)}</em>` : ''}</div>${photoHtml}`
        : '';
      return `
        <div class="result-row">
          <span class="cp-id">${escapeHtml(cp.id)}</span>
          <div class="cp-body">
            <div>${escapeHtml(cp.text)}</div>
            ${detailHtml}
          </div>
          <span class="verdict-pill ${v}">${v}</span>
        </div>`;
    }).join('');
    const failCount = cps.filter(cp => (a.results[cp.id] || {}).result === 'F').length;
    return `
      <div class="detail-sop">
        <div class="detail-sop-header ${sop.critical ? 'critical' : ''}">
          ${escapeHtml(sop.name)}
          <span class="count">${failCount > 0 ? `${failCount} fail${failCount > 1 ? 's' : ''}` : 'all pass'}</span>
        </div>
        ${rowsHtml}
      </div>`;
  }).join('');

  const backdatedBadge = a.backdate_reason
    ? `<div class="card" style="background:#fff8e1;border:1px solid #f4c674;color:#6a4a00;margin-top:8px;padding:10px 12px">
         <strong>⚠ Backdated audit</strong>
         <p style="margin:4px 0 0;font-size:13px;line-height:1.45">${escapeHtml(a.backdate_reason)}</p>
       </div>`
    : '';
  const notesCard = a.notes
    ? `<div class="card" style="margin-top:8px;padding:10px 12px">
         <strong>Audit notes</strong>
         <p style="margin:4px 0 0;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(a.notes)}</p>
       </div>`
    : '';
  openModal(`
    <h3>${isWeekly ? `Weekly audit · Week ${a.week_number}, ${a.year}` : escapeHtml(fmtDate(a.date))}</h3>
    <p class="muted">Submitted ${escapeHtml(new Date(a.submitted_at).toLocaleString('en-IN'))} by ${escapeHtml(a.auditor_name || '—')}</p>
    ${isWeekly && a.daily_pcts_used ? `<p class="muted">Daily contribution: avg ${a.score.avgDaily}% over ${a.daily_pcts_used.length} day(s) → ${a.score.dailyContribution}/${(a.score.max - (a.score.weeklyMax || 0))}</p>` : ''}
    ${backdatedBadge}
    ${notesCard}
    <div class="score-card" style="padding:12px">
      <div class="score-pct ${s.band}" style="font-size:48px">${s.pct.toFixed(1)}%</div>
      <div class="score-band ${s.band}">${bandLabel(s.band)}</div>
      <p class="muted">${s.raw} of ${s.max} points &middot; ${s.p} P &middot; ${s.f} F &middot; ${s.na} N/A</p>
    </div>
    ${verifyControlsHtml(a)}
    <div class="row">
      <button class="btn btn-secondary" data-action="share-audit-wa" data-id="${escapeHtml(a.id)}">📱 Send to WhatsApp</button>
      <button class="btn btn-secondary" data-action="print-audit" data-id="${escapeHtml(a.id)}">📄 Print / Save as PDF</button>
    </div>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="modal-cancel" style="width:100%">Close</button>
    ${groupsHtml}
  `);
}

// ---------------------------------------------------------------------------
// Verify gate — a GM or the Owner signs off a submitted audit. They spot-check
// a few of the auditor's recorded verdicts, then confirm. Confirming moves the
// audit to status 'verified' and stamps who/when. An auditor can't verify their
// own work. Verified audits still count everywhere (isFinalized covers both).
// ---------------------------------------------------------------------------

// Badge (verified) / button (eligible) / waiting note (everyone else) for the
// detail modals. `me` defaults to the logged-in user.
function verifyControlsHtml(a, me) {
  me = me || AuthSession.current();
  if (a.status === 'verified') {
    const when = a.verified_at ? new Date(a.verified_at).toLocaleString('en-IN') : '';
    return `<div style="margin-top:8px;padding:10px 12px;border-radius:8px;background:#e7f6ec;border:1px solid #9bd3ad;color:#166534;font-size:13px;line-height:1.5">
      <strong>✓ Verified by ${escapeHtml(a.verifier_name || '—')}</strong>${when ? ` · ${escapeHtml(when)}` : ''}${a.verify_note ? `<div style="margin-top:4px;font-style:italic;color:#15532c">&ldquo;${escapeHtml(a.verify_note)}&rdquo;</div>` : ''}
    </div>`;
  }
  const canVerify = me && (me.role === 'OWNER' || me.role === 'GM') && !(a.auditor_id && a.auditor_id === me.id);
  if (canVerify) {
    return `<button class="btn btn-primary" data-action="audit-verify" data-id="${escapeHtml(a.id)}" style="width:100%;margin-top:8px">✓ Verify this audit</button>`;
  }
  return `<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:#fff8e1;border:1px solid #f4c674;color:#6a4a00;font-size:13px">⏳ Awaiting verification</div>`;
}

// Spot-check modal: shows up to 3 of the auditor's recorded verdicts (FAILs
// preferred — those are the riskiest to fake), a note field, and a confirm.
function verifyAuditModal(auditId) {
  const state = Store.load();
  const a = audit(auditId, state);
  if (!a) { toast('Audit not found'); return; }
  const me = AuthSession.current(state);
  if (!me || (me.role !== 'OWNER' && me.role !== 'GM')) { toast('Only GM or Owner can verify'); return; }
  if (a.auditor_id && a.auditor_id === me.id) { toast("You can't verify your own audit"); return; }
  if (a.status === 'verified') { toast('Already verified'); return; }

  const cpById = {};
  checkpointsFor(a).forEach(cp => { cpById[cp.id] = cp; });
  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));

  // Gather marked verdicts (flatten per-CRO buckets if needed).
  let entries = [];
  if (auditIsPerCro(a)) {
    Object.entries(a.cro_results || {}).forEach(([croId, bucket]) => {
      Object.entries(bucket || {}).forEach(([cpId, r]) => {
        if (r && r.result) entries.push({ cpId, result: r.result, finding: r.finding, croId });
      });
    });
  } else {
    Object.entries(a.results || {}).forEach(([cpId, r]) => {
      if (r && r.result) entries.push({ cpId, result: r.result, finding: r.finding });
    });
  }
  // FAILs first (randomised), then the rest, then take up to 3.
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const fails = shuffle(entries.filter(e => e.result === 'F'));
  const rest = shuffle(entries.filter(e => e.result !== 'F'));
  const sample = fails.concat(rest).slice(0, 3);

  const rowsHtml = sample.length ? sample.map(e => {
    const cp = cpById[e.cpId] || { text: '(checkpoint removed from template)' };
    const cro = e.croId ? croById[e.croId] : null;
    return `
      <div class="result-row">
        <span class="cp-id">${escapeHtml(e.cpId)}</span>
        <div class="cp-body">
          <div>${escapeHtml(cp.text)}</div>
          ${e.finding ? `<div class="cp-finding">${escapeHtml(e.finding)}${cro ? ` · <em>${escapeHtml(cro.name)}</em>` : ''}</div>` : ''}
        </div>
        <span class="verdict-pill ${e.result}">${e.result}</span>
      </div>`;
  }).join('') : '<p class="muted" style="padding:6px">No marked checkpoints to spot-check.</p>';

  const when = frequencyOf(a) === 'weekly' ? `Week ${a.week_number}, ${a.year}` : escapeHtml(fmtDate(a.date));
  openModal(`
    <h3>Verify audit</h3>
    <p class="muted">${when} · by ${escapeHtml(a.auditor_name || '—')}</p>
    <p style="font-size:13px;line-height:1.5;margin:6px 0 10px">Spot-check these recorded verdicts against what you know on the floor. Confirm only if they look honest.</p>
    <div class="detail-sop">${rowsHtml}</div>
    <label class="field" style="margin-top:10px">
      <span>Verification note (optional)</span>
      <textarea id="verifyNote" maxlength="200" placeholder="e.g. spot-checked CP1 &amp; CP12 on floor — matches"></textarea>
    </label>
    <div class="spacer-12"></div>
    <button class="btn btn-primary" data-action="modal-confirm-verify" data-id="${escapeHtml(a.id)}" style="width:100%">✓ Confirm — I verify this audit</button>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="modal-cancel" style="width:100%">Cancel</button>
  `);
}

// ---------------------------------------------------------------------------
// Print / PDF — builds a self-contained printable view, calls window.print()
// ---------------------------------------------------------------------------

// Band → print colour (green / amber / red).
function printBandColor(band) {
  return band === 'excellent' || band === 'good' ? '#166534'
    : band === 'fair' ? '#b45309' : '#b91c1c';
}

// The 7 calendar dates (YYYY-MM-DD) of an ISO week, Monday→Sunday.
function isoWeekDateRange(week, year) {
  // The week that contains Jan 4 is ISO week 1; weeks start Monday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;          // Mon=1 … Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { monday: dates[0], sunday: dates[6], dates };
}

// Submitted daily audits that fall in a given ISO week+year, oldest first.
function dailyAuditsForWeek(week, year, state) {
  return (state.audits || []).filter(a => {
    if (frequencyOf(a) === 'weekly') return false;
    if (!isFinalized(a) || !a.score) return false;
    const d = new Date(a.date);
    return d.getFullYear() === year && isoWeekOf(d) === week;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Build the printable daily compliance report (one A4 page).
function dailyReportHtml(a, state) {
  const croById = Object.fromEntries(state.cros.map(c => [c.id, c]));
  const s = a.score;
  const sopSections = SOPS.slice().sort((x, y) => x.number - y.number).map(sop => {
    const cps = CHECKPOINTS.filter(c => c.sop_id === sop.id);
    const rows = cps.map(cp => {
      const r = a.results[cp.id] || {};
      const cro = r.cro_id ? croById[r.cro_id] : null;
      const photos = r.photos || [];
      return `<tr>
        <td>${escapeHtml(cp.id)}</td>
        <td>${escapeHtml(cp.text)}</td>
        <td><strong>${escapeHtml(r.result || '—')}</strong></td>
        <td>${escapeHtml(r.finding || '')}${cro ? `<br><em>${escapeHtml(cro.name)}</em>` : ''}${
          photos.length ? `<div class="photo-row">${photos.map(p => `<img src="${p}" alt="">`).join('')}</div>` : ''
        }</td>
      </tr>`;
    }).join('');
    return `<h2>${sop.critical ? '★ ' : ''}${escapeHtml(sop.name)}</h2>
      <table><thead><tr><th style="width:50px">CP</th><th>Checkpoint</th><th style="width:36px">Result</th><th>Finding / Evidence</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }).join('');

  const backdatedHtml = a.backdate_reason
    ? `<div class="meta" style="background:#fff8e1;border:1px solid #f4c674;color:#6a4a00;padding:8px 10px;border-radius:6px;margin-top:6px">
         <strong>Backdated audit:</strong> ${escapeHtml(a.backdate_reason)}
       </div>`
    : '';
  const notesHtml = a.notes
    ? `<div class="meta" style="padding:8px 10px;border:1px solid #ddd;border-radius:6px;margin-top:6px;background:#fafafa">
         <strong>Audit notes:</strong> <span style="white-space:pre-wrap">${escapeHtml(a.notes)}</span>
       </div>`
    : '';
  return `
    <div class="print-page">
      <h1>Saagar Audit — Daily Compliance Report</h1>
      <div class="meta">
        ${escapeHtml(fmtDate(a.date))} &middot; Auditor: ${escapeHtml(a.auditor_name || '—')} &middot;
        Submitted ${escapeHtml(new Date(a.submitted_at).toLocaleString('en-IN'))}
      </div>
      ${backdatedHtml}
      ${notesHtml}
      <div class="pscore" style="color:${printBandColor(s.band)}">${s.pct.toFixed(1)}% &middot; ${bandLabel(s.band)}</div>
      <div class="meta">${s.raw} of ${s.max} points &middot; ${s.p} Pass &middot; ${s.f} Fail &middot; ${s.na} N/A</div>
      ${sopSections}
    </div>
  `;
}

// Build the printable WEEKLY report — the 9-section one-pager (header + 7
// content groups + signature). See agent_outputs/weekly_report_spec.md.
function weeklyReportHtml(a, state) {
  const s = a.score || {};
  const week = a.week_number, year = a.year;
  const { sunday, dates } = isoWeekDateRange(week, year);
  const cps = checkpointsFor(a);
  const cpById = {}; cps.forEach(c => { cpById[c.id] = c; });
  const labelOf = sectionLabelMap(a);                 // cpId → component label
  const isStar = cp => /★/.test(labelOf[cp.id] || '') || cp.critical || cp.group === 'cash_weekly' || cp.group === 'inventory_weekly';
  const TARGET = 92;

  // ---- §3 data: the 7 daily audits of this week ----
  const dailies = dailyAuditsForWeek(week, year, state);
  const dailyByDate = {}; dailies.forEach(d => { dailyByDate[d.date] = d; });
  const dailyFailCount = d => Object.values(d.results || {}).filter(r => r.result === 'F').length;

  // ---- §1 Headline ----
  const gap = round1(TARGET - (s.pct || 0));
  const judgment = (s.pct >= TARGET)
    ? `on target (≥ ${TARGET}%)`
    : `below target by ${gap.toFixed(1)}pp`;
  const headline = `Week ${week}: ${(s.pct || 0).toFixed(1)}% ${bandLabel(s.band).toUpperCase()} — ${judgment}`;

  // ---- §2 Trend vs last week ----
  const priorWeeklies = (state.audits || [])
    .filter(x => x.id !== a.id && frequencyOf(x) === 'weekly' && isFinalized(x) && x.score)
    .filter(x => x.year < year || (x.year === year && x.week_number < week))
    .sort((p, q) => (q.year - p.year) || (q.week_number - p.week_number));
  let trendHtml;
  if (priorWeeklies.length === 0) {
    trendHtml = `<p>No prior week on record — this is the first weekly report.</p>`;
  } else {
    const last = priorWeeklies[0].score.pct;
    const delta = round1((s.pct || 0) - last);
    const arrow = delta > 0 ? `▲ +${delta.toFixed(1)}pp` : delta < 0 ? `▼ ${delta.toFixed(1)}pp` : `▬ flat`;
    const window4 = priorWeeklies.slice(0, 4).map(x => x.score.pct);
    const avg4 = round1([(s.pct || 0)].concat(window4).reduce((x, y) => x + y, 0) / (window4.length + 1));
    trendHtml = `<p><strong>${arrow}</strong> vs last week (Week ${priorWeeklies[0].week_number}: ${last.toFixed(1)}%) &middot; ${Math.min(window4.length + 1, 4)}-wk avg ${avg4.toFixed(1)}%</p>`;
  }

  // ---- §3 Daily Audit Health ----
  const presentPcts = dates.map(dt => dailyByDate[dt] ? dailyByDate[dt].score.pct : null).filter(v => v != null);
  const dailyAvg = (s.avgDaily != null) ? s.avgDaily
    : (presentPcts.length ? round1(presentPcts.reduce((x, y) => x + y, 0) / presentPcts.length) : 0);
  const dist = {};
  presentPcts.forEach(p => { const b = bandFor(p); dist[b] = (dist[b] || 0) + 1; });
  const distStr = Object.entries(dist).map(([b, n]) => `${bandLabel(b)} ×${n}`).join(', ') || '—';
  const dayRows = dates.map(dt => {
    const d = dailyByDate[dt];
    const dow = new Date(dt + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
    if (!d) {
      return `<tr style="color:#b91c1c"><td>${dow} ${escapeHtml(dt.slice(8))}</td><td colspan="3"><strong>— / MISSING</strong> (counts as 0%)</td></tr>`;
    }
    return `<tr>
      <td>${dow} ${escapeHtml(dt.slice(8))}</td>
      <td>${d.score.pct.toFixed(1)}%</td>
      <td>${escapeHtml(bandLabel(d.score.band))}</td>
      <td>${dailyFailCount(d)}</td>
    </tr>`;
  }).join('');
  // Honesty flags (auto): suspicious-uniform, zero-fail-week, masked decline.
  const flags = [];
  if (presentPcts.length >= 3 && (Math.max(...presentPcts) - Math.min(...presentPcts)) < 2) {
    flags.push('All daily scores within a 2-point band — unusually uniform; spot-check on the floor.');
  }
  if (presentPcts.length >= 5 && dailies.every(d => dailyFailCount(d) === 0)) {
    flags.push('Zero fails across the week — verify the audits are not being rubber-stamped.');
  }
  if (dailies.length >= 3) {
    let declining = true;
    for (let i = 1; i < dailies.length; i++) { if (dailies[i].score.pct >= dailies[i - 1].score.pct) { declining = false; break; } }
    if (declining && dailyAvg >= 90) flags.push('Scores fall every day but the average still looks healthy — the trend is the warning.');
  }
  if (dates.some(dt => !dailyByDate[dt])) {
    flags.push(`${dates.filter(dt => !dailyByDate[dt]).length} day(s) missing a daily audit.`);
  }
  const flagsHtml = flags.length
    ? `<ul style="margin:4px 0 0 16px;color:#b45309">${flags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
    : `<p style="color:#166534">No honesty flags — the week looks genuine.</p>`;

  // ---- §4 Compliance Breakdown (5 components) ----
  const dailyMax = (s.max != null && s.weeklyMax != null) ? round1(s.max - s.weeklyMax) : dailyTemplateCount();
  const comps = {}; const order = [];
  cps.forEach(cp => {
    const label = labelOf[cp.id] || 'Other';
    if (!comps[label]) { comps[label] = { passed: 0, scored: 0 }; order.push(label); }
    const r = (a.results || {})[cp.id];
    if (r && r.result === 'P') { comps[label].passed++; comps[label].scored++; }
    else if (r && r.result === 'F') { comps[label].scored++; }
  });
  const compRows = order.map(label => {
    const c = comps[label];
    const pct = c.scored > 0 ? round1((c.passed / c.scored) * 100) : 100;
    return `<tr><td>${escapeHtml(label)}</td><td>${c.passed} / ${c.scored}</td><td>${pct.toFixed(1)}%</td></tr>`;
  }).join('');
  const breakdownHtml = `
    <table>
      <thead><tr><th>Component</th><th style="width:90px">Passed / Scored</th><th style="width:60px">%</th></tr></thead>
      <tbody>
        <tr><td>Daily Audit Average</td><td>${(s.dailyContribution != null ? s.dailyContribution : 0)} / ${dailyMax} <em>(contribution)</em></td><td>${dailyAvg.toFixed(1)}%</td></tr>
        ${compRows}
        <tr style="font-weight:700;background:#f0f0f0"><td>TOTAL</td><td>${(s.raw != null ? s.raw : 0)} / ${(s.max != null ? s.max : 0)}</td><td>${(s.pct || 0).toFixed(1)}%</td></tr>
      </tbody>
    </table>`;

  // ---- §5 Critical Findings (≤6, weekly fails; star components first) ----
  const weeklyFails = Object.entries(a.results || {})
    .filter(([, r]) => r.result === 'F')
    .map(([cpId, r]) => ({ cpId, cp: cpById[cpId], finding: r.finding || '', star: cpById[cpId] ? isStar(cpById[cpId]) : false }));
  weeklyFails.sort((x, y) => (y.star ? 1 : 0) - (x.star ? 1 : 0));
  const findingsShown = weeklyFails.slice(0, 6);
  const findingsHtml = findingsShown.length
    ? `<ul style="margin:4px 0 0 16px">${findingsShown.map(f =>
        `<li>${f.star ? '★ ' : ''}<strong>${escapeHtml(f.cpId)}</strong>${f.cp ? ' ' + escapeHtml(f.cp.text) : ''}${f.finding ? ' — ' + escapeHtml(f.finding) : ''}</li>`).join('')}${
        weeklyFails.length > 6 ? `<li><em>+${weeklyFails.length - 6} more in the audit folder</em></li>` : ''}</ul>`
    : `<p style="color:#166534">No weekly-control failures this week.</p>`;

  // ---- §6 Patterns (≤3: same daily checkpoint failing on ≥2 days) ----
  const dayFailMap = {};
  dailies.forEach(d => {
    Object.entries(d.results || {}).forEach(([cpId, r]) => {
      if (r.result !== 'F') return;
      (dayFailMap[cpId] = dayFailMap[cpId] || new Set()).add(d.date);
    });
  });
  const patterns = Object.entries(dayFailMap)
    .filter(([, set]) => set.size >= 2)
    .sort((x, y) => y[1].size - x[1].size)
    .slice(0, 3)
    .map(([cpId, set]) => {
      const cp = CHECKPOINTS.find(c => c.id === cpId);
      return `${cpId}${cp ? ' "' + cp.text + '"' : ''} failed on ${set.size} days.`;
    });
  const patternsHtml = patterns.length
    ? `<ul style="margin:4px 0 0 16px">${patterns.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    : `<p style="color:#166534">No repeating daily failures this week.</p>`;

  // ---- §7 CAP activity ----
  const caps = state.caps || [];
  const inWeek = iso => iso && iso.slice(0, 10) >= dates[0] && iso.slice(0, 10) <= dates[6];
  const userById = Object.fromEntries((state.users || []).map(u => [u.id, u]));
  const capName = c => { const u = userById[c.responsible_user_id]; return u ? u.name : '—'; };
  const opened = caps.filter(c => inWeek(c.created_at) || inWeek(c.audit_date));
  const openNow = caps.filter(c => c.status === 'open' && !opened.includes(c));
  const closed = caps.filter(c => c.status === 'closed' && inWeek(c.closed_at));
  const aged = caps.filter(c => c.status === 'aged');
  const capTable = (title, rows, head) => rows.length
    ? `<p style="margin:8px 0 2px;font-weight:600">${title}</p><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` : '';
  const openedRows = opened.map(c => `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.checkpoint_id || '—')}</td><td>${escapeHtml(capName(c))}</td><td>${escapeHtml(c.deadline || '—')}</td></tr>`).join('');
  const openRows = openNow.map(c => {
    const days = c.created_at ? Math.max(0, Math.round((Date.now() - new Date(c.created_at)) / 86400000)) : '—';
    return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.status)}</td><td>${days}</td><td>${escapeHtml(c.deadline || '—')}</td></tr>`;
  }).join('');
  const closedRows = closed.map(c => `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.checkpoint_id || '—')}</td><td>${escapeHtml((c.closed_at || '').slice(0, 10))}</td></tr>`).join('');
  const agedRows = aged.map(c => `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.checkpoint_id || '—')}</td><td>${escapeHtml(c.deadline || '—')}</td></tr>`).join('');
  const capHtml = (openedRows || openRows || closedRows || agedRows) ? (
    capTable('Opened this week', openedRows, '<th>CAP</th><th>Origin</th><th>Owner</th><th>Deadline</th>')
    + capTable('Open from prior weeks', openRows, '<th>CAP</th><th>Status</th><th>Days open</th><th>Anticipated close</th>')
    + capTable('Closed this week', closedRows, '<th>CAP</th><th>Origin</th><th>Closed on</th>')
    + capTable('Aged (auto-escalated)', agedRows, '<th>CAP</th><th>Origin</th><th>Deadline missed</th>')
  ) : `<p style="color:#166534">No CAP activity this week.</p>`;

  // ---- §8 Escalations + Recommendation ----
  const escs = (state.escalations || []).filter(e => e.audit_id === a.id).slice(0, 3);
  const escHtml = escs.length
    ? `<ul style="margin:4px 0 0 16px">${escs.map(e =>
        `<li><strong>Trigger ${e.trigger_number} — ${escapeHtml(e.trigger_label || '')}</strong><br><span style="white-space:pre-wrap;font-size:11px">${escapeHtml(e.message || '')}</span></li>`).join('')}</ul>`
    : `<p>No escalations raised by this report.</p>`;
  const recommendation = (s.pct >= TARGET)
    ? 'Daily and weekly controls are on target — no Owner action needed this week.'
    : `Below the ${TARGET}% target by ${gap.toFixed(1)}pp. Owner: review the escalations and confirm each new CAP has an owner and a deadline.`;

  return `
    <div class="print-page">
      <h1>Saagar Audit — Weekly Report</h1>
      <div class="meta">
        Week ${week} &middot; ${year} &middot; ending ${escapeHtml(fmtDate(sunday))}<br>
        Saagar Traders — Titan World + Helios, Latur &middot; GM: ${escapeHtml(a.auditor_name || '—')} &middot; Target ≥ ${TARGET}%
      </div>

      <h2>1 · Headline</h2>
      <div class="pscore" style="color:${printBandColor(s.band)}">${(s.pct || 0).toFixed(1)}% &middot; ${bandLabel(s.band)}</div>
      <div class="meta">${escapeHtml(headline)}</div>

      <h2>2 · Trend vs Last Week</h2>
      ${trendHtml}

      <h2>3 · Daily Audit Health (7-day review)</h2>
      <div class="meta">Daily average ${dailyAvg.toFixed(1)}% &middot; ${escapeHtml(distStr)}</div>
      <table><thead><tr><th>Day</th><th>Score</th><th>Band</th><th>Fails</th></tr></thead><tbody>${dayRows}</tbody></table>
      <p style="margin:6px 0 0;font-weight:600">Honesty check:</p>${flagsHtml}

      <h2>4 · Compliance Breakdown</h2>
      ${breakdownHtml}

      <h2>5 · Critical Findings</h2>
      ${findingsHtml}

      <h2>6 · Patterns</h2>
      ${patternsHtml}

      <h2>7 · Corrective Action Plans (CAPs)</h2>
      ${capHtml}

      <h2>8 · Escalations &amp; Recommendation</h2>
      ${escHtml}
      <p style="margin-top:6px"><strong>Recommendation:</strong> ${escapeHtml(recommendation)}</p>

      <h2>9 · Sign-off</h2>
      <div class="meta">
        Prepared by: ${escapeHtml(a.auditor_name || '—')} (GM) &middot;
        Submitted: ${escapeHtml(a.submitted_at ? new Date(a.submitted_at).toLocaleString('en-IN') : '—')} &middot;
        Owner read: Not yet read
      </div>
      <div style="margin-top:24px;display:flex;gap:40px">
        <div style="border-top:1px solid #333;padding-top:4px;flex:1">GM signature</div>
        <div style="border-top:1px solid #333;padding-top:4px;flex:1">Owner signature</div>
      </div>
    </div>
  `;
}

function printAudit(auditId) {
  const state = Store.load();
  const a = audit(auditId, state);
  if (!a) return;
  const pageHtml = frequencyOf(a) === 'weekly'
    ? weeklyReportHtml(a, state)
    : dailyReportHtml(a, state);
  document.getElementById('print-root').innerHTML = pageHtml;
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    document.getElementById('print-root').innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 100);
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

// Backup / restore — implementation lives in shell.js. The shell wraps the
// localStorage state into a JSON file and uses the Android share sheet so
// the user can hand it off to Drive / OneDrive / WhatsApp.
async function backupToDrive() {
  if (!window.SaagarShell) { toast('Shell not loaded'); return; }
  try {
    const res = await window.SaagarShell.backup();
    if (res && res.cancelled) return;
    if (res && res.ok) {
      toast(res.via === 'share' ? 'Backup shared' : 'Backup downloaded');
    }
  } catch (e) {
    console.error(e);
    toast('Backup failed');
  }
}

function restoreFromBackup() {
  if (!window.SaagarShell) { toast('Shell not loaded'); return; }
  window.SaagarShell.restore((res) => {
    if (!res.ok) {
      toast(res.error && res.error.length < 80 ? res.error : 'Could not read backup file');
      return;
    }
    // Security: the restored backup may reference a different set of users.
    // Clear the active session so the user re-authenticates with a PIN that
    // matches the restored user table.
    AuthSession.logout();
    PinBuf.reset();

    const c = res.counts;
    const parts = [
      `${c.audits} audit(s)`,
      `${c.cros} CRO(s)`,
      c.users ? `${c.users} user(s)` : null,
      c.caps ? `${c.caps} CAP(s)` : null,
    ].filter(Boolean);
    const confirmMsg = `Restored ${parts.join(', ')}. Sign in again with a restored user's PIN.`;
    render();
    toast(confirmMsg);
  });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCsv() {
  const state = Store.load();
  const submitted = state.audits.filter(a => isFinalized(a));
  if (submitted.length === 0) { toast('No submitted audits yet'); return; }
  const rows = [['date', 'auditor', 'compliance_pct', 'band', 'raw', 'max', 'pass', 'fail', 'na', 'checkpoint_id', 'result', 'finding', 'cro_id', 'backdate_reason', 'audit_notes']];
  submitted.forEach(a => {
    Object.entries(a.results).forEach(([cpId, r]) => {
      rows.push([
        a.date,
        a.auditor_name || '',
        a.score.pct.toFixed(1),
        a.score.band,
        a.score.raw,
        a.score.max,
        a.score.p,
        a.score.f,
        a.score.na,
        cpId,
        r.result,
        r.finding || '',
        r.cro_id || '',
        a.backdate_reason || '',
        a.notes || '',
      ]);
    });
  });
  const csv = rows.map(r => r.map(v => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saagar_audit_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  // Auth pin pad — buttons with data-key, only when locked
  const key = e.target.closest('[data-key]');
  if (key && document.body.classList.contains('locked')) {
    await handlePinKey(key.dataset.key);
    return;
  }

  const t = e.target.closest('[data-tab]');
  if (t) { switchTab(t.dataset.tab); return; }

  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;

  // Auth actions
  if (action === 'logout') {
    if (!confirm('Sign out?')) return;
    AuthSession.logout();
    PinBuf.reset();
    window._loginUserId = null;
    render();
    return;
  }
  if (action === 'setup-name-next') {
    const name = document.getElementById('ownerName').value.trim();
    const err = document.getElementById('setupErr');
    if (name.length < 2) {
      err.textContent = 'Please enter your name (2+ characters).';
      err.hidden = false;
      return;
    }
    window._setupOwnerName = name;
    window._setupStage = 'pin';
    PinBuf.reset();
    render();
    return;
  }

  if (action === 'modal-cancel' || action === 'modal-backdrop') { closeModal(); return; }
  if (e.target.matches('[data-modal-backdrop]')) { closeModal(); return; }

  // ----- User management (Owner-only mostly) -----
  if (action === 'change-my-pin') { changePinModal(); return; }
  if (action === 'modal-save-my-pin') {
    const cur = document.getElementById('pinCurrent').value;
    const np  = document.getElementById('pinNew').value;
    const npc = document.getElementById('pinNewConfirm').value;
    if (!/^\d{4}$/.test(cur)) { toast('Enter your current 4-digit PIN'); return; }
    if (!/^\d{4}$/.test(np))  { toast('New PIN must be 4 digits'); return; }
    if (np !== npc)           { toast('New PIN and confirmation do not match'); return; }
    const me = AuthSession.current();
    const ok = await verifyPin(cur, me.pin_salt, me.pin_hash);
    if (!ok) { toast('Current PIN is wrong'); return; }
    await Users.changePin(me.id, np);
    closeModal();
    toast('PIN updated');
    render();
    return;
  }

  if (action === 'add-user') { addUserModal(); return; }
  if (action === 'modal-save-user') {
    const name = document.getElementById('newUserName').value.trim();
    const role = document.getElementById('newUserRole').value;
    const phone = document.getElementById('newUserPhone').value.trim();
    const pin  = document.getElementById('newUserPin').value;
    const pinc = document.getElementById('newUserPinConfirm').value;
    if (name.length < 2)        { toast('Enter a name (2+ characters)'); return; }
    if (!/^\d{4}$/.test(pin))   { toast('PIN must be 4 digits'); return; }
    if (pin !== pinc)           { toast('PIN and confirmation do not match'); return; }
    await Users.create({ name, role, pin, phone });
    closeModal();
    toast(`${name} added as ${roleLabel(role)}`);
    render();
    return;
  }

  if (action === 'ref-sub') {
    RefState.sub = a.dataset.id;
    document.getElementById('tab-reference').innerHTML = renderReferenceTab();
    return;
  }

  if (action === 'set-locale') {
    I18n.set(a.dataset.locale);
    toast(a.dataset.locale === 'mr' ? 'भाषा बदलली' : 'Language changed');
    return;
  }

  // ----- Template Builder -----
  if (action === 'builder-open')  { Builder.open(a.dataset.id); return; }
  if (action === 'builder-close') { Builder.close(); return; }
  if (action === 'builder-new')   { builderNewModal(); return; }
  if (action === 'modal-create-tpl') {
    const name = document.getElementById('newTplName').value.trim();
    const frequency = document.getElementById('newTplFreq').value;
    if (name.length < 2) { toast('Give it a name'); return; }
    const tpl = Templates.create({ name, frequency });
    closeModal();
    Builder.open(tpl.id);
    return;
  }
  if (action === 'builder-add-section') {
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    tpl.sections = tpl.sections || [];
    tpl.sections.push({ id: 's_' + uuid(), name: 'New section', name_mr: '', critical: false });
    Templates.save(tpl);
    render();
    return;
  }
  if (action === 'builder-del-section') {
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    const inSection = tpl.checkpoints.filter(c => c.section_id === a.dataset.section).length;
    if (!confirm(`Delete this section${inSection ? ` and its ${inSection} point(s)` : ''}?`)) return;
    tpl.sections = tpl.sections.filter(s => s.id !== a.dataset.section);
    tpl.checkpoints = tpl.checkpoints.filter(c => c.section_id !== a.dataset.section);
    Templates.save(tpl);
    render();
    return;
  }
  if (action === 'builder-add-cp')  { builderCpModal(a.dataset.tpl, a.dataset.section, null); return; }
  if (action === 'builder-edit-cp') { builderCpModal(a.dataset.tpl, null, a.dataset.cp); return; }
  if (action === 'modal-save-cp') {
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    const text = document.getElementById('cpText').value.trim();
    if (text.length < 3) { toast('Checkpoint text too short'); return; }
    const sectionId = document.getElementById('cpSection').value;
    const allowsNa = document.getElementById('cpNa').checked;
    const photoReq = document.getElementById('cpPhoto').checked;
    const cpId = a.dataset.cp;
    if (cpId) {
      const cp = tpl.checkpoints.find(c => c.id === cpId);
      if (cp) { cp.text = text; cp.section_id = sectionId; cp.allows_na = allowsNa; cp.photo_required_on_fail = photoReq; }
    } else {
      const maxOrder = tpl.checkpoints.reduce((m, c) => Math.max(m, c.order || 0), 0);
      tpl.checkpoints.push({
        id: 'c_' + uuid(), section_id: sectionId, text, text_mr: '', evidence: '',
        weight: 1, critical: false, allows_na: allowsNa, photo_required_on_fail: photoReq,
        order: maxOrder + 1,
      });
    }
    Templates.save(tpl);
    closeModal();
    render();
    return;
  }
  if (action === 'builder-del-cp') {
    if (!confirm('Delete this point?')) return;
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    tpl.checkpoints = tpl.checkpoints.filter(c => c.id !== a.dataset.cp);
    Templates.save(tpl);
    render();
    return;
  }
  if (action === 'builder-move-cp') {
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    const cp = tpl.checkpoints.find(c => c.id === a.dataset.cp);
    if (!cp) return;
    const sibs = tpl.checkpoints.filter(c => c.section_id === cp.section_id)
      .sort((x, y) => (x.order || 0) - (y.order || 0));
    const i = sibs.indexOf(cp);
    const j = a.dataset.dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    const o1 = sibs[i].order || 0, o2 = sibs[j].order || 0;
    sibs[i].order = o2; sibs[j].order = o1;
    Templates.save(tpl);
    render();
    return;
  }
  if (action === 'builder-reset') {
    if (!confirm('Reset this built-in checklist to its original points? Your edits to it will be lost (past audits keep their frozen copies).')) return;
    Templates.resetToDefault(a.dataset.tpl);
    render();
    toast('Reset to original');
    return;
  }
  if (action === 'builder-delete') {
    if (!confirm('Delete this template? Past audits that used it keep their frozen copies.')) return;
    Templates.remove(a.dataset.tpl);
    Builder.close();
    toast('Template deleted');
    return;
  }
  if (action === 'builder-toggle-active') {
    const tpl = Templates.byId(null, a.dataset.tpl);
    if (!tpl) return;
    tpl.active = !tpl.active;
    Templates.save(tpl);
    render();
    return;
  }

  if (action === 'set-my-phone')   { setPhoneModal(null); return; }
  if (action === 'user-set-phone') { setPhoneModal(a.dataset.id); return; }
  if (action === 'modal-save-phone') {
    const newPhone = document.getElementById('phoneInput').value.trim();
    Users.setPhone(a.dataset.id, newPhone);
    closeModal();
    toast('Phone updated');
    render();
    return;
  }

  if (action === 'user-menu')      { userMenuModal(a.dataset.id); return; }
  if (action === 'user-reset-pin') { resetPinModal(a.dataset.id); return; }
  if (action === 'modal-save-reset-pin') {
    const np  = document.getElementById('resetPinNew').value;
    const npc = document.getElementById('resetPinConfirm').value;
    if (!/^\d{4}$/.test(np)) { toast('PIN must be 4 digits'); return; }
    if (np !== npc)          { toast('PINs do not match'); return; }
    await Users.changePin(a.dataset.id, np);
    closeModal();
    toast('PIN reset');
    render();
    return;
  }
  if (action === 'user-deactivate') {
    const me = AuthSession.current();
    if (a.dataset.id === me.id) { toast("Can't deactivate yourself"); return; }
    if (!confirm('Deactivate this user? They won\'t be able to sign in.')) return;
    Users.setActive(a.dataset.id, false);
    closeModal();
    render();
    return;
  }
  if (action === 'user-reactivate') {
    Users.setActive(a.dataset.id, true);
    closeModal();
    render();
    return;
  }

  if (action === 'add-cro')     { addCroModal(); return; }
  if (action === 'modal-save-cro') {
    const name = document.getElementById('croName').value.trim();
    const counter = document.getElementById('croCounter').value;
    if (name.length < 2) { toast('Name too short'); return; }
    const state = Store.load();
    state.cros.push({ id: uuid(), name, counter });
    Store.save(state);
    closeModal();
    render();
    return;
  }
  if (action === 'remove-cro') {
    if (!confirm('Remove this CRO?')) return;
    const id = a.dataset.id;
    const state = Store.load();
    state.cros = state.cros.filter(c => c.id !== id);
    Store.save(state);
    render();
    return;
  }

  if (action === 'start-audit') {
    const me = AuthSession.current();
    if (!me) { toast('Sign in first'); return; }
    const date = document.getElementById('auditDate').value;
    const croIds = Array.from(document.querySelectorAll('.cro-check:checked')).map(el => el.value);
    const err = document.getElementById('startError');
    err.hidden = true;
    if (!date)               { err.textContent = 'Pick a date.'; err.hidden = false; return; }
    if (croIds.length === 0) { err.textContent = 'Select at least one CRO on duty.'; err.hidden = false; return; }
    // Date guard: if the user is auditing a past date, require a written reason.
    let backdateReason = '';
    if (date !== today()) {
      const ta = document.getElementById('backdateReason');
      backdateReason = (ta && ta.value || '').trim();
      if (backdateReason.length < 5) {
        err.textContent = 'Backdated audit — please record a reason (5+ characters).';
        err.hidden = false;
        if (ta) ta.focus();
        return;
      }
    }
    startNewAudit({ date, auditorName: me.name, auditorId: me.id, croIds, backdateReason, templateId: a.dataset.tpl || StartState.templateId });
    render();
    return;
  }

  if (action === 'pick-template') {
    StartState.templateId = a.dataset.id;
    render();
    return;
  }

  if (action === 'start-weekly-audit') {
    const me = AuthSession.current();
    if (!me) { toast('Sign in first'); return; }
    if (me.role !== 'GM' && me.role !== 'OWNER') {
      toast('Weekly audits are run by the GM or Owner.');
      return;
    }
    const week = parseInt(a.dataset.week, 10);
    const year = parseInt(a.dataset.year, 10);
    const dailyPcts = dailyPctsForWeek(week, year, Store.load());
    if (dailyPcts.length < 7) {
      if (!confirm(`Only ${dailyPcts.length} of 7 daily audits are in for week ${week}. Missing days count as 0% in the weekly score. Continue?`)) {
        return;
      }
    }
    startWeeklyAudit({ weekNumber: week, year, gmId: me.id, gmName: me.name, templateId: a.dataset.tpl || 'tpl_weekly' });
    render();
    return;
  }

  if (action === 'mark') {
    const verdict = a.dataset.verdict;
    const state = Store.load();
    const audit = currentAudit(state);
    if (!audit) return;
    const idx = nextUnmarkedIndex(audit);
    const cp = checkpointsFor(audit)[idx];
    if (!cp) return;

    if (verdict === 'P')  { markCheckpoint(cp.id, 'P'); render(); return; }
    if (verdict === 'F')  { failModal(cp, state.cros.filter(c => audit.cros.includes(c.id))); return; }
    if (verdict === 'NA') { naModal(cp); return; }
    if (verdict === 'SKIP') {
      // SKIP records a result row so nextUnmarkedIndex walks past it on the
      // first pass and routes back to it after all other CPs are decided.
      // Photos / findings on the row are preserved.
      markCheckpoint(cp.id, 'SKIP');
      toast('Skipped — we’ll come back to this checkpoint at the end.');
      render();
      return;
    }
  }

  if (action === 'add-fail-photo') {
    try {
      // The current checkpoint we're FAILing — its CP id goes on the stamp.
      const state = Store.load();
      const audit = currentAudit(state);
      const idx = audit ? nextUnmarkedIndex(audit) : 0;
      const cp = audit ? checkpointsFor(audit)[idx] : null;
      const dataUrl = await capturePhotoWithStamp({ cpId: cp ? cp.id : '' });
      if (!dataUrl) return;
      FailDraft.add(dataUrl);
      renderFailPhotoGrid();
      toast(`Photo stamped & added (${dataUrlSizeKb(dataUrl)} KB)`);
    } catch (err) {
      console.error(err);
      toast('Could not capture photo');
    }
    return;
  }
  if (action === 'remove-fail-photo') {
    const i = parseInt(a.dataset.index, 10);
    FailDraft.removeAt(i);
    renderFailPhotoGrid();
    return;
  }

  // ----- Per-checkpoint photo button (on the audit checkpoint screen) -----
  if (action === 'add-cp-photo') {
    try {
      const dataUrl = await capturePhotoWithStamp({ cpId: a.dataset.cp });
      if (!dataUrl) return;
      addPhotoToCheckpoint(a.dataset.cp, dataUrl);
      toast(`Photo stamped & added (${dataUrlSizeKb(dataUrl)} KB)`);
      render();
    } catch (err) {
      console.error(err);
      toast('Could not capture photo');
    }
    return;
  }
  if (action === 'remove-cp-photo') {
    if (!confirm('Remove this photo?')) return;
    removePhotoFromCheckpoint(a.dataset.cp, parseInt(a.dataset.i, 10));
    render();
    return;
  }

  if (action === 'modal-save-fail') {
    const finding = document.getElementById('failFinding').value.trim();
    if (finding.length < 5) { toast('Describe what you found (5+ characters)'); return; }
    const croId = document.getElementById('failCro').value || null;
    const state = Store.load();
    const audit = currentAudit(state);
    const idx = nextUnmarkedIndex(audit);
    const cp = checkpointsFor(audit)[idx];
    if (cp.photo_required_on_fail && FailDraft.photos.length === 0) {
      toast('Photo evidence is required for Cash & Inventory fails.');
      return;
    }
    markCheckpoint(cp.id, 'F', { finding, croId, photos: FailDraft.photos.slice() });
    FailDraft.reset();
    closeModal();
    render();
    return;
  }
  if (action === 'modal-save-na') {
    const reason = document.getElementById('naReason').value.trim();
    if (reason.length < 3) { toast('Add a short reason'); return; }
    const state = Store.load();
    const audit = currentAudit(state);
    const idx = nextUnmarkedIndex(audit);
    const cp = checkpointsFor(audit)[idx];
    markCheckpoint(cp.id, 'NA', { finding: reason });
    closeModal();
    render();
    return;
  }

  if (action === 'submit-audit') {
    const submitted = submitAudit();
    if (submitted && submitted.audit) {
      const sc = submitted.audit.score;
      const parts = [`${sc.pct.toFixed(1)}% ${bandLabel(sc.band)}`];
      if (submitted.capsCreated) parts.push(`${submitted.capsCreated} CAP${submitted.capsCreated > 1 ? 's' : ''}`);
      if (submitted.escalationsRaised) parts.push(`${submitted.escalationsRaised} alert${submitted.escalationsRaised > 1 ? 's' : ''}`);
      toast(`Audit submitted · ${parts.join(' · ')}`);
    }
    render();
    return;
  }
  if (action === 'cancel-audit') {
    if (!confirm('Discard this draft? Your marks will be lost.')) return;
    const state = Store.load();
    state.audits = state.audits.filter(x => x.id !== state.current_audit_id);
    state.current_audit_id = null;
    Store.save(state);
    render();
    return;
  }
  if (action === 'next-cro') {
    const state = Store.load();
    const aud = currentAudit(state);
    if (!aud) return;
    aud.current_cro_index = (aud.current_cro_index || 0) + 1;
    Store.save(state);
    render();
    return;
  }

  if (action === 'history-view') {
    HistoryView.mode = a.dataset.mode === 'trends' ? 'trends' : 'list';
    document.getElementById('tab-history').innerHTML = renderHistoryTab(Store.load(), AuthSession.current());
    return;
  }
  if (action === 'open-history') {
    const state = Store.load();
    const found = audit(a.dataset.id, state);
    if (found) historyDetailModal(found);
    return;
  }

  // ----- Escalations -----
  if (action === 'esc-send') {
    const state = Store.load();
    const e = Escalations.byId(state, a.dataset.id);
    if (!e) return;
    const recipient = findRecipient(state, e.recipient_role);
    if (!recipient || !recipient.phone) {
      toast('Recipient has no phone. Add one in Users.');
      return;
    }
    const link = whatsappLink(recipient.phone, e.message);
    if (!link) { toast('Cannot build WhatsApp link'); return; }
    const me = AuthSession.current(state);
    Escalations.markSent(a.dataset.id, me ? me.id : null, 'whatsapp');
    // Open WhatsApp via system intent. _blank works in both browser preview
    // and Capacitor WebView.
    window.open(link, '_blank', 'noopener');
    render();
    return;
  }
  if (action === 'esc-dismiss') {
    if (!confirm('Dismiss this alert? It will move to history.')) return;
    const me = AuthSession.current();
    Escalations.dismiss(a.dataset.id, me ? me.id : null);
    render();
    return;
  }
  if (action === 'esc-preview') {
    escalationPreviewModal(a.dataset.id);
    return;
  }
  if (action === 'esc-copy') {
    const state = Store.load();
    const e = Escalations.byId(state, a.dataset.id);
    if (!e) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(e.message).then(
        () => toast('Message copied'),
        () => toast('Copy failed — long-press the message to select')
      );
    } else {
      toast('Long-press the message to select');
    }
    return;
  }

  // ----- CAPs -----
  if (action === 'cap-filter') {
    window._capsFilter = a.dataset.filter;
    render();
    return;
  }
  if (action === 'open-cap') {
    capDetailModal(a.dataset.id);
    return;
  }
  if (action === 'add-step') {
    const inp = document.getElementById('capNewStep');
    const text = (inp && inp.value || '').trim();
    if (text.length < 3) { toast('Action step text too short'); return; }
    const state = Store.load();
    const c = Caps.byId(state, a.dataset.cap);
    if (!c) return;
    c.action_steps.push({ text, done: false, done_at: null });
    Caps.save(c);
    capDetailModal(c.id); // re-render modal
    return;
  }
  if (action === 'toggle-step') {
    const state = Store.load();
    const c = Caps.byId(state, a.dataset.cap);
    if (!c) return;
    const i = parseInt(a.dataset.i, 10);
    const step = c.action_steps[i];
    if (!step) return;
    step.done = !step.done;
    step.done_at = step.done ? new Date().toISOString() : null;
    Caps.save(c);
    capDetailModal(c.id);
    return;
  }
  if (action === 'remove-step') {
    const state = Store.load();
    const c = Caps.byId(state, a.dataset.cap);
    if (!c) return;
    const i = parseInt(a.dataset.i, 10);
    c.action_steps.splice(i, 1);
    Caps.save(c);
    capDetailModal(c.id);
    return;
  }
  if (action === 'cap-save-edits') {
    const state = Store.load();
    const c = Caps.byId(state, a.dataset.id);
    if (!c) return;
    document.querySelectorAll('.cap-why').forEach(el => {
      c['why' + el.dataset.n] = el.value.trim();
    });
    const rc = document.querySelector('.cap-rootcause');
    if (rc) c.root_cause = rc.value.trim();
    const resp = document.querySelector('.cap-responsible');
    if (resp) c.responsible_user_id = resp.value || null;
    const dl = document.querySelector('.cap-deadline-input');
    if (dl) c.deadline = dl.value || null;
    Caps.save(c);
    closeModal();
    toast('CAP updated');
    render();
    return;
  }
  if (action === 'cap-mark-done') {
    const state = Store.load();
    const c = Caps.byId(state, a.dataset.id);
    if (!c) return;
    if (c.action_steps.length === 0 || !c.action_steps.every(s => s.done)) {
      toast('Tick all action steps before marking done.');
      return;
    }
    Caps.markDone(a.dataset.id);
    closeModal();
    toast('CAP marked done — waiting for verification');
    render();
    return;
  }
  if (action === 'cap-verify') {
    const me = AuthSession.current();
    if (!me || (me.role !== 'OWNER' && me.role !== 'GM')) {
      toast('Only GM or Owner can verify'); return;
    }
    const notes = (prompt('Verification notes (optional):') || '').trim();
    Caps.verify(a.dataset.id, me.id, notes);
    closeModal();
    toast('CAP verified');
    render();
    return;
  }
  if (action === 'cap-reject') {
    const me = AuthSession.current();
    if (!me || (me.role !== 'OWNER' && me.role !== 'GM')) {
      toast('Only GM or Owner can reject'); return;
    }
    const notes = (prompt('Reason for rejection (required):') || '').trim();
    if (notes.length < 3) { toast('Rejection needs a reason'); return; }
    Caps.reject(a.dataset.id, me.id, notes);
    closeModal();
    toast('CAP rejected — back to open');
    render();
    return;
  }
  if (action === 'cap-close') {
    const me = AuthSession.current();
    if (!me || (me.role !== 'OWNER' && me.role !== 'GM')) {
      toast('Only GM or Owner can close'); return;
    }
    Caps.close(a.dataset.id, me.id);
    closeModal();
    toast('CAP closed');
    render();
    return;
  }
  if (action === 'print-audit') {
    printAudit(a.dataset.id);
    return;
  }
  if (action === 'audit-verify') {
    verifyAuditModal(a.dataset.id);
    return;
  }
  if (action === 'modal-confirm-verify') {
    const state = Store.load();
    const au = audit(a.dataset.id, state);
    if (!au) { toast('Audit not found'); return; }
    const me = AuthSession.current(state);
    if (!me || (me.role !== 'OWNER' && me.role !== 'GM')) { toast('Only GM or Owner can verify'); return; }
    if (au.auditor_id && au.auditor_id === me.id) { toast("You can't verify your own audit"); return; }
    if (au.status === 'verified') { toast('Already verified'); closeModal(); render(); return; }
    const noteEl = document.getElementById('verifyNote');
    au.status = 'verified';
    au.verifier_id = me.id;
    au.verifier_name = me.name;
    au.verified_at = new Date().toISOString();
    au.verify_note = (noteEl ? noteEl.value : '').trim();
    Store.save(state);
    closeModal();
    toast('Audit verified ✓');
    render();
    return;
  }
  if (action === 'share-audit-wa') {
    shareAuditToWhatsApp(a.dataset.id);
    return;
  }
  if (action === 'export-csv')     { exportCsv(); return; }
  if (action === 'backup-drive')   { backupToDrive(); return; }
  if (action === 'restore-backup') { restoreFromBackup(); return; }
  if (action === 'clear-data') {
    if (!confirm('Erase ALL data on this device — audits, CROs, users and CAPs? This cannot be undone.')) return;
    localStorage.removeItem(STORE_KEY);
    render();
    switchTab('audit');
    toast('All data erased');
    return;
  }
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
}

// PIN pad keypress dispatch — runs only while body.locked.
async function handlePinKey(k) {
  if (k === 'forgot') {
    alert(
      'Forgot PIN?\n\n' +
      'Ask the Owner to reset it in Settings → Users.\n\n' +
      'If you ARE the Owner, you\'ll need to erase all data in your phone\'s Settings → Apps → Saagar Audit → Storage → Clear data. ' +
      'Restoring a Drive backup afterwards will bring your audits back.'
    );
    return;
  }
  if (LoginGuard.isLocked() && !document.querySelector('#ownerName')) {
    // Locked from login attempts — ignore numeric input.
    return;
  }
  if (k === 'back') {
    if (PinBuf.value.length > 0) PinBuf.value = PinBuf.value.slice(0, -1);
    render();
    return;
  }
  if (!/^[0-9]$/.test(k)) return;
  if (PinBuf.value.length >= 4) return;
  PinBuf.value += k;
  // Re-render dots only — avoid full render mid-input to keep dropdown selection.
  const dotsEl = document.querySelector('.pin-dots');
  if (dotsEl) {
    [...dotsEl.querySelectorAll('.dot')].forEach((d, i) => {
      d.classList.toggle('filled', PinBuf.value.length > i);
    });
  }
  if (PinBuf.value.length === 4) {
    setTimeout(() => onPinComplete(), 80);
  }
}

async function onPinComplete() {
  const stage = window._setupStage;
  const pin = PinBuf.value;
  // First-time setup flow
  if (document.querySelector('#auth-screen .auth-brand .sub')?.textContent === 'FIRST-TIME SETUP') {
    if (stage === 'pin') {
      window._setupPin = pin;
      window._setupStage = 'confirm';
      PinBuf.reset();
      render();
      return;
    }
    if (stage === 'confirm') {
      if (pin !== window._setupPin) {
        PinBuf.value = ''; PinBuf.shake = true;
        const err = document.getElementById('setupErr');
        if (err) { err.textContent = 'PINs do not match. Try again.'; err.hidden = false; }
        render();
        setTimeout(() => { PinBuf.shake = false; window._setupStage = 'pin'; PinBuf.reset(); render(); }, 400);
        return;
      }
      const u = await Users.create({ name: window._setupOwnerName, role: 'OWNER', pin });
      AuthSession.login(u.id);
      window._setupOwnerName = null;
      window._setupPin = null;
      window._setupStage = null;
      PinBuf.reset();
      toast('Welcome, ' + u.name);
      render();
      return;
    }
  }
  // Login flow
  const select = document.getElementById('loginUser');
  const userId = select ? select.value : window._loginUserId;
  if (!userId) return;
  const state = Store.load();
  const u = Users.byId(state, userId);
  if (!u) return;
  const ok = await verifyPin(pin, u.pin_salt, u.pin_hash);
  LoginGuard.register(ok);
  if (ok) {
    AuthSession.login(u.id);
    PinBuf.reset();
    render();
  } else {
    PinBuf.value = ''; PinBuf.shake = true;
    const err = document.getElementById('loginErr');
    if (err) {
      if (LoginGuard.isLocked()) {
        err.textContent = `Locked for ${LoginGuard.secondsLeft()}s.`;
      } else {
        err.textContent = 'Wrong PIN. Try again.';
      }
      err.hidden = false;
    }
    render();
    setTimeout(() => { PinBuf.shake = false; render(); }, 400);
  }
}

// Keep PIN buffer in sync when user changes login dropdown
document.addEventListener('change', (e) => {
  if (e.target.id === 'loginUser') {
    window._loginUserId = e.target.value;
    PinBuf.reset();
    render();
    return;
  }
  // Builder: persist template name / frequency / cro_mode on change.
  if (e.target.id === 'builderName' || e.target.id === 'builderFreq' || e.target.id === 'builderCroMode') {
    const tpl = Templates.byId(null, e.target.dataset.tpl);
    if (!tpl) return;
    if (e.target.id === 'builderName') tpl.name = e.target.value.trim() || tpl.name;
    if (e.target.id === 'builderFreq') tpl.frequency = e.target.value;
    if (e.target.id === 'builderCroMode') tpl.cro_mode = e.target.value;
    Templates.save(tpl);
    return;
  }
  // Builder: persist a section name on change.
  if (e.target.classList && e.target.classList.contains('builder-section-name')) {
    const tpl = Templates.byId(null, Builder.editingId);
    if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === e.target.dataset.section);
    if (sec) { sec.name = e.target.value.trim() || sec.name; Templates.save(tpl); }
    return;
  }
});

// Live filter for the glossary search box.
document.addEventListener('input', (e) => {
  if (e.target.id === 'glossarySearch') {
    RefState.glossaryFilter = e.target.value;
    const refRoot = document.getElementById('tab-reference');
    if (refRoot) {
      refRoot.innerHTML = renderReferenceTab();
      // Restore focus + caret to the search box after re-render.
      const input = document.getElementById('glossarySearch');
      if (input) {
        input.focus();
        const v = input.value;
        input.setSelectionRange(v.length, v.length);
      }
    }
  }
});

// Hardware/keyboard support: numbers + backspace work in PIN entry.
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('locked')) return;
  if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key >= '0' && e.key <= '9') { handlePinKey(e.key); e.preventDefault(); return; }
  if (e.key === 'Backspace') { handlePinKey('back'); e.preventDefault(); return; }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Deep-link tab via hash, e.g. index.html#history.
function applyHashTab() {
  const h = (location.hash || '').replace('#', '');
  if (h && ['audit', 'history', 'caps', 'reference', 'settings'].includes(h)) {
    switchTab(h);
  }
}
window.addEventListener('hashchange', applyHashTab);

I18n.init();
Templates.ensureSeeded();
_selfTestWeeklyScore();
render();
renderTabBar();
applyHashTab();

// Capacitor boot — status bar, splash, keyboard, hardware back button.
if (window.SaagarShell) {
  window.SaagarShell.boot({
    closeModal: closeModal,
    onBack: () => {
      // If audit is in progress on the Audit tab, confirm before exit-on-back.
      const onAudit = document.querySelector('#tab-audit.active') !== null;
      const state = Store.load();
      if (onAudit && currentAudit(state)) {
        if (!confirm('Audit in progress. Exit without submitting?')) return true;
      }
      return false; // let default handler run (history.back / exit)
    },
  });
}