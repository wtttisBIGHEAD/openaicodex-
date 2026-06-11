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
      const error = new Error(
        response.status === 401 ? "DeepSeek API key is invalid." : `DeepSeek balance request failed: ${response.status}`
      );
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
