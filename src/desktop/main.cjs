const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;
let tray;
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultDbPath = path.join(repoRoot, "data", "jarvis-local.db");
loadLocalEnv();

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
  ipcMain.handle("jarvis:coldOutreachBrief", (_event, payload) => getColdOutreachBrief(payload));
  ipcMain.handle("jarvis:voiceEvent", (_event, payload) => handleVoiceEvent(payload));
  ipcMain.handle("jarvis:systemHealth", () => getSystemHealth());
  ipcMain.handle("jarvis:generateAiReply", (_event, payload) => generateAiReply(payload));
  ipcMain.handle("jarvis:discoverLeads", (_event, payload) => discoverLeads(payload));
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
    const response = getColdOutreachBrief({ text, dbPath: payload?.dbPath });
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

function getSystemHealth() {
  const integrations = [
    ["gemini", ["GEMINI_API_KEY"]],
    ["gmail", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP"]],
    ["smartlead", ["SMARTLEAD_API_KEY"]],
    ["postgres", ["DATABASE_URL"]],
    ["redis", ["REDIS_URL"]],
    ["serper", ["SERPER_API_KEY"]],
    ["googleMaps", ["GOOGLE_MAPS_API_KEY"]],
    ["googleSheets", ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
  ].map(([key, required]) => {
    const missing = required.filter((name) => !presentEnv(name));
    return { key, configured: missing.length === 0, missing };
  });
  return {
    integrations,
    dbPath: defaultDbPath,
  };
}

async function generateAiReply(payload) {
  const apiKey = requireRuntimeEnv("GEMINI_API_KEY");
  const message = String(payload?.message ?? "").trim();
  if (!message) throw new Error("Client message is required.");
  const model = payload?.model || "gemini-2.5-flash";
  const prompt = [
    "Si Arcigy Jarvis. Priprav profesionálnu, vecnú a family-friendly odpoveď klientovi.",
    "Nikdy nesľubuj odoslanie bez schválenia používateľom.",
    payload?.clientName ? `Klient: ${payload.clientName}` : null,
    payload?.context ? `Kontext: ${payload.context}` : null,
    "Správa klienta:",
    message,
    "Vytvor krátku odpoveď v slovenčine a jednu vetu, čo má používateľ schváliť.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35 },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { model, text };
}

function getColdOutreachBrief(payload) {
  if (payload?.metrics) {
    return buildColdOutreachBrief(payload.metrics);
  }
  if (typeof payload?.contacted !== "undefined") {
    return buildColdOutreachBrief(payload);
  }

  const period = resolveColdOutreachPeriod(String(payload?.text ?? payload?.periodLabel ?? ""));
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "cold-brief",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--payload",
    JSON.stringify({
      since: payload?.since || period.since,
      until: payload?.until || period.until,
      periodLabel: payload?.periodLabel || period.periodLabel,
    }),
  ]);
  const parsed = JSON.parse(result.stdout);
  return parsed.summary;
}

function resolveColdOutreachPeriod(text) {
  const lowered = normalizeTranscript(text);
  const now = new Date();
  const until = now.toISOString();

  if (lowered.includes("dnes") || lowered.includes("today")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      since: start.toISOString(),
      until,
      periodLabel: "dnes",
    };
  }

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString(),
    until,
    periodLabel: "posledných 7 dní",
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
    `Za ${input.periodLabel} sme napísali ${skPeople(input.contacted)}.`,
    `${openRate}% si email otvorilo, ${skReplies(input.replied)}, z toho ${input.positiveReplies} pozitívne.`,
  ];

  if (input.preparedPositiveReplyCount > 0) {
    parts.push(
      `Pripravil som ti ${skPreparedReplies(input.preparedPositiveReplyCount)} na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.`
    );
  }
  if (input.pendingApprovalCount > 0) {
    parts.push(`Čaká ${skPreparedReplies(input.pendingApprovalCount)} na schválenie.`);
  }

  return parts.join(" ");
}

