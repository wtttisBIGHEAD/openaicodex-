const test = require("node:test");
const assert = require("node:assert/strict");
const {
  forecastCodex,
  forecastDeepSeek
} = require("../src/main/forecast-service");

function codexEntry(fetchedAt, primaryUsed, secondaryUsed, primaryReset = "2026-06-12T14:00:00.000Z", secondaryReset = "2026-06-18T10:00:00.000Z") {
  return {
    provider: "codex",
    fetchedAt,
    remainingPercent: 100 - primaryUsed,
    usedPercent: primaryUsed,
    primary: {
      usedPercent: primaryUsed,
      remainingPercent: 100 - primaryUsed,
      resetsAt: primaryReset
    },
    secondary: {
      usedPercent: secondaryUsed,
      remainingPercent: 100 - secondaryUsed,
      resetsAt: secondaryReset
    }
  };
}

test("forecasts Codex primary window as enough with two points over five minutes", () => {
  const history = [
    codexEntry("2026-06-12T10:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T10:05:00.000Z", 21, 20)
  ];
  const result = forecastCodex(history[1], history);

  assert.equal(result.primary.status, "ok");
  assert.match(result.primary.detail, /预计还能用/);
  assert.doesNotMatch(result.primary.detail, /重置前/);
});

test("forecasts Codex primary window as risky when use rate is too fast", () => {
  const history = [
    codexEntry("2026-06-12T10:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T10:05:00.000Z", 90, 20)
  ];
  const result = forecastCodex(history[1], history);

  assert.equal(result.primary.status, "warning");
  assert.match(result.primary.detail, /预计还能用/);
});

test("ignores Codex primary entries from older reset windows", () => {
  const history = [
    codexEntry("2026-06-12T09:55:00.000Z", 10, 20, "2026-06-12T09:59:00.000Z"),
    codexEntry("2026-06-12T10:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T10:05:00.000Z", 21, 20)
  ];
  const result = forecastCodex(history[2], history);

  assert.equal(result.primary.status, "ok");
});

test("requires at least five minutes for Codex primary estimates", () => {
  const history = [
    codexEntry("2026-06-12T10:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T10:04:00.000Z", 21, 20)
  ];
  const result = forecastCodex(history[1], history);

  assert.equal(result.primary.status, "unknown");
});

test("forecasts Codex secondary seven-day window", () => {
  const history = [
    codexEntry("2026-06-12T00:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T08:00:00.000Z", 21, 28)
  ];
  const result = forecastCodex(history[1], history);

  assert.equal(result.secondary.status, "warning");
  assert.match(result.secondary.detail, /预计还能用/);
});

test("ignores Codex secondary entries from older reset windows", () => {
  const history = [
    codexEntry("2026-06-11T00:00:00.000Z", 20, 0, "2026-06-12T14:00:00.000Z", "2026-06-12T09:00:00.000Z"),
    codexEntry("2026-06-12T00:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T08:00:00.000Z", 21, 21)
  ];
  const result = forecastCodex(history[2], history);

  assert.equal(result.secondary.status, "ok");
  assert.match(result.secondary.detail, /预计还能用/);
  assert.doesNotMatch(result.secondary.detail, /重置前/);
});

test("requires six hours for Codex secondary estimates", () => {
  const history = [
    codexEntry("2026-06-12T00:00:00.000Z", 20, 20),
    codexEntry("2026-06-12T05:00:00.000Z", 21, 28)
  ];
  const result = forecastCodex(history[1], history);

  assert.equal(result.secondary.status, "unknown");
});

test("forecasts DeepSeek balance days from decreases", () => {
  const current = { provider: "deepseek", primaryCurrency: "CNY", totalBalance: "15", fetchedAt: "2026-06-12T12:00:00.000Z" };
  const history = [
    { provider: "deepseek", fetchedAt: "2026-06-11T12:00:00.000Z", currency: "CNY", totalBalance: 20 },
    { provider: "deepseek", fetchedAt: "2026-06-12T12:00:00.000Z", currency: "CNY", totalBalance: 15 }
  ];
  const result = forecastDeepSeek(current, history);

  assert.equal(result.balance.status, "ok");
  assert.match(result.balance.detail, /3/);
});

test("ignores DeepSeek top-ups as negative spend", () => {
  const current = { provider: "deepseek", primaryCurrency: "CNY", totalBalance: "30", fetchedAt: "2026-06-12T12:00:00.000Z" };
  const history = [
    { provider: "deepseek", fetchedAt: "2026-06-11T12:00:00.000Z", currency: "CNY", totalBalance: 20 },
    { provider: "deepseek", fetchedAt: "2026-06-12T12:00:00.000Z", currency: "CNY", totalBalance: 30 }
  ];
  const result = forecastDeepSeek(current, history);

  assert.equal(result.balance.status, "ok");
  assert.match(result.balance.label, /消耗很低/);
});

test("requires six hours for DeepSeek estimates", () => {
  const current = { provider: "deepseek", primaryCurrency: "CNY", totalBalance: "18", fetchedAt: "2026-06-12T12:00:00.000Z" };
  const history = [
    { provider: "deepseek", fetchedAt: "2026-06-12T08:00:00.000Z", currency: "CNY", totalBalance: 20 },
    { provider: "deepseek", fetchedAt: "2026-06-12T12:00:00.000Z", currency: "CNY", totalBalance: 18 }
  ];
  const result = forecastDeepSeek(current, history);

  assert.equal(result.balance.status, "unknown");
});

test("ignores DeepSeek entries older than fourteen days", () => {
  const current = { provider: "deepseek", primaryCurrency: "CNY", totalBalance: "15", fetchedAt: "2026-06-12T12:00:00.000Z" };
  const history = [
    { provider: "deepseek", fetchedAt: "2026-05-01T12:00:00.000Z", currency: "CNY", totalBalance: 100 },
    { provider: "deepseek", fetchedAt: "2026-06-12T12:00:00.000Z", currency: "CNY", totalBalance: 15 }
  ];
  const result = forecastDeepSeek(current, history);

  assert.equal(result.balance.status, "unknown");
});
