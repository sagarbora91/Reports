#!/usr/bin/env python3
"""Insert new ui_strings keys (en + mr) into www/i18n_data.js surgically.

Adds the keys this batch needs (toasts, confirms, verify-gate) right after each
locale's `"ui_strings": {` opening, keeping the rest of the file byte-identical.
Idempotent: skips any key already present in the en block.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www")
F = os.path.join(ROOT, "i18n_data.js")

# key -> (english, marathi)
NEW = {
    # --- toasts / errors / info ---
    "err.schedule_failed": ("Could not schedule — check notification permission", "शेड्यूल करता आले नाही — सूचना परवानगी तपासा"),
    "err.reminder_failed": ("Reminder change failed", "स्मरण बदल अयशस्वी"),
    "err.audit_not_found": ("Audit not found", "ऑडिट सापडले नाही"),
    "err.only_gm_owner_verify": ("Only GM or Owner can verify", "फक्त जीएम किंवा मालक पडताळू शकतात"),
    "err.only_gm_owner_reject": ("Only GM or Owner can reject", "फक्त जीएम किंवा मालक नाकारू शकतात"),
    "err.only_gm_owner_close": ("Only GM or Owner can close", "फक्त जीएम किंवा मालक बंद करू शकतात"),
    "err.cant_verify_own": ("You can't verify your own audit", "तुम्ही स्वतःचे ऑडिट पडताळू शकत नाही"),
    "info.already_verified": ("Already verified", "आधीच पडताळलेले"),
    "ok.audit_verified": ("Audit verified ✓", "ऑडिट पडताळले ✓"),
    "err.backup_failed": ("Backup failed", "बॅकअप अयशस्वी"),
    "err.cant_build_wa": ("Cannot build WhatsApp link", "WhatsApp लिंक तयार करता आली नाही"),
    "err.cp_text_short": ("Checkpoint text too short", "तपासणी बिंदूचा मजकूर खूप छोटा"),
    "err.copy_failed": ("Copy failed — long-press the message to select", "कॉपी अयशस्वी — निवडण्यासाठी संदेश दाबून धरा"),
    "err.no_photo_capture": ("Could not capture photo", "फोटो घेता आला नाही"),
    "err.current_pin_wrong": ("Current PIN is wrong", "सध्याचा PIN चुकीचा आहे"),
    "err.name_2chars": ("Enter a name (2+ characters)", "नाव टाका (२+ अक्षरे)"),
    "err.enter_current_pin": ("Enter your current 4-digit PIN", "तुमचा सध्याचा ४-अंकी PIN टाका"),
    "err.give_name": ("Give it a name", "याला नाव द्या"),
    "err.name_short": ("Name too short", "नाव खूप छोटे"),
    "err.new_pin_mismatch": ("New PIN and confirmation do not match", "नवीन PIN आणि खात्री जुळत नाही"),
    "err.new_pin_4digits": ("New PIN must be 4 digits", "नवीन PIN ४ अंकी असावा"),
    "err.pin_mismatch": ("PIN and confirmation do not match", "PIN आणि खात्री जुळत नाही"),
    "err.pin_4digits": ("PIN must be 4 digits", "PIN ४ अंकी असावा"),
    "err.pins_mismatch": ("PINs do not match", "PIN जुळत नाहीत"),
    "err.recipient_no_phone": ("Recipient has no phone. Add one in Users.", "प्राप्तकर्त्याचा फोन नाही. Users मध्ये जोडा."),
    "err.reject_needs_reason": ("Rejection needs a reason", "नकारासाठी कारण आवश्यक"),
    "err.action_step_short": ("Action step text too short", "कृती पावलाचा मजकूर खूप छोटा"),
    "err.add_short_reason": ("Add a short reason", "थोडक्यात कारण द्या"),
    "err.shell_not_loaded": ("Shell not loaded", "शेल लोड झाले नाही"),
    "err.sign_in_first": ("Sign in first", "आधी साइन इन करा"),
    "info.weekly_gm_owner": ("Weekly audits are run by the GM or Owner.", "साप्ताहिक ऑडिट जीएम किंवा मालक चालवतात."),
    "ok.reset_original": ("Reset to original", "मूळ स्थितीत आणले"),
    "ok.template_deleted": ("Template deleted", "टेम्पलेट हटवले"),
    "confirm.delete_point": ("Delete this point?", "हा बिंदू हटवायचा?"),
    "confirm.delete_template": ("Delete this template? Past audits that used it keep their frozen copies.", "हे टेम्पलेट हटवायचे? ते वापरलेली जुनी ऑडिट त्यांच्या गोठवलेल्या प्रती ठेवतात."),
    "confirm.reset_builtin": ("Reset this built-in checklist to its original points? Your edits to it will be lost (past audits keep their frozen copies).", "ही अंगभूत चेकलिस्ट मूळ बिंदूंवर रीसेट करायची? तुमचे बदल गमावले जातील (जुनी ऑडिट त्यांच्या गोठवलेल्या प्रती ठेवतात)."),
    # --- verify gate ---
    "verify.btn": ("✓ Verify this audit", "✓ हे ऑडिट पडताळा"),
    "verify.title": ("Verify audit", "ऑडिट पडताळा"),
    "verify.confirm_btn": ("✓ Confirm — I verify this audit", "✓ खात्री — मी हे ऑडिट पडताळतो"),
    "verify.note_label": ("Verification note (optional)", "पडताळणी नोंद (ऐच्छिक)"),
    "verify.note_ph": ("e.g. spot-checked CP1 & CP12 on floor — matches", "उदा. फ्लोअरवर CP1 व CP12 तपासले — जुळतात"),
    "verify.instructions": ("Spot-check these recorded verdicts against what you know on the floor. Confirm only if they look honest.", "नोंदवलेले हे निकाल फ्लोअरवरील वस्तुस्थितीशी तपासा. प्रामाणिक वाटले तरच खात्री करा."),
    "verify.no_marks": ("No marked checkpoints to spot-check.", "तपासण्यासाठी कोणतेही चिन्हांकित बिंदू नाहीत."),
    "verify.awaiting": ("⏳ Awaiting verification", "⏳ पडताळणीची प्रतीक्षा"),
    "verify.by": ("Verified by", "पडताळले"),
    "verify.chip": ("✓ verified", "✓ पडताळले"),
    # --- batch 2: main-screen chrome, frequency/mode/role labels ---
    "freq.daily": ("Daily", "दैनिक"),
    "freq.weekly": ("Weekly", "साप्ताहिक"),
    "freq.monthly": ("Monthly", "मासिक"),
    "freq.custom": ("Custom", "सानुकूल"),
    "cromode.store": ("Once for the store", "संपूर्ण स्टोअरसाठी एकदा"),
    "cromode.per_cro": ("Score each CRO separately", "प्रत्येक सीआरओला स्वतंत्र गुण"),
    "templates.heading": ("Audit templates", "ऑडिट टेम्पलेट्स"),
    "templates.desc": ("Create and edit the checklists your staff run. Add daily, weekly, monthly or custom audits — no code needed.", "तुमचे कर्मचारी चालवतात त्या चेकलिस्ट तयार करा व संपादा. दैनिक, साप्ताहिक, मासिक किंवा सानुकूल ऑडिट जोडा — कोडची गरज नाही."),
    "templates.edit": ("Edit ›", "संपादन ›"),
    "templates.new": ("New audit template", "नवीन ऑडिट टेम्पलेट"),
    "templates.none_role": ("No audit templates available for your role. Ask the Owner to add one in Settings → Audit templates.", "तुमच्या भूमिकेसाठी कोणतेही ऑडिट टेम्पलेट उपलब्ध नाही. मालकाला सेटिंग्ज → ऑडिट टेम्पलेट्स मध्ये एक जोडण्यास सांगा."),
    "label.language": ("Language", "भाषा"),
    "history.trends": ("📊 Trends", "📊 कल"),
    "hint.stored_with_audit": ("Stored with the audit, shown on the report and exports.", "ऑडिटसोबत जतन; अहवाल व निर्यातांत दिसते."),
    "hint.backdate_why": ("Backdated audit — please record why", "मागील तारखेचे ऑडिट — कृपया कारण नोंदवा"),
    "cap.owner": ("Owner:", "मालक:"),
    "settings.cro_desc": ('Floor staff at Titan World & Helios counters. They appear in the "CROs on duty" picker and the FAIL detail dropdown.', 'टायटन वर्ल्ड व हेलिओस काउंटरवरील फ्लोअर स्टाफ. ते "ड्युटीवरील सीआरओ" निवडक व नापास तपशील ड्रॉपडाउनमध्ये दिसतात.'),
    "start.heading": ("Start an audit", "ऑडिट सुरू करा"),
    "start.button_fmt": ("Start {name}", "{name} सुरू करा"),
    # --- batch 3: CAP tab + settings reminder ---
    "cap.filter_all": ("All", "सर्व"),
    "cap.cro_word": ("CRO:", "सीआरओ:"),
    "cap.overdue_fmt": ("{n}d overdue", "{n} दिवस उलटले"),
    "cap.due_today": ("due today", "आज मुदत"),
    "cap.due_in_fmt": ("due in {n}d", "{n} दिवसांत मुदत"),
    "label.checkpoint_word": ("checkpoint", "तपासणी बिंदू"),
    "hint.reminder_desc": ("A daily reminder at 10:00 AM nudges you (or your Store Manager) to run the day's audit. Tap to open straight into the start screen.", "सकाळी १०:०० वाजता दैनिक स्मरण तुम्हाला (किंवा तुमच्या स्टोअर मॅनेजरला) दिवसाचे ऑडिट करण्याची आठवण करते. थेट सुरू स्क्रीनवर जाण्यासाठी टॅप करा."),
    # --- batch 4: composed footers ---
    "start.footer_fmt": ("{n} point(s) · target 90%+ · score = % passed", "{n} बिंदू · लक्ष्य ९०%+ · गुण = % पास"),
    "settings.storage_fmt": ("{a} audit(s), {c} CRO(s), {u} user(s) and {p} CAP(s) stored on this device. One backup file bundles everything — share to Drive, OneDrive, WhatsApp or any other app.", "या डिव्हाइसवर {a} ऑडिट, {c} सीआरओ, {u} वापरकर्ते व {p} CAP जतन आहेत. एकच बॅकअप फाइल सर्व काही एकत्र करते — Drive, OneDrive, WhatsApp किंवा इतर कोणत्याही अॅपवर शेअर करा."),
    # --- batch 5: storage health (Stage A #12a) ---
    "hint.last_backup_never": ("No backups yet — please back up to Drive today.", "अजून बॅकअप नाही — आज Drive वर बॅकअप घ्या."),
    "hint.last_backup_today": ("Last backup: today.", "शेवटचा बॅकअप: आज."),
    "hint.last_backup_days_fmt": ("Last backup: {n} day(s) ago.", "शेवटचा बॅकअप: {n} दिवसांपूर्वी."),
    "hint.storage_full_warn_fmt": ("Storage is {pct}% full ({mb} MB used of ~5 MB). Back up to Drive and consider removing old photos before the app stops saving new audits.", "स्टोरेज {pct}% भरले आहे (~५ MB पैकी {mb} MB वापरले). नवे ऑडिट जतन होणे थांबण्यापूर्वी Drive वर बॅकअप घ्या व जुने फोटो काढण्याचा विचार करा."),
    "label.storage_full_warn": ("⚠ Storage is filling up", "⚠ स्टोरेज भरत आहे"),
    # --- batch 6: pre-submit advisory check (Stage A #6) ---
    "presubmit.title": ("Submit this audit?", "हे ऑडिट सादर करायचे?"),
    "presubmit.intro": ("A few things look incomplete. You can go back and fix them, or submit anyway — the warnings will be stamped on the audit notes.", "काही गोष्टी अपूर्ण दिसतात. तुम्ही परत जाऊन त्या दुरुस्त करू शकता किंवा तरीही सादर करू शकता — या सूचना ऑडिट नोंदींवर शिक्क्यासह जतन होतील."),
    "presubmit.fix": ("Go back and fix", "परत जाऊन दुरुस्त करा"),
    "presubmit.submit_anyway": ("Submit anyway", "तरीही सादर करा"),
    # --- batch 7: resume-draft card + SKIP button (Stage A #8) ---
    "resume.title": ("Audit in progress", "ऑडिट सुरू आहे"),
    "resume.cp_of_fmt": ("CP {n} of {total}", "तपासणी बिंदू {n} / {total}"),
    "resume.started_min_fmt": ("started {n} min ago", "{n} मिनिटांपूर्वी सुरू केले"),
    "resume.started_hr_fmt": ("started {n} hr ago", "{n} तासांपूर्वी सुरू केले"),
    "resume.started_day_fmt": ("started {n} day(s) ago", "{n} दिवसांपूर्वी सुरू केले"),
    "resume.continue": ("Continue this audit", "हे ऑडिट सुरू ठेवा"),
    "resume.discard": ("Discard and start fresh", "टाकून द्या आणि नवीन सुरू करा"),
    "btn.skip": ("⏭ Skip — come back later", "⏭ वगळा — नंतर पुन्हा या"),
    "btn.skip_with_count_fmt": ("⏭ Skip ({n} pending) — come back later", "⏭ वगळा ({n} प्रलंबित) — नंतर पुन्हा या"),
    # --- batch 8: photo + FAIL modal feedback (Stage A #2) ---
    "hint.photo_not_added": ("Photo not added — camera cancelled or permission denied.", "फोटो जोडला नाही — कॅमेरा रद्द केला किंवा परवानगी नाकारली."),
    "hint.saving_photo": ("Saving photo…", "फोटो जतन होत आहे…"),
    "hint.photo_added_with_gps_fmt": ("Photo added ({kb} KB · GPS ✓)", "फोटो जोडला ({kb} KB · GPS ✓)"),
    "hint.photo_added_no_gps_fmt": ("Photo added ({kb} KB · no GPS — indoors?)", "फोटो जोडला ({kb} KB · GPS नाही — इमारतीत?)"),
}


def insert_after(text, marker, lines, start=0):
    i = text.index(marker, start)
    j = i + len(marker)
    return text[:j] + lines + text[j:], j


def main():
    text = open(F, encoding="utf-8").read()
    # Skip keys already present.
    existing = json.loads(text[text.find("{"): text.rfind("}") + 1])["en"]["ui_strings"]
    keys = [k for k in NEW if k not in existing]
    if not keys:
        print("All keys already present — nothing to do.")
        return

    def block(locale_idx):
        out = []
        for k in keys:
            val = NEW[k][locale_idx]
            out.append('      %s: %s,' % (json.dumps(k, ensure_ascii=False), json.dumps(val, ensure_ascii=False)))
        return "\n" + "\n".join(out)

    marker = '    "ui_strings": {\n'
    # en block is the first occurrence, mr the second.
    text, after_en = insert_after(text, marker, block(0))
    text, _ = insert_after(text, marker, block(1), start=after_en + 5000)

    open(F, "w", encoding="utf-8", newline="\n").write(text)
    print("Inserted %d new key(s) into en + mr ui_strings." % len(keys))
    for k in keys:
        print("  " + k)


if __name__ == "__main__":
    main()
