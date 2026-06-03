Grounding fully confirmed. The harness stubs `window.addEventListener` (run.js:44), has no `SaagarShell` (55), and Task #76 is `completed` — so Inc.1 is done, not "in progress." All adversarial-review claims check out against the real code. I'm now writing the definitive spec.

---

# SQLite Migration — Definitive Build-Ready Implementation Spec

**Grounding note:** Increment 1 is **complete and committed** (Task #76). The seam is live in `www/app.js:69–184`: `LocalStorageBackend` (85–137), `Persistence = { backend }` (141–143), `Store.load/save` delegating to `Persistence.backend.readPersisted/writePersisted` (151–167), and the `Store._forceCompress` passthrough (148–149). The 324-check harness passes against it. This spec builds *forward* from Inc.2; where earlier research framed Inc.1 as "to build," it is done — verify against §3 and proceed.

This version folds in every accepted fix from the corruption, async, shippability, and adversarial reviews. The non-negotiable rules those fixes encode are collected in **§10 Safety invariants**; the section text below explains *how* to satisfy them.

## 1. File layout

Three new files; everything else is additions inside `app.js`. Files stay small and single-purpose so `scripts/inline.py` concatenation stays legible.

- **`www/sql_driver.js`** — the `SqlDriver` interface contract (doc comment) **plus the device driver `CapacitorSqlDriver`** (wraps `@capacitor-community/sqlite`). Harmless to inline on web; its methods only ever run on device behind the `window.SaagarShell` gate. **The sql.js test driver lives in `qa/sql_js_driver.js`, never in `www/`** — it is a devDependency that must never ship.
- **`www/sqlite_backend.js`** — the `SqliteBackend` object: schema DDL, `boot()` hydrate, `readPersisted()` (sync mirror read), `writePersisted()`/`writePersistedFlush()`, the diff-upsert `_flushOne`, the serial write queue + debounce, `flushNow`, `rebuildState`, and the verified one-time migration. Driver injected at boot.
- **`qa/sql_js_driver.js`** + **`qa/sqlite_tests.js`** — sql.js driver and its runner (Inc.2). Required directly by the harness; **not** in `JS_ORDER`.

**Additions to `app.js`:** extend `Persistence` (141) with `boot()`, `flushNow()`, `isReady()`, the `_migrating` latch, and the `_ready` flag; add `Store.saveFlush(state)` next to `Store.save` (165); add the device-local toggle helpers (§5); make `Store.load()` boot-safe (§6 fix); rewrite the boot tail with a **synchronous-on-web / async-on-device branch** (§6); add the Settings toggle row (§5). Photo code, `migrateState`, `Store.empty()` are untouched.

**`scripts/inline.py` JS_ORDER (line 20):** the boot tail references `SqliteBackend`/`CapacitorSqlDriver`, so inline the new `www` files **before** `app.js` (object literals are *parsed* before the tail *runs*; only definition-before-use matters):

```python
JS_ORDER = ["lzstring.js", "config.js", "i18n_data.js", "reference_data.js",
            "data.js", "weekly_data.js", "sql_driver.js", "sqlite_backend.js", "app.js"]
```

The `demo_seed.js` auto-insert after `config.js` (inline.py:33–34) is unaffected.

## 2. The Persistence interface

`Persistence` is the singleton at `app.js:141`. Final shape:

```js
const Persistence = {
  backend: LocalStorageBackend,   // active backend (swapped only after a verified migration)
  _ready: false,
  _migrating: false,              // latch: blocks live writes during §4g migration (async-review #2)

  // ASYNC. Called once before first render on device. Selects backend from the
  // device toggle, hydrates the SqliteBackend mirror or runs first-time migration.
  // NEVER throws — any SQLite failure falls back to LocalStorageBackend and resolves.
  async boot(driver) { /* §6 */ this._ready = true; },

  isReady() { return this._ready; },

  // ASYNC, best-effort. Cancels debounce, enqueues pending draft as flush-tier,
  // awaits the queue tail. No-op on localStorage.
  async flushNow() { if (this.backend.flushNow) return this.backend.flushNow(); },
};
```

**Backend contract** (both backends implement, so call-sites never branch on backend type):

```
readPersisted()          -> state object (SYNC; NEVER null/undefined once boot ran)
writePersisted(state)    -> void          (SYNC; 'draft' tier)
writePersistedFlush(s)   -> Promise       (SYNC kickoff; SqliteBackend awaitable, LS resolved)
flushNow()               -> Promise       (optional)
boot(driver)             -> Promise       (optional)
```

Add to `LocalStorageBackend` (so the interface is uniform): `writePersistedFlush(s){ this.writePersisted(s); return Promise.resolve(); }`, no-op `flushNow(){ return Promise.resolve(); }`, no-op `boot(){ return Promise.resolve(); }`.

**Phase B query method** (Inc.5, additive — does **not** change `readState`): `SqliteBackend.query(table, {where, limit})` → array of parsed entities, reading indexed columns + `data` JSON straight from SQLite. Default backend has no `query`; callers guard `if (Persistence.backend.query)` and fall back to filtering `Store.load()` in memory.

## 3. LocalStorageBackend (already built — verify, don't rewrite)

`LocalStorageBackend` (app.js:85–137) is byte-for-byte today's behaviour: plain-JSON fast path, LZString compress on `QuotaExceededError`, `_forceCompress` latch (88, 116), hard-failure toast. `Store.load` (151) does version-detect → `Object.assign(empty(), parsed)` → `migrateState`; `Store.save` (165) delegates. The 324 checks pass. For Inc.1 *completion* only:

1. Add `writePersistedFlush`, no-op `boot`, no-op `flushNow` (§2).
2. Add `Store.saveFlush(state){ return Persistence.backend.writePersistedFlush(state); }` next to `Store.save`.

Because the default backend stays `LocalStorageBackend` and its `saveFlush` is synchronous under the hood, **every existing `Store.save()` call site is unchanged and the harness stays 324-green.** New flush-tier sites use `Store.saveFlush(s)`; whether the caller `await`s it is irrelevant to durability — the **synchronous enqueue** is the durability guarantee (§5), not the await. Do not make handlers async just to await.

## 4. SqliteBackend

### 4a. SqlDriver interface (async both sides)

```js
// open(): Promise<void>; close(): Promise<void>
// exec(sql): Promise<void>                       // DDL/pragma, multi-statement, no params
// run(sql, params?): Promise<{changes:number}>   // single bound write
// query(sql, params?): Promise<Array<Object>>    // rows as plain objects
// batch(stmts): Promise<void>                     // [{sql,params}] in ONE transaction
```

**Device driver `CapacitorSqlDriver`** (`www/sql_driver.js`): one long-lived connection. `open()`: `checkConnectionsConsistency()` → `isConnection(name,false)` → `retrieveConnection` else `createConnection(name,false,'no-encryption',1,false)` → `db.open()`. Map: `exec→db.execute(sql)`; `run→db.run(sql,params,false)` then `.changes.changes`; `query→db.query(sql,params)` then `.values`; `batch→beginTransaction(); for each db.run(sql,params,false); commitTransaction()`, **rollback on throw**. The `false` on inner `run`s disables per-statement self-commit (Research 1 gotcha) so the whole batch is one transaction. Enable WAL once at open: `exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')`.

> Device-only behaviours sql.js cannot exercise (WAL, connection lifecycle, the `run(...,false)` self-commit, `SaagarShell.writeFile`) are covered by the Inc.4 manual smoke test (§7).

**Test driver `SqlJsDriver`** (`qa/sql_js_driver.js`): `await initSqlJs({locateFile})` once → in-memory `new SQL.Database()`; wrap sync calls in `Promise.resolve`. `query` via `prepare/bind/step/getAsObject/free`. `batch` = `db.run('BEGIN')` … `db.run('COMMIT')` (rollback on throw). Always `stmt.free()`.

### 4b. Schema DDL (final)

```sql
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY, date TEXT, status TEXT, week TEXT,
  store_id TEXT, template_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS caps (id TEXT PRIMARY KEY, status TEXT, store_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS escalations (id TEXT PRIMARY KEY, store_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS cros  (id TEXT PRIMARY KEY, store_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS template_snapshots (key TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);  -- ALL scalars as JSON
CREATE INDEX IF NOT EXISTS ix_audits_date   ON audits(date);
CREATE INDEX IF NOT EXISTS ix_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS ix_audits_week   ON audits(week);
CREATE INDEX IF NOT EXISTS ix_caps_status   ON caps(status);
```

`store_id` columns present, NULL today (future multi-store). All nested fields (`results`, `cro_results`, `sections`, `checkpoints`, `snapshot_ref`) live inside `data` JSON.

**`meta` is a CATCH-ALL, not a fixed list** (corruption-review #1). The app writes ad-hoc scalars onto `state` that are absent from `Store.empty()`: `last_backup_at` (app.js:4871), `last_tab` (5760), `disable_strict_modals` (5877). A closed key list silently drops these on round-trip, and the §4g verify can miss it if the scalar happens to be unset at migration time. **Rule:** when flushing, after extracting the known *table* arrays/dicts, serialize **every remaining own-enumerable scalar key of `state`** (i.e. any key not in the table-map) into `meta` as `{k, v: JSON.stringify(value)}`. `rebuildState` writes back **all** meta rows verbatim. New scalars are thus future-proof.

**Table map** (entity → indexed columns; everything else → `data`):

| state key | table | indexed cols | shape |
|---|---|---|---|
| `audits[]` | audits | id,date,status,week,store_id,template_id | array |
| `caps[]` | caps | id,status,store_id | array |
| `escalations[]` | escalations | id,store_id | array |
| `users[]` | users | id | array |
| `cros[]` | cros | id,store_id | array |
| `templates[]` | templates | id | array |
| `template_snapshots{}` | template_snapshots | key (`id@hash`) | dict |
| *all other scalar keys* | meta | k,v | catch-all |

### 4c. boot() hydrate (driver injected; per-row safe; migrate-aware)

```
async boot(driver) {
  this._mirror = Store.empty();              // async-review #1: NEVER undefined, even pre-hydrate
  this._driver = driver; await driver.open();
  await driver.exec(SCHEMA_DDL);
  const rows = await this._selectAll();      // one query per table
  const hydrated = rebuildState(rows);       // §4f — per-row try/catch
  // corruption cross-cut: run schema migrations the same way Store.load does,
  // so a future SCHEMA_VERSION bump reaches SQLite users too.
  this._mirror = migrateState(hydrated, hydrated.schema_version || 0);
  this._lastSnapshot = structuredClone(this._mirror);
  this._indexLastSnapshot();                 // cache per-entity JSON strings for the diff base
  // anti-empty guard (corruption-review #5): if hydrate yields far fewer rows than
  // the last recorded count (meta.row_count), do NOT present empty — surface restore.
  this._assertNotSilentlyEmpty(rows);
}
```

After boot, `readPersisted()` returns `this._mirror` **synchronously**. Nothing renders before `Persistence.boot()` resolves (§6). On device, `_selectAll` count is compared against `meta.row_count` (written on every flush); a large unexplained shrink forces a restore flow rather than a blank app.

### 4d. writePersisted (mirror + enqueue) and tiers

```
readPersisted() { return this._mirror; }     // SYNC, never undefined
writePersisted(state) {
  if (Persistence._migrating) { this._pending = structuredClone(state); return; }  // async #2
  this._mirror = state;
  this._enqueue(state, 'draft');
}
writePersistedFlush(state) {
  if (Persistence._migrating) { this._pending = structuredClone(state); return Promise.resolve(); }
  this._mirror = state;
  return this._enqueue(state, 'flush');
}
```

The queue is a **single promise chain**, and its head is chained onto the `open()` promise so a save firing during plugin init is buffered, not run against a closed connection (async-review #5).

- **`flush` tier:** snapshots state (`structuredClone`) at enqueue, chains `_flushOne` onto the tail, returns the tail (awaitable).
- **`draft` tier:** debounces `CONFIG.timing.draftFlushMs` (add constant `draftFlushMs:400`), coalescing rapid checkpoint marks; `_pending` holds the latest snapshot.
- **Flush clears the draft timer (async-review #4):** `writePersistedFlush` and `flushNow` **must** `clearTimeout(this._timer)` and null `_pending` *before* chaining, so a stale debounced snapshot can never land after a newer flush (lost-update/time-travel bug).
- Snapshot captured at enqueue so in-place mutation after enqueue cannot retro-corrupt the write. The diff itself is computed **inside** `_flushOne`, never at enqueue (async-review #5).

### 4e. writeState diff-upsert (`_flushOne`, one transaction, fail-safe)

```
async _flushOne(state) {
  const stmts = [];
  for (const T of TABLES) {
    const nu  = indexRows(state[T.key], T);   // {id -> {cols, json}} — computed HERE, not at enqueue
    const old = this._lastIndex[T.key];        // cached from _lastSnapshot
    for (const id in nu)  if (!old[id] || nu[id].json !== old[id].json)
      stmts.push(upsertStmt(T, nu[id]));       // INSERT OR REPLACE — idempotent on re-run
    for (const id in old) if (!nu[id]) stmts.push(deleteStmt(T, id));
  }
  pushMetaDiffs(stmts, state, this._lastSnapshot);   // catch-all scalars, incl. row_count
  if (!stmts.length) return;                          // no-op save → zero statements
  try {
    await this._driver.batch(stmts);                  // atomic BEGIN…COMMIT
  } catch (e) {
    // corruption-review #4: NEVER leave the mirror ahead of disk silently.
    this._mirror = structuredClone(this._lastSnapshot);  // roll mirror back to last committed
    Persistence._writeFailed = true;
    hardToast('Save failed — your last change was not stored. Back up now.');
    throw e;                                            // stop accepting further writes cleanly
  }
  this._lastSnapshot = structuredClone(state);
  this._reindexLastSnapshot();
}
```

Change test = per-entity `JSON.stringify` equality; cache the serialized form on `_lastIndex` so the old side isn't re-stringified (~180 audits, sub-ms each; only changed rows are written). UPSERT = `INSERT OR REPLACE INTO <t> (<cols>,data) VALUES (?,…,?)` — **REPLACE, not bare INSERT**, so a migration re-run after a crash (shippability-review #4) cannot throw on PK conflict. All statements in one `batch()`.

**Mirror-never-ahead-of-disk invariant (corruption-review #4):** on `batch()` rejection the mirror is rolled back to `_lastSnapshot` (the last committed state) and a hard toast fires. This prevents (a) the app rendering durable-looking state that isn't on disk, and (b) a deletion that failed to commit being resurrected by `rebuildState` on next boot.

### 4f. rebuildState (read-back, per-row quarantine)

```
rebuildState(rows) {
  const s = Store.empty();
  for (const T of TABLES) {
    for (const r of rows[T.key]) {
      try {
        const obj = JSON.parse(r.data);
        if (T.dict) s[T.key][r.key] = obj; else s[T.key].push(obj);
      } catch (e) {
        console.error('quarantine: corrupt ' + T.key + ' row', r.id || r.key, e);  // skip ONE row
      }
    }
  }
  for (const r of rows.meta) {                  // catch-all: write back EVERY meta row verbatim
    try { s[r.k] = JSON.parse(r.v); } catch (e) { console.error('quarantine: meta ' + r.k, e); }
  }
  return s;
}
```

**Per-row `try/catch` (corruption-review #5):** one corrupt `data` cell costs one entity, not all 180. The whole-hydrate-throws path — which previously could collapse 6 months to `Store.empty()` on a single stray byte — is gone. Photo refs are plain `ph_…` strings inside `data`, untouched (photos stay in IndexedDB). Result must equal a localStorage `Store.load()` overlay identically.

### 4g. Verified, quiesced, backup-checked one-time migration

Runs on toggle-enable, or first SqliteBackend boot with `meta.migrated !== '1'`. Driven on the **same write queue** as live writes; the `_migrating` latch (§4d) buffers any interleaving save.

1. **Quiesce (async-review #2):** set `Persistence._migrating = true`; `clearTimeout` the draft debounce; drain the queue tail. Take `orig` *after* the latch so no debounced/background write races the snapshot.
2. **Verified auto-backup (corruption-review #2):** `await SaagarAudit.buildBackupPayload()` (app.js:4825) → write file via `window.SaagarShell`. **Then read the file back, parse it, and assert `audits.length` and approximate byte-count match.** A share-dismiss returns `cancelled` with no file (app.js:4867) — treat that as *backup not verified* → **abort migration, stay on localStorage.** Never proceed on an unproven backup.
3. **Snapshot source:** `orig = Store.load()` while the backend is still localStorage — so it is already at `SCHEMA_VERSION` via `migrateState` and the same object the app uses live.
4. **Import:** open SQLite, DDL, `_flushOne(orig)` against an empty `_lastSnapshot` → all `INSERT OR REPLACE` (idempotent) in one transaction.
5. **Read back:** `_selectAll` → `rebuildState` → `roundtrip`.
6. **deepEqual against the LIVE object (corruption-review #3):** compare a `structuredClone(orig)` (the live in-memory object) vs `roundtrip` — **not** two JSON-normalized copies. JSON-only artifacts (`NaN`/`Infinity`/`-0` → `null`, `undefined` dropped) then surface as diffs instead of being masked on both sides. Recursive structural compare: **key-order-insensitive for objects, order-sensitive for arrays** (audits/photos are ordered — never sort). Strict on number/string/bool/null. Add explicit `Number.isFinite` assertions on known numeric fields (scores) so a silently-zeroed score is caught. Reject any value/shape diff; log the first differing path.
7. **Commit or abort atomically (shippability-review #4):** equal → write `meta.migrated='1'` **inside the same import batch/transaction** as the data (so a crash can't land data with `migrated≠'1'` *or* the flag without data); then swap `Persistence.backend = SqliteBackend`; clear `_migrating`; flush any buffered `_pending`. Keep the localStorage key **read-only, retained ≥1 release** (do not delete). Unequal or any step failure → rollback, keep `LocalStorageBackend` active, leave toggle off, toast. The verified backup persists regardless.

## 5. Off-by-default toggle (device-local, NOT synced state)

The toggle must **not** live in synced `state` — it is device-specific, and a restored backup must not flip another device's backend. Store it in a dedicated localStorage key, read directly:

```js
const SQLITE_PREF_KEY = 'saagar_sqlite_enabled';   // device-local, never in state/backup
function sqliteEnabled() { try { return localStorage.getItem(SQLITE_PREF_KEY) === '1'; } catch (_) { return false; } }
function setSqliteEnabled(on) { try { localStorage.setItem(SQLITE_PREF_KEY, on ? '1' : '0'); } catch (_) {} }
```

**Settings UI:** add an **Owner-only** row in `renderSettingsTab` (the Notifications card sits ~app.js:3833) — "Developer / Storage (beta)", labelled "Use SQLite storage (device test)". Gate the entire row behind `window.SaagarShell` truthiness so it never renders in browser/harness, and **never reference `Capacitor.*` at parse time** (shippability-review #5) — the harness has no `Capacitor` global and would throw.

- **Toggle ON:** `setSqliteEnabled(true)` then run §4g migration; on success toast "Switched to SQLite — restart app."
- **Toggle OFF — write-back, not just revert (shippability-review #3 / async #2):** data written to SQLite *after* migration is **not** in the stale localStorage copy. On toggle-off: (a) **force a backup export**, then (b) **write the live SQLite mirror back into localStorage** (`LocalStorageBackend.writePersisted(SqliteBackend.readPersisted())`) *before* flipping `setSqliteEnabled(false)`. Reverting to a stale copy without write-back is data loss, not rollback — do not rely on a prompt alone.

**Boot reads it** (§6): `const useSqlite = !!window.SaagarShell && sqliteEnabled();`. False → stay on `LocalStorageBackend`, zero change. True → `Persistence.boot()` hydrates or migrates.

**Crash-safety proof (condensed):** every submit/verify/CAP/user/template/settings write is flush-tier; its `_enqueue(state,'flush')` runs **synchronously in the same call as the user action**, so the row is committed-or-pending before the function returns. `BEGIN…COMMIT` + WAL + single-writer queue = no torn write; a mid-transaction crash rolls back to the last commit, which already holds every prior submit. The only droppable data is the most-recent un-debounced **draft** checkpoint mark — re-enterable. **No submitted audit/verification/CAP/user record is ever lost.** This durability rests on the synchronous enqueue, *not* on `pagehide` flush completing (see §6).

## 6. Boot gating — synchronous on web, async only on device

The new async path must not slow the web/harness boot by even one microtask. **Branch at the top of the boot tail (shippability-review #1):** when `!window.SaagarShell`, run the *existing synchronous sequence verbatim*; take the async path only on device. Do **not** wrap the whole tail in `async`.

Also make `Store.load()` boot-safe (async-review #1): if `!Persistence._ready`, short-circuit to `LocalStorageBackend.readPersisted()` so a `Store.load()` from a stray `hashchange`/back-tap during the `await` gap can never read an unhydrated mirror. Combined with `_mirror = Store.empty()` at construction (§4c), `readPersisted()` is never `undefined`.

Replace the tail at `app.js:5996–6027` (the demo-seed hook at 5987 stays *above*, unchanged — it primes localStorage synchronously):

```js
function _bootSync() {                      // today's exact sequence, byte-for-byte
  I18n.init();
  Templates.ensureSeeded();
  _selfTestWeeklyScore();
  render(); renderTabBar(); applyHashTab(); restoreLastTab();
  if (typeof PhotoStore !== 'undefined') {
    Promise.resolve().then(migratePhotosToIDB)
      .then(n => { if (n) { console.log('Migrated ' + n + ' photo(s).'); render(); } })
      .catch(e => console.error('photo migration failed', e));
  }
  if (window.SaagarShell) window.SaagarShell.boot({ closeModal, onBack: /* unchanged 6017–6024 */ });
}

if (window.SaagarShell && sqliteEnabled()) {
  (async function bootDevice() {
    try { await Persistence.boot(new CapacitorSqlDriver('saagar_audit')); }
    catch (e) { console.error('SQLite boot failed — falling back to localStorage', e);
                Persistence.backend = LocalStorageBackend; }
    Persistence._ready = true;
    _bootSync();
    ['pagehide','visibilitychange'].forEach(ev =>
      window.addEventListener(ev, () => Persistence.flushNow()));   // flushes DRAFTS only
  })();
} else {
  Persistence._ready = true;        // localStorage path: ready immediately
  _bootSync();                      // fully synchronous — identical to today
}
```

**`pagehide`/`visibilitychange` flush is best-effort for drafts only (async-review #3):** on Android background the WebView freezes/kills and the SQLite microtask may never resume to COMMIT — listeners can't `await`. Durability therefore lives in the synchronous flush-tier enqueue (§5), and `pagehide` only flushes re-enterable drafts. Additionally, `shell.js`'s Capacitor boot must add `App.addListener('appStateChange', s => { if (!s.isActive) Persistence.flushNow(); })` (research-7 hook) so backgrounding triggers a flush from the native side; the SQLite plugin's transaction completes on the native thread, not the WebView microtask.

**Harness impact: none.** `window.SaagarShell` is undefined in `qa/run.js` (no `SaagarShell`, line 55) and `addEventListener` is stubbed (run.js:44), so the `else` branch runs the identical synchronous sequence with no extra microtask. The hedge `window.__bootDone` promise is **not added** unless tests actually flake — the synchronous branch moots it.

## 7. Test plan

- **Regression gate (every commit):** the 324-check `qa/run.js` harness runs the real bundle with `window.SaagarShell` undefined → `LocalStorageBackend` always, synchronous boot branch. **Must stay 324-green after every increment.**
- **sql.js driver in Node** (`qa/sql_js_driver.js`, `initSqlJs@1.14.1` devDep), in-memory; new `qa/sqlite_tests.js` runner (separate npm script) loads `SqliteBackend` + sql.js driver.
- **Backend-contract suite:** a table of ops (seed templates, create audit, mark checkpoints, submit, verify, create CAP, add user, restore-backup) run twice — `LocalStorageBackend` vs `SqliteBackend`+sql.js — asserting `deepEqual` after each op. **Crucially, also assert `deepEqual` after a full `boot()` reload** (close + re-open the in-memory db), not just after in-memory ops, to catch `rebuildState`/JSON-parse asymmetries.
- **Catch-all scalar test (corruption #1):** set a never-before-seen scalar on state, save, reload via `boot()`, assert it survives.
- **Number-coercion test (corruption #3):** put `NaN`/`Infinity`/`undefined`/`-0` in a numeric field; assert the live-object deepEqual *flags* the divergence (proving the comparison isn't self-blinding).
- **Diff-upsert assertion:** instrument `batch()` to count statements; marking one checkpoint upserts exactly one `audits` row; a no-op save produces **zero** statements.
- **Batch-failure / mirror-rollback test (corruption #4):** make `batch()` reject mid-flight; assert the mirror rolled back to `_lastSnapshot`, a hard toast fired, and a previously-deleted entity is *not* resurrected on next `boot()`.
- **Per-row quarantine test (corruption #5):** corrupt one `data` cell; assert exactly one entity is dropped and the other 179 survive; assert the anti-empty guard refuses to present empty state on a mass shrink.
- **Migration round-trip:** realistic state (reuse `qa/gen_demo_data.js` / the 6-month generator), import → read-back → live-object deepEqual; **negative test** injects a corrupt row and asserts migration **aborts, keeps localStorage**; **unverified-backup test** simulates a `cancelled` share and asserts migration aborts.
- **Crash simulation:** drop the snapshot between mirror-update and flush; assert only the in-flight draft mark is lost and all prior flushed submits survive a fresh `boot()`.
- **Device smoke test (Inc.4, manual on one APK):** open→DDL→submit→kill→reopen→assert row survived; confirm WAL active and the Capacitor driver's `batch` wraps in begin/commit; emulator-in-CI if feasible.

## 8. Increment breakdown (each independently committable + harness-green)

1. **Inc.1 — persistence seam (DONE; finish).** Already committed (Task #76). Remaining: add `writePersistedFlush`/no-op `boot`/`flushNow` to `LocalStorageBackend`, `Store.saveFlush`, `Persistence.boot/flushNow/isReady` + `_migrating`/`_ready`, the boot-safe `Store.load`, and the synchronous/async boot branch (§6) with the `else` path identical to today. **No behaviour change; 324 green.**
2. **Inc.2 — sql.js driver + contract tests.** Add `qa/sql_js_driver.js`, `qa/sqlite_tests.js`, `sql.js@1.14.1` devDep. Contract suite (incl. post-`boot()` reload assertions), catch-all-scalar, number-coercion, round-trip skeleton. Harness still 324; new suite separate. (Task #77.)
3. **Inc.3 — SqliteBackend.** `www/sqlite_backend.js`: DDL, mirror (`Store.empty()` init), `boot` (per-row quarantine + `migrateState` + anti-empty guard), diff-upsert `_flushOne` (mirror-rollback on failure), queue/debounce (flush clears timer), `rebuildState`. Add to `inline.py` JS_ORDER before `app.js`. Wire flush-tier sites (`saveFlush`) + forced-flush hooks. **Default backend unchanged → 324 green;** proven via Inc.2. (Task #78.)
4. **Inc.4 — device wiring + migration + CI.** `npm i @capacitor-community/sqlite@6.0.2`; `npx cap sync`; `CapacitorSqlDriver`; Owner-only Settings toggle (§5) with write-back-on-off; verified+quiesced migration (§4g) with backup read-back check and atomic `migrated` flag; `appStateChange` flush in `shell.js`; `android/variables.gradle` minSdk 23 if needed; device smoke test. **Toggle OFF by default → production = localStorage → 324 green.** (Task #79.)
5. **Inc.5 — Phase B queries.** Additive `SqliteBackend.query(table, opts)`; convert heavy read paths (trends/history over 180 audits, report generation) to use it *when available*, falling back to in-memory filtering of `Store.load()`. No change to `readState`/whole-state model. (Task #80.)

## 9. Rollback (three independent layers, fastest first)

1. **Runtime toggle (instant, per-device):** flip the Settings toggle off → write-back of live SQLite state into localStorage + forced backup (§5) → next boot `useSqlite` false → `LocalStorageBackend`. Because of the write-back, localStorage is *current*, not stale — this is true rollback, not data loss.
2. **Code rollback (per-release):** SQLite ships OFF behind the toggle and the default path is byte-identical localStorage, so no production user is ever on SQLite. `git revert` the Inc.3/4 commits; drop the two files from `inline.py` JS_ORDER; harness stays 324.
3. **Catastrophic (data restore):** the verified auto-backup taken before migration (§4g step 2) is a self-contained `buildBackupPayload()` JSON (photos inlined) → `applyBackupPayload()` restores onto localStorage — the existing tested path. Because the backup is *verified* before migration commits, this layer is now guaranteed to have a real file behind it.

## 10. Safety invariants (non-negotiable — the implementation must never violate these)

1. **SQLite never becomes the default.** It activates only when an Owner opts in *on a device* (`window.SaagarShell` truthy **and** `saagar_sqlite_enabled==='1'`). Browser, Node harness, and any non-Owner always run `LocalStorageBackend`.
2. **Web/harness boot stays fully synchronous.** When `!window.SaagarShell`, the boot tail runs the exact pre-existing synchronous sequence — no `async` wrapper, no extra microtask. (Guards the 324-green gate.)
3. **No raw `Capacitor.*` reachable at parse time.** Every native check goes through `window.SaagarShell` truthiness, so the harness never needs a `Capacitor` shim.
4. **Migration commits only after a verified read-back.** deepEqual is computed against the **live** state object (not a JSON-normalized copy) and passes; only then is `meta.migrated='1'` written **inside the same transaction** as the imported data, and only then is the backend swapped.
5. **Migration requires a *verified* backup.** The pre-migration backup is written, read back, and validated (`audits.length`/bytes) before import. A `cancelled`/missing/short backup aborts the migration.
6. **The mirror is never ahead of committed disk state.** On any `batch()` rejection, roll `_mirror` back to `_lastSnapshot` and raise a hard, visible failure. Never silently present un-persisted state, and never let a failed deletion be resurrected on next boot.
7. **`readPersisted()` never returns null/undefined post-construction.** `_mirror` is initialized to `Store.empty()` before `boot()`; `Store.load()` short-circuits to `LocalStorageBackend` while `!Persistence._ready`.
8. **`meta` is a catch-all.** Every scalar state key not owned by a table is round-tripped verbatim; no closed key list.
9. **Hydration is per-row fault-tolerant and never silently empty.** A corrupt cell quarantines one entity, not the whole store; a large unexplained row-count drop forces a restore flow, never a blank-state render.
10. **A flush always cancels any pending older draft.** `writePersistedFlush`/`flushNow` clear the debounce timer and null `_pending` before chaining, so a stale draft can never overwrite a newer flush.
11. **Durability rests on synchronous flush-tier enqueue, not on `pagehide`.** Every submit/verify/CAP/user/template write enqueues a flush synchronously at user-action time. `pagehide`/`visibilitychange` flush re-enterable drafts only, best-effort.
12. **The original localStorage copy is retained ≥1 release** and is never deleted on a timer — only after a verified backup exists. Toggle-OFF writes live SQLite state back to localStorage before reverting.
13. **Diffs are computed inside the serialized `_flushOne`, never at enqueue**, against `_lastSnapshot`, with the write queue head chained onto `open()` so no write runs against a closed connection.

---

**Key files:** `C:\Cowork\Reports Apk\www\app.js` (Persistence/Store 69–184, ad-hoc scalars last_backup_at 4871 / last_tab 5760 / disable_strict_modals 5877, boot tail 5996–6027, demo-seed hook 5987, Settings tab ~3833, backup helper buildBackupPayload 4825 / backupToDrive 4863, flush-tier sites: submit 2175/2189/2201, verify 5685, CAP 672/700/717, user 1224–1252, template 416/433/440), new `C:\Cowork\Reports Apk\www\sqlite_backend.js`, `C:\Cowork\Reports Apk\www\sql_driver.js`, `C:\Cowork\Reports Apk\qa\sql_js_driver.js`, `C:\Cowork\Reports Apk\qa\sqlite_tests.js`, `C:\Cowork\Reports Apk\scripts\inline.py` (JS_ORDER line 20), `C:\Cowork\Reports Apk\www\shell.js` (appStateChange flush hook), `C:\Cowork\Reports Apk\qa\run.js` (harness — addEventListener stub line 44, no SaagarShell line 55, unchanged).