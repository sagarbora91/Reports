/* db.js - Saagar Greetor database connection layer (SQLite Phase 0).
 *
 * ONE unified async API over two engines, identical on both platforms:
 *   - NATIVE (Android, Capacitor): @capacitor-community/sqlite v6 with SQLCipher.
 *       Accessed directly through window.Capacitor.Plugins.CapacitorSQLite - NO
 *       bundler, NO ES "import" (the app is plain <script src> files). Encrypted.
 *   - WEB / preview: sql.js (WASM) loaded via a plain UMD <script> tag that sets
 *       window.initSqlJs. Persisted to IndexedDB. UNENCRYPTED (sql.js has no
 *       SQLCipher - documented, dev-only; NEVER used for real customer data).
 *
 * Phase 0 is ADDITIVE infrastructure. It does NOT touch Store, the data layers,
 * or the render path - those become SQL-backed in Phase 2/3. This file only sets
 * window.GreetorDB and never throws synchronously at load.
 *
 * Schema is the single source of truth in db-schema.js (window.DBSchema.SCHEMA);
 * this file REUSES it and never duplicates DDL.
 *
 * IMPORTANT - no-bundler plugin contract (verified against @capacitor-community/
 * sqlite v6 src/definitions.ts): in no-bundler mode we talk to the LOW-LEVEL
 * CapacitorSQLitePlugin proxy (window.Capacitor.Plugins.CapacitorSQLite), NOT the
 * SQLiteConnection wrapper class. On that proxy:
 *   - setEncryptionSecret takes an OPTIONS OBJECT { passphrase } (capSetSecretOptions),
 *     NOT a bare string. (The bare-string form is the wrapper class only.)
 *   - boolean-ish results come back as { result: boolean } (capSQLiteResult) -> truthy().
 *   - run() returns { changes: { changes, lastId } } (capSQLiteChanges/Changes).
 *   - query() returns { values: [...] } (capSQLiteValues); on iOS the FIRST row is
 *     the column-name list, not data - handled below.
 *   - isConnection is NOT on this proxy (wrapper-class only); we never call it. We
 *     use isDatabase (file-exists) + an always-fresh createConnection instead.
 *
 * Unified API (all Promise-based):
 *   GreetorDB.open()                       -> Promise (idempotent; single in-flight)
 *   GreetorDB.ready                        -> Promise (resolves when open completes)
 *   GreetorDB.isNative                     -> boolean
 *   GreetorDB.isEncrypted                  -> boolean (true only on native)
 *   GreetorDB.exec(sql)                    -> Promise (DDL / multi-statement, no params)
 *   GreetorDB.query(sql, params)           -> Promise<rows[]>
 *   GreetorDB.run(sql, params)             -> Promise<{changes, lastId}>
 *   GreetorDB.transaction(async fn)        -> Promise (BEGIN/COMMIT/ROLLBACK)
 *   GreetorDB.bulkInsert(table, rows)      -> Promise<{changes}>   (for Phase 4 migration)
 *   GreetorDB.close()                      -> Promise
 *   GreetorDB.raw()                        -> native conn proxy | sql.js Database | null
 */
