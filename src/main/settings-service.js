const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "settings.json";
const DEFAULT_SETTINGS = {
  provider: "codex",
  deepseekApiKey: ""
};

function createSettingsStore(userDataPath) {
  const filePath = path.join(userDataPath, SETTINGS_FILE);

  return {
    load: () => loadSettings(filePath),
    save: (settings) => saveSettings(filePath, settings),
    publicSettings: (fallbackApiKey = "") => publicSettings(loadSettings(filePath), fallbackApiKey)
  };
}

function loadSettings(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(filePath, settings) {
  const normalized = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function normalizeSettings(settings = {}) {
  const provider = settings.provider === "deepseek" ? "deepseek" : "codex";
  return {
    provider,
    deepseekApiKey: String(settings.deepseekApiKey || "").trim()
  };
}

function publicSettings(settings, fallbackApiKey = "") {
  const configuredKey = settings.deepseekApiKey || String(fallbackApiKey || "").trim();
  return {
    provider: settings.provider,
    hasDeepseekApiKey: Boolean(configuredKey),
    maskedDeepseekApiKey: maskApiKey(configuredKey),
    keySource: settings.deepseekApiKey ? "saved" : configuredKey ? "environment" : "none"
  };
}

function maskApiKey(apiKey) {
  const key = String(apiKey || "");
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

module.exports = { createSettingsStore, maskApiKey, normalizeSettings, publicSettings };
