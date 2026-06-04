/* masters.js — Saagar Greetor master-data layer (SQLite Phase 2b).
 *
 * REWRITTEN to async, DB-backed for the READ path. The masters config lives in
 * the meta KV table as a JSON string (key 'masters'), exactly as
 * DBSchema.disassemble writes it. The data layer NEVER touches window.GreetorDB
 * directly — it goes through window.Repo (Repo.masters.get/set, which JSON-parse/
 * stringify the meta value), so this module runs unchanged in Node by injecting a
 * node:sqlite test adapter via Repo.setDb(). The old in-memory `state.masters` is
 * no longer the source of truth for the async accessors; the DB is.
 *
 * BYTE-IDENTITY is the only hard requirement. Every async read accessor
 * (storeNames / globalList / reasonsTop / reasonsAll / categories / subCategories
 * / brands / defaultBrand) reproduces the EXACT observable output of the previous
 * pure-over-`state` implementation on the real seed: it FETCHES the masters
 * object via Repo (a faithful JSON round-trip of the old state.masters, so array
 * element order — insertion order — is preserved) and feeds it to the SAME pure
 * helpers (activeNames / allNames / getCatalog + the reasonsTop loop + the
 * subCategories linear search + the defaultBrand fallback) verbatim. The pure
 * helpers and the seed builder (buildSeed / deepCopy / uid + all SEED_* data)
 * stay SYNC and unchanged.
 *
 * BACKWARD-COMPAT (committed Phase-2 exemplar): customers.js's pipelineStages()
 * already calls `Masters.globalList({ masters: masters }, "leadStatuses")`
 * SYNCHRONOUSLY (state-object first arg, array result expected immediately). To
 * keep that proven-byte-identical call working, the read accessors detect a
 * legacy state/masters object passed as the first argument and run SYNCHRONOUSLY
 * over it (returning the array directly), exactly like the old code. When called
 * with the NEW signature (no state arg) they fetch from Repo and return a Promise.
 *
 * MUTATIONS / raw accessors / import-export are OUT OF SCOPE for Phase 2b (the
 * async-SQL conversion of the admin/editor write path is Phase 3). They are kept
 * here UNCHANGED with their current sync, state-based signatures so the masters
 * editor (masters-ui.js) keeps working until Phase 3 rewrites it; the byte-
 * identity harness never exercises them. Do not treat their `state` argument as
 * removed yet.
 *
 * Plain <script> module: sets window.Masters AND module.exports (Node).
 */
