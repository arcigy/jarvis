import { requireEnv, type RuntimeEnv } from "./env.ts";
import type { FetchLike } from "./gemini.ts";

const smartleadBaseUrl = "https://server.smartlead.ai/api/v1";

export type SmartleadCampaign = {
  id: number | string;
  name?: string;
  status?: string;
  [key: string]: unknown;
};

export type SmartleadCampaignStatus = {
  campaignId?: string;
  campaigns?: SmartleadCampaign[];
  statistics?: unknown;
};

export type SmartleadOutreachBriefInput = {
  campaignId?: string;
  periodLabel?: string;
  maxCampaigns?: number;
  preparedPositiveReplyCount?: number;
  pendingApprovalCount?: number;
};

export type SmartleadOutreachBrief = {
  campaignId: string;
  campaignIds: string[];
  campaignCount: number;
  periodLabel: string;
  summary: string;
  statistics: unknown;
  metrics: {
    contacted: number;
    opened: number;
    replied: number;
    positiveReplies: number | null;
    openRate: number;
    replyRate: number;
    positiveReplyRate: number | null;
  };
  notes: string[];
};

export type SmartleadLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  custom_fields?: Record<string, string | number | boolean>;
};

export type SmartleadAddLeadsInput = {
  campaignId: string | number;
  leads: SmartleadLead[];
  settings?: {
    ignore_global_block_list?: boolean;
    ignore_unsubscribe_list?: boolean;
  };
};

export type SmartleadAddLeadsResult = {
  campaignId: string;
  submitted: number;
  batches: number;
  responses: unknown[];
};

