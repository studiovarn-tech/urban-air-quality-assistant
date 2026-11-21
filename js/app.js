(function () {
  "use strict";

  var L = window.AQLogic;
  var Loc = window.AQLocations;
  var STORAGE_KEY = "uaqa-state-v2";
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

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    city: $("city"),
    hint: $("location-hint"),
    locate: $("locate-btn"),
    heroPlace: $("hero-place"),
    heroAqi: $("hero-aqi"),
    heroCat: $("hero-cat"),
    heroSummary: $("hero-summary"),
    heroStatus: $("hero-status"),
    hero: $("hero"),
    dot: $("scale-dot"),
    plan: $("plan"),
    error: $("form-error"),
    room: $("roomAreaM2"),
    manual: $("aqi-manual"),
    clearManual: $("clear-manual"),
    theme: $("theme-toggle"),
    openSearch: $("open-search"),
    sheet: $("sheet"),
    backdrop: $("sheet-backdrop"),
    placeSearch: $("place-search"),
    results: $("search-results"),
    sheetLocate: $("sheet-locate"),
    sheetError: $("sheet-error"),
    sheetDone: $("sheet-done"),
    share: $("share-btn"),
    shareStatus: $("share-status")
  };

  var state = {
    cityId: Loc.DEFAULT_CITY_ID,
    coords: null,          // { lat, lon, name } when using a searched place or current location
    profile: {},
    manualAqi: null,
    theme: null,           // "light" | "dark" | null (follow system)
    onboarded: false       // true once the user has chosen a location in the sheet
  };
  var requestId = 0;
  var lastAQI = null;      // { aqi, time }

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = String(text);
    return d.innerHTML;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (Loc.findCity(saved.cityId)) state.cityId = saved.cityId;
        if (saved.coords && Loc.isValidCoord(saved.coords.lat, saved.coords.lon)) state.coords = saved.coords;
        if (saved.profile && typeof saved.profile === "object") state.profile = saved.profile;
        if (typeof saved.manualAqi === "number") state.manualAqi = saved.manualAqi;
        if (saved.theme === "light" || saved.theme === "dark") state.theme = saved.theme;
        if (saved.onboarded === true) state.onboarded = true;
      }
    } catch (e) { /* corrupt storage: start fresh */ }
  }

  function applyTheme() {
    if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  function currentPlace() {
    if (state.coords) return { name: state.coords.name || "Current location", lat: state.coords.lat, lon: state.coords.lon };
    var city = Loc.findCity(state.cityId);
    return { name: city.name + ", " + city.country, lat: city.lat, lon: city.lon };
  }

  function populateCities() {
    var html = "";
    if (state.coords) {
      html += '<option value="__current">' + esc(state.coords.name || "Current location") + "</option>";
    }
    Loc.CITIES.forEach(function (c) {
      html += '<option value="' + esc(c.id) + '">' + esc(c.name) + ", " + esc(c.country) + "</option>";
    });
    els.city.innerHTML = html;
    els.city.value = state.coords ? "__current" : state.cityId;
  }

  function setHeroColors(key) {
    var pair = HERO_COLORS[key] || HERO_COLORS.good;
    els.hero.style.setProperty("--hero-a", pair[0]);
    els.hero.style.setProperty("--hero-b", pair[1]);
  }

  function renderHero(aqiValue, status) {
    var place = currentPlace();
    els.heroPlace.textContent = place.name;
    els.heroStatus.textContent = status || "";
    if (aqiValue === null || aqiValue === undefined) {
      els.heroAqi.textContent = "--";
      els.heroCat.textContent = "No air data yet";
      els.heroSummary.textContent = "Choose a location or enter an AQI manually.";
      setHeroColors("good");
      els.dot.style.left = "0%";
      return null;
    }
    var cat = L.categorize(aqiValue);
    els.heroAqi.textContent = Math.round(aqiValue);
    els.heroCat.textContent = cat.label;
    els.heroSummary.textContent = cat.advice;
    setHeroColors(cat.key);
    els.dot.style.left = Math.min(100, (aqiValue / 500) * 100) + "%";
    return cat;
  }

  function sectionCard(key, title, bodyHtml) {
    return '<section class="card" aria-label="' + esc(title) + '">' +
      '<div class="plan-head"><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[key] + "</svg></span>" +
      esc(title) + "</div>" + '<div class="plan-body">' + bodyHtml + "</div></section>";
  }

  function list(items) {
    return "<ul>" + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }

  function renderPlan(aqiValue) {
    if (aqiValue === null || aqiValue === undefined) {
      els.plan.innerHTML = '<section class="card"><p class="empty">Your plan appears here once air data is available.</p></section>';
      return;
    }
    var plan = L.buildPlan({ aqi: aqiValue, profile: state.profile });
    var cards = [];

    var adjusted = plan.sensitiveHousehold && plan.effectiveCategory !== plan.measuredCategory
      ? '<p class="hint">Adjusted one level stricter for sensitive people at home.</p>' : "";
    cards.push(sectionCard("outdoor", "Outdoor routine",
      '<p class="best-window"><strong>Best window:</strong> ' + esc(plan.outdoor.bestWindow) + "</p>" +
      list(plan.outdoor.tips) + adjusted));

    cards.push(sectionCard("indoor", "Indoor air",
      list(plan.indoor.length ? plan.indoor : ["Air is clean enough for normal indoor routines."])));

    if (plan.masks.length) cards.push(sectionCard("masks", "Masks", list(plan.masks)));

    cards.push(sectionCard("commute", "Low-emission commute",
      list(plan.commute.length ? plan.commute : ["Walking, cycling or transit are good low-emission choices."])));

    cards.push(sectionCard("routines", "Today's routines", list(plan.routines)));

    if (plan.purchase) {
      cards.push(sectionCard("purchase", "Purifier size",
        '<p>For ' + esc(plan.purchase.roomAreaM2) + " m², aim for a CADR of at least <strong>" +
        esc(plan.purchase.minCADR) + " CFM</strong>.</p><p class=\"hint\">" + esc(plan.purchase.note) + "</p>"));
    }
    els.plan.innerHTML = cards.join("");
  }

  function refresh() {
    var manualValid = typeof state.manualAqi === "number" && state.manualAqi >= 0 && state.manualAqi <= 500;
    if (manualValid) {
      renderHero(state.manualAqi, "Manual reading");
      renderPlan(state.manualAqi);
      return;
    }
    renderHero(lastAQI ? lastAQI.aqi : null, lastAQI ? "Updated " + lastAQI.label + " · Open-Meteo" : "");
    renderPlan(lastAQI ? lastAQI.aqi : null);
  }

  function loadLiveAQI() {
    var id = ++requestId;
    var place = currentPlace();
    els.heroStatus.textContent = "Updating…";
    Loc.fetchCurrentAQI(place.lat, place.lon).then(function (result) {
      if (id !== requestId) return;
      var t = new Date();
      lastAQI = {
        aqi: result.aqi,
        label: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      refresh();
      showHint();
    }).catch(function () {
      if (id !== requestId) return;
      lastAQI = null;
      refresh();
      els.heroStatus.textContent = "Couldn't load live air data. Check your connection or enter AQI manually.";
    });
  }

  function showHint() {
    if (state.coords) {
      els.hint.textContent = "Lat " + state.coords.lat.toFixed(2) + ", Lon " + state.coords.lon.toFixed(2);
    } else {
      els.hint.textContent = "Live US AQI for the selected city";
    }
  }

  function setLocationById(value) {
    if (value === "__current") return;
    state.coords = null;
    state.cityId = value;
    populateCities();
    showHint();
    saveState();
    loadLiveAQI();
  }

  els.city.addEventListener("change", function () { setLocationById(els.city.value); });

  els.locate.addEventListener("click", function () {
    if (!navigator.geolocation) {
      els.error.textContent = "This browser cannot share your location.";
      return;
    }
    els.error.textContent = "";
    els.locate.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      els.locate.textContent = "Locate";
      state.coords = {
        lat: Number(pos.coords.latitude.toFixed(4)),
        lon: Number(pos.coords.longitude.toFixed(4)),
        name: "Current location"
      };
      populateCities();
      showHint();
      saveState();
      loadLiveAQI();
    }, function () {
      els.locate.textContent = "Locate";
      els.error.textContent = "Location permission was not granted. Pick a city instead.";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
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
    var v = raw === "" ? null : Number(raw);
    state.manualAqi = (v !== null && isFinite(v) && v >= 0 && v <= 500) ? v : null;
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
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    state.theme = dark ? "light" : "dark";
    applyTheme();
    saveState();
  });

  /* ---------- Location sheet (first run and "Search") ---------- */

  var pendingPlace = null;   // place chosen in the sheet, not yet applied
  var searchTimer = null;
  var searchId = 0;

  function setPlace(place) {
    state.coords = { lat: place.lat, lon: place.lon, name: place.name };
    populateCities();
    showHint();
    saveState();
    loadLiveAQI();
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
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result";
      btn.textContent = item.name;
      var sub = [item.region, item.country].filter(Boolean).join(", ");
      if (sub) {
        var small = document.createElement("small");
        small.textContent = sub;
        btn.appendChild(small);
      }
      btn.addEventListener("click", function () {
        pendingPlace = { name: sub ? item.name + ", " + sub : item.name, lat: item.lat, lon: item.lon };
        els.sheetError.textContent = "";
        els.sheetDone.disabled = false;
        els.results.querySelectorAll(".result").forEach(function (b) {
          b.style.fontWeight = b === btn ? "600" : "";
        });
      });
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
  els.backdrop.addEventListener("click", function () {
    if (state.onboarded) closeSheet();
  });
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
    if (!navigator.geolocation) {
      els.sheetError.textContent = "This browser cannot share your location. Search for a city instead.";
      return;
    }
    els.sheetError.textContent = "";
    navigator.geolocation.getCurrentPosition(function (pos) {
      pendingPlace = {
        name: "Current location",
        lat: Number(pos.coords.latitude.toFixed(4)),
        lon: Number(pos.coords.longitude.toFixed(4))
      };
      els.sheetDone.disabled = false;
      els.results.querySelectorAll(".result").forEach(function (b) { b.style.fontWeight = ""; });
    }, function () {
      els.sheetError.textContent = "Location permission was not granted. Search for a city instead.";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });

  els.sheetDone.addEventListener("click", function () {
    if (!pendingPlace) return;
    state.onboarded = true;
    setPlace(pendingPlace);
    closeSheet();
  });

  /* ---------- Share ---------- */

  function buildShareText() {
    var place = currentPlace();
    var manualValid = typeof state.manualAqi === "number";
    var aqi = manualValid ? state.manualAqi : (lastAQI ? lastAQI.aqi : null);
    if (aqi === null) return null;
    var plan = L.buildPlan({ aqi: aqi, profile: state.profile });
    var lines = [
      "Air in " + place.name + ": US AQI " + Math.round(aqi) + " (" + plan.effectiveCategory + ").",
      plan.summary,
      "Best outdoor window: " + plan.outdoor.bestWindow + "."
    ];
    if (plan.indoor.length) lines.push("Indoor tip: " + plan.indoor[0]);
    lines.push("Plan from Urban Air Quality Assistant: " + location.href.split("#")[0]);
    return lines.join("\n");
  }

  function setShareStatus(text) { els.shareStatus.textContent = text; }

  els.share.addEventListener("click", function () {
    var text = buildShareText();
    if (!text) { setShareStatus("Air data is needed before you can share."); return; }
    var title = "Today's air plan";
    if (navigator.share) {
      navigator.share({ title: title, text: text }).then(function () {
        setShareStatus("Shared.");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        copyFallback(text);
      });
    } else {
      copyFallback(text);
    }
  });

  function copyFallback(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setShareStatus("Plan copied to clipboard.");
      }).catch(function () { setShareStatus("Could not copy. Select the plan text manually."); });
    } else {
      setShareStatus("Sharing is not supported in this browser.");
    }
  }

  /* ---------- Start ---------- */

  loadState();
  applyTheme();
  populateCities();
  showHint();
  refresh();
  if (state.onboarded) {
    loadLiveAQI();
  } else {
    openSheet();
  }
})();
