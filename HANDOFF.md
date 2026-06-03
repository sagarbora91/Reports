# Saagar Audit — Session Handoff

**Purpose:** start a fresh chat with full context. Read this top-to-bottom; it's self-contained.
**Last updated:** 2026-06-03 · **Branch:** `capacitor` · **Latest commit:** `ae6678f`

---

## 1. What this is
An Android **retail compliance audit app** for Sagar (non-coder owner, Saagar Traders — Titan World + Helios stores, Latur). Plain **HTML/CSS/JS single-page app** wrapped to an **APK via Capacitor 6**, built by **GitHub Actions**. No cloud; data is on-device with a Drive-backup escape hatch. Bilingual **English + Marathi**.

Repo: `C:\Cowork\Reports Apk` · GitHub: `sagarbora91/Reports` (push to **`capacitor`** branch; safety classifier blocks pushing to `main`).

> ⚠️ There is a **separate, unrelated project** under `greetor/` in the same repo. Don't touch it unless asked.

---

## 2. How the code is structured (IMPORTANT)
The whole app ships as one self-contained `www/index.html`, but it's **edited as split source files** and re-assembled:

- Source files (in `www/`): `lzstring.js`, `config.js`, `i18n_data.js`, `reference_data.js`, `data.js`, `weekly_data.js`, `sql_driver.js`, `sqlite_backend.js`, **`app.js`** (~6k lines, the bulk), plus `style.css` and `shell.js` (Capacitor native shell, loaded as a separate `<script src>`).
- **`scripts/inline.py`** splices `style.css` + the JS files (in `JS_ORDER`) into the single inlined `<style>`/`<script>` blocks of `index.html`. `demo_seed.js` is auto-inserted after `config.js` **only if it exists** (present on the `demo` branch).
- **Always re-run `python scripts/inline.py` after editing any `www/*.js` or `style.css`**, or your change won't reach `index.html`.

### Standard edit → test loop
```bash
cd "C:\Cowork\Reports Apk"
python scripts/inline.py
python -X utf8 -c "import re; html=open('www/index.html',encoding='utf-8').read(); open('qa/app_bundle.js','w',encoding='utf-8').write(max(re.findall(r'<script>(.+?)</script>',html,re.S),key=len))"
node --check qa/app_bundle.js
cat qa/shim.js qa/app_bundle.js qa/tests.js > qa/run.js && node qa/run.js   # expect PASS: 349 FAIL: 0
npm run test:sqlite                                                        # expect PASS: 38 FAIL: 0
```
i18n keys: add new ones via `scripts/add_i18n_keys.py` (en+mr), update existing mr values via `scripts/update_i18n_mr.py`.

---

## 3. Current state — everything below is DONE, committed, CI-green
- **Core app:** roles (Owner/GM/SM/CRO), editable audit templates (daily 68-cp + weekly 36-cp + custom), per-CRO mode, equal-weight scoring (5 bands 95/90/85/80), snapshot-at-submit, CAP lifecycle, 7 escalation triggers (WhatsApp deep links), PIN auth (PBKDF2), photo capture+watermark, GPS, Drive backup/restore.
- **Bucket B:** verify gate, 9-section weekly PDF, T4/T7 escalations, full Marathi wiring.
- **Bucket C:** signed-APK pipeline + permanent GitHub Release URL (needs the 4 keystore secrets — see §6).
- **Architecture audit** (`agent_outputs/architecture_audit_2026-05-30.md`) → implemented:
  - **Stage A (v0.3.0):** Home tab ("what needs me today"), photo/FAIL-modal feedback, batch verify, pre-submit sanity check, resume-draft card + SKIP count, escalation dismiss-with-reason, storage-health banner, 44pt touch targets, strict modals (Settings toggle), CSV per-CRO fix.
  - **Stage B (v0.4.0):** `www/config.js` constants, per-CRO "Jump to CRO" escape hatch, `UiState.reset()` on logout, schema versioning + migrations + defensive lookups.
- **Storage fixes:** shared snapshot dictionary (cut 6-month data 9.7MB→3.4MB), LZString compression safety-valve on quota, photos → IndexedDB (`PhotoStore`).
- **6-month demo dataset** + generator (`qa/gen_demo_data.js`) + stress test (`qa/stress_test.js`, 78 checks).
- **SQLite migration — ALL 5 increments complete** (commits `0c2f006`→`ae6678f`). See §4.

**Tests:** `qa/tests.js` = **349 checks**; `qa/sqlite_tests.js` = **38 checks** (real SQLite via `sql.js`). Both green. CI builds the APK green on `capacitor`.

---

## 4. SQLite migration — the most recent work (spec: `agent_outputs/sqlite_migration_spec_final.md`)
**Goal:** remove the localStorage ~5MB ceiling; future-proof for many stores/years. **SHIPPED OFF BY DEFAULT.**

