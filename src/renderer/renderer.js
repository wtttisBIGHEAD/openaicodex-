const elements = {
  body: document.body,
  trafficLight: document.getElementById("trafficLight"),
  stateText: document.getElementById("stateText"),
  brandName: document.getElementById("brandName"),
  remaining: document.getElementById("remaining"),
  remainingLabel: document.getElementById("remainingLabel"),
  primaryLabel: document.getElementById("primaryLabel"),
  primaryText: document.getElementById("primaryText"),
  secondaryLabel: document.getElementById("secondaryLabel"),
  secondaryText: document.getElementById("secondaryText"),
  planLabel: document.getElementById("planLabel"),
  planText: document.getElementById("planText"),
  miniForecast: document.getElementById("miniForecast"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  langBtn: document.getElementById("langBtn"),
  pinBtn: document.getElementById("pinBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  modeBtn: document.getElementById("modeBtn"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  closeBtn: document.getElementById("closeBtn"),
  miniExpandBtn: document.getElementById("miniExpandBtn"),
  codexProviderBtn: document.getElementById("codexProviderBtn"),
  deepseekProviderBtn: document.getElementById("deepseekProviderBtn"),
  deepseekKeyForm: document.getElementById("deepseekKeyForm"),
  deepseekKeyInput: document.getElementById("deepseekKeyInput"),
  deepseekKeySaveBtn: document.getElementById("deepseekKeySaveBtn"),
  glassThemeBtn: document.getElementById("glassThemeBtn"),
  darkThemeBtn: document.getElementById("darkThemeBtn"),
  minimalThemeBtn: document.getElementById("minimalThemeBtn"),
  opacityLabel: document.getElementById("opacityLabel"),
  opacityRange: document.getElementById("opacityRange"),
  autoRefreshLabel: document.getElementById("autoRefreshLabel"),
  autoRefreshSelect: document.getElementById("autoRefreshSelect"),
  forecastPanel: document.getElementById("forecastPanel"),
  forecastPrimaryLabel: document.getElementById("forecastPrimaryLabel"),
  forecastPrimaryText: document.getElementById("forecastPrimaryText"),
  forecastSecondaryLabel: document.getElementById("forecastSecondaryLabel"),
  forecastSecondaryText: document.getElementById("forecastSecondaryText"),
  widget: document.querySelector(".widget")
};

const copy = {
  zh: {
    langButton: "EN",
    codexBrandName: "Codex 额度",
    deepseekBrandName: "DeepSeek 余额",
    loading: "读取中",
    ready: "可用",
    warn: "额度偏低",
    empty: "不可用",
    error: "读取失败",
    remainingCodex: "剩余",
    remainingDeepSeek: "总余额",
    primaryLabelCodex: "5小时窗口",
    secondaryLabelCodex: "7天窗口",
    planLabelCodex: "计划",
    primaryLabelDeepSeek: "账户状态",
    secondaryLabelDeepSeek: "赠送余额",
    planLabelDeepSeek: "充值余额",
    unknown: "未知",
    refreshingCodex: "正在读取 Codex 额度...",
    refreshingDeepSeek: "正在读取 DeepSeek 余额...",
    refreshed: "已更新",
    used: "已用",
    resets: "重置",
    noWindow: "暂无窗口数据",
    retry: "点击刷新重试",
    missingKey: "请先保存 DeepSeek API Key",
    codexCliMissing: "未找到 Codex CLI：请先安装并登录 Codex，或切换到 DeepSeek。",
    keySaved: "API Key 已保存",
    keyPlaceholder: "DeepSeek API Key",
    keyButton: "保存",
    opacityLabel: "透明度",
    autoRefreshLabel: "自动",
    forecastPrimaryCodex: "5小时",
    forecastSecondaryCodex: "7天",
    forecastDeepSeek: "余额",
    insufficientData: "数据不足",
    miniMode: "迷你模式",
    fullMode: "完整模式",
    savedKey: "已保存",
    envKey: "来自环境变量",
    noKey: "未配置",
    pinOn: "取消置顶",
    pinOff: "置顶",
    refresh: "刷新",
    minimize: "隐藏",
    close: "退出"
  },
  en: {
    langButton: "中",
    codexBrandName: "Codex Quota",
    deepseekBrandName: "DeepSeek Balance",
    loading: "Loading",
    ready: "Available",
    warn: "Quota low",
    empty: "Unavailable",
    error: "Read failed",
    remainingCodex: "left",
    remainingDeepSeek: "balance",
    primaryLabelCodex: "5h window",
    secondaryLabelCodex: "7d window",
    planLabelCodex: "Plan",
    primaryLabelDeepSeek: "Status",
    secondaryLabelDeepSeek: "Granted",
    planLabelDeepSeek: "Topped up",
    unknown: "Unknown",
    refreshingCodex: "Reading Codex quota...",
    refreshingDeepSeek: "Reading DeepSeek balance...",
    refreshed: "Updated",
    used: "used",
    resets: "resets",
    noWindow: "No window data",
    retry: "Refresh to retry",
    missingKey: "Save a DeepSeek API key first",
    codexCliMissing: "Codex CLI not found. Install and sign in to Codex, or switch to DeepSeek.",
    keySaved: "API key saved",
    keyPlaceholder: "DeepSeek API Key",
    keyButton: "Save",
    opacityLabel: "Opacity",
    autoRefreshLabel: "Auto",
    forecastPrimaryCodex: "5h",
    forecastSecondaryCodex: "7d",
    forecastDeepSeek: "Balance",
    insufficientData: "Not enough data",
    miniMode: "Mini mode",
    fullMode: "Full mode",
    savedKey: "Saved",
    envKey: "From environment",
    noKey: "Not configured",
    pinOn: "Unpin",
    pinOff: "Pin",
    refresh: "Refresh",
    minimize: "Hide",
    close: "Quit"
  }
};

let language = localStorage.getItem("language") || (navigator.language.startsWith("zh") ? "zh" : "en");
let providerSettings = {
  provider: "codex",
  hasDeepseekApiKey: false,
  maskedDeepseekApiKey: "",
  keySource: "none",
  displayMode: "full",
  theme: "glass",
  opacity: 0.82,
  autoRefreshMins: 30
};
let lastProviderData = null;
let lastError = null;
let autoRefreshTimer = null;
let refreshInFlight = false;
const quotaApi = window.codexQuota;

function t(key) {
  return copy[language][key];
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function normalizeErrorMessage(error) {
  const raw = error?.message || String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "").trim();
  if (message.includes("spawn codex ENOENT") || message.includes("未找到 Codex CLI")) {
    return t("codexCliMissing");
  }
  return message || t("retry");
}

function setButtonLabel(button, label) {
  if (!button) return;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function provider() {
  return providerSettings.provider === "deepseek" ? "deepseek" : "codex";
}

function applyStaticCopy() {
  setText(elements.langBtn, t("langButton"));
  setText(elements.brandName, provider() === "deepseek" ? t("deepseekBrandName") : t("codexBrandName"));
  setButtonLabel(elements.refreshBtn, t("refresh"));
  setButtonLabel(elements.modeBtn, providerSettings.displayMode === "mini" ? t("fullMode") : t("miniMode"));
  setButtonLabel(elements.miniExpandBtn, t("fullMode"));
  setButtonLabel(elements.minimizeBtn, t("minimize"));
  setButtonLabel(elements.closeBtn, t("close"));
  setText(elements.deepseekKeySaveBtn, t("keyButton"));
  setText(elements.opacityLabel, t("opacityLabel"));
  setText(elements.autoRefreshLabel, t("autoRefreshLabel"));
  elements.deepseekKeyInput.placeholder = t("keyPlaceholder");
}

function applySettingsUi() {
  const displayMode = providerSettings.displayMode === "mini" ? "mini" : "full";
  const theme = ["glass", "dark", "minimal"].includes(providerSettings.theme) ? providerSettings.theme : "glass";
  const opacity = Number.isFinite(Number(providerSettings.opacity)) ? Number(providerSettings.opacity) : 0.82;

  elements.body.dataset.mode = displayMode;
  elements.body.dataset.theme = theme;
  document.documentElement.style.setProperty("--widget-opacity", String(opacity));
  elements.opacityRange.value = String(Math.round(opacity * 100));
  elements.autoRefreshSelect.value = String(providerSettings.autoRefreshMins ?? 30);
  elements.glassThemeBtn.classList.toggle("active", theme === "glass");
  elements.darkThemeBtn.classList.toggle("active", theme === "dark");
  elements.minimalThemeBtn.classList.toggle("active", theme === "minimal");
  setButtonLabel(elements.modeBtn, displayMode === "mini" ? t("fullMode") : t("miniMode"));
  setButtonLabel(elements.miniExpandBtn, t("fullMode"));
}

function setProviderUi() {
  const isDeepSeek = provider() === "deepseek";
  elements.body.dataset.provider = provider();
  elements.codexProviderBtn.classList.toggle("active", !isDeepSeek);
  elements.deepseekProviderBtn.classList.toggle("active", isDeepSeek);
  elements.deepseekKeyForm.classList.toggle("hidden", !isDeepSeek);
  setText(elements.brandName, isDeepSeek ? t("deepseekBrandName") : t("codexBrandName"));
}

function setLoading() {
  elements.body.dataset.state = "loading";
  elements.trafficLight.className = "traffic-light loading";
  elements.statusDot.className = "status-dot loading";
  setText(elements.stateText, t("loading"));
  setText(elements.statusText, provider() === "deepseek" ? t("refreshingDeepSeek") : t("refreshingCodex"));
}

function setState(state, data) {
  elements.body.dataset.state = state;
  elements.trafficLight.className = `traffic-light ${state}`;
  elements.statusDot.className = `status-dot ${state}`;

  if (state === "error") {
    setText(elements.stateText, t("error"));
    setText(elements.statusText, lastError || t("retry"));
    return;
  }

  setText(elements.stateText, t(state));
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  setText(elements.statusText, fetchedAt ? `${t("refreshed")} ${fetchedAt}` : t("refreshed"));
}

function stateForRemaining(value) {
  if (!Number.isFinite(value)) return "loading";
  if (value <= 0) return "empty";
  if (value < 10) return "warn";
  return "ready";
}

function formatWindow(window) {
  if (!window) return t("noWindow");
  const used = Number.isFinite(window.usedPercent) ? `${window.usedPercent}% ${t("used")}` : "--";
  if (!window.resetsAt) return used;

  const reset = new Date(window.resetsAt);
  if (Number.isNaN(reset.getTime())) return used;

  return `${used} · ${t("resets")} ${reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function renderProviderData(data) {
  if (data?.provider === "deepseek") {
    renderDeepSeekBalance(data);
  } else {
    renderQuota(data);
  }
  renderForecast(data?.forecast);
}

function renderQuota(quota) {
  lastProviderData = quota;
  lastError = null;

  const remaining = Number(quota?.remainingPercent);
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, Math.min(100, Math.round(remaining))) : 0;
  const state = stateForRemaining(safeRemaining);

  document.documentElement.style.setProperty("--level", `${safeRemaining}%`);
  setText(elements.remaining, Number.isFinite(remaining) ? `${safeRemaining}%` : "--%");
  setText(elements.remainingLabel, t("remainingCodex"));
  setText(elements.primaryLabel, t("primaryLabelCodex"));
  setText(elements.primaryText, formatWindow(quota?.primary));
  setText(elements.secondaryLabel, t("secondaryLabelCodex"));
  setText(elements.secondaryText, formatWindow(quota?.secondary));
  setText(elements.planLabel, t("planLabelCodex"));
  setText(elements.planText, quota?.planType || quota?.limitName || t("unknown"));
  setState(state, quota);
}

function renderDeepSeekBalance(balance) {
  lastProviderData = balance;
  lastError = null;

  document.documentElement.style.setProperty("--level", balance.isAvailable ? "100%" : "0%");
  setText(elements.remaining, `${balance.totalBalance} ${balance.primaryCurrency}`);
  setText(elements.remainingLabel, t("remainingDeepSeek"));
  setText(elements.primaryLabel, t("primaryLabelDeepSeek"));
  setText(elements.primaryText, balance.isAvailable ? t("ready") : t("empty"));
  setText(elements.secondaryLabel, t("secondaryLabelDeepSeek"));
  setText(elements.secondaryText, `${balance.grantedBalance} ${balance.primaryCurrency}`);
  setText(elements.planLabel, t("planLabelDeepSeek"));
  setText(elements.planText, `${balance.toppedUpBalance} ${balance.primaryCurrency}`);
  setState(balance.isAvailable ? "ready" : "empty", balance);
}

function renderMissingDeepSeekKey() {
  lastProviderData = null;
  lastError = t("missingKey");
  document.documentElement.style.setProperty("--level", "0%");
  setText(elements.remaining, "--");
  setText(elements.remainingLabel, t("remainingDeepSeek"));
  setText(elements.primaryLabel, t("primaryLabelDeepSeek"));
  setText(elements.primaryText, providerSettings.keySource === "environment" ? t("envKey") : t("noKey"));
  setText(elements.secondaryLabel, t("secondaryLabelDeepSeek"));
  setText(elements.secondaryText, "--");
  setText(elements.planLabel, t("planLabelDeepSeek"));
  setText(elements.planText, "--");
  renderForecast(null);
  setState("error");
}

function renderError(error) {
  lastProviderData = null;
  lastError = normalizeErrorMessage(error);
  document.documentElement.style.setProperty("--level", "0%");

  if (provider() === "deepseek") {
    setText(elements.remaining, "--");
    setText(elements.remainingLabel, t("remainingDeepSeek"));
    setText(elements.primaryLabel, t("primaryLabelDeepSeek"));
    setText(elements.secondaryLabel, t("secondaryLabelDeepSeek"));
    setText(elements.planLabel, t("planLabelDeepSeek"));
  } else {
    setText(elements.remaining, "--%");
    setText(elements.remainingLabel, t("remainingCodex"));
    setText(elements.primaryLabel, t("primaryLabelCodex"));
    setText(elements.secondaryLabel, t("secondaryLabelCodex"));
    setText(elements.planLabel, t("planLabelCodex"));
  }

  setText(elements.primaryText, "--");
  setText(elements.secondaryText, "--");
  setText(elements.planText, "--");
  renderForecast(null);
  setState("error");
}

async function loadProviderSettings() {
  if (!quotaApi?.getProviderSettings) return;
  providerSettings = await quotaApi.getProviderSettings();
  applySettingsUi();
  setProviderUi();
}

async function updateAppearance(theme, opacity) {
  if (!quotaApi?.updateAppearance) return;
  providerSettings = await quotaApi.updateAppearance({ theme, opacity });
  applySettingsUi();
}

async function updateAutoRefresh(autoRefreshMins) {
  if (!quotaApi?.updateAutoRefresh) return;
  providerSettings = await quotaApi.updateAutoRefresh(Number(autoRefreshMins));
  applySettingsUi();
  restartAutoRefreshTimer();
}

async function setDisplayMode(mode) {
  if (!quotaApi?.setDisplayMode) return;
  providerSettings = await quotaApi.setDisplayMode(mode);
  applySettingsUi();
  setProviderUi();
}

async function refreshProviderData() {
  if (refreshInFlight) return;
  setProviderUi();

  if (provider() === "deepseek" && !providerSettings.hasDeepseekApiKey) {
    renderMissingDeepSeekKey();
    return;
  }

  setLoading();
  refreshInFlight = true;
  try {
    const data = quotaApi.getProviderData ? await quotaApi.getProviderData() : await quotaApi.getQuota();
    renderProviderData(data);
  } catch (error) {
    renderError(error);
  } finally {
    refreshInFlight = false;
  }
}

async function setProvider(providerName) {
  if (!quotaApi?.setProvider) return;
  providerSettings = await quotaApi.setProvider(providerName);
  applySettingsUi();
  setProviderUi();
  restartAutoRefreshTimer();
  await refreshProviderData();
}

function restartAutoRefreshTimer() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  const minutes = Number(providerSettings.autoRefreshMins);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  autoRefreshTimer = setInterval(refreshProviderData, minutes * 60 * 1000);
}

function renderForecast(forecast) {
  const isDeepSeek = provider() === "deepseek";

  if (!forecast) {
    setText(elements.forecastPrimaryLabel, isDeepSeek ? t("forecastDeepSeek") : t("forecastPrimaryCodex"));
    setText(elements.forecastPrimaryText, t("insufficientData"));
    elements.forecastPrimaryText.dataset.status = "unknown";
    setText(elements.forecastSecondaryLabel, t("forecastSecondaryCodex"));
    setText(elements.forecastSecondaryText, t("insufficientData"));
    elements.forecastSecondaryText.dataset.status = "unknown";
    elements.forecastSecondaryLabel.parentElement.classList.toggle("hidden", isDeepSeek);
    setText(elements.miniForecast, isDeepSeek ? "余额 --" : "5h --");
    return;
  }

  if (forecast.provider === "deepseek") {
    const item = forecast.balance;
    setText(elements.forecastPrimaryLabel, t("forecastDeepSeek"));
    setText(elements.forecastPrimaryText, formatForecastDisplay(item));
    elements.forecastPrimaryText.dataset.status = item?.status || "unknown";
    elements.forecastSecondaryText.dataset.status = "unknown";
    elements.forecastSecondaryLabel.parentElement.classList.add("hidden");
    setText(elements.miniForecast, formatMiniForecast(item, "余额"));
    return;
  }

  elements.forecastSecondaryLabel.parentElement.classList.remove("hidden");
  setText(elements.forecastPrimaryLabel, t("forecastPrimaryCodex"));
  setText(elements.forecastPrimaryText, formatForecastDisplay(forecast.primary));
  elements.forecastPrimaryText.dataset.status = forecast.primary?.status || "unknown";
  setText(elements.forecastSecondaryLabel, t("forecastSecondaryCodex"));
  setText(elements.forecastSecondaryText, formatForecastDisplay(forecast.secondary));
  elements.forecastSecondaryText.dataset.status = forecast.secondary?.status || "unknown";
  setText(elements.miniForecast, formatMiniForecast(forecast.primary, "5h"));
}

function formatForecastDisplay(item) {
  if (!item) return t("insufficientData");
  return item.detail || item.label || t("insufficientData");
}

function formatMiniForecast(item, prefix) {
  if (!item) return `${prefix} --`;
  if (item.status === "unknown") return `${prefix} 数据不足`;
  const detail = item.detail || item.label || "";
  if (detail.includes("预计还能用 ")) {
    return `${prefix} ${detail.replace("预计还能用 ", "")}`;
  }
  if (detail.includes("消耗很低")) return `${prefix} 低消耗`;
  return `${prefix} --`;
}

async function syncPinnedState() {
  try {
    updatePinned(await quotaApi.getAlwaysOnTop());
  } catch {
    updatePinned(true);
  }
}

function updatePinned(isPinned) {
  elements.pinBtn.classList.toggle("active", Boolean(isPinned));
  setButtonLabel(elements.pinBtn, isPinned ? t("pinOn") : t("pinOff"));
}

function rerenderLanguage() {
  localStorage.setItem("language", language);
  applyStaticCopy();
  applySettingsUi();
  setProviderUi();
  syncPinnedState();

  if (lastProviderData) {
    renderProviderData(lastProviderData);
  } else if (lastError && provider() === "deepseek" && !providerSettings.hasDeepseekApiKey) {
    renderMissingDeepSeekKey();
  } else if (lastError) {
    renderError(lastError);
  } else {
    setLoading();
  }
}

elements.langBtn.addEventListener("click", () => {
  language = language === "zh" ? "en" : "zh";
  rerenderLanguage();
});

elements.codexProviderBtn.addEventListener("click", () => setProvider("codex"));
elements.deepseekProviderBtn.addEventListener("click", () => setProvider("deepseek"));

elements.modeBtn.addEventListener("click", () => {
  setDisplayMode(providerSettings.displayMode === "mini" ? "full" : "mini");
});
elements.miniExpandBtn.addEventListener("click", () => setDisplayMode("full"));

elements.widget.addEventListener("dblclick", () => {
  if (providerSettings.displayMode === "mini") {
    setDisplayMode("full");
  }
});

elements.glassThemeBtn.addEventListener("click", () => updateAppearance("glass", providerSettings.opacity));
elements.darkThemeBtn.addEventListener("click", () => updateAppearance("dark", providerSettings.opacity));
elements.minimalThemeBtn.addEventListener("click", () => updateAppearance("minimal", providerSettings.opacity));
elements.opacityRange.addEventListener("input", () => {
  providerSettings = {
    ...providerSettings,
    opacity: Number(elements.opacityRange.value) / 100
  };
  applySettingsUi();
});
elements.opacityRange.addEventListener("change", () => {
  updateAppearance(providerSettings.theme, Number(elements.opacityRange.value) / 100);
});
elements.autoRefreshSelect.addEventListener("change", () => {
  updateAutoRefresh(elements.autoRefreshSelect.value);
});

elements.deepseekKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!quotaApi?.saveDeepSeekKey) return;

  providerSettings = await quotaApi.saveDeepSeekKey(elements.deepseekKeyInput.value);
  applySettingsUi();
  elements.deepseekKeyInput.value = "";
  setText(elements.statusText, providerSettings.maskedDeepseekApiKey ? `${t("keySaved")} ${providerSettings.maskedDeepseekApiKey}` : t("keySaved"));
  await refreshProviderData();
});

elements.pinBtn.addEventListener("click", async () => {
  const isActive = elements.pinBtn.classList.contains("active");
  if (!quotaApi) return;
  updatePinned(await quotaApi.setAlwaysOnTop(!isActive));
});

elements.refreshBtn.addEventListener("click", refreshProviderData);
elements.minimizeBtn.addEventListener("click", () => quotaApi?.minimize());
elements.closeBtn.addEventListener("click", () => quotaApi?.close());
elements.statusText.addEventListener("click", refreshProviderData);

applyStaticCopy();

if (quotaApi) {
  quotaApi.onRefresh(refreshProviderData);
  quotaApi.onAlwaysOnTopChanged(updatePinned);
  quotaApi.onDisplayModeChanged?.((displayMode) => {
    providerSettings = { ...providerSettings, displayMode };
    applySettingsUi();
  });
  syncPinnedState();
  loadProviderSettings()
    .then(() => {
      restartAutoRefreshTimer();
      return refreshProviderData();
    })
    .catch(renderError);
} else {
  updatePinned(true);
  renderError(new Error("Codex bridge unavailable."));
}
