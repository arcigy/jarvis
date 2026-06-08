const state = {
  mode: "idle",
  session: { state: "idle", wakeWord: "jarvis" },
  recognition: null,
  listening: false,
  lastLeads: [],
  lastPreparedReplies: [],
  clientAlertWatchEnabled: true,
  clientAlertPollTimer: null,
  seenClientNeedAlertIds: new Set(),
  clientAlertPollMs: 60000,
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
  syncGmail: document.querySelector("#syncGmail"),
  gmailResult: document.querySelector("#gmailResult"),
  smartleadCampaignId: document.querySelector("#smartleadCampaignId"),
  checkSmartlead: document.querySelector("#checkSmartlead"),
  smartleadResult: document.querySelector("#smartleadResult"),
  checkWebBridge: document.querySelector("#checkWebBridge"),
  webBridgeResult: document.querySelector("#webBridgeResult"),
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
  coldOutreachBrief: (payload) => postJson("/api/cold-outreach-brief", payload),
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
  syncGmailRecentMessages: (payload) => postJson("/api/sync-gmail-recent-messages", payload),
  getSmartleadCampaignStatus: (payload) => postJson("/api/smartlead-campaign-status", payload),
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
  const blockers = integrations.filter((item) => !item.configured);
  const approvalTools = bridge?.riskyToolsRequiringApproval ?? [];
  elements.readyIntegrations.textContent = `${readyCount}/${integrations.length || "--"}`;
  elements.mcpToolCount.textContent = bridge?.mcpToolCount ? String(bridge.mcpToolCount) : "--";
  elements.approvalLockCount.textContent = bridge ? String(approvalTools.length) : "--";
  elements.liveBlockerCount.textContent = String(blockers.length);
  elements.commandTimeline.textContent = buildCommandTimeline(blockers, bridge);
}

function buildCommandTimeline(blockers, bridge) {
  const bridgeState = bridge ? (bridge.readyForTunnel ? "MCP bridge ready for tunnel." : "MCP bridge needs attention.") : "MCP bridge preflight not loaded.";
  if (!blockers.length) return `All configured integration gates are ready. ${bridgeState}`;
  const blockerText = blockers
    .map((item) => `${item.key}: ${(item.missing ?? []).join(", ")}`)
    .slice(0, 3)
    .join(" | ");
  return `${blockers.length} integration gate(s) need attention. ${blockerText}. ${bridgeState}`;
}

function renderReadinessReport(report) {
  const blockers = report.blockers ?? [];
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
    sections.coldOutreach,
    sections.clientNeeds,
    sections.preparedReplies,
    sections.nextAction,
  ]
    .filter(Boolean)
    .join("\n");
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
  if (!leads.length) {
    return `No leads found. Sources checked: ${sources}.`;
  }
  return [
    `Found ${leads.length} leads. Sources: ${sources}.`,
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
  return synced
    .map((item) =>
      [
        `${item.account}: fetched ${item.fetched}, ingested ${item.ingested}`,
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

async function refreshClientNeedAlerts({ announceNew = false, loadingText = null } = {}) {
  if (loadingText) elements.clientAlertsResult.textContent = loadingText;
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
    ? `Client alert watch active. Open requests: ${result.count ?? alerts.length}.`
    : `Client alert watch paused. Open requests: ${result.count ?? alerts.length}.`;

  if (announceNew && newAlerts.length) {
    speak(newAlerts[0].jarvisAlert ?? result.summary ?? "Jarvis: Mas novu klientsku poziadavku.");
  }
  return result;
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

function renderWebBridgePreflight(result) {
  return [
    `Tunnel ready: ${result.readyForTunnel ? "yes" : "no"}`,
    `Token configured: ${result.tokenConfigured ? "yes" : "no"}`,
    `Tunnel command: ${result.tunnelCommand ?? "npm run web:tunnel"}`,
    `MCP tools: ${result.mcpToolCount}`,
    `Approval tools: ${(result.riskyToolsRequiringApproval ?? []).join(", ") || "none"}`,
    `Path policy: ${result.pathPolicy}`,
    `Manifest: ${result.manifestUrl}`,
    ...(result.warnings?.length ? ["", ...result.warnings.map((warning) => `Warning: ${warning}`)] : []),
  ].join("\n");
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
      frameworkAgreementDate: "[dátum]",
      projectAppendixDate: "[dátum]",
      plannedLaunchDate: "[dátum]",
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
  speak(await arcigyApi.coldOutreachBrief({ text: "cold outreach za posledných 7 dní" }));
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
elements.checkWebBridge.addEventListener("click", async () => {
  try {
    elements.webBridgeResult.textContent = "Checking web bridge...";
    const result = await arcigyApi.webBridgePreflight();
    elements.webBridgeResult.textContent = renderWebBridgePreflight(result);
    const health = await arcigyApi.systemHealth();
    renderCommandDeck(health, result);
  } catch (error) {
    elements.webBridgeResult.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.readinessReport.addEventListener("click", async () => {
  try {
    elements.commandTimeline.textContent = "Building production readiness report...";
    const report = await arcigyApi.productionReadiness({ live: false });
    elements.commandTimeline.textContent = report.summary;
    elements.response.textContent = renderReadinessReport(report);
  } catch (error) {
    elements.commandTimeline.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.operatorBriefing.addEventListener("click", async () => {
  try {
    elements.commandTimeline.textContent = "Building operator briefing...";
    const briefing = await arcigyApi.operatorBriefing({ periodLabel: "poslednych 7 dni" });
    elements.commandTimeline.textContent = briefing.sections?.nextAction ?? briefing.summary;
    elements.response.textContent = renderOperatorBriefing(briefing);
    speak(briefing.speechText ?? briefing.summary);
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
    elements.leadResult.textContent = "Exporting leads to Google Sheets...";
    const result = await arcigyApi.appendLeadsToGoogleSheet({
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
    elements.contractResult.textContent = "Generating...";
    const intake = JSON.parse(elements.contractIntake.value);
    const result = await arcigyApi.generateContracts({ intake });
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
elements.gmailQuery.value = "newer_than:7d";
elements.leadQuery.value = "automation agency Bratislava";
void refreshHealth();
startClientNeedWatch();
setMode("idle");
