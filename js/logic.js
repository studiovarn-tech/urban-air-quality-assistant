/**
 * Urban Air Quality Assistant - pure logic (no DOM).
 * Works in the browser (attaches to window.AQLogic) and in Node (module.exports).
 *
 * AQI bands follow the US EPA Air Quality Index breakpoints.
 */
(function (root) {
  "use strict";

  // EPA AQI categories. "max" is the inclusive upper bound of the band.
  var CATEGORIES = [
    { max: 50, key: "good", label: "Good", color: "#2e7d32", advice: "Air quality is satisfactory. Enjoy normal outdoor activity." },
    { max: 100, key: "moderate", label: "Moderate", color: "#f9a825", advice: "Acceptable for most people. Unusually sensitive people should consider reducing prolonged exertion." },
    { max: 150, key: "usg", label: "Unhealthy for Sensitive Groups", color: "#ef6c00", advice: "Sensitive groups should reduce prolonged or heavy outdoor exertion." },
    { max: 200, key: "unhealthy", label: "Unhealthy", color: "#c62828", advice: "Everyone should reduce prolonged or heavy outdoor exertion. Sensitive groups should avoid it." },
    { max: 300, key: "very_unhealthy", label: "Very Unhealthy", color: "#6a1b9a", advice: "Avoid outdoor exertion. Stay indoors with clean air where possible." },
    { max: 500, key: "hazardous", label: "Hazardous", color: "#4e0000", advice: "Health emergency conditions. Stay indoors, seal the home as much as possible and follow local health guidance." }
  ];

  var ORDER = CATEGORIES.map(function (c) { return c.key; });

  function categorize(aqi) {
    var value = Number(aqi);
    if (!isFinite(value) || value < 0) {
      throw new RangeError("AQI must be a non-negative number");
    }
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (value <= CATEGORIES[i].max) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
  }

  /**
   * Sensitive households (young children, older adults, asthma, heart or lung
   * disease, pregnancy) get guidance one band stricter than the raw AQI.
   */
  function effectiveCategory(aqi, profile) {
    var base = categorize(aqi);
    if (!isSensitive(profile)) return base;
    var idx = ORDER.indexOf(base.key);
    var bumped = Math.min(idx + 1, ORDER.length - 1);
    return CATEGORIES[bumped];
  }

  function isSensitive(profile) {
    if (!profile) return false;
    return !!(
      profile.hasChildren ||
      profile.hasOlderAdults ||
      profile.hasAsthma ||
      profile.hasHeartOrLungCondition ||
      profile.pregnant
    );
  }

  /** Winter smog usually peaks in the early morning and evening rush; midday is often cleaner. */
  function bestOutdoorWindow(profile) {
    if (profile && profile.hasChildren) {
      return "Midday (roughly 11:00 to 15:00), when air often clears after the morning inversion";
    }
    return "Midday (roughly 11:00 to 15:00). Avoid early morning and the 17:00 to 20:00 traffic peak";
  }

  /** Minutes of outdoor activity allowed per session, by effective band. */
  function outdoorMinutes(key) {
    switch (key) {
      case "good": return 120;
      case "moderate": return 60;
      case "usg": return 30;
      case "unhealthy": return 15;
      default: return 0;
    }
  }

  /**
   * Estimate the clean-air delivery rate (CADR, cubic feet per minute) an air
   * purifier needs for a room. AHAM guidance: CADR >= 2/3 of room area in sq ft.
   */
  function purifierCADR(roomAreaM2) {
    var area = Number(roomAreaM2);
    if (!isFinite(area) || area <= 0) throw new RangeError("Room area must be positive");
    var sqft = area * 10.7639;
    return Math.ceil((2 / 3) * sqft);
  }

  function buildPlan(input) {
    var aqi = Number(input.aqi);
    var profile = input.profile || {};
    var base = categorize(aqi);
    var eff = effectiveCategory(aqi, profile);
    var sensitive = isSensitive(profile);
    var poor = ORDER.indexOf(eff.key) >= ORDER.indexOf("unhealthy");
    var moderateOrWorse = ORDER.indexOf(eff.key) >= ORDER.indexOf("moderate");
    var usgOrWorse = ORDER.indexOf(eff.key) >= ORDER.indexOf("usg");

    var outdoor = {
      maxMinutesPerSession: outdoorMinutes(eff.key),
      bestWindow: bestOutdoorWindow(profile),
      tips: []
    };
    if (outdoor.maxMinutesPerSession === 0) {
      outdoor.tips.push("Skip outdoor play and exercise. Move activity indoors.");
    } else {
      outdoor.tips.push("Limit outdoor sessions to about " + outdoor.maxMinutesPerSession + " minutes.");
    }
    if (usgOrWorse) {
      outdoor.tips.push("Choose lower-intensity activity such as walking instead of running or cycling.");
    }
    if (profile.hasAsthma) {
      outdoor.tips.push("Keep the reliever inhaler with you and follow your asthma action plan.");
    }
    if (profile.hasChildren && moderateOrWorse) {
      outdoor.tips.push("Plan school pick-up and play for midday rather than the morning rush.");
    }

    var indoor = [];
    if (moderateOrWorse) {
      indoor.push("Keep windows and doors closed during high-pollution hours.");
    }
    if (poor) {
      if (profile.hasAirPurifier === false) {
        indoor.push("Consider a HEPA air purifier for the main living area and bedrooms (see purifier sizing below).");
      } else {
        indoor.push("Run your air purifier on its highest safe setting in the main living area and bedrooms.");
      }
      indoor.push("Avoid candles, incense, fireplaces and wood burning until the air improves.");
      indoor.push("Use the range hood when cooking, and do not open windows for ventilation while outdoor air is this poor.");
    }
    if (moderateOrWorse) {
      indoor.push("Vacuum with a HEPA-filter vacuum and damp-wipe surfaces instead of dry dusting.");
      indoor.push("Keep indoor humidity between 30 and 50 percent, and avoid smoking indoors.");
    }
    if (eff.key === "good") {
      indoor.push("Open windows for 10 to 15 minutes midday to refresh indoor air.");
    }
    if (profile.hasPets) {
      indoor.push("Wipe pets' paws and coats after walks, since they carry fine particles indoors.");
    }

    var masks = [];
    if (usgOrWorse) {
      masks.push("When outdoors for longer periods, wear a well-fitted N95 / FFP2 respirator (adults and older children who can wear one comfortably).");
      masks.push("Do not use N95 masks for babies under 2. Keep children in clean indoor spaces.");
    }

    var commute = [];
    if (moderateOrWorse) {
      commute.push("Use car recirculation mode and keep windows closed in traffic.");
      commute.push("Avoid idling. Switch off the engine when waiting for more than a minute.");
    }
    if (poor) {
      commute.push("Prefer rail or bus routes with cleaner air over busy roads, or stay home if the trip is optional.");
      commute.push("Combine errands into one trip so you start the car less often.");
    }
    if (eff.key === "good" || eff.key === "moderate") {
      commute.push("Walking, cycling or transit are good low-emission choices for short trips.");
    }

    var routines = [];
    routines.push("Batch errands into a single trip to cut cold-start emissions.");
    if (!poor) routines.push("Plan one active outdoor session today during the best window.");
    if (profile.hasAirPurifier !== false) {
      routines.push("Pre-run the purifier for 30 minutes before the family returns home.");
    }

    var purchase = null;
    if (profile.roomAreaM2) {
      purchase = {
        roomAreaM2: Number(profile.roomAreaM2),
        minCADR: purifierCADR(profile.roomAreaM2),
        note: "Look for a HEPA purifier whose rated CADR for smoke or dust is at least this value."
      };
    }

    return {
      aqi: aqi,
      measuredCategory: base.label,
      effectiveCategory: eff.label,
      effectiveKey: eff.key,
      color: eff.color,
      summary: eff.advice,
      sensitiveHousehold: sensitive,
      outdoor: outdoor,
      indoor: indoor,
      masks: masks,
      commute: commute,
      routines: routines,
      purchase: purchase
    };
  }

  var api = {
    CATEGORIES: CATEGORIES,
    categorize: categorize,
    effectiveCategory: effectiveCategory,
    isSensitive: isSensitive,
    bestOutdoorWindow: bestOutdoorWindow,
    outdoorMinutes: outdoorMinutes,
    purifierCADR: purifierCADR,
    buildPlan: buildPlan
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AQLogic = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
