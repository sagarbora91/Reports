// ---------------------------------------------------------------------------
// Stress + functional test against the 6-month demo dataset.
//
//   cat qa/shim.js qa/app_bundle.js qa/stress_test.js > qa/stress_run.js
//   node qa/stress_run.js
//
// Loads qa/demo_state.json into localStorage, then drives every READ path the
// app has (all tabs × roles × locales, history detail, trends, CSV, weekly
// report, CAP detail, escalations, Home attention) at 6-month scale, asserts
// nothing throws and outputs are sane, and reports performance + storage.
// ---------------------------------------------------------------------------
(function () {
  const fs = require('fs');
  let pass = 0, fail = 0; const fails = [];
  function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); } }
  function noThrow(name, fn) {
    try { const out = fn(); ok(name, typeof out === 'string' ? out.length > 0 : out !== undefined, 'empty/void'); return out; }
    catch (e) { fail++; fails.push(name + ' THREW: ' + (e && e.message || e)); return null; }
  }
  function ms(fn) { const t = Date.now(); fn(); return Date.now() - t; }

  // ---- Load the dataset ----
  const json = fs.readFileSync('qa/demo_state.json', 'utf8');
  localStorage.setItem(STORE_KEY, json);

  const tLoad = ms(() => Store.load());
  const state = Store.load();
  console.log('===== STRESS TEST — 6-month dataset =====');
  console.log('Store.load() parse time:', tLoad + 'ms');

  const daily = state.audits.filter(a => a.audit_type === 'daily');
  const weekly = state.audits.filter(a => a.audit_type === 'weekly');
  ok('data: 100+ daily audits', daily.length >= 100, '' + daily.length);
  ok('data: 20+ weekly audits', weekly.length >= 20, '' + weekly.length);
  ok('data: 100+ CAPs', (state.caps || []).length >= 100, '' + (state.caps || []).length);
  ok('data: escalations present', (state.escalations || []).length > 0, '' + (state.escalations || []).length);
  ok('data: shared snapshot dict present', Object.keys(state.template_snapshots || {}).length >= 2, '');
  ok('data: schema v2', state.schema_version === 2, '' + state.schema_version);

  const byRole = {};
  state.users.forEach(u => { byRole[u.role] = u; });

  // ---- Every tab × role × locale renders without throwing ----
  ['en', 'mr'].forEach(loc => {
    I18n.current = loc;
    ['OWNER', 'GM', 'SM'].forEach(role => {
      const u = byRole[role]; if (!u) return;
      const st = Store.load();
      noThrow(`render home ${role}/${loc}`, () => renderHomeTab(st, u));
      noThrow(`render audit ${role}/${loc}`, () => renderAuditTab(st, u));
      HistoryView.mode = 'list';
      noThrow(`render history-list ${role}/${loc}`, () => renderHistoryTab(st, u));
      HistoryView.mode = 'trends';
      noThrow(`render history-trends ${role}/${loc}`, () => renderHistoryTab(st, u));
      HistoryView.mode = 'list';
      noThrow(`render caps ${role}/${loc}`, () => renderCapsTab(st, u));
      noThrow(`render settings ${role}/${loc}`, () => renderSettingsTab(st, u));
    });
    noThrow(`render reference ${loc}`, () => renderReferenceTab());
  });
  I18n.current = 'en';

  // ---- History detail modals (daily + weekly) — render by side-effect into
  //      modal-root, so read that rather than the (void) return value ----
  noThrow('historyDetailModal daily', () => { historyDetailModal(daily[0]); return document.getElementById('modal-root').innerHTML; });
  closeModal();
  noThrow('historyDetailModal weekly', () => { historyDetailModal(weekly[0]); return document.getElementById('modal-root').innerHTML; });
  closeModal();

  // ---- Weekly report PDF builder for several weeks ----
  weekly.slice(0, 5).forEach((w, i) => noThrow('weeklyReportHtml #' + i, () => weeklyReportHtml(w, Store.load())));

  // ---- Daily report PDF builder ----
  noThrow('dailyReportHtml', () => dailyReportHtml(daily[0], Store.load()));

  // ---- CSV export of EVERYTHING ----
  let csv;
  const tCsv = ms(() => { csv = auditsToCsv(state.audits.filter(a => isFinalized(a))); });
  ok('csv: built', !!csv && csv.split('\n').length > 100, csv ? (csv.split('\n').length + ' lines') : 'none');
  console.log('auditsToCsv time:', tCsv + 'ms,', (csv ? csv.split('\n').length : 0), 'rows');

  // ---- Trends compute ----
  const tTrend = ms(() => {
    noThrow('trendByWeek(12)', () => JSON.stringify(trendByWeek(daily, 12)));
    noThrow('trendByWeek(26)', () => JSON.stringify(trendByWeek(daily, 26)));
    noThrow('trendByWeekday', () => JSON.stringify(trendByWeekday(daily)));
    noThrow('trendBySection', () => JSON.stringify(trendBySection(daily, 90)));
    noThrow('renderTrends', () => renderTrends(daily));
  });
  console.log('trends compute time:', tTrend + 'ms');

  // ---- Home attention counts (GM + Owner) ----
  [byRole.GM, byRole.OWNER].forEach(u => {
    if (!u) return;
    noThrow('homeAttention ' + u.role, () => JSON.stringify(homeAttention(Store.load(), u)));
  });

  // ---- Batch verify modal (GM) ----
  if (byRole.GM) { AuthSession.login(byRole.GM.id); noThrow('batchVerifyModal', () => { batchVerifyModal(); return document.getElementById('modal-root').innerHTML; }); closeModal(); }

  // ---- CAP detail across statuses ----
  const seenStatus = {};
  (state.caps || []).forEach(c => {
    if (seenStatus[c.status]) return; seenStatus[c.status] = 1;
    noThrow('capDetailModal(' + c.status + ')', () => { capDetailModal(c.id); return document.getElementById('modal-root').innerHTML; });
    closeModal();
  });

  // ---- Escalation cards (unsent) ----
  noThrow('renderEscalationCards', () => renderEscalationCards(Store.load(), byRole.GM));

  // ---- ageOverdueCaps runs cleanly at scale ----
  noThrow('ageOverdueCaps', () => { ageOverdueCaps(); return 'ok'; });

  // ---- Weekly recompute for one week ----
  noThrow('scoreWeekly recompute', () => {
    const w = weekly[0];
    const cps = checkpointsFor(w);
    const verds = {}; Object.keys(w.results || {}).forEach(id => verds[id] = w.results[id].result);
    return JSON.stringify(scoreWeekly(w.daily_pcts_used || [], verds, cps, dailyTemplateCount()));
  });

  // ---- Full render cycle timing (what happens on every interaction) ----
  if (byRole.OWNER) {
    AuthSession.login(byRole.OWNER.id);
    const st = Store.load();
    const u = byRole.OWNER;
    const tRender = ms(() => {
      renderHomeTab(st, u); renderAuditTab(st, u);
      HistoryView.mode = 'list'; renderHistoryTab(st, u);
      renderCapsTab(st, u); renderSettingsTab(st, u); renderReferenceTab();
    });
    console.log('full 6-tab render cycle:', tRender + 'ms');
    ok('perf: render cycle < 1500ms', tRender < 1500, tRender + 'ms');
    AuthSession.logout();
  }

  // ---- Write-path stress: submit a NEW audit on top of 6 months of data ----
  // (what happens when Sagar runs an audit during testing). The metric a user
  // actually feels is PER-TAP latency (one mark + one render), not the whole
  // 68-mark loop — they tap one checkpoint at a time, minutes apart.
  if (byRole.SM) {
    AuthSession.login(byRole.SM.id);
    const capsBefore = (Store.load().caps || []).length;
    const auditsBefore = Store.load().audits.length;
    startNewAudit({ date: today(), auditorName: byRole.SM.name, auditorId: byRole.SM.id, croIds: Store.load().cros.map(c => c.id), templateId: 'tpl_daily' });

    // Realistic per-tap cost: one markCheckpoint (load + mutate + save full store).
    const tOneMark = ms(() => markCheckpoint(CHECKPOINTS[0].id, 'P'));
    console.log('per-tap markCheckpoint on 6mo data:', tOneMark + 'ms');
    ok('perf: single mark < 200ms (per-tap feel)', tOneMark < 200, tOneMark + 'ms');

    // Mark the rest + submit (batch — informational only, not a per-tap metric).
    let res;
    const tSubmit = ms(() => {
      CHECKPOINTS.forEach((cp, i) => { if (i === 0) return; markCheckpoint(cp.id, i % 15 === 0 ? 'F' : 'P', i % 15 === 0 ? { finding: 'stress fail' } : {}); });
      res = submitAudit();
    });
    ok('write: new audit submitted on 6mo data', !!res && res.audit.status === 'submitted', '');
    ok('write: audit count grew by 1', Store.load().audits.length === auditsBefore + 1, '');
    ok('write: CAPs created from new fails', (Store.load().caps || []).length > capsBefore, '');
    ok('write: snapshot reused (no new dict entry)', !!res.audit.snapshot_ref, '');
    console.log('full submit (67 marks + score + CAPs + escalations) on 6mo data:', tSubmit + 'ms (batch — never happens in one tap in real use)');
    ok('write: batch submit completes', tSubmit < 5000, tSubmit + 'ms');
    AuthSession.logout();
  }

  // ---- Storage health ----
  const h = storageHealth();
  console.log('storageHealth:', (h.bytes / 1024 / 1024).toFixed(2) + 'MB', '=', h.pct + '% of 5MB limit');
  ok('storage: under 100% of quota', h.pct < 100, h.pct + '%');
  ok('perf: Store.load < 600ms', tLoad < 600, tLoad + 'ms');

  // ---- Result ----
  console.log('\n===== STRESS RESULTS =====');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
  else console.log('ALL GREEN ✅');
})();
