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

Expected tail: `PASS: 128   FAIL: 0   ALL GREEN ✅`

## Files
- `shim.js` — minimal DOM / localStorage / sessionStorage / crypto / FileReader
  shim so the app boots under Node.
- `tests.js` — the assertion battery (16 areas + render smoke tests).
- `app_bundle.js`, `run.js` — generated, gitignored.

## What it covers
Scoring (equal-weight, NA exclusion, empty/zero), bands, weekly formula,
per-CRO, templates + builder, snapshot immunity, CAP lifecycle + aging,
escalations, auth/PBKDF2, week math, phone/WhatsApp, role gating, and a
render smoke test of every screen × both roles × EN/MR.

## What it does NOT cover (manual phone testing only)
Real tap/DOM events, camera + canvas watermark, GPS, Web Share to Drive,
Capacitor native layer, and on-device install. See `AUDIT_REPORT.md`.
