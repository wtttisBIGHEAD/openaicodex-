const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 12000;
const OPTIONAL_ACCOUNT_TIMEOUT_MS = 2000;

function resolveCodexPath() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.CODEX_CLI_PATH,
    path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return "codex";
}

async function getQuota() {
  const response = await requestRateLimits();
  const normalizedAccount = normalizeAccount(response.account);
  const snapshot =
    response.rateLimits?.rateLimitsByLimitId?.codex ||
    response.rateLimits?.rateLimits ||
    firstSnapshot(response.rateLimits?.rateLimitsByLimitId);

  if (!snapshot) {
    throw new Error("Codex did not return a rate-limit snapshot.");
  }

  return {
    ...normalizeSnapshot(snapshot),
    accountFingerprint: normalizedAccount?.accountFingerprint || null,
    accountPlanType: normalizedAccount?.planType || null
  };
}

function firstSnapshot(map) {
  if (!map || typeof map !== "object") return null;
  const firstKey = Object.keys(map)[0];
  return firstKey ? map[firstKey] : null;
}

function normalizeSnapshot(snapshot) {
  const primary = normalizeWindow(snapshot.primary);
  const secondary = normalizeWindow(snapshot.secondary);
  const activeWindow = primary || secondary;

  return {
    limitId: snapshot.limitId || "codex",
    limitName: snapshot.limitName || "Codex",
    planType: snapshot.planType || "unknown",
    reachedType: snapshot.rateLimitReachedType || null,
    credits: snapshot.credits || null,
    primary,
    secondary,
    remainingPercent: activeWindow ? activeWindow.remainingPercent : null,
    usedPercent: activeWindow ? activeWindow.usedPercent : null,
    resetsAt: activeWindow ? activeWindow.resetsAt : null,
    fetchedAt: new Date().toISOString()
  };
}

function normalizeWindow(window) {
  if (!window) return null;
  const usedPercent = clampPercent(Number(window.usedPercent || 0));
  return {
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null
  };
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeAccount(account) {
  if (!account || typeof account !== "object") return null;
  const email = stringOrNull(account.email || account.user?.email || account.account?.email);
  const accountId = stringOrNull(account.id || account.accountId || account.userId || account.account?.id || account.user?.id);
  const planType = stringOrNull(account.planType || account.chatgptPlanType || account.plan?.type || account.account?.planType);
  const type = stringOrNull(account.type || account.accountType || account.authType);
  const accountFingerprint = createAccountFingerprint({ accountId, email, planType, type });

  if (!accountFingerprint) return null;
  return {
    accountFingerprint,
    email,
    planType,
    type
  };
}

function createAccountFingerprint(account = {}) {
  const parts = [
    stringOrNull(account.accountId || account.id),
    stringOrNull(account.email)?.toLowerCase(),
    stringOrNull(account.planType)?.toLowerCase(),
    stringOrNull(account.type)?.toLowerCase()
  ].filter(Boolean);

  if (parts.length === 0) return null;
  const hash = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return `codex-account:${hash}`;
}

function stringOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function requestRateLimits() {
  const codexPath = resolveCodexPath();
  const child = spawn(codexPath, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();

  const cleanup = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
    }
    pending.clear();
    if (!child.killed) child.kill();
  };

  const send = (method, params, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const id = nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      handleMessage(line, pending);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });

    child.once("exit", (code) => {
      if (pending.size > 0) {
        cleanup();
        reject(new Error(stderr || `Codex app-server exited with code ${code}`));
      }
    });

    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "codex-led-widget",
            title: "Codex LED Widget",
            version: "0.1.0"
          },
          capabilities: null
        });
        const rateLimits = await send("account/rateLimits/read");
        let account = null;
        try {
          account = await send("account/read", undefined, OPTIONAL_ACCOUNT_TIMEOUT_MS);
        } catch {
          account = null;
        }
        cleanup();
        resolve({ rateLimits, account });
      } catch (error) {
        cleanup();
        reject(new Error(stderr || error.message));
      }
    })();
  });
}

function handleMessage(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) return;
  const request = pending.get(message.id);
  if (!request) return;

  clearTimeout(request.timer);
  pending.delete(message.id);

  if (message.error) {
    request.reject(new Error(message.error.message || JSON.stringify(message.error)));
  } else {
    request.resolve(message.result);
  }
}

module.exports = { createAccountFingerprint, getQuota, normalizeAccount, normalizeSnapshot };
