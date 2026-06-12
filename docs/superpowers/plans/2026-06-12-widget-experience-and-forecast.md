# Widget Experience and Forecast Plan

## 目标

把当前 Codex / DeepSeek 双模式余额组件升级成更像桌面常驻小组件的工具：支持迷你悬浮、记住位置、边缘吸附、主题透明度、趋势图，以及 Codex 和 DeepSeek 的可用性估算。

## 设计原则

- 不改变现有 Codex 与 DeepSeek 数据源读取逻辑。
- 所有历史数据只保存在本机，不上传。
- 预测结果只作为“风险估算”，不做绝对承诺。
- 优先保证小组件稳定、轻量、低打扰。
- 功能按阶段落地，每个阶段都能单独测试和提交。

## 功能范围

### 1. 迷你悬浮模式

新增完整模式和迷你模式两种窗口状态。

完整模式保持当前卡片 UI，用来查看详细信息、切换数据源、保存 DeepSeek API Key。

迷你模式显示为小型悬浮胶囊或圆形窗口：

- Codex 显示剩余百分比，例如 `72%`
- DeepSeek 显示余额，例如 `¥18.40`
- 显示当前状态颜色：绿色可用、黄色风险、红色不可用/即将耗尽
- 双击迷你窗口切回完整模式
- 托盘菜单增加“切换迷你模式”

窗口尺寸建议：

- 完整模式：`390 x 300`
- 迷你模式：`112 x 48` 或 `72 x 72`

### 2. 记住窗口位置 + 边缘吸附

保存用户拖动后的窗口位置，重启后恢复。

新增吸附规则：

- 距离屏幕边缘小于 `24px` 时自动贴边
- 同时支持完整模式和迷你模式
- 如果上次位置不在当前屏幕工作区内，自动回到主屏右上角

保存字段：

```json
{
  "windowBounds": {
    "full": { "x": 1200, "y": 24, "width": 390, "height": 300 },
    "mini": { "x": 1500, "y": 40, "width": 112, "height": 48 }
  },
  "displayMode": "full"
}
```

### 3. 主题和透明度

新增轻量设置，不做复杂主题商店。

第一版提供：

- 主题：`glass`、`dark`、`minimal`
- 透明度：`60% - 100%`
- 记住用户选择

CSS 用 `body[data-theme]` 和 CSS 变量实现，不引入主题库。

保存字段：

```json
{
  "theme": "glass",
  "opacity": 0.82
}
```

### 4. 历史记录

新增本地历史数据文件，用于趋势图和预测。

每次刷新成功后记录一条数据。自动刷新默认每 30 分钟一次；手动刷新也记录，但同一数据源在 5 分钟内只保留一条，避免重复刷爆历史文件。

保存最近 30 天数据，超过自动清理。

历史记录结构：

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

### 5. 趋势小图表

在完整模式里新增一个小趋势区域。

显示规则：

- Codex：显示最近 24 小时剩余百分比折线；如果切到 7 天视角，显示最近 7 天
- DeepSeek：显示最近 7 天余额折线
- 数据不足时显示“数据不足”

实现方式：

- 用 Canvas 绘制，不引入图表库
- 图表只读历史记录，不直接调用接口
- 迷你模式不显示图表，只显示预测风险颜色

### 6. 余额 / 额度可用性估算

预测模块统一读取历史记录。

#### Codex 5 小时窗口估算

目标：判断当前 5 小时窗口是否可能在重置前耗尽。

算法：

1. 取当前 primary 窗口内的数据点。
2. 至少需要 3 个点，且跨度至少 30 分钟。
3. 根据 `usedPercent` 增长速度计算每小时消耗。
4. 计算剩余时间：

```text
hoursUntilEmpty = remainingPercent / usedPercentPerHour
```

5. 与 `resetsAt` 剩余时间比较：

- `hoursUntilEmpty > hoursUntilReset`：显示“预计够用”
- `hoursUntilEmpty <= hoursUntilReset`：显示“预计 X 小时后用完”
- 消耗速度接近 0：显示“消耗很低，预计够用”
- 数据不足：显示“数据不足”

#### Codex 7 天窗口估算

目标：判断一周窗口是否够用。

算法：

1. 取 secondary 窗口内最近 2-7 天数据。
2. 按天计算 `usedPercent` 增长速度。
3. 计算：

```text
daysUntilEmpty = remainingPercent / usedPercentPerDay
```

4. 与 `resetsAt` 剩余天数比较：

- `daysUntilEmpty > daysUntilReset`：显示“按当前速度预计够用”
- `daysUntilEmpty <= daysUntilReset`：显示“按当前速度还可用 X 天”
- 数据不足：显示“数据不足”

#### DeepSeek 余额估算

目标：估算余额还能用几天。

算法：

1. 取最近 2-14 天 DeepSeek 余额记录。
2. 只使用余额下降的数据点，忽略充值导致的余额上升。
3. 计算每日平均消耗金额。
4. 计算：

```text
daysLeft = totalBalance / averageDailySpend
```

5. 显示：

- `预计还能用 X 天`
- `最近消耗很低`
- `数据不足`

## 模块拆分

### `src/main/settings-service.js`

扩展现有设置服务，新增：

- `displayMode`
- `windowBounds`
- `theme`
- `opacity`
- `autoRefreshMins`

保持兼容旧设置文件，缺字段时使用默认值。

