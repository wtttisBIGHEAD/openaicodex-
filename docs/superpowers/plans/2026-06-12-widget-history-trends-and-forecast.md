# Widget History, Forecast, and Auto Refresh Plan

## 当前状态

已完成：

- Codex / DeepSeek 双数据源
- DeepSeek 余额读取
- 迷你悬浮模式
- 记住窗口位置
- 边缘吸附
- 主题切换
- 透明度设置

本计划覆盖剩余能力：

1. 历史记录
2. Codex / DeepSeek 可用性估算
3. 自动刷新

趋势小图表已按最新需求移除，历史数据只继续服务于可用性估算。

## 目标

让组件能持续记录刷新结果，并基于本地历史数据展示“还能用多久”的估算。

## 设计原则

- 不改变现有 Codex 与 DeepSeek 数据源读取方式。
- 所有历史数据只保存在本机。
- 预测结果只作为“按当前速度”的估算，不做绝对承诺。
- 数据不足时明确显示“数据不足”，不强行推断。
- 自动刷新失败不弹窗打扰，只更新状态。
- 每个阶段都能单独测试、单独提交。

## 阶段 4：历史记录

### 目标

每次刷新成功后，把当前数据源的关键数据写入本地历史文件，为预测提供基础。

### 存储位置

使用 Electron `app.getPath("userData")` 下的文件：

```text
history.json
```

### 历史结构

```json
{
  "version": 1,
  "entries": [
    {
      "provider": "codex",
      "fetchedAt": "2026-06-12T10:00:00.000Z",
      "remainingPercent": 72,
      "usedPercent": 28,
      "primary": {
        "remainingPercent": 72,
        "usedPercent": 28,
        "resetsAt": "2026-06-12T14:00:00.000Z"
      },
      "secondary": {
        "remainingPercent": 64,
        "usedPercent": 36,
        "resetsAt": "2026-06-18T10:00:00.000Z"
      }
    },
    {
      "provider": "deepseek",
      "fetchedAt": "2026-06-12T10:00:00.000Z",
      "currency": "CNY",
      "totalBalance": 18.4,
      "isAvailable": true
    }
  ]
}
```

### 写入规则

- `provider:getData` 刷新成功后写入一条记录。
- 手动刷新和自动刷新都写历史。
- 同一数据源 5 分钟内只保留第一条，避免短时间重复刷新产生噪音，也避免频繁点击刷新导致估算基准点不断后移。
- 保留最近 30 天数据，超过自动清理。
- 历史文件损坏时，不让应用崩溃，直接回退为空历史并覆盖修复。

### 新增模块

`src/main/history-service.js`

职责：

- `createHistoryStore(userDataPath)`
- `load()`
- `append(entry)`
- `getEntries(provider, days)`
- `prune(days)`
- `normalizeCodexHistoryEntry(quota)`
- `normalizeDeepSeekHistoryEntry(balance)`

### 测试

新增 `test/history-service.test.js`：

- 默认空历史
- Codex 成功归一化
- DeepSeek 成功归一化
- 5 分钟内同数据源保留第一条并忽略后续重复刷新
- 30 天外数据清理
- 损坏 JSON 回退为空历史

## 已移除：趋势小图表

趋势小图表按最新反馈移除。

当前约束：

- 不再渲染 `trend-panel` 或 `trendChart`。
- 不再暴露趋势专用的 `history:get` / `getHistory` IPC。
- 历史记录继续保留，因为 5 小时、7 天和 DeepSeek 余额估算仍依赖本地历史点。
- 使用 `test/renderer-ui.test.js` 防止趋势 UI 和 IPC 被误加回来。

## 阶段 6：可用性估算

### 目标

基于历史记录显示：

- Codex 5 小时窗口是否够用
- Codex 7 天窗口是否够用
- DeepSeek 余额预计还能用几天

### 通用返回结构

`src/main/forecast-service.js` 返回统一结构：

```json
{
  "provider": "codex",
  "primary": {
    "status": "ok",
    "label": "5小时预计够用",
    "detail": "预计还能用 6.4 小时"
  },
  "secondary": {
    "status": "warning",
    "label": "7天窗口风险",
    "detail": "预计还能用 2.4 天"
  }
}
```

状态：

- `ok`：预计够用或消耗很低
- `warning`：预计会提前用完
- `unknown`：数据不足或无法估算
- `error`：数据异常

### Codex 5 小时窗口估算

这是你最新确认的规则。

目标：

判断当前 5 小时窗口是否可能在重置前耗尽。

数据选择：