- `Store.load/save` delegate to `Persistence.backend` (a swappable backend). Two backends:
  - **`LocalStorageBackend`** (in `app.js`) — today's exact behaviour; the **default, production, and only harness-tested** path.
  - **`SqliteBackend`** (`www/sqlite_backend.js`) — device-only. Relational rows + JSON columns; an in-memory mirror (JSON string) gives localStorage-identical sync reads; writes go through a serialized async queue (diff-upsert, one atomic transaction); per-row corruption quarantine; verified one-time migration (import → read-back → deep-equal the LIVE object → commit only on exact match, else abort & keep localStorage).
  - **`CapacitorSqlDriver`** (`www/sql_driver.js`) — wraps the raw `@capacitor-community/sqlite@^6.0.2` plugin (`window.Capacitor.Plugins.CapacitorSQLite`).
  - **`SqlJsDriver`** (`qa/sql_js_driver.js`) — `sql.js` (wasm SQLite) for Node tests.
- **Toggle:** Settings → "Storage engine (beta)", **Owner-only + device-only** (gated on `window.SaagarShell`), pref in device-local key `saagar_sqlite_enabled` (NOT synced state). Default OFF.
- **Phase B:** `SqliteBackend.query()` + `DataQuery.audits()` accessor (indexed SQL on SQLite, in-memory fallback otherwise). Wired into `exportCsv`. Render paths still read the mirror (already fast); this is dormant future-proofing until data outgrows memory.

### ⛳ THE ONE OPEN ITEM — device validation (only Sagar can do it)
SQLite's *runtime* behaviour can't be tested in Node/CI — only that it **builds** (it does). To validate on a phone:
1. Install a build, sign in as **Owner**.
2. **Settings → "Storage engine (beta)" → enable** → complete the backup when prompted.
3. Confirm it reports success; restart the app; confirm all data is intact.
4. If anything's wrong it reverts to localStorage with data intact (backup is the extra safety net).

---

## 5. Branches & builds
- **`capacitor`** = production source of truth. Pushes here trigger CI (`.github/workflows/apk.yml`). Debug APK artifact today; **signed APK + permanent Release URL** once the 4 keystore secrets are added.
- **`demo`** = a TESTING branch with `www/demo_seed.js` (6 months of data baked in) + a "🧪 Demo data loaded" banner. **It is currently 6 commits BEHIND `capacitor`** — it does NOT yet include the SQLite work. To let Sagar test SQLite against the demo dataset, **rebase/rebuild the demo branch onto `capacitor`** (regenerate `demo_seed.js` from `qa/gen_demo_data.js`, re-inline, commit, push — CI builds it; the workflow on `demo` builds a debug artifact, no signing/Release).
- Permanent (signed) download URL once secrets exist: `https://github.com/sagarbora91/Reports/releases/latest/download/app-release.apk`
- Poll CI via the API: `curl -s "https://api.github.com/repos/sagarbora91/Reports/actions/runs?branch=capacitor&per_page=1"` (no `gh` CLI; no token in env — push triggers builds).

---

## 6. Pending / not-done (nothing is half-built)
1. **Add the 4 keystore secrets** (Sagar, ~5 min — `SIGNING_SETUP.md`): `SIGNING_KEYSTORE_BASE64`, `SIGNING_KEYSTORE_PASSWORD`, `SIGNING_KEY_ALIAS=saagar`, `SIGNING_KEY_PASSWORD`. Until then CI builds a debug artifact (GitHub-login download, 30-day expiry) and no permanent Release link.
2. **Device-validate SQLite** (§4) — the one open engineering item.
3. **On-device manual test pass** — `MANUAL_TEST_CHECKLIST.md` (camera/GPS/WhatsApp/print/Marathi native-speaker review).
4. **Refresh the `demo` branch** onto `capacitor` if Sagar wants to test SQLite with 6 months of data (offered, not yet done).
5. **Deferred by design (gate on real need):** multi-store / `store_id` (columns exist, NULL today) — do when a 3rd store (Solapur) is real.

---

## 7. Conventions / gotchas
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit/push only when it makes sense; **push to `capacitor` only**.
- `www/config.js` was hand-tuned by the user (photo `maxDim:800`, `quality:0.6`) — **don't revert**.
- After ANY `www/*.js` edit: re-run `inline.py`, re-extract bundle, run both test suites; keep them green before committing.
- Don't `git add -A` (sweeps in `greetor/` + stray `agent_outputs/`); stage files explicitly.
- `node_modules`, `qa/*_run.js`, `qa/app_bundle.js`, `qa/demo_state.json` are gitignored.
- Reference docs in `agent_outputs/`: `architecture_audit_2026-05-30.md`, `sqlite_migration_plan.md`, `sqlite_migration_spec_final.md`, `weekly_report_spec.md`.
- Auto-memory: `C:\Users\Sagar\.claude\projects\C--Cowork-Reports-Apk\memory\project_reports_apk.md`.

---

## 8. Suggested first message for the new session
> "Read HANDOFF.md. The SQLite migration is complete and off-by-default; everything's green on `capacitor` (349 + 38 tests). Next I want to [pick one]: (a) refresh the demo branch so I can test SQLite with 6 months of data on my phone, (b) help me add the keystore secrets for a permanent signed APK, or (c) [your thing]."
