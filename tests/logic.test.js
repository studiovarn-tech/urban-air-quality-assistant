// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/logic.js");

test("categorize maps EPA AQI breakpoints correctly", () => {
  assert.equal(L.categorize(0).key, "good");
  assert.equal(L.categorize(50).key, "good");
  assert.equal(L.categorize(51).key, "moderate");
  assert.equal(L.categorize(100).key, "moderate");
  assert.equal(L.categorize(101).key, "usg");
  assert.equal(L.categorize(151).key, "unhealthy");
  assert.equal(L.categorize(201).key, "very_unhealthy");
  assert.equal(L.categorize(301).key, "hazardous");
  assert.equal(L.categorize(999).key, "hazardous");
});

test("categorize rejects invalid input", () => {
  assert.throws(() => L.categorize(-1), RangeError);
  assert.throws(() => L.categorize("abc"), RangeError);
});

test("sensitive households are bumped one band stricter", () => {
  const plain = L.effectiveCategory(120, {});
  const kids = L.effectiveCategory(120, { hasChildren: true });
  assert.equal(plain.key, "usg");
  assert.equal(kids.key, "unhealthy");
});

test("hazardous stays hazardous when bumped", () => {
  assert.equal(L.effectiveCategory(450, { hasAsthma: true }).key, "hazardous");
});

test("outdoor minutes shrink as air worsens", () => {
  assert.equal(L.outdoorMinutes("good"), 120);
  assert.equal(L.outdoorMinutes("moderate"), 60);
  assert.equal(L.outdoorMinutes("usg"), 30);
  assert.equal(L.outdoorMinutes("unhealthy"), 15);
  assert.equal(L.outdoorMinutes("very_unhealthy"), 0);
});

test("purifierCADR follows the 2/3 of room area rule", () => {
  // 20 m2 = 215.28 sq ft -> 2/3 = 143.5 -> 144 CFM
  assert.equal(L.purifierCADR(20), 144);
  assert.throws(() => L.purifierCADR(0), RangeError);
});

test("good air plan allows long outdoor time and no masks", () => {
  const p = L.buildPlan({ aqi: 30, profile: {} });
  assert.equal(p.effectiveKey, "good");
  assert.equal(p.outdoor.maxMinutesPerSession, 120);
  assert.equal(p.masks.length, 0);
  assert.equal(p.purchase, null);
});

test("hazardous plan forbids outdoor exertion and runs purifier", () => {
  const p = L.buildPlan({ aqi: 320, profile: { roomAreaM2: 25 } });
  assert.equal(p.outdoor.maxMinutesPerSession, 0);
  assert.ok(p.indoor.some((t) => /purifier/i.test(t)));
  assert.ok(p.indoor.some((t) => /candles/i.test(t)));
  assert.equal(p.purchase.minCADR, L.purifierCADR(25));
});

test("child-safe guidance: no N95 advice for babies is included", () => {
  const p = L.buildPlan({ aqi: 180, profile: { hasChildren: true } });
  assert.ok(p.masks.some((t) => /under 2/.test(t)));
});

test("asthma profile adds inhaler reminder", () => {
  const p = L.buildPlan({ aqi: 110, profile: { hasAsthma: true } });
  assert.ok(p.outdoor.tips.some((t) => /inhaler/i.test(t)));
});

test("plan always includes a non-empty routine list", () => {
  const p = L.buildPlan({ aqi: 500, profile: {} });
  assert.ok(p.routines.length > 0);
});

test("hazardous plan without a purifier suggests buying one instead", () => {
  const p = L.buildPlan({ aqi: 320, profile: { hasAirPurifier: false } });
  assert.ok(p.indoor.some((t) => /Consider a HEPA/.test(t)));
  assert.ok(!p.indoor.some((t) => /Run your air purifier/.test(t)));
});
