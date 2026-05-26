# Saagar Audit

Android app for daily retail compliance audits at Saagar Traders' Titan World (`WLMHW`) and Helios (`HEMW`) outlets, Latur.

## What this is

A single-page HTML/JS app wrapped as an Android APK by [Capacitor](https://capacitorjs.com). All audit data lives on your phone in `localStorage` — nothing leaves the device unless you tap **Export CSV**.

68 daily checkpoints across 8 SOPs, weighted to a max of 90 points, scored to a 5-band rating per the [Saagar P1 Spec](Documentation/Saagar_P1_App_Spec_v1.docx) — Excellent ≥ 95%, Good ≥ 90%, Fair ≥ 85%, Poor ≥ 80%, Critical < 80%.

## How to get the APK

Every push to `main` or `capacitor` triggers a GitHub Actions build at <https://github.com/sagarbora91/Reports/actions>:

1. Wait for the green check (~5 minutes on a cold cache, ~2 minutes warm).
2. Open the run → **Artifacts** panel at the top → download `saagar-audit-<sha>.zip`.
3. Unzip → you'll get `app-debug.apk`.
4. Transfer the APK to your Android phone (USB, Google Drive, WhatsApp self-chat, whatever).
5. Open it from your file manager — Android will prompt you to allow installs from unknown sources. Approve, then tap Install.
6. Open the **Saagar Audit** app.

## Using the app

**First time**:
1. Go to **Settings** tab → **+ Add CRO** for each of your floor staff.
2. Switch to **Audit** tab → enter your name → today's date is pre-filled → tick the CROs on duty → **Start daily audit**.

**Each checkpoint**:
- **PASS** — auto-advances to the next.
- **FAIL** — popup asks for a short finding (5+ chars) and which CRO is involved (optional).
- **N/A** — popup asks the reason.

After all 68 checkpoints you'll see the score. Hit **Submit audit** and it appears in **History**.

## Repository structure

```
Reports/
├── www/                # The actual app (HTML + CSS + JS + data)
│   ├── index.html
│   ├── style.css
│   ├── app.js          # State, score logic, UI rendering
│   └── data.js         # 68 checkpoints + 8 SOPs, baked in
├── capacitor.config.json
├── package.json        # Capacitor deps
├── .github/workflows/
│   └── apk.yml         # CI: npm install → cap add android → gradle assembleDebug
└── Documentation/      # Original .docx spec & workbook
```

The `android/` folder is **not committed** — CI regenerates it cleanly from the `www/` folder on every push.

## Branches

- **capacitor** — the active branch you're looking at.
- **phase-1** — earlier Flutter scaffolding (preserved for reference; not currently buildable).

## Local development (optional)

You don't need this to ship — CI does the build. But if you want to iterate on the HTML locally:

1. Open `www/index.html` in Chrome on your laptop — the app runs as-is.
2. Edit, refresh, repeat.
3. Push to GitHub when ready; CI rebuilds the APK.

If you want to test the actual Android build locally:
```bash
npm install
npx cap add android      # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```
That needs Node 20+, Java 17+, and the Android SDK installed.
