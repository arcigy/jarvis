const state = {
  mode: "idle",
  session: { state: "idle", wakeWord: "jarvis" },
  recognition: null,
  listening: false,
  lastLeads: [],
  lastPreparedReplies: [],
  lastApprovedPreparedReply: null,
  operatorBriefingTimer: null,
  operatorBriefingPollMs: 300000,
  webBridgeTimer: null,
  webBridgePollMs: 120000,
  lastRemoteMcpPack: null,
  lastRemoteMcpSmoke: null,
  lastReadinessNoticeSignature: null,
  clientAlertWatchEnabled: true,
  clientAlertPollTimer: null,
  lastClientNeedAlerts: [],
  seenClientNeedAlertIds: new Set(),
  clientAlertPollMs: 60000,
  clientAlertGmailSyncPollMs: 300000,
  lastClientAlertGmailSyncAt: 0,
  lastClientAlertGmailSyncSummary: "Gmail auto-sync pending.",
  contractFormDirty: false,
  secureTunnelLogPath: null,
  lastSecureTunnelStatus: null,
};

const requiredRemoteSmokeGates = [
  "action-manifest",
  "openapi-schema",
  "cors-preflight",
  "external-auth-gate",
  "pack-auth-throttle-policy",
  "pack-limits",
  "pack-agent-setup-profiles",
  "pack-voice-quick-start",
  "voice-tool-call",
  "pack-production-evidence-quick-start",
  "production-evidence-tool-call",
  "approval-gate",
  "approval-shape-gate",
  "secret-redaction",
];

const elements = {
  navButtons: [...document.querySelectorAll("nav button[data-target]")],
  cortexNodes: [...document.querySelectorAll(".cortexNode[data-target]")],
  statusBadge: document.querySelector("#statusBadge"),
  healthGrid: document.querySelector("#healthGrid"),
  missionReadiness: document.querySelector("#missionReadiness"),
  missionVoice: document.querySelector("#missionVoice"),
  missionGmail: document.querySelector("#missionGmail"),
  missionRemote: document.querySelector("#missionRemote"),
  missionContracts: document.querySelector("#missionContracts"),
  cortexVoice: document.querySelector("#cortexVoice"),
  cortexOutreach: document.querySelector("#cortexOutreach"),
  cortexMemory: document.querySelector("#cortexMemory"),
  cortexContracts: document.querySelector("#cortexContracts"),
  cortexRemote: document.querySelector("#cortexRemote"),
  readyIntegrations: document.querySelector("#readyIntegrations"),
  mcpToolCount: document.querySelector("#mcpToolCount"),
  approvalLockCount: document.querySelector("#approvalLockCount"),
  liveBlockerCount: document.querySelector("#liveBlockerCount"),
  commandTimeline: document.querySelector("#commandTimeline"),
  briefingGrid: document.querySelector("#briefingGrid"),
  launchQueue: document.querySelector("#launchQueue"),
  launchStatus: document.querySelector("#launchStatus"),
  launchNextAction: document.querySelector("#launchNextAction"),
  launchAttention: document.querySelector("#launchAttention"),
  verificationEvidence: document.querySelector("#verificationEvidence"),
  launchChecklist: document.querySelector("#launchChecklist"),
  readinessReport: document.querySelector("#readinessReport"),
  operatorBriefing: document.querySelector("#operatorBriefing"),
  listenButton: document.querySelector("#listenButton"),
  voiceRuntime: document.querySelector("#voiceRuntime"),
  voiceMode: document.querySelector("#voiceMode"),
  voiceInput: document.querySelector("#voiceInput"),
  voiceOutput: document.querySelector("#voiceOutput"),
  voiceLastEvent: document.querySelector("#voiceLastEvent"),
  transcript: document.querySelector("#transcript"),
  response: document.querySelector("#response"),
  orb: document.querySelector("#orb"),
  simulateWake: document.querySelector("#simulateWake"),
  submitTranscript: document.querySelector("#submitTranscript"),
  coldBrief: document.querySelector("#coldBrief"),
  approvalQueue: document.querySelector("#approvalQueue"),
  preparedReplies: document.querySelector("#preparedReplies"),
  preparePositiveReply: document.querySelector("#preparePositiveReply"),
  approvePreparedReply: document.querySelector("#approvePreparedReply"),
  sendApprovedReply: document.querySelector("#sendApprovedReply"),
  positiveLeadEmail: document.querySelector("#positiveLeadEmail"),
  positiveReplySubject: document.querySelector("#positiveReplySubject"),
  positiveSignal: document.querySelector("#positiveSignal"),
  preparedReplyResult: document.querySelector("#preparedReplyResult"),
  memoryEmail: document.querySelector("#memoryEmail"),
  memorySubject: document.querySelector("#memorySubject"),
  memoryMessage: document.querySelector("#memoryMessage"),
  identifyEmail: document.querySelector("#identifyEmail"),
  ingestClientMessage: document.querySelector("#ingestClientMessage"),
  clientNeedAlerts: document.querySelector("#clientNeedAlerts"),
  resolveClientNeed: document.querySelector("#resolveClientNeed"),
  ignoreClientNeed: document.querySelector("#ignoreClientNeed"),
  toggleClientNeedWatch: document.querySelector("#toggleClientNeedWatch"),
  memoryResult: document.querySelector("#memoryResult"),
  clientAlertGrid: document.querySelector("#clientAlertGrid"),
  clientAlertsResult: document.querySelector("#clientAlertsResult"),
  clientAlertWatchStatus: document.querySelector("#clientAlertWatchStatus"),
  clientMessage: document.querySelector("#clientMessage"),
  draftReply: document.querySelector("#draftReply"),
  draftResult: document.querySelector("#draftResult"),
  runDiagnostics: document.querySelector("#runDiagnostics"),
  diagnosticsGrid: document.querySelector("#diagnosticsGrid"),
  diagnosticsResult: document.querySelector("#diagnosticsResult"),
  auditEvents: document.querySelector("#auditEvents"),
  localMemorySnapshot: document.querySelector("#localMemorySnapshot"),
  exportLocalMemorySnapshot: document.querySelector("#exportLocalMemorySnapshot"),
  auditResult: document.querySelector("#auditResult"),
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
  handoffProofGates: document.querySelector("#handoffProofGates"),
  agentSetupProfiles: document.querySelector("#agentSetupProfiles"),
  mcpToolListStatus: document.querySelector("#mcpToolListStatus"),
  mcpToolList: document.querySelector("#mcpToolList"),
  remoteAgentPrompt: document.querySelector("#remoteAgentPrompt"),
  startSecureTunnel: document.querySelector("#startSecureTunnel"),
  stopSecureTunnel: document.querySelector("#stopSecureTunnel"),
  checkTunnelStatus: document.querySelector("#checkTunnelStatus"),
  openTunnelLog: document.querySelector("#openTunnelLog"),
  copyTunnelCommand: document.querySelector("#copyTunnelCommand"),
  copyClaudePrompt: document.querySelector("#copyClaudePrompt"),
  copyChatGptPrompt: document.querySelector("#copyChatGptPrompt"),
  copyGrokPrompt: document.querySelector("#copyGrokPrompt"),
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
const speechOutputAvailable = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const webToken = resolveWebToken();
const arcigyApi = window.arcigyDesktop ?? {
  openPath: async () => "desktop-only",
  systemHealth: () => getJson("/api/system-health"),
  coldOutreachBrief: (payload) => postJson("/api/cold-outreach-brief", { ...payload, live: payload?.live ?? true }),
  jarvisVoiceEvent: (payload) => postJson("/api/jarvis/voice-event", payload),
  runDiagnostics: (payload) => postJson("/api/run-diagnostics", payload),
  productionReadiness: (payload) => postJson("/api/production-readiness", payload),
  productionVerificationEvidence: () => getJson("/api/production-verification-evidence"),
  notifyOperator: async () => ({ delivered: false }),
  operatorBriefing: (payload) => postJson("/api/operator-briefing", payload),
  startSecureTunnel: () => postJson("/api/start-secure-tunnel", {}),
  stopSecureTunnel: () => postJson("/api/stop-secure-tunnel", {}),
  getSecureTunnelStatus: () => getJson("/api/secure-tunnel-status"),
  getPreparedOutreachReplies: (payload) => postJson("/api/prepared-outreach-replies", payload),
  getApprovalQueue: (payload) => postJson("/api/approval-queue", payload),
  preparePositiveOutreachReply: (payload) => postJson("/api/mcp/arcigy.prepare_positive_outreach_reply", payload).then((value) => value.result),
  approvePreparedOutreachReply: (payload) => postJson("/api/approve-prepared-outreach-reply", payload),
  sendApprovedOutreachReply: (payload) => postJson("/api/mcp/arcigy.send_approved_outreach_reply", payload).then((value) => value.result),
  identifyEmail: (payload) => postJson("/api/identify-email", payload),
  ingestClientMessage: (payload) => postJson("/api/ingest-client-message", payload),
  getClientNeedAlerts: (payload) => postJson("/api/client-need-alerts", payload),
  updateClientNeedStatus: (payload) => postJson("/api/update-client-need-status", payload),
  getAuditEvents: (payload) => postJson("/api/audit-events", payload),
  getLocalMemorySnapshot: (payload) => postJson("/api/local-memory-snapshot", payload),
  exportLocalMemorySnapshot: (payload) => postJson("/api/export-local-memory-snapshot", payload),
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
    writeSessionWebToken(token);
    clearPersistentWebToken();
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  clearPersistentWebToken();
  return readSessionWebToken();
}

function writeSessionWebToken(token) {
  try {
    window.sessionStorage.setItem("arcigyJarvisToken", token);
  } catch {
    return;
  }
}

function readSessionWebToken() {
  try {
    return window.sessionStorage.getItem("arcigyJarvisToken");
  } catch {
    return null;
  }
}

function clearPersistentWebToken() {
  try {
    window.localStorage.removeItem("arcigyJarvisToken");
  } catch {
    return;
  }
}

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/(postgres(?:ql)?|redis):\/\/([^:\s/@]+):([^@\s]+)@/gi, "$1://$2:[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-google-api-key]")
    .replace(/GOCSPX-[0-9A-Za-z_-]{10,}/g, "[redacted-google-client-secret]")
    .replace(/1\/\/[0-9A-Za-z_-]{20,}/g, "[redacted-google-refresh-token]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-provider-key]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-hex-secret]");
}

