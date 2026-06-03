# QA harness

Runs the **real app code** under Node with a browser shim, then drives every
flow with dummy data and asserts the results. No phone or browser needed.

## Run it

```bash
# from repo root
python -X utf8 -c "import re; html=open('www/index.html',encoding='utf-8').read(); open('qa/app_bundle.js','w',encoding='utf-8').write(max(re.findall(r'<script>(.+?)</script>',html,re.S),key=len))"
node --check qa/app_bundle.js
cat qa/shim.js qa/app_bundle.js qa/tests.js > qa/run.js
node qa/run.js
```

Expected tail: `PASS: 349   FAIL: 0   ALL GREEN ✅`

## SQLite backend suite (real SQLite via sql.js)

The SqliteBackend (device-only, off by default) is proven in Node against a
*real* SQLite engine (`sql.js`) before it ever runs on a phone:

```bash
npm run test:sqlite      # cat shim + bundle + qa/sqlite_tests.js, run it
```

Expected tail: `PASS: 38   FAIL: 0   ALL GREEN ✅` (the quarantine / write-failed
/ verify-failed console lines are the safety mechanisms firing in their test
scenarios — expected). Covers: round-trip parity with localStorage, catch-all
scalars, per-row corruption quarantine, diff-upsert statement counts,
batch-failure mirror rollback, and the verified one-time migration
(aborts without a verified backup / on any read-back mismatch).

(Count grows as features land — what matters is `FAIL: 0`. The build step now
prepends `config.js` to the bundle, so `CONFIG` is in scope for the tests.)

## Files
- `shim.js` — minimal DOM / localStorage / sessionStorage / crypto / FileReader
  shim so the app boots under Node.
- `tests.js` — the assertion battery (33 areas + render smoke tests).
- `app_bundle.js`, `run.js` — generated, gitignored.

## What it covers
Scoring (equal-weight, NA exclusion, empty/zero), bands, weekly formula,
per-CRO, templates + builder, snapshot immunity, CAP lifecycle + aging,
escalations, auth/PBKDF2, week math, phone/WhatsApp, role gating, and a
render smoke test of every screen × both roles × EN/MR.

## What it does NOT cover (manual phone testing only)
Real tap/DOM events, camera + canvas watermark, GPS, Web Share to Drive,
Capacitor native layer, and on-device install. See `AUDIT_REPORT.md`.
