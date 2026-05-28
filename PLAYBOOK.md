# The Non-Coder's App-Building Playbook
### What I learned building the Saagar Audit app — so I can do it again

> Written for me (Sagar) — a retail business owner, not a programmer — after building
> a real, working Android app with an AI assistant over two days. Keep this. Re-read
> it before starting the next app. It is opinionated on purpose.

---

## PART 1 — WHAT WE ACTUALLY BUILT

**Saagar Audit** — an Android app (`.apk`) my Store Manager / GM / Owner use to run
daily retail compliance audits at the Titan World and Helios stores in Latur.

What it does today:
- PIN login with 3 roles (Owner, GM, Store Manager)
- 68-point daily audit (Pass / Fail / N/A), automatic scoring into 5 bands
- Photos with date + time + GPS + auditor name burned onto the image
- CAPs (Corrective Action Plans) — every failure becomes a trackable fix-it task
- Auto-escalations: a bad audit composes a WhatsApp message to the GM/Owner in one tap
- Weekly audit (GM-led) on top of the daily ones
- Reference tab (rating scale, escalation triggers, evidence guide, 65-word glossary)
- Full English ⇄ Marathi toggle
- Backup to Google Drive; everything stored on the phone (no monthly cloud bill)

**Total cash cost so far: ₹0.** Public GitHub repo, free build minutes, no Firebase,
no Play Store fee yet. The only future cost is a one-time ₹2,000 Play Store account
*if* I ever want to publish it publicly (I don't need to — I can just install the file).

---

## PART 2 — THE ONE BIG IDEA

I do not write code. I do not need to. Here is the actual model that worked:

```
   I describe what I want, in plain language
              ↓
   The AI writes the code
              ↓
   GitHub (a free website) stores the code
              ↓
   GitHub Actions (a free robot) turns the code into an installable APK
              ↓
   I download the APK to my phone and try it
              ↓
   I tell the AI what's wrong or what's next  → repeat
```

The magic piece most people miss: **I never installed any programming tools on my
laptop.** No Android Studio, no SDKs, nothing. A free robot on GitHub builds the app
in the cloud every time the code changes, and hands me a file to install. My job is
to *describe, test, and decide* — not to build.

---

## PART 3 — THE JOURNEY (the honest version, with the detour)

The whole thing took **~2 days of active work**. It was NOT a straight line. The
detour is the most important lesson, so I'm keeping it.

### Day 0 — The expensive wrong turn (≈2 hours, later thrown away)
- I said "I want a report app for Android, can we use GitHub."
- The AI asked good questions. I answered. Then I shared a very detailed spec
  document I'd had prepared (`Saagar_P1_App_Spec`). That spec demanded **Flutter** —
  a serious, professional app framework.
- The AI dutifully followed the spec and built two "weeks" of a Flutter app.
- **The builds kept failing.** It needed toolchains, dependencies, signing — a lot of
  machinery. I got overwhelmed and said *"this is getting too complicated."*

> 🔑 **Lesson #1 — Match the tool to the builder, not to the fanciest spec.**
> The spec was technically excellent and completely wrong *for me*. A spec written
> to impress an engineer will bury a non-coder. I should have said up front:
> "I'm not a coder, I want the simplest thing that ships."

### Day 1 morning — The pivot that worked (≈1 hour to first working app)
- I said the thing that fixed everything: *"I want an APK, the fast and easy way,
  like before."*
- We threw away Flutter and switched to a **single HTML file wrapped into an APK by
  Capacitor**. Same idea as a web page, packaged as an app.
- Dropped Firebase (cloud database) entirely. Data lives on the phone; backup goes to
  Google Drive via the normal Android "Share" button.
- **First green build + installable APK within the hour.**

> 🔑 **Lesson #2 — Ship the simplest version first, then add.** The first useful app
> had no login, no photos, no cloud — just the audit and a score. That was enough to
> prove it worked on my phone. Everything else got layered on after.

### Day 1 afternoon → Day 2 — Layering features, one build at a time
Each of these was a separate "ship it, test it, next" cycle:
- Photos → full history → PDF export → CRO performance summary
- Roles + PIN login + user management (after I said "there are no roles, no masters")
- CAPs (corrective action plans)
- Escalation engine + WhatsApp
- Timestamped + GPS photos
- A bug-fix sweep
- Bilingual Marathi + Reference tab
- Weekly audit

> 🔑 **Lesson #3 — One feature per build.** Every time we tried to do too much at
> once, something broke and was hard to trace. Small commits = easy to find what broke.

### The CI (build robot) fights — and how we won them
The build robot failed several times. Each had a boring, findable cause:
- It was watching the wrong branch (the "default branch" setting).
- It tried to cache something that didn't exist.
- It needed fonts installed to draw text on images.

> 🔑 **Lesson #4 — "Build failed" is almost never mysterious.** It's usually a missing
> file, a wrong setting, or a typo. The AI can read the failure log (via the GitHub
> link) and fix it. My job was just to paste the error or the screenshot.

### The "maximum agents" experiment
At one point I said "fire up maximum agents to go faster." We launched 4 AI helper
agents in parallel to prep translations / reference content / data.
- The first batch (3 agents) mostly worked.
- The second time, **3 of 4 got rate-limited by the servers and died.**

> 🔑 **Lesson #5 — Parallel AI agents help, but ~2 at a time is the real ceiling.**
> They're great for *bulk prep that doesn't touch the main app file* (translating 469
> phrases, extracting reference tables). They are NOT good at editing the same file at
> once — that causes conflicts. Use them like research assistants, not co-authors.

### Running a second AI tool at the same time
I also had another AI tool building a sister "Greetor" walk-in form in the same repo.

> 🔑 **Lesson #6 — One AI tool per file at a time.** When two tools edited the same
> file simultaneously, work got overwritten and had to be redone. If you run two,
> give them separate files / separate apps.

---

## PART 4 — THE TECH STACK WE LANDED ON (and why it's right for a non-coder)

Don't memorize this. Just know these are the "Lego bricks" that worked. For the next
app, start here unless there's a real reason not to.

| Brick | What it is | Why we used it |
|---|---|---|
| **HTML / CSS / JavaScript** | The language of web pages | Simplest thing that runs everywhere; one file |
| **Capacitor** | Wraps a web page into a real APK | Turns the web page into an installable Android app |
| **GitHub** | Free website that stores code | The home base; also where the build robot lives |
| **GitHub Actions** | Free "build robot" (CI) | Builds the APK in the cloud on every change — no tools on my laptop |
| **localStorage** | The phone's built-in memory | Stores all data on-device, free, no cloud bill |
| **Web Share API** | Android's "Share" button | Backs up data to Google Drive / WhatsApp |
| **Web Crypto** | Built-in password scrambler | Secures the 4-digit PINs |
| **Canvas** | Built-in image drawing | Stamps date/time/GPS onto photos |

What we **deliberately avoided** (and you probably should too, at first):
- **Flutter / React Native** — powerful, but heavy machinery; overkill for v1.
- **Firebase / any cloud database** — adds monthly bills, setup, and a login system
  you may not need. On-device + Drive backup was enough.
- **The Play Store** — you can install an APK directly. Only publish if you need the
  public to find it.

---

## PART 5 — THE REUSABLE PLAYBOOK (do this for the next app)

### Step 0 — Write the "job" in one paragraph
Plain language. *"I want an app my staff open on their phone to [do X], that saves
[Y] on the device, and lets me [Z]."* No tech words. This is your north star.

### Step 1 — Say the magic sentence to the AI
> *"I'm not a coder. I want the simplest possible Android app — a single HTML page
> wrapped into an APK with Capacitor, built by GitHub Actions, data stored on the
> phone. No Flutter, no Firebase, no Play Store. Start with the smallest version that
> works."*

This one sentence skips the entire 2-hour detour I took.

### Step 2 — Set up the home base (one-time, ~10 min, AI guides you)
- Make a free GitHub account.
- Make a new repository (private or public).
- The AI sets up the "build robot" file (`.github/workflows/apk.yml`).
- ⚠️ **Set the repository's DEFAULT BRANCH to the branch you're working on**, or the
  robot won't run. (This bit me — see Lesson #4.)

### Step 3 — Get the dumbest version onto your phone TODAY
- One screen. One button. Prove the pipeline works end-to-end:
  code → GitHub → robot builds APK → you install it.
- Once you've installed *anything* the app made, the hard part is over.

### Step 4 — Add one feature at a time
For each feature: describe it → AI builds it → robot makes a new APK → you install &
test on the real phone → you say "good" or "fix this." Repeat.

### Step 5 — Use AI helper agents for bulk prep only
Translating, extracting tables from documents, generating reference lists — fire 1–2
background agents for that. Don't use them to edit the main app file.

### Step 6 — Back up and write things down
- Export your data to Drive regularly (the app should have a button for this).
- Keep a running note of decisions ("we chose X because Y") — future-you forgets.

---

## PART 6 — COPY-PASTE CHECKLIST FOR THE NEXT APP

```
SETUP
[ ] Wrote the "job" in one plain-language paragraph
[ ] Said the magic sentence (HTML + Capacitor + GitHub Actions, no Flutter/Firebase)
[ ] Created GitHub repo
[ ] Build-robot workflow file added
[ ] Default branch set correctly so the robot runs
[ ] First trivial APK installed on my phone   ← do NOT proceed until this works

BUILD LOOP (repeat per feature)
[ ] Described ONE feature in plain language
[ ] AI built it
[ ] Build went green (robot finished, no red X)
[ ] Downloaded APK, installed, tested on real phone
[ ] Said "good" or pasted the error/screenshot
[ ] Committed before starting the next feature

DATA & SAFETY
[ ] Data saves on the device (works offline)
[ ] Backup-to-Drive button works
[ ] Tested: restore from a backup file
[ ] If photos: confirmed camera opens on the real phone (not just preview)
[ ] If login: confirmed I can't lock myself out (know the reset path)

BEFORE CALLING IT "DONE"
[ ] Installed the final APK fresh on a clean phone
[ ] Walked the whole flow as a real user would
[ ] Exported a backup and kept it somewhere safe
[ ] Wrote down what's still missing / known issues
```

---

## PART 7 — MISTAKES TO AVOID (paid for in time, so you don't have to)

1. **Don't hand the AI a fancy engineering spec if you're not an engineer.** It will
   build the fancy thing and you'll drown. Lead with "simplest that ships."
2. **Don't add a cloud database (Firebase) "to be safe."** On-device + Drive backup
   covers most small-business needs and costs nothing.
3. **Don't try to build 5 features in one go.** One per build. Always.
4. **Don't run two AI tools on the same file.** They overwrite each other.
5. **Don't fire 4+ agents at once.** ~2 is the real limit before the servers throttle.
6. **Don't skip testing on the actual phone.** The preview lies — the camera,
   GPS, share-sheet, and "install from unknown sources" only behave correctly on the
   real device.
7. **Don't panic at a red "build failed."** It's almost always one small thing. Send
   the AI the error.

---

## PART 8 — TINY GLOSSARY (the only words you need)

- **APK** — the installable Android app file. You tap it to install.
- **Repo (repository)** — the folder on GitHub that holds your app's code.
- **Branch** — a version line of the code. We worked on one called `capacitor`.
- **Commit** — a saved snapshot of a change, with a note about what changed.
- **CI / GitHub Actions / "the build robot"** — the free cloud service that turns
  code into an APK automatically.
- **Capacitor** — the tool that wraps a web page into an APK.
- **localStorage** — the phone's on-device memory where the app saves data.
- **Agent** — an AI helper you send off to do one prep task on its own.
- **PWA** — an even simpler option: a web page you "Add to Home Screen" so it looks
  like an app, with no APK at all. (We chose APK, but PWA is worth remembering.)

---

## PART 9 — THIS PROJECT'S TIMELINE (for reference)

| When | What happened |
|---|---|
| Day 0 | Flutter attempt per the detailed spec — builds failed, got overwhelmed |
| Day 0 | **Pivot** → HTML + Capacitor; dropped Firebase; first working APK |
| Day 0 | Added Drive backup, photos, history, PDF, CRO summary |
| Day 1 | Fixed the build robot (branch, cache, fonts); added roles + PIN login |
| Day 1 | Built CAPs, then the escalation engine + WhatsApp |
| Day 1 | Timestamped + GPS photos; a bug-fix sweep |
| Day 1 | Background agents → bilingual Marathi + Reference tab |
| Day 2 | Weekly audit |

24 commits, ~2 active days, ₹0 spent, one installable app my staff can use.

---

## PART 10 — WHAT'S LEFT ON THIS APP (so I remember)

- Verify gate (GM signs off daily audits)
- Weekly report as a 1-page PDF
- Two more escalation triggers (inventory variance, declining trend)
- Monthly audit + trend charts
- A native-language review pass on the Marathi
- (Optional) sign the APK + publish to Play Store

---

*Keep this file in every app repo you start. Update it each time you learn something
new. This is the asset — not any single app.*
