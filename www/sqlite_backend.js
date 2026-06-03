// ---------------------------------------------------------------------------
// SqliteBackend — a Persistence backend that stores the app state in SQLite
// (device only, OFF BY DEFAULT). Implements the same synchronous read contract
// as LocalStorageBackend so Store.load()/save() and every call site are
// unchanged; durability + scale come from a relational-rows + JSON-column
// schema behind an async write queue.
//
// Built to agent_outputs/sqlite_migration_spec_final.md (9-agent design +
// 3 adversarial data-safety reviews). Tested in Node via sql.js (qa/
// sqlite_tests.js) BEFORE it ever runs on a device.
//
// SqlDriver interface (both the sql.js test driver and the device Capacitor
// driver implement this; all async):
//   open(): Promise<void>
//   close(): Promise<void>
//   exec(sql): Promise<void>                     // DDL/pragma, multi-statement
//   run(sql, params?): Promise<{changes:number}> // single bound write
//   query(sql, params?): Promise<Array<Object>>  // rows as plain objects
//   batch(stmts): Promise<void>                   // [{sql,params}] in ONE txn
// ---------------------------------------------------------------------------

const SQLITE_SCHEMA_DDL = [
  "CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, date TEXT, status TEXT, week TEXT, store_id TEXT, template_id TEXT, data TEXT);",
  "CREATE TABLE IF NOT EXISTS caps (id TEXT PRIMARY KEY, status TEXT, store_id TEXT, data TEXT);",
  "CREATE TABLE IF NOT EXISTS escalations (id TEXT PRIMARY KEY, store_id TEXT, data TEXT);",
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT);",
  "CREATE TABLE IF NOT EXISTS cros (id TEXT PRIMARY KEY, store_id TEXT, data TEXT);",
  "CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT);",
  "CREATE TABLE IF NOT EXISTS template_snapshots (key TEXT PRIMARY KEY, data TEXT);",
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);",
  "CREATE INDEX IF NOT EXISTS ix_audits_date ON audits(date);",
  "CREATE INDEX IF NOT EXISTS ix_audits_status ON audits(status);",
  "CREATE INDEX IF NOT EXISTS ix_audits_week ON audits(week);",
  "CREATE INDEX IF NOT EXISTS ix_caps_status ON caps(status);",
].join("\n");

// entity collection -> table + indexed columns. Everything else on `state`
// (scalars like schema_version / current_audit_id / last_backup_at / last_tab /
// disable_strict_modals / _demo / future keys) is round-tripped via `meta`.
const SQLITE_TABLES = [
  { key: 'audits', table: 'audits', idCol: 'id',
    cols: ['id', 'date', 'status', 'week', 'store_id', 'template_id'],
    colVals: o => [o.id, o.date || null, o.status || null,
      (o.year != null && o.week_number != null) ? (o.year + '-' + o.week_number) : null,
      o.store_id || null, o.template_id || null] },
  { key: 'caps', table: 'caps', idCol: 'id', cols: ['id', 'status', 'store_id'],
    colVals: o => [o.id, o.status || null, o.store_id || null] },
  { key: 'escalations', table: 'escalations', idCol: 'id', cols: ['id', 'store_id'],
    colVals: o => [o.id, o.store_id || null] },
  { key: 'users', table: 'users', idCol: 'id', cols: ['id'], colVals: o => [o.id] },
  { key: 'cros', table: 'cros', idCol: 'id', cols: ['id', 'store_id'],
    colVals: o => [o.id, o.store_id || null] },
  { key: 'templates', table: 'templates', idCol: 'id', cols: ['id'], colVals: o => [o.id] },
  { key: 'template_snapshots', table: 'template_snapshots', idCol: 'key', dict: true,
    cols: ['key'], colVals: (val, key) => [key] },
];
const SQLITE_TABLE_KEYS = new Set(SQLITE_TABLES.map(t => t.key));
// Internal meta bookkeeping that is NOT part of app state (so it doesn't leak
// into the deepEqual migration check or back onto `state`).
const SQLITE_RESERVED_META = new Set(['migrated', 'row_count']);

// Reconstruct a state object from the rows of every table. Per-row try/catch:
// one corrupt `data` cell costs ONE entity, never the whole store.
function rebuildStateFromRows(rows) {
  const s = Store.empty();
  SQLITE_TABLES.forEach(T => {
    (rows[T.key] || []).forEach(r => {
      try {
        const obj = JSON.parse(r.data);
        if (T.dict) s[T.key][r[T.idCol]] = obj;
        else s[T.key].push(obj);
      } catch (e) {
        console.error('SQLite quarantine: corrupt ' + T.key + ' row', r[T.idCol], e);
      }
    });
  });
  (rows.meta || []).forEach(r => {
    if (SQLITE_RESERVED_META.has(r.k)) return;     // internal — not app state
    try { s[r.k] = JSON.parse(r.v); } catch (e) { console.error('SQLite quarantine: meta ' + r.k, e); }
  });
  return s;
}

