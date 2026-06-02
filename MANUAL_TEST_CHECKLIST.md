# Saagar Audit — On-Device Test Checklist

**What this is:** the things the automated harness (286 checks) *can't* test —
camera, GPS, WhatsApp, the print dialog, real taps, and how the new screens
feel on an actual phone. Work top-to-bottom on the installed APK. Tick each box;
note anything that feels off and tell me.

**Build:** install `app-release.apk` from the permanent link (after you add the
keystore secrets) or the debug artifact from the latest green Actions run.
The Settings footer should read `v0.x.NN (sha)` — that confirms you're on the
build you think you are.

---

## 0. Install & first run
- [ ] APK installs (you may need "Install unknown apps" for your browser once)
- [ ] First launch shows **first-time setup**; creating the Owner works
- [ ] Owner can add a Store Manager (SM) and a GM in Settings → Users
- [ ] Each new user can sign in with their own 4-digit PIN
- [ ] 5 wrong PINs → 60-second lockout message appears

## 1. The new Home tab (Stage A #1)
- [ ] On first install the app opens on **Home** (the new first tab)
- [ ] As **SM** with no audit today: Home shows a **"Run today's daily audit"** card
- [ ] After submitting today's audit: Home shows a green **"Today's daily audit — done · NN%"** card
- [ ] As **GM/Owner** with audits awaiting sign-off: Home shows **"Audits waiting for verification"** with a count
- [ ] The little number badge on the **Home** tab matches how many things need you
- [ ] If nothing is pending, Home shows **"All clear"**
- [ ] Switch to another tab, close & reopen the app → it reopens on the tab you left (not forced back to Home)

## 2. Daily audit walk (SM)
- [ ] Start daily audit → date defaults to today, CRO pickers work
- [ ] PASS / FAIL / N/A buttons are easy to hit (44pt targets)
- [ ] **SKIP** a checkpoint → the skip button then shows **"Skip (1 pending)"**
- [ ] Leave the audit mid-way, reopen the app → Home/Audit shows a **"Audit in progress · CP N of M · started …"** resume card with Continue / Discard

## 3. FAIL + photo flow (Stage A #2 + #3) — the camera matters here
- [ ] Tap **FAIL** → modal opens; typing a finding works, keyboard doesn't hide the Save button (it scrolls into view)
- [ ] Tap **Take photo** → the **camera** opens (not just the gallery)
- [ ] While the photo processes, the **Save button shows "Saving photo…"** and is disabled
- [ ] Saved photo shows the **watermark** (date / time / your name / CP / GPS) burned into the image
- [ ] Toast after saving says **"Photo added (NN KB · GPS ✓)"** outdoors, or **"… no GPS — indoors?"** inside
- [ ] **Deny** the camera permission once → you get a clear toast (not silent failure)
- [ ] Tap **outside** the FAIL modal (the dark backdrop) → it does **NOT** close and lose your typing (strict modals)
- [ ] Settings has a **"Protect modals from accidental close"** toggle; turning it off makes backdrop-tap close modals again

## 4. Pre-submit check (Stage A #6)
- [ ] Attach a photo to a checkpoint but leave it without a verdict, then Submit → a **"Submit this audit?"** warning lists the issue with **Fix / Submit anyway**
- [ ] "Submit anyway" works and the warning is recorded in the audit notes

## 5. Per-CRO grooming audit + escape hatch (Stage B #7)
- [ ] Run a per-CRO template (or set a template to "Score each CRO separately") with 2+ CROs on duty
- [ ] After finishing a CRO you reach the handoff screen with that CRO's score
- [ ] The **"Jump to a CRO to fix a verdict"** dropdown appears (handoff + final review)
- [ ] Pick an earlier CRO → their **checklist** opens; tap a row → re-mark it (P/F/NA)
- [ ] **"Done"** returns you to where you were; the changed verdict is reflected in that CRO's score

## 6. GM verify + batch verify (verify gate + Stage A #5)
- [ ] As GM/Owner, open a submitted daily audit → **"Verify this audit"** button (you can't verify your own)
- [ ] Verify modal shows a few spot-check verdicts + a note field; confirming stamps **"✓ Verified by {name}"**
- [ ] From Home, **"Verify now"** opens the **batch list**; verifying a row auto-advances to the next; finishing toasts **"All audits verified ✓"**

## 7. Escalations → WhatsApp (Stage A #4)
- [ ] Submit a daily audit below 80% (lots of FAILs) → an **alert card** appears
- [ ] **"Send on WhatsApp"** opens WhatsApp to the right person with the 4-part message pre-typed
- [ ] **Dismiss** now asks for a **reason** (chips + free text) before it goes away
- [ ] A sent/dismissed alert is clearly distinguishable from an open one

## 8. Weekly report (PDF) + escalations
- [ ] As GM, run the weekly audit; the entry card shows how many daily audits are in this week
- [ ] **Print / Save as PDF** produces the **9-section weekly report** (headline, trend, 7-day health, compliance breakdown, findings, patterns, CAPs, escalations, sign-off)
- [ ] A weekly **Inventory** FAIL raises a **T4** alert to the Owner
- [ ] (Over several weeks) three declining weeks raise a **T7** alert

## 9. CAPs lifecycle
- [ ] FAILs auto-create CAPs (visible on the CAPs tab with the count badge)
- [ ] SM can mark a CAP done → GM/Owner can verify → close
- [ ] CAP past its deadline shows as **aged/overdue**

## 10. Storage, backup & data safety (Stage A #12a + Stage B #10)
- [ ] Settings → Backup shows **"Last backup: N days ago"**; after a backup it updates
- [ ] **Back up to Drive** opens the Android share sheet; the file lands in Drive/OneDrive/WhatsApp
- [ ] **Restore** from that file brings audits back and asks you to sign in again
- [ ] (Heavy use) if storage passes 70%, an amber **"Storage is filling up"** banner appears on Home/Audit/Settings
- [ ] CSV export of a **per-CRO** audit produces rows (one per CRO × checkpoint)

## 11. Shared-device hygiene (Stage B #11)
- [ ] User A sets a CAP filter / History "Trends" view / glossary search, then **Sign out**
- [ ] User B signs in → none of A's filters/searches carry over (clean slate)

## 12. Marathi (native-speaker review)
- [ ] Settings → Language → मराठी switches the whole app
- [ ] **Home tab cards** read correctly in Marathi (newly translated)
- [ ] **Batch-verify** and **Jump-to-CRO** screens read correctly in Marathi
- [ ] Checkpoints, bands, CAP statuses, buttons, toasts all read naturally
- [ ] Note: printed PDF + WhatsApp escalation text stay **English by design** (formal records / forwardable) — confirm that's still what you want

---

### When you're done
Tell me: which boxes failed, anything that *worked* but felt awkward, and any
Marathi wording a native speaker would phrase differently. I'll fold fixes into
the next build.
