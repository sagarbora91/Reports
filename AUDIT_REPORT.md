# Saagar Audit — QA Audit Report

**Date:** 2026-05-28
**Build under test:** `capacitor` branch, post-Phase-C (templates + per-CRO)
**Method:** Automated harness running the *real* app code under Node with a
browser shim, driving every flow with dummy data and asserting outcomes, plus
static cross-checks and targeted manual code review.

---

## Result: ✅ 128 / 128 checks pass

No logic or render errors found in the automated battery. Two stale-wording
bugs from the equal-weight switch were found by code review and fixed.

---

## How it was tested

The whole app's JavaScript is loaded into Node with a shim that fakes the
browser (`localStorage`, `document`, `crypto`, `FileReader`, etc.). The tests
then call the app's own functions with dummy data — creating users, running
audits, marking checkpoints, submitting, building templates, etc. — and check
the results are exactly right. This exercises the real code, not a copy.

Re-runnable any time: see `qa/README.md`.

## Coverage — 16 areas

| # | Area | Checks | Result |
|---|---|---|---|
| 1 | Boot / seed (templates, data, i18n, reference) | 7 | ✅ |
| 2 | Score bands — strict boundaries (95/90/85/80) | 8 | ✅ |
| 3 | Equal-weight scoring + N/A exclusion + empty/zero | 6 | ✅ |
| 4 | Weekly score formula invariants | 4 | ✅ |
| 5 | User auth — PBKDF2 hashing, login, wrong PIN | 8 | ✅ |
| 6 | Daily audit full flow (mark 68 → submit → score) | 10 | ✅ |
| 7 | Snapshot immunity (edit template ≠ change past audit) | 1 | ✅ |
| 8 | CAP lifecycle (open → done → verified → closed) | 4 | ✅ |
| 9 | Escalations (T1 critical band, T5 theft keyword) | 3 | ✅ |
| 10 | Template builder (create / edit / delete) | 4 | ✅ |
| 11 | Per-CRO audit (per-CRO scores + pooled + CAP attribution) | 10 | ✅ |
| 12 | ISO week math | 2 | ✅ |
| 13 | Phone normalize + WhatsApp deep-link | 4 | ✅ |
| 14 | Role gating (who can run daily/weekly/monthly) | 5 | ✅ |
| 15 | **Render smoke** — every screen × Owner/GM/SM × EN/MR | 40 | ✅ |
| 16 | Edge cases (SKIP, CAP aging, replay-safety, weekly-from-dailies, custom monthly, backdating) | 12 | ✅ |

Plus two static cross-checks:
- **Buttons ↔ handlers:** all 68 rendered `data-action` buttons have a matching
  handler; no dead buttons, no orphan handlers.
- **Syntax:** `node --check` clean; balanced braces / parens / backticks.

## Specific behaviours verified with dummy data

- 3 pass / 1 fail (mixed weights) → **75.0%** — confirms weights are ignored
  (equal-weight), Cash/Inventory no longer double-count.
- 2 pass / 1 fail / 1 N/A → **66.7%** — N/A excluded from both sides.
- All-N/A and nothing-marked → **100%**, no divide-by-zero crash.
- Submit, then delete a checkpoint from the live daily template → the past
  audit's detail is **unchanged** (frozen snapshot works).
- Per-CRO grooming: CRO1 50% + CRO2 100% → pooled **75%**, and CRO1's failure
  produced **1 CAP attributed to CRO1**.
- Critical daily audit (<80%) raised the **T1** escalation; a finding
  containing "theft" raised the **T5** escalation to the Owner.
- CAP past its deadline → auto-**aged**. Re-running CAP creation on the same
  audit created **no duplicates** (replay-safe).
- Custom **Monthly** template (Owner-only) ran end-to-end, scored 50%, froze
  its snapshot, and correctly raised **no** daily escalations.

## Bugs found and fixed

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | Cosmetic | Review screen + printed report said "X of Y **weighted** points" — misleading after the move to equal weighting | Now reads "X of Y points" |
| 2 | Minor (could mislead) | Weekly review + history showed the daily contribution out of a hardcoded **/68** — wrong if the daily checklist is edited | Now derives from the daily template's live count |

The FAIL → cancel path was reviewed and is **correct**: tapping FAIL opens the
dialog but records nothing until you Save, so cancelling leaves no stray fail.

## What automation does NOT cover — manual phone checklist

These need a real device because they touch the camera, GPS, native share
sheet, or actual touch events:

- [ ] Install the APK; first-run setup creates the Owner
- [ ] Login PIN pad + 5-wrong lockout on the real screen
- [ ] 📷 Take photo opens the **camera** (not just the gallery) and the
      watermark (date/time/GPS/name) renders on the saved image
- [ ] GPS permission prompt + coordinates appear on the stamp
- [ ] Escalation "Send on WhatsApp" opens WhatsApp with the message pre-typed
- [ ] Backup → Drive via the Android share sheet; Restore from that file
- [ ] Print / Save as PDF opens the print dialog
- [ ] Marathi toggle reads correctly across screens (native-speaker review)
- [ ] Build a custom template on the phone, run it, confirm it scores

## Verdict

The **logic and view layers are sound** — every audit type (daily, weekly,
monthly, custom), both scoring modes (store, per-CRO), the builder, CAPs, and
escalations behave correctly under dummy data, and every screen renders for
every role in both languages without error. Remaining risk is confined to the
**device-only features** in the manual checklist above.
