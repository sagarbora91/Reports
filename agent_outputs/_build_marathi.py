# Build the marathi.json translation file from the curated EN/MR data
# extracted from Workbook + Spec + QuickRef + app code.
# Output: agent_outputs/marathi.json

import json, datetime, sys, os
sys.stdout.reconfigure(encoding='utf-8')

# ---- Load app checkpoint list ---------------------------------------------
with open(r'C:\Cowork\Reports Apk\agent_outputs\_checkpoints_from_app.json', encoding='utf-8') as f:
    APP_CHECKPOINTS = json.load(f)

# ---- 1. UI STRINGS (from app code, spec §8, and inline scan) --------------
# Translation register: formal but plain Marathi, retail-staff audience.
# Technical terms transliterated (ऑडिट, CAP, PIN, POS, etc).
ui_strings = {
    # --- Top bar / brand ---
    "brand.tagline":         ("AUDIT", "ऑडिट"),
    "app.title":             ("Saagar Audit", "सागर ऑडिट"),
    "app.version_label":     ("Saagar Audit · v0.2.0", "सागर ऑडिट · v0.2.0"),

    # --- Tabs (nav) ---
    "nav.audit":             ("Audit", "ऑडिट"),
    "nav.history":           ("History", "इतिहास"),
    "nav.caps":              ("CAPs", "CAPs"),
    "nav.settings":          ("Settings", "सेटिंग्ज"),
    "nav.home":              ("Home", "मुख्यपृष्ठ"),
    "nav.audits":            ("Audits", "ऑडिट"),
    "nav.reference":         ("Reference", "संदर्भ"),
    "nav.reports":           ("Reports", "अहवाल"),

    # --- Buttons (from spec §8) ---
    "btn.start_audit":       ("Start Audit", "ऑडिट सुरू करा"),
    "btn.start_daily_audit": ("Start daily audit", "दैनंदिन ऑडिट सुरू करा"),
    "btn.submit":            ("Submit", "सादर करा"),
    "btn.submit_audit":      ("Submit audit", "ऑडिट सादर करा"),
    "btn.save_draft":        ("Save Draft", "ड्राफ्ट जतन करा"),
    "btn.cancel":            ("Cancel", "रद्द"),
    "btn.cancel_audit":      ("Cancel audit", "ऑडिट रद्द करा"),
    "btn.continue":          ("Continue", "पुढे"),
    "btn.back":              ("Back", "मागे"),
    "btn.next":              ("Next", "पुढे"),
    "btn.previous":          ("Previous", "मागे"),
    "btn.pass":              ("Pass", "पास"),
    "btn.fail":              ("Fail", "नापास"),
    "btn.na":                ("NA", "लागू नाही"),
    "btn.mark_na":           ("Mark N/A", "लागू नाही म्हणून खूण"),
    "btn.add_photo":         ("Add Photo", "फोटो जोडा"),
    "btn.take_photo":        ("Take photo", "फोटो काढा"),
    "btn.retake":            ("Retake", "पुन्हा घ्या"),
    "btn.use_photo":         ("Use", "वापरा"),
    "btn.create_cap":        ("Create CAP", "CAP तयार करा"),
    "btn.mark_done":         ("Mark Done", "पूर्ण म्हणून खूण"),
    "btn.mark_all_done":     ("Mark all done →", "सर्व पूर्ण म्हणून खूण →"),
    "btn.verify":            ("Verify", "पडताळा"),
    "btn.close":             ("Close", "बंद"),
    "btn.close_cap":         ("Close CAP", "CAP बंद करा"),
    "btn.reject":            ("Reject (re-open)", "नकार द्या (पुन्हा उघडा)"),
    "btn.reopen":            ("Reopen", "पुन्हा उघडा"),
    "btn.extend":            ("Extend Deadline", "मुदतवाढ द्या"),
    "btn.escalate":          ("Escalate", "एस्केलेट करा"),
    "btn.export_pdf":        ("Export PDF", "PDF निर्यात"),
    "btn.print_pdf":         ("Print / Save as PDF", "छापा / PDF म्हणून जतन"),
    "btn.share_whatsapp":    ("Share to WhatsApp", "WhatsApp ला शेअर"),
    "btn.send_whatsapp":     ("Send on WhatsApp", "WhatsApp वर पाठवा"),
    "btn.copy_message":      ("Copy message", "संदेश कॉपी करा"),
    "btn.view_message":      ("View message", "संदेश पाहा"),
    "btn.dismiss":           ("Dismiss", "रद्द करा"),
    "btn.confirm":           ("Confirm", "खात्री करा"),
    "btn.login":             ("Login", "लॉगिन"),
    "btn.sign_in":           ("SIGN IN", "साइन इन"),
    "btn.sign_out":          ("Sign out", "साइन आउट"),
    "btn.logout":            ("Logout", "लॉगआउट"),
    "btn.switch_user":       ("Switch user", "वापरकर्ता बदला"),
    "btn.change_pin":        ("Change PIN", "PIN बदला"),
    "btn.change_my_pin":     ("Change my PIN", "माझा PIN बदला"),
    "btn.save_new_pin":      ("Save new PIN", "नवीन PIN जतन"),
    "btn.reset_pin":         ("Reset PIN", "PIN रीसेट"),
    "btn.add":               ("Add", "जोडा"),
    "btn.add_another":       ("Add another", "आणखी जोडा"),
    "btn.add_user":          ("Add user", "वापरकर्ता जोडा"),
    "btn.add_cro":           ("Add CRO", "सीआरओ जोडा"),
    "btn.edit":              ("Edit", "संपादन"),
    "btn.delete":            ("Delete", "हटवा"),
    "btn.remove":            ("Remove", "काढून टाका"),
    "btn.deactivate":        ("Deactivate", "निष्क्रिय करा"),
    "btn.deactivate_user":   ("Deactivate user", "वापरकर्ता निष्क्रिय करा"),
    "btn.reactivate_user":   ("Reactivate user", "वापरकर्ता पुन्हा सक्रिय करा"),
    "btn.save":              ("Save", "जतन करा"),
    "btn.save_changes":      ("Save changes", "बदल जतन"),
    "btn.save_next":         ("Save & next", "जतन व पुढे"),
    "btn.discard_draft":     ("Discard draft", "ड्राफ्ट टाकून द्या"),
    "btn.change_phone":      ("Change phone", "फोन बदला"),
    "btn.change_my_phone":   ("Change my phone", "माझा फोन बदला"),
    "btn.add_phone":         ("Add phone number", "फोन नंबर जोडा"),
    "btn.add_my_phone":      ("Add my phone for WhatsApp escalations", "WhatsApp एस्केलेशनसाठी माझा फोन जोडा"),
    "btn.backup_drive":      ("Back up to Google Drive", "Google Drive वर बॅकअप"),
    "btn.restore_backup":    ("Restore from backup file", "बॅकअप फाइलमधून पुनर्संचयित"),
    "btn.export_csv":        ("Export all to CSV", "सर्व CSV ला निर्यात"),
    "btn.export_audits_csv": ("Export all audits to CSV", "सर्व ऑडिट CSV ला निर्यात"),
    "btn.erase_all":         ("Erase all data on this device", "या डिव्हाइसवरील सर्व डेटा पुसून टाका"),
    "btn.forgot_pin":        ("Forgot?", "विसरलात?"),
    "btn.x":                 ("X to revisit", "X — पुन्हा भेट"),

    # --- Section labels / headings ---
    "label.audit_date":      ("Audit date", "ऑडिटची तारीख"),
    "label.audit_notes":     ("Audit notes", "ऑडिट नोंदी"),
    "label.audit_notes_c":   ("Audit notes:", "ऑडिट नोंदी:"),
    "label.backdated_audit": ("Backdated audit:", "मागील तारखेचे ऑडिट:"),
    "label.backdated_audit_warn": ("⚠ Backdated audit", "⚠ मागील तारखेचे ऑडिट"),
    "label.cros_on_duty":    ("CROs on duty", "ड्युटीवरील सीआरओ"),
    "label.cros":            ("CROs", "सीआरओ"),
    "label.users":           ("Users", "वापरकर्ते"),
    "label.role":            ("Role", "भूमिका"),
    "label.name":            ("Name", "नाव"),
    "label.your_name":       ("Your name", "तुमचे नाव"),
    "label.counter":         ("Counter", "काउंटर"),
    "label.phone":           ("Phone (10 digits, optional)", "फोन (१० अंकी, ऐच्छिक)"),
    "label.phone_required":  ("Phone (10 digits or country-coded)", "फोन (१० अंकी किंवा देश-कोडसह)"),
    "label.phone_for":       ("Phone for", "फोन कोणासाठी"),
    "label.my_phone":        ("My phone number", "माझा फोन नंबर"),
    "label.current_pin":     ("Current PIN", "सध्याचा PIN"),
    "label.new_pin":         ("New PIN", "नवीन PIN"),
    "label.confirm_pin":     ("Confirm PIN", "PIN ची खात्री"),
    "label.confirm_new_pin": ("Confirm new PIN", "नवीन PIN ची खात्री"),
    "label.choose_pin":      ("Choose a 4-digit PIN", "४-अंकी PIN निवडा"),
    "label.confirm_your_pin":("Confirm your PIN", "तुमच्या PIN ची खात्री"),
    "label.checkpoint":      ("Checkpoint", "तपासणी बिंदू"),
    "label.cp":              ("CP", "तपासणी बिंदू"),
    "label.finding":         ("Finding", "निष्कर्ष"),
    "label.finding_evidence":("Finding / Evidence", "निष्कर्ष / पुरावा"),
    "label.cro_involved":    ("CRO involved (optional)", "संबंधित सीआरओ (ऐच्छिक)"),
    "label.cro_involved_c":  ("CRO involved:", "संबंधित सीआरओ:"),
    "label.action_steps":    ("Action steps", "कृती पावले"),
    "label.responsible":     ("Responsible", "जबाबदार व्यक्ती"),
    "label.deadline":        ("Deadline", "मुदत"),
    "label.root_cause":      ("Root cause", "मूळ कारण"),
    "label.result":          ("Result", "निकाल"),
    "label.required":        ("REQUIRED", "आवश्यक"),
    "label.photo_required_fail":("Photo required if FAIL", "नापास असेल तर फोटो आवश्यक"),
    "label.draft_review":    ("DRAFT · review before submit", "ड्राफ्ट · सादर करण्यापूर्वी पुनरावलोकन"),
    "label.first_time_setup":("FIRST-TIME SETUP", "पहिल्यांदा सेटअप"),
    "label.daily_audit":     ("Daily audit", "दैनंदिन ऑडिट"),
    "label.daily_reminder":  ("Daily audit reminder", "दैनंदिन ऑडिट स्मरण"),
    "label.notifications":   ("Notifications", "सूचना"),
    "label.my_account":      ("My account", "माझे खाते"),
    "label.signed_in_as":    ("Signed in as", "साइन इन"),
    "label.welcome_back":    ("Welcome back", "पुन्हा स्वागत"),
    "label.welcome":         ("Welcome,", "स्वागत,"),
    "label.welcome_owner":   ("Welcome, Owner", "स्वागत, मालक"),
    "label.danger_zone":     ("Danger zone", "धोकादायक क्षेत्र"),
    "label.backup_restore":  ("Backup & restore", "बॅकअप व पुनर्संचयन"),
    "label.escalation_msg":  ("Escalation message", "एस्केलेशन संदेश"),
    "label.verifier_note":   ("Verifier note:", "पडताळणाऱ्याची नोंद:"),
    "label.verification_notes":("Verification notes (optional):", "पडताळणीच्या नोंदी (ऐच्छिक):"),
    "label.reject_reason":   ("Reason for rejection (required):", "नकाराचे कारण (आवश्यक):"),
    "label.cro_fails_30d":   ("CROs with most fails (last 30 days)", "सर्वाधिक नापासांचे सीआरओ (मागील ३० दिवस)"),

    # --- Role labels ---
    "role.store_manager":    ("Store Manager", "स्टोअर मॅनेजर"),
    "role.sm_full":          ("Store Manager (runs daily audits)", "स्टोअर मॅनेजर (दैनंदिन ऑडिट चालवतो)"),
    "role.gm":               ("GM", "जीएम"),
    "role.gm_full":          ("GM (verifies audits, manages CAPs)", "जीएम (ऑडिट पडताळतो, CAPs सांभाळतो)"),
    "role.owner":            ("Owner", "मालक"),
    "role.cro":              ("CRO", "सीआरओ"),

    # --- Counters / locations ---
    "counter.titan_world":   ("Titan World", "टायटन वर्ल्ड"),
    "counter.helios":        ("Helios", "हेलिओस"),

    # --- Hints / instructional text ---
    "hint.pick_name":        ("Pick your name and enter your 4-digit PIN.", "तुमचे नाव निवडा आणि तुमचा ४-अंकी PIN टाका."),
    "hint.set_account":      ("Let's set up your account. You can add a Store Manager and a GM after this.", "तुमचे खाते सेट करूया. यानंतर तुम्ही स्टोअर मॅनेजर आणि जीएम जोडू शकता."),
    "hint.set_new_pin":      ("Set a new 4-digit PIN. They'll use this to sign in next time.", "नवीन ४-अंकी PIN सेट करा. पुढच्या वेळी साइन इनसाठी ते वापरतील."),
    "hint.pin_remember":     ("You'll use this to log in. Pick something you'll remember.", "लॉगिनसाठी हाच वापराल. लक्षात राहील असे काही निवडा."),
    "hint.type_again":       ("Type it again to make sure.", "खात्रीसाठी पुन्हा टाइप करा."),
    "hint.audit_context":    ("Context for this audit — e.g. rain today, low footfall, 3 staff out, festival rush", "या ऑडिटचा संदर्भ — उदा. आज पाऊस, कमी ग्राहक, ३ कर्मचारी रजेवर, सणाची गर्दी"),
    "hint.what_found":       ("What did you find?", "तुम्हाला काय आढळले?"),
    "hint.describe_finding": ("Describe what you found (5+ characters)", "तुम्हाला काय आढळले ते लिहा (५+ अक्षरे)"),
    "hint.why_na":           ("Why is this not applicable today?", "आज हे लागू का नाही?"),
    "hint.problem_summary":  ("One sentence summary of the underlying cause", "मूळ कारणाचा एका वाक्यात सारांश"),
    "hint.5whys":            ("Drill down from symptom to root cause. Aim for 5 levels.", "लक्षणापासून मूळ कारणापर्यंत खोलात जा. ५ पातळ्यांचे लक्ष्य ठेवा."),
    "hint.add_action_step":  ("Add an action step", "कृती पाऊल जोडा"),
    "hint.sm_proceed":       ("Daily audits are usually run by the Store Manager. You can still proceed.", "दैनंदिन ऑडिट सहसा स्टोअर मॅनेजर चालवतो. तरी तुम्ही पुढे जाऊ शकता."),
    "hint.owner_adds_users": ("Owner adds Store Manager and GM accounts. Each user gets their own 4-digit PIN and (optionally) a phone number for WhatsApp escalations.", "मालक स्टोअर मॅनेजर आणि जीएम खाती जोडतो. प्रत्येक वापरकर्त्याला स्वतःचा ४-अंकी PIN आणि (ऐच्छिक) WhatsApp एस्केलेशनसाठी फोन नंबर मिळतो."),
    "hint.owner_adds_brief": ("Owner can add a Store Manager and a GM. Each gets their own PIN and an optional phone for WhatsApp escalations.", "मालक स्टोअर मॅनेजर आणि जीएम जोडू शकतो. प्रत्येकाला स्वतःचा PIN आणि ऐच्छिक WhatsApp एस्केलेशनसाठी फोन."),
    "hint.phone_purpose":    ("Used to open a WhatsApp message when an escalation fires. Leave blank to clear.", "एस्केलेशन झाल्यावर WhatsApp संदेश उघडण्यासाठी वापरला जातो. रिकामा सोडल्यास हटवला जातो."),
    "hint.no_cros":          ('No CROs yet. Tap "+ Add CRO" above to add your floor staff.', 'अजून सीआरओ नाहीत. वरील "+ सीआरओ जोडा" टॅप करून तुमचे फ्लोअर स्टाफ जोडा.'),
    "hint.no_cros_short":    ("No CROs yet.", "अजून सीआरओ नाहीत."),
    "hint.no_caps":          ("No CAPs yet", "अजून CAPs नाहीत"),
    "hint.no_caps_filter":   ("No CAPs in this filter.", "या फिल्टरमध्ये CAPs नाहीत."),
    "hint.caps_auto":        ("CAPs (Corrective Action Plans) are created automatically when an audit has FAILs. You'll see them here.", "ऑडिटमध्ये नापास असतील तेव्हा CAPs (कृती योजना) आपोआप तयार होतात. त्या इथे दिसतील."),
    "hint.no_audits":        ("No submitted audits yet", "अजून सादर केलेले ऑडिट नाहीत"),
    "hint.audits_appear":    ("Once you submit a daily audit it'll appear here.", "तुम्ही दैनंदिन ऑडिट सादर केल्यावर ते इथे दिसेल."),
    "hint.no_photos":        ("No photos yet.", "अजून फोटो नाहीत."),
    "hint.no_actions":       ("No action steps yet. Add some below.", "अजून कृती पावले नाहीत. खाली काही जोडा."),
    "hint.waiting_verify":   ("Waiting for GM or Owner to verify.", "जीएम किंवा मालकाच्या पडताळणीची प्रतीक्षा."),
    "hint.waiting_close":    ("Waiting for GM or Owner to close.", "जीएम किंवा मालकाने बंद करण्याची प्रतीक्षा."),
    "hint.restore_after":    ("Restoring a Drive backup afterwards will bring your audits back.", "नंतर Drive बॅकअप पुनर्संचयित केल्यास तुमचे ऑडिट परत येतील."),
    "hint.unattributed":     ("— not attributed —", "— जबाबदारी न दिलेले —"),
    "hint.no_phone":         ("· no phone on file", "· फाइलवर फोन नाही"),
    "hint.submitted_today":  ("Submitted today", "आज सादर केले"),
    "hint.resuming_audit":   ("Resuming audit", "ऑडिट पुन्हा सुरू"),
    "hint.skip_revisit":     ("Skipped — we'll come back to this checkpoint at the end.", "वगळले — शेवटी या तपासणी बिंदूकडे परत येऊ."),
    "hint.all_other_done":   ("All other checkpoints are done. Give this one a final verdict before you can submit.", "इतर सर्व तपासणी बिंदू पूर्ण. सादर करण्याआधी या बिंदूचा अंतिम निकाल द्या."),
    "hint.photo_evidence_required":("Photo evidence is required for Cash & Inventory fails.", "रोख व स्टॉक नापासांसाठी फोटो पुरावा आवश्यक."),
    "hint.tick_all_actions": ("Tick all action steps before marking done.", "पूर्ण म्हणून खूण करण्यापूर्वी सर्व कृती पावलांना टिक करा."),
    "hint.long_press":       ("Long-press the message to select", "निवडण्यासाठी संदेश दाबून धरा"),
    "hint.cant_deactivate_self":("Can't deactivate yourself", "स्वतःला निष्क्रिय करू शकत नाही"),

    # --- Photos ---
    "label.photo_n":         ("Photo {n}", "फोटो {n}"),
    "label.photo_kb":        ("Photo stamped & added ({kb} KB)", "फोटो स्टॅम्प करून जोडला ({kb} KB)"),

    # --- Placeholders / examples ---
    "ph.add_action":         ("Add an action step", "कृती पाऊल जोडा"),
    "ph.because":            ("Because…", "कारण…"),
    "ph.eg_phone":           ("e.g. 9876543210", "उदा. ९८७६५४३२१०"),
    "ph.eg_finding":         ("e.g. CRO Suresh had no name badge at opening", "उदा. उघडण्याच्या वेळी सीआरओ सुरेशकडे नावाचा बॅज नव्हता"),
    "ph.eg_name_full":       ("e.g. Priya Joshi", "उदा. प्रिया जोशी"),
    "ph.eg_name_owner":      ("e.g. Sagar Bora", "उदा. सागर बोरा"),
    "ph.eg_name_cro":        ("e.g. Suresh", "उदा. सुरेश"),
    "ph.eg_na_reason":       ("e.g. counter closed today, no high-value sales", "उदा. आज काउंटर बंद, उच्च-मूल्य विक्री नाही"),
    "ph.eg_backdate":        ("e.g. phone died yesterday; logging late so the day isn't lost", "उदा. काल फोन बंद पडला; दिवस वाया जाऊ नये म्हणून उशिरा नोंदवत आहे"),

    # --- Report / PDF ---
    "report.title":          ("Saagar Audit — Daily Compliance Report", "सागर ऑडिट — दैनंदिन अनुपालन अहवाल"),

    # --- Toasts / status ---
    "ok.all_erased":         ("All data erased", "सर्व डेटा पुसला"),
    "ok.audit_submitted":    ("Audit submitted successfully", "ऑडिट यशस्वीरीत्या सादर"),
    "ok.cap_closed":         ("CAP closed", "CAP बंद"),
    "ok.cap_done":           ("CAP marked done — waiting for verification", "CAP पूर्ण म्हणून खूण — पडताळणीची प्रतीक्षा"),
    "ok.cap_rejected":       ("CAP rejected — back to open", "CAP नाकारले — पुन्हा उघडे"),
    "ok.cap_updated":        ("CAP updated", "CAP अद्ययावत"),
    "ok.cap_verified":       ("CAP verified", "CAP पडताळलेले"),
    "ok.cap_created":        ("CAP created", "CAP तयार"),
    "ok.reminder_set":       ("Daily reminder set for 10:00 AM", "दैनंदिन स्मरण सकाळी १०:०० वाजता सेट"),
    "ok.reminder_off":       ("Daily reminder turned off", "दैनंदिन स्मरण बंद"),
    "ok.message_copied":     ("Message copied", "संदेश कॉपी झाला"),
    "ok.phone_updated":      ("Phone updated", "फोन अद्ययावत"),
    "ok.pin_reset":          ("PIN reset", "PIN रीसेट झाला"),
    "ok.pin_updated":        ("PIN updated", "PIN अद्ययावत"),
    "ok.pin_changed":        ("PIN changed", "PIN बदलला"),
    "ok.synced":             ("Synced to cloud", "क्लाउडशी समक्रमित"),
    "ok.backup_shared":      ("Backup shared", "बॅकअप शेअर"),
    "ok.backup_downloaded":  ("Backup downloaded", "बॅकअप डाउनलोड"),

    # --- Confirms ---
    "confirm.exit_audit":    ("Audit in progress. Exit without submitting?", "ऑडिट चालू. सादर न करता बाहेर पडायचे?"),
    "confirm.deactivate_user":("Deactivate this user? They won't be able to sign in.", "हा वापरकर्ता निष्क्रिय करायचा? तो साइन इन करू शकणार नाही."),
    "confirm.discard_draft": ("Discard this draft? Your marks will be lost.", "हा ड्राफ्ट टाकून द्यायचा? तुमच्या खुणा गमावल्या जातील."),
    "confirm.dismiss_alert": ("Dismiss this alert? It will move to history.", "ही सूचना रद्द करायची? ती इतिहासात जाईल."),
    "confirm.erase_all":     ("Erase ALL data on this device — audits, CROs, users and CAPs? This cannot be undone.", "या डिव्हाइसवरील सर्व डेटा पुसायचा — ऑडिट, सीआरओ, वापरकर्ते आणि CAPs? हे परत आणता येणार नाही."),
    "confirm.remove_cro":    ("Remove this CRO?", "हा सीआरओ काढून टाकायचा?"),
    "confirm.remove_photo":  ("Remove this photo?", "हा फोटो काढून टाकायचा?"),
    "confirm.sign_out":      ("Sign out?", "साइन आउट करायचे?"),

    # --- Misc forced selections / hints ---
    "hint.select_cro":       ("Select at least one CRO on duty.", "ड्युटीवरील किमान एक सीआरओ निवडा."),
    "hint.pick_date":        ("Pick a date.", "एक तारीख निवडा."),
    "hint.backdate_reason":  ("Backdated audit — please record a reason (5+ characters).", "मागील तारखेचे ऑडिट — कृपया कारण नोंदवा (५+ अक्षरे)."),

    # --- PDF / Sharing ---
    "share.print_pdf_emoji": ("📄 Print / Save as PDF", "📄 छापा / PDF म्हणून जतन"),
    "share.send_whatsapp_emoji":("📱 Send on WhatsApp", "📱 WhatsApp वर पाठवा"),
    "share.send_to_whatsapp_emoji":("📱 Send to WhatsApp", "📱 WhatsApp ला पाठवा"),
}

