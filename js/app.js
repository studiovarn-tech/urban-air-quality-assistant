(function () {
  "use strict";

  var form = document.getElementById("plan-form");
  var planEl = document.getElementById("plan");
  var errorEl = document.getElementById("form-error");
  var STORAGE_KEY = "uaqa-profile-v1";
  var BOOL_FIELDS = [
    "hasChildren", "hasOlderAdults", "hasAsthma",
    "hasHeartOrLungCondition", "pregnant", "hasPets", "hasAirPurifier"
  ];

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = String(text);
    return d.innerHTML;
  }

  function list(items) {
    return "<ul>" + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }

  function section(title, body) {
    return "<h3 style=\"font-size:1rem;margin:16px 0 4px\">" + esc(title) + "</h3>" + body;
  }

  function readProfile() {
    var data = new FormData(form);
    var profile = {};
    BOOL_FIELDS.forEach(function (name) {
      profile[name] = form.elements[name].checked;
    });
    var area = String(data.get("roomAreaM2") || "").trim();
    profile.roomAreaM2 = area ? Number(area) : null;
    return profile;
  }

  function saveProfile(aqiRaw, profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ aqi: aqiRaw, profile: profile }));
    } catch (e) {
      /* storage may be blocked (private mode); the app still works without it */
    }
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      BOOL_FIELDS.forEach(function (name) {
        if (saved.profile && typeof saved.profile[name] === "boolean") {
          form.elements[name].checked = saved.profile[name];
        }
      });
      if (saved.profile && saved.profile.roomAreaM2) {
        form.elements.roomAreaM2.value = saved.profile.roomAreaM2;
      }
    } catch (e) {
      /* ignore corrupt or unavailable storage */
    }
  }

  function render(plan) {
    var badge = "<span class=\"badge\" style=\"background:" + plan.color + "\">" +
      esc(plan.effectiveCategory) + "</span>";
    var html = "";
    html += "<p style=\"margin:0\">AQI " + esc(plan.aqi) + " " + badge + "</p>";
    if (plan.sensitiveHousehold && plan.effectiveCategory !== plan.measuredCategory) {
      html += "<p class=\"hint\">Adjusted one level stricter because of sensitive people at home.</p>";
    }
    html += "<p class=\"summary\">" + esc(plan.summary) + "</p>";

    html += section("Outdoor routine",
      "<p style=\"margin:4px 0\"><strong>Best window:</strong> " + esc(plan.outdoor.bestWindow) + "</p>" +
      list(plan.outdoor.tips));

    html += section("Indoor air hacks", list(plan.indoor.length ? plan.indoor : ["Air is clean enough for normal indoor routines."]));

    if (plan.masks.length) html += section("Masks", list(plan.masks));
    html += section("Low-emission commute", list(plan.commute.length ? plan.commute : ["Keep using clean travel options such as walking or transit."]));
    html += section("Today's routines", list(plan.routines));

    if (plan.purchase) {
      html += section("Purifier sizing",
        "<p style=\"margin:4px 0\">For " + esc(plan.purchase.roomAreaM2) + " m², aim for a CADR of at least <strong>" +
        esc(plan.purchase.minCADR) + " CFM</strong>. " + esc(plan.purchase.note) + "</p>");
    }
    planEl.innerHTML = html;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.textContent = "";
    var aqiRaw = String(new FormData(form).get("aqi") || "").trim();
    var aqi = Number(aqiRaw);
    if (aqiRaw === "" || !isFinite(aqi) || aqi < 0 || aqi > 500) {
      errorEl.textContent = "Enter an AQI between 0 and 500.";
      form.elements.aqi.focus();
      return;
    }
    var profile = readProfile();
    if (profile.roomAreaM2 !== null && (!isFinite(profile.roomAreaM2) || profile.roomAreaM2 <= 0)) {
      errorEl.textContent = "Room size must be a positive number.";
      form.elements.roomAreaM2.focus();
      return;
    }
    var plan = window.AQLogic.buildPlan({ aqi: aqi, profile: profile });
    render(plan);
    saveProfile(aqiRaw, profile);
  });

  loadProfile();
})();
