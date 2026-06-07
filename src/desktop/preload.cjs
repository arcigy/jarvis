const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcigyDesktop", {
  version: () => ipcRenderer.invoke("app:version"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  coldOutreachBrief: (metrics) => ipcRenderer.invoke("jarvis:coldOutreachBrief", metrics),
  jarvisVoiceEvent: (payload) => ipcRenderer.invoke("jarvis:voiceEvent", payload),
  systemHealth: () => ipcRenderer.invoke("jarvis:systemHealth"),
  runDiagnostics: (payload) => ipcRenderer.invoke("jarvis:runDiagnostics", payload),
  identifyEmail: (payload) => ipcRenderer.invoke("jarvis:identifyEmail", payload),
  ingestClientMessage: (payload) => ipcRenderer.invoke("jarvis:ingestClientMessage", payload),
  generateAiReply: (payload) => ipcRenderer.invoke("jarvis:generateAiReply", payload),
  syncGmailRecentMessages: (payload) => ipcRenderer.invoke("jarvis:syncGmailRecentMessages", payload),
  getSmartleadCampaignStatus: (payload) => ipcRenderer.invoke("jarvis:getSmartleadCampaignStatus", payload),
  discoverLeads: (payload) => ipcRenderer.invoke("jarvis:discoverLeads", payload),
  appendLeadsToGoogleSheet: (payload) => ipcRenderer.invoke("jarvis:appendLeadsToGoogleSheet", payload),
  draftContractIntake: (payload) => ipcRenderer.invoke("contracts:draftIntake", payload),
  generateContracts: (payload) => ipcRenderer.invoke("contracts:generate", payload),
});
