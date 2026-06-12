const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAccountFingerprint,
  findWindowsAppsCodexPaths,
  formatCodexProcessError,
  normalizeAccount,
  resolveCodexPath
} = require("../src/main/quota-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-quota-"));
}

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

test("formats missing Codex CLI spawn errors with an install hint", () => {
  const original = Object.assign(new Error("spawn codex ENOENT"), {
    code: "ENOENT",
    path: "codex"
  });

  const formatted = formatCodexProcessError(original);

  assert.notEqual(formatted, original);
  assert.match(formatted.message, /Codex CLI/);
  assert.doesNotMatch(formatted.message, /spawn codex ENOENT/);
});

test("finds Codex installed by the Windows Store under WindowsApps", () => {
  const windowsApps = tempDir();
  const packageDir = path.join(windowsApps, "OpenAI.Codex_26.608.1337.0_x64__2p2nqsd0c76g0", "app", "resources");
  const codexPath = path.join(packageDir, "codex.exe");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(codexPath, "");
  fs.mkdirSync(path.join(windowsApps, "Other.App_1.0.0.0_x64__example", "app", "resources"), { recursive: true });

  assert.deepEqual(findWindowsAppsCodexPaths(windowsApps), [codexPath]);
});

test("falls back to WindowsApps before plain PATH lookup", () => {
  const root = tempDir();
  const programFiles = path.join(root, "Program Files");
  const packageDir = path.join(programFiles, "WindowsApps", "OpenAI.Codex_26.608.1337.0_x64__2p2nqsd0c76g0", "app", "resources");
  const codexPath = path.join(packageDir, "codex.exe");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(codexPath, "");

  assert.equal(
    resolveCodexPath({
      APPDATA: path.join(root, "Roaming"),
      LOCALAPPDATA: path.join(root, "Local"),
      ProgramFiles: programFiles
    }),
    codexPath
  );
});

test("ignores inaccessible or missing WindowsApps directories", () => {
  assert.deepEqual(findWindowsAppsCodexPaths(path.join(tempDir(), "missing")), []);
});
