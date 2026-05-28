window.REFERENCE_DATA = {
  "rating_scale": {
    "title_en": "Compliance rating bands",
    "title_mr": "अनुपालन रेटिंग पट्ट्या",
    "subtitle_en": "Source: Workbook Appendix A.4 — Rating Scale Reference Card.",
    "subtitle_mr": "स्रोत: पुस्तिका परिशिष्ट A.४ — रेटिंग स्केल संदर्भ कार्ड.",
    "bands": [
      {
        "code": "excellent",
        "label_en": "Excellent",
        "label_mr": "उत्कृष्ट",
        "min_pct": 95.0,
        "max_pct": 100.0,
        "range_label_en": "95% – 100%",
        "range_label_mr": "९५% – १००%",
        "color": "#166534",
        "action_en": "Reward and document the practice for replication.",
        "action_mr": "[REVIEW] सरावाचे प्रतिकृतीसाठी कौतुक करा व नोंदवा.",
        "who_acts_en": "Store Manager records best practice; GM cites in weekly report.",
        "who_acts_mr": "[REVIEW] स्टोअर मॅनेजर सर्वोत्तम सराव नोंदवतो; जीएम साप्ताहिक अहवालात उल्लेख करते.",
        "description_en": "Audit-grade compliance. Sustain by training new staff to current standard.",
        "description_mr": "[REVIEW] ऑडिट-दर्जाचे अनुपालन. नवीन कर्मचाऱ्यांना सध्याच्या मानकानुसार प्रशिक्षित करून टिकवा."
      },
      {
        "code": "good",
        "label_en": "Good",
        "label_mr": "चांगले",
        "min_pct": 90.0,
        "max_pct": 94.9,
        "range_label_en": "90% – 94.9%",
        "range_label_mr": "९०% – ९४.९%",
        "color": "#15803D",
        "action_en": "Note minor fixes for the next day; no CAP needed.",
        "action_mr": "[REVIEW] दुसर्‍या दिवशीसाठी किरकोळ सुधारणा नोंदवा; CAP आवश्यक नाही.",
        "who_acts_en": "Store Manager addresses verbally with relevant CRO.",
        "who_acts_mr": "[REVIEW] स्टोअर मॅनेजर संबंधित सीआरओशी तोंडी बोलून सोडवतो.",
        "description_en": "On-target performance. Address small slips before they become patterns.",
        "description_mr": "[REVIEW] लक्ष्यानुसार कामगिरी. पॅटर्न होण्यापूर्वी लहान चुका सोडवा."
      },
      {
        "code": "fair",
        "label_en": "Fair",
        "label_mr": "बरे",
        "min_pct": 85.0,
        "max_pct": 89.9,
        "range_label_en": "85% – 89.9%",
        "range_label_mr": "८५% – ८९.९%",
        "color": "#B45309",
        "action_en": "Written Corrective Action Plan required.",
        "action_mr": "[REVIEW] लेखी कृती योजना (CAP) आवश्यक.",
        "who_acts_en": "Store Manager opens CAP; GM reviews at weekly audit.",
        "who_acts_mr": "[REVIEW] स्टोअर मॅनेजर CAP उघडतो; जीएम साप्ताहिक ऑडिटमध्ये पुनरावलोकन करते.",
        "description_en": "Below target. Root-cause analysis required before the issue settles in.",
        "description_mr": "[REVIEW] लक्ष्याखाली. समस्या स्थिरावण्यापूर्वी मूळ-कारण विश्लेषण आवश्यक."
      },
      {
        "code": "poor",
        "label_en": "Poor",
        "label_mr": "वाईट",
        "min_pct": 80.0,
        "max_pct": 84.9,
        "range_label_en": "80% – 84.9%",
        "range_label_mr": "८०% – ८४.९%",
        "color": "#B91C1C",
        "action_en": "Urgent CAP plus escalate one tier up.",
        "action_mr": "[REVIEW] तातडीचा CAP आणि एक स्तर वर एस्केलेट करा.",
        "who_acts_en": "Store Manager opens CAP; same-day escalation to GM.",
        "who_acts_mr": "[REVIEW] स्टोअर मॅनेजर CAP उघडतो; त्याच दिवशी जीएमकडे एस्केलेशन.",
        "description_en": "Clearly off-target. Multiple SOPs likely affected; act tonight, not tomorrow.",
        "description_mr": "[REVIEW] स्पष्टपणे लक्ष्याबाहेर. अनेक एसओपी प्रभावित; उद्या नव्हे, आजच कृती करा."
      },
      {
        "code": "critical",
        "label_en": "Critical",
        "label_mr": "अत्यावश्यक",
        "min_pct": 0.0,
        "max_pct": 79.9,
        "range_label_en": "Below 80%",
        "range_label_mr": "८०% च्या खाली",
        "color": "#B91C1C",
        "action_en": "Same-day escalation; full root-cause analysis.",
        "action_mr": "[REVIEW] त्याच दिवशी एस्केलेशन; पूर्ण मूळ-कारण विश्लेषण.",
        "who_acts_en": "Escalation to Owner regardless of tier.",
        "who_acts_mr": "[REVIEW] स्तर कोणताही असो, मालकाकडे एस्केलेशन.",
        "description_en": "Audit programme failure if not addressed. Trigger 1 fires automatically.",
        "description_mr": "[REVIEW] सोडवले नाही तर ऑडिट कार्यक्रम अपयश. ट्रिगर १ आपोआप सुरू होतो."
      }
    ],
    "tier_targets": [
      {
        "tier": "daily",
        "tier_label_en": "Tier 1 daily",
        "tier_label_mr": "टियर १ दैनंदिन",
        "auditor_en": "Store Manager",
        "auditor_mr": "स्टोअर मॅनेजर",
        "target_pct": 90,
        "label_en": "SM daily target",
        "label_mr": "[REVIEW] SM दैनंदिन लक्ष्य",
        "total_points": "90 weighted",
        "points_to_pass": "81+ weighted",
        "points_to_pass_label_en": "81 / 90",
        "points_to_pass_label_mr": "८१ / ९०"
      },
      {
        "tier": "weekly",
        "tier_label_en": "Tier 2 weekly",
        "tier_label_mr": "टियर २ साप्ताहिक",
        "auditor_en": "GM",
        "auditor_mr": "जीएम",
        "target_pct": 92,
        "label_en": "GM weekly target",
        "label_mr": "[REVIEW] जीएम साप्ताहिक लक्ष्य",
        "total_points": "124 weighted",
        "points_to_pass": "114+ weighted",
        "points_to_pass_label_en": "114 / 124",
        "points_to_pass_label_mr": "११४ / १२४"
      },
      {
        "tier": "monthly",
        "tier_label_en": "Tier 3 monthly",
        "tier_label_mr": "टियर ३ मासिक",
        "auditor_en": "Owner",
        "auditor_mr": "मालक",
        "target_pct": 95,
        "label_en": "Owner monthly target",
        "label_mr": "[REVIEW] मालक मासिक लक्ष्य",
        "total_points": "Strategic — qualitative",
        "points_to_pass": "—",
        "points_to_pass_label_en": "Qualitative",
        "points_to_pass_label_mr": "गुणात्मक"
      }
    ],
    "warning": {
      "en": "The 89.9% → 90.0% boundary is the most-missed cliff in the whole programme. Always score with one decimal place. \"90\" is ambiguous — is it 90.0 (Good) or 89.7 (Fair) rounded up? Never round before banding.",
      "mr": "[REVIEW] संपूर्ण कार्यक्रमातली सर्वात-चुकवली जाणारी सीमा म्हणजे ८९.९% → ९०.०%. नेहमी एका दशांश स्थानासह गुण लिहा. \"९०\" अस्पष्ट — ९०.० (चांगले) की वर गोलाकार केलेले ८९.७ (बरे)? पट्टी ठरवण्यापूर्वी कधीही गोलाकार करू नका."
    }
  },
  "escalation_triggers": {
    "title_en": "Escalation triggers",
    "title_mr": "एस्केलेशन ट्रिगर",
    "subtitle_en": "Source: Workbook Appendix A.5 — Escalation Checklist. Seven mandatory triggers; when any one is met, escalation happens regardless of auditor preference.",
    "subtitle_mr": "[REVIEW] स्रोत: पुस्तिका परिशिष्ट A.५ — एस्केलेशन चेकलिस्ट. सात अनिवार्य ट्रिगर; एकही पूर्ण झाला की ऑडिटरच्या पसंतीची पर्वा न करता एस्केलेशन होते.",
    "message_format": {
      "intro_en": "Every escalation message has 4 parts. Send in English; WhatsApp may forward externally. Be short — the recipient is deciding under time pressure. Speed beats polish.",
      "intro_mr": "[REVIEW] प्रत्येक एस्केलेशन संदेशाला ४ भाग असतात. इंग्रजीत पाठवा; व्हॉट्सअॅप पुढे बाहेर जाऊ शकते. छोटा ठेवा — प्राप्तकर्ता वेळेच्या दबावाखाली निर्णय घेत आहे. वेग पॉलिशपेक्षा महत्त्वाचा.",
      "parts": [
        {
          "number": 1,
          "label_en": "What happened",
          "label_mr": "काय झाले",
          "description_en": "One sentence stating the event, including the relevant numbers.",
          "description_mr": "संबंधित आकड्यांसह घटना सांगणारे एक वाक्य."
        },
        {
          "number": 2,
          "label_en": "Evidence",
          "label_mr": "पुरावा",
          "description_en": "The photo, register entry, variance amount, complaint reference, or trend chart that proves it.",
          "description_mr": "फोटो, रजिस्टर नोंद, तफावत रक्कम, तक्रार संदर्भ, किंवा कल चार्ट."
        },
        {
          "number": 3,
          "label_en": "Impact",
          "label_mr": "कार्यवाहक परिणाम",
          "description_en": "The immediate operational impact — store-day, brand-counter, customer relationship, financial exposure.",
          "description_mr": "तातडीचा कार्यवाहक परिणाम — स्टोअर-दिवस, ब्रँड-काउंटर, ग्राहक नातेसंबंध, आर्थिक धोका."
        },
        {
          "number": 4,
          "label_en": "Requested action",
          "label_mr": "मागितलेली कृती",
          "description_en": "Information only / decision needed / immediate action needed. Be explicit.",
          "description_mr": "फक्त माहिती / निर्णय आवश्यक / तातडीची कृती आवश्यक. स्पष्ट सांगा."
        }
      ]
    },
    "triggers": [
      {
        "number": 1,
        "label_en": "Daily audit Critical band",
        "label_mr": "दैनंदिन ऑडिट क्रिटिकल पट्टी",
        "threshold_en": "Score < 80%",
        "threshold_mr": "गुण < ८०%",
        "to_en": "GM (Owner if Cash/Inv is the cause)",
        "to_mr": "जीएम (कारण रोख/स्टॉक असेल तर मालक)",
        "channel": [
          "WhatsApp",
          "In-app"
        ],
        "when_en": "Same night",
        "when_mr": "त्याच रात्री",
        "urgency": "same_night",
        "example_message_en": "ESCALATION — Daily audit Critical band\n\n1. What happened: Tuesday daily audit scored 78.2%; cause is three Cash checkpoint Fails (override countersignature missing on 6.11, petty cash receipt missing on 6.9, till variance ₹420 over on 6.5).\n2. Evidence: Score sheet (attached), POS override register page for today, petty cash file photo.\n3. Impact: Critical-band day on a Cash-cause means the GM-to-Owner chain fires tonight. Cash-control credibility at stake; tomorrow opening will use a watched float.\n4. Requested action: Decision needed — GM to confirm Owner notification tonight and authorise tomorrow's tighter cash-handover procedure.\n\n—\nSaagar Traders audit app — auto-generated\nDate: 2026-05-27 • Tier: daily",
        "example_message_mr": "[REVIEW] एस्केलेशन — दैनंदिन ऑडिट क्रिटिकल पट्टी\n\n१. काय झाले: मंगळवारच्या दैनंदिन ऑडिटला ७८.२% गुण; कारण तीन रोख तपासणी बिंदू नापास (६.११ वर ओव्हरराइड काऊंटर सही गहाळ, ६.९ वर फुटकळ रोख पावती गहाळ, ६.५ वर तिजोरी तफावत ₹४२० जास्त).\n२. पुरावा: स्कोअर शीट (जोडलेले), आजचे POS ओव्हरराइड रजिस्टर पान, फुटकळ रोख फाइलचा फोटो.\n३. कार्यवाहक परिणाम: रोख-कारणावरचा क्रिटिकल-पट्टी दिवस म्हणजे जीएम-ते-मालक साखळी आज रात्री सुरू होते. रोख-नियंत्रणाची विश्वासार्हता धोक्यात; उद्याची सुरुवात पाहणीतल्या फ्लोटने.\n४. मागितलेली कृती: निर्णय आवश्यक — जीएमने आज रात्री मालकाला कळवण्याची पुष्टी करावी आणि उद्याच्या अधिक कडक रोख-हस्तांतरण प्रक्रियेला मान्यता द्यावी.\n\n—\nसागर ट्रेडर्स ऑडिट अॅप — स्वयं-निर्मित\nदिनांक: २०२६-०५-२७ • स्तर: दैनंदिन"
      },
      {
        "number": 2,
        "label_en": "Same checkpoint repeated Fail",
        "label_mr": "एकच तपासणी बिंदू पुन्हा-पुन्हा नापास",
        "threshold_en": "5+ days in a week",
        "threshold_mr": "एका आठवड्यात ५+ दिवस",
        "to_en": "GM (open a Pattern CAP)",
        "to_mr": "जीएम (पॅटर्न CAP उघडा)",
        "channel": [
          "In-app"
        ],
        "when_en": "At weekly audit",
        "when_mr": "साप्ताहिक ऑडिटमध्ये",
        "urgency": "next_audit",
        "example_message_en": null,
        "example_message_mr": null
      },
      {
        "number": 3,
        "label_en": "Single-day cash variance",
        "label_mr": "एका दिवसाची रोख तफावत",
        "threshold_en": "> ₹500 (regardless of explanation)",
        "threshold_mr": "> ₹५०० (स्पष्टीकरण काहीही असो)",
        "to_en": "GM (Owner if it recurs the next day)",
        "to_mr": "जीएम (दुसर्‍या दिवशी पुन्हा झाले तर मालक)",
        "channel": [
          "WhatsApp",
          "In-app"
        ],
        "when_en": "Same day",
        "when_mr": "त्याच दिवशी",
        "urgency": "same_day",
        "example_message_en": "ESCALATION — Single-day cash variance > ₹500\n\n1. What happened: Friday closing cash variance ₹580 short on count one; investigation shows ₹600 over-payment to a customer at lunchtime. Customer returned ₹600 at 4 PM; final net variance ₹20 short.\n2. Evidence: Cash register page (attached) showing both counts; customer return receipt; CCTV timestamp 13:42 (over-payment) and 16:08 (return).\n3. Impact: Trigger 3 was breached at lunchtime even though the situation closed clean. Documenting because the weekly audit reviews \"explained\" variances cumulatively to ensure they do not become a habit.\n4. Requested action: Information only — no further action needed tonight, but please flag this CRO in the Wed–Fri pattern check at weekly audit.\n\n—\nSaagar Traders audit app — auto-generated\nDate: 2026-05-27 • Tier: daily",
        "example_message_mr": "[REVIEW] एस्केलेशन — एका दिवसाची रोख तफावत > ₹५००\n\n१. काय झाले: शुक्रवारी बंदोबस्त रोख पहिल्या मोजणीत ₹५८० कमी; तपास दाखवतो दुपारी ग्राहकाला ₹६०० जास्त दिले गेले. ग्राहकाने ४ PM ला ₹६०० परत केले; अंतिम निव्वळ तफावत ₹२० कमी.\n२. पुरावा: रोख रजिस्टरचे पान (जोडलेले) दोन्ही मोजण्या दाखवते; ग्राहक परत पावती; सीसीटीव्ही वेळ-शिक्का १३:४२ (जास्त-पेमेंट) आणि १६:०८ (परत).\n३. कार्यवाहक परिणाम: परिस्थिती स्वच्छ बंद झाली तरीही दुपारी ट्रिगर ३ मोडले. कागदपत्र करत आहे कारण साप्ताहिक ऑडिट \"स्पष्टीकरण-असलेल्या\" तफावती एकत्रित पाहते — सवय होत नाही याची खात्री.\n४. मागितलेली कृती: फक्त माहिती — आज रात्री पुढे कृती नाही, पण कृपया साप्ताहिक ऑडिटच्या बुध-शुक्र पॅटर्न तपासणीत या सीआरओला झेंडा द्या.\n\n—\nसागर ट्रेडर्स ऑडिट अॅप — स्वयं-निर्मित\nदिनांक: २०२६-०५-२७ • स्तर: दैनंदिन"
      },
      {
        "number": 4,
        "label_en": "Inventory variance",
        "label_mr": "स्टॉक तफावत",
        "threshold_en": "> 2% of stock value",
        "threshold_mr": "स्टॉक मूल्याच्या > २%",
        "to_en": "Owner directly",
        "to_mr": "थेट मालक",
        "channel": [
          "WhatsApp",
          "In-app"
        ],
        "when_en": "Same day",
        "when_mr": "त्याच दिवशी",
        "urgency": "same_day",
        "example_message_en": null,
        "example_message_mr": null
      },
      {
        "number": 5,
        "label_en": "Theft / security / legal",
        "label_mr": "चोरी / सुरक्षा / कायदेशीर",
        "threshold_en": "Any indication",
        "threshold_mr": "कोणताही संकेत",
        "to_en": "Owner directly",
        "to_mr": "थेट मालक",
        "channel": [
          "WhatsApp",
          "In-app"
        ],
        "when_en": "Immediate",
        "when_mr": "तातडीने",
        "urgency": "immediate",
        "example_message_en": "ESCALATION — Theft / security / legal indication\n\n1. What happened: At Thursday closing, back-office CCTV Camera 3 was found pointing at the wall, not the safe. Six days of safe-area footage are lost. Store Manager believes it was knocked when the cleaning ladder was moved Monday morning; no witness reports tampering.\n2. Evidence: Camera 3 current frame (attached, showing wall); Camera 3 footage log Mon–Thu (all wall); cleaning ladder photo for context.\n3. Impact: Whether the cause was innocent or not, six days of unmonitored safe-area is the issue. Safe count tonight will proceed under dual observation; FIR may be needed for caution.\n4. Requested action: Decision needed — Owner please direct (a) whether to involve security audit, (b) whether to file a precautionary FIR, (c) re-aim camera tonight or hold for inspection. Holding closing until you respond.\n\n—\nSaagar Traders audit app — auto-generated\nDate: 2026-05-27 • Tier: daily",
        "example_message_mr": "[REVIEW] एस्केलेशन — चोरी / सुरक्षा / कायदेशीर संकेत\n\n१. काय झाले: गुरुवारच्या बंदोबस्ताला, मागील-कार्यालयाचा सीसीटीव्ही कॅमेरा ३ तिजोरीऐवजी भिंतीकडे पाहत आढळला. तिजोरी क्षेत्राचे सहा दिवसांचे फुटेज गमावले. स्टोअर मॅनेजरच्या मते सोमवारी सकाळी स्वच्छता शिडी हलवताना धक्का लागला; कोणीही साक्षीदार छेडछाडीची नोंद करत नाही.\n२. पुरावा: कॅमेरा ३ ची सध्याची फ्रेम (जोडलेली, भिंत दाखवते); कॅमेरा ३ सोम–गुरु फुटेज लॉग (सर्व भिंत); संदर्भासाठी स्वच्छता शिडीचा फोटो.\n३. कार्यवाहक परिणाम: कारण निरुपद्रवी असो की नसो, मुद्दा सहा दिवस अप्रत्यक्ष तिजोरी क्षेत्र हाच आहे. आज रात्री तिजोरीची मोजणी दोन-व्यक्तीच्या निरीक्षणाखाली होईल; सावधगिरीसाठी FIR आवश्यक असू शकते.\n४. मागितलेली कृती: निर्णय आवश्यक — मालकाने (अ) सुरक्षा ऑडिट जोडायचे का, (ब) सावधगिरीचा FIR दाखल करायचा का, (क) कॅमेरा आज रात्री पुन्हा लावायचा की तपासणीसाठी राखायचा — कृपया निर्देश द्या. तुमच्या उत्तरापर्यंत बंदोबस्त थांबवला आहे.\n\n—\nसागर ट्रेडर्स ऑडिट अॅप — स्वयं-निर्मित\nदिनांक: २०२६-०५-२७ • स्तर: दैनंदिन"
      },
      {
        "number": 6,
        "label_en": "Customer complaint",
        "label_mr": "ग्राहक तक्रार",
        "threshold_en": "Not resolvable at store level",
        "threshold_mr": "स्टोअर स्तरावर सुटण्यासारखी नाही",
        "to_en": "Owner directly",
        "to_mr": "थेट मालक",
        "channel": [
          "WhatsApp",
          "In-app"
        ],
        "when_en": "Same day",
        "when_mr": "त्याच दिवशी",
        "urgency": "same_day",
        "example_message_en": null,
        "example_message_mr": null
      },
      {
        "number": 7,
        "label_en": "Declining trend",
        "label_mr": "घसरता कल",
        "threshold_en": "3+ consecutive weeks of decline",
        "threshold_mr": "सलग ३+ आठवडे घसरण",
        "to_en": "Owner",
        "to_mr": "मालक",
        "channel": [
          "In-app"
        ],
        "when_en": "At the third week's weekly audit",
        "when_mr": "तिसर्‍या आठवड्याच्या साप्ताहिक ऑडिटमध्ये",
        "urgency": "next_audit",
        "example_message_en": null,
        "example_message_mr": null
      }
    ],
    "never_escalates": {
      "title_en": "What never escalates",
      "title_mr": "[REVIEW] काय कधीच एस्केलेट होत नाही",
      "items": [
        {
          "en": "Single-checkpoint Fails within Good or Excellent band — get a CAP, not an escalation.",
          "mr": "चांगले किंवा उत्कृष्ट पट्टीतले एकल-तपासणी बिंदू नापास — CAP मिळते, एस्केलेशन नाही."
        },
        {
          "en": "Personal disagreements between Store Manager and CRO — go through HR, not audit.",
          "mr": "स्टोअर मॅनेजर आणि सीआरओ यांच्यातले वैयक्तिक मतभेद — HR मधून जातात, ऑडिटमधून नव्हे."
        },
        {
          "en": "Scoring debates between Store Manager and GM on borderline checkpoints — resolve at weekly audit through evidence review.",
          "mr": "सीमारेषेच्या तपासणी बिंदूवर स्टोअर मॅनेजर आणि जीएम यांच्यात स्कोअरिंग वाद — साप्ताहिक ऑडिटमध्ये पुरावा पुनरावलोकनातून सुटतात."
        }
      ]
    }
  },
  "evidence": {
    "title_en": "Strong vs weak evidence",
    "title_mr": "मजबूत वि. दुर्बल पुरावा",
    "subtitle_en": "Source: Workbook Appendix A.6. Every audit finding must rest on something from the strong column. Findings supported only by items in the weak column are reporting, not auditing.",
    "subtitle_mr": "स्रोत: पुस्तिका परिशिष्ट A.६. प्रत्येक ऑडिट निष्कर्षाला मजबूत स्तंभातील कशाने तरी पुरावा हवा. केवळ दुर्बल स्तंभातील आयटमने आधारित निष्कर्ष म्हणजे रिपोर्टिंग, ऑडिट नव्हे.",
    "strong": [
      {
        "en": "Photographs with timestamp — WhatsApp send time, EXIF metadata, or Sales Buddy upload timestamp.",
        "mr": "वेळ-शिक्क्यासह फोटो — व्हॉट्सअॅप पाठवण्याची वेळ, EXIF मेटाडेटा, किंवा सेल्स बडी अपलोड वेळ-शिक्का."
      },
      {
        "en": "Signed and dated register entries — cash, stock, attendance, complaint, returns/damage, GRN, NPS.",
        "mr": "सही व दिनांकित रजिस्टर नोंदी — रोख, स्टॉक, हजेरी, तक्रार, परतावा/खराब, GRN, एनपीएस."
      },
      {
        "en": "POS and system reports — day-end POS sales, GST, cash summary; tamper-evident.",
        "mr": "POS आणि सिस्टम रिपोर्ट्स — दिवसअखेर POS विक्री, GST, रोख सारांश; छेडछाडीचा माग ठेवणारे."
      },
      {
        "en": "Sales Buddy upload acknowledgement — photo, GPS, timestamp, and Titan app receipt.",
        "mr": "सेल्स बडी अपलोड पावती — फोटो, GPS, वेळ-शिक्का, आणि टायटन अॅप पावती."
      },
      {
        "en": "Physical count records matching system/register — count sheet with both numbers and signature.",
        "mr": "सिस्टम/रजिस्टरशी जुळणाऱ्या प्रत्यक्ष मोजणी नोंदी — दोन्ही संख्या व सहीसह मोजणी पत्रक."
      },
      {
        "en": "Two-signature reconciliations — cash, high-value service intake.",
        "mr": "दोन-सही ताळमेळ — रोख, उच्च-मूल्य सर्व्हिस इनटेक."
      },
      {
        "en": "Bank deposit slips with original teller-stamped receipts.",
        "mr": "मूळ टेलर-शिक्क्यासह बँक ठेव स्लिप."
      },
      {
        "en": "Email/messaging audit trail with timestamp — daily and weekly report submissions.",
        "mr": "वेळ-शिक्क्यासह ईमेल/संदेश ट्रेल — दैनंदिन व साप्ताहिक अहवाल सादरीकरणे."
      }
    ],
    "weak": [
      {
        "en": "Verbal confirmation alone — \"yes I did it\" without any document or photo.",
        "mr": "केवळ तोंडी पुष्टी — कोणताही दस्तऐवज किंवा फोटोशिवाय \"हो, मी केले\"."
      },
      {
        "en": "\"Manager confirmed\" as standalone — reporting up the chain, not evidence.",
        "mr": "\"मॅनेजरने पुष्टी केली\" एकटा — साखळीवर रिपोर्टिंग, पुरावा नव्हे."
      },
      {
        "en": "\"I remember doing it\" — memory is unreliable for repetitive daily tasks.",
        "mr": "\"मला आठवते\" — पुनरावृत्ती दैनंदिन कामांसाठी स्मरण अविश्वसनीय."
      },
      {
        "en": "Photographs without timestamp — could have been taken any time.",
        "mr": "वेळ-शिक्क्याशिवायचे फोटो — कधीही काढले जाऊ शकतात."
      },
      {
        "en": "Unsigned documents — no accountability for accuracy.",
        "mr": "सही नसलेले दस्तऐवज — अचूकतेला कोणीही जबाबदार नाही."
      },
      {
        "en": "Second-hand reports — \"the CRO told me she did it\".",
        "mr": "दुसर्‍याकडून ऐकलेले — \"सीआरओने मला सांगितले\"."
      },
      {
        "en": "\"I will check tomorrow\" — deferred verification is not verification.",
        "mr": "\"उद्या तपासतो\" — पुढे ढकललेली पडताळणी ही पडताळणी नाही."
      },
      {
        "en": "Assumptions or estimates — \"there are about 30 pieces\" is not a count.",
        "mr": "अंदाज किंवा गृहीतके — \"साधारण ३० तुकडे आहेत\" मोजणी नाही."
      }
    ],
    "warning": {
      "en": "Every finding must rest on the left column. Findings supported only by right-column items are reporting, not auditing.",
      "mr": "प्रत्येक निष्कर्ष डाव्या स्तंभावर विसावला पाहिजे. फक्त उजव्या स्तंभातील आयटमने आधारित निष्कर्ष म्हणजे रिपोर्टिंग, ऑडिट नव्हे."
    }
  },
  "glossary": [
    {
      "en": "Audit",
      "mr": "ऑडिट",
      "meaning_en": "Independent check of standard vs reality",
      "meaning_mr": "[REVIEW] मानक विरुद्ध वास्तविकतेची स्वतंत्र तपासणी"
    },
    {
      "en": "Auditor",
      "mr": "ऑडिटर",
      "meaning_en": "Person conducting the audit",
      "meaning_mr": "[REVIEW] ऑडिट करणारी व्यक्ती"
    },
    {
      "en": "Compliance",
      "mr": "अनुपालन",
      "meaning_en": "Meeting the SOP standard",
      "meaning_mr": "[REVIEW] एसओपी मानक पूर्ण करणे"
    },
    {
      "en": "Checkpoint",
      "mr": "तपासणी बिंदू",
      "meaning_en": "Single item being audited",
      "meaning_mr": "[REVIEW] ऑडिट केला जाणारा एक आयटम"
    },
    {
      "en": "SOP",
      "mr": "एसओपी",
      "meaning_en": "Standard Operating Procedure",
      "meaning_mr": "[REVIEW] मानक कार्यप्रणाली"
    },
    {
      "en": "Tier",
      "mr": "स्तर",
      "meaning_en": "Audit level (daily/weekly/monthly)",
      "meaning_mr": "[REVIEW] ऑडिट पातळी (दैनंदिन/साप्ताहिक/मासिक)"
    },
    {
      "en": "Store Manager",
      "mr": "स्टोअर मॅनेजर",
      "meaning_en": "Tier 1 auditor; conducts daily audit",
      "meaning_mr": "[REVIEW] टियर १ ऑडिटर; दैनंदिन ऑडिट करतो"
    },
    {
      "en": "GM",
      "mr": "जीएम (जनरल मॅनेजर)",
      "meaning_en": "Tier 2 auditor; conducts weekly audit",
      "meaning_mr": "[REVIEW] टियर २ ऑडिटर; साप्ताहिक ऑडिट करते"
    },
    {
      "en": "CRO",
      "mr": "सीआरओ",
      "meaning_en": "Customer Relationship Officer",
      "meaning_mr": "[REVIEW] कस्टमर रिलेशनशिप ऑफिसर"
    },
    {
      "en": "Owner",
      "mr": "मालक",
      "meaning_en": "Tier 3 auditor; conducts monthly audit",
      "meaning_mr": "[REVIEW] टियर ३ ऑडिटर; मासिक ऑडिट करतो"
    },
    {
      "en": "Pass",
      "mr": "पास",
      "meaning_en": "Checkpoint meets standard",
      "meaning_mr": "[REVIEW] तपासणी बिंदू मानकानुसार"
    },
    {
      "en": "Fail",
      "mr": "नापास",
      "meaning_en": "Checkpoint does not meet standard",
      "meaning_mr": "[REVIEW] तपासणी बिंदू मानकानुसार नाही"
    },
    {
      "en": "NA / Not Applicable",
      "mr": "NA / लागू नाही",
      "meaning_en": "Checkpoint genuinely does not apply",
      "meaning_mr": "[REVIEW] तपासणी बिंदू खरोखर लागू होत नाही"
    },
    {
      "en": "Weighted score",
      "mr": "वजनी गुण",
      "meaning_en": "Score adjusted for SOP weight",
      "meaning_mr": "[REVIEW] एसओपी वजनासाठी समायोजित गुण"
    },
    {
      "en": "Raw checkpoint",
      "mr": "कच्चा तपासणी बिंदू",
      "meaning_en": "Unweighted count of checkpoint",
      "meaning_mr": "[REVIEW] वजनरहित तपासणी बिंदूची मोजणी"
    },
    {
      "en": "Band",
      "mr": "पट्टी",
      "meaning_en": "Compliance category (Excellent/Good/Fair/Poor/Critical)",
      "meaning_mr": "[REVIEW] अनुपालन वर्ग (उत्कृष्ट/चांगले/बरे/वाईट/अत्यावश्यक)"
    },
    {
      "en": "Evidence",
      "mr": "पुरावा",
      "meaning_en": "Proof supporting an audit finding",
      "meaning_mr": "[REVIEW] ऑडिट निष्कर्षाला आधार देणारा पुरावा"
    },
    {
      "en": "Strong evidence",
      "mr": "मजबूत पुरावा",
      "meaning_en": "Independent, dated, preserved proof",
      "meaning_mr": "[REVIEW] स्वतंत्र, दिनांकित, जतन केलेला पुरावा"
    },
    {
      "en": "Weak evidence",
      "mr": "दुर्बल पुरावा",
      "meaning_en": "Verbal, memory, or unsigned — not acceptable",
      "meaning_mr": "[REVIEW] तोंडी, स्मरण, किंवा सही नसलेला — स्वीकार्य नाही"
    },
    {
      "en": "Finding",
      "mr": "निष्कर्ष",
      "meaning_en": "Named outcome of an audit",
      "meaning_mr": "[REVIEW] ऑडिटचा नाव दिलेला निकाल"
    },
    {
      "en": "Variance",
      "mr": "तफावत",
      "meaning_en": "Difference between expected and actual",
      "meaning_mr": "[REVIEW] अपेक्षित आणि वास्तविक यांच्यातला फरक"
    },
    {
      "en": "Reconciliation",
      "mr": "ताळमेळ",
      "meaning_en": "Process of matching two sets of records",
      "meaning_mr": "[REVIEW] दोन नोंदी संच जुळवण्याची प्रक्रिया"
    },
    {
      "en": "Cash reconciliation",
      "mr": "रोख ताळमेळ",
      "meaning_en": "Match POS, register, and physical cash",
      "meaning_mr": "[REVIEW] POS, रजिस्टर, आणि प्रत्यक्ष रोख जुळवणे"
    },
    {
      "en": "Petty cash",
      "mr": "फुटकळ रोख",
      "meaning_en": "Small-amount cash for minor expenses",
      "meaning_mr": "[REVIEW] किरकोळ खर्चांसाठी लहान रकमेची रोख"
    },
    {
      "en": "Safe / vault",
      "mr": "तिजोरी",
      "meaning_en": "Secure cash and high-value storage",
      "meaning_mr": "[REVIEW] सुरक्षित रोख आणि उच्च-मूल्य साठवण"
    },
    {
      "en": "Override",
      "mr": "ओव्हरराइड",
      "meaning_en": "Manual exception to standard POS flow",
      "meaning_mr": "[REVIEW] मानक POS प्रवाहाला हाताने अपवाद"
    },
    {
      "en": "Refund",
      "mr": "परतावा",
      "meaning_en": "Money returned to customer",
      "meaning_mr": "[REVIEW] ग्राहकाला परत केलेले पैसे"
    },
    {
      "en": "GRN",
      "mr": "GRN (वस्तू प्राप्ती नोंद)",
      "meaning_en": "Goods Received Note",
      "meaning_mr": "[REVIEW] वस्तू प्राप्ती नोंद"
    },
    {
      "en": "Stock movement",
      "mr": "स्टॉक हालचाल",
      "meaning_en": "Change in inventory recorded in system",
      "meaning_mr": "[REVIEW] सिस्टमात नोंदलेला स्टॉकमधील बदल"
    },
    {
      "en": "Cycle count",
      "mr": "चक्र-मोजणी",
      "meaning_en": "Daily count of one stock tray",
      "meaning_mr": "[REVIEW] एका स्टॉक ट्रेची दैनंदिन मोजणी"
    },
    {
      "en": "FIFO",
      "mr": "FIFO (पहिल्या आत, पहिल्या बाहेर)",
      "meaning_en": "First In, First Out — sell oldest first",
      "meaning_mr": "[REVIEW] पहिल्या आत, पहिल्या बाहेर — सर्वात जुनी आधी विका"
    },
    {
      "en": "Display / planogram",
      "mr": "डिस्प्ले / प्लानोग्राम",
      "meaning_en": "Standard layout of brand zone",
      "meaning_mr": "[REVIEW] ब्रँड क्षेत्राची मानक मांडणी"
    },
    {
      "en": "Aging report",
      "mr": "एजिंग अहवाल",
      "meaning_en": "Report of stock by time-in-store",
      "meaning_mr": "[REVIEW] स्टोअरमधल्या वेळेनुसार स्टॉकचा अहवाल"
    },
    {
      "en": "Slow-moving stock",
      "mr": "हळू-विक्री स्टॉक",
      "meaning_en": "Items not sold in 90+ days",
      "meaning_mr": "[REVIEW] ९०+ दिवसांत न विकलेले आयटम"
    },
    {
      "en": "Write-off",
      "mr": "राइट-ऑफ",
      "meaning_en": "Item formally removed from stock as loss",
      "meaning_mr": "[REVIEW] तोटा म्हणून औपचारिकपणे स्टॉकमधून काढलेला आयटम"
    },
    {
      "en": "Service intake",
      "mr": "सर्व्हिस इनटेक",
      "meaning_en": "Customer watch accepted for repair",
      "meaning_mr": "[REVIEW] दुरुस्तीसाठी स्वीकारलेले ग्राहकाचे घड्याळ"
    },
    {
      "en": "Order ID",
      "mr": "ऑर्डर आयडी",
      "meaning_en": "Unique system-generated ID per intake",
      "meaning_mr": "[REVIEW] प्रत्येक इनटेकसाठी सिस्टमने तयार केलेला अद्वितीय आयडी"
    },
    {
      "en": "Pickup",
      "mr": "पिकअप",
      "meaning_en": "Customer collection of repaired watch",
      "meaning_mr": "[REVIEW] दुरुस्त केलेल्या घड्याळाची ग्राहकाने नेणे"
    },
    {
      "en": "Grooming",
      "mr": "ग्रूमिंग",
      "meaning_en": "CRO personal appearance standards",
      "meaning_mr": "[REVIEW] सीआरओ वैयक्तिक दिसण्याची मानके"
    },
    {
      "en": "NPS",
      "mr": "एनपीएस (नेट प्रमोटर स्कोर)",
      "meaning_en": "Customer satisfaction measurement",
      "meaning_mr": "[REVIEW] ग्राहक समाधानाचे मोजमाप"
    },
    {
      "en": "DPDP",
      "mr": "DPDP (डिजिटल वैयक्तिक डेटा संरक्षण)",
      "meaning_en": "Indian data privacy regulation",
      "meaning_mr": "[REVIEW] भारतीय डेटा गोपनीयता नियमन"
    },
    {
      "en": "Sales Buddy",
      "mr": "सेल्स बडी",
      "meaning_en": "Titan's daily compliance photo app",
      "meaning_mr": "[REVIEW] टायटनचे दैनंदिन अनुपालन फोटो अॅप"
    },
    {
      "en": "Planogram",
      "mr": "प्लानोग्राम",
      "meaning_en": "Diagram of correct display layout",
      "meaning_mr": "[REVIEW] योग्य डिस्प्ले मांडणीचे आकृती"
    },
    {
      "en": "CAP",
      "mr": "कृती योजना (CAP)",
      "meaning_en": "Corrective Action Plan",
      "meaning_mr": "[REVIEW] सुधारात्मक कृती योजना"
    },
    {
      "en": "Plan / Do / Verify / Close",
      "mr": "योजना / अंमलबजावणी / पडताळणी / बंद",
      "meaning_en": "Four phases of the CAP cycle",
      "meaning_mr": "[REVIEW] CAP चक्राचे चार टप्पे"
    },
    {
      "en": "Root cause",
      "mr": "मूळ कारण",
      "meaning_en": "Underlying reason for a finding",
      "meaning_mr": "[REVIEW] निष्कर्षामागचे मूलभूत कारण"
    },
    {
      "en": "5 Whys",
      "mr": "पाच का?",
      "meaning_en": "Technique to drill from symptom to root cause",
      "meaning_mr": "[REVIEW] लक्षणापासून मूळ कारणापर्यंत पोहोचण्याचे तंत्र"
    },
    {
      "en": "Aged CAP",
      "mr": "जुनी CAP",
      "meaning_en": "CAP whose deadline passed without verification",
      "meaning_mr": "[REVIEW] पडताळणीशिवाय मुदत संपलेली CAP"
    },
    {
      "en": "Escalation",
      "mr": "एस्केलेशन",
      "meaning_en": "Moving an issue to the next audit tier",
      "meaning_mr": "[REVIEW] समस्या पुढच्या ऑडिट स्तराकडे नेणे"
    },
    {
      "en": "Trigger",
      "mr": "ट्रिगर",
      "meaning_en": "Condition that requires escalation",
      "meaning_mr": "[REVIEW] एस्केलेशन आवश्यक करणारी अट"
    },
    {
      "en": "Pattern",
      "mr": "पॅटर्न",
      "meaning_en": "Repeated finding across days or weeks",
      "meaning_mr": "[REVIEW] दिवस किंवा आठवड्यांमध्ये पुनरावृत्ती होणारा निष्कर्ष"
    },
    {
      "en": "Slow slide",
      "mr": "हळू घसरण",
      "meaning_en": "Gradual decline across 3+ weeks",
      "meaning_mr": "[REVIEW] ३+ आठवड्यांमध्ये क्रमिक घसरण"
    },
    {
      "en": "Single-SOP decay",
      "mr": "एक-एसओपी क्षय",
      "meaning_en": "One SOP failing repeatedly while overall stays healthy",
      "meaning_mr": "[REVIEW] एकूण निरोगी असताना एक एसओपी वारंवार अपयशी"
    },
    {
      "en": "Day-of-week clustering",
      "mr": "दिवस-गठ्ठा",
      "meaning_en": "Failures concentrated on specific days",
      "meaning_mr": "[REVIEW] विशिष्ट दिवसांवर एकत्रित अपयश"
    },
    {
      "en": "Spot check",
      "mr": "स्पॉट चेक",
      "meaning_en": "Targeted re-verification of evidence",
      "meaning_mr": "[REVIEW] पुराव्याची लक्ष्यित पुन्हा-पडताळणी"
    },
    {
      "en": "Verification",
      "mr": "पडताळणी",
      "meaning_en": "Confirming evidence still supports finding",
      "meaning_mr": "[REVIEW] पुरावा अजूनही निष्कर्षाला आधार देतो याची पुष्टी"
    },
    {
      "en": "Weekly report",
      "mr": "साप्ताहिक अहवाल",
      "meaning_en": "GM's submission to Owner after weekly audit",
      "meaning_mr": "[REVIEW] साप्ताहिक ऑडिटनंतर जीएमचे मालकाला सादरीकरण"
    },
    {
      "en": "Critical SOP",
      "mr": "अत्यावश्यक एसओपी",
      "meaning_en": "Cash and Inventory — double-weighted",
      "meaning_mr": "[REVIEW] रोख आणि स्टॉक — दुप्पट वजन"
    },
    {
      "en": "Tolerance window",
      "mr": "सूट खिडकी",
      "meaning_en": "Allowable variance around a standard time/value",
      "meaning_mr": "[REVIEW] मानक वेळ/मूल्याभोवती परवानगी असलेली तफावत"
    },
    {
      "en": "Daily audit folder",
      "mr": "दैनंदिन ऑडिट फोल्डर",
      "meaning_en": "Monthly file of all daily audit sheets",
      "meaning_mr": "[REVIEW] सर्व दैनंदिन ऑडिट पत्रकांची मासिक फाइल"
    },
    {
      "en": "High-value stock",
      "mr": "उच्च-मूल्य स्टॉक",
      "meaning_en": "Items above ₹25,000 — separate handling",
      "meaning_mr": "[REVIEW] ₹२५,००० वरचे आयटम — वेगळी हाताळणी"
    },
    {
      "en": "Verbal confirmation",
      "mr": "तोंडी पुष्टी",
      "meaning_en": "Statement without supporting evidence",
      "meaning_mr": "[REVIEW] आधार पुराव्याशिवायचे विधान"
    },
    {
      "en": "Countersignature",
      "mr": "काऊंटर सही",
      "meaning_en": "Second authorising signature required for some actions",
      "meaning_mr": "[REVIEW] काही कृतींसाठी आवश्यक असलेली दुसरी मंजूर करणारी सही"
    },
    {
      "en": "Closing time",
      "mr": "बंदोबस्ताची वेळ",
      "meaning_en": "End of business day; cash counted, audit done",
      "meaning_mr": "[REVIEW] व्यवसाय दिवसाचा शेवट; रोख मोजली, ऑडिट केले"
    },
    {
      "en": "Opening time",
      "mr": "उघडण्याची वेळ",
      "meaning_en": "Start of business day; float ready, photo uploaded",
      "meaning_mr": "[REVIEW] व्यवसाय दिवसाची सुरुवात; फ्लोट तयार, फोटो अपलोड"
    }
  ]
};

// Auto-generated from assets/seed/. Do not edit by hand.