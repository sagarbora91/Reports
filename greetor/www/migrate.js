/* migrate.js — Saagar Greetor ONE-TIME legacy→SQLite migration, HARDENED.
 *
 * SQLite Phase 4. The owner's #1 concern is: "move real users' data once, WITH
 * PROOF." This module is the safety-proofed core of that move. It is the SINGLE
 * place that takes the old whole-blob Store state (the saagar_greetor_v2 shape)
 * and writes it into the relational DB — and it refuses to do so unless it can
 * prove, after the fact, that every row landed intact. A real existing install
 * can therefore never be silently corrupted or left half-migrated:
 *
 *   1. VERIFIED-BACKUP GATE. Before touching the DB, build a JSON backup string
 *      of oldState and VERIFY it re-parses with the expected top-level keys and
 *      array counts. If the backup cannot be built/verified -> THROW. No good
 *      backup, no migration. The backup string is returned so the CALLER can
 *      persist it durably (file / download) as the recovery valve.
 *   2. ONE-TRANSACTION INSERT. disassemble(oldState) -> within ONE
 *      GreetorDB.transaction, bulkInsert every non-empty owned table. Either all
 *      rows commit or none do (the engine rolls back on any error inside).
 *   3. READ-BACK VERIFICATION. After the transaction commits, read EVERY owned
 *      table back from the DB and assert BOTH: (i) row COUNT per table === the
 *      disassembled source count, AND (ii) a CONTENT HASH (sha256 of canonical
 *      JSON) of the read-back rows === the hash of the source rows. ANY mismatch
 *      -> THROW (the caller then rolls back via Migrate.rollback and does NOT set
 *      meta('migrated'), so the old Store stays the source of truth and the next
 *      boot retries).
 *
 * On full success: returns { ok:true, counts, backup, hashes }. This module
 * NEVER sets meta('migrated') itself — the caller does that, and ONLY after it
 * sees ok:true (so a crash between commit and the flag still leaves a consistent,
 * verified DB that the next boot recognises as already-populated).
 *
 * TESTABILITY: no DOM, no Store access. The caller passes oldState in, and an
 * injected db handle (the GreetorDB contract: query/run/exec/transaction/
 * bulkInsert) can be supplied so the Node test drives it over node:sqlite via the
 * sqlite-node-adapter. Default handle is window.GreetorDB (mirrors repo.js's
 * setDb pattern). Dual-export: window.Migrate AND module.exports.
 *
 * Contract used on the db handle (subset of GreetorDB / the node adapter):
 *   db.query(sql, params)       -> Promise<rows[]>
 *   db.run(sql, params)         -> Promise<{changes,lastId}>
 *   db.transaction(async fn)    -> Promise<T>   (BEGIN/COMMIT/ROLLBACK)
 *   db.bulkInsert(table, rows)  -> Promise<{changes}>   (preferred for the insert)
 * If db.bulkInsert is absent (a bare adapter), we fall back to a manual
 * INSERT-per-row inside the same transaction, so the Node adapter (which has no
 * bulkInsert) and the real GreetorDB both work unchanged.
 */
