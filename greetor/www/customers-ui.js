/* customers-ui.js — window.CustomersUI (Customers list + detail screens)
   Standalone IIFE; does NOT edit index.html, customers.js, or pipeline-ui.js. */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────────────── */

  function fmt91(mobile) {
    var m = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (m.length === 10) return '+91 ' + m.slice(0, 5) + ' ' + m.slice(5);
    return mobile || '';
  }

  function statusPill(status) {
    var map = {
      Hot: 'pill-hot', Warm: 'pill-warm', Cold: 'pill-cold',
      Open: 'pill-open', Converted: 'pill-converted', Closed: 'pill-closed'
    };
    var cls = map[status] || 'pill-open';
    return '<span class="pill ' + cls + '">' + escapeHtml(status || 'Open') + '</span>';
  }

  function guardCustomers() {
    return typeof window.Customers !== 'undefined';
  }

  // SQLite P3: render() is async (Customers.* are async, DB-backed) and ALWAYS
  // returns the HTML string. It ALSO self-paints into its OWN element so the
  // host can use either model:
  //   • `el.innerHTML = await CustomersUI.render()`   (host assigns)  — or —
  //   • `await CustomersUI.render(el)` / `await CustomersUI.render()` (self-paint
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

  function safeEscape(s) {
    return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── list helpers ─────────────────────────────────────────────────────── */

  function buildRows(customers) {
    if (!customers || customers.length === 0) {
      return '<div class="empty-state"><div class="icon">👥</div>' +
        '<h3>No customers yet</h3><p class="muted">Walk-ins will appear here.</p></div>';
    }
    return customers.map(function (c) {
      var name = safeEscape(c.name || 'Unnamed');
      var storeList = safeEscape((c.stores || []).join(', '));
      var ago = c.lastVisitAgoDays != null ? c.lastVisitAgoDays + 'd ago' : '—';
      var convertedBadge = c.converted
        ? '<span class="pill pill-converted" style="margin-left:6px">' +
          safeEscape(Customers.formatINR(c.totalSaleValue || 0)) + '</span>'
        : '';
      return '<div class="entry-card" data-action="c-open" data-mobile="' +
        safeEscape(c.mobile) + '" style="cursor:pointer">' +
        '<div class="entry-row">' +
        '<span class="entry-name">' + name + '</span>' +
        statusPill(c.status) + convertedBadge +
        '</div>' +
        '<div class="entry-mobile">' + safeEscape(fmt91(c.mobile)) + '</div>' +
        '<div class="entry-meta">' +
        safeEscape(String(c.visitCount || 0)) + ' visit(s) · last ' +
        safeEscape(ago) + ' · ' + storeList +
        '</div>' +
        '</div>';
    }).join('');
  }

  async function renderList() {
    if (!guardCustomers()) {
      return '<div class="empty-state"><div class="icon">⏳</div><h3>Loading…</h3></div>';
    }
    var search = window._custSearch || '';
    var sort = window._custSort || 'recent';
    // DB-backed, async (NO state arg). Greetors intentionally see ALL customers
    // (owner decision) — Customers.list applies no role filter and we add none.
    var customers = await Customers.list({ search: search, sort: sort });

    var sortChips = ['recent', 'visits', 'value', 'name'].map(function (s) {
      var label = { recent: 'Recent', visits: 'Visits', value: 'Value', name: 'Name' }[s];
      var sel = sort === s ? ' selected' : '';
      return '<span class="chip' + sel + '" data-action="c-sort" data-sort="' + s + '">' + label + '</span>';
    }).join('');

    return '<div class="field" style="margin-bottom:8px">' +
      '<input type="search" id="custSearch" placeholder="Search name or mobile"' +
      ' oninput="window.CustomersUI.onSearch(this.value)"' +
      ' value="' + safeEscape(search) + '">' +
      '</div>' +
      '<div class="chip-group" style="margin-bottom:12px">' + sortChips + '</div>' +
      '<div id="custList">' + buildRows(customers) + '</div>';
  }

  /* ── detail helpers ───────────────────────────────────────────────────── */

  function renderVisitCard(v) {
    var saleStr = v.saleValue ? ' · ' + safeEscape(Customers.formatINR(v.saleValue)) : '';
    var followStr = v.followDate
      ? '<div class="tiny muted">Follow-up: ' + safeEscape(v.followDate) + '</div>'
      : '';
    return '<div class="entry-card">' +
      '<div class="entry-row">' +
      '<span class="tiny muted">' + safeEscape(v.visitDate || '') + ' ' + safeEscape(v.visitTime || '') + '</span>' +
      statusPill(v.leadStatus) +
      '</div>' +
      '<div class="entry-meta">' +
      safeEscape(v.store || '') + ' · ' + safeEscape(v.category || '') +
      (v.brand ? ' · ' + safeEscape(v.brand) : '') +
      '</div>' +
      '<div><strong>' + safeEscape(v.reason || '') + '</strong>' + saleStr + '</div>' +
      followStr +
      ((Array.isArray(v.photos) && v.photos.length)
        ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
          v.photos.map(function (p) {
            var src = (window.Photo && window.Photo.src) ? window.Photo.src(p) : (p && (p.src || p.uri)) || '';
            return '<img src="' + safeEscape(src) + '" alt="photo" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb">';
          }).join('') + '</div>'
        : '') +
      ((window.canSafe && window.canSafe('editAny'))
        ? '<div class="entry-actions" style="margin-top:8px">' +
          '<button class="btn btn-secondary entry-action" data-action="edit-entry" data-id="' +
          safeEscape(v.recordId) + '">Edit</button>' +
          '</div>'
        : '') +
      '</div>';
  }

  async function renderDetail(mobile) {
    if (!guardCustomers()) {
      return '<div class="empty-state"><div class="icon">⏳</div><h3>Loading…</h3></div>';
    }
    // DB-backed, async (NO state arg).
    var c = await Customers.byMobile(mobile);
    if (!c) {
      return '<button class="btn btn-ghost" data-action="c-back">← Back</button>' +
        '<div class="empty-state"><div class="icon">🔍</div>' +
        '<h3>Customer not found</h3></div>';
    }
    var visits = c.visits || [];
    var latestId = visits.length ? safeEscape(visits[0].recordId) : '';
    var name = safeEscape(c.name || 'Unnamed');

    var convertBtn = (!c.converted && latestId && (window.canSafe && window.canSafe('manageLeads')))
      ? '<button class="btn btn-primary btn-full" style="margin-top:12px"' +
        ' data-action="open-convert" data-id="' + latestId + '">Convert latest to sale</button>'
      : '';

    var visitCards = visits.map(renderVisitCard).join('');

    return '<button class="btn btn-ghost" data-action="c-back" style="margin-bottom:12px">← Back</button>' +

      '<div class="card" style="margin-bottom:12px">' +
      '<div style="font-size:1.25rem;font-weight:700;margin-bottom:4px">' + name + '</div>' +
      '<div class="entry-mobile" style="margin-bottom:10px">' + safeEscape(fmt91(c.mobile)) + '</div>' +
      '<div class="entry-actions">' +
      (latestId
        ? '<button class="btn btn-secondary entry-action wa" data-action="wa-customer"' +
          ' data-id="' + latestId + '">WhatsApp</button>'
        : '') +
      '<button class="btn btn-secondary entry-action" data-action="call-customer"' +
      ' data-mobile="' + safeEscape(c.mobile) + '">Call</button>' +
      '<button class="btn btn-secondary entry-action" data-action="c-export-profile"' +
      ' data-mobile="' + safeEscape(c.mobile) + '">📄 Export PDF</button>' +
      '</div>' +
      '</div>' +

      '<div class="card row-spread" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">' +
      '<div style="text-align:center">' +
      '<div class="today-count">' + safeEscape(String(c.visitCount || 0)) + '</div>' +
      '<div class="today-label">Visits</div></div>' +
      '<div style="text-align:center">' +
      '<div class="today-count tiny">' + safeEscape(c.firstVisitDate || '—') + '</div>' +
      '<div class="today-label">First visit</div></div>' +
      '<div style="text-align:center">' +
      '<div class="today-count">' + safeEscape(c.lastVisitAgoDays != null ? c.lastVisitAgoDays + 'd' : '—') + '</div>' +
      '<div class="today-label">Last visit</div></div>' +
      '<div style="text-align:center">' +
      '<div class="today-count tiny">' + safeEscape(Customers.formatINR(c.totalSaleValue || 0)) + '</div>' +
      '<div class="today-label">Total sale</div></div>' +
      '</div>' +

      convertBtn +

      '<div style="font-weight:600;margin:16px 0 8px">Visit history (' + visits.length + ')</div>' +
      (visitCards || '<div class="muted">No visits recorded.</div>');
  }

  /* ── public API ───────────────────────────────────────────────────────── */

  window.CustomersUI = {

    // ASYNC (SQLite P3). Builds the list or detail HTML from the DB-backed
    // async data layer, self-paints into its own target element, AND returns the
    // HTML string so the host can use either model. `target` is optional
    // (element or id); when omitted it self-paints into #leadsBody if present,
    // otherwise it only returns the string for the host to place.
    render: async function (target) {
      var mobile = window.leadsCustomerMobile || '';
      var html = mobile ? await renderDetail(mobile) : await renderList();
      var el = resolveTarget(target);
      if (el) el.innerHTML = html;
      return html;
    },

    // ASYNC: incremental search repaint of just the #custList sublist (no full
    // re-render, so the search box keeps focus). Bound via oninput in renderList.
    onSearch: async function (val) {
      window._custSearch = val;
      var el = typeof $ === 'function' ? $('custList') : document.getElementById('custList');
      if (!el) {
        if (window.render) window.render();
        return;
      }
      if (!guardCustomers()) { el.innerHTML = '<div class="muted">Loading…</div>'; return; }
      var sort = window._custSort || 'recent';
      try {
        var customers = await Customers.list({ search: val, sort: sort });
        el.innerHTML = buildRows(customers);
      } catch (e) {
        el.innerHTML = '<div class="muted">Could not load customers.</div>';
      }
    },

    // SYNC + BOOLEAN (locked contract): the host router does
    // `if (CustomersUI.handleAction(a,ds)) return;` — a Promise would always be
    // truthy and swallow every click. These are read-only view toggles: set a
    // window.* var then fire-and-forget the async host render(); return true.
    handleAction: function (action, dataset) {
      if (!action || action.indexOf('c-') !== 0) return false;
      if (action === 'c-open') {
        window.leadsCustomerMobile = dataset.mobile || '';
        if (window.render) window.render();
        return true;
      }
      if (action === 'c-back') {
        window.leadsCustomerMobile = '';
        if (window.render) window.render();
        return true;
      }
      if (action === 'c-sort') {
        window._custSort = dataset.sort || 'recent';
        if (window.render) window.render();
        return true;
      }
      if (action === 'c-export-profile') {
        var mobile = dataset.mobile;
        (function () {
          if (!window.ReportEngine || !window.ReportEngine.run) { if (typeof toast === 'function') toast('Reports not ready yet'); return; }
          if (!mobile) { if (typeof toast === 'function') toast('No customer selected'); return; }
          window.ReportEngine.run('customer-history', { mobile: mobile });
        })();
        return true;
      }
      return false;
    }
  };

}());
