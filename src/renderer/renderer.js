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
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  liquidFill: document.getElementById("liquidFill"),
  langBtn: document.getElementById("langBtn"),
  pinBtn: document.getElementById("pinBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  closeBtn: document.getElementById("closeBtn")
};

const copy = {
  zh: {
    langButton: "EN",
    brandName: "Codex 额度",
    loading: "读取中",
    ready: "额度充足",
    warn: "额度偏低",
    empty: "额度已用完",
    error: "读取失败",
    remaining: "剩余",
    primaryLabel: "5小时窗口",
    secondaryLabel: "7天窗口",
    planLabel: "计划",
    unknown: "未知",
    refreshing: "正在读取 Codex 额度...",
    refreshed: "已更新",
    used: "已用",
    resets: "重置",
    noWindow: "暂无窗口数据",
    retry: "点击刷新重试",
    pinOn: "取消置顶",
    pinOff: "置顶",
    refresh: "刷新",
    minimize: "隐藏",
    close: "退出"
  },
  en: {
    langButton: "中",
    brandName: "Codex Quota",
    loading: "Loading",
    ready: "Quota available",
    warn: "Quota low",
    empty: "Quota depleted",
    error: "Read failed",
    remaining: "left",
    primaryLabel: "5h window",
    secondaryLabel: "7d window",
    planLabel: "Plan",
    unknown: "Unknown",
    refreshing: "Reading Codex quota...",
    refreshed: "Updated",
    used: "used",
    resets: "resets",
    noWindow: "No window data",
    retry: "Refresh to retry",
    pinOn: "Unpin",
    pinOff: "Pin",
    refresh: "Refresh",
    minimize: "Hide",
    close: "Quit"
  }
};

let language = localStorage.getItem("language") || (navigator.language.startsWith("zh") ? "zh" : "en");
let lastQuota = null;
let lastError = null;
const quotaApi = window.codexQuota;

function t(key) {
  return copy[language][key];
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function setButtonLabel(button, label) {
  if (!button) return;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function applyStaticCopy() {
  setText(elements.langBtn, t("langButton"));
  setText(elements.brandName, t("brandName"));
  setText(elements.remainingLabel, t("remaining"));
  setText(elements.primaryLabel, t("primaryLabel"));
  setText(elements.secondaryLabel, t("secondaryLabel"));
  setText(elements.planLabel, t("planLabel"));
  setButtonLabel(elements.refreshBtn, t("refresh"));
  setButtonLabel(elements.minimizeBtn, t("minimize"));
  setButtonLabel(elements.closeBtn, t("close"));
}

function setLoading() {
  elements.body.dataset.state = "loading";
  elements.trafficLight.className = "traffic-light loading";
  elements.statusDot.className = "status-dot loading";
  setText(elements.stateText, t("loading"));
  setText(elements.statusText, t("refreshing"));
}

function setState(state, quota) {
  elements.body.dataset.state = state;
  elements.trafficLight.className = `traffic-light ${state}`;
  elements.statusDot.className = `status-dot ${state}`;

  if (state === "error") {
    setText(elements.stateText, t("error"));
    setText(elements.statusText, lastError || t("retry"));
    return;
  }

  setText(elements.stateText, t(state));
  const fetchedAt = quota?.fetchedAt ? new Date(quota.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
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

function renderQuota(quota) {
  lastQuota = quota;
  lastError = null;

  const remaining = Number(quota?.remainingPercent);
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, Math.min(100, Math.round(remaining))) : 0;
  const state = stateForRemaining(safeRemaining);

  document.documentElement.style.setProperty("--level", `${safeRemaining}%`);
  setText(elements.remaining, Number.isFinite(remaining) ? `${safeRemaining}%` : "--%");
  setText(elements.primaryText, formatWindow(quota?.primary));
  setText(elements.secondaryText, formatWindow(quota?.secondary));
  setText(elements.planText, quota?.planType || quota?.limitName || t("unknown"));
  setState(state, quota);
}

function renderError(error) {
  lastError = error?.message || String(error || t("retry"));
  document.documentElement.style.setProperty("--level", "0%");
  setText(elements.remaining, "--%");
  setText(elements.primaryText, "--");
  setText(elements.secondaryText, "--");
  setText(elements.planText, "--");
  setState("error");
}

async function refreshQuota() {
  setLoading();
  try {
    renderQuota(await quotaApi.getQuota());
  } catch (error) {
    renderError(error);
  }
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
  syncPinnedState();

  if (lastQuota) {
    renderQuota(lastQuota);
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

elements.pinBtn.addEventListener("click", async () => {
  const isActive = elements.pinBtn.classList.contains("active");
  if (!quotaApi) return;
  updatePinned(await quotaApi.setAlwaysOnTop(!isActive));
});

elements.refreshBtn.addEventListener("click", refreshQuota);
elements.minimizeBtn.addEventListener("click", () => quotaApi?.minimize());
elements.closeBtn.addEventListener("click", () => quotaApi?.close());
elements.statusText.addEventListener("click", refreshQuota);

applyStaticCopy();

if (quotaApi) {
  quotaApi.onRefresh(refreshQuota);
  quotaApi.onAlwaysOnTopChanged(updatePinned);
  syncPinnedState();
  refreshQuota();
} else {
  updatePinned(true);
  renderError(new Error("Codex bridge unavailable."));
}