function skPeople(count) {
  if (count === 1) return "1 človeku";
  return `${count} ľuďom`;
}

function skReplies(count) {
  if (count === 1) return "1 človek odpísal";
  return `${count} ľudí odpísalo`;
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

async function discoverLeads(payload) {
  const query = String(payload?.query ?? "").trim();
  if (!query) throw new Error("Lead search query is required.");
  const maxResults = Math.max(1, Math.min(Number(payload?.maxResults ?? 10), 25));
  const [serper, places] = await Promise.allSettled([
    getSerperApiKeys().length ? searchSerperLeads(query, maxResults) : null,
    presentEnv("GOOGLE_MAPS_API_KEY") ? searchGooglePlacesLeads(String(payload?.placesQuery ?? query), Math.min(maxResults, 20)) : null,
  ]);
  const leads = [
    ...normalizeSerperLeads(serper.status === "fulfilled" ? serper.value : null),
    ...normalizePlacesLeads(places.status === "fulfilled" ? places.value : null),
  ];
  return {
    leads: dedupeLeads(leads).slice(0, maxResults),
    sources: [
      serper.status === "fulfilled" && serper.value ? "serper" : null,
      places.status === "fulfilled" && places.value ? "google_places" : null,
    ].filter(Boolean),
  };
}

async function searchSerperLeads(query, maxResults) {
  let lastError = "";
  for (const apiKey of getSerperApiKeys()) {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ q: query, num: maxResults, gl: "sk", hl: "sk" }),
    });
    if (response.ok) return response.json();
    const body = await response.text().catch(() => "");
    lastError = body ? `Serper request failed: ${response.status} - ${body}` : `Serper request failed: ${response.status}`;
    if (!/not enough credits/i.test(body) && ![401, 403, 429].includes(response.status)) throw new Error(lastError);
  }
  throw new Error(lastError || "Serper request failed.");
}

async function searchGooglePlacesLeads(query, maxResults) {
  const apiKey = requireRuntimeEnv("GOOGLE_MAPS_API_KEY");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: maxResults, languageCode: "sk", regionCode: "SK" }),
  });
  if (!response.ok) throw new Error(`Google Places request failed: ${response.status}`);
  return response.json();
}

function normalizeSerperLeads(value) {
  return (value?.organic ?? [])
    .map((item) => ({
      name: String(item.title ?? "").trim(),
      website: typeof item.link === "string" ? item.link : undefined,
      source: "serper",
      url: typeof item.link === "string" ? item.link : undefined,
    }))
    .filter((lead) => lead.name);
}

function normalizePlacesLeads(value) {
  return (value?.places ?? [])
    .map((place) => ({
      name: String(place.displayName?.text ?? "").trim(),
      website: typeof place.websiteUri === "string" ? place.websiteUri : undefined,
      source: "google_places",
      url: typeof place.googleMapsUri === "string" ? place.googleMapsUri : undefined,
      address: typeof place.formattedAddress === "string" ? place.formattedAddress : undefined,
      phone: typeof place.nationalPhoneNumber === "string" ? place.nationalPhoneNumber : undefined,
    }))
    .filter((lead) => lead.name);
}

function dedupeLeads(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = String(lead.website || lead.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSerperApiKeys() {
  return [process.env.SERPER_API_KEY, process.env.SERPER_API_KEY_2]
    .map((value) => value?.trim())
    .filter((value, index, values) => value && value !== "dummy" && values.indexOf(value) === index);
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

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.join(repoRoot, filename);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && typeof process.env[key] === "undefined") {
        process.env[key] = value;
      }
    }
  }
}

function presentEnv(key) {
  const value = process.env[key]?.trim();
  return Boolean(value && value !== "dummy");
}

function requireRuntimeEnv(key) {
  if (!presentEnv(key)) {
    throw new Error(`Missing runtime environment variable: ${key}`);
  }
  return process.env[key];
}
