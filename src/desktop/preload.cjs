const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcigyDesktop", {
  version: () => ipcRenderer.invoke("app:version"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  coldOutreachBrief: (metrics) => ipcRenderer.invoke("jarvis:coldOutreachBrief", metrics),
  jarvisVoiceEvent: (payload) => ipcRenderer.invoke("jarvis:voiceEvent", payload),
  generateContracts: (payload) => ipcRenderer.invoke("contracts:generate", payload),
});
