const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");

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
  ipcMain.handle("jarvis:runDiagnostics", (_event, payload) => runDiagnostics(payload));
  ipcMain.handle("jarvis:webBridgePreflight", () => getWebBridgePreflight());
  ipcMain.handle("jarvis:identifyEmail", (_event, payload) => identifyEmail(payload));
  ipcMain.handle("jarvis:ingestClientMessage", (_event, payload) => ingestClientMessage(payload));
  ipcMain.handle("jarvis:generateAiReply", (_event, payload) => generateAiReply(payload));
  ipcMain.handle("jarvis:syncGmailRecentMessages", (_event, payload) => syncGmailRecentMessages(payload));
  ipcMain.handle("jarvis:getSmartleadCampaignStatus", (_event, payload) => getSmartleadCampaignStatus(payload));
  ipcMain.handle("jarvis:discoverLeads", (_event, payload) => discoverLeads(payload));
  ipcMain.handle("jarvis:appendLeadsToGoogleSheet", (_event, payload) => appendLeadsToGoogleSheet(payload));
  ipcMain.handle("contracts:draftIntake", (_event, payload) => draftContractIntake(payload));
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

async function handleVoiceEvent(payload) {
  const session = payload?.session ?? { state: "idle", wakeWord: "jarvis" };
  const text = String(payload?.text ?? "").trim();
  const lowered = normalizeTranscript(text);

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
      speakText: "Ano, pocuvam.",
    };
  }

  if (lowered.includes("cold") || lowered.includes("outreach")) {
    return voiceDone(session, text, getColdOutreachBrief({ text, dbPath: payload?.dbPath }));
  }

  if (lowered.includes("integracie") || lowered.includes("system") || lowered.includes("health")) {
    return voiceDone(session, text, summarizeHealthForVoice(getSystemHealth()));
  }

  if (lowered.includes("identifikuj") || lowered.includes("kto je") || lowered.includes("email")) {
    const email = extractEmail(text);
    const response = email
      ? summarizeIdentityForVoice(identifyEmail({ email, dbPath: payload?.dbPath }))
      : "Povedz mi email, ktory mam vyhladat v lokalnej pamati.";
    return voiceDone(session, text, response);
  }

  if (lowered.includes("lead") || lowered.includes("najdi") || lowered.includes("vyhladaj")) {
    const query = cleanVoiceQuery(text, ["jarvis", "lead", "leady", "leadov", "najdi", "vyhladaj", "hladaj"]);
    const result = await discoverLeads({ query: query || "automation agency Bratislava", maxResults: 3 });
    return voiceDone(session, text, summarizeLeadsForVoice(result));
  }

  if (lowered.includes("odpoved") || lowered.includes("draft") || lowered.includes("gemini")) {
    const message = cleanVoiceQuery(text, ["jarvis", "odpoved", "odpovedz", "draft", "gemini", "navrhni"]);
    if (!message) return voiceDone(session, text, "Povedz mi spravu klienta, na ktoru mam pripravit odpoved.");
    const response = await generateAiReply({ message, context: "Voice command inside Arcigy Jarvis." });
    return voiceDone(session, text, response.text);
  }

  return voiceDone(
    session,
    text,
    "Rozumiem. Viem hlasom skontrolovat cold outreach, integracie, identifikovat email, vyhladat leady alebo pripravit Gemini odpoved."
  );
}

function voiceDone(session, transcript, response) {
  return {
    session: {
      ...session,
      state: "idle",
      lastTranscript: transcript,
      lastResponse: response,
    },
    shouldStartRecording: false,
    shouldStopRecording: true,
    speakText: response,
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
    const missing = required.flatMap((name) => getRuntimeEnvIssue(name));
    return { key, configured: missing.length === 0, missing };
  });
  return {
    integrations,
    dbPath: defaultDbPath,
  };
}

function getRuntimeEnvIssue(name) {
  const value = readEnv(name);
  if (!value) return [name];
  if ((name === "DATABASE_URL" || name === "REDIS_URL") && hasPlaceholderUrlCredential(value)) {
    return [`${name} contains a placeholder credential`];
  }
  return [];
}

