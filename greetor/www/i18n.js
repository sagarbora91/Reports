/* i18n.js — Saagar Greetor i18n layer (EN + MR)
 * Sets window.I18n. ES5-ish IIFE, no imports.
 * MR entries marked _review:true — must pass native-speaker verification before release.
 */
(function () {
  "use strict";

  var LOCALES = ["en", "mr"];
  var DEFAULT = "en";
  var STORAGE_KEY = "saagar_greetor_locale";

  /* ------------------------------------------------------------------ */
  /* String table                                                         */
  /* Format: { en: { key: { text: '...' } }, mr: { key: { text: '...', _review: true } } } */
  /* ------------------------------------------------------------------ */
  var strings = {
    en: {
      "topbar.brand":        { text: "Saagar" },
      "topbar.audit":        { text: "GREETOR" },
      "nav.capture":         { text: "Capture" },
      "nav.reports":         { text: "Reports" },
      "nav.leads":           { text: "Leads" },
      "nav.settings":        { text: "Settings" },
      "nav.today":           { text: "Today" },
      "wizard.step1":        { text: "Visit" },
      "wizard.step2":        { text: "Customer" },
      "wizard.step3":        { text: "Interest" },
      "wizard.step4":        { text: "Reason & follow-up" },
      "wizard.back":         { text: "← Back" },
      "wizard.next":         { text: "Next →" },
      "wizard.save":         { text: "Save" },
      "wizard.update":       { text: "Update" },
      "wizard.reset":        { text: "Reset" },
      "field.store":         { text: "Store" },
      "field.date":          { text: "Visit date" },
      "field.time":          { text: "Visit time" },
      "field.source":        { text: "Walk-in source" },
      "field.mobile":        { text: "Mobile number" },
      "field.name":          { text: "Customer name" },
      "field.customerType":  { text: "Customer type" },
      "field.category":      { text: "Category" },
      "field.subCategory":   { text: "Sub-category" },
      "field.brand":         { text: "Brand" },
      "field.gender":        { text: "For whom" },
      "field.occasion":      { text: "Occasion" },
      "field.budget":        { text: "Budget" },
      "field.timeline":      { text: "Buying timeline" },
      "field.cro":           { text: "CRO / sales staff (optional)" },
      "field.reason":        { text: "Primary reason" },
      "field.competitor":    { text: "Competitor mentioned" },
      "field.remarks":       { text: "Remarks" },
      "field.photos":        { text: "Photos (product / customer)" },
      "field.followup":      { text: "Follow-up needed?" },
      "field.leadStatus":    { text: "Lead status" },
      "field.followDate":    { text: "Follow-up date" },
      "field.followTime":    { text: "Follow-up time" },
      "field.consent":       { text: "Customer agrees to be contacted (consent stamped now)" },
      "yes":                 { text: "Yes" },
      "no":                  { text: "No" },
      "btn.add":             { text: "+ Add" },
      "btn.edit":            { text: "Edit" },
      "btn.delete":          { text: "Delete" },
      "btn.cancel":          { text: "Cancel" },
      "btn.save":            { text: "Save" },
      "btn.signOut":         { text: "Sign out" },
      "btn.addPhoto":        { text: "📷 Add photo" },
      "settings.account":    { text: "My account" },
      "settings.myStore":    { text: "My store" },
      "settings.targets":    { text: "Targets" },
      "settings.users":      { text: "Users" },
      "settings.masters":    { text: "Masters" },
      "settings.messaging":  { text: "Messaging" },
      "settings.dataPrivacy":{ text: "Data & Privacy" },
      "settings.appearance": { text: "Appearance" },
      "settings.language":   { text: "Language" },
      "settings.about":      { text: "About" },
      "settings.backup":     { text: "Backup & restore" },
      "settings.eraseAll":   { text: "Erase all data" },
      "toast.saved":         { text: "Saved." },
      "toast.deleted":       { text: "Entry deleted." },
      "toast.updated":       { text: "Updated." },
      "modal.required":      { text: "Please complete these fields" },
      "consent.required":    { text: "Customer consent is required before saving a mobile number." }
    },

    mr: {
      /* topbar */
      "topbar.brand":        { text: "सागर",             _review: true },
      "topbar.audit":        { text: "ग्रीटर",           _review: true },
      /* nav */
      "nav.capture":         { text: "नोंदवा",           _review: true },
      "nav.reports":         { text: "अहवाल",            _review: true },
      "nav.leads":           { text: "लीड्स",            _review: true },
      "nav.settings":        { text: "सेटिंग्ज",         _review: true },
      "nav.today":           { text: "आजचे",             _review: true },
      /* wizard steps */
      "wizard.step1":        { text: "भेट",              _review: true },
      "wizard.step2":        { text: "ग्राहक",           _review: true },
      "wizard.step3":        { text: "आवड",              _review: true },
      "wizard.step4":        { text: "कारण व पाठपुरावा", _review: true },
      "wizard.back":         { text: "← मागे",           _review: true },
      "wizard.next":         { text: "पुढे →",           _review: true },
      "wizard.save":         { text: "जतन करा",          _review: true },
      "wizard.update":       { text: "अपडेट करा",        _review: true },
      "wizard.reset":        { text: "रीसेट करा",        _review: true },
      /* fields */
      "field.store":         { text: "दुकान",            _review: true },
      "field.date":          { text: "भेटीची तारीख",     _review: true },
      "field.time":          { text: "भेटीची वेळ",       _review: true },
      "field.source":        { text: "आगमन स्रोत",       _review: true },
      "field.mobile":        { text: "मोबाइल नंबर",      _review: true },
      "field.name":          { text: "ग्राहकाचे नाव",    _review: true },
      "field.customerType":  { text: "ग्राहकाचा प्रकार", _review: true },
      "field.category":      { text: "वर्ग",             _review: true },
      "field.subCategory":   { text: "उपवर्ग",           _review: true },
      "field.brand":         { text: "ब्रँड",            _review: true },
      "field.gender":        { text: "कुणासाठी",         _review: true },
      "field.occasion":      { text: "प्रसंग",           _review: true },
      "field.budget":        { text: "बजेट",             _review: true },
      "field.timeline":      { text: "खरेदीची वेळमर्यादा",_review: true },
      "field.cro":           { text: "CRO / विक्री कर्मचारी (पर्यायी)", _review: true },
      "field.reason":        { text: "प्राथमिक कारण",    _review: true },
      "field.competitor":    { text: "नमूद केलेला प्रतिस्पर्धी", _review: true },
      "field.remarks":       { text: "टिप्पण्या",        _review: true },
      "field.photos":        { text: "फोटो (उत्पादन / ग्राहक)", _review: true },
      "field.followup":      { text: "पाठपुरावा हवा आहे का?", _review: true },
      "field.leadStatus":    { text: "लीड स्थिती",       _review: true },
      "field.followDate":    { text: "पाठपुराव्याची तारीख", _review: true },
      "field.followTime":    { text: "पाठपुराव्याची वेळ", _review: true },
      "field.consent":       { text: "ग्राहकाने संपर्काची परवानगी दिली आहे (संमती आत्ता नोंदवली)", _review: true },
      /* common */
      "yes":                 { text: "होय",              _review: true },
      "no":                  { text: "नाही",             _review: true },
      /* buttons */
      "btn.add":             { text: "+ जोडा",           _review: true },
      "btn.edit":            { text: "संपादित करा",      _review: true },
      "btn.delete":          { text: "हटवा",             _review: true },
      "btn.cancel":          { text: "रद्द करा",         _review: true },
      "btn.save":            { text: "जतन करा",          _review: true },
      "btn.signOut":         { text: "साइन आउट करा",     _review: true },
      "btn.addPhoto":        { text: "📷 फोटो जोडा",     _review: true },
      /* settings */
      "settings.account":    { text: "माझे खाते",        _review: true },
      "settings.myStore":    { text: "माझे दुकान",       _review: true },
      "settings.targets":    { text: "लक्ष्ये",           _review: true },
      "settings.users":      { text: "वापरकर्ते",        _review: true },
      "settings.masters":    { text: "मास्टर्स",         _review: true },
      "settings.messaging":  { text: "संदेशवहन",         _review: true },
      "settings.dataPrivacy":{ text: "डेटा व गोपनीयता",  _review: true },
      "settings.appearance": { text: "स्वरूप",           _review: true },
      "settings.language":   { text: "भाषा",             _review: true },
      "settings.about":      { text: "माहिती",           _review: true },
      "settings.backup":     { text: "बॅकअप व पुनर्संचय",_review: true },
      "settings.eraseAll":   { text: "सर्व डेटा मिटवा",  _review: true },
      /* toasts */
      "toast.saved":         { text: "जतन झाले.",        _review: true },
      "toast.deleted":       { text: "नोंद हटवली.",      _review: true },
      "toast.updated":       { text: "अपडेट झाले.",      _review: true },
      /* modal / consent */
      "modal.required":      { text: "कृपया हे फील्ड पूर्ण करा", _review: true },
      "consent.required":    { text: "मोबाइल नंबर जतन करण्यापूर्वी ग्राहकाची संमती आवश्यक आहे.", _review: true }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Internal helpers                                                     */
  /* ------------------------------------------------------------------ */
  function isValidLocale(loc) {
    return LOCALES.indexOf(loc) !== -1;
  }

  function substitute(text, params) {
    if (!params || typeof params !== "object") return text;
    return text.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */
  var I18n = {};

  I18n.LOCALES = LOCALES;
  I18n.DEFAULT = DEFAULT;
  I18n.STORAGE_KEY = STORAGE_KEY;

  I18n.getLocale = function () {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidLocale(stored)) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return DEFAULT;
  };

  I18n.setLocale = function (loc) {
    if (!isValidLocale(loc)) return;
    var prev = I18n.getLocale();
    try {
      localStorage.setItem(STORAGE_KEY, loc);
    } catch (e) { /* ignore */ }
    if (loc !== prev && typeof window !== "undefined" && typeof window.render === "function") {
      try { window.render(); } catch (e) { /* ignore render errors */ }
    }
  };

  I18n.t = function (key, params) {
    var locale = I18n.getLocale();
    var localeTable = strings[locale] || {};
    var enTable = strings[DEFAULT] || {};
    var entry = localeTable[key] || enTable[key];
    var text = (entry && entry.text != null) ? entry.text : key;
    return substitute(text, params);
  };

  I18n.exists = function (key) {
    var locale = I18n.getLocale();
    var localeTable = strings[locale] || {};
    var enTable = strings[DEFAULT] || {};
    return !!(localeTable[key] || enTable[key]);
  };

  I18n.keysNeedingReview = function () {
    var mrTable = strings.mr || {};
    var result = [];
    for (var key in mrTable) {
      if (Object.prototype.hasOwnProperty.call(mrTable, key) && mrTable[key]._review) {
        result.push(key);
      }
    }
    return result;
  };

  I18n.boot = function () {
    if (typeof document === "undefined" || !document.documentElement) return;
    document.documentElement.lang = I18n.getLocale();
  };

  /* Expose globally */
  window.I18n = I18n;

  /* Auto-boot */
  I18n.boot();

}());
