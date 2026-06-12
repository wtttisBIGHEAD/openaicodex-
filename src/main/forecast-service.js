const MIN_PRIMARY_SPAN_MS = 5 * 60 * 1000;
const MIN_SECONDARY_SPAN_MS = 6 * 60 * 60 * 1000;
const MIN_DEEPSEEK_SPAN_MS = 6 * 60 * 60 * 1000;
const DEEPSEEK_FORECAST_WINDOW_DAYS = 14;
const EPSILON = 0.001;

function forecastCodex(quota, historyEntries) {
  return {
    provider: "codex",
    primary: forecastCodexPrimary(quota, historyEntries),
    secondary: forecastCodexSecondary(quota, historyEntries)
  };
}

function forecastCodexPrimary(quota, historyEntries) {
  const currentReset = quota?.primary?.resetsAt;
  if (!currentReset) return unknown("5小时数据不足", "缺少 5 小时窗口重置时间");

  const points = codexWindowPoints(historyEntries, "primary", currentReset);
  return forecastPercentWindow(points, {
    minSpanMs: MIN_PRIMARY_SPAN_MS,
    resetLabel: "5小时",
    enoughLabel: "5小时预计够用",
    lowLabel: "5小时消耗很低",
    insufficientLabel: "5小时数据不足",
    warningPrefix: "预计"
  });
}

function forecastCodexSecondary(quota, historyEntries) {
  const currentReset = quota?.secondary?.resetsAt;
  if (!currentReset) return unknown("7天数据不足", "缺少 7 天窗口重置时间");

  const points = codexWindowPoints(historyEntries, "secondary", currentReset);
  return forecastPercentWindow(points, {
    minSpanMs: MIN_SECONDARY_SPAN_MS,
    resetLabel: "7天",
    enoughLabel: "7天预计够用",
    lowLabel: "7天消耗很低",
    insufficientLabel: "7天数据不足",
    warningPrefix: "按当前速度还可用"
  });
}

function forecastPercentWindow(points, options) {
  if (points.length < 2) {
    return unknown(options.insufficientLabel, "至少需要 2 个历史点");
  }

  const earliest = points[0];
  const latest = points[points.length - 1];
  const spanMs = Date.parse(latest.fetchedAt) - Date.parse(earliest.fetchedAt);
  if (spanMs < options.minSpanMs) {
    return unknown(options.insufficientLabel, "历史跨度不足");
  }

  const usedDelta = Number(latest.window.usedPercent) - Number(earliest.window.usedPercent);
  if (!Number.isFinite(usedDelta) || usedDelta <= EPSILON) {
    return ok(options.lowLabel, "按当前速度不会在重置前用完");
  }

  const hoursDelta = spanMs / 3600000;
  const usedPercentPerHour = usedDelta / hoursDelta;
  const remaining = Number(latest.window.remainingPercent);
  const resetMs = Date.parse(latest.window.resetsAt);
  const latestMs = Date.parse(latest.fetchedAt);

  if (!Number.isFinite(remaining) || !Number.isFinite(resetMs) || resetMs <= latestMs) {
    return unknown(options.insufficientLabel, "窗口重置时间无效");
  }

  const hoursUntilEmpty = remaining / usedPercentPerHour;
  const hoursUntilReset = (resetMs - latestMs) / 3600000;

  if (hoursUntilEmpty > hoursUntilReset) {
    return ok(options.enoughLabel, "按当前速度不会在重置前用完");
  }

  const duration = options.resetLabel === "7天" ? formatDaysOrHours(hoursUntilEmpty / 24) : formatHoursOrMinutes(hoursUntilEmpty);
  const detail = options.resetLabel === "7天" ? `${options.warningPrefix} ${duration}` : `${options.warningPrefix} ${duration} 后用完`;
  return warning(`${options.resetLabel}窗口风险`, detail);
}

function codexWindowPoints(historyEntries, windowName, resetAt) {
  return (historyEntries || [])
    .filter((entry) => entry.provider === "codex" && entry[windowName]?.resetsAt === resetAt)
    .map((entry) => ({ fetchedAt: entry.fetchedAt, window: entry[windowName] }))
    .filter((point) => Number.isFinite(Date.parse(point.fetchedAt)) && point.window)
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
}

function forecastDeepSeek(balance, historyEntries) {
  const currency = balance?.primaryCurrency || balance?.currency;
  const currentBalance = Number(balance?.totalBalance);
  const currentFetchedAt = balance?.fetchedAt;
  const currentFetchedAtMs = Date.parse(currentFetchedAt || "");
  const cutoffMs = (Number.isFinite(currentFetchedAtMs) ? currentFetchedAtMs : Date.now()) - DEEPSEEK_FORECAST_WINDOW_DAYS * 86400000;
  if (!currency || !Number.isFinite(currentBalance)) {
    return { provider: "deepseek", balance: unknown("余额数据不足", "缺少余额数据") };
  }

  const points = (historyEntries || [])
    .filter((entry) => entry.provider === "deepseek" && entry.currency === currency)
    .map((entry) => ({
      fetchedAt: entry.fetchedAt,
      totalBalance: Number(entry.totalBalance)
    }))
    .filter((entry) => {
      const fetchedAtMs = Date.parse(entry.fetchedAt);
      return Number.isFinite(fetchedAtMs) && fetchedAtMs >= cutoffMs && Number.isFinite(entry.totalBalance);
    })
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));

  if (!points.some((point) => point.fetchedAt === currentFetchedAt)) {
    points.push({ fetchedAt: currentFetchedAt || new Date().toISOString(), totalBalance: currentBalance });
    points.sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
  }

  if (points.length < 2) {
    return { provider: "deepseek", balance: unknown("余额数据不足", "至少需要 2 个历史点") };
  }

  const spanMs = Date.parse(points[points.length - 1].fetchedAt) - Date.parse(points[0].fetchedAt);
  if (spanMs < MIN_DEEPSEEK_SPAN_MS) {
    return { provider: "deepseek", balance: unknown("余额数据不足", "历史跨度不足") };
  }

  let spent = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].totalBalance;
    const current = points[index].totalBalance;
    if (current < previous) spent += previous - current;
  }

  if (spent <= EPSILON) {
    return { provider: "deepseek", balance: ok("最近消耗很低", "没有检测到余额下降") };
  }

  const daysDelta = spanMs / 86400000;
  const averageDailySpend = spent / daysDelta;
  const daysLeft = currentBalance / averageDailySpend;
  const detail = `预计还能用 ${formatDaysOrHours(daysLeft)}`;
  const result = daysLeft < 3 ? warning("余额偏低", detail) : ok("余额预计够用", detail);
  return { provider: "deepseek", balance: result };
}

function ok(label, detail) {
  return { status: "ok", label, detail };
}

function warning(label, detail) {
  return { status: "warning", label, detail };
}

function unknown(label, detail) {
  return { status: "unknown", label, detail };
}

function formatHoursOrMinutes(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "未知时间";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  return `${Math.round(hours * 10) / 10} 小时`;
}

function formatDaysOrHours(days) {
  if (!Number.isFinite(days) || days < 0) return "未知时间";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} 小时`;
  return `${Math.round(days * 10) / 10} 天`;
}

module.exports = {
  forecastCodex,
  forecastCodexPrimary,
  forecastCodexSecondary,
  forecastDeepSeek
};
