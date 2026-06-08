const state = {
  mode: "idle",
  session: { state: "idle", wakeWord: "jarvis" },
  recognition: null,
  listening: false,
  lastLeads: [],
  lastPreparedReplies: [],
  operatorBriefingTimer: null,
  operatorBriefingPollMs: 300000,
  webBridgeTimer: null,
  webBridgePollMs: 120000,
  lastRemoteMcpPack: null,
  lastRemoteMcpSmoke: null,
  lastReadinessNoticeSignature: null,
  clientAlertWatchEnabled: true,
  clientAlertPollTimer: null,
  seenClientNeedAlertIds: new Set(),
  clientAlertPollMs: 60000,
  clientAlertGmailSyncPollMs: 300000,
  lastClientAlertGmailSyncAt: 0,
  lastClientAlertGmailSyncSummary: "Gmail auto-sync pending.",
};

const elements = {
  navButtons: [...document.querySelectorAll("nav button[data-target]")],
  statusBadge: document.querySelector("#statusBadge"),
  healthGrid: document.querySelector("#healthGrid"),
  readyIntegrations: document.querySelector("#readyIntegrations"),
  mcpToolCount: document.querySelector("#mcpToolCount"),
  approvalLockCount: document.querySelector("#approvalLockCount"),
  liveBlockerCount: document.querySelector("#liveBlockerCount"),
  commandTimeline: document.querySelector("#commandTimeline"),
  readinessReport: document.querySelector("#readinessReport"),
  operatorBriefing: document.querySelector("#operatorBriefing"),
  listenButton: document.querySelector("#listenButton"),
  transcript: document.querySelector("#transcript"),
  response: document.querySelector("#response"),
  orb: document.querySelector("#orb"),
  simulateWake: document.querySelector("#simulateWake"),
  submitTranscript: document.querySelector("#submitTranscript"),
  coldBrief: document.querySelector("#coldBrief"),
  preparedReplies: document.querySelector("#preparedReplies"),
  approvePreparedReply: document.querySelector("#approvePreparedReply"),
  preparedReplyResult: document.querySelector("#preparedReplyResult"),
  memoryEmail: document.querySelector("#memoryEmail"),
  memorySubject: document.querySelector("#memorySubject"),
  memoryMessage: document.querySelector("#memoryMessage"),
  identifyEmail: document.querySelector("#identifyEmail"),
  ingestClientMessage: document.querySelector("#ingestClientMessage"),
  clientNeedAlerts: document.querySelector("#clientNeedAlerts"),
  toggleClientNeedWatch: document.querySelector("#toggleClientNeedWatch"),
  memoryResult: document.querySelector("#memoryResult"),
  clientAlertsResult: document.querySelector("#clientAlertsResult"),
  clientAlertWatchStatus: document.querySelector("#clientAlertWatchStatus"),
  clientMessage: document.querySelector("#clientMessage"),
  draftReply: document.querySelector("#draftReply"),
  draftResult: document.querySelector("#draftResult"),
  runDiagnostics: document.querySelector("#runDiagnostics"),
  diagnosticsResult: document.querySelector("#diagnosticsResult"),
  gmailQuery: document.querySelector("#gmailQuery"),
  previewGmail: document.querySelector("#previewGmail"),
  syncGmail: document.querySelector("#syncGmail"),
  gmailResult: document.querySelector("#gmailResult"),
  smartleadCampaignId: document.querySelector("#smartleadCampaignId"),
  checkSmartlead: document.querySelector("#checkSmartlead"),
  smartleadBrief: document.querySelector("#smartleadBrief"),
  smartleadResult: document.querySelector("#smartleadResult"),
  checkWebBridge: document.querySelector("#checkWebBridge"),
  bridgeTunnelState: document.querySelector("#bridgeTunnelState"),
  bridgeAuthState: document.querySelector("#bridgeAuthState"),
  bridgeManifestState: document.querySelector("#bridgeManifestState"),
  bridgeToolState: document.querySelector("#bridgeToolState"),
  webBridgeResult: document.querySelector("#webBridgeResult"),
  handoffStatus: document.querySelector("#handoffStatus"),
  handoffManifestUrl: document.querySelector("#handoffManifestUrl"),
  handoffToolPattern: document.querySelector("#handoffToolPattern"),
  handoffTunnelCommand: document.querySelector("#handoffTunnelCommand"),
  handoffSmokeUrl: document.querySelector("#handoffSmokeUrl"),
  handoffApprovalTools: document.querySelector("#handoffApprovalTools"),
  handoffLocalWriteTools: document.querySelector("#handoffLocalWriteTools"),
  mcpToolListStatus: document.querySelector("#mcpToolListStatus"),
  mcpToolList: document.querySelector("#mcpToolList"),
  remoteAgentPrompt: document.querySelector("#remoteAgentPrompt"),
  copyRemotePack: document.querySelector("#copyRemotePack"),
  runRemoteSmoke: document.querySelector("#runRemoteSmoke"),
  remoteSmokeResult: document.querySelector("#remoteSmokeResult"),
  leadQuery: document.querySelector("#leadQuery"),
  discoverLeads: document.querySelector("#discoverLeads"),
  exportLeads: document.querySelector("#exportLeads"),
  leadResult: document.querySelector("#leadResult"),
  draftContractIntake: document.querySelector("#draftContractIntake"),
  contractBrief: document.querySelector("#contractBrief"),
  applyContractForm: document.querySelector("#applyContractForm"),
  contractBusinessName: document.querySelector("#contractBusinessName"),
  contractAddress: document.querySelector("#contractAddress"),
  contractCompanyId: document.querySelector("#contractCompanyId"),
  contractTaxId: document.querySelector("#contractTaxId"),
  contractRepresentativeName: document.querySelector("#contractRepresentativeName"),
  contractRepresentativeRole: document.querySelector("#contractRepresentativeRole"),
  contractEmail: document.querySelector("#contractEmail"),
  contractPhone: document.querySelector("#contractPhone"),
  contractProjectName: document.querySelector("#contractProjectName"),
  contractProjectGoal: document.querySelector("#contractProjectGoal"),
  contractImplementationFee: document.querySelector("#contractImplementationFee"),
  contractMonthlyFee: document.querySelector("#contractMonthlyFee"),
  contractTermMonths: document.querySelector("#contractTermMonths"),
  contractIntake: document.querySelector("#contractIntake"),
  generateContracts: document.querySelector("#generateContracts"),
  contractResult: document.querySelector("#contractResult"),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const webToken = resolveWebToken();
const arcigyApi = window.arcigyDesktop ?? {
  systemHealth: () => getJson("/api/system-health"),
  coldOutreachBrief: (payload) => postJson("/api/cold-outreach-brief", { ...payload, live: payload?.live ?? true }),
  jarvisVoiceEvent: (payload) => postJson("/api/jarvis/voice-event", payload),
  runDiagnostics: (payload) => postJson("/api/run-diagnostics", payload),
  productionReadiness: (payload) => postJson("/api/production-readiness", payload),
  operatorBriefing: (payload) => postJson("/api/operator-briefing", payload),
  getPreparedOutreachReplies: (payload) => postJson("/api/prepared-outreach-replies", payload),
  approvePreparedOutreachReply: (payload) => postJson("/api/approve-prepared-outreach-reply", payload),
  identifyEmail: (payload) => postJson("/api/identify-email", payload),
  ingestClientMessage: (payload) => postJson("/api/ingest-client-message", payload),
  getClientNeedAlerts: (payload) => postJson("/api/client-need-alerts", payload),
  generateAiReply: (payload) => postJson("/api/generate-ai-reply", payload),
  webBridgePreflight: () => getJson("/api/web-bridge-preflight"),
  remoteMcpPack: (payload) =>
    payload ? postJson("/api/mcp/arcigy.get_remote_mcp_pack", payload).then((value) => value.result) : getJson("/api/remote-mcp-pack?includeReadiness=false"),
  remoteMcpSmoke: (payload) =>
    payload ? postJson("/api/mcp/arcigy.run_remote_mcp_smoke", payload).then((value) => value.result) : getJson("/api/remote-mcp-smoke"),
  syncGmailRecentMessages: (payload) => postJson("/api/sync-gmail-recent-messages", payload),
  getSmartleadCampaignStatus: (payload) => postJson("/api/smartlead-campaign-status", payload),
  getSmartleadOutreachBrief: (payload) => postJson("/api/smartlead-outreach-brief", payload),
  discoverLeads: (payload) => postJson("/api/discover-leads", payload),
  appendLeadsToGoogleSheet: (payload) => postJson("/api/append-leads-to-google-sheet", payload),
  draftContractIntake: (payload) => postJson("/api/draft-contract-intake", payload),
  generateContracts: (payload) => postJson("/api/generate-contracts", payload),
};

function resolveWebToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    window.localStorage.setItem("arcigyJarvisToken", token);
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return window.localStorage.getItem("arcigyJarvisToken");
}

