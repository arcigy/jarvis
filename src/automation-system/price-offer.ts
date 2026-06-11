import { safeAiJson, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { parseJsonObject } from "./contract-intake-draft.ts";
import type { RuntimeEnv } from "./env.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";

export type PriceOfferDraftInput = {
  brief: string;
  baseOffer?: Record<string, unknown>;
};

export type PricingProposalItem = {
  id?: string;
  name: string;
  quantity?: number;
  unitPriceEur: number;
  unitCostEur?: number;
  category?: string;
  recurring?: boolean;
};

export type PricingProposalPreviewInput = {
  customerId?: string;
  clientName?: string;
  projectName?: string;
  items: PricingProposalItem[];
  manualDiscountPercent?: number;
  currency?: "EUR";
  vatPercent?: number;
  validDays?: number;
  minMarginPercent?: number;
  minTotalEur?: number;
  maxDiscountPercent?: number;
  vip?: boolean;
};

export type PricingProposalPreview = {
  mode: "pricing-proposal-preview";
  customerId: string | null;
  clientName: string | null;
  projectName: string | null;
  currency: "EUR";
  proposalId: string;
  validUntil: string;
  totals: {
    itemCount: number;
    quantity: number;
    subtotalEur: number;
    estimatedCostEur: number;
    discountPercent: number;
    discountEur: number;
    netTotalEur: number;
    vatPercent: number;
    vatEur: number;
    grossTotalEur: number;
    marginEur: number;
    marginPercent: number;
  };
  discounts: {
    manualPercent: number;
    bulkPercent: number;
    vipBonusPercent: number;
    requestedPercent: number;
    appliedPercent: number;
    capped: boolean;
  };
  validation: {
    valid: boolean;
    messages: string[];
  };
  lineItems: Array<{
    id: string | null;
    name: string;
    category: string | null;
    quantity: number;
    unitPriceEur: number;
    unitCostEur: number;
    lineSubtotalEur: number;
    lineCostEur: number;
    recurring: boolean;
  }>;
  offerPayload: Record<string, unknown>;
  nextToolCalls: Array<{
    tool: "arcigy.generate_price_offer_document";
    approvalRequired: true;
    payload: Record<string, unknown>;
  }>;
  summary: string;
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

export function buildPricingProposalPreview(input: PricingProposalPreviewInput): PricingProposalPreview {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("At least one pricing item is required.");
  }

  const currency = "EUR";
  const maxDiscountPercent = clampPercent(input.maxDiscountPercent ?? 30);
  const minMarginPercent = nonnegative(input.minMarginPercent ?? 15);
  const minTotalEur = nonnegative(input.minTotalEur ?? 100);
  const vatPercent = clampPercent(input.vatPercent ?? 20);
  const validDays = Math.max(1, Math.floor(input.validDays ?? 30));
  const customerId = cleanText(input.customerId);
  const isVip = input.vip === true || /^VIP[-_]/i.test(customerId ?? "");
  const lineItems = input.items.map(normalizePricingItem);
  const totalQuantity = roundMoney(lineItems.reduce((sum, item) => sum + item.quantity, 0));
  const subtotalEur = roundMoney(lineItems.reduce((sum, item) => sum + item.lineSubtotalEur, 0));
  const estimatedCostEur = roundMoney(lineItems.reduce((sum, item) => sum + item.lineCostEur, 0));
  const bulkPercent = bulkDiscountPercent(totalQuantity);
  const vipBonusPercent = isVip ? 5 : 0;
  const manualPercent = clampPercent(input.manualDiscountPercent ?? 0);
  const requestedPercent = Math.max(manualPercent, bulkPercent + vipBonusPercent);
  const appliedPercent = Math.min(requestedPercent, maxDiscountPercent);
  const discountEur = roundMoney(subtotalEur * appliedPercent / 100);
  const netTotalEur = roundMoney(subtotalEur - discountEur);
  const vatEur = roundMoney(netTotalEur * vatPercent / 100);
  const grossTotalEur = roundMoney(netTotalEur + vatEur);
  const marginEur = roundMoney(netTotalEur - estimatedCostEur);
  const marginPercent = netTotalEur > 0 ? roundPercent(marginEur / netTotalEur * 100) : 0;
  const messages: string[] = [];

  if (marginPercent < minMarginPercent) messages.push(`Error: Margin must be at least ${minMarginPercent}%.`);
  if (netTotalEur < minTotalEur) messages.push(`Error: Net total must be at least ${minTotalEur} EUR.`);
  if (requestedPercent > maxDiscountPercent) messages.push(`Warning: Requested discount ${roundPercent(requestedPercent)}% was capped to ${maxDiscountPercent}%.`);
  if (messages.length === 0) messages.push("Success: Pricing proposal is within Arcigy limits.");

  const proposalId = `price-${Date.now().toString(36)}-${hashPricingInput(input).slice(0, 8)}`;
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
  const clientName = cleanText(input.clientName);
  const projectName = cleanText(input.projectName);
  const headline = lineItems.map((item) => item.name).join(", ");
  const offerPayload: Record<string, unknown> = {
    company: clientName ?? "[doplnit]",
    customerName: clientName ?? "[doplnit]",
    what_to_do: projectName ? `${projectName}: ${headline}` : headline,
    cost_one: `${netTotalEur.toFixed(2)} EUR bez DPH`,
    cost_two: `${grossTotalEur.toFixed(2)} EUR s DPH`,
    cost: `${netTotalEur.toFixed(2)} EUR`,
    roi_rows: [
      { label: "Povodna cena", value: `${subtotalEur.toFixed(2)} EUR`, highlight: false },
      { label: "Zlava", value: `${appliedPercent.toFixed(1)}% / ${discountEur.toFixed(2)} EUR`, highlight: appliedPercent > 0 },
      { label: "Marza", value: `${marginPercent.toFixed(1)}%`, highlight: marginPercent >= minMarginPercent },
      { label: "Platnost", value: validUntil.slice(0, 10), highlight: false },
    ],
    pricing_preview: {
      proposalId,
      validUntil,
      totals: {
        subtotalEur,
        netTotalEur,
        grossTotalEur,
        marginPercent,
      },
    },
  };

  return {
    mode: "pricing-proposal-preview",
    customerId,
    clientName,
    projectName,
    currency,
    proposalId,
    validUntil,
    totals: {
      itemCount: lineItems.length,
      quantity: totalQuantity,
      subtotalEur,
      estimatedCostEur,
      discountPercent: roundPercent(appliedPercent),
      discountEur,
      netTotalEur,
      vatPercent,
      vatEur,
      grossTotalEur,
      marginEur,
      marginPercent,
    },
    discounts: {
      manualPercent,
      bulkPercent,
      vipBonusPercent,
      requestedPercent: roundPercent(requestedPercent),
      appliedPercent: roundPercent(appliedPercent),
      capped: requestedPercent > maxDiscountPercent,
    },
    validation: {
      valid: marginPercent >= minMarginPercent && netTotalEur >= minTotalEur,
      messages,
    },
    lineItems,
    offerPayload,
    nextToolCalls: [
      {
        tool: "arcigy.generate_price_offer_document",
        approvalRequired: true,
        payload: {
          offer: offerPayload,
          approval: { approved: true },
        },
      },
    ],
    summary: `Cenovy preview: ${netTotalEur.toFixed(2)} EUR bez DPH, marza ${marginPercent.toFixed(1)}%, zlava ${appliedPercent.toFixed(1)}%. Dokument negenerujem bez schvalenia.`,
  };
}

function normalizePricingItem(item: PricingProposalItem): PricingProposalPreview["lineItems"][number] {
  const name = cleanText(item.name);
  if (!name) throw new Error("Pricing item name is required.");
  const quantity = positiveNumber(item.quantity ?? 1, "Pricing item quantity");
  const unitPriceEur = nonnegativeNumber(item.unitPriceEur, "Pricing item unitPriceEur");
  const unitCostEur = nonnegativeNumber(item.unitCostEur ?? unitPriceEur * 0.6, "Pricing item unitCostEur");
  return {
    id: cleanText(item.id),
    name,
    category: cleanText(item.category),
    quantity,
    unitPriceEur: roundMoney(unitPriceEur),
    unitCostEur: roundMoney(unitCostEur),
    lineSubtotalEur: roundMoney(quantity * unitPriceEur),
    lineCostEur: roundMoney(quantity * unitCostEur),
    recurring: item.recurring === true,
  };
}

function bulkDiscountPercent(quantity: number): number {
  if (quantity >= 100) return 20;
  if (quantity >= 50) return 15;
  if (quantity >= 10) return 10;
  return 0;
}

function hashPricingInput(value: unknown): string {
  let hash = 0;
  const text = JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number.`);
  return number;
}

function nonnegativeNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return number;
}

function nonnegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
