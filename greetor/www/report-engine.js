/* report-engine.js — window.ReportEngine: the PDF report orchestrator.
 *
 * Offline-first Capacitor app, NO bundler. Plain <script> module: a strict-mode
 * IIFE that attaches a single window.ReportEngine global (same pattern as
 * reports.js / charts.js / reports-ui.js).
 *
 * Responsibilities:
 *   1. Lazy-load pdfmake (+ vfs fonts) and pdf.js ON DEMAND — never at file load,
 *      only when run() is invoked by a user tap. The libs are heavy, so a single
 *      in-flight promise is cached on window._pdfLibsPromise and reused by every
 *      concurrent tap.
 *   2. Build a real VECTOR PDF from a ReportDef (window.ReportDefs[defId]) — the
 *      def owns fetch() + toDocDef(); this engine only wires data → docDef →
 *      bytes, generating the bytes ONCE to bound memory.
 *   3. Preview the PDF on-device by rasterising pages with pdf.js into <canvas>
 *      elements inside a DEDICATED full-screen overlay (id="report-preview-root")
 *      appended to <body> — deliberately NOT inside #modal-root, which the host
 *      auto-closes on backdrop tap / goBack / hardware-back and would wipe the
 *      canvases mid-render.
 *   4. Hand the bytes to the native share helper (SaagarShell.exportPdf).
 *
 * Host globals are resolved via window.* at CALL time (never cached at load) and
 * optional ones are typeof-guarded, so load order and a phone WebView without
 * some optional module both work. Date stamps are computed locally (today() is a
 * host-inline global NOT in this module's scope — calling it would throw).
 */
