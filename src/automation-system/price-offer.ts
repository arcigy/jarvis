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

export type ServiceCapacityItem = {
  serviceId?: string;
  name: string;
  requestedQuantity?: number;
  availableQuantity?: number;
  unitLabel?: string;
  unitPriceEur?: number;
  unitCostEur?: number;
  minHealthyQuantity?: number;
  category?: string;
};

export type ServiceCapacityPreviewInput = {
  clientName?: string;
  projectName?: string;
  services: ServiceCapacityItem[];
  defaultMinHealthyQuantity?: number;
};

export type ServiceCapacityPreview = {
  mode: "service-capacity-preview";
  clientName: string | null;
  projectName: string | null;
  status: "ready" | "attention" | "blocked";
  checkedAt: string;
  services: Array<{
    serviceId: string | null;
    name: string;
    category: string | null;
    requestedQuantity: number;
    availableQuantity: number;
    reservedQuantity: number;
    remainingQuantity: number;
    unitLabel: string;
    status: "in_stock" | "low_stock" | "out_of_stock";
    message: string;
  }>;
  blockedServices: string[];
  lowCapacityServices: string[];
  nextToolCalls: Array<{
    tool: "arcigy.build_pricing_proposal_preview";
    approvalRequired: false;
    payload: Record<string, unknown>;
  }>;
  summary: string;
};

export type PricingInventoryGuardProduct = PricingProposalItem & {
  productId?: string;
  availableQuantity?: number;
  minHealthyQuantity?: number;
  unitLabel?: string;
};

