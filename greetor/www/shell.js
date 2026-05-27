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
    }
  }

  window.SaagarShell = {
    boot: bootNative,
    scheduleFollowupReminder: scheduleFollowupReminder,
    cancelFollowupReminder: cancelFollowupReminder,
    isNative: isNative,
    plugin: plugin,
  };
})();
