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
    // Use the reliable native file layer when available (writes a real file
    // then opens the share sheet — works inside the Capacitor WebView).
    if (window.SaagarShell && window.SaagarShell.exportFile) {
      window.SaagarShell.exportFile(filename, 'text/csv', text).then(function (res) {
        if (res && res.ok) { if (typeof toast === 'function') toast('Exported ' + filename); }
        else if (res && !res.cancelled) { if (typeof toast === 'function') toast('Export failed'); }
      });
      return;
    }
    // Fallback for plain browsers.
    try {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof toast === 'function') toast('Exported ' + filename);
    } catch (e) { /* ignore */ }
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

    // ── True-conversion overlay (audit R12 / denominator) ──
    if (window.Footfall) {
      var ffTotal = window.Footfall.totalForRange(state, resolved.startDate, resolved.endDate);
      if (ffTotal > 0) {
        var truePct = window.Footfall.trueConversionPct(sum.walkins, sum.conversions, ffTotal);
        var coverage = window.Footfall.captureCoverage(sum.walkins, ffTotal);
        html += '<div class="card" style="margin-bottom:12px;border:1px dashed #c99a2e;">'
          + '<div class="row-spread" style="margin-bottom:6px;"><span style="font-weight:600;">True conversion</span>'
          + '<span class="muted tiny">vs ' + ffTotal + ' est. footfall</span></div>'
          + '<div style="font-size:14px;">' + sum.conversions + ' converted of ' + ffTotal + ' visitors &middot; <strong>' + truePct + '%</strong></div>'
          + (coverage != null ? '<div class="tiny muted" style="margin-top:4px;">Captured ' + coverage + '% of walk-ins (' + sum.walkins + ' of ~' + ffTotal + '). The ' + sum.conversionPct + '% above is over captured only.</div>' : '')
          + '</div>';
      }
    }

    // ── "Converted without value" worklist (audit R1) ──
    // New conversions always go through the convert modal (which captures
    // saleValue), so this only surfaces legacy/edge records to clean up —
    // otherwise their revenue is silently counted as ₹0.
    var noValue = recs.filter(function (r) {
      return r.leadStatus === 'Converted' && !(Number(r.saleValue) > 0);
    });
    if (noValue.length) {
      html += '<div class="card" style="margin-bottom:12px;border:1px solid #ba2d2d;">';
      html += '<div style="font-weight:600;color:#ba2d2d;margin-bottom:6px;">Converted without sale value (' + noValue.length + ')</div>';
      html += '<div class="tiny muted" style="margin-bottom:8px;">These count as ₹0 in revenue. Tap to open and set the value.</div>';
      noValue.slice(0, 10).forEach(function (r) {
        html += '<div class="entry-card" data-action="edit-entry" data-id="' + escapeHtml(r.recordId || '') + '" style="cursor:pointer;margin-bottom:6px;">'
          + '<div class="entry-row"><span class="entry-name">' + escapeHtml(r.customerName || 'Unnamed') + '</span>'
          + '<span class="muted tiny">' + escapeHtml(r.visitDate || '') + '</span></div>'
          + '<div class="entry-meta tiny muted">' + escapeHtml([r.store, r.category, r.brand].filter(Boolean).join(' · ')) + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    // ── Trend chart + targets attainment + leaderboard (T+C+P) ──
    (function () {
      var period = range === 'today' ? 'daily' : (range === '7d' ? 'weekly' : 'monthly');

      // Walk-in trend (one zero-filled point per day) + delta vs prior window
      if (window.Charts && typeof Charts.line === 'function') {
        var counts = {};
        recs.forEach(function (r) { if (r.visitDate) counts[r.visitDate] = (counts[r.visitDate] || 0) + 1; });
        var pts = [], d = new Date(resolved.startDate + 'T00:00:00'), end = new Date(resolved.endDate + 'T00:00:00'), guard = 0;
        if (!isNaN(d) && !isNaN(end) && end >= d) {
          while (d <= end && guard < 400) {
            var key = d.toISOString().slice(0, 10);
            pts.push({ label: key.slice(5), value: counts[key] || 0 });
            d.setDate(d.getDate() + 1); guard++;
          }
        }
        var prevCount = 0, s = new Date(resolved.startDate + 'T00:00:00'), e2 = new Date(resolved.endDate + 'T00:00:00');
        if (!isNaN(s) && !isNaN(e2)) {
          var span = Math.round((e2 - s) / 86400000) + 1;
          var pe = new Date(s); pe.setDate(pe.getDate() - 1);
          var ps = new Date(pe); ps.setDate(ps.getDate() - (span - 1));
          var psS = ps.toISOString().slice(0, 10), peS = pe.toISOString().slice(0, 10);
          prevCount = roleRecs.filter(function (r) { return r.visitDate >= psS && r.visitDate <= peS; }).length;
        }
        if (pts.length >= 1) {
          html += '<div class="card" style="margin-bottom:12px;">';
          html += '<div class="row-spread" style="margin-bottom:8px;"><span style="font-weight:600;">Walk-in trend</span>'
                + (typeof Charts.deltaBadge === 'function' ? Charts.deltaBadge(recs.length, prevCount) : '') + '</div>';
          html += Charts.line(pts, { height: 110 });
          html += '</div>';
        }
      }

      // Targets attainment
      if (window.Targets && typeof Targets.attainment === 'function') {
        var uid = (auth && auth.role === 'GREETOR') ? auth.id : null;
        var att = Targets.attainment(state, period, roleRecs, uid);
        var bar = function (lbl, m) {
          if (!m || !m.target) return '<div class="tiny muted" style="margin-bottom:6px;">' + lbl + ': ' + (m ? m.actual : 0) + ' (no target set)</div>';
          var pct = Math.min(100, m.pct || 0);
          var col = pct >= 100 ? '#168a51' : (pct >= 60 ? '#c99a2e' : '#ba2d2d');
          return '<div style="margin-bottom:8px;"><div class="row-spread" style="margin-bottom:4px;"><span style="font-size:13px;">' + lbl + '</span><span class="tiny muted">' + m.actual + ' / ' + m.target + ' (' + (m.pct || 0) + '%)</span></div>'
               + '<div style="background:#eef;border-radius:999px;height:8px;"><div style="height:8px;background:' + col + ';width:' + Math.max(2, pct) + '%;border-radius:999px;"></div></div></div>';
        };
        html += '<div class="card" style="margin-bottom:12px;">';
        html += '<div style="font-weight:600;margin-bottom:10px;">Targets &middot; ' + (typeof Targets.periodLabel === 'function' ? Targets.periodLabel(period) : period) + '</div>';
        html += bar('Walk-ins', att.walkins);
        html += bar('Conversions', att.conversions);
        html += '</div>';
      }

      // Greetor leaderboard (Manager/Owner only)
      if (window.Targets && typeof Targets.leaderboard === 'function' && auth && auth.role !== 'GREETOR') {
        var periodRecs = (typeof Targets.recordsInPeriod === 'function') ? Targets.recordsInPeriod(all, period) : all;
        var lb = Targets.leaderboard(state, periodRecs, period);
        if (lb && lb.length) {
          html += '<div class="card" style="margin-bottom:12px;">';
          html += '<div style="font-weight:600;margin-bottom:10px;">Greetor leaderboard &middot; ' + (typeof Targets.periodLabel === 'function' ? Targets.periodLabel(period) : period) + '</div>';
          lb.slice(0, 10).forEach(function (row, i) {
            html += '<div class="row-spread" style="padding:6px 0;border-top:' + (i ? '1px solid #f0f0f0' : '0') + ';">';
            html += '<span style="font-size:14px;">' + (i + 1) + '. ' + escapeHtml(row.name || 'Unknown') + '</span>';
            html += '<span class="tiny muted">' + row.walkins + ' visits &middot; ' + row.conversions + ' conv (' + row.conversionPct + '%) &middot; ' + Reports.formatINR(row.saleValue) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
      }
    })();

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

        var canEdit = window.canSafe && window.canSafe('editAny');
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
