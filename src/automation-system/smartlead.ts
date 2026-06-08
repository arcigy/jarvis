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
  campaignId: string;
  periodLabel?: string;
  preparedPositiveReplyCount?: number;
  pendingApprovalCount?: number;
};

export type SmartleadOutreachBrief = {
  campaignId: string;
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
  if (!input.campaignId.trim()) {
    throw new Error("Smartlead outreach brief requires campaignId.");
  }

  const status = await getSmartleadCampaignStatus({ campaignId: input.campaignId }, env, fetchImpl);
  return buildSmartleadOutreachBrief({
    campaignId: input.campaignId,
    periodLabel: input.periodLabel ?? "poslednych 7 dni",
    statistics: status.statistics,
    preparedPositiveReplyCount: input.preparedPositiveReplyCount ?? 0,
    pendingApprovalCount: input.pendingApprovalCount ?? 0,
  });
}

export function buildSmartleadOutreachBrief(input: {
  campaignId: string;
  periodLabel: string;
  statistics: unknown;
  preparedPositiveReplyCount?: number;
  pendingApprovalCount?: number;
}): SmartleadOutreachBrief {
  const contacted = readMetric(input.statistics, ["sent_count", "sent", "emails_sent", "total_sent", "sent_emails_count"]);
  const opened = readMetric(input.statistics, ["open_count", "opened", "opened_count", "unique_open_count", "total_opens"]);
  const replied = readMetric(input.statistics, ["reply_count", "replied", "replied_count", "unique_reply_count", "total_replies"]);
  const positiveReplies = readOptionalMetric(input.statistics, [
    "positive_reply_count",
    "positive_replies",
    "positive_replied_count",
    "interested_count",
  ]);

  const openRate = rate(opened, contacted);
  const replyRate = rate(replied, contacted);
  const positiveReplyRate = positiveReplies === null ? null : rate(positiveReplies, replied);
  const notes: string[] = [];
  const summaryParts = [
    `Za ${input.periodLabel} sme cez Smartlead napisali ${contacted} ludom.`,
    `${openRate}% si email otvorilo, ${replied} ludi odpisalo.`,
  ];

  if (positiveReplies === null) {
    notes.push("Smartlead statistics did not include a positive reply field.");
    summaryParts.push("Pozitivne odpovede Smartlead v tomto reporte neposlal; treba ich doplnit z lokalnej DB alebo klasifikovat z odpovedi.");
  } else {
    summaryParts[1] = `${openRate}% si email otvorilo, ${replied} ludi odpisalo, z toho ${positiveReplies} pozitivne.`;
  }

  const prepared = input.preparedPositiveReplyCount ?? 0;
  if (prepared > 0) {
    summaryParts.push(`Pripravil som ti ${prepared} odpovedi na pozitivne reakcie a poslem ich az na tvoje potvrdenie.`);
  }

  const pending = input.pendingApprovalCount ?? 0;
  if (pending > 0) {
    summaryParts.push(`Caka ${pending} odpovedi na schvalenie.`);
  }

  return {
    campaignId: input.campaignId,
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

async function smartleadFetch<T>(path: string, apiKey: string, fetchImpl: FetchLike): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${smartleadBaseUrl}${path}${separator}api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) {
    throw new Error(`Smartlead request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function readMetric(value: unknown, keys: string[]): number {
  return readOptionalMetric(value, keys) ?? 0;
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
