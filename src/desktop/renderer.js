const state = {
  mode: "idle",
  session: { state: "idle", wakeWord: "jarvis" },
  recognition: null,
  listening: false,
};

const elements = {
  statusBadge: document.querySelector("#statusBadge"),
  healthGrid: document.querySelector("#healthGrid"),
  listenButton: document.querySelector("#listenButton"),
  transcript: document.querySelector("#transcript"),
  response: document.querySelector("#response"),
  orb: document.querySelector("#orb"),
  simulateWake: document.querySelector("#simulateWake"),
  submitTranscript: document.querySelector("#submitTranscript"),
  coldBrief: document.querySelector("#coldBrief"),
  clientMessage: document.querySelector("#clientMessage"),
  draftReply: document.querySelector("#draftReply"),
  draftResult: document.querySelector("#draftResult"),
  gmailQuery: document.querySelector("#gmailQuery"),
  syncGmail: document.querySelector("#syncGmail"),
  gmailResult: document.querySelector("#gmailResult"),
  smartleadCampaignId: document.querySelector("#smartleadCampaignId"),
  checkSmartlead: document.querySelector("#checkSmartlead"),
  smartleadResult: document.querySelector("#smartleadResult"),
  leadQuery: document.querySelector("#leadQuery"),
  discoverLeads: document.querySelector("#discoverLeads"),
  leadResult: document.querySelector("#leadResult"),
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
  generateAiReply: (payload) => postJson("/api/generate-ai-reply", payload),
  syncGmailRecentMessages: (payload) => postJson("/api/sync-gmail-recent-messages", payload),
  getSmartleadCampaignStatus: (payload) => postJson("/api/smartlead-campaign-status", payload),
  discoverLeads: (payload) => postJson("/api/discover-leads", payload),
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

async function refreshHealth() {
  try {
    renderHealth(await arcigyApi.systemHealth());
  } catch (error) {
    elements.healthGrid.textContent = error instanceof Error ? error.message : String(error);
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
elements.discoverLeads.addEventListener("click", async () => {
  try {
    elements.leadResult.textContent = "Searching...";
    const result = await arcigyApi.discoverLeads({
      query: elements.leadQuery.value,
      maxResults: 8,
    });
    elements.leadResult.textContent = renderLeadDiscovery(result);
  } catch (error) {
    elements.leadResult.textContent = error instanceof Error ? error.message : String(error);
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

elements.contractIntake.value = JSON.stringify(sampleContractIntake(), null, 2);
elements.clientMessage.value = "Potrebujem upraviť onboarding automatizáciu do piatku.";
elements.gmailQuery.value = "newer_than:7d";
elements.leadQuery.value = "automation agency Bratislava";
void refreshHealth();
setMode("idle");