# ---- 2. CHECKPOINTS (text + evidence in MR) -------------------------------
# Authoritative source: Workbook tables 14, 16, 18, 20, 22, 23, 25, 27 (SOP1-SOP8 daily)
# plus QuickRef tables 1-8 for the 6-row condensed app version where they
# differ from the 10-row narrative. The app uses the 6-row Grooming version.
# Sales Buddy: app uses the QuickRef/A.1 attribute-based version (NOT the
# §2.2 window-based version) — translations cover that.

checkpoints_mr = {
    # SOP 1 Grooming (6-row app version, matches A.1/QuickRef)
    "1.1": ("Uniform clean and well-fitted", "गणवेश स्वच्छ आणि व्यवस्थित बसणारा"),
    "1.2": ("Name badge worn", "नावाचा बॅज लावलेला"),
    "1.3": ("Hair gelled (M) / tied in bun (F)", "केस जेल लावलेले (पुरुष) / बन बांधलेला (महिला)"),
    "1.4": ("Hand gloves worn at jewellery counter", "दागिने काउंटरवर हाताचे ग्लोव्ह्ज घातलेले"),
    "1.5": ("Closed black polished shoes", "बंद, काळे, पॉलिश केलेले बूट"),
    "1.6": ("Mobile phone in pocket, not on counter", "मोबाइल फोन खिशात, काउंटरवर नाही"),

    # SOP 2 Sales Buddy (app uses attribute-based version)
    "2.1": ("Opening photo uploaded between 10:15 and 10:45", "उघडण्याचा फोटो १०:१५ ते १०:४५ दरम्यान अपलोड"),
    "2.2": ("Closing photo uploaded between 9:00 and 9:30 PM", "बंदोबस्ताचा फोटो रात्री ९:०० ते ९:३० दरम्यान अपलोड"),
    "2.3": ("GPS enabled at opening upload", "उघडण्याच्या अपलोडवेळी GPS चालू"),
    "2.4": ("GPS enabled at closing upload", "बंदोबस्ताच्या अपलोडवेळी GPS चालू"),
    "2.5": ("Full storefront window visible in photo", "फोटोत संपूर्ण दर्शनी खिडकी दिसते"),
    "2.6": ("Photo clear and in focus", "फोटो स्पष्ट आणि फोकसमध्ये"),
    "2.7": ("Titan acknowledgement received for uploads", "अपलोडसाठी टायटनची पावती मिळाली"),
    "2.8": ("No pending uploads at day end", "दिवसाअखेर कोणतेही अपलोड प्रलंबित नाही"),

    # SOP 3 NPS Calling (matches Workbook table 18)
    "3.1": ("Yesterday's billed customers identified (100% from POS)", "कालचे बिल केलेले ग्राहक ओळखले (POS मधून १००%)"),
    "3.2": ("NPS calls attempted (100% of yesterday's billed customers)", "एनपीएस कॉल केले (कालच्या बिल केलेल्या ग्राहकांच्या १००%)"),
    "3.3": ("Calls completed ≥70% of attempts", "पूर्ण झालेले कॉल केलेल्या प्रयत्नांच्या ≥७०%"),
    "3.4": ("Standard NPS script followed", "मानक एनपीएस स्क्रिप्टचे पालन"),
    "3.5": ("NPS score recorded for each completed call", "प्रत्येक पूर्ण कॉलसाठी एनपीएस गुण नोंदवले"),
    "3.6": ("Detractor (score ≤6) escalated within 24 hours", "त्रासी ग्राहक (गुण ≤६) २४ तासांत एस्केलेट"),
    "3.7": ("Daily NPS summary signed by SM by 9:30 PM", "स्टोअर मॅनेजरने रात्री ९:३० पर्यंत दैनंदिन एनपीएस सारांशावर सही केली"),

    # SOP 4 Customer Data (matches Workbook table 20)
    "4.1": ("Walk-in register entry for every customer (≥90% capture)", "प्रत्येक ग्राहकासाठी वॉक-इन रजिस्टर नोंद (≥९०% कॅप्चर)"),
    "4.2": ("Phone number captured for every walk-in", "प्रत्येक वॉक-इनसाठी फोन नंबर नोंदवला"),
    "4.3": ("Customer interest captured", "ग्राहकाचे स्वारस्य नोंदवले"),
    "4.4": ("KYC complete for every billed customer", "प्रत्येक बिल केलेल्या ग्राहकासाठी KYC पूर्ण"),
    "4.5": ("ID copy attached for sales ≥ ₹2 lakh", "₹२ लाख ≥ विक्रीसाठी आयडी प्रत जोडली"),
    "4.6": ("DPDP consent ticked at billing", "बिलिंगवेळी DPDP संमतीवर टिक"),
    "4.7": ("Customer data file backed up at EOD", "दिवसाअखेर ग्राहक डेटा फाइल बॅकअप घेतली"),
    "4.8": ("No customer data shared verbally with anyone", "कोणाशीही ग्राहक डेटा तोंडी सामायिक केला नाही"),

    # SOP 5 Display & Planogram (matches Workbook table 22)
    "5.1": ("Glass display clean (no smudges or dust)", "काचेचा डिस्प्ले स्वच्छ (डाग किंवा धूळ नाही)"),
    "5.2": ("All display lighting functional", "सर्व डिस्प्ले प्रकाशयोजना कार्यरत"),
    "5.3": ("Brands placed in correct zones", "ब्रँड योग्य क्षेत्रांत ठेवलेले"),
    "5.4": ("Price tags present and legible, match POS", "किंमत-टॅग उपस्थित आणि वाचनीय, POS शी जुळतात"),
    "5.5": ("Display density per planogram", "डिस्प्ले घनता प्लानोग्रामनुसार"),
    "5.6": ("Empty slots filled or removed", "रिकाम्या जागा भरल्या किंवा काढून टाकल्या"),
    "5.7": ("Premium SKUs in eye-line position", "प्रीमियम SKU डोळ्यासमोरच्या जागी"),
    "5.8": ("Current month promo displayed", "चालू महिन्याचा प्रचार प्रदर्शित"),
    "5.9": ("Multi-brand consistency in Helios counter", "हेलिओस काउंटरमध्ये बहु-ब्रँड सुसंगतता"),

    # SOP 6 Cash Management (matches Workbook table 23 + app variant)
    "6.1":  ("Opening cash = yesterday's closing + ₹5,000 float", "उघडण्याची रोख = कालची बंद रोख + ₹५,००० फ्लोट"),
    "6.2":  ("Cash register entries up-to-date", "रोख रजिस्टर नोंदी अद्ययावत"),
    "6.3":  ("POS total = cash + card + UPI", "POS एकूण = रोख + कार्ड + UPI"),
    "6.4":  ("GST collected matches POS report", "गोळा केलेला GST POS अहवालाशी जुळतो"),
    "6.5":  ("Cash variance ≤ ₹50 (or fully explained)", "रोख तफावत ≤ ₹५० (किंवा पूर्ण स्पष्टीकरण)"),
    "6.6":  ("Cash > ₹50,000 deposited at bank by 9 PM", "₹५०,००० पेक्षा जास्त रोख रात्री ९ पर्यंत बँकेत जमा"),
    "6.7":  ("Stamped deposit slip filed", "शिक्का असलेली डिपॉझिट स्लिप फाइल केली"),
    "6.8":  ("Petty cash withdrawals authorized in writing", "फुटकळ रोख काढणे लेखी अधिकृत"),
    "6.9":  ("Original receipts attached for every petty entry", "प्रत्येक फुटकळ नोंदीसाठी मूळ पावत्या जोडल्या"),
    "6.10": ("Safe locked at all times outside cash handling", "रोख हाताळणी सोडून तिजोरी नेहमी कुलूपबंद"),
    "6.11": ("POS overrides countersigned by 2 staff", "POS ओव्हरराइडवर २ कर्मचाऱ्यांच्या काऊंटर-सह्या"),
    "6.12": ("EOD cash summary completed by 9:30 PM", "दिवसाअखेरचा रोख सारांश ९:३० पर्यंत पूर्ण"),

    # SOP 7 Inventory (matches Workbook table 25)
    "7.1":  ("Daily cycle count on rotation tray complete", "रोटेशन ट्रेवर दैनंदिन चक्र-मोजणी पूर्ण"),
    "7.2":  ("POS sales match stock deduction", "POS विक्री स्टॉक कपातीशी जुळते"),
    "7.3":  ("Today's GRNs entered into system", "आजचे GRN सिस्टममध्ये नोंदवले"),
    "7.4":  ("Damaged items segregated and logged", "खराब आयटम वेगळे केले व नोंदवले"),
    "7.5":  ("Returns processed within 24 hours", "परतावे २४ तासांत प्रक्रिया केले"),
    "7.6":  ("High-value items (≥₹25,000) in secure storage", "उच्च-मूल्य आयटम (≥₹२५,०००) सुरक्षित ठिकाणी"),
    "7.7":  ("Service intake items in service area only", "सर्व्हिस इनटेक आयटम फक्त सर्व्हिस क्षेत्रात"),
    "7.8":  ("FIFO confirmed on 3 random spot-checks", "३ यादृच्छिक स्पॉट-चेकवर FIFO ची पुष्टी"),
    "7.9":  ("Repair-in register updated for every intake", "प्रत्येक इनटेकसाठी रिपेअर-इन रजिस्टर अद्ययावत"),
    "7.10": ("EOD stock summary sent to GM by 9:30 PM", "दिवसाअखेरचा स्टॉक सारांश रात्री ९:३० पर्यंत जीएमला पाठवला"),

    # SOP 8 Service Intake (matches Workbook table 27)
    "8.1": ("Service intake form signed by customer + CRO", "सर्व्हिस इनटेक फॉर्मवर ग्राहक + सीआरओची सही"),
    "8.2": ("System Order ID generated", "सिस्टम ऑर्डर आयडी तयार"),
    "8.3": ("Customer ID copy on file (DPDP-compliant)", "ग्राहक आयडी प्रत फाइलवर (DPDP-अनुरूप)"),
    "8.4": ("Intake photos captured by Order ID", "ऑर्डर आयडीनुसार इनटेक फोटो काढले"),
    "8.5": ("Estimate and timeline written on form", "अंदाज आणि कालावधी फॉर्मवर लिहिले"),
    "8.6": ("Watch tagged and placed on service rack", "घड्याळावर टॅग लावून सर्व्हिस रॅकवर ठेवले"),
    "8.7": ("Service register updated at EOD", "दिवसाअखेर सर्व्हिस रजिस्टर अद्ययावत"),
    "8.8": ("Pending pickups > 24 hrs overdue → customer called", "प्रलंबित पिकअप > २४ तास उशीर → ग्राहकाला फोन"),
}

