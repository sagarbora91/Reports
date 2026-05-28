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
  eq('submit froze snapshot', !!res.audit.template_snapshot, true);
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
  eq('monthly frozen snapshot', !!rm.audit.template_snapshot, true);
  eq('monthly no escalation (not daily)', rm.escalationsRaised, 0);

  // Backdated audit stores reason
  reset();
  const bo = await Users.create({ name: 'BSM', role: 'SM', pin: '1616' });
  AuthSession.login(bo.id);
  startNewAudit({ date: '2026-01-15', auditorName: 'BSM', auditorId: bo.id, croIds: [], templateId: 'tpl_daily', backdateReason: 'phone died' });
  eq('backdate reason stored', currentAudit(Store.load()).backdate_reason, 'phone died');

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