(function () {
  "use strict";

  // Local date stamp — do NOT call the host-inline today() (out of scope here).
  var stamp = new Date().toISOString().slice(0, 10);

  // Render token: bumped on every preview teardown so an in-flight sequential
  // page-render loop can detect "the user closed it" and abort cleanly instead
  // of drawing onto / throwing about a removed canvas.
  var renderToken = 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  // Local escape (the host's escapeHtml is an index.html-inline global, not in
  // this module's scope — define our own, matching charts.js esc()).
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg) {
    // window.toast is a host-inline global; guard it the same way the other UI
    // modules do (typeof check) so this never throws in a bare browser/test.
    if (typeof window.toast === "function") {
      try { window.toast(msg); } catch (_) { /* ignore */ }
    }
  }

  // base64 (no data: prefix) -> Uint8Array. Derived from the SAME base64 we hand
  // to the share helper so we never make a second full copy of the document.
  function base64ToUint8(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── ensureLibs ───────────────────────────────────────────────────────────--
  // Lazy-load pdfmake -> vfs_fonts -> pdf.js, IN THAT ORDER, awaiting each before
  // the next. ORDER MATTERS:
  //   (a) pdfmake.min.js  — defines window.pdfMake; MUST be first.
  //   (b) vfs_fonts.js    — calls pdfMake.addVirtualFileSystem(); needs (a) loaded.
  //   (c) pdf.min.js      — pdf.js legacy UMD; attaches window.pdfjsLib.
  // Then point pdf.js at its worker file (set workerSrc only — do NOT loadScript
  // the worker; pdf.js spawns it itself). One in-flight promise is cached on
  // window._pdfLibsPromise so concurrent taps share a single load.
  function ensureLibs() {
    if (window._pdfLibsPromise) return window._pdfLibsPromise;

    window._pdfLibsPromise = (function () {
      var shell = window.SaagarShell;
      if (!shell || typeof shell.loadScript !== "function") {
        return Promise.reject(
          new Error("SaagarShell.loadScript unavailable — cannot lazy-load PDF libs")
        );
      }

      return shell.loadScript("assets/pdfmake.min.js")
        .then(function () { return shell.loadScript("assets/vfs_fonts.js"); })
        .then(function () { return shell.loadScript("assets/pdf.min.js"); })
        .then(function () {
          if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/pdf.worker.min.js";
          }
          // Hard asserts AFTER loading so a half-loaded lib fails loudly here
          // (and run()'s catch shows a friendly toast) rather than deep inside
          // createPdf()/getDocument(). NOTE: pdfmake 0.2.x registers fonts via
          // pdfMake.addVirtualFileSystem() (called by vfs_fonts.js) and exposes
          // NO public .vfs property — so we assert on createPdf, not .vfs. A
          // genuinely missing font surfaces later as a getBase64 reject, which
          // run()'s catch turns into a friendly toast.
          if (!window.pdfMake || typeof window.pdfMake.createPdf !== "function") {
            throw new Error("pdfmake not loaded");
          }
          if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== "function") {
            throw new Error("pdf.js not loaded");
          }
        })
        .catch(function (e) {
          // Drop the cached promise so a later tap can retry a clean load.
          window._pdfLibsPromise = null;
          throw e;
        });
    })();

    return window._pdfLibsPromise;
  }

  // ── text sanitisation (emoji / unsupported glyphs) ──────────────────────────
  // Roboto (pdfmake's only embedded font) can't render emoji or most pictographs.
  function sanitizePdfText(s) {
    if (typeof s !== "string" || !s) return s;
    return s
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")        // astral-plane pairs (most emoji)
      .replace(/[☀-➿⬀-⯿⌀-⏿]/g, "") // misc symbols / dingbats / technical
      .replace(/[︀-️‍⃣]/g, "");          // variation selectors, ZWJ, keycap
  }
  // Walk a pdfmake docDefinition in place: sanitise object `text` props and any
  // raw string cells inside arrays (table bodies). Leaves colors/widths/numbers.
  function sanitizeDocDef(node) {
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        if (typeof node[i] === "string") node[i] = sanitizePdfText(node[i]);
        else sanitizeDocDef(node[i]);
      }
      return;
    }
    if (node && typeof node === "object") {
      Object.keys(node).forEach(function (k) {
        if (k === "text" && typeof node[k] === "string") node[k] = sanitizePdfText(node[k]);
        else if (typeof node[k] === "object") sanitizeDocDef(node[k]);
      });
    }
  }

  // ── render timeout helper ────────────────────────────────────────────────────
  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () {
        reject(new Error((label || "operation") + " timed out"));
      }, ms);
      promise.then(
        function (v) { clearTimeout(to); resolve(v); },
        function (e) { clearTimeout(to); reject(e); }
      );
    });
  }

  // ── buildDocBytes ────────────────────────────────────────────────────────--
  // Resolve a ReportDef, fetch its data, turn it into a pdfmake docDefinition,
  // then generate the document bytes ONCE. We get base64 from pdfmake and derive
  // the Uint8Array from that same base64 — we deliberately do NOT also call
  // getBuffer()/getBlob(), which would build a second full copy of the PDF.
  function buildDocBytes(defId, ctx) {
    var defs = window.ReportDefs;
    var def = defs && defs[defId];
    if (!def) return Promise.reject(new Error("Unknown report: " + defId));

    return Promise.resolve(def.fetch(ctx)).then(function (data) {
      var opts = {
        brand: { navy: "#0b1f3a", gold: "#c99a2e" },
        formatINR:
          (window.Reports && window.Reports.formatINR) ||
          function (n) { return "₹" + n; },
        stamp: stamp,
        t:
          (window.I18n && window.I18n.t) ||
          function (k, d) { return d || k; }
      };

      var docDef = def.toDocDef(data, opts);
      // pdfmake's embedded Roboto font has no emoji/pictograph glyphs — leaving
      // them in can blank-box or throw during layout. Strip astral-plane chars
      // (most emoji), misc symbol/dingbat blocks, variation selectors and ZWJ
      // from all rendered text. Latin + Devanagari (Marathi, U+0900-097F) survive.
      try { sanitizeDocDef(docDef); } catch (_) {}

      return new Promise(function (resolve, reject) {
        try {
          window.pdfMake.createPdf(docDef).getBase64(function (b64) {
            try {
              var uint8 = base64ToUint8(b64);
              resolve({ base64: b64, uint8: uint8 });
            } catch (e) {
              reject(e);
            }
          });
        } catch (e) {
          // createPdf can throw synchronously on a malformed docDefinition.
          reject(e);
        }
      });
    });
  }

  // ── preview ──────────────────────────────────────────────────────────────--
  // Render the PDF into a dedicated full-screen overlay appended to <body>.
  // meta = { name, base64, filename, onShare }.
  //
  // We render at most the first 12 pages, one <canvas> at a time (await each
  // page.render().promise before starting the next) to bound peak memory on a
  // phone. A render token guards the loop: if the user taps Close mid-render,
  // teardown bumps the token and the loop bails. If pdf.js / the worker fails to
  // load the document at all we toast a soft message and STILL show Share — the
  // user can export even when preview is unavailable.
  var MAX_PAGES = 12;

  function teardownPreview() {
    renderToken++; // abort any in-flight render loop
    var existing = document.getElementById("report-preview-root");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function preview(uint8, meta) {
    meta = meta || {};

    // Fresh overlay every time — remove any stale one first (also bumps token).
    teardownPreview();
    var myToken = renderToken;

    var root = document.createElement("div");
    root.id = "report-preview-root";
    // NOTE: intentionally NO [data-modal-backdrop] attribute — the host's modal
    // teardown keys off that, and we must survive backdrop taps / hardware-back.
    root.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:10000;background:#52606d;" +
      "display:flex;flex-direction:column;" +
      "-webkit-overflow-scrolling:touch;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;"
    );

    var safeName = escapeHtml(meta.name || "Report");

    // Header bar (report name + Close).
    var headerHtml =
      '<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
      'gap:12px;padding:12px 16px;background:#0b1f3a;color:#fff;' +
      'box-shadow:0 1px 4px rgba(0,0,0,0.3);">' +
      '<span style="font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap;">' + safeName + "</span>" +
      '<button type="button" data-action="rep-close" ' +
      'style="flex:0 0 auto;min-height:44px;min-width:44px;padding:0 14px;border:0;' +
      'border-radius:8px;background:rgba(255,255,255,0.15);color:#fff;font-size:14px;' +
      'font-weight:600;cursor:pointer;">Close</button>' +
      "</div>";

    // Footer (Share / Save + Close).
    var footerHtml =
      '<div style="flex:0 0 auto;display:flex;gap:10px;padding:12px 16px;' +
      'background:#0b1f3a;box-shadow:0 -1px 4px rgba(0,0,0,0.3);">' +
      '<button type="button" data-action="rep-share" ' +
      'style="flex:1;min-height:48px;border:0;border-radius:10px;background:#c99a2e;' +
      'color:#0b1f3a;font-size:15px;font-weight:700;cursor:pointer;">Share / Save</button>' +
      '<button type="button" data-action="rep-close" ' +
      'style="flex:0 0 auto;min-height:48px;padding:0 18px;border:0;border-radius:10px;' +
      'background:rgba(255,255,255,0.15);color:#fff;font-size:15px;font-weight:600;' +
      'cursor:pointer;">Close</button>' +
      "</div>";

    // Body (scrollable pages container — full-width canvases on a phone).
    var body = document.createElement("div");
    body.setAttribute(
      "style",
      "flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:12px;" +
      "display:flex;flex-direction:column;align-items:center;gap:12px;"
    );

    root.innerHTML = headerHtml;
    root.appendChild(body);
    var footerWrap = document.createElement("div");
    footerWrap.innerHTML = footerHtml;
    // footerHtml is a single <div>; move it onto root so it's a flex child.
    root.appendChild(footerWrap.firstChild);

    // Single delegated click listener for ALL actions on this overlay.
    root.addEventListener("click", function (ev) {
      var node = ev.target;
      var action = null;
      while (node && node !== root) {
        if (node.getAttribute) {
          action = node.getAttribute("data-action");
          if (action) break;
        }
        node = node.parentNode;
      }
      if (!action) return;
      if (action === "rep-close") {
        teardownPreview();
      } else if (action === "rep-share") {
        if (typeof meta.onShare === "function") {
          try { meta.onShare(); } catch (e) { console.error("[ReportEngine] share", e); }
        }
      }
    });

    document.body.appendChild(root);

    function spinner(text) {
      var d = document.createElement("div");
      d.setAttribute("style", "color:#fff;font-size:14px;padding:24px 0;text-align:center;");
      d.textContent = text || "Rendering…";
      return d;
    }

    var loadingEl = spinner("Rendering preview…");
    body.appendChild(loadingEl);

    // Rasterise with pdf.js. Whole flow is async + guarded: any failure shows the
    // soft "preview unavailable" message but leaves Share usable.
    return (async function () {
      var pdf;
      try {
        pdf = await window.pdfjsLib.getDocument({ data: uint8 }).promise;
      } catch (e) {
        console.error("[ReportEngine] getDocument", e);
        if (myToken === renderToken && loadingEl.parentNode) {
          loadingEl.parentNode.removeChild(loadingEl);
        }
        toast("Preview unavailable — you can still share");
        return; // Share button stays; just no canvases.
      }

      // User may have closed the overlay while the document was opening.
      if (myToken !== renderToken) return;

      if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);

      var total = pdf.numPages || 0;
      var cap = Math.min(total, MAX_PAGES);

      // Render the available width of the body once (canvases are full-width).
      var targetW = body.clientWidth || 360;
      if (targetW > 720) targetW = 720; // don't over-rasterise on tablets
      // Account for the body's 12px horizontal padding.
      targetW = Math.max(120, targetW - 24);

      for (var pageNum = 1; pageNum <= cap; pageNum++) {
        if (myToken !== renderToken) return; // closed mid-loop -> abort cleanly
        try {
          var page = await pdf.getPage(pageNum);
          if (myToken !== renderToken) return;

          var baseViewport = page.getViewport({ scale: 1 });
          var scale = targetW / baseViewport.width;
          // Sharpen on hi-dpi phones, but cap to keep memory sane.
          var dpr = (window.devicePixelRatio || 1);
          if (dpr > 2) dpr = 2;
          var viewport = page.getViewport({ scale: scale * dpr });

          var canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.setAttribute(
            "style",
            "width:100%;height:auto;display:block;background:#fff;" +
            "box-shadow:0 2px 8px rgba(0,0,0,0.35);border-radius:2px;"
          );
          body.appendChild(canvas);

          var ctx2d = canvas.getContext("2d");
          // 15s per-page timeout so a hung pdf.js worker can't leave the preview
          // spinning forever — the page is skipped and the loop moves on.
          await withTimeout(page.render({ canvasContext: ctx2d, viewport: viewport }).promise, 15000, "page " + pageNum);

          if (myToken !== renderToken) return; // closed during render -> stop
        } catch (e) {
          console.error("[ReportEngine] render page " + pageNum, e);
          // One bad page shouldn't kill the rest; keep going.
        }
      }

      if (myToken !== renderToken) return;

      if (total > MAX_PAGES) {
        var more = document.createElement("div");
        more.setAttribute(
          "style",
          "color:#fff;font-size:13px;padding:8px 0 16px;text-align:center;opacity:0.9;"
        );
        more.textContent =
          "+" + (total - MAX_PAGES) + " more pages in the exported file";
        body.appendChild(more);
      }
    })();
  }

  // ── run ──────────────────────────────────────────────────────────────────--
  // Public orchestrator: ensure libs -> build bytes -> preview -> (on tap) share.
  // Guards against double-tap with a _busy flag. Callers invoke this from inside
  // the existing sync-boolean handleAction IIFE pattern, so returning a promise
  // is fine (it's fire-and-forget there).
  // ── busy overlay ───────────────────────────────────────────────────────────
  // Lightweight full-screen "Generating…" cue shown while libs load + the PDF is
  // built (the FIRST tap lazy-loads ~2.3MB of libs — a few seconds), so the tap
  // never reads as a frozen screen. Removed the instant the preview opens / errors.
  function showBusy(label) {
    hideBusy();
    var o = document.createElement("div");
    o.id = "report-busy";
    o.setAttribute("style", "position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(11,31,58,0.55);");
    o.innerHTML = '<div style="background:#0b1f3a;color:#fff;padding:18px 24px;border-radius:12px;font:600 15px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4);display:flex;align-items:center;gap:12px;">' +
      '<span style="width:18px;height:18px;border:3px solid #c99a2e;border-top-color:transparent;border-radius:50%;display:inline-block;animation:repspin .8s linear infinite;"></span>' +
      '<span>' + (label || "Generating report…") + '</span></div>' +
      '<style>@keyframes repspin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(o);
  }
  function hideBusy() {
    var o = document.getElementById("report-busy");
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  function run(defId, ctx) {
    if (ReportEngine._busy) {
      toast("Generating…");
      return Promise.resolve();
    }
    ReportEngine._busy = true;
    showBusy();

    return (async function () {
      try {
        await ensureLibs();
        var bytes = await buildDocBytes(defId, ctx);
        var def = window.ReportDefs && window.ReportDefs[defId];
        var filename = "saagar_greetor_" + defId + "_" + stamp + ".pdf";

        hideBusy();
        await preview(bytes.uint8, {
          name: (def && def.name) || defId,
          base64: bytes.base64,
          filename: filename,
          onShare: function () {
            return window.SaagarShell.exportPdf(filename, bytes.base64).then(function (res) {
              if (res && res.ok) {
                toast("Report shared");
              } else if (res && res.cancelled) {
                /* user dismissed the share sheet — stay silent */
              } else {
                toast("Share failed");
              }
            });
          }
        });
      } catch (e) {
        console.error("[ReportEngine]", e);
        toast("Could not generate report: " + (e && e.message ? e.message : e));
      } finally {
        hideBusy();
        ReportEngine._busy = false;
      }
    })();
  }

  // ── expose ───────────────────────────────────────────────────────────────--

  var ReportEngine = {
    _busy: false,
    ensureLibs: ensureLibs,
    buildDocBytes: buildDocBytes,
    preview: preview,
    teardownPreview: teardownPreview,   // so hardware-back can close the overlay
    run: run
  };

  window.ReportEngine = ReportEngine;
})();