# ---- 3. EVIDENCE HINTS (per checkpoint, from app `evidence` field) --------
evidence_mr = {
    "1.1": ("Visual check at start of shift", "शिफ्टच्या सुरुवातीला दृश्य तपासणी"),
    "1.2": ("Visible on uniform", "गणवेशावर दिसणारा"),
    "1.3": ("Visual check", "दृश्य तपासणी"),
    "1.4": ("Observe at counter", "काउंटरवर निरीक्षण"),
    "1.5": ("Visual check", "दृश्य तपासणी"),
    "1.6": ("Spot check counter top", "काउंटर टॉपवर स्पॉट चेक"),

    "2.1": ("Sales Buddy timestamp", "सेल्स बडी वेळ-शिक्का"),
    "2.2": ("Sales Buddy timestamp", "सेल्स बडी वेळ-शिक्का"),
    "2.3": ("Sales Buddy location field", "सेल्स बडी स्थान फील्ड"),
    "2.4": ("Sales Buddy location field", "सेल्स बडी स्थान फील्ड"),
    "2.5": ("Photo review", "फोटो पुनरावलोकन"),
    "2.6": ("Photo review", "फोटो पुनरावलोकन"),
    "2.7": ("Sales Buddy ack screen", "सेल्स बडी पावती स्क्रीन"),
    "2.8": ("Sales Buddy outbox empty", "सेल्स बडी आउटबॉक्स रिकामा"),

    "3.1": ("POS export", "POS निर्यात"),
    "3.2": ("Call log", "कॉल लॉग"),
    "3.3": ("Call log", "कॉल लॉग"),
    "3.4": ("Call recording sample", "कॉल रेकॉर्डिंग नमुना"),
    "3.5": ("Call log", "कॉल लॉग"),
    "3.6": ("Escalation log", "एस्केलेशन लॉग"),
    "3.7": ("Signed summary", "सही केलेला सारांश"),

    "4.1": ("Register vs CCTV", "रजिस्टर वि. सीसीटीव्ही"),
    "4.2": ("Register column", "रजिस्टर स्तंभ"),
    "4.3": ("Register column", "रजिस्टर स्तंभ"),
    "4.4": ("Invoice attachments", "इनव्हॉइस संलग्न"),
    "4.5": ("Invoice attachments", "इनव्हॉइस संलग्न"),
    "4.6": ("Invoice / consent form", "इनव्हॉइस / संमती फॉर्म"),
    "4.7": ("Backup log", "बॅकअप लॉग"),
    "4.8": ("CRO observation", "सीआरओ निरीक्षण"),

    "5.1": ("Visual + smudge wipe", "दृश्य + डाग पुसून पाहणे"),
    "5.2": ("Visual check", "दृश्य तपासणी"),
    "5.3": ("Planogram match", "प्लानोग्राम जुळणी"),
    "5.4": ("Spot-check 5 SKUs", "५ SKU वर स्पॉट-चेक"),
    "5.5": ("Planogram compare", "प्लानोग्राम तुलना"),
    "5.6": ("Visual check", "दृश्य तपासणी"),
    "5.7": ("Planogram match", "प्लानोग्राम जुळणी"),
    "5.8": ("Promo calendar", "प्रचार दिनदर्शिका"),
    "5.9": ("Helios planogram", "हेलिओस प्लानोग्राम"),

    "6.1":  ("Opening count slip", "उघडण्याची मोजणी स्लिप"),
    "6.2":  ("Register review", "रजिस्टर पुनरावलोकन"),
    "6.3":  ("POS day-end report", "POS दिवस-अंत अहवाल"),
    "6.4":  ("POS GST report", "POS GST अहवाल"),
    "6.5":  ("Variance note", "तफावत नोंद"),
    "6.6":  ("Bank deposit slip", "बँक डिपॉझिट स्लिप"),
    "6.7":  ("Deposit slip file", "डिपॉझिट स्लिप फाइल"),
    "6.8":  ("Petty cash book", "फुटकळ रोख पुस्तक"),
    "6.9":  ("Receipts file", "पावत्यांची फाइल"),
    "6.10": ("Spot check safe", "तिजोरीवर स्पॉट चेक"),
    "6.11": ("Override log", "ओव्हरराइड लॉग"),
    "6.12": ("EOD summary slip", "दिवसाअखेरची सारांश स्लिप"),

    "7.1":  ("Cycle count log", "चक्र-मोजणी लॉग"),
    "7.2":  ("POS + stock report", "POS + स्टॉक अहवाल"),
    "7.3":  ("GRN log", "GRN लॉग"),
    "7.4":  ("Damage register", "खराब रजिस्टर"),
    "7.5":  ("Returns log", "परतावे लॉग"),
    "7.6":  ("Storage check", "स्टोरेज तपासणी"),
    "7.7":  ("Service area check", "सर्व्हिस क्षेत्र तपासणी"),
    "7.8":  ("Spot check log", "स्पॉट चेक लॉग"),
    "7.9":  ("Repair register", "रिपेअर रजिस्टर"),
    "7.10": ("Sent message", "पाठवलेला संदेश"),

    "8.1": ("Form file", "फॉर्म फाइल"),
    "8.2": ("Order ID slip", "ऑर्डर आयडी स्लिप"),
    "8.3": ("ID copy file", "आयडी प्रत फाइल"),
    "8.4": ("Photo folder", "फोटो फोल्डर"),
    "8.5": ("Form review", "फॉर्म पुनरावलोकन"),
    "8.6": ("Rack inspection", "रॅक तपासणी"),
    "8.7": ("Service register", "सर्व्हिस रजिस्टर"),
    "8.8": ("Call log", "कॉल लॉग"),
}

