(function () {
  'use strict';

  function stagePillClass(stage) {
    var map = {
      Hot: 'pill-hot', Warm: 'pill-warm', Cold: 'pill-cold',
      Open: 'pill-open', Converted: 'pill-converted', Closed: 'pill-closed'
    };
    return map[stage] || 'pill-open';
  }

  function isValidMobile(m) {
    return m && /^\d{10}$/.test(String(m).trim());
  }

  function renderCard(record) {
    var name = escapeHtml(record.customerName || 'Unnamed');
    var mobile = escapeHtml(String(record.mobile || ''));
    var store = escapeHtml(record.store || '');
    var category = escapeHtml(record.category || '');
    var brand = escapeHtml(record.brand || '');
    var reason = escapeHtml(record.reason || '');
    var stage = record.leadStatus || '';
    var id = record.recordId || '';

    var followLine = '';
    if (record.followUp === 'Yes' && record.followDate) {
      followLine = '<div class="entry-meta" style="color:#e67e22">⏰ follow ' + escapeHtml(record.followDate) + '</div>';
    }

    var canLeads = window.canSafe && window.canSafe('manageLeads');
    var canEdit = window.canSafe && window.canSafe('editAny');
    var convertBtn = '';
    if (stage !== 'Converted' && canLeads) {
      convertBtn = '<button class="entry-action" data-action="open-convert" data-id="' + escapeHtml(id) + '" style="min-height:44px">Convert</button>';
    }

    var waBtn = '';
    if (isValidMobile(record.mobile)) {
      waBtn = '<button class="entry-action wa" data-action="wa-customer" data-id="' + escapeHtml(id) + '" style="min-height:44px">WA</button>';
    }

    return '<div class="entry-card">' +
      '<div class="entry-row">' +
        '<span class="entry-name">' + name + '</span>' +
        '<span class="tiny muted">' + (mobile ? '+91 ' + mobile : '') + '</span>' +
      '</div>' +
      '<div class="entry-meta">' + [store, category, brand, reason].filter(Boolean).join(' · ') + '</div>' +
      followLine +
      '<div class="entry-actions">' +
        (canLeads ? '<button class="entry-action" data-action="p-move" data-id="' + escapeHtml(id) + '" style="min-height:44px">Move</button>' : '') +
        convertBtn +
        waBtn +
        (canEdit ? '<button class="entry-action" data-action="edit-entry" data-id="' + escapeHtml(id) + '" style="min-height:44px">Edit</button>' : '') +
      '</div>' +
    '</div>';
  }

  function renderMoveModal(recordId, currentStage, stages) {
    var chips = stages.map(function (s) {
      var sel = s === currentStage ? ' selected' : '';
      return '<button class="chip' + sel + '" data-action="p-set-stage" data-id="' + escapeHtml(recordId) + '" data-stage="' + escapeHtml(s) + '" style="min-height:44px">' + escapeHtml(s) + '</button>';
    }).join('');

    return '<h2 style="margin:0 0 16px">Move to stage</h2>' +
      '<div class="chip-group">' + chips + '</div>' +
      '<div class="modal-actions single" style="margin-top:20px">' +
        '<button class="btn btn-secondary btn-full" data-action="modal-cancel" style="min-height:44px">Cancel</button>' +
      '</div>';
  }

  // SQLite P3: render() is async (Customers.* are async, DB-backed) and ALWAYS
  // returns the HTML string. It ALSO self-paints into its OWN element so the
  // host can use either model:
  //   • `el.innerHTML = await PipelineUI.render()`   (host assigns)  — or —
  //   • `await PipelineUI.render(el)` / `await PipelineUI.render()` (self-paint
  //     into the explicit target, else the host's dedicated #leadsBody).
  // We deliberately do NOT fall back to #screen: that container is host-owned
  // and may also hold the Pipeline|Customers toggle, so clobbering it could drop
  // sibling chrome. With no explicit target and no #leadsBody, render() just
  // returns the string and lets the host place it.
  function resolveTarget(target) {
    if (target && target.nodeType === 1) return target;
    if (typeof target === 'string') {
      var byId = document.getElementById(target);
      if (byId) return byId;
    }
    return document.getElementById('leadsBody');
  }

  var PipelineUI = {
    // ASYNC (SQLite P3). Fetches the pipeline from the DB-backed async data
    // layer, builds the HTML, self-paints into its own target element, AND
    // returns the HTML string so the host can use either model. `target` is
    // optional (element or id); when omitted it self-paints into #leadsBody if
    // present, otherwise it only returns the string for the host to place.
    // Greetors intentionally see ALL leads (owner decision) — no role filter.
    render: async function (target) {
      var html = await PipelineUI._buildHtml();
      var el = resolveTarget(target);
      if (el) el.innerHTML = html;
      return html;
    },

    _buildHtml: async function () {
      if (typeof window.Customers === 'undefined') {
        return '<p class="muted" style="padding:24px">Loading…</p>';
      }

      // Lazy init collapsed state
      if (typeof window.pipelineCollapsed === 'undefined') {
        window.pipelineCollapsed = {};
      }
      if (!window._pipelineInit) {
        window._pipelineInit = true;
        window.pipelineCollapsed['Converted'] = true;
        window.pipelineCollapsed['Closed'] = true;
      }

      var pipeline = await window.Customers.pipeline();

      // Check total records
      var totalRecords = 0;
      pipeline.forEach(function (g) { totalRecords += g.count; });

      if (totalRecords === 0) {
        return '<div class="empty-state">' +
          '<div class="icon">&#128101;</div>' +
          '<h3>No leads yet — capture a walk-in</h3>' +
          '</div>';
      }

      var html = '';

      // Board header: title + board-level actions (Export PDF). Rides the
      // host's existing p-* delegation via PipelineUI.handleAction.
      html += '<div class="row-spread" style="margin:0 0 8px;align-items:center">' +
        '<span style="font-weight:700">Lead pipeline</span>' +
        '<button class="btn btn-secondary" data-action="p-export-board" style="min-height:44px">&#128196; Export PDF</button>' +
      '</div>';

      pipeline.forEach(function (group) {
        var stage = group.stage;
        var count = group.count;
        var records = group.records || [];
        var collapsed = !!window.pipelineCollapsed[stage];
        var pillClass = stagePillClass(stage);

        // Build header extras
        var extra = '';
        if (stage === 'Converted') {
          var total = 0;
          records.forEach(function (r) {
            total += (parseFloat(r.saleValue) || 0);
          });
          if (total > 0) {
            extra = '<span class="tiny muted" style="margin-left:8px">' + window.Customers.formatINR(total) + '</span>';
          }
        }

        var chevron = collapsed ? '&#9654;' : '&#9660;';

        html += '<div style="margin-bottom:4px">' +
          '<button class="btn btn-ghost btn-full row-spread" data-action="p-toggle" data-stage="' + escapeHtml(stage) + '" style="min-height:44px;padding:10px 12px;text-align:left;font-weight:600;border-radius:10px">' +
            '<span>' +
              '<span class="pill ' + pillClass + '" style="margin-right:8px">' + escapeHtml(stage) + '</span>' +
              '<span style="font-size:13px;font-weight:700">' + count + '</span>' +
              extra +
            '</span>' +
            '<span style="font-size:12px;color:#888">' + chevron + '</span>' +
          '</button>';

        if (!collapsed) {
          if (records.length === 0) {
            html += '<div class="muted tiny" style="padding:8px 12px">No leads in this stage</div>';
          } else {
            var P_CAP = 30;
            records.slice(0, P_CAP).forEach(function (r) {
              html += renderCard(r);
            });
            if (records.length > P_CAP) {
              html += '<div class="muted tiny" style="padding:8px 12px">+ ' + (records.length - P_CAP) + ' more in ' + escapeHtml(stage) + ' — use Reports for the full list.</div>';
            }
          }
        }

        html += '</div><div class="spacer-8"></div>';
      });

      return html;
    },

    // SYNC + BOOLEAN (locked contract): the host router does
    // `if (PipelineUI.handleAction(a,ds)) return;` — a Promise is always truthy
    // and would swallow every click. Read-only view toggles set a window.* var
    // then fire-and-forget the async host render(). Mutating actions run their
    // awaits inside an INNER async IIFE (with try/catch + toast) and return true
    // synchronously.
    handleAction: function (action, dataset) {
      if (typeof action !== 'string' || action.indexOf('p-') !== 0) return false;

      if (typeof window.Customers === 'undefined') return false;

      if (action === 'p-toggle') {
        var stage = dataset.stage;
        if (!stage) return false;
        if (typeof window.pipelineCollapsed === 'undefined') window.pipelineCollapsed = {};
        window.pipelineCollapsed[stage] = !window.pipelineCollapsed[stage];
        if (window.render) window.render();
        return true;
      }

      if (action === 'p-move') {
        var id = dataset.id;
        if (!id) return false;
        // Fetch the record + stages from the DB (async), then open the modal.
        (async function () {
          try {
            var record = await window.Repo.records.byId(id);
            if (!record) { if (typeof toast === 'function') toast('Record not found'); return; }
            var stages = await window.Customers.pipelineStages();
            openModal(renderMoveModal(id, record.leadStatus || '', stages));
          } catch (e) {
            if (typeof toast === 'function') toast('Could not open lead');
          }
        }());
        return true;
      }

      if (action === 'p-set-stage') {
        var id2 = dataset.id;
        var newStage = dataset.stage;
        if (!id2 || !newStage) return false;
        // Audit fix #1: route stage→Converted through the dedicated convert
        // modal so saleValue + convertedAt + audit event are always recorded
        // together. Without this, p-set-stage was a third writer of Converted
        // that left saleValue empty and per-greetor revenue undercounted.
        // (This branch is pure DOM — keep it synchronous.)
        if (newStage === 'Converted') {
          closeModal();
          // Defer to the host's open-convert (it renders the modal and the
          // save-convert handler writes the full triple + cancels reminders).
          var b = document.createElement('button');
          b.setAttribute('data-action', 'open-convert');
          b.setAttribute('data-id', id2);
          document.body.appendChild(b);
          b.click();
          document.body.removeChild(b);
          return true;
        }
        // Non-Converted stage change: do all the async DB work inside an inner
        // IIFE, then await the host re-render. Returns true synchronously below.
        (async function () {
          try {
            var rec2 = await window.Repo.records.byId(id2);
            var fromStage = rec2 ? (rec2.leadStatus || 'Open') : '';
            // setStage is async + DB-backed (NO state arg, NO Store.save).
            await window.Customers.setStage(id2, newStage);
            if (window.logAudit) {
              // logAudit is host-owned; await it defensively in case the host
              // migrated it to async (DB-backed Repo.auditLog.insert).
              var p = window.logAudit('stage',
                'Moved lead ' + ((rec2 && (rec2.customerName || rec2.mobile)) || '') +
                ' from ' + fromStage + ' to ' + newStage,
                { recordId: id2, from: fromStage, to: newStage });
              if (p && typeof p.then === 'function') await p;
            }
            // Audit fix #2: re-evaluate the OS follow-up reminder on every stage
            // change. shouldHaveReminder() auto-cancels for Converted/Closed, so
            // dead leads stop pinging staff at 9 AM. Re-fetch the updated row.
            if (window.SaagarShell && window.SaagarShell.scheduleFollowupReminder) {
              var updated = await window.Repo.records.byId(id2);
              if (updated) {
                try { await window.SaagarShell.scheduleFollowupReminder(updated); } catch (_) {}
              }
            }
            closeModal();
            if (window.render) await window.render();
            if (typeof toast === 'function') toast('Moved to ' + newStage);
          } catch (e) {
            if (typeof toast === 'function') toast('Could not move lead');
          }
        }());
        return true;
      }

      if (action === 'p-export-board') {
        (function () {
          if (!window.ReportEngine || !window.ReportEngine.run) {
            if (typeof toast === 'function') toast('Reports not ready yet');
            return;
          }
          window.ReportEngine.run('lead-pipeline', {});
        })();
        return true;
      }

      return false;
    }
  };

  window.PipelineUI = PipelineUI;
})();