function setMode(mode) {
  state.mode = mode;
  elements.statusBadge.textContent = mode === "idle" ? "Idle" : mode === "awake" ? "Awake" : "Listening";
  elements.orb.dataset.mode = mode;
}

function setupNavigation() {
  const setActive = (targetId) => {
    for (const button of elements.navButtons) {
      button.classList.toggle("active", button.dataset.target === targetId);
    }
  };

  for (const button of elements.navButtons) {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(targetId);
    });
  }

  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    },
    { rootMargin: "-15% 0px -65% 0px", threshold: [0.2, 0.45, 0.7] }
  );
  for (const button of elements.navButtons) {
    const target = button.dataset.target ? document.getElementById(button.dataset.target) : null;
    if (target) observer.observe(target);
  }
}

function speak(text) {
  elements.response.textContent = text;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sk-SK";
    window.speechSynthesis.speak(utterance);
  }
}

function notifyOperator(title, body, tag = "arcigy-jarvis") {
  if (!("Notification" in window)) return;
  const show = () => {
    try {
      new Notification(title, { body, tag, renotify: true });
    } catch {
      return;
    }
  };
  if (Notification.permission === "granted") {
    show();
    return;
  }
  if (Notification.permission === "default") {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") show();
    });
  }
}

function renderHealth(health) {
  elements.healthGrid.innerHTML = "";
  for (const item of health.integrations ?? []) {
    const node = document.createElement("div");
    node.className = `health ${item.configured ? "ready" : "missing"}`;
    node.innerHTML = `<strong>${item.key}</strong><span>${item.configured ? "ready" : `missing ${item.missing.length}`}</span>`;
    elements.healthGrid.appendChild(node);
  }
}

function renderCommandDeck(health, bridge = null) {
  const integrations = health.integrations ?? [];
  const readyCount = integrations.filter((item) => item.configured).length;
  const blockers = integrations.filter((item) => !item.configured && item.requiredForProduction !== false);
  const advisories = integrations.filter((item) => !item.configured && item.requiredForProduction === false);
  const approvalTools = bridge?.riskyToolsRequiringApproval ?? [];
  elements.readyIntegrations.textContent = `${readyCount}/${integrations.length || "--"}`;
  elements.mcpToolCount.textContent = bridge?.mcpToolCount ? String(bridge.mcpToolCount) : "--";
  elements.approvalLockCount.textContent = bridge ? String(approvalTools.length) : "--";
  elements.liveBlockerCount.textContent = String(blockers.length);
  elements.commandTimeline.textContent = buildCommandTimeline(blockers, bridge, advisories);
}

function buildCommandTimeline(blockers, bridge, advisories = []) {
  const bridgeState = bridge ? (bridge.readyForTunnel ? "MCP bridge ready for tunnel." : "MCP bridge needs attention.") : "MCP bridge preflight not loaded.";
  if (!blockers.length) {
    const advisoryText = advisories.length ? ` Non-blocking advisory: ${advisories.map((item) => item.key).join(", ")}.` : "";
    return `All required integration gates are ready.${advisoryText} ${bridgeState}`;
  }
  const blockerText = blockers
    .map((item) => `${item.key}: ${(item.missing ?? []).join(", ")}`)
    .slice(0, 3)
    .join(" | ");
  return `${blockers.length} integration gate(s) need attention. ${blockerText}. ${bridgeState}`;
}

