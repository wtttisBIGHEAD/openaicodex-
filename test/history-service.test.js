const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createHistoryStore,
  normalizeCodexHistoryEntry,
  normalizeDeepSeekHistoryEntry
} = require("../src/main/history-service");
const { forecastCodex } = require("../src/main/forecast-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-history-"));
}

function codexEntry(fetchedAt, primaryUsed, options = {}) {
  return {
    provider: "codex",
    fetchedAt,
    accountFingerprint: options.accountFingerprint || "account-a",
    remainingPercent: 100 - primaryUsed,
    usedPercent: primaryUsed,
    primary: {
      remainingPercent: 100 - primaryUsed,
      usedPercent: primaryUsed,
      resetsAt: options.primaryReset || "2026-06-12T14:00:00.000Z"
    },
    secondary: {
      remainingPercent: 80,
      usedPercent: 20,
      resetsAt: "2026-06-18T10:00:00.000Z"
    }
  };
}

test("loads empty history when no file exists", () => {
  const store = createHistoryStore(tempDir());
  assert.deepEqual(store.load(), { version: 1, entries: [] });
});

test("normalizes Codex history entries", () => {
  const entry = normalizeCodexHistoryEntry({
    provider: "codex",
    fetchedAt: "2026-06-12T10:00:00.000Z",
    accountFingerprint: "account-a",
    remainingPercent: 72,
    usedPercent: 28,
    primary: {
      remainingPercent: 72,
      usedPercent: 28,
      resetsAt: "2026-06-12T14:00:00.000Z"
    },
    secondary: {
      remainingPercent: 64,
      usedPercent: 36,
      resetsAt: "2026-06-18T10:00:00.000Z"
    }
  });

  assert.equal(entry.provider, "codex");
  assert.equal(entry.accountFingerprint, "account-a");
  assert.equal(entry.remainingPercent, 72);
  assert.equal(entry.primary.resetsAt, "2026-06-12T14:00:00.000Z");
  assert.equal(entry.secondary.usedPercent, 36);
});

test("normalizes DeepSeek history entries", () => {
  const entry = normalizeDeepSeekHistoryEntry({
    provider: "deepseek",
    fetchedAt: "2026-06-12T10:00:00.000Z",
    primaryCurrency: "CNY",
    totalBalance: "18.40",
    isAvailable: true
  });

  assert.deepEqual(entry, {
    provider: "deepseek",
    fetchedAt: "2026-06-12T10:00:00.000Z",
    currency: "CNY",
    totalBalance: 18.4,
    isAvailable: true
  });
});

test("keeps the first entry for the same provider within five minutes", () => {
  const store = createHistoryStore(tempDir());
  store.append({ provider: "deepseek", fetchedAt: "2026-06-12T10:00:00.000Z", currency: "CNY", totalBalance: 20, isAvailable: true });
  store.append({ provider: "deepseek", fetchedAt: "2026-06-12T10:04:00.000Z", currency: "CNY", totalBalance: 19, isAvailable: true });

  const history = store.load();
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].totalBalance, 20);
  assert.equal(history.entries[0].fetchedAt, "2026-06-12T10:00:00.000Z");
});

test("keeps Codex samples in the same five-hour window when spaced over thirty seconds", () => {
  const store = createHistoryStore(tempDir());
  store.append(codexEntry("2026-06-12T10:00:00.000Z", 20));
  store.append(codexEntry("2026-06-12T10:01:00.000Z", 25));
  const history = store.append(codexEntry("2026-06-12T10:02:00.000Z", 30));
  const forecast = forecastCodex(codexEntry("2026-06-12T10:02:00.000Z", 30), history.entries);

  assert.deepEqual(
    history.entries.map((entry) => entry.fetchedAt),
    ["2026-06-12T10:00:00.000Z", "2026-06-12T10:01:00.000Z", "2026-06-12T10:02:00.000Z"]
  );
  assert.equal(forecast.primary.meta.sampleCount, 3);
});

test("ignores duplicate Codex samples within thirty seconds", () => {
  const store = createHistoryStore(tempDir());
  store.append(codexEntry("2026-06-12T10:00:00.000Z", 20));
  store.append(codexEntry("2026-06-12T10:00:20.000Z", 21));

  assert.deepEqual(
    store.load().entries.map((entry) => entry.fetchedAt),
    ["2026-06-12T10:00:00.000Z"]
  );
});

test("keeps the first sample for a new Codex five-hour window even when close in time", () => {
  const store = createHistoryStore(tempDir());
  store.append(codexEntry("2026-06-12T10:00:00.000Z", 99, { primaryReset: "2026-06-12T10:00:20.000Z" }));
  store.append(codexEntry("2026-06-12T10:00:20.000Z", 1, { primaryReset: "2026-06-12T15:00:20.000Z" }));

  assert.deepEqual(
    store.load().entries.map((entry) => entry.primary.resetsAt),
    ["2026-06-12T10:00:20.000Z", "2026-06-12T15:00:20.000Z"]
  );
});

test("resets Codex history when the account fingerprint changes", () => {
  const store = createHistoryStore(tempDir());
  store.append(codexEntry("2026-06-12T10:00:00.000Z", 20, { accountFingerprint: "account-a" }));
  store.append(codexEntry("2026-06-12T10:01:00.000Z", 25, { accountFingerprint: "account-a" }));
  store.append(codexEntry("2026-06-12T10:02:00.000Z", 1, { accountFingerprint: "account-b" }));

  const codexEntries = store.load().entries.filter((entry) => entry.provider === "codex");
  assert.equal(codexEntries.length, 1);
  assert.equal(codexEntries[0].accountFingerprint, "account-b");
});

test("keeps entries outside the five-minute dedupe window", () => {
  const store = createHistoryStore(tempDir());
  store.append({ provider: "codex", fetchedAt: "2026-06-12T10:00:00.000Z", remainingPercent: 72, usedPercent: 28 });
  store.append({ provider: "codex", fetchedAt: "2026-06-12T10:06:00.000Z", remainingPercent: 70, usedPercent: 30 });

  assert.equal(store.load().entries.length, 2);
});

test("prunes entries older than the retention window", () => {
  const store = createHistoryStore(tempDir());
  store.append({ provider: "deepseek", fetchedAt: "2026-05-01T10:00:00.000Z", currency: "CNY", totalBalance: 20, isAvailable: true }, { now: "2026-06-12T10:00:00.000Z" });
  store.append({ provider: "deepseek", fetchedAt: "2026-06-12T10:00:00.000Z", currency: "CNY", totalBalance: 18, isAvailable: true }, { now: "2026-06-12T10:00:00.000Z" });

  const history = store.load();
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].totalBalance, 18);
});

test("recovers from corrupt history files", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "history.json"), "{broken", "utf8");
  const store = createHistoryStore(dir);
  assert.deepEqual(store.load(), { version: 1, entries: [] });
});