(function (root) {
  "use strict";

  // Owned tables in a FIXED order. Mirrors DBSchema.disassemble's output keys and
  // db.js KNOWN_TABLES. Read-back + count/hash verification iterate this list, so
  // every table the migration writes is also a table the migration proves.
  var OWNED_TABLES = ["records", "users", "audit_log", "comms_log", "comms_templates", "footfall", "meta"];

  // Top-level keys we expect a valid oldState (saagar_greetor_v2) to round-trip
  // through JSON with. These are the ARRAYS whose lengths the backup gate counts;
  // singletons (masters/targets/settings) are validated only as "parses back".
  var BACKUP_ARRAY_KEYS = ["users", "records", "auditLog", "commsTemplates", "commsLog"];

  // ── injectable schema accessor (mirrors repo.js) ───────────────────────────
  function schema() {
    var s = root.DBSchema;
    if (!s || typeof s.disassemble !== "function") {
      throw new Error("Migrate: window.DBSchema unavailable — load db-schema.js before migrate.js.");
    }
    return s;
  }

  // Resolve the db handle: an explicitly injected one wins, else window.GreetorDB.
  // Lazily at call time so load order / a post-load default both work.
  function resolveDb(injected) {
    var h = injected != null ? injected : root.GreetorDB;
    if (!h || typeof h.transaction !== "function" || typeof h.query !== "function") {
      throw new Error(
        "Migrate: no usable DB handle — pass opts.db (the GreetorDB contract) or " +
        "load db.js so window.GreetorDB exists."
      );
    }
    return h;
  }

  // ── canonical JSON — byte-identical to the QA harness canon() ──────────────
  // object keys SORTED (insertion order can't cause a spurious mismatch); ARRAY
  // order PRESERVED (row order IS meaningful); primitives via JSON.stringify.
  // We only ever compare canon(source) vs canon(read-back) WITHIN one run(), so
  // the algorithm just has to be internally deterministic — but we keep it the
  // SAME as the harness so a content hash here means the same thing it does there.
  function canon(x) {
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    if (x && typeof x === "object") {
      return "{" + Object.keys(x).sort().map(function (k) {
        return JSON.stringify(k) + ":" + canon(x[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(x);
  }

  // Canonicalise a LIST of rows: sort by canon() so read-back order (which a
  // SELECT without ORDER BY does not guarantee) can never cause a false mismatch.
  // Count is verified separately, so a content hash that is order-independent is
  // exactly what we want — it proves the SET of rows is identical regardless of
  // the engine's row return order. Each table also carries its own ord/PK, so the
  // app-order itself is preserved in the data; this hash proves no row was
  // dropped, added, or mutated.
  function canonRows(rows) {
    var arr = (rows || []).map(function (r) { return canon(normRow(r)); });
    arr.sort();
    return "[" + arr.join(",") + "]";
  }

  // Normalise a single row so source (disassemble output) and read-back (SELECT *)
  // hash identically: drop keys whose value is undefined (disassemble may emit a
  // key the INSERT mapped to NULL; SELECT returns NULL too — but a JS `undefined`
  // and a missing key must not differ from a stored NULL). We map undefined->null
  // (the same coercion bulkInsert/the adapter apply on write) and leave null as
  // null, so e.g. {a:undefined} (source) and {a:null} (read-back) both canon to
  // {"a":null}.
  function normRow(r) {
    if (!r || typeof r !== "object") return r;
    var out = {};
    var keys = Object.keys(r);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = r[k];
      out[k] = (v === undefined) ? null : v;
    }
    return out;
  }

  // sha256(str) -> hex. Prefers WebCrypto (browser + Node 'crypto.subtle'), falls
  // back to Node's require('crypto'). Async because crypto.subtle.digest is. We
  // never need to match an external fixture hash (only source-vs-readback within a
  // run), so any one consistent implementation is sufficient — but both paths
  // produce the standard SHA-256 hex, so they agree across environments anyway.
  async function sha256(str) {
    var subtle = root.crypto && root.crypto.subtle;
    if (subtle && typeof subtle.digest === "function") {
      var enc = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;
      if (enc) {
        var buf = await subtle.digest("SHA-256", enc.encode(str));
        var bytes = new Uint8Array(buf);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) hex += (bytes[i] + 0x100).toString(16).slice(1);
        return hex;
      }
    }
    // Node fallback (no WebCrypto / no TextEncoder).
    if (typeof require === "function") {
      try {
        var nodeCrypto = require("crypto");
        return nodeCrypto.createHash("sha256").update(str, "utf8").digest("hex");
      } catch (e) { /* fall through to the explicit error below */ }
    }
    throw new Error("Migrate: no SHA-256 implementation available (need crypto.subtle or Node crypto).");
  }

  // ── (a) VERIFIED-BACKUP GATE ───────────────────────────────────────────────
  // Build a JSON backup of oldState and PROVE it is good before any DB write:
  //   - oldState must be a non-null object,
  //   - JSON.stringify must succeed (no circular refs / BigInt),
  //   - the string must JSON.parse back,
  //   - every expected array key must survive with the SAME length,
  //   - the saagar_greetor_v2 envelope must be intact.
  // Returns the backup STRING (the caller persists it). THROWS on any failure so
  // a migration can never proceed without a recoverable backup.
  function buildVerifiedBackup(oldState) {
    if (oldState == null || typeof oldState !== "object" || Array.isArray(oldState)) {
      throw new Error("Migrate: refusing to migrate — oldState is not a state object.");
    }
    // Source counts BEFORE serialising, so we can prove the round-trip kept them.
    var srcCounts = {};
    for (var i = 0; i < BACKUP_ARRAY_KEYS.length; i++) {
      var k = BACKUP_ARRAY_KEYS[i];
      srcCounts[k] = Array.isArray(oldState[k]) ? oldState[k].length : 0;
    }
    var payload = {
      _format: "saagar_greetor_v2",
      _version: 2,
      _exported_at: new Date().toISOString(),
      _reason: "pre-migration safety backup (Phase 4)",
      app: "Saagar Greetor",
      state: oldState
    };
    var json;
    try {
      json = JSON.stringify(payload, null, 2);
    } catch (e) {
      throw new Error("Migrate: backup build FAILED (could not serialise oldState): " + (e && e.message || e));
    }
    if (typeof json !== "string" || !json.length) {
      throw new Error("Migrate: backup build FAILED (empty JSON).");
    }
    // Re-parse + verify the envelope and every array count survived intact.
    var re;
    try {
      re = JSON.parse(json);
    } catch (e2) {
      throw new Error("Migrate: backup verify FAILED (JSON did not re-parse): " + (e2 && e2.message || e2));
    }
    if (!re || re._format !== "saagar_greetor_v2" || re.state == null || typeof re.state !== "object") {
      throw new Error("Migrate: backup verify FAILED (envelope/state missing after round-trip).");
    }
    for (var j = 0; j < BACKUP_ARRAY_KEYS.length; j++) {
      var key = BACKUP_ARRAY_KEYS[j];
      var got = Array.isArray(re.state[key]) ? re.state[key].length : 0;
      if (got !== srcCounts[key]) {
        throw new Error(
          "Migrate: backup verify FAILED — '" + key + "' count changed across JSON round-trip (" +
          srcCounts[key] + " -> " + got + ")."
        );
      }
    }
    return json;
  }

  // ── (b) ONE-TRANSACTION INSERT ─────────────────────────────────────────────
  // Insert every non-empty disassembled table inside ONE transaction. Prefer the
  // handle's bulkInsert (validated, fast); if absent (a bare Node adapter), fall
  // back to a manual INSERT-per-row using the first row's keys as the column list
  // — same column set bulkInsert would use, so the written rows are identical.
  async function insertAllInOneTxn(db, tables) {
    await db.transaction(async function (tx) {
      // `tx` is the handle passed to fn (GreetorDB passes its api; the adapter
      // passes itself). Use it when present so writes stay inside the txn.
      var h = tx || db;
      for (var i = 0; i < OWNED_TABLES.length; i++) {
        var t = OWNED_TABLES[i];
        var rows = tables[t] || [];
        if (!rows.length) continue;
        if (typeof db.bulkInsert === "function") {
          await db.bulkInsert(t, rows);
        } else {
          await manualInsert(h, t, rows);
        }
      }
    });
  }

  // Manual INSERT for handles without bulkInsert (the Node adapter). Columns come
  // from the first row's keys (mapper output is uniform per table). Table name is
  // constrained to OWNED_TABLES by the caller's loop, so it is never user-derived.
  async function manualInsert(h, table, rows) {
    var cols = Object.keys(rows[0]);
    var ph = cols.map(function () { return "?"; }).join(",");
    var sql = "INSERT INTO " + table + " (" + cols.join(",") + ") VALUES (" + ph + ")";
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var vals = cols.map(function (c) { var v = row[c]; return v === undefined ? null : v; });
      await h.run(sql, vals);
    }
  }

  // ── (c) READ-BACK VERIFICATION ─────────────────────────────────────────────
  // For every owned data table (records/users/audit_log/comms_log/comms_templates/
  // footfall): SELECT * back, then assert (i) COUNT === source count AND (ii)
  // sha256(canonRows(read-back)) === sha256(canonRows(source)). On ANY mismatch
  // THROW a clear, specific error naming the table and what differed.
  //
  // 'meta' is verified with SUBSET semantics instead: the migration is NOT the
  // only writer of meta — db.js stamps 'schema_version' (and 'secret_hash' on
  // native) into meta BEFORE this runs, and the caller stamps 'migrated' AFTER —
  // so the DB legitimately has more meta rows than disassemble produced
  // (masters/targets/settings). The correct proof is: every SOURCE meta key is
  // present in the DB with the SAME value (no migrated config row was dropped or
  // mutated). Extra infrastructure keys are expected and fine.
  //
  // Returns { counts, hashes } on success (for the caller's success log).
  async function verifyReadBack(db, tables) {
    var counts = {};
    var hashes = {};
    for (var i = 0; i < OWNED_TABLES.length; i++) {
      var t = OWNED_TABLES[i];
      var srcRows = tables[t] || [];
      var dbRows = await db.query("SELECT * FROM " + t, []);
      if (!Array.isArray(dbRows)) dbRows = [];

      if (t === "meta") {
        // SUBSET: every source meta {key,value} must appear in the DB unchanged.
        var dbByKey = {};
        for (var d = 0; d < dbRows.length; d++) {
          if (dbRows[d] && dbRows[d].key != null) dbByKey[dbRows[d].key] = dbRows[d].value;
        }
        for (var s = 0; s < srcRows.length; s++) {
          var srcKey = srcRows[s].key;
          var srcVal = srcRows[s].value;
          if (!Object.prototype.hasOwnProperty.call(dbByKey, srcKey)) {
            throw new Error(
              "Migrate: read-back missing meta key '" + srcKey + "' after migration. " +
              "Migration aborted; rolling back."
            );
          }
          // canon() both sides so a NULL/'' encoding never causes a false miss.
          if (canon(dbByKey[srcKey]) !== canon(srcVal)) {
            throw new Error(
              "Migrate: read-back meta VALUE mismatch for key '" + srcKey + "'. " +
              "Migration aborted; rolling back."
            );
          }
        }
        counts[t] = srcRows.length;
        hashes[t] = await sha256(canonRows(srcRows));
        continue;
      }

      // (i) COUNT gate (exact — the migration is the sole writer; DB started empty).
      if (dbRows.length !== srcRows.length) {
        throw new Error(
          "Migrate: read-back COUNT mismatch for '" + t + "' — source had " +
          srcRows.length + " row(s) but DB has " + dbRows.length + ". Migration aborted; rolling back."
        );
      }

      // (ii) CONTENT-HASH gate (order-independent set hash; count already proven).
      var srcHash = await sha256(canonRows(srcRows));
      var dbHash = await sha256(canonRows(dbRows));
      if (srcHash !== dbHash) {
        throw new Error(
          "Migrate: read-back CONTENT mismatch for '" + t + "' — " + srcRows.length +
          " row(s) present but their content hash differs (source=" + srcHash.slice(0, 12) +
          " db=" + dbHash.slice(0, 12) + "). Migration aborted; rolling back."
        );
      }
      counts[t] = srcRows.length;
      hashes[t] = dbHash;
    }
    return { counts: counts, hashes: hashes };
  }

  // ── rollback helper (the caller's catch path) ──────────────────────────────
  // TRUNCATE every owned table in one transaction so a failed/partial migration
  // leaves a provably EMPTY DB — then the caller does NOT set meta('migrated'),
  // so the old Store remains the source of truth and the next boot retries from
  // scratch. Best-effort: if rollback itself fails we surface that, but the
  // caller's primary error is the migration failure, not the cleanup.
  async function rollback(db, opts) {
    var h = resolveDb(db != null ? db : (opts && opts.db));
    await h.transaction(async function (tx) {
      var inner = tx || h;
      for (var i = 0; i < OWNED_TABLES.length; i++) {
        await inner.run("DELETE FROM " + OWNED_TABLES[i], []);
      }
    });
    return { ok: true };
  }

  // ── public entry point ─────────────────────────────────────────────────────
  // run(oldState, opts) — opts.db injects a handle (default window.GreetorDB).
  // Sequence: backup gate -> one-txn insert -> read-back verify. Returns
  // { ok:true, counts, backup, hashes } ONLY on full success; THROWS otherwise
  // (the caller rolls back + leaves 'migrated' unset on throw).
  async function run(oldState, opts) {
    opts = opts || {};
    var db = resolveDb(opts.db);
    var S = schema();

    // (a) Verified backup FIRST — no good backup, no migration, no DB writes.
    var backup = buildVerifiedBackup(oldState);

    // disassemble once; reuse the SAME table rows for insert AND verification so
    // the "source" the read-back is compared against is exactly what we inserted.
    var tables = S.disassemble(oldState);

    // (b) One-transaction insert.
    await insertAllInOneTxn(db, tables);

    // (c) Read-back verification (throws on any count/content mismatch).
    var verified = await verifyReadBack(db, tables);

    return { ok: true, counts: verified.counts, hashes: verified.hashes, backup: backup };
  }

  var api = {
    run: run,
    rollback: rollback,
    // surfaced for tests / diagnostics
    buildVerifiedBackup: buildVerifiedBackup,
    canon: canon,
    canonRows: canonRows,
    sha256: sha256,
    OWNED_TABLES: OWNED_TABLES.slice()
  };

  root.Migrate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
