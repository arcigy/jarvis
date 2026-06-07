const state = {
  mode: "idle",
  session: { state: "idle", wakeWord: "jarvis" },
  recognition: null,
  listening: false,
};

const elements = {
  statusBadge: document.querySelector("#statusBadge"),
  listenButton: document.querySelector("#listenButton"),
  transcript: document.querySelector("#transcript"),
  response: document.querySelector("#response"),
  orb: document.querySelector("#orb"),
  simulateWake: document.querySelector("#simulateWake"),
  submitTranscript: document.querySelector("#submitTranscript"),
  coldBrief: document.querySelector("#coldBrief"),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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

function demoColdOutreachMetrics() {
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

async function handleTranscript(text) {
  const trimmed = text.trim();
  elements.transcript.value = trimmed;

  const result = await window.arcigyDesktop.jarvisVoiceEvent({
    session: state.session,
    text: trimmed,
    metrics: demoColdOutreachMetrics(),
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
  speak(await window.arcigyDesktop.coldOutreachBrief(demoColdOutreachMetrics()));
});

setMode("idle");