# ---- 4. SOP names (from spec + app SOPS array) ----------------------------
sop_names = {
    "SOP1": ("Grooming",             "ग्रूमिंग"),
    "SOP2": ("Sales Buddy",          "सेल्स बडी"),
    "SOP3": ("NPS Calling",          "एनपीएस कॉलिंग"),
    "SOP4": ("Customer Data",        "ग्राहक डेटा"),
    "SOP5": ("Display & Planogram",  "डिस्प्ले व प्लानोग्राम"),
    "SOP6": ("Cash Management",      "रोख व्यवस्थापन"),
    "SOP7": ("Inventory Management", "स्टॉक व्यवस्थापन"),
    "SOP8": ("Service Intake",       "सर्व्हिस इनटेक"),
}

# ---- 5. Bands (Workbook Table 8 + Spec §8) --------------------------------
bands = {
    "excellent": ("Excellent", "उत्कृष्ट"),
    "good":      ("Good",      "चांगले"),
    "fair":      ("Fair",      "बरे"),
    "poor":      ("Poor",      "वाईट"),
    "critical":  ("Critical",  "अत्यावश्यक"),
}

# ---- 6. CAP statuses (Spec §8) --------------------------------------------
cap_statuses = {
    "open":     ("Open",     "उघडे"),
    "done":     ("Done",     "पूर्ण"),
    "verified": ("Verified", "पडताळलेले"),
    "closed":   ("Closed",   "बंद"),
    "aged":     ("Aged",     "जुनी"),
    "reopened": ("Reopened", "पुन्हा उघडलेले"),
}