// Structural deep-equal used by the verified migration. Key-order-INSENSITIVE
// for objects, order-SENSITIVE for arrays (audits/photos are ordered). Strict
// on primitives. Treats NaN as unequal so a silently-coerced number is caught.
// Compares the LIVE object vs the SQLite read-back (not two JSON copies), so
// JSON-only artifacts (NaN/Infinity/undefined/-0) surface as diffs.
function sqliteDeepEqual(a, b, path) {
  path = path || '$';
  if (a === b) return { ok: true };
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return { ok: true };
    return { ok: false, path: path + ' (number ' + a + ' vs ' + b + ')' };
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { ok: false, path: path + ' (' + JSON.stringify(a) + ' vs ' + JSON.stringify(b) + ')' };
  }
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr !== bArr) return { ok: false, path: path + ' (array/object mismatch)' };
  if (aArr) {
    if (a.length !== b.length) return { ok: false, path: path + ' (length ' + a.length + ' vs ' + b.length + ')' };
    for (let i = 0; i < a.length; i++) {
      const r = sqliteDeepEqual(a[i], b[i], path + '[' + i + ']');
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return { ok: false, path: path + ' (keys ' + ak.length + ' vs ' + bk.length + ')' };
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return { ok: false, path: path + '.' + k + ' (missing)' };
    const r = sqliteDeepEqual(a[k], b[k], path + '.' + k);
    if (!r.ok) return r;
  }
  return { ok: true };
}

