/* report-defs.js — Saagar Greetor declarative REPORT REGISTRY (offline-first,
 * Capacitor, NO bundler). Strict-mode IIFE attaching window.ReportDefs.
 *
 * WHAT THIS IS
 * ------------
 * A pure, declarative catalogue of PDF reports. Each entry knows two things and
 * nothing else:
 *   • fetch(ctx)            -> Promise<data>   (reads the existing async data
 *                                               layers via window.Reports /
 *                                               Targets / Footfall / Customers /
 *                                               Comms / Repo / DPDP)
 *   • toDocDef(data, opts)  -> plain object    (a pdfmake documentDefinition —
 *                                               real vector PDF; NO pdfmake call,
 *                                               NO DOM, NO direct DB here)
 *
 * The caller (a reports-pdf UI module) is responsible for: choosing the report,
 * building ctx + opts, awaiting fetch(), passing the result to toDocDef(), and
 * handing the doc-def to pdfmake.createPdf(...). It also guards the empty case —
 * but every toDocDef here ALSO returns a valid "No data" doc so it is safe alone.
 *
 * ROLE SCOPE (mirrors reports-ui.js ~315-330)
 * -------------------------------------------
 * In fetch(), record-derived reports read window.AuthSession.current() and, when
 * the signed-in user is a GREETOR, filter records to r.createdByUserId===auth.id
 * BEFORE aggregating (anti-poaching). Team-wide reports are gated by requiredPerm
 * so a Greetor cannot run them at all (ReportDefs.list() drops them).
 *
 * SIGNATURE NOTES discovered while reading the data layers (flagged, not invented):
 *   • Targets.leaderboard(period) entries are {userId,name,walkins,conversions,
 *     saleValue,conversionPct}. There is NO greetorName / target / attainmentPct
 *     on the entry (the spec's column list assumed them). We map name<-name and
 *     enrich each row with its per-greetor target + attainmentPct by ALSO reading
 *     Targets.get() (tg.greetor[userId][period]) — the same source attainment()
 *     uses — so the requested columns are produced from REAL data.
 *   • Comms.endOfDaySummary(date,role,userId) returns a MULTILINE STRING, not a
 *     structured object. We render that string verbatim in the PDF (monospace-ish
 *     stacked lines) rather than inventing a structured shape that does not exist.
 *   • Reports.summary/breakdown and Targets.* are ASYNC and DROP the records/state
 *     argument (new SQLite signatures); Reports.filterByRange stays SYNC over an
 *     array. We use filterByRange only for the GREETOR-scoped record reports where
 *     we must aggregate a hand-filtered subset ourselves.
 *   • Footfall has NO per-store walk-in/footfall-estimate denominator persisted as
 *     "estimate"; the only denominator is Footfall.totalForRange (SUM of the
 *     footfall table). store-conversion-footfall therefore uses totalForRange per
 *     store as footfallEstimate, captured = per-store walk-ins from records, and
 *     the pure Footfall.trueConversionPct / captureCoverage helpers.
 *
 * Pure + declarative: no module here touches the DOM, calls pdfmake, or mutates
 * shared state, so the whole registry is unit-testable in node (inject window
 * globals + a Repo test adapter; await def.fetch(ctx); assert def.toDocDef(...)).
 */
