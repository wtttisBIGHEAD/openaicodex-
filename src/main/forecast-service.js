const MIN_PRIMARY_SPAN_MS = 5 * 60 * 1000;
const MIN_SECONDARY_SPAN_MS = 6 * 60 * 60 * 1000;
const MIN_DEEPSEEK_SPAN_MS = 6 * 60 * 60 * 1000;
const DEEPSEEK_FORECAST_WINDOW_DAYS = 14;
const EPSILON = 0.001;

function forecastCodex(quota, historyEntries) {
  return {
    provider: "codex",
    reference: codexQuotaReference(quota),
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
    insufficientLabel: "5小时数据不足"
  });
}

function forecastCodexSecondary(quota, historyEntries) {
  const currentReset = quota?.secondary?.resetsAt;
  if (!currentReset) return unknown("7天数据不足", "缺少 7 天窗口重置时间");

  const summaries = summarizeCodexFiveHourWindows(historyEntries, currentReset);
  return forecastSecondaryFromSummaries(quota, summaries);
}

function forecastPercentWindow(points, options) {
  const meta = confidenceMeta(points, options.resetLabel);
  if (points.length < 2) {
    return unknown(options.insufficientLabel, "至少需要 2 个历史点", meta);
  }

  const earliest = points[0];
  const latest = points[points.length - 1];
  const spanMs = Date.parse(latest.fetchedAt) - Date.parse(earliest.fetchedAt);
  if (spanMs < options.minSpanMs) {
    return unknown(options.insufficientLabel, "历史跨度不足", meta);
  }

  const usedDelta = Number(latest.window.usedPercent) - Number(earliest.window.usedPercent);
  if (!Number.isFinite(usedDelta) || usedDelta <= EPSILON) {
    return ok(options.lowLabel, "最近消耗很低，暂时无法估算用完时间", meta);
  }

  const hoursDelta = spanMs / 3600000;
  const usedPercentPerHour = usedDelta / hoursDelta;
  const remaining = Number(latest.window.remainingPercent);
  const resetMs = Date.parse(latest.window.resetsAt);
  const latestMs = Date.parse(latest.fetchedAt);

  if (!Number.isFinite(remaining) || !Number.isFinite(resetMs) || resetMs <= latestMs) {
    return unknown(options.insufficientLabel, "窗口重置时间无效", meta);
  }

  const hoursUntilEmpty = remaining / usedPercentPerHour;
  const hoursUntilReset = (resetMs - latestMs) / 3600000;
  const duration = options.resetLabel === "7天" ? formatDaysOrHours(hoursUntilEmpty / 24) : formatHoursOrMinutes(hoursUntilEmpty);
  const detail = `预计还能用 ${duration}`;

  if (hoursUntilEmpty > hoursUntilReset) {
    return ok(options.enoughLabel, detail, meta);
  }

  return warning(`${options.resetLabel}窗口风险`, detail, meta);
}

function codexWindowPoints(historyEntries, windowName, resetAt) {
  return (historyEntries || [])
    .filter((entry) => entry.provider === "codex" && entry[windowName]?.resetsAt === resetAt)
    .map((entry) => ({ fetchedAt: entry.fetchedAt, window: entry[windowName] }))
    .filter((point) => Number.isFinite(Date.parse(point.fetchedAt)) && point.window)
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
}

function summarizeCodexFiveHourWindows(historyEntries, secondaryResetAt) {
  const groups = new Map();
  for (const entry of historyEntries || []) {
    if (entry.provider !== "codex") continue;
    if (entry.secondary?.resetsAt !== secondaryResetAt) continue;
    if (!entry.primary?.resetsAt || !Number.isFinite(Date.parse(entry.fetchedAt))) continue;

    const group = groups.get(entry.primary.resetsAt) || [];
    group.push(entry);
    groups.set(entry.primary.resetsAt, group);
  }

  return [...groups.entries()]
    .map(([resetAt, entries]) => {
      const sorted = entries.sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
      const start = sorted[0];
      const terminal = sorted.find((entry) => Number(entry.primary?.usedPercent) >= 100 || Number(entry.primary?.remainingPercent) <= 0);
      const end = terminal || sorted[sorted.length - 1];
      return {
        resetAt,
        start,
        end,
        sampleCount: sorted.length,
        exhausted: Boolean(terminal)
      };
    })
    .filter((summary) => summary.start && summary.end && summary.end.fetchedAt !== summary.start.fetchedAt)
    .sort((a, b) => Date.parse(a.start.fetchedAt) - Date.parse(b.start.fetchedAt));
}