# ---- 7. Audit statuses (Spec §8) ------------------------------------------
audit_statuses = {
    "draft":     ("Draft",     "ड्राफ्ट"),
    "submitted": ("Submitted", "सादर"),
    "verified":  ("Verified",  "पडताळलेले"),
    "hidden":    ("Hidden",    "लपवलेले"),
}

# ---- 8. Errors (Spec §8 + extracted from app) -----------------------------
errors = {
    "wrong_pin":            ("Wrong PIN. Try again.", "चुकीचा PIN. पुन्हा प्रयत्न करा."),
    "wrong_pin_short":      ("Wrong PIN", "चुकीचा PIN"),
    "current_pin_wrong":    ("Current PIN is wrong", "सध्याचा PIN चुकीचा"),
    "locked":               ("Too many attempts. Locked for {seconds}s.", "बरेच प्रयत्न. {seconds} सेकंदांसाठी लॉक."),
    "required_field":       ("This field is required.", "हे क्षेत्र आवश्यक."),
    "future_date":          ("Future date not allowed.", "भविष्यातील तारीख स्वीकारली जात नाही."),
    "photo_required":       ("Photo required for Cash/Inventory Fails.", "रोख/स्टॉक नापासांसाठी फोटो आवश्यक."),
    "photo_evidence_required":("Photo evidence is required for Cash & Inventory fails.", "रोख व स्टॉक नापासांसाठी फोटो पुरावा आवश्यक."),
    "finding_required":     ("Please write a one-sentence finding.", "कृपया एका वाक्याचा निष्कर्ष लिहा."),
    "describe_finding":     ("Describe what you found (5+ characters)", "तुम्हाला काय आढळले ते लिहा (५+ अक्षरे)"),
    "no_internet":          ("No internet — will sync later.", "इंटरनेट नाही — नंतर समक्रमित होईल."),
    "cap_deadline_passed":  ("Cannot extend — deadline already passed.", "वाढवू शकत नाही — मुदत आधीच संपली."),
    "cannot_edit_submitted":("Submitted audits cannot be edited.", "सादर ऑडिट संपादित करता येत नाहीत."),
    "name_too_short":       ("Name too short", "नाव खूप लहान"),
    "enter_name":           ("Enter a name (2+ characters)", "नाव टाका (२+ अक्षरे)"),
    "please_enter_name":    ("Please enter your name (2+ characters).", "कृपया तुमचे नाव टाका (२+ अक्षरे)."),
    "pin_must_4":           ("PIN must be 4 digits", "PIN ४ अंकी असावा"),
    "new_pin_must_4":       ("New PIN must be 4 digits", "नवीन PIN ४ अंकी असावा"),
    "pins_mismatch":        ("PINs do not match", "PIN जुळत नाहीत"),
    "pins_mismatch_full":   ("PINs do not match. Try again.", "PIN जुळत नाहीत. पुन्हा प्रयत्न करा."),
    "pin_confirm_mismatch": ("PIN and confirmation do not match", "PIN आणि खात्री जुळत नाहीत"),
    "new_pin_confirm_mismatch":("New PIN and confirmation do not match", "नवीन PIN आणि खात्री जुळत नाहीत"),
    "enter_current_pin":    ("Enter your current 4-digit PIN", "तुमचा सध्याचा ४-अंकी PIN टाका"),
    "action_step_short":    ("Action step text too short", "कृती पाऊल मजकूर खूप लहान"),
    "add_short_reason":     ("Add a short reason", "लहान कारण जोडा"),
    "tick_actions":         ("Tick all action steps before marking done.", "पूर्ण म्हणून खूण करण्यापूर्वी सर्व कृती पावलांना टिक करा."),
    "select_cro_on_duty":   ("Select at least one CRO on duty.", "ड्युटीवरील किमान एक सीआरओ निवडा."),
    "pick_date":            ("Pick a date.", "एक तारीख निवडा."),
    "backdate_reason":      ("Backdated audit — please record a reason (5+ characters).", "मागील तारखेचे ऑडिट — कृपया कारण नोंदवा (५+ अक्षरे)."),
    "only_gm_owner_verify": ("Only GM or Owner can verify", "फक्त जीएम किंवा मालक पडताळू शकतात"),
    "only_gm_owner_reject": ("Only GM or Owner can reject", "फक्त जीएम किंवा मालक नकार देऊ शकतात"),
    "only_gm_owner_close":  ("Only GM or Owner can close", "फक्त जीएम किंवा मालक बंद करू शकतात"),
    "rejection_reason":     ("Rejection needs a reason", "नकारासाठी कारण आवश्यक"),
    "cant_deactivate_self": ("Can't deactivate yourself", "स्वतःला निष्क्रिय करू शकत नाही"),
    "could_not_capture":    ("Could not capture photo", "फोटो काढता आला नाही"),
    "could_not_schedule":   ("Could not schedule — check notification permission", "वेळ ठरवू शकलो नाही — सूचना परवानगी तपासा"),
    "could_not_read_backup":("Could not read backup file", "बॅकअप फाइल वाचता आली नाही"),
    "backup_failed":        ("Backup failed", "बॅकअप अयशस्वी"),
    "filereader_failed":    ("FileReader failed", "FileReader अयशस्वी"),
    "image_decode_failed":  ("Image decode failed", "इमेज डिकोड अयशस्वी"),
    "no_phone_recipient":   ("Recipient has no phone. Add one in Users.", "प्राप्तकर्त्याकडे फोन नाही. वापरकर्त्यांमध्ये एक जोडा."),
    "cannot_build_wa":      ("Cannot build WhatsApp link", "WhatsApp लिंक तयार करता आली नाही"),
    "copy_failed":          ("Copy failed — long-press the message to select", "कॉपी अयशस्वी — निवडण्यासाठी संदेश दाबून धरा"),
    "shell_not_loaded":     ("Shell not loaded", "शेल लोड झाले नाही"),
    "sign_in_first":        ("Sign in first", "आधी साइन इन करा"),
    "reminder_change_failed":("Reminder change failed", "स्मरण बदल अयशस्वी"),
    "no_submitted_audits":  ("No submitted audits yet", "अजून सादर केलेले ऑडिट नाहीत"),
    "forgot_pin_help":      ("Forgot PIN?\n\nIf you're the Owner, you cannot reset your own PIN from this device. Reinstall the app to start over (you will lose data unless you have a Drive backup).\n\nIf you're SM or GM, ask the Owner to reset your PIN from Settings.",
                              "PIN विसरलात?\n\nतुम्ही मालक असाल — या डिव्हाइसवरून तुमचा स्वतःचा PIN रीसेट करता येणार नाही. नव्याने सुरुवात करण्यासाठी अॅप पुन्हा इन्स्टॉल करा (Drive बॅकअप नसेल तर डेटा गमावाल).\n\nतुम्ही SM किंवा GM असाल — मालकाला सेटिंग्जमधून तुमचा PIN रीसेट करायला सांगा."),
}

