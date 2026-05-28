/* charts.js — window.Charts: dependency-free SVG/HTML chart renderer
   Brand: navy #0b1f3a, gold #c99a2e, green #168a51, red #ba2d2d, gray #6b7280, track #eef2f7
   All functions are pure: input → string. Never throws. */
(function () {
  "use strict";

  /* ── helpers ─────────────────────────────────────────────────── */
  var PALETTE = ["#c99a2e", "#168a51", "#ba2d2d", "#0b1f3a", "#6b7280", "#e08a1e", "#2e7d9a"];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function clamp0(v) {
    return v < 0 ? 0 : v;
  }

  function defaultFmt(n) {
    return String(Math.round(n * 10) / 10);
  }

  var EMPTY_DIV = '<div style="color:#6b7280;font-size:11px;text-align:center;padding:12px 0;">Not enough data</div>';

  /* ── Charts.line ─────────────────────────────────────────────── */
  function line(points, opts) {
    opts = opts || {};
    var h        = num(opts.height) || 120;
    var color    = opts.color || "#c99a2e";
    var fill     = opts.fill !== false;
    var fmt      = typeof opts.valueFmt === "function" ? opts.valueFmt : defaultFmt;

    if (!Array.isArray(points) || points.length < 2) {
      if (Array.isArray(points) && points.length === 1) {
        var sv = num(points[0].value);
        return (
          '<svg viewBox="0 0 200 ' + h + '" style="width:100%;height:auto;display:block">' +
          '<circle cx="100" cy="' + (h / 2) + '" r="5" fill="' + color + '"/>' +
          '<text x="100" y="' + (h / 2 - 10) + '" text-anchor="middle" font-size="12" fill="#0b1f3a">' + esc(fmt(sv)) + "</text>" +
          "</svg>"
        );
      }
      return EMPTY_DIV;
    }

    var values = points.map(function (p) { return num(p.value); });
    var minV   = Math.min.apply(null, values);
    var maxV   = Math.max.apply(null, values);

    // Guard divide-by-zero when all values equal
    var range  = maxV - minV;
    if (range === 0) { minV = 0; range = maxV > 0 ? maxV : 1; }

    var padL = 8, padR = 8, padT = 18, padB = 20;
    var W    = 320; // viewBox width (responsive via viewBox)
    var innerW = W - padL - padR;
    var innerH = h - padT - padB;
    var n      = points.length;

    function xOf(i) { return padL + (i / (n - 1)) * innerW; }
    function yOf(v) { return padT + (1 - (num(v) - minV) / range) * innerH; }

    // Build polyline points string
    var polyPts = points.map(function (p, i) {
      return xOf(i).toFixed(1) + "," + yOf(p.value).toFixed(1);
    }).join(" ");

    // Gradient fill path: go down to baseline, across, back up
    var baseY = yOf(minV).toFixed(1);
    var fillPath = "";
    if (fill) {
      var pathD = "M " + xOf(0).toFixed(1) + "," + yOf(points[0].value).toFixed(1);
      for (var i = 1; i < n; i++) {
        pathD += " L " + xOf(i).toFixed(1) + "," + yOf(points[i].value).toFixed(1);
      }
      pathD += " L " + xOf(n - 1).toFixed(1) + "," + baseY +
               " L " + xOf(0).toFixed(1) + "," + baseY + " Z";
      fillPath = (
        '<defs>' +
        '<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.25"/>' +
        '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>' +
        '</linearGradient></defs>' +
        '<path d="' + pathD + '" fill="url(#cg)" stroke="none"/>'
      );
    }

    // Dots
    var dots = points.map(function (p, i) {
      return '<circle cx="' + xOf(i).toFixed(1) + '" cy="' + yOf(p.value).toFixed(1) +
             '" r="3" fill="' + color + '" stroke="#fff" stroke-width="1.5"/>';
    }).join("");

    // First & last labels (value)
    var firstX = xOf(0), lastX = xOf(n - 1);
    var firstY = yOf(points[0].value);
    var lastY  = yOf(points[n - 1].value);

    var firstAnchor = "start";
    var lastAnchor  = "end";

    var valLabels =
      '<text x="' + firstX.toFixed(1) + '" y="' + (firstY - 7).toFixed(1) +
      '" text-anchor="' + firstAnchor + '" font-size="10" fill="#0b1f3a">' + esc(fmt(num(points[0].value))) + "</text>" +
      '<text x="' + lastX.toFixed(1) + '" y="' + (lastY - 7).toFixed(1) +
      '" text-anchor="' + lastAnchor + '" font-size="10" fill="#0b1f3a">' + esc(fmt(num(points[n - 1].value))) + "</text>";

    // First & last x-axis labels
    var xLabels =
      '<text x="' + firstX.toFixed(1) + '" y="' + (h - 4) +
      '" text-anchor="start" font-size="9" fill="#6b7280">' + esc(points[0].label) + "</text>" +
      '<text x="' + lastX.toFixed(1) + '" y="' + (h - 4) +
      '" text-anchor="end" font-size="9" fill="#6b7280">' + esc(points[n - 1].label) + "</text>";

    // Baseline
    var baseline = '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY +
                   '" stroke="#eef2f7" stroke-width="1"/>';

    return (
      '<svg viewBox="0 0 ' + W + ' ' + h + '" style="width:100%;height:auto;display:block">' +
      fillPath +
      baseline +
      '<polyline points="' + polyPts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      valLabels +
      xLabels +
      "</svg>"
    );
  }

  /* ── Charts.bars ─────────────────────────────────────────────── */
  function bars(items, opts) {
    opts = opts || {};
    var color  = opts.color || "#c99a2e";
    var fmt    = typeof opts.valueFmt === "function" ? opts.valueFmt : defaultFmt;
    var limit  = num(opts.limit) || 8;

    if (!Array.isArray(items) || items.length === 0) {
      return EMPTY_DIV;
    }

    var slice  = items.slice(0, limit);
    var values = slice.map(function (it) { return clamp0(num(it.value)); });
    var maxVal = num(opts.max) || Math.max.apply(null, values);
    if (maxVal <= 0) { maxVal = 1; }

    var rows = slice.map(function (it, i) {
      var v   = clamp0(num(it.value));
      var pct = Math.min(100, (v / maxVal) * 100).toFixed(1);
      return (
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:12px;">' +
        '<div style="flex:0 0 80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#0b1f3a;font-size:11px;" title="' + esc(it.label) + '">' + esc(it.label) + "</div>" +
        '<div style="flex:1;background:#eef2f7;border-radius:3px;height:10px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;background:' + color + ';height:100%;border-radius:3px;transition:width 0.3s;"></div>' +
        "</div>" +
        '<div style="flex:0 0 36px;text-align:right;color:#0b1f3a;font-weight:600;font-size:11px;">' + esc(fmt(v)) + "</div>" +
        "</div>"
      );
    }).join("");

    return '<div style="padding:4px 0;">' + rows + "</div>";
  }

  /* ── Charts.deltaBadge ───────────────────────────────────────── */
  function deltaBadge(current, previous) {
    var cur  = num(current);
    var prev = num(previous);

    var bgColor, icon, label;

    if (!previous && previous !== 0) { prev = 0; }

    if (prev === 0) {
      if (cur > 0) {
        bgColor = "#168a51"; icon = "▲"; label = "new";
      } else {
        bgColor = "#6b7280"; icon = "—"; label = "0%";
      }
    } else {
      var pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
      if (pct > 0)      { bgColor = "#168a51"; icon = "▲"; label = "+" + pct + "%"; }
      else if (pct < 0) { bgColor = "#ba2d2d"; icon = "▼"; label = pct + "%"; }
      else              { bgColor = "#6b7280"; icon = "—"; label = "0%"; }
    }

    return (
      '<span style="display:inline-flex;align-items:center;gap:3px;background:' + bgColor +
      ';color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;line-height:1.4;">' +
      icon + " " + label +
      "</span>"
    );
  }

  /* ── Charts.donut ────────────────────────────────────────────── */
  function donut(segments, opts) {
    opts = opts || {};
    var size = num(opts.size) || 120;

    if (!Array.isArray(segments) || segments.length === 0) {
      return EMPTY_DIV;
    }

    // Coerce values, assign palette colors
    var segs = segments.map(function (s, i) {
      return {
        label: s.label || "",
        value: clamp0(num(s.value)),
        color: s.color || PALETTE[i % PALETTE.length]
      };
    });

    var total = segs.reduce(function (acc, s) { return acc + s.value; }, 0);
    if (total <= 0) { return EMPTY_DIV; }

    // SVG ring via stroke-dasharray on <circle>
    var cx = size / 2, cy = size / 2;
    var r  = size * 0.35;          // ring radius
    var strokeW = size * 0.13;     // ring thickness
    var circ = 2 * Math.PI * r;    // circumference

    var offset = 0; // current dash offset (start from top: rotate -90deg)
    var rings = segs.map(function (s) {
      var fraction = s.value / total;
      var dash     = (fraction * circ).toFixed(3);
      var gap      = (circ - fraction * circ).toFixed(3);
      var rot      = (offset / circ) * 360 - 90; // degrees
      offset += fraction * circ;
      return (
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + s.color + '" stroke-width="' + strokeW +
        '" stroke-dasharray="' + dash + ' ' + gap +
        '" transform="rotate(' + rot.toFixed(2) + ' ' + cx + ' ' + cy + ')" />'
      );
    }).join("");

    // Center total
    var totalLabel = defaultFmt(total);
    var centerText =
      '<text x="' + cx + '" y="' + (cy + 4) +
      '" text-anchor="middle" font-size="' + (size * 0.13) +
      '" font-weight="700" fill="#0b1f3a">' + esc(totalLabel) + "</text>";

    var svgH = size;
    var svg  =
      '<svg viewBox="0 0 ' + size + ' ' + svgH +
      '" style="width:' + size + 'px;height:' + svgH + 'px;display:block;margin:0 auto;">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eef2f7" stroke-width="' + strokeW + '"/>' +
      rings +
      centerText +
      "</svg>";

    // Legend
    var legend = segs.map(function (s) {
      return (
        '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#0b1f3a;margin-bottom:3px;">' +
        '<span style="flex:0 0 10px;height:10px;border-radius:2px;background:' + s.color + ';display:inline-block;"></span>' +
        '<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">' + esc(s.label) + "</span>" +
        '<span style="font-weight:600;">' + esc(defaultFmt(s.value)) + "</span>" +
        "</div>"
      );
    }).join("");

    return (
      '<div style="text-align:center;">' +
      svg +
      '<div style="margin-top:8px;text-align:left;padding:0 4px;">' + legend + "</div>" +
      "</div>"
    );
  }

  /* ── Export ──────────────────────────────────────────────────── */
  window.Charts = { line: line, bars: bars, deltaBadge: deltaBadge, donut: donut };
}());
