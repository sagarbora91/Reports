/* report-ui.js — Saagar Greetor PDF report picker (light UI)
 * Exposes window.ReportUI = { openPicker, handleAction }
 * All interactive buttons use data-action prefixed rep-*
 *
 * This is a LIGHT module: it only lists the reports the current user may run
 * (window.ReportDefs.list() is already role/permission filtered) and launches
 * them (window.ReportEngine.run). It contains NO PDF/pdfmake logic (that lives
 * in window.ReportEngine) and NO data-fetching (that lives in window.ReportDefs).
 */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────── */

  // Mirror comms-ui.js: prefer the host escapeHtml, fall back to a local escape
  // so text is always escaped even if the host helper is unavailable.
  function esc(s) {
    return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function say(msg) {
    if (typeof toast === 'function') toast(msg);
  }

  /* ── openPicker ──────────────────────────────────────────────── */
  // ctx is an optional context object {range?, period?, ...} threaded through to
  // ReportEngine.run when a row is tapped. We stash it so rep-run can read it.
  function openPicker(ctx) {
    if (!window.ReportDefs || typeof window.ReportDefs.list !== 'function' ||
        !window.ReportEngine || typeof window.ReportEngine.run !== 'function') {
      say('Reports not ready yet');
      return;
    }

    window._repCtx = ctx || {};

    var defs = [];
    try {
      defs = window.ReportDefs.list() || [];
    } catch (e) {
      defs = [];
    }
    if (!Array.isArray(defs)) defs = [];

    var rows = '';
    if (!defs.length) {
      rows = '<div class="empty-state"><div class="icon">📄</div><h3>No reports available for your role.</h3></div>';
    } else {
      defs.forEach(function (def) {
        if (!def) return;
        rows += '<div class="entry-card" data-action="rep-run" data-rep-id="' + esc(def.id) + '" style="cursor:pointer;margin-bottom:8px;">'
          + '<div class="entry-row"><span class="entry-name">' + esc(def.name || 'Report') + '</span></div>'
          + (def.audience ? '<div class="entry-meta tiny muted">' + esc(def.audience) + '</div>' : '')
          + '</div>';
      });
    }

    var html = '<h2 style="margin:0 0 12px;">Export PDF Report</h2>'
      + '<p class="muted tiny" style="margin:0 0 12px;">Tap a report to preview, then share.</p>'
      + rows
      + '<div class="modal-actions">'
      + '<button class="btn btn-secondary" data-action="modal-cancel" style="min-height:44px;">Cancel</button>'
      + '</div>';

    openModal(html);
  }

  /* ── handleAction ────────────────────────────────────────────── */
  // SYNC-boolean contract: return true the instant we handle an action (async
  // work runs in an inner IIFE), and return false for anything we don't own so
  // sibling clicks are not swallowed by the host router.
  function handleAction(action, dataset) {
    if (!action || action.indexOf('rep-') !== 0) return false;
    dataset = dataset || {};

    if (action === 'rep-pick') {
      openPicker({ range: dataset.range, period: dataset.period });
      return true;
    }

    if (action === 'rep-run') {
      var id = dataset.repId || dataset.repid;
      // Dismiss the picker sheet first (the picker may also close on backdrop;
      // the preview opened by ReportEngine.run owns its own dedicated root).
      if (typeof closeModal === 'function') closeModal();
      (function () {
        try {
          if (!window.ReportEngine || typeof window.ReportEngine.run !== 'function') {
            say('Reports not ready yet');
            return;
          }
          window.ReportEngine.run(id, {
            range: (window.reportRange || dataset.range),
            period: dataset.period
          });
        } catch (e) {
          say('Reports not ready yet');
        }
      })();
      return true;
    }

    return false;
  }

  /* ── export ──────────────────────────────────────────────────── */
  window.ReportUI = {
    openPicker: openPicker,
    handleAction: handleAction
  };

}());
