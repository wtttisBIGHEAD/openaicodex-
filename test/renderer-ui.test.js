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
