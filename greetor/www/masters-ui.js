/**
 * masters-ui.js — Saagar Greetor Masters Editor UI
 * Defines window.MastersUI. Loaded as a plain <script> tag (not a module).
 * Depends at call-time on: window.Masters, Store, render, toast,
 * openModal, closeModal, escapeHtml, $ (id→element)
 */
(function () {
  'use strict';

  /* ── Tiny safety helpers ─────────────────────────────────── */
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(s));
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function readInput(id) {
    var el = typeof $ === 'function' ? $(id) : document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* ── Render helpers ──────────────────────────────────────── */
  function backBtn(view) {
    return '<button class="btn btn-ghost" style="padding:10px 0;margin-bottom:4px;" data-action="m-open" data-view="' + esc(view) + '">&#8592; Back</button>';
  }

  function itemRow(opts) {
    // opts: { id, name, active, type, extraBtn }
    var inactive = !opts.active;
    var nameHtml = inactive
      ? '<span class="muted">' + esc(opts.name) + '</span> <span class="pill pill-closed tiny">inactive</span>'
      : '<span>' + esc(opts.name) + '</span>';
    var toggleLabel = inactive ? 'Enable' : 'Disable';
    var toggleClass = inactive ? 'btn btn-secondary' : 'btn btn-ghost';
    return '<div class="settings-row">' +
      '<div style="flex:1;min-width:0;">' + nameHtml + '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;">' +
      (opts.extraBtn || '') +
      '<button class="btn btn-secondary" style="font-size:13px;padding:10px 12px;min-height:40px;" data-action="m-rename-' + esc(opts.actionNs) + '" data-id="' + esc(opts.id) + '" data-type="' + esc(opts.type || '') + '">Rename</button>' +
      '<button class="' + toggleClass + '" style="font-size:13px;padding:10px 12px;min-height:40px;" data-action="m-toggle-' + esc(opts.actionNs) + '" data-id="' + esc(opts.id) + '" data-type="' + esc(opts.type || '') + '">' + toggleLabel + '</button>' +
      '</div></div>';
  }

  function addField(inputId, action, dataAttrs, placeholder) {
    var attrs = '';
    if (dataAttrs) {
      Object.keys(dataAttrs).forEach(function (k) {
        attrs += ' data-' + esc(k) + '="' + esc(dataAttrs[k]) + '"';
      });
    }
    return '<div class="field">' +
      '<label class="field-label">Add new</label>' +
      '<input type="text" id="' + esc(inputId) + '" placeholder="' + esc(placeholder || 'Enter name…') + '" style="margin-bottom:10px;">' +
      '<button class="btn btn-secondary btn-full" data-action="' + esc(action) + '"' + attrs + '>+ Add</button>' +
      '</div>';
  }

  /* ── View: home ──────────────────────────────────────────── */
  function renderHome(state) {
    if (!window.Masters) return '<p class="muted">Masters not loaded.</p>';
    var M = window.Masters;
    var rows = '';

    // Stores row
    var storeCount = safe(function () { return M.storeNames(state).length; }, 0);
    rows += '<div class="settings-row">' +
      '<div><strong>Stores</strong><div class="tiny muted">' + storeCount + ' active</div></div>' +
      '<button class="btn btn-secondary" style="font-size:13px;padding:10px 14px;min-height:40px;" data-action="m-open" data-view="stores">Edit ›</button>' +
      '</div>';

    // Catalog row
    rows += '<div class="settings-row">' +
      '<div><strong>Store Catalog</strong><div class="tiny muted">Categories, sub-categories &amp; brands per store</div></div>' +
      '<button class="btn btn-secondary" style="font-size:13px;padding:10px 14px;min-height:40px;" data-action="m-open" data-view="catalog">Edit ›</button>' +
      '</div>';

    // Global types
    var globalTypes = safe(function () { return M.GLOBAL_TYPES; }, []);
    globalTypes.forEach(function (type) {
      var label = safe(function () { return M.labelFor(type); }, type);
      var count = safe(function () { return M.globalList(state, type).length; }, 0);
      rows += '<div class="settings-row">' +
        '<div><strong>' + esc(label) + '</strong><div class="tiny muted">' + count + ' active</div></div>' +
        '<button class="btn btn-secondary" style="font-size:13px;padding:10px 14px;min-height:40px;" data-action="m-open" data-view="g:' + esc(type) + '">Edit ›</button>' +
        '</div>';
    });

    var updatedAt = safe(function () { return state.masters && state.masters.updated_at ? state.masters.updated_at : '—'; }, '—');
    var version   = safe(function () { return state.masters && state.masters.version   ? state.masters.version   : '1'; }, '1');

    return '<div class="settings-section">' +
      '<h3>&#9881; Masters</h3>' +
      '<p>Edit the dropdowns and chip lists that appear in the capture form.</p>' +
      rows +
      '</div>' +
      '<div class="spacer-12"></div>' +
      '<div class="field">' +
      '<button class="btn btn-secondary btn-full" data-action="m-export" style="margin-bottom:10px;">&#8593; Export masters (JSON)</button>' +
      '<button class="btn btn-secondary btn-full" data-action="m-import">&#8595; Import masters (JSON)</button>' +
      '</div>' +
      '<p class="muted tiny" style="text-align:center;margin-top:8px;">Last edited: ' + esc(updatedAt) + ' &nbsp;·&nbsp; v' + esc(version) + '</p>';
  }

  /* ── View: global list ───────────────────────────────────── */
  function renderGlobal(state, type) {
    if (!window.Masters) return '';
    var M = window.Masters;
    var label = safe(function () { return M.labelFor(type); }, type);
    var items  = safe(function () { return M.rawGlobal(state, type); }, []);
    var isReasons = (type === 'reasons');

    var rowsHtml = '';
    items.forEach(function (item) {
      var extraBtn = '';
      if (isReasons) {
        var isTop   = !!item.top;
        var topLabel = isTop ? '★ Top' : 'Make top';
        var topClass = isTop ? 'btn btn-primary' : 'btn btn-ghost';
        extraBtn = '<button class="' + topClass + '" style="font-size:13px;padding:10px 12px;min-height:40px;" data-action="m-toggle-reason-top" data-id="' + esc(item.id) + '" data-type="' + esc(type) + '">' + topLabel + '</button>';
      }
      rowsHtml += itemRow({
        id: item.id, name: item.name, active: item.active !== false,
        actionNs: 'global', type: type, extraBtn: extraBtn
      });
    });

    return backBtn('home') +
      '<div class="settings-section">' +
      '<h3>' + esc(label) + '</h3>' +
      (rowsHtml || '<p class="muted">No items yet.</p>') +
      '</div>' +
      addField('mNewItem', 'm-add-global', { type: type }, 'New ' + label + ' item…');
  }

  /* ── View: stores ────────────────────────────────────────── */
  function renderStores(state) {
    if (!window.Masters) return '';
    var M = window.Masters;
    var stores = safe(function () { return M.rawStores(state); }, []);

    var rowsHtml = '';
    stores.forEach(function (s) {
      rowsHtml += itemRow({
        id: s.id, name: s.name, active: s.active !== false,
        actionNs: 'store', type: ''
      });
    });

    return backBtn('home') +
      '<div class="settings-section">' +
      '<h3>Stores</h3>' +
      (rowsHtml || '<p class="muted">No stores yet.</p>') +
      '</div>' +
      addField('mNewItem', 'm-add-store', {}, 'Store name…');
  }

  /* ── View: catalog ───────────────────────────────────────── */
  function renderCatalog(state) {
    if (!window.Masters) return '';
    var M = window.Masters;
    var storeNames = safe(function () { return M.storeNames(state); }, []);

    if (!storeNames.length) {
      return backBtn('home') +
        '<div class="card"><p class="muted">No stores defined. Add a store first.</p></div>';
    }

    // Determine picked store
    var picked = window.mastersStore || storeNames[0];
    if (storeNames.indexOf(picked) === -1) picked = storeNames[0];

    // Store picker chips
    var chipHtml = '<div class="chip-group" style="margin-bottom:14px;">';
    storeNames.forEach(function (sn) {
      chipHtml += '<button class="chip' + (sn === picked ? ' selected' : '') + '" data-action="m-pick-store" data-store="' + esc(sn) + '">' + esc(sn) + '</button>';
    });
    chipHtml += '</div>';

    // --- Brands ---
    var brands = safe(function () { return M.rawBrands(state, picked); }, []);
    var defaultBrand = safe(function () { return M.getDefaultBrand(state, picked); }, null);
    var activeBrands = brands.filter(function (b) { return b.active !== false; });

    var brandRows = '';
    brands.forEach(function (b) {
      brandRows += itemRow({
        id: b.id, name: b.name, active: b.active !== false,
        actionNs: 'brand', type: picked
      });
    });

    var defaultChips = '<div class="chip-group">';
    activeBrands.forEach(function (b) {
      var isSel = b.name === defaultBrand || b.id === defaultBrand;
      defaultChips += '<button class="chip' + (isSel ? ' selected' : '') + '" data-action="m-set-default-brand" data-store="' + esc(picked) + '" data-id="' + esc(b.id) + '">' + esc(b.name) + '</button>';
    });
    defaultChips += '</div>';

    var brandsSection = '<div class="settings-section">' +
      '<h3>Brands — ' + esc(picked) + '</h3>' +
      (brandRows || '<p class="muted">No brands yet.</p>') +
      '</div>' +
      '<div class="field"><label class="field-label">Default brand</label>' + defaultChips + '</div>' +
      addField('mNewBrand', 'm-add-brand', { store: picked }, 'Brand name…');

    // --- Categories ---
    var cats = safe(function () { return M.rawCategories(state, picked); }, []);
    var catSections = '';
    cats.forEach(function (cat) {
      var subs = safe(function () { return M.rawSubs(state, picked, cat.id); }, []);
      var subRows = '';
      subs.forEach(function (sub) {
        subRows += itemRow({
          id: sub.id, name: sub.name, active: sub.active !== false,
          actionNs: 'sub', type: picked + '|' + cat.id
        });
      });
      var inactive = cat.active === false;
      var catLabel = inactive
        ? '<span class="muted">' + esc(cat.name) + '</span> <span class="pill pill-closed tiny">inactive</span>'
        : '<strong>' + esc(cat.name) + '</strong>';

      catSections += '<div class="settings-section">' +
        '<div class="row-spread" style="margin-bottom:8px;">' +
        '<div>' + catLabel + '</div>' +
        '<div style="display:flex;gap:6px;">' +
        '<button class="btn btn-secondary" style="font-size:13px;padding:8px 12px;min-height:40px;" data-action="m-rename-category" data-id="' + esc(cat.id) + '" data-type="' + esc(picked) + '">Rename</button>' +
        '<button class="btn btn-ghost" style="font-size:13px;padding:8px 12px;min-height:40px;" data-action="m-toggle-category" data-id="' + esc(cat.id) + '" data-type="' + esc(picked) + '">' + (inactive ? 'Enable' : 'Disable') + '</button>' +
        '</div></div>' +
        '<div class="tiny muted" style="margin-bottom:8px;">Sub-categories</div>' +
        (subRows || '<p class="muted tiny">No sub-categories yet.</p>') +
        addField('mNewSub_' + cat.id, 'm-add-sub', { store: picked, catid: cat.id }, 'Sub-category name…') +
        '</div>';
    });

    var addCatHtml = addField('mNewCategory', 'm-add-category', { store: picked }, 'Category name…');

    return backBtn('home') +
      '<div class="card"><h3 style="margin:0;">Store Catalog</h3></div>' +
      chipHtml +
      brandsSection +
      '<div class="spacer-8"></div>' +
      '<div class="card"><strong>Categories — ' + esc(picked) + '</strong></div>' +
      catSections +
      addCatHtml;
  }

  /* ── Main render ─────────────────────────────────────────── */
  function renderMasters(state) {
    if (typeof Store === 'undefined' || typeof window.Masters === 'undefined') {
      return '<p class="muted" style="padding:24px;text-align:center;">Loading masters…</p>';
    }
    var view = window.mastersView || 'home';

    if (view === 'home') return renderHome(state);
    if (view === 'stores') return renderStores(state);
    if (view === 'catalog') return renderCatalog(state);
    if (view.indexOf('g:') === 0) return renderGlobal(state, view.slice(2));

    // Unknown view — fall back
    return renderHome(state);
  }

  /* ── handleAction ────────────────────────────────────────── */
  function handleAction(action, dataset) {
    if (action.indexOf('m-') !== 0) return false;

    /* Navigation */
    if (action === 'm-open') {
      window.mastersView = dataset.view || 'home';
      if (typeof render === 'function') render();
      return true;
    }
    if (action === 'm-pick-store') {
      window.mastersStore = dataset.store;
      if (typeof render === 'function') render();
      return true;
    }

    /* Guard: need Store + Masters */
    if (typeof Store === 'undefined' || typeof window.Masters === 'undefined') {
      if (typeof toast === 'function') toast('Not ready yet.');
      return true;
    }

    var M = window.Masters;
    var s = Store.load();

    /* --- Global list actions --- */
    if (action === 'm-add-global') {
      var val = readInput('mNewItem');
      if (!val) { toast('Enter a name first.'); return true; }
      var ok = safe(function () { return M.addGlobal(s, dataset.type, val); }, null);
      if (!ok) { toast('Already exists or empty.'); return true; }
      Store.save(s); render(); toast('Added.');
      return true;
    }
    if (action === 'm-rename-global') {
      var newName = prompt('Rename to:');
      if (!newName || !newName.trim()) return true;
      var ok2 = safe(function () { return M.renameGlobal(s, dataset.type, dataset.id, newName.trim()); }, null);
      if (!ok2) { toast('Could not rename.'); return true; }
      Store.save(s); render(); toast('Renamed.');
      return true;
    }
    if (action === 'm-toggle-global') {
      safe(function () { M.toggleGlobal(s, dataset.type, dataset.id); }, null);
      Store.save(s); render();
      return true;
    }
    if (action === 'm-toggle-reason-top') {
      safe(function () { M.toggleReasonTop(s, dataset.id); }, null);
      Store.save(s); render();
      return true;
    }

    /* --- Store actions --- */
    if (action === 'm-add-store') {
      var sval = readInput('mNewItem');
      if (!sval) { toast('Enter a store name.'); return true; }
      var ok3 = safe(function () { return M.addStore(s, sval); }, null);
      if (!ok3) { toast('Already exists or empty.'); return true; }
      Store.save(s); render(); toast('Store added.');
      return true;
    }
    if (action === 'm-rename-store') {
      var sname = prompt('Rename store to:');
      if (!sname || !sname.trim()) return true;
      var ok4 = safe(function () { return M.renameStore(s, dataset.id, sname.trim()); }, null);
      if (!ok4) { toast('Could not rename.'); return true; }
      Store.save(s); render(); toast('Renamed.');
      return true;
    }
    if (action === 'm-toggle-store') {
      safe(function () { M.toggleStore(s, dataset.id); }, null);
      Store.save(s); render();
      return true;
    }

    /* --- Brand actions --- */
    if (action === 'm-add-brand') {
      var bval = readInput('mNewBrand');
      if (!bval) { toast('Enter a brand name.'); return true; }
      var ok5 = safe(function () { return M.addBrand(s, dataset.store, bval); }, null);
      if (!ok5) { toast('Already exists or empty.'); return true; }
      Store.save(s); render(); toast('Brand added.');
      return true;
    }
    if (action === 'm-rename-brand') {
      var bname = prompt('Rename brand to:');
      if (!bname || !bname.trim()) return true;
      // dataset.type holds the store name for brands
      var ok6 = safe(function () { return M.renameBrand(s, dataset.type, dataset.id, bname.trim()); }, null);
      if (!ok6) { toast('Could not rename.'); return true; }
      Store.save(s); render(); toast('Renamed.');
      return true;
    }
    if (action === 'm-toggle-brand') {
      safe(function () { M.toggleBrand(s, dataset.type, dataset.id); }, null);
      Store.save(s); render();
      return true;
    }
    if (action === 'm-set-default-brand') {
      safe(function () { M.setDefaultBrand(s, dataset.store, dataset.id); }, null);
      Store.save(s); render(); toast('Default brand set.');
      return true;
    }

    /* --- Category actions --- */
    if (action === 'm-add-category') {
      var cval = readInput('mNewCategory');
      if (!cval) { toast('Enter a category name.'); return true; }
      var ok7 = safe(function () { return M.addCategory(s, dataset.store, cval); }, null);
      if (!ok7) { toast('Already exists or empty.'); return true; }
      Store.save(s); render(); toast('Category added.');
      return true;
    }
    if (action === 'm-rename-category') {
      var cname = prompt('Rename category to:');
      if (!cname || !cname.trim()) return true;
      // dataset.type = store name
      var ok8 = safe(function () { return M.renameCategory(s, dataset.type, dataset.id, cname.trim()); }, null);
      if (!ok8) { toast('Could not rename.'); return true; }
      Store.save(s); render(); toast('Renamed.');
      return true;
    }
    if (action === 'm-toggle-category') {
      safe(function () { M.toggleCategory(s, dataset.type, dataset.id); }, null);
      Store.save(s); render();
      return true;
    }

    /* --- Sub-category actions --- */
    if (action === 'm-add-sub') {
      var subInputId = 'mNewSub_' + dataset.catid;
      var subval = readInput(subInputId);
      if (!subval) { toast('Enter a sub-category name.'); return true; }
      var ok9 = safe(function () { return M.addSub(s, dataset.store, dataset.catid, subval); }, null);
      if (!ok9) { toast('Already exists or empty.'); return true; }
      Store.save(s); render(); toast('Sub-category added.');
      return true;
    }
    if (action === 'm-rename-sub') {
      var subname = prompt('Rename sub-category to:');
      if (!subname || !subname.trim()) return true;
      // dataset.type = "storeName|catId"
      var parts = (dataset.type || '').split('|');
      var storePart = parts[0]; var catPart = parts[1];
      var ok10 = safe(function () { return M.renameSub(s, storePart, catPart, dataset.id, subname.trim()); }, null);
      if (!ok10) { toast('Could not rename.'); return true; }
      Store.save(s); render(); toast('Renamed.');
      return true;
    }
    if (action === 'm-toggle-sub') {
      var parts2 = (dataset.type || '').split('|');
      safe(function () { M.toggleSub(s, parts2[0], parts2[1], dataset.id); }, null);
      Store.save(s); render();
      return true;
    }

    /* --- Export --- */
    if (action === 'm-export') {
      var exported = safe(function () { return M.export(s); }, null);
      if (!exported) { toast('Export failed.'); return true; }
      var jsonStr = JSON.stringify(exported, null, 2);
      var today = new Date().toISOString().slice(0, 10);
      var filename = 'saagar_greetor_masters_' + today + '.json';
      try {
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Saagar Greetor Masters' });
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
          toast('Exported.');
        }
      } catch (e) {
        toast('Export error: ' + e.message);
      }
      return true;
    }

    /* --- Import --- */
    if (action === 'm-import') {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) { document.body.removeChild(input); return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var parsed = JSON.parse(e.target.result);
            var s2 = Store.load();
            M.import(s2, parsed);
            Store.save(s2);
            render();
            toast('Masters imported.');
          } catch (err) {
            toast('Import failed: ' + err.message);
          }
          document.body.removeChild(input);
        };
        reader.readAsText(f);
      });
      input.click();
      return true;
    }

    // Unknown m- action — still "handled" to avoid host fallthrough noise
    return false;
  }

  /* ── Expose ──────────────────────────────────────────────── */
  window.MastersUI = {
    render: function (state) {
      return safe(function () { return renderMasters(state); }, '');
    },
    handleAction: function (action, dataset) {
      return safe(function () { return handleAction(action, dataset); }, false);
    }
  };
}());
