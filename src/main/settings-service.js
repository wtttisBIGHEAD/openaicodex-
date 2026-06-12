const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "settings.json";
const DEFAULT_SETTINGS = {
  provider: "codex",
  deepseekApiKey: "",
  displayMode: "full",
  windowBounds: {
    full: null,
    mini: null
  },
  theme: "glass",
  opacity: 0.82
};

const THEMES = new Set(["glass", "dark", "minimal"]);
const DISPLAY_MODES = new Set(["full", "mini"]);

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
    return cloneDefaultSettings();
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
    deepseekApiKey: String(settings.deepseekApiKey || "").trim(),
    displayMode: DISPLAY_MODES.has(settings.displayMode) ? settings.displayMode : DEFAULT_SETTINGS.displayMode,
    windowBounds: normalizeWindowBounds(settings.windowBounds),
    theme: THEMES.has(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme,
    opacity: clampOpacity(settings.opacity)
  };
}

function publicSettings(settings, fallbackApiKey = "") {
  const configuredKey = settings.deepseekApiKey || String(fallbackApiKey || "").trim();
  return {
    provider: settings.provider,
    hasDeepseekApiKey: Boolean(configuredKey),
    maskedDeepseekApiKey: maskApiKey(configuredKey),
    keySource: settings.deepseekApiKey ? "saved" : configuredKey ? "environment" : "none",
    displayMode: settings.displayMode,
    windowBounds: settings.windowBounds,
    theme: settings.theme,
    opacity: settings.opacity
  };
}

function normalizeWindowBounds(bounds = {}) {
  return {
    full: normalizeBounds(bounds.full),
    mini: normalizeBounds(bounds.mini)
  };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (![x, y, width, height].every(Number.isFinite) || width < 40 || height < 40) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function clampOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_SETTINGS.opacity;
  return Math.max(0.6, Math.min(1, Math.round(opacity * 100) / 100));
}

function cloneDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS,
    windowBounds: { ...DEFAULT_SETTINGS.windowBounds }
  };
}

function maskApiKey(apiKey) {
  const key = String(apiKey || "");
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

module.exports = { createSettingsStore, maskApiKey, normalizeSettings, publicSettings };
