const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAccountFingerprint,
  normalizeAccount
} = require("../src/main/quota-service");

test("normalizes account metadata without exposing raw email as the fingerprint", () => {
  const account = normalizeAccount({
    email: "person@example.com",
    planType: "pro"
  });

  assert.equal(account.email, "person@example.com");
  assert.equal(account.planType, "pro");
  assert.match(account.accountFingerprint, /^codex-account:[a-f0-9]{64}$/);
  assert.equal(account.accountFingerprint.includes("person@example.com"), false);
});

test("creates stable fingerprints for the same account", () => {
  assert.equal(
    createAccountFingerprint({ email: "person@example.com", planType: "pro" }),
    createAccountFingerprint({ email: "person@example.com", planType: "pro" })
  );
});

test("changes fingerprints when account identity changes", () => {
  assert.notEqual(
    createAccountFingerprint({ email: "person@example.com", planType: "pro" }),
    createAccountFingerprint({ email: "other@example.com", planType: "pro" })
  );
});
