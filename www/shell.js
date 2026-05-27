// Shared shell for both pages of the Saagar Audit APK.
//
// Owns: Capacitor plugin boot (status bar, splash, keyboard, hardware back),
// the unified topbar+tabs HTML, cross-app backup/restore that spans BOTH
// localStorage keys, and follow-up notification scheduling for the
// Non-Purchase form.
//
// Each page exposes a callback for "what to do when hardware back is
// pressed with no modal open" (e.g. confirm-exit). Defaults to history.back
// if there is browser history, else App.exitApp.

(function () {
  'use strict';

  const NAVY = '#0b1f3a';
  const AUDIT_KEY = 'saagar_audit_v1';
  const NP_KEY = 'np_capture_v1_records';
  const UNIFIED_FORMAT = 'saagar_unified_v1';
  const LEGACY_FORMAT = 'saagar_audit_v1';

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
  // Tabs / shell HTML
  //
  // Renders the same topbar + 4-tab nav on every page. Each tab is an
  // <a href> to its target HTML so back/forward and deep links Just Work.
  // ---------------------------------------------------------------------

  const TABS = [
    { id: 'audit',         label: 'Audit',        href: 'index.html#audit' },
    { id: 'non-purchase',  label: 'Non-Purchase', href: 'non-purchase.html' },
    { id: 'history',       label: 'History',      href: 'index.html#history' },
    { id: 'settings',      label: 'Settings',     href: 'index.html#settings' },
  ];

  function shellHTML(activeId) {
    const tabs = TABS.map(t => `
      <a class="shell-tab ${t.id === activeId ? 'active' : ''}"
         href="${t.href}"
         data-shell-tab="${t.id}">${t.label}</a>
    `).join('');

    return `
      <header class="shell-topbar">
        <div class="shell-brand">
          <span class="shell-brand-serif">Saagar</span>
          <span class="shell-brand-sans">AUDIT</span>
        </div>
      </header>
      <nav class="shell-tabs" role="tablist">${tabs}</nav>
    `;
  }

  const SHELL_CSS = `
    .shell-topbar {
      background: linear-gradient(135deg, #0b1f3a, #071529);
      color: #ffffff;
      padding: 14px 18px calc(14px + env(safe-area-inset-top)) 18px;
      padding-top: max(14px, env(safe-area-inset-top));
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .shell-brand { display: flex; align-items: baseline; gap: 8px; }
    .shell-brand-serif {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 22px;
      font-weight: bold;
      color: #e0b85d;
      letter-spacing: 0.5px;
    }
    .shell-brand-sans {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      letter-spacing: 4px;
      color: #ffffff;
      opacity: 0.9;
    }
    .shell-tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: #132b4c;
      border-bottom: 1px solid #1c3a66;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .shell-tab {
      padding: 12px 6px;
      text-align: center;
      color: #c3d0e3;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      border-bottom: 3px solid transparent;
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .shell-tab:hover { color: #ffffff; background: rgba(255,255,255,0.04); }
    .shell-tab.active {
      color: #e0b85d;
      border-bottom-color: #c99a2e;
      background: rgba(224,184,93,0.06);
    }
    @media (max-width: 380px) {
      .shell-tab { font-size: 12px; padding: 11px 4px; }
    }
  `;

  function injectShellCSS() {
    if (document.getElementById('shell-css')) return;
    const s = document.createElement('style');
    s.id = 'shell-css';
    s.textContent = SHELL_CSS;
    document.head.appendChild(s);
  }

  function mountShell(activeId, mountSelector) {
    injectShellCSS();
    const host = document.querySelector(mountSelector);
    if (!host) return;
    host.outerHTML = shellHTML(activeId);
  }

  // ---------------------------------------------------------------------
  // Unified backup / restore
  //
  // Backups now bundle BOTH the audit state and the non-purchase records
  // into one file. Restore detects legacy single-state backups and still
  // handles them.
  // ---------------------------------------------------------------------

  function loadAuditState() {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function loadNpRecords() {
    try { return JSON.parse(localStorage.getItem(NP_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function unifiedBackupPayload() {
    const audit = loadAuditState();
    const np = loadNpRecords();
    return {
      _format: UNIFIED_FORMAT,
      _exported_at: new Date().toISOString(),
      _app_version: '0.2.0',
      audit: audit,
      non_purchase: np,
      _counts: {
        audits: audit && Array.isArray(audit.audits) ? audit.audits.length : 0,
        cros: audit && Array.isArray(audit.cros) ? audit.cros.length : 0,
        non_purchase: np.length,
      },
    };
  }

  function backupFilename() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `saagar_backup_${stamp}.json`;
  }

  async function backupEverything() {
    const payload = unifiedBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename = backupFilename();
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });
    const counts = payload._counts;
    const summary = `${counts.audits} audit(s), ${counts.cros} CRO(s), ${counts.non_purchase} non-purchase entries`;

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
    // Unified format
    if (data && data._format === UNIFIED_FORMAT) {
      if (data.audit) localStorage.setItem(AUDIT_KEY, JSON.stringify(data.audit));
      if (Array.isArray(data.non_purchase)) localStorage.setItem(NP_KEY, JSON.stringify(data.non_purchase));
      return {
        audits: data.audit && Array.isArray(data.audit.audits) ? data.audit.audits.length : 0,
        cros: data.audit && Array.isArray(data.audit.cros) ? data.audit.cros.length : 0,
        non_purchase: Array.isArray(data.non_purchase) ? data.non_purchase.length : 0,
      };
    }
    // Legacy audit-only backup
    if (data && data._format === LEGACY_FORMAT) {
      const restored = {
        audits: data.audits || [],
        cros: data.cros || [],
        current_audit_id: data.current_audit_id || null,
        auditor_name: data.auditor_name || '',
      };
      localStorage.setItem(AUDIT_KEY, JSON.stringify(restored));
      return {
        audits: restored.audits.length,
        cros: restored.cros.length,
        non_purchase: 0,
      };
    }
    // Legacy non-purchase backup (a bare array)
    if (Array.isArray(data)) {
      localStorage.setItem(NP_KEY, JSON.stringify(data));
      return { audits: 0, cros: 0, non_purchase: data.length };
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
        const msg = `Restored: ${counts.audits} audit(s), ${counts.cros} CRO(s), ${counts.non_purchase} non-purchase entries`;
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
  // Follow-up reminders (Non-Purchase form)
  //
  // Schedule a local notification at followDate (+ followTime, default 09:00)
  // for any record where followUp == 'Yes' and leadStatus is still open.
  // Re-scheduling uses a numeric id derived from the recordId so an edit
  // overwrites the previous notification instead of stacking duplicates.
  // ---------------------------------------------------------------------

  function notifIdForRecord(recordId) {
    // Stable 31-bit positive int from the recordId string.
    let h = 0;
    for (let i = 0; i < recordId.length; i++) {
      h = ((h << 5) - h) + recordId.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h) || 1;
  }

  async function ensureNotifPermission() {
    const LN = plugin('LocalNotifications');
    if (!LN) return false;
    try {
      const perm = await LN.checkPermissions();
      if (perm.display === 'granted') return true;
      const req = await LN.requestPermissions();
      return req.display === 'granted';
    } catch (e) {
      console.warn('LocalNotifications permission failed', e);
      return false;
    }
  }

  function shouldHaveReminder(record) {
    if (!record || record.followUp !== 'Yes') return false;
    if (!record.followDate) return false;
    if (record.leadStatus === 'Converted Later') return false;
    if (record.leadStatus === 'Closed - Not Interested') return false;
    return true;
  }

  async function scheduleFollowupReminder(record) {
    const LN = plugin('LocalNotifications');
    if (!LN) return;
    if (!shouldHaveReminder(record)) {
      await cancelFollowupReminder(record.recordId);
      return;
    }
    const ok = await ensureNotifPermission();
    if (!ok) return;
    const time = record.followTime && /^\d{2}:\d{2}$/.test(record.followTime) ? record.followTime : '09:00';
    const at = new Date(`${record.followDate}T${time}:00`);
    if (isNaN(at.getTime()) || at.getTime() < Date.now() + 30 * 1000) return;
    const id = notifIdForRecord(record.recordId);
    try {
      await LN.schedule({
        notifications: [{
          id: id,
          title: `Follow up: ${record.customerName || record.mobile || 'walk-in'}`,
          body: `${record.store || ''}${record.reason ? ' · ' + record.reason : ''}`,
          schedule: { at: at, allowWhileIdle: true },
          extra: { recordId: record.recordId },
        }],
      });
    } catch (e) {
      console.warn('Could not schedule follow-up', e);
    }
  }

  async function cancelFollowupReminder(recordId) {
    const LN = plugin('LocalNotifications');
    if (!LN) return;
    try {
      await LN.cancel({ notifications: [{ id: notifIdForRecord(recordId) }] });
    } catch (_) { /* nothing scheduled — ignore */ }
  }

  // ---------------------------------------------------------------------
  // Capacitor plugin boot
  // ---------------------------------------------------------------------

  async function bootNative(opts) {
    if (!isNative()) return;
    opts = opts || {};

    // Status bar — navy, light icons.
    const SB = plugin('StatusBar');
    if (SB) {
      try {
        await SB.setStyle({ style: 'DARK' });
        await SB.setBackgroundColor({ color: NAVY });
        await SB.setOverlaysWebView({ overlay: false });
      } catch (e) { /* ignore */ }
    }

    // Hide splash once the page has rendered.
    const SS = plugin('SplashScreen');
    if (SS) {
      try { await SS.hide(); } catch (_) {}
    }

    // Keyboard: native resize avoids the form fields hiding under
    // the on-screen keyboard.
    const KB = plugin('Keyboard');
    if (KB) {
      try { await KB.setResizeMode({ mode: 'native' }); } catch (_) {}
      try { await KB.setScroll({ isDisabled: false }); } catch (_) {}
    }

    // Hardware back: close modal first, then go back, then confirm exit.
    const App = plugin('App');
    if (App) {
      App.addListener('backButton', () => {
        // 1. Open modal? Close it.
        const modal = document.querySelector('.modal-backdrop, .modal, .toast.show');
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

    // Tap notification → bring app forward (default).
    const LN = plugin('LocalNotifications');
    if (LN && typeof opts.onNotificationTap === 'function') {
      LN.addListener('localNotificationActionPerformed', (event) => {
        try { opts.onNotificationTap(event); } catch (_) {}
      });
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  window.SaagarShell = {
    mount: mountShell,
    boot: bootNative,
    backup: backupEverything,
    restore: restoreFromFilePicker,
    scheduleFollowupReminder: scheduleFollowupReminder,
    cancelFollowupReminder: cancelFollowupReminder,
    ensureNotifPermission: ensureNotifPermission,
    isNative: isNative,
    plugin: plugin,
  };
})();
