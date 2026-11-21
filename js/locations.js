/**
 * Preset cities for the location picker, plus a helper that fetches the
 * current US AQI for coordinates from the Open-Meteo Air Quality API
 * (free, no API key). Works in the browser and in Node.
 */
(function (root) {
  "use strict";

  var CITIES = [
    { id: "delhi", name: "New Delhi", country: "India", lat: 28.61, lon: 77.21 },
    { id: "lahore", name: "Lahore", country: "Pakistan", lat: 31.55, lon: 74.34 },
    { id: "kolkata", name: "Kolkata", country: "India", lat: 22.57, lon: 88.36 },
    { id: "mumbai", name: "Mumbai", country: "India", lat: 19.08, lon: 72.88 },
    { id: "dhaka", name: "Dhaka", country: "Bangladesh", lat: 23.81, lon: 90.41 },
    { id: "karachi", name: "Karachi", country: "Pakistan", lat: 24.86, lon: 67.01 },
    { id: "kathmandu", name: "Kathmandu", country: "Nepal", lat: 27.72, lon: 85.32 },
    { id: "beijing", name: "Beijing", country: "China", lat: 39.9, lon: 116.41 },
    { id: "seoul", name: "Seoul", country: "South Korea", lat: 37.57, lon: 126.98 },
    { id: "tokyo", name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69 },
    { id: "krakow", name: "Kraków", country: "Poland", lat: 50.06, lon: 19.94 },
    { id: "london", name: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 },
    { id: "new-york", name: "New York", country: "United States", lat: 40.71, lon: -74.01 }
  ];

  var DEFAULT_CITY_ID = "delhi";

  function findCity(id) {
    for (var i = 0; i < CITIES.length; i++) {
      if (CITIES[i].id === id) return CITIES[i];
    }
    return null;
  }

  function isValidCoord(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  /**
   * Resolves to { aqi, pm25, time } for the given coordinates.
   * Rejects if the request fails or the response has no AQI value.
   */
  function fetchCurrentAQI(lat, lon, fetchImpl) {
    if (!isValidCoord(lat, lon)) {
      return Promise.reject(new RangeError("Invalid coordinates"));
    }
    var doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) return Promise.reject(new Error("fetch is not available"));
    var url = "https://air-quality-api.open-meteo.com/v1/air-quality" +
      "?latitude=" + encodeURIComponent(lat.toFixed(4)) +
      "&longitude=" + encodeURIComponent(lon.toFixed(4)) +
      "&current=us_aqi,pm2_5&timezone=auto";
    return doFetch(url).then(function (res) {
      if (!res.ok) throw new Error("Air data request failed (" + res.status + ")");
      return res.json();
    }).then(function (body) {
      var current = body && body.current;
      if (!current || typeof current.us_aqi !== "number") {
        throw new Error("No AQI in response");
      }
      return { aqi: Math.round(current.us_aqi), pm25: current.pm2_5, time: current.time };
    });
  }

  var api = {
    CITIES: CITIES,
    DEFAULT_CITY_ID: DEFAULT_CITY_ID,
    findCity: findCity,
    isValidCoord: isValidCoord,
    fetchCurrentAQI: fetchCurrentAQI
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AQLocations = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
