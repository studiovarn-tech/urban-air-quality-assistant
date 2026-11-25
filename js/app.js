/**
 * Interface controller: state, location flow, rendering, storage and sharing.
 * All advice comes from window.AQLogic; all air data from window.AQLocations.
 */
(function () {
  "use strict";

  var L = window.AQLogic;
  var Loc = window.AQLocations;

  var STORAGE_KEY = "uaqa-state-v2";
  var CURRENT_OPTION = "__current";
  var GEO_OPTIONS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 };
  var BOOL_FIELDS = [
    "hasChildren", "hasOlderAdults", "hasAsthma",
    "hasHeartOrLungCondition", "pregnant", "hasPets", "hasAirPurifier"
  ];

  // Gradient pairs per AQI category key, used by the hero card.
  var HERO_COLORS = {
    good: ["#34c759", "#248a3d"],
    moderate: ["#ffcc00", "#c79a00"],
    usg: ["#ff9500", "#c76a00"],
    unhealthy: ["#ff3b30", "#b0231b"],
    very_unhealthy: ["#af52de", "#7a2fa3"],
    hazardous: ["#7d0023", "#3d0012"]
  };

  // Simple stroke icons (24x24 viewBox) for each plan card.
  var ICONS = {
    outdoor: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    indoor: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    masks: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    commute: '<path d="M5 16l1.5-5h11L19 16M5 16v3M19 16v3M3 16h18M7 11l1-3h8l1 3"/>',
    routines: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    purchase: '<path d="M9.5 4.5a2.5 2.5 0 0 1 5 0M5 9h14M6 9l1 11h10l1-11"/>'
  };

  function $(id) { return document.getElementById(id); }

  var els = {
    city: $("city"),
    hint: $("location-hint"),
    locate: $("locate-btn"),
    openSearch: $("open-search"),
    heroPlace: $("hero-place"),
    heroAqi: $("hero-aqi"),
    heroCat: $("hero-cat"),
    heroSummary: $("hero-summary"),
    heroStatus: $("hero-status"),
    hero: $("hero"),
    dot: $("scale-dot"),
    share: $("share-btn"),
    shareStatus: $("share-status"),
    plan: $("plan"),
    error: $("form-error"),
    room: $("roomAreaM2"),
    manual: $("aqi-manual"),
    clearManual: $("clear-manual"),
    theme: $("theme-toggle"),
    sheet: $("sheet"),
    backdrop: $("sheet-backdrop"),
    placeSearch: $("place-search"),
    results: $("search-results"),
    sheetLocate: $("sheet-locate"),
    sheetError: $("sheet-error"),
    sheetDone: $("sheet-done")
  };

  var state = {
    cityId: Loc.DEFAULT_CITY_ID,
    coords: null,      // { lat, lon, name } for a searched place or current location
    profile: {},
    manualAqi: null,   // user-entered AQI, overrides live data when valid
    theme: null,       // "light" | "dark" | null (follow system)
    onboarded: false   // true once the user has chosen a location in the sheet
  };
  var lastAQI = null;  // { aqi, updated } from the live service, or null
  var requestId = 0;   // guards against out-of-order live-data responses
  var pendingPlace = null;
  var searchTimer = null;
  var searchId = 0;

  /* ---------- Small helpers ---------- */

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = String(text);
    return d.innerHTML;
  }

  function list(items) {
    return "<ul>" + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }

  function sectionCard(iconKey, title, bodyHtml) {
    return '<section class="card" aria-label="' + esc(title) + '">' +
      '<div class="plan-head"><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      ICONS[iconKey] + "</svg></span>" + esc(title) + "</div>" +
      '<div class="plan-body">' + bodyHtml + "</div></section>";
  }

  function round4(n) { return Number(n.toFixed(4)); }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function hasManualAQI() { return L.isValidAQI(state.manualAqi); }

  /* ---------- Persistence and theme ---------- */

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (Loc.findCity(saved.cityId)) state.cityId = saved.cityId;
      if (saved.coords && Loc.isValidCoord(saved.coords.lat, saved.coords.lon)) state.coords = saved.coords;
      if (saved.profile && typeof saved.profile === "object") state.profile = saved.profile;
      if (L.isValidAQI(saved.manualAqi)) state.manualAqi = saved.manualAqi;
      if (saved.theme === "light" || saved.theme === "dark") state.theme = saved.theme;
      if (saved.onboarded === true) state.onboarded = true;
    } catch (e) { /* corrupt storage: start fresh */ }
  }

  function applyTheme() {
    if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  function isDarkNow() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /* ---------- Location ---------- */

  function currentPlace() {
    if (state.coords) {
      return { name: state.coords.name || "Current location", lat: state.coords.lat, lon: state.coords.lon };
    }
    var city = Loc.findCity(state.cityId);
    return { name: city.name + ", " + city.country, lat: city.lat, lon: city.lon };
  }

  function populateCities() {
    var html = "";
    if (state.coords) {
      html += '<option value="' + CURRENT_OPTION + '">' + esc(state.coords.name || "Current location") + "</option>";
    }
    Loc.CITIES.forEach(function (c) {
      html += '<option value="' + esc(c.id) + '">' + esc(c.name) + ", " + esc(c.country) + "</option>";
    });
    els.city.innerHTML = html;
    els.city.value = state.coords ? CURRENT_OPTION : state.cityId;
  }

  function showHint() {
    els.hint.textContent = state.coords
      ? "Lat " + state.coords.lat.toFixed(2) + ", Lon " + state.coords.lon.toFixed(2)
      : "Live US AQI for the selected city";
  }

  /** Calls onFound({ lat, lon, name }) or onFail(message). */
  function requestPosition(onFound, onFail) {
    if (!navigator.geolocation) {
      onFail("This browser cannot share your location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      onFound({ lat: round4(pos.coords.latitude), lon: round4(pos.coords.longitude), name: "Current location" });
    }, function () {
      onFail("Location permission was not granted.");
    }, GEO_OPTIONS);
  }

  /** Applies the location already set on state: updates the picker and fetches AQI. */
  function commitLocation() {
    populateCities();
    showHint();
    saveState();
    loadLiveAQI();
  }

  /* ---------- Air data and rendering ---------- */

  /** The reading to show: a valid manual AQI wins over live data. */
  function currentAQI() {
    if (hasManualAQI()) return { aqi: state.manualAqi, status: "Manual reading" };
    if (lastAQI) return { aqi: lastAQI.aqi, status: "Updated " + lastAQI.updated + " · Open-Meteo" };
    return { aqi: null, status: "" };
  }

  function setHeroColors(key) {
    var pair = HERO_COLORS[key] || HERO_COLORS.good;
    els.hero.style.setProperty("--hero-a", pair[0]);
    els.hero.style.setProperty("--hero-b", pair[1]);
  }

  function renderHero(reading) {
    els.heroPlace.textContent = currentPlace().name;
    els.heroStatus.textContent = reading.status;
    if (reading.aqi === null) {
      els.heroAqi.textContent = "--";
      els.heroCat.textContent = "No air data yet";
      els.heroSummary.textContent = "Choose a location or enter an AQI manually.";
      setHeroColors("good");
      els.dot.style.left = "0%";
      return;
    }
    var cat = L.categorize(reading.aqi);
    els.heroAqi.textContent = Math.round(reading.aqi);
    els.heroCat.textContent = cat.label;
    els.heroSummary.textContent = cat.advice;
    setHeroColors(cat.key);
    els.dot.style.left = Math.min(100, (reading.aqi / L.MAX_AQI) * 100) + "%";
  }

  function impactHtml(impact) {
    var purifier = impact.purifierCADR ? ", purifier target " + esc(impact.purifierCADR) + " CFM" : "";
    return '<p style="margin:4px 0 0;font-weight:600">' + esc(impact.headline) + "</p>" +
      '<p class="best-window">' + esc(impact.actionsToday) + " actions planned for today" + purifier + ".</p>";
  }

  function outdoorHtml(plan) {
    var adjusted = plan.sensitiveHousehold && plan.effectiveCategory !== plan.measuredCategory
      ? '<p class="hint">Adjusted one level stricter for sensitive people at home.</p>'
      : "";
    return '<p class="best-window"><strong>Best window:</strong> ' + esc(plan.outdoor.bestWindow) + "</p>" +
      list(plan.outdoor.tips) + adjusted;
  }

  function renderPlan(aqi) {
    if (aqi === null) {
      els.plan.innerHTML = '<section class="card"><p class="empty">Your plan appears here once air data is available.</p></section>';
      return;
    }
    var plan = L.buildPlan({ aqi: aqi, profile: state.profile });
    var schedule = L.buildSchedule({ plan: plan, profile: state.profile });
    var cards = [
      sectionCard("routines", "Impact today", impactHtml(L.buildImpact({ plan: plan }))),
      sectionCard("outdoor", "Your day", list(schedule.map(function (s) { return s.time + "  ·  " + s.text; }))),
      sectionCard("outdoor", "Outdoor routine", outdoorHtml(plan)),
      sectionCard("indoor", "Indoor air", list(plan.indoor.length ? plan.indoor : ["Air is clean enough for normal indoor routines."]))
    ];
    if (plan.masks.length) cards.push(sectionCard("masks", "Masks", list(plan.masks)));
    cards.push(sectionCard("commute", "Low-emission commute",
      list(plan.commute.length ? plan.commute : ["Walking, cycling or transit are good low-emission choices."])));
    cards.push(sectionCard("routines", "Today's routines", list(plan.routines)));
    if (plan.purchase) {
      cards.push(sectionCard("purchase", "Purifier size",
        "<p>For " + esc(plan.purchase.roomAreaM2) + " m², aim for a CADR of at least <strong>" +
        esc(plan.purchase.minCADR) + " CFM</strong>.</p>" +
        '<p class="hint">' + esc(plan.purchase.note) + "</p>"));
    }
    els.plan.innerHTML = cards.join("");
  }

  function refresh() {
    var reading = currentAQI();
    renderHero(reading);
    renderPlan(reading.aqi);
  }

  /** Shows a live-data status line unless a manual reading is being used. */
  function setLiveStatus(text) {
    if (!hasManualAQI()) els.heroStatus.textContent = text;
  }

  function loadLiveAQI() {
    var id = ++requestId;
    lastAQI = null;
    refresh();
    setLiveStatus("Updating…");
    var place = currentPlace();
    Loc.fetchCurrentAQI(place.lat, place.lon).then(function (result) {
      if (id !== requestId) return;
      lastAQI = { aqi: result.aqi, updated: formatTime(new Date()) };
      refresh();
    }).catch(function () {
      if (id !== requestId) return;
      refresh();
      setLiveStatus("Couldn't load live air data. Check your connection or enter AQI manually.");
    });
  }

  // Restore saved state before the controls below read from it.
  loadState();
  applyTheme();

  /* ---------- Main controls ---------- */

  els.city.addEventListener("change", function () {
    if (els.city.value === CURRENT_OPTION) return;
    state.coords = null;
    state.cityId = els.city.value;
    commitLocation();
  });

  els.locate.addEventListener("click", function () {
    els.error.textContent = "";
    els.locate.textContent = "Locating…";
    requestPosition(function (coords) {
      els.locate.textContent = "Locate";
      state.coords = coords;
      commitLocation();
    }, function (message) {
      els.locate.textContent = "Locate";
      els.error.textContent = message + " Pick a city instead.";
    });
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
    var name = box.name;
    if (BOOL_FIELDS.indexOf(name) === -1) return;
    box.checked = !!state.profile[name];
    box.addEventListener("change", function () {
      state.profile[name] = box.checked;
      saveState();
      refresh();
    });
  });

  els.room.value = state.profile.roomAreaM2 || "";
  els.room.addEventListener("input", function () {
    var raw = els.room.value.trim();
    var area = raw ? Number(raw) : null;
    if (area !== null && (!isFinite(area) || area <= 0)) {
      els.error.textContent = "Room size must be a positive number.";
      return;
    }
    els.error.textContent = "";
    state.profile.roomAreaM2 = area;
    saveState();
    refresh();
  });

  if (state.manualAqi !== null) els.manual.value = state.manualAqi;
  els.manual.addEventListener("input", function () {
    var raw = els.manual.value.trim();
    var value = raw === "" ? NaN : Number(raw);
    state.manualAqi = L.isValidAQI(value) ? value : null;
    saveState();
    refresh();
  });
  els.clearManual.addEventListener("click", function () {
    els.manual.value = "";
    state.manualAqi = null;
    saveState();
    refresh();
  });

  els.theme.addEventListener("click", function () {
    state.theme = isDarkNow() ? "light" : "dark";
    applyTheme();
    saveState();
  });

  /* ---------- Location sheet (first visit and "Search") ---------- */

  function choosePlace(place, activeButton) {
    pendingPlace = place;
    els.sheetError.textContent = "";
    els.sheetDone.disabled = false;
    els.results.querySelectorAll(".result").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b === activeButton));
    });
  }

  function renderResults(items, emptyText) {
    els.results.innerHTML = "";
    if (!items.length) {
      if (emptyText) {
        var p = document.createElement("p");
        p.className = "hint";
        p.textContent = emptyText;
        els.results.appendChild(p);
      }
      return;
    }
    items.forEach(function (item) {
      var sub = [item.region, item.country].filter(Boolean).join(", ");
      var place = { name: sub ? item.name + ", " + sub : item.name, lat: item.lat, lon: item.lon };
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = item.name;
      if (sub) {
        var small = document.createElement("small");
        small.textContent = sub;
        btn.appendChild(small);
      }
      btn.addEventListener("click", function () { choosePlace(place, btn); });
      els.results.appendChild(btn);
    });
  }

  function showPresets() {
    renderResults(Loc.CITIES.map(function (c) {
      return { name: c.name, region: "", country: c.country, lat: c.lat, lon: c.lon };
    }), "");
  }

  function openSheet() {
    pendingPlace = null;
    els.sheetDone.disabled = true;
    els.sheetError.textContent = "";
    els.placeSearch.value = "";
    showPresets();
    els.backdrop.hidden = false;
    els.sheet.hidden = false;
    setTimeout(function () { els.placeSearch.focus(); }, 50);
  }

  function closeSheet() {
    els.sheet.hidden = true;
    els.backdrop.hidden = true;
  }

  els.openSearch.addEventListener("click", openSheet);
  els.backdrop.addEventListener("click", function () { if (state.onboarded) closeSheet(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.sheet.hidden && state.onboarded) closeSheet();
  });

  els.placeSearch.addEventListener("input", function () {
    var q = els.placeSearch.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { showPresets(); return; }
    searchTimer = setTimeout(function () {
      var id = ++searchId;
      Loc.searchPlaces(q).then(function (places) {
        if (id !== searchId) return;
        renderResults(places, "No places found for “" + q + "”.");
      }).catch(function () {
        if (id !== searchId) return;
        renderResults([], "Search is unavailable right now. Try again or use your current location.");
      });
    }, 300);
  });

  els.sheetLocate.addEventListener("click", function () {
    els.sheetError.textContent = "";
    requestPosition(function (coords) {
      choosePlace(coords, null);
    }, function (message) {
      els.sheetError.textContent = message + " Search for a city instead.";
    });
  });

  els.sheetDone.addEventListener("click", function () {
    if (!pendingPlace) return;
    state.onboarded = true;
    state.coords = pendingPlace;
    closeSheet();
    commitLocation();
  });

  /* ---------- Share ---------- */

  function buildShareText() {
    var reading = currentAQI();
    if (reading.aqi === null) return null;
    var place = currentPlace();
    var plan = L.buildPlan({ aqi: reading.aqi, profile: state.profile });
    var lines = [
      "Air in " + place.name + ": US AQI " + Math.round(reading.aqi) + " (" + plan.effectiveCategory + ").",
      plan.summary,
      "Best outdoor window: " + plan.outdoor.bestWindow + "."
    ];
    if (plan.indoor.length) lines.push("Indoor tip: " + plan.indoor[0]);
    lines.push("Plan from Urban Air Quality Assistant: " + location.href.split("#")[0]);
    return lines.join("\n");
  }

  function setShareStatus(text) { els.shareStatus.textContent = text; }

  function copyPlan(text) {
    if (!(navigator.clipboard && navigator.clipboard.writeText)) {
      setShareStatus("Sharing is not supported in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      setShareStatus("Plan copied to clipboard.");
    }).catch(function () {
      setShareStatus("Could not copy. Select the plan text manually.");
    });
  }

  els.share.addEventListener("click", function () {
    var text = buildShareText();
    if (!text) { setShareStatus("Air data is needed before you can share."); return; }
    if (!navigator.share) { copyPlan(text); return; }
    navigator.share({ title: "Today's air plan", text: text }).then(function () {
      setShareStatus("Shared.");
    }).catch(function (err) {
      if (!err || err.name !== "AbortError") copyPlan(text);
    });
  });

  /* ---------- Start ---------- */

  populateCities();
  showHint();
  refresh();
  if (state.onboarded) {
    loadLiveAQI();
  } else {
    openSheet();
  }
})();