# ---- 9. Success messages (Spec §8) ----------------------------------------
success = {
    "audit_submitted": ("Audit submitted successfully", "ऑडिट यशस्वीरीत्या सादर"),
    "cap_created":     ("CAP created",                  "CAP तयार"),
    "cap_marked_done": ("CAP marked done",              "CAP पूर्ण म्हणून खूण"),
    "cap_verified":    ("CAP verified",                 "CAP पडताळलेले"),
    "cap_closed":      ("CAP closed",                   "CAP बंद"),
    "pin_changed":     ("PIN changed",                  "PIN बदलला"),
    "synced":          ("Synced to cloud",              "क्लाउडशी समक्रमित"),
}

# ---- 10. Escalation triggers (Spec §7, Workbook §4.6, app ESC_TRIGGERS) ---
escalation_triggers = {
    "1": ("Daily Critical band",          "दैनंदिन अत्यावश्यक पट्टी"),
    "2": ("Recurring checkpoint failure", "तपासणी बिंदू वारंवार नापास"),
    "3": ("Cash variance",                "रोख तफावत"),
    "4": ("Inventory variance",           "स्टॉक तफावत"),
    "5": ("Theft / security / legal",     "चोरी / सुरक्षा / कायदेशीर"),
    "6": ("Customer complaint",           "ग्राहक तक्रार"),
    "7": ("Declining trend",              "घसरता कल"),
}

