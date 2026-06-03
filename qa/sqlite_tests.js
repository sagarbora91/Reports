// ---------------------------------------------------------------------------
// SqliteBackend contract + data-safety tests, run against REAL SQLite (sql.js)
// in Node. Proves the backend round-trips, diffs, quarantines, and migrates
// correctly BEFORE it ever runs on a device.
//
//   cat qa/shim.js qa/app_bundle.js qa/sqlite_tests.js > qa/sqlite_run.js
//   node qa/sqlite_run.js
// ---------------------------------------------------------------------------
(async function () {
  const { makeSqlJsDriver } = require('./sql_js_driver.js');
  let pass = 0, fail = 0; const fails = [];
  function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); } }
  function eq(name, got, want) { ok(name, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
  function deepOk(name, a, b) { const r = sqliteDeepEqual(a, b); ok(name, r.ok, r.path); }

  const realBackend = Persistence.backend;
  function resetBackendSingleton() {
    Object.assign(SqliteBackend, {
      _driver: null, _mirrorJson: null, _lastSnapshot: null, _lastIndex: null,
      _queue: Promise.resolve(), _timer: null, _writeFailed: false, _suspectEmpty: false, _pendingJson: null,
    });
  }
  async function freshSqlite(bytes) {
    const driver = await makeSqlJsDriver(bytes);
    resetBackendSingleton();
    Persistence._migrating = false;
    await SqliteBackend.boot(driver);
    return driver;
  }
  // Build a deterministic, representative state (no PBKDF2 randomness).
  function sampleState() {
    const s = Store.empty();
    s.users = [{ id: 'u1', name: 'Owner', role: 'OWNER', pin_salt: 'salt1', pin_hash: 'hash1', is_active: true, phone: '919876500000' }];
    s.cros = [{ id: 'c1', name: 'Suresh', counter: 'Titan World', store_id: null }];
    s.templates = [factoryDailyTemplate(), factoryWeeklyTemplate()];
    const snap = { name: 'Daily Audit', name_mr: 'D', frequency: 'daily', cro_mode: 'store', sections: [{ id: 's1', name: 'S1' }], checkpoints: [{ id: 'cp1', section_id: 's1', text: 'one' }, { id: 'cp2', section_id: 's1', text: 'two' }] };
    s.template_snapshots = { 'tpl_daily@abc': snap };
    s.audits = [
      { id: 'a1', template_id: 'tpl_daily', audit_type: 'daily', date: '2026-03-01', status: 'verified', snapshot_ref: 'tpl_daily@abc', results: { cp1: { result: 'P', finding: '', photos: [] }, cp2: { result: 'F', finding: 'bad', photos: ['ph_xyz'] } }, score: { pct: 85.3, band: 'fair', p: 1, f: 1, na: 0, raw: 1, max: 2 }, store_id: null },
      { id: 'w1', template_id: 'tpl_weekly', audit_type: 'weekly', week_number: 9, year: 2026, date: '2026-03-01', status: 'verified', snapshot_ref: 'tpl_daily@abc', results: { O1: { result: 'P' } }, score: { pct: 90, band: 'good', p: 1, f: 0, na: 0, raw: 1, max: 1 }, daily_pcts_used: [85.3] },
    ];
    s.caps = [{ id: 'CAP-2026-W09-01', audit_id: 'a1', status: 'open', checkpoint_id: 'cp2', finding: 'bad', deadline: '2026-03-08', responsible_user_id: 'u1', store_id: null, action_steps: [] }];
    s.escalations = [{ id: 'esc-1', audit_id: 'a1', trigger_number: 1, severity: 'critical', message: 'x', raised_at: '2026-03-01T11:00:00Z', sent_at: null, store_id: null }];
    s.current_audit_id = null;
    s.current_user_id = 'u1';
    s.auditor_name = 'Owner';
    s.last_backup_at = '2026-03-01T20:00:00Z';
    s.last_tab = 'home';
    s.disable_strict_modals = false;
    s.some_future_scalar = { nested: 'survives' };   // catch-all proof
    return s;
  }

  // ---- 1. Round-trip parity: SQLite reload == localStorage ----
  {
    const S = sampleState();
    // localStorage reference
    localStorage.clear();
    Persistence.backend = LocalStorageBackend;
    Store.save(S);
    const ls = Store.load();
    // SQLite: write, flush, export bytes, reboot from bytes, read back
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    const bytes = driver.export();
    await freshSqlite(bytes);                 // reopen from the real on-disk image
    const sq = Store.load();
    deepOk('roundtrip: SQLite reload deep-equals localStorage', ls, sq);
    Persistence.backend = realBackend;
  }

  // ---- 2. Catch-all scalar survives a reload ----
  {
    const S = sampleState();
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    const bytes = driver.export();
    await freshSqlite(bytes);
    const back = Store.load();
    deepOk('catch-all: future scalar survives', back.some_future_scalar, { nested: 'survives' });
    eq('catch-all: last_tab survives', back.last_tab, 'home');
    eq('catch-all: disable_strict_modals survives', back.disable_strict_modals, false);
    // internal bookkeeping (migrated/row_count) must NOT leak onto state
    ok('catch-all: no row_count leak onto state', back.row_count === undefined, '' + back.row_count);
    ok('catch-all: no migrated leak onto state', back.migrated === undefined, '' + back.migrated);
    Persistence.backend = realBackend;
  }

  // ---- 3. deepEqual comparator is not self-blinding ----
  {
    ok('cmp: NaN flagged', !sqliteDeepEqual({ x: NaN }, { x: null }).ok, '');
    ok('cmp: undefined key flagged', !sqliteDeepEqual({ x: undefined, y: 1 }, { y: 1 }).ok, '');
    ok('cmp: array order matters', !sqliteDeepEqual([1, 2], [2, 1]).ok, '');
    ok('cmp: key order does NOT matter', sqliteDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }).ok, '');
    ok('cmp: float preserved equal', sqliteDeepEqual({ p: 85.3 }, { p: 85.3 }).ok, '');
    ok('cmp: float diff flagged', !sqliteDeepEqual({ p: 85.3 }, { p: 85.31 }).ok, '');
  }

  // ---- 4. Diff-upsert: changing one entity writes one row ----
  {
    const S = sampleState();
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    // Instrument batch to count statements on the next flush.
    let lastStmts = 0;
    const realBatch = driver.batch;
    driver.batch = async function (stmts) { lastStmts = stmts.length; return realBatch.call(driver, stmts); };
    // Change ONE audit's status.
    const s2 = Store.load();
    s2.audits[0].status = 'submitted';
    await Store.saveFlush(s2);
    await Persistence.flushNow();
    // Expect: 1 audits upsert + 1 meta row_count (unchanged count → row_count same → no meta) = 1 stmt.
    ok('diff: single change writes few statements', lastStmts >= 1 && lastStmts <= 2, '' + lastStmts);
    // No-op save writes zero statements → _flushOne short-circuits and batch()
    // is never called, so the sentinel stays untouched.
    lastStmts = -1;
    const s3 = Store.load();
    await Store.saveFlush(s3);
    await Persistence.flushNow();
    eq('diff: no-op save calls batch zero times', lastStmts, -1);
    driver.batch = realBatch;
    Persistence.backend = realBackend;
  }

  // ---- 5. Deletion propagates ----
  {
    const S = sampleState();
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    const s2 = Store.load();
    s2.caps = [];                              // delete the only CAP
    await Store.saveFlush(s2);
    await Persistence.flushNow();
    const bytes = driver.export();
    await freshSqlite(bytes);
    eq('delete: removed CAP is gone after reload', Store.load().caps.length, 0);
    eq('delete: audits still present', Store.load().audits.length, 2);
    Persistence.backend = realBackend;
  }

  // ---- 6. Per-row quarantine: one corrupt cell ≠ lose the store ----
  {
    const S = sampleState();
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    // Corrupt ONE audit's data cell directly in SQLite.
    await driver.run("UPDATE audits SET data='{not valid json' WHERE id=?", ['a1']);
    const bytes = driver.export();
    await freshSqlite(bytes);
    const back = Store.load();
    eq('quarantine: corrupt audit dropped (1 of 2 survives)', back.audits.length, 1);
    eq('quarantine: surviving audit is the good one', back.audits[0].id, 'w1');
    eq('quarantine: other tables intact (caps)', back.caps.length, 1);
    Persistence.backend = realBackend;
  }

  // ---- 7. Batch failure → mirror rolls back to last commit ----
  {
    const S = sampleState();
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    const committed = JSON.stringify(Store.load());
    // Make the NEXT batch throw.
    const realBatch = driver.batch;
    driver.batch = async function () { throw new Error('disk full'); };
    const s2 = Store.load();
    s2.auditor_name = 'CHANGED — should not persist';
    let threw = false;
    try { await Store.saveFlush(s2); } catch (e) { threw = true; }
    driver.batch = realBatch;
    ok('rollback: failed write threw', threw, '');
    ok('rollback: _writeFailed flag set', SqliteBackend._writeFailed === true, '');
    // Mirror must have rolled back to the last committed state (not the failed change).
    eq('rollback: mirror reverted to last commit', Store.load().auditor_name, JSON.parse(committed).auditor_name);
    Persistence.backend = realBackend;
  }

  // ---- 8. Verified migration localStorage → SQLite ----
  {
    // Seed localStorage with a realistic state via the LocalStorageBackend.
    localStorage.clear();
    Persistence.backend = LocalStorageBackend;
    Persistence._ready = true;
    const S = sampleState();
    Store.save(S);
    const orig = Store.load();

    // 8a. backup not verified → abort, stay on localStorage.
    let driver = await makeSqlJsDriver();
    resetBackendSingleton();
    let res = await SqliteBackend.migrateFromLocalStorage(driver, { backupVerified: false });
    ok('migrate: aborts without verified backup', !res.ok && res.reason === 'backup-not-verified', JSON.stringify(res));
    ok('migrate: backend unchanged after abort', Persistence.backend === LocalStorageBackend, '');

    // 8b. verified backup + clean state → commit, swap backend, deep-equal.
    driver = await makeSqlJsDriver();
    resetBackendSingleton();
    res = await SqliteBackend.migrateFromLocalStorage(driver, { backupVerified: true });
    ok('migrate: succeeds with verified backup', res.ok, JSON.stringify(res));
    ok('migrate: backend swapped to SQLite', Persistence.backend === SqliteBackend, '');
    deepOk('migrate: SQLite state deep-equals original', orig, Store.load());
    // 'migrated' flag set in SQLite (read raw).
    const m = await driver.query("SELECT v FROM meta WHERE k='migrated'");
    eq('migrate: migrated flag committed', m.length && JSON.parse(m[0].v), '1');
    // localStorage retained (not deleted).
    ok('migrate: localStorage copy retained', !!localStorage.getItem(STORE_KEY), '');
    Persistence.backend = LocalStorageBackend;

    // 8c. injected mismatch → abort. Simulate by making read-back lossy: a
    // driver whose query drops a row so the verify deepEqual fails.
    driver = await makeSqlJsDriver();
    const realQuery = driver.query;
    driver.query = async function (sql, params) {
      const rows = await realQuery.call(driver, sql, params);
      if (/FROM audits/.test(sql) && rows.length) rows.pop();   // lose one audit on read-back
      return rows;
    };
    resetBackendSingleton();
    res = await SqliteBackend.migrateFromLocalStorage(driver, { backupVerified: true });
    ok('migrate: aborts on verify mismatch', !res.ok && res.reason === 'verify-failed', JSON.stringify(res));
    ok('migrate: backend stays localStorage on mismatch', Persistence.backend === LocalStorageBackend, '');
    Persistence.backend = realBackend;
    Persistence._migrating = false;
  }

  // ---- 9. Phase B: SqliteBackend.query() reads via indexed columns ----
  {
    const S = sampleState();
    // give a few distinct audits to query
    S.audits = [
      { id: 'q1', date: '2026-01-05', status: 'verified', results: {}, score: { pct: 90, band: 'good' } },
      { id: 'q2', date: '2026-02-10', status: 'submitted', results: {}, score: { pct: 80, band: 'poor' } },
      { id: 'q3', date: '2026-03-15', status: 'verified', results: {}, score: { pct: 95, band: 'excellent' } },
    ];
    const driver = await freshSqlite();
    Persistence.backend = SqliteBackend;
    await Store.saveFlush(S);
    await Persistence.flushNow();
    // where: status = verified → 2 rows.
    const verified = await SqliteBackend.query('audits', { where: { status: 'verified' } });
    eq('query: where status=verified → 2', verified.length, 2);
    ok('query: returns parsed entities', verified.every(a => a.id && a.score), '');
    // order date desc + limit 1 → newest audit (q3).
    const newest = await SqliteBackend.query('audits', { order: 'date desc', limit: 1 });
    eq('query: order date desc + limit 1 → q3', newest[0].id, 'q3');
    // whereRaw clause (date range).
    const range = await SqliteBackend.query('audits', { whereRaw: { clause: 'date >= ? AND date <= ?', params: ['2026-02-01', '2026-12-31'] }, order: 'date asc' });
    eq('query: date-range whereRaw → 2', range.length, 2);
    eq('query: range first is q2', range[0].id, 'q2');
    // offset.
    const offset1 = await SqliteBackend.query('audits', { order: 'date asc', offset: 1 });
    eq('query: offset 1 skips first', offset1[0].id, 'q2');
    // order injection guard: a bad order string is ignored (no throw, returns rows).
    const safe = await SqliteBackend.query('audits', { order: 'date; DROP TABLE audits' });
    ok('query: malicious order ignored, table intact', safe.length === 3, '' + safe.length);
    Persistence.backend = realBackend;
  }

  // ---- Result ----
  console.log('\n===== SQLITE BACKEND RESULTS =====');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
  else console.log('ALL GREEN ✅');
})();
