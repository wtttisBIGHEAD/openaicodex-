const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBalanceResponse } = require("../src/main/deepseek-service");

test("normalizes a DeepSeek balance response", () => {
  const result = normalizeBalanceResponse({
    is_available: true,
    balance_infos: [
      {
        currency: "CNY",
        total_balance: "110.00",
        granted_balance: "10.00",
        topped_up_balance: "100.00"
      }
    ]
  });

  assert.equal(result.provider, "deepseek");
  assert.equal(result.isAvailable, true);
  assert.equal(result.primaryCurrency, "CNY");
  assert.equal(result.totalBalance, "110.00");
  assert.equal(result.grantedBalance, "10.00");
  assert.equal(result.toppedUpBalance, "100.00");
  assert.equal(result.balances.length, 1);
  assert.match(result.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("chooses USD if CNY is not present", () => {
  const result = normalizeBalanceResponse({
    is_available: false,
    balance_infos: [
      {
        currency: "USD",
        total_balance: "2.50",
        granted_balance: "0.50",
        topped_up_balance: "2.00"
      }
    ]
  });

  assert.equal(result.primaryCurrency, "USD");
  assert.equal(result.totalBalance, "2.50");
  assert.equal(result.isAvailable, false);
});

test("rejects malformed DeepSeek balance responses", () => {
  assert.throws(
    () => normalizeBalanceResponse({ is_available: true, balance_infos: [] }),
    /balance info/
  );
});
