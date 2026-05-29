(function () {
  'use strict';

  var PREF_KEY = 'saagar_greetor_theme';

  var DEFAULTS = { mode: 'auto', text: 'normal', contrast: 'normal' };

  /* ── Storage helpers ─────────────────────────────────────── */
  function readStorage() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeStorage(prefs) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (_) {
      /* quota / private-mode — silently continue */
    }
  }

  /* ── Dark-mode media query ───────────────────────────────── */
  var mql = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  /* ── Public API ──────────────────────────────────────────── */
  var Theme = {};

  Theme.MODES    = ['light', 'dark', 'auto'];
  Theme.TEXT     = ['normal', 'large'];
  Theme.CONTRAST = ['normal', 'high'];

  /**
   * Returns current preferences merged with defaults.
   * @returns {{ mode: string, text: string, contrast: string }}
   */
  Theme.get = function () {
    var stored = readStorage();
    return {
      mode:     Theme.MODES.indexOf(stored.mode)    !== -1 ? stored.mode    : DEFAULTS.mode,
      text:     Theme.TEXT.indexOf(stored.text)      !== -1 ? stored.text     : DEFAULTS.text,
      contrast: Theme.CONTRAST.indexOf(stored.contrast) !== -1 ? stored.contrast : DEFAULTS.contrast
    };
  };

  /**
   * Merges partial prefs, persists, applies, and dispatches 'themechange'.
   * @param {{ mode?: string, text?: string, contrast?: string }} partial
   */
  Theme.set = function (partial) {
    var current = Theme.get();
    var next = {
      mode:     (partial && Theme.MODES.indexOf(partial.mode) !== -1)    ? partial.mode    : current.mode,
      text:     (partial && Theme.TEXT.indexOf(partial.text) !== -1)      ? partial.text     : current.text,
      contrast: (partial && Theme.CONTRAST.indexOf(partial.contrast) !== -1) ? partial.contrast : current.contrast
    };
    writeStorage(next);
    Theme.applyToDocument();
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    } catch (_) { /* older envs */ }
  };

  /**
   * Reads prefs and applies body classes:
   *   body.dark           — dark mode active
   *   body.large-text     — large text active
   *   body.high-contrast  — high contrast active
   */
  Theme.applyToDocument = function () {
    if (typeof document === 'undefined') { return; }
    var prefs = Theme.get();
    var body  = document.body;

    /* Dark */
    var wantDark =
      prefs.mode === 'dark' ||
      (prefs.mode === 'auto' && mql && mql.matches);
    body.classList.toggle('dark', wantDark);

    /* Large text */
    body.classList.toggle('large-text', prefs.text === 'large');

    /* High contrast */
    body.classList.toggle('high-contrast', prefs.contrast === 'high');
  };

  /**
   * Call once at page load.
   * Applies theme immediately (before paint) and wires the matchMedia
   * listener so 'auto' mode updates live when the OS theme changes.
   */
  Theme.boot = function () {
    Theme.applyToDocument();

    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', function () {
        if (Theme.get().mode === 'auto') {
          Theme.applyToDocument();
        }
      });
    } else if (mql && typeof mql.addListener === 'function') {
      /* Safari < 14 fallback */
      mql.addListener(function () {
        if (Theme.get().mode === 'auto') {
          Theme.applyToDocument();
        }
      });
    }
  };

  /* ── Expose + auto-boot ──────────────────────────────────── */
  window.Theme = Theme;
  Theme.boot();

}());
