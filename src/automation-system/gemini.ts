import { requireEnv, type RuntimeEnv } from "./env.ts";
import { redactSensitiveText, safeAiPromptPart, withAiSafetySystemInstruction } from "./ai-safety.ts";

export type FetchLike = typeof fetch;

export type GeminiTextInput = {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
};

export type GeminiTextResult = {
  model: string;
  text: string;
  attempts: number;
};

export type ClientReplyDraftInput = {
  clientName?: string;
  message: string;
  context?: string;
  language?: "sk" | "en";
  tone?: "direct" | "warm" | "executive";
};

export async function generateGeminiText(
  input: GeminiTextInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GeminiTextResult> {
  const apiKey = requireEnv(env, "GEMINI_API_KEY");
  const models = getGeminiModels(input, env);
  const maxRetries = getPositiveInteger(env.GEMINI_MAX_RETRIES, 2);
  const retryBaseMs = getPositiveInteger(env.GEMINI_RETRY_BASE_MS, 250);
  let attempts = 0;
  let lastError: Error | null = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts += 1;
      try {
        const text = await requestGeminiText(input, apiKey, model, fetchImpl);
        return { model, text, attempts };
      } catch (error) {
        const caughtError = error instanceof Error ? error : new Error(String(error));
        lastError = redactGeminiError(caughtError);
        if (!isRetryableGeminiError(caughtError) || attempt === maxRetries) break;
        await delay(retryBaseMs * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

async function requestGeminiText(input: GeminiTextInput, apiKey: string, model: string, fetchImpl: FetchLike): Promise<string> {
  const safePrompt = safeAiPromptPart(input.prompt);
  const safeSystemInstruction = withAiSafetySystemInstruction(input.systemInstruction);
  const response = await fetchImpl(
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
        contents: [
          {
            role: "user",
            parts: [{ text: safePrompt }],
          },
        ],
        generationConfig: {
          temperature: input.temperature ?? 0.35,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = new Error(`Gemini request failed for ${model}: ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return redactSensitiveText(text);
}

function getGeminiModels(input: GeminiTextInput, env: RuntimeEnv): string[] {
  const primary = input.model ?? env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const fallback = env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash-lite";
  return [primary, fallback].filter((model, index, models) => model && models.indexOf(model) === index);
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRetryableGeminiError(error: Error): boolean {
  const status = (error as Error & { status?: unknown }).status;
  return typeof status === "number" && [429, 500, 502, 503, 504].includes(status);
}

function redactGeminiError(error: Error): Error {
  const safeError = new Error(redactSensitiveText(error.message));
  const status = (error as Error & { status?: unknown }).status;
  if (typeof status === "number") {
    (safeError as Error & { status?: number }).status = status;
  }
  return safeError;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildClientReplyPrompt(input: ClientReplyDraftInput): GeminiTextInput {
  const language = input.language ?? "sk";
  const tone = input.tone ?? "executive";
  const client = input.clientName ? `Klient: ${input.clientName}` : "Klient: neznamy";
  return {
    systemInstruction:
      "Si Arcigy Jarvis. Pripravuj profesionalne, vecne a family-friendly odpovede klientom. Nikdy neslubuj odoslanie bez schvalenia pouzivatelom. Ak sprava obsahuje citlive udaje, nereprodukuj ich.",
    prompt: [
      client,
      `Jazyk odpovede: ${language}.`,
      `Ton: ${tone}.`,
      input.context ? `Kontext: ${safeAiPromptPart(input.context)}` : null,
      "Sprava klienta:",
      safeAiPromptPart(input.message),
      "Vytvor kratky navrh odpovede. Uved aj 1 vetu, co ma pouzivatel schvalit pred odoslanim.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
