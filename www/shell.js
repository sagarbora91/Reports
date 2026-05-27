// Shared native shell for the Saagar Audit APK.
//
// Owns: Capacitor plugin boot (status bar, splash, keyboard, hardware back),
// and the backup / restore that wraps audit state into a JSON file shareable
// to Google Drive / OneDrive / WhatsApp via the Android share sheet.

(function () {
  'use strict';

  const NAVY = '#0b1f3a';
  const AUDIT_KEY = 'saagar_audit_v1';
  const BACKUP_FORMAT = 'saagar_audit_v1';
  const LEGACY_UNIFIED_FORMAT = 'saagar_unified_v1';

  // ---------------------------------------------------------------------
  // Native plugin shorthand
  // ---------------------------------------------------------------------

  function plugin(name) {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  }

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---------------------------------------------------------------------
  // Backup / restore
  // ---------------------------------------------------------------------

  function loadAuditState() {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function backupPayload() {
    const audit = loadAuditState() || {};
    return Object.assign({
      _format: BACKUP_FORMAT,
      _exported_at: new Date().toISOString(),
      _app_version: '0.3.0',
    }, audit);
  }

  function backupFilename() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `saagar_audit_backup_${stamp}.json`;
  }

  async function backupEverything() {
    const payload = backupPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename = backupFilename();
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });
    const auditCount = Array.isArray(payload.audits) ? payload.audits.length : 0;
    const croCount = Array.isArray(payload.cros) ? payload.cros.length : 0;
    const capCount = Array.isArray(payload.caps) ? payload.caps.length : 0;
    const summary = `${auditCount} audit(s), ${croCount} CRO(s), ${capCount} CAP(s)`;

    // Preferred path on Android: native share sheet — Drive / OneDrive /
    // WhatsApp / Gmail all appear, user picks one.
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Saagar Audit backup',
          text: summary,
        });
        return { ok: true, via: 'share', summary };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
      console.warn('share failed, falling back to download', e);
    }

    // Fallback: trigger a regular download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, via: 'download', summary };
  }

  function applyRestore(data) {
    // Current single-state backup.
    if (data && data._format === BACKUP_FORMAT) {
      const restored = {
        audits: data.audits || [],
        cros: data.cros || [],
        users: data.users || [],
        caps: data.caps || [],
        current_audit_id: data.current_audit_id || null,
        current_user_id: data.current_user_id || null,
        auditor_name: data.auditor_name || '',
      };
      localStorage.setItem(AUDIT_KEY, JSON.stringify(restored));
      return {
        audits: restored.audits.length,
        cros: restored.cros.length,
        users: restored.users.length,
        caps: restored.caps.length,
      };
    }
    // Legacy unified (audit + np) backup — pull out the audit part only.
    if (data && data._format === LEGACY_UNIFIED_FORMAT && data.audit) {
      const audit = data.audit;
      const restored = {
        audits: audit.audits || [],
        cros: audit.cros || [],
        users: audit.users || [],
        caps: audit.caps || [],
        current_audit_id: audit.current_audit_id || null,
        current_user_id: audit.current_user_id || null,
        auditor_name: audit.auditor_name || '',
      };
      localStorage.setItem(AUDIT_KEY, JSON.stringify(restored));
      return {
        audits: restored.audits.length,
        cros: restored.cros.length,
        users: restored.users.length,
        caps: restored.caps.length,
      };
    }
    throw new Error('Unrecognized backup file format');
  }

  function restoreFromFilePicker(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const counts = applyRestore(data);
        const msg = `Restored ${counts.audits} audit(s), ${counts.cros} CRO(s), ${counts.users} user(s), ${counts.caps} CAP(s)`;
        if (onDone) onDone({ ok: true, counts, message: msg });
      } catch (err) {
        console.error(err);
        if (onDone) onDone({ ok: false, error: err && err.message || String(err) });
      }
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(() => { try { document.body.removeChild(input); } catch (_) {} }, 1000);
  }

  // ---------------------------------------------------------------------
  // Capacitor plugin boot
  // ---------------------------------------------------------------------

  async function bootNative(opts) {
    if (!isNative()) return;
    opts = opts || {};

    const SB = plugin('StatusBar');
    if (SB) {
      try {
        await SB.setStyle({ style: 'DARK' });
        await SB.setBackgroundColor({ color: NAVY });
        await SB.setOverlaysWebView({ overlay: false });
      } catch (_) { /* ignore */ }
    }

    const SS = plugin('SplashScreen');
    if (SS) { try { await SS.hide(); } catch (_) {} }

    const KB = plugin('Keyboard');
    if (KB) {
      try { await KB.setResizeMode({ mode: 'native' }); } catch (_) {}
      try { await KB.setScroll({ isDisabled: false }); } catch (_) {}
    }

    const App = plugin('App');
    if (App) {
      App.addListener('backButton', () => {
        // 1. Open modal? Close it.
        const modal = document.querySelector('.modal-backdrop, .modal');
        if (modal) {
          if (typeof opts.closeModal === 'function') {
            try { opts.closeModal(); return; } catch (_) {}
          }
          const cancel = document.querySelector('[data-action="modal-cancel"], [data-modal-backdrop]');
          if (cancel) { cancel.click(); return; }
        }
        // 2. Page-specific handler can intercept (e.g. discard draft).
        if (typeof opts.onBack === 'function') {
          const handled = opts.onBack();
          if (handled) return;
        }
        // 3. Browser history navigates.
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        // 4. Otherwise confirm exit.
        if (confirm('Exit Saagar Audit?')) {
          App.exitApp();
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  window.SaagarShell = {
    boot: bootNative,
    backup: backupEverything,
    restore: restoreFromFilePicker,
    isNative: isNative,
    plugin: plugin,
  };
})();
