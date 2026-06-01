// Capacitor shell for Saagar Greetor (standalone).
//
// Provides:
//   - SaagarShell.boot({ onBack })          → status bar, splash, keyboard, back button
//   - SaagarShell.scheduleFollowupReminder(record)  → LocalNotification at followDate
//   - SaagarShell.cancelFollowupReminder(recordId)

(function () {
  'use strict';

  const NAVY = '#0b1f3a';

  function plugin(name) {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  }
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---------------------------------------------------------------------
  // Follow-up reminders
  // ---------------------------------------------------------------------

  function notifIdForRecord(recordId) {
    // Stable 31-bit positive int from the recordId string so an edit
    // overwrites the prior reminder instead of stacking duplicates.
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
    } catch (_) { return false; }
  }

  // A lead is "terminal" (no follow-up reminder) when its stage is a sale or a
  // dead-end. Cover current Greetor strings, legacy audit strings, and common
  // user-renamed terminal stages (case-insensitive substring match) so renaming
  // a Masters lead-status to "Lost"/"Dead"/"Won" still cancels the ping.
  var TERMINAL_STAGES = ['converted', 'closed', 'lost', 'dead', 'won', 'not interested', 'dnd'];
  function isTerminalStage(stage) {
    if (!stage) return false;
    var s = String(stage).toLowerCase();
    for (var i = 0; i < TERMINAL_STAGES.length; i++) {
      if (s.indexOf(TERMINAL_STAGES[i]) !== -1) return true;
    }
    return false;
  }

  function shouldHaveReminder(record) {
    if (!record || record.followUp !== 'Yes') return false;
    if (!record.followDate) return false;
    if (isTerminalStage(record.leadStatus)) return false;
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
  // File export — the reliable path for the Android WebView.
  // Browser <a download> and navigator.share({files}) are flaky inside the
  // Capacitor WebView, so on device we write the file with @capacitor/filesystem
  // and open the native share sheet with @capacitor/share (Drive / WhatsApp /
  // Gmail / Files all appear). On a real browser we fall back to a blob download.
  // Returns a promise resolving to { ok, via } or { ok:false, cancelled|error }.
  // ---------------------------------------------------------------------

  async function exportFile(filename, mime, content) {
    if (isNative()) {
      const FS = plugin('Filesystem');
      const Sh = plugin('Share');
      if (FS && Sh) {
        try {
          await FS.writeFile({
            path: filename,
            data: content,
            directory: 'CACHE',   // Directory.Cache
            encoding: 'utf8',     // Encoding.UTF8
          });
          const uriRes = await FS.getUri({ path: filename, directory: 'CACHE' });
          await Sh.share({
            title: filename,
            url: uriRes.uri,
            dialogTitle: 'Save or share ' + filename,
          });
          return { ok: true, via: 'share' };
        } catch (e) {
          const msg = (e && (e.message || e.errorMessage) || '').toLowerCase();
          if (msg.indexOf('cancel') !== -1) return { ok: false, cancelled: true };
          console.warn('native export failed, falling back to download', e);
          // fall through to blob download
        }
      }
    }
    try {
      const blob = new Blob([content], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      return { ok: true, via: 'download' };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ---------------------------------------------------------------------
  // Durable state file — survives WebView localStorage eviction.
  // localStorage stays the fast synchronous working copy; every save
  // write-throughs (debounced) to a JSON file in the app's Data directory.
  // At boot, if localStorage is empty but the file exists, we restore it.
  // (The file is app-private: it survives eviction, but NOT uninstall —
  //  the JSON backup / Drive is the reinstall safety net.)
  // ---------------------------------------------------------------------

  const STATE_FILE = 'saagar_greetor_state.json';
  let _durTimer = null;
  let _durPending = null;

  async function durableRead() {
    const FS = plugin('Filesystem');
    if (!FS) return null;
    try {
      const res = await FS.readFile({ path: STATE_FILE, directory: 'DATA', encoding: 'utf8' });
      return (res && typeof res.data === 'string') ? res.data : null;
    } catch (_) {
      return null; // not found / unreadable
    }
  }

  function durableWrite(text) {
    const FS = plugin('Filesystem');
    if (!FS) return;
    _durPending = text;
    clearTimeout(_durTimer);
    _durTimer = setTimeout(async () => {
      const data = _durPending; _durPending = null;
      try {
        await FS.writeFile({ path: STATE_FILE, directory: 'DATA', data: data, encoding: 'utf8' });
      } catch (e) {
        console.warn('durable state write failed', e);
      }
    }, 150);
  }

  // ---------------------------------------------------------------------
  // Daily backup reminder (default 8:30 PM)
  // ---------------------------------------------------------------------

  const BACKUP_REMINDER_ID = 7001;
  const BACKUP_PREF = 'saagar_greetor_backup_reminder';

  function isBackupReminderEnabled() {
    const v = localStorage.getItem(BACKUP_PREF);
    return v == null ? true : v === '1';   // default ON
  }
  function setBackupReminderEnabled(on) {
    localStorage.setItem(BACKUP_PREF, on ? '1' : '0');
  }
  async function scheduleBackupReminder() {
    const LN = plugin('LocalNotifications');
    if (!LN || !isBackupReminderEnabled()) return false;
    if (!(await ensureNotifPermission())) return false;
    try {
      try { await LN.cancel({ notifications: [{ id: BACKUP_REMINDER_ID }] }); } catch (_) {}
      await LN.schedule({
        notifications: [{
          id: BACKUP_REMINDER_ID,
          title: 'Back up Saagar Greetor',
          body: 'Tap to back up today’s walk-ins to Drive.',
          schedule: { on: { hour: 20, minute: 30 }, every: 'day', allowWhileIdle: true },
          extra: { kind: 'backup-reminder' },
        }],
      });
      return true;
    } catch (e) { console.warn('backup reminder failed', e); return false; }
  }
  async function cancelBackupReminder() {
    const LN = plugin('LocalNotifications');
    if (!LN) return;
    try { await LN.cancel({ notifications: [{ id: BACKUP_REMINDER_ID }] }); } catch (_) {}
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

    // Schedule the daily backup reminder (fire-and-forget).
    scheduleBackupReminder();

    const App = plugin('App');
    if (App) {
      App.addListener('backButton', () => {
        // 1. Open dialog or modal? Close it.
        const dlg = document.querySelector('dialog[open]');
        if (dlg) { try { dlg.close(); return; } catch (_) {} }
        // 2. Page-specific intercept.
        if (typeof opts.onBack === 'function') {
          const handled = opts.onBack();
          if (handled) return;
        }
        // 3. Browser history.
        if (window.history.length > 1) { window.history.back(); return; }
        // 4. Confirm exit.
        if (confirm('Exit Saagar Greetor?')) App.exitApp();
      });
      App.addListener('pause', function () {
        // Flush any pending durable write immediately when the app backgrounds.
        if (_durTimer) { clearTimeout(_durTimer); _durTimer = null; }
        var pending = _durPending; _durPending = null;
        if (pending != null) {
          var FS = plugin('Filesystem');
          if (FS) { try { FS.writeFile({ path: STATE_FILE, directory: 'DATA', data: pending, encoding: 'utf8' }); } catch (_) {} }
        }
      });
    }
  }

  window.SaagarShell = {
    boot: bootNative,
    scheduleFollowupReminder: scheduleFollowupReminder,
    cancelFollowupReminder: cancelFollowupReminder,
    exportFile: exportFile,
    durableRead: durableRead,
    durableWrite: durableWrite,
    isBackupReminderEnabled: isBackupReminderEnabled,
    setBackupReminderEnabled: setBackupReminderEnabled,
    scheduleBackupReminder: scheduleBackupReminder,
    cancelBackupReminder: cancelBackupReminder,
    isNative: isNative,
    plugin: plugin,
  };
})();