function hasPlaceholderUrlCredential(value) {
  try {
    const url = new URL(value);
    const credentials = [decodeURIComponent(url.username), decodeURIComponent(url.password)].map((item) => item.trim().toLowerCase());
    return credentials.some((item) => ["password", "changeme", "change-me", "todo", "dummy"].includes(item));
  } catch {
    return false;
  }
}

async function runDiagnostics(payload) {
  const live = payload?.live === true;
  const checks = getSystemHealth().integrations.map((item) => ({
    key: item.key,
    status: item.configured ? "ready" : "missing",
    message: item.configured ? "Configured." : `Missing: ${item.missing.join(", ")}`,
  }));
  checks.push({
    key: "sqlite",
    status: fs.existsSync(payload?.dbPath || defaultDbPath) ? "ready" : "ready",
    message: fs.existsSync(payload?.dbPath || defaultDbPath) ? "Local DB exists." : "Local DB can be created on demand.",
  });

  if (live) {
    await Promise.all([
      updateDiagnosticCheck(checks, "gemini", async () => {
        const result = await generateAiReply({ message: "Return OK.", context: "Diagnostics check." });
        return `Gemini responded with ${result.text.length} characters.`;
      }),
      updateDiagnosticCheck(checks, "gmail", async () => {
        const accounts = listConfiguredGmailAccounts();
        if (!accounts.length) throw new Error("No configured Gmail accounts found.");
        await Promise.all(accounts.map((account) => refreshGoogleAccessToken(account.refreshToken)));
        return `OAuth refresh succeeded for ${accounts.length} Gmail account(s).`;
      }),
      updateDiagnosticCheck(checks, "smartlead", async () => {
        const result = await getSmartleadCampaignStatus({});
        return `Smartlead returned ${result.campaigns?.length ?? 0} campaign(s).`;
      }),
      updateDiagnosticCheck(checks, "postgres", async () => {
        const target = parseServiceUrl(requireRuntimeEnv("DATABASE_URL"), "Postgres");
        await openSocket(target);
        return `Postgres TCP connection opened to ${target.host}:${target.port}.`;
      }),
      updateDiagnosticCheck(checks, "redis", async () => {
        const target = parseServiceUrl(requireRuntimeEnv("REDIS_URL"), "Redis");
        await pingRedis(target);
        return `Redis PING succeeded at ${target.host}:${target.port}.`;
      }),
      updateDiagnosticCheck(checks, "googleMaps", async () => {
        await searchGooglePlacesLeads("Arcigy", 1);
        return "Google Places Text Search responded.";
      }),
      updateDiagnosticCheck(checks, "serper", async () => {
        await searchSerperLeads("Arcigy", 1);
        return "Serper responded.";
      }),
      updateDiagnosticCheck(checks, "googleSheets", async () => {
        await checkGoogleSheetsAccess();
        return "Google Sheets metadata request responded.";
      }),
    ]);
  }

  return {
    live,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

function getWebBridgePreflight() {
  const tools = listWebMcpTools();
  const riskyToolsRequiringApproval = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const tokenConfigured = getWebToken() !== null;
  const localhostBypass = process.env.JARVIS_WEB_REQUIRE_AUTH !== "true";
  const warnings = [];
  if (!tokenConfigured) warnings.push("Set JARVIS_WEB_TOKEN before exposing the bridge through a tunnel.");
  if (localhostBypass) warnings.push("Localhost auth bypass is enabled for desktop/local use.");
  if (!isCommandAvailable("ngrok") && !isCommandAvailable("npx")) warnings.push("Neither ngrok nor npx was found on PATH; npm run web:tunnel needs one of them.");

  return {
    mode: "desktop-preflight",
    host: process.env.JARVIS_WEB_HOST || "127.0.0.1",
    manifestUrl: `http://${process.env.JARVIS_WEB_HOST || "127.0.0.1"}:${process.env.JARVIS_WEB_PORT || "8765"}/.well-known/arcigy-jarvis.json`,
    tunnelCommand: "npm run web:tunnel",
    tunnelProvider: "ngrok",
    authRequiredForExternalHosts: true,
    tokenConfigured,
    localhostBypass,
    maxJsonBytes: getMaxJsonBytes(),
    mcpToolCount: tools.length,
    riskyToolsRequiringApproval,
    pathPolicy: "repo-only",
    readyForTunnel: tokenConfigured && riskyToolsRequiringApproval.length > 0,
    warnings,
  };
}

function listWebMcpTools() {
  return [
    { name: "arcigy.generate_contract_documents", requiresApproval: true },
    { name: "arcigy.draft_contract_intake", requiresApproval: false },
    { name: "arcigy.get_cold_outreach_brief", requiresApproval: false },
    { name: "arcigy.get_cold_outreach_brief_from_db", requiresApproval: false },
    { name: "arcigy.add_cold_outreach_event", requiresApproval: false },
    { name: "arcigy.identify_email", requiresApproval: false },
    { name: "arcigy.upsert_local_person", requiresApproval: false },
    { name: "arcigy.add_client_need_signal", requiresApproval: false },
    { name: "arcigy.ingest_client_message", requiresApproval: false },
    { name: "arcigy.jarvis_voice_event", requiresApproval: false },
    { name: "arcigy.get_system_health", requiresApproval: false },
    { name: "arcigy.run_integration_diagnostics", requiresApproval: false },
    { name: "arcigy.generate_ai_reply", requiresApproval: false },
    { name: "arcigy.sync_gmail_recent_messages", requiresApproval: false },
    { name: "arcigy.get_smartlead_campaign_status", requiresApproval: false },
    { name: "arcigy.search_serper", requiresApproval: false },
    { name: "arcigy.search_google_places", requiresApproval: false },
    { name: "arcigy.discover_leads", requiresApproval: false },
    { name: "arcigy.append_leads_to_google_sheet", requiresApproval: true },
  ];
}

function getWebToken() {
  const value = (process.env.JARVIS_WEB_TOKEN || process.env.API_SECRET_KEY || "").trim();
  return value && value !== "dummy" ? value : null;
}

function getMaxJsonBytes() {
  const value = Number(process.env.JARVIS_MAX_JSON_BYTES || 1000000);
  return Number.isFinite(value) && value > 0 ? value : 1000000;
}

function isCommandAvailable(command) {
  const check =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return check.status === 0;
}

async function updateDiagnosticCheck(checks, key, run) {
  const check = checks.find((item) => item.key === key);
  if (!check || check.status === "missing") return;
  try {
    check.message = await run();
    check.status = "ready";
  } catch (error) {
    check.status = "failed";
    check.message = error instanceof Error ? error.message : String(error);
  }
}

async function checkGoogleSheetsAccess() {
  const spreadsheetId = requireRuntimeEnv("GOOGLE_SHEET_ID");
  const account = listConfiguredGmailAccounts()[0];
  if (!account) throw new Error("No configured Google OAuth account found.");
  const accessToken = await refreshGoogleAccessToken(account.refreshToken);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google Sheets metadata request failed: ${response.status}`);
}

function parseServiceUrl(value, label) {
  const url = new URL(value);
  const defaultPort = url.protocol === "rediss:" ? 6380 : url.protocol.startsWith("redis") ? 6379 : 5432;
  if (!url.hostname) throw new Error(`${label} URL is missing hostname.`);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: Number(url.port || defaultPort),
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
  };
}

function openSocket(target, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = target.protocol === "rediss:" ? tls.connect({ host: target.host, port: target.port }) : net.connect({ host: target.host, port: target.port });
    const readyEvent = target.protocol === "rediss:" ? "secureConnect" : "connect";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connection timed out for ${target.host}:${target.port}.`));
    }, timeoutMs);
    socket.once(readyEvent, () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`TCP connection failed for ${target.host}:${target.port}: ${error.message}`));
    });
  });
}

