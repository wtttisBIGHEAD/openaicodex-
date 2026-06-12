const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("node:path");
const { getDeepSeekBalance } = require("./deepseek-service");
const { forecastCodex, forecastDeepSeek } = require("./forecast-service");
const { createHistoryStore } = require("./history-service");
const { getQuota } = require("./quota-service");
const { createSettingsStore, publicSettings } = require("./settings-service");

const WINDOW_SIZES = {
  full: { width: 390, height: 390 },
  mini: { width: 112, height: 48 }
};
const EDGE_SNAP_PX = 24;

let mainWindow;
let tray;
let isAlwaysOnTop = true;
let settingsStore;
let historyStore;
let saveBoundsTimer;

function getAppIconPath() {
  return path.join(__dirname, "../../assets/icon.ico");
}

function createWindow() {
  const settings = settingsStore.load();
  const size = WINDOW_SIZES[settings.displayMode] || WINDOW_SIZES.full;
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: WINDOW_SIZES.mini.width,
    minHeight: WINDOW_SIZES.mini.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: false,
    show: false,
    backgroundColor: "#00000000",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => {
    restoreWindowBounds(settings.displayMode);
    mainWindow.show();
  });
  mainWindow.on("move", scheduleSnapAndSaveBounds);
}

function placeWindowTopRight(mode = settingsStore?.load().displayMode || "full") {
  if (!mainWindow) return;
  const display = screen.getPrimaryDisplay();
  const size = WINDOW_SIZES[mode] || WINDOW_SIZES.full;
  const { workArea } = display;
  mainWindow.setBounds({
    x: workArea.x + workArea.width - size.width - EDGE_SNAP_PX,
    y: workArea.y + 24,
    ...size
  });
}

function restoreWindowBounds(mode) {
  if (!mainWindow) return;
  const settings = settingsStore.load();
  const size = WINDOW_SIZES[mode] || WINDOW_SIZES.full;
  const savedBounds = settings.windowBounds?.[mode];
  const bounds = savedBounds ? { ...savedBounds, ...size } : defaultWindowBounds(mode);
  mainWindow.setBounds(ensureVisibleBounds(snapBounds(bounds)));
}

function defaultWindowBounds(mode) {
  const display = screen.getPrimaryDisplay();
  const size = WINDOW_SIZES[mode] || WINDOW_SIZES.full;
  const { workArea } = display;
  return {
    x: workArea.x + workArea.width - size.width - EDGE_SNAP_PX,
    y: workArea.y + EDGE_SNAP_PX,
    ...size
  };
}

function ensureVisibleBounds(bounds) {
  const intersectsDisplay = screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    );
  });

  return intersectsDisplay ? bounds : defaultWindowBounds(settingsStore.load().displayMode);
}

function snapBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const { workArea } = display;
  const snapped = { ...bounds };

  if (Math.abs(bounds.x - workArea.x) <= EDGE_SNAP_PX) {
    snapped.x = workArea.x;
  }
  if (Math.abs(bounds.y - workArea.y) <= EDGE_SNAP_PX) {
    snapped.y = workArea.y;
  }
  if (Math.abs(bounds.x + bounds.width - (workArea.x + workArea.width)) <= EDGE_SNAP_PX) {
    snapped.x = workArea.x + workArea.width - bounds.width;
  }
  if (Math.abs(bounds.y + bounds.height - (workArea.y + workArea.height)) <= EDGE_SNAP_PX) {
    snapped.y = workArea.y + workArea.height - bounds.height;
  }

  return snapped;
}

function scheduleSnapAndSaveBounds() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    if (!mainWindow || !settingsStore) return;
    const settings = settingsStore.load();
    const currentBounds = mainWindow.getBounds();
    const snappedBounds = snapBounds(currentBounds);

    if (
      snappedBounds.x !== currentBounds.x ||
      snappedBounds.y !== currentBounds.y ||
      snappedBounds.width !== currentBounds.width ||
      snappedBounds.height !== currentBounds.height
    ) {
      mainWindow.setBounds(snappedBounds);
    }

    saveWindowBounds(settings.displayMode, snappedBounds);
  }, 280);
}