export async function getSmartleadCampaignStatus(
  input: { campaignId?: string } = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignStatus> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  if (!input.campaignId) {
    const campaigns = await smartleadFetch<SmartleadCampaign[]>("/campaigns/", apiKey, fetchImpl);
    return { campaigns };
  }

  const statistics = await smartleadFetch<unknown>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/statistics`,
    apiKey,
    fetchImpl
  );
  return {
    campaignId: input.campaignId,
    statistics,
  };
}

export async function getSmartleadOutreachBrief(
  input: SmartleadOutreachBriefInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadOutreachBrief> {
  const campaignId = input.campaignId?.trim();
  if (campaignId) {
    const status = await getSmartleadCampaignStatus({ campaignId }, env, fetchImpl);
    return buildSmartleadOutreachBrief({
      campaignId,
      campaignIds: [campaignId],
      campaignCount: 1,
      periodLabel: input.periodLabel ?? "poslednych 7 dni",
      statistics: status.statistics,
      preparedPositiveReplyCount: input.preparedPositiveReplyCount ?? 0,
      pendingApprovalCount: input.pendingApprovalCount ?? 0,
    });
  }

  const campaignsStatus = await getSmartleadCampaignStatus({}, env, fetchImpl);
  const campaigns = (campaignsStatus.campaigns ?? []).filter((campaign) => campaign.id !== undefined && campaign.id !== null);
  const selectedCampaigns = campaigns.slice(0, clampMaxCampaigns(input.maxCampaigns));
  if (!selectedCampaigns.length) {
    throw new Error("Smartlead did not return any campaigns to summarize.");
  }

  const campaignStats = await Promise.all(
    selectedCampaigns.map(async (campaign) => {
      const id = String(campaign.id);
      const status = await getSmartleadCampaignStatus({ campaignId: id }, env, fetchImpl);
      return {
        campaignId: id,
        name: campaign.name,
        status: campaign.status,
        statistics: status.statistics,
      };
    })
  );

  return buildSmartleadOutreachBrief({
    campaignId: "all",
    campaignIds: campaignStats.map((item) => item.campaignId),
    campaignCount: campaignStats.length,
    periodLabel: input.periodLabel ?? "poslednych 7 dni",
    statistics: campaignStats,
    preparedPositiveReplyCount: input.preparedPositiveReplyCount ?? 0,
    pendingApprovalCount: input.pendingApprovalCount ?? 0,
  });
}

export async function addLeadsToSmartleadCampaign(
  input: SmartleadAddLeadsInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadAddLeadsResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = String(input.campaignId).trim();
  if (!campaignId) throw new Error("Smartlead campaignId is required.");
  if (!input.leads.length) throw new Error("At least one Smartlead lead is required.");

  const responses: unknown[] = [];
  const batches = chunk(input.leads.map(normalizeSmartleadLead), 100);
  for (const batch of batches) {
    const response = await smartleadFetch<unknown>(
      `/campaigns/${encodeURIComponent(campaignId)}/leads`,
      apiKey,
      fetchImpl,
      {
        method: "POST",
        body: {
          lead_list: batch,
          settings: {
            ignore_global_block_list: input.settings?.ignore_global_block_list ?? false,
            ignore_unsubscribe_list: input.settings?.ignore_unsubscribe_list ?? false,
          },
        },
      }
    );
    responses.push(response);
  }
  return {
    campaignId,
    submitted: input.leads.length,
    batches: batches.length,
    responses,
  };
}

export function buildSmartleadLead(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  website?: string;
  customFields?: Record<string, string | number | boolean | null | undefined>;
}): SmartleadLead {
  const custom_fields = Object.fromEntries(
    Object.entries(input.customFields ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null && entry[1] !== "")
  );
  return normalizeSmartleadLead({
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    company_name: input.companyName,
    website: input.website,
    custom_fields: Object.keys(custom_fields).length ? custom_fields : undefined,
  });
}

export function buildSmartleadOutreachBrief(input: {
  campaignId: string;
  campaignIds?: string[];
  campaignCount?: number;
  periodLabel: string;
  statistics: unknown;
  preparedPositiveReplyCount?: number;
  pendingApprovalCount?: number;
}): SmartleadOutreachBrief {
  const contacted =
    readOptionalMetric(input.statistics, ["sent_count", "sent", "emails_sent", "total_sent", "sent_emails_count", "total_stats"]) ??
    countPresentFields(input.statistics, ["sent_time"]);
  const opened =
    readOptionalMetric(input.statistics, ["open_count", "opened", "opened_count", "unique_open_count", "total_opens"]) ??
    countPresentFields(input.statistics, ["open_time"]);
  const replied =
    readOptionalMetric(input.statistics, ["reply_count", "replied", "replied_count", "unique_reply_count", "total_replies"]) ??
    countPresentFields(input.statistics, ["reply_time"]);
  const prepared = input.preparedPositiveReplyCount ?? 0;
  const smartleadPositiveReplies = readOptionalMetric(input.statistics, [
    "positive_reply_count",
    "positive_replies",
    "positive_replied_count",
    "interested_count",
  ]) ?? countTextFields(input.statistics, ["lead_category"], ["interested", "positive", "meeting", "booked", "qualified"]);
  const positiveReplies = smartleadPositiveReplies ?? (prepared > 0 ? prepared : null);

  const openRate = rate(opened, contacted);
  const replyRate = rate(replied, contacted);
  const positiveReplyRate = positiveReplies === null ? null : rate(positiveReplies, replied);
  const notes: string[] = [];
  const campaignCount = input.campaignCount ?? input.campaignIds?.length ?? 1;
  const campaignScope = campaignCount > 1 ? ` v ${campaignCount} kampaniach` : "";
  const summaryParts = [
    `Za ${input.periodLabel} sme cez Smartlead napisali ${contacted} ludom${campaignScope}.`,
    `${openRate}% si email otvorilo, ${replied} ludi odpisalo.`,
  ];

  if (positiveReplies === null) {
    notes.push("Smartlead statistics did not include a positive reply field.");
    summaryParts[1] = `${openRate}% si email otvorilo, ${replied} ludi odpisalo, pozitivne odpovede su zatial neklasifikovane.`;
  } else if (smartleadPositiveReplies === null) {
    notes.push("Smartlead statistics did not include a positive reply field; using locally prepared positive replies.");
    summaryParts[1] = `${openRate}% si email otvorilo, ${replied} ludi odpisalo, z toho ${positiveReplies} lokalne klasifikovane pozitivne.`;
  } else {
    summaryParts[1] = `${openRate}% si email otvorilo, ${replied} ludi odpisalo, z toho ${positiveReplies} pozitivne.`;
  }

  if (prepared > 0) {
    summaryParts.push(`Pripravil som ti ${smartleadReplyLabel(prepared)} na pozitivne reakcie a poslem ich az na tvoje potvrdenie.`);
  }

  const pending = input.pendingApprovalCount ?? 0;
  if (pending > 0) {
    summaryParts.push(`Caka ${smartleadReplyLabel(pending)} na schvalenie.`);
  }

  return {
    campaignId: input.campaignId,
    campaignIds: input.campaignIds ?? [input.campaignId],
    campaignCount,
    periodLabel: input.periodLabel,
    summary: summaryParts.join(" "),
    statistics: input.statistics,
    metrics: {
      contacted,
      opened,
      replied,
      positiveReplies,
      openRate,
      replyRate,
      positiveReplyRate,
    },
    notes,
  };
}

function smartleadReplyLabel(count: number): string {
  if (count === 1) return "1 odpoved";
  if (count > 1 && count < 5) return `${count} odpovede`;
  return `${count} odpovedi`;
}

function clampMaxCampaigns(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(Math.floor(value), 25));
}

async function smartleadFetch<T>(
  path: string,
  apiKey: string,
  fetchImpl: FetchLike,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${smartleadBaseUrl}${path}${separator}api_key=${encodeURIComponent(apiKey)}`, {
    method: init.method ?? "GET",
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Smartlead request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizeSmartleadLead(lead: SmartleadLead): SmartleadLead {
  const email = lead.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Smartlead lead email is required.");
  return {
    email,
    first_name: cleanOptional(lead.first_name),
    last_name: cleanOptional(lead.last_name),
    company_name: cleanOptional(lead.company_name),
    website: cleanWebsite(lead.website),
    custom_fields: lead.custom_fields && Object.keys(lead.custom_fields).length ? lead.custom_fields : undefined,
  };
}

function cleanOptional(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function cleanWebsite(value: string | undefined): string | undefined {
  const clean = value?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  return clean || undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function readOptionalMetric(value: unknown, keys: string[]): number | null {
  const wanted = new Set(keys.map(normalizeKey));
  const found = findMetricValues(value, wanted);
  if (!found.length) return null;
  return found.reduce((sum, item) => sum + item, 0);
}

function findMetricValues(value: unknown, wanted: Set<string>): number[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => findMetricValues(item, wanted));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const output: number[] = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (wanted.has(normalizeKey(key))) {
      const numeric = toNumber(item);
      if (numeric !== null) output.push(numeric);
    }
    output.push(...findMetricValues(item, wanted));
  }
  return output;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function countPresentFields(value: unknown, keys: string[]): number {
  const wanted = new Set(keys.map(normalizeKey));
  return countMatchingFields(value, (key, item) => wanted.has(normalizeKey(key)) && isPresent(item));
}

function countTextFields(value: unknown, keys: string[], needles: string[]): number | null {
  const wanted = new Set(keys.map(normalizeKey));
  const normalizedNeedles = needles.map(normalizeKey);
  let fieldSeen = false;
  const count = countMatchingFields(
    value,
    (key, item) => {
      if (!wanted.has(normalizeKey(key))) return false;
      fieldSeen = true;
      return typeof item === "string" && normalizedNeedles.some((needle) => normalizeKey(item).includes(needle));
    }
  );
  return fieldSeen ? count : null;
}

function countMatchingFields(value: unknown, predicate: (key: string, item: unknown) => boolean): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countMatchingFields(item, predicate), 0);
  }
  if (!value || typeof value !== "object") {
    return 0;
  }
  let count = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (predicate(key, item)) count += 1;
    count += countMatchingFields(item, predicate);
  }
  return count;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}
