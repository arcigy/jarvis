const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcigyDesktop", {
  version: () => ipcRenderer.invoke("app:version"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  coldOutreachBrief: (metrics) => ipcRenderer.invoke("jarvis:coldOutreachBrief", metrics),
  jarvisVoiceEvent: (payload) => ipcRenderer.invoke("jarvis:voiceEvent", payload),
  systemHealth: () => ipcRenderer.invoke("jarvis:systemHealth"),
  generateAiReply: (payload) => ipcRenderer.invoke("jarvis:generateAiReply", payload),
  discoverLeads: (payload) => ipcRenderer.invoke("jarvis:discoverLeads", payload),
  generateContracts: (payload) => ipcRenderer.invoke("contracts:generate", payload),
});
