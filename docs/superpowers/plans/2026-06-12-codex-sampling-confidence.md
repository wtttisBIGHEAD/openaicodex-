# Codex Sampling Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Codex usage estimates so each 5-hour window keeps useful samples, weekly estimates are derived from 5-hour window summaries, account changes reset Codex history, and mini mode shows a compact remaining-time hint.

**Architecture:** Keep data collection in `quota-service` and `history-service`, forecasting in `forecast-service`, and display formatting in `renderer.js`. History remains local-only; official OpenAI references are used as approximate plan context, while actual 5-hour and weekly estimates come from Codex app-server rate-limit windows.

**Tech Stack:** Electron main/preload/renderer JavaScript, Node `node:test`, local Codex app-server stdio.

---

### Task 1: Account Fingerprint

**Files:**
- Modify: `src/main/quota-service.js`
- Test: `test/quota-service.test.js`

- [ ] Add tests for account fingerprint normalization from `account/read`-style objects.
- [ ] Implement `normalizeAccount()` and `createAccountFingerprint()` using non-sensitive fields and a SHA-256 hash.
- [ ] Include `accountFingerprint` and `accountPlanType` in `getQuota()` results when `account/read` succeeds.
- [ ] Keep quota reading functional when `account/read` is unavailable.

### Task 2: Sampling History

**Files:**
- Modify: `src/main/history-service.js`
- Test: `test/history-service.test.js`

- [ ] Add tests that same-window Codex samples over 30 seconds apart are retained.
- [ ] Add tests that duplicate Codex samples within 30 seconds are ignored.
- [ ] Add tests that a new `primary.resetsAt` starts a new retained sample even if close in time.
- [ ] Add tests that a changed `accountFingerprint` removes old Codex samples.
- [ ] Keep existing DeepSeek 5-minute dedupe behavior.

### Task 3: Forecast Confidence

**Files:**
- Modify: `src/main/forecast-service.js`
- Test: `test/forecast-service.test.js`

- [ ] Return `meta` for Codex forecasts with sample count, span minutes/hours, confidence label, and current reset time.
- [ ] Keep 5-hour estimate based on current `primary.resetsAt` samples.
- [ ] Build 7-day estimate from per-5-hour-window summaries using the first and terminal/latest sample in each window.
- [ ] Use terminal sample when a 5-hour window reaches 100% used or 0% remaining.
- [ ] Include official 5-hour Pro reference text as context only; do not hardcode an undocumented weekly cap.

### Task 4: UI Display

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/styles.css`

- [ ] Show confidence metadata in the full forecast rows.
- [ ] Add a compact mini-mode forecast line, such as `5h 2.4小时`.
- [ ] Keep mini layout within `112 x 48`.

### Task 5: Verification

**Files:**
- Existing test suite and Electron build.

- [ ] Run `npm.cmd test`.
- [ ] Run `node --check` for changed main/preload/renderer modules.
- [ ] Run `npm.cmd run build:dir`.
- [ ] Launch Electron once for a smoke test and clean up any temporary process/logs.
