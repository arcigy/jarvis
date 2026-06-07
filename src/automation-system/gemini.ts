import { requireEnv, type RuntimeEnv } from "./env.ts";

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
  const model = input.model ?? "gemini-2.5-flash";
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: input.systemInstruction
          ? {
              parts: [{ text: input.systemInstruction }],
            }
          : undefined,
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          temperature: input.temperature ?? 0.35,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return { model, text };
}

export function buildClientReplyPrompt(input: ClientReplyDraftInput): GeminiTextInput {
  const language = input.language ?? "sk";
  const tone = input.tone ?? "executive";
  const client = input.clientName ? `Klient: ${input.clientName}` : "Klient: neznámy";
  return {
    systemInstruction:
      "Si Arcigy Jarvis. Pripravuješ profesionálne, vecné a family-friendly odpovede klientom. Nikdy nesľubuj odoslanie bez schválenia používateľom.",
    prompt: [
      client,
      `Jazyk odpovede: ${language}.`,
      `Tón: ${tone}.`,
      input.context ? `Kontext: ${input.context}` : null,
      "Správa klienta:",
      input.message,
      "Vytvor krátky návrh odpovede. Uveď aj 1 vetu, čo má používateľ schváliť pred odoslaním.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
