# Saagar Greetor — Cloud Sync: Decision Record & Execution Plan

**Status: DEFERRED (not triggered yet) — 2026-06-03**

Decision: do **not** build cloud sync now. The app stays on its current
local-first model (synchronous `localStorage` working copy + Capacitor
Filesystem durable mirror + manual JSON backup/restore via the share sheet).
This matches the multi-expert architecture audit, which said cloud sync is
warranted *only* when a second store opens or staff genuinely work from
separate devices.

This document records the plan + the decisions already made, so execution can
start at Phase 1 (skipping most re-analysis) the moment the trigger fires.

---

## When to build it — TRIGGER CONDITIONS

Build cloud sync when **any** of these becomes true:
1. **2+ phones in daily use** on the floor (multiple greetors / a manager each
   on their own device) needing one shared customer + lead pool.
2. **Manager/Owner needs a live whole-store view** they cannot get from the
   manual backup/restore + Reports today.
3. **A second physical store opens** (e.g. Solapur) and the Owner needs a
   cross-store roll-up.

Until then, the interim "sync" is: each device backs up (Settings → Back up),
and data is restored/merged manually. Good enough for one shared phone.

## Interim guidance (now)
- One shared counter phone is the supported model.
- Daily backup reminder is on; encourage Back up after busy days.
- The durable Filesystem mirror already protects against WebView eviction.
- Reinstall/device-loss recovery = restore the JSON backup.

---

## DECISIONS ALREADY LOCKED (so Phase 0 is short later)

| Decision | Choice | Why |
|---|---|---|
| Backend | **Firebase Firestore** | Built-in offline-first (queue offline → sync on reconnect → realtime listeners); free Spark tier covers one store; reuses existing `saagar-reports` Firebase project; matches original spec. |
| Topology | **One physical location, multiple counters** → **one shared sync pool (one `storeId`)**; `store` (Tanishq/Titan World/Helios) stays a field on each record. | Confirmed by owner: counters at one shop, not separate stores. |
| Sync model | **localStorage stays the synchronous UI source of truth; a new `sync.js` reconciles it with Firestore** (write-through up + listener-driven pull down). | Preserves the entire existing synchronous codebase — no async rewrite of render/handlers. Extends the durable-file write-through pattern we already have. |
| Identity | **Keep local 4-digit PIN as the floor unlock + Firebase Anonymous Auth per device**; the **user list syncs** (shared registry). No Firebase email/phone login. | Fast floor UX unchanged; rules can still require auth + scope by store; consistent with spec (no Firebase Auth for humans). |
| Conflict policy | **Per-entity, field-level last-write-wins by `updatedAt`**; log overrides to the audit trail. | Records are append-mostly and each greetor owns their captures → true conflicts rare. |

## Firestore data layout
```
/stores/{storeId}/records/{recordId}
/stores/{storeId}/customers/{mobile}      # dedup/merge happens naturally server-side
/stores/{storeId}/users/{userId}          # shared user registry
/stores/{storeId}/masters/{singleton}
/stores/{storeId}/targets/{period}
/stores/{storeId}/footfall/{store|date}
/stores/{storeId}/commsLog/{id}
/stores/{storeId}/auditLog/{id}           # append-only (enforced in rules)
```

---

## EXECUTION PLAN (when triggered) — ~2.5–3.5 weeks

**Phase 0 — Setup (~1 day, mostly owner).** Reuse/confirm Firebase project;
register the Android app with the **release keystore SHA-1/256** (depends on
the signing setup in `SIGNING_SETUP.md` being done); download `firebaseConfig`
(public keys — safe to embed; security lives in rules). Topology + backend are
already decided above.

**Phase 1 — Decompose the blob (~3–4 days, riskiest).** Add `storeId` +
`updatedAt` + `updatedBy` to every entity. Refactor `Store` so the single blob
is assembled from independently-addressable per-entity collections, keeping the
synchronous `Store.load()/save()` API. Characterization-test all existing flows
first (capture, edit, convert, pipeline, reports, comms, audit) and keep them
green throughout.

**Phase 2 — Sync engine `sync.js` (~4–5 days).** Firebase init + anon auth;
per-collection Firestore listeners scoped to `storeId`; push on `Store.save`
(debounced diff); pull-merge on remote change → `render()`; sync cursor; a
visible **sync-status indicator** (synced / syncing / offline / error).

**Phase 3 — Rules + shared auth (~2–3 days).** Firestore security rules:
per-store scoping; **role enforcement in rules** (especially the message-log
PII — greetor sees own only — not just in the UI); append-only audit log.
Shared user registry so adding a user propagates. Owner device list + revoke.

**Phase 4 — Hardening + rollout (~2–3 days).** Two-device concurrent-edit and
offline→online tests; one-time migration of the existing device's data into the
store's cloud collection (source-of-truth handling so nothing duplicates); retry
/ backoff; Firestore cost check.

## New / changed files when built
- `greetor/www/sync.js` (new) — sync engine.
- `greetor/www/index.html` — `Store` decomposition + sync boot + status indicator.
- `greetor/www/shell.js` — could host sync init alongside durable writes.
- `greetor/firestore.rules` (new) — security rules.
- `greetor/www/firebase-config.js` (new) — public config.
- Firebase JS SDK (web SDK works in the Capacitor WebView; Firestore offline
  cache uses IndexedDB).

## Risks
- Biggest change since the rewrite; touches the storage core everything depends on.
- Reversible-ish (localStorage stays locally authoritative) but the Phase-1
  decomposition is not trivial to undo — do it behind a flag with tests.
- Depends on the signed-release keystore (Firebase needs the SHA registered).

## Cost
- Firestore free tier (Spark): ~50K reads / 20K writes / 1 GB per day. One store
  with a few devices + listeners is well within it. Blaze only if many stores.
