const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSettingsStore, maskApiKey } = require("../src/main/settings-service");

test("loads default settings when no file exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-settings-"));
  const store = createSettingsStore(dir);

  assert.deepEqual(store.load(), { provider: "codex", deepseekApiKey: "" });
});

test("saves normalized provider and api key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-settings-"));
  const store = createSettingsStore(dir);

  const saved = store.save({ provider: "deepseek", deepseekApiKey: "  sk-test  " });

  assert.deepEqual(saved, { provider: "deepseek", deepseekApiKey: "sk-test" });
  assert.deepEqual(store.load(), saved);
});

test("masks api keys without leaking the full value", () => {
  assert.equal(maskApiKey("sk-1234567890"), "sk-...7890");
  assert.equal(maskApiKey(""), "");
});
