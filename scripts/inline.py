#!/usr/bin/env python3
"""Rebuild www/index.html from the split source files.

The app is shipped as a single self-contained www/index.html, but it's edited
as separate source files for sanity:
  - style.css                          -> the inlined <style> block
  - i18n_data.js, reference_data.js,
    data.js, weekly_data.js, app.js     -> the inlined <script> bundle (in order)

This script splices those back into index.html, touching only the two inlined
blocks and leaving every other byte of the HTML exactly as-is.

Run from repo root:  python scripts/inline.py
"""
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www")
INDEX = os.path.join(ROOT, "index.html")
JS_ORDER = ["config.js", "i18n_data.js", "reference_data.js", "data.js", "weekly_data.js", "app.js"]


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def js_order():
    """The JS files to inline, in order. demo_seed.js (a pre-loaded dataset) is
    included right after config.js IF it exists — present only on the `demo`
    branch, absent (and thus a no-op) on the production `capacitor` branch."""
    order = list(JS_ORDER)
    if os.path.exists(os.path.join(ROOT, "demo_seed.js")):
        order.insert(1, "demo_seed.js")
    return order


def main():
    html = read(INDEX)
    css = read(os.path.join(ROOT, "style.css")).rstrip("\n")
    order = js_order()
    js = "\n".join(read(os.path.join(ROOT, f)).rstrip("\n") for f in order)

    # --- CSS block ---
    try:
        pre_style, rest = html.split("  <style>\n", 1)
        _old_css, after_style = rest.split("\n  </style>", 1)
    except ValueError:
        sys.exit("ERROR: could not locate the <style>...</style> block")

    # --- JS block (the inline <script>, not the shell.js external one) ---
    try:
        pre_script, rest2 = after_style.split("  <script>\n", 1)
        _old_js, post_script = rest2.split("\n  </script>", 1)
    except ValueError:
        sys.exit("ERROR: could not locate the inline <script>...</script> block")

    after_style_new = pre_script + "  <script>\n" + js + "\n  </script>" + post_script
    html_new = pre_style + "  <style>\n" + css + "\n  </style>" + after_style_new

    with open(INDEX, "w", encoding="utf-8", newline="\n") as f:
        f.write(html_new)

    print("Rebuilt %s" % INDEX)
    print("  CSS:  %d bytes" % len(css))
    print("  JS:   %d bytes (%s)" % (len(js), " + ".join(order)))


if __name__ == "__main__":
    main()