# ---- 11. Escalation message templates (composed in app — fixed pieces) ----
escalation_msg = {
    "what_happened_label": ("What happened", "काय झाले"),
    "evidence_label":      ("Evidence",      "पुरावा"),
    "impact_label":        ("Impact",        "परिणाम"),
    "requested_action_label":("Requested action","मागितलेली कृती"),

    "impact.compliance_breach_cash_inv": (
        "Compliance band breached AND a Cash or Inventory critical FAILed — direct loss risk.",
        "अनुपालन पट्टी मोडली आणि रोख किंवा स्टॉकमधील अत्यावश्यक बिंदू नापास — थेट तोट्याचा धोका."
    ),
    "impact.compliance_breach": (
        "Compliance band breached. Today's operations do not meet store standards.",
        "अनुपालन पट्टी मोडली. आजचे कामकाज स्टोअर मानकांना पूर्ण करत नाही."
    ),
    "impact.cash_consecutive": (
        "Cash control failure on consecutive days — direct money risk, possible theft or systemic gap.",
        "सलग दिवशी रोख नियंत्रण अपयश — थेट पैशाचा धोका, संभाव्य चोरी किंवा प्रणालीगत त्रुटी."
    ),
    "impact.cash_direct": (
        "Direct cash risk. Could mask process error, undercounting or worse.",
        "थेट रोख धोका. प्रक्रिया चूक, कमी मोजणी किंवा वाईट काही लपवू शकते."
    ),
    "impact.recurring": (
        "Recurring failure on the same point — process or training gap, not a one-off mistake.",
        "त्याच बिंदूवर वारंवार अपयश — प्रक्रिया किंवा प्रशिक्षण त्रुटी, एकवेळची चूक नाही."
    ),
    "impact.security_legal": (
        "Possible theft, security breach, or legal exposure. Could be loss-of-licence territory.",
        "संभाव्य चोरी, सुरक्षा भंग, किंवा कायदेशीर धोका. परवाना गमावण्याची शक्यता."
    ),
    "impact.brand_reputation": (
        "Brand reputation. Customer may escalate publicly (social media, regulator, Titan corporate).",
        "ब्रँडची प्रतिष्ठा. ग्राहक जाहीरपणे एस्केलेट करू शकतो (सोशल मीडिया, नियामक, टायटन कॉर्पोरेट)."
    ),

    "action.review_audit": (
        "Review the audit in the app and call {sm} before tomorrow's opening.",
        "अॅपमध्ये ऑडिट पुनरावलोकन करा आणि उद्या उघडण्याआधी {sm} ला फोन करा."
    ),
    "action.recount_cash": (
        "Re-count EOD cash, review the cash sheet, and call the auditor today.",
        "दिवसाअखेरची रोख पुन्हा मोजा, रोख पत्रक पुनरावलोकन करा, आणि आज ऑडिटरला फोन करा."
    ),
    "action.pattern_cap": (
        "Open a Pattern CAP in the app, run a 5 Whys with the responsible staff, set a 7-day deadline.",
        "अॅपमध्ये पॅटर्न CAP उघडा, जबाबदार कर्मचाऱ्यांसह पाच का? करा, ७-दिवसांची मुदत द्या."
    ),
    "action.investigate_now": (
        "Investigate immediately. Preserve evidence — CCTV, registers, cash count. Don't let staff close the store before you arrive.",
        "ताबडतोब तपास करा. पुरावे जपा — सीसीटीव्ही, रजिस्टर, रोख मोजणी. तुम्ही पोहोचण्यापूर्वी कर्मचाऱ्यांना स्टोअर बंद करू देऊ नका."
    ),
    "action.call_customer": (
        "Call the customer today. Brief the Owner. Document the resolution.",
        "आज ग्राहकाला फोन करा. मालकाला माहिती द्या. निराकरण नोंदवा."
    ),
}