function safeUiErrorText(error) {
  return redactSensitiveText(error instanceof Error ? error.message : String(error));
}

function requiredInputValue(element, message) {
  const value = String(element?.value ?? "").trim();
  if (!value) throw new Error(message);
  return value;
}

function setMode(mode) {
  state.mode = mode;
  elements.statusBadge.textContent = mode === "idle" ? "Idle" : mode === "awake" ? "Awake" : "Listening";
  elements.orb.dataset.mode = mode;
  setMissionSignal(elements.missionVoice, mode === "idle" ? "idle" : mode, mode === "idle" ? "ready" : "attention");
  setCortexSignal(elements.cortexVoice, mode === "idle" ? "standing by" : mode, mode === "idle" ? "ready" : "attention");
  updateVoiceRuntimeStatus();
}

function updateVoiceRuntimeStatus(eventText) {
  const inputReady = Boolean(SpeechRecognition);
  const runtimeState = state.listening || state.mode === "awake" || state.mode === "processing" ? "attention" : "ready";
  elements.voiceRuntime.dataset.state = runtimeState;
  elements.voiceMode.textContent = state.listening ? "listening" : state.mode;
  elements.voiceInput.textContent = inputReady ? "microphone ready" : "text fallback";
  elements.voiceOutput.textContent = speechOutputAvailable ? "speech ready" : "screen only";
  if (eventText) elements.voiceLastEvent.textContent = redactSensitiveText(eventText).replace(/\s+/g, " ").trim().slice(0, 96);
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

  for (const node of elements.cortexNodes) {
    const activate = () => {
      const target = node.dataset.target ? document.getElementById(node.dataset.target) : null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    node.addEventListener("click", activate);
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
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
  if (speechOutputAvailable) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sk-SK";
    window.speechSynthesis.speak(utterance);
  }
}

async function notifyOperator(title, body, tag = "arcigy-jarvis") {
  const safeTitle = redactSensitiveText(title).replace(/\s+/g, " ").trim().slice(0, 90) || "Arcigy Jarvis";
  const safeBody = redactSensitiveText(body).replace(/\s+/g, " ").trim().slice(0, 240);
  try {
    const result = await arcigyApi.notifyOperator?.({ title: safeTitle, body: safeBody, tag });
    if (result?.delivered) return;
  } catch {
    // Browser notification fallback below.
  }
  if (!("Notification" in window)) return;
  const show = () => {
    try {
      new Notification(safeTitle, { body: safeBody, tag, renotify: true });
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
  elements.healthGrid.replaceChildren();
  for (const item of health.integrations ?? []) {
    const node = document.createElement("div");
    const key = document.createElement("strong");
    const status = document.createElement("span");
    node.className = `health ${item.configured ? "ready" : "missing"}`;
    key.textContent = item.key;
    status.textContent = item.configured ? "ready" : `missing ${item.missing.length}`;
    node.append(key, status);
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
  renderMissionSignals(health, bridge);
}

function renderLaunchQueue(report) {
  const status = report.status ?? "unknown";
  const attentionQueue = report.attentionQueue ?? [];
  const launchChecklist = report.launchChecklist ?? [];
  const nextAction = report.nextActions?.[0] ?? "No action needed. Keep running production verification before changes.";
  const attention = attentionQueue[0];
  elements.launchQueue?.setAttribute("data-state", status === "ready" ? "ready" : "attention");
  elements.launchStatus.textContent = status;
  elements.launchNextAction.textContent = nextAction;
  elements.launchAttention.textContent = attention ? `${attention.severity}: ${attention.title}` : "clear";
  elements.launchChecklist.replaceChildren();
  for (const item of launchChecklist.slice(0, 3)) {
    const node = document.createElement("li");
    const statusNode = document.createElement("span");
    const titleNode = document.createElement("strong");
    statusNode.textContent = item.status;
    titleNode.textContent = item.title;
    node.setAttribute("data-state", item.status);
    node.append(statusNode, titleNode);
    elements.launchChecklist.appendChild(node);
  }
}

function renderProductionVerificationEvidence(evidence) {
  if (!elements.verificationEvidence) return;
  const status = evidence?.status ?? "missing";
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const ready = checks.filter((check) => check?.status === "ready").length;
  const failed = checks.filter((check) => check?.status === "failed").length;
  const generatedAt = evidence?.generatedAt ? new Date(evidence.generatedAt).toLocaleString() : "not generated";
  elements.verificationEvidence.textContent = status === "ready" ? `${ready} gates ready` : `${status}: ${failed} failed`;
  elements.verificationEvidence.title = `${evidence?.summary ?? "Run npm run verify:production."} ${generatedAt}`;
  elements.verificationEvidence.closest("div")?.setAttribute("data-state", status === "ready" ? "ready" : "attention");
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

function setMissionSignal(node, text, stateName) {
  if (!node) return;
  node.textContent = text;
  node.closest(".missionSignal")?.setAttribute("data-state", stateName);
}

function setCortexSignal(node, text, stateName) {
  if (!node) return;
  node.textContent = text;
  node.closest(".cortexNode")?.setAttribute("data-state", stateName);
}

function renderMissionSignals(health, bridge = null) {
  const integrations = health.integrations ?? [];
  const requiredBlockers = integrations.filter((item) => !item.configured && item.requiredForProduction !== false);
  const advisories = integrations.filter((item) => !item.configured && item.requiredForProduction === false);
  const gmail = integrations.find((item) => item.key === "gmail");
  const gemini = integrations.find((item) => item.key === "gemini");
  const smartlead = integrations.find((item) => item.key === "smartlead");
  const readinessText = requiredBlockers.length ? `${requiredBlockers.length} blocker` : advisories.length ? `${advisories.length} advisory` : "ready";
  setMissionSignal(elements.missionReadiness, readinessText, requiredBlockers.length || advisories.length ? "attention" : "ready");
  setMissionSignal(elements.missionGmail, gmail?.configured ? (state.clientAlertWatchEnabled ? "watching" : "paused") : "needs auth", gmail?.configured ? "ready" : "attention");
  setMissionSignal(elements.missionRemote, bridge ? (bridge.readyForTunnel ? "ready" : "locked") : "checking", bridge ? (bridge.readyForTunnel ? "ready" : "attention") : "checking");
  setMissionSignal(elements.missionContracts, gemini?.configured ? "Gemini ready" : "needs Gemini", gemini?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexOutreach, smartlead?.configured ? "Smartlead ready" : "needs key", smartlead?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexMemory, gmail?.configured ? (state.clientAlertWatchEnabled ? "Gmail watch" : "watch paused") : "needs Gmail", gmail?.configured && state.clientAlertWatchEnabled ? "ready" : "attention");
  setCortexSignal(elements.cortexContracts, gemini?.configured ? "Gemini intake" : "needs Gemini", gemini?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, bridge ? (bridge.readyForTunnel ? "tunnel ready" : "auth locked") : "checking", bridge ? (bridge.readyForTunnel ? "ready" : "attention") : "checking");
}

function renderReadinessReport(report) {
  const blockers = report.blockers ?? [];
  const attentionQueue = report.attentionQueue ?? [];
  const launchChecklist = report.launchChecklist ?? [];
  const launchEvidence = report.launchEvidence ?? null;
  const proofGates = launchEvidence?.proofGates ?? [];
  return [
    report.summary ?? `Status: ${report.status}`,
    `Status: ${report.status}`,
    `Integrations: ${report.integrations?.ready ?? "--"}/${report.integrations?.total ?? "--"}`,
    `MCP tools: ${report.mcp?.toolCount ?? "--"}`,
    `Approval locks: ${(report.mcp?.approvalRequired ?? []).length}`,
    "",
    launchChecklist.length ? "Launch checklist:" : "Launch checklist: not loaded",
    ...launchChecklist.map((item) => [`- [${item.status}] ${item.title}`, `  Proof: ${item.proof}`, `  Next: ${item.nextAction}`].join("\n")),
    "",
    launchEvidence ? `Launch evidence: ${launchEvidence.decision}` : "Launch evidence: not loaded",
    ...proofGates.map((gate) => [`- [${gate.status}] ${gate.title}`, `  Proof: ${gate.proof}`, `  Validate: ${gate.validationCommand}`].join("\n")),
    launchEvidence?.remoteHandoff
      ? [
          `Remote handoff: ${launchEvidence.remoteHandoff.tunnelCommand}`,
          `Smoke: ${launchEvidence.remoteHandoff.smokeCommand}`,
          `Next: ${launchEvidence.operatorNextAction}`,
        ].join("\n")
      : null,
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

function renderOperatorBriefingCards(briefing) {
  const sections = briefing.sections ?? {};
  const readiness = sections.readiness ?? briefing.summary;
  const cards = [
    { key: "readiness", label: "Readiness", value: readiness, state: readinessCardState(readiness) },
    { key: "coldOutreach", label: "Outreach", value: sections.coldOutreach, state: textHasAttention(sections.coldOutreach) ? "attention" : "ready" },
    { key: "clientNeeds", label: "Client needs", value: sections.clientNeeds, state: textHasAttention(sections.clientNeeds) ? "attention" : "ready" },
    { key: "preparedReplies", label: "Approvals", value: sections.preparedReplies, state: textHasAttention(sections.preparedReplies) ? "attention" : "ready" },
    { key: "nextAction", label: "Next action", value: sections.nextAction, state: "attention" },
  ];
  elements.briefingGrid.replaceChildren();
  for (const card of cards) {
    const node = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    node.className = "briefingCard";
    node.setAttribute("data-state", card.state);
    label.textContent = card.label;
    value.textContent = card.value || "No signal yet.";
    node.append(label, value);
    elements.briefingGrid.appendChild(node);
  }
}

function readinessCardState(value) {
  const status = String(value ?? "").match(/^Readiness:\s*([a-z]+)/i)?.[1]?.toLowerCase();
  if (status === "blocked") return "blocked";
  if (status === "attention") return "attention";
  return textHasAttention(value) ? "attention" : "ready";
}

function textHasAttention(value) {
  return /([1-9]\d*\s*(open|reply|positive|alert|need|request|approval|blok|warning|attention|odpoved|pozitiv|poziadav|otvoren|caka|čaká|schval|schváľ|schvalenie|schválenie))/i.test(String(value ?? ""));
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
  renderOperatorBriefingCards(briefing);
  trackReadinessNoticeFromBriefing(briefing);
  if (speakResult) speak(briefing.speechText ?? briefing.summary);
  return briefing;
}

function startOperatorBriefingWatch() {
  if (state.operatorBriefingTimer) window.clearInterval(state.operatorBriefingTimer);
  void refreshOperatorBriefing().catch((error) => {
    elements.response.textContent = safeUiErrorText(error);
  });
  state.operatorBriefingTimer = window.setInterval(() => {
    void refreshOperatorBriefing().catch((error) => {
      elements.commandTimeline.textContent = safeUiErrorText(error);
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
    try {
      renderLaunchQueue(await arcigyApi.productionReadiness({ live: false }));
    } catch (error) {
      elements.launchStatus.textContent = "attention";
      elements.launchNextAction.textContent = safeUiErrorText(error);
      elements.launchAttention.textContent = "readiness unavailable";
      elements.launchChecklist.replaceChildren();
    }
    try {
      renderProductionVerificationEvidence(await arcigyApi.productionVerificationEvidence());
    } catch (error) {
      if (elements.verificationEvidence) {
        elements.verificationEvidence.textContent = "evidence unavailable";
        elements.verificationEvidence.title = safeUiErrorText(error);
      }
    }
  } catch (error) {
    elements.healthGrid.textContent = safeUiErrorText(error);
    elements.commandTimeline.textContent = safeUiErrorText(error);
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
  const fetched = synced.reduce((sum, item) => sum + Number(item.fetched ?? 0), 0);
  const alerts = synced.reduce((sum, item) => sum + (item.alerts ?? []).length, 0);
  setCortexSignal(elements.cortexMemory, alerts ? `${alerts} alert(s)` : `${fetched} mail(s)`, alerts ? "attention" : "ready");
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

function renderApprovalQueue(result) {
  const items = result.items ?? [];
  if (!items.length) return result.summary ?? "Approval queue is empty.";
  return [
    result.summary ?? `Approval queue: ${items.length}`,
    "",
    ...items.slice(0, 10).map((item, index) =>
      [
        `${index + 1}. ${item.title ?? item.type}`,
        `   Type: ${item.type ?? "-"}`,
        `   Summary: ${item.summary ?? "-"}`,
        `   Approval tool: ${item.approvalTool ?? "-"}`,
        `   Payload: ${JSON.stringify(item.approvalPayload ?? {})}`,
      ].join("\n")
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

function renderDiagnosticsGrid(result) {
  const checks = result.checks ?? [];
  elements.diagnosticsGrid.replaceChildren();
  for (const check of checks) {
    const node = document.createElement("div");
    const key = document.createElement("strong");
    const status = document.createElement("span");
    const message = document.createElement("p");
    const stateName = check.status === "ready" ? "ready" : check.status === "warning" ? "attention" : "blocked";
    node.className = "diagnosticCard";
    node.setAttribute("data-state", stateName);
    key.textContent = check.key;
    status.textContent = check.status;
    message.textContent = check.message ?? "-";
    node.append(key, status, message);
    elements.diagnosticsGrid.appendChild(node);
  }
}

function renderAuditEvents(result) {
  const events = result.events ?? [];
  if (!events.length) return result.summary ?? "No audit events yet.";
  return [
    result.summary ?? `Audit events: ${events.length}`,
    "",
    ...events.slice(0, 12).map((event, index) =>
      [
        `${index + 1}. ${event.automationKey} / ${event.status}`,
        `   Created: ${event.createdAt ?? "-"}`,
        `   Approval: ${event.requiresApproval ? event.approvedAt ?? "required" : "not required"}`,
      ].join("\n")
    ),
  ].join("\n");
}

function renderLocalMemorySnapshot(result) {
  const counts = result.counts ?? {};
  const people = result.people ?? [];
  const needs = result.recentClientNeedSignals ?? [];
  const audit = result.recentAuditEvents ?? [];
  return [
    result.summary ?? "Local memory snapshot loaded.",
    "",
    `People: ${counts.people ?? 0}`,
    `Email activities: ${counts.emailActivities ?? 0}`,
    `Open client needs: ${counts.openClientNeeds ?? 0}`,
    `Cold outreach events: ${counts.coldOutreachEvents ?? 0}`,
    `Audit events: ${counts.auditEvents ?? 0}`,
    "",
    "Recent people:",
    ...(people.length ? people.slice(0, 5).map((person) => `- ${person.primaryEmail} (${person.kind})`) : ["- none"]),
    "",
    "Recent client needs:",
    ...(needs.length ? needs.slice(0, 5).map((need) => `- ${need.status}: ${need.summary}`) : ["- none"]),
    "",
    "Recent audit:",
    ...(audit.length ? audit.slice(0, 5).map((event) => `- ${event.automationKey} / ${event.status}`) : ["- none"]),
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

function renderClientAlertGrid(result) {
  const alerts = result.alerts ?? [];
  elements.clientAlertGrid.replaceChildren();
  for (const alert of alerts.slice(0, 6)) {
    const person = alert.person ?? {};
    const need = alert.needSignal ?? {};
    const node = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const summary = document.createElement("p");
    node.className = "clientAlertCard";
    name.textContent = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Unknown client";
    meta.textContent = [person.primaryEmail, need.occurredAt].filter(Boolean).join(" / ") || "local memory";
    summary.textContent = need.summary ?? "Open client request.";
    node.append(name, meta, summary);
    elements.clientAlertGrid.appendChild(node);
  }
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

function latestClientNeedAlert() {
  return state.lastClientNeedAlerts.find((alert) => alert?.needSignal?.id);
}

async function updateLatestClientNeedStatus(status) {
  const alert = latestClientNeedAlert();
  if (!alert) throw new Error("Load client alerts first. No open client request is selected.");
  const person = alert.person ?? {};
  const need = alert.needSignal ?? {};
  const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "client";
  const label = status === "ignored" ? "ignore" : "resolve";
  const ok = window.confirm(`Jarvis will ${label} this client request:\n\n${name}\n${need.summary ?? "Open request"}`);
  if (!ok) return null;
  const result = await arcigyApi.updateClientNeedStatus({
    needSignalId: need.id,
    status,
    note: `Marked ${status} from Jarvis desktop UI.`,
    updatedBy: "desktop",
    approval: { approved: true },
  });
  state.seenClientNeedAlertIds.delete(clientAlertKey(alert));
  await refreshClientNeedAlerts({ announceNew: false, loadingText: "Refreshing client alerts..." });
  return result;
}

async function refreshClientNeedAlerts({ announceNew = false, loadingText = null } = {}) {
  if (loadingText) elements.clientAlertsResult.textContent = loadingText;
  await maybeSyncGmailForClientAlerts();
  const result = await arcigyApi.getClientNeedAlerts({ limit: 10 });
  const alerts = result.alerts ?? [];
  state.lastClientNeedAlerts = alerts;
  const newAlerts = alerts.filter((alert) => {
    const key = clientAlertKey(alert);
    return key && !state.seenClientNeedAlertIds.has(key);
  });

  renderClientAlertGrid(result);
  elements.clientAlertsResult.textContent = renderClientNeedAlerts(result);
  for (const alert of alerts) {
    const key = clientAlertKey(alert);
    if (key) state.seenClientNeedAlertIds.add(key);
  }

  elements.clientAlertWatchStatus.textContent = state.clientAlertWatchEnabled
    ? `Client alert watch active. Open requests: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`
    : `Client alert watch paused. Open requests: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`;
  setCortexSignal(
    elements.cortexMemory,
    Number(result.count ?? alerts.length) > 0 ? `${result.count ?? alerts.length} open need(s)` : "watch clear",
    Number(result.count ?? alerts.length) > 0 ? "attention" : state.clientAlertWatchEnabled ? "ready" : "attention"
  );

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
    const message = safeUiErrorText(error);
    state.lastClientAlertGmailSyncSummary = `Gmail auto-sync unavailable: ${message}`;
  }
}

function startClientNeedWatch() {
  state.clientAlertWatchEnabled = true;
  elements.toggleClientNeedWatch.textContent = "Pause watch";
  setMissionSignal(elements.missionGmail, "watching", "ready");
  setCortexSignal(elements.cortexMemory, "Gmail watch", "ready");
  if (state.clientAlertPollTimer) window.clearInterval(state.clientAlertPollTimer);
  void refreshClientNeedAlerts({ announceNew: false }).catch((error) => {
    elements.clientAlertWatchStatus.textContent = safeUiErrorText(error);
  });
  state.clientAlertPollTimer = window.setInterval(() => {
    if (!state.clientAlertWatchEnabled) return;
    void refreshClientNeedAlerts({ announceNew: true }).catch((error) => {
      elements.clientAlertWatchStatus.textContent = safeUiErrorText(error);
    });
  }, state.clientAlertPollMs);
}

function stopClientNeedWatch() {
  state.clientAlertWatchEnabled = false;
  if (state.clientAlertPollTimer) window.clearInterval(state.clientAlertPollTimer);
  state.clientAlertPollTimer = null;
  elements.toggleClientNeedWatch.textContent = "Resume watch";
  elements.clientAlertWatchStatus.textContent = "Client alert watch paused.";
  setMissionSignal(elements.missionGmail, "paused", "attention");
  setCortexSignal(elements.cortexMemory, "watch paused", "attention");
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
  setCortexSignal(elements.cortexOutreach, `${metrics.replied ?? 0} replies`, metrics.positiveReplies > 0 || metrics.replied > 0 ? "attention" : "ready");
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
    `Action manifest: ${result.actionManifestUrl ?? `${result.origin ?? "http://127.0.0.1:8765"}/.well-known/ai-plugin.json`}`,
    `OpenAPI schema: ${result.openApiSchemaUrl ?? `${result.origin ?? "http://127.0.0.1:8765"}/api/openapi.json`}`,
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
  setMissionSignal(elements.missionRemote, result.readyForTunnel ? "ready" : "locked", result.readyForTunnel ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, result.readyForTunnel ? "tunnel ready" : "auth locked", result.readyForTunnel ? "ready" : "attention");
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
  const matchingSmoke = state.lastRemoteMcpSmoke?.baseUrl === pack.baseUrl ? state.lastRemoteMcpSmoke : null;
  if (state.lastRemoteMcpSmoke && !matchingSmoke) state.lastRemoteMcpSmoke = null;
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
  const proof = matchingSmoke ? summarizeRemoteProofGates(matchingSmoke) : { ready: false, text: "smoke not run" };
  elements.handoffProofGates.textContent = proof.text;
  elements.handoffProofGates.dataset.state = proof.ready ? "ready" : "attention";
  renderAgentSetupProfiles(pack.agentSetupProfiles ?? [], matchingSmoke);
  renderMcpToolList(pack);
  elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(pack, matchingSmoke);
}

function renderAgentSetupProfiles(profiles, smokeReport = null) {
  elements.agentSetupProfiles.replaceChildren();
  if (!profiles.length) {
    const node = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("code");
    node.className = "agentSetupCard";
    node.dataset.state = "attention";
    label.textContent = "Agent setup";
    title.textContent = "missing";
    meta.textContent = "Connection pack has no profiles.";
    node.append(label, title, meta);
    elements.agentSetupProfiles.appendChild(node);
    return;
  }
  const gateSummary = smokeReport ? summarizeRemoteProofGates(smokeReport) : { ready: false, text: "smoke not run" };
  for (const profile of profiles) {
    const gates = Array.isArray(profile.requiredProofGates) ? profile.requiredProofGates : [];
    const node = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("code");
    node.className = "agentSetupCard";
    node.dataset.state = gateSummary.ready ? "ready" : "attention";
    label.textContent = profile.setupMode ?? "remote setup";
    title.textContent = profile.agent ?? "Agent";
    meta.textContent = [
      `Import: ${profile.importUrl ?? "--"}`,
      `Fallback: ${profile.fallbackUrl ?? "--"}`,
      `First: ${profile.firstTool ?? "arcigy.get_operator_briefing"}`,
      `Policy: ${profile.writePolicy ?? "approval.approved-required"} / ${profile.localWritePolicy ?? "dry-run-first"}`,
      `Proof: ${gates.length ? gates.join(", ") : "not declared"}`,
    ].join("\n");
    node.append(label, title, meta);
    elements.agentSetupProfiles.appendChild(node);
  }
}

function renderSecureTunnelStatus(status) {
  state.lastSecureTunnelStatus = status;
  if (status.logPath) state.secureTunnelLogPath = status.logPath;
  if (status.ready && status.publicUrl) {
    elements.handoffStatus.textContent = "tunnel live";
    elements.handoffStatus.dataset.state = "ready";
    elements.handoffManifestUrl.textContent = status.manifestUrl ?? "--";
    elements.handoffToolPattern.textContent = status.mcpToolCallPattern ?? "--";
    elements.handoffSmokeUrl.textContent = status.smokeUrl ?? "--";
    elements.handoffProofGates.textContent = status.smokeSummary ? "ready: external smoke logged" : "ready: tunnel URL extracted";
    elements.handoffProofGates.dataset.state = "ready";
    setMissionSignal(elements.missionRemote, "tunnel live", "ready");
    setCortexSignal(elements.cortexRemote, "tunnel live", "ready");
  } else if (status.running) {
    elements.handoffStatus.textContent = "starting";
    elements.handoffStatus.dataset.state = "attention";
    elements.handoffProofGates.textContent = "waiting for tunnel ready log";
    elements.handoffProofGates.dataset.state = "attention";
  }
  elements.remoteAgentPrompt.textContent = [
    status.summary ?? "Secure tunnel status loaded.",
    `Running: ${status.running ? "yes" : "no"}`,
    `Ready: ${status.ready ? "yes" : "no"}`,
    status.publicUrl ? `Public MCP base URL: ${status.publicUrl}` : null,
    status.actionManifestUrl ? `Action manifest: ${status.actionManifestUrl}` : status.publicUrl ? `Action manifest: ${status.publicUrl}/.well-known/ai-plugin.json` : null,
    status.openApiSchemaUrl ? `OpenAPI schema: ${status.openApiSchemaUrl}` : status.publicUrl ? `OpenAPI schema: ${status.publicUrl}/api/openapi.json` : null,
    status.connectionPackUrl ? `Connection pack: ${status.connectionPackUrl}` : null,
    status.smokeUrl ? `Smoke test: ${status.smokeUrl}` : null,
    status.mcpToolCallPattern ? `Tool call pattern: ${status.mcpToolCallPattern}` : null,
    `Bearer token: ${status.tokenPresent ? "present in private log, not shown here" : "not detected"}`,
    status.logPath ? `Private log: ${status.logPath}` : null,
    status.redactedTail ? `\nRedacted log tail:\n${status.redactedTail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderMcpToolList(pack) {
  const tools = pack.tools?.names ?? [];
  const approvalTools = new Set(pack.tools?.approvalRequired ?? []);
  const localWriteTools = new Set(pack.tools?.localStateWrite ?? []);
  const readOnlyTools = new Set(pack.tools?.readOnlyOrDraft ?? []);
  elements.mcpToolListStatus.textContent = tools.length ? `Live registry: ${tools.length} tools loaded.` : "No MCP tools loaded.";
  elements.mcpToolList.replaceChildren();
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
    toolBadges.textContent = badges.join(" / ") || "standard";
    node.append(toolName, toolBadges);
    elements.mcpToolList.appendChild(node);
  }
}

function buildRemoteAgentPrompt(pack, smokeReport = null) {
  const handoffStatus = buildCopiedHandoffStatus(smokeReport);
  const approvalTools = pack.tools?.approvalRequired ?? [];
  const localWriteTools = pack.tools?.localStateWrite ?? [];
  const proof = (pack.handoff?.requiredProof ?? [])
    .map((item) => `- ${item.key}: ${item.url} => ${item.expected}`)
    .join("\n");
  const agentFirstSteps = (pack.handoff?.agentFirstSteps ?? []).map((step) => `- ${step}`).join("\n");
  const compatibility = pack.agentCompatibility;
  const supportedAgents = (compatibility?.supportedAgents ?? []).join(", ");
  const safetyRules = (compatibility?.safetyRules ?? []).map((rule) => `- ${rule}`).join("\n");
  const agentPrompts = pack.agentPromptTemplates
    ? Object.entries(pack.agentPromptTemplates)
        .map(([agent, prompt]) => `- ${agent}: ${prompt}`)
        .join("\n")
    : "";
  const agentProfiles = (pack.agentSetupProfiles ?? [])
    .map(
      (profile) =>
        `- ${profile.agent}: setupMode=${profile.setupMode}, importUrl=${profile.importUrl}, fallbackUrl=${profile.fallbackUrl}, firstTool=${profile.firstTool}, writePolicy=${profile.writePolicy}, localWritePolicy=${profile.localWritePolicy}, requiredProofGates=${(profile.requiredProofGates ?? []).join(", ")}`
    )
    .join("\n");
  const limits = pack.limits
    ? `Limits: pathPolicy=${pack.limits.pathPolicy}, maxJsonBytes=${pack.limits.maxJsonBytes}, writesRequireExplicitToolCall=${pack.limits.writesRequireExplicitToolCall}`
    : "";
  const quickStart = (pack.quickStartCalls ?? [])
    .map((call) => `- ${call.label}: ${call.method} ${call.url} approvalRequired=${call.approvalRequired} body=${JSON.stringify(call.body)}`)
    .join("\n");
  return [
    handoffStatus.text,
    "",
    "Arcigy Jarvis remote MCP connection pack",
    `Manifest: ${pack.manifestUrl}`,
    `Action manifest: ${pack.actionManifestUrl ?? `${pack.baseUrl}/.well-known/ai-plugin.json`}`,
    `OpenAPI schema: ${pack.openApiSchemaUrl ?? `${pack.baseUrl}/api/openapi.json`}`,
    `Connection pack: ${pack.handoff?.connectionPackUrl ?? `${pack.baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`}`,
    `Tool call pattern: ${pack.mcpToolCallPattern}`,
    `Auth header: ${pack.auth?.header ?? "Authorization: Bearer <JARVIS_WEB_TOKEN>"}`,
    `Tools: ${pack.tools?.count ?? 0}`,
    `Approval required: ${approvalTools.join(", ") || "none"}`,
    `Local memory writes: ${localWriteTools.join(", ") || "none"}`,
    limits,
    supportedAgents ? `Supported agents: ${supportedAgents}` : "",
    compatibility?.protocol ? `Protocol: ${compatibility.protocol}` : "",
    `Secure tunnel: ${pack.tunnel?.secureCommand ?? "npm run web:tunnel:secure"}`,
    pack.tunnel?.statusUrl ? `Tunnel status: ${pack.tunnel.statusUrl}` : "",
    pack.tunnel?.startUrl ? `Browser tunnel start: ${pack.tunnel.startUrl}` : "",
    pack.tunnel?.stopUrl ? `Browser tunnel stop: ${pack.tunnel.stopUrl}` : "",
    `Smoke test: ${pack.smokeTestUrl ?? "--"}`,
    proof ? `Required proof:\n${proof}` : "",
    agentProfiles ? `Agent setup profiles:\n${agentProfiles}` : "",
    agentFirstSteps ? `Agent first steps:\n${agentFirstSteps}` : "",
    agentPrompts ? `Agent-specific startup prompts:\n${agentPrompts}` : "",
    safetyRules ? `Safety rules:\n${safetyRules}` : "",
    "Rule: never call approval-required tools without explicit operator confirmation.",
    "Rule: treat local memory write tools as persistent local state changes; preview Gmail with dryRun: true first.",
    "Start with arcigy.get_operator_briefing, then use read-only tools before proposing any write action.",
    quickStart ? `Quick-start calls:\n${quickStart}` : "",
  ].join("\n");
}

function renderRemoteMcpSmoke(report) {
  state.lastRemoteMcpSmoke = report;
  elements.remoteSmokeResult.dataset.state = report.status === "ready" ? "ready" : "attention";
  setMissionSignal(elements.missionRemote, report.status === "ready" ? "smoke ready" : "smoke blocked", report.status === "ready" ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, report.status === "ready" ? "smoke ready" : "smoke blocked", report.status === "ready" ? "ready" : "attention");
  const proof = summarizeRemoteProofGates(report);
  elements.handoffProofGates.textContent = proof.text;
  elements.handoffProofGates.dataset.state = proof.ready ? "ready" : "attention";
  if (state.lastRemoteMcpPack) elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(state.lastRemoteMcpPack, report);
  elements.remoteSmokeResult.textContent = [
    report.summary ?? `Remote MCP smoke: ${report.status}`,
    "",
    ...(report.checks ?? []).map((check) => `${check.status.toUpperCase()} ${check.key}: ${check.message}`),
  ].join("\n");
}

function summarizeRemoteProofGates(report) {
  const checks = new Map((report.checks ?? []).map((check) => [check.key, check.status]));
  const missing = requiredRemoteSmokeGates.filter((key) => checks.get(key) !== "ready");
  if (missing.length) return { ready: false, text: `blocked: ${missing.join(", ")}` };
  if (report.status !== "ready") return { ready: false, text: `blocked: smoke status ${report.status ?? "unknown"}` };
  return { ready: true, text: `ready: ${requiredRemoteSmokeGates.length}/${requiredRemoteSmokeGates.length} safety gates` };
}

async function copyRemotePack() {
  if (!state.lastRemoteMcpPack) {
    elements.remoteAgentPrompt.textContent = "Load the web bridge first.";
    return;
  }
  const handoffStatus = buildCopiedHandoffStatus(state.lastRemoteMcpSmoke);
  const payload = [
    buildRemoteAgentPrompt(state.lastRemoteMcpPack, state.lastRemoteMcpSmoke),
    "",
    JSON.stringify(
      {
        handoffStatus,
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

async function copyGrokPrompt() {
  await copyAgentPrompt("grok", "Grok", elements.copyGrokPrompt);
}

async function copyClaudePrompt() {
  await copyAgentPrompt("claude", "Claude", elements.copyClaudePrompt);
}

async function copyChatGptPrompt() {
  await copyAgentPrompt("chatgpt", "ChatGPT", elements.copyChatGptPrompt);
}

async function copyAgentPrompt(agentKey, agentLabel, button) {
  if (!state.lastRemoteMcpPack) {
    elements.remoteAgentPrompt.textContent = "Load the web bridge first.";
    return;
  }
  const pack = state.lastRemoteMcpPack;
  const handoffStatus = buildCopiedHandoffStatus(state.lastRemoteMcpSmoke);
  const prompt =
    pack.agentPromptTemplates?.[agentKey] ??
    "Use the Arcigy Jarvis HTTP JSON MCP bridge. Run smoke first and never call approvalRequired tools without approval.";
  const profile = findAgentSetupProfile(pack, agentLabel);
  const payload = [
    handoffStatus.text,
    "",
    `${agentLabel} startup prompt:`,
    prompt,
    "",
    profile
      ? [
          `${agentLabel} setup profile:`,
          `Setup mode: ${profile.setupMode}`,
          `Import URL: ${profile.importUrl}`,
          `Fallback URL: ${profile.fallbackUrl}`,
          `First tool: ${profile.firstTool}`,
          `First tool URL: ${profile.firstToolUrl}`,
          `Write policy: ${profile.writePolicy}`,
          `Local write policy: ${profile.localWritePolicy}`,
          `Required proof gates: ${(profile.requiredProofGates ?? []).join(", ")}`,
          "",
        ].join("\n")
      : "",
    `Manifest: ${pack.manifestUrl}`,
    `Action manifest: ${pack.actionManifestUrl ?? `${pack.baseUrl}/.well-known/ai-plugin.json`}`,
    `OpenAPI schema: ${pack.openApiSchemaUrl ?? `${pack.baseUrl}/api/openapi.json`}`,
    `Connection pack: ${pack.handoff?.connectionPackUrl ?? `${pack.baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`}`,
    `Smoke test: ${pack.smokeTestUrl}`,
    pack.tunnel?.statusUrl ? `Tunnel status: ${pack.tunnel.statusUrl}` : "",
    `Tool call pattern: ${pack.mcpToolCallPattern}`,
    `Auth header: ${pack.auth?.header ?? "Authorization: Bearer <JARVIS_WEB_TOKEN>"}`,
  ].join("\n");
  await writeClipboardText(payload);
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = `Copy ${agentLabel}`;
  }, 1400);
}

function findAgentSetupProfile(pack, agentLabel) {
  const profiles = pack.agentSetupProfiles ?? [];
  return profiles.find((profile) => String(profile.agent ?? "").toLowerCase() === agentLabel.toLowerCase());
}

async function copyTunnelCommand() {
  const command = state.lastRemoteMcpPack?.tunnel?.secureCommand ?? "npm run web:tunnel:secure";
  const payload = [
    command,
    "",
    "Keep this terminal process open while Grok, Claude, or ChatGPT uses the remote MCP bridge.",
    "After the tunnel URL appears, run remote smoke and copy the right agent prompt from Jarvis.",
  ].join("\n");
  await writeClipboardText(payload);
  elements.copyTunnelCommand.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyTunnelCommand.textContent = "Copy tunnel";
  }, 1400);
}

async function refreshSecureTunnelStatus() {
  elements.remoteAgentPrompt.textContent = "Checking secure tunnel status from the private log...";
  const status = await arcigyApi.getSecureTunnelStatus();
  renderSecureTunnelStatus(status);
  return status;
}

function buildCopiedHandoffStatus(smokeReport) {
  if (!smokeReport) {
    return {
      ready: false,
      text: "HANDOFF STATUS: BLOCKED. Run remote MCP smoke and require ready proof gates before the remote agent starts work.",
    };
  }
  const proof = summarizeRemoteProofGates(smokeReport);
  return {
    ready: proof.ready,
    text: proof.ready
      ? "HANDOFF STATUS: READY. Remote smoke and required proof gates passed."
      : `HANDOFF STATUS: BLOCKED. ${proof.text}`,
  };
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
    elements.webBridgeResult.textContent = safeUiErrorText(error);
  });
  state.webBridgeTimer = window.setInterval(() => {
    void refreshWebBridge().catch((error) => {
      elements.webBridgeResult.textContent = safeUiErrorText(error);
    });
  }, state.webBridgePollMs);
}

async function getJson(url) {
  const response = await fetch(url, { headers: authHeaders() });
  const value = await readJsonResponse(response);
  if (!response.ok) throw new Error(responseErrorMessage(response, value));
  return value;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  });
  const value = await readJsonResponse(response);
  if (!response.ok) throw new Error(responseErrorMessage(response, value));
  return value;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      const preview = redactSensitiveText(text).trim().slice(0, 240);
      throw new Error(`Request failed: ${response.status}${preview ? `: ${preview}` : ""}`);
    }
    throw new Error(`Invalid JSON response: ${response.status}`);
  }
}

function responseErrorMessage(response, value) {
  const error = typeof value?.error === "string" ? value.error.trim() : "";
  return error ? redactSensitiveText(error) : `Request failed: ${response.status}`;
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

function setupContractFormDirtyTracking() {
  for (const element of contractFormElements()) {
    element.addEventListener("input", () => {
      state.contractFormDirty = true;
      elements.contractResult.textContent = "Contract form changed. Apply form before generating DOCX files.";
    });
  }
}

function contractFormElements() {
  return [
    elements.contractBusinessName,
    elements.contractAddress,
    elements.contractCompanyId,
    elements.contractTaxId,
    elements.contractRepresentativeName,
    elements.contractRepresentativeRole,
    elements.contractEmail,
    elements.contractPhone,
    elements.contractProjectName,
    elements.contractProjectGoal,
    elements.contractImplementationFee,
    elements.contractMonthlyFee,
    elements.contractTermMonths,
  ].filter(Boolean);
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
  updateVoiceRuntimeStatus(trimmed ? `heard: ${trimmed}` : "empty transcript ignored");

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
    updateVoiceRuntimeStatus("Speech recognition is unavailable; use transcript fallback.");
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
  recognition.onstart = () => {
    updateVoiceRuntimeStatus("microphone stream active");
  };
  recognition.onresult = (event) => {
    const latest = event.results[event.results.length - 1];
    const text = latest?.[0]?.transcript ?? "";
    if (text) void handleTranscript(text);
  };
  recognition.onend = () => {
    if (!state.listening) {
      updateVoiceRuntimeStatus("microphone stream stopped");
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      state.listening = false;
      elements.listenButton.textContent = "Enable";
      setMode("idle");
      updateVoiceRuntimeStatus(`microphone restart failed: ${safeUiErrorText(error)}`);
    }
  };
  recognition.onerror = (event) => {
    const errorName = event?.error ?? "unknown";
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(errorName)) {
      state.listening = false;
      elements.listenButton.textContent = "Enable";
    }
    setMode("idle");
    updateVoiceRuntimeStatus(`microphone error: ${errorName}`);
  };

  state.recognition = recognition;
  state.listening = true;
  try {
    recognition.start();
    setMode("listening");
    elements.listenButton.textContent = "Disable";
    updateVoiceRuntimeStatus("waiting for Jarvis wake word");
  } catch (error) {
    state.listening = false;
    elements.listenButton.textContent = "Enable";
    setMode("idle");
    updateVoiceRuntimeStatus(`microphone start failed: ${safeUiErrorText(error)}`);
  }
}

function stopRecognition() {
  state.listening = false;
  state.recognition?.stop();
  setMode("idle");
  elements.listenButton.textContent = "Enable";
  updateVoiceRuntimeStatus("listening disabled");
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
elements.approvalQueue.addEventListener("click", async () => {
  try {
    elements.preparedReplyResult.textContent = "Loading approval queue...";
    const result = await arcigyApi.getApprovalQueue({ limit: 20 });
    elements.preparedReplyResult.textContent = renderApprovalQueue(result);
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
  }
});
elements.preparedReplies.addEventListener("click", async () => {
  try {
    elements.preparedReplyResult.textContent = "Loading prepared replies...";
    const result = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = result.replies ?? [];
    if (state.lastPreparedReplies.length) state.lastApprovedPreparedReply = null;
    elements.preparedReplyResult.textContent = renderPreparedReplies(result);
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    state.lastPreparedReplies = [];
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
  }
});
elements.preparePositiveReply.addEventListener("click", async () => {
  try {
    const leadEmail = requiredInputValue(elements.positiveLeadEmail, "Lead email is required before preparing a reply.");
    const positiveSignal = requiredInputValue(elements.positiveSignal, "Positive signal is required before preparing a reply.");
    elements.preparedReplyResult.textContent = "Preparing positive outreach reply...";
    const result = await arcigyApi.preparePositiveOutreachReply({
      leadEmail,
      subject: elements.positiveReplySubject.value,
      positiveSignal,
      context: "Desktop cold outreach panel.",
      language: "sk",
      tone: "executive",
    });
    elements.preparedReplyResult.textContent = result.summary;
    speak(result.summary);
    const refreshed = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = refreshed.replies ?? [];
  } catch (error) {
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
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
      approval: { approved: true },
      approvedBy: "operator",
    });
    elements.preparedReplyResult.textContent = result.summary;
    speak(result.summary);
    state.lastApprovedPreparedReply = result.preparedReply ?? first;
    const refreshed = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = refreshed.replies ?? [];
  } catch (error) {
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
  }
});
elements.sendApprovedReply.addEventListener("click", async () => {
  try {
    const first = state.lastApprovedPreparedReply;
    if (!first) {
      elements.preparedReplyResult.textContent = "Approve a prepared reply before sending.";
      return;
    }
    const approved = window.confirm(`Send approved reply to ${first.leadEmail}${first.subject ? ` about ${first.subject}` : ""} through Gmail?`);
    if (!approved) {
      elements.preparedReplyResult.textContent = "Approved reply send cancelled before any Gmail call.";
      return;
    }
    elements.preparedReplyResult.textContent = "Sending approved reply through Gmail...";
    const result = await arcigyApi.sendApprovedOutreachReply({
      preparedEventId: first.id,
      subject: first.subject,
      approval: { approved: true },
      sentBy: "operator",
    });
    elements.preparedReplyResult.textContent = result.summary;
    speak(result.summary);
    state.lastApprovedPreparedReply = null;
    const refreshed = await arcigyApi.getPreparedOutreachReplies({ status: "pending", limit: 10 });
    state.lastPreparedReplies = refreshed.replies ?? [];
  } catch (error) {
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
  }
});
elements.identifyEmail.addEventListener("click", async () => {
  try {
    elements.memoryResult.textContent = "Identifying...";
    const result = await arcigyApi.identifyEmail({ email: elements.memoryEmail.value });
    elements.memoryResult.textContent = renderIdentity(result);
  } catch (error) {
    elements.memoryResult.textContent = safeUiErrorText(error);
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
    elements.memoryResult.textContent = safeUiErrorText(error);
  }
});
elements.clientNeedAlerts.addEventListener("click", async () => {
  try {
    await maybeSyncGmailForClientAlerts({ force: true });
    const result = await refreshClientNeedAlerts({ announceNew: false, loadingText: "Loading client alerts..." });
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    elements.clientAlertsResult.textContent = safeUiErrorText(error);
  }
});
elements.resolveClientNeed.addEventListener("click", async () => {
  try {
    elements.clientAlertsResult.textContent = "Resolving newest client alert...";
    const result = await updateLatestClientNeedStatus("resolved");
    if (result?.summary) speak(result.summary);
    else elements.clientAlertsResult.textContent = "Client alert update cancelled.";
  } catch (error) {
    elements.clientAlertsResult.textContent = safeUiErrorText(error);
  }
});
elements.ignoreClientNeed.addEventListener("click", async () => {
  try {
    elements.clientAlertsResult.textContent = "Ignoring newest client alert...";
    const result = await updateLatestClientNeedStatus("ignored");
    if (result?.summary) speak(result.summary);
    else elements.clientAlertsResult.textContent = "Client alert update cancelled.";
  } catch (error) {
    elements.clientAlertsResult.textContent = safeUiErrorText(error);
  }
});
elements.toggleClientNeedWatch.addEventListener("click", () => {
  if (state.clientAlertWatchEnabled) stopClientNeedWatch();
  else startClientNeedWatch();
});
elements.draftReply.addEventListener("click", async () => {
  try {
    const message = requiredInputValue(elements.clientMessage, "Client message is required before drafting.");
    elements.draftResult.textContent = "Drafting...";
    const result = await arcigyApi.generateAiReply({
      message,
      context: "Client communication inside Arcigy Jarvis.",
    });
    elements.draftResult.textContent = result.text;
    speak(result.text);
  } catch (error) {
    elements.draftResult.textContent = safeUiErrorText(error);
  }
});
elements.runDiagnostics.addEventListener("click", async () => {
  try {
    elements.diagnosticsResult.textContent = "Running live diagnostics...";
    elements.diagnosticsGrid.replaceChildren();
    const result = await arcigyApi.runDiagnostics({ live: true });
    renderDiagnosticsGrid(result);
    elements.diagnosticsResult.textContent = renderDiagnostics(result);
  } catch (error) {
    elements.diagnosticsResult.textContent = safeUiErrorText(error);
  }
});
elements.auditEvents.addEventListener("click", async () => {
  try {
    elements.auditResult.textContent = "Loading audit trail...";
    const result = await arcigyApi.getAuditEvents({ limit: 20 });
    elements.auditResult.textContent = renderAuditEvents(result);
  } catch (error) {
    elements.auditResult.textContent = safeUiErrorText(error);
  }
});
elements.localMemorySnapshot.addEventListener("click", async () => {
  try {
    elements.auditResult.textContent = "Loading redacted local memory snapshot...";
    const result = await arcigyApi.getLocalMemorySnapshot({ limit: 10 });
    elements.auditResult.textContent = renderLocalMemorySnapshot(result);
  } catch (error) {
    elements.auditResult.textContent = safeUiErrorText(error);
  }
});
elements.exportLocalMemorySnapshot.addEventListener("click", async () => {
  try {
    const approved = window.confirm("Export a redacted local memory snapshot to generated/local-memory/local-memory-snapshot.json?");
    if (!approved) {
      elements.auditResult.textContent = "Local memory snapshot export cancelled before any file write.";
      return;
    }
    elements.auditResult.textContent = "Exporting redacted local memory snapshot...";
    const result = await arcigyApi.exportLocalMemorySnapshot({
      outputPath: "generated/local-memory/local-memory-snapshot.json",
      limit: 10,
      approval: { approved: true },
    });
    elements.auditResult.textContent = [
      result.summary ?? "Local memory snapshot exported.",
      `Output: ${result.outputPath}`,
      `People: ${result.counts?.people ?? 0}`,
      `Open client needs: ${result.counts?.openClientNeeds ?? 0}`,
      "Secrets are redacted.",
    ].join("\n");
  } catch (error) {
    elements.auditResult.textContent = safeUiErrorText(error);
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
    elements.gmailResult.textContent = safeUiErrorText(error);
  }
});
elements.syncGmail.addEventListener("click", async () => {
  try {
    const confirmed = window.confirm(`Sync recent Gmail messages into local client memory? Preview first when unsure.`);
    if (!confirmed) {
      elements.gmailResult.textContent = "Gmail sync cancelled before local memory writes.";
      return;
    }
    elements.gmailResult.textContent = "Syncing Gmail...";
    const result = await arcigyApi.syncGmailRecentMessages({
      query: elements.gmailQuery.value,
      maxResults: 5,
      dryRun: false,
    });
    elements.gmailResult.textContent = renderGmailSync(result);
  } catch (error) {
    elements.gmailResult.textContent = safeUiErrorText(error);
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
    elements.smartleadResult.textContent = safeUiErrorText(error);
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
    elements.smartleadResult.textContent = safeUiErrorText(error);
  }
});
elements.checkWebBridge.addEventListener("click", async () => {
  try {
    await refreshWebBridge({ loadingText: "Checking web bridge..." });
  } catch (error) {
    elements.webBridgeResult.textContent = safeUiErrorText(error);
  }
});
elements.copyRemotePack.addEventListener("click", async () => {
  try {
    await copyRemotePack();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.copyClaudePrompt.addEventListener("click", async () => {
  try {
    await copyClaudePrompt();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.copyChatGptPrompt.addEventListener("click", async () => {
  try {
    await copyChatGptPrompt();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.copyGrokPrompt.addEventListener("click", async () => {
  try {
    await copyGrokPrompt();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.copyTunnelCommand.addEventListener("click", async () => {
  try {
    await copyTunnelCommand();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.checkTunnelStatus.addEventListener("click", async () => {
  try {
    await refreshSecureTunnelStatus();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.startSecureTunnel.addEventListener("click", async () => {
  try {
    const confirmed = window.confirm(`Start a secure Jarvis MCP tunnel for remote agents? Keep the tunnel log private because it can contain a one-time bearer token.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Secure tunnel launch cancelled.";
      return;
    }
    elements.remoteAgentPrompt.textContent = "Starting secure Jarvis MCP tunnel...";
    const result = await arcigyApi.startSecureTunnel();
    if (result.logPath) state.secureTunnelLogPath = result.logPath;
    const status = result.alreadyRunning ? "Secure tunnel is already running." : result.started ? "Secure tunnel launch requested." : "Secure tunnel was not started.";
    elements.remoteAgentPrompt.textContent = [
      status,
      `Command: ${result.command ?? "npm run web:tunnel:secure"}`,
      result.pid ? `Process id: ${result.pid}` : null,
      result.logPath ? `Log: ${result.logPath}` : null,
      "After the tunnel prints ready, run smoke before giving the MCP pack to Claude, ChatGPT, or Grok.",
    ]
      .filter(Boolean)
      .join("\n");
    window.setTimeout(() => {
      void refreshSecureTunnelStatus().catch((error) => {
        elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
      });
    }, 2500);
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.stopSecureTunnel.addEventListener("click", async () => {
  try {
    const confirmed = window.confirm(`Stop the secure Jarvis MCP tunnel started from this desktop session? Remote agents will lose access immediately.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Secure tunnel stop cancelled.";
      return;
    }
    const result = await arcigyApi.stopSecureTunnel();
    if (result.logPath) state.secureTunnelLogPath = result.logPath;
    elements.remoteAgentPrompt.textContent = [
      result.stopped ? "Secure tunnel stop requested." : "No secure tunnel process is tracked in this desktop session.",
      result.pid ? `Process id: ${result.pid}` : null,
      result.logPath ? `Log: ${result.logPath}` : null,
      "Run Preflight before starting a new remote MCP handoff.",
    ]
      .filter(Boolean)
      .join("\n");
    await refreshSecureTunnelStatus();
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.openTunnelLog.addEventListener("click", async () => {
  try {
    if (!state.secureTunnelLogPath) {
      elements.remoteAgentPrompt.textContent = "Start or stop the secure tunnel first so Jarvis knows which local log to open.";
      return;
    }
    const confirmed = window.confirm(`Open the secure tunnel log? It can contain a one-time bearer token and should stay private.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Secure tunnel log open cancelled.";
      return;
    }
    const result = await arcigyApi.openPath(state.secureTunnelLogPath);
    elements.remoteAgentPrompt.textContent = result ? `Tunnel log open result: ${result}` : `Opened tunnel log: ${state.secureTunnelLogPath}`;
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.runRemoteSmoke.addEventListener("click", async () => {
  try {
    elements.remoteSmokeResult.textContent = "Running remote MCP smoke test...";
    elements.handoffProofGates.textContent = "checking safety gates";
    elements.handoffProofGates.dataset.state = "attention";
    const report = await arcigyApi.remoteMcpSmoke({ baseUrl: state.lastRemoteMcpPack?.baseUrl });
    renderRemoteMcpSmoke(report);
  } catch (error) {
    state.lastRemoteMcpSmoke = null;
    elements.remoteSmokeResult.textContent = safeUiErrorText(error);
    elements.handoffProofGates.textContent = "blocked: smoke error";
    elements.handoffProofGates.dataset.state = "attention";
    if (state.lastRemoteMcpPack) elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(state.lastRemoteMcpPack, null);
  }
});
elements.readinessReport.addEventListener("click", async () => {
  try {
    elements.commandTimeline.textContent = "Building live production readiness report...";
    const report = await arcigyApi.productionReadiness({ live: true });
    renderLaunchQueue(report);
    elements.commandTimeline.textContent = report.summary;
    elements.response.textContent = renderReadinessReport(report);
  } catch (error) {
    elements.commandTimeline.textContent = safeUiErrorText(error);
  }
});
elements.operatorBriefing.addEventListener("click", async () => {
  try {
    await refreshOperatorBriefing({ speakResult: true, loadingText: "Building live operator briefing...", live: true });
  } catch (error) {
    elements.commandTimeline.textContent = safeUiErrorText(error);
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
    elements.leadResult.textContent = safeUiErrorText(error);
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
    elements.leadResult.textContent = safeUiErrorText(error);
  }
});
elements.draftContractIntake.addEventListener("click", async () => {
  try {
    const brief = requiredInputValue(elements.contractBrief, "Contract brief is required before AI drafting.");
    elements.contractResult.textContent = "Drafting contract intake with Gemini...";
    const baseIntake = safeParseContractIntake();
    const intake = await arcigyApi.draftContractIntake({
      brief,
      baseIntake,
    });
    fillContractForm(intake);
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    state.contractFormDirty = false;
    elements.contractResult.textContent = "AI contract intake draft applied. Review it before generating DOCX files.";
  } catch (error) {
    elements.contractResult.textContent = safeUiErrorText(error);
  }
});
elements.applyContractForm.addEventListener("click", () => {
  try {
    const intake = buildContractIntakeFromForm();
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    state.contractFormDirty = false;
    elements.contractResult.textContent = "Contract form applied to intake JSON.";
  } catch (error) {
    elements.contractResult.textContent = safeUiErrorText(error);
  }
});
elements.generateContracts.addEventListener("click", async () => {
  try {
    if (state.contractFormDirty) {
      elements.contractResult.textContent = "Apply the contract form before generating so the visible form and intake JSON match.";
      return;
    }
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
    elements.contractResult.textContent = safeUiErrorText(error);
  }
});

const initialContractIntake = sampleContractIntake();
setupNavigation();
setupContractFormDirtyTracking();
fillContractForm(initialContractIntake);
elements.contractIntake.value = JSON.stringify(initialContractIntake, null, 2);
state.contractFormDirty = false;
elements.contractBrief.value =
  "Klient Test Klient s. r. o. chce klientsky automatizacny portal na spracovanie leadov, internych uloh a reportov. Implementacia 2000 EUR, mesacne 200 EUR, trvanie 6 mesiacov.";
elements.memoryEmail.value = "client@example.com";
elements.memorySubject.value = "Onboarding automatizacia";
elements.memoryMessage.value = "Potrebujem upravit onboarding automatizaciu do piatku.";
elements.clientMessage.value = "Potrebujem upravit onboarding automatizaciu do piatku.";
elements.gmailQuery.value = "in:inbox newer_than:7d";
elements.leadQuery.value = "automation agency Bratislava";
renderOperatorBriefingCards({
  summary: "Loading operator briefing...",
  sections: {
    readiness: "Readiness is checking.",
    coldOutreach: "Outreach brief is loading.",
    clientNeeds: "Client memory watch is starting.",
    preparedReplies: "Approval queue is loading.",
    nextAction: "Loading next action.",
  },
});
void refreshHealth();
startWebBridgeWatch();
startOperatorBriefingWatch();
startClientNeedWatch();
setMode("idle");
