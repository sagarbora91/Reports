# Saagar Audit — 5-Minute Keystore Setup (One-Time)

**Who this is for:** Sagar, on his Windows laptop. You will run a few commands, save one file in three safe places, and paste four values into GitHub. After that, every APK GitHub Actions builds is a real **update** on your phone — not a fresh install that wipes your audit history.

**Why it matters:** Android only treats a new APK as an "update" if it is signed by the **same** keystore as the old one. We make that keystore once, today, and reuse it forever.

**You only do this once.** After it's done, every push to `capacitor` automatically produces a signed APK at the permanent URL below — no further steps from you.

---

## 1. Get keytool (comes free with Java)

`keytool` is the tool that makes the keystore. It ships **inside the JDK** — you do not install it separately.

Open **PowerShell** (press Start, type `powershell`, hit Enter) and check:

```powershell
keytool -help
```

If you see a long help message — you are done, skip to step 2.

If you see *"not recognized"*, install Java 17:

1. Go to <https://adoptium.net/temurin/releases/?version=17>
2. Pick **Windows x64 MSI**, download, run, click Next through everything.
3. **Close and reopen PowerShell**, then run `keytool -help` again.

Typical install path (good to know, you don't need to type it):
`C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot\bin\keytool.exe`

---

## 2. Generate your keystore

Copy-paste this **whole block** into PowerShell. Edit the `-dname` line first if you want different details (the values shown are fine to keep).

```powershell
cd $env:USERPROFILE
keytool -genkeypair -v `
  -keystore saagar-release.jks `
  -alias saagar `
  -keyalg RSA -keysize 2048 `
  -validity 10000 `
  -dname "CN=Sagar Bora, OU=Saagar Traders, O=Saagar Traders, L=Latur, ST=Maharashtra, C=IN"
```

It will ask you **two** things:

1. **Enter keystore password:** type a strong password, press Enter. Type it again to confirm.
2. **Enter key password for `<saagar>`:** **just press Enter** to use the same password (easiest).

When it finishes you'll have a file: `C:\Users\Sagar\saagar-release.jks`

**Write down the password right now** — in a notebook, in your phone notes, anywhere safe. You cannot recover it.

---

## 3. Back it up in 3 places — DO NOT SKIP

If you lose `saagar-release.jks` **or** forget the password:

- Every future APK you build will be treated as a **different app**.
- To install it, you (and your staff) would have to **uninstall the old app first**, losing all local audit history.
- There is no recovery. None. Google can't help. Anthropic can't help.

So put the file in **at least three** of these, today:

- Google Drive (a private folder)
- OneDrive
- A USB stick in your drawer
- Email it to yourself

Also save the **password** in the same three places.

---

## 4. Encode the keystore for GitHub

GitHub Secrets only accept text, not binary files. We turn the `.jks` into a long text blob, copied straight to your clipboard:

```powershell
cd $env:USERPROFILE
[Convert]::ToBase64String([IO.File]::ReadAllBytes("saagar-release.jks")) | Set-Clipboard
```

The encoded blob is now on your clipboard, ready to paste. (Nothing was written to disk — clean.)

If you ever need it as a file instead:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("saagar-release.jks")) | Out-File saagar-release.jks.txt -Encoding ASCII
```

---

## 5. Add 4 GitHub Secrets

Open your repo on GitHub in a browser. Go to:

**Settings → Secrets and variables → Actions → New repository secret**

Add these **four secrets**, one at a time (click "New repository secret" again for each). Names must match **exactly** — capitals and underscores included.

| Name | Value |
|---|---|
| `SIGNING_KEYSTORE_BASE64` | Paste from clipboard (the blob from step 4) |
| `SIGNING_KEYSTORE_PASSWORD` | The password you typed in step 2 |
| `SIGNING_KEY_ALIAS` | `saagar` |
| `SIGNING_KEY_PASSWORD` | Same password as `SIGNING_KEYSTORE_PASSWORD` |

---

## 6. Make sure the repo is public

(So the permanent download URL doesn't ask for a login.)

**Settings → General → Danger Zone → Change visibility**

If it's already public, skip this step.

---

## 7. Trigger a build & verify

Push any small change to `capacitor` (or click **Actions → Build APK → Run workflow** on the GitHub site).

When the build finishes, the run's summary will show:

```
Mode: release · Version: 0.2.N (versionCode N)
Permanent download URL (bookmark this, share via WhatsApp):
https://github.com/sagarbora91/Reports/releases/latest/download/app-release.apk
```

Open that URL on your Android phone, download the APK, and install it **over** your existing app. If it updates in place (audit history preserved) — you're done. Forever.

---

## The permanent download link

Bookmark this. Put it in WhatsApp. Print it as a QR code. It never changes:

**<https://github.com/sagarbora91/Reports/releases/latest/download/app-release.apk>**

Every future push to `capacitor` updates the file at this URL — so the next time someone taps it, they get the latest build.

---

**Total time:** ~5 minutes. **Frequency:** once, ever.