1. 使用当前 quota 的 `primary.resetsAt` 识别当前 5 小时窗口。
2. 只取历史中 `provider = codex` 且 `primary.resetsAt` 与当前 `primary.resetsAt` 一致的数据点。
3. 这样 Codex 每 5 小时刷新后，会自然开始使用新的窗口数据，不把旧窗口混进来。

最低数据要求：

- 至少 2 个点。
- 最早点和最新点之间跨度至少 5 分钟。

计算：

```text
usedDelta = latest.primary.usedPercent - earliest.primary.usedPercent
hoursDelta = (latest.fetchedAt - earliest.fetchedAt) / 1小时
usedPercentPerHour = usedDelta / hoursDelta
hoursUntilEmpty = latest.primary.remainingPercent / usedPercentPerHour
hoursUntilReset = (latest.primary.resetsAt - latest.fetchedAt) / 1小时
```

结果：

- 如果数据不足：`unknown / 数据不足`
- 如果 `usedDelta <= 0` 或速度接近 0：`ok / 最近消耗很低，暂时无法估算用完时间`
- 如果 `hoursUntilEmpty > hoursUntilReset`：`ok / 预计还能用 X 小时`
- 如果 `hoursUntilEmpty <= hoursUntilReset`：`warning / 预计还能用 X 小时`

格式：

- 小于 1 小时显示分钟，例如 `预计还能用 36 分钟`
- 大于等于 1 小时显示 1 位小数，例如 `预计还能用 1.8 小时`

### Codex 7 天窗口估算

目标：

判断 7 天窗口按当前每天消耗速度是否够用。

数据选择：

1. 使用当前 quota 的 `secondary.resetsAt` 识别当前 7 天窗口。
2. 只取历史中 `provider = codex` 且 `secondary.resetsAt` 与当前 `secondary.resetsAt` 一致的数据点。
3. 如果没有 `secondary`，显示数据不足。

最低数据要求：

- 至少 2 个点。
- 时间跨度至少 6 小时。

计算：

```text
usedDelta = latest.secondary.usedPercent - earliest.secondary.usedPercent
daysDelta = (latest.fetchedAt - earliest.fetchedAt) / 1天
usedPercentPerDay = usedDelta / daysDelta
daysUntilEmpty = latest.secondary.remainingPercent / usedPercentPerDay
daysUntilReset = (latest.secondary.resetsAt - latest.fetchedAt) / 1天
```

结果：

- 数据不足：`unknown / 7天数据不足`
- 消耗速度接近 0：`ok / 最近消耗很低，暂时无法估算用完时间`
- `daysUntilEmpty > daysUntilReset`：`ok / 预计还能用 X 天`
- `daysUntilEmpty <= daysUntilReset`：`warning / 预计还能用 X 天`

格式：

- 小于 1 天显示小时，例如 `预计还能用 9 小时`
- 大于等于 1 天显示 1 位小数，例如 `预计还能用 2.4 天`

### DeepSeek 余额天数估算

目标：

根据本地历史余额下降速度估算余额还能用几天。

数据选择：

1. 取最近 14 天 DeepSeek 记录。
2. 只使用同一 `currency` 的记录，优先当前余额的 currency。
3. 余额上升视为充值，不计入消耗速度。
4. 余额不变不计入消耗，但用于判断“消耗很低”。

最低数据要求：

- 至少 2 个点。
- 时间跨度至少 6 小时。
- 至少出现一次余额下降，才计算天数。

计算：

```text
spent = 所有下降段的金额总和
daysDelta = (latest.fetchedAt - earliest.fetchedAt) / 1天
averageDailySpend = spent / daysDelta
daysLeft = latest.totalBalance / averageDailySpend
```

结果：

- 数据不足：`unknown / 余额数据不足`
- 没有下降：`ok / 最近消耗很低`
- `daysLeft` 有效：`ok 或 warning / 预计还能用 X 天`

DeepSeek warning 阈值：

- `daysLeft < 3`：`warning`
- `daysLeft >= 3`：`ok`

### 新增模块

`src/main/forecast-service.js`

职责：

- `forecastCodex(quota, historyEntries)`
- `forecastCodexPrimary(quota, historyEntries)`
- `forecastCodexSecondary(quota, historyEntries)`
- `forecastDeepSeek(balance, historyEntries)`

### 新增 IPC

主进程：

- `forecast:get`

preload：

- `getForecast()`

更推荐的实现：

- `provider:getData` 成功后直接返回 `forecast` 字段，避免渲染层多调一次。

返回示例：

