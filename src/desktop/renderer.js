const state = {
  mode: "idle",
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

function containsWakeWord(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .includes("jarvis");
}

function coldOutreachBrief() {
  return "Za dnes sme napísali 128 ľuďom. 47.7% si email otvorilo, 14 ľudí odpísalo, z toho 5 pozitívne. Pripravil som ti 5 odpovedí na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.";
}

function handleTranscript(text) {
  const trimmed = text.trim();
  elements.transcript.value = trimmed;

  if (state.mode === "idle" && containsWakeWord(trimmed)) {
    setMode("awake");
    speak("Áno, počúvam.");
    return;
  }

  if (state.mode === "awake") {
    setMode("idle");
    if (trimmed.toLowerCase().includes("cold")) {
      speak(coldOutreachBrief());
      return;
    }
    speak("Rozumiem. Tento príkaz pošlem lokálnemu MCP nástroju, keď bude pripojený desktop bridge.");
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
    if (text) handleTranscript(text);
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

elements.simulateWake.addEventListener("click", () => handleTranscript("Jarvis"));
elements.submitTranscript.addEventListener("click", () => handleTranscript(elements.transcript.value));
elements.coldBrief.addEventListener("click", () => speak(coldOutreachBrief()));

setMode("idle");
