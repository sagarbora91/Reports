# Greetor APK — Signing Setup Guide

This guide helps you switch from unsigned debug builds to signed release builds.
Once you complete these steps, every push automatically produces a signed APK with
a permanent, bookmarkable download URL.

---

## WARNING — Read this before your first signed build

The first signed build **cannot install over an existing debug APK**.
Android enforces certificate consistency: if the installed app was signed with the
debug certificate and the new one uses your release keystore, Android will refuse
the update.

**Every phone that has the debug Greetor app must:**
1. Go to the app's Settings → (inside Greetor) Back up / Export data first.
2. Uninstall the debug Greetor app completely. This wipes local app data.
3. Install the new signed APK from the Release URL.

Do this for every device before sharing the release URL broadly.

---

## Keep your keystore backed up forever

If you lose the keystore file or forget the passwords, you can **never** publish
an update that installs over existing installs. Treat the keystore like a password
manager master key:

- Store the `.jks` file in a safe location (cloud drive, encrypted USB, etc.).
- Write down the passwords somewhere secure (password manager).
- Do not store the keystore inside the Git repo.

---

## Step 1 — Generate a keystore

Run this command on any machine with Java installed (the same JDK used by CI works):

```bash
keytool -genkey -v \
  -keystore saagar-greetor-release.jks \
  -alias greetor \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

When prompted:

| Prompt | What to enter |
|---|---|
| Enter keystore password | Choose a strong password — this protects the whole file |
| Re-enter new password | Same password again |
| What is your first and last name? | Your name or your company name (e.g. `Saagar Traders`) |
| What is your organizational unit? | Can leave blank or type `IT` |
| What is your organization? | e.g. `Saagar Traders` |
| What is your city? | e.g. `Latur` |
| What is your state? | e.g. `Maharashtra` |
| What is your two-letter country code? | `IN` |
| Is CN=… correct? | Type `yes` |
| Enter key password for greetor | Choose a second password (can be the same as the keystore password) |

This creates `saagar-greetor-release.jks` in the current directory.

---

## Step 2 — Base64-encode the keystore

The keystore must be stored as a text secret in GitHub. Encode it to base64:

**Mac / Linux:**
```bash
base64 -i saagar-greetor-release.jks | tr -d '\n'
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("saagar-greetor-release.jks"))
```

Copy the entire output (one long string, no line breaks).

---

## Step 3 — Add the four GitHub repository secrets

Go to your repository on GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

Add these four secrets with the exact names shown:

| Secret name | Value |
|---|---|
| `SIGNING_KEYSTORE_BASE64` | The base64 string from Step 2 |
| `SIGNING_KEYSTORE_PASSWORD` | The keystore password you chose in Step 1 |
| `SIGNING_KEY_ALIAS` | `greetor` (or whatever alias you used with `-alias`) |
| `SIGNING_KEY_PASSWORD` | The key password you chose at the end of Step 1 |

---

## Step 4 — Push any change to trigger a build

The workflow auto-detects the presence of `SIGNING_KEYSTORE_BASE64`. The next push
to the `capacitor` branch will:

1. Decode the keystore and inject the signing config into Gradle.
2. Run `assembleRelease` instead of `assembleDebug`.
3. Publish the signed APK to the `latest-greetor` GitHub Release.
4. Print the permanent download URL in the build summary.

**Permanent download URL (once the first signed build completes):**
```
https://github.com/<your-org-or-user>/<repo>/releases/latest/download/saagar-greetor.apk
```

Bookmark this URL and share it via WhatsApp. It always points to the latest signed build.
Future pushes update the same Release in place — the URL never changes.