(function (root) {
  "use strict";

  // ── Repo handle (the ONLY DB access point) ──────────────────────────────────
  // Resolved lazily at call time so neither load order nor a post-load
  // Repo.setDb() can break routing (mirrors repo.js's own db() resolution).
  function repo() {
    var r = root.Repo;
    if (!r) {
      throw new Error("Masters: window.Repo unavailable — load repo.js (+ db.js, db-schema.js) before masters.js.");
    }
    return r;
  }

  /* ─── tiny uid (pure, sync — unchanged) ───────────────────────────────────── */
  function uid() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ─── deep clone (pure, sync — unchanged) ─────────────────────────────────── */
  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ─── case-insensitive duplicate check (pure, sync — unchanged) ───────────── */
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

  /* ─── SEED DATA (pure constants — unchanged) ──────────────────────────────── */
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

  /* ─── Build the seed masters object (pure, sync — unchanged) ───────────────── */
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
  /*  constants + pure helpers shared by the accessors                       */
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

  // getCatalog now takes the masters OBJECT directly (not state). Mirrors the old
  // getCatalog(state, storeName) guard (no masters / no catalogs -> null) exactly.
  function getCatalog(masters, storeName) {
    if (!masters || !masters.catalogs) return null;
    return masters.catalogs[storeName] || null;
  }

  // ── pure result builders (operate on a masters object) ──────────────────────
  // Each is the EXACT body of the old sync accessor, lifted to take `masters`
  // instead of `state.masters`. Reused verbatim by both the async (Repo-backed)
  // path and the legacy sync (state-arg) compatibility path.
  function storeNamesFrom(masters, includeInactive) {
    if (!masters) return [];
    var arr = masters.stores;
    return includeInactive ? allNames(arr) : activeNames(arr);
  }

  function globalListFrom(masters, type, includeInactive) {
    if (!masters || !masters[type]) return [];
    var arr = masters[type];
    return includeInactive ? allNames(arr) : activeNames(arr);
  }

  function reasonsTopFrom(masters) {
    if (!masters) return [];
    var out = [];
    var arr = masters.reasons;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].active && arr[i].top) out.push(arr[i].name);
    }
    return out;
  }

  function reasonsAllFrom(masters) {
    if (!masters) return [];
    return activeNames(masters.reasons);
  }

  function categoriesFrom(masters, storeName, includeInactive) {
    var cat = getCatalog(masters, storeName);
    if (!cat) return [];
    return includeInactive ? allNames(cat.categories) : activeNames(cat.categories);
  }

  function subCategoriesFrom(masters, storeName, catName, includeInactive) {
    var cat = getCatalog(masters, storeName);
    if (!cat) return [];
    for (var i = 0; i < cat.categories.length; i++) {
      if (cat.categories[i].name === catName) {
        var subs = cat.categories[i].subs;
        return includeInactive ? allNames(subs) : activeNames(subs);
      }
    }
    return [];
  }

  function brandsFrom(masters, storeName, includeInactive) {
    var cat = getCatalog(masters, storeName);
    if (!cat) return [];
    return includeInactive ? allNames(cat.brands) : activeNames(cat.brands);
  }

  function defaultBrandFrom(masters, storeName) {
    var cat = getCatalog(masters, storeName);
    if (!cat) return "";
    if (cat.defaultBrand) return cat.defaultBrand;
    /* fall back to first active brand */
    for (var i = 0; i < cat.brands.length; i++) {
      if (cat.brands[i].active) return cat.brands[i].name;
    }
    return "";
  }

  // ── legacy-calling-convention detection ─────────────────────────────────────
  // The committed Phase-2 exemplar (customers.js) calls these accessors the OLD
  // way: `Masters.globalList({ masters: ... }, "leadStatuses")` — a state-shaped
  // object as the first arg, expecting a synchronous array result. We must keep
  // that path byte-identical. A value is a "legacy state arg" when it's a plain
  // object (NOT a boolean/string/number/array): the new async signatures take a
  // boolean (includeInactive) or a string (type / storeName) as their first arg,
  // never an object, so this disambiguates with zero overlap.
  function isStateArg(x) {
    return x != null && typeof x === "object" && !Array.isArray(x);
  }
  // Resolve the masters object out of a legacy first arg: callers pass either a
  // full state ({ masters: {...} }) or, defensively, a masters object directly.
  function mastersOfStateArg(x) {
    if (x && Object.prototype.hasOwnProperty.call(x, "masters")) return x.masters;
    return x;
  }

  // ── async accessors (fetch masters via Repo, then run the pure builder) ──────
  // masters config is meta('masters') JSON; Repo.masters.get() parses it (or null
  // when the key is missing/unparseable), matching the old `!state.masters` guard.
  async function fetchMasters() {
    return repo().masters.get();
  }

  // ═══════════════════════════ SEEDING (async) ═══════════════════════════════
  // Old: if (!state.masters || !state.masters.version) state.masters = buildSeed().
  // New: fetch from meta; if absent/empty (no .version), build + persist. The
  // check mirrors the old condition exactly, so a structurally-empty masters
  // triggers a (re)seed identically. Idempotent: a second call sees a versioned
  // masters in meta and is a no-op.
  async function ensureSeeded() {
    var masters = await fetchMasters();
    if (!masters || !masters.version) {
      await repo().masters.set(buildSeed());
    }
  }

  // ═══════════════════════════ READ ACCESSORS ════════════════════════════════
  // Each: legacy sync path when a state/masters object is passed first (returns
  // the array/string directly, byte-identical to the old code); otherwise async,
  // fetching masters from Repo and running the SAME pure builder.

  function storeNames(includeInactive) {
    if (isStateArg(includeInactive)) {
      return storeNamesFrom(mastersOfStateArg(includeInactive), arguments[1]);
    }
    var inc = includeInactive;
    return fetchMasters().then(function (m) { return storeNamesFrom(m, inc); });
  }

  function globalList(type, includeInactive) {
    if (isStateArg(type)) {
      return globalListFrom(mastersOfStateArg(type), arguments[1], arguments[2]);
    }
    var t = type, inc = includeInactive;
    return fetchMasters().then(function (m) { return globalListFrom(m, t, inc); });
  }

  function reasonsTop(maybeState) {
    if (isStateArg(maybeState)) {
      return reasonsTopFrom(mastersOfStateArg(maybeState));
    }
    return fetchMasters().then(function (m) { return reasonsTopFrom(m); });
  }

  function reasonsAll(maybeState) {
    if (isStateArg(maybeState)) {
      return reasonsAllFrom(mastersOfStateArg(maybeState));
    }
    return fetchMasters().then(function (m) { return reasonsAllFrom(m); });
  }

  function categories(storeName, includeInactive) {
    if (isStateArg(storeName)) {
      return categoriesFrom(mastersOfStateArg(storeName), arguments[1], arguments[2]);
    }
    var sn = storeName, inc = includeInactive;
    return fetchMasters().then(function (m) { return categoriesFrom(m, sn, inc); });
  }

  function subCategories(storeName, catName, includeInactive) {
    if (isStateArg(storeName)) {
      return subCategoriesFrom(mastersOfStateArg(storeName), arguments[1], arguments[2], arguments[3]);
    }
    var sn = storeName, cn = catName, inc = includeInactive;
    return fetchMasters().then(function (m) { return subCategoriesFrom(m, sn, cn, inc); });
  }

  function brands(storeName, includeInactive) {
    if (isStateArg(storeName)) {
      return brandsFrom(mastersOfStateArg(storeName), arguments[1], arguments[2]);
    }
    var sn = storeName, inc = includeInactive;
    return fetchMasters().then(function (m) { return brandsFrom(m, sn, inc); });
  }

  function defaultBrand(storeName) {
    if (isStateArg(storeName)) {
      return defaultBrandFrom(mastersOfStateArg(storeName), arguments[1]);
    }
    var sn = storeName;
    return fetchMasters().then(function (m) { return defaultBrandFrom(m, sn); });
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  MUTATIONS / RAW ACCESSORS / IMPORT-EXPORT — OUT OF SCOPE for Phase 2b.  */
  /*  Kept UNCHANGED (sync, state-based) so masters-ui.js keeps working until  */
  /*  Phase 3 rewrites the admin/editor write path to async SQL. The byte-     */
  /*  identity harness does not exercise these.                               */
  /* ═══════════════════════════════════════════════════════════════════════ */

  function touch(state) {
    state.masters.updated_at = new Date().toISOString();
  }

  var api = {

    /* ── constants ─────────────────────────────────────────────────────── */
    GLOBAL_TYPES: GLOBAL_TYPES,
    LABELS: LABELS,

    labelFor: function (type) {
      return LABELS[type] || type;
    },

    /* ── pure helpers (sync) ───────────────────────────────────────────── */
    uid: uid,

    /* ── touch (sync; mutates passed state — admin path) ───────────────── */
    touch: touch,

    /* ── seeding (ASYNC, DB-backed) ────────────────────────────────────── */
    ensureSeeded: ensureSeeded,

    /* ═══════════════════ READ ACCESSORS (ASYNC, DB-backed) ═════════════ */
    /* Each also supports the legacy sync (state-arg) calling convention for  */
    /* backward-compat with the committed customers.js exemplar.             */
    storeNames: storeNames,
    globalList: globalList,
    reasonsTop: reasonsTop,
    reasonsAll: reasonsAll,
    categories: categories,
    subCategories: subCategories,
    brands: brands,
    defaultBrand: defaultBrand,

    /* ═══════════════════ RAW ACCESSORS (sync — admin path) ═════════════ */

    rawGlobal: function (state, type) {
      if (!state.masters || !state.masters[type]) return [];
      return state.masters[type];
    },

    rawStores: function (state) {
      if (!state.masters) return [];
      return state.masters.stores;
    },

    rawCatalog: function (state, storeName) {
      return getCatalog(state.masters, storeName);
    },

    rawCategories: function (state, storeName) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return [];
      return cat.categories;
    },

    rawBrands: function (state, storeName) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return [];
      return cat.brands;
    },

    /* ═══════════════════ MUTATIONS — GLOBALS (sync — admin path) ═══════ */

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

    /* ═══════════════════ MUTATIONS — STORES (sync — admin path) ════════ */

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

    /* ═══════════════════ MUTATIONS — CATEGORIES (sync — admin path) ════ */

    addCategory: function (state, storeName, name) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat || !name || !name.trim()) return null;
      if (isDuplicate(cat.categories, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true, subs: [] };
      cat.categories.push(item);
      this.touch(state);
      return item;
    },

    renameCategory: function (state, storeName, catId, name) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat || !name || !name.trim()) return;
      if (isDuplicate(cat.categories, name, catId)) return;
      var item = findById(cat.categories, catId);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleCategory: function (state, storeName, catId) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return;
      var item = findById(cat.categories, catId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — SUBS (sync — admin path) ══════════ */

    addSub: function (state, storeName, catId, name) {
      var cat = getCatalog(state.masters, storeName);
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
      var cat = getCatalog(state.masters, storeName);
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
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return;
      var catItem = findById(cat.categories, catId);
      if (!catItem) return;
      var item = findById(catItem.subs, subId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    /* ═══════════════════ MUTATIONS — BRANDS (sync — admin path) ════════ */

    addBrand: function (state, storeName, name) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat || !name || !name.trim()) return null;
      if (isDuplicate(cat.brands, name, null)) return null;
      var item = { id: uid(), name: name.trim(), active: true };
      cat.brands.push(item);
      this.touch(state);
      return item;
    },

    renameBrand: function (state, storeName, brandId, name) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat || !name || !name.trim()) return;
      if (isDuplicate(cat.brands, name, brandId)) return;
      var item = findById(cat.brands, brandId);
      if (!item) return;
      item.name = name.trim();
      this.touch(state);
    },

    toggleBrand: function (state, storeName, brandId) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return;
      var item = findById(cat.brands, brandId);
      if (!item) return;
      item.active = !item.active;
      this.touch(state);
    },

    setDefaultBrand: function (state, storeName, brandName) {
      var cat = getCatalog(state.masters, storeName);
      if (!cat) return;
      cat.defaultBrand = brandName || "";
      this.touch(state);
    },

    /* ═══════════════════ IMPORT / EXPORT (sync — admin path) ═══════════ */

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

  root.Masters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
