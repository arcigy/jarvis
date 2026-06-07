const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcigyDesktop", {
  version: () => ipcRenderer.invoke("app:version"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
});