function renderReadinessReport(report) {
  const blockers = report.blockers ?? [];
  const attentionQueue = report.attentionQueue ?? [];
  return [
    report.summary ?? `Status: ${report.status}`,
    `Status: ${report.status}`,
    `Integrations: ${report.integrations?.ready ?? "--"}/${report.integrations?.total ?? "--"}`,
    `MCP tools: ${report.mcp?.toolCount ?? "--"}`,
    `Approval locks: ${(report.mcp?.approvalRequired ?? []).length}`,
    "",
    blockers.length ? "Blockers:" : "Blockers: none",
    ...blockers.map((blocker) => `- ${blocker.key}: ${blocker.message}`),
    "",
    attentionQueue.length ? "Attention queue:" : "Attention queue: clear",
    ...attentionQueue.map((item) =>
      [`- [${item.severity}] ${item.title}`, `  Source: ${item.source}`, `  Next: ${item.nextAction}`, `  Validate: ${item.validationCommand}`].join("\n")
    ),
    "",
    "Next actions:",
    ...(report.nextActions ?? []).map((action) => `- ${action}`),
    "",
    "Fix guide:",
    ...(report.fixGuide ?? []).map((step) =>
      [`- ${step.title}`, `  Env: ${(step.envKeys ?? []).join(", ") || "none"}`, `  Validate: ${step.validationCommand}`, `  ${step.detail}`].join("\n")
    ),
  ].join("\n");
}

function renderOperatorBriefing(briefing) {
  const sections = briefing.sections ?? {};
  return [
    briefing.summary ?? briefing.speechText ?? "Jarvis briefing is ready.",
    "",
    sections.readiness,
    sections.readinessAttention,
    sections.coldOutreach,
    sections.liveSync,
    sections.clientNeeds,
    sections.preparedReplies,
    sections.nextAction,
  ]
    .filter(Boolean)
    .join("\n");
}

