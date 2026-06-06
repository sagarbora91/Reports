/* comms-ui.js — Saagar Greetor customer-communication UI
 * Exposes window.CommsUI = { openSendSheet, renderTemplates, renderLog, handleAction }
 * All interactive buttons use data-action prefixed cm-*
 */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────── */

  function esc(s) {
    return typeof escapeHtml === 'function' ? escapeHtml(String(s || '')) : String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ASYNC now: records live in the DB-backed records table, reached via Repo.
  // Returns the domain record (Repo maps recordId) or null.
  async function getRecord(recordId) {
    try {
      return await window.Repo.records.byId(recordId);
    } catch (e) {
      return null;
    }
  }

  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  // ASYNC now: Masters.storeNames() is async with no state arg. Returns the
  // <option> markup string (resolved) for the store <select>.
  async function storeOptions() {
    var names = [];
    try {
      if (window.Masters && typeof window.Masters.storeNames === 'function') {
        names = await window.Masters.storeNames();
      }
    } catch (e) { names = []; }
    if (!Array.isArray(names)) names = [];
    var html = '<option value="">— any store —</option>';
    names.forEach(function (n) {
      html += '<option value="' + esc(n) + '">' + esc(n) + '</option>';
    });
    return html;
  }

  function channelPill(ch) {
    if (ch === 'sms') return '<span class="pill" style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:99px;font-size:.75rem;">SMS</span>';
    return '<span class="pill pill-open" style="padding:2px 8px;border-radius:99px;font-size:.75rem;">WhatsApp</span>';
  }

  function fmtTs(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d)) return String(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ── placeholders hint ───────────────────────────────────────── */
  var PLACEHOLDER_HINT = 'Available: {name} {store} {reason} {brand} {category} {date} {followDate}';

  /* ── openSendSheet ───────────────────────────────────────────── */
  async function openSendSheet(recordId) {
    window._cmRid = recordId;
    var rec = await getRecord(recordId);
    if (!rec) { toast('Record not found'); return; }

    var templates = await Comms.applicableTemplates(rec);
    var pickedId = window._cmTpl || (templates.length ? templates[0].id : '');
    var pickedTpl = null;
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].id === pickedId) { pickedTpl = templates[i]; break; }
    }
    if (!pickedTpl && templates.length) { pickedTpl = templates[0]; pickedId = pickedTpl.id; }
    window._cmTpl = pickedId;

    var msgText = pickedTpl ? Comms.fillTemplate(pickedTpl.text, rec) : '';
    var ch = window._cmChannel || 'whatsapp';

    var title = 'Message ' + esc(rec.customerName || rec.mobile || 'customer');

    var tplChips = '';
    if (templates.length) {
      tplChips = '<div class="chip-group" style="flex-wrap:wrap;gap:6px;">';
      templates.forEach(function (t) {
        var sel = t.id === pickedId ? ' selected' : '';
        tplChips += '<button class="chip' + sel + '" data-action="cm-pick-template" data-id="' + esc(t.id) + '" data-rid="' + esc(recordId) + '" style="min-height:44px;">' + esc(t.name) + '</button>';
      });
      tplChips += '</div>';
    } else {
      tplChips = '<p class="muted tiny">No templates available. <button class="btn btn-ghost" data-action="cm-open-templates" style="min-height:44px;">Manage templates</button></p>';
    }

    var waActive = ch === 'whatsapp' ? ' selected' : '';
    var smsActive = ch === 'sms' ? ' selected' : '';

    var html = '<h2 style="margin:0 0 12px;">' + title + '</h2>'
      + '<div class="field"><label class="field-label">Template</label>' + tplChips + '</div>'
      + '<div class="field"><label class="field-label">Message</label>'
      + '<textarea id="cmMsg" rows="5" style="width:100%;min-height:100px;resize:vertical;">' + esc(msgText) + '</textarea>'
      + '</div>'
      + '<div class="field"><label class="field-label">Channel</label>'
      + '<div class="chip-group">'
      + '<button class="chip' + waActive + '" data-action="cm-channel" data-ch="whatsapp" style="min-height:44px;">WhatsApp</button>'
      + '<button class="chip' + smsActive + '" data-action="cm-channel" data-ch="sms" style="min-height:44px;">SMS</button>'
      + '</div></div>'
      + '<div class="modal-actions">'
      + '<button class="btn btn-primary" data-action="cm-send" data-rid="' + esc(recordId) + '" style="min-height:44px;">Send</button>'
      + '<button class="btn btn-secondary" data-action="modal-cancel" style="min-height:44px;">Cancel</button>'
      + '</div>';

    openModal(html);
  }

  /* ── template editor modal ───────────────────────────────────── */
  async function templateEditorModal(prefill, saveAction, saveDataAttr) {
    prefill = prefill || {};
    var scope = prefill.scope || 'general';

    var scopeChips = ['general', 'store', 'reason'].map(function (s) {
      var sel = scope === s ? ' selected' : '';
      return '<button class="chip' + sel + '" data-action="cm-tpl-scope" data-scope="' + s + '" style="min-height:44px;">' + s + '</button>';
    }).join('');

    var storeOpts = await storeOptions();

    var html = '<h2 style="margin:0 0 12px;">' + (prefill.id ? 'Edit Template' : 'Add Template') + '</h2>'
      + '<div class="field"><label class="field-label">Name *</label>'
      + '<input id="cmTplName" type="text" value="' + esc(prefill.name || '') + '" placeholder="Template name" style="width:100%;min-height:44px;"></div>'
      + '<div class="field"><label class="field-label">Scope</label>'
      + '<div class="chip-group" id="cmTplScopeGroup">' + scopeChips + '</div></div>'
      + '<div class="field"><label class="field-label">Store</label>'
      + '<select id="cmTplStore" style="width:100%;min-height:44px;">' + storeOpts + '</select></div>'
      + '<div class="field"><label class="field-label">Reason</label>'
      + '<input id="cmTplReason" type="text" value="' + esc(prefill.reason || '') + '" placeholder="e.g. Watch Service" style="width:100%;min-height:44px;"></div>'
      + '<div class="field"><label class="field-label">Message text *</label>'
      + '<textarea id="cmTplText" rows="5" style="width:100%;min-height:100px;resize:vertical;">' + esc(prefill.text || '') + '</textarea>'
      + '<span class="field-hint">' + esc(PLACEHOLDER_HINT) + '</span></div>'
      + '<div class="modal-actions">'
      + '<button class="btn btn-primary" data-action="' + saveAction + '" ' + saveDataAttr + ' style="min-height:44px;">Save</button>'
      + '<button class="btn btn-secondary" data-action="modal-cancel" style="min-height:44px;">Cancel</button>'
      + '</div>';

    // prefill store select after render via a tiny timeout
    openModal(html);

    if (prefill.store) {
      setTimeout(function () {
        var sel = document.getElementById('cmTplStore');
        if (sel) sel.value = prefill.store;
      }, 50);
    }
  }

  function gatherTemplateFields() {
    var name = (document.getElementById('cmTplName') || {}).value || '';
    var text = (document.getElementById('cmTplText') || {}).value || '';
    var reason = (document.getElementById('cmTplReason') || {}).value || '';
    var store = (document.getElementById('cmTplStore') || {}).value || '';

    // Read scope from selected chip
    var scope = 'general';
    var scopeGroup = document.getElementById('cmTplScopeGroup');
    if (scopeGroup) {
      var chips = scopeGroup.querySelectorAll('.chip.selected');
      if (chips.length) scope = chips[0].getAttribute('data-scope') || 'general';
    }

    return { name: name.trim(), text: text.trim(), scope: scope, store: store, reason: reason.trim() };
  }

  /* ── renderTemplates ─────────────────────────────────────────── */
  // ASYNC now: fetches templates via the DB-backed data layer, then paints into
  // its own target (#screen) and ALSO returns the HTML (host awaits this).
  async function renderTemplates() {
    var templates = await Comms.rawTemplates();
    var rows = '';

    if (!templates || !templates.length) {
      rows = '<div class="empty-state"><div class="icon">📋</div><h3>No templates yet</h3><p class="muted">Add your first message template below.</p></div>';
    } else {
      templates.forEach(function (t) {
        var scopeNote = t.scope || 'general';
        if (t.store) scopeNote += ' · ' + t.store;
        if (t.reason) scopeNote += ' · ' + t.reason;
        var activePill = t.active
          ? '<span class="pill pill-converted" style="padding:2px 8px;border-radius:99px;font-size:.75rem;">Active</span>'
          : '<span class="pill pill-closed" style="padding:2px 8px;border-radius:99px;font-size:.75rem;">Off</span>';
        var toggleLabel = t.active ? 'Disable' : 'Enable';

        rows += '<div class="settings-row" style="flex-direction:column;gap:6px;padding:12px 0;">'
          + '<div class="row-spread" style="align-items:center;">'
          + '<span style="font-weight:600;">' + esc(t.name) + '</span>'
          + activePill
          + '</div>'
          + '<span class="muted tiny">' + esc(scopeNote) + '</span>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">'
          + '<button class="btn btn-secondary" data-action="cm-edit-template" data-id="' + esc(t.id) + '" style="min-height:44px;">Edit</button>'
          + '<button class="btn btn-ghost" data-action="cm-toggle-template" data-id="' + esc(t.id) + '" style="min-height:44px;">' + toggleLabel + '</button>'
          + '<button class="btn btn-danger" data-action="cm-remove-template" data-id="' + esc(t.id) + '" style="min-height:44px;">Remove</button>'
          + '</div></div>';
      });
    }

    var out = '<div style="padding:0 16px 80px;">'
      + '<div class="row-spread" style="align-items:center;padding:16px 0 8px;">'
      + '<h2 style="margin:0;">Message Templates</h2>'
      + '<button class="btn btn-primary" data-action="cm-add-template" style="min-height:44px;">+ Add</button>'
      + '</div>'
      + '<p class="muted tiny" style="margin-bottom:12px;">' + esc(PLACEHOLDER_HINT) + '</p>'
      + '<div class="settings-section">' + rows + '</div>'
      + '</div>';
    var el = document.getElementById('screen');
    if (el) el.innerHTML = out;
    return out;
  }

  /* ── renderLog ───────────────────────────────────────────────── */
  // ASYNC now: fetches the (role-scoped) log via the DB-backed data layer, then
  // paints into its own target (#screen) and ALSO returns the HTML.
  async function renderLog() {
    // Audit R3 (DPDP / anti-poaching): scope is now enforced in the data layer
    // via opts.auth so the per-record log path is safe too. A GREETOR sees only
    // their own sent messages; Manager/Owner see all.
    var auth = (typeof AuthSession !== 'undefined') ? AuthSession.current() : null;
    var entries = await Comms.log({ auth: auth });
    if (!entries || !entries.length) {
      var empty = '<div style="padding:16px 16px 80px;">'
        + '<h2 style="margin:0 0 16px;">Message Log</h2>'
        + '<div class="empty-state"><div class="icon">💬</div><h3>No messages sent yet</h3></div>'
        + '</div>';
      var elEmpty = document.getElementById('screen');
      if (elEmpty) elEmpty.innerHTML = empty;
      return empty;
    }

    if (window._commsPage === undefined) window._commsPage = 1;
    var info = window.Paginate.page(entries, window._commsPage);
    var cards = info.items.map(function (e) {
      var header = esc(e.customerName || e.mobile || '—');
      var meta = channelPill(e.channel) + ' <span class="muted tiny">' + esc(fmtTs(e.timestamp || e.sentAt || '')) + '</span>';
      if (e.templateName) meta += ' <span class="muted tiny">· ' + esc(e.templateName) + '</span>';
      var shownMobile = (window.DPDP && window.DPDP.maskMobile) ? window.DPDP.maskMobile(e.mobile || '') : (e.mobile || '');
      return '<div class="entry-card" style="margin-bottom:8px;">'
        + '<div class="entry-row"><span class="entry-name">' + header + '</span>'
        + '<span class="entry-mobile muted tiny">' + esc(shownMobile) + '</span></div>'
        + '<div style="margin:4px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' + meta + '</div>'
        + '<p style="margin:4px 0 0;font-size:.9rem;">' + esc(truncate(e.text, 120)) + '</p>'
        + '</div>';
    }).join('');

    var outLog = '<div style="padding:0 16px 80px;">'
      + '<div class="row-spread" style="align-items:center;padding:16px 0 12px;">'
      + '<h2 style="margin:0;">Message Log</h2>'
      + '<button class="btn btn-ghost" data-action="cm-export-summary" style="min-height:44px;">📄 Export PDF</button>'
      + '</div>'
      + cards + window.Paginate.controls(info, 'cm-page')
      + '</div>';
    var elLog = document.getElementById('screen');
    if (elLog) elLog.innerHTML = outLog;
    return outLog;
  }

  /* ── handleAction ────────────────────────────────────────────── */
  function handleAction(action, dataset) {
    if (!action || action.indexOf('cm-') !== 0) return false;

    if (action === 'cm-pick-template') {
      window._cmTpl = dataset.id;
      window._cmRid = dataset.rid || window._cmRid;
      // openSendSheet is async; fire-and-forget (it re-renders the modal itself).
      Promise.resolve(openSendSheet(window._cmRid)).catch(function () {});
      return true;
    }

    if (action === 'cm-channel') {
      window._cmChannel = dataset.ch;
      Promise.resolve(openSendSheet(window._cmRid)).catch(function () {});
      return true;
    }

    if (action === 'cm-send') {
      // Capture DOM + sync state NOW (before any await — the modal is still up).
      var msgEl = document.getElementById('cmMsg');
      var msg = msgEl ? msgEl.value : '';
      var rid = dataset.rid || window._cmRid;
      var ch = window._cmChannel || 'whatsapp';
      var tplId = window._cmTpl || '';
      var auth = (typeof AuthSession !== 'undefined' && AuthSession.current) ? AuthSession.current() : {};
      (async function () {
        try {
          var rec = await getRecord(rid);
          if (!rec) { toast('Record not found'); return; }
          var mobile = rec.mobile || '';
          var url = ch === 'sms' ? Comms.smsUrl(mobile, msg) : Comms.waUrl(mobile, msg);
          if (!url) { toast('No valid mobile'); return; }

          // find template name
          var tplName = '';
          if (tplId) {
            var allTpls = await Comms.rawTemplates();
            for (var i = 0; i < allTpls.length; i++) {
              if (allTpls[i].id === tplId) { tplName = allTpls[i].name; break; }
            }
          }

          var entry = {
            byUserId: (auth && auth.id) || '',
            byName: (auth && auth.name) || '',
            channel: ch,
            recordId: rid,
            mobile: mobile,
            customerName: rec.customerName || '',
            templateId: tplId,
            templateName: tplName,
            text: msg
          };
          await Comms.logMessage(entry);
          closeModal();
          if (ch === 'sms') {
            window.location.href = url;
          } else {
            window.open(url, '_blank', 'noopener');
          }
          toast('Opening ' + ch);
          if (window.render) await window.render();
        } catch (e) {
          toast('Send failed');
        }
      })();
      return true;
    }

    if (action === 'cm-open-templates') {
      window.commsView = 'templates';
      if (window.render) window.render();
      return true;
    }

    if (action === 'cm-add-template') {
      // templateEditorModal is async (it fetches store names); fire-and-forget.
      Promise.resolve(templateEditorModal({}, 'cm-save-template', '')).catch(function () {});
      return true;
    }

    if (action === 'cm-save-template') {
      var fields = gatherTemplateFields();
      (async function () {
        try {
          var tpl = await Comms.addTemplate(fields);
          if (!tpl) { toast('Name and text required'); return; }
          closeModal();
          toast('Template added');
          if (window.render) await window.render();
        } catch (e) {
          toast('Save failed');
        }
      })();
      return true;
    }

    if (action === 'cm-edit-template') {
      var editId = dataset.id;
      (async function () {
        try {
          var all = await Comms.rawTemplates();
          var found = null;
          for (var j = 0; j < all.length; j++) {
            if (all[j].id === editId) { found = all[j]; break; }
          }
          if (!found) { toast('Template not found'); return; }
          await templateEditorModal(found, 'cm-update-template', 'data-id="' + esc(found.id) + '"');
        } catch (e) {
          toast('Could not open template');
        }
      })();
      return true;
    }

    if (action === 'cm-tpl-scope') {
      // toggle scope chip selection within the editor modal
      var grp = document.getElementById('cmTplScopeGroup');
      if (grp) {
        grp.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('selected'); });
        var target = grp.querySelector('[data-scope="' + dataset.scope + '"]');
        if (target) target.classList.add('selected');
      }
      return true;
    }

    if (action === 'cm-update-template') {
      var upFields = gatherTemplateFields();
      var upId = dataset.id;
      (async function () {
        try {
          var ok = await Comms.updateTemplate(upId, upFields);
          if (!ok) { toast('Update failed'); return; }
          closeModal();
          toast('Template updated');
          if (window.render) await window.render();
        } catch (e) {
          toast('Update failed');
        }
      })();
      return true;
    }

    if (action === 'cm-toggle-template') {
      var tgId = dataset.id;
      (async function () {
        try {
          await Comms.toggleTemplate(tgId);
          if (window.render) await window.render();
        } catch (e) {
          toast('Toggle failed');
        }
      })();
      return true;
    }

    if (action === 'cm-remove-template') {
      if (!confirm('Remove this template?')) return true;
      var rmId = dataset.id;
      (async function () {
        try {
          await Comms.removeTemplate(rmId);
          toast('Template removed');
          if (window.render) await window.render();
        } catch (e) {
          toast('Remove failed');
        }
      })();
      return true;
    }

    if (action === 'cm-open-log') {
      window.commsView = 'log';
      if (window.render) window.render();
      return true;
    }

    if (action === 'cm-end-of-day') {
      var auth2 = (typeof AuthSession !== 'undefined' && AuthSession.current) ? AuthSession.current() : {};
      (async function () {
        try {
          var summary = await Comms.endOfDaySummary(todayStr(), auth2 && auth2.role, auth2 && auth2.id);
          var eodHtml = '<h2 style="margin:0 0 12px;">End-of-Day Summary</h2>'
            + '<div class="field"><textarea id="cmEod" rows="10" readonly style="width:100%;min-height:160px;resize:vertical;">' + esc(summary) + '</textarea></div>'
            + '<div class="modal-actions">'
            + '<button class="btn btn-primary" data-action="cm-send-eod" style="min-height:44px;">Send to Manager (WhatsApp)</button>'
            + '<button class="btn btn-secondary" data-action="cm-copy-eod" style="min-height:44px;">Copy</button>'
            + '<button class="btn btn-ghost" data-action="modal-cancel" style="min-height:44px;">Close</button>'
            + '</div>';
          openModal(eodHtml);
        } catch (e) {
          toast('Could not build summary');
        }
      })();
      return true;
    }

    if (action === 'cm-send-eod') {
      var eodEl = document.getElementById('cmEod');
      var eodText = eodEl ? eodEl.value : '';
      window.open('https://wa.me/?text=' + encodeURIComponent(eodText), '_blank', 'noopener');
      return true;
    }

    if (action === 'cm-copy-eod') {
      var copyEl = document.getElementById('cmEod');
      var copyText = copyEl ? copyEl.value : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).catch(function () { toast('Copy failed'); });
      } else {
        toast('Clipboard not available');
      }
      toast('Copied');
      return true;
    }

    if (action === 'cm-export-summary') {
      (function () {
        if (!window.ReportEngine || !window.ReportEngine.run) { if (typeof toast === 'function') toast('Reports not ready yet'); return; }
        var d = new Date().toISOString().slice(0, 10);
        window.ReportEngine.run('comms-summary', { date: d });
      })();
      return true;
    }

    if (action === 'cm-page') {
      window._commsPage = parseInt(dataset.page, 10) || 1;
      if (window.render) window.render();
      return true;
    }

    return false;
  }

  /* ── export ──────────────────────────────────────────────────── */
  window.CommsUI = {
    openSendSheet: openSendSheet,
    renderTemplates: renderTemplates,
    renderLog: renderLog,
    handleAction: handleAction
  };

}());
