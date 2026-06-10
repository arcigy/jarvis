import { safeAiJson, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { parseJsonObject } from "./contract-intake-draft.ts";
import type { RuntimeEnv } from "./env.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";

export type PriceOfferDraftInput = {
  brief: string;
  baseOffer?: Record<string, unknown>;
};

export async function draftPriceOfferIntake(
  input: PriceOfferDraftInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const brief = safeAiPromptPart(input.brief);
  if (!brief) throw new Error("Price offer brief is required.");
  const result = await generateGeminiText(
    {
      model: "gemini-2.5-flash",
      temperature: 0.2,
      outputSafety: "structured",
      systemInstruction:
        "You are Arcigy Jarvis. Return only valid JSON for an Arcigy price offer intake. Do not include markdown, comments, secrets, or claims that a document was generated.",
      prompt: [
        "Create a filled Arcigy price offer intake JSON object from this business brief.",
        "Required fields: company, ico when available, customerName or last_name_with_salution, what_to_do, cost_one, cost_two, cost, roi_rows.",
        "Use EUR values. Use cost_one for implementation/setup, cost_two for monthly or second-phase price, and cost for total or main headline price.",
        "roi_rows must be an array of {label,value,highlight} objects useful for a proposal ROI table.",
        "If a required value is unknown, use [doplnit] so final DOCX generation rejects it until the operator reviews it.",
        "Base offer JSON:",
        safeAiJson(input.baseOffer ?? {}),
        "Business brief:",
        safeUntrustedAiPromptPart(brief, "price offer business brief"),
      ].join("\n"),
    },
    env,
    fetchImpl
  );
  return parseJsonObject(result.text);
}
