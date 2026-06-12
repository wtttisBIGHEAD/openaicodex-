const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSettingsStore, maskApiKey, normalizeSettings, publicSettings } = require("../src/main/settings-service");

const DEFAULT_SETTINGS = {
  provider: "codex",
  deepseekApiKey: "",
  displayMode: "full",
  windowBounds: {
    full: null,
    mini: null
  },
  theme: "glass",
  opacity: 0.82,
  autoRefreshMins: 30
};

test("loads default settings when no file exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-settings-"));
  const store = createSettingsStore(dir);

  assert.deepEqual(store.load(), DEFAULT_SETTINGS);
});

test("saves normalized provider, api key, window, and appearance settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-settings-"));
  const store = createSettingsStore(dir);

  const saved = store.save({
    provider: "deepseek",
    deepseekApiKey: "  sk-test  ",
    displayMode: "mini",
    windowBounds: {
      full: { x: 10, y: 20, width: 390, height: 300 },
      mini: { x: 30, y: 40, width: 112, height: 48 }
    },
    theme: "minimal",
    opacity: 0.66,
    autoRefreshMins: 15
  });

  assert.deepEqual(saved, {
    provider: "deepseek",
    deepseekApiKey: "sk-test",
    displayMode: "mini",
    windowBounds: {
      full: { x: 10, y: 20, width: 390, height: 300 },
      mini: { x: 30, y: 40, width: 112, height: 48 }
    },
    theme: "minimal",
    opacity: 0.66,
    autoRefreshMins: 15
  });
  assert.deepEqual(store.load(), saved);
});

test("normalizes old settings files without new fields", () => {
  assert.deepEqual(
    normalizeSettings({
      provider: "deepseek",
      deepseekApiKey: "sk-old"
    }),
    {
      ...DEFAULT_SETTINGS,
      provider: "deepseek",
      deepseekApiKey: "sk-old"
    }
  );
});

test("clamps invalid display and appearance settings", () => {
  const normalized = normalizeSettings({
    displayMode: "tiny",
    theme: "rainbow",
    opacity: 0.1,
    autoRefreshMins: 999,
    windowBounds: {
      full: { x: "bad", y: 20, width: 10, height: 10 },
      mini: { x: 30.8, y: 40.2, width: 112.9, height: 48.1 }
    }
  });

  assert.equal(normalized.displayMode, "full");
  assert.equal(normalized.theme, "glass");
  assert.equal(normalized.opacity, 0.6);
  assert.equal(normalized.autoRefreshMins, 30);
  assert.equal(normalized.windowBounds.full, null);
  assert.deepEqual(normalized.windowBounds.mini, { x: 31, y: 40, width: 113, height: 48 });
});

test("public settings include appearance without leaking the api key", () => {
  const result = publicSettings({
    ...DEFAULT_SETTINGS,
    deepseekApiKey: "sk-1234567890",
    displayMode: "mini",
    theme: "dark",
    opacity: 0.9,
    autoRefreshMins: 60
  });

  assert.equal(result.hasDeepseekApiKey, true);
  assert.equal(result.maskedDeepseekApiKey, "sk-...7890");
  assert.equal(result.deepseekApiKey, undefined);
  assert.equal(result.displayMode, "mini");
  assert.equal(result.theme, "dark");
  assert.equal(result.opacity, 0.9);
  assert.equal(result.autoRefreshMins, 60);
});

test("allows disabling auto refresh", () => {
  assert.equal(normalizeSettings({ autoRefreshMins: 0 }).autoRefreshMins, 0);
});

test("masks api keys without leaking the full value", () => {
  assert.equal(maskApiKey("sk-1234567890"), "sk-...7890");
  assert.equal(maskApiKey(""), "");
});
