const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;
let tray;
const repoRoot = path.resolve(__dirname, "..", "..");

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
  ipcMain.handle("jarvis:coldOutreachBrief", (_event, metrics) => buildColdOutreachBrief(metrics));
  ipcMain.handle("jarvis:voiceEvent", (_event, payload) => handleVoiceEvent(payload));
  ipcMain.handle("contracts:generate", (_event, payload) => generateContracts(payload));
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

function handleVoiceEvent(payload) {
  const session = payload?.session ?? { state: "idle", wakeWord: "jarvis" };
  const text = String(payload?.text ?? "").trim();

  if (session.state === "idle") {
    if (!containsWakeWord(text, session.wakeWord)) {
      return {
        session: { ...session, lastTranscript: text },
        shouldStartRecording: false,
        shouldStopRecording: false,
        speakText: null,
      };
    }

    return {
      session: { ...session, state: "awake", lastTranscript: text },
      shouldStartRecording: true,
      shouldStopRecording: false,
      speakText: "Áno, počúvam.",
    };
  }

  if (text.toLowerCase().includes("cold")) {
    const response = buildColdOutreachBrief(payload?.metrics ?? defaultColdOutreachMetrics());
    return {
      session: {
        ...session,
        state: "idle",
        lastTranscript: text,
        lastResponse: response,
      },
      shouldStartRecording: false,
      shouldStopRecording: true,
      speakText: response,
    };
  }

  const fallback = "Rozumiem. Tento príkaz pošlem lokálnemu MCP nástroju po doplnení konkrétneho intentu.";
  return {
    session: {
      ...session,
      state: "idle",
      lastTranscript: text,
      lastResponse: fallback,
    },
    shouldStartRecording: false,
    shouldStopRecording: true,
    speakText: fallback,
  };
}

function buildColdOutreachBrief(metrics) {
  const input = {
    periodLabel: metrics?.periodLabel ?? "dnes",
    contacted: Number(metrics?.contacted ?? 0),
    opened: Number(metrics?.opened ?? 0),
    replied: Number(metrics?.replied ?? 0),
    positiveReplies: Number(metrics?.positiveReplies ?? 0),
    preparedPositiveReplyCount: Number(metrics?.preparedPositiveReplyCount ?? 0),
    pendingApprovalCount: Number(metrics?.pendingApprovalCount ?? 0),
  };
  const openRate = input.contacted > 0 ? Math.round((input.opened / input.contacted) * 1000) / 10 : 0;
  const parts = [
    `Za ${input.periodLabel} sme napísali ${input.contacted} ľuďom.`,
    `${openRate}% si email otvorilo, ${input.replied} ľudí odpísalo, z toho ${input.positiveReplies} pozitívne.`,
  ];

  if (input.preparedPositiveReplyCount > 0) {
    parts.push(
      `Pripravil som ti ${skPreparedReplies(input.preparedPositiveReplyCount)} na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.`
    );
  }
  if (input.pendingApprovalCount > 0) {
    parts.push(`Čaká ${input.pendingApprovalCount} odpovedí na schválenie.`);
  }

  return parts.join(" ");
}

function skPreparedReplies(count) {
  if (count === 1) return "1 odpoveď";
  if (count > 1 && count < 5) return `${count} odpovede`;
  return `${count} odpovedí`;
}

function containsWakeWord(text, wakeWord = "jarvis") {
  const target = normalizeTranscript(wakeWord);
  return normalizeTranscript(text).split(/\s+/).includes(target);
}

function normalizeTranscript(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim();
}

function defaultColdOutreachMetrics() {
  return {
    periodLabel: "dnes",
    contacted: 128,
    opened: 61,
    replied: 14,
    positiveReplies: 5,
    preparedPositiveReplyCount: 5,
    pendingApprovalCount: 5,
  };
}

function generateContracts(payload) {
  const outputDir = payload?.outputDir || path.join(repoRoot, "generated", "contracts");
  const intake = typeof payload?.intake === "string" ? JSON.parse(payload.intake) : payload?.intake;
  if (!intake || typeof intake !== "object") {
    throw new Error("Contract intake JSON is required.");
  }

  const result = runPython([
    "scripts/generate_contract_documents.py",
    "--payload",
    JSON.stringify(intake),
    "--output-dir",
    outputDir,
  ]);
  const manifestPath = path.join(outputDir, "generation-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return {
    outputDir,
    manifestPath,
    generatedFiles: manifest.generatedFiles,
    stdout: result.stdout,
  };
}

function runPython(args) {
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python command failed with status ${result.status}`);
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}
