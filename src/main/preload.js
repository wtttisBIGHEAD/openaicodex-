const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexQuota", {
  getQuota: () => ipcRenderer.invoke("quota:get"),
  getProviderSettings: () => ipcRenderer.invoke("provider:getSettings"),
  setProvider: (provider) => ipcRenderer.invoke("provider:setProvider", provider),
  saveDeepSeekKey: (apiKey) => ipcRenderer.invoke("provider:saveDeepSeekKey", apiKey),
  getProviderData: () => ipcRenderer.invoke("provider:getData"),
  getHistory: (provider, days) => ipcRenderer.invoke("history:get", provider, days),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  getAlwaysOnTop: () => ipcRenderer.invoke("window:alwaysOnTop:get"),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("window:alwaysOnTop:set", value),
  setDisplayMode: (mode) => ipcRenderer.invoke("window:setDisplayMode", mode),
  saveWindowBounds: () => ipcRenderer.invoke("window:saveBounds"),
  updateAppearance: (appearance) => ipcRenderer.invoke("settings:updateAppearance", appearance),
  updateAutoRefresh: (autoRefreshMins) => ipcRenderer.invoke("settings:updateAutoRefresh", autoRefreshMins),
  openCodex: () => ipcRenderer.invoke("external:openCodex"),
  onRefresh: (callback) => {
    ipcRenderer.on("quota:refresh", callback);
  },
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on("window:alwaysOnTopChanged", (_event, value) => callback(value));
  },
  onDisplayModeChanged: (callback) => {
    ipcRenderer.on("window:displayModeChanged", (_event, value) => callback(value));
  }
});
