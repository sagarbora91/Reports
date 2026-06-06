/* paginate.js — window.Paginate: shared list pagination for the app's long lists.
 * Replaces endless scroll with one short page (PAGE_SIZE items) + Prev/Next
 * controls. Page state lives in caller-owned window.* vars; page changes route
 * through each module's sync-boolean handleAction (data-action + data-page). */
(function () {
  "use strict";
  var PAGE_SIZE = 5;

  // page(items, current) -> { items, page, pages, total, start, end }
  function page(items, current) {
    items = Array.isArray(items) ? items : [];
    var total = items.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var p = parseInt(current, 10); if (!(p >= 1)) p = 1; if (p > pages) p = pages;
    var start = (p - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    return { items: items.slice(start, end), page: p, pages: pages, total: total, start: start, end: end };
  }

  // controls(info, action, extraAttrs) -> HTML: "‹ Prev   Page X of Y / N total   Next ›"
  // Buttons fire data-action=action with data-page=<target>. extraAttrs is an
  // optional pre-built attribute string (e.g. ' data-stage="Hot"') for context.
  function controls(info, action, extraAttrs) {
    if (!info || info.pages <= 1) return "";
    extraAttrs = extraAttrs || "";
    function btn(label, target, disabled) {
      return '<button class="btn btn-secondary" ' + (disabled ? "disabled " : "") +
        'data-action="' + action + '" data-page="' + target + '"' + extraAttrs +
        ' style="min-height:40px;min-width:84px;font-size:13px;' + (disabled ? "opacity:.4;" : "") + '">' + label + "</button>";
    }
    return '<div class="row-spread" style="align-items:center;gap:8px;margin:12px 0 6px;">' +
      btn("‹ Prev", info.page - 1, info.page <= 1) +
      '<span class="tiny muted" style="text-align:center;flex:1;line-height:1.3;">Page ' + info.page + " of " + info.pages + "<br>" + info.total + " total</span>" +
      btn("Next ›", info.page + 1, info.page >= info.pages) +
      "</div>";
  }

  window.Paginate = { PAGE_SIZE: PAGE_SIZE, page: page, controls: controls };
})();
