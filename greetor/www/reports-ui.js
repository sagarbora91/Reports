(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────────

  function getRecs(state) {
    var auth = (typeof AuthSession !== 'undefined') ? AuthSession.current() : null;
    var all = (state && state.records) ? state.records : [];
    var roleRecs = (auth && auth.role === 'GREETOR')
      ? all.filter(function (r) { return r.createdByUserId === auth.id; })
      : all;
    var range = window.reportRange || 'today';
    return Reports.filterByRange(roleRecs, range, window.reportCustomStart, window.reportCustomEnd);
  }

  function pillClass(leadStatus) {
    var map = { Hot: 'pill-hot', Warm: 'pill-warm', Cold: 'pill-cold', Open: 'pill-open', Converted: 'pill-converted', Closed: 'pill-closed' };
    return map[leadStatus] || 'pill-open';
  }

  function shareCSV(filename, text) {
    try {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var file = new File([blob], filename, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).then(function () {
          if (typeof toast === 'function') toast('Exported ' + filename);
        }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
        });
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof toast === 'function') toast('Exported ' + filename);
      }
    } catch (e) {
      // silently ignore
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  function render(state) {
    var range = window.reportRange || 'today';
    var auth = (typeof AuthSession !== 'undefined') ? AuthSession.current() : null;
    var all = (state && state.records) ? state.records : [];
    var roleRecs = (auth && auth.role === 'GREETOR')
      ? all.filter(function (r) { return r.createdByUserId === auth.id; })
      : all;
    var recs = Reports.filterByRange(roleRecs, range, window.reportCustomStart, window.reportCustomEnd);
    var resolved = Reports.resolveRange(range, window.reportCustomStart, window.reportCustomEnd);
    var sum = Reports.summary(recs);

    var html = '';

    // ── Range chips ──
    html += '<div class="chip-group" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
    Reports.RANGES.forEach(function (key) {
      var sel = (key === range) ? ' selected' : '';
      html += '<button class="chip' + sel + '" data-action="r-range" data-range="' + key + '" style="min-height:44px;padding:0 14px;">' + Reports.rangeLabel(key) + '</button>';
    });
    html += '</div>';

    if (range === 'custom') {
      var today = new Date().toISOString().slice(0, 10);
      var startVal = window.reportCustomStart || today;
      var endVal = window.reportCustomEnd || today;
      html += '<div class="card" style="margin-bottom:12px;">';
      html += '<div class="row-spread" style="gap:8px;align-items:center;flex-wrap:wrap;">';
      html += '<div class="field" style="flex:1;min-width:120px;"><label class="field-label">From</label><input type="date" id="rStart" value="' + startVal + '" style="width:100%;min-height:44px;font-size:16px;border:1px solid #ccc;border-radius:8px;padding:8px;"></div>';
      html += '<div class="field" style="flex:1;min-width:120px;"><label class="field-label">To</label><input type="date" id="rEnd" value="' + endVal + '" style="width:100%;min-height:44px;font-size:16px;border:1px solid #ccc;border-radius:8px;padding:8px;"></div>';
      html += '</div>';
      html += '<div class="spacer-8"></div>';
      html += '<button class="btn btn-primary btn-full" data-action="r-apply-custom" style="min-height:44px;">Apply</button>';
      html += '</div>';
    }

    // ── Summary hero ──
    html += '<div class="today-hero card" style="text-align:center;margin-bottom:12px;">';
    html += '<div class="today-count" style="font-size:48px;font-weight:700;color:#c99a2e;">' + sum.walkins + '</div>';
    html += '<div class="today-label muted">' + escapeHtml(resolved.label) + '</div>';
    html += '<div class="spacer-8"></div>';
    html += '<div style="font-size:14px;">' + sum.conversions + ' converted &middot; ' + sum.conversionPct + '% &middot; ' + Reports.formatINR(sum.totalSale) + '</div>';
    html += '<div class="spacer-8"></div>';
    html += '<div class="row-spread" style="justify-content:space-around;">';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:600;color:#e05;">' + sum.hot + '</div><div class="tiny muted">Hot leads</div></div>';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:600;">' + sum.followPending + '</div><div class="tiny muted">Follow-ups</div></div>';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:600;">' + sum.uniqueCustomers + '</div><div class="tiny muted">Unique</div></div>';
    html += '</div>';
    html += '</div>';

    // ── Export buttons ──
    html += '<div class="row-spread" style="gap:8px;margin-bottom:16px;">';
    html += '<button class="btn btn-secondary" data-action="r-export-visits" style="flex:1;min-height:44px;font-size:13px;">Export Visits CSV</button>';
    html += '<button class="btn btn-secondary" data-action="r-export-summary" style="flex:1;min-height:44px;font-size:13px;">Export Daily Summary</button>';
    html += '</div>';

    // ── Breakdowns ──
    var breakdownFields = [
      { field: 'reason', title: 'Why they didn\'t buy' },
      { field: 'store', title: 'By store' },
      { field: 'greetor', title: 'By greetor' },
      { field: 'category', title: 'By category' },
      { field: 'leadStatus', title: 'Lead status' }
    ];

    breakdownFields.forEach(function (bf) {
      var rows = Reports.breakdown(recs, bf.field);
      if (!rows || rows.length === 0) return;
      var capped = rows.slice(0, 8);
      html += '<div class="card" style="margin-bottom:12px;">';
      html += '<div style="font-weight:600;margin-bottom:10px;">' + escapeHtml(bf.title) + '</div>';
      capped.forEach(function (row) {
        var barWidth = Math.max(2, row.pct);
        html += '<div style="margin-bottom:8px;">';
        html += '<div class="row-spread" style="margin-bottom:4px;"><span style="font-size:13px;">' + escapeHtml(String(row.key || '—')) + '</span><span class="tiny muted">' + row.count + ' (' + row.pct + '%)</span></div>';
        html += '<div style="background:#eef;border-radius:999px;height:8px;">';
        html += '<div style="height:8px;background:#c99a2e;width:' + barWidth + '%;border-radius:999px;"></div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    });

    // ── Visit list ──
    var sorted = recs.slice().sort(function (a, b) {
      var da = (a.visitDate || '') + 'T' + (a.visitTime || '');
      var db = (b.visitDate || '') + 'T' + (b.visitTime || '');
      return db < da ? -1 : db > da ? 1 : 0;
    });

    html += '<div style="font-weight:600;margin-bottom:10px;">Visits (' + sorted.length + ')</div>';

    if (sorted.length === 0) {
      html += '<div class="empty-state">';
      html += '<div class="icon" style="font-size:40px;margin-bottom:12px;">🚶</div>';
      html += '<h3>No walk-ins in this period</h3>';
      html += '</div>';
    } else {
      sorted.forEach(function (rec) {
        var name = escapeHtml(rec.customerName || 'Unnamed');
        var status = rec.leadStatus || 'Open';
        var pClass = pillClass(status);
        var timeStr = rec.visitTime ? rec.visitTime.slice(0, 5) : '';
        var storeStr = escapeHtml(rec.store || '');
        var catStr = [rec.category, rec.brand, rec.reason].filter(Boolean).map(escapeHtml).join(' · ');

        var canEdit = !window.can || window.can('editAny');
        html += '<div class="entry-card"' + (canEdit ? ' data-action="edit-entry" data-id="' + escapeHtml(rec.recordId || '') + '" style="cursor:pointer;"' : '') + '>';
        html += '<div class="entry-row"><span class="entry-name">' + name + '</span><span class="pill ' + pClass + '">' + escapeHtml(status) + '</span></div>';
        html += '<div class="entry-mobile muted">' + timeStr + (timeStr && storeStr ? ' · ' : '') + storeStr + '</div>';
        if (catStr) html += '<div class="entry-meta tiny muted">' + catStr + '</div>';
        if (rec.saleValue) html += '<div class="tiny" style="color:#c99a2e;font-weight:600;">' + Reports.formatINR(rec.saleValue) + '</div>';
        html += '</div>';
      });
    }

    return html;
  }

  // ── handleAction ───────────────────────────────────────────────────────────

  function handleAction(action, dataset) {
    if (action === 'r-range') {
      window.reportRange = dataset.range;
      if (typeof window.render === 'function') window.render();
      return true;
    }

    if (action === 'r-apply-custom') {
      var startEl = document.getElementById('rStart');
      var endEl = document.getElementById('rEnd');
      if (startEl) window.reportCustomStart = startEl.value;
      if (endEl) window.reportCustomEnd = endEl.value;
      if (typeof window.render === 'function') window.render();
      return true;
    }

    if (action === 'r-export-visits' || action === 'r-export-summary') {
      // Recompute recs (role + range) to match what's shown
      var auth = (typeof AuthSession !== 'undefined') ? AuthSession.current() : null;
      var storeObj = (typeof Store !== 'undefined') ? Store : null;
      var all = (storeObj && storeObj._records) ? storeObj._records
              : (window._lastState && window._lastState.records) ? window._lastState.records
              : [];
      var roleRecs = (auth && auth.role === 'GREETOR')
        ? all.filter(function (r) { return r.createdByUserId === auth.id; })
        : all;
      var range = window.reportRange || 'today';
      var recs = Reports.filterByRange(roleRecs, range, window.reportCustomStart, window.reportCustomEnd);

      if (action === 'r-export-visits') {
        var csv = Reports.visitsCSV(recs);
        shareCSV('saagar_greetor_visits_' + range + '.csv', csv);
      } else {
        var csv2 = Reports.dailySummaryCSV(recs);
        shareCSV('saagar_greetor_summary.csv', csv2);
      }
      return true;
    }

    return false;
  }

  // ── expose ─────────────────────────────────────────────────────────────────

  window.ReportsUI = { render: render, handleAction: handleAction };

}());