(function (global) {
  "use strict";

  // ── tiny, dependency-free helpers (pure) ────────────────────────────────────

  var BRAND = { navy: "#0b1f3a", gold: "#c99a2e" };
  var APP_NAME = "Saagar Greetor";

  // zebra fill for body rows (even index → tinted, odd → white)
  function zebra(rowIndex) {
    return rowIndex % 2 === 0 ? "#f5f7fa" : null;
  }

  function safeStr(v) {
    if (v === undefined || v === null) return "";
    return "" + v;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // i18n passthrough: opts.t(key, fallback) if present, else the fallback/key.
  function tr(opts, key, fallback) {
    try {
      if (opts && typeof opts.t === "function") {
        var s = opts.t(key);
        if (s != null && s !== "" && s !== key) return s;
      }
    } catch (e) {}
    return fallback != null ? fallback : key;
  }

  function inr(opts, n) {
    try {
      if (opts && typeof opts.formatINR === "function") return opts.formatINR(n);
    } catch (e) {}
    // Fallback: lean on whichever data layer exposes formatINR; else plain.
    try {
      if (global.Reports && typeof global.Reports.formatINR === "function") {
        return global.Reports.formatINR(n);
      }
    } catch (e2) {}
    return "₹" + Math.round(num(n));
  }

  function stampOf(opts) {
    if (opts && opts.stamp) return safeStr(opts.stamp);
    // Local YYYY-MM-DD fallback (frozen clock under test).
    var d = new Date();
    function p2(x) { return x < 10 ? "0" + x : "" + x; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }

  function brandOf(opts) {
    var b = (opts && opts.brand) || {};
    return { navy: b.navy || BRAND.navy, gold: b.gold || BRAND.gold };
  }

  // mask a mobile for GREETOR audiences (DPDP). Non-greetor sees full value.
  function maskMobileFor(auth, mobile) {
    var isGreetor = auth && auth.role === "GREETOR";
    if (!isGreetor) return safeStr(mobile);
    try {
      if (global.DPDP && typeof global.DPDP.maskMobile === "function") {
        return global.DPDP.maskMobile(mobile);
      }
    } catch (e) {}
    return safeStr(mobile);
  }

  // current signed-in user (sync; reads AppState). Null when logged-out / in node
  // without an injected AuthSession.
  function currentAuth() {
    try {
      return (global.AuthSession && typeof global.AuthSession.current === "function")
        ? global.AuthSession.current()
        : null;
    } catch (e) {
      return null;
    }
  }

  // ── pdfmake doc-def scaffolding (pure object builders) ───────────────────────

  // Brand header band: navy fill with a gold accent rule. App name, report name,
  // the range/period label, and "Generated: <stamp>".
  function headerBand(name, periodLabel, opts) {
    var brand = brandOf(opts);
    var stamp = stampOf(opts);
    return {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: APP_NAME, color: brand.gold, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
                { text: safeStr(name), color: "#ffffff", fontSize: 16, bold: true },
                periodLabel
                  ? { text: safeStr(periodLabel), color: "#dfe6f0", fontSize: 10, margin: [0, 3, 0, 0] }
                  : { text: "", fontSize: 1 },
                { text: tr(opts, "generated", "Generated") + ": " + stamp, color: "#a9b6c9", fontSize: 8, margin: [0, 4, 0, 0] }
              ],
              fillColor: brand.navy,
              margin: [12, 10, 12, 10],
              border: [false, false, false, false]
            }
          ],
          [
            { text: "", fillColor: brand.gold, margin: [0, 0, 0, 0], border: [false, false, false, false], fontSize: 2 }
          ]
        ]
      },
      layout: {
        defaultBorder: false,
        paddingLeft: function () { return 0; },
        paddingRight: function () { return 0; },
        paddingTop: function () { return 0; },
        paddingBottom: function () { return 0; }
      },
      margin: [0, 0, 0, 14]
    };
  }

  // A clean vector table: navy/white header row, thin gray borders, zebra body.
  // headers: array of strings (or {text,...} cells).
  // rows: array of arrays of cell values (strings/numbers or pdfmake cell objects).
  // colWidths: optional widths array (defaults to '*').
  function dataTable(headers, rows, opts, colWidths) {
    var brand = brandOf(opts);
    var widths = colWidths && colWidths.length === headers.length
      ? colWidths
      : headers.map(function () { return "*"; });

    var headerCells = headers.map(function (h) {
      var base = (h && typeof h === "object") ? h : { text: safeStr(h) };
      return Object.assign({ bold: true, color: "#ffffff", fillColor: brand.navy, fontSize: 9, margin: [2, 3, 2, 3] }, base);
    });

    var body = [headerCells];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var fill = zebra(i);
      var cells = r.map(function (c) {
        if (c && typeof c === "object" && !Array.isArray(c)) {
          // caller-supplied cell object (e.g. a colored bar cell) — keep its own
          // fillColor; only default the zebra when none was set.
          if (c.fillColor === undefined && fill) c.fillColor = fill;
          if (c.fontSize === undefined) c.fontSize = 8;
          if (c.margin === undefined) c.margin = [2, 2, 2, 2];
          return c;
        }
        return { text: safeStr(c), fillColor: fill, fontSize: 8, margin: [2, 2, 2, 2] };
      });
      body.push(cells);
    }

    return {
      table: { headerRows: 1, widths: widths, body: body },
      layout: {
        hLineWidth: function () { return 0.5; },
        vLineWidth: function () { return 0.5; },
        hLineColor: function () { return "#d0d7e2"; },
        vLineColor: function () { return "#d0d7e2"; }
      },
      margin: [0, 0, 0, 10]
    };
  }

  // A right-aligned numeric/currency cell helper.
  function numCell(text) {
    return { text: safeStr(text), alignment: "right" };
  }

  // The "No data for this selection" block.
  function emptyBlock(opts) {
    return {
      text: tr(opts, "no_data", "No data for this selection"),
      italics: true,
      color: "#6b7280",
      fontSize: 11,
      margin: [0, 18, 0, 0]
    };
  }

  // A small section heading.
  function sectionTitle(text, opts) {
    var brand = brandOf(opts);
    return { text: safeStr(text), bold: true, fontSize: 11, color: brand.navy, margin: [0, 6, 0, 6] };
  }

  // KPI grid: pairs of {label,value} rendered as a borderless 4-up table.
  function kpiGrid(pairs, opts) {
    var brand = brandOf(opts);
    var cells = pairs.map(function (p) {
      return {
        stack: [
          { text: safeStr(p.value), bold: true, fontSize: 14, color: brand.navy },
          { text: safeStr(p.label), fontSize: 8, color: "#6b7280", margin: [0, 2, 0, 0] }
        ],
        margin: [4, 6, 4, 6],
        fillColor: "#f5f7fa"
      };
    });
    // chunk into rows of 4
    var rows = [];
    for (var i = 0; i < cells.length; i += 4) {
      var chunk = cells.slice(i, i + 4);
      while (chunk.length < 4) chunk.push({ text: "", margin: [4, 6, 4, 6] });
      rows.push(chunk);
    }
    return {
      table: { widths: ["*", "*", "*", "*"], body: rows },
      layout: {
        hLineWidth: function () { return 0; },
        vLineWidth: function () { return 0; },
        paddingLeft: function () { return 2; },
        paddingRight: function () { return 2; },
        paddingTop: function () { return 2; },
        paddingBottom: function () { return 2; }
      },
      margin: [0, 0, 0, 12]
    };
  }

  // ── chart helpers (produce pdfmake {svg,width} nodes or fall back to a table) ─

  // Validate a string is an <svg ...> root before handing to pdfmake.
  function isSvgRoot(s) {
    return typeof s === "string" && s.replace(/^\s+/, "").indexOf("<svg") === 0;
  }

  // Sanitise a Charts.line() svg for pdfmake: drop <defs>…</defs> (gradient) and
  // replace any fill="url(#…)" with a solid brand color. Also suffix the gradient
  // id 'cg' so multiple charts in one doc never collide. Returns "" if not svg.
  function cleanLineSvg(svg, solidFill, idx) {
    if (!isSvgRoot(svg)) return "";
    var out = svg;
    // Remove the gradient defs block entirely (pdfmake's SVG engine is happiest
    // with flat fills; the gradient is decorative).
    out = out.replace(/<defs[\s\S]*?<\/defs>/g, "");
    // Any url(#cg) fill → solid brand color.
    out = out.replace(/fill="url\(#[^)]*\)"/g, 'fill="' + solidFill + '"');
    // Defensive: if an id="cg" still survives anywhere, make it unique per chart.
    if (idx != null) {
      out = out.replace(/id="cg"/g, 'id="cg' + idx + '"');
      out = out.replace(/url\(#cg\)/g, "url(#cg" + idx + ")");
    }
    return out;
  }

  // Extract the inner <svg…>…</svg> from a Charts.donut() string (it is wrapped in
  // a <div>…</div> with a legend). Returns "" if no svg root is found.
  function extractDonutSvg(wrapped) {
    if (typeof wrapped !== "string") return "";
    var start = wrapped.indexOf("<svg");
    if (start === -1) return "";
    var end = wrapped.indexOf("</svg>", start);
    if (end === -1) return "";
    return wrapped.slice(start, end + 6);
  }

  // Build a pdfmake svg node from a line chart, or null if Charts/line missing or
  // the output is not a usable svg (caller then falls back to a table).
  function lineChartNode(points, opts, idx, width) {
    try {
      if (!global.Charts || typeof global.Charts.line !== "function") return null;
      var brand = brandOf(opts);
      // Ask charts to drop the gradient fill if it honours {fill:false}; we ALSO
      // post-process defensively in cleanLineSvg.
      var raw = global.Charts.line(points, { fill: false, color: brand.gold });
      var clean = cleanLineSvg(raw, brand.gold, idx);
      if (!isSvgRoot(clean)) return null;
      return { svg: clean, width: width || 500, margin: [0, 4, 0, 12] };
    } catch (e) {
      return null;
    }
  }

  // Horizontal-bar look via pdfmake TABLE rows with a proportional colored cell.
  // items: [{label, value, valueText?}]. maxVal computed if not supplied.
  // Returns a pdfmake table node. NEVER uses Charts.bars (that is HTML).
  function barTable(items, opts, maxVal, labelHeader, valueHeader) {
    var brand = brandOf(opts);
    var max = num(maxVal);
    if (!(max > 0)) {
      for (var k = 0; k < items.length; k++) { var vv = num(items[k].value); if (vv > max) max = vv; }
    }
    if (!(max > 0)) max = 1;

    var headers = [labelHeader || "", valueHeader || "", ""];
    var rows = items.map(function (it) {
      var v = num(it.value);
      var pct = Math.max(0, Math.min(100, (v / max) * 100));
      // The bar: a left colored segment + remaining track, faked with two stacked
      // columns inside one cell using nested table widths proportional to pct.
      var filled = Math.round(pct);
      var rest = 100 - filled;
      var barCell = {
        table: {
          widths: filled > 0 && rest > 0
            ? [filled + "%", rest + "%"]
            : (filled > 0 ? ["*"] : ["*"]),
          body: [
            filled > 0 && rest > 0
              ? [
                  { text: "", fillColor: brand.gold, margin: [0, 0, 0, 0] },
                  { text: "", fillColor: "#eef2f7", margin: [0, 0, 0, 0] }
                ]
              : (filled > 0
                  ? [{ text: "", fillColor: brand.gold, margin: [0, 0, 0, 0] }]
                  : [{ text: "", fillColor: "#eef2f7", margin: [0, 0, 0, 0] }])
          ]
        },
        layout: {
          hLineWidth: function () { return 0; },
          vLineWidth: function () { return 0; },
          paddingLeft: function () { return 0; },
          paddingRight: function () { return 0; },
          paddingTop: function () { return 2; },
          paddingBottom: function () { return 2; }
        },
        margin: [0, 2, 0, 2]
      };
      return [
        { text: safeStr(it.label), fontSize: 8, margin: [2, 2, 2, 2] },
        { text: safeStr(it.valueText != null ? it.valueText : it.value), fontSize: 8, alignment: "right", margin: [2, 2, 2, 2] },
        barCell
      ];
    });

    return dataTable(headers, rows, opts, ["35%", "15%", "50%"]);
  }

  // ── shared docDef wrapper: A4, margins, footer w/ page numbers ───────────────

  function docShell(content, opts) {
    var brand = brandOf(opts);
    return {
      pageSize: "A4",
      pageMargins: [32, 32, 32, 44],
      content: content,
      defaultStyle: { fontSize: 9, color: "#0b1f3a" },
      footer: function (currentPage, pageCount) {
        return {
          columns: [
            { text: APP_NAME, fontSize: 8, color: "#9aa6b8", margin: [32, 0, 0, 0] },
            {
              text: tr(opts, "page", "Page") + " " + currentPage + " / " + pageCount,
              alignment: "right",
              fontSize: 8,
              color: "#9aa6b8",
              margin: [0, 0, 32, 0]
            }
          ],
          margin: [0, 8, 0, 0]
        };
      },
      // a subtle gold rule under the footer line is omitted to keep it clean;
      // brand carried by the header band + table header rows.
      info: { title: APP_NAME }
    };
  }

  // build a complete docDef from a header + body content array
  function buildDoc(name, periodLabel, bodyContent, opts) {
    var content = [headerBand(name, periodLabel, opts)];
    if (Array.isArray(bodyContent)) {
      for (var i = 0; i < bodyContent.length; i++) content.push(bodyContent[i]);
    } else if (bodyContent) {
      content.push(bodyContent);
    }
    return docShell(content, opts);
  }

  // ── data-layer accessors (lazy; throw-safe) ─────────────────────────────────

  function R() { return global.Reports; }
  function T() { return global.Targets; }
  function F() { return global.Footfall; }
  function C() { return global.Customers; }
  function CM() { return global.Comms; }
  function REPO() { return global.Repo; }

  // GREETOR-scope a records array (anti-poaching), mirroring reports-ui.js.
  function scopeRecords(records, auth) {
    if (!Array.isArray(records)) return [];
    if (auth && auth.role === "GREETOR") {
      return records.filter(function (r) { return r && r.createdByUserId === auth.id; });
    }
    return records;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  REPORT DEFINITIONS
  // ════════════════════════════════════════════════════════════════════════════

  var defs = {};

  // ── 1. daily-capture ────────────────────────────────────────────────────────
  // "Daily Capture Sheet" — today's walk-ins (GREETOR-scoped), one row per visit.
  defs["daily-capture"] = {
    id: "daily-capture",
    name: "Daily Capture Sheet",
    audience: "All roles (greetor-scoped)",
    requiredPerm: null,
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var reports = R();
      var repo = REPO();
      // summary('today') for the KPI strip; all records filtered to today via the
      // SYNC filterByRange (so we can hand-scope to the greetor before aggregating).
      return Promise.all([
        reports ? reports.summary("today") : Promise.resolve(null),
        repo ? repo.records.all() : Promise.resolve([])
      ]).then(function (res) {
        var teamSummary = res[0];
        var all = Array.isArray(res[1]) ? res[1] : [];
        var scoped = scopeRecords(all, auth);
        var today = (reports && reports.resolveRange) ? reports.resolveRange("today").startDate : stampOf({});
        var rows = (reports && reports.filterByRange)
          ? reports.filterByRange(scoped, "today")
          : scoped.filter(function (r) { return r && r.visitDate === today; });
        // For GREETOR: scope the KPI strip to their own records so the numbers
        // match the table below (team-wide totals would mislead — e.g. showing
        // 30 conversions when the greetor's own count is 5).
        var summary = (auth && auth.role === 'GREETOR' && reports && reports.summaryPure)
          ? reports.summaryPure(rows)
          : teamSummary;
        // newest visitTime last → keep ord order (capture order) which reads
        // naturally on a capture sheet.
        return {
          range: "today",
          rangeLabel: (reports && reports.rangeLabel) ? reports.rangeLabel("today") : "Today",
          dateLabel: today,
          summary: summary,
          records: rows,
          auth: auth
        };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var auth = data.auth;
      var label = (data.rangeLabel || "Today") + (data.dateLabel ? " — " + data.dateLabel : "");
      var body = [];

      if (data.summary) {
        body.push(kpiGrid([
          { label: tr(opts, "walkins", "Walk-ins"), value: num(data.summary.walkins) },
          { label: tr(opts, "conversions", "Conversions"), value: num(data.summary.conversions) },
          { label: tr(opts, "conv_pct", "Conv %"), value: num(data.summary.conversionPct) + "%" },
          { label: tr(opts, "total_sale", "Total sale"), value: inr(opts, data.summary.totalSale) }
        ], opts));
      }

      var recs = Array.isArray(data.records) ? data.records : [];
      if (!recs.length) {
        body.push(emptyBlock(opts));
        return buildDoc(this.name, label, body, opts);
      }

      var headers = ["Time", "Customer", "Mobile", "Store", "Category", "Brand", "Reason", "Status", "Sale"];
      var rows = recs.map(function (r) {
        return [
          safeStr(r.visitTime),
          safeStr(r.customerName),
          maskMobileFor(auth, r.mobile),
          safeStr(r.store),
          safeStr(r.category),
          safeStr(r.brand),
          safeStr(r.reason),
          safeStr(r.leadStatus),
          numCell(r.leadStatus === "Converted" ? inr(opts, r.saleValue) : "")
        ];
      });
      body.push(dataTable(headers, rows, opts,
        ["7%", "15%", "11%", "11%", "10%", "10%", "12%", "9%", "15%"]));
      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── 2. range-summary ──────────────────────────────────────────────────────────
  // "Date-Range Summary" — KPI grid + reason/store/greetor/category breakdowns +
  // a daily walk-ins trend line chart.
  defs["range-summary"] = {
    id: "range-summary",
    name: "Date-Range Summary",
    audience: "All roles (greetor-scoped)",
    requiredPerm: null,
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var range = ctx.range || "30d";
      var cs = ctx.customStart, ce = ctx.customEnd;
      var reports = R();
      var repo = REPO();
      var resolved = (reports && reports.resolveRange) ? reports.resolveRange(range, cs, ce) : { startDate: "", endDate: "", label: range };

      // For GREETOR scope we must aggregate a hand-filtered subset ourselves
      // (Reports.summary/breakdown are team-wide & async). For non-greetors we use
      // the async DB-backed analytics directly for byte-identical numbers.
      return (repo ? repo.records.all() : Promise.resolve([])).then(function (all) {
        all = Array.isArray(all) ? all : [];
        var scoped = scopeRecords(all, auth);
        var windowRecs = (reports && reports.filterByRange)
          ? reports.filterByRange(scoped, range, cs, ce)
          : scoped;

        var isGreetor = auth && auth.role === "GREETOR";

        function summaryP() {
          if (isGreetor && reports && reports.summaryPure) return Promise.resolve(reports.summaryPure(windowRecs));
          return reports ? reports.summary(range, cs, ce) : Promise.resolve(null);
        }
        function breakdownP(field) {
          if (isGreetor && reports && reports.breakdownPure) return Promise.resolve(reports.breakdownPure(windowRecs, field));
          return reports ? reports.breakdown(range, field, cs, ce) : Promise.resolve([]);
        }

        return Promise.all([
          summaryP(),
          breakdownP("reason"),
          breakdownP("store"),
          breakdownP("greetor"),
          breakdownP("category")
        ]).then(function (parts) {
          // daily walk-ins series for the trend line (over the window subset).
          var byDate = {};
          windowRecs.forEach(function (r) {
            if (r && r.visitDate) byDate[r.visitDate] = (byDate[r.visitDate] || 0) + 1;
          });
          var dates = Object.keys(byDate).sort();
          var series = dates.map(function (d) {
            return { label: d.slice(5), value: byDate[d] }; // MM-DD label
          });

          return {
            range: range,
            rangeLabel: (reports && reports.rangeLabel) ? reports.rangeLabel(range) : range,
            resolved: resolved,
            summary: parts[0],
            byReason: parts[1] || [],
            byStore: parts[2] || [],
            byGreetor: parts[3] || [],
            byCategory: parts[4] || [],
            series: series
          };
        });
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var res = data.resolved || {};
      var label = (data.rangeLabel || data.range || "") +
        (res.startDate ? "  (" + res.startDate + " — " + res.endDate + ")" : "");
      var body = [];

      var s = data.summary;
      var hasData = s && num(s.walkins) > 0;

      if (s) {
        body.push(kpiGrid([
          { label: tr(opts, "walkins", "Walk-ins"), value: num(s.walkins) },
          { label: tr(opts, "conversions", "Conversions"), value: num(s.conversions) },
          { label: tr(opts, "conv_pct", "Conv %"), value: num(s.conversionPct) + "%" },
          { label: tr(opts, "total_sale", "Total sale"), value: inr(opts, s.totalSale) },
          { label: tr(opts, "hot", "Hot leads"), value: num(s.hot) },
          { label: tr(opts, "follow_pending", "Follow pending"), value: num(s.followPending) },
          { label: tr(opts, "unique_cust", "Unique customers"), value: num(s.uniqueCustomers) }
        ], opts));
      }

      if (!hasData) {
        body.push(emptyBlock(opts));
        return buildDoc(this.name, label, body, opts);
      }

      // Trend chart (line). Fall back to a small daily table if not usable.
      if (Array.isArray(data.series) && data.series.length >= 2) {
        body.push(sectionTitle(tr(opts, "trend_walkins", "Daily walk-ins"), opts));
        var node = lineChartNode(data.series, opts, 0, 500);
        if (node) {
          body.push(node);
        } else {
          var trendRows = data.series.map(function (p) { return [p.label, numCell(p.value)]; });
          body.push(dataTable(["Date", "Walk-ins"], trendRows, opts, ["*", "30%"]));
        }
      }

      function breakdownSection(title, arr) {
        if (!Array.isArray(arr) || !arr.length) return;
        body.push(sectionTitle(title, opts));
        var items = arr.map(function (b) {
          return { label: b.key, value: num(b.count), valueText: num(b.count) + "  (" + num(b.pct) + "%)" };
        });
        body.push(barTable(items, opts, 0, tr(opts, "category_col", "Category"), tr(opts, "count_col", "Count")));
      }

      breakdownSection(tr(opts, "by_reason", "By reason"), data.byReason);
      breakdownSection(tr(opts, "by_store", "By store"), data.byStore);
      breakdownSection(tr(opts, "by_greetor", "By greetor"), data.byGreetor);
      breakdownSection(tr(opts, "by_category", "By category"), data.byCategory);

      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── 3. greetor-performance ────────────────────────────────────────────────────
  // "Per-Greetor Performance & Leaderboard" — team-wide; gated.
  defs["greetor-performance"] = {
    id: "greetor-performance",
    name: "Per-Greetor Performance & Leaderboard",
    audience: "Manager / Owner",
    requiredPerm: "manageLeads",
    fetch: function (ctx) {
      ctx = ctx || {};
      var period = ctx.period || "monthly";
      var targets = T();
      return Promise.all([
        targets ? targets.leaderboard(period) : Promise.resolve([]),
        targets ? targets.get() : Promise.resolve(null)
      ]).then(function (res) {
        var board = Array.isArray(res[0]) ? res[0] : [];
        var tg = res[1] || null;
        // Enrich each row with its per-greetor target + attainmentPct from the
        // SAME source attainment() uses (tg.greetor[userId][period].conversions),
        // since leaderboard() entries do NOT carry target/attainmentPct.
        var enriched = board.map(function (e) {
          var tConv = 0;
          try {
            if (tg && tg.greetor && tg.greetor[e.userId] && tg.greetor[e.userId][period]) {
              tConv = num(tg.greetor[e.userId][period].conversions);
            }
          } catch (x) {}
          var attainmentPct = tConv > 0 ? Math.round((num(e.conversions) / tConv) * 100) : null;
          return {
            userId: e.userId,
            greetorName: e.name || "Unknown",
            walkins: num(e.walkins),
            conversions: num(e.conversions),
            conversionPct: num(e.conversionPct),
            saleValue: num(e.saleValue),
            target: tConv,
            attainmentPct: attainmentPct
          };
        });
        return {
          period: period,
          periodLabel: (targets && targets.periodLabel) ? targets.periodLabel(period) : period,
          rows: enriched
        };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var label = tr(opts, "period", "Period") + ": " + (data.periodLabel || data.period || "");
      var rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }

      // Bar-style via colored table cells: bar proportional to conversions.
      var maxConv = 0;
      rows.forEach(function (r) { if (r.conversions > maxConv) maxConv = r.conversions; });
      if (!(maxConv > 0)) maxConv = 1;
      var brand = brandOf(opts);

      var headers = ["#", "Greetor", "Walk-ins", "Conv", "Conv %", "Sale", "Target", "Attain %", ""];
      var body = rows.map(function (r, i) {
        var pct = Math.max(0, Math.min(100, (num(r.conversions) / maxConv) * 100));
        var filled = Math.round(pct);
        var rest = 100 - filled;
        var barCell = {
          table: {
            widths: filled > 0 && rest > 0 ? [filled + "%", rest + "%"] : ["*"],
            body: [
              filled > 0 && rest > 0
                ? [{ text: "", fillColor: brand.gold }, { text: "", fillColor: "#eef2f7" }]
                : [{ text: "", fillColor: filled > 0 ? brand.gold : "#eef2f7" }]
            ]
          },
          layout: {
            hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
            paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
            paddingTop: function () { return 2; }, paddingBottom: function () { return 2; }
          }
        };
        return [
          { text: "" + (i + 1), alignment: "center" },
          safeStr(r.greetorName),
          numCell(r.walkins),
          numCell(r.conversions),
          numCell(num(r.conversionPct) + "%"),
          numCell(inr(opts, r.saleValue)),
          numCell(r.target),
          numCell(r.attainmentPct == null ? "—" : r.attainmentPct + "%"),
          barCell
        ];
      });
      var table = dataTable(headers, body, opts,
        ["5%", "20%", "10%", "8%", "10%", "13%", "9%", "10%", "15%"]);
      return buildDoc(this.name, label, [table], opts);
    }
  };

  // ── 4. store-conversion-footfall ──────────────────────────────────────────────
  // "Store Conversion vs Footfall" — team-wide; gated. Per-store footfall vs
  // captured walk-ins + conversion math.
  defs["store-conversion-footfall"] = {
    id: "store-conversion-footfall",
    name: "Store Conversion vs Footfall",
    audience: "Manager / Owner",
    requiredPerm: "manageLeads",
    fetch: function (ctx) {
      ctx = ctx || {};
      var range = ctx.range || "30d";
      var cs = ctx.customStart, ce = ctx.customEnd;
      var reports = R();
      var footfall = F();
      var repo = REPO();
      var resolved = (reports && reports.resolveRange) ? reports.resolveRange(range, cs, ce) : { startDate: "", endDate: "", label: range };

      return (repo ? repo.records.all() : Promise.resolve([])).then(function (all) {
        all = Array.isArray(all) ? all : [];
        var windowRecs = (reports && reports.filterByRange)
          ? reports.filterByRange(all, range, cs, ce)
          : all;

        // Per-store captured walk-ins + conversions from records.
        var byStore = {};
        windowRecs.forEach(function (r) {
          var st = (r && r.store) ? r.store : "(none)";
          if (!byStore[st]) byStore[st] = { store: st, captured: 0, conversions: 0 };
          byStore[st].captured += 1;
          if (r.leadStatus === "Converted") byStore[st].conversions += 1;
        });
        var stores = Object.keys(byStore);

        // footfallEstimate per store = SUM(footfall table) over the window for that
        // store (the only persisted denominator). Fetch all in parallel.
        var ffP = stores.map(function (st) {
          return footfall && footfall.totalForRange
            ? footfall.totalForRange(resolved.startDate, resolved.endDate, st)
            : Promise.resolve(0);
        });

        return Promise.all(ffP).then(function (ffVals) {
          var rows = stores.map(function (st, i) {
            var rec = byStore[st];
            var footfallEstimate = num(ffVals[i]);
            var captured = num(rec.captured);
            var conversions = num(rec.conversions);
            var captureCoveragePct = (footfall && footfall.captureCoverage)
              ? footfall.captureCoverage(captured, footfallEstimate)
              : (footfallEstimate > 0 ? Math.round((Math.min(captured, footfallEstimate) / footfallEstimate) * 1000) / 10 : null);
            var trueConversionPct = (footfall && footfall.trueConversionPct)
              ? footfall.trueConversionPct(captured, conversions, footfallEstimate)
              : 0;
            var capturedConversionPct = captured > 0 ? Math.round((conversions / captured) * 1000) / 10 : 0;
            return {
              store: st,
              footfallEstimate: footfallEstimate,
              captured: captured,
              captureCoveragePct: captureCoveragePct,
              conversions: conversions,
              trueConversionPct: trueConversionPct,
              capturedConversionPct: capturedConversionPct
            };
          });
          // stable, readable order: by captured walk-ins desc
          rows.sort(function (a, b) { return b.captured - a.captured; });
          return {
            range: range,
            rangeLabel: (reports && reports.rangeLabel) ? reports.rangeLabel(range) : range,
            resolved: resolved,
            rows: rows
          };
        });
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var res = data.resolved || {};
      var label = (data.rangeLabel || data.range || "") +
        (res.startDate ? "  (" + res.startDate + " — " + res.endDate + ")" : "");
      var rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }

      // colored cells: bar proportional to capture coverage %.
      var brand = brandOf(opts);
      var headers = ["Store", "Footfall", "Captured", "Coverage %", "Conv", "True Conv %", "Captured Conv %", ""];
      var body = rows.map(function (r) {
        var cov = r.captureCoveragePct == null ? 0 : num(r.captureCoveragePct);
        var filled = Math.max(0, Math.min(100, Math.round(cov)));
        var rest = 100 - filled;
        var barCell = {
          table: {
            widths: filled > 0 && rest > 0 ? [filled + "%", rest + "%"] : ["*"],
            body: [
              filled > 0 && rest > 0
                ? [{ text: "", fillColor: brand.gold }, { text: "", fillColor: "#eef2f7" }]
                : [{ text: "", fillColor: filled > 0 ? brand.gold : "#eef2f7" }]
            ]
          },
          layout: {
            hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
            paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
            paddingTop: function () { return 2; }, paddingBottom: function () { return 2; }
          }
        };
        return [
          safeStr(r.store),
          numCell(r.footfallEstimate),
          numCell(r.captured),
          numCell(r.captureCoveragePct == null ? "—" : r.captureCoveragePct + "%"),
          numCell(r.conversions),
          numCell(num(r.trueConversionPct) + "%"),
          numCell(num(r.capturedConversionPct) + "%"),
          barCell
        ];
      });
      var table = dataTable(headers, body, opts,
        ["18%", "11%", "11%", "12%", "8%", "12%", "13%", "15%"]);
      return buildDoc(this.name, label, [table], opts);
    }
  };

  // ── 5. lead-pipeline ──────────────────────────────────────────────────────────
  // "Lead Pipeline & Aging" — team-wide; gated. Per-stage rows + aging.
  defs["lead-pipeline"] = {
    id: "lead-pipeline",
    name: "Lead Pipeline & Aging",
    audience: "Manager / Owner",
    requiredPerm: "manageLeads",
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var customers = C();
      // pipeline() -> [{stage,count,records:[...]}]; pipelineStages() -> [string].
      return Promise.all([
        customers ? customers.pipeline() : Promise.resolve([]),
        customers ? customers.pipelineStages() : Promise.resolve([])
      ]).then(function (res) {
        var pipeline = Array.isArray(res[0]) ? res[0] : [];
        var stages = Array.isArray(res[1]) ? res[1] : [];
        return { pipeline: pipeline, stages: stages, auth: auth };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var auth = data.auth;
      var pipeline = Array.isArray(data.pipeline) ? data.pipeline : [];
      var label = tr(opts, "all_stages", "All stages");

      var anyRecords = pipeline.some(function (st) { return st && st.count > 0; });
      if (!pipeline.length || !anyRecords) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }

      var brand = brandOf(opts);
      var body = [];

      // Stage-count overview as colored bars.
      var maxCount = 0;
      pipeline.forEach(function (st) { if (num(st.count) > maxCount) maxCount = num(st.count); });
      var overviewItems = pipeline.map(function (st) {
        return { label: st.stage, value: num(st.count), valueText: num(st.count) };
      });
      body.push(sectionTitle(tr(opts, "stage_counts", "Stage counts"), opts));
      body.push(barTable(overviewItems, opts, maxCount, tr(opts, "stage_col", "Stage"), tr(opts, "count_col", "Count")));

      // Per-stage detail tables (cap each stage to a sane number of rows so a
      // 2,600-row seed does not produce a 500-page PDF). Caller can request a
      // wider export elsewhere; this is a snapshot.
      var PER_STAGE_CAP = 50;

      function daysPending(r) {
        var d = r && r.visitDate;
        if (!d) return "";
        try {
          if (global.Customers && typeof global.Customers.buildCustomer === "function") {
            // reuse the layer's daysBetween indirectly is not exposed; compute here
          }
        } catch (e) {}
        var parts = ("" + d).split("-");
        if (parts.length < 3) return "";
        var then = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        var now = new Date();
        var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(0, Math.round((t0 - then) / 86400000));
      }

      pipeline.forEach(function (st) {
        if (!st || !st.count) return;
        body.push(sectionTitle(safeStr(st.stage) + "  (" + num(st.count) + ")", opts));
        var recs = Array.isArray(st.records) ? st.records.slice(0, PER_STAGE_CAP) : [];
        var headers = ["Customer", "Mobile", "Reason", "Last visit", "Days", "Follow date"];
        var rows = recs.map(function (r) {
          return [
            safeStr(r.customerName),
            maskMobileFor(auth, r.mobile),
            safeStr(r.reason),
            safeStr(r.visitDate),
            numCell(daysPending(r)),
            safeStr(r.followDate)
          ];
        });
        body.push(dataTable(headers, rows, opts, ["22%", "16%", "22%", "14%", "8%", "18%"]));
        if (st.records && st.records.length > PER_STAGE_CAP) {
          body.push({
            text: "… " + (st.records.length - PER_STAGE_CAP) + " more in this stage",
            italics: true, color: "#6b7280", fontSize: 8, margin: [0, 0, 0, 8]
          });
        }
      });

      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── 6. comms-summary ──────────────────────────────────────────────────────────
  // "Communication Summary" — Comms.endOfDaySummary returns a MULTILINE STRING
  // (role+userId scoped). We render those lines verbatim + a message-log channel
  // breakdown from Comms.log().
  defs["comms-summary"] = {
    id: "comms-summary",
    name: "Communication Summary",
    audience: "All roles (greetor-scoped)",
    requiredPerm: null,
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var comms = CM();
      var date = ctx.date || stampOf({});
      var role = auth ? auth.role : null;
      var userId = auth ? auth.id : null;
      return Promise.all([
        comms ? comms.endOfDaySummary(date, role, userId) : Promise.resolve(""),
        comms ? comms.log({ auth: auth }) : Promise.resolve([])
      ]).then(function (res) {
        var summaryText = typeof res[0] === "string" ? res[0] : "";
        var logRows = Array.isArray(res[1]) ? res[1] : [];
        // template sends by channel (count messages per channel).
        var byChannel = {};
        logRows.forEach(function (e) {
          var ch = (e && e.channel) ? e.channel : "(other)";
          byChannel[ch] = (byChannel[ch] || 0) + 1;
        });
        return {
          date: date,
          summaryText: summaryText,
          byChannel: byChannel,
          logCount: logRows.length,
          auth: auth
        };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var label = tr(opts, "date", "Date") + ": " + safeStr(data.date);
      var body = [];

      var text = safeStr(data.summaryText).trim();
      var channels = data.byChannel || {};
      var channelKeys = Object.keys(channels);

      if (!text && !channelKeys.length) {
        body.push(emptyBlock(opts));
        return buildDoc(this.name, label, body, opts);
      }

      if (text) {
        body.push(sectionTitle(tr(opts, "eod_summary", "End-of-day summary"), opts));
        // render each line of the multiline summary as its own paragraph (preserve
        // the indentation the data layer produced with two leading spaces).
        var lines = text.split("\n");
        body.push({
          stack: lines.map(function (ln) {
            var indented = /^\s{2,}/.test(ln);
            return {
              text: ln === "" ? " " : ln,
              fontSize: indented ? 9 : 10,
              bold: !indented && ln.indexOf(":") === -1 ? false : false,
              margin: [indented ? 12 : 0, 0, 0, 2],
              color: "#0b1f3a"
            };
          }),
          margin: [0, 0, 0, 12]
        });
      }

      if (channelKeys.length) {
        body.push(sectionTitle(tr(opts, "sends_by_channel", "Template sends by channel"), opts));
        var rows = channelKeys.map(function (ch) { return [safeStr(ch), numCell(channels[ch])]; });
        body.push(dataTable(["Channel", "Sends"], rows, opts, ["*", "30%"]));
      }

      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── 7. customer-history ───────────────────────────────────────────────────────
  // "Customer History / Profile" — Customers.byMobile(ctx.mobile). GREETOR-scoped:
  // a greetor only sees the profile if at least one of its visits was created by
  // them (we filter the visits and recompute header counts accordingly).
  defs["customer-history"] = {
    id: "customer-history",
    name: "Customer History / Profile",
    audience: "All roles (greetor-scoped)",
    requiredPerm: null,
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var customers = C();
      var mobile = ctx.mobile;
      if (!mobile) return Promise.resolve({ mobile: mobile, customer: null, auth: auth });
      return (customers ? customers.byMobile(mobile) : Promise.resolve(null)).then(function (cust) {
        if (cust && auth && auth.role === "GREETOR") {
          // scope the visit list to the greetor's own visits + recompute summary.
          var visits = Array.isArray(cust.visits)
            ? cust.visits.filter(function (v) { return v && v.createdByUserId === auth.id; })
            : [];
          if (!visits.length) {
            return { mobile: mobile, customer: null, auth: auth };
          }
          var totalSale = visits.reduce(function (s, v) { return s + num(v.saleValue); }, 0);
          var dates = visits.map(function (v) { return ("" + (v.visitDate || "")).slice(0, 10); }).filter(Boolean).sort();
          cust = {
            mobile: cust.mobile,
            name: cust.name,
            visitCount: visits.length,
            visits: visits,
            firstVisitDate: dates[0] || "",
            lastVisitDate: dates[dates.length - 1] || "",
            status: visits[0] ? (visits[0].leadStatus || "") : "",
            converted: visits.some(function (v) { return v.leadStatus === "Converted"; }),
            totalSaleValue: totalSale
          };
        }
        return { mobile: mobile, customer: cust, auth: auth };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var auth = data.auth;
      var cust = data.customer;
      var label = tr(opts, "customer", "Customer") + ": " + maskMobileFor(auth, data.mobile);

      if (!cust) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }

      var body = [];
      body.push(kpiGrid([
        { label: tr(opts, "name", "Name"), value: safeStr(cust.name) || "—" },
        { label: tr(opts, "visits", "Visits"), value: num(cust.visitCount) },
        { label: tr(opts, "status", "Status"), value: safeStr(cust.status) || "—" },
        { label: tr(opts, "total_sale", "Total sale"), value: inr(opts, cust.totalSaleValue) },
        { label: tr(opts, "first_visit", "First visit"), value: safeStr(cust.firstVisitDate) || "—" },
        { label: tr(opts, "last_visit", "Last visit"), value: safeStr(cust.lastVisitDate) || "—" },
        { label: tr(opts, "mobile", "Mobile"), value: maskMobileFor(auth, cust.mobile) }
      ], opts));

      var visits = Array.isArray(cust.visits) ? cust.visits : [];
      if (!visits.length) {
        body.push(emptyBlock(opts));
        return buildDoc(this.name, label, body, opts);
      }

      body.push(sectionTitle(tr(opts, "visit_history", "Visit history"), opts));
      var headers = ["Date", "Time", "Store", "Category", "Brand", "Reason", "Status", "Sale"];
      var rows = visits.map(function (v) {
        return [
          safeStr(v.visitDate),
          safeStr(v.visitTime),
          safeStr(v.store),
          safeStr(v.category),
          safeStr(v.brand),
          safeStr(v.reason),
          safeStr(v.leadStatus),
          numCell(v.leadStatus === "Converted" ? inr(opts, v.saleValue) : "")
        ];
      });
      body.push(dataTable(headers, rows, opts,
        ["12%", "9%", "14%", "13%", "13%", "15%", "12%", "12%"]));
      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── 8. targets-attainment ─────────────────────────────────────────────────────
  // "Targets Attainment" — team-wide; gated. Store-level walk-ins + conversions
  // actual vs target.
  defs["targets-attainment"] = {
    id: "targets-attainment",
    name: "Targets Attainment",
    audience: "Manager / Owner",
    requiredPerm: "manageLeads",
    fetch: function (ctx) {
      ctx = ctx || {};
      var period = ctx.period || "monthly";
      var targets = T();
      return Promise.all([
        targets ? targets.get() : Promise.resolve(null),
        targets ? targets.attainment(period) : Promise.resolve(null)
      ]).then(function (res) {
        return {
          period: period,
          periodLabel: (targets && targets.periodLabel) ? targets.periodLabel(period) : period,
          targets: res[0] || null,
          attainment: res[1] || null
        };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var label = tr(opts, "period", "Period") + ": " + (data.periodLabel || data.period || "");
      var att = data.attainment;
      if (!att) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }

      var metrics = [
        { metric: tr(opts, "walkins", "Walk-ins"), m: att.walkins || {} },
        { metric: tr(opts, "conversions", "Conversions"), m: att.conversions || {} }
      ];

      // colored cells: bar proportional to attainment pct (cap 100 for the bar,
      // but show the true % which can exceed 100).
      var brand = brandOf(opts);
      var headers = ["Metric", "Actual", "Target", "Attainment %", ""];
      var body = metrics.map(function (row) {
        var pct = row.m.pct == null ? 0 : num(row.m.pct);
        var filled = Math.max(0, Math.min(100, Math.round(pct)));
        var rest = 100 - filled;
        var barColor = pct >= 100 ? "#168a51" : brand.gold;
        var barCell = {
          table: {
            widths: filled > 0 && rest > 0 ? [filled + "%", rest + "%"] : ["*"],
            body: [
              filled > 0 && rest > 0
                ? [{ text: "", fillColor: barColor }, { text: "", fillColor: "#eef2f7" }]
                : [{ text: "", fillColor: filled > 0 ? barColor : "#eef2f7" }]
            ]
          },
          layout: {
            hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
            paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
            paddingTop: function () { return 2; }, paddingBottom: function () { return 2; }
          }
        };
        return [
          safeStr(row.metric),
          numCell(num(row.m.actual)),
          numCell(num(row.m.target)),
          numCell(row.m.pct == null ? "—" : row.m.pct + "%"),
          barCell
        ];
      });
      var table = dataTable(headers, body, opts, ["22%", "15%", "15%", "18%", "30%"]);
      return buildDoc(this.name, label, [table], opts);
    }
  };

  // ── 9. audit-log ──────────────────────────────────────────────────────────────
  // "Audit Log Report" — Owner only (manageUsers). Newest-first.
  defs["audit-log"] = {
    id: "audit-log",
    name: "Audit Log Report",
    audience: "Owner",
    requiredPerm: "manageUsers",
    fetch: function () {
      var repo = REPO();
      return (repo ? repo.auditLog.all() : Promise.resolve([])).then(function (all) {
        all = Array.isArray(all) ? all : [];
        // Repo returns ORDER BY ord (oldest-first); the viewer reads newest-first.
        var reversed = all.slice().reverse();
        return { entries: reversed };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var entries = Array.isArray(data.entries) ? data.entries : [];
      // Cap to the most-recent N so the PDF stays shareable on a phone (4,000+
      // events would otherwise be ~160 pages / >1MB). entries are newest-first.
      var CAP = 500;
      var total = entries.length;
      var shown = entries.slice(0, CAP);
      var label = total > CAP
        ? ("Latest " + CAP + " of " + total + " events")
        : (tr(opts, "all_events", "All events") + " (" + total + ")");
      if (!shown.length) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }
      var headers = ["Timestamp", "User", "Role", "Action", "Summary"];
      var rows = shown.map(function (e) {
        return [
          safeStr(e.at),
          safeStr(e.userName),
          safeStr(e.role),
          safeStr(e.action),
          safeStr(e.summary)
        ];
      });
      var table = dataTable(headers, rows, opts, ["20%", "16%", "12%", "14%", "38%"]);
      return buildDoc(this.name, label, [table], opts);
    }
  };

  // ── 10. customer-list ─────────────────────────────────────────────────────────
  // "CRM Customer List" — Customers.list({sort:'recent'}). All roles; not record-
  // derived per-greetor in the spec's null-perm list, but list() is team-wide CRM
  // so we keep it null-perm and unscoped (matches spec mapping).
  defs["customer-list"] = {
    id: "customer-list",
    name: "CRM Customer List",
    audience: "All roles",
    requiredPerm: null,
    fetch: function (ctx) {
      ctx = ctx || {};
      var auth = currentAuth();
      var customers = C();
      var sort = ctx.sort || "recent";
      return (customers ? customers.list({ sort: sort }) : Promise.resolve([])).then(function (list) {
        return { sort: sort, customers: Array.isArray(list) ? list : [], auth: auth };
      });
    },
    toDocDef: function (data, opts) {
      data = data || {};
      var auth = data.auth;
      var list = Array.isArray(data.customers) ? data.customers : [];
      var label = tr(opts, "sorted_by", "Sorted by") + ": " + safeStr(data.sort) + "  (" + list.length + ")";
      if (!list.length) {
        return buildDoc(this.name, label, [emptyBlock(opts)], opts);
      }
      // Cap rows to keep the PDF bounded on the full seed.
      var CAP = 500;
      var capped = list.slice(0, CAP);
      var headers = ["Customer", "Mobile", "Visits", "Last visit", "Days ago", "Status", "Converted", "Total sale"];
      var rows = capped.map(function (c) {
        return [
          safeStr(c.name),
          maskMobileFor(auth, c.mobile),
          numCell(num(c.visitCount)),
          safeStr(c.lastVisitDate),
          numCell(num(c.lastVisitAgoDays)),
          safeStr(c.status),
          { text: c.converted ? tr(opts, "yes", "Yes") : tr(opts, "no", "No"), alignment: "center" },
          numCell(inr(opts, c.totalSaleValue))
        ];
      });
      var body = [dataTable(headers, rows, opts,
        ["20%", "14%", "8%", "13%", "10%", "12%", "10%", "13%"])];
      if (list.length > CAP) {
        body.push({
          text: "… " + (list.length - CAP) + " more customers (export CSV for the full list)",
          italics: true, color: "#6b7280", fontSize: 8, margin: [0, 4, 0, 0]
        });
      }
      return buildDoc(this.name, label, body, opts);
    }
  };

  // ── attach individual defs onto the namespace ────────────────────────────────
  var ReportDefs = {};
  Object.keys(defs).forEach(function (id) { ReportDefs[id] = defs[id]; });

  // list() — the defs the CURRENT user may run. Reads AuthSession.current() for the
  // role and filters by requiredPerm via window.can / window.canSafe. A null perm
  // means everyone (even logged-out, e.g. in a test harness). Unknown can() →
  // fail-closed for gated reports (canSafe returns false when can is missing).
  ReportDefs.list = function () {
    var auth = currentAuth();
    return Object.keys(defs).map(function (id) { return defs[id]; }).filter(function (def) {
      if (!def.requiredPerm) return true;          // null perm → everyone
      // Prefer canSafe (fail-closed); fall back to can; if neither exists, deny.
      if (typeof global.canSafe === "function") return global.canSafe(def.requiredPerm);
      if (typeof global.can === "function") return !!global.can(def.requiredPerm);
      // No permission helper available (e.g. node test) → allow only if a role is
      // present and is not a GREETOR (mirror the intent: gated == manager/owner).
      return !!(auth && auth.role && auth.role !== "GREETOR");
    });
  };

  // ids() — convenience: all registered ids in declaration order.
  ReportDefs.ids = function () { return Object.keys(defs); };

  // get(id) — fetch a single def (or undefined).
  ReportDefs.get = function (id) { return defs[id]; };

  global.ReportDefs = ReportDefs;
  if (typeof module !== "undefined" && module.exports) module.exports = ReportDefs;

}(typeof window !== "undefined" ? window : globalThis));