const SqliteBackend = {
  _driver: null,
  _mirrorJson: null,      // canonical state as a JSON string (localStorage-identical read semantics)
  _lastSnapshot: null,    // the state most recently COMMITTED to SQLite (diff base)
  _lastIndex: null,       // { tableKey: { id: jsonString } } cache for the diff
  _queue: Promise.resolve(),
  _timer: null,
  _writeFailed: false,
  _suspectEmpty: false,

  // ---- reads (synchronous, never null/undefined) ----
  readPersisted() {
    return this._mirrorJson ? JSON.parse(this._mirrorJson) : Store.empty();
  },

  // ---- writes ----
  writePersisted(state) {
    if (Persistence._migrating) { this._pendingJson = JSON.stringify(state); return; }
    this._mirrorJson = JSON.stringify(state);
    this._scheduleDraft();
  },
  writePersistedFlush(state) {
    if (Persistence._migrating) { this._pendingJson = JSON.stringify(state); return Promise.resolve(); }
    this._mirrorJson = JSON.stringify(state);
    return this._flushTier();
  },
  flushNow() {
    return this._flushTier();
  },

  _scheduleDraft() {
    clearTimeout(this._timer);
    const self = this;
    this._timer = setTimeout(function () {
      self._timer = null;
      self._chain(self._mirrorJson);
    }, (typeof CONFIG !== 'undefined' && CONFIG.timing.draftFlushMs) || 400);
  },
  _flushTier() {
    // Invariant: a flush cancels any pending older draft so a stale snapshot
    // can never overwrite a newer flush.
    clearTimeout(this._timer); this._timer = null;
    return this._chain(this._mirrorJson);
  },
  // Serialize all writes through a single promise chain; snapshot is captured
  // immutably (the JSON string), the diff is computed INSIDE _flushOne.
  _chain(snapJson) {
    if (snapJson == null) return Promise.resolve();
    const self = this;
    const p = this._queue.then(function () { return self._flushOne(JSON.parse(snapJson)); });
    // keep the chain alive even if one flush rejects (failure handled in _flushOne)
    this._queue = p.catch(function () {});
    return p;
  },

  // ---- the diff-upsert: one atomic transaction, fail-safe ----
  async _flushOne(state) {
    const stmts = this._buildFlushStmts(state);
    if (!stmts.length) return;            // no-op save → zero statements
    try {
      await this._driver.batch(stmts);
    } catch (e) {
      // Mirror must never be ahead of committed disk: roll back to last commit.
      this._mirrorJson = JSON.stringify(this._lastSnapshot);
      this._writeFailed = true;
      console.error('SQLite write failed — rolled mirror back to last commit', e);
      try {
        const t = document.getElementById('toast');
        if (t) { t.textContent = 'Save failed — last change not stored. Back up now.'; t.hidden = false; setTimeout(() => { t.hidden = true; }, 4000); }
      } catch (_) {}
      throw e;
    }
    this._lastSnapshot = JSON.parse(JSON.stringify(state));
    this._reindex();
  },

  _buildFlushStmts(state) {
    const stmts = [];
    let rowCount = 0;
    SQLITE_TABLES.forEach(T => {
      const nu = this._indexCollection(state[T.key], T);
      const old = (this._lastIndex && this._lastIndex[T.key]) || {};
      for (const id in nu) {
        rowCount++;
        if (!old[id] || nu[id].json !== old[id].json) {
          stmts.push({
            sql: 'INSERT OR REPLACE INTO ' + T.table + ' (' + T.cols.join(',') + ',data) VALUES (' + T.cols.map(() => '?').join(',') + ',?)',
            params: nu[id].colVals.concat([nu[id].json]),
          });
        }
      }
      for (const id in old) {
        if (!nu[id]) stmts.push({ sql: 'DELETE FROM ' + T.table + ' WHERE ' + T.idCol + '=?', params: [id] });
      }
    });
    // meta: catch-all for every non-table scalar key + internal row_count.
    const nuMeta = this._metaMap(state);
    const oldMeta = (this._lastIndex && this._lastIndex.__meta) || {};
    nuMeta.row_count = JSON.stringify(rowCount);
    for (const k in nuMeta) {
      if (nuMeta[k] !== oldMeta[k]) stmts.push({ sql: 'INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', params: [k, nuMeta[k]] });
    }
    for (const k in oldMeta) {
      if (!(k in nuMeta)) stmts.push({ sql: 'DELETE FROM meta WHERE k=?', params: [k] });
    }
    return stmts;
  },

  _indexCollection(coll, T) {
    const out = {};
    if (!coll) return out;
    if (T.dict) {
      Object.keys(coll).forEach(key => { out[key] = { colVals: T.colVals(coll[key], key), json: JSON.stringify(coll[key]) }; });
    } else {
      coll.forEach(o => { if (o && o.id != null) out[o.id] = { colVals: T.colVals(o), json: JSON.stringify(o) }; });
    }
    return out;
  },
  // non-table scalar keys → { key: JSON.stringify(value) } (excludes reserved).
  _metaMap(state) {
    const m = {};
    Object.keys(state).forEach(k => {
      if (SQLITE_TABLE_KEYS.has(k)) return;
      if (SQLITE_RESERVED_META.has(k)) return;
      m[k] = JSON.stringify(state[k]);
    });
    return m;
  },
  // Cache the serialized form of the last committed snapshot for cheap diffs.
  _reindex() {
    const idx = {};
    SQLITE_TABLES.forEach(T => { idx[T.key] = this._indexCollection(this._lastSnapshot[T.key], T); });
    idx.__meta = this._metaMap(this._lastSnapshot);
    let rc = 0;
    SQLITE_TABLES.forEach(T => { const c = this._lastSnapshot[T.key]; rc += c ? (T.dict ? Object.keys(c).length : c.length) : 0; });
    idx.__meta.row_count = String(rc);
    this._lastIndex = idx;
  },

  // ---- Phase B: indexed query (read straight from SQLite, not the mirror) ----
  // query(tableKeyOrName, { where:{col:val}, whereRaw:{clause,params}, order, limit, offset })
  //   -> Promise<Array<parsed entity>>. Uses the indexed columns (date/status/
  //   week/store_id) so it stays fast at multi-store / multi-year scale. The
  //   `order` is developer-controlled and allow-listed (no user input → no
  //   injection). Returns [] if the table is unknown or the driver isn't open.
  async query(table, opts) {
    opts = opts || {};
    const T = SQLITE_TABLES.find(t => t.table === table || t.key === table);
    if (!T || !this._driver) return [];
    let sql = 'SELECT data FROM ' + T.table;
    const params = [];
    const where = [];
    if (opts.where) Object.keys(opts.where).forEach(col => {
      if (!/^[a-z_]+$/i.test(col)) return;          // guard: only column-name identifiers
      where.push(col + '=?'); params.push(opts.where[col]);
    });
    if (opts.whereRaw && opts.whereRaw.clause) { where.push('(' + opts.whereRaw.clause + ')'); (opts.whereRaw.params || []).forEach(p => params.push(p)); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    if (opts.order && /^[a-z_]+\s+(asc|desc)$/i.test(opts.order)) sql += ' ORDER BY ' + opts.order;
    if (opts.limit != null) sql += ' LIMIT ' + parseInt(opts.limit, 10);
    if (opts.offset != null) {
      if (opts.limit == null) sql += ' LIMIT -1';   // SQLite requires a LIMIT before OFFSET
      sql += ' OFFSET ' + parseInt(opts.offset, 10);
    }
    const rows = await this._driver.query(sql, params);
    const out = [];
    rows.forEach(r => { try { out.push(JSON.parse(r.data)); } catch (e) { console.error('query parse error', e); } });
    return out;
  },

  async _selectAll() {
    const rows = {};
    for (const T of SQLITE_TABLES) rows[T.key] = await this._driver.query('SELECT * FROM ' + T.table);
    rows.meta = await this._driver.query('SELECT * FROM meta');
    return rows;
  },

  // ---- boot: open + hydrate the mirror (migrate-aware, anti-empty) ----
  async boot(driver) {
    this._driver = driver;
    this._mirrorJson = JSON.stringify(Store.empty());   // never undefined, even pre-hydrate
    await driver.open();
    await driver.exec(SQLITE_SCHEMA_DDL);
    const rows = await this._selectAll();
    const hydrated = rebuildStateFromRows(rows);
    // Run schema migrations the same way Store.load does, so a future
    // SCHEMA_VERSION bump reaches SQLite users too.
    const migrated = migrateState(hydrated, hydrated.schema_version || 0);
    this._mirrorJson = JSON.stringify(migrated);
    this._lastSnapshot = JSON.parse(this._mirrorJson);
    this._reindex();
    this._assertNotSilentlyEmpty(rows);
    return migrated;
  },

  // Refuse to silently present an empty/decimated store: compare actual row
  // count against meta.row_count written on the last flush.
  _assertNotSilentlyEmpty(rows) {
    let actual = 0;
    SQLITE_TABLES.forEach(T => { actual += (rows[T.key] || []).length; });
    const rc = (rows.meta || []).find(r => r.k === 'row_count');
    if (rc) {
      let expected = 0; try { expected = JSON.parse(rc.v); } catch (_) {}
      if (expected > 10 && actual < expected * 0.5) {
        this._suspectEmpty = true;
        console.error('SQLite hydrate suspect: expected ~' + expected + ' rows, got ' + actual + ' — restore recommended');
      }
    }
  },

  // ---- verified one-time migration localStorage -> SQLite ----
  // Caller (the toggle handler) MUST have written + verified a backup first and
  // pass opts.backupVerified=true. Returns { ok, reason, diffPath? }.
  async migrateFromLocalStorage(driver, opts) {
    opts = opts || {};
    if (!opts.backupVerified) return { ok: false, reason: 'backup-not-verified' };
    Persistence._migrating = true;
    try {
      // Snapshot the LIVE localStorage state (already at SCHEMA_VERSION via load()).
      const orig = Store.load();
      this._driver = driver;
      await driver.open();
      await driver.exec(SQLITE_SCHEMA_DDL);
      // Import everything against an empty baseline → all INSERT OR REPLACE
      // (idempotent on a crash-retry), plus the `migrated` flag in the SAME
      // transaction so a crash can't land data without the flag or vice-versa.
      this._lastSnapshot = Store.empty();
      this._reindex();
      const stmts = this._buildFlushStmts(orig);
      stmts.push({ sql: 'INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', params: ['migrated', JSON.stringify('1')] });
      await driver.batch(stmts);
      // Read back and verify against the LIVE object.
      const rows = await this._selectAll();
      const roundtrip = rebuildStateFromRows(rows);
      const cmp = sqliteDeepEqual(orig, roundtrip);
      if (!cmp.ok) {
        console.error('SQLite migration verify FAILED at', cmp.path, '— aborting, staying on localStorage');
        Persistence._migrating = false;
        return { ok: false, reason: 'verify-failed', diffPath: cmp.path };
      }
      // Commit: adopt the verified state as the mirror + diff base, swap backend.
      this._mirrorJson = JSON.stringify(orig);
      this._lastSnapshot = JSON.parse(this._mirrorJson);
      this._reindex();
      Persistence.backend = SqliteBackend;
      Persistence._migrating = false;
      // Replay any write that arrived during migration.
      if (this._pendingJson) { const pj = this._pendingJson; this._pendingJson = null; this._mirrorJson = pj; this._flushTier(); }
      return { ok: true };
    } catch (e) {
      console.error('SQLite migration error — aborting, staying on localStorage', e);
      Persistence._migrating = false;
      return { ok: false, reason: 'error', error: String(e && e.message || e) };
    }
  },
};

if (typeof window !== 'undefined') window.SqliteBackend = SqliteBackend;
