// Run with: node --test tests/locations.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Loc = require("../js/locations.js");

test("every preset city has valid coordinates and a unique id", () => {
  const ids = new Set();
  for (const c of Loc.CITIES) {
    assert.ok(Loc.isValidCoord(c.lat, c.lon), c.name);
    assert.ok(!ids.has(c.id), "duplicate id " + c.id);
    ids.add(c.id);
  }
});

test("default city exists in the preset list", () => {
  assert.ok(Loc.findCity(Loc.DEFAULT_CITY_ID));
  assert.equal(Loc.findCity("nowhere"), null);
});

test("isValidCoord rejects out-of-range values", () => {
  assert.equal(Loc.isValidCoord(91, 0), false);
  assert.equal(Loc.isValidCoord(0, 181), false);
  assert.equal(Loc.isValidCoord(NaN, 0), false);
  assert.equal(Loc.isValidCoord(-33.87, 151.21), true);
});

test("fetchCurrentAQI parses us_aqi and rounds it", async () => {
  const mockFetch = async (url) => {
    assert.match(url, /air-quality-api\.open-meteo\.com/);
    assert.match(url, /current=us_aqi/);
    return { ok: true, json: async () => ({ current: { us_aqi: 211.6, pm2_5: 84.8, time: "t" } }) };
  };
  const r = await Loc.fetchCurrentAQI(28.61, 77.21, mockFetch);
  assert.equal(r.aqi, 212);
  assert.equal(r.pm25, 84.8);
});

test("fetchCurrentAQI rejects on HTTP error", async () => {
  const mockFetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(Loc.fetchCurrentAQI(1, 1, mockFetch), /500/);
});

test("fetchCurrentAQI rejects when AQI is missing", async () => {
  const mockFetch = async () => ({ ok: true, json: async () => ({ current: {} }) });
  await assert.rejects(Loc.fetchCurrentAQI(1, 1, mockFetch), /No AQI/);
});

test("fetchCurrentAQI rejects invalid coordinates without fetching", async () => {
  let called = false;
  const mockFetch = async () => { called = true; };
  await assert.rejects(Loc.fetchCurrentAQI(200, 0, mockFetch), RangeError);
  assert.equal(called, false);
});
