// ---------------------------------------------------------------------------
// CONFIG — single source of truth for the app's tunable numbers and thresholds.
//
// Stage B #12b: these used to be magic numbers scattered through app.js (band
// cut-offs, the GPS timeout, the storage ceiling, PBKDF2 iterations, …). Having
// them here means a non-coder can find and change a threshold in one place, and
// a reviewer can see every tunable at a glance.
//
// This file is concatenated FIRST in the inlined <script> bundle (see
// scripts/inline.py JS_ORDER), so `CONFIG` is defined before app.js runs.
//
// The CI version-stamp step (.github/workflows/apk.yml) rewrites CONFIG.version
// on every build, so the Settings footer always shows the real build number.
// ---------------------------------------------------------------------------

const CONFIG = {
  // User-visible app version. CI overwrites the string on each build.
  version: '0.2.0',

  // Score band cut-offs (percentage). A score >= bands.excellent is Excellent,
  // >= bands.good is Good, etc.; anything below bands.poor is Critical.
  bands: { excellent: 95, good: 90, fair: 85, poor: 80 },

  // Compliance targets shown on reports / used in escalation copy.
  targets: { daily: 90, weekly: 92 },

  // Timing (all milliseconds).
  timing: {
    gpsTimeoutMs: 6000,        // how long getCurrentPosition waits before giving up
    gpsCacheMs: 5 * 60 * 1000, // reuse a GPS fix for 5 min (don't ping per photo)
    toastMs: 1800,             // how long a toast stays on screen
    photoSettleMs: 250,        // wait for the Android keyboard / camera to settle
  },

  // localStorage health.
  storage: {
    limitBytes: 5 * 1024 * 1024, // typical ~5 MB localStorage quota
    warnPct: 70,                 // show the "storage filling up" banner at/above this
  },

  // PIN authentication.
  auth: {
    pbkdf2Iterations: 100000,  // PBKDF2 work factor for PIN hashing
    lockoutAttempts: 5,        // wrong PINs before lockout
    lockoutMs: 60 * 1000,      // lockout duration
  },

  // Photo capture + watermark. Smaller than before to roughly halve each
  // evidence photo's size — still clearly legible. Reversible: bump these back
  // to 1024 / 0.72 if you want sharper evidence photos at the cost of space.
  photo: {
    maxDim: 800,    // longest edge after resize (keeps storage small)
    quality: 0.6,   // JPEG quality
  },

  // Scoring.
  scoring: {
    dailyMaxWeighted: 68, // sum of daily checkpoint weights (Spec §2)
  },

  // Free-text input limits.
  input: {
    findingMaxLen: 200, // textarea maxlength for findings / reasons
    findingMinLen: 3,   // minimum chars for a finding / NA reason / dismiss reason
  },
};
