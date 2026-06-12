# Codex LED Widget

Windows desktop LED widget that shows either the remaining Codex usage percentage from the local Codex app-server or the current DeepSeek account balance.

The widget uses a liquid-glass interface with traffic-light states:

- Green: remaining quota is 10% or higher
- Yellow: remaining quota is above 0% and below 10%
- Red: remaining quota is 0%

## Usage

```powershell
npm.cmd install
npm.cmd run dev
```

Use the provider switch in the widget to choose `Codex` or `DeepSeek`.

Features:

- Full and mini floating modes
- Saved window position with edge snapping
- Glass, dark, and minimal themes
- Adjustable widget opacity

DeepSeek mode requires a DeepSeek API key. Enter it in the widget, or set it before launching:

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
npm.cmd run dev
```

Build a portable Windows executable:

```powershell
npm.cmd run build
```

The executable is written to `dist/`.

Run tests:

```powershell
npm.cmd test
```

## Notes

- The widget uses your existing local Codex login.
- It does not read, store, or display Codex authentication tokens.
- The remaining percentage is calculated from Codex's `usedPercent` rate-limit field.
- DeepSeek mode calls `GET https://api.deepseek.com/user/balance` and shows total balance, account availability, granted balance, and topped-up balance.
- DeepSeek mode does not show monthly usage or flash/pro model selection.
