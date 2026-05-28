(function () {
  "use strict";

  /* ─── tiny uid ─────────────────────────────────────────────────────────── */
  function uid() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ─── deep clone (no JSON.parse trick to stay safe with undefined) ───── */
  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ─── case-insensitive duplicate check ─────────────────────────────────── */
  function isDuplicate(arr, name, excludeId) {
    var norm = name.trim().toLowerCase();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id !== excludeId && arr[i].name.trim().toLowerCase() === norm) {
        return true;
      }
    }
    return false;
  }

  function findById(arr, id) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
    }
    return null;
  }

  function activeNames(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].active) out.push(arr[i].name);
    }
    return out;
  }

  function allNames(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push(arr[i].name);
    return out;
  }

  /* ─── SEED DATA ─────────────────────────────────────────────────────────── */
  var SEED_STORES = ["Tanishq Jewellery", "Titan World", "Helios"];

  var SEED_CATALOGS = {
    "Tanishq Jewellery": {
      defaultBrand: "Tanishq",
      brands: ["Tanishq", "Mia by Tanishq", "Not Brand Specific"],
      categories: [
        {
          name: "All Jewellery",
          subs: [
            "Earrings", "Pendants", "Finger Rings", "Mangalsutra",
            "Chains", "Nose Pin", "Necklaces", "Necklace Set",
            "Bangles", "Bracelets", "Pendants & Earring Set"
          ]
        },
        {
          name: "Gold Jewellery",
          subs: [
            "Gold Bangles", "Gold Bracelets", "Gold Earrings", "Gold Chains",
            "Gold Necklaces", "Gold Rings", "Gold Mangalsutra", "Gold Coins / Bars"
          ]
        },
        {
          name: "Diamond Jewellery",
          subs: [
            "Diamond Rings", "Diamond Earrings", "Diamond Mangalsutra",
            "Diamond Necklace", "Diamond Bracelet", "Diamond Bangles", "Diamond Pendant"
          ]
        },
        {
          name: "Platinum Jewellery",
          subs: ["Platinum Rings", "Platinum Bands", "Platinum Chains", "Platinum Pendants"]
        },
        {
          name: "Silver Jewellery",
          subs: ["Silver Rings", "Silver Chains", "Silver Gifts", "Silver Accessories"]
        },
        {
          name: "Gemstone Jewellery",
          subs: ["Ruby", "Emerald", "Sapphire", "Pearl", "Mixed Gemstone"]
        },
        {
          name: "Bridal / Wedding",
          subs: [
            "Bridal Set", "Wedding Necklace", "Wedding Bangles",
            "Engagement Ring", "Mangalsutra"
          ]
        },
        {
          name: "Coins / Bars",
          subs: ["Gold Coin", "Gold Biscuit", "Religious Motif Coin", "Gifting Coin"]
        },
        {
          name: "Service / Exchange",
          subs: [
            "Gold Exchange", "Old Gold Valuation", "Repair Query",
            "Polish / Cleaning", "Scheme Query"
          ]
        }
      ]
    },
    "Titan World": {
      defaultBrand: "Titan",
      brands: [
        "Titan", "Fastrack", "Sonata", "Raga", "Tommy Hilfiger",
        "SF", "Kenneth Cole", "Zoop", "Vyb", "Anne Klein",
        "Police", "Xylys", "Edge", "Nebula", "Ducati", "Not Brand Specific"
      ],
      categories: [
        {
          name: "Analog Watches",
          subs: [
            "Men", "Women", "Unisex", "Couple", "Kids",
            "Dress", "Daily Use", "Office / Workwear",
            "Fashion", "Statement", "Wedding / Gifting"
          ]
        },
        {
          name: "Smart Watches",
          subs: [
            "Titan Smart", "Fastrack Smart", "BT Calling", "AMOLED",
            "Fitness / Health", "GPS / Sports", "Women Smartwatch"
          ]
        },
        {
          name: "Clocks",
          subs: [
            "Wall Clock", "Table Clock", "Alarm Clock",
            "Decorative Clock", "Gift Clock"
          ]
        },
        {
          name: "Fragrances",
          subs: ["Men", "Women", "Unisex", "Gift Set", "Skinn / Perfume Query"]
        },
        {
          name: "Audio",
          subs: ["Earbuds", "Headphones", "Audio Accessory Query"]
        },
        {
          name: "Accessories",
          subs: ["Strap", "Battery", "Gift Box", "Warranty Query", "Service Query"]
        },
        {
          name: "Corporate / Bulk",
          subs: ["Corporate Gifting", "Bulk Watches", "Employee Gift", "Festival Gift"]
        }
      ]
    },
    "Helios": {
      defaultBrand: "Not Brand Specific",
      brands: [
        "Casio", "Citizen", "Daniel Wellington", "Diesel", "Emporio Armani",
        "Fossil", "G-Shock", "Garmin", "Guess", "Kenneth Cole",
        "Michael Kors", "Movado", "Police", "Rado", "Seiko",
        "Swarovski", "Tissot", "Titan", "Titan Smart", "Tommy Hilfiger",
        "Versace", "Victorinox", "Xylys", "Fitbit", "Amazfit", "Not Brand Specific"
      ],
      categories: [
        {
          name: "Premium / Luxury",
          subs: [
            "Men", "Women", "Unisex", "Couple",
            "Dress", "Luxury", "Premium", "Collector Interest"
          ]
        },
        {
          name: "Analog Watches",
          subs: [
            "Three Hand", "Multifunction", "Chronograph",
            "Automatic", "Quartz", "Dress Watch"
          ]
        },
        {
          name: "Digital Watches",
          subs: ["Digital", "Hybrid", "G-Shock Style", "Sports Digital"]
        },
        {
          name: "Smart / Fitness",
          subs: [
            "Smartwatch", "Fitness Band", "GPS Watch",
            "Health Tracking", "Outdoor / Sports"
          ]
        },
        {
          name: "Sports / Adventure",
          subs: [
            "Diver Style", "Field / Outdoor", "Rugged",
            "Water Resistance Query", "Travel Watch"
          ]
        },
        {
          name: "Fashion",
          subs: ["Designer Fashion", "Stone / Embellished", "Minimal", "Statement"]
        },
        {
          name: "Service / Warranty",
          subs: [
            "Battery", "Strap", "Warranty",
            "Authenticity", "Repair", "Box / Tag Query"
          ]
        },
        {
          name: "Corporate / Bulk",
          subs: [
            "Corporate Gifting", "Bulk Premium Watches",
            "VIP Gift", "Wedding Gift"
          ]
        }
      ]
    }
  };

  var SEED_GLOBALS = {
    sources: [
      "Walk-in", "Reference", "Repeat Customer",
      "Digital Lead", "Phone Enquiry", "Festival / Campaign", "Other"
    ],
    customerTypes: [
      "New Customer", "Existing Customer", "Family of Existing",
      "Corporate / Bulk", "Tourist / Outstation"
    ],
    forWhoms: ["Women", "Men", "Unisex", "Kids / Teens", "Couple", "Family"],
    occasions: [
      "Daily Use", "Office", "Casual", "Modern", "Traditional",
      "Wedding", "Engagement", "Festival", "Birthday", "Gifting",
      "Luxury", "Just Browsing"
    ],
    budgets: [
      "Not discussed", "Below ₹5k", "₹5k-10k", "₹10k-25k",
      "₹25k-50k", "₹50k-1L", "₹1L-2.5L",
      "₹2.5L-5L", "Above ₹5L"
    ],
    timelines: [
      "Same day", "2-3 days", "Within a week",
      "Within a month", "Not sure"
    ],
    leadStatuses: ["Open", "Hot", "Warm", "Cold", "Converted", "Closed"]
  };

  var SEED_REASONS_TOP = [
    "Price too high", "Discount expected", "Design not available",
    "Size / fit issue", "Only browsing", "Comparing options",
    "Decision pending", "Stock out"
  ];
  var SEED_REASONS_MORE = [
    "Preferred brand not available", "Preferred colour / metal not available",
    "Payment / finance issue", "Exchange / valuation issue",
    "Delivery timeline issue", "Service query only",
    "Staff / waiting issue", "Left in hurry", "Other"
  ];

  /* ─── Build the seed masters object ────────────────────────────────────── */
  function buildSeed() {
    var now = new Date().toISOString();
    var m = {
      version: 1,
      updated_at: now,
      stores: [],
      catalogs: {},
      sources: [],
      customerTypes: [],
      forWhoms: [],
      occasions: [],
      budgets: [],
      timelines: [],
      leadStatuses: [],
      reasons: []
    };

    /* stores */
    for (var si = 0; si < SEED_STORES.length; si++) {
      m.stores.push({ id: uid(), name: SEED_STORES[si], active: true });
    }

    /* catalogs */
    var storeNames = Object.keys(SEED_CATALOGS);
    for (var ci = 0; ci < storeNames.length; ci++) {
      var sn = storeNames[ci];
      var src = SEED_CATALOGS[sn];
      var catObj = {
        defaultBrand: src.defaultBrand,
        categories: [],
        brands: []
      };
      /* categories + subs */
      for (var cIdx = 0; cIdx < src.categories.length; cIdx++) {
        var cat = src.categories[cIdx];
        var catItem = { id: uid(), name: cat.name, active: true, subs: [] };
        for (var sIdx = 0; sIdx < cat.subs.length; sIdx++) {
          catItem.subs.push({ id: uid(), name: cat.subs[sIdx], active: true });
        }
        catObj.categories.push(catItem);
      }
      /* brands */
      for (var bIdx = 0; bIdx < src.brands.length; bIdx++) {
        catObj.brands.push({ id: uid(), name: src.brands[bIdx], active: true });
      }
      m.catalogs[sn] = catObj;
    }

    /* global lists */
    var gKeys = Object.keys(SEED_GLOBALS);
    for (var gi = 0; gi < gKeys.length; gi++) {
      var gk = gKeys[gi];
      var gArr = SEED_GLOBALS[gk];
      for (var gii = 0; gii < gArr.length; gii++) {
        m[gk].push({ id: uid(), name: gArr[gii], active: true });
      }
    }

    /* reasons */
    for (var ri = 0; ri < SEED_REASONS_TOP.length; ri++) {
      m.reasons.push({ id: uid(), name: SEED_REASONS_TOP[ri], active: true, top: true });
    }
    for (var rj = 0; rj < SEED_REASONS_MORE.length; rj++) {
      m.reasons.push({ id: uid(), name: SEED_REASONS_MORE[rj], active: true, top: false });
    }

    return m;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  window.Masters                                                         */
  /* ═══════════════════════════════════════════════════════════════════════ */

  var GLOBAL_TYPES = [
    "sources", "customerTypes", "forWhoms", "occasions",
    "budgets", "timelines", "leadStatuses", "reasons"
  ];

  var LABELS = {
    sources: "Walk-in source",
    customerTypes: "Customer type",
    forWhoms: "For whom",
    occasions: "Occasion",
    budgets: "Budget band",
    timelines: "Buying timeline",
    leadStatuses: "Lead status",
    reasons: "Non-purchase reason",
    stores: "Stores",
    catalog: "Store catalog (categories & brands)"
  };

  /* ─── helpers ─────────────────────────────────────────────────────────── */
  function getCatalog(state, storeName) {
    if (!state.masters || !state.masters.catalogs) return null;
    return state.masters.catalogs[storeName] || null;
  }

  window.Masters = {

    /* ── constants ─────────────────────────────────────────────────────── */
    GLOBAL_TYPES: GLOBAL_TYPES,
    LABELS: LABELS,

    labelFor: function (type) {
      return LABELS[type] || type;
    },

    /* ── uid ───────────────────────────────────────────────────────────── */
    uid: uid,

    /* ── touch ─────────────────────────────────────────────────────────── */
    touch: function (state) {
      state.masters.updated_at = new Date().toISOString();
    },

    /* ── seeding ───────────────────────────────────────────────────────── */
    ensureSeeded: function (state) {
      if (!state.masters || !state.masters.version) {
        state.masters = buildSeed();
      }
      return state;
    },

    /* ═══════════════════ READ ACCESSORS ════════════════════════════════ */

    storeNames: function (state, includeInactive) {
      if (!state.masters) return [];
      var arr = state.masters.stores;
      return includeInactive ? allNames(arr) : activeNames(arr);
    },

    globalList: function (state, type, includeInactive) {
      if (!state.masters || !state.masters[type]) return [];
      var arr = state.masters[type];
      return includeInactive ? allNames(arr) : activeNames(arr);
    },

    reasonsTop: function (state) {
      if (!state.masters) return [];
      var out = [];
      var arr = state.masters.reasons;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].active && arr[i].top) out.push(arr[i].name);
      }
      return out;
    },

    reasonsAll: function (state) {
      if (!state.masters) return [];
      return activeNames(state.masters.reasons);
    },

    categories: function (state, storeName, includeInactive) {
      var cat = getCatalog(state, storeName);
      if (!cat) return [];
      return includeInactive ? allNames(cat.categories) : activeNames(cat.categories);
    },

    subCategories: function (state, storeName, catName, includeInactive) {
      var cat = getCatalog(state, storeName);
      if (!cat) return [];
      for (var i = 0; i < cat.categories.length; i++) {
        if (cat.categories[i].name === catName) {
          var subs = cat.categories[i].subs;
          return includeInactive ? allNames(subs) : activeNames(subs);
        }
      }
      return [];
    },

    brands: function (state, storeName, includeInactive) {
      var cat = getCatalog(state, storeName);
      if (!cat) return [];
      return includeInactive ? allNames(cat.brands) : activeNames(cat.brands);
    },

    defaultBrand: function (state, storeName) {
      var cat = getCatalog(state, storeName);
      if (!cat) return "";
      if (cat.defaultBrand) return cat.defaultBrand;
      /* fall back to first active brand */
      for (var i = 0; i < cat.brands.length; i++) {
        if (cat.brands[i].active) return cat.brands[i].name;
      }
      return "";
    },

    /* ═══════════════════ RAW ACCESSORS ════════════════════════════════ */

    rawGlobal: function (state, type) {
      if (!state.masters || !state.masters[type]) return [];
      return state.masters[type];
    },

    rawStores: function (state) {
      if (!state.masters) return [];
      return state.masters.stores;
    },

    rawCatalog: function (state, storeName) {
      return getCatalog(state, storeName);
    },

    rawCategories: function (state, storeName) {
      var cat = getCatalog(state, storeName);
      if (!cat) return [];
      return cat.categories;
    },

    rawBrands: function (state, storeName) {
      var cat = getCatalog(state, storeName);
      if (!cat) return [];
      return cat.brands;
    },

    /* ═══════════════════ MUTATIONS — GLOBALS ═══════════════════════════ */

    addGlobal: function (state, type, name) {
      if (!name || !name.trim()) return null;
      var arr = state.masters[type];
      if (!arr) return null;
      if (isDuplicate(arr, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true };
      if (type === "reasons") item.top = false;
      arr.push(item);
      this.touch(state);
      return item;
    },

    renameGlobal: function (state, type, id, name) {
      if (!name || !name.trim()) return;
      var arr = state.masters[type];
      if (!arr) return;
      if (isDuplicate(arr, name, id)) return;
      var item = findById(arr, id);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleGlobal: function (state, type, id) {
      var arr = state.masters[type];
      if (!arr) return;
      var item = findById(arr, id);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    toggleReasonTop: function (state, id) {
      var item = findById(state.masters.reasons, id);
      if (!item) return;
      item.top = !item.top;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — STORES ════════════════════════════ */

    addStore: function (state, name) {
      if (!name || !name.trim()) return null;
      if (isDuplicate(state.masters.stores, name, null)) return null;
      var trimmed = name.trim();
      var item = { id: uid(), name: trimmed, active: true };
      state.masters.stores.push(item);
      state.masters.catalogs[trimmed] = { defaultBrand: "", categories: [], brands: [] };
      this.touch(state);
      return item;
    },

    renameStore: function (state, id, newName) {
      if (!newName || !newName.trim()) return null;
      var item = findById(state.masters.stores, id);
      if (!item) return null;
      var trimmed = newName.trim();
      if (isDuplicate(state.masters.stores, trimmed, id)) return null;
      var oldName = item.name;
      /* re-key catalog */
      var catData = state.masters.catalogs[oldName];
      if (catData !== undefined) {
        state.masters.catalogs[trimmed] = catData;
        delete state.masters.catalogs[oldName];
      }
      item.name = trimmed;
      this.touch(state);
      return { oldName: oldName, newName: trimmed };
    },

    toggleStore: function (state, id) {
      var item = findById(state.masters.stores, id);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — CATEGORIES ════════════════════════ */

    addCategory: function (state, storeName, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return null;
      if (isDuplicate(cat.categories, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true, subs: [] };
      cat.categories.push(item);
      this.touch(state);
      return item;
    },

    renameCategory: function (state, storeName, catId, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return;
      if (isDuplicate(cat.categories, name, catId)) return;
      var item = findById(cat.categories, catId);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleCategory: function (state, storeName, catId) {
      var cat = getCatalog(state, storeName);
      if (!cat) return;
      var item = findById(cat.categories, catId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — SUBS ═════════════════════════════ */

    addSub: function (state, storeName, catId, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return null;
      var catItem = findById(cat.categories, catId);
      if (!catItem) return null;
      if (isDuplicate(catItem.subs, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true };
      catItem.subs.push(item);
      this.touch(state);
      return item;
    },

    renameSub: function (state, storeName, catId, subId, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return;
      var catItem = findById(cat.categories, catId);
      if (!catItem) return;
      if (isDuplicate(catItem.subs, name, subId)) return;
      var item = findById(catItem.subs, subId);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleSub: function (state, storeName, catId, subId) {
      var cat = getCatalog(state, storeName);
      if (!cat) return;
      var catItem = findById(cat.categories, catId);
      if (!catItem) return;
      var item = findById(catItem.subs, subId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — BRANDS ════════════════════════════ */

    addBrand: function (state, storeName, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return null;
      if (isDuplicate(cat.brands, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true };
      cat.brands.push(item);
      this.touch(state);
      return item;
    },

    renameBrand: function (state, storeName, brandId, name) {
      var cat = getCatalog(state, storeName);
      if (!cat || !name || !name.trim()) return;
      if (isDuplicate(cat.brands, name, brandId)) return;
      var item = findById(cat.brands, brandId);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleBrand: function (state, storeName, brandId) {
      var cat = getCatalog(state, storeName);
      if (!cat) return;
      var item = findById(cat.brands, brandId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    setDefaultBrand: function (state, storeName, brandName) {
      var cat = getCatalog(state, storeName);
      if (!cat) return;
      cat.defaultBrand = brandName || "";
      this.touch(state);
    },

    /* ═══════════════════ IMPORT / EXPORT ═══════════════════════════════ */

    export: function (state) {
      return {
        _format: "saagar_greetor_masters_v1",
        exported_at: new Date().toISOString(),
        masters: deepCopy(state.masters)
      };
    },

    import: function (state, parsed) {
      if (!parsed || parsed._format !== "saagar_greetor_masters_v1") {
        throw new Error("Invalid masters export: wrong or missing _format.");
      }
      if (!parsed.masters || !Array.isArray(parsed.masters.stores)) {
        throw new Error("Invalid masters export: masters.stores is missing or not an array.");
      }
      state.masters = deepCopy(parsed.masters);
      state.masters.updated_at = new Date().toISOString();
      return state;
    }
  };

})();