function pingRedis(target, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = target.protocol === "rediss:" ? tls.connect({ host: target.host, port: target.port }) : net.connect({ host: target.host, port: target.port });
    const readyEvent = target.protocol === "rediss:" ? "secureConnect" : "connect";
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Redis PING timed out for ${target.host}:${target.port}.`));
    }, timeoutMs);
    const finish = (error) => {
      clearTimeout(timeout);
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const sendPing = () => socket.write(encodeRedisCommand(["PING"]));
    const authenticate = () => {
      if (!target.password) {
        sendPing();
      } else if (target.username) {
        socket.write(encodeRedisCommand(["AUTH", target.username, target.password]));
      } else {
        socket.write(encodeRedisCommand(["AUTH", target.password]));
      }
    };
    socket.once(readyEvent, authenticate);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      if (buffer.startsWith("-")) {
        finish(new Error(`Redis returned an error at ${target.host}:${target.port}.`));
      } else if (buffer.includes("+PONG")) {
        finish();
      } else if (buffer.includes("+OK")) {
        sendPing();
      }
    });
    socket.once("error", (error) => finish(new Error(`Redis connection failed for ${target.host}:${target.port}: ${error.message}`)));
  });
}

function encodeRedisCommand(parts) {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function summarizeHealthForVoice(health) {
  const ready = health.integrations.filter((item) => item.configured).map((item) => item.key);
  const missing = health.integrations.filter((item) => !item.configured).map((item) => item.key);
  return [
    ready.length ? `Ready integracie: ${ready.join(", ")}.` : "Ziadne integracie nie su ready.",
    missing.length ? `Chybaju: ${missing.join(", ")}.` : "Nic nechyba.",
  ].join(" ");
}

function summarizeIdentityForVoice(result) {
  if (!result.person) return `Email ${result.email} zatial nepoznam v lokalnej pamati.`;
  const name = result.person.displayName || result.person.companyName || result.person.primaryEmail;
  const needs = result.openNeedSignals || [];
  const needText = needs.length ? `Ma ${needs.length} otvorenych poziadaviek. Najnovsia: ${needs[0].summary}` : "Nema otvorene poziadavky.";
  return `${result.email} je ${name}, typ ${result.person.kind}. ${needText}`;
}

function summarizeLeadsForVoice(result) {
  const leads = result.leads || [];
  if (!leads.length) return "Nenasiel som ziadne leady pre tento dotaz.";
  const names = leads.slice(0, 3).map((lead) => lead.name).join(", ");
  const sources = (result.sources || []).join(", ") || "ziadny zdroj";
  return `Nasiel som ${leads.length} leadov cez ${sources}. Top vysledky: ${names}.`;
}

function extractEmail(text) {
  return String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || null;
}

function cleanVoiceQuery(text, removeWords) {
  const remove = new Set(removeWords.map((word) => normalizeTranscript(word)));
  return String(text)
    .split(/\s+/)
    .filter((word) => !remove.has(normalizeTranscript(word)))
    .join(" ")
    .replace(/[,:;.]+$/g, "")
    .trim();
}

async function generateAiReply(payload) {
  const apiKey = requireRuntimeEnv("GEMINI_API_KEY");
  const message = String(payload?.message ?? "").trim();
  if (!message) throw new Error("Client message is required.");
  const model = payload?.model || "gemini-2.5-flash";
  const prompt = [
    "Si Arcigy Jarvis. Priprav profesionalnu, vecnu a family-friendly odpoved klientovi.",
    "Nikdy neslubuj odoslanie bez schvalenia pouzivatelom.",
    payload?.clientName ? `Klient: ${payload.clientName}` : null,
    payload?.context ? `Kontext: ${payload.context}` : null,
    "Sprava klienta:",
    message,
    "Vytvor kratku odpoved v slovencine a jednu vetu, co ma pouzivatel schvalit.",
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

function identifyEmail(payload) {
  const email = String(payload?.email ?? "").trim();
  if (!email) throw new Error("Email is required.");
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "identify",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--email",
    email,
  ]);
  return JSON.parse(result.stdout);
}

function ingestClientMessage(payload) {
  const email = String(payload?.email ?? payload?.fromEmail ?? "").trim();
  const text = String(payload?.text ?? payload?.message ?? "").trim();
  if (!email) throw new Error("Email is required.");
  if (!text) throw new Error("Message text is required.");
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "ingest-message",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--payload",
    JSON.stringify({
      fromEmail: email,
      displayName: payload?.displayName,
      companyName: payload?.companyName,
      subject: payload?.subject,
      text,
      source: payload?.source || "jarvis-ui",
      createIfUnknown: payload?.createIfUnknown !== false,
    }),
  ]);
  return JSON.parse(result.stdout);
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
    periodLabel: "poslednych 7 dni",
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
    `Za ${input.periodLabel} sme napisali ${skPeople(input.contacted)}.`,
    `${openRate}% si email otvorilo, ${skReplies(input.replied)}, z toho ${input.positiveReplies} pozitivne.`,
  ];

  if (input.preparedPositiveReplyCount > 0) {
    parts.push(
      `Pripravil som ti ${skPreparedReplies(input.preparedPositiveReplyCount)} na pozitivne reakcie a poslem ich az na tvoje potvrdenie.`
    );
  }
  if (input.pendingApprovalCount > 0) {
    parts.push(`Caka ${skPreparedReplies(input.pendingApprovalCount)} na schvalenie.`);
  }

  return parts.join(" ");
}

function skPeople(count) {
  if (count === 1) return "1 cloveku";
  return `${count} ludom`;
}

function skReplies(count) {
  if (count === 1) return "1 clovek odpisal";
  return `${count} ludi odpisalo`;
}

function skPreparedReplies(count) {
  if (count === 1) return "1 odpoved";
  if (count > 1 && count < 5) return `${count} odpovede`;
  return `${count} odpovedi`;
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

async function syncGmailRecentMessages(payload) {
  const accountEnvKey = String(payload?.accountEnvKey ?? "").trim();
  const query = String(payload?.query ?? "newer_than:7d").trim() || "newer_than:7d";
  const maxResults = Math.max(1, Math.min(Number(payload?.maxResults ?? 10), 25));
  const dryRun = payload?.dryRun === true;
  const dbPath = payload?.dbPath || defaultDbPath;
  const accounts = listConfiguredGmailAccounts().filter((account) => !accountEnvKey || account.envKey === accountEnvKey);
  if (!accounts.length) {
    throw new Error(accountEnvKey ? `Configured Gmail account not found: ${accountEnvKey}` : "No configured Gmail accounts found.");
  }

  const synced = [];
  for (const account of accounts) {
    const events = await listRecentGmailMessageEvents(account, { query, maxResults });
    const ingested = [];
    if (!dryRun) {
      for (const event of events) {
        const result = runPython([
          "scripts/jarvis_local_db.py",
          "ingest-message",
          "--db",
          dbPath,
          "--payload",
          JSON.stringify(event),
        ]);
        ingested.push(JSON.parse(result.stdout));
      }
    }
    synced.push({
      account: account.label,
      fetched: events.length,
      ingested: ingested.length,
      alerts: ingested.map((item) => item.jarvisAlert).filter(Boolean),
      preview: events.slice(0, 3).map((event) => ({
        fromEmail: event.fromEmail,
        subject: event.subject,
        text: event.text,
      })),
    });
  }
  return { dryRun, synced };
}

function listConfiguredGmailAccounts() {
  return [
    "GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP",
  ]
    .map((envKey) => ({
      envKey,
      label: envKey.replace("GMAIL_REFRESH_TOKEN_", "").toLowerCase(),
      refreshToken: process.env[envKey]?.trim(),
    }))
    .filter((account) => account.refreshToken && account.refreshToken !== "dummy");
}

async function listRecentGmailMessageEvents(account, options) {
  const accessToken = await refreshGoogleAccessToken(account.refreshToken);
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 10),
    q: options.query ?? "newer_than:7d",
  });
  const listed = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, accessToken);
  const events = [];
  for (const message of listed.messages ?? []) {
    const detail = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      accessToken
    );
    const headers = new Map((detail.payload?.headers ?? []).map((header) => [String(header.name).toLowerCase(), header.value]));
    const from = parseFromHeader(headers.get("from") ?? "");
    if (!from.email || !detail.snippet) continue;
    events.push({
      fromEmail: from.email,
      displayName: from.displayName,
      source: "gmail",
      subject: headers.get("subject"),
      text: detail.snippet,
      occurredAt: detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : headers.get("date"),
      threadId: detail.threadId,
      externalId: detail.id,
      data: {
        account: account.label,
        gmailMessageId: detail.id,
      },
    });
  }
  return events;
}

async function refreshGoogleAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: requireRuntimeEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireRuntimeEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Google OAuth refresh failed: ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google OAuth refresh did not return an access token.");
  return data.access_token;
}

async function gmailFetch(url, accessToken) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Gmail request failed: ${response.status}`);
  return response.json();
}

