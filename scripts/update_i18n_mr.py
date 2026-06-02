#!/usr/bin/env python3
"""Update Marathi (mr) values for existing ui_strings keys in www/i18n_data.js.

add_i18n_keys.py only INSERTS new keys (skipping existing ones). This patches
the mr translation for keys that already exist — used for the v0.3.1 follow-up
that translates the Home-tab + batch-verify cards which shipped English-first.

Replaces only within the "mr" locale block (preserving file formatting), so
the en values are untouched. Idempotent.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www")
F = os.path.join(ROOT, "i18n_data.js")

# key -> Marathi value
KEY_MR = {
    "tab.home": "मुख्यपृष्ठ",
    "home.empty_title": "सर्व ठीक",
    "home.empty_intro": "सध्या तुमच्यासाठी काही नाही. ऑडिट करण्यासाठी, इतिहास पाहण्यासाठी किंवा सेटिंग्ज बदलण्यासाठी टॅब वापरा.",
    "home.verify_card_title": "पडताळणीच्या प्रतीक्षेत असलेली ऑडिट",
    "home.verify_card_intro_fmt": "{n} सादर ऑडिट जीएम किंवा मालकाच्या पडताळणीची वाट पाहत आहेत.",
    "home.verify_card_cta": "आता पडताळा",
    "home.today_done_title": "आजचे दैनिक ऑडिट — पूर्ण",
    "home.today_done_cta": "इतिहासात उघडा",
    "home.run_daily_title": "आजचे दैनिक ऑडिट करा",
    "home.run_daily_intro": "आजचे ६८-बिंदू दैनिक ऑडिट अजून सादर झालेले नाही.",
    "home.run_daily_cta": "दैनिक ऑडिट सुरू करा",
    "home.weekly_due_title": "साप्ताहिक ऑडिट बाकी",
    "home.weekly_due_intro": "या आठवड्याचे साप्ताहिक ऑडिट अजून केलेले नाही.",
    "home.weekly_due_cta": "साप्ताहिक ऑडिट करा",
    "home.escalations_title": "पाठवायच्या सूचना",
    "home.escalations_intro_fmt": "{n} एस्केलेशन उघडे व न पाठवलेले आहेत. दिवस संपण्यापूर्वी ती योग्य व्यक्तीला WhatsApp करा.",
    "home.escalations_cta": "सूचना उघडा",
    "home.caps_to_verify_title": "पडताळायच्या CAPs",
    "home.caps_to_verify_intro_fmt": "एसएमने पूर्ण म्हणून खूण केलेले {n} CAP तुमच्या पडताळणीची वाट पाहत आहेत.",
    "home.caps_to_verify_cta": "CAPs उघडा",
    "batchverify.title_fmt": "{n} ऑडिट पडताळा",
    "batchverify.intro": "प्रत्येक ओळीवर पडताळा दाबून ती तपासा. प्रत्येक वेळी तुम्ही पुढच्यासाठी इथे परत याल.",
    "batchverify.verify_btn": "पडताळा",
    "batchverify.all_done": "सर्व ऑडिट पडताळली ✓",
}


def main():
    text = open(F, encoding="utf-8").read()
    # Everything from the "mr" locale key onward is the Marathi block.
    mi = text.find('"mr"')
    if mi < 0:
        sys.exit("ERROR: could not find the mr locale block")
    head, mrpart = text[:mi], text[mi:]

    changed = 0
    for key, val in KEY_MR.items():
        pat = re.compile(r'(' + re.escape('"' + key + '"') + r'\s*:\s*)"(?:[^"\\]|\\.)*"')
        new_mrpart, n = pat.subn(lambda m: m.group(1) + json.dumps(val, ensure_ascii=False), mrpart, count=1)
        if n == 1:
            mrpart = new_mrpart
            changed += 1
        else:
            print("WARN: key not found in mr block: %s (matched %d)" % (key, n))

    open(F, "w", encoding="utf-8", newline="\n").write(head + mrpart)
    print("Updated %d Marathi value(s)." % changed)


if __name__ == "__main__":
    main()