function saveWindowBounds(mode, bounds = mainWindow?.getBounds()) {
  if (!bounds || !settingsStore) return;
  const settings = settingsStore.load();
  settingsStore.save({
    ...settings,
    windowBounds: {
      ...settings.windowBounds,
      [mode]: bounds
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(getAppIconPath());
  tray = new Tray(icon);
  tray.setToolTip("Codex Quota Widget");
  rebuildTrayMenu();
  tray.on("click", toggleWindow);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const displayMode = settingsStore?.load().displayMode || "full";
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示/隐藏", click: toggleWindow },
      { label: "刷新额度", click: () => mainWindow?.webContents.send("quota:refresh") },
      {
        label: displayMode === "mini" ? "完整模式" : "迷你模式",
        click: () => setDisplayMode(displayMode === "mini" ? "full" : "mini")
      },
      {
        label: isAlwaysOnTop ? "取消置顶" : "置顶",
        click: () => setAlwaysOnTop(!isAlwaysOnTop)
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
}

function setDisplayMode(mode) {
  const displayMode = mode === "mini" ? "mini" : "full";
  const currentSettings = settingsStore.load();
  const previousMode = currentSettings.displayMode;

  if (mainWindow && previousMode !== displayMode) {
    saveWindowBounds(previousMode);
  }

  settingsStore.save({ ...currentSettings, displayMode });

  if (mainWindow) {
    const size = WINDOW_SIZES[displayMode];
    const currentBounds = mainWindow.getBounds();
    const savedBounds = settingsStore.load().windowBounds?.[displayMode];
    const nextBounds = savedBounds
      ? ensureVisibleBounds(snapBounds({ ...savedBounds, ...size }))
      : ensureVisibleBounds(snapBounds({ ...currentBounds, ...size }));

    mainWindow.setBounds(nextBounds);
    saveWindowBounds(displayMode, nextBounds);
    mainWindow.webContents.send("window:displayModeChanged", displayMode);
  }

  rebuildTrayMenu();
  return publicSettings(settingsStore.load(), process.env.DEEPSEEK_API_KEY);
}

function updateAppearance(theme, opacity) {
  const settings = settingsStore.load();
  const saved = settingsStore.save({ ...settings, theme, opacity });
  return publicSettings(saved, process.env.DEEPSEEK_API_KEY);
}

function updateAutoRefresh(autoRefreshMins) {
  const settings = settingsStore.load();
  const saved = settingsStore.save({ ...settings, autoRefreshMins });
  return publicSettings(saved, process.env.DEEPSEEK_API_KEY);
}

function setAlwaysOnTop(value) {
  isAlwaysOnTop = Boolean(value);
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isAlwaysOnTop);
    mainWindow.webContents.send("window:alwaysOnTopChanged", isAlwaysOnTop);
  }
  rebuildTrayMenu();
  return isAlwaysOnTop;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  settingsStore = createSettingsStore(app.getPath("userData"));
  historyStore = createHistoryStore(app.getPath("userData"));
  createWindow();
  createTray();

  ipcMain.handle("quota:get", async () => getQuota());
  ipcMain.handle("provider:getSettings", () => {
    return publicSettings(settingsStore.load(), process.env.DEEPSEEK_API_KEY);
  });
  ipcMain.handle("provider:setProvider", (_event, provider) => {
    const current = settingsStore.load();
    const saved = settingsStore.save({ ...current, provider });
    return publicSettings(saved, process.env.DEEPSEEK_API_KEY);
  });
  ipcMain.handle("provider:saveDeepSeekKey", (_event, apiKey) => {
    const current = settingsStore.load();
    const saved = settingsStore.save({ ...current, provider: "deepseek", deepseekApiKey: apiKey });
    return publicSettings(saved, process.env.DEEPSEEK_API_KEY);
  });
  ipcMain.handle("provider:getData", async () => {
    const settings = settingsStore.load();
    if (settings.provider === "deepseek") {
      const apiKey = settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "";
      const balance = await getDeepSeekBalance(apiKey);
      const history = historyStore.append(balance).entries;
      return {
        ...balance,
        forecast: forecastDeepSeek(balance, history)
      };
    }

    const quota = {
      provider: "codex",
      ...(await getQuota())
    };
    const history = historyStore.append(quota).entries;
    return {
      ...quota,
      forecast: forecastCodex(quota, history)
    };
  });
  ipcMain.handle("window:minimize", () => mainWindow?.hide());
  ipcMain.handle("window:close", () => app.quit());
  ipcMain.handle("window:alwaysOnTop:get", () => isAlwaysOnTop);
  ipcMain.handle("window:alwaysOnTop:set", (_event, value) => setAlwaysOnTop(value));
  ipcMain.handle("window:setDisplayMode", (_event, mode) => setDisplayMode(mode));
  ipcMain.handle("window:saveBounds", () => {
    const mode = settingsStore.load().displayMode;
    saveWindowBounds(mode);
    return publicSettings(settingsStore.load(), process.env.DEEPSEEK_API_KEY);
  });
  ipcMain.handle("settings:updateAppearance", (_event, appearance) => {
    return updateAppearance(appearance?.theme, appearance?.opacity);
  });
  ipcMain.handle("settings:updateAutoRefresh", (_event, autoRefreshMins) => {
    return updateAutoRefresh(autoRefreshMins);
  });
  ipcMain.handle("external:openCodex", () => {
    shell.openPath(path.join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin", "codex.exe"));
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
