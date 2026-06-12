const fs = require("node:fs");
const path = require("node:path");

const HISTORY_FILE = "history.json";
const HISTORY_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 30;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function createHistoryStore(userDataPath) {
  const filePath = path.join(userDataPath, HISTORY_FILE);

  return {
    load: () => loadHistory(filePath),
    append: (entry, options = {}) => appendEntry(filePath, entry, options),
    getEntries: (provider, days = DEFAULT_RETENTION_DAYS) => {
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      return loadHistory(filePath).entries.filter((entry) => {
        return entry.provider === provider && Date.parse(entry.fetchedAt) >= cutoffMs;
      });
    },
    prune: (days = DEFAULT_RETENTION_DAYS) => saveHistory(filePath, pruneHistory(loadHistory(filePath), days))
  };
}

function loadHistory(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.entries)) return emptyHistory();
    return {
      version: HISTORY_VERSION,
      entries: parsed.entries.map(normalizeStoredEntry).filter(Boolean).sort(compareFetchedAt)
    };
  } catch {
    return emptyHistory();
  }
}

function appendEntry(filePath, entry, options = {}) {
  const normalized = normalizeStoredEntry(entry);
  if (!normalized) return loadHistory(filePath);

  const now = options.now ? Date.parse(options.now) : Date.now();
  const history = pruneHistory(loadHistory(filePath), DEFAULT_RETENTION_DAYS, now);
  const fetchedAtMs = Date.parse(normalized.fetchedAt);
  const entries = history.entries.filter((existing) => {
    return !(existing.provider === normalized.provider && Math.abs(Date.parse(existing.fetchedAt) - fetchedAtMs) < DEDUPE_WINDOW_MS);
  });

  entries.push(normalized);
  return saveHistory(filePath, { version: HISTORY_VERSION, entries: entries.sort(compareFetchedAt) });
}

function saveHistory(filePath, history) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = {
    version: HISTORY_VERSION,
    entries: (history.entries || []).map(normalizeStoredEntry).filter(Boolean).sort(compareFetchedAt)
  };
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function pruneHistory(history, days = DEFAULT_RETENTION_DAYS, now = Date.now()) {
  const cutoffMs = Number(now) - days * 24 * 60 * 60 * 1000;
  return {
    version: HISTORY_VERSION,
    entries: history.entries.filter((entry) => Date.parse(entry.fetchedAt) >= cutoffMs)
  };
}

function normalizeStoredEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.provider === "codex") return normalizeCodexHistoryEntry(entry);
  if (entry.provider === "deepseek") return normalizeDeepSeekHistoryEntry(entry);
  return null;
}

function normalizeCodexHistoryEntry(quota) {
  const fetchedAt = normalizeIso(quota.fetchedAt) || new Date().toISOString();
  return {
    provider: "codex",
    fetchedAt,
    remainingPercent: normalizePercent(quota.remainingPercent),
    usedPercent: normalizePercent(quota.usedPercent),
    primary: normalizeCodexWindow(quota.primary),
    secondary: normalizeCodexWindow(quota.secondary)
  };
}

function normalizeCodexWindow(window) {
  if (!window || typeof window !== "object") return null;
  return {
    remainingPercent: normalizePercent(window.remainingPercent),
    usedPercent: normalizePercent(window.usedPercent),
    resetsAt: normalizeIso(window.resetsAt)
  };
}

function normalizeDeepSeekHistoryEntry(balance) {
  const currency = balance.currency || balance.primaryCurrency;
  const totalBalance = Number(balance.totalBalance);
  const fetchedAt = normalizeIso(balance.fetchedAt) || new Date().toISOString();

  if (!currency || !Number.isFinite(totalBalance)) return null;

  return {
    provider: "deepseek",
    fetchedAt,
    currency: String(currency),
    totalBalance,
    isAvailable: Boolean(balance.isAvailable)
  };
}

function normalizePercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent * 100) / 100));
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareFetchedAt(a, b) {
  return Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt);
}

function emptyHistory() {
  return { version: HISTORY_VERSION, entries: [] };
}

module.exports = {
  createHistoryStore,
  normalizeCodexHistoryEntry,
  normalizeDeepSeekHistoryEntry,
  pruneHistory
};