```json
{
  "provider": "codex",
  "remainingPercent": 72,
  "forecast": {
    "primary": { "status": "ok", "label": "5小时预计够用", "detail": "预计还能用 6.4 小时" },
    "secondary": { "status": "unknown", "label": "7天数据不足", "detail": "至少需要 6 小时跨度" }
  }
}
```

### UI 显示

完整模式：

- 在 quota cards 下方新增预测摘要区域。
- Codex 显示两行：`5小时`、`7天`
- DeepSeek 显示一行：`余额`

迷你模式：

- 不显示预测文字。
- 可以用状态颜色反映风险：
  - forecast `warning` 时黄色或红色
  - forecast `ok` 时绿色
  - `unknown` 不改变原状态

### 测试

新增 `test/forecast-service.test.js`：

Codex 5 小时：

- 2 个点、跨度 5 分钟，速度足够慢：预计够用
- 2 个点、跨度 5 分钟，速度过快：预计提前用完
- resetsAt 不同的旧窗口数据不会参与计算
- 少于 2 个点：数据不足
- 跨度少于 5 分钟：数据不足

Codex 7 天：

- 当前 secondary resetsAt 内的数据估算够用
- 当前 secondary resetsAt 内的数据估算不够用
- resetsAt 不同的旧窗口数据不会参与计算
- 跨度少于 6 小时：数据不足

DeepSeek：

- 余额下降可估算天数
- 余额上涨视为充值，不当作负消耗
- 无下降显示消耗很低
- 跨度少于 6 小时显示数据不足

## 阶段 7：自动刷新

### 目标

让历史记录和预测能在后台自然累积数据。

### 默认行为

- 默认每 30 分钟自动刷新一次。
- 手动刷新仍可随时触发。
- 自动刷新成功后写历史、更新预测。
- 自动刷新失败时不弹窗，只在状态栏显示失败信息。

### 设置

扩展 `settings-service.js`：

```json
{
  "autoRefreshMins": 30
}
```

可选值：

- `0`：关闭自动刷新
- `15`
- `30`
- `60`

第一版默认 `30`，UI 可以先只显示，不做复杂自定义；如果实现顺手，再加下拉选择。

### 实现方式

渲染层负责定时触发刷新：

- Electron 主进程保持数据读取和历史写入。
- Renderer 根据 settings 里的 `autoRefreshMins` 设置 `setInterval`。
- 切换 provider 后重置定时器。
- 应用隐藏到托盘时仍继续自动刷新。

### 测试

自动刷新定时器主要手动验证。

可测试部分：

- `settings-service` 正确保存 `autoRefreshMins`
- 非法值回退到 30

## UI 布局建议

完整模式当前空间有限，趋势图移除后窗口高度调整为 `390`。

布局：

```text
标题栏
Provider Switch
Theme / Opacity / Auto Refresh
主仪表 + 数据卡片
预测摘要
状态栏
```

迷你模式保持 `112 x 48`。

## 实施顺序

### 第一步：历史服务

先实现 `history-service` 和测试。

完成后，`provider:getData` 成功时写入历史，但 UI 暂时不显示。

### 第二步：预测服务

实现 `forecast-service` 和测试。

完成后，`provider:getData` 返回 `forecast` 字段，UI 显示预测摘要。

### 第三步：自动刷新

扩展 settings，默认 30 分钟刷新。

完成后，历史和预测会自动积累。

## 验证清单

自动验证：

- `npm.cmd test`
- `node --check src\main\main.js`
- `node --check src\main\preload.js`
- `node --check src\main\history-service.js`
- `node --check src\main\forecast-service.js`
- `node --check src\renderer\renderer.js`
- `npm.cmd run build:dir`

手动验证：

- Codex 刷新写入历史
- DeepSeek 刷新写入历史
- Codex 5 小时窗口只用同一个 `primary.resetsAt` 的数据估算
- Codex 7 天窗口只用同一个 `secondary.resetsAt` 的数据估算
- DeepSeek 充值后不会把余额上涨算成负消耗
- 数据不足时显示数据不足
- 自动刷新不会打断手动刷新
- 迷你模式仍能回完整模式

## 风险

- Codex 返回的 `resetsAt` 如果为空，当前窗口无法可靠识别：显示数据不足。
- Codex 使用量可能不是线性增长：文案必须使用“预计/按当前速度”。
- 刚开始没有历史数据：预测会显示数据不足，这是预期行为。
- DeepSeek 用户充值会打断余额估算：预测算法忽略上涨段。
- UI 空间变多后窗口高度需要增加，必须重新做启动和打包验证。
