# Saagar Greetor — SQLite Migration Plan

**Status: APPROVED IN PRINCIPLE — awaiting final "go" to start. No code written yet.**

Decisions locked (owner choices):
- **Strategy:** Full async SQLite (data layers issue live SQL; render/router/handlers become async). *Not* the lower-risk hydrate-all approach.
- **Platform:** SQLite everywhere — native Android (`@capacitor-community/sqlite`) **and** web/preview (`jeep-sqlite` + `sql.js` wasm).
- **Encryption:** Included now (SQLCipher on native).
- **Sequencing:** All-in-one (single change, ship once at the end).
- **Branch:** dedicated `sqlite` branch; merge to `capacitor` only when green.

---

## ⚠️ Two honest caveats the owner accepted
1. **Effort ≈ 9–12 days, high risk.** Full-async rewrites the app's entire read model — every data layer becomes SQL and `render()` + the click router + all 5 UI modules become async (they currently read a synchronous in-memory object in ~100 places). This is a rebuild of the data foundation everything depends on.
2. **wasm + encryption don't fully coexist.** Native SQLite supports SQLCipher; **sql.js (web/wasm) has no SQLCipher.** Result: **native device DB = encrypted; web-preview DB = unencrypted.** Acceptable (preview is dev-only, no real customer data), but documented.

## Why we're doing it (benefit)
Capacity is already solved (durable-file fix removed the 5 MB cap). SQLite's real payoff: per-row writes, SQL aggregation for reports/customers, an encryption foundation, and the cleanest base for the future cloud-sync fork. This is a foundation investment, not a fix for a current breakage.

---

## Dependencies
- `@capacitor-community/sqlite` (native SQLite + SQLCipher)
- `jeep-sqlite` + `sql.js` wasm (web/preview engine) — `sql-wasm.wasm` copied into `greetor/www/assets/`
- A secure-storage plugin for the encryption key (e.g. `@capacitor-community/secure-storage-plugin` or the sqlite plugin's built-in secret/biometric) — native Keystore-backed

## Schema
Real tables for high-volume / queryable data; a `meta` KV table for config singletons.
```
records(recordId PK, store, visitDate, visitTime, source, mobile, customerName,
        customerType, category, subCategory, brand, gender, occasion, budget,
        urgency, greetor, cro, reason, competitor, remarks, followUp, leadStatus,
        followDate, followTime, consent_at, saleValue, convertedAt, quick,
        createdAt, updatedAt, createdByUserId, createdByName, photos TEXT/*JSON*/)
   INDEX idx_records_visitDate, idx_records_mobile, idx_records_leadStatus,
         idx_records_createdBy
users(id PK, name, role, pin_salt, pin_hash, created_at, is_active, phone)
audit_log(id PK, at, userId, userName, role, action, summary, detail TEXT)
comms_log(id PK, at, byUserId, byName, channel, recordId, mobile, customerName,
          templateId, templateName, text, ts)
comms_templates(id PK, name, scope, store, reason, text, active)
footfall(store, date, count, byUserId, byName, at, PRIMARY KEY(store, date))
meta(key PK, value TEXT)   -- masters(JSON), targets(JSON), settings (my_store,
                            -- current_user_id, reminder_enabled), dpdp prefs,
                            -- staff list, flags, schema_version
```

## New / changed files
- `greetor/www/db.js` (new) — connection lifecycle (native + web), encryption-key bootstrap, schema + `schema_version` migrations.
- `greetor/www/repo.js` (new) — async repository per entity (query/upsert/delete) + object↔row mappers.
- `greetor/www/customers.js`, `reports.js` — rewrite to SQL (GROUP BY for breakdowns, aggregates for stats/leaderboard, WHERE for ranges).
- `greetor/www/comms.js`, `targets.js`, `footfall.js`, `masters.js` — async repo-backed.
- `greetor/www/index.html` — `Store` removed/replaced; `render()`, router, click handlers become async; UI consumes async view-models; boot opens DB + migrates.
- 5 UI modules (`reports-ui`, `customers-ui`, `pipeline-ui`, `comms-ui`, `masters-ui`) — `render(state)` → `await render()` consuming view-models.
- `greetor/package.json`, `capacitor.config.json`, `greetor-apk.yml` (copy wasm step).

## Architecture (full async)
- DB is the single source of truth. Repo functions return Promises.
- Each screen render `await`s only the data it needs (e.g. `await Reports.summary(range)`), then builds HTML. Small loading states added.
- Mutations call repo upsert/delete directly (replaces the whole-blob `Store.save`).
- Encryption: random 256-bit key generated on first run, stored in Android secure storage; DB opened with it. Key loss ⇒ DB unreadable ⇒ JSON backup is the recovery path.

## Phases (~9–12 days, single ship)
| Phase | Work | Effort |
|---|---|---|
| 0 | Deps; native+web DB open; copy `sql-wasm.wasm` + CI step; encryption-key bootstrap; schema + migrations | 1.5d |
| 1 | `repo.js` async CRUD + mappers (photos[] → JSON column) | 1d |
| 2 | Rewrite `reports.js` + `customers.js` to SQL, then comms/targets/footfall/masters | 2–3d |
| 3 | `render()`/router/handlers async; UI modules → async view-models; loading states | 2–3d |
| 4 | One-time migration: auto-export JSON backup → read old state → bulk-insert into encrypted DB (idempotent flag) | 1d |
| 5 | Tests (`better-sqlite3` SQL suite over the 2,612-row seed + device test for plugin/encryption/wasm) ; backup/restore vs SQLite; storage meter via PRAGMA; commit + build + ship | 1.5d |

## Testing
- **Node `better-sqlite3` harness:** recreate the schema, load the 2,612-row demo seed, assert the rewritten SQL queries match current JS outputs (regression net for the logic move). (better-sqlite3 has no SQLCipher — logic tested unencrypted; fine.)
- **Device test (required):** native plugin open, encryption persist across restart, wasm web-preview path, one-time migration of existing data.

## Migration of existing data
First launch of the SQLite build: if DB is new but a JSON store exists (durable file / localStorage / demo seed) → auto-export a JSON backup (safety) → read old state → bulk-insert into the (encrypted) DB in a transaction → set `migrated` flag (idempotent). Existing users + demo seed migrate seamlessly.

## Backup / restore
Backup still emits the **same JSON file format** (assemble from DB → JSON) → backward-compatible. Restore wipes tables + bulk-inserts. CSV exports unchanged (built from view-models).

## Risks & mitigations
- Largest blast radius of any change so far → dedicated `sqlite` branch; merge only when green; keep the last durable-file build pinned for rollback.
- Encryption key loss = unreadable DB → auto-backup before migration; JSON backup is the recovery valve.
- Async render regressions → `better-sqlite3` logic suite + thorough device test before merge.
- wasm asset (~1 MB) grows the bundle; CI must copy it; web DB unencrypted (documented).
- Multi-chat repo churn → isolate on `sqlite` branch.

## Rollback
If the migration build misbehaves on device, the previous durable-file APK still installs and reads its localStorage/file store (untouched by the SQLite build until migration runs). Keep that APK link handy during rollout.
