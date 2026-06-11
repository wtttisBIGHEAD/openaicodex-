# DeepSeek Provider Mode Design

## Goal

Add a provider switch to the Codex Quota Widget so it can show either the existing official Codex quota view or a DeepSeek balance view.

## Scope

The official Codex mode keeps the current behavior unchanged: the main process starts `codex app-server --listen stdio://`, calls `account/rateLimits/read`, normalizes `usedPercent`, and shows remaining quota plus the existing quota windows.

DeepSeek mode only reads account balance data. It does not show monthly usage and does not show flash/pro model selection. The DeepSeek API does not expose those values through the balance endpoint, so they are out of scope for this change.

## User Experience

On first use, the widget allows the user to choose between `Codex` and `DeepSeek`. The selected provider is remembered locally and can be changed later from the widget UI.

In DeepSeek mode, the widget shows:

- Total balance
- Account availability status
- Granted balance and topped-up balance when the API returns those fields

If no DeepSeek API key is configured, the widget shows an API key input state instead of repeatedly failing.

## Configuration

DeepSeek mode reads the API key from local widget settings first, then falls back to the `DEEPSEEK_API_KEY` environment variable. A key entered in the widget is saved through the Electron main process in the app user data directory.

The renderer never calls DeepSeek directly. It asks the main process for provider data through IPC, matching the existing security boundary.

## Data Flow

Renderer:

- Reads the selected provider and settings through the preload API
- Requests a refresh through the preload API
- Renders either the Codex quota model or the DeepSeek balance model

Main process:

- Keeps the existing Codex quota service
- Adds a DeepSeek balance service that calls `GET https://api.deepseek.com/user/balance`
- Adds a small settings service for provider choice and DeepSeek key storage
- Returns normalized provider data to the renderer

## Error Handling

Official Codex mode keeps current timeout and process error behavior.

DeepSeek mode reports clear states for missing API key, network failure, invalid key, and unexpected API responses. The UI keeps the last selected provider even when refresh fails.

## Testing

Add focused tests for normalization logic where practical:

- Existing Codex quota normalization remains stable
- DeepSeek balance responses normalize into total balance, availability, and balance details
- Missing or malformed DeepSeek responses produce clear errors

Manual verification should cover switching providers, saving a DeepSeek key, refreshing each provider, and restarting the widget to confirm the selected provider persists.
