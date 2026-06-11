# Codex LED Widget

Windows desktop LED widget that shows the remaining Codex usage percentage from the local Codex app-server.

The widget uses a liquid-glass interface with traffic-light states:

- Green: remaining quota is 10% or higher
- Yellow: remaining quota is above 0% and below 10%
- Red: remaining quota is 0%

## Usage

```powershell
npm.cmd install
npm.cmd run dev
```

Build a portable Windows executable:

```powershell
npm.cmd run build
```

The executable is written to `dist/`.

## Notes

- The widget uses your existing local Codex login.
- It does not read, store, or display Codex authentication tokens.
- The remaining percentage is calculated from Codex's `usedPercent` rate-limit field.
