import { answerJarvisIntent, resolveJarvisIntentFromTranscript, type JarvisIntent } from "./jarvis-intents.ts";

export type JarvisVoiceState = "idle" | "awake" | "processing";

export type JarvisVoiceSession = {
  state: JarvisVoiceState;
  wakeWord: string;
  lastTranscript?: string;
  lastResponse?: string;
};

export type JarvisVoiceEvent =
  | {
      type: "transcript";
      text: string;
      intent?: JarvisIntent;
    }
  | {
      type: "timeout";
    }
  | {
      type: "cancel";
    };

export type JarvisVoiceResult = {
  session: JarvisVoiceSession;
  shouldStartRecording: boolean;
  shouldStopRecording: boolean;
  speakText: string | null;
};

export function createJarvisVoiceSession(wakeWord = "jarvis"): JarvisVoiceSession {
  return {
    state: "idle",
    wakeWord: normalizeWakeWord(wakeWord),
  };
}

export function containsWakeWord(text: string, wakeWord = "jarvis"): boolean {
  const normalized = normalizeTranscript(text);
  const target = normalizeWakeWord(wakeWord);
  return normalized.split(/\s+/).includes(target);
}

export function handleJarvisVoiceEvent(
  session: JarvisVoiceSession,
  event: JarvisVoiceEvent
): JarvisVoiceResult {
  if (event.type === "timeout" || event.type === "cancel") {
    return {
      session: { ...session, state: "idle" },
      shouldStartRecording: false,
      shouldStopRecording: true,
      speakText: null,
    };
  }

  const transcript = event.text.trim();
  if (session.state === "idle") {
    if (!containsWakeWord(transcript, session.wakeWord)) {
      return {
        session: { ...session, lastTranscript: transcript },
        shouldStartRecording: false,
        shouldStopRecording: false,
        speakText: null,
      };
    }

    return {
      session: { ...session, state: "awake", lastTranscript: transcript },
      shouldStartRecording: true,
      shouldStopRecording: false,
      speakText: "Áno, počúvam.",
    };
  }

  const intent = event.intent ?? resolveJarvisIntentFromTranscript(transcript);
  if (!intent) {
    return {
      session: { ...session, state: "awake", lastTranscript: transcript },
      shouldStartRecording: true,
      shouldStopRecording: false,
      speakText: "Potrebujem ešte príkaz alebo kontext.",
    };
  }

  const response = answerJarvisIntent(intent);
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

function normalizeTranscript(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim();
}

function normalizeWakeWord(wakeWord: string): string {
  return normalizeTranscript(wakeWord);
}
