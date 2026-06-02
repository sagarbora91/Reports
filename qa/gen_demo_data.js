// ---------------------------------------------------------------------------
// 6-month demo data generator. Runs in the harness context (shim + the real
// app bundle), so it builds data with the app's OWN functions — factory
// templates, scoreAudit / scoreWeekly, nextCapId, uuid — guaranteeing the
// objects match exactly what the app produces and are scored correctly.
//
//   cat qa/shim.js qa/app_bundle.js qa/gen_demo_data.js > qa/gen_run.js
//   node qa/gen_run.js
//
// Output: qa/demo_state.json  (+ prints stats and the byte size).
// ---------------------------------------------------------------------------
(async function () {
  const fs = require('fs');

  // Deterministic PRNG so re-runs are stable (no Math.random scatter).
  let _seed = 20260603;
  function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
  function chance(p) { return rnd() < p; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  localStorage.clear();
  Templates.ensureSeeded();

  // ---- Users (real PBKDF2-hashed PINs) ----
  const owner = await Users.create({ name: 'Sagar Bora', role: 'OWNER', pin: '1234', phone: '9876500000' });
  const gm    = await Users.create({ name: 'Asha Patil', role: 'GM',    pin: '2345', phone: '9876511111' });
  const sm1   = await Users.create({ name: 'Ravi Kumar', role: 'SM',    pin: '3456', phone: '9876522222' });
  const sm2   = await Users.create({ name: 'Sunil More', role: 'SM',    pin: '4567', phone: '9876533333' });
  const sms = [sm1, sm2];

  // ---- CROs ----
  const state0 = Store.load();
  state0.cros = [
    { id: 'cro_suresh', name: 'Suresh Jadhav', counter: 'Titan World' },
    { id: 'cro_priya',  name: 'Priya Joshi',   counter: 'Titan World' },
    { id: 'cro_mahesh', name: 'Mahesh Pawar',  counter: 'Helios' },
    { id: 'cro_kavita', name: 'Kavita Shinde', counter: 'Helios' },
  ];
  Store.save(state0);
  const croIds = state0.cros.map(c => c.id);

  const dailyTpl = Templates.byId(null, 'tpl_daily');
  const weeklyTpl = Templates.byId(null, 'tpl_weekly');
  const dailyCps = dailyTpl.checkpoints;
  const weeklyCps = weeklyTpl.checkpoints;

  // v2 shared-snapshot dictionary: store each template's snapshot ONCE and
  // reference it from every audit (snapshot_ref), instead of a full per-audit
  // copy — keeps 6 months of data well under the localStorage quota.
  function snapshotOf(tpl) {
    return {
      name: tpl.name, name_mr: tpl.name_mr,
      frequency: tpl.frequency, cro_mode: tpl.cro_mode,
      sections: JSON.parse(JSON.stringify(tpl.sections || [])),
      checkpoints: JSON.parse(JSON.stringify(tpl.checkpoints || [])),
    };
  }
  const snapshots = {};
  const dailyRef = 'tpl_daily@' + snapHashOf(dailyTpl);
  const weeklyRef = 'tpl_weekly@' + snapHashOf(weeklyTpl);
  snapshots[dailyRef] = snapshotOf(dailyTpl);
  snapshots[weeklyRef] = snapshotOf(weeklyTpl);

  const FINDINGS = [
    'Not done at opening; corrected after reminder.',
    'Register entry missing; staff briefed.',
    'Counter not wiped; cleaned immediately.',
    'Price card mismatch on 2 SKUs.',
    'Badge not worn; CRO reminded.',
    'Display planogram off; reset.',
    'Late upload past cut-off time.',
    'Petty-cash slip missing receipt.',
  ];
  const ENDS = '2026-06-03';
  const DAYS = 182;

  function dateMinus(endStr, n) {
    const d = new Date(endStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function isoOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    return { week: isoWeekOf(d), year: (function () { const x = new Date(d); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); return x.getUTCFullYear(); })() };
  }

  const audits = [];
  // The dates we'll cover, oldest → newest.
  const dates = [];
  for (let i = DAYS - 1; i >= 0; i--) dates.push(dateMinus(ENDS, i));

  // Pick a "recurring failure" checkpoint and a declining-weeks window.
  const recurringCp = dailyCps[3] ? dailyCps[3].id : dailyCps[0].id;
  const cashCp = dailyCps.find(c => /cash/i.test(c.section_id || '') || /6\./.test(c.id)) || null;

  dates.forEach((dateStr, di) => {
    // ~8% of days have no audit (missing-day realism).
    if (chance(0.08)) return;
    const ageDays = DAYS - 1 - di; // 0 = today-ish (newest)
    const auditor = sms[di % 2];

    // Base fail probability; a few "bad days" spike it.
    let failP = 0.05;
    if (chance(0.04)) failP = 0.22;            // occasional critical day
    // Declining stretch: the 3 weeks ~30-10 days ago trend worse.
    if (ageDays <= 30 && ageDays >= 10) failP = 0.05 + (30 - ageDays) * 0.004;

    const results = {};
    dailyCps.forEach(cp => {
      let v = 'P';
      // Recurring failure on the chosen cp during one ~12-day stretch.
      if (cp.id === recurringCp && ageDays <= 95 && ageDays >= 83) v = 'F';
      else if (chance(failP)) v = 'F';
      else if (cp.allows_na && chance(0.02)) v = 'NA';
      results[cp.id] = {
        result: v,
        finding: v === 'F' ? pick(FINDINGS) : '',
        cro_id: v === 'F' && chance(0.6) ? pick(croIds) : null,
        photos: [],
        at: dateStr + 'T10:' + String(20 + (di % 30)).padStart(2, '0') + ':00.000Z',
      };
    });

    // Seed a couple of keyword findings for T5/T6 coverage (rare).
    if (ageDays === 60 && cashCp) { results[cashCp.id] = { result: 'F', finding: 'Suspected theft — cash short by ₹800, CCTV to review.', cro_id: 'cro_suresh', photos: [], at: dateStr + 'T19:30:00.000Z' }; }
    if (ageDays === 45) { const anyCp = dailyCps[10].id; results[anyCp] = { result: 'F', finding: 'Customer complaint escalated about refund denied.', cro_id: 'cro_priya', photos: [], at: dateStr + 'T16:00:00.000Z' }; }

    const score = scoreAudit(results, dailyCps);
    // Newest ~8 days: awaiting verification (status submitted). Rest verified.
    const awaiting = ageDays < 8 && chance(0.7);
    const a = {
      id: uuid(),
      template_id: 'tpl_daily',
      audit_type: 'daily',
      date: dateStr,
      auditor_id: auditor.id,
      auditor_name: auditor.name,
      cros: croIds.slice(),
      status: awaiting ? 'submitted' : 'verified',
      results,
      started_at: dateStr + 'T10:15:00.000Z',
      submitted_at: dateStr + 'T11:05:00.000Z',
      snapshot_ref: dailyRef,
      score,
    };
    if (!awaiting) {
      a.verifier_id = gm.id;
      a.verifier_name = gm.name;
      a.verified_at = dateStr + 'T18:30:00.000Z';
      a.verify_note = chance(0.4) ? 'Spot-checked on floor — matches.' : '';
    }
    audits.push(a);
  });

  // ---- Weekly audits: one per fully-covered ISO week ----
  const byWeek = {};
  audits.forEach(a => {
    const w = isoOf(a.date);
    const key = w.year + '-' + w.week;
    (byWeek[key] = byWeek[key] || { week: w.week, year: w.year, pcts: [] }).pcts.push(a.score.pct);
  });
  Object.values(byWeek).forEach(wk => {
    if (wk.pcts.length < 3) return; // skip thin partial weeks
    // weekly-only checkpoint verdicts: ~90% pass, inventory occasionally fails.
    const wResults = {};
    weeklyCps.forEach(cp => {
      const isInv = cp.group === 'inventory_weekly' || /^IW\./.test(cp.id);
      let v = 'P';
      if (isInv && chance(0.18)) v = 'F';
      else if (chance(0.08)) v = 'F';
      else if (cp.allows_na && chance(0.02)) v = 'NA';
      wResults[cp.id] = { result: v, finding: v === 'F' ? pick(FINDINGS) : '', cro_id: null, photos: [], at: '' };
    });
    const verdictsForScore = {};
    Object.keys(wResults).forEach(id => { verdictsForScore[id] = wResults[id].result; });
    const score = scoreWeekly(wk.pcts, verdictsForScore, weeklyCps, dailyCps.length);
    // date = the Sunday of that week (approx: use the newest daily date of the week).
    const wkDates = audits.filter(a => { const ww = isoOf(a.date); return ww.week === wk.week && ww.year === wk.year; }).map(a => a.date).sort();
    const subDate = wkDates[wkDates.length - 1];
    audits.push({
      id: uuid(),
      template_id: 'tpl_weekly',
      audit_type: 'weekly',
      week_number: wk.week,
      year: wk.year,
      date: subDate,
      auditor_id: gm.id,
      auditor_name: gm.name,
      cros: [],
      status: 'verified',
      results: wResults,
      started_at: subDate + 'T17:00:00.000Z',
      submitted_at: subDate + 'T17:40:00.000Z',
      snapshot_ref: weeklyRef,
      score,
      daily_pcts_used: wk.pcts.slice(0, 7),
      verifier_id: owner.id,
      verifier_name: owner.name,
      verified_at: subDate + 'T20:00:00.000Z',
      verify_note: '',
    });
  });

  // ---- CAPs from fails, with a realistic lifecycle spread ----
  const caps = [];
  const cpById = {}; dailyCps.concat(weeklyCps).forEach(c => { cpById[c.id] = c; });
  audits.forEach(a => {
    const fails = Object.entries(a.results || {}).filter(([, r]) => r.result === 'F');
    // Cap creation: not every fail spawns a CAP in real life — ~70% do.
    fails.forEach(([cpId, r]) => {
      if (!chance(0.7)) return;
      const cp = cpById[cpId]; if (!cp) return;
      const created = a.date;
      const deadline = addDays(created, 7);
      const ageDays = Math.round((new Date(ENDS) - new Date(created)) / 86400000);
      // Lifecycle by age: old → closed, mid → aged/verified, recent → open/done.
      let status = 'open', done_at = null, verified_at = null, verified_by = null, closed_at = null, closed_by = null;
      if (ageDays > 45) { status = chance(0.85) ? 'closed' : 'aged'; }
      else if (ageDays > 21) { status = pick(['closed', 'verified', 'aged', 'done']); }
      else if (ageDays > 8) { status = pick(['open', 'done', 'verified']); }
      else { status = pick(['open', 'open', 'done']); }
      if (status === 'done' || status === 'verified' || status === 'closed') done_at = addDays(created, 2) + 'T12:00:00.000Z';
      if (status === 'verified' || status === 'closed') { verified_at = addDays(created, 3) + 'T12:00:00.000Z'; verified_by = gm.id; }
      if (status === 'closed') { closed_at = addDays(created, 4) + 'T12:00:00.000Z'; closed_by = owner.id; }
      caps.push({
        id: nextCapId(caps, created),
        audit_id: a.id,
        audit_date: created,
        checkpoint_id: cpId,
        sop_id: cp.section_id || cp.sop_id || cp.group || null,
        finding: r.finding || '',
        cro_id: r.cro_id || null,
        photos: [],
        why1: '', why2: '', why3: '', why4: '', why5: '',
        root_cause: status === 'closed' ? 'Process gap — retrained staff.' : '',
        action_steps: status === 'open' ? [] : [{ text: 'Retrain + add to opening checklist', done: status !== 'open' }],
        responsible_user_id: a.auditor_id || sm1.id,
        deadline,
        status,
        created_at: created + 'T11:10:00.000Z',
        done_at, verified_at, verified_by, verify_notes: null,
        closed_at, closed_by,
      });
    });
  });

  // ---- Escalations: derive from the real evaluator on a subset ----
  const escalations = [];
  const finalState = Store.load();
  finalState.audits = audits;
  finalState.caps = caps;
  Store.save(finalState);
  // Run the daily evaluator on a sample of daily audits (oldest sent, recent unsent).
  const dailyAudits = audits.filter(a => a.audit_type === 'daily').sort((x, y) => x.date.localeCompare(y.date));
  dailyAudits.forEach(a => {
    const drafts = evaluateEscalationsForAudit(a, Store.load());
    drafts.forEach(d => {
      const ageDays = Math.round((new Date(ENDS) - new Date(a.date)) / 86400000);
      escalations.push(Object.assign({}, d, {
        id: 'esc-' + uuid(),
        audit_id: a.id,
        raised_at: a.date + 'T11:06:00.000Z',
        sent_at: ageDays > 6 ? a.date + 'T11:30:00.000Z' : null,
        sent_via: ageDays > 6 ? (chance(0.8) ? 'whatsapp' : 'dismissed') : null,
        sent_by: ageDays > 6 ? gm.id : null,
        dismiss_reason: '',
      }));
    });
  });
  // Weekly escalations too (T4/T7).
  audits.filter(a => a.audit_type === 'weekly').forEach(a => {
    const drafts = evaluateWeeklyEscalations(a, Store.load());
    drafts.forEach(d => {
      const ageDays = Math.round((new Date(ENDS) - new Date(a.date)) / 86400000);
      escalations.push(Object.assign({}, d, {
        id: 'esc-' + uuid(), audit_id: a.id, raised_at: a.date + 'T17:41:00.000Z',
        sent_at: ageDays > 6 ? a.date + 'T18:00:00.000Z' : null,
        sent_via: ageDays > 6 ? 'whatsapp' : null, sent_by: ageDays > 6 ? owner.id : null, dismiss_reason: '',
      }));
    });
  });

  const out = Store.load();
  out.escalations = escalations;
  out.template_snapshots = snapshots;   // shared snapshot dictionary (v2)
  out.schema_version = SCHEMA_VERSION;
  out.current_user_id = null;
  out.auditor_name = '';
  Store.save(out);

  // ---- Write + report ----
  const json = JSON.stringify(out);
  fs.writeFileSync('qa/demo_state.json', json);
  const mb = (json.length * 2 / (1024 * 1024)).toFixed(2); // UTF-16 bytes ~ localStorage footprint
  const dailyN = audits.filter(a => a.audit_type === 'daily').length;
  const weeklyN = audits.filter(a => a.audit_type === 'weekly').length;
  const capStatuses = {};
  caps.forEach(c => { capStatuses[c.status] = (capStatuses[c.status] || 0) + 1; });
  const escSent = escalations.filter(e => e.sent_at).length;
  console.log('===== DEMO DATA GENERATED =====');
  console.log('users:', out.users.length, '| cros:', out.cros.length, '| templates:', out.templates.length);
  console.log('daily audits:', dailyN, '| weekly audits:', weeklyN);
  console.log('CAPs:', caps.length, JSON.stringify(capStatuses));
  console.log('escalations:', escalations.length, '(sent/dismissed:', escSent, '| unsent:', escalations.length - escSent, ')');
  console.log('date span:', dates[0], '→', dates[dates.length - 1]);
  console.log('JSON chars:', json.length, '| est. localStorage:', mb, 'MB (limit ~5 MB)');
  console.log('storageHealth pct vs 5MB:', Math.round((json.length * 2 / (5 * 1024 * 1024)) * 100) + '%');
})();
