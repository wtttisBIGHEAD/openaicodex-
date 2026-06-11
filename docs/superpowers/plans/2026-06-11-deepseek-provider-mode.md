# DeepSeek Provider Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider switch so the widget can show either the existing Codex quota view or a DeepSeek balance view.

**Architecture:** Keep provider-specific data loading in the Electron main process. Add focused main-process services for DeepSeek balance normalization and persisted settings, expose those through preload IPC, and update the renderer to switch layouts based on the selected provider.

**Tech Stack:** Electron, CommonJS Node modules, Node built-in `node:test`, browser DOM JavaScript, CSS.

---

## File Structure

- Create `src/main/deepseek-service.js`: DeepSeek `/user/balance` fetch, response normalization, and error translation.
- Create `src/main/settings-service.js`: JSON settings read/write in Electron `app.getPath("userData")`.
- Create `test/deepseek-service.test.js`: Tests for DeepSeek balance normalization and malformed responses.
- Create `test/settings-service.test.js`: Tests for default settings, provider persistence, and API key masking.
- Modify `src/main/main.js`: Add IPC handlers for provider settings and provider refresh, while preserving existing Codex quota handlers.
- Modify `src/main/preload.js`: Expose provider/settings/DeepSeek key methods to the renderer.
- Modify `src/renderer/index.html`: Add provider switch controls and DeepSeek API key input surface.
- Modify `src/renderer/renderer.js`: Render Codex and DeepSeek provider states from normalized data.
- Modify `src/renderer/styles.css`: Add compact controls for provider switch, settings form, and DeepSeek balance cards.
- Modify `package.json`: Add `test` script.
- Modify `README.md`: Document DeepSeek mode and `DEEPSEEK_API_KEY`.

## Task 1: DeepSeek Normalization Tests

**Files:**
- Create: `test/deepseek-service.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the test script**

Add this script to `package.json`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing tests**

Create `test/deepseek-service.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests and verify they fail because the module does not exist**

Run:

```powershell
npm.cmd test -- test/deepseek-service.test.js
```

Expected: FAIL with `Cannot find module '../src/main/deepseek-service'`.

## Task 2: DeepSeek Service

**Files:**
- Create: `src/main/deepseek-service.js`
- Test: `test/deepseek-service.test.js`

- [ ] **Step 1: Implement normalization and API fetch**

Create `src/main/deepseek-service.js` with:

```js
const DEFAULT_DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEFAULT_TIMEOUT_MS = 12000;

async function getDeepSeekBalance(apiKey, options = {}) {
  const key = String(apiKey || "").trim();
  if (!key) {
    const error = new Error("DeepSeek API key is required.");
    error.code = "missing_key";
    throw error;
  }

  const fetchImpl = options.fetch || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(options.url || DEFAULT_DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(response.status === 401 ? "DeepSeek API key is invalid." : `DeepSeek balance request failed: ${response.status}`);
      error.code = response.status === 401 ? "invalid_key" : "request_failed";
      throw error;
    }

    return normalizeBalanceResponse(await response.json());
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("DeepSeek balance request timed out.");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBalanceResponse(response) {
  if (!response || typeof response !== "object") {
    throw new Error("DeepSeek did not return a balance response.");
  }

  const balances = Array.isArray(response.balance_infos)
    ? response.balance_infos.map(normalizeBalanceInfo).filter(Boolean)
    : [];

  if (balances.length === 0) {
    throw new Error("DeepSeek did not return balance info.");
  }

  const primary = balances.find((balance) => balance.currency === "CNY") || balances[0];

  return {
    provider: "deepseek",
    isAvailable: Boolean(response.is_available),
    balances,
    primaryCurrency: primary.currency,
    totalBalance: primary.totalBalance,
    grantedBalance: primary.grantedBalance,
    toppedUpBalance: primary.toppedUpBalance,
    fetchedAt: new Date().toISOString()
  };
}

function normalizeBalanceInfo(info) {
  if (!info || typeof info !== "object" || !info.currency) return null;
  return {
    currency: String(info.currency),
    totalBalance: String(info.total_balance ?? "0"),
    grantedBalance: String(info.granted_balance ?? "0"),
    toppedUpBalance: String(info.topped_up_balance ?? "0")
  };
}

module.exports = { getDeepSeekBalance, normalizeBalanceResponse };
```

- [ ] **Step 2: Run tests and verify they pass**

Run:

```powershell
npm.cmd test -- test/deepseek-service.test.js
```

Expected: PASS.

## Task 3: Settings Service Tests

**Files:**
- Create: `test/settings-service.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/settings-service.test.js`:

```js
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
```

- [ ] **Step 2: Run tests and verify they fail because the module does not exist**

Run:

```powershell
npm.cmd test -- test/settings-service.test.js
```

Expected: FAIL with `Cannot find module '../src/main/settings-service'`.

## Task 4: Settings Service

**Files:**
- Create: `src/main/settings-service.js`
- Test: `test/settings-service.test.js`

- [ ] **Step 1: Implement JSON settings storage**

Create `src/main/settings-service.js` with:

```js
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
    publicSettings: () => publicSettings(loadSettings(filePath))
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

function publicSettings(settings) {
  return {
    provider: settings.provider,
    hasDeepseekApiKey: Boolean(settings.deepseekApiKey),
    maskedDeepseekApiKey: maskApiKey(settings.deepseekApiKey)
  };
}

function maskApiKey(apiKey) {
  const key = String(apiKey || "");
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

module.exports = { createSettingsStore, maskApiKey, normalizeSettings, publicSettings };
```

