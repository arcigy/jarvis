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
const defaultGmailSyncQuery = "in:inbox newer_than:7d";
const defaultGmailBriefingQuery = "in:inbox newer_than:2d";
const googleOAuthTokenUrls = ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v4/token"];
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
  ipcMain.handle("jarvis:productionReadiness", (_event, payload) => getProductionReadiness(payload));
  ipcMain.handle("jarvis:operatorBriefing", (_event, payload) => getOperatorBriefing(payload));
  ipcMain.handle("jarvis:webBridgePreflight", () => getWebBridgePreflight());
  ipcMain.handle("jarvis:remoteMcpPack", (_event, payload) => getRemoteMcpPack(payload));
  ipcMain.handle("jarvis:remoteMcpSmoke", (_event, payload) => runRemoteMcpSmoke(payload));
  ipcMain.handle("jarvis:getPreparedOutreachReplies", (_event, payload) => getPreparedOutreachReplies(payload));
  ipcMain.handle("jarvis:approvePreparedOutreachReply", (_event, payload) => approvePreparedOutreachReply(payload));
  ipcMain.handle("jarvis:identifyEmail", (_event, payload) => identifyEmail(payload));
  ipcMain.handle("jarvis:ingestClientMessage", (_event, payload) => ingestClientMessage(payload));
  ipcMain.handle("jarvis:getClientNeedAlerts", (_event, payload) => getClientNeedAlerts(payload));
  ipcMain.handle("jarvis:generateAiReply", (_event, payload) => generateAiReply(payload));
  ipcMain.handle("jarvis:syncGmailRecentMessages", (_event, payload) => syncGmailRecentMessages(payload));
  ipcMain.handle("jarvis:getSmartleadCampaignStatus", (_event, payload) => getSmartleadCampaignStatus(payload));
  ipcMain.handle("jarvis:getSmartleadOutreachBrief", (_event, payload) => getSmartleadOutreachBrief(payload));
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

  if (lowered.includes("briefing") || lowered.includes("prehlad") || lowered.includes("prehľad") || lowered.includes("co sa deje") || lowered.includes("čo sa deje")) {
    return voiceDone(session, text, (await getOperatorBriefing({ ...payload, text })).speechText);
  }

  if (isProductionReadinessVoiceCommand(lowered)) {
    const report = await getProductionReadiness({ ...payload, live: payload?.live === true || lowered.includes("live") });
    return voiceDone(session, text, summarizeReadinessForVoice(report));
  }

  if (isRemoteMcpVoiceCommand(lowered)) {
    const pack = await getRemoteMcpPack({ ...payload, includeReadiness: true, live: false });
    return voiceDone(session, text, summarizeRemoteMcpForVoice(pack));
  }

  if (isContractVoiceCommand(lowered)) {
    const brief = cleanVoiceQuery(text, ["jarvis", "zmluva", "zmluvy", "contract", "kontrakt", "formular", "formulár", "intake", "navrhni", "draft"]);
    if (lowered.includes("vygeneruj") || lowered.includes("generuj")) {
      return voiceDone(session, text, "Zmluvy vygenerujem az po vyplnenom intake a explicitnom schvaleni payloadu. Hlasom mozem pripravit draft intake.");
    }
    if (brief.length >= 24 && (lowered.includes("intake") || lowered.includes("formular") || lowered.includes("formulár") || lowered.includes("navrh") || lowered.includes("draft"))) {
      const intake = await draftContractIntake({ brief });
      return voiceDone(session, text, summarizeContractDraftForVoice(intake));
    }
    return voiceDone(session, text, "Zmluvny modul je pripraveny. Povedz klienta, projekt, cenu a rozsah; pripravim intake a finalne DOCX az po tvojom schvaleni.");
  }

  if (lowered.includes("cold") || lowered.includes("outreach")) {
    return voiceDone(session, text, await getColdOutreachBrief({ text, dbPath: payload?.dbPath, live: payload?.live !== false }));
  }

  if (isClientNeedsVoiceCommand(lowered)) {
    const result = getClientNeedAlerts({ dbPath: payload?.dbPath, status: "new", limit: 10 });
    return voiceDone(session, text, summarizeClientNeeds(Number(result.count || 0), Array.isArray(result.alerts) ? result.alerts : []));
  }

  if (isGmailVoiceCommand(lowered)) {
    const result = await syncGmailRecentMessages({
      dbPath: payload?.dbPath,
      accountEnvKey: payload?.accountEnvKey,
      query: payload?.gmailQuery || defaultGmailBriefingQuery,
      maxResults: Number(payload?.gmailMaxResults || 5),
      dryRun: true,
    });
    return voiceDone(session, text, summarizeGmailPreviewForVoice(result));
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
    "Rozumiem. Viem hlasom pripravit briefing, skontrolovat produkciu, remote MCP, zmluvy, cold outreach, Gmail, klientske poziadavky, integracie, email, leady alebo Gemini odpoved."
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
    ["redis", ["REDIS_URL"], false],
    ["serper", ["SERPER_API_KEY"], false],
    ["googleMaps", ["GOOGLE_MAPS_API_KEY"]],
    ["googleSheets", ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
  ].map(([key, required, requiredForProduction = true]) => {
    const missing = required.flatMap((name) => getRuntimeEnvIssue(name));
    return { key, configured: missing.length === 0, missing, requiredForProduction };
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

async function getProductionReadiness(payload) {
  const live = payload?.live === true;
  const health = getSystemHealth();
  const bridge = getWebBridgePreflight();
  const diagnostics = live ? await runDiagnostics(payload) : null;
  const blockers = [
    ...health.integrations.flatMap((item) =>
      item.configured
        ? []
        : item.missing.map((missing) => ({
            key: item.key,
            severity: item.requiredForProduction === false ? "warning" : "blocking",
            message: `Missing or invalid runtime config: ${missing}`,
            nextAction: readinessNextAction(item.key, missing),
          }))
    ),
    ...(diagnostics?.checks || [])
      .filter((check) => check.status !== "ready")
      .map((check) => ({
        key: check.key,
        severity: ["redis", "serper"].includes(check.key) ? "warning" : "blocking",
        message: check.message,
        nextAction: readinessNextAction(check.key, check.message),
      })),
  ];
  const uniqueBlockers = dedupeReadinessBlockers(blockers);
  const ready = health.integrations.filter((item) => item.configured).length;
  const blocking = uniqueBlockers.filter((blocker) => blocker.severity === "blocking").length;
  const status = blocking ? "blocked" : uniqueBlockers.length ? "attention" : "ready";
  const warnings = uniqueBlockers.length - blocking;
  const fixGuide = buildReadinessFixGuide(uniqueBlockers);
  return {
    status,
    checkedAt: new Date().toISOString(),
    summary:
      status === "ready"
        ? `Production gates ready: ${ready}/${health.integrations.length} integrations configured and ${bridge.mcpToolCount} MCP tools available.`
        : status === "attention"
          ? `Production gates need attention: ${ready}/${health.integrations.length} integrations configured, ${bridge.mcpToolCount} MCP tools available, ${warnings} non-blocking warning(s).`
        : `Production needs attention: ${ready}/${health.integrations.length} integrations ready, ${bridge.mcpToolCount} MCP tools available, ${blocking} blocker(s), ${warnings} warning(s).`,
    integrations: {
      ready,
      total: health.integrations.length,
      missing: health.integrations.filter((item) => !item.configured).map((item) => ({ key: item.key, missing: item.missing })),
    },
    mcp: {
      toolCount: bridge.mcpToolCount,
      approvalRequired: bridge.riskyToolsRequiringApproval,
    },
    blockers: uniqueBlockers,
    attentionQueue: buildReadinessAttentionQueue(uniqueBlockers, fixGuide),
    launchChecklist: buildReadinessLaunchChecklist(health.integrations, bridge, uniqueBlockers, diagnostics),
    nextActions: uniqueBlockers.length
      ? uniqueBlockers.map((blocker) => blocker.nextAction)
      : ["No action needed. Keep secrets out of git and run doctor before changes."],
    fixGuide,
    diagnostics: diagnostics || undefined,
  };
}

function buildReadinessLaunchChecklist(integrations, bridge, blockers, diagnostics) {
  const requiredIntegrations = integrations.filter((item) => item.requiredForProduction !== false);
  const readyRequired = requiredIntegrations.filter((item) => item.configured);
  const warnings = blockers.filter((blocker) => blocker.severity === "warning");
  const blocking = blockers.filter((blocker) => blocker.severity === "blocking");
  const approvalTools = bridge.riskyToolsRequiringApproval || [];
  const requiredApprovalTools = ["arcigy.generate_contract_documents", "arcigy.approve_prepared_outreach_reply", "arcigy.append_leads_to_google_sheet"];
  const approvalReady = requiredApprovalTools.every((tool) => approvalTools.includes(tool));
  const liveChecks = diagnostics?.checks || [];
  const liveBlocking = liveChecks.filter((check) => check.status === "failed" && !["redis", "serper"].includes(check.key));
  const liveWarnings = liveChecks.filter((check) => check.status !== "ready" && ["redis", "serper"].includes(check.key));
  return [
    {
      id: "required-integrations",
      title: "Required integrations",
      status: blocking.length ? "blocked" : "ready",
      proof: `${readyRequired.length}/${requiredIntegrations.length} required integration group(s) configured.`,
      nextAction: blocking[0]?.nextAction || "Keep required integration secrets in .env.local and rerun doctor before live work.",
    },
    {
      id: "optional-advisories",
      title: "Optional advisories",
      status: warnings.length ? "attention" : "ready",
      proof: warnings.length ? `${warnings.length} non-blocking warning(s): ${warnings.map((item) => item.key).join(", ")}.` : "No non-blocking warnings.",
      nextAction: warnings[0]?.nextAction || "No action needed.",
    },
    {
      id: "mcp-registry",
      title: "MCP tool registry",
      status: bridge.mcpToolCount >= 27 ? "ready" : "blocked",
      proof: `${bridge.mcpToolCount} MCP tool(s) registered.`,
      nextAction: bridge.mcpToolCount >= 27 ? "Run npm run remote:mcp:smoke before remote agent handoff." : "Restore missing MCP tools, then rerun npm test.",
    },
    {
      id: "approval-locks",
      title: "Approval locks",
      status: approvalReady ? "ready" : "blocked",
      proof: approvalReady ? `${approvalTools.length} approval-gated tool(s), including contract, prepared reply, and Sheet writes.` : "One or more required approval gates are missing.",
      nextAction: approvalReady ? "Review exact payloads before approving write tools." : "Restore approval gates for write tools before live use.",
    },
    {
      id: "live-diagnostics",
      title: "Live diagnostics",
      status: diagnostics ? (liveBlocking.length ? "blocked" : liveWarnings.length ? "attention" : "ready") : "attention",
      proof: diagnostics
        ? `${liveChecks.filter((check) => check.status === "ready").length}/${liveChecks.length} live diagnostic check(s) ready.`
        : "Live diagnostics were not requested for this report.",
      nextAction: diagnostics ? liveBlocking[0]?.message || liveWarnings[0]?.message || "Live diagnostics are ready." : "Run npm run doctor -- --live-integrations.",
    },
  ];
}

function readinessNextAction(key, message) {
  const text = `${key} ${message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) return "Replace REDIS_URL with the real Railway Redis password, then rerun live diagnostics.";
  if (text.includes("serper") && text.includes("not enough credits")) return "Top up or replace at least one Serper API key; both configured keys were exhausted.";
  if (text.includes("gmail")) return "Refresh Google OAuth credentials for the configured Gmail accounts.";
  if (text.includes("google")) return "Verify Google API key, OAuth scopes, and the configured Sheet ID.";
  if (text.includes("smartlead")) return "Verify Smartlead API key and campaign access.";
  if (text.includes("gemini")) return "Verify GEMINI_API_KEY and Gemini API quota.";
  if (text.includes("postgres") || text.includes("database")) return "Verify DATABASE_URL credentials and network access.";
  return `Fix ${key} runtime configuration and rerun diagnostics.`;
}

function dedupeReadinessBlockers(blockers) {
  const seen = new Set();
  return blockers.filter((blocker) => {
    const key = `${blocker.key}:${blocker.severity}:${blocker.nextAction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildReadinessFixGuide(blockers) {
  const steps = blockers.map(readinessFixStepFor).filter(Boolean);
  if (!steps.length) {
    return [
      {
        id: "verify-before-change",
        title: "Keep production proof green",
        detail: "Run the local doctor before changes and keep real secret values only in .env.local.",
        envKeys: [],
        validationCommand: "npm run doctor",
      },
    ];
  }
  const seen = new Set();
  return steps.filter((step) => {
    if (seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

function buildReadinessAttentionQueue(blockers, fixGuide) {
  if (!blockers.length) return [];
  return blockers.map((blocker, index) => {
    const fixStep = fixGuide.find((step) => step.envKeys.some((key) => blocker.message.includes(key))) || fixGuide[index] || null;
    return {
      id: `${blocker.severity}-${blocker.key}-${index + 1}`,
      key: blocker.key,
      severity: blocker.severity,
      source: blocker.message.startsWith("Missing or invalid runtime config") ? "configuration" : "live-diagnostic",
      title: fixStep?.title || `Review ${blocker.key}`,
      message: blocker.message,
      nextAction: blocker.nextAction,
      envKeys: fixStep?.envKeys || [],
      validationCommand: fixStep?.validationCommand || "npm run doctor -- --live-integrations",
    };
  });
}

function readinessFixStepFor(blocker) {
  const text = `${blocker.key} ${blocker.message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) {
    return {
      id: "redis-real-password",
      title: "Replace Redis placeholder password",
      detail: "Set REDIS_URL to the real Railway Redis URL. The report never returns the secret value; it only flags placeholder credentials.",
      envKeys: ["REDIS_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("serper") && text.includes("not enough credits")) {
    return {
      id: "serper-credits",
      title: "Restore Serper search credits",
      detail: "Top up or replace at least one Serper key. The live check already tries SERPER_API_KEY and SERPER_API_KEY_2 before reporting exhaustion.",
      envKeys: ["SERPER_API_KEY", "SERPER_API_KEY_2"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("gmail") || text.includes("google")) {
    return {
      id: "google-oauth",
      title: "Verify Google OAuth and API access",
      detail: "Refresh OAuth credentials, confirm Sheets access, and keep Google keys in .env.local only.",
      envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_SHEET_ID", "GOOGLE_MAPS_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("smartlead")) {
    return {
      id: "smartlead-access",
      title: "Verify Smartlead access",
      detail: "Confirm the Smartlead API key has access to campaigns used by Jarvis.",
      envKeys: ["SMARTLEAD_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("gemini")) {
    return {
      id: "gemini-access",
      title: "Verify Gemini access",
      detail: "Confirm Gemini API key and quota for AI drafting features.",
      envKeys: ["GEMINI_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("postgres") || text.includes("database")) {
    return {
      id: "postgres-access",
      title: "Verify Postgres access",
      detail: "Confirm DATABASE_URL credentials and network access.",
      envKeys: ["DATABASE_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  return null;
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

async function getRemoteMcpPack(payload = {}) {
  const bridge = getWebBridgePreflight();
  const tools = listWebMcpTools();
  const approvalRequired = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const localStateWrite = tools.filter((tool) => localStateWriteTools.has(tool.name)).map((tool) => tool.name);
  const baseUrl = String(payload.baseUrl || bridge.manifestUrl.replace(/\/\.well-known\/arcigy-jarvis\.json$/, "")).replace(/\/+$/g, "");
  const readiness = payload.includeReadiness === false ? null : await getProductionReadiness({ live: payload.live === true });
  return {
    mode: "remote-mcp-connection-pack",
    source: "desktop",
    generatedAt: new Date().toISOString(),
    baseUrl,
    manifestUrl: `${baseUrl}/.well-known/arcigy-jarvis.json`,
    smokeTestUrl: `${baseUrl}/api/remote-mcp-smoke`,
    mcpBaseUrl: `${baseUrl}/api/mcp`,
    mcpToolCallPattern: `${baseUrl}/api/mcp/{toolName}`,
    auth: {
      type: "bearer",
      header: "Authorization: Bearer <JARVIS_WEB_TOKEN>",
      tokenConfigured: bridge.tokenConfigured,
      tokenValueReturned: false,
      requiredForExternalHosts: true,
      localhostBypass: bridge.localhostBypass,
    },
    tunnel: {
      provider: "ngrok",
      secureCommand: "npm run web:tunnel:secure",
      standardCommand: "npm run web:tunnel",
    },
    handoff: buildRemoteMcpHandoffRunbook(baseUrl),
    tools: {
      count: tools.length,
      names: tools.map((tool) => tool.name),
      approvalRequired,
      readOnlyOrDraft: tools.filter((tool) => !tool.requiresApproval && !localStateWriteTools.has(tool.name)).map((tool) => tool.name),
      localStateWrite,
    },
    quickStartCalls: buildRemoteMcpQuickStartCalls(baseUrl),
    approval: {
      requiredPayload: { approval: { approved: true } },
      rule: "Never call approval-required tools until the operator explicitly confirms the exact action.",
    },
    limits: {
      maxJsonBytes: getMaxJsonBytes(),
      pathPolicy: "repo-only",
      writesRequireExplicitToolCall: true,
    },
    readiness: readiness
      ? {
          status: readiness.status,
          summary: readiness.summary,
          checkedAt: readiness.checkedAt,
          blockers: readiness.blockers,
          attentionQueue: readiness.attentionQueue,
          launchChecklist: readiness.launchChecklist,
          nextActions: readiness.nextActions,
          fixGuide: readiness.fixGuide,
        }
      : undefined,
    agentInstructions: [
      "Fetch the manifestUrl first to list live tools and schemas.",
      "Run the smokeTestUrl before handoff if you need proof that the bridge, read-only MCP calls, approval gates, and secret policy are working.",
      "Call MCP tools with POST JSON to mcpToolCallPattern.",
      "Use the bearer auth header placeholder; the real token must be supplied by the operator and is never returned by this pack.",
      "Treat generate_contract_documents, approve_prepared_outreach_reply, and append_leads_to_google_sheet as approval-gated actions.",
      "Treat localStateWrite tools as local memory writes. Prefer dryRun: true for sync_gmail_recent_messages before ingesting messages.",
      "Use get_operator_briefing for a Jarvis-style daily status before making recommendations.",
    ],
  };
}

function buildRemoteMcpHandoffRunbook(baseUrl) {
  return {
    connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
    operatorChecklist: [
      "Run npm run web:tunnel:secure and keep the process open while the remote agent works.",
      "Give the remote agent the external manifest, connection pack, smoke test URL, MCP base URL, and bearer auth header placeholder.",
      "Approve approvalRequired tools only after reviewing the exact payload the agent will send.",
      "Run the smoke test again after any tunnel restart because ngrok URLs can change.",
    ],
    agentFirstSteps: [
      "Fetch connectionPackUrl with Authorization: Bearer <JARVIS_WEB_TOKEN>.",
      "Run smokeTestUrl and require status=ready before using MCP tools.",
      "Call arcigy.get_operator_briefing before proposing work.",
      "Use read-only or draft tools first; use dryRun: true before Gmail sync writes.",
      "Never call approvalRequired tools until the operator confirms the exact action.",
    ],
    requiredProof: [
      {
        key: "manifest",
        url: `${baseUrl}/.well-known/arcigy-jarvis.json`,
        expected: "HTTP 200, auth header placeholder, complete MCP tool registry.",
      },
      {
        key: "connection-pack",
        url: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
        expected: "HTTP 200, tokenValueReturned=false, handoff runbook present.",
      },
      {
        key: "remote-smoke",
        url: `${baseUrl}/api/remote-mcp-smoke`,
        expected: "status=ready for manifest, tool count, local write policy, approval gate, and secret redaction.",
      },
    ],
  };
}

const localStateWriteTools = new Set([
  "arcigy.add_cold_outreach_event",
  "arcigy.upsert_local_person",
  "arcigy.add_client_need_signal",
  "arcigy.ingest_client_message",
  "arcigy.sync_gmail_recent_messages",
]);

function buildRemoteMcpQuickStartCalls(baseUrl) {
  const toolUrl = (name) => `${baseUrl}/api/mcp/${name}`;
  const contractIntake = buildQuickStartContractIntake();
  return [
    {
      label: "Run remote MCP smoke proof",
      tool: "arcigy.run_remote_mcp_smoke",
      method: "POST",
      url: toolUrl("arcigy.run_remote_mcp_smoke"),
      body: {},
      approvalRequired: false,
    },
    {
      label: "Get Jarvis operator briefing",
      tool: "arcigy.get_operator_briefing",
      method: "POST",
      url: toolUrl("arcigy.get_operator_briefing"),
      body: { periodLabel: "poslednych 7 dni", live: false },
      approvalRequired: false,
    },
    {
      label: "Identify a client by email and open needs",
      tool: "arcigy.identify_email",
      method: "POST",
      url: toolUrl("arcigy.identify_email"),
      body: { email: "client@example.com" },
      approvalRequired: false,
    },
    {
      label: "List open client need alerts",
      tool: "arcigy.get_client_need_alerts",
      method: "POST",
      url: toolUrl("arcigy.get_client_need_alerts"),
      body: { status: "new", limit: 10 },
      approvalRequired: false,
    },
    {
      label: "Get Smartlead outreach brief",
      tool: "arcigy.get_smartlead_outreach_brief",
      method: "POST",
      url: toolUrl("arcigy.get_smartlead_outreach_brief"),
      body: { periodLabel: "poslednych 7 dni", maxCampaigns: 10 },
      approvalRequired: false,
    },
    {
      label: "Draft a Gemini client reply",
      tool: "arcigy.generate_ai_reply",
      method: "POST",
      url: toolUrl("arcigy.generate_ai_reply"),
      body: { message: "Client message here", context: "Arcigy Jarvis remote handoff.", language: "sk", tone: "executive" },
      approvalRequired: false,
    },
    {
      label: "Draft contract intake JSON without writing files",
      tool: "arcigy.draft_contract_intake",
      method: "POST",
      url: toolUrl("arcigy.draft_contract_intake"),
      body: {
        brief: "Klient potrebuje webovu aplikaciu pre lead intake, klientsku evidenciu, reporty, Gemini drafty, 2 pouzivatelov, setup 2000 EUR, mesacne 200 EUR.",
      },
      approvalRequired: false,
    },
    {
      label: "Discover leads without writing",
      tool: "arcigy.discover_leads",
      method: "POST",
      url: toolUrl("arcigy.discover_leads"),
      body: { query: "automation agency Bratislava", maxResults: 8 },
      approvalRequired: false,
    },
    {
      label: "Preview Gmail without local writes",
      tool: "arcigy.sync_gmail_recent_messages",
      method: "POST",
      url: toolUrl("arcigy.sync_gmail_recent_messages"),
      body: { query: "in:inbox newer_than:7d", maxResults: 5, dryRun: true },
      approvalRequired: false,
    },
    {
      label: "Generate contract documents after approval",
      tool: "arcigy.generate_contract_documents",
      method: "POST",
      url: toolUrl("arcigy.generate_contract_documents"),
      body: { approval: { approved: true }, intake: contractIntake },
      approvalRequired: true,
    },
  ];
}

function buildQuickStartContractIntake() {
  return {
    client: {
      businessName: "Demo Klient s. r. o.",
      registeredAddress: "Hlavna 1, 811 01 Bratislava",
      companyId: "12345678",
      taxId: "SK1234567890",
      representativeName: "Jan Novak",
      representativeRole: "konatel",
      email: "jan.novak@example.com",
      phone: "+421 900 000 000",
    },
    contacts: {
      clientAuthorizedContact: "Jan Novak, jan.novak@example.com, +421 900 000 000",
      arcigyAuthorizedContact: "Branislav Laubert, Co-Founder & CEO, branislav@arcigy.group, +421 951 268 376",
    },
    project: {
      name: "Demo automatizacna aplikacia",
      goal: "Automatizovat prijem leadov, klientsku evidenciu a reportovanie.",
      includedUserAccounts: 2,
      feedbackRounds: 3,
      includedModules: [
        {
          name: "Lead intake",
          purpose: "Zachytava a triedi nove dopyty.",
          inputs: "Kontaktne udaje, zdroj leadu, stav spracovania.",
          outputs: "Prehlad leadov a notifikacie pre operatora.",
          outOfScope: "Platene reklamne kampane.",
        },
      ],
      outputs: ["Webova aplikacia", "Administracny dashboard", "Zakladny reporting"],
      aiFeatures: ["Navrh odpovedi klientom", "Sumarizacia poziadaviek"],
      acceptanceCriteria: ["Operator vie vytvorit lead", "Dashboard zobrazi aktualny stav", "Report sa da exportovat"],
    },
    pricing: {
      implementationFeeEur: 2000,
      depositPercent: 30,
      monthlyFeeEur: 200,
      initialTermMonths: 6,
      invoiceDueDays: 14,
    },
    dates: {
      frameworkAgreementDate: "2026-06-08",
      projectAppendixDate: "2026-06-08",
      plannedLaunchDate: "2026-07-15",
    },
    specialTerms: ["Demo quick-start payload; operator must replace client data before real use."],
    additionalAttachments: [],
  };
}

async function runRemoteMcpSmoke(payload = {}) {
  const bridge = getWebBridgePreflight();
  const baseUrl = String(payload.baseUrl || bridge.manifestUrl.replace(/\/\.well-known\/arcigy-jarvis\.json$/, "")).replace(/\/+$/g, "");
  const token = typeof payload.bearerToken === "string" && payload.bearerToken.trim() ? payload.bearerToken.trim() : undefined;
  const expectedToolCount = listWebMcpTools().length;
  const checks = [];
  const manifest = await fetchJson(`${baseUrl}/.well-known/arcigy-jarvis.json`, token);
  checks.push(smokeCheck(manifest.ok, "manifest", manifest.ok ? "Manifest is reachable." : manifest.message));
  const manifestTools = Array.isArray(manifest.body?.tools) ? manifest.body.tools : [];
  checks.push(smokeCheck(manifestTools.length === expectedToolCount, "tool-count", `Manifest exposes ${manifestTools.length}/${expectedToolCount} MCP tools.`));
  checks.push(smokeCheck(manifest.body?.auth?.header === "Authorization: Bearer <JARVIS_WEB_TOKEN>", "auth-placeholder", "Manifest returns auth placeholder, not the token value."));
  checks.push(
    smokeCheck(
      hasLocalWritePolicy(manifest.body?.toolPolicy),
      "manifest-local-write-policy",
      "Manifest identifies local write tools separately from read-only/draft tools."
    )
  );
  const pack = await fetchJson(`${baseUrl}/api/remote-mcp-pack?includeReadiness=false`, token);
  checks.push(smokeCheck(pack.ok, "connection-pack", pack.ok ? "Remote MCP connection pack is reachable." : pack.message));
  checks.push(smokeCheck(pack.body?.auth?.tokenValueReturned === false, "pack-secret-policy", "Connection pack confirms tokenValueReturned=false."));
  checks.push(
    smokeCheck(
      hasLocalWritePolicy(pack.body?.tools),
      "pack-local-write-policy",
      "Connection pack identifies local write tools separately from read-only/draft tools."
    )
  );
  checks.push(
    smokeCheck(
      hasUsableContractQuickStart(pack.body?.quickStartCalls),
      "pack-contract-quick-start",
      "Connection pack includes a usable approval-gated contract quick-start payload."
    )
  );
  checks.push(
    smokeCheck(
      hasDraftContractIntakeQuickStart(pack.body?.quickStartCalls),
      "pack-contract-draft-quick-start",
      "Connection pack includes a read-only Gemini contract intake draft quick-start call."
    )
  );
  checks.push(
    smokeCheck(
      hasHandoffProof(pack.body?.handoff, baseUrl),
      "pack-handoff-proof",
      "Connection pack includes remote handoff proof URLs and first-step instructions."
    )
  );
  checks.push(
    smokeCheck(
      hasClientMemoryQuickStarts(pack.body?.quickStartCalls),
      "pack-client-memory-quick-start",
      "Connection pack includes read-only client identity and open-need quick-start calls."
    )
  );
  const health = await fetchJson(`${baseUrl}/api/mcp/arcigy.get_system_health`, token, { format: "json" });
  checks.push(smokeCheck(health.ok && Array.isArray(health.body?.result?.integrations), "read-only-tool-call", "Read-only MCP tool call returned integration health."));
  const approvalGate = await fetchJson(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, token, { intake: {} });
  checks.push(smokeCheck(approvalGate.status === 409, "approval-gate", "Approval-required write tool rejected an unapproved call."));
  const leakedToken = token
    ? JSON.stringify({ manifest: manifest.body, pack: pack.body, health: health.body, approvalGate: approvalGate.body }).includes(token)
    : false;
  checks.push(smokeCheck(!leakedToken, "secret-redaction", "Smoke responses did not echo the bearer token."));
  const status = checks.every((check) => check.status === "ready") ? "ready" : "blocked";
  return {
    mode: "remote-mcp-smoke",
    status,
    checkedAt: new Date().toISOString(),
    baseUrl,
    summary:
      status === "ready"
        ? `Remote MCP smoke ready: manifest, ${expectedToolCount} tools, local write policy, contract draft, contract quick-start, client memory quick-start, handoff proof, read-only call, approval gate, and secret policy passed.`
        : `Remote MCP smoke blocked: ${checks.filter((check) => check.status === "blocked").length} check(s) failed.`,
    tokenValueReturned: false,
    expectedToolCount,
    checks,
  };
}

function smokeCheck(ok, key, message) {
  return { key, status: ok ? "ready" : "blocked", message };
}

function hasLocalWritePolicy(value) {
  if (!value || typeof value !== "object") return false;
  const localStateWrite = Array.isArray(value.localStateWrite) ? value.localStateWrite : [];
  const readOnlyOrDraft = Array.isArray(value.readOnlyOrDraft) ? value.readOnlyOrDraft : [];
  return localStateWrite.includes("arcigy.sync_gmail_recent_messages") && !readOnlyOrDraft.includes("arcigy.sync_gmail_recent_messages");
}

function hasUsableContractQuickStart(value) {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => item?.tool === "arcigy.generate_contract_documents");
  if (!call || call.approvalRequired !== true || call.body?.approval?.approved !== true) return false;
  const intake = call.body.intake;
  const hasRequiredShape =
    typeof intake?.client?.businessName === "string" &&
    typeof intake?.client?.email === "string" &&
    Array.isArray(intake?.project?.includedModules) &&
    Boolean(intake?.pricing);
  return hasRequiredShape && !/dopln|todo|tbd|xxx|\?\?\?/i.test(JSON.stringify(call.body));
}

function hasDraftContractIntakeQuickStart(value) {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => item?.tool === "arcigy.draft_contract_intake");
  return (
    call?.approvalRequired === false &&
    typeof call?.body?.brief === "string" &&
    call.body.brief.length >= 40 &&
    !("outputDir" in (call.body ?? {})) &&
    !("approval" in (call.body ?? {}))
  );
}

function hasHandoffProof(value, baseUrl) {
  if (!value || typeof value !== "object") return false;
  if (value.connectionPackUrl !== `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`) return false;
  const requiredProof = Array.isArray(value.requiredProof) ? value.requiredProof : [];
  const agentFirstSteps = Array.isArray(value.agentFirstSteps) ? value.agentFirstSteps : [];
  const proofKeys = new Set(requiredProof.map((item) => item?.key));
  return (
    proofKeys.has("manifest") &&
    proofKeys.has("connection-pack") &&
    proofKeys.has("remote-smoke") &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("arcigy.get_operator_briefing")) &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("status=ready"))
  );
}

function hasClientMemoryQuickStarts(value) {
  if (!Array.isArray(value)) return false;
  const identify = value.find((item) => item?.tool === "arcigy.identify_email");
  const alerts = value.find((item) => item?.tool === "arcigy.get_client_need_alerts");
  return (
    identify?.approvalRequired === false &&
    typeof identify?.body?.email === "string" &&
    alerts?.approvalRequired === false &&
    alerts?.body?.status === "new" &&
    typeof alerts?.body?.limit === "number"
  );
}

async function fetchJson(url, token, payload = null) {
  try {
    const response = await fetch(url, {
      method: payload ? "POST" : "GET",
      headers: {
        ...(payload ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, message: response.ok ? "OK" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, body: null, message: error instanceof Error ? error.message : String(error) };
  }
}

function listWebMcpTools() {
  return [
    { name: "arcigy.generate_contract_documents", requiresApproval: true },
    { name: "arcigy.draft_contract_intake", requiresApproval: false },
    { name: "arcigy.get_cold_outreach_brief", requiresApproval: false },
    { name: "arcigy.get_cold_outreach_brief_from_db", requiresApproval: false },
    { name: "arcigy.add_cold_outreach_event", requiresApproval: false },
    { name: "arcigy.get_prepared_outreach_replies", requiresApproval: false },
    { name: "arcigy.approve_prepared_outreach_reply", requiresApproval: true },
    { name: "arcigy.identify_email", requiresApproval: false },
    { name: "arcigy.upsert_local_person", requiresApproval: false },
    { name: "arcigy.add_client_need_signal", requiresApproval: false },
    { name: "arcigy.ingest_client_message", requiresApproval: false },
    { name: "arcigy.get_client_need_alerts", requiresApproval: false },
    { name: "arcigy.jarvis_voice_event", requiresApproval: false },
    { name: "arcigy.get_system_health", requiresApproval: false },
    { name: "arcigy.run_integration_diagnostics", requiresApproval: false },
    { name: "arcigy.get_production_readiness", requiresApproval: false },
    { name: "arcigy.get_remote_mcp_pack", requiresApproval: false },
    { name: "arcigy.run_remote_mcp_smoke", requiresApproval: false },
    { name: "arcigy.get_operator_briefing", requiresApproval: false },
    { name: "arcigy.generate_ai_reply", requiresApproval: false },
    { name: "arcigy.sync_gmail_recent_messages", requiresApproval: false },
    { name: "arcigy.get_smartlead_campaign_status", requiresApproval: false },
    { name: "arcigy.get_smartlead_outreach_brief", requiresApproval: false },
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
    check.message = await runWithTransientRetry(run);
    check.status = "ready";
  } catch (error) {
    check.status = "failed";
    check.message = error instanceof Error ? error.message : String(error);
  }
}

async function runWithTransientRetry(run, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isTransientNetworkError(lastError) || attempt === maxRetries) break;
      await sleep(350 * (attempt + 1));
    }
  }
  throw lastError || new Error("Live diagnostic failed.");
}

function isTransientNetworkError(error) {
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(error.message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function summarizeReadinessForVoice(report) {
  const queue = Array.isArray(report.attentionQueue) ? report.attentionQueue : [];
  const launch = Array.isArray(report.launchChecklist) ? report.launchChecklist : [];
  const topQueue = queue.slice(0, 3).map((item) => `${item.key}: ${item.title}`).join("; ");
  const checklistReady = launch.filter((item) => item.status === "ready").length;
  const nextAction = Array.isArray(report.nextActions) && report.nextActions.length ? `Najblizsi krok: ${report.nextActions[0]}` : "Najblizsi krok: ziadny urgentny.";
  return [
    `Production readiness je ${report.status}.`,
    report.summary,
    launch.length ? `Launch checklist: ${checklistReady}/${launch.length} ready.` : null,
    topQueue ? `Attention queue: ${topQueue}.` : "Attention queue je prazdna.",
    nextAction,
  ].filter(Boolean).join(" ");
}

function summarizeRemoteMcpForVoice(pack) {
  const tools = pack.tools || {};
  const approvalRequired = Array.isArray(tools.approvalRequired) ? tools.approvalRequired : [];
  const localWrites = Array.isArray(tools.localStateWrite) ? tools.localStateWrite : [];
  const quickStarts = Array.isArray(pack.quickStartCalls) ? pack.quickStartCalls.length : 0;
  const readiness = pack.readiness?.status ? `Readiness: ${pack.readiness.status}.` : "";
  return [
    `Remote MCP pack je pripraveny pre ${tools.count || 0} toolov.`,
    readiness,
    `Approval locky: ${approvalRequired.length}. Lokalnych zapisov: ${localWrites.length}. Quick-start volani: ${quickStarts}.`,
    `Manifest: ${pack.manifestUrl}. Smoke test: ${pack.smokeTestUrl}.`,
    "Token nevraciam; pouziva sa iba bearer placeholder.",
  ].filter(Boolean).join(" ");
}

function summarizeContractDraftForVoice(intake) {
  const client = intake?.client || {};
  const project = intake?.project || {};
  const pricing = intake?.pricing || {};
  const clientName = client.businessName || client.name || "klient nie je doplneny";
  const projectName = project.name || project.goal || "projekt nie je doplneny";
  const fee = pricing.implementationFeeEur ?? pricing.implementationFee ?? pricing.monthlyFee ?? null;
  return [
    `Pripravil som draft intake pre ${clientName}.`,
    `Projekt: ${projectName}.`,
    fee !== null ? `Cena v intake: ${fee} EUR.` : "Cena este nie je jasna.",
    "DOCX zmluvu a prilohy vygenerujem az po tvojej kontrole a explicitnom schvaleni.",
  ].join(" ");
}

function summarizeGmailPreviewForVoice(result) {
  const synced = Array.isArray(result.synced) ? result.synced : [];
  const fetched = synced.reduce((sum, item) => sum + Number(item.fetched || 0), 0);
  const preview = synced.flatMap((item) => item.preview || []).slice(0, 3);
  const previewText = preview.length
    ? `Top preview: ${preview.map((item) => `${item.fromEmail}: ${item.subject || "bez predmetu"}`).join("; ")}.`
    : "Preview nenasiel ziadne spravy.";
  return `Gmail preview bez lokalneho zapisu skontroloval ${synced.length} account(s) a nasiel ${fetched} sprav. ${previewText}`;
}

function isProductionReadinessVoiceCommand(text) {
  return ["production", "produkcia", "readiness", "launch", "checklist", "nasadenie"].some((term) => text.includes(term));
}

function isRemoteMcpVoiceCommand(text) {
  return ["remote mcp", "mcp", "tunel", "tunnel", "handoff", "claude", "chatgpt"].some((term) => text.includes(term));
}

function isContractVoiceCommand(text) {
  return ["zmluva", "zmluvy", "contract", "kontrakt", "priloha", "docx", "intake"].some((term) => text.includes(term));
}

function isClientNeedsVoiceCommand(text) {
  return ["klientske poziadavky", "poziadavky klientov", "co chce klient", "co chcu klienti", "client need"].some((term) => text.includes(term));
}

function isGmailVoiceCommand(text) {
  return ["gmail", "inbox", "posta", "mail sync"].some((term) => text.includes(term));
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
  const message = safeAiPromptPart(payload?.message);
  if (!message) throw new Error("Client message is required.");
  const prompt = [
    "Si Arcigy Jarvis. Priprav profesionalnu, vecnu a family-friendly odpoved klientovi.",
    "Nikdy neslubuj odoslanie bez schvalenia pouzivatelom.",
    "Ak sprava obsahuje citlive udaje alebo secrety, nereprodukuj ich.",
    payload?.clientName ? `Klient: ${safeAiPromptPart(payload.clientName)}` : null,
    payload?.context ? `Kontext: ${safeAiPromptPart(payload.context)}` : null,
    "Sprava klienta:",
    message,
    "Vytvor kratku odpoved v slovencine a jednu vetu, co ma pouzivatel schvalit.",
  ]
    .filter(Boolean)
    .join("\n");

  return generateGeminiText({
    prompt,
    model: payload?.model,
    temperature: 0.35,
  });
}

async function getColdOutreachBrief(payload) {
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
  return getOperatorColdOutreachSummary(payload?.live !== false, String(payload?.periodLabel || period.periodLabel), parsed.summary, {
    preparedPositiveReplyCount: Number(parsed.metrics?.preparedPositiveReplyCount || 0),
    pendingApprovalCount: Number(parsed.metrics?.pendingApprovalCount || 0),
  });
}

function getPreparedOutreachReplies(payload = {}) {
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "list-prepared-replies",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--payload",
    JSON.stringify({
      status: payload?.status || "pending",
      since: payload?.since,
      until: payload?.until,
      limit: payload?.limit || 10,
    }),
  ]);
  return JSON.parse(result.stdout);
}

function approvePreparedOutreachReply(payload = {}) {
  if (payload?.approved !== true && payload?.approval?.approved !== true) {
    throw new Error("Prepared outreach reply approval requires explicit approved: true.");
  }
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "approve-prepared-reply",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--payload",
    JSON.stringify({
      preparedEventId: payload?.preparedEventId,
      approvalNote: payload?.approvalNote,
      approvedBy: payload?.approvedBy || "desktop",
    }),
  ]);
  return JSON.parse(result.stdout);
}

async function getOperatorBriefing(payload = {}) {
  const period = resolveColdOutreachPeriod(String(payload?.text ?? payload?.periodLabel ?? ""));
  const dbPath = payload?.dbPath || defaultDbPath;
  const liveSyncSummary = await maybeSyncGmailForOperatorBriefing(payload, dbPath);
  const coldResult = runPython([
    "scripts/jarvis_local_db.py",
    "cold-brief",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      since: payload?.since || period.since,
      until: payload?.until || period.until,
      periodLabel: payload?.periodLabel || period.periodLabel,
    }),
  ]);
  const cold = JSON.parse(coldResult.stdout);
  const clientNeeds = getClientNeedAlerts({ dbPath, status: "new", limit: 10 });
  const preparedReplies = getPreparedOutreachReplies({ dbPath, status: "pending", limit: 10 });
  const readiness = getProductionReadiness({ live: payload?.live === true, dbPath });
  const preparedReplyCount = Number(preparedReplies.count || 0);
  const coldOutreachSummary = await getOperatorColdOutreachSummary(payload?.live === true, String(payload?.periodLabel || period.periodLabel), cold.summary, {
    preparedPositiveReplyCount: preparedReplyCount,
    pendingApprovalCount: preparedReplyCount,
  });
  return buildOperatorBriefing({
    readinessStatus: readiness.status,
    readinessSummary: readiness.summary,
    readinessAttentionQueue: readiness.attentionQueue || [],
    coldOutreachSummary,
    liveSyncSummary,
    openClientNeedCount: Number(clientNeeds.count || 0),
    clientNeedHighlights: Array.isArray(clientNeeds.alerts) ? clientNeeds.alerts : [],
    preparedReplyCount,
    nextActions: readiness.nextActions || [],
  });
}

async function getOperatorColdOutreachSummary(live, periodLabel, localSummary, approvals = {}) {
  if (!live) return localSummary;
  try {
    const smartlead = await getSmartleadOutreachBrief({ periodLabel, maxCampaigns: 10, ...approvals });
    return smartlead.summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${localSummary} Live Smartlead summary unavailable: ${message}`;
  }
}

async function maybeSyncGmailForOperatorBriefing(payload, dbPath) {
  if (payload?.live !== true || payload?.syncGmail === false) return null;
  try {
    const result = await syncGmailRecentMessages({
      dbPath,
      accountEnvKey: payload?.accountEnvKey,
      query: payload?.gmailQuery || defaultGmailBriefingQuery,
      maxResults: Number(payload?.gmailMaxResults || 5),
      dryRun: false,
    });
    const fetched = result.synced.reduce((sum, item) => sum + item.fetched, 0);
    const created = result.synced.reduce((sum, item) => sum + item.created, 0);
    const duplicates = result.synced.reduce((sum, item) => sum + item.duplicates, 0);
    const alerts = result.synced.reduce((sum, item) => sum + item.alerts.length, 0);
    return `Gmail checked ${result.synced.length} account(s), fetched ${fetched} message(s), created ${created} new record(s), skipped ${duplicates} duplicate(s), raised ${alerts} alert(s).`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Gmail live sync unavailable: ${message}`;
  }
}

function buildOperatorBriefing(input) {
  const nextAction = input.nextActions?.[0] || "Ziadny urgentny krok.";
  const readinessAttention = summarizeReadinessAttention(input.readinessAttentionQueue || []);
  const clientNeeds = summarizeClientNeeds(Number(input.openClientNeedCount || 0), input.clientNeedHighlights || []);
  const sections = {
    readiness: `Readiness: ${input.readinessStatus}. ${input.readinessSummary}`,
    readinessAttention,
    coldOutreach: `Cold outreach: ${input.coldOutreachSummary}`,
    liveSync: input.liveSyncSummary ? `Live sync: ${input.liveSyncSummary}` : undefined,
    clientNeeds,
    preparedReplies:
      input.preparedReplyCount > 0
        ? `Pripravene odpovede: ${input.preparedReplyCount} caka na schvalenie.`
        : "Pripravene odpovede: nic necaka na schvalenie.",
    nextAction: `Najblizsi krok: ${nextAction}`,
  };
  const speechText = [
    "Jarvis briefing.",
    sections.readiness,
    sections.readinessAttention,
    sections.coldOutreach,
    sections.liveSync,
    sections.clientNeeds,
    sections.preparedReplies,
    sections.nextAction,
  ].filter(Boolean).join(" ");
  return {
    summary: speechText,
    speechText,
    sections,
  };
}

function summarizeReadinessAttention(queue) {
  if (!queue.length) return undefined;
  const topItems = queue
    .slice(0, 3)
    .map((item) => `${item.key}: ${item.title}`)
    .join("; ");
  return `Production attention queue: ${queue.length} item(s). ${topItems}.`;
}

function summarizeClientNeeds(count, highlights) {
  if (count <= 0) return "Klientske poziadavky: ziadne otvorene.";
  const topItems = highlights
    .slice(0, 3)
    .map((item) => {
      const person = item.person || {};
      const need = item.needSignal || {};
      const name = person.displayName || person.companyName || person.primaryEmail || "neznamy kontakt";
      const summary = need.summary || "bez detailu";
      return `${name}: ${summary}`;
    })
    .filter(Boolean);
  if (!topItems.length) return `Klientske poziadavky: ${count} otvorenych.`;
  return `Klientske poziadavky: ${count} otvorenych. Najnovsie: ${topItems.join("; ")}.`;
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

function getClientNeedAlerts(payload = {}) {
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "list-open-needs",
    "--db",
    payload?.dbPath || defaultDbPath,
    "--payload",
    JSON.stringify({
      status: payload?.status || "new",
      limit: payload?.limit || 10,
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
  const query = String(payload?.query ?? defaultGmailSyncQuery).trim() || defaultGmailSyncQuery;
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
    const createdItems = ingested.filter((item) => item.status === "created");
    const duplicateItems = ingested.filter((item) => item.status === "duplicate");
    synced.push({
      account: account.label,
      fetched: events.length,
      ingested: createdItems.length,
      created: createdItems.length,
      duplicates: duplicateItems.length,
      processed: ingested.length,
      alerts: createdItems.map((item) => item.jarvisAlert).filter(Boolean),
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
    q: options.query ?? defaultGmailSyncQuery,
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
  const clientId = requireRuntimeEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireRuntimeEnv("GOOGLE_CLIENT_SECRET");
  let lastError = null;
  for (const url of googleOAuthTokenUrls) {
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json();
      if (!data.access_token) throw new Error("missing access token");
      return data.access_token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `${new URL(url).hostname}: ${message}`;
    }
  }
  throw new Error(`Google OAuth refresh failed after ${googleOAuthTokenUrls.length} endpoint(s): ${lastError || "unknown error"}`);
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

async function getSmartleadOutreachBrief(payload) {
  const campaignId = String(payload?.campaignId ?? "").trim();
  if (!campaignId) {
    const campaignStatus = await getSmartleadCampaignStatus({});
    const campaigns = Array.isArray(campaignStatus.campaigns) ? campaignStatus.campaigns.filter((campaign) => campaign?.id !== undefined && campaign?.id !== null) : [];
    const selected = campaigns.slice(0, clampMaxCampaigns(payload?.maxCampaigns));
    if (!selected.length) throw new Error("Smartlead did not return any campaigns to summarize.");
    const campaignStats = await Promise.all(
      selected.map(async (campaign) => {
        const id = String(campaign.id);
        const status = await getSmartleadCampaignStatus({ campaignId: id });
        return {
          campaignId: id,
          name: campaign.name,
          status: campaign.status,
          statistics: status.statistics,
        };
      })
    );
    return buildSmartleadOutreachBrief({
      campaignId: "all",
      campaignIds: campaignStats.map((item) => item.campaignId),
      campaignCount: campaignStats.length,
      periodLabel: String(payload?.periodLabel ?? "poslednych 7 dni"),
      statistics: campaignStats,
      preparedPositiveReplyCount: Math.max(0, Math.floor(Number(payload?.preparedPositiveReplyCount ?? 0))),
      pendingApprovalCount: Math.max(0, Math.floor(Number(payload?.pendingApprovalCount ?? 0))),
    });
  }

  const status = await getSmartleadCampaignStatus({ campaignId });
  return buildSmartleadOutreachBrief({
    campaignId,
    campaignIds: [campaignId],
    campaignCount: 1,
    periodLabel: String(payload?.periodLabel ?? "poslednych 7 dni"),
    statistics: status.statistics,
    preparedPositiveReplyCount: Math.max(0, Math.floor(Number(payload?.preparedPositiveReplyCount ?? 0))),
    pendingApprovalCount: Math.max(0, Math.floor(Number(payload?.pendingApprovalCount ?? 0))),
  });
}

function buildSmartleadOutreachBrief(input) {
  const contacted =
    readOptionalSmartleadMetric(input.statistics, ["sent_count", "sent", "emails_sent", "total_sent", "sent_emails_count", "total_stats"]) ??
    countPresentSmartleadFields(input.statistics, ["sent_time"]);
  const opened =
    readOptionalSmartleadMetric(input.statistics, ["open_count", "opened", "opened_count", "unique_open_count", "total_opens"]) ??
    countPresentSmartleadFields(input.statistics, ["open_time"]);
  const replied =
    readOptionalSmartleadMetric(input.statistics, ["reply_count", "replied", "replied_count", "unique_reply_count", "total_replies"]) ??
    countPresentSmartleadFields(input.statistics, ["reply_time"]);
  const positiveReplies = readOptionalSmartleadMetric(input.statistics, [
    "positive_reply_count",
    "positive_replies",
    "positive_replied_count",
    "interested_count",
  ]) ?? countTextSmartleadFields(input.statistics, ["lead_category"], ["interested", "positive", "meeting", "booked", "qualified"]);
  const openRate = rate(opened, contacted);
  const replyRate = rate(replied, contacted);
  const positiveReplyRate = positiveReplies === null ? null : rate(positiveReplies, replied);
  const notes = [];
  const campaignCount = input.campaignCount ?? input.campaignIds?.length ?? 1;
  const campaignScope = campaignCount > 1 ? ` v ${campaignCount} kampaniach` : "";
  const summaryParts = [
    `Za ${input.periodLabel} sme cez Smartlead napisali ${contacted} ludom${campaignScope}.`,
    `${openRate}% si email otvorilo, ${replied} ludi odpisalo.`,
  ];

  if (positiveReplies === null) {
    notes.push("Smartlead statistics did not include a positive reply field.");
    summaryParts.push("Pozitivne odpovede Smartlead v tomto reporte neposlal; treba ich doplnit z lokalnej DB alebo klasifikovat z odpovedi.");
  } else {
    summaryParts[1] = `${openRate}% si email otvorilo, ${replied} ludi odpisalo, z toho ${positiveReplies} pozitivne.`;
  }

  if (input.preparedPositiveReplyCount > 0) {
    summaryParts.push(`Pripravil som ti ${smartleadReplyLabel(input.preparedPositiveReplyCount)} na pozitivne reakcie a poslem ich az na tvoje potvrdenie.`);
  }
  if (input.pendingApprovalCount > 0) {
    summaryParts.push(`Caka ${smartleadReplyLabel(input.pendingApprovalCount)} na schvalenie.`);
  }

  return {
    campaignId: input.campaignId,
    campaignIds: input.campaignIds ?? [input.campaignId],
    campaignCount,
    periodLabel: input.periodLabel,
    summary: summaryParts.join(" "),
    statistics: input.statistics,
    metrics: {
      contacted,
      opened,
      replied,
      positiveReplies,
      openRate,
      replyRate,
      positiveReplyRate,
    },
    notes,
  };
}

function smartleadReplyLabel(count) {
  if (count === 1) return "1 odpoved";
  if (count > 1 && count < 5) return `${count} odpovede`;
  return `${count} odpovedi`;
}

function clampMaxCampaigns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.max(1, Math.min(Math.floor(numeric), 25));
}

function readOptionalSmartleadMetric(value, keys) {
  const wanted = new Set(keys.map(normalizeMetricKey));
  const values = findSmartleadMetricValues(value, wanted);
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + item, 0);
}

function findSmartleadMetricValues(value, wanted) {
  if (Array.isArray(value)) return value.flatMap((item) => findSmartleadMetricValues(item, wanted));
  if (!value || typeof value !== "object") return [];
  const output = [];
  for (const [key, item] of Object.entries(value)) {
    if (wanted.has(normalizeMetricKey(key))) {
      const numeric = toNumber(item);
      if (numeric !== null) output.push(numeric);
    }
    output.push(...findSmartleadMetricValues(item, wanted));
  }
  return output;
}

function normalizeMetricKey(key) {
  return String(key).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function rate(part, total) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function countPresentSmartleadFields(value, keys) {
  const wanted = new Set(keys.map(normalizeMetricKey));
  return countSmartleadFields(value, (key, item) => wanted.has(normalizeMetricKey(key)) && isPresent(item));
}

function countTextSmartleadFields(value, keys, needles) {
  const wanted = new Set(keys.map(normalizeMetricKey));
  const normalizedNeedles = needles.map(normalizeMetricKey);
  let fieldSeen = false;
  const count = countSmartleadFields(value, (key, item) => {
    if (!wanted.has(normalizeMetricKey(key))) return false;
    fieldSeen = true;
    return typeof item === "string" && normalizedNeedles.some((needle) => normalizeMetricKey(item).includes(needle));
  });
  return fieldSeen ? count : null;
}

function countSmartleadFields(value, predicate) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countSmartleadFields(item, predicate), 0);
  if (!value || typeof value !== "object") return 0;
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (predicate(key, item)) count += 1;
    count += countSmartleadFields(item, predicate);
  }
  return count;
}

function isPresent(value) {
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

async function discoverLeads(payload) {
  const query = String(payload?.query ?? "").trim();
  if (!query) throw new Error("Lead search query is required.");
  const maxResults = Math.max(1, Math.min(Number(payload?.maxResults ?? 10), 25));
  const hasSerper = getSerperApiKeys().length > 0;
  const hasGooglePlaces = presentEnv("GOOGLE_MAPS_API_KEY");
  const [serper, places] = await Promise.allSettled([
    hasSerper ? searchSerperLeads(query, maxResults) : null,
    hasGooglePlaces ? searchGooglePlacesLeads(String(payload?.placesQuery ?? query), Math.min(maxResults, 20)) : null,
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
    providerStatus: [
      leadProviderStatus("serper", hasSerper, serper),
      leadProviderStatus("google_places", hasGooglePlaces, places),
    ],
  };
}

function leadProviderStatus(source, configured, result) {
  if (!configured) return { source, status: "missing", message: `${source} is not configured.` };
  if (result.status === "fulfilled") {
    return { source, status: result.value ? "ready" : "missing", message: result.value ? `${source} responded.` : `${source} is not configured.` };
  }
  return {
    source,
    status: "failed",
    message: result.reason instanceof Error ? result.reason.message : String(result.reason),
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
  if (payload?.approved !== true && payload?.approval?.approved !== true) {
    throw new Error('arcigy.append_leads_to_google_sheet requires explicit approval. Send {"approval":{"approved":true}} after user confirmation.');
  }
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
  const brief = safeAiPromptPart(payload?.brief);
  if (!brief) throw new Error("Contract brief is required.");
  const response = await generateGeminiTextForContract({
    brief,
    baseIntake: payload?.baseIntake && typeof payload.baseIntake === "object" ? payload.baseIntake : {},
  });
  return parseJsonObject(response.text);
}

async function generateGeminiTextForContract(input) {
  const prompt = [
    "Create a filled Arcigy contract intake JSON object from this business brief.",
    "Keep Arcigy/provider details unchanged when present in the base intake.",
    "If a value is unknown, use [doplnit] so the operator can review it; final DOCX generation rejects unresolved placeholders.",
    "Return only valid JSON. Do not include markdown, comments, signatures, or legal advice.",
    "Never copy secrets, API keys, OAuth tokens, passwords, or database URLs into the JSON.",
    "The JSON must include client, contacts, project, pricing, dates, specialTerms, and additionalAttachments when useful.",
    "Base intake JSON:",
    safeAiJson(input.baseIntake ?? {}),
    "Business brief:",
    safeAiPromptPart(input.brief),
  ].join("\n");
  return generateGeminiText({
    prompt,
    model: "gemini-2.5-flash",
    temperature: 0.2,
    systemInstruction: "You are Arcigy Jarvis. Return only valid JSON for the Arcigy contract intake schema. Do not return secrets or legal advice.",
  });
}

async function generateGeminiText(input) {
  const apiKey = requireRuntimeEnv("GEMINI_API_KEY");
  const models = getGeminiModels(input);
  const maxRetries = getPositiveInteger(process.env.GEMINI_MAX_RETRIES, 2);
  const retryBaseMs = getPositiveInteger(process.env.GEMINI_RETRY_BASE_MS, 250);
  let attempts = 0;
  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts += 1;
      try {
        const text = await requestGeminiText(input, apiKey, model);
        return { model, text, attempts };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!isRetryableGeminiError(lastError) || attempt === maxRetries) break;
        await delay(retryBaseMs * 2 ** attempt);
      }
    }
  }

  throw lastError || new Error("Gemini request failed.");
}

async function requestGeminiText(input, apiKey, model) {
  const safePrompt = safeAiPromptPart(input.prompt);
  const safeSystemInstruction = withAiSafetySystemInstruction(input.systemInstruction);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: safeSystemInstruction
          ? {
              parts: [{ text: safeSystemInstruction }],
            }
          : undefined,
        contents: [{ role: "user", parts: [{ text: safePrompt }] }],
        generationConfig: { temperature: input.temperature ?? 0.35 },
      }),
    }
  );
  if (!response.ok) {
    const error = new Error(`Gemini request failed for ${model}: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return redactSensitiveText(text);
}

function getGeminiModels(input) {
  const primary = input.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
  return [primary, fallback].filter((model, index, models) => model && models.indexOf(model) === index);
}

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRetryableGeminiError(error) {
  return typeof error.status === "number" && [429, 500, 502, 503, 504].includes(error.status);
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

const aiSafetySystemRules = [
  "Follow Arcigy Jarvis AI safety rules.",
  "Keep every answer professional, family-friendly, respectful, and suitable for business use.",
  "Never reveal, repeat, transform, or infer API keys, OAuth tokens, bearer tokens, passwords, database URLs, or private credentials.",
  "If the input contains a secret, treat it as [redacted] and continue with the business task.",
  "Do not claim that an email, reply, contract, lead export, or write action has been sent or executed unless the operator explicitly approved that separate action.",
  "For contracts, provide structured business intake only; do not present legal advice or final legal conclusions.",
].join("\n");

function withAiSafetySystemInstruction(systemInstruction) {
  return [aiSafetySystemRules, systemInstruction].filter(Boolean).join("\n");
}

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/(postgres(?:ql)?|redis):\/\/([^:\s/@]+):([^@\s]+)@/gi, "$1://$2:[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-google-api-key]")
    .replace(/GOCSPX-[0-9A-Za-z_-]{10,}/g, "[redacted-google-client-secret]")
    .replace(/1\/\/[0-9A-Za-z_-]{20,}/g, "[redacted-google-refresh-token]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-hex-secret]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-provider-key]");
}

function safeAiPromptPart(value) {
  return redactSensitiveText(value).trim();
}

function safeAiJson(value) {
  return redactSensitiveText(JSON.stringify(value ?? {}, null, 2));
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
  if (payload?.approved !== true && payload?.approval?.approved !== true) {
    throw new Error('arcigy.generate_contract_documents requires explicit approval. Send {"approval":{"approved":true}} after user confirmation.');
  }
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
    throw pythonToolError(result.stderr || `Python command failed with status ${result.status}`);
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function pythonToolError(message) {
  return new Error(cleanPythonErrorMessage(message));
}

function cleanPythonErrorMessage(message) {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueError = [...lines].reverse().find((line) => /^(ValueError|FileNotFoundError|TypeError|Error):\s*/.test(line));
  if (valueError) return valueError.replace(/^(ValueError|FileNotFoundError|TypeError|Error):\s*/, "");
  return lines.at(-1) || String(message);
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
