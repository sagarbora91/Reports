// ---- Test battery (runs in the same scope as the app code) ----
(async function () {
  let pass = 0, fail = 0;
  const fails = [];
  function ok(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; fails.push(name + (extra ? '  → ' + extra : '')); }
  }
  function eq(name, got, want) {
    ok(name, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
  }
  function reset() { localStorage.clear(); Templates.ensureSeeded(); }

  // ---- 1. Boot / seed ----
  reset();
  eq('seed: daily template exists', !!Templates.byId(null, 'tpl_daily'), true);
  eq('seed: weekly template exists', !!Templates.byId(null, 'tpl_weekly'), true);
  eq('data: 68 daily checkpoints', CHECKPOINTS.length, 68);
  eq('data: 36 weekly checkpoints', WEEKLY_CHECKPOINTS.length, 36);
  eq('i18n: loaded', !!(window.I18N_DATA && window.I18N_DATA.en), true);
  eq('reference: loaded', !!(window.REFERENCE_DATA && window.REFERENCE_DATA.glossary), true);
  eq('daily template has 68 checkpoints', Templates.byId(null,'tpl_daily').checkpoints.length, 68);

  // ---- 2. Bands (Spec §6.2 boundaries) ----
  eq('band 95 excellent', bandFor(95), 'excellent');
  eq('band 94.9 good', bandFor(94.9), 'good');
  eq('band 90 good', bandFor(90), 'good');
  eq('band 89.9 fair', bandFor(89.9), 'fair');
  eq('band 85 fair', bandFor(85), 'fair');
  eq('band 84.9 poor', bandFor(84.9), 'poor');
  eq('band 80 poor', bandFor(80), 'poor');
  eq('band 79.9 critical', bandFor(79.9), 'critical');

  // ---- 3. Equal-weight scoring (weight ignored, NA excluded) ----
  (function () {
    const cps = [
      { id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 1 }, { id: 'd', weight: 2 },
    ];
    // 3 pass, 1 fail → 75% regardless of weights
    let r = scoreAudit({ a: { result: 'P' }, b: { result: 'P' }, c: { result: 'P' }, d: { result: 'F' } }, cps);
    eq('equalweight 3/4 = 75%', r.pct, 75);
    eq('equalweight cash(weight2) fail not double', r.max, 4);
    // NA excluded both sides: 2 pass 1 fail 1 NA → 66.7%
    r = scoreAudit({ a: { result: 'P' }, b: { result: 'P' }, c: { result: 'F' }, d: { result: 'NA' } }, cps);
    eq('NA excluded denom', r.max, 3);
    eq('NA excluded → 66.7%', r.pct, 66.7);
    // empty / all NA → 100 not crash
    r = scoreAudit({ a: { result: 'NA' }, b: { result: 'NA' }, c: { result: 'NA' }, d: { result: 'NA' } }, cps);
    eq('all NA → 100% no crash', r.pct, 100);
    r = scoreAudit({}, cps);
    eq('nothing marked → 100%', r.pct, 100);
  })();

  // ---- 4. Weekly scoring invariants ----
  (function () {
    const allP = {}; WEEKLY_CHECKPOINTS.forEach(c => allP[c.id] = 'P');
    const allF = {}; WEEKLY_CHECKPOINTS.forEach(c => allF[c.id] = 'F');
    let r = scoreWeekly([100,100,100,100,100,100,100], allP, WEEKLY_CHECKPOINTS, 68);
    eq('weekly all-pass = 100', r.pct, 100);
    r = scoreWeekly([0,0,0,0,0,0,0], allF, WEEKLY_CHECKPOINTS, 68);
    eq('weekly all-fail = 0', r.pct, 0);
    // missing days count as 0
    r = scoreWeekly([100], allP, WEEKLY_CHECKPOINTS, 68);
    ok('weekly missing days drag score', r.pct < 100 && r.pct > 0, 'pct=' + r.pct);
    // dailyTemplateCount used as default dailyMax
    eq('dailyTemplateCount = 68', dailyTemplateCount(), 68);
  })();

  // ---- 5. User auth (async, PBKDF2) ----
  reset();
  const owner = await Users.create({ name: 'Sagar', role: 'OWNER', pin: '1234', phone: '9876543210' });
  eq('user created', !!owner.id, true);
  eq('pin hashed not plaintext', owner.pin_hash && owner.pin_hash !== '1234', true);
  eq('phone normalized to 91…', owner.phone, '919876543210');
  eq('verifyPin correct', await verifyPin('1234', owner.pin_salt, owner.pin_hash), true);
  eq('verifyPin wrong', await verifyPin('0000', owner.pin_salt, owner.pin_hash), false);
  AuthSession.login(owner.id);
  eq('AuthSession.current after login', AuthSession.current().id, owner.id);
  AuthSession.logout();
  eq('AuthSession.current after logout', AuthSession.current(), null);

  // ---- 6. Daily audit store-mode full flow ----
  reset();
  const u = await Users.create({ name: 'SM', role: 'SM', pin: '1111' });
  AuthSession.login(u.id);
  startNewAudit({ date: today(), auditorName: 'SM', auditorId: u.id, croIds: [], templateId: 'tpl_daily' });
  (function () {
    const st = Store.load();
    const a = currentAudit(st);
    eq('draft created with template', a.template_id, 'tpl_daily');
  })();
  // mark all 68 as P
  CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
  (function () {
    const idx = nextUnmarkedIndex(currentAudit(Store.load()));
    eq('all 68 marked → walk complete', idx, 68);
  })();
  let res = submitAudit();
  eq('submit daily 100%', res.audit.score.pct, 100);
  eq('submit daily band excellent', res.audit.score.band, 'excellent');
  eq('submit froze snapshot', !!(res.audit.template_snapshot || res.audit.snapshot_ref), true);
  eq('submitted audit in history', Store.load().audits.filter(x => x.status === 'submitted').length, 1);

  // one with fails → CAPs created
  reset();
  const u2 = await Users.create({ name: 'SM2', role: 'SM', pin: '2222' });
  AuthSession.login(u2.id);
  startNewAudit({ date: today(), auditorName: 'SM2', auditorId: u2.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 5 ? 'F' : 'P', i < 5 ? { finding: 'dummy fail ' + i } : {}));
  res = submitAudit();
  eq('5 fails of 68 → score', res.audit.score.pct, Math.round((63 / 68) * 1000) / 10);
  eq('5 fails → 5 CAPs', res.capsCreated, 5);
  eq('caps in store', Store.load().caps.length, 5);

  // ---- 7. Snapshot immunity: edit template after submit ----
  (function () {
    const st = Store.load();
    const submitted = st.audits.find(x => x.status === 'submitted');
    const before = checkpointsFor(submitted).length;
    // delete a checkpoint from the live daily template
    const tpl = Templates.byId(null, 'tpl_daily');
    tpl.checkpoints.pop();
    Templates.save(tpl);
    const after = checkpointsFor(submitted).length;
    eq('snapshot immune to later template edit', after, before);
    Templates.resetToDefault('tpl_daily');
  })();

  // ---- 8. CAP lifecycle ----
  reset();
  const gm = await Users.create({ name: 'GM', role: 'GM', pin: '3333' });
  const sm3 = await Users.create({ name: 'SM3', role: 'SM', pin: '4444' });
  AuthSession.login(sm3.id);
  startNewAudit({ date: today(), auditorName: 'SM3', auditorId: sm3.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i === 0 ? 'F' : 'P', i === 0 ? { finding: 'cap test' } : {}));
  submitAudit();
  (function () {
    const cap = Store.load().caps[0];
    eq('CAP starts open', cap.status, 'open');
    Caps.markDone(cap.id);
    eq('CAP → done', Store.load().caps[0].status, 'done');
    Caps.verify(cap.id, gm.id, 'looks fixed');
    eq('CAP → verified', Store.load().caps[0].status, 'verified');
    Caps.close(cap.id, gm.id);
    eq('CAP → closed', Store.load().caps[0].status, 'closed');
  })();

  // ---- 9. Escalations ----
  reset();
  const sm4 = await Users.create({ name: 'SM4', role: 'SM', pin: '5555' });
  await Users.create({ name: 'GM4', role: 'GM', pin: '6666', phone: '9000000000' });
  AuthSession.login(sm4.id);
  startNewAudit({ date: today(), auditorName: 'SM4', auditorId: sm4.id, croIds: [], templateId: 'tpl_daily' });
  // Fail enough to go critical (<80%): fail 20 of 68 = 70.6%
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 20 ? 'F' : 'P', i < 20 ? { finding: 'x' } : {}));
  res = submitAudit();
  ok('critical audit raises escalation', res.escalationsRaised >= 1, 'raised=' + res.escalationsRaised);
  (function () {
    const escs = Escalations.list(Store.load());
    ok('T1 critical escalation present', escs.some(e => e.trigger_number === 1), 'triggers=' + escs.map(e=>e.trigger_number));
  })();
  // keyword T5
  reset();
  const sm5 = await Users.create({ name: 'SM5', role: 'SM', pin: '7777' });
  await Users.create({ name: 'Owner5', role: 'OWNER', pin: '8888', phone: '9111111111' });
  AuthSession.login(sm5.id);
  startNewAudit({ date: today(), auditorName: 'SM5', auditorId: sm5.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i === 0 ? 'F' : 'P', i === 0 ? { finding: 'cash missing, possible theft' } : {}));
  res = submitAudit();
  (function () {
    const escs = Escalations.list(Store.load());
    ok('T5 theft keyword escalation', escs.some(e => e.trigger_number === 5), 'triggers=' + escs.map(e=>e.trigger_number));
  })();

  // ---- 10. Template builder ----
  reset();
  const t = Templates.create({ name: 'Grooming', frequency: 'daily', cro_mode: 'per_cro' });
  eq('create template', t.frequency, 'daily');
  eq('new template has 1 section', t.sections.length, 1);
  // add a checkpoint
  (function () {
    const tpl = Templates.byId(null, t.id);
    tpl.checkpoints.push({ id: 'c_x', section_id: tpl.sections[0].id, text: 'Name badge', weight: 1, allows_na: false, photo_required_on_fail: false, order: 1 });
    Templates.save(tpl);
    eq('checkpoint added', Templates.byId(null, t.id).checkpoints.length, 1);
  })();
  Templates.remove(t.id);
  eq('template removed', Templates.byId(null, t.id), null);

  // ---- 11. Per-CRO audit flow ----
  reset();
  const owner2 = await Users.create({ name: 'Owner', role: 'OWNER', pin: '4321' });
  AuthSession.login(owner2.id);
  // build a per-CRO template with 2 checkpoints
  const groom = Templates.create({ name: 'Grooming', frequency: 'daily', cro_mode: 'per_cro' });
  (function () {
    const tpl = Templates.byId(null, groom.id);
    const sid = tpl.sections[0].id;
    tpl.checkpoints = [
      { id: 'g1', section_id: sid, text: 'Badge', weight: 1, allows_na: false, photo_required_on_fail: false, order: 1 },
      { id: 'g2', section_id: sid, text: 'Uniform', weight: 1, allows_na: false, photo_required_on_fail: false, order: 2 },
    ];
    Templates.save(tpl);
  })();
  // add two CROs
  (function () {
    const st = Store.load();
    st.cros = [{ id: 'cro1', name: 'Suresh', counter: 'Titan' }, { id: 'cro2', name: 'Priya', counter: 'Helios' }];
    Store.save(st);
  })();
  startNewAudit({ date: today(), auditorName: 'Owner', auditorId: owner2.id, croIds: ['cro1', 'cro2'], templateId: groom.id });
  (function () {
    const a = currentAudit(Store.load());
    eq('per-cro mode set', a.cro_mode, 'per_cro');
    eq('per-cro order', a.cro_order.length, 2);
    eq('current cro = cro1', currentCroId(a), 'cro1');
  })();
  // mark CRO1: g1 P, g2 F
  markCheckpoint('g1', 'P'); markCheckpoint('g2', 'F', { finding: 'untucked' });
  (function () {
    const a = currentAudit(Store.load());
    eq('cro1 results stored under bucket', a.cro_results.cro1.g1.result, 'P');
    eq('cro1 walk complete', nextUnmarkedIndex(a), 2);
  })();
  // advance to CRO2
  (function () {
    const st = Store.load(); const a = currentAudit(st);
    a.current_cro_index = 1; Store.save(st);
    eq('current cro = cro2', currentCroId(currentAudit(Store.load())), 'cro2');
  })();
  markCheckpoint('g1', 'P'); markCheckpoint('g2', 'P');
  res = submitAudit();
  (function () {
    const a = res.audit;
    eq('per-cro cro1 score 50%', a.score_by_cro.cro1.pct, 50);
    eq('per-cro cro2 score 100%', a.score_by_cro.cro2.pct, 100);
    eq('per-cro pooled 3/4 = 75%', a.score.pct, 75);
    // CAP from cro1 g2 fail, attributed to cro1
    const caps = Store.load().caps;
    eq('per-cro fail → 1 CAP', caps.length, 1);
    eq('CAP attributed to cro1', caps[0].cro_id, 'cro1');
  })();

  // ---- 12. Week math ----
  eq('isoWeek 2026-01-01', isoWeekOf(new Date('2026-01-01')), 1);
  ok('isoWeek mid-year sane', isoWeekOf(new Date('2026-07-01')) >= 26 && isoWeekOf(new Date('2026-07-01')) <= 27, '');

  // ---- 13. phone + whatsapp ----
  eq('normalizePhone 10-digit', normalizePhone('98765 43210'), '919876543210');
  eq('normalizePhone empty', normalizePhone(''), '');
  ok('whatsappLink builds', whatsappLink('9876543210', 'hi').indexOf('wa.me/919876543210') > 0, '');
  eq('whatsappLink no phone', whatsappLink('', 'hi'), null);

  // ---- 14. canRunTemplate role gating ----
  eq('SM cannot run weekly', canRunTemplate({ role: 'SM' }, { frequency: 'weekly' }), false);
  eq('GM can run weekly', canRunTemplate({ role: 'GM' }, { frequency: 'weekly' }), true);
  eq('Owner runs monthly', canRunTemplate({ role: 'OWNER' }, { frequency: 'monthly' }), true);
  eq('SM cannot run monthly', canRunTemplate({ role: 'SM' }, { frequency: 'monthly' }), false);
  eq('anyone runs daily', canRunTemplate({ role: 'SM' }, { frequency: 'daily' }), true);

  // ---- 15. Render smoke tests: every screen must build without throwing ----
  function smoke(name, fn) {
    try { const out = fn(); ok('render: ' + name, typeof out === 'string' || out === undefined, 'returned ' + typeof out); }
    catch (e) { ok('render: ' + name, false, (e && e.message) || String(e)); }
  }
  // Rich state: owner + sm + gm, cros, a submitted daily audit, caps, escalations, templates
  reset();
  const ro = await Users.create({ name: 'Owner', role: 'OWNER', pin: '1234', phone: '9876500000' });
  const rg = await Users.create({ name: 'GM', role: 'GM', pin: '2345', phone: '9876511111' });
  const rs = await Users.create({ name: 'SM', role: 'SM', pin: '3456' });
  (function () { const st = Store.load(); st.cros = [{ id: 'cx', name: 'Suresh', counter: 'Titan' }]; Store.save(st); })();
  AuthSession.login(rs.id);
  startNewAudit({ date: today(), auditorName: 'SM', auditorId: rs.id, croIds: ['cx'], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 22 ? 'F' : 'P', i < 22 ? { finding: 'theft suspected' } : {}));
  submitAudit();

  for (const loc of ['en', 'mr']) {
    I18n.set(loc);
    for (const who of [ro, rg, rs]) {
      AuthSession.login(who.id);
      const st = Store.load();
      smoke(`AuditTab ${who.role}/${loc}`, () => renderAuditTab(st, who));
      smoke(`HistoryTab ${who.role}/${loc}`, () => renderHistoryTab(st, who));
      smoke(`CapsTab ${who.role}/${loc}`, () => renderCapsTab(st, who));
      smoke(`ReferenceTab ${who.role}/${loc}`, () => renderReferenceTab());
      smoke(`SettingsTab ${who.role}/${loc}`, () => renderSettingsTab(st, who));
    }
  }
  I18n.set('en');
  // Builder editor render (owner)
  AuthSession.login(ro.id);
  Builder.editingId = 'tpl_daily';
  smoke('Builder editor (daily)', () => renderSettingsTab(Store.load(), ro));
  Builder.editingId = 'tpl_weekly';
  smoke('Builder editor (weekly)', () => renderSettingsTab(Store.load(), ro));
  Builder.editingId = null;
  // In-progress + review renders
  AuthSession.login(rs.id);
  startNewAudit({ date: today(), auditorName: 'SM', auditorId: rs.id, croIds: ['cx'], templateId: 'tpl_daily' });
  smoke('InProgress (daily, fresh)', () => renderInProgressAudit(currentAudit(Store.load())));
  CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
  smoke('Review (daily complete)', () => renderReviewAudit(currentAudit(Store.load())));
  // History detail modal (store + per-cro) — openModal is a no-op in shim
  (function () {
    const submitted = Store.load().audits.find(x => x.status === 'submitted');
    smoke('historyDetailModal (store)', () => { historyDetailModal(submitted); });
  })();
  // Reference sub-tabs
  for (const sub of ['bands', 'triggers', 'evidence', 'glossary']) {
    RefState.sub = sub;
    smoke('Reference sub ' + sub, () => renderReferenceTab());
  }
  // Escalation cards
  smoke('EscalationCards', () => renderEscalationCards(Store.load(), ro));

  // ---- 16. Edge cases ----
  // SKIP then revisit
  reset();
  const es = await Users.create({ name: 'SkipSM', role: 'SM', pin: '9090' });
  AuthSession.login(es.id);
  startNewAudit({ date: today(), auditorName: 'SkipSM', auditorId: es.id, croIds: [], templateId: 'tpl_daily' });
  (function () {
    const first = CHECKPOINTS[0].id;
    markCheckpoint(first, 'SKIP');
    // mark all the rest P
    CHECKPOINTS.slice(1).forEach(cp => markCheckpoint(cp.id, 'P'));
    const a = currentAudit(Store.load());
    eq('SKIP re-enters at the skipped cp', checkpointsFor(a)[nextUnmarkedIndex(a)].id, first);
    markCheckpoint(first, 'P');
    eq('after resolving SKIP, walk complete', nextUnmarkedIndex(currentAudit(Store.load())), 68);
  })();

  // CAP aging
  reset();
  (function () {
    const st = Store.load();
    st.caps = [{ id: 'CAP-X', status: 'open', deadline: '2000-01-01', audit_id: 'z', checkpoint_id: '1.1' }];
    Store.save(st);
    ageOverdueCaps();
    eq('overdue open CAP → aged', Store.load().caps[0].status, 'aged');
  })();

  // Idempotent CAP creation (replay-safe)
  reset();
  const ic = await Users.create({ name: 'IdSM', role: 'SM', pin: '1212' });
  AuthSession.login(ic.id);
  startNewAudit({ date: today(), auditorName: 'IdSM', auditorId: ic.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 3 ? 'F' : 'P', i < 3 ? { finding: 'x' } : {}));
  const r16 = submitAudit();
  const again = autoCreateCapsForAudit(r16.audit);
  eq('CAP creation idempotent (no dup on replay)', again.length, 0);
  eq('still 3 CAPs total', Store.load().caps.length, 3);

  // Weekly from real submitted dailies
  reset();
  const wg = await Users.create({ name: 'WkGM', role: 'GM', pin: '1313' });
  const wsm = await Users.create({ name: 'WkSM', role: 'SM', pin: '1414' });
  // 3 submitted daily audits this week with mixed scores
  for (let d = 0; d < 3; d++) {
    AuthSession.login(wsm.id);
    startNewAudit({ date: today(), auditorName: 'WkSM', auditorId: wsm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < d * 5 ? 'F' : 'P'));
    submitAudit();
  }
  AuthSession.login(wg.id);
  const wy = currentIsoWeekYear();
  eq('3 daily pcts found for week', dailyPctsForWeek(wy.week, wy.year, Store.load()).length, 3);
  startWeeklyAudit({ weekNumber: wy.week, year: wy.year, gmId: wg.id, gmName: 'WkGM', templateId: 'tpl_weekly' });
  WEEKLY_CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
  const rw = submitAudit();
  eq('weekly used 3 daily pcts', rw.audit.daily_pcts_used.length, 3);
  ok('weekly score sane (0-100)', rw.audit.score.pct > 0 && rw.audit.score.pct <= 100, 'pct=' + rw.audit.score.pct);

  // Custom MONTHLY template end-to-end (Owner)
  reset();
  const mo = await Users.create({ name: 'MOwner', role: 'OWNER', pin: '1515' });
  AuthSession.login(mo.id);
  const mt = Templates.create({ name: 'Monthly Review', frequency: 'monthly', cro_mode: 'store' });
  (function () {
    const tpl = Templates.byId(null, mt.id);
    const sid = tpl.sections[0].id;
    tpl.checkpoints = [
      { id: 'm1', section_id: sid, text: 'Licenses current', weight: 1, allows_na: false, photo_required_on_fail: false, order: 1 },
      { id: 'm2', section_id: sid, text: 'Insurance valid', weight: 1, allows_na: false, photo_required_on_fail: false, order: 2 },
    ];
    Templates.save(tpl);
  })();
  eq('owner can run monthly', canRunTemplate(mo, Templates.byId(null, mt.id)), true);
  startNewAudit({ date: today(), auditorName: 'MOwner', auditorId: mo.id, croIds: [], templateId: mt.id });
  markCheckpoint('m1', 'P'); markCheckpoint('m2', 'F', { finding: 'expired' });
  const rm = submitAudit();
  eq('monthly score 1/2 = 50%', rm.audit.score.pct, 50);
  eq('monthly frozen snapshot', !!(rm.audit.template_snapshot || rm.audit.snapshot_ref), true);
  eq('monthly no escalation (not daily)', rm.escalationsRaised, 0);

  // Backdated audit stores reason
  reset();
  const bo = await Users.create({ name: 'BSM', role: 'SM', pin: '1616' });
  AuthSession.login(bo.id);
  startNewAudit({ date: '2026-01-15', auditorName: 'BSM', auditorId: bo.id, croIds: [], templateId: 'tpl_daily', backdateReason: 'phone died' });
  eq('backdate reason stored', currentAudit(Store.load()).backdate_reason, 'phone died');

  // ---- 17. Trends ----
  reset();
  (function () {
    const st = Store.load();
    const dailyTpl = Templates.byId(null, 'tpl_daily');
    const firstCp = dailyTpl.checkpoints[0];
    st.audits = [
      { id: 't1', status: 'submitted', date: today(), template_id: 'tpl_daily', score: { pct: 90, band: 'good' }, results: { [firstCp.id]: { result: 'P' } } },
      { id: 't2', status: 'submitted', date: today(), template_id: 'tpl_daily', score: { pct: 80, band: 'poor' }, results: { [firstCp.id]: { result: 'F' } } },
    ];
    Store.save(st);
    const auds = st.audits;
    const w = trendByWeek(auds, 12);
    eq('trendByWeek → 12 buckets', w.length, 12);
    eq('trendByWeek newest avg = 85', w[11].avgPct, 85);
    eq('trendByWeek empty bucket null', w[0].avgPct, null);
    const wd = trendByWeekday(auds);
    eq('trendByWeekday → 7 days', wd.length, 7);
    eq('trendByWeekday starts Mon', wd[0].name, 'Mon');
    const sec = trendBySection(auds, 28);
    ok('trendBySection returns array', Array.isArray(sec), '');
    ok('trendBySection has the section with 1 fail of 2', sec.length >= 1 && sec[0].total === 2 && sec[0].fails === 1, JSON.stringify(sec[0]));
    smoke('renderTrends', () => renderTrends(auds));
    smoke('renderTrends empty', () => renderTrends([]));
    HistoryView.mode = 'trends';
    smoke('HistoryTab trends mode', () => renderHistoryTab(Store.load(), { role: 'OWNER', id: 'x' }));
    HistoryView.mode = 'list';
  })();

  // ---- 18. Verify gate (GM/Owner signs off a submitted daily audit) ----
  reset();
  const vgm = await Users.create({ name: 'GMVerify', role: 'GM', pin: '4242' });
  const vsm = await Users.create({ name: 'SMAuditor', role: 'SM', pin: '5252' });

  // SM runs + submits a daily audit (3 fails → a realistic record to check).
  AuthSession.login(vsm.id);
  startNewAudit({ date: today(), auditorName: 'SMAuditor', auditorId: vsm.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 3 ? 'F' : 'P', i < 3 ? { finding: 'vg fail ' + i } : {}));
  const vres = submitAudit();
  const vaid = vres.audit.id;
  eq('verify: submitted not yet verified', vres.audit.status, 'submitted');
  eq('verify: submitted is finalized', isFinalized(vres.audit), true);
  const vFresh = () => audit(vaid, Store.load());

  // Eligibility (verifyControlsHtml) — GM (not auditor) gets a button.
  AuthSession.login(vgm.id);
  ok('verify: GM (not auditor) sees verify button', /data-action="audit-verify"/.test(verifyControlsHtml(vFresh())), '');
  // The auditor (SM) does not — only an awaiting note.
  AuthSession.login(vsm.id);
  ok('verify: SM auditor sees awaiting, no button',
     !/data-action="audit-verify"/.test(verifyControlsHtml(vFresh())) && /Awaiting/.test(verifyControlsHtml(vFresh())), '');

  // The spot-check modal renders a confirm button + FAIL verdicts for the GM.
  AuthSession.login(vgm.id);
  verifyAuditModal(vaid);
  const vModal = document.getElementById('modal-root').innerHTML;
  ok('verify: modal has confirm button', /data-action="modal-confirm-verify"/.test(vModal), '');
  ok('verify: modal spot-checks a FAIL', /verdict-pill F/.test(vModal), '');
  closeModal();

  // GM cannot verify their OWN audit.
  AuthSession.login(vgm.id);
  startNewAudit({ date: today(), auditorName: 'GMVerify', auditorId: vgm.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
  const vOwn = submitAudit();
  ok('verify: GM cannot verify own audit', !/data-action="audit-verify"/.test(verifyControlsHtml(vOwn.audit, vgm)), '');

  // Apply verification (mirrors the modal-confirm-verify handler).
  (function () {
    const st = Store.load();
    const au = audit(vaid, st);
    au.status = 'verified';
    au.verifier_id = vgm.id;
    au.verifier_name = vgm.name;
    au.verified_at = new Date().toISOString();
    au.verify_note = 'spot-checked on floor';
    Store.save(st);
  })();
  const vDone = vFresh();
  eq('verify: status now verified', vDone.status, 'verified');
  eq('verify: verifier stamped', vDone.verifier_id, vgm.id);
  eq('verify: still finalized after verify', isFinalized(vDone), true);
  ok('verify: badge shows verifier name',
     /Verified by/.test(verifyControlsHtml(vDone)) && /GMVerify/.test(verifyControlsHtml(vDone)), '');

  // Verified audit still appears in history with a "verified" chip.
  AuthSession.login(vgm.id);
  HistoryView.mode = 'list';
  ok('verify: verified audit shows in history with chip',
     renderHistoryTab(Store.load(), AuthSession.current()).includes('✓ verified'), '');
  smoke('historyDetailModal (verified)', () => historyDetailModal(vDone));

  // ---- 19. Weekly report (9 sections) + T4/T7 escalations ----
  // 19a. ISO week date range helper.
  (function () {
    const rng = isoWeekDateRange(24, 2026);
    eq('isoWeekDateRange: 7 dates', rng.dates.length, 7);
    eq('isoWeekDateRange: starts Monday', new Date(rng.monday + 'T00:00:00Z').getUTCDay(), 1);
    eq('isoWeekDateRange: ends Sunday', new Date(rng.sunday + 'T00:00:00Z').getUTCDay(), 0);
    eq('isoWeekDateRange: Thursday lands in week 24', isoWeekOf(new Date(rng.dates[3] + 'T00:00:00Z')), 24);
  })();

  // 19b. Build a weekly audit (with one daily in the same week) and render it.
  reset();
  const wrGm = await Users.create({ name: 'WkGM', role: 'GM', pin: '7777', phone: '9876522222' });
  const wrSm = await Users.create({ name: 'WkSM', role: 'SM', pin: '8888' });
  AuthSession.login(wrSm.id);
  startNewAudit({ date: today(), auditorName: 'WkSM', auditorId: wrSm.id, croIds: [], templateId: 'tpl_daily' });
  CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 4 ? 'F' : 'P', i < 4 ? { finding: 'wk daily fail ' + i } : {}));
  submitAudit();
  const wkc = currentIsoWeekYear();
  AuthSession.login(wrGm.id);
  startWeeklyAudit({ weekNumber: wkc.week, year: wkc.year, gmId: wrGm.id, gmName: 'WkGM', templateId: 'tpl_weekly' });
  WEEKLY_CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i % 5 === 0 ? 'F' : 'P', i % 5 === 0 ? { finding: 'weekly fail ' + i } : {}));
  const wkRes = submitAudit();
  eq('weekly: submitted', wkRes.audit.status, 'submitted');
  ok('weekly: numeric score', typeof wkRes.audit.score.pct === 'number', '');
  const wHtml = weeklyReportHtml(wkRes.audit, Store.load());
  ok('weekly report: title', wHtml.includes('Weekly Report'), '');
  ok('weekly report: §4 compliance breakdown', wHtml.includes('Compliance Breakdown'), '');
  ok('weekly report: §3 7-day review', wHtml.includes('7-day review'), '');
  ok('weekly report: §9 sign-off', wHtml.includes('9 · Sign-off'), '');
  ok('weekly report: shows the headline pct', wHtml.includes(wkRes.audit.score.pct.toFixed(1) + '%'), '');
  smoke('weeklyReportHtml', () => weeklyReportHtml(wkRes.audit, Store.load()));

  // 19c. T4 — inventory weekly FAIL raises trigger 4 to the Owner.
  reset();
  (function () {
    const t4 = {
      id: 'wk-t4', template_id: 'tpl_weekly', audit_type: 'weekly',
      week_number: 10, year: 2099, status: 'submitted',
      results: { 'IW.1': { result: 'F', finding: '2 trays short on physical count' }, 'O.1': { result: 'P' } },
      score: { pct: 85, band: 'fair' },
    };
    const st = Store.load(); st.audits = [t4]; Store.save(st);
    const drafts = evaluateWeeklyEscalations(t4, Store.load());
    ok('T4: inventory FAIL raises trigger 4', drafts.some(e => e.trigger_number === 4), JSON.stringify(drafts.map(e => e.trigger_number)));
    eq('T4: routed to Owner', (drafts.find(e => e.trigger_number === 4) || {}).recipient_role, 'OWNER');
  })();

  // 19d. T7 — three weeks of decline raises trigger 7; an up-week does not.
  reset();
  (function () {
    const mk = (wkNum, pct, id) => ({
      id, template_id: 'tpl_weekly', audit_type: 'weekly',
      week_number: wkNum, year: 2099, status: 'submitted', results: {},
      score: { pct, band: bandFor(pct) },
    });
    const wA = mk(10, 90, 'wkA'), wB = mk(11, 86, 'wkB'), wC = mk(12, 82, 'wkC');
    let st = Store.load(); st.audits = [wA, wB, wC]; Store.save(st);
    const d7 = evaluateWeeklyEscalations(wC, Store.load());
    ok('T7: 3-week decline raises trigger 7', d7.some(e => e.trigger_number === 7), JSON.stringify(d7.map(e => e.trigger_number)));
    const wUp = mk(12, 95, 'wkUp');
    st = Store.load(); st.audits = [wA, wB, wUp]; Store.save(st);
    const d7b = evaluateWeeklyEscalations(wUp, Store.load());
    ok('T7: an improving week does NOT raise trigger 7', !d7b.some(e => e.trigger_number === 7), '');
  })();

  // ---- 20. i18n wiring (the Marathi toggle actually reaches UI chrome) ----
  reset();
  const i18nOwner = await Users.create({ name: 'Sagar', role: 'OWNER', pin: '1234' });
  AuthSession.login(i18nOwner.id);
  (function () {
    const prev = I18n.current;
    I18n.current = 'mr';
    eq('i18n: tUi submit_audit MR', tUi('btn.submit_audit'), 'ऑडिट सादर करा');
    eq('i18n: verify.btn MR', tUi('verify.btn'), '✓ हे ऑडिट पडताळा');
    eq('i18n: roleLabel(SM) MR', roleLabel('SM'), 'स्टोअर मॅनेजर');
    eq('i18n: freqLabel(daily) MR', freqLabel('daily'), 'दैनिक');
    const mrHtml = renderSettingsTab(Store.load(), AuthSession.current());
    ok('i18n: settings renders Marathi', /[ऀ-ॿ]/.test(mrHtml), '');
    ok('i18n: settings has no raw ">Sign out<"', !/>Sign out</.test(mrHtml), '');
    ok('i18n: no un-interpolated ${tUi leaked', !mrHtml.includes('${tUi'), '');
    I18n.current = 'en';
    eq('i18n: EN falls back to English', tUi('btn.submit_audit'), 'Submit audit');
    I18n.current = prev;
  })();

  // ---- 20. CSV export — per-CRO mode (Stage A #9) ----
  // Bug before this fix: exportCsv iterated a.results only, so per-CRO audits
  // (which write into a.cro_results[croId][cpId]) emitted zero data rows.
  reset();
  {
    // Build a custom per-CRO template with 2 checkpoints + 2 CROs on duty.
    const tpl0 = Templates.create({ name: 'csv-grooming', frequency: 'daily', cro_mode: 'per_cro' });
    const sId = tpl0.sections[0].id;
    tpl0.checkpoints = [
      { id: 'CP.A', section_id: sId, text: 'cp one', weight: 1 },
      { id: 'CP.B', section_id: sId, text: 'cp two', weight: 1 },
    ];
    Templates.save(tpl0);
    (function () {
      const s = Store.load();
      s.cros = [{ id: 'cA', name: 'Asha', counter: 'Titan' }, { id: 'cB', name: 'Babu', counter: 'Helios' }];
      Store.save(s);
    })();
    startNewAudit({ date: today(), auditorName: 'Owner', auditorId: null, croIds: ['cA', 'cB'], templateId: tpl0.id });
    // CRO A's verdicts.
    markCheckpoint('CP.A', 'P');
    markCheckpoint('CP.B', 'F', { finding: 'A failed cp two' });
    // Manually advance to CRO B (handler is wired to a button click; we test
    // the data path).
    (function () {
      const s = Store.load();
      const au = currentAudit(s);
      au.current_cro_index = 1;
      Store.save(s);
    })();
    markCheckpoint('CP.A', 'P');
    markCheckpoint('CP.B', 'P');
    const res = submitAudit();
    ok('csv: per-cro audit submitted', !!res && res.audit.status === 'submitted', '');
    const submitted = Store.load().audits.filter(a => isFinalized(a));
    const csv = auditsToCsv(submitted);
    const lines = csv.split('\n');
    // Header + one row per (CRO, checkpoint) = 1 + 4 = 5 lines.
    eq('csv: per-cro yields 4 data rows (was 0)', lines.length - 1, 4);
    ok('csv: header has cro_id col', lines[0].split(',').includes('cro_id'), '');
    ok('csv: at least one row tagged cA', lines.some(l => l.split(',').includes('cA')), '');
    ok('csv: at least one row tagged cB', lines.some(l => l.split(',').includes('cB')), '');
    ok('csv: per-cro finding text present', csv.includes('A failed cp two'), '');
  }

  // 20b. Store-mode audits still export correctly (regression check).
  reset();
  {
    const sm = await Users.create({ name: 'CsvSM', role: 'SM', pin: '7777' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'CsvSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 2 ? 'F' : 'P', i < 2 ? { finding: 'store fail ' + i } : {}));
    submitAudit();
    const csv = auditsToCsv(Store.load().audits.filter(a => isFinalized(a)));
    const lines = csv.split('\n');
    eq('csv: store-mode yields 68 data rows', lines.length - 1, 68);
  }

  // ---- 21. Storage health line + auto-warn banner (Stage A #12a) ----
  reset();
  // No backup yet → "No backups yet" line.
  ok('storage: lastBackupLine reports never when no last_backup_at',
     lastBackupLine(Store.load()) === 'No backups yet — please back up to Drive today.', '');

  // 30 days back → days-ago line.
  {
    const s = Store.load(); s.last_backup_at = new Date(Date.now() - 30 * 86400000).toISOString(); Store.save(s);
    ok('storage: lastBackupLine reports N days ago', /30 day/.test(lastBackupLine(Store.load())), '');
  }

  // storageHealth returns plausible numbers for a fresh store.
  {
    const h = storageHealth();
    ok('storage: storageHealth returns numeric pct', h && typeof h.pct === 'number' && h.pct >= 0 && h.pct <= 100, JSON.stringify(h));
  }

  // Banner is empty below the warn threshold.
  ok('storage: warn banner empty when healthy', storageWarnBanner() === '', '');

  // Banner appears when usage crosses the threshold. Simulate by writing a
  // large blob to the store and re-checking.
  {
    const s = Store.load();
    // ~3.6 MB string → ~7.2 MB UTF-16 bytes → well over 70% of 5 MB.
    s._fillerForTest = 'x'.repeat(3600000);
    Store.save(s);
    const banner = storageWarnBanner();
    ok('storage: warn banner appears when usage > 70%', banner.length > 0 && /Storage|स्टोरेज/.test(banner), '');
    // Cleanup so later tests aren't fat.
    const s2 = Store.load(); delete s2._fillerForTest; Store.save(s2);
  }

  // ---- 22. Pre-submit sanity check (Stage A #6) ----
  reset();
  {
    const sm = await Users.create({ name: 'PreSM', role: 'SM', pin: '5151' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'PreSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    // Clean state: nothing marked yet → no issues.
    {
      const a = currentAudit(Store.load());
      eq('presubmit: clean draft has no issues', presubmitIssues(a, Store.load()).length, 0);
    }
    // Attach a photo to cp1 with no verdict → triggers photo_no_verdict.
    addPhotoToCheckpoint(CHECKPOINTS[0].id, 'data:image/png;base64,test1');
    {
      const a = currentAudit(Store.load());
      const issues = presubmitIssues(a, Store.load());
      ok('presubmit: photo without verdict flagged', issues.some(i => i.code === 'photo_no_verdict'), JSON.stringify(issues));
    }
    // Mark it as Pass — photo issue clears.
    markCheckpoint(CHECKPOINTS[0].id, 'P');
    {
      const a = currentAudit(Store.load());
      ok('presubmit: photo issue clears once verdict set', !presubmitIssues(a, Store.load()).some(i => i.code === 'photo_no_verdict'), '');
    }
  }

  // 22b. Weekly with no daily audits → weekly_missing_days fires for 7.
  reset();
  {
    const gm = await Users.create({ name: 'PreGM', role: 'GM', pin: '6161' });
    AuthSession.login(gm.id);
    const wk = currentIsoWeekYear();
    startWeeklyAudit({ weekNumber: wk.week, year: wk.year, gmId: gm.id, gmName: 'PreGM', templateId: 'tpl_weekly' });
    const a = currentAudit(Store.load());
    const issues = presubmitIssues(a, Store.load());
    const wMiss = issues.find(i => i.code === 'weekly_missing_days');
    ok('presubmit: weekly with no daily audits flagged', !!wMiss && /7 day/.test(wMiss.text), JSON.stringify(issues));
  }

  // 22c. Per-CRO mode with one CRO unstarted → percro_missing fires.
  reset();
  {
    const tpl = Templates.create({ name: 'pre-percro', frequency: 'daily', cro_mode: 'per_cro' });
    tpl.checkpoints = [{ id: 'X.1', section_id: tpl.sections[0].id, text: 'x', weight: 1 }];
    Templates.save(tpl);
    {
      const s = Store.load();
      s.cros = [{ id: 'cP', name: 'Pri', counter: 'Titan' }, { id: 'cQ', name: 'Qadir', counter: 'Helios' }];
      Store.save(s);
    }
    startNewAudit({ date: today(), auditorName: 'Owner', auditorId: null, croIds: ['cP', 'cQ'], templateId: tpl.id });
    markCheckpoint('X.1', 'P'); // only cP scored
    {
      const a = currentAudit(Store.load());
      const issues = presubmitIssues(a, Store.load());
      ok('presubmit: per-cro missing CRO flagged', issues.some(i => i.code === 'percro_missing'), JSON.stringify(issues));
    }
  }

  // ---- 23. Resume-draft card on first session entry (Stage A #8) ----
  reset();
  {
    sessionStorage.removeItem('saagar_draft_card_seen');
    const sm = await Users.create({ name: 'ResSM', role: 'SM', pin: '4040' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'ResSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    markCheckpoint(CHECKPOINTS[0].id, 'P');
    markCheckpoint(CHECKPOINTS[1].id, 'P');
    const html1 = renderAuditTab(Store.load(), AuthSession.current());
    ok('resume: card shows on first session entry', /Audit in progress/.test(html1), '');
    ok('resume: card shows CP n of total', /CP 2 of/.test(html1), '');
    const html2 = renderAuditTab(Store.load(), AuthSession.current());
    ok('resume: second call drops into in-progress (no card)', !/Audit in progress/.test(html2), '');
  }

  // 23b. SKIP button label shows pending count once non-zero.
  reset();
  {
    const sm = await Users.create({ name: 'SkSM', role: 'SM', pin: '5252' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'SkSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    // Initially 0 skipped.
    sessionStorage.setItem('saagar_draft_card_seen', '1'); // bypass resume card
    const a0 = currentAudit(Store.load());
    const html0 = renderInProgressAudit(a0);
    ok('skip: button shows base label at 0 skips', /Skip — come back later/.test(html0), '');
    // SKIP one checkpoint.
    markCheckpoint(CHECKPOINTS[0].id, 'SKIP');
    const a1 = currentAudit(Store.load());
    const html1 = renderInProgressAudit(a1);
    ok('skip: button shows "(1 pending)" once a CP is skipped', /Skip \(1 pending\)/.test(html1), '');
  }

  // ---- 24. Escalation dismiss-with-reason + shadow-log (Stage A #4) ----
  reset();
  {
    // Build an escalation directly (bypass the audit flow for speed).
    const st = Store.load();
    st.escalations = [{
      id: 'esc-test1', audit_id: 'aud-x', trigger_number: 1,
      trigger_label: 'Daily Critical band', severity: 'critical',
      recipient_role: 'GM', message: 'test', raised_at: new Date().toISOString(),
      sent_at: null, sent_via: null, sent_by: null,
    }];
    Store.save(st);

    Escalations.dismiss('esc-test1', 'user1', 'False alarm (audit verdict wrong)');
    const e = Escalations.byId(Store.load(), 'esc-test1');
    eq('dismiss: sent_via set to dismissed', e.sent_via, 'dismissed');
    eq('dismiss: dismiss_reason stored', e.dismiss_reason, 'False alarm (audit verdict wrong)');
    eq('dismiss: sent_by stored', e.sent_by, 'user1');
    ok('dismiss: sent_at stamped', !!e.sent_at, '');
  }

  // 24b. Shadow-log fires when saveDrafts is called with a duplicate trigger.
  reset();
  {
    const audit = { id: 'aud-rfire', date: today(), template_id: 'tpl_daily' };
    const draft = {
      trigger_number: 1, trigger_label: 'Daily Critical band', severity: 'critical',
      recipient_role: 'GM', message: 'x',
    };
    // First call → 1 new escalation.
    const a = Escalations.saveDrafts([draft], audit);
    eq('rfire: first saveDrafts adds 1', a.length, 1);
    // Second call with the same (audit, trigger) — should suppress (and shadow-log).
    let logged = false;
    const orig = console.log;
    console.log = (...args) => { if ((args[0] || '').includes('[esc-rfire-shadow]')) logged = true; };
    const b = Escalations.saveDrafts([draft], audit);
    console.log = orig;
    eq('rfire: duplicate saveDrafts adds 0', b.length, 0);
    ok('rfire: shadow-log fires on duplicate', logged, '');
    eq('rfire: state still has only 1 escalation', Store.load().escalations.length, 1);
  }

  // ---- 25. Home tab (Stage A #1) ----
  reset();
  {
    const owner = await Users.create({ name: 'HOwner', role: 'OWNER', pin: '8181' });
    const gm = await Users.create({ name: 'HGM', role: 'GM', pin: '8282', phone: '9876520000' });
    const sm = await Users.create({ name: 'HSM', role: 'SM', pin: '8383' });

    // SM with NO audit done yet → home should suggest "Run today's daily audit".
    AuthSession.login(sm.id);
    {
      const html = renderHomeTab(Store.load(), AuthSession.current());
      ok('home(SM): suggests running daily audit', /Run today's daily audit/.test(html), '');
      ok('home(SM): no verify card', !/waiting for verification/.test(html), '');
    }

    // SM submits an audit → home shows "Today's daily audit — done" green card.
    startNewAudit({ date: today(), auditorName: 'HSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
    submitAudit();
    {
      const html = renderHomeTab(Store.load(), AuthSession.current());
      ok('home(SM): shows today-done card after submit', /Today's daily audit — done/.test(html), '');
    }

    // GM logs in → sees verify card (1 unverified submitted audit).
    AuthSession.login(gm.id);
    {
      const html = renderHomeTab(Store.load(), AuthSession.current());
      ok('home(GM): shows verify card', /Audits waiting for verification/.test(html), '');
      ok('home(GM): verify intro has the count "1"', /1 submitted audit/.test(html), '');
    }

    // Owner logs in → sees verify card + last-backup line.
    AuthSession.login(owner.id);
    {
      const html = renderHomeTab(Store.load(), AuthSession.current());
      ok('home(OWNER): shows verify card', /Audits waiting for verification/.test(html), '');
      ok('home(OWNER): shows backup line', /No backups yet|Last backup/.test(html), '');
    }
  }

  // 25b. homeAttentionCount sums correctly.
  reset();
  {
    const gm = await Users.create({ name: 'CntGM', role: 'GM', pin: '1313' });
    AuthSession.login(gm.id);
    // Build state: 2 unverified submitted audits + 1 unsent escalation.
    const st = Store.load();
    st.audits = [
      { id: 'a1', status: 'submitted', auditor_id: 'someone-else', date: today(), template_id: 'tpl_daily', score: { pct: 80, band: 'poor' }, results: {} },
      { id: 'a2', status: 'submitted', auditor_id: 'someone-else', date: today(), template_id: 'tpl_daily', score: { pct: 75, band: 'critical' }, results: {} },
    ];
    st.escalations = [{ id: 'e1', sent_at: null }];
    Store.save(st);
    const att = homeAttention(Store.load(), AuthSession.current());
    eq('home(GM): verify queue counts 2', att.verifyQueue.length, 2);
    eq('home(GM): escalations counts 1', att.escalations.length, 1);
    // Total attention count ≥ 3.
    ok('home(GM): attention count ≥ 3', homeAttentionCount(att) >= 3, '' + homeAttentionCount(att));
  }

  // 25c. last_tab persistence — switchTab writes it.
  reset();
  {
    const st0 = Store.load();
    ok('last_tab: starts undefined', st0.last_tab == null, '' + st0.last_tab);
    switchTab('history');
    eq('last_tab: persists on switch', Store.load().last_tab, 'history');
    switchTab('caps');
    eq('last_tab: updates on next switch', Store.load().last_tab, 'caps');
  }

  // ---- 26. Batch verify (Stage A #5) ----
  reset();
  {
    const gm = await Users.create({ name: 'BvGM', role: 'GM', pin: '7171' });
    const sm = await Users.create({ name: 'BvSM', role: 'SM', pin: '7272' });
    AuthSession.login(sm.id);
    // Submit two daily audits as the SM.
    startNewAudit({ date: today(), auditorName: 'BvSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
    const a1 = submitAudit();
    startNewAudit({ date: today(), auditorName: 'BvSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
    const a2 = submitAudit();
    AuthSession.login(gm.id);
    const items = unverifiedAuditsForUser(Store.load(), AuthSession.current());
    eq('batchverify: 2 audits queued for GM', items.length, 2);
    // GM is the auditor → exclude own audits (regression check).
    AuthSession.login(gm.id);
    startWeeklyAudit({ weekNumber: currentIsoWeekYear().week, year: currentIsoWeekYear().year, gmId: gm.id, gmName: 'BvGM', templateId: 'tpl_weekly' });
    WEEKLY_CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
    submitAudit(); // weekly authored by GM
    const items2 = unverifiedAuditsForUser(Store.load(), AuthSession.current());
    eq('batchverify: GM own audit excluded', items2.length, 2);
    // Simulate batch-verify completion path: mark one verified.
    {
      const st = Store.load();
      const a = audit(items2[0].id, st);
      a.status = 'verified'; a.verifier_id = gm.id; a.verifier_name = gm.name; a.verified_at = new Date().toISOString();
      Store.save(st);
    }
    const items3 = unverifiedAuditsForUser(Store.load(), AuthSession.current());
    eq('batchverify: queue drops after verify', items3.length, 1);
    // Render the batch modal — it should open the modal-root with our markers.
    batchVerifyModal();
    const html = document.getElementById('modal-root').innerHTML;
    ok('batchverify: modal title shows count', /Verify 1 audit/.test(html), '');
    ok('batchverify: has per-row Verify button', /data-action="batch-verify-one"/.test(html), '');
    closeModal();
  }

  // ---- 27. Strict modals — backdrop tap is no-op on editable modals (Stage A #3) ----
  reset();
  {
    // Default state: strict modals ENABLED (no disable_strict_modals flag set).
    ok('strict: default state → strict modals ENABLED', !strictModalsDisabled(), '');

    // openStrictModal stamps the data-modal-strict attribute on the inner .modal.
    openStrictModal('<h3>Test strict</h3>');
    const html = document.getElementById('modal-root').innerHTML;
    ok('strict: openStrictModal stamps data-modal-strict', /data-modal-strict/.test(html), '');
    closeModal();

    // openModal without strict opt-in does NOT stamp the attribute.
    openModal('<h3>Test loose</h3>');
    const html2 = document.getElementById('modal-root').innerHTML;
    ok('strict: plain openModal stays loose', !/data-modal-strict/.test(html2), '');
    closeModal();

    // The Settings toggle path: setting disable_strict_modals=true → helper reports disabled.
    const st = Store.load();
    st.disable_strict_modals = true;
    Store.save(st);
    ok('strict: Settings toggle disables', strictModalsDisabled(), '');
    const st2 = Store.load();
    st2.disable_strict_modals = false;
    Store.save(st2);
    ok('strict: re-enabling clears the flag', !strictModalsDisabled(), '');
  }

  // 27b. Real editable modals (failModal, naModal, verify, presubmit, dismiss,
  //      changePin) all open with the strict attribute.
  reset();
  {
    const sm = await Users.create({ name: 'StrSM', role: 'SM', pin: '9090' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'StrSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });

    const cp = CHECKPOINTS[0];
    failModal(cp, []);
    ok('strict: failModal is strict', /data-modal-strict/.test(document.getElementById('modal-root').innerHTML), '');
    closeModal();

    naModal(cp);
    ok('strict: naModal is strict', /data-modal-strict/.test(document.getElementById('modal-root').innerHTML), '');
    closeModal();

    changePinModal();
    ok('strict: changePinModal is strict', /data-modal-strict/.test(document.getElementById('modal-root').innerHTML), '');
    closeModal();
  }

  // ---- 28. Config constants (Stage B #12b) ----
  {
    ok('config: CONFIG object exists', typeof CONFIG === 'object' && CONFIG !== null, '');
    // Band thresholds match the historical 95/90/85/80 boundaries.
    eq('config: band excellent = 95', CONFIG.bands.excellent, 95);
    eq('config: band poor = 80', CONFIG.bands.poor, 80);
    // bandFor is now driven by CONFIG — moving the threshold moves the band.
    eq('config: bandFor honours CONFIG.bands.excellent', bandFor(CONFIG.bands.excellent), 'excellent');
    eq('config: bandFor just below excellent → good', bandFor(CONFIG.bands.excellent - 0.1), 'good');
    eq('config: bandFor below poor → critical', bandFor(CONFIG.bands.poor - 0.1), 'critical');
    // Targets.
    eq('config: weekly target 92', CONFIG.targets.weekly, 92);
    eq('config: daily target 90', CONFIG.targets.daily, 90);
    // Storage limit sane (5 MB).
    eq('config: storage limit 5MB', CONFIG.storage.limitBytes, 5 * 1024 * 1024);
    ok('config: storage warn pct between 1 and 99', CONFIG.storage.warnPct > 0 && CONFIG.storage.warnPct < 100, '');
    // Auth work factor preserved.
    eq('config: pbkdf2 iterations 100000', CONFIG.auth.pbkdf2Iterations, 100000);
    // storageHealth uses CONFIG.storage.limitBytes for its denominator.
    eq('config: storageHealth limit matches CONFIG', storageHealth().limit, CONFIG.storage.limitBytes);
  }

  // ---- 29. Per-CRO escape hatch (Stage B #7) ----
  reset();
  {
    const tpl = Templates.create({ name: 'hatch-grooming', frequency: 'daily', cro_mode: 'per_cro' });
    tpl.checkpoints = [
      { id: 'H.1', section_id: tpl.sections[0].id, text: 'h one', weight: 1 },
      { id: 'H.2', section_id: tpl.sections[0].id, text: 'h two', weight: 1 },
    ];
    Templates.save(tpl);
    { const s = Store.load(); s.cros = [{ id: 'cH1', name: 'Hari', counter: 'Titan' }, { id: 'cH2', name: 'Hema', counter: 'Helios' }]; Store.save(s); }
    startNewAudit({ date: today(), auditorName: 'Owner', auditorId: null, croIds: ['cH1', 'cH2'], templateId: tpl.id });

    // CRO 1 (Hari): both PASS.
    markCheckpoint('H.1', 'P'); markCheckpoint('H.2', 'P');
    // Advance to CRO 2 (Hema): both PASS.
    { const s = Store.load(); currentAudit(s).current_cro_index = 1; Store.save(s); }
    markCheckpoint('H.1', 'P'); markCheckpoint('H.2', 'P');

    // Simulate "jump back to CRO 1" via the dropdown handler logic.
    { const s = Store.load(); const au = currentAudit(s); window._croReviewReturnTo = au.current_cro_index; au.current_cro_index = 0; Store.save(s); window._croReviewMode = true; window._recheckCpId = null; }

    // The in-progress render now shows CRO 1's editable checklist.
    {
      const html = renderInProgressAudit(currentAudit(Store.load()));
      ok('hatch: review mode renders CRO checklist', /data-action="recheck-cp"/.test(html), '');
      ok('hatch: checklist names the CRO being edited', /Hari/.test(html), '');
    }

    // Re-check H.1 for CRO 1 and change PASS → activeCpForAction targets it.
    window._recheckCpId = 'H.1';
    {
      const au = currentAudit(Store.load());
      eq('hatch: activeCpForAction returns the rechecked cp', activeCpForAction(au).id, 'H.1');
    }
    // Mark it FAIL (writes to CRO 1's bucket since current_cro_index=0).
    markCheckpoint('H.1', 'F', { finding: 'changed on review' });
    window._recheckCpId = null;
    {
      const au = currentAudit(Store.load());
      eq('hatch: CRO1 H.1 now F', au.cro_results['cH1']['H.1'].result, 'F');
      eq('hatch: CRO2 H.1 untouched (still P)', au.cro_results['cH2']['H.1'].result, 'P');
    }

    // "Done" restores the index the auditor jumped from (CRO 2 = index 1).
    {
      const s = Store.load(); const au = currentAudit(s);
      au.current_cro_index = window._croReviewReturnTo; Store.save(s);
      window._croReviewMode = false; window._croReviewReturnTo = null;
      eq('hatch: returnTo restores index 1', currentAudit(Store.load()).current_cro_index, 1);
    }

    // The edited verdict flows into the live per-CRO score (no recompute needed).
    {
      const au = currentAudit(Store.load());
      const sp = scorePerCro(au, checkpointsFor(au));
      eq('hatch: CRO1 score reflects the FAIL (1/2 = 50%)', sp.byCro['cH1'].pct, 50);
      eq('hatch: CRO2 score still 100%', sp.byCro['cH2'].pct, 100);
    }
  }

  // ---- 30. UiState reset on logout (Stage B #11) ----
  reset();
  {
    const u = await Users.create({ name: 'UiUser', role: 'GM', pin: '1919' });
    AuthSession.login(u.id);
    // Dirty up every transient view-state holder.
    HistoryView.mode = 'trends';
    StartState.templateId = 'tpl_weekly';
    RefState.sub = 'glossary';
    RefState.glossaryFilter = 'cash';
    Builder.editingId = 'tpl_daily';
    window._capsFilter = 'closed';
    window._loginUserId = u.id;
    window._batchVerifyActive = true;
    window._croReviewMode = true;
    window._recheckCpId = 'X.1';
    window._croReviewReturnTo = 2;
    sessionStorage.setItem('saagar_draft_card_seen', '1');

    AuthSession.logout();

    eq('uistate: history mode reset', HistoryView.mode, 'list');
    eq('uistate: start template cleared', StartState.templateId, null);
    eq('uistate: ref sub reset', RefState.sub, 'bands');
    eq('uistate: glossary filter cleared', RefState.glossaryFilter, '');
    eq('uistate: builder editing cleared', Builder.editingId, null);
    eq('uistate: caps filter cleared', window._capsFilter, null);
    eq('uistate: login user cleared', window._loginUserId, null);
    eq('uistate: batch-verify flag cleared', window._batchVerifyActive, false);
    eq('uistate: cro review mode cleared', window._croReviewMode, false);
    eq('uistate: recheck cp cleared', window._recheckCpId, null);
    eq('uistate: cro returnTo cleared', window._croReviewReturnTo, null);
    eq('uistate: draft-card session flag cleared', sessionStorage.getItem('saagar_draft_card_seen'), null);
    eq('uistate: PIN buffer cleared', PinBuf.value, '');
  }

  // ---- 31. Characterization fixtures (Stage B #10 guard) ----
  // These pin EXACT outputs of submitAudit / escalation eval / CAP creation so
  // that adding schema versioning + migrations to Store.load can't silently
  // change behaviour. Captured against pre-migration code; must stay identical.
  reset();
  {
    const sm = await Users.create({ name: 'CharSM', role: 'SM', pin: '2727' });
    const gm = await Users.create({ name: 'CharGM', role: 'GM', pin: '2828', phone: '9876530000' });
    AuthSession.login(sm.id);
    startNewAudit({ date: '2026-03-10', auditorName: 'CharSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    // Deterministic pattern: first 10 FAIL (with findings), rest PASS.
    CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 10 ? 'F' : 'P', i < 10 ? { finding: 'char fail ' + i } : {}));
    const res = submitAudit();
    // 58/68 pass = 85.3% → fair band.
    eq('char: score pct', res.audit.score.pct, Math.round((58 / 68) * 1000) / 10);
    eq('char: score band', res.audit.score.band, 'fair');
    eq('char: pass count', res.audit.score.p, 58);
    eq('char: fail count', res.audit.score.f, 10);
    eq('char: 10 CAPs created', res.capsCreated, 10);
    eq('char: caps in store', Store.load().caps.length, 10);
    // CAP id format is deterministic for a given date.
    const firstCap = Store.load().caps[0];
    ok('char: CAP id format CAP-2026-W##-01', /^CAP-2026-W\d\d-\d\d$/.test(firstCap.id), firstCap.id);
    eq('char: CAP status open', firstCap.status, 'open');
  }

  // ---- 32. Schema versioning + migrations + defensive lookups (Stage B #10) ----
  reset();
  {
    // Fresh empty store carries the current schema version.
    eq('schema: empty() stamps current version', Store.empty().schema_version, SCHEMA_VERSION);
    eq('schema: load stamps version', Store.load().schema_version, SCHEMA_VERSION);

    // Simulate OLD data with NO schema_version + a malformed audit missing
    // `results` and a cap missing `status`. Write it raw, then load.
    const rawOld = {
      audits: [{ id: 'old1', date: '2025-01-01', status: 'submitted', template_id: 'tpl_daily', score: { pct: 90, band: 'good' } }], // no results{}
      cros: [], users: [], caps: [{ id: 'CAP-x', audit_id: 'old1' }], escalations: [], templates: [],
      // deliberately NO schema_version
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(rawOld));
    const migrated = Store.load();
    eq('schema: old data migrated to current version', migrated.schema_version, SCHEMA_VERSION);
    ok('schema: defensive normalize backfills audit.results', typeof migrated.audits[0].results === 'object' && migrated.audits[0].results !== null, '');
    eq('schema: defensive normalize backfills cap.status', migrated.caps[0].status, 'open');

    // migrateState early-returns unchanged for already-current data.
    const cur = Store.empty();
    cur.audits = [{ id: 'keep', results: { 'X': { result: 'P' } } }];
    const out = migrateState(cur, SCHEMA_VERSION);
    ok('schema: current data passes through untouched', out.audits[0].results['X'].result === 'P', '');
  }

  // 32b. Defensive lookups (Audit.byId / Cro.byId) return null + warn once.
  reset();
  {
    const st = Store.load();
    st.audits = [{ id: 'a-real' }];
    st.cros = [{ id: 'c-real', name: 'Real CRO', counter: 'Titan' }];
    Store.save(st);
    eq('lookup: Audit.byId hit', Audit.byId(Store.load(), 'a-real').id, 'a-real');
    eq('lookup: Audit.byId miss → null', Audit.byId(Store.load(), 'nope'), null);
    eq('lookup: Cro.byId hit', Cro.byId(Store.load(), 'c-real').name, 'Real CRO');
    eq('lookup: Cro.byId miss → null', Cro.byId(Store.load(), 'nope'), null);
    eq('lookup: Cro.byId null id → null (no warn)', Cro.byId(Store.load(), null), null);
  }

  // ---- 33. Home + batch-verify render Marathi (v0.3.1 follow-up) ----
  reset();
  {
    const sm = await Users.create({ name: 'MrSM', role: 'SM', pin: '3636' });
    AuthSession.login(sm.id);
    I18n.current = 'mr';
    const dev = /[ऀ-ॿ]/;
    const home = renderHomeTab(Store.load(), AuthSession.current());
    ok('mr-home: SM home renders Devanagari', dev.test(home), '');
    ok('mr-home: run-daily card translated (not English)', !/Run today's daily audit/.test(home), '');
    // Batch-verify modal title in Marathi for a GM with a queue.
    I18n.current = 'en';
    const gm = await Users.create({ name: 'MrGM', role: 'GM', pin: '3737' });
    AuthSession.login(sm.id);
    startNewAudit({ date: today(), auditorName: 'MrSM', auditorId: sm.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach(cp => markCheckpoint(cp.id, 'P'));
    submitAudit();
    AuthSession.login(gm.id);
    I18n.current = 'mr';
    batchVerifyModal();
    const modal = document.getElementById('modal-root').innerHTML;
    ok('mr-home: batch-verify modal renders Devanagari', dev.test(modal), '');
    closeModal();
    I18n.current = 'en';
  }

  // ---- 34. v1→v2 snapshot dedup migration ----
  reset();
  {
    // Two old (v1) audits with FULL per-audit template_snapshot copies of the
    // SAME template. After migration they should share one dictionary entry.
    const fullSnap = {
      name: 'Daily Audit', name_mr: 'दैनिक', frequency: 'daily', cro_mode: 'store',
      sections: [{ id: 's1', name: 'S1' }],
      checkpoints: [{ id: 'C1', section_id: 's1', text: 'one' }, { id: 'C2', section_id: 's1', text: 'two' }],
    };
    const rawV1 = {
      // no schema_version → treated as v0, runs through v1 then v2 migrations
      audits: [
        { id: 'old-a', date: '2026-01-01', status: 'verified', template_id: 'tpl_daily', audit_type: 'daily', results: { C1: { result: 'P' }, C2: { result: 'F' } }, score: { pct: 50, band: 'critical' }, template_snapshot: JSON.parse(JSON.stringify(fullSnap)) },
        { id: 'old-b', date: '2026-01-02', status: 'verified', template_id: 'tpl_daily', audit_type: 'daily', results: { C1: { result: 'P' }, C2: { result: 'P' } }, score: { pct: 100, band: 'excellent' }, template_snapshot: JSON.parse(JSON.stringify(fullSnap)) },
      ],
      cros: [], users: [], caps: [], escalations: [], templates: [],
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(rawV1));
    const m = Store.load();
    eq('dedup: migrated to v2', m.schema_version, 2);
    ok('dedup: per-audit template_snapshot removed', m.audits[0].template_snapshot === undefined, '');
    ok('dedup: audits got snapshot_ref', !!m.audits[0].snapshot_ref && !!m.audits[1].snapshot_ref, '');
    eq('dedup: identical snapshots share one ref', m.audits[0].snapshot_ref, m.audits[1].snapshot_ref);
    eq('dedup: dictionary has exactly one entry', Object.keys(m.template_snapshots).length, 1);
    // checkpointsFor still resolves the frozen checklist via the shared ref.
    eq('dedup: checkpointsFor resolves via ref', checkpointsFor(m.audits[0]).length, 2);
    // The resolved snapshot carries the frozen wording (immunity is exercised
    // end-to-end by section 7 against the live template).
    eq('dedup: frozen text preserved', checkpointsFor(m.audits[0])[0].text, 'one');
  }

  // ---- 35. Compression safety-valve (Phase 1) ----
  // LZString round-trips arbitrary app state byte-exact.
  reset();
  {
    ok('lz: LZString present', typeof LZString === 'object' && typeof LZString.compressToUTF16 === 'function', '');
    const sample = JSON.stringify({ a: 1, msg: 'मराठी + English · ₹800 "quoted" \n newline', arr: [1, 2, { x: null }], emoji: '✓🧪' });
    const round = LZString.decompressFromUTF16(LZString.compressToUTF16(sample));
    eq('lz: round-trip byte-exact', round, sample);
    // A realistic store round-trips and reparses equal.
    const owner = await Users.create({ name: 'LZOwner', role: 'OWNER', pin: '1212' });
    AuthSession.login(owner.id);
    startNewAudit({ date: today(), auditorName: 'LZOwner', auditorId: owner.id, croIds: [], templateId: 'tpl_daily' });
    CHECKPOINTS.forEach((cp, i) => markCheckpoint(cp.id, i < 4 ? 'F' : 'P', i < 4 ? { finding: 'lz fail ' + i } : {}));
    submitAudit();
    const st = Store.load();
    const j = JSON.stringify(st);
    eq('lz: store round-trips exact', LZString.decompressFromUTF16(LZString.compressToUTF16(j)), j);
  }

  // Normal save is PLAIN (no LZ prefix) — fast hot path.
  reset();
  {
    const u = await Users.create({ name: 'PlainU', role: 'SM', pin: '2323' });
    AuthSession.login(u.id);
    Store._forceCompress = false;
    const raw = localStorage.getItem(STORE_KEY);
    ok('lz: normal save stays plain JSON', raw && raw[0] === '{', raw ? raw.slice(0, 3) : 'null');
    ok('lz: plain payload has no LZ prefix', !(raw && raw.slice(0, LZ_PREFIX.length) === LZ_PREFIX), '');
  }

  // Quota hit → compressed rescue → load reads it back identically.
  reset();
  {
    const u = await Users.create({ name: 'QuotaU', role: 'OWNER', pin: '3434' });
    AuthSession.login(u.id);
    const expected = Store.load();
    const expectedUsers = expected.users.length;
    // Monkeypatch localStorage.setItem to throw QuotaExceeded ONCE for a plain
    // (non-prefixed) write, simulating a full quota; compressed write succeeds.
    const realSet = localStorage.setItem.bind(localStorage);
    let threw = false;
    localStorage.setItem = function (k, v) {
      if (k === STORE_KEY && v[0] === '{' && !threw) { threw = true; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return realSet(k, v);
    };
    Store._forceCompress = false;
    Store.save(expected);                       // plain throws → compressed rescue
    localStorage.setItem = realSet;             // restore
    ok('lz: quota triggered compressed write', threw && Store._forceCompress, '');
    const stored = localStorage.getItem(STORE_KEY);
    ok('lz: stored payload is compressed (LZ prefix)', stored && stored.slice(0, LZ_PREFIX.length) === LZ_PREFIX, stored ? stored.slice(0, 6) : 'null');
    // load() transparently decompresses + migrates.
    const back = Store.load();
    eq('lz: compressed store loads back (users)', back.users.length, expectedUsers);
    eq('lz: compressed store loads back (schema)', back.schema_version, SCHEMA_VERSION);
    Store._forceCompress = false;
  }

  // Legacy plain payload (no prefix) still loads.
  reset();
  {
    const plain = JSON.stringify({ schema_version: 2, audits: [], cros: [], users: [], caps: [], escalations: [], templates: [], template_snapshots: {} });
    localStorage.setItem(STORE_KEY, plain);
    const s = Store.load();
    ok('lz: legacy plain JSON still loads', s && Array.isArray(s.audits), '');
  }

  // ---- 36. Photos → IndexedDB (Storage Phase 2) ----
  reset();
  {
    // PhotoStore put/get (in-memory fallback in Node).
    await PhotoStore.put('ph_test1', 'data:image/png;base64,AAAA');
    eq('photo: PhotoStore round-trip', await PhotoStore.get('ph_test1'), 'data:image/png;base64,AAAA');
    eq('photo: PhotoStore miss → null', await PhotoStore.get('ph_nope'), null);
    // photoImg emits a hydration placeholder, not an inline src.
    const img = photoImg('ph_x', 'alt');
    ok('photo: photoImg uses data-photo not src', /data-photo="ph_x"/.test(img) && !/\bsrc=/.test(img), img);
    ok('photo: isPhotoId / isDataUrl', isPhotoId('ph_a') && !isPhotoId('data:x') && isDataUrl('data:x') && !isDataUrl('ph_a'), '');
  }

  // 36b. Boot migration moves inline data-URL photos → IndexedDB IDs.
  reset();
  {
    const st = Store.load();
    st.audits = [{
      id: 'pa1', date: today(), status: 'submitted', template_id: 'tpl_daily', audit_type: 'daily',
      score: { pct: 90, band: 'good' },
      results: { 'C1': { result: 'F', finding: 'x', photos: ['data:image/jpeg;base64,PHOTODATA'] } },
    }];
    st.caps = [{ id: 'CAP-1', status: 'open', photos: ['data:image/jpeg;base64,CAPPHOTO'] }];
    Store.save(st);
    const moved = await migratePhotosToIDB();
    eq('photo-migrate: moved 2 inline photos', moved, 2);
    const after = Store.load();
    const auditPhoto = after.audits[0].results['C1'].photos[0];
    ok('photo-migrate: audit photo became an ID', isPhotoId(auditPhoto), auditPhoto);
    eq('photo-migrate: ID resolves to original data URL', await PhotoStore.get(auditPhoto), 'data:image/jpeg;base64,PHOTODATA');
    ok('photo-migrate: CAP photo became an ID', isPhotoId(after.caps[0].photos[0]), '');
    // Second run is a no-op (all already IDs).
    eq('photo-migrate: idempotent (0 on re-run)', await migratePhotosToIDB(), 0);
  }

  // 36c. Backup round-trip — COMPLETE state (templates, snapshots, escalations)
  // + photos rehydrated inline; restore brings it all back. (Fixes the old
  // shell.js restore that silently dropped templates/snapshots/escalations.)
  reset();
  {
    await PhotoStore.put('ph_b1', 'data:image/jpeg;base64,BACKUPPHOTO');
    const st = Store.load();
    st.audits = [{ id: 'ba1', date: today(), status: 'verified', template_id: 'tpl_daily', audit_type: 'daily', snapshot_ref: 'tpl_daily@x', score: { pct: 88, band: 'fair' }, results: { 'C1': { result: 'F', photos: ['ph_b1'] } } }];
    st.template_snapshots = { 'tpl_daily@x': { name: 'Daily', frequency: 'daily', cro_mode: 'store', sections: [], checkpoints: [{ id: 'C1', text: 'cp', section_id: 's' }] } };
    st.escalations = [{ id: 'e1', trigger_number: 1, sent_at: null, audit_id: 'ba1' }];
    st.templates = Templates.all(st); // built-ins + any
    st.current_user_id = 'someone';
    Store.save(st);

    const payload = await SaagarAudit.buildBackupPayload();
    ok('backup: includes templates', Array.isArray(payload.templates) && payload.templates.length >= 2, '');
    ok('backup: includes template_snapshots', !!payload.template_snapshots && !!payload.template_snapshots['tpl_daily@x'], '');
    ok('backup: includes escalations', Array.isArray(payload.escalations) && payload.escalations.length === 1, '');
    ok('backup: schema_version present', payload.schema_version === SCHEMA_VERSION, '');
    eq('backup: photo rehydrated inline', payload.audits[0].results['C1'].photos[0], 'data:image/jpeg;base64,BACKUPPHOTO');
    ok('backup: _format stamped', payload._format === 'saagar_audit_v1', '');

    // Now wipe everything and restore from the payload.
    localStorage.clear(); PhotoStore._mem = {}; Templates.ensureSeeded();
    const counts = await SaagarAudit.applyBackupPayload(JSON.parse(JSON.stringify(payload)));
    const restored = Store.load();
    eq('restore: audits count', counts.audits, 1);
    ok('restore: template_snapshots came back', !!restored.template_snapshots['tpl_daily@x'], '');
    eq('restore: escalations came back', restored.escalations.length, 1);
    ok('restore: photo moved back into IndexedDB as ID', isPhotoId(restored.audits[0].results['C1'].photos[0]), '');
    eq('restore: restored photo resolves', await PhotoStore.get(restored.audits[0].results['C1'].photos[0]), 'data:image/jpeg;base64,BACKUPPHOTO');
    eq('restore: session cleared (re-auth)', restored.current_user_id, null);
  }

  // ---- 36. Persistence abstraction — backend is swappable (SQLite Inc.1) ----
  reset();
  {
    // Default backend is localStorage.
    ok('persist: default backend is LocalStorageBackend', Persistence.backend === LocalStorageBackend, '');

    // Swap in a fake in-memory backend; Store.load/save must route through it
    // (this is exactly how the SQLite backend will plug in later).
    const realBackend = Persistence.backend;
    let _mem = null;
    const FakeBackend = {
      reads: 0, writes: 0,
      readPersisted() { this.reads++; return _mem ? JSON.parse(_mem) : null; },
      writePersisted(s) { this.writes++; _mem = JSON.stringify(s); },
    };
    Persistence.backend = FakeBackend;

    // Empty fake → Store.load returns a fresh empty state (with defaults+migrate).
    const fresh = Store.load();
    eq('persist: load via fake backend returns empty schema', fresh.schema_version, SCHEMA_VERSION);
    ok('persist: fake backend readPersisted was called', FakeBackend.reads > 0, '');

    // Save through the fake; it lands in the fake's memory, not localStorage.
    fresh.audits.push({ id: 'fake-a', date: today(), status: 'submitted', results: {}, score: { pct: 100, band: 'excellent' } });
    Store.save(fresh);
    ok('persist: fake backend writePersisted was called', FakeBackend.writes > 0, '');

    // Round-trip through the fake backend preserves data.
    const back = Store.load();
    eq('persist: round-trip via fake backend keeps the audit', back.audits.length, 1);
    eq('persist: round-trip audit id', back.audits[0].id, 'fake-a');

    // Defaults + migration still apply on top of a backend that returns a
    // version-less object (proves generic concerns stay in Store.load).
    _mem = JSON.stringify({ audits: [{ id: 'old', template_snapshot: { name: 'D', frequency: 'daily', cro_mode: 'store', sections: [], checkpoints: [{ id: 'c1', text: 'x' }] } }] });
    const migrated = Store.load();
    eq('persist: backend data still runs through migrateState (v2)', migrated.schema_version, SCHEMA_VERSION);
    ok('persist: snapshot deduped through backend', !!migrated.audits[0].snapshot_ref && migrated.audits[0].template_snapshot === undefined, '');

    // Restore the real backend so later tests are unaffected.
    Persistence.backend = realBackend;
  }

  // ---- 37. Persistence async interface (SQLite Inc.1 completion) ----
  reset();
  {
    ok('persist: isReady true after boot tail', Persistence.isReady() === true, '');
    // saveFlush is the durable-write entry point; on localStorage it returns a
    // resolved promise and writes synchronously (same as save).
    const sm = await Users.create({ name: 'FlushU', role: 'SM', pin: '9898' });
    AuthSession.login(sm.id);
    const st = Store.load();
    st.auditor_name = 'flush-test';
    const p = Store.saveFlush(st);
    ok('persist: saveFlush returns a thenable', p && typeof p.then === 'function', '');
    await p;
    eq('persist: saveFlush persisted synchronously', Store.load().auditor_name, 'flush-test');
    // flushNow + boot resolve without error on the localStorage backend.
    await Persistence.flushNow();
    await Persistence.boot();
    ok('persist: flushNow + boot resolve cleanly on localStorage', true, '');
    // Boot-safe load: even if _ready is flipped false, load() falls back to
    // localStorage and still works (no unhydrated-mirror read).
    Persistence._ready = false;
    const safe = Store.load();
    ok('persist: load() is boot-safe when not ready', safe.auditor_name === 'flush-test', '');
    Persistence._ready = true;
  }

  // ---- Result ----
  console.log('\n===== QA RESULTS =====');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exitCode = 1;
  } else {
    console.log('ALL GREEN ✅');
  }
})().catch(e => { console.error('HARNESS CRASH:', e && e.stack || e); process.exitCode = 2; });