### `src/main/history-service.js`

新增历史服务：

- `appendEntry(entry)`
- `loadHistory(provider, days)`
- `pruneHistory(days)`
- `normalizeCodexHistoryEntry(quota)`
- `normalizeDeepSeekHistoryEntry(balance)`

### `src/main/forecast-service.js`

新增预测服务：

- `forecastCodexPrimary(quota, history)`
- `forecastCodexSecondary(quota, history)`
- `forecastDeepSeek(balance, history)`

返回统一结构：

```json
{
  "status": "ok | warning | unknown",
  "label": "预计够用",
  "detail": "按当前速度不会在重置前用完"
}
```

### `src/main/main.js`

新增 IPC：

- `window:setDisplayMode`
- `window:saveBounds`
- `settings:updateAppearance`
- `history:get`
- `forecast:get`

在 `provider:getData` 成功后写入历史记录，并返回预测摘要。

### `src/main/preload.js`

暴露新增 IPC，保持渲染层不直接访问文件系统。

### `src/renderer/renderer.js`

新增 UI 状态：

- 完整 / 迷你模式切换
- 图表渲染
- 预测摘要渲染
- 主题与透明度应用

### `src/renderer/styles.css`

新增：

- 迷你窗口布局
- 主题变量
- 图表区域
- 预测提示样式

## 实施顺序

### 阶段 1：设置扩展与窗口位置

目标：先把状态保存能力打稳。

任务：

1. 扩展 `settings-service`
2. 增加窗口 bounds 保存和恢复
3. 增加边缘吸附
4. 添加设置服务测试

验收：

- 拖动窗口后关闭重开，位置恢复
- 贴近边缘自动吸附
- 屏幕变化后不会恢复到屏幕外

### 阶段 2：迷你悬浮模式

目标：完成最明显的桌面体验升级。

任务：

1. 新增 `displayMode`
2. 完整模式 / 迷你模式窗口尺寸切换
3. 迷你 UI
4. 双击和托盘菜单切换

验收：

- 迷你模式显示当前数据源核心值
- 双击切回完整模式
- 重启后恢复上次模式

### 阶段 3：主题和透明度

目标：让用户能调整视觉风格。

任务：

1. 增加主题选择控件
2. 增加透明度滑条
3. 保存并恢复外观设置
4. 调整 CSS 变量

验收：

- 三种主题可切换
- 透明度即时生效
- 重启后设置保留

### 阶段 4：历史记录

目标：为趋势图和预测提供基础数据。

任务：

1. 新增 `history-service`
2. 每次刷新成功后写历史
3. 自动清理 30 天前数据
4. 添加历史服务测试

验收：

- Codex 和 DeepSeek 都能写入历史
- 5 分钟内重复刷新不会产生大量重复点
- 历史文件损坏时自动回退为空历史

### 阶段 5：趋势图

目标：完整模式显示轻量折线图。

任务：

1. 新增 Canvas 图表组件
2. 渲染 Codex 24 小时 / 7 天趋势
3. 渲染 DeepSeek 余额趋势
4. 数据不足状态

验收：

- 有历史数据时显示折线
- 数据不足时不报错
- 迷你模式不渲染图表

### 阶段 6：可用性估算

目标：给 Codex 和 DeepSeek 增加“够不够用”的判断。

任务：

1. 新增 `forecast-service`
2. 实现 Codex 5 小时窗口预测
3. 实现 Codex 7 天窗口预测
4. 实现 DeepSeek 余额天数预测
5. 添加预测服务测试
6. UI 显示预测摘要

验收：

- Codex 显示 5 小时和 7 天预测
- DeepSeek 显示余额可用天数
- 数据不足时显示“数据不足”
- 预测不会在异常历史数据下崩溃

### 阶段 7：自动刷新

目标：让历史记录和预测持续有效。

任务：

1. 默认每 30 分钟自动刷新
2. 支持设置刷新间隔
3. 自动刷新失败时不打扰，只更新状态
4. 手动刷新仍然可用

验收：

- 自动刷新能定时写入历史
- 手动刷新不会和自动刷新冲突
- 网络失败不会关闭应用

## 测试计划

自动测试：

- settings 默认值、保存、兼容旧配置
- history 写入、去重、清理、损坏文件恢复
- forecast 各种边界：数据不足、消耗为 0、快速消耗、充值
- DeepSeek 余额归一化保持现有测试

手动测试：

- 完整/迷你切换
- 拖动、重启、恢复位置
- 边缘吸附
- 主题与透明度
- Codex 刷新后历史记录
- DeepSeek 刷新后历史记录
- 打包 `build:dir`

## 风险和处理

- Codex 窗口重置规则可能不是完全线性：预测文案必须保持“预计/按当前速度”。
- 历史数据太少时预测会误导：少于最低数据量直接显示“数据不足”。
- 用户充值 DeepSeek 会让余额上升：余额上升不计入消耗速度。
- 多屏切换会导致窗口跑到屏幕外：恢复位置前必须校验工作区。
- 图表容易挤占空间：第一版只在完整模式显示小图，不进迷你模式。

## 推荐落地顺序

我建议先做前三个阶段：窗口位置、迷你模式、主题透明度。它们不依赖历史数据，风险低，体验提升最明显。

然后再做历史记录、趋势图和预测。这样即使预测算法需要迭代，也不会影响基础小组件体验。