function trackReadinessNoticeFromBriefing(briefing) {
  const readiness = briefing.sections?.readiness ?? "";
  const nextAction = briefing.sections?.nextAction ?? "";
  const status = readiness.match(/^Readiness:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? "";
  if (!["attention", "blocked"].includes(status)) {
    state.lastReadinessNoticeSignature = null;
    return;
  }
  const signature = `${status}:${readiness}:${nextAction}`;
  if (state.lastReadinessNoticeSignature === signature) return;
  state.lastReadinessNoticeSignature = signature;
  const title = status === "blocked" ? "Jarvis production blocker" : "Jarvis production attention";
  notifyOperator(title, `${readiness} ${nextAction}`.trim(), `arcigy-jarvis-readiness-${status}`);
}

async function refreshOperatorBriefing({ speakResult = false, loadingText = null, live = true } = {}) {
  if (loadingText) elements.commandTimeline.textContent = loadingText;
  const briefing = await arcigyApi.operatorBriefing({ periodLabel: "poslednych 7 dni", live });
  elements.commandTimeline.textContent = briefing.sections?.nextAction ?? briefing.summary;
  elements.response.textContent = renderOperatorBriefing(briefing);
  trackReadinessNoticeFromBriefing(briefing);
  if (speakResult) speak(briefing.speechText ?? briefing.summary);
  return briefing;
}

function startOperatorBriefingWatch() {
  if (state.operatorBriefingTimer) window.clearInterval(state.operatorBriefingTimer);
  void refreshOperatorBriefing().catch((error) => {
    elements.response.textContent = error instanceof Error ? error.message : String(error);
  });
  state.operatorBriefingTimer = window.setInterval(() => {
    void refreshOperatorBriefing().catch((error) => {
      elements.commandTimeline.textContent = error instanceof Error ? error.message : String(error);
    });
  }, state.operatorBriefingPollMs);
}

async function refreshHealth() {
  try {
    const health = await arcigyApi.systemHealth();
    renderHealth(health);
    renderCommandDeck(health);
    try {
      renderCommandDeck(health, await arcigyApi.webBridgePreflight());
    } catch {
      renderCommandDeck(health, null);
    }
  } catch (error) {
    elements.healthGrid.textContent = error instanceof Error ? error.message : String(error);
    elements.commandTimeline.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderLeadDiscovery(result) {
  const leads = result.leads ?? [];
  const sources = (result.sources ?? []).join(", ") || "none";
  const providerLines = (result.providerStatus ?? []).map((provider) => `${provider.source}: ${provider.status}${provider.message ? ` - ${provider.message}` : ""}`);
  if (!leads.length) {
    return [`No leads found. Sources checked: ${sources}.`, ...providerLines].join("\n");
  }
  return [
    `Found ${leads.length} leads. Sources: ${sources}.`,
    ...providerLines,
    "",
    ...leads.map((lead, index) =>
      [
        `${index + 1}. ${lead.name}`,
        lead.website ? `   Website: ${lead.website}` : null,
        lead.phone ? `   Phone: ${lead.phone}` : null,
        lead.address ? `   Address: ${lead.address}` : null,
        lead.source ? `   Source: ${lead.source}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

function leadsToSheetRows(leads) {
  return [
    ["Name", "Website", "Phone", "Address", "Source", "URL", "Exported At"],
    ...leads.map((lead) => [
      lead.name ?? "",
      lead.website ?? "",
      lead.phone ?? "",
      lead.address ?? "",
      lead.source ?? "",
      lead.url ?? "",
      new Date().toISOString(),
    ]),
  ];
}

function renderGmailSync(result) {
  const synced = result.synced ?? [];
  if (!synced.length) return "No Gmail accounts were synced.";
  const modeLine = result.dryRun ? "Preview only: wrote 0 local records." : "Local memory sync wrote new records and skipped duplicates.";
  return synced
    .map((item) =>
      [
        modeLine,
        `${item.account}: fetched ${item.fetched}, created ${item.created ?? item.ingested}, skipped ${item.duplicates ?? 0} duplicates`,
        ...(item.alerts ?? []).map((alert) => `Alert: ${alert}`),
        ...(item.preview ?? []).map((event) => `Preview: ${event.fromEmail} - ${event.subject ?? "no subject"}`),
      ].join("\n")
    )
    .join("\n\n");
}

function renderPreparedReplies(result) {
  const replies = result.replies ?? [];
  if (!replies.length) return result.summary ?? "No prepared replies are waiting for approval.";
  return [
    result.summary ?? `Prepared replies: ${replies.length}`,
    "",
    ...replies.slice(0, 8).map((reply, index) =>
      [
        `${index + 1}. ${reply.leadEmail}`,
        reply.campaignName ? `   Campaign: ${reply.campaignName}` : null,
        reply.subject ? `   Subject: ${reply.subject}` : null,
        reply.positiveSignal ? `   Signal: ${reply.positiveSignal}` : null,
        `   Reply: ${reply.replyText ?? "-"}`,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

function renderDiagnostics(result) {
  const checks = result.checks ?? [];
  return [
    `${result.live ? "Live" : "Configured"} diagnostics at ${result.checkedAt ?? "now"}`,
    "",
    ...checks.map((check) => `${check.status.toUpperCase()} ${check.key}: ${check.message}`),
  ].join("\n");
}

function renderIdentity(result) {
  if (!result.person) {
    return `No local identity match for ${result.email}.`;
  }
  const needs = result.openNeedSignals ?? [];
  return [
    `${result.person.displayName ?? result.person.companyName ?? result.person.primaryEmail}`,
    `Email: ${result.person.primaryEmail}`,
    `Kind: ${result.person.kind}`,
    `Match: ${result.reason} (${Math.round((result.confidence ?? 0) * 100)}%)`,
    needs.length ? `Open needs: ${needs.length}` : "Open needs: 0",
    ...needs.slice(0, 5).map((need) => `- ${need.summary}`),
  ].join("\n");
}

function renderIngestedMessage(result) {
  return [
    result.jarvisAlert ?? "Message saved. No new client request detected.",
    "",
    "Identity:",
    renderIdentity(result.identity),
  ].join("\n");
}

function renderClientNeedAlerts(result) {
  const alerts = result.alerts ?? [];
  if (!alerts.length) return result.summary ?? "No open client requests.";
  return [
    result.summary ?? `Open client requests: ${alerts.length}`,
    "",
    ...alerts.slice(0, 10).map((alert, index) => {
      const person = alert.person ?? {};
      const need = alert.needSignal ?? {};
      const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Unknown";
      return [`${index + 1}. ${name}`, `   Email: ${person.primaryEmail ?? "-"}`, `   Need: ${need.summary ?? "-"}`, `   Since: ${need.occurredAt ?? "-"}`].join("\n");
    }),
  ].join("\n");
}

function clientAlertKey(alert) {
  const person = alert.person ?? {};
  const need = alert.needSignal ?? {};
  return need.id ?? [person.primaryEmail, need.summary, need.occurredAt].filter(Boolean).join("|");
}

function notifyClientNeedAlert(alert, result) {
  const person = alert.person ?? {};
  const need = alert.needSignal ?? {};
  const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Client";
  const summary = need.summary ?? result.summary ?? "New client request detected.";
  const more = Number(result.count ?? 0) > 1 ? ` Open requests: ${result.count}.` : "";
  notifyOperator("Arcigy Jarvis: client request", `${name}: ${summary}${more}`.slice(0, 240), "arcigy-client-need");
}

async function refreshClientNeedAlerts({ announceNew = false, loadingText = null } = {}) {
  if (loadingText) elements.clientAlertsResult.textContent = loadingText;
  await maybeSyncGmailForClientAlerts();
  const result = await arcigyApi.getClientNeedAlerts({ limit: 10 });
  const alerts = result.alerts ?? [];
  const newAlerts = alerts.filter((alert) => {
    const key = clientAlertKey(alert);
    return key && !state.seenClientNeedAlertIds.has(key);
  });

  elements.clientAlertsResult.textContent = renderClientNeedAlerts(result);
  for (const alert of alerts) {
    const key = clientAlertKey(alert);
    if (key) state.seenClientNeedAlertIds.add(key);
  }

  elements.clientAlertWatchStatus.textContent = state.clientAlertWatchEnabled
    ? `Client alert watch active. Open requests: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`
    : `Client alert watch paused. Open requests: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`;

  if (announceNew && newAlerts.length) {
    notifyClientNeedAlert(newAlerts[0], result);
    speak(newAlerts[0].jarvisAlert ?? result.summary ?? "Jarvis: Mas novu klientsku poziadavku.");
  }
  return result;
}

async function maybeSyncGmailForClientAlerts({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - state.lastClientAlertGmailSyncAt < state.clientAlertGmailSyncPollMs) return;
  state.lastClientAlertGmailSyncAt = now;
  try {
    const result = await arcigyApi.syncGmailRecentMessages({
      query: "in:inbox newer_than:2d",
      maxResults: 3,
      dryRun: false,
    });
    const synced = result.synced ?? [];
    const fetched = synced.reduce((sum, item) => sum + Number(item.fetched ?? 0), 0);
    const created = synced.reduce((sum, item) => sum + Number(item.created ?? item.ingested ?? 0), 0);
    const duplicates = synced.reduce((sum, item) => sum + Number(item.duplicates ?? 0), 0);
    const alerts = synced.reduce((sum, item) => sum + (item.alerts ?? []).length, 0);
    state.lastClientAlertGmailSyncSummary = `Gmail auto-sync checked ${synced.length} account(s), fetched ${fetched}, created ${created}, skipped ${duplicates} duplicate(s), raised ${alerts} alert(s).`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.lastClientAlertGmailSyncSummary = `Gmail auto-sync unavailable: ${message}`;
  }
}

function startClientNeedWatch() {
  state.clientAlertWatchEnabled = true;
  elements.toggleClientNeedWatch.textContent = "Pause watch";
  if (state.clientAlertPollTimer) window.clearInterval(state.clientAlertPollTimer);
  void refreshClientNeedAlerts({ announceNew: false }).catch((error) => {
    elements.clientAlertWatchStatus.textContent = error instanceof Error ? error.message : String(error);
  });
  state.clientAlertPollTimer = window.setInterval(() => {
    if (!state.clientAlertWatchEnabled) return;
    void refreshClientNeedAlerts({ announceNew: true }).catch((error) => {
      elements.clientAlertWatchStatus.textContent = error instanceof Error ? error.message : String(error);
    });
  }, state.clientAlertPollMs);
}

function stopClientNeedWatch() {
  state.clientAlertWatchEnabled = false;
  if (state.clientAlertPollTimer) window.clearInterval(state.clientAlertPollTimer);
  state.clientAlertPollTimer = null;
  elements.toggleClientNeedWatch.textContent = "Resume watch";
  elements.clientAlertWatchStatus.textContent = "Client alert watch paused.";
}

function renderSmartleadStatus(result) {
  if (Array.isArray(result.campaigns)) {
    const campaigns = result.campaigns.slice(0, 8);
    return [
      `Campaigns: ${result.campaigns.length}`,
      "",
      ...campaigns.map((campaign) => `${campaign.id ?? "-"} - ${campaign.name ?? "unnamed"}${campaign.status ? ` (${campaign.status})` : ""}`),
    ].join("\n");
  }
  return JSON.stringify(result, null, 2);
}

function renderSmartleadBrief(result) {
  const metrics = result.metrics ?? {};
  const campaignLine = result.campaignCount > 1
    ? `${result.campaignCount} campaigns: ${(result.campaignIds ?? []).join(", ")}`
    : result.campaignId ?? "-";
  return [
    result.summary ?? "Smartlead brief is empty.",
    "",
    `Campaign: ${campaignLine}`,
    `Contacted: ${metrics.contacted ?? 0}`,
    `Opened: ${metrics.opened ?? 0} (${metrics.openRate ?? 0}%)`,
    `Replied: ${metrics.replied ?? 0} (${metrics.replyRate ?? 0}%)`,
    `Positive: ${metrics.positiveReplies ?? "not classified"}`,
    ...(result.notes?.length ? ["", ...result.notes.map((note) => `Note: ${note}`)] : []),
  ].join("\n");
}

function renderWebBridgePreflight(result) {
  return [
    `Tunnel ready: ${result.readyForTunnel ? "yes" : "no"}`,
    `Token configured: ${result.tokenConfigured ? "yes" : "no"}`,
    `Remote auth: ${result.authRequiredForExternalHosts ? "required" : "not required"}`,
    `Tunnel command: ${result.tunnelCommand ?? "npm run web:tunnel"}`,
    `Manifest URL: ${result.manifestUrl}`,
    `Tool call pattern: ${result.mcpToolCallPattern ?? `${result.origin ?? "http://127.0.0.1:8765"}/api/mcp/{toolName}`}`,
    `MCP tools: ${result.mcpToolCount}`,
    `Approval tools: ${(result.riskyToolsRequiringApproval ?? []).join(", ") || "none"}`,
    `Path policy: ${result.pathPolicy}`,
    ...(result.warnings?.length ? ["", ...result.warnings.map((warning) => `Warning: ${warning}`)] : []),
  ].join("\n");
}

function renderBridgeCockpit(result) {
  const warnings = result.warnings ?? [];
  elements.bridgeTunnelState.textContent = result.readyForTunnel ? "ready" : "locked";
  elements.bridgeAuthState.textContent = result.tokenConfigured ? "token set" : "needs token";
  elements.bridgeManifestState.textContent = result.manifestUrl ? "online" : "missing";
  elements.bridgeToolState.textContent = result.mcpToolCount ? `${result.mcpToolCount} tools` : "offline";
  elements.bridgeTunnelState.dataset.state = result.readyForTunnel ? "ready" : "attention";
  elements.bridgeAuthState.dataset.state = result.tokenConfigured ? "ready" : "attention";
  elements.bridgeManifestState.dataset.state = result.manifestUrl ? "ready" : "attention";
  elements.bridgeToolState.dataset.state = result.mcpToolCount ? "ready" : "attention";
  if (warnings.length) elements.bridgeTunnelState.dataset.state = "attention";
}

async function refreshWebBridge({ loadingText = null } = {}) {
  if (loadingText) elements.webBridgeResult.textContent = loadingText;
  const result = await arcigyApi.webBridgePreflight();
  renderBridgeCockpit(result);
  elements.webBridgeResult.textContent = renderWebBridgePreflight(result);
  const pack = await arcigyApi.remoteMcpPack({ includeReadiness: false });
  renderRemoteMcpPack(pack);
  const health = await arcigyApi.systemHealth();
  renderCommandDeck(health, result);
  return result;
}

function renderRemoteMcpPack(pack) {
  state.lastRemoteMcpPack = pack;
  const approvalTools = pack.tools?.approvalRequired ?? [];
  const localWriteTools = pack.tools?.localStateWrite ?? [];
  elements.handoffStatus.textContent = pack.auth?.tokenConfigured ? "armed" : "local only";
  elements.handoffStatus.dataset.state = pack.auth?.tokenConfigured ? "ready" : "attention";
  elements.handoffManifestUrl.textContent = pack.manifestUrl ?? "--";
  elements.handoffToolPattern.textContent = pack.mcpToolCallPattern ?? "--";
  elements.handoffTunnelCommand.textContent = pack.tunnel?.secureCommand ?? "npm run web:tunnel:secure";
  elements.handoffSmokeUrl.textContent = pack.smokeTestUrl ?? "--";
  elements.handoffApprovalTools.textContent = approvalTools.length ? `${approvalTools.length}: ${approvalTools.join(", ")}` : "none";
  elements.handoffLocalWriteTools.textContent = localWriteTools.length ? `${localWriteTools.length}: ${localWriteTools.join(", ")}` : "none";
  renderMcpToolList(pack);
  elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(pack);
}

function renderMcpToolList(pack) {
  const tools = pack.tools?.names ?? [];
  const approvalTools = new Set(pack.tools?.approvalRequired ?? []);
  const localWriteTools = new Set(pack.tools?.localStateWrite ?? []);
  const readOnlyTools = new Set(pack.tools?.readOnlyOrDraft ?? []);
  elements.mcpToolListStatus.textContent = tools.length ? `Live registry: ${tools.length} tools loaded.` : "No MCP tools loaded.";
  elements.mcpToolList.innerHTML = "";
  for (const name of tools) {
    const badges = [];
    if (approvalTools.has(name)) badges.push("approval");
    if (localWriteTools.has(name)) badges.push("local write");
    if (readOnlyTools.has(name)) badges.push("read-only/draft");
    const node = document.createElement("div");
    const toolName = document.createElement("code");
    const toolBadges = document.createElement("span");
    node.className = "toolRow";
    toolName.textContent = name;
    toolBadges.textContent = badges.join(" · ") || "standard";
    node.append(toolName, toolBadges);
    elements.mcpToolList.appendChild(node);
  }
}

function buildRemoteAgentPrompt(pack) {
  const approvalTools = pack.tools?.approvalRequired ?? [];
  const localWriteTools = pack.tools?.localStateWrite ?? [];
  const quickStart = (pack.quickStartCalls ?? [])
    .map((call) => `- ${call.label}: ${call.tool} ${JSON.stringify(call.body)}`)
    .join("\n");
  return [
    "Arcigy Jarvis remote MCP connection pack",
    `Manifest: ${pack.manifestUrl}`,
    `Tool call pattern: ${pack.mcpToolCallPattern}`,
    `Auth header: ${pack.auth?.header ?? "Authorization: Bearer <JARVIS_WEB_TOKEN>"}`,
    `Tools: ${pack.tools?.count ?? 0}`,
    `Approval required: ${approvalTools.join(", ") || "none"}`,
    `Local memory writes: ${localWriteTools.join(", ") || "none"}`,
    `Secure tunnel: ${pack.tunnel?.secureCommand ?? "npm run web:tunnel:secure"}`,
    `Smoke test: ${pack.smokeTestUrl ?? "--"}`,
    "Rule: never call approval-required tools without explicit operator confirmation.",
    "Rule: treat local memory write tools as persistent local state changes; preview Gmail with dryRun: true first.",
    "Start with arcigy.get_operator_briefing, then use read-only tools before proposing any write action.",
    quickStart ? `Quick-start calls:\n${quickStart}` : "",
  ].join("\n");
}

function renderRemoteMcpSmoke(report) {
  state.lastRemoteMcpSmoke = report;
  elements.remoteSmokeResult.dataset.state = report.status === "ready" ? "ready" : "attention";
  elements.remoteSmokeResult.textContent = [
    report.summary ?? `Remote MCP smoke: ${report.status}`,
    "",
    ...(report.checks ?? []).map((check) => `${check.status.toUpperCase()} ${check.key}: ${check.message}`),
  ].join("\n");
}

async function copyRemotePack() {
  if (!state.lastRemoteMcpPack) {
    elements.remoteAgentPrompt.textContent = "Load the web bridge first.";
    return;
  }
  const payload = [
    buildRemoteAgentPrompt(state.lastRemoteMcpPack),
    "",
    JSON.stringify(
      {
        connectionPack: state.lastRemoteMcpPack,
        smokeTest: state.lastRemoteMcpSmoke,
      },
      null,
      2
    ),
  ].join("\n");
  await writeClipboardText(payload);
  elements.copyRemotePack.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyRemotePack.textContent = "Copy pack";
  }, 1400);
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed. Select and copy the remote pack manually.");
}

function startWebBridgeWatch() {
  if (state.webBridgeTimer) window.clearInterval(state.webBridgeTimer);
  void refreshWebBridge().catch((error) => {
    elements.webBridgeResult.textContent = error instanceof Error ? error.message : String(error);
  });
  state.webBridgeTimer = window.setInterval(() => {
    void refreshWebBridge().catch((error) => {
      elements.webBridgeResult.textContent = error instanceof Error ? error.message : String(error);
    });
  }, state.webBridgePollMs);
}

async function getJson(url) {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value?.error || `Request failed: ${response.status}`);
  return value;
}

function authHeaders() {
  return webToken ? { authorization: `Bearer ${webToken}` } : {};
}

function sampleContractIntake() {
  return {
    client: {
      businessName: "Test Klient s. r. o.",
      registeredAddress: "Testovacia 1, 811 01 Bratislava",
      companyId: "12345678",
      taxId: "SK1234567890",
      registration: "Obchodný register príslušného súdu, oddiel: Sro, vložka č. 12345/B",
      representativeName: "Meno Klienta",
      representativeRole: "konateľ",
      email: "klient@example.com",
      phone: "+421 900 000 000",
    },
    contacts: {
      clientAuthorizedContact: "Meno Klienta, konateľ, klient@example.com, +421 900 000 000",
      arcigyAuthorizedContact: "Branislav Laubert, Co-Founder & CEO, branislav@arcigy.group, +421 951 268 376",
    },
    project: {
      name: "Klientsky automatizačný portál",
      goal: "Sprístupniť klientovi individuálny portál na spracovanie leadov, interných úloh a automatizovaných výstupov.",
      includedUserAccounts: 2,
      feedbackRounds: 5,
      includedModules: [
        {
          name: "Lead intake",
          purpose: "Zber a vyhodnotenie nových leadov",
          inputs: "email, meno, zdroj, stav",
          outputs: "interná notifikácia, záznam leadu",
          outOfScope: "platené reklamné kampane",
        },
      ],
      outputs: ["PDF report", "CSV export", "interná notifikácia"],
      aiFeatures: ["AI asistované vyplnenie formulárov", "AI sumarizácia komunikácie"],
      acceptanceCriteria: ["Klient vie vytvoriť nový záznam", "Aplikácia vytvorí dohodnutý výstup"],
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
  };
}

function fillContractForm(intake) {
  elements.contractBusinessName.value = intake.client.businessName ?? "";
  elements.contractAddress.value = intake.client.registeredAddress ?? "";
  elements.contractCompanyId.value = intake.client.companyId ?? "";
  elements.contractTaxId.value = intake.client.taxId ?? "";
  elements.contractRepresentativeName.value = intake.client.representativeName ?? "";
  elements.contractRepresentativeRole.value = intake.client.representativeRole ?? "";
  elements.contractEmail.value = intake.client.email ?? "";
  elements.contractPhone.value = intake.client.phone ?? "";
  elements.contractProjectName.value = intake.project.name ?? "";
  elements.contractProjectGoal.value = intake.project.goal ?? "";
  elements.contractImplementationFee.value = String(intake.pricing.implementationFeeEur ?? "");
  elements.contractMonthlyFee.value = String(intake.pricing.monthlyFeeEur ?? "");
  elements.contractTermMonths.value = String(intake.pricing.initialTermMonths ?? "");
}

function buildContractIntakeFromForm() {
  const current = safeParseContractIntake();
  const representative = elements.contractRepresentativeName.value.trim();
  const role = elements.contractRepresentativeRole.value.trim();
  const email = elements.contractEmail.value.trim();
  const phone = elements.contractPhone.value.trim();
  const clientContact = [representative, role, email, phone].filter(Boolean).join(", ");
  return {
    ...current,
    client: {
      ...current.client,
      businessName: elements.contractBusinessName.value.trim(),
      registeredAddress: elements.contractAddress.value.trim(),
      companyId: elements.contractCompanyId.value.trim(),
      taxId: elements.contractTaxId.value.trim(),
      representativeName: representative,
      representativeRole: role,
      email,
      phone,
    },
    contacts: {
      ...current.contacts,
      clientAuthorizedContact: clientContact,
      arcigyAuthorizedContact:
        current.contacts?.arcigyAuthorizedContact ?? "Branislav Laubert, Co-Founder & CEO, branislav@arcigy.group, +421 951 268 376",
    },
    project: {
      ...current.project,
      name: elements.contractProjectName.value.trim(),
      goal: elements.contractProjectGoal.value.trim(),
    },
    pricing: {
      ...current.pricing,
      implementationFeeEur: numberFromInput(elements.contractImplementationFee.value),
      monthlyFeeEur: numberFromInput(elements.contractMonthlyFee.value),
      initialTermMonths: numberFromInput(elements.contractTermMonths.value),
    },
  };
}

function safeParseContractIntake() {
  try {
    return JSON.parse(elements.contractIntake.value || "{}");
  } catch {
    return sampleContractIntake();
  }
}

function numberFromInput(value) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function handleTranscript(text) {
  const trimmed = text.trim();
  elements.transcript.value = trimmed;

  const result = await arcigyApi.jarvisVoiceEvent({
    session: state.session,
    text: trimmed,
    live: true,
  });

  state.session = result.session;
  setMode(result.session.state);
  if (result.speakText) {
    speak(result.speakText);
  }
}

function startRecognition() {
  if (!SpeechRecognition) {
    speak("Hlasové rozpoznávanie nie je v tomto runtime dostupné. Použi textové pole alebo pripoj natívny speech bridge.");
    return;
  }

  if (state.recognition) {
    state.recognition.stop();
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "sk-SK";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const latest = event.results[event.results.length - 1];
    const text = latest?.[0]?.transcript ?? "";
    if (text) void handleTranscript(text);
  };
  recognition.onend = () => {
    if (state.listening) recognition.start();
  };
  recognition.onerror = () => {
    setMode("idle");
  };

  state.recognition = recognition;
  state.listening = true;
  recognition.start();
  setMode("listening");
  elements.listenButton.textContent = "Disable";
}

function stopRecognition() {
  state.listening = false;
  state.recognition?.stop();
  setMode("idle");
  elements.listenButton.textContent = "Enable";
}

elements.listenButton.addEventListener("click", () => {
  if (state.listening) stopRecognition();
  else startRecognition();
});

elements.simulateWake.addEventListener("click", () => void handleTranscript("Jarvis"));
elements.submitTranscript.addEventListener("click", () => void handleTranscript(elements.transcript.value));
elements.coldBrief.addEventListener("click", async () => {
  speak(await arcigyApi.coldOutreachBrief({ text: "cold outreach za poslednych 7 dni" }));
});
elements.preparedReplies.addEventListener("click", async () => {
  try {
    elements.preparedReplyResult.textContent = "Loading prepared replies...";
    const result = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = result.replies ?? [];
    elements.preparedReplyResult.textContent = renderPreparedReplies(result);
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    state.lastPreparedReplies = [];
    elements.preparedReplyResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.approvePreparedReply.addEventListener("click", async () => {
  try {
    if (!state.lastPreparedReplies.length) {
      elements.preparedReplyResult.textContent = "Load prepared replies before approving.";
      return;
    }
    const first = state.lastPreparedReplies[0];
    const approved = window.confirm(`Approve prepared reply to ${first.leadEmail}${first.subject ? ` about ${first.subject}` : ""}?`);
    if (!approved) {
      elements.preparedReplyResult.textContent = "Prepared reply approval cancelled before any write.";
      return;
    }
    const result = await arcigyApi.approvePreparedOutreachReply({
      preparedEventId: first.id,
      approved: true,
      approvedBy: "operator",
    });
    elements.preparedReplyResult.textContent = result.summary;
    speak(result.summary);
    const refreshed = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = refreshed.replies ?? [];
  } catch (error) {
    elements.preparedReplyResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.identifyEmail.addEventListener("click", async () => {
  try {
    elements.memoryResult.textContent = "Identifying...";
    const result = await arcigyApi.identifyEmail({ email: elements.memoryEmail.value });
    elements.memoryResult.textContent = renderIdentity(result);
  } catch (error) {
    elements.memoryResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.ingestClientMessage.addEventListener("click", async () => {
  try {
    elements.memoryResult.textContent = "Saving message...";
    const result = await arcigyApi.ingestClientMessage({
      email: elements.memoryEmail.value,
      subject: elements.memorySubject.value,
      text: elements.memoryMessage.value,
    });
    elements.memoryResult.textContent = renderIngestedMessage(result);
    if (result.jarvisAlert) speak(result.jarvisAlert);
    await refreshClientNeedAlerts({ announceNew: false });
  } catch (error) {
    elements.memoryResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.clientNeedAlerts.addEventListener("click", async () => {
  try {
    await maybeSyncGmailForClientAlerts({ force: true });
    const result = await refreshClientNeedAlerts({ announceNew: false, loadingText: "Loading client alerts..." });
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    elements.clientAlertsResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.toggleClientNeedWatch.addEventListener("click", () => {
  if (state.clientAlertWatchEnabled) stopClientNeedWatch();
  else startClientNeedWatch();
});
elements.draftReply.addEventListener("click", async () => {
  try {
    elements.draftResult.textContent = "Drafting...";
    const result = await arcigyApi.generateAiReply({
      message: elements.clientMessage.value,
      context: "Client communication inside Arcigy Jarvis.",
    });
    elements.draftResult.textContent = result.text;
    speak(result.text);
  } catch (error) {
    elements.draftResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.runDiagnostics.addEventListener("click", async () => {
  try {
    elements.diagnosticsResult.textContent = "Running live diagnostics...";
    const result = await arcigyApi.runDiagnostics({ live: true });
    elements.diagnosticsResult.textContent = renderDiagnostics(result);
  } catch (error) {
    elements.diagnosticsResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.previewGmail.addEventListener("click", async () => {
  try {
    elements.gmailResult.textContent = "Previewing Gmail without writing local records...";
    const result = await arcigyApi.syncGmailRecentMessages({
      query: elements.gmailQuery.value,
      maxResults: 5,
      dryRun: true,
    });
    elements.gmailResult.textContent = renderGmailSync(result);
  } catch (error) {
    elements.gmailResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.syncGmail.addEventListener("click", async () => {
  try {
    elements.gmailResult.textContent = "Syncing Gmail...";
    const result = await arcigyApi.syncGmailRecentMessages({
      query: elements.gmailQuery.value,
      maxResults: 5,
      dryRun: false,
    });
    elements.gmailResult.textContent = renderGmailSync(result);
  } catch (error) {
    elements.gmailResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.checkSmartlead.addEventListener("click", async () => {
  try {
    elements.smartleadResult.textContent = "Checking Smartlead...";
    const result = await arcigyApi.getSmartleadCampaignStatus({
      campaignId: elements.smartleadCampaignId.value,
    });
    elements.smartleadResult.textContent = renderSmartleadStatus(result);
  } catch (error) {
    elements.smartleadResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.smartleadBrief.addEventListener("click", async () => {
  try {
    const campaignId = elements.smartleadCampaignId.value.trim();
    elements.smartleadResult.textContent = campaignId ? "Building Smartlead Jarvis brief..." : "Building Smartlead Jarvis brief across campaigns...";
    const result = await arcigyApi.getSmartleadOutreachBrief({
      campaignId,
      periodLabel: "poslednych 7 dni",
      maxCampaigns: 10,
    });
    elements.smartleadResult.textContent = renderSmartleadBrief(result);
    speak(result.summary);
  } catch (error) {
    elements.smartleadResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.checkWebBridge.addEventListener("click", async () => {
  try {
    await refreshWebBridge({ loadingText: "Checking web bridge..." });
  } catch (error) {
    elements.webBridgeResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.copyRemotePack.addEventListener("click", async () => {
  try {
    await copyRemotePack();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.runRemoteSmoke.addEventListener("click", async () => {
  try {
    elements.remoteSmokeResult.textContent = "Running remote MCP smoke test...";
    const report = await arcigyApi.remoteMcpSmoke({ baseUrl: state.lastRemoteMcpPack?.baseUrl });
    renderRemoteMcpSmoke(report);
  } catch (error) {
    elements.remoteSmokeResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.readinessReport.addEventListener("click", async () => {
  try {
    elements.commandTimeline.textContent = "Building live production readiness report...";
    const report = await arcigyApi.productionReadiness({ live: true });
    elements.commandTimeline.textContent = report.summary;
    elements.response.textContent = renderReadinessReport(report);
  } catch (error) {
    elements.commandTimeline.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.operatorBriefing.addEventListener("click", async () => {
  try {
    await refreshOperatorBriefing({ speakResult: true, loadingText: "Building live operator briefing...", live: true });
  } catch (error) {
    elements.commandTimeline.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.discoverLeads.addEventListener("click", async () => {
  try {
    elements.leadResult.textContent = "Searching...";
    const result = await arcigyApi.discoverLeads({
      query: elements.leadQuery.value,
      maxResults: 8,
    });
    state.lastLeads = result.leads ?? [];
    elements.leadResult.textContent = renderLeadDiscovery(result);
  } catch (error) {
    state.lastLeads = [];
    elements.leadResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.exportLeads.addEventListener("click", async () => {
  try {
    if (!state.lastLeads.length) {
      elements.leadResult.textContent = "Search leads before exporting.";
      return;
    }
    const approved = window.confirm(`Export ${state.lastLeads.length} lead(s) to Google Sheets?`);
    if (!approved) {
      elements.leadResult.textContent = "Google Sheets export cancelled before any write.";
      return;
    }
    elements.leadResult.textContent = "Exporting leads to Google Sheets...";
    const result = await arcigyApi.appendLeadsToGoogleSheet({
      approval: { approved: true },
      range: "Leads!A1",
      rows: leadsToSheetRows(state.lastLeads),
    });
    elements.leadResult.textContent = `Exported ${state.lastLeads.length} leads to Google Sheets.\n${JSON.stringify(result, null, 2)}`;
  } catch (error) {
    elements.leadResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.draftContractIntake.addEventListener("click", async () => {
  try {
    elements.contractResult.textContent = "Drafting contract intake with Gemini...";
    const baseIntake = safeParseContractIntake();
    const intake = await arcigyApi.draftContractIntake({
      brief: elements.contractBrief.value,
      baseIntake,
    });
    fillContractForm(intake);
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    elements.contractResult.textContent = "AI contract intake draft applied. Review it before generating DOCX files.";
  } catch (error) {
    elements.contractResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.applyContractForm.addEventListener("click", () => {
  try {
    const intake = buildContractIntakeFromForm();
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    elements.contractResult.textContent = "Contract form applied to intake JSON.";
  } catch (error) {
    elements.contractResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.generateContracts.addEventListener("click", async () => {
  try {
    const intake = JSON.parse(elements.contractIntake.value);
    const clientName = intake.client?.businessName ?? "selected client";
    const projectName = intake.project?.name ?? "selected project";
    const approved = window.confirm(`Generate contract DOCX files for ${clientName} / ${projectName}?`);
    if (!approved) {
      elements.contractResult.textContent = "Contract generation cancelled before any files were written.";
      return;
    }
    elements.contractResult.textContent = "Generating...";
    const result = await arcigyApi.generateContracts({ intake, approval: { approved: true } });
    elements.contractResult.textContent = [
      `Generated ${result.generatedFiles.length} files.`,
      `Manifest: ${result.manifestPath}`,
      ...result.generatedFiles,
    ].join("\n");
  } catch (error) {
    elements.contractResult.textContent = error instanceof Error ? error.message : String(error);
  }
});

const initialContractIntake = sampleContractIntake();
setupNavigation();
fillContractForm(initialContractIntake);
elements.contractIntake.value = JSON.stringify(initialContractIntake, null, 2);
elements.contractBrief.value =
  "Klient Test Klient s. r. o. chce klientsky automatizacny portal na spracovanie leadov, internych uloh a reportov. Implementacia 2000 EUR, mesacne 200 EUR, trvanie 6 mesiacov.";
elements.memoryEmail.value = "client@example.com";
elements.memorySubject.value = "Onboarding automatizacia";
elements.memoryMessage.value = "Potrebujem upravit onboarding automatizaciu do piatku.";
elements.clientMessage.value = "Potrebujem upravit onboarding automatizaciu do piatku.";
elements.gmailQuery.value = "in:inbox newer_than:7d";
elements.leadQuery.value = "automation agency Bratislava";
void refreshHealth();
startWebBridgeWatch();
startOperatorBriefingWatch();
startClientNeedWatch();
setMode("idle");
