const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    title: "Arcigy Jarvis",
    backgroundColor: "#101418",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Arcigy Jarvis");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Arcigy Jarvis", click: () => mainWindow?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );
}

app.whenReady().then(() => {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:openPath", (_event, targetPath) => shell.openPath(targetPath));
  createWindow();
  createTray();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
  mainWindow?.hide();
});