function forecastSecondaryFromSummaries(quota, summaries) {
  const meta = confidenceMetaFromSummaries(summaries, "7天", quota?.secondary?.resetsAt);
  if (summaries.length === 0) return unknown("7天数据不足", "至少需要 1 个 5 小时窗口摘要", meta);

  const first = summaries[0].start;
  const latest = summaries[summaries.length - 1].end;
  const spanMs = Date.parse(latest.fetchedAt) - Date.parse(first.fetchedAt);
  if (spanMs < MIN_SECONDARY_SPAN_MS) {
    return unknown("7天数据不足", "历史跨度不足", meta);
  }

  let usedDelta = 0;
  for (const summary of summaries) {
    const startUsed = Number(summary.start.secondary?.usedPercent);
    const endUsed = Number(summary.end.secondary?.usedPercent);
    if (Number.isFinite(startUsed) && Number.isFinite(endUsed) && endUsed > startUsed) {
      usedDelta += endUsed - startUsed;
    }
  }

  if (usedDelta <= EPSILON) {
    return ok("7天消耗很低", "最近消耗很低，暂时无法估算用完时间", meta);
  }

  const daysDelta = spanMs / 86400000;
  const usedPercentPerDay = usedDelta / daysDelta;
  const remaining = Number(quota?.secondary?.remainingPercent ?? latest.secondary?.remainingPercent);
  const resetMs = Date.parse(quota?.secondary?.resetsAt || latest.secondary?.resetsAt);
  const latestMs = Date.parse(latest.fetchedAt);

  if (!Number.isFinite(remaining) || !Number.isFinite(resetMs) || resetMs <= latestMs) {
    return unknown("7天数据不足", "窗口重置时间无效", meta);
  }

  const daysUntilEmpty = remaining / usedPercentPerDay;
  const daysUntilReset = (resetMs - latestMs) / 86400000;
  const detail = `预计还能用 ${formatDaysOrHours(daysUntilEmpty)}`;
  return daysUntilEmpty > daysUntilReset
    ? ok("7天预计够用", detail, meta)
    : warning("7天窗口风险", detail, meta);
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

function ok(label, detail, meta) {
  return { status: "ok", label, detail, ...(meta ? { meta } : {}) };
}

function warning(label, detail, meta) {
  return { status: "warning", label, detail, ...(meta ? { meta } : {}) };
}

function unknown(label, detail, meta) {
  return { status: "unknown", label, detail, ...(meta ? { meta } : {}) };
}

function confidenceMeta(points, resetLabel) {
  const sampleCount = points.length;
  const earliest = points[0];
  const latest = points[points.length - 1];
  const spanMinutes = earliest && latest
    ? Math.max(0, Math.round((Date.parse(latest.fetchedAt) - Date.parse(earliest.fetchedAt)) / 60000))
    : 0;
  return {
    confidence: confidenceLevel(sampleCount, spanMinutes),
    confidenceLabel: `样本 ${sampleCount} / 跨度 ${formatSpanMinutes(spanMinutes)}`,
    sampleCount,
    spanMinutes,
    windowResetsAt: latest?.window?.resetsAt || null
  };
}

function confidenceMetaFromSummaries(summaries, resetLabel, resetAt) {
  const sampleCount = summaries.reduce((total, summary) => total + summary.sampleCount, 0);
  const first = summaries[0]?.start;
  const latest = summaries[summaries.length - 1]?.end;
  const spanMinutes = first && latest
    ? Math.max(0, Math.round((Date.parse(latest.fetchedAt) - Date.parse(first.fetchedAt)) / 60000))
    : 0;
  return {
    confidence: confidenceLevel(sampleCount, spanMinutes),
    confidenceLabel: `样本 ${sampleCount} / 窗口 ${summaries.length} / 跨度 ${formatSpanMinutes(spanMinutes)}`,
    sampleCount,
    spanMinutes,
    windowCount: summaries.length,
    windowResetsAt: resetAt || null
  };
}

function confidenceLevel(sampleCount, spanMinutes) {
  if (sampleCount >= 6 && spanMinutes >= 30) return "high";
  if (sampleCount >= 3 && spanMinutes >= 5) return "medium";
  return "low";
}

function formatSpanMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 分钟";
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  return `${Math.round((minutes / 60) * 10) / 10} 小时`;
}

function codexQuotaReference(quota) {
  const plan = String(quota?.accountPlanType || quota?.planType || "").toLowerCase();
  if (!plan.includes("pro")) return null;
  const tier = plan.includes("20") ? "Pro 20x" : "Pro 5x";
  const localMessages = tier === "Pro 20x"
    ? "GPT-5.5 300-1600/5h，GPT-5.4 400-2000/5h，mini 1200-7000/5h"
    : "GPT-5.5 80-400/5h，GPT-5.4 100-500/5h，mini 300-1750/5h";
  return {
    tier,
    localMessages,
    weekly: "官方公开文档未给固定周额度；周估算使用 Codex 实时 7 天窗口"
  };
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
  forecastDeepSeek,
  summarizeCodexFiveHourWindows
};