- [ ] **Step 2: Run tests and verify they pass**

Run:

```powershell
npm.cmd test -- test/settings-service.test.js
```

Expected: PASS.

## Task 5: Main IPC and Preload API

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`

- [ ] **Step 1: Wire services into the main process**

In `src/main/main.js`, import the new services and initialize a settings store after `app.whenReady()`:

```js
const { getDeepSeekBalance } = require("./deepseek-service");
const { createSettingsStore, publicSettings } = require("./settings-service");
```

Add IPC handlers:

```js
ipcMain.handle("provider:getSettings", () => publicSettings(settingsStore.load()));
ipcMain.handle("provider:setProvider", (_event, provider) => {
  const current = settingsStore.load();
  return publicSettings(settingsStore.save({ ...current, provider }));
});
ipcMain.handle("provider:saveDeepSeekKey", (_event, apiKey) => {
  const current = settingsStore.load();
  return publicSettings(settingsStore.save({ ...current, deepseekApiKey: apiKey, provider: "deepseek" }));
});
ipcMain.handle("provider:getData", async () => {
  const settings = settingsStore.load();
  if (settings.provider === "deepseek") {
    const key = settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "";
    return getDeepSeekBalance(key);
  }
  return getQuota();
});
```

- [ ] **Step 2: Keep existing `quota:get` for compatibility**

Leave the existing `ipcMain.handle("quota:get", async () => getQuota())` in place.

- [ ] **Step 3: Expose preload methods**

In `src/main/preload.js`, expose:

```js
getProviderSettings: () => ipcRenderer.invoke("provider:getSettings"),
setProvider: (provider) => ipcRenderer.invoke("provider:setProvider", provider),
saveDeepSeekKey: (apiKey) => ipcRenderer.invoke("provider:saveDeepSeekKey", apiKey),
getProviderData: () => ipcRenderer.invoke("provider:getData"),
```

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
node --check src\main\main.js
node --check src\main\preload.js
```

Expected: no syntax errors.

## Task 6: Renderer UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add provider controls to HTML**

Add a compact provider segmented control near the titlebar:

```html
<div class="provider-switch" role="group" aria-label="数据源">
  <button id="codexProviderBtn" class="provider-button active" type="button">Codex</button>
  <button id="deepseekProviderBtn" class="provider-button" type="button">DeepSeek</button>
</div>
```

Add a DeepSeek key form near the quota panel:

```html
<form id="deepseekKeyForm" class="key-form hidden">
  <input id="deepseekKeyInput" type="password" placeholder="DeepSeek API Key" autocomplete="off" />
  <button id="deepseekKeySaveBtn" type="submit">保存</button>
</form>
```

- [ ] **Step 2: Add renderer state**

In `renderer.js`, add provider settings state:

```js
let providerSettings = { provider: "codex", hasDeepseekApiKey: false, maskedDeepseekApiKey: "" };
```

Change refresh to call `quotaApi.getProviderData()` when available.

- [ ] **Step 3: Render DeepSeek balances**

Add `renderDeepSeek(balance)` that sets:

```js
remaining = `${balance.totalBalance} ${balance.primaryCurrency}`;
primaryText = balance.isAvailable ? "可用" : "不可用";
secondaryText = `赠送 ${balance.grantedBalance}`;
planText = `充值 ${balance.toppedUpBalance}`;
```

Use `body[data-state="ready"]` when available and `body[data-state="empty"]` when unavailable.

- [ ] **Step 4: Add event handlers**

Add click handlers for provider buttons and submit handler for the API key form. Saving the key switches provider to DeepSeek and refreshes.

- [ ] **Step 5: Add CSS**

Add `.provider-switch`, `.provider-button`, `.key-form`, and `.hidden` styles that fit within the existing 390px widget width.

- [ ] **Step 6: Run syntax check**

Run:

```powershell
node --check src\renderer\renderer.js
```

Expected: no syntax errors.

## Task 7: Documentation and Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new mode**

Add README notes:

```markdown
The widget can display either Codex quota or DeepSeek account balance.

DeepSeek mode requires a DeepSeek API key. Enter it in the widget or set `DEEPSEEK_API_KEY` before launching.
```

- [ ] **Step 2: Run all automated checks**

Run:

```powershell
npm.cmd test
node --check src\main\main.js
node --check src\main\preload.js
node --check src\main\quota-service.js
node --check src\main\deepseek-service.js
node --check src\main\settings-service.js
node --check src\renderer\renderer.js
```

Expected: all tests pass and all syntax checks exit 0.

- [ ] **Step 3: Commit**

Run:

```powershell
git add package.json package-lock.json README.md src test docs
git commit -m "Add DeepSeek balance provider mode"
```

Expected: commit succeeds and `git status --short --branch` shows a clean `main`.

## Self-Review

- Spec coverage: The plan preserves Codex mode, adds DeepSeek balance mode, persists provider/API key settings, keeps DeepSeek calls in main process, and adds tests for normalization and settings.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Provider ids are consistently `codex` and `deepseek`; DeepSeek data fields are `isAvailable`, `primaryCurrency`, `totalBalance`, `grantedBalance`, and `toppedUpBalance`.
