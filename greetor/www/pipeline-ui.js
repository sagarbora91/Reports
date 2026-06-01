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

  function renderCard(record, state) {
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

    var canLeads = !window.can || window.can('manageLeads');
    var canEdit = !window.can || window.can('editAny');
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

  function findRecord(state, recordId) {
    var records = (state && state.entries) ? state.entries : [];
    for (var i = 0; i < records.length; i++) {
      if (records[i].recordId === recordId) return records[i];
    }
    return null;
  }

  var PipelineUI = {
    render: function (state) {
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

      var pipeline = window.Customers.pipeline(state);

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
            records.forEach(function (r) {
              html += renderCard(r, state);
            });
          }
        }

        html += '</div><div class="spacer-8"></div>';
      });

      return html;
    },

    handleAction: function (action, dataset) {
      if (typeof action !== 'string' || action.indexOf('p-') !== 0) return false;

      if (typeof window.Customers === 'undefined') return false;

      if (action === 'p-toggle') {
        var stage = dataset.stage;
        if (!stage) return false;
        if (typeof window.pipelineCollapsed === 'undefined') window.pipelineCollapsed = {};
        window.pipelineCollapsed[stage] = !window.pipelineCollapsed[stage];
        render();
        return true;
      }

      if (action === 'p-move') {
        var id = dataset.id;
        if (!id) return false;
        var s = Store.load();
        var record = findRecord(s, id);
        if (!record) return false;
        var stages = window.Customers.pipelineStages(s);
        openModal(renderMoveModal(id, record.leadStatus || '', stages));
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
        var s2 = Store.load();
        var rec2 = (s2.records || []).filter(function (r) { return r.recordId === id2; })[0];
        var fromStage = rec2 ? (rec2.leadStatus || 'Open') : '';
        window.Customers.setStage(s2, id2, newStage);
        Store.save(s2);
        if (window.logAudit) {
          window.logAudit('stage',
            'Moved lead ' + ((rec2 && (rec2.customerName || rec2.mobile)) || '') +
            ' from ' + fromStage + ' to ' + newStage,
            { recordId: id2, from: fromStage, to: newStage });
        }
        // Audit fix #2: re-evaluate the OS follow-up reminder on every stage
        // change. shouldHaveReminder() auto-cancels for Converted/Closed, so
        // dead leads stop pinging staff at 9 AM.
        if (window.SaagarShell && window.SaagarShell.scheduleFollowupReminder) {
          var updated = (Store.load().records || []).filter(function (r) { return r.recordId === id2; })[0];
          if (updated) {
            try { window.SaagarShell.scheduleFollowupReminder(updated); } catch (_) {}
          }
        }
        closeModal();
        render();
        toast('Moved to ' + newStage);
        return true;
      }

      return false;
    }
  };

  window.PipelineUI = PipelineUI;
})();
