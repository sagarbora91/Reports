/**
 * masters-ui.js — Saagar Greetor Masters Editor UI
 * Defines window.MastersUI. Loaded as a plain <script> tag (not a module).
 * Depends at call-time on: window.Masters, window.Repo, render, toast,
 * openModal, closeModal, escapeHtml, $ (id→element)
 *
 * SQLite Phase 3: render() is ASYNC and reads the masters config from the DB
 * (await Repo.masters.get()) instead of the old whole-blob Store. handleAction()
 * STAYS a SYNCHRONOUS boolean-returning function — every mutation runs its
 * await chain inside an inner async IIFE (fetch masters → call the sync
 * in-place mutator from masters.js → Repo.masters.set → await window.render())
 * and returns true synchronously so the host router (which does
 * `if (handleAction(...)) return;`) is not swallowed by a truthy Promise.
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
  // Sync, pure-over-state dispatcher. `state` is { masters } built by the async
  // render() wrapper from Repo.masters.get(). The view sub-renderers are the
  // EXACT same sync functions as before — only the data source changed.
  function renderMasters(state) {
    if (typeof window.Masters === 'undefined') {
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
  // STAYS SYNC + returns BOOLEAN. The host router does
  // `if (window.MastersUI.handleAction(a, ds)) return;` — returning a Promise
  // would be truthy and swallow every other click, so async work runs inside an
  // inner IIFE (runMutation below) and we `return true` synchronously.
  //
  // runMutation: fetch masters from the DB, hand a { masters } state object to
  // the SYNC in-place mutator from masters.js (unchanged — it mutates
  // s.masters), persist via Repo.masters.set, then await the host render. `apply`
  // returns false to signal a validation failure (duplicate/empty) so we toast
  // the failure message and DO NOT persist. okMsg is toasted on success.
  function runMutation(apply, okMsg, failMsg) {
    (async function () {
      try {
        var s = { masters: await window.Repo.masters.get() };
        var result = apply(window.Masters, s);
        if (result === false) {
          if (failMsg && typeof toast === 'function') toast(failMsg);
          return;
        }
        await window.Repo.masters.set(s.masters);
        if (window.render) await window.render();
        if (okMsg && typeof toast === 'function') toast(okMsg);
      } catch (e) {
        if (typeof toast === 'function') toast('Could not save: ' + (e && e.message ? e.message : e));
      }
    }());
  }

  function handleAction(action, dataset) {
    if (action.indexOf('m-') !== 0) return false;

    /* Navigation (read-only view toggles — fire-and-forget render) */
    if (action === 'm-open') {
      window.mastersView = dataset.view || 'home';
      if (window.render) window.render();
      return true;
    }
    if (action === 'm-pick-store') {
      window.mastersStore = dataset.store;
      if (window.render) window.render();
      return true;
    }

    /* Guard: need Repo + Masters */
    if (!window.Repo || typeof window.Masters === 'undefined') {
      if (typeof toast === 'function') toast('Not ready yet.');
      return true;
    }

    /* --- Global list actions --- */
    if (action === 'm-add-global') {
      var val = readInput('mNewItem');
      if (!val) { toast('Enter a name first.'); return true; }
      runMutation(function (M, s) {
        return M.addGlobal(s, dataset.type, val) ? undefined : false;
      }, 'Added.', 'Already exists or empty.');
      return true;
    }
    if (action === 'm-rename-global') {
      var newName = prompt('Rename to:');
      if (!newName || !newName.trim()) return true;
      runMutation(function (M, s) {
        M.renameGlobal(s, dataset.type, dataset.id, newName.trim());
      }, 'Renamed.');
      return true;
    }
    if (action === 'm-toggle-global') {
      runMutation(function (M, s) {
        M.toggleGlobal(s, dataset.type, dataset.id);
      });
      return true;
    }
    if (action === 'm-toggle-reason-top') {
      runMutation(function (M, s) {
        M.toggleReasonTop(s, dataset.id);
      });
      return true;
    }

    /* --- Store actions --- */
    if (action === 'm-add-store') {
      var sval = readInput('mNewItem');
      if (!sval) { toast('Enter a store name.'); return true; }
      runMutation(function (M, s) {
        return M.addStore(s, sval) ? undefined : false;
      }, 'Store added.', 'Already exists or empty.');
      return true;
    }
    if (action === 'm-rename-store') {
      var sname = prompt('Rename store to:');
      if (!sname || !sname.trim()) return true;
      runMutation(function (M, s) {
        return M.renameStore(s, dataset.id, sname.trim()) ? undefined : false;
      }, 'Renamed.', 'Could not rename.');
      return true;
    }
    if (action === 'm-toggle-store') {
      runMutation(function (M, s) {
        M.toggleStore(s, dataset.id);
      });
      return true;
    }

    /* --- Brand actions --- */
    if (action === 'm-add-brand') {
      var bval = readInput('mNewBrand');
      if (!bval) { toast('Enter a brand name.'); return true; }
      runMutation(function (M, s) {
        return M.addBrand(s, dataset.store, bval) ? undefined : false;
      }, 'Brand added.', 'Already exists or empty.');
      return true;
    }
    if (action === 'm-rename-brand') {
      var bname = prompt('Rename brand to:');
      if (!bname || !bname.trim()) return true;
      // dataset.type holds the store name for brands
      runMutation(function (M, s) {
        M.renameBrand(s, dataset.type, dataset.id, bname.trim());
      }, 'Renamed.');
      return true;
    }
    if (action === 'm-toggle-brand') {
      runMutation(function (M, s) {
        M.toggleBrand(s, dataset.type, dataset.id);
      });
      return true;
    }
    if (action === 'm-set-default-brand') {
      runMutation(function (M, s) {
        M.setDefaultBrand(s, dataset.store, dataset.id);
      }, 'Default brand set.');
      return true;
    }

    /* --- Category actions --- */
    if (action === 'm-add-category') {
      var cval = readInput('mNewCategory');
      if (!cval) { toast('Enter a category name.'); return true; }
      runMutation(function (M, s) {
        return M.addCategory(s, dataset.store, cval) ? undefined : false;
      }, 'Category added.', 'Already exists or empty.');
      return true;
    }
    if (action === 'm-rename-category') {
      var cname = prompt('Rename category to:');
      if (!cname || !cname.trim()) return true;
      // dataset.type = store name
      runMutation(function (M, s) {
        M.renameCategory(s, dataset.type, dataset.id, cname.trim());
      }, 'Renamed.');
      return true;
    }
    if (action === 'm-toggle-category') {
      runMutation(function (M, s) {
        M.toggleCategory(s, dataset.type, dataset.id);
      });
      return true;
    }

    /* --- Sub-category actions --- */
    if (action === 'm-add-sub') {
      var subInputId = 'mNewSub_' + dataset.catid;
      var subval = readInput(subInputId);
      if (!subval) { toast('Enter a sub-category name.'); return true; }
      runMutation(function (M, s) {
        return M.addSub(s, dataset.store, dataset.catid, subval) ? undefined : false;
      }, 'Sub-category added.', 'Already exists or empty.');
      return true;
    }
    if (action === 'm-rename-sub') {
      var subname = prompt('Rename sub-category to:');
      if (!subname || !subname.trim()) return true;
      // dataset.type = "storeName|catId"
      var parts = (dataset.type || '').split('|');
      var storePart = parts[0]; var catPart = parts[1];
      runMutation(function (M, s) {
        M.renameSub(s, storePart, catPart, dataset.id, subname.trim());
      }, 'Renamed.');
      return true;
    }
    if (action === 'm-toggle-sub') {
      var parts2 = (dataset.type || '').split('|');
      runMutation(function (M, s) {
        M.toggleSub(s, parts2[0], parts2[1], dataset.id);
      });
      return true;
    }

    /* --- Export --- (read-only DB fetch; no mutation/render) */
    if (action === 'm-export') {
      (async function () {
        try {
          var s = { masters: await window.Repo.masters.get() };
          var exported = safe(function () { return window.Masters.export(s); }, null);
          if (!exported) { if (typeof toast === 'function') toast('Export failed.'); return; }
          var jsonStr = JSON.stringify(exported, null, 2);
          var today = new Date().toISOString().slice(0, 10);
          var filename = 'saagar_greetor_masters_' + today + '.json';
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
            if (typeof toast === 'function') toast('Exported.');
          }
        } catch (e) {
          if (typeof toast === 'function') toast('Export error: ' + (e && e.message ? e.message : e));
        }
      }());
      return true;
    }

    /* --- Import --- (parse file → M.import mutates s.masters → persist) */
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
          (async function () {
            try {
              var parsed = JSON.parse(e.target.result);
              var s2 = { masters: await window.Repo.masters.get() };
              window.Masters.import(s2, parsed);
              await window.Repo.masters.set(s2.masters);
              if (window.render) await window.render();
              if (typeof toast === 'function') toast('Masters imported.');
            } catch (err) {
              if (typeof toast === 'function') toast('Import failed: ' + (err && err.message ? err.message : err));
            }
          }());
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
    // ASYNC (SQLite P3): fetch the masters config from the DB, build the legacy
    // { masters } state shape the sync view sub-renderers expect, then return
    // the HTML string. The host (index.html) `await`s this and assigns it to
    // the screen element (with its own Back bar prepended). The `state` arg the
    // host still passes is ignored — masters comes from Repo now.
    render: async function (state) {
      if (!window.Repo) return '<p class="muted" style="padding:24px;text-align:center;">Loading masters…</p>';
      var masters;
      try {
        masters = await window.Repo.masters.get();
      } catch (e) {
        return '<p class="muted" style="padding:24px;text-align:center;">Could not load masters.</p>';
      }
      return safe(function () { return renderMasters({ masters: masters }); }, '');
    },
    handleAction: function (action, dataset) {
      return safe(function () { return handleAction(action, dataset); }, false);
    }
  };
}());