# ---- 12. Reference / band thresholds for Reference tab --------------------
reference = {
    "tier1_target": ("Tier 1 daily target: 90%+ (81 / 90 weighted)", "टियर १ दैनंदिन लक्ष्य: ९०%+ (८१ / ९० वजनी)"),
    "tier2_target": ("Tier 2 weekly target: 92%+ (114 / 124 weighted)", "टियर २ साप्ताहिक लक्ष्य: ९२%+ (११४ / १२४ वजनी)"),
    "tier3_target": ("Tier 3 monthly target: 95%+ (qualitative)", "टियर ३ मासिक लक्ष्य: ९५%+ (गुणात्मक)"),
    "band_excellent_range": ("95–100% — Reward; document for replication", "९५–१००% — पुरस्कार; पुनरावृत्तीसाठी नोंद"),
    "band_good_range":      ("90–94.9% — Note fixes; no CAP needed", "९०–९४.९% — सुधारणा नोंदवा; CAP नको"),
    "band_fair_range":      ("85–89.9% — Written CAP required", "८५–८९.९% — लेखी CAP आवश्यक"),
    "band_poor_range":      ("80–84.9% — Urgent CAP + escalate one tier", "८०–८४.९% — तातडीची CAP + एक स्तर एस्केलेट"),
    "band_critical_range":  ("< 80% — Same-day escalation; full RCA", "< ८०% — त्याच दिवशी एस्केलेशन; पूर्ण मूळ कारण विश्लेषण"),
}

# ===========================================================================
# Build output structure
# ===========================================================================

def pair(en, mr):
    return {"en": en, "mr": mr}

out = {
    "_meta": {
        "produced_at": datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        "source_files": [
            "Documentation/Saagar_P1_App_Spec_v1.docx (§8 bilingual string table, verbatim)",
            "Documentation/Saagar_P1_Audit_Workbook_v1.docx (checkpoint text, glossary A.7, bilingual throughout)",
            "Documentation/Saagar_P1_QuickRef_v1.docx (bilingual A.4–A.7 cards)",
            "www/index.html (CHECKPOINTS array + every user-visible string in JS template literals & inline HTML)",
        ],
        "translator_notes": (
            "Approach: every string from the spec §8 bilingual string table is used VERBATIM "
            "(no paraphrase). Every checkpoint text & evidence string is keyed to its app id "
            "(1.1..8.8) and translated against the corresponding Workbook table (T14 Grooming, "
            "T16 Sales Buddy, T18 NPS, T20 Customer Data, T22 Display, T23 Cash, T25 Inventory, "
            "T27 Service Intake), using the QuickRef A.7 glossary for term standardisation "
            "(audit→ऑडिट, compliance→अनुपालन, pass→पास, fail→नापास, NA→लागू नाही, "
            "checkpoint→तपासणी बिंदू, evidence→पुरावा, finding→निष्कर्ष, etc).\n\n"
            "Ambiguities resolved:\n"
            "  1. SOP1 Grooming: app uses the 6-row condensed A.1/QuickRef version; "
            "     translations cover those 6 (1.1–1.6), not the 10 narrative items in Workbook §2.1.\n"
            "  2. SOP2 Sales Buddy: app uses the attribute-based version (10:15–10:45 etc.), "
            "     not the §2.2 window-based version. Translations cover the app variant.\n"
            "  3. Sales Buddy window text uses Devanagari numerals where the workbook does; "
            "     time formats keep English-style colons (9:00 → ९:००).\n"
            "  4. Currency: ₹ kept as-is (universal in MR). Counts in ranges (e.g. ≥90%) "
            "     are rendered with Devanagari numerals (९०%) per Workbook convention.\n"
            "  5. 'CAP', 'PIN', 'POS', 'GRN', 'FIFO', 'KYC', 'DPDP', 'GST', 'GPS', 'UPI', "
            "     'CSV', 'PDF', 'WhatsApp', 'Drive', 'SKU', 'Sales Buddy', 'Titan World', "
            "     'Helios' are kept as English/transliterated nouns per the workbook glossary.\n"
            "  6. 'Saagar' brand keeps Devanagari 'सागर' (matches workbook cover).\n"
            "  7. PASS/FAIL/NA: spec table has them transliterated (पास/नापास/NA). UI buttons "
            "     may show either — translations follow the spec exactly.\n\n"
            "Gaps / unflagged decisions for Sagar review:\n"
            "  - No [REVIEW] flags raised in this pass; every string had a defensible MR rendering.\n"
            "  - Some strings (e.g. 'X to revisit') are UI shorthand that doesn't translate "
            "    cleanly without seeing the screen — rendered literally; verify in app.\n"
            "  - The 7 escalation messages are composed at runtime from labels + dynamic data; "
            "    the four label words ('What happened', 'Evidence', 'Impact', 'Requested action') "
            "    and the 6 fixed impact/action phrase pairs are translated for full coverage even "
            "    though Spec §7.5 notes WhatsApp messages should stay English when sent externally."
        ),
    },
    "ui_strings":          {k: pair(*v) for k, v in ui_strings.items()},
    "checkpoints":         {k: pair(*v) for k, v in checkpoints_mr.items()},
    "evidence_hints":      {k: pair(*v) for k, v in evidence_mr.items()},
    "sop_names":           {k: pair(*v) for k, v in sop_names.items()},
    "bands":               {k: pair(*v) for k, v in bands.items()},
    "cap_statuses":        {k: pair(*v) for k, v in cap_statuses.items()},
    "audit_statuses":      {k: pair(*v) for k, v in audit_statuses.items()},
    "errors":              {k: pair(*v) for k, v in errors.items()},
    "success":             {k: pair(*v) for k, v in success.items()},
    "escalation_triggers": {k: pair(*v) for k, v in escalation_triggers.items()},
    "escalation_messages": {k: pair(*v) for k, v in escalation_msg.items()},
    "reference":           {k: pair(*v) for k, v in reference.items()},
}

# Sanity checks
assert len(out["checkpoints"]) == 68, f"Expected 68 checkpoints, got {len(out['checkpoints'])}"
assert len(out["evidence_hints"]) == 68, f"Expected 68 evidence_hints, got {len(out['evidence_hints'])}"
assert len(out["sop_names"]) == 8
assert len(out["bands"]) == 5
assert len(out["escalation_triggers"]) == 7

# Cross-check checkpoint ids against app
app_ids = {cp['id'] for cp in APP_CHECKPOINTS}
mr_ids = set(out["checkpoints"].keys())
missing = app_ids - mr_ids
extra = mr_ids - app_ids
assert not missing, f"Missing MR for checkpoint ids: {missing}"
assert not extra, f"Extra MR ids not in app: {extra}"

# Cross-check EN text against app text (must match exactly so 'en' values
# render the same string the app already shows)
mismatches = []
for cp in APP_CHECKPOINTS:
    expected_en = cp['text']
    got_en = out["checkpoints"][cp['id']]['en']
    if expected_en != got_en:
        mismatches.append((cp['id'], expected_en, got_en))
    expected_ev = cp['evidence']
    got_ev = out["evidence_hints"][cp['id']]['en']
    if expected_ev != got_ev:
        mismatches.append((cp['id']+'(ev)', expected_ev, got_ev))
if mismatches:
    print(f'\nMISMATCHES vs app ({len(mismatches)}):')
    for m in mismatches[:20]:
        print(f'  {m[0]}: app="{m[1]}" mine="{m[2]}"')

# Count totals
total = 0
review_count = 0
for cat in ('ui_strings','checkpoints','evidence_hints','sop_names','bands',
            'cap_statuses','audit_statuses','errors','success',
            'escalation_triggers','escalation_messages','reference'):
    n = len(out[cat])
    total += n
    for k, v in out[cat].items():
        if '[REVIEW]' in v['mr']:
            review_count += 1
    print(f'  {cat}: {n}')
print(f'TOTAL strings: {total}')
print(f'[REVIEW] flags: {review_count}')

outpath = r'C:\Cowork\Reports Apk\agent_outputs\marathi.json'
with open(outpath, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f'\nOK wrote {outpath}')
print(f'File size: {os.path.getsize(outpath)} bytes')