function parseFromHeader(header) {
  const match = String(header).match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (!match) return { email: String(header).trim().toLowerCase() };
  return {
    displayName: match[1]?.trim() || undefined,
    email: match[2].trim().toLowerCase(),
  };
}

async function getSmartleadCampaignStatus(payload) {
  const apiKey = requireRuntimeEnv("SMARTLEAD_API_KEY");
  const campaignId = String(payload?.campaignId ?? "").trim();
  const pathPart = campaignId ? `/campaigns/${encodeURIComponent(campaignId)}/statistics` : "/campaigns/";
  const response = await fetch(`https://server.smartlead.ai/api/v1${pathPart}?api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Smartlead request failed: ${response.status}`);
  const data = await response.json();
  return campaignId ? { campaignId, statistics: data } : { campaigns: data };
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

async function appendLeadsToGoogleSheet(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) throw new Error("At least one lead row is required.");
  const spreadsheetId = String(payload?.spreadsheetId || requireRuntimeEnv("GOOGLE_SHEET_ID"));
  const range = String(payload?.range || "Leads!A1");
  const accountEnvKey = String(payload?.accountEnvKey ?? "").trim();
  const account = listConfiguredGmailAccounts().find((item) => !accountEnvKey || item.envKey === accountEnvKey);
  if (!account) {
    throw new Error(accountEnvKey ? `Google account not configured: ${accountEnvKey}` : "No configured Google OAuth account found.");
  }
  const accessToken = await refreshGoogleAccessToken(account.refreshToken);
  const params = new URLSearchParams({
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?${params.toString()}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        majorDimension: "ROWS",
        values: rows,
      }),
    }
  );
  if (!response.ok) throw new Error(`Google Sheets append failed: ${response.status}`);
  return response.json();
}

