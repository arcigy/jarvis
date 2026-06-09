import { generateGeminiText, type FetchLike } from "./gemini.ts";
import { safeAiJson, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import type { RuntimeEnv } from "./env.ts";

export type ContractIntakeDraftInput = {
  brief: string;
  baseIntake?: Record<string, unknown>;
};

export async function draftContractIntake(
  input: ContractIntakeDraftInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const brief = safeAiPromptPart(input.brief);
  if (!brief) throw new Error("Contract brief is required.");
  const result = await generateGeminiText(
    {
      model: "gemini-2.5-flash",
      temperature: 0.2,
      outputSafety: "structured",
      systemInstruction:
        "You are Arcigy Jarvis. Return only valid JSON for the Arcigy contract intake schema. Do not include markdown, comments, signatures, secrets, or legal advice.",
      prompt: [
        "Create a filled Arcigy contract intake JSON object from this business brief.",
        "Keep Arcigy/provider details unchanged when present in the base intake.",
        "If a value is unknown, use [doplnit] so the operator can review it; final DOCX generation rejects unresolved placeholders.",
        "The JSON must include client, contacts, project, pricing, dates, specialTerms, and additionalAttachments when useful.",
        "Base intake JSON:",
        safeAiJson(input.baseIntake ?? {}),
        "Business brief:",
        safeUntrustedAiPromptPart(brief, "contract business brief"),
      ].join("\n"),
    },
    env,
    fetchImpl
  );
  return parseJsonObject(result.text);
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini did not return a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