export type PricingInventoryGuardPreview = {
  mode: "pricing-inventory-guard-preview";
  status: "ready" | "attention" | "blocked";
  clientName: string | null;
  projectName: string | null;
  totals: {
    products: number;
    requestedQuantity: number;
    subtotalEur: number;
    netTotalEur: number;
    marginPercent: number;
    discountPercent: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  products: Array<{
    productId: string | null;
    name: string;
    requestedQuantity: number;
    availableQuantity: number;
    remainingQuantity: number;
    unitLabel: string;
    status: "in_stock" | "low_stock" | "out_of_stock";
    message: string;
  }>;
  pricing: {
    proposalId: string;
    valid: boolean;
    messages: string[];
    discounts: PricingProposalPreview["discounts"];
  };
  nextToolCalls: Array<{
    tool: "arcigy.build_pricing_proposal_preview";
    approvalRequired: false;
    payload: Record<string, unknown>;
  }>;
  warnings: string[];
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

export function buildServiceCapacityPreview(input: ServiceCapacityPreviewInput): ServiceCapacityPreview {
  if (!Array.isArray(input.services) || input.services.length === 0) {
    throw new Error("At least one service capacity item is required.");
  }
  const defaultMinHealthyQuantity = positiveNumber(input.defaultMinHealthyQuantity ?? 3, "defaultMinHealthyQuantity");
  const services = input.services.map((service) => normalizeCapacityItem(service, defaultMinHealthyQuantity));
  const blockedServices = services.filter((service) => service.status === "out_of_stock").map((service) => service.name);
  const lowCapacityServices = services.filter((service) => service.status === "low_stock").map((service) => service.name);
  const status = blockedServices.length ? "blocked" : lowCapacityServices.length ? "attention" : "ready";
  const pricedItems = input.services
    .filter((service) => Number.isFinite(Number(service.unitPriceEur)))
    .map((service) => ({
      id: cleanText(service.serviceId) ?? cleanText(service.name) ?? "service",
      name: cleanText(service.name) ?? "Service",
      quantity: positiveNumber(service.requestedQuantity ?? 1, "service requestedQuantity"),
      unitPriceEur: nonnegativeNumber(service.unitPriceEur, "service unitPriceEur"),
      unitCostEur: service.unitCostEur === undefined ? undefined : nonnegativeNumber(service.unitCostEur, "service unitCostEur"),
      category: cleanText(service.category) ?? undefined,
    }));

  return {
    mode: "service-capacity-preview",
    clientName: cleanText(input.clientName),
    projectName: cleanText(input.projectName),
    status,
    checkedAt: new Date().toISOString(),
    services,
    blockedServices,
    lowCapacityServices,
    nextToolCalls: pricedItems.length
      ? [
          {
            tool: "arcigy.build_pricing_proposal_preview",
            approvalRequired: false,
            payload: {
              clientName: cleanText(input.clientName) ?? undefined,
              projectName: cleanText(input.projectName) ?? undefined,
              items: pricedItems,
            },
          },
        ]
      : [],
    summary: capacitySummary(status, services.length, blockedServices.length, lowCapacityServices.length),
  };
}

export function buildPricingInventoryGuardPreview(input: {
  customerId?: string;
  clientName?: string;
  projectName?: string;
  products: PricingInventoryGuardProduct[];
  manualDiscountPercent?: number;
  vip?: boolean;
  minMarginPercent?: number;
  minTotalEur?: number;
  maxDiscountPercent?: number;
  defaultMinHealthyQuantity?: number;
}): PricingInventoryGuardPreview {
  if (!Array.isArray(input.products) || input.products.length === 0) {
    throw new Error("At least one product is required.");
  }
  const proposal = buildPricingProposalPreview({
    customerId: input.customerId,
    clientName: input.clientName,
    projectName: input.projectName,
    items: input.products,
    manualDiscountPercent: input.manualDiscountPercent,
    vip: input.vip,
    minMarginPercent: input.minMarginPercent,
    minTotalEur: input.minTotalEur,
    maxDiscountPercent: input.maxDiscountPercent,
  });
  const defaultMinHealthyQuantity = Math.max(0, Number.isFinite(Number(input.defaultMinHealthyQuantity)) ? Number(input.defaultMinHealthyQuantity) : 3);
  const products = input.products.map((product) => {
    const name = cleanText(product.name);
    if (!name) throw new Error("Product name is required.");
    const requestedQuantity = positiveNumber(product.quantity ?? 1, "product quantity");
    const availableQuantity = Math.max(0, Number.isFinite(Number(product.availableQuantity)) ? Number(product.availableQuantity) : requestedQuantity);
    const minHealthyQuantity = Math.max(0, Number.isFinite(Number(product.minHealthyQuantity)) ? Number(product.minHealthyQuantity) : defaultMinHealthyQuantity);
    const remainingQuantity = roundMoney(availableQuantity - requestedQuantity);
    const status: PricingInventoryGuardPreview["products"][number]["status"] = remainingQuantity < 0 ? "out_of_stock" : remainingQuantity < minHealthyQuantity ? "low_stock" : "in_stock";
    const unitLabel = cleanText(product.unitLabel) ?? "ks";
    return {
      productId: cleanText(product.productId) ?? cleanText(product.id),
      name,
      requestedQuantity,
      availableQuantity: roundMoney(availableQuantity),
      remainingQuantity,
      unitLabel,
      status,
      message: capacityMessage(status, name, remainingQuantity, unitLabel),
    };
  });
  const warnings: string[] = [];
  if (proposal.discounts.capped) warnings.push("Requested discount was capped by maxDiscountPercent.");
  if (!proposal.validation.valid) warnings.push(...proposal.validation.messages);
  const outOfStock = products.filter((product) => product.status === "out_of_stock").length;
  const lowStock = products.filter((product) => product.status === "low_stock").length;
  const inStock = products.filter((product) => product.status === "in_stock").length;
  const status: PricingInventoryGuardPreview["status"] = outOfStock || !proposal.validation.valid ? "blocked" : lowStock || warnings.length ? "attention" : "ready";
  return {
    mode: "pricing-inventory-guard-preview",
    status,
    clientName: proposal.clientName,
    projectName: proposal.projectName,
    totals: {
      products: products.length,
      requestedQuantity: proposal.totals.quantity,
      subtotalEur: proposal.totals.subtotalEur,
      netTotalEur: proposal.totals.netTotalEur,
      marginPercent: proposal.totals.marginPercent,
      discountPercent: proposal.totals.discountPercent,
      inStock,
      lowStock,
      outOfStock,
    },
    products,
    pricing: {
      proposalId: proposal.proposalId,
      valid: proposal.validation.valid,
      messages: proposal.validation.messages,
      discounts: proposal.discounts,
    },
    nextToolCalls: status === "blocked"
      ? []
      : [{
          tool: "arcigy.build_pricing_proposal_preview",
          approvalRequired: false,
          payload: {
            customerId: input.customerId,
            clientName: input.clientName,
            projectName: input.projectName,
            items: input.products,
            manualDiscountPercent: proposal.discounts.appliedPercent,
            vip: input.vip,
            minMarginPercent: input.minMarginPercent,
            minTotalEur: input.minTotalEur,
            maxDiscountPercent: input.maxDiscountPercent,
          },
        }],
    warnings,
    summary: `Pricing inventory guard ${status}: ${products.length} produktov, ${outOfStock} out of stock, ${lowStock} low stock, marza ${proposal.totals.marginPercent.toFixed(1)}%, zlava ${proposal.totals.discountPercent.toFixed(1)}%. Ziadny dokument ani zapis neprebehol.`,
  };
}

function normalizeCapacityItem(item: ServiceCapacityItem, defaultMinHealthyQuantity: number): ServiceCapacityPreview["services"][number] {
  const name = cleanText(item.name);
  if (!name) throw new Error("Service name is required.");
  const requestedQuantity = positiveNumber(item.requestedQuantity ?? 1, "service requestedQuantity");
  const availableQuantity = Math.max(0, Number.isFinite(Number(item.availableQuantity)) ? Number(item.availableQuantity) : requestedQuantity);
  const minHealthyQuantity = Math.max(0, Number.isFinite(Number(item.minHealthyQuantity)) ? Number(item.minHealthyQuantity) : defaultMinHealthyQuantity);
  const remainingQuantity = roundMoney(availableQuantity - requestedQuantity);
  const status = remainingQuantity < 0 ? "out_of_stock" : remainingQuantity < minHealthyQuantity ? "low_stock" : "in_stock";
  return {
    serviceId: cleanText(item.serviceId),
    name,
    category: cleanText(item.category),
    requestedQuantity,
    availableQuantity: roundMoney(availableQuantity),
    reservedQuantity: requestedQuantity,
    remainingQuantity,
    unitLabel: cleanText(item.unitLabel) ?? "slot",
    status,
    message: capacityMessage(status, name, remainingQuantity, cleanText(item.unitLabel) ?? "slot"),
  };
}

function capacitySummary(status: ServiceCapacityPreview["status"], count: number, blocked: number, low: number): string {
  if (status === "blocked") return `Kapacitny preview: ${blocked}/${count} sluzieb nema dost kapacity. Najprv uprav scope alebo termin.`;
  if (status === "attention") return `Kapacitny preview: ${low}/${count} sluzieb je nizko na kapacite. Ponuku mozes pripravit, ale oznac riziko.`;
  return `Kapacitny preview: ${count}/${count} sluzieb ma dost kapacity. Mozes pokracovat pricing preview.`;
}

function capacityMessage(status: "in_stock" | "low_stock" | "out_of_stock", name: string, remaining: number, unit: string): string {
  if (status === "out_of_stock") return `${name}: chyba ${Math.abs(remaining).toFixed(1)} ${unit}.`;
  if (status === "low_stock") return `${name}: ostava iba ${remaining.toFixed(1)} ${unit}.`;
  return `${name}: kapacita je v poriadku, ostava ${remaining.toFixed(1)} ${unit}.`;
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