async function draftContractIntake(payload) {
  const brief = String(payload?.brief ?? "").trim();
  if (!brief) throw new Error("Contract brief is required.");
  const response = await generateGeminiTextForContract({
    brief,
    baseIntake: payload?.baseIntake && typeof payload.baseIntake === "object" ? payload.baseIntake : {},
  });
  return parseJsonObject(response.text);
}

async function generateGeminiTextForContract(input) {
  const apiKey = requireRuntimeEnv("GEMINI_API_KEY");
  const model = "gemini-2.5-flash";
  const prompt = [
    "Create a filled Arcigy contract intake JSON object from this business brief.",
    "Keep Arcigy/provider details unchanged when present in the base intake.",
    "If a value is unknown, use a clear placeholder like [doplnit].",
    "Return only valid JSON. Do not include markdown, comments, signatures, or legal advice.",
    "The JSON must include client, contacts, project, pricing, dates, specialTerms, and additionalAttachments when useful.",
    "Base intake JSON:",
    JSON.stringify(input.baseIntake ?? {}, null, 2),
    "Business brief:",
    input.brief,
  ].join("\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are Arcigy Jarvis. Return only valid JSON for the Arcigy contract intake schema.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { model, text };
}

function parseJsonObject(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini did not return a JSON object.");
  }
  return parsed;
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
