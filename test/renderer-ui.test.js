const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "index.html"), "utf8");
const rendererJs = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");
const preloadJs = fs.readFileSync(path.join(__dirname, "..", "src", "main", "preload.js"), "utf8");
const mainJs = fs.readFileSync(path.join(__dirname, "..", "src", "main", "main.js"), "utf8");

test("trend chart UI and IPC are not exposed", () => {
  assert.doesNotMatch(indexHtml, /trendChart|trend-panel|趋势图/);
  assert.doesNotMatch(rendererJs, /trendChart|refreshTrend|renderTrend|getHistory/);
  assert.doesNotMatch(preloadJs, /getHistory/);
  assert.doesNotMatch(mainJs, /history:get/);
});

test("mini mode has a compact forecast target", () => {
  assert.match(indexHtml, /id="miniForecast"/);
  assert.match(rendererJs, /miniForecast/);
  assert.match(rendererJs, /formatForecastDisplay/);
  assert.match(rendererJs, /formatMiniForecast/);
});

test("forecast estimate UI omits sampling confidence details", () => {
  assert.doesNotMatch(indexHtml, /forecastPrimaryMeta|forecastSecondaryMeta|forecast-meta/);
  assert.doesNotMatch(rendererJs, /forecastPrimaryMeta|forecastSecondaryMeta|setForecastMeta|confidenceLabel/);
  assert.doesNotMatch(rendererJs, /\$\{base\}\s*·\s*\$\{item\.meta\?\.confidenceLabel\}/);
});