(function (root) {
  "use strict";

  // -- Configuration ---------------------------------------------------------
  var DB_NAME = "greetor";        // logical DB name (native plugin + IndexedDB key base)
  var DB_VERSION = 1;             // native connection version (plugin migration hook)
  var SCHEMA_VERSION = 1;         // app schema version, recorded in meta(schema_version)
  var WEB_WASM_DIR = "assets/";   // where sql-wasm.wasm lives (copied by CI)
  var IDB_NAME = "greetor_sqljs"; // IndexedDB database that persists the web DB blob
  var IDB_STORE = "db";           // object store name
  var IDB_KEY = "greetor";        // key for the single serialized DB blob

  // Tables we own (single source of truth for table-name validation). Mirrors the
  // CREATE TABLE list in db-schema.js. Used to reject unknown table names in
  // bulkInsert so an interpolated identifier can never become an injection vector.
  var KNOWN_TABLES = {
    records: 1, users: 1, audit_log: 1, comms_log: 1,
    comms_templates: 1, footfall: 1, meta: 1
  };

  // -- Internal state --------------------------------------------------------
  var isNative = !!(root.Capacitor &&
                    typeof root.Capacitor.isNativePlatform === "function" &&
                    root.Capacitor.isNativePlatform());
  var isEncrypted = false;        // set true only after a successful encrypted native open
  var _openPromise = null;        // single in-flight open() promise (idempotent)
  var _opened = false;            // becomes true once a connection is usable
  var _webWarned = false;         // warn-once guard for the no-encryption notice
  var _isIOS = !!(root.Capacitor &&
                  typeof root.Capacitor.getPlatform === "function" &&
                  root.Capacitor.getPlatform() === "ios");

  // Native: a thin handle that remembers the database name so every plugin call
  // can pass { database }. Set in openNative(). Web: the sql.js Database object.
  var _native = null;             // { plugin, database }
  var _web = null;                // sql.js Database instance

  function log()  { try { console.log.apply(console, ["[GreetorDB]"].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ["[GreetorDB]"].concat([].slice.call(arguments))); } catch (e) {} }

  function emitWebUnencryptedWarning() {
    if (!isNative && !_webWarned) {
      warn("Web/preview SQLite is UNENCRYPTED (sql.js has no SQLCipher). " +
           "Dev-only; native Android builds ARE encrypted. Never use preview for real customer data.");
      _webWarned = true;
    }
  }

  // Pull the DDL from the single source of truth. Fail loudly (async, never at
  // load) if db-schema.js was not loaded before db.js.
  function schemaStatements() {
    if (!root.DBSchema || !Array.isArray(root.DBSchema.SCHEMA)) {
      throw new Error("DBSchema.SCHEMA missing - load db-schema.js before db.js.");
    }
    return root.DBSchema.SCHEMA;
  }

  // 64-hex-char (32-byte / 256-bit) random passphrase for SQLCipher.
  function generatePassphrase() {
    var c = root.crypto || root.msCrypto;
    if (!c || typeof c.getRandomValues !== "function") {
      throw new Error("Secure RNG (crypto.getRandomValues) unavailable - cannot generate encryption secret.");
    }
    var buf = new Uint8Array(32);
    c.getRandomValues(buf);
    var out = "";
    for (var i = 0; i < buf.length; i++) out += (buf[i] + 0x100).toString(16).slice(1);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Orphaned-keystore corroboration (NATIVE only) — a secret_hash MARKER.
  //
  // STEP 0.5 below refuses to start a FRESH empty DB over an existing encrypted
  // DB file whose SQLCipher secret has vanished (the classic uninstall/reinstall
  // data-loss trap). Its only signal was isDatabase() (file-exists), which some
  // plugin builds report unreliably. We add a SECOND, independent signal: when we
  // first generate the secret we record sha256(secret) as a marker. If that marker
  // is present on a later open but the secure store now says NO secret is stored,
  // a secret was provisioned here before and has since been wiped -> orphaned
  // keystore -> refuse, exactly like STEP 0.5 (now corroborated, not isDatabase()
  // alone). It is a HASH of a 256-bit random secret (preimage-resistant, not
  // brute-forceable, and never the secret itself), so the plaintext sidecar copy
  // is safe. The marker is ALSO written into the encrypted DB meta after open for
  // forensics. WEB has no secret/SQLCipher, so all of this is skipped there.
  // ---------------------------------------------------------------------------
  var SECRET_HASH_KEY = "greetor_secret_hash"; // sidecar (localStorage) marker key

  // sha256 -> hex. Prefers WebCrypto (crypto.subtle); returns null (never throws)
  // if no digest is available, so a missing primitive degrades to "no corroborating
  // marker" rather than blocking open. Async (subtle.digest is a Promise).
  async function sha256Hex(str) {
    try {
      var c = root.crypto || root.msCrypto;
      var subtle = c && c.subtle;
      if (subtle && typeof subtle.digest === "function" && typeof TextEncoder !== "undefined") {
        var data = new TextEncoder().encode(str);
        var digest = await subtle.digest("SHA-256", data);
        var bytes = new Uint8Array(digest);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) hex += (bytes[i] + 0x100).toString(16).slice(1);
        return hex;
      }
    } catch (e) { /* fall through to null */ }
    return null;
  }

  // Sidecar marker accessors — best-effort over localStorage (readable WITHOUT
  // decrypting the DB, which is the whole point: when the keystore is gone we
  // cannot open the encrypted DB to read meta, so the corroborating marker must
  // live outside it). Never throw (private mode / quota / no localStorage).
  function readSecretHashMarker() {
    try {
      if (typeof root.localStorage === "undefined" || !root.localStorage) return null;
      var v = root.localStorage.getItem(SECRET_HASH_KEY);
      return (typeof v === "string" && v.length) ? v : null;
    } catch (e) { return null; }
  }
  function writeSecretHashMarker(hexHash) {
    if (!hexHash) return;
    try {
      if (typeof root.localStorage !== "undefined" && root.localStorage) {
        root.localStorage.setItem(SECRET_HASH_KEY, hexHash);
      }
    } catch (e) { /* best-effort; the in-DB copy + isSecretStored remain */ }
  }

  // ===========================================================================
  // NATIVE (Android) - @capacitor-community/sqlite v6 + SQLCipher, direct plugin
  // ===========================================================================

  function nativePlugin() {
    var p = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.CapacitorSQLite;
    if (!p) {
      // Reported on a real device only if the plugin genuinely failed to load.
      throw new Error("CapacitorSQLite plugin unavailable on native platform.");
    }
    return p;
  }

  // capSQLiteResult comes back as { result: boolean } on this proxy; some 6.x
  // point releases flatten it to a bare boolean - normalise to a plain boolean.
  function truthy(res) {
    if (res == null) return false;
    if (typeof res === "boolean") return res;
    if (typeof res.result === "boolean") return res.result;
    return !!res.result;
  }

  // isDatabase: does an on-disk DB FILE exist for DB_NAME (no open required)?
  // Returns false if the plugin lacks the method or the probe throws - callers
  // treat "unknown" as "no orphan", which is the safe default for STEP 0.5
  // because the secret-store probe (STEP 1) is the authoritative gate.
  async function nativeDatabaseFileExists(plugin) {
    if (typeof plugin.isDatabase !== "function") return false;
    try { return truthy(await plugin.isDatabase({ database: DB_NAME })); }
    catch (e) { return false; }
  }

  async function openNative() {
    var plugin = nativePlugin();
    // Set to sha256(secret) on the first-run generation path; written into the
    // encrypted DB meta after open (STEP 6). Stays null on every later open.
    var secretHashToStore = null;

    // -- STEP 0.5: detect an ORPHANED encrypted DB (uninstall/reinstall). -----
    // SQLCipher passphrases live in the Android secure store; the encrypted DB
    // file lives in app-private storage. On uninstall the secure store is wiped
    // but - depending on backup/transfer behaviour - a DB file can survive. If a
    // DB FILE exists but NO secret is stored, generating a fresh secret here
    // would silently start an empty DB over real (unreadable) data. Refuse.
    //
    // Two INDEPENDENT signals corroborate "a secret was provisioned here before":
    //   (1) fileExists  — an on-disk encrypted DB FILE for DB_NAME, and
    //   (2) hadSecret   — our own sha256(secret) MARKER (sidecar, see above),
    //                     written when we first generated the secret.
    // Either one being present while isSecretStored() is false means the keystore
    // was wiped under existing data — so we refuse to start fresh on EITHER.
    var fileExists = await nativeDatabaseFileExists(plugin);
    var hadSecret = !!readSecretHashMarker();

    // -- STEP 1: ensure an encryption secret exists - exactly ONCE. -----------
    // Re-calling setEncryptionSecret with a different passphrase would orphan
    // (corrupt) an already-encrypted DB, so we ONLY set it when none is stored.
    var stored = false;
    try { stored = truthy(await plugin.isSecretStored()); }
    catch (e) {
      // If we cannot even probe the secret store, do NOT guess - opening
      // encrypted with no/wrong secret risks data loss. Surface it.
      throw new Error("Could not check encryption secret store: " + (e && e.message || e));
    }

    if (!stored && (fileExists || hadSecret)) {
      // CRITICAL data-loss guard: a secret was provisioned here before (DB file
      // present and/or our sha256(secret) marker present) but the secure store now
      // reports NONE -> reinstall/keystore-wipe case. Do NOT silently start fresh.
      // Phase 4 verified JSON backup/restore is the recovery valve; surface a
      // clear, actionable error instead. The marker corroborates isDatabase(), so
      // this fires even when the file-exists probe is unreliable.
      throw new Error(
        "Encrypted database file exists but its encryption secret is missing " +
        "(typically after an app uninstall/reinstall that cleared the secure store). " +
        "The existing data cannot be decrypted with a new key. Recovery: reinstall the " +
        "prior build, export a JSON backup, then restore into the new build (Phase 4). " +
        "Refusing to start a fresh empty database over existing data."
      );
    }

    if (!stored) {
      // First run on this device: generate + persist a 256-bit passphrase.
      // Stored by the plugin in the Android secure store; survives app restart
      // and in-place update, cleared on uninstall (JSON backup is the recovery
      // valve - see Phase 4). We never read/keep the passphrase in JS: mode
      // 'secret' makes the plugin fetch it from the secure store on open.
      //
      // NOTE: setEncryptionSecret on the low-level plugin proxy takes an OPTIONS
      // OBJECT { passphrase } (capSetSecretOptions), NOT a bare string. Verified
      // against @capacitor-community/sqlite v6 definitions.ts.
      //
      // We generate into a LOCAL only long enough to (a) hand it to the plugin and
      // (b) derive its sha256 marker, then drop the reference. The plaintext secret
      // is never persisted in JS; only its preimage-resistant hash becomes a marker.
      var newSecret = generatePassphrase();
      try {
        await plugin.setEncryptionSecret({ passphrase: newSecret });
      } catch (e) {
        throw new Error("Failed to set encryption secret: " + (e && e.message || e));
      }
      // Re-verify it actually persisted. A non-idempotent secret-store write
      // that silently failed (e.g. disk full) would otherwise leave the next
      // createConnection({mode:'secret'}) trying to use a non-existent key.
      var verified = false;
      try { verified = truthy(await plugin.isSecretStored()); } catch (e) { verified = false; }
      if (!verified) {
        throw new Error("Encryption secret was set but did not persist (secure store write may have failed). Aborting to avoid an unreadable database.");
      }
      // Record the corroborating marker NOW: sha256(secret) into the sidecar
      // (readable without the DB) so a future keystore-wipe is detectable; remember
      // it to ALSO write into the encrypted DB meta after open (STEP 6, forensics).
      secretHashToStore = await sha256Hex(newSecret);
      writeSecretHashMarker(secretHashToStore);
      newSecret = null;                         // drop the plaintext secret reference
      log("encryption secret generated and verified (first run on this device); secret_hash marker recorded");
    }

    // -- STEP 2: reconcile JS <-> native connection bookkeeping. --------------
    // Android can orphan connections across pause/resume; this clears stale
    // JS-side handles so createConnection below does not collide. Best-effort.
    try { await plugin.checkConnectionsConsistency({ dbNames: [DB_NAME], openModes: [] }); }
    catch (e) { /* older signatures / reported inconsistency - non-fatal */ }

    // -- STEP 3: create a FRESH encrypted connection. ------------------------
    // A connection may linger from a prior (crashed/paused) instance and could
    // hold a stale/wrong secret. There is no reliable isConnection() on the
    // low-level plugin proxy, so we belt-and-suspenders: close any existing
    // connection (best-effort, non-fatal) and create a new one bound to the
    // current secret. ALWAYS encrypted:true + mode:'secret' - never downgrade.
    try { await plugin.closeConnection({ database: DB_NAME, readonly: false }); }
    catch (e) { /* none existed - expected on first run; non-fatal */ }

    await plugin.createConnection({
      database: DB_NAME,
      encrypted: true,
      mode: "secret",
      version: DB_VERSION,
      readonly: false
    });

    // -- STEP 4: open. Always call open(); throw (do not recover silently). --
    // isDBOpen() can report stale state on Android after pause/resume, so we do
    // not gate on it - open() is safe to call on a fresh connection. A failure
    // here (wrong secret, corruption) must surface, not be swallowed.
    try {
      await plugin.open({ database: DB_NAME });
    } catch (e) {
      throw new Error("Failed to open encrypted database: " + (e && e.message || e));
    }

    _native = { plugin: plugin, database: DB_NAME };
    isEncrypted = true;

    // -- STEP 5: apply schema (all IF NOT EXISTS) in one execute call. -------
    var ddl = schemaStatements().join(";");
    await plugin.execute({ database: DB_NAME, statements: ddl, transaction: false });

    // -- STEP 6: stamp schema_version (idempotent) + run forward migrations. -
    await nativeRun(
      "INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)",
      [String(SCHEMA_VERSION)]
    );
    await runMigrations();

    // -- STEP 6.5: persist the secret_hash marker INTO the encrypted DB meta on
    // the first-run generation path (forensic in-DB copy alongside the sidecar).
    // INSERT OR IGNORE so it is written exactly once and never overwritten. If the
    // sidecar write earlier failed but this succeeds, backfill the sidecar from
    // here so the corroborating marker still exists outside the DB next boot.
    if (secretHashToStore) {
      try {
        await nativeRun(
          "INSERT OR IGNORE INTO meta (key, value) VALUES ('secret_hash', ?)",
          [secretHashToStore]
        );
        if (!readSecretHashMarker()) writeSecretHashMarker(secretHashToStore);
      } catch (e) {
        // Non-fatal: the sidecar marker + isSecretStored remain authoritative.
        warn("could not store secret_hash in DB meta", e && e.message || e);
      }
    }

    log("native SQLite open (encrypted via SQLCipher), schema applied");
  }

  async function nativeQuery(sql, params) {
    var res = await _native.plugin.query({
      database: _native.database,
      statement: sql,
      values: params || []
    });
    var vals = (res && res.values) ? res.values : [];
    // iOS quirk (capSQLiteValues): the FIRST element is the ios_columns name
    // list, not a data row. Drop it on iOS so callers always get pure data rows.
    // Android returns data rows directly. (Greetor ships Android-first; this
    // keeps the API identical the day an iOS build is added.)
    if (_isIOS && vals.length && vals[0] && !Array.isArray(vals[0]) &&
        typeof vals[0] === "object" && vals[0].ios_columns) {
      vals = vals.slice(1);
    }
    return vals;
  }

  async function nativeRun(sql, params) {
    // transaction:false - bulk callers wrap their own BEGIN/COMMIT; a stray
    // implicit commit here could close an outer transaction prematurely.
    var res = await _native.plugin.run({
      database: _native.database,
      statement: sql,
      values: params || [],
      transaction: false
    });
    var changes = 0, lastId = 0;
    if (res && res.changes != null) {
      // 6.x returns { changes: { changes, lastId } }; some builds flatten it.
      if (typeof res.changes === "object") {
        changes = res.changes.changes != null ? res.changes.changes : 0;
        lastId = res.changes.lastId != null ? res.changes.lastId : 0;
      } else {
        changes = res.changes;
        if (res.lastId != null) lastId = res.lastId;
      }
    } else if (res && typeof res === "object") {
      // Unexpected response shape across a future plugin release - surface it
      // rather than silently returning {changes:0} and masking a failure.
      warn("unexpected plugin.run() response shape (treating as 0 changes):", res);
    }
    return { changes: changes, lastId: lastId };
  }

  async function nativeExec(sql) {
    await _native.plugin.execute({
      database: _native.database,
      statements: sql,
      transaction: false
    });
  }

  // ===========================================================================
  // WEB / preview - sql.js (WASM), persisted to IndexedDB. UNENCRYPTED.
  // ===========================================================================

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbLoad() {
    return idbOpen().then(function (d) {
      return new Promise(function (resolve) {
        var tx, store, getReq;
        try {
          tx = d.transaction(IDB_STORE, "readonly");
          store = tx.objectStore(IDB_STORE);
          getReq = store.get(IDB_KEY);
        } catch (e) { resolve(null); return; }
        getReq.onsuccess = function () {
          var v = getReq.result;
          resolve(v && v.data ? v.data : null);
        };
        getReq.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function idbSave(bytes) {
    return idbOpen().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({ data: bytes }, IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  async function openWeb() {
    if (typeof root.initSqlJs !== "function") {
      throw new Error(
        "initSqlJs missing - load assets/sql-wasm.js (UMD) before db.js on web."
      );
    }
    emitWebUnencryptedWarning();

    var SQL = await root.initSqlJs({ locateFile: function (f) { return WEB_WASM_DIR + f; } });

    // Restore the persisted DB blob if present, else start a fresh DB.
    var prior = await idbLoad();
    _web = prior ? new SQL.Database(new Uint8Array(prior)) : new SQL.Database();
    isEncrypted = false;

    // Apply schema (all IF NOT EXISTS) - safe on both fresh and restored DBs.
    var stmts = schemaStatements();
    for (var i = 0; i < stmts.length; i++) _web.run(stmts[i]);

    // Stamp schema_version (idempotent) + run forward migrations.
    _web.run("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
    await runMigrations();

    // Persist immediately so a brand-new DB survives the first reload even if
    // close() never runs (e.g. tab killed).
    try { await idbSave(_web.export()); } catch (e) { warn("initial IndexedDB persist failed", e && e.name); }

    log("web sql.js open (UNENCRYPTED), schema applied");
  }

  function webQuery(sql, params) {
    var stmt = _web.prepare(sql);
    try {
      if (params && params.length) stmt.bind(params);
      var rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function webRun(sql, params) {
    _web.run(sql, params || []);
    var changes = 0, lastId = 0;
    var c = _web.exec("SELECT changes() AS c, last_insert_rowid() AS r");
    if (c && c[0] && c[0].values && c[0].values[0]) {
      changes = c[0].values[0][0] || 0;
      lastId = c[0].values[0][1] || 0;
    }
    return { changes: changes, lastId: lastId };
  }

  // Persist the web DB to IndexedDB after writes. Fire-and-forget (does not block
  // the caller) but issued IMMEDIATELY - not debounced - so a tab/WebView kill
  // can lose at most the single in-flight write rather than a 250ms batch.
  // No-op on native. Inside a transaction we skip per-statement persistence and
  // persist once at COMMIT (see transaction()).
  var _inWebTxn = false;
  function persistWebNow() {
    if (isNative || !_web || _inWebTxn) return;
    try {
      idbSave(_web.export()).catch(function (e) { warn("IndexedDB persist failed", e && e.name); });
    } catch (e) {
      warn("IndexedDB persist threw", e && e.name);
    }
  }

  // ===========================================================================
  // Schema migrations (forward-only). Phase 0 is v1 with NO migrations, but the
  // runner is wired now so Phase 2+ can add ALTER/CREATE steps without touching
  // open(). Each entry steps run in order and the LAST step must bump
  // meta.schema_version. IF-NOT-EXISTS DDL alone is NOT a column-add strategy,
  // so this is the supported path for evolving the schema.
  // ===========================================================================
  var MIGRATIONS = {
    // Example for a future maintainer (do NOT enable in Phase 0):
    // 2: [
    //   "ALTER TABLE records ADD COLUMN warranty TEXT",
    //   "UPDATE meta SET value='2' WHERE key='schema_version'"
    // ]
  };

  async function migExec(sql) {
    if (isNative) return nativeExec(sql);
    _web.run(sql);
  }

  async function readSchemaVersion() {
    try {
      var rows = isNative
        ? await nativeQuery("SELECT value FROM meta WHERE key='schema_version'", [])
        : webQuery("SELECT value FROM meta WHERE key='schema_version'", []);
      if (rows && rows[0] && rows[0].value != null) return parseInt(rows[0].value, 10) || 0;
    } catch (e) { /* meta not ready - treat as 0 */ }
    return 0;
  }

  async function runMigrations() {
    var from = await readSchemaVersion();
    if (from < 1) from = 1;                       // schema_version was just stamped to 1
    for (var v = from + 1; v <= SCHEMA_VERSION; v++) {
      var steps = MIGRATIONS[v];
      if (!steps) continue;
      log("migrating schema " + (v - 1) + " -> " + v);
      for (var i = 0; i < steps.length; i++) await migExec(steps[i]);
    }
  }

  // ===========================================================================
  // Unified async API
  // ===========================================================================

  function ensureOpen() {
    if (!_opened) throw new Error("GreetorDB not open - await GreetorDB.open() / GreetorDB.ready first.");
  }

  function open() {
    // Single in-flight, idempotent. The cache is ASSIGNED before this function
    // returns and before any await inside the IIFE runs, so two synchronous
    // open() calls share the SAME promise - there is no window in which a second
    // caller could enter openNative() concurrently (no secret-overwrite race).
    if (_openPromise) return _openPromise;
    _openPromise = (async function () {
      try {
        if (isNative) await openNative();
        else          await openWeb();
        _opened = true;
        return true;
      } catch (e) {
        // Allow a later retry by clearing the cached promise, but surface the
        // real error to the (awaiting) caller. Never throws synchronously.
        _openPromise = null;
        _opened = false;
        throw e;
      }
    })();
    return _openPromise;
  }

  // ready: a promise the future repo can await. Kicks off open() lazily on first
  // access without throwing synchronously at module load.
  var _ready = null;
  function getReady() {
    if (!_ready) {
      _ready = open().catch(function (e) {
        // Keep `ready` rejected so callers see the failure, but log once.
        warn("open failed", e && e.message || e);
        throw e;
      });
    }
    return _ready;
  }

  async function exec(sql) {
    await getReady(); ensureOpen();
    if (isNative) return nativeExec(sql);
    _web.exec(sql);
    persistWebNow();
  }

  async function query(sql, params) {
    await getReady(); ensureOpen();
    if (isNative) return nativeQuery(sql, params);
    return webQuery(sql, params);
  }

  async function run(sql, params) {
    await getReady(); ensureOpen();
    var r;
    if (isNative) r = await nativeRun(sql, params);
    else { r = webRun(sql, params); persistWebNow(); }
    return r;
  }

  // transaction(fn): runs fn() between BEGIN and COMMIT, ROLLBACK on throw.
  // fn receives the api so callers can `await tx.run(...)` inside.
  //
  // REENTRANT: SQLite has no nested transactions ("cannot start a transaction
  // within a transaction"). Callers legitimately nest — e.g. Migrate.run and
  // restore wrap several bulkInsert() calls (each of which is itself a
  // transaction) in ONE outer transaction for atomicity. So a nested call runs
  // INLINE (no second BEGIN/COMMIT) and joins the outer txn; only the outermost
  // BEGINs/COMMITs/ROLLBACKs. A throw anywhere still unwinds to the outer
  // ROLLBACK, preserving all-or-nothing semantics.
  var _txnDepth = 0;
  async function transaction(fn) {
    await getReady(); ensureOpen();
    if (_txnDepth > 0) {                 // already inside a txn → run inline
      _txnDepth++;
      try { return await fn(api); }
      finally { _txnDepth--; }
    }
    if (isNative) {
      var plugin = _native.plugin, dbn = _native.database;
      await plugin.beginTransaction({ database: dbn });
      _txnDepth++;
      try {
        var out = await fn(api);
        await plugin.commitTransaction({ database: dbn });
        return out;
      } catch (e) {
        // Best-effort rollback. If THIS throws too, the original error is still
        // the one we propagate: a rollback failure means native SQLite is in an
        // unrecoverable state for this txn (app restart needed), and the root
        // cause the caller needs to see is the original exception, not the
        // rollback. Swallow deliberately.
        try { await plugin.rollbackTransaction({ database: dbn }); } catch (_) {}
        throw e;
      } finally { _txnDepth--; }
    } else {
      _web.run("BEGIN");
      _inWebTxn = true;                 // suppress per-statement persistence
      _txnDepth++;
      try {
        var res = await fn(api);
        _web.run("COMMIT");
        persistWebNow();                // persist once for the whole txn
        return res;
      } catch (e2) {
        try { _web.run("ROLLBACK"); } catch (_) {}
        throw e2;
      } finally { _inWebTxn = false; _txnDepth--; }
    }
  }

  // bulkInsert(table, rows): atomic multi-row insert. Columns come from the
  // first row keys (callers pass mapper output, e.g. DBSchema.recordToRow).
  // Used by the Phase 4 migration; safe to call now.
  async function bulkInsert(table, rows) {
    await getReady(); ensureOpen();
    // Validate the table name against the known set BEFORE interpolation. The
    // identifier cannot be parameterised, so allow-listing is the correct guard
    // against a malformed/hostile name ever reaching the SQL string. hasOwnProperty
    // (not the `in` operator) so inherited names like __proto__/constructor fail.
    if (!Object.prototype.hasOwnProperty.call(KNOWN_TABLES, table)) {
      throw new Error("bulkInsert: unknown table '" + table + "'");
    }
    if (!rows || !rows.length) return { changes: 0 };
    var cols = Object.keys(rows[0]);
    var colList = cols.join(",");
    var ph = cols.map(function () { return "?"; }).join(",");
    var sql = "INSERT INTO " + table + " (" + colList + ") VALUES (" + ph + ")";
    var total = 0;
    await transaction(async function () {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var vals = cols.map(function (c) { var v = row[c]; return v === undefined ? null : v; });
        var r = await run(sql, vals);
        total += (r && r.changes) ? r.changes : 0;
      }
    });
    return { changes: total };
  }

  async function close() {
    if (isNative) {
      if (_native && _native.plugin) {
        try { if (typeof _native.plugin.close === "function") await _native.plugin.close({ database: _native.database }); } catch (e) { warn("native close", e && e.message); }
        try { await _native.plugin.closeConnection({ database: _native.database, readonly: false }); } catch (e) {}
      }
    } else if (_web) {
      _inWebTxn = false;
      try { await idbSave(_web.export()); } catch (e) { warn("persist on close failed", e && e.name); }
      try { _web.close(); } catch (e) {}
    }
    _opened = false;
    _openPromise = null;
    _ready = null;
  }

  // raw(): the underlying engine handle for advanced/migration use. On native
  // this is a small proxy exposing the plugin + database name (the plugin is the
  // connection object in no-bundler mode); on web it is the sql.js Database.
  function raw() {
    if (isNative) return _native;
    return _web;
  }

  var api = {
    open: open,
    get ready() { return getReady(); },
    isNative: isNative,
    // isEncrypted getter ALSO emits the web warn-once, so the first access in any
    // context (even sync, even before ready resolves) surfaces the asymmetry.
    get isEncrypted() { emitWebUnencryptedWarning(); return isEncrypted; },
    exec: exec,
    query: query,
    run: run,
    transaction: transaction,
    bulkInsert: bulkInsert,
    close: close,
    raw: raw,
    // surfaced for diagnostics / tests
    DB_NAME: DB_NAME,
    SCHEMA_VERSION: SCHEMA_VERSION
  };

  root.GreetorDB = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
