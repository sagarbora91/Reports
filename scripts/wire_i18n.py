#!/usr/bin/env python3
"""Wire hardcoded English UI literals in www/app.js to the existing tUi() i18n.

i18n_data.js already carries a full English+Marathi ui_strings set, but the app
code only used tUi() for tab labels. This script connects the rest: for each
ui_strings key whose English value appears verbatim in a SAFE syntactic context,
it replaces the literal with ${tUi('key')} (no fallback needed — the English
value lives in the data, so en locale still renders English).

SAFE contexts only (to avoid touching verdict pills, code, etc.):
  >VALUE</button>     >VALUE</h2>     >VALUE</h3>
  <span>VALUE</span>
  placeholder="VALUE"
  toast('VALUE') / toast("VALUE")
  confirm/alert/prompt('VALUE') / "..."

Run from repo root:  python scripts/wire_i18n.py
"""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www")
APP = os.path.join(ROOT, "app.js")


def load_ui_strings():
    src = open(os.path.join(ROOT, "i18n_data.js"), encoding="utf-8").read()
    obj = src[src.find("{"): src.rfind("}") + 1]
    d = json.loads(obj)
    return d["en"]["ui_strings"]


def build_value_map(ui):
    """English value -> key. Skip dynamic ({...}) and empty values."""
    vmap = {}
    for key, val in ui.items():
        if not val or "{" in val:
            continue
        # First key wins for duplicate values (translations are equivalent).
        vmap.setdefault(val, key)
    # Process longer values first so 'Cancel audit' isn't shadowed by 'Cancel'.
    return sorted(vmap.items(), key=lambda kv: -len(kv[0]))


def main():
    ui = load_ui_strings()
    pairs = build_value_map(ui)
    text = open(APP, encoding="utf-8").read()
    counts = {}

    def bump(key, n):
        if n:
            counts[key] = counts.get(key, 0) + n

    for value, key in pairs:
        esc = re.escape(value)
        rep = "${tUi('%s')}" % key

        # --- element text: >…VALUE…< before a closing tag we trust ---
        for close in ("button", "h2", "h3"):
            pat = re.compile(r">(\s*)" + esc + r"(\s*)</" + close + r">")
            text, n = pat.subn(lambda m: ">" + m.group(1) + rep + m.group(2) + "</" + close + ">", text)
            bump(key, n)

        # --- bare <span>VALUE</span> (field labels; pills carry a class) ---
        pat = re.compile(r"<span>(\s*)" + esc + r"(\s*)</span>")
        text, n = pat.subn(lambda m: "<span>" + m.group(1) + rep + m.group(2) + "</span>", text)
        bump(key, n)

        # --- placeholder="VALUE" ---
        pat = re.compile(r'placeholder="' + esc + r'"')
        text, n = pat.subn('placeholder="' + rep + '"', text)
        bump(key, n)

        # --- toast / confirm / alert / prompt ('VALUE' | "VALUE") ---
        callrep = "tUi('%s')" % key
        for fn in ("toast", "confirm", "alert", "prompt"):
            for q in ("'", '"'):
                pat = re.compile(re.escape(fn + "(" + q) + esc + re.escape(q + ")"))
                text, n = pat.subn(fn + "(" + callrep + ")", text)
                bump(key, n)

    open(APP, "w", encoding="utf-8", newline="\n").write(text)

    total = sum(counts.values())
    print("Wired %d literal(s) across %d key(s):" % (total, len(counts)))
    for key in sorted(counts):
        print("  %-32s ×%d" % (key, counts[key]))


if __name__ == "__main__":
    main()
