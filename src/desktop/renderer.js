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
  lastRemoteAgentLaunchBundle: null,
  lastRemoteMcpSmoke: null,
  lastReadinessNoticeSignature: null,
  lastAttentionDigestNoticeSignature: null,
  clientAlertWatchEnabled: true,
  clientAlertPollTimer: null,
  lastClientNeedAlerts: [],
  seenClientNeedAlertIds: new Set(),
  clientAlertPollMs: 60000,
  clientAlertGmailSyncPollMs: 300000,
  lastClientAlertGmailSyncAt: 0,
  lastClientAlertGmailSyncSummary: "Gmail auto-sync caka.",
  contractFormDirty: false,
  secureTunnelLogPath: null,
  lastSecureTunnelStatus: null,
  lastSystemHealth: null,
  lastBridgePreflight: null,
  lastReadinessReport: null,
  lastProductionEvidence: null,
  lastCapabilityAudit: null,
};

const requiredRemoteSmokeGates = [
  "manifest",
  "tool-count",
  "manifest-tool-registry",
  "manifest-tool-metadata",
  "auth-placeholder",
  "manifest-local-write-policy",
  "action-manifest",
  "openapi-schema",
  "cors-preflight",
  "external-auth-gate",
  "connection-pack",
  "pack-secret-policy",
  "pack-auth-throttle-policy",
  "pack-limits",
  "pack-tunnel-controls",
  "secure-tunnel-status",
  "pack-local-write-policy",
  "pack-tool-registry",
  "pack-quick-start-urls",
  "pack-quick-start-approval-policy",
  "pack-quick-start-exact-mcp-calls",
  "pack-contract-quick-start",
  "pack-contract-draft-quick-start",
  "pack-agent-setup-profiles",
  "pack-agent-launch-bundle",
  "pack-voice-quick-start",
  "pack-handoff-proof",
  "pack-agent-compatibility",
  "pack-client-memory-quick-start",
  "pack-audit-quick-start",
  "voice-tool-call",
  "pack-production-evidence-quick-start",
  "read-only-tool-call",
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
  releaseProofGrid: document.querySelector("#releaseProofGrid"),
  launchChecklist: document.querySelector("#launchChecklist"),
  workflowProofGrid: document.querySelector("#workflowProofGrid"),
  operationsRadar: document.querySelector("#operationsRadar"),
  radarRemoteProof: document.querySelector("#radarRemoteProof"),
  radarLiveChecks: document.querySelector("#radarLiveChecks"),
  radarApprovals: document.querySelector("#radarApprovals"),
  radarClientAlerts: document.querySelector("#radarClientAlerts"),
  radarSweepLabel: document.querySelector("#radarSweepLabel"),
  fullLaunchCheck: document.querySelector("#fullLaunchCheck"),
  readinessReport: document.querySelector("#readinessReport"),
  operatorBriefing: document.querySelector("#operatorBriefing"),
  capabilityAudit: document.querySelector("#capabilityAudit"),
  capabilityAuditPanel: document.querySelector("#capabilityAuditPanel"),
  capabilityAuditStatus: document.querySelector("#capabilityAuditStatus"),
  capabilityAuditSummary: document.querySelector("#capabilityAuditSummary"),
  capabilityAuditToolCount: document.querySelector("#capabilityAuditToolCount"),
  capabilityAuditApprovalCount: document.querySelector("#capabilityAuditApprovalCount"),
  capabilityAuditLocalWriteCount: document.querySelector("#capabilityAuditLocalWriteCount"),
  capabilityAuditEvidence: document.querySelector("#capabilityAuditEvidence"),
  capabilityAuditGrid: document.querySelector("#capabilityAuditGrid"),
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
  approvalQueueGrid: document.querySelector("#approvalQueueGrid"),
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
  providerFallbackGrid: document.querySelector("#providerFallbackGrid"),
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
  remoteMissionStatus: document.querySelector("#remoteMissionStatus"),
  remoteMissionPack: document.querySelector("#remoteMissionPack"),
  remoteMissionSmoke: document.querySelector("#remoteMissionSmoke"),
  remoteMissionEvidence: document.querySelector("#remoteMissionEvidence"),
  remoteMissionAgents: document.querySelector("#remoteMissionAgents"),
  webBridgeResult: document.querySelector("#webBridgeResult"),
  handoffStatus: document.querySelector("#handoffStatus"),
  handoffManifestUrl: document.querySelector("#handoffManifestUrl"),
  handoffToolPattern: document.querySelector("#handoffToolPattern"),
  handoffTunnelCommand: document.querySelector("#handoffTunnelCommand"),
  handoffSmokeUrl: document.querySelector("#handoffSmokeUrl"),
  handoffApprovalTools: document.querySelector("#handoffApprovalTools"),
  handoffLocalWriteTools: document.querySelector("#handoffLocalWriteTools"),
  handoffProofGates: document.querySelector("#handoffProofGates"),
  handoffLaunchBundle: document.querySelector("#handoffLaunchBundle"),
  handoffWritePolicy: document.querySelector("#handoffWritePolicy"),
  launchBundleStrip: document.querySelector("#launchBundleStrip"),
  launchBeforeWork: document.querySelector("#launchBeforeWork"),
  launchBeforeWrites: document.querySelector("#launchBeforeWrites"),
  launchAgentPrompt: document.querySelector("#launchAgentPrompt"),
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
  remoteProofMatrix: document.querySelector("#remoteProofMatrix"),
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
const listenButtonLabels = {
  start: "Zapnut",
  stop: "Vypnut",
};
const arcigyApi = window.arcigyDesktop ?? {
  openPath: async () => "desktop-only",
  systemHealth: () => getJson("/api/system-health"),
  coldOutreachBrief: (payload) => postJson("/api/cold-outreach-brief", { ...payload, live: payload?.live ?? true }),
  jarvisVoiceEvent: (payload) => postJson("/api/jarvis/voice-event", payload),
  runDiagnostics: (payload) => postJson("/api/run-diagnostics", payload),
  productionReadiness: (payload) => postJson("/api/production-readiness", payload),
  productionVerificationEvidence: () => getJson("/api/production-verification-evidence"),
  jarvisCapabilityAudit: (payload) => postJson("/api/mcp/arcigy.get_jarvis_capability_audit", payload).then((value) => value.result),
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
  remoteAgentLaunchBundle: () => getJson("/api/remote-agent-launch-bundle?includeReadiness=false"),
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
  elements.statusBadge.textContent = mode === "idle" ? "Pripraveny" : mode === "awake" ? "Aktivny" : "Pocuva";
  elements.orb.dataset.mode = mode;
  setMissionSignal(elements.missionVoice, mode === "idle" ? "pripraveny" : voiceModeLabel(mode), mode === "idle" ? "ready" : "attention");
  setCortexSignal(elements.cortexVoice, mode === "idle" ? "pripraveny" : voiceModeLabel(mode), mode === "idle" ? "ready" : "attention");
  updateVoiceRuntimeStatus();
}

function voiceModeLabel(mode) {
  if (mode === "idle") return "pripraveny";
  if (mode === "awake") return "aktivny";
  if (mode === "processing") return "spracuvam";
  if (mode === "listening") return "pocuva";
  return String(mode ?? "neznamy");
}

function updateVoiceRuntimeStatus(eventText) {
  const inputReady = Boolean(SpeechRecognition);
  const runtimeState = state.listening || state.mode === "awake" || state.mode === "processing" ? "attention" : "ready";
  elements.voiceRuntime.dataset.state = runtimeState;
  elements.voiceMode.textContent = state.listening ? "pocuva" : voiceModeLabel(state.mode);
  elements.voiceInput.textContent = inputReady ? "mikrofon ready" : "text fallback";
  elements.voiceOutput.textContent = speechOutputAvailable ? "hlas ready" : "iba obrazovka";
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
  state.lastSystemHealth = health;
  state.lastBridgePreflight = bridge;
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
  updateOperationsRadar();
}

function renderLaunchQueue(report) {
  state.lastReadinessReport = report;
  const status = report.status ?? "unknown";
  const attentionQueue = report.attentionQueue ?? [];
  const launchChecklist = report.launchChecklist ?? [];
  const nextAction = report.nextActions?.[0] ?? "Netreba akciu. Pred zmenami dalej spustaj production verification.";
  const attention = attentionQueue[0];
  elements.launchQueue?.setAttribute("data-state", status === "ready" ? "ready" : "attention");
  elements.launchStatus.textContent = status;
  elements.launchNextAction.textContent = nextAction;
  elements.launchAttention.textContent = attention ? `${attention.severity}: ${attention.title}` : "ciste";
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
  renderWorkflowProofMatrix(launchChecklist);
  updateOperationsRadar();
}

function renderWorkflowProofMatrix(launchChecklist) {
  if (!elements.workflowProofGrid) return;
  const workflowItems = launchChecklist.filter((item) => String(item.id ?? "").endsWith("-workflow"));
  elements.workflowProofGrid.replaceChildren();
  if (!workflowItems.length) {
    const empty = document.createElement("div");
    empty.className = "workflowProofCard";
    empty.dataset.state = "attention";
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    label.textContent = "Workflow proof";
    title.textContent = "readiness gates nenacitane";
    detail.textContent = "Spusti readiness report alebo production verification.";
    empty.append(label, title, detail);
    elements.workflowProofGrid.appendChild(empty);
    return;
  }
  for (const item of workflowItems) {
    const card = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    card.className = "workflowProofCard";
    card.dataset.state = item.status === "ready" ? "ready" : item.status === "blocked" ? "blocked" : "attention";
    label.textContent = item.status === "ready" ? "verified" : item.status ?? "attention";
    title.textContent = item.title ?? item.id;
    detail.textContent = item.proof ?? item.nextAction ?? "Workflow proof caka na readiness.";
    card.append(label, title, detail);
    elements.workflowProofGrid.appendChild(card);
  }
}

function renderProductionVerificationEvidence(evidence) {
  state.lastProductionEvidence = evidence;
  if (!elements.verificationEvidence) return;
  const status = evidence?.status ?? "missing";
  const freshness = evidence?.freshness && typeof evidence.freshness === "object" ? evidence.freshness : null;
  const fresh = freshness?.fresh === true;
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const ready = checks.filter((check) => check?.status === "ready").length;
  const failed = checks.filter((check) => check?.status === "failed").length;
  const generatedAt = evidence?.generatedAt ? new Date(evidence.generatedAt).toLocaleString() : "negenerovane";
  elements.verificationEvidence.textContent = status === "ready" && fresh ? `${ready} gates ready` : `${status}: ${failed} failed`;
  elements.verificationEvidence.title = `${evidence?.summary ?? "Run npm run verify:production."} ${generatedAt}`;
  elements.verificationEvidence.closest("div")?.setAttribute("data-state", status === "ready" && fresh ? "ready" : "attention");
  renderReleaseProof(evidence, generatedAt);
  updateOperationsRadar();
  updateRemoteMissionStatus();
}

function renderCapabilityAudit(audit) {
  state.lastCapabilityAudit = audit;
  if (!elements.capabilityAuditGrid) return;
  const status = audit?.status ?? "attention";
  const evidence = audit?.productionEvidence ?? {};
  const evidenceText = [
    evidence.status ?? "missing",
    evidence.fresh ? "fresh" : "stale",
    evidence.dirty === false ? "clean" : "dirty",
    `${evidence.requiredRemoteMcpSmokeGates ?? 0} gates`,
  ].join(" / ");
  elements.capabilityAuditPanel?.setAttribute("data-state", status === "ready" ? "ready" : status === "blocked" ? "blocked" : "attention");
  elements.capabilityAuditStatus.textContent = status;
  elements.capabilityAuditSummary.textContent = audit?.summary ?? "Jarvis capability audit nie je nacitany.";
  elements.capabilityAuditToolCount.textContent = String(audit?.toolCount ?? "--");
  elements.capabilityAuditApprovalCount.textContent = String(audit?.approvalRequiredCount ?? "--");
  elements.capabilityAuditLocalWriteCount.textContent = String(audit?.localStateWriteCount ?? "--");
  elements.capabilityAuditEvidence.textContent = evidenceText;
  elements.capabilityAuditGrid.replaceChildren();
  for (const item of audit?.capabilities ?? []) {
    const card = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const proof = document.createElement("p");
    const meta = document.createElement("code");
    card.className = "capabilityCard";
    card.dataset.state = item.status === "ready" ? "ready" : item.status === "blocked" ? "blocked" : "attention";
    label.textContent = item.status;
    title.textContent = item.title ?? item.id;
    proof.textContent = (item.proof ?? []).join(" ");
    meta.textContent = [
      `Tooly: ${(item.tools ?? []).join(", ") || "ziadne"}`,
      `Schvalenia: ${(item.approvalRequired ?? []).join(", ") || "ziadne"}`,
      `Evidence: ${(item.evidence ?? []).join(", ") || "ziadne"}`,
      `Dalsi krok: ${item.nextAction ?? "Drz proof cerstvy."}`,
    ].join("\n");
    card.append(label, title, proof, meta);
    elements.capabilityAuditGrid.appendChild(card);
  }
}

function renderCapabilityAuditText(audit) {
  return [
    audit.summary ?? `Jarvis capability audit: ${audit.status}`,
    "",
    `Status: ${audit.status}`,
    `MCP tooly: ${audit.toolCount}`,
    `Schvalovacie zamky: ${audit.approvalRequiredCount}`,
    `Lokalne zapisy: ${audit.localStateWriteCount}`,
    `Production evidence: ${audit.productionEvidence?.status ?? "missing"}; fresh=${audit.productionEvidence?.fresh === true}; clean=${audit.productionEvidence?.dirty === false}; gates=${audit.productionEvidence?.requiredRemoteMcpSmokeGates ?? 0}`,
    "",
    ...(audit.capabilities ?? []).map((item) =>
      [
        `- [${item.status}] ${item.title}`,
        `  Proof: ${(item.proof ?? []).join(" ")}`,
        `  Tooly: ${(item.tools ?? []).join(", ")}`,
        `  Dalsi krok: ${item.nextAction}`,
      ].join("\n")
    ),
    "",
    "Dalsie kroky:",
    ...(audit.nextActions ?? []).map((action) => `- ${action}`),
  ].join("\n");
}

function renderReleaseProof(evidence, generatedAt) {
  if (!elements.releaseProofGrid) return;
  const release = evidence?.release && typeof evidence.release === "object" ? evidence.release : {};
  const freshness = evidence?.freshness && typeof evidence.freshness === "object" ? evidence.freshness : {};
  const gates = Array.isArray(release.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates.length : 0;
  const dirty = typeof release.dirty === "boolean" ? (release.dirty ? "dirty" : "clean") : "unknown";
  const fresh = freshness.fresh === true ? `fresh ${freshness.ageHours}h` : "stale or missing";
  const items = [
    ["Commit", release.shortCommit || "neoverene"],
    ["Tree", dirty],
    ["MCP gates", gates ? String(gates) : "neoverene"],
    ["Freshness", fresh],
  ];
  elements.releaseProofGrid.replaceChildren();
  for (const [label, value] of items) {
    const row = document.createElement("div");
    const key = document.createElement("dt");
    const val = document.createElement("dd");
    key.textContent = label;
    val.textContent = String(value);
    row.append(key, val);
    elements.releaseProofGrid.appendChild(row);
  }
  elements.releaseProofGrid
    .closest(".releaseProof")
    ?.setAttribute("data-state", evidence?.status === "ready" && dirty === "clean" && freshness.fresh === true ? "ready" : "attention");
}

function updateOperationsRadar() {
  if (!elements.operationsRadar) return;
  const smokeProof = state.lastRemoteMcpSmoke ? summarizeRemoteProofGates(state.lastRemoteMcpSmoke) : null;
  const release = state.lastProductionEvidence?.release && typeof state.lastProductionEvidence.release === "object" ? state.lastProductionEvidence.release : {};
  const freshness =
    state.lastProductionEvidence?.freshness && typeof state.lastProductionEvidence.freshness === "object" ? state.lastProductionEvidence.freshness : {};
  const checks = Array.isArray(state.lastProductionEvidence?.checks) ? state.lastProductionEvidence.checks : [];
  const readyChecks = checks.filter((check) => check?.status === "ready").length;
  const gates = Array.isArray(release.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates.length : 0;
  const approvals = state.lastReadinessReport?.mcp?.approvalRequired ?? state.lastBridgePreflight?.riskyToolsRequiringApproval ?? [];
  const clientAlerts = Number(state.lastClientNeedAlerts.length);
  const proofReady =
    smokeProof?.ready === true ||
    (state.lastProductionEvidence?.status === "ready" && release.dirty === false && gates === requiredRemoteSmokeGates.length && freshness.fresh === true);
  const checksReady = state.lastProductionEvidence?.status === "ready" && freshness.fresh === true && checks.length > 0 && readyChecks === checks.length;
  setRadarNode(
    elements.radarRemoteProof,
    smokeProof ? smokeProof.text : gates ? `evidence ${gates}/${requiredRemoteSmokeGates.length} gates` : "smoke caka",
    proofReady ? "ready" : "attention"
  );
  setRadarNode(elements.radarLiveChecks, checks.length ? `${readyChecks}/${checks.length} checks` : "evidence caka", checksReady ? "ready" : "attention");
  setRadarNode(elements.radarApprovals, `${approvals.length} zamknute`, approvals.length ? "ready" : "attention");
  setRadarNode(
    elements.radarClientAlerts,
    clientAlerts ? `${clientAlerts} otvorene poziadavky` : state.clientAlertWatchEnabled ? "watch cisty" : "watch pauznuty",
    clientAlerts ? "attention" : state.clientAlertWatchEnabled ? "ready" : "attention"
  );
  const radarReady = proofReady && checksReady && !clientAlerts;
  elements.operationsRadar.setAttribute("data-state", radarReady ? "ready" : "attention");
  elements.radarSweepLabel.textContent = radarReady ? "Jarvis takticky radar je stabilny" : "Jarvis takticky radar sleduje attention";
}

function updateRemoteMissionStatus() {
  if (!elements.remoteMissionStatus) return;
  const pack = state.lastRemoteMcpPack;
  const matchingSmoke = pack && state.lastRemoteMcpSmoke?.baseUrl === pack.baseUrl ? state.lastRemoteMcpSmoke : null;
  const smokeProof = matchingSmoke ? summarizeRemoteProofGates(matchingSmoke) : null;
  const release = state.lastProductionEvidence?.release && typeof state.lastProductionEvidence.release === "object" ? state.lastProductionEvidence.release : {};
  const freshness =
    state.lastProductionEvidence?.freshness && typeof state.lastProductionEvidence.freshness === "object" ? state.lastProductionEvidence.freshness : {};
  const evidenceGates = Array.isArray(release.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates.length : 0;
  const evidenceReady =
    state.lastProductionEvidence?.status === "ready" &&
    release.dirty === false &&
    freshness.fresh === true &&
    evidenceGates === requiredRemoteSmokeGates.length;
  const profiles = Array.isArray(pack?.agentSetupProfiles) ? pack.agentSetupProfiles : [];
  const requiredAgents = ["Claude", "ChatGPT", "Grok"];
  const agentReady = requiredAgents.every((agent) =>
    profiles.some((profile) => String(profile.agent ?? "").toLowerCase() === agent.toLowerCase() && profile.importUrl && profile.firstTool)
  );
  const packReady = Boolean(pack?.tools?.count && pack?.agentLaunchBundle && profiles.length >= requiredAgents.length && pack?.auth?.header);
  const smokeReady = smokeProof?.ready === true;
  setRemoteMissionNode(elements.remoteMissionPack, packReady ? `${pack.tools.count} toolov, launch bundle ready` : "preflight este nenacitany", packReady);
  setRemoteMissionNode(
    elements.remoteMissionSmoke,
    smokeReady ? `ready ${requiredRemoteSmokeGates.length}/${requiredRemoteSmokeGates.length}` : smokeProof?.text ?? "spusti smoke pred handoffom",
    smokeReady
  );
  setRemoteMissionNode(
    elements.remoteMissionEvidence,
    evidenceReady ? `fresh ${freshness.ageHours ?? 0}h, clean tree` : state.lastProductionEvidence ? "evidence potrebuje refresh" : "caka na verify",
    evidenceReady
  );
  setRemoteMissionNode(elements.remoteMissionAgents, agentReady ? "Claude / ChatGPT / Grok ready" : "agent profiles cakaju", agentReady);
  elements.remoteMissionStatus.setAttribute("data-state", packReady && smokeReady && evidenceReady && agentReady ? "ready" : "attention");
}

function setRemoteMissionNode(node, text, ready) {
  if (!node) return;
  node.textContent = text;
  node.dataset.state = ready ? "ready" : "attention";
  node.closest("div")?.setAttribute("data-state", ready ? "ready" : "attention");
}

function setRadarNode(node, text, stateName) {
  if (!node) return;
  node.textContent = text;
  node.closest(".radarNode")?.setAttribute("data-state", stateName);
}

function buildCommandTimeline(blockers, bridge, advisories = []) {
  const bridgeState = bridge ? (bridge.readyForTunnel ? "MCP bridge je pripraveny na tunel." : "MCP bridge potrebuje attention.") : "MCP bridge preflight nie je nacitany.";
  if (!blockers.length) {
    const advisoryText = advisories.length ? ` Non-blocking advisory: ${advisories.map((item) => item.key).join(", ")}.` : "";
    return `Vsetky povinne integracne gates su ready.${advisoryText} ${bridgeState}`;
  }
  const blockerText = blockers
    .map((item) => `${item.key}: ${(item.missing ?? []).join(", ")}`)
    .slice(0, 3)
    .join(" | ");
  return `${blockers.length} integration gate potrebuje attention. ${blockerText}. ${bridgeState}`;
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
  setMissionSignal(elements.missionGmail, gmail?.configured ? (state.clientAlertWatchEnabled ? "watch aktivny" : "pauznuty") : "chyba auth", gmail?.configured ? "ready" : "attention");
  setMissionSignal(elements.missionRemote, bridge ? (bridge.readyForTunnel ? "ready" : "zamknute") : "kontrola", bridge ? (bridge.readyForTunnel ? "ready" : "attention") : "checking");
  setMissionSignal(elements.missionContracts, gemini?.configured ? "Gemini ready" : "chyba Gemini", gemini?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexOutreach, smartlead?.configured ? "Smartlead ready" : "chyba key", smartlead?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexMemory, gmail?.configured ? (state.clientAlertWatchEnabled ? "Gmail watch" : "watch pauznuty") : "chyba Gmail", gmail?.configured && state.clientAlertWatchEnabled ? "ready" : "attention");
  setCortexSignal(elements.cortexContracts, gemini?.configured ? "Gemini intake" : "chyba Gemini", gemini?.configured ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, bridge ? (bridge.readyForTunnel ? "tunel ready" : "auth zamok") : "kontrola", bridge ? (bridge.readyForTunnel ? "ready" : "attention") : "checking");
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
    `Integracie: ${report.integrations?.ready ?? "--"}/${report.integrations?.total ?? "--"}`,
    `MCP tools: ${report.mcp?.toolCount ?? "--"}`,
    `Schvalovacie zamky: ${(report.mcp?.approvalRequired ?? []).length}`,
    "",
    launchChecklist.length ? "Launch checklist:" : "Launch checklist: nie je nacitany",
    ...launchChecklist.map((item) => [`- [${item.status}] ${item.title}`, `  Proof: ${item.proof}`, `  Dalsi krok: ${item.nextAction}`].join("\n")),
    "",
    launchEvidence ? `Launch evidence: ${launchEvidence.decision}` : "Launch evidence: nie je nacitana",
    ...proofGates.map((gate) => [`- [${gate.status}] ${gate.title}`, `  Proof: ${gate.proof}`, `  Validacia: ${gate.validationCommand}`].join("\n")),
    launchEvidence?.remoteHandoff
      ? [
          `Remote handoff: ${launchEvidence.remoteHandoff.tunnelCommand}`,
          `Smoke: ${launchEvidence.remoteHandoff.smokeCommand}`,
          `Dalsi krok: ${launchEvidence.operatorNextAction}`,
        ].join("\n")
      : null,
    "",
    blockers.length ? "Blockers:" : "Blockers: ziadne",
    ...blockers.map((blocker) => `- ${blocker.key}: ${blocker.message}`),
    "",
    attentionQueue.length ? "Attention queue:" : "Attention queue: cista",
    ...attentionQueue.map((item) =>
      [`- [${item.severity}] ${item.title}`, `  Zdroj: ${item.source}`, `  Dalsi krok: ${item.nextAction}`, `  Validacia: ${item.validationCommand}`].join("\n")
    ),
    "",
    "Dalsie kroky:",
    ...(report.nextActions ?? []).map((action) => `- ${action}`),
    "",
    "Fix guide:",
    ...(report.fixGuide ?? []).map((step) =>
      [`- ${step.title}`, `  Env: ${(step.envKeys ?? []).join(", ") || "none"}`, `  Validacia: ${step.validationCommand}`, `  ${step.detail}`].join("\n")
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
    sections.productionEvidence,
    sections.providerFallback,
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
    { key: "productionEvidence", label: "Evidence", value: sections.productionEvidence, state: evidenceCardState(sections.productionEvidence) },
    { key: "providerFallback", label: "Fallbacky", value: sections.providerFallback, state: textHasAttention(sections.providerFallback) ? "attention" : "ready" },
    { key: "coldOutreach", label: "Outreach", value: sections.coldOutreach, state: textHasAttention(sections.coldOutreach) ? "attention" : "ready" },
    { key: "clientNeeds", label: "Klientske poziadavky", value: sections.clientNeeds, state: textHasAttention(sections.clientNeeds) ? "attention" : "ready" },
    { key: "preparedReplies", label: "Schvalenia", value: sections.preparedReplies, state: textHasAttention(sections.preparedReplies) ? "attention" : "ready" },
    { key: "nextAction", label: "Dalsi krok", value: sections.nextAction, state: "attention" },
  ];
  elements.briefingGrid.replaceChildren();
  for (const card of cards) {
    const node = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    node.className = "briefingCard";
    node.setAttribute("data-state", card.state);
    label.textContent = card.label;
    value.textContent = card.value || "Signal este nie je nacitany.";
    node.append(label, value);
    elements.briefingGrid.appendChild(node);
  }
}

function evidenceCardState(value) {
  const text = String(value ?? "");
  if (/stale|missing|failed|needs attention|attention/i.test(text)) return "attention";
  return /Production verification ready/i.test(text) ? "ready" : "attention";
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

function trackAttentionDigestNoticeFromBriefing(briefing) {
  const sections = briefing.sections ?? {};
  const clientNeeds = String(sections.clientNeeds ?? "");
  const preparedReplies = String(sections.preparedReplies ?? "");
  const clientNeedCount = extractLeadingSectionCount(clientNeeds);
  const preparedReplyCount = extractLeadingSectionCount(preparedReplies);
  const signals = [];
  if (clientNeedCount > 0) signals.push(clientNeeds);
  if (preparedReplyCount > 0) signals.push(preparedReplies);
  if (!signals.length) {
    state.lastAttentionDigestNoticeSignature = null;
    return;
  }
  const signature = signals.join(" | ");
  if (state.lastAttentionDigestNoticeSignature === signature) return;
  state.lastAttentionDigestNoticeSignature = signature;
  notifyOperator("Jarvis attention digest", signature, "arcigy-jarvis-attention-digest");
}

function extractLeadingSectionCount(value) {
  const match = String(value ?? "").match(/:\s*([1-9]\d*)\b/);
  return match ? Number(match[1]) : 0;
}

async function refreshOperatorBriefing({ speakResult = false, loadingText = null, live = true } = {}) {
  if (loadingText) elements.commandTimeline.textContent = loadingText;
  const briefing = await arcigyApi.operatorBriefing({ periodLabel: "poslednych 7 dni", live });
  elements.commandTimeline.textContent = briefing.sections?.nextAction ?? briefing.summary;
  elements.response.textContent = renderOperatorBriefing(briefing);
  renderOperatorBriefingCards(briefing);
  trackReadinessNoticeFromBriefing(briefing);
  trackAttentionDigestNoticeFromBriefing(briefing);
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
    try {
      renderCapabilityAudit(await arcigyApi.jarvisCapabilityAudit({ live: false }));
    } catch (error) {
      if (elements.capabilityAuditStatus) {
        elements.capabilityAuditStatus.textContent = "attention";
        elements.capabilityAuditSummary.textContent = safeUiErrorText(error);
      }
    }
  } catch (error) {
    elements.healthGrid.textContent = safeUiErrorText(error);
    elements.commandTimeline.textContent = safeUiErrorText(error);
  }
}

async function runFullLaunchCheck() {
  elements.commandTimeline.textContent = "Spustam kompletny Jarvis launch proof...";
  const health = await arcigyApi.systemHealth();
  renderHealth(health);
  const bridge = await arcigyApi.webBridgePreflight();
  renderCommandDeck(health, bridge);
  const readiness = await arcigyApi.productionReadiness({ live: true });
  renderLaunchQueue(readiness);
  const evidence = await arcigyApi.productionVerificationEvidence();
  renderProductionVerificationEvidence(evidence);
  const audit = await arcigyApi.jarvisCapabilityAudit({ live: true });
  renderCapabilityAudit(audit);
  const smoke = await arcigyApi.remoteMcpSmoke({ baseUrl: state.lastRemoteMcpPack?.baseUrl });
  renderRemoteMcpSmoke(smoke);
  const summary = renderFullLaunchProof({ health, bridge, readiness, evidence, audit, smoke });
  const firstLine = summary.split("\n")[0] ?? "Full launch proof finished.";
  elements.response.textContent = summary;
  elements.commandTimeline.textContent = firstLine;
  speak(firstLine);
  elements.response.textContent = summary;
}

function renderFullLaunchProof({ health, bridge, readiness, evidence, audit, smoke }) {
  const integrations = health?.integrations ?? [];
  const productionSafeIntegrations = integrations.filter((item) => item.configured || item.requiredForProduction === false).length;
  const release = evidence?.release && typeof evidence.release === "object" ? evidence.release : {};
  const freshness = evidence?.freshness && typeof evidence.freshness === "object" ? evidence.freshness : {};
  const gates = Array.isArray(release.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates.length : 0;
  const smokeGates = summarizeRemoteProofGates(smoke);
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const blocking = blockers.filter((item) => item?.severity === "blocking");
  const advisories = blockers.filter((item) => item?.severity === "warning");
  const coreProofReady =
    bridge?.readyForTunnel === true &&
    evidence?.status === "ready" &&
    release.dirty === false &&
    freshness.fresh === true &&
    smoke?.status === "ready";
  const headline = !coreProofReady || blocking.length
    ? "Jarvis full launch proof needs attention."
    : advisories.length
      ? "Jarvis full launch proof is ready with advisory."
      : "Jarvis full launch proof is ready.";
  return [
    headline,
    `Integracie: ${productionSafeIntegrations}/${integrations.length || "--"} production-safe.`,
    `Bridge: ${bridge?.readyForTunnel ? "ready na tunel" : "potrebuje token alebo preflight attention"}.`,
    `Readiness: ${readiness?.status ?? "unknown"}; ${blocking.length} blocking, ${advisories.length} advisory.`,
    `Capability audit: ${audit?.status ?? "unknown"}; ${(audit?.capabilities ?? []).filter((item) => item.status === "ready").length}/${(audit?.capabilities ?? []).length || "--"} groups ready.`,
    `Production evidence: ${evidence?.status ?? "missing"}, tree ${release.dirty === false ? "clean" : "not clean"}, freshness ${
      freshness.fresh === true ? `fresh ${freshness.ageHours}h` : "stale or missing"
    }.`,
    `Remote MCP smoke: ${smokeGates ? smokeGates.text : smoke?.status ?? "neoverene"}; required gates ${gates}/${requiredRemoteSmokeGates.length}.`,
    blocking[0]?.nextAction
      ? `Dalsi krok: ${blocking[0].nextAction}`
      : advisories[0]?.nextAction
        ? `Advisory: ${advisories[0].nextAction}`
        : "Dalsi krok: drz proof cerstvy pred remote agent handoff.",
  ].join("\n");
}

function renderLeadDiscovery(result) {
  const leads = result.leads ?? [];
  const sources = (result.sources ?? []).join(", ") || "ziadne";
  const providerLines = (result.providerStatus ?? []).map((provider) => `${provider.source}: ${provider.status}${provider.message ? ` - ${provider.message}` : ""}`);
  if (!leads.length) {
    return [`Ziadne leady nenajdene. Overene zdroje: ${sources}.`, ...providerLines].join("\n");
  }
  return [
    `Najdene leady: ${leads.length}. Zdroje: ${sources}.`,
    ...providerLines,
    "",
    ...leads.map((lead, index) =>
      [
        `${index + 1}. ${lead.name}`,
        lead.website ? `   Web: ${lead.website}` : null,
        lead.phone ? `   Phone: ${lead.phone}` : null,
        lead.address ? `   Adresa: ${lead.address}` : null,
        lead.source ? `   Zdroj: ${lead.source}` : null,
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
  if (!synced.length) return "Nebol synchronizovany ziadny Gmail ucet.";
  const fetched = synced.reduce((sum, item) => sum + Number(item.fetched ?? 0), 0);
  const alerts = synced.reduce((sum, item) => sum + (item.alerts ?? []).length, 0);
  setCortexSignal(elements.cortexMemory, alerts ? `${alerts} alertov` : `${fetched} emailov`, alerts ? "attention" : "ready");
  const modeLine = result.dryRun ? "Nahlad bez zapisu: 0 lokalnych zaznamov." : "Lokalna pamat ulozila nove zaznamy a preskocila duplicity.";
  return synced
    .map((item) =>
      [
        modeLine,
        `${item.account}: nacitane ${item.fetched}, ulozene ${item.created ?? item.ingested}, preskocene duplicity ${item.duplicates ?? 0}`,
        ...(item.alerts ?? []).map((alert) => `Alert: ${alert}`),
        ...(item.preview ?? []).map((event) => `Nahlad: ${event.fromEmail} - ${event.subject ?? "bez predmetu"}`),
      ].join("\n")
    )
    .join("\n\n");
}

function renderPreparedReplies(result) {
  const replies = result.replies ?? [];
  if (!replies.length) return result.summary ?? "Ziadne pripravene odpovede necakaju na schvalenie.";
  return [
    result.summary ?? `Pripravene odpovede: ${replies.length}`,
    "",
    ...replies.slice(0, 8).map((reply, index) =>
      [
        `${index + 1}. ${reply.leadEmail}`,
        reply.campaignName ? `   Kampan: ${reply.campaignName}` : null,
        reply.subject ? `   Predmet: ${reply.subject}` : null,
        reply.positiveSignal ? `   Signal: ${reply.positiveSignal}` : null,
        `   Odpoved: ${reply.replyText ?? "-"}`,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

function renderApprovalQueue(result) {
  const items = result.items ?? [];
  renderApprovalQueueGrid(items);
  if (!items.length) return result.summary ?? "Schvalovacia fronta je prazdna.";
  return [
    result.summary ?? `Schvalovacia fronta: ${items.length}`,
    "",
    ...items.slice(0, 10).map((item, index) =>
      [
        `${index + 1}. ${item.title ?? item.type}`,
        `   Typ: ${item.type ?? "-"}`,
        `   Zhrnutie: ${item.summary ?? "-"}`,
        `   Schvalovaci tool: ${item.approvalTool ?? "-"}`,
        `   Payload: ${JSON.stringify(item.approvalPayload ?? {})}`,
      ].join("\n")
    ),
  ].join("\n");
}

function renderApprovalQueueGrid(items) {
  if (!elements.approvalQueueGrid) return;
  elements.approvalQueueGrid.replaceChildren();
  for (const item of items.slice(0, 6)) {
    const card = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const summary = document.createElement("p");
    const payload = document.createElement("code");
    const copyButton = document.createElement("button");
    const copyCallButton = document.createElement("button");
    const alternatePayloads = Array.isArray(item.alternateApprovalPayloads) ? item.alternateApprovalPayloads : [];
    const payloadText = JSON.stringify(item.approvalPayload ?? {}, null, 2);
    const mcpCallText = JSON.stringify(
      {
        tool: item.approvalTool ?? item.type ?? "approval_required_tool",
        body: item.approvalPayload ?? {},
      },
      null,
      2
    );
    card.className = "approvalQueueCard";
    card.dataset.priority = item.priority ?? "normal";
    title.textContent = item.title ?? item.type ?? "Approval item";
    meta.textContent = [item.approvalTool, item.priority].filter(Boolean).join(" / ") || "approval payload";
    summary.textContent = item.summary ?? "Caka na operatora.";
    payload.textContent = payloadText;
    copyButton.type = "button";
    copyButton.className = "approvalQueueCopy";
    copyButton.textContent = "Copy payload";
    copyButton.setAttribute("aria-label", `Copy approval payload for ${item.approvalTool ?? item.title ?? item.type ?? "approval item"}`);
    copyButton.addEventListener("click", async () => {
      await writeClipboardText(payloadText);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy payload";
      }, 1400);
    });
    copyCallButton.type = "button";
    copyCallButton.className = "approvalQueueCopy";
    copyCallButton.textContent = "Copy MCP call";
    copyCallButton.setAttribute("aria-label", `Copy exact MCP call for ${item.approvalTool ?? item.title ?? item.type ?? "approval item"}`);
    copyCallButton.addEventListener("click", async () => {
      await writeClipboardText(mcpCallText);
      copyCallButton.textContent = "Copied";
      window.setTimeout(() => {
        copyCallButton.textContent = "Copy MCP call";
      }, 1400);
    });
    card.append(title, meta, summary, payload, copyButton, copyCallButton);
    for (const alternate of alternatePayloads.slice(0, 2)) {
      const alternateCode = document.createElement("code");
      alternateCode.textContent = `alternate: ${JSON.stringify(alternate, null, 2)}`;
      card.appendChild(alternateCode);
    }
    elements.approvalQueueGrid.appendChild(card);
  }
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

function renderProviderFallbackGrid(result) {
  const checks = result.checks ?? [];
  const byKey = new Map(checks.map((check) => [check.key, check]));
  const requiredKeys = ["gemini", "gmail", "smartlead", "postgres", "googleSheets", "googleMaps", "remoteMcp", "sqlite"];
  const requiredReady = requiredKeys.filter((key) => byKey.get(key)?.status === "ready").length;
  const fallbackCards = [
    {
      key: "required-stack",
      label: "Povinny stack",
      state: requiredReady === requiredKeys.length ? "ready" : "blocked",
      detail: `${requiredReady}/${requiredKeys.length} core providerov ready`,
    },
    {
      key: "lead-discovery",
      label: "Lead discovery",
      state: byKey.get("googleMaps")?.status === "ready" || byKey.get("serper")?.status === "ready" ? "ready" : "blocked",
      detail:
        byKey.get("serper")?.status === "ready"
          ? "Serper + Google Places dostupne"
          : byKey.get("googleMaps")?.status === "ready"
            ? "Google Places fallback aktivny; Serper je volitelny"
            : "Lead provideri potrebuju attention",
    },
    {
      key: "local-memory",
      label: "Klientska pamat",
      state: byKey.get("sqlite")?.status === "ready" ? "ready" : "blocked",
      detail: byKey.get("gmail")?.status === "ready" ? "Gmail sync + SQLite memory ready" : "SQLite stays available without Gmail sync",
    },
    {
      key: "cache-queue",
      label: "Cache queue",
      state: "ready",
      detail: byKey.get("redis")?.status === "ready" ? "Redis live" : "SQLite local state active; Redis queue disabled",
    },
  ];
  elements.providerFallbackGrid.replaceChildren();
  for (const card of fallbackCards) {
    const node = document.createElement("div");
    const label = document.createElement("strong");
    const status = document.createElement("span");
    const detail = document.createElement("p");
    node.className = "providerFallbackCard";
    node.setAttribute("data-state", card.state);
    label.textContent = card.label;
    status.textContent = card.state;
    detail.textContent = card.detail;
    node.append(label, status, detail);
    elements.providerFallbackGrid.appendChild(node);
  }
}

function renderAuditEvents(result) {
  const events = result.events ?? [];
  if (!events.length) return result.summary ?? "Audit zatial nema ziadne udalosti.";
  return [
    result.summary ?? `Audit udalosti: ${events.length}`,
    "",
    ...events.slice(0, 12).map((event, index) =>
      [
        `${index + 1}. ${event.automationKey} / ${event.status}`,
        `   Vytvorene: ${event.createdAt ?? "-"}`,
        `   Schvalenie: ${event.requiresApproval ? event.approvedAt ?? "vyzadovane" : "nevyzadovane"}`,
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
    result.summary ?? "Lokalny snapshot pamate je nacitany.",
    "",
    `Kontakty: ${counts.people ?? 0}`,
    `Email aktivity: ${counts.emailActivities ?? 0}`,
    `Otvorene klientske poziadavky: ${counts.openClientNeeds ?? 0}`,
    `Cold outreach udalosti: ${counts.coldOutreachEvents ?? 0}`,
    `Audit udalosti: ${counts.auditEvents ?? 0}`,
    "",
    "Nedavne kontakty:",
    ...(people.length ? people.slice(0, 5).map((person) => `- ${person.primaryEmail} (${person.kind})`) : ["- ziadne"]),
    "",
    "Nedavne klientske poziadavky:",
    ...(needs.length ? needs.slice(0, 5).map((need) => `- ${need.status}: ${need.summary}`) : ["- ziadne"]),
    "",
    "Nedavny audit:",
    ...(audit.length ? audit.slice(0, 5).map((event) => `- ${event.automationKey} / ${event.status}`) : ["- ziadne"]),
  ].join("\n");
}

function renderIdentity(result) {
  if (!result.person) {
    return `Lokalna identita pre ${result.email} sa nenasla.`;
  }
  const needs = result.openNeedSignals ?? [];
  return [
    `${result.person.displayName ?? result.person.companyName ?? result.person.primaryEmail}`,
    `Email: ${result.person.primaryEmail}`,
    `Typ: ${result.person.kind}`,
    `Zhoda: ${result.reason} (${Math.round((result.confidence ?? 0) * 100)}%)`,
    needs.length ? `Otvorene poziadavky: ${needs.length}` : "Otvorene poziadavky: 0",
    ...needs.slice(0, 5).map((need) => `- ${need.summary}`),
  ].join("\n");
}

function renderIngestedMessage(result) {
  return [
    result.jarvisAlert ?? "Sprava je ulozena. Nova klientska poziadavka nebola detegovana.",
    "",
    "Identita:",
    renderIdentity(result.identity),
  ].join("\n");
}

function renderClientNeedAlerts(result) {
  const alerts = result.alerts ?? [];
  if (!alerts.length) return result.summary ?? "Ziadne otvorene klientske poziadavky.";
  return [
    result.summary ?? `Otvorene klientske poziadavky: ${alerts.length}`,
    "",
    ...alerts.slice(0, 10).map((alert, index) => {
      const person = alert.person ?? {};
      const need = alert.needSignal ?? {};
      const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Neznamy klient";
      return [`${index + 1}. ${name}`, `   Email: ${person.primaryEmail ?? "-"}`, `   Poziadavka: ${need.summary ?? "-"}`, `   Od: ${need.occurredAt ?? "-"}`].join("\n");
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
    name.textContent = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Neznamy klient";
    meta.textContent = [person.primaryEmail, need.occurredAt].filter(Boolean).join(" / ") || "lokalna pamat";
    summary.textContent = need.summary ?? "Otvorena klientska poziadavka.";
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
  const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "Klient";
  const summary = need.summary ?? result.summary ?? "Nova klientska poziadavka.";
  const more = Number(result.count ?? 0) > 1 ? ` Otvorene poziadavky: ${result.count}.` : "";
  notifyOperator("Arcigy Jarvis: klientska poziadavka", `${name}: ${summary}${more}`.slice(0, 240), "arcigy-client-need");
}

function confirmApprovalPayload(title, payload, context = "") {
  return window.confirm(
    [
      title,
      context,
      "Jarvis vykona zapis iba po tomto potvrdeni. Exact payload:",
      JSON.stringify(payload, null, 2),
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

function latestClientNeedAlert() {
  return state.lastClientNeedAlerts.find((alert) => alert?.needSignal?.id);
}

async function updateLatestClientNeedStatus(status) {
  const alert = latestClientNeedAlert();
  if (!alert) throw new Error("Najprv nacitaj klientske alerty. Nie je vybrana ziadna otvorena poziadavka.");
  const person = alert.person ?? {};
  const need = alert.needSignal ?? {};
  const name = person.displayName ?? person.companyName ?? person.primaryEmail ?? "client";
  const label = status === "ignored" ? "ignore" : "resolve";
  const payload = {
    needSignalId: need.id,
    status,
    note: `Marked ${status} from Jarvis desktop UI.`,
    updatedBy: "desktop",
    approval: { approved: true },
  };
  const ok = confirmApprovalPayload(`Jarvis will ${label} this client request`, payload, `${name}\n${need.summary ?? "Open request"}`);
  if (!ok) return null;
  const result = await arcigyApi.updateClientNeedStatus(payload);
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
  updateOperationsRadar();
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
    ? `Client alert watch aktivny. Otvorene poziadavky: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`
    : `Client alert watch pauznuty. Otvorene poziadavky: ${result.count ?? alerts.length}. ${state.lastClientAlertGmailSyncSummary}`;
  setCortexSignal(
    elements.cortexMemory,
    Number(result.count ?? alerts.length) > 0 ? `${result.count ?? alerts.length} otvorene poziadavky` : "watch cisty",
    Number(result.count ?? alerts.length) > 0 ? "attention" : state.clientAlertWatchEnabled ? "ready" : "attention"
  );

  if (announceNew && newAlerts.length) {
    notifyClientNeedAlert(newAlerts[0], result);
    speak(newAlerts[0].jarvisAlert ?? result.summary ?? "Jarvis: Mas novu klientsku poziadavku.");
  }
  updateOperationsRadar();
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
    state.lastClientAlertGmailSyncSummary = `Gmail auto-sync skontroloval ${synced.length} accountov, nacital ${fetched}, vytvoril ${created}, preskocil ${duplicates} duplikatov, zdvihol ${alerts} alertov.`;
  } catch (error) {
    const message = safeUiErrorText(error);
    state.lastClientAlertGmailSyncSummary = `Gmail auto-sync nedostupny: ${message}`;
  }
}

function startClientNeedWatch() {
  state.clientAlertWatchEnabled = true;
  elements.toggleClientNeedWatch.textContent = "Pauznut watch";
  setMissionSignal(elements.missionGmail, "watch aktivny", "ready");
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
  elements.toggleClientNeedWatch.textContent = "Obnovit watch";
  elements.clientAlertWatchStatus.textContent = "Client alert watch pauznuty.";
  setMissionSignal(elements.missionGmail, "pauznuty", "attention");
  setCortexSignal(elements.cortexMemory, "watch pauznuty", "attention");
}

function renderSmartleadStatus(result) {
  if (Array.isArray(result.campaigns)) {
    const campaigns = result.campaigns.slice(0, 8);
    return [
      `Kampane: ${result.campaigns.length}`,
      "",
      ...campaigns.map((campaign) => `${campaign.id ?? "-"} - ${campaign.name ?? "bez nazvu"}${campaign.status ? ` (${campaign.status})` : ""}`),
    ].join("\n");
  }
  return JSON.stringify(result, null, 2);
}

function renderSmartleadBrief(result) {
  const metrics = result.metrics ?? {};
  setCortexSignal(elements.cortexOutreach, `${metrics.replied ?? 0} odpovedi`, metrics.positiveReplies > 0 || metrics.replied > 0 ? "attention" : "ready");
  const campaignLine = result.campaignCount > 1
    ? `${result.campaignCount} kampani: ${(result.campaignIds ?? []).join(", ")}`
    : result.campaignId ?? "-";
  return [
    result.summary ?? "Smartlead brief je prazdny.",
    "",
    `Kampan: ${campaignLine}`,
    `Osloveni: ${metrics.contacted ?? 0}`,
    `Otvorili: ${metrics.opened ?? 0} (${metrics.openRate ?? 0}%)`,
    `Odpisali: ${metrics.replied ?? 0} (${metrics.replyRate ?? 0}%)`,
    `Pozitivni: ${metrics.positiveReplies ?? "neklasifikovane"}`,
    ...(result.notes?.length ? ["", ...result.notes.map((note) => `Poznamka: ${note}`)] : []),
  ].join("\n");
}

function renderWebBridgePreflight(result) {
  return [
    `Tunel pripraveny: ${result.readyForTunnel ? "ano" : "nie"}`,
    `Token nastaveny: ${result.tokenConfigured ? "ano" : "nie"}`,
    `Remote auth: ${result.authRequiredForExternalHosts ? "vyzadovana" : "nevyzadovana"}`,
    `Prikaz tunela: ${result.tunnelCommand ?? "npm run web:tunnel"}`,
    `Manifest URL: ${result.manifestUrl}`,
    `Action manifest: ${result.actionManifestUrl ?? `${result.origin ?? "http://127.0.0.1:8765"}/.well-known/ai-plugin.json`}`,
    `OpenAPI schema: ${result.openApiSchemaUrl ?? `${result.origin ?? "http://127.0.0.1:8765"}/api/openapi.json`}`,
    `Tool call pattern: ${result.mcpToolCallPattern ?? `${result.origin ?? "http://127.0.0.1:8765"}/api/mcp/{toolName}`}`,
    `MCP tooly: ${result.mcpToolCount}`,
    `Schvalovacie tooly: ${(result.riskyToolsRequiringApproval ?? []).join(", ") || "ziadne"}`,
    `Path policy: ${result.pathPolicy}`,
    ...(result.warnings?.length ? ["", ...result.warnings.map((warning) => `Varovanie: ${warning}`)] : []),
  ].join("\n");
}

function renderBridgeCockpit(result) {
  state.lastBridgePreflight = result;
  const warnings = result.warnings ?? [];
  elements.bridgeTunnelState.textContent = result.readyForTunnel ? "ready" : "zamknute";
  elements.bridgeAuthState.textContent = result.tokenConfigured ? "token ready" : "chyba token";
  elements.bridgeManifestState.textContent = result.manifestUrl ? "online" : "chyba";
  elements.bridgeToolState.textContent = result.mcpToolCount ? `${result.mcpToolCount} toolov` : "offline";
  elements.bridgeTunnelState.dataset.state = result.readyForTunnel ? "ready" : "attention";
  elements.bridgeAuthState.dataset.state = result.tokenConfigured ? "ready" : "attention";
  elements.bridgeManifestState.dataset.state = result.manifestUrl ? "ready" : "attention";
  elements.bridgeToolState.dataset.state = result.mcpToolCount ? "ready" : "attention";
  if (warnings.length) elements.bridgeTunnelState.dataset.state = "attention";
  setMissionSignal(elements.missionRemote, result.readyForTunnel ? "ready" : "zamknute", result.readyForTunnel ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, result.readyForTunnel ? "tunel ready" : "auth zamok", result.readyForTunnel ? "ready" : "attention");
  updateOperationsRadar();
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
  state.lastRemoteAgentLaunchBundle = pack.agentLaunchBundle ?? null;
  const approvalTools = pack.tools?.approvalRequired ?? [];
  const localWriteTools = pack.tools?.localStateWrite ?? [];
  const launchBundle = pack.agentLaunchBundle ?? null;
  elements.handoffStatus.textContent = pack.auth?.tokenConfigured ? "armed" : "local only";
  elements.handoffStatus.dataset.state = pack.auth?.tokenConfigured ? "ready" : "attention";
  elements.handoffManifestUrl.textContent = pack.manifestUrl ?? "--";
  elements.handoffToolPattern.textContent = pack.mcpToolCallPattern ?? "--";
  elements.handoffTunnelCommand.textContent = pack.tunnel?.secureCommand ?? "npm run web:tunnel:secure";
  elements.handoffSmokeUrl.textContent = pack.smokeTestUrl ?? "--";
  elements.handoffApprovalTools.textContent = approvalTools.length ? `${approvalTools.length}: ${approvalTools.join(", ")}` : "none";
  elements.handoffLocalWriteTools.textContent = localWriteTools.length ? `${localWriteTools.length}: ${localWriteTools.join(", ")}` : "none";
  const proof = matchingSmoke ? summarizeRemoteProofGates(matchingSmoke) : { ready: false, text: "smoke este nebezi" };
  elements.handoffProofGates.textContent = proof.text;
  elements.handoffProofGates.dataset.state = proof.ready ? "ready" : "attention";
  renderRemoteProofMatrix(matchingSmoke);
  renderRemoteAgentLaunchBundle(launchBundle, matchingSmoke);
  renderAgentSetupProfiles(pack.agentSetupProfiles ?? [], matchingSmoke);
  renderMcpToolList(pack);
  elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(pack, matchingSmoke);
  updateRemoteMissionStatus();
}

function renderRemoteAgentLaunchBundle(bundle, smokeReport = null) {
  if (!bundle) {
    state.lastRemoteAgentLaunchBundle = null;
    elements.handoffLaunchBundle.textContent = "nenacitane";
    elements.handoffLaunchBundle.dataset.state = "attention";
    elements.handoffWritePolicy.textContent = "approval.approved-required";
    elements.launchBeforeWork.textContent = "Nacitaj launch bundle.";
    elements.launchBeforeWrites.textContent = "Vyziadaj fresh proof a schvalenie.";
    elements.launchAgentPrompt.textContent = "Claude / ChatGPT / Grok pripraveny po nacitani packu.";
    return;
  }
  state.lastRemoteAgentLaunchBundle = bundle;
  const proof = smokeReport ? summarizeRemoteProofGates(smokeReport) : { ready: false, text: "smoke este nebezi" };
  const beforeAnyWork = bundle.proofPolicy?.beforeAnyWork ?? [];
  const beforeWrites = bundle.proofPolicy?.beforeWrites ?? [];
  const prompts = bundle.firstPrompts ?? {};
  elements.handoffLaunchBundle.textContent = [
    `${bundle.status ?? "unknown"} launch bundle`,
    `Share: ${bundle.shareWithAgent?.connectionPackUrl ?? "--"}`,
    `OpenAPI: ${bundle.shareWithAgent?.openApiSchemaUrl ?? "--"}`,
  ].join("\n");
  elements.handoffLaunchBundle.dataset.state = proof.ready ? "ready" : "attention";
  elements.handoffWritePolicy.textContent = [
    `Freshness: ${bundle.proofPolicy?.freshnessMaxAgeHours ?? 24}h`,
    beforeWrites[beforeWrites.length - 1] ?? "Show exact approval payload before writes.",
  ].join("\n");
  elements.launchBeforeWork.textContent = beforeAnyWork.slice(0, 3).join(" | ") || "Fetch pack, evidence, and smoke.";
  elements.launchBeforeWrites.textContent = beforeWrites.slice(0, 3).join(" | ") || "Require fresh proof and approval.";
  elements.launchAgentPrompt.textContent = prompts.Grok ? "Claude, ChatGPT, Grok prompty nacitane." : "Agent prompty nie su nacitane.";
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
    title.textContent = "chyba";
    meta.textContent = "Connection pack nema profily.";
    node.append(label, title, meta);
    elements.agentSetupProfiles.appendChild(node);
    return;
  }
  const gateSummary = smokeReport ? summarizeRemoteProofGates(smokeReport) : { ready: false, text: "smoke este nebezi" };
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
      `Proof: ${gates.length ? gates.join(", ") : "nedeklarovane"}`,
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
    elements.handoffStatus.textContent = "startuje";
    elements.handoffStatus.dataset.state = "attention";
    elements.handoffProofGates.textContent = "cakam na tunnel ready log";
    elements.handoffProofGates.dataset.state = "attention";
  }
  updateRemoteMissionStatus();
  elements.remoteAgentPrompt.textContent = [
    status.summary ?? "Secure tunnel status nacitany.",
    `Bezi: ${status.running ? "ano" : "nie"}`,
    `Ready: ${status.ready ? "ano" : "nie"}`,
    status.publicUrl ? `Public MCP base URL: ${status.publicUrl}` : null,
    status.actionManifestUrl ? `Action manifest: ${status.actionManifestUrl}` : status.publicUrl ? `Action manifest: ${status.publicUrl}/.well-known/ai-plugin.json` : null,
    status.openApiSchemaUrl ? `OpenAPI schema: ${status.openApiSchemaUrl}` : status.publicUrl ? `OpenAPI schema: ${status.publicUrl}/api/openapi.json` : null,
    status.connectionPackUrl ? `Connection pack: ${status.connectionPackUrl}` : null,
    status.smokeUrl ? `Smoke test: ${status.smokeUrl}` : null,
    status.mcpToolCallPattern ? `Tool call pattern: ${status.mcpToolCallPattern}` : null,
    `Auth token: ${status.tokenPresent ? "je v privatnom logu, tu sa nezobrazuje" : "nezisteny"}`,
    status.logPath ? `Private log: ${status.logPath}` : null,
    status.redactedTail ? `\nRedigovany koniec logu:\n${status.redactedTail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderMcpToolList(pack) {
  const tools = pack.tools?.names ?? [];
  const approvalTools = new Set(pack.tools?.approvalRequired ?? []);
  const localWriteTools = new Set(pack.tools?.localStateWrite ?? []);
  const readOnlyTools = new Set(pack.tools?.readOnlyOrDraft ?? []);
  elements.mcpToolListStatus.textContent = tools.length ? `Live registry: ${tools.length} toolov nacitanych.` : "Ziadne MCP tooly nie su nacitane.";
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
  const launchBundle = pack.agentLaunchBundle;
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
    launchBundle ? `Launch bundle: ${launchBundle.shareWithAgent?.connectionPackUrl}` : "",
    launchBundle ? `Launch proof policy: beforeAnyWork=${(launchBundle.proofPolicy?.beforeAnyWork ?? []).join(" | ")}; beforeWrites=${(launchBundle.proofPolicy?.beforeWrites ?? []).join(" | ")}` : "",
    `Approval required: ${approvalTools.join(", ") || "none"}`,
    `Local memory writes: ${localWriteTools.join(", ") || "none"}`,
    limits,
    supportedAgents ? `Supported agents: ${supportedAgents}` : "",
    compatibility?.protocol ? `Protocol: ${compatibility.protocol}` : "",
    `Secure tunel: ${pack.tunnel?.secureCommand ?? "npm run web:tunnel:secure"}`,
    pack.tunnel?.statusUrl ? `Status tunela: ${pack.tunnel.statusUrl}` : "",
    pack.tunnel?.startUrl ? `Browser start tunela: ${pack.tunnel.startUrl}` : "",
    pack.tunnel?.stopUrl ? `Browser stop tunela: ${pack.tunnel.stopUrl}` : "",
    `Smoke test: ${pack.smokeTestUrl ?? "--"}`,
    proof ? `Required proof:\n${proof}` : "",
    agentProfiles ? `Agent setup profiles:\n${agentProfiles}` : "",
    agentFirstSteps ? `Agent first steps:\n${agentFirstSteps}` : "",
    launchBundle?.firstPrompts
      ? `Agent launch bundle prompts:\n${Object.entries(launchBundle.firstPrompts)
          .map(([agent, prompt]) => `- ${agent}: ${prompt}`)
          .join("\n")}`
      : agentPrompts
        ? `Agent-specific startup prompts:\n${agentPrompts}`
        : "",
    safetyRules ? `Safety rules:\n${safetyRules}` : "",
    "Rule: never call approval-required tools without explicit operator confirmation.",
    "Rule: treat local memory write tools as persistent local state changes; preview Gmail with dryRun: true first.",
    "Start with arcigy.get_operator_briefing, then use read-only tools before proposing any write action.",
    quickStart ? `Quick-start calls:\n${quickStart}` : "",
  ].join("\n");
}

function renderRemoteMcpSmoke(report) {
  state.lastRemoteMcpSmoke = report;
  updateOperationsRadar();
  elements.remoteSmokeResult.dataset.state = report.status === "ready" ? "ready" : "attention";
  setMissionSignal(elements.missionRemote, report.status === "ready" ? "smoke ready" : "smoke blokovany", report.status === "ready" ? "ready" : "attention");
  setCortexSignal(elements.cortexRemote, report.status === "ready" ? "smoke ready" : "smoke blokovany", report.status === "ready" ? "ready" : "attention");
  const proof = summarizeRemoteProofGates(report);
  elements.handoffProofGates.textContent = proof.text;
  elements.handoffProofGates.dataset.state = proof.ready ? "ready" : "attention";
  renderRemoteProofMatrix(report);
  if (state.lastRemoteMcpPack) elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(state.lastRemoteMcpPack, report);
  if (state.lastRemoteAgentLaunchBundle) renderRemoteAgentLaunchBundle(state.lastRemoteAgentLaunchBundle, report);
  updateRemoteMissionStatus();
  elements.remoteSmokeResult.textContent = [
    report.summary ?? `Remote MCP smoke: ${report.status}`,
    "",
    ...(report.checks ?? []).map((check) => `${check.status.toUpperCase()} ${check.key}: ${check.message}`),
  ].join("\n");
}

function renderRemoteProofMatrix(report) {
  elements.remoteProofMatrix.replaceChildren();
  const checks = new Map((report?.checks ?? []).map((check) => [check.key, check.status]));
  for (const gate of requiredRemoteSmokeGates) {
    const status = checks.get(gate) ?? "waiting";
    const node = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    node.className = "proofGateCard";
    node.dataset.state = status === "ready" ? "ready" : "attention";
    label.textContent = status === "ready" ? "ready" : "blocked";
    title.textContent = gate;
    node.append(label, title);
    elements.remoteProofMatrix.appendChild(node);
  }
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
        launchBundle: state.lastRemoteAgentLaunchBundle,
        smokeTest: state.lastRemoteMcpSmoke,
      },
      null,
      2
    ),
  ].join("\n");
  await writeClipboardText(payload);
  elements.copyRemotePack.textContent = "Skopirovane";
  window.setTimeout(() => {
    elements.copyRemotePack.textContent = "Kopirovat pack";
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
  const bundlePrompt = pack.agentLaunchBundle?.firstPrompts?.[agentLabel];
  const handoffStatus = buildCopiedHandoffStatus(state.lastRemoteMcpSmoke);
  const prompt =
    bundlePrompt ??
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
    pack.agentLaunchBundle?.shareWithAgent?.connectionPackUrl ? `Launch bundle connection pack: ${pack.agentLaunchBundle.shareWithAgent.connectionPackUrl}` : "",
    pack.agentLaunchBundle?.proofPolicy ? `Launch proof policy: ${(pack.agentLaunchBundle.proofPolicy.beforeAnyWork ?? []).join(" | ")} / ${(pack.agentLaunchBundle.proofPolicy.beforeWrites ?? []).join(" | ")}` : "",
    `Smoke test: ${pack.smokeTestUrl}`,
    pack.tunnel?.statusUrl ? `Status tunela: ${pack.tunnel.statusUrl}` : "",
    `Tool call pattern: ${pack.mcpToolCallPattern}`,
    `Auth header: ${pack.auth?.header ?? "Authorization: Bearer <JARVIS_WEB_TOKEN>"}`,
  ].join("\n");
  await writeClipboardText(payload);
  button.textContent = "Skopirovane";
  window.setTimeout(() => {
    button.textContent = `Kopirovat ${agentLabel}`;
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
    "Nechaj tento terminal otvoreny, kym Grok, Claude alebo ChatGPT pouziva remote MCP bridge.",
    "Ked sa zobrazi tunnel URL, spusti remote smoke a skopiruj spravny agent prompt z Jarvisu.",
  ].join("\n");
  await writeClipboardText(payload);
  elements.copyTunnelCommand.textContent = "Skopirovane";
  window.setTimeout(() => {
    elements.copyTunnelCommand.textContent = "Kopirovat tunel";
  }, 1400);
}

async function refreshSecureTunnelStatus() {
  elements.remoteAgentPrompt.textContent = "Kontrolujem secure tunnel status z privatneho logu...";
  const status = await arcigyApi.getSecureTunnelStatus();
  renderSecureTunnelStatus(status);
  return status;
}

function buildCopiedHandoffStatus(smokeReport) {
  if (!smokeReport) {
    return {
      ready: false,
      text: "HANDOFF STAV: BLOKOVANE. Spusti remote MCP smoke a vyziadaj ready proof gates pred pracou remote agenta.",
    };
  }
  const proof = summarizeRemoteProofGates(smokeReport);
  return {
    ready: proof.ready,
    text: proof.ready
      ? "HANDOFF STAV: READY. Remote smoke a povinne proof gates presli."
      : `HANDOFF STAV: BLOKOVANE. ${proof.text}`,
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
  if (!copied) throw new Error("Kopirovanie do clipboardu zlyhalo. Oznac text a skopiruj ho manualne.");
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
      elements.contractResult.textContent = "Zmluvny formular sa zmenil. Pred generovanim DOCX suborov aplikuj formular.";
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
  updateVoiceRuntimeStatus(trimmed ? `zachytene: ${trimmed}` : "prazdny prepis ignorovany");

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
    updateVoiceRuntimeStatus("Speech recognition nie je dostupny; pouzi text fallback.");
    speak("Hlasove rozpoznavanie nie je v tomto runtime dostupne. Pouzi textove pole alebo pripoj nativny speech bridge.");
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
    updateVoiceRuntimeStatus("mikrofon stream aktivny");
  };
  recognition.onresult = (event) => {
    const latest = event.results[event.results.length - 1];
    const text = latest?.[0]?.transcript ?? "";
    if (text) void handleTranscript(text);
  };
  recognition.onend = () => {
    if (!state.listening) {
      updateVoiceRuntimeStatus("mikrofon stream zastaveny");
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      state.listening = false;
      elements.listenButton.textContent = listenButtonLabels.start;
      setMode("idle");
      updateVoiceRuntimeStatus(`restart mikrofonu zlyhal: ${safeUiErrorText(error)}`);
    }
  };
  recognition.onerror = (event) => {
    const errorName = event?.error ?? "unknown";
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(errorName)) {
      state.listening = false;
      elements.listenButton.textContent = listenButtonLabels.start;
    }
    setMode("idle");
    updateVoiceRuntimeStatus(`chyba mikrofonu: ${errorName}`);
  };

  state.recognition = recognition;
  state.listening = true;
  try {
    recognition.start();
    setMode("listening");
    elements.listenButton.textContent = listenButtonLabels.stop;
    updateVoiceRuntimeStatus("cakam na wake word Jarvis");
  } catch (error) {
    state.listening = false;
    elements.listenButton.textContent = listenButtonLabels.start;
    setMode("idle");
    updateVoiceRuntimeStatus(`start mikrofonu zlyhal: ${safeUiErrorText(error)}`);
  }
}

function stopRecognition() {
  state.listening = false;
  state.recognition?.stop();
  setMode("idle");
  elements.listenButton.textContent = listenButtonLabels.start;
  updateVoiceRuntimeStatus("pocuvanie vypnute");
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
    elements.preparedReplyResult.textContent = "Nacitavam schvalovaciu frontu...";
    const result = await arcigyApi.getApprovalQueue({ limit: 20 });
    elements.preparedReplyResult.textContent = renderApprovalQueue(result);
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    elements.preparedReplyResult.textContent = safeUiErrorText(error);
  }
});
elements.preparedReplies.addEventListener("click", async () => {
  try {
    elements.preparedReplyResult.textContent = "Nacitavam pripravene odpovede...";
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
    const leadEmail = requiredInputValue(elements.positiveLeadEmail, "Email leadu je povinny pred pripravenim odpovede.");
    const positiveSignal = requiredInputValue(elements.positiveSignal, "Pozitivny signal je povinny pred pripravenim odpovede.");
    elements.preparedReplyResult.textContent = "Pripravujem odpoved na pozitivny outreach...";
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
      elements.preparedReplyResult.textContent = "Pred schvalenim nacitaj pripravene odpovede.";
      return;
    }
    const first = state.lastPreparedReplies[0];
    const payload = {
      preparedEventId: first.id,
      approval: { approved: true },
      approvedBy: "operator",
    };
    const approved = confirmApprovalPayload(
      "Schvalit pripravenu odpoved",
      payload,
      `${first.leadEmail}${first.subject ? `\nTema: ${first.subject}` : ""}`
    );
    if (!approved) {
      elements.preparedReplyResult.textContent = "Schvalenie pripravenej odpovede bolo zrusene pred zapisom.";
      return;
    }
    const result = await arcigyApi.approvePreparedOutreachReply(payload);
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
      elements.preparedReplyResult.textContent = "Pred odoslanim schval pripravenu odpoved.";
      return;
    }
    const payload = {
      preparedEventId: first.id,
      subject: first.subject,
      approval: { approved: true },
      sentBy: "operator",
    };
    const approved = confirmApprovalPayload(
      "Odoslat schvalenu odpoved cez Gmail",
      payload,
      `${first.leadEmail}${first.subject ? `\nTema: ${first.subject}` : ""}`
    );
    if (!approved) {
      elements.preparedReplyResult.textContent = "Odoslanie schvalenej odpovede bolo zrusene pred Gmail volanim.";
      return;
    }
    elements.preparedReplyResult.textContent = "Odosielam schvalenu odpoved cez Gmail...";
    const result = await arcigyApi.sendApprovedOutreachReply(payload);
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
    const result = await refreshClientNeedAlerts({ announceNew: false, loadingText: "Nacitavam client alerty..." });
    if (result.count > 0 && result.summary) speak(result.summary);
  } catch (error) {
    elements.clientAlertsResult.textContent = safeUiErrorText(error);
  }
});
elements.resolveClientNeed.addEventListener("click", async () => {
  try {
    elements.clientAlertsResult.textContent = "Riesim najnovsi client alert...";
    const result = await updateLatestClientNeedStatus("resolved");
    if (result?.summary) speak(result.summary);
    else elements.clientAlertsResult.textContent = "Aktualizacia client alertu bola zrusena.";
  } catch (error) {
    elements.clientAlertsResult.textContent = safeUiErrorText(error);
  }
});
elements.ignoreClientNeed.addEventListener("click", async () => {
  try {
    elements.clientAlertsResult.textContent = "Ignorujem najnovsi client alert...";
    const result = await updateLatestClientNeedStatus("ignored");
    if (result?.summary) speak(result.summary);
    else elements.clientAlertsResult.textContent = "Aktualizacia client alertu bola zrusena.";
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
    const message = requiredInputValue(elements.clientMessage, "Klientska sprava je povinna pred draftovanim odpovede.");
    elements.draftResult.textContent = "Draftujem odpoved...";
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
    elements.diagnosticsResult.textContent = "Spustam live diagnostiku...";
    elements.diagnosticsGrid.replaceChildren();
    const result = await arcigyApi.runDiagnostics({ live: true });
    renderDiagnosticsGrid(result);
    renderProviderFallbackGrid(result);
    elements.diagnosticsResult.textContent = renderDiagnostics(result);
  } catch (error) {
    elements.diagnosticsResult.textContent = safeUiErrorText(error);
  }
});
elements.auditEvents.addEventListener("click", async () => {
  try {
    elements.auditResult.textContent = "Nacitavam audit trail...";
    const result = await arcigyApi.getAuditEvents({ limit: 20 });
    elements.auditResult.textContent = renderAuditEvents(result);
  } catch (error) {
    elements.auditResult.textContent = safeUiErrorText(error);
  }
});
elements.localMemorySnapshot.addEventListener("click", async () => {
  try {
    elements.auditResult.textContent = "Nacitavam redigovany snapshot lokalnej pamate...";
    const result = await arcigyApi.getLocalMemorySnapshot({ limit: 10 });
    elements.auditResult.textContent = renderLocalMemorySnapshot(result);
  } catch (error) {
    elements.auditResult.textContent = safeUiErrorText(error);
  }
});
elements.exportLocalMemorySnapshot.addEventListener("click", async () => {
  try {
    const payload = {
      outputPath: "generated/local-memory/local-memory-snapshot.json",
      limit: 10,
      approval: { approved: true },
    };
    const approved = confirmApprovalPayload("Export redigovaneho snapshotu lokalnej pamate", payload);
    if (!approved) {
      elements.auditResult.textContent = "Export snapshotu lokalnej pamate bol zruseny pred zapisom suboru.";
      return;
    }
    elements.auditResult.textContent = "Exporting redacted local memory snapshot...";
    const result = await arcigyApi.exportLocalMemorySnapshot(payload);
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
    elements.gmailResult.textContent = "Pripravujem Gmail nahlad bez zapisu lokalnych zaznamov...";
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
    const confirmed = window.confirm(`Synchronizovat posledne Gmail spravy do lokalnej klientskej pamate? Pri neistote najprv spusti nahlad.`);
    if (!confirmed) {
      elements.gmailResult.textContent = "Gmail synchronizacia bola zrusena pred zapisom do lokalnej pamate.";
      return;
    }
    elements.gmailResult.textContent = "Synchronizujem Gmail...";
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
    elements.smartleadResult.textContent = "Kontrolujem Smartlead...";
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
    elements.smartleadResult.textContent = campaignId ? "Skladam Smartlead Jarvis brief..." : "Skladam Smartlead Jarvis brief napriec kampanami...";
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
    await refreshWebBridge({ loadingText: "Kontrolujem web bridge..." });
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
    const confirmed = window.confirm(`Spustit bezpecny Jarvis MCP tunel pre remote agentov? Log tunela nechaj privatny, lebo moze obsahovat jednorazovy bearer token.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Spustenie bezpecneho tunela bolo zrusene.";
      return;
    }
    elements.remoteAgentPrompt.textContent = "Spustam bezpecny Jarvis MCP tunel...";
    const result = await arcigyApi.startSecureTunnel();
    if (result.logPath) state.secureTunnelLogPath = result.logPath;
    const status = result.alreadyRunning ? "Bezpecny tunel uz bezi." : result.started ? "Spustenie bezpecneho tunela bolo vyziadane." : "Bezpecny tunel nebol spusteny.";
    elements.remoteAgentPrompt.textContent = [
      status,
      `Prikaz: ${result.command ?? "npm run web:tunnel:secure"}`,
      result.pid ? `Process id: ${result.pid}` : null,
      result.logPath ? `Log: ${result.logPath}` : null,
      "Ked tunel vypise ready, spusti smoke test pred odovzdanim MCP packu pre Claude, ChatGPT alebo Grok.",
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
    const confirmed = window.confirm(`Zastavit bezpecny Jarvis MCP tunel spusteny z tejto desktop session? Remote agenti okamzite stratia pristup.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Zastavenie bezpecneho tunela bolo zrusene.";
      return;
    }
    const result = await arcigyApi.stopSecureTunnel();
    if (result.logPath) state.secureTunnelLogPath = result.logPath;
    elements.remoteAgentPrompt.textContent = [
      result.stopped ? "Zastavenie bezpecneho tunela bolo vyziadane." : "V tejto desktop session nie je sledovany ziadny proces bezpecneho tunela.",
      result.pid ? `Process id: ${result.pid}` : null,
      result.logPath ? `Log: ${result.logPath}` : null,
      "Pred novym remote MCP handoffom spusti Preflight.",
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
      elements.remoteAgentPrompt.textContent = "Najprv spusti alebo zastav bezpecny tunel, aby Jarvis vedel, ktory lokalny log otvorit.";
      return;
    }
    const confirmed = window.confirm(`Otvorit log bezpecneho tunela? Moze obsahovat jednorazovy bearer token a ma ostat privatny.`);
    if (!confirmed) {
      elements.remoteAgentPrompt.textContent = "Otvorenie logu bezpecneho tunela bolo zrusene.";
      return;
    }
    const result = await arcigyApi.openPath(state.secureTunnelLogPath);
    elements.remoteAgentPrompt.textContent = result ? `Vysledok otvorenia logu tunela: ${result}` : `Otvoreny log tunela: ${state.secureTunnelLogPath}`;
  } catch (error) {
    elements.remoteAgentPrompt.textContent = safeUiErrorText(error);
  }
});
elements.runRemoteSmoke.addEventListener("click", async () => {
  try {
    elements.remoteSmokeResult.textContent = "Spustam remote MCP smoke test...";
    elements.handoffProofGates.textContent = "kontrolujem safety gates";
    elements.handoffProofGates.dataset.state = "attention";
    const report = await arcigyApi.remoteMcpSmoke({ baseUrl: state.lastRemoteMcpPack?.baseUrl });
    renderRemoteMcpSmoke(report);
  } catch (error) {
    state.lastRemoteMcpSmoke = null;
    elements.remoteSmokeResult.textContent = safeUiErrorText(error);
    elements.handoffProofGates.textContent = "blokovane: smoke chyba";
    elements.handoffProofGates.dataset.state = "attention";
    if (state.lastRemoteMcpPack) elements.remoteAgentPrompt.textContent = buildRemoteAgentPrompt(state.lastRemoteMcpPack, null);
    updateRemoteMissionStatus();
  }
});
elements.readinessReport.addEventListener("click", async () => {
  try {
    elements.commandTimeline.textContent = "Skladam live production readiness report...";
    const report = await arcigyApi.productionReadiness({ live: true });
    renderLaunchQueue(report);
    elements.commandTimeline.textContent = report.summary;
    elements.response.textContent = renderReadinessReport(report);
  } catch (error) {
    elements.commandTimeline.textContent = safeUiErrorText(error);
  }
});
elements.capabilityAudit.addEventListener("click", async () => {
  try {
    elements.capabilityAuditSummary.textContent = "Spustam live Jarvis capability audit...";
    const audit = await arcigyApi.jarvisCapabilityAudit({ live: true });
    renderCapabilityAudit(audit);
    elements.commandTimeline.textContent = audit.summary;
    elements.response.textContent = renderCapabilityAuditText(audit);
    speak(audit.summary);
  } catch (error) {
    const message = safeUiErrorText(error);
    elements.capabilityAuditSummary.textContent = message;
    elements.commandTimeline.textContent = message;
  }
});
elements.operatorBriefing.addEventListener("click", async () => {
  try {
    await refreshOperatorBriefing({ speakResult: true, loadingText: "Skladam live operator briefing...", live: true });
  } catch (error) {
    elements.commandTimeline.textContent = safeUiErrorText(error);
  }
});
elements.fullLaunchCheck.addEventListener("click", async () => {
  try {
    await runFullLaunchCheck();
  } catch (error) {
    const message = safeUiErrorText(error);
    elements.commandTimeline.textContent = message;
    elements.response.textContent = message;
  }
});
elements.discoverLeads.addEventListener("click", async () => {
  try {
    elements.leadResult.textContent = "Vyhladavam leady...";
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
      elements.leadResult.textContent = "Pred exportom najprv vyhladaj leady.";
      return;
    }
    const payload = {
      approval: { approved: true },
      range: "Leads!A1",
      rows: leadsToSheetRows(state.lastLeads),
    };
    const approved = confirmApprovalPayload(
      `Exportovat ${state.lastLeads.length} leadov do Google Sheets`,
      payload,
      "Toto zapise pripravene lead rows do nakonfigurovaneho Google Sheetu."
    );
    if (!approved) {
      elements.leadResult.textContent = "Export do Google Sheets bol zruseny pred zapisom.";
      return;
    }
    elements.leadResult.textContent = "Exportujem leady do Google Sheets...";
    const result = await arcigyApi.appendLeadsToGoogleSheet(payload);
    elements.leadResult.textContent = `Exportovane leady do Google Sheets: ${state.lastLeads.length}\n${JSON.stringify(result, null, 2)}`;
  } catch (error) {
    elements.leadResult.textContent = safeUiErrorText(error);
  }
});
elements.draftContractIntake.addEventListener("click", async () => {
  try {
    const brief = requiredInputValue(elements.contractBrief, "Brief zmluvy je povinny pred AI draftom.");
    elements.contractResult.textContent = "Draftujem zmluvny intake cez Gemini...";
    const baseIntake = safeParseContractIntake();
    const intake = await arcigyApi.draftContractIntake({
      brief,
      baseIntake,
    });
    fillContractForm(intake);
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    state.contractFormDirty = false;
    elements.contractResult.textContent = "AI zmluvny intake je aplikovany. Skontroluj ho pred generovanim DOCX suborov.";
  } catch (error) {
    elements.contractResult.textContent = safeUiErrorText(error);
  }
});
elements.applyContractForm.addEventListener("click", () => {
  try {
    const intake = buildContractIntakeFromForm();
    elements.contractIntake.value = JSON.stringify(intake, null, 2);
    state.contractFormDirty = false;
    elements.contractResult.textContent = "Zmluvny formular je aplikovany do intake JSON.";
  } catch (error) {
    elements.contractResult.textContent = safeUiErrorText(error);
  }
});
elements.generateContracts.addEventListener("click", async () => {
  try {
    if (state.contractFormDirty) {
      elements.contractResult.textContent = "Pred generovanim aplikuj zmluvny formular, aby viditelny formular a intake JSON sedeli.";
      return;
    }
    const intake = JSON.parse(elements.contractIntake.value);
    const clientName = intake.client?.businessName ?? "vybrany klient";
    const projectName = intake.project?.name ?? "vybrany projekt";
    const payload = { intake, approval: { approved: true } };
    const approved = confirmApprovalPayload(
      "Vygenerovat DOCX zmluvy",
      payload,
      `${clientName} / ${projectName}`
    );
    if (!approved) {
      elements.contractResult.textContent = "Generovanie zmluv bolo zrusene pred zapisom suborov.";
      return;
    }
    elements.contractResult.textContent = "Generujem zmluvy...";
    const result = await arcigyApi.generateContracts(payload);
    elements.contractResult.textContent = [
      `Vygenerovane subory: ${result.generatedFiles.length}`,
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
  summary: "Nacitavam operator briefing...",
  sections: {
    readiness: "Readiness sa kontroluje.",
    coldOutreach: "Outreach brief sa nacitava.",
    clientNeeds: "Client memory watch sa spusta.",
    preparedReplies: "Schvalovacia fronta sa nacitava.",
    nextAction: "Nacitavam dalsi krok.",
  },
});
void refreshHealth();
startWebBridgeWatch();
startOperatorBriefingWatch();
startClientNeedWatch();
setMode("idle");
