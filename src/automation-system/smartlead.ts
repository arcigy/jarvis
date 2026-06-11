import { requireEnv, type RuntimeEnv } from "./env.ts";
import { safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";

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

export type SmartleadEmailAccount = {
  id: string | number;
  email: string;
  status: "active" | "paused" | "error" | "warming" | "unknown";
  warmupStatus: "active" | "paused" | "error" | "warming" | "unknown";
  dailyLimit?: number;
  sentToday?: number;
  bounceRate?: number;
  replyRate?: number;
  reputationScore?: number;
};

export type SmartleadEmailAccountsResult = {
  mode: "smartlead-email-accounts";
  total: number;
  usable: number;
  accounts: SmartleadEmailAccount[];
  capacityPreviewPayload: {
    requestedDailyLimit?: number;
    senderAccounts: SmartleadEmailAccount[];
    campaignId?: string | number;
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  summary: string;
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

export type SmartleadSequence = {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  seq_variants: Array<{
    variant_label: string;
    subject: string;
    email_body: string;
  }>;
};

export type SmartleadSchedule = {
  timezone?: string;
  start_hour?: string;
  end_hour?: string;
  days_of_the_week?: number[];
  max_new_leads_per_day?: number;
  min_time_btw_emails?: number;
  schedule_start_time?: string | null;
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

export type SmartleadCampaignConfigureInput = {
  campaignId: string | number;
  sequences?: SmartleadSequence[];
  emailAccountIds?: Array<string | number>;
  schedule?: SmartleadSchedule;
  settings?: {
    trackOpen?: boolean;
    stopOnReply?: boolean;
    followUpPercentage?: number;
  };
  webhook?: {
    url: string;
    name?: string;
    eventTypes?: string[];
  };
};

export type SmartleadCampaignCreateInput = Omit<SmartleadCampaignConfigureInput, "campaignId"> & {
  name: string;
  clientId?: string | number | null;
  leads?: SmartleadLead[];
};

export type SmartleadCampaignWriteResult = {
  campaignId: string;
  steps: Array<{ step: string; status: "skipped" | "submitted"; response?: unknown }>;
};

export type SmartleadWebhookInput = {
  campaignId: string | number;
  url: string;
  name?: string;
  eventTypes?: string[];
};

export type SmartleadCampaignWebhooksResult = {
  campaignId: string;
  webhooks: unknown;
};

export type SmartleadWebhookWriteResult = {
  campaignId: string;
  webhook: {
    id: null;
    name: string;
    webhook_url: string;
    event_types: string[];
  };
  response: unknown;
  summary: string;
};

export type SmartleadCampaignLeadsResult = {
  campaignId: string;
  offset: number;
  limit: number;
  leads: unknown;
};

export type SmartleadLeadSyncPreviewInput = {
  campaignIds?: Array<string | number>;
  maxCampaigns?: number;
  limitPerCampaign?: number;
};

export type SmartleadLeadSyncPreview = {
  mode: "smartlead-lead-sync-preview";
  campaignCount: number;
  leadCount: number;
  updates: Array<{
    campaignId: string;
    smartleadContactId?: string;
    email?: string;
    status?: string;
    categoryName?: string | null;
    localUpdate: {
      sent_to_smartlead: true;
      smartlead_contact_id?: string;
      reply_status?: string;
      reply_sentiment?: string | null;
    };
  }>;
  summary: string;
};

export type SmartleadMessageHistoryResult = {
  campaignId: string;
  email: string;
  messages: unknown;
  latestSentEmail?: {
    email_stats_id?: string;
    reply_message_id?: string;
    reply_email_time?: string;
  };
};

export type SmartleadThreadReplyDraftInput = {
  campaignId: string | number;
  email: string;
  leadName?: string;
  companyName?: string;
  positiveSignal?: string;
  latestLeadReply?: string;
  context?: string;
  language?: "sk" | "en";
  senderName?: string;
  senderEmail?: string;
  messageHistory?: unknown;
};

export type SmartleadThreadReplyDraft = {
  campaignId: string;
  email: string;
  emailBody: string;
  model: string;
  attempts: number;
  latestSentEmail?: SmartleadMessageHistoryResult["latestSentEmail"];
  approvalPayload: {
    campaignId: string;
    email: string;
    emailBody: string;
    approval: { approved: true };
  };
  summary: string;
};

export type SmartleadThreadReplySendInput = {
  campaignId: string | number;
  email?: string;
  emailBody: string;
  emailStatsId?: string;
  replyMessageId?: string;
  replyEmailTime?: string;
};

export type SmartleadThreadReplySendResult = {
  campaignId: string;
  email?: string;
  submitted: true;
  payload: {
    email_stats_id: string;
    email_body: string;
    reply_message_id: string;
    reply_email_time: string;
  };
  response: unknown;
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

export async function getSmartleadEmailAccounts(
  input: { includeInactive?: boolean; requestedDailyLimit?: number; campaignId?: string | number } = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadEmailAccountsResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const raw = await smartleadFetch<unknown>("/email-accounts", apiKey, fetchImpl);
  const accounts = smartleadEmailAccountList(raw)
    .map(normalizeSmartleadEmailAccount)
    .filter((account): account is SmartleadEmailAccount => Boolean(account))
    .filter((account) => input.includeInactive === true || !["paused", "error"].includes(account.status));
  const usableAccounts = accounts.filter((account) => !["paused", "error"].includes(account.status) && !["paused", "error"].includes(account.warmupStatus));
  const capacityPreviewPayload = {
    requestedDailyLimit: input.requestedDailyLimit,
    senderAccounts: accounts,
    campaignId: input.campaignId,
  };
  return {
    mode: "smartlead-email-accounts",
    total: accounts.length,
    usable: usableAccounts.length,
    accounts,
    capacityPreviewPayload,
    nextToolCalls: [
      {
        tool: "arcigy.build_smartlead_sender_capacity_preview",
        payload: capacityPreviewPayload,
        reason: "Vypocitaj bezpecny denny limit kampane z live Smartlead sender accountov pred konfiguraciou alebo uploadom.",
        approvalRequired: false,
      },
    ],
    summary: `Smartlead sender accounts: ${usableAccounts.length}/${accounts.length} pouzitelnych. Ziadny zapis do Smartlead neprebehol.`,
  };
}

export async function getSmartleadCampaignLeads(
  input: { campaignId: string | number; offset?: number; limit?: number },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignLeadsResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const offset = nonNegativeInteger(input.offset, 0, 100_000);
  const limit = nonNegativeInteger(input.limit, 100, 500);
  const leads = await smartleadFetch<unknown>(
    `/campaigns/${encodeURIComponent(campaignId)}/leads?offset=${offset}&limit=${limit}`,
    apiKey,
    fetchImpl
  );
  return { campaignId, offset, limit, leads };
}

export async function getSmartleadMessageHistory(
  input: { campaignId: string | number; email: string },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadMessageHistoryResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Lead email is required.");
  const messages = await smartleadFetch<unknown>(
    `/campaigns/${encodeURIComponent(campaignId)}/leads/message-history?email=${encodeURIComponent(email)}`,
    apiKey,
    fetchImpl
  );
  return { campaignId, email, messages, latestSentEmail: latestSentEmailForReply(messages) };
}

export async function previewSmartleadLeadSync(
  input: SmartleadLeadSyncPreviewInput = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadLeadSyncPreview> {
  const campaignIds = input.campaignIds?.length
    ? input.campaignIds.map((id) => requireCampaignId(id))
    : (await getSmartleadCampaignStatus({}, env, fetchImpl)).campaigns?.slice(0, clampMaxCampaigns(input.maxCampaigns)).map((campaign) => requireCampaignId(campaign.id)) ?? [];
  const limit = nonNegativeInteger(input.limitPerCampaign, 200, 500);
  const updates: SmartleadLeadSyncPreview["updates"] = [];

  for (const campaignId of campaignIds) {
    const result = await getSmartleadCampaignLeads({ campaignId, offset: 0, limit }, env, fetchImpl);
    for (const lead of smartleadLeadList(result.leads)) {
      const email = stringField(lead, ["email", "lead_email", "primary_email"]);
      if (!email) continue;
      const smartleadContactId = stringField(lead, ["id", "lead_id", "campaign_lead_map_id"]);
      const status = stringField(lead, ["status", "reply_status", "lead_status"]);
      const categoryName = stringField(lead, ["category_name", "lead_category", "reply_sentiment"]);
      updates.push({
        campaignId,
        smartleadContactId,
        email: email.toLowerCase(),
        status,
        categoryName: categoryName ?? null,
        localUpdate: {
          sent_to_smartlead: true,
          smartlead_contact_id: smartleadContactId,
          reply_status: status,
          reply_sentiment: categoryName ?? null,
        },
      });
    }
  }

  return {
    mode: "smartlead-lead-sync-preview",
    campaignCount: campaignIds.length,
    leadCount: updates.length,
    updates,
    summary: `Smartlead sync preview: ${updates.length} leadov z ${campaignIds.length} kampani. Ziadny zapis do lokalnej DB nebol vykonany.`,
  };
}

export async function draftSmartleadThreadReply(
  input: SmartleadThreadReplyDraftInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadThreadReplyDraft> {
  const campaignId = requireCampaignId(input.campaignId);
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Lead email is required.");
  const history = input.messageHistory === undefined ? await getSmartleadMessageHistory({ campaignId, email }, env, fetchImpl) : { campaignId, email, messages: input.messageHistory, latestSentEmail: latestSentEmailForReply(input.messageHistory) };
  const senderName = input.senderName?.trim() || "Andrej";
  const language = input.language ?? "sk";
  const result = await generateGeminiText(
    {
      prompt: [
        `You are ${safeAiPromptPart(senderName)}, a male professional sales assistant for Arcigy.`,
        language === "sk" ? "Write the reply in Slovak." : "Write the reply in English.",
        "Draft only the email body. Do not claim the message was sent.",
        "Use a warm, formal tone, maximum 3 sentences, no subject and no signature.",
        "If the lead is positive or asks for the showcase, include this link as HTML: <a href='https://www.arcigy.com/showcase'>https://www.arcigy.com/showcase</a>.",
        input.senderEmail ? `Sender email: ${safeAiPromptPart(input.senderEmail)}.` : null,
        input.leadName ? `Lead name: ${safeAiPromptPart(input.leadName)}.` : null,
        input.companyName ? `Company: ${safeAiPromptPart(input.companyName)}.` : null,
        input.positiveSignal ? safeUntrustedAiPromptPart("positive signal", input.positiveSignal) : null,
        input.latestLeadReply ? safeUntrustedAiPromptPart("latest lead reply", input.latestLeadReply) : null,
        input.context ? safeUntrustedAiPromptPart("operator context", input.context) : null,
        safeUntrustedAiPromptPart("Smartlead message history", formatMessageHistoryForPrompt(history.messages)),
      ].filter(Boolean).join("\n"),
      temperature: 0.4,
    },
    env,
    fetchImpl
  );
  const emailBody = result.text.trim();
  return {
    campaignId,
    email,
    emailBody,
    model: result.model,
    attempts: result.attempts,
    latestSentEmail: history.latestSentEmail,
    approvalPayload: {
      campaignId,
      email,
      emailBody,
      approval: { approved: true },
    },
    summary: `Jarvis pripravil Smartlead thread odpoved pre ${email}. Odosli ju az po schvaleni cez arcigy.send_smartlead_thread_reply.`,
  };
}

export async function sendSmartleadThreadReply(
  input: SmartleadThreadReplySendInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadThreadReplySendResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const emailBody = input.emailBody.trim();
  if (!emailBody) throw new Error("Smartlead reply emailBody is required.");
  let emailStatsId = input.emailStatsId?.trim();
  let replyMessageId = input.replyMessageId?.trim();
  let replyEmailTime = input.replyEmailTime?.trim();
  const email = input.email?.trim().toLowerCase();

  if ((!emailStatsId || !replyMessageId || !replyEmailTime) && email) {
    const history = await getSmartleadMessageHistory({ campaignId, email }, env, fetchImpl);
    emailStatsId = emailStatsId || history.latestSentEmail?.email_stats_id;
    replyMessageId = replyMessageId || history.latestSentEmail?.reply_message_id;
    replyEmailTime = replyEmailTime || history.latestSentEmail?.reply_email_time;
  }

  if (!emailStatsId || !replyMessageId || !replyEmailTime) {
    throw new Error("Smartlead reply requires emailStatsId, replyMessageId and replyEmailTime. Provide them or provide campaignId + email so Jarvis can fetch message history.");
  }

  const payload = {
    email_stats_id: emailStatsId,
    email_body: emailBody,
    reply_message_id: replyMessageId,
    reply_email_time: replyEmailTime,
  };
  const response = await smartleadFetch<unknown>(`/campaigns/${encodeURIComponent(campaignId)}/reply-email-thread`, apiKey, fetchImpl, {
    method: "POST",
    body: payload,
  });
  return { campaignId, email, submitted: true, payload, response };
}

export async function createSmartleadCampaign(
  input: SmartleadCampaignCreateInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignWriteResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const name = input.name.trim();
  if (!name) throw new Error("Smartlead campaign name is required.");
  const createResponse = await smartleadFetch<{ id?: string | number; campaign_id?: string | number }>(
    "/campaigns/create",
    apiKey,
    fetchImpl,
    { method: "POST", body: { name, client_id: input.clientId ?? null } }
  );
  const campaignId = String(createResponse.id ?? createResponse.campaign_id ?? "").trim();
  if (!campaignId) throw new Error("Smartlead did not return a campaign id.");
  const configured = await configureSmartleadCampaign({ ...input, campaignId }, env, fetchImpl);
  const steps: SmartleadCampaignWriteResult["steps"] = [{ step: "create_campaign", status: "submitted", response: createResponse }, ...configured.steps];
  if (input.leads?.length) {
    steps.push({ step: "upload_leads", status: "submitted", response: await addLeadsToSmartleadCampaign({ campaignId, leads: input.leads }, env, fetchImpl) });
  } else {
    steps.push({ step: "upload_leads", status: "skipped" });
  }
  return { campaignId, steps };
}

export async function configureSmartleadCampaign(
  input: SmartleadCampaignConfigureInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignWriteResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const steps: SmartleadCampaignWriteResult["steps"] = [];
  if (input.sequences?.length) {
    steps.push({
      step: "sequences",
      status: "submitted",
      response: await smartleadFetch(`/campaigns/${encodeURIComponent(campaignId)}/sequences`, apiKey, fetchImpl, {
        method: "POST",
        body: { sequences: input.sequences.map(normalizeSmartleadSequence) },
      }),
    });
  } else {
    steps.push({ step: "sequences", status: "skipped" });
  }
  if (input.emailAccountIds?.length) {
    steps.push({
      step: "email_accounts",
      status: "submitted",
      response: await smartleadFetch(`/campaigns/${encodeURIComponent(campaignId)}/email-accounts`, apiKey, fetchImpl, {
        method: "POST",
        body: { email_account_ids: input.emailAccountIds },
      }),
    });
  } else {
    steps.push({ step: "email_accounts", status: "skipped" });
  }
  if (input.schedule) {
    steps.push({
      step: "schedule",
      status: "submitted",
      response: await smartleadFetch(`/campaigns/${encodeURIComponent(campaignId)}/schedule`, apiKey, fetchImpl, {
        method: "POST",
        body: normalizeSmartleadSchedule(input.schedule),
      }),
    });
  } else {
    steps.push({ step: "schedule", status: "skipped" });
  }
  if (input.settings) {
    steps.push({
      step: "settings",
      status: "submitted",
      response: await smartleadFetch(`/campaigns/${encodeURIComponent(campaignId)}/settings`, apiKey, fetchImpl, {
        method: "PATCH",
        body: normalizeSmartleadSettings(input.settings),
      }),
    });
  } else {
    steps.push({ step: "settings", status: "skipped" });
  }
  if (input.webhook?.url) {
    steps.push({
      step: "webhook",
      status: "submitted",
      response: await smartleadFetch(`/campaigns/${encodeURIComponent(campaignId)}/webhooks`, apiKey, fetchImpl, {
        method: "POST",
        body: {
          id: null,
          name: input.webhook.name || "Jarvis Automation Webhook",
          webhook_url: input.webhook.url,
          event_types: input.webhook.eventTypes ?? ["EMAIL_REPLY", "LEAD_CATEGORY_UPDATED"],
        },
      }),
    });
  } else {
    steps.push({ step: "webhook", status: "skipped" });
  }
  return { campaignId, steps };
}

export async function getSmartleadCampaignWebhooks(
  input: { campaignId: string | number },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignWebhooksResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const webhooks = await smartleadFetch<unknown>(`/campaigns/${encodeURIComponent(campaignId)}/webhooks`, apiKey, fetchImpl);
  return { campaignId, webhooks };
}

export async function upsertSmartleadCampaignWebhook(
  input: SmartleadWebhookInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadWebhookWriteResult> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  const campaignId = requireCampaignId(input.campaignId);
  const webhook = normalizeSmartleadWebhook(input);
  const response = await smartleadFetch<unknown>(`/campaigns/${encodeURIComponent(campaignId)}/webhooks`, apiKey, fetchImpl, {
    method: "POST",
    body: webhook,
  });
  return {
    campaignId,
    webhook,
    response,
    summary: `Smartlead webhook ${webhook.name} nastaveny pre kampan ${campaignId}.`,
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

function requireCampaignId(value: string | number): string {
  const campaignId = String(value ?? "").trim();
  if (!campaignId) throw new Error("Smartlead campaignId is required.");
  return campaignId;
}

function normalizeSmartleadSequence(sequence: SmartleadSequence): SmartleadSequence {
  if (!sequence.seq_number || sequence.seq_number < 1) throw new Error("Smartlead sequence seq_number is required.");
  if (!sequence.seq_variants?.length) throw new Error("Smartlead sequence requires at least one variant.");
  return {
    seq_number: Math.floor(sequence.seq_number),
    seq_delay_details: { delay_in_days: Math.max(0, Math.floor(sequence.seq_delay_details?.delay_in_days ?? 0)) },
    seq_variants: sequence.seq_variants.map((variant) => ({
      variant_label: variant.variant_label?.trim() || "A",
      subject: variant.subject?.trim() || "",
      email_body: variant.email_body?.trim() || "",
    })),
  };
}

function normalizeSmartleadSchedule(schedule: SmartleadSchedule): Required<SmartleadSchedule> {
  return {
    timezone: schedule.timezone || "Europe/Bratislava",
    start_hour: schedule.start_hour || "08:00",
    end_hour: schedule.end_hour || "18:00",
    days_of_the_week: schedule.days_of_the_week?.length ? schedule.days_of_the_week : [1, 2, 3, 4, 5],
    max_new_leads_per_day: nonNegativeInteger(schedule.max_new_leads_per_day, 25, 500),
    min_time_btw_emails: nonNegativeInteger(schedule.min_time_btw_emails, 10, 240),
    schedule_start_time: schedule.schedule_start_time ?? null,
  };
}

function normalizeSmartleadSettings(settings: NonNullable<SmartleadCampaignConfigureInput["settings"]>): Record<string, unknown> {
  return {
    track_settings: settings.trackOpen === false ? ["DONT_TRACK_EMAIL_OPEN"] : [],
    stop_lead_settings: settings.stopOnReply === false ? "NEVER_STOP" : "REPLY_TO_AN_EMAIL",
    follow_up_percentage: nonNegativeInteger(settings.followUpPercentage, 100, 100),
  };
}

function normalizeSmartleadWebhook(input: SmartleadWebhookInput): SmartleadWebhookWriteResult["webhook"] {
  const webhookUrl = input.url.trim();
  if (!/^https:\/\//i.test(webhookUrl)) throw new Error("Smartlead webhook url must be an HTTPS URL.");
  const name = input.name?.trim() || "Jarvis AI Reply Webhook";
  const eventTypes = normalizeSmartleadWebhookEvents(input.eventTypes);
  return {
    id: null,
    name: name.slice(0, 100),
    webhook_url: webhookUrl,
    event_types: eventTypes,
  };
}

function normalizeSmartleadWebhookEvents(value: string[] | undefined): string[] {
  const allowed = new Set(["EMAIL_REPLY", "LEAD_CATEGORY_UPDATED", "EMAIL_OPENED", "EMAIL_CLICKED"]);
  const events = (value?.length ? value : ["EMAIL_REPLY", "LEAD_CATEGORY_UPDATED"])
    .map((item) => item.trim().toUpperCase())
    .filter((item) => allowed.has(item));
  return events.length ? [...new Set(events)] : ["EMAIL_REPLY", "LEAD_CATEGORY_UPDATED"];
}

function nonNegativeInteger(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), max));
}

function latestSentEmailForReply(messages: unknown): SmartleadMessageHistoryResult["latestSentEmail"] {
  const list = Array.isArray(messages) ? messages : Array.isArray((messages as { data?: unknown[] } | null)?.data) ? (messages as { data: unknown[] }).data : [];
  const sent = [...list].reverse().find((item) => item && typeof item === "object" && String((item as { type?: unknown }).type ?? "").toUpperCase() === "EMAIL_SENT") as
    | { stats_id?: unknown; message_id?: unknown; send_time?: unknown }
    | undefined;
  if (!sent) return undefined;
  return {
    email_stats_id: typeof sent.stats_id === "string" ? sent.stats_id : undefined,
    reply_message_id: typeof sent.message_id === "string" ? sent.message_id : undefined,
    reply_email_time: typeof sent.send_time === "string" ? sent.send_time : undefined,
  };
}

function formatMessageHistoryForPrompt(messages: unknown): string {
  const list = Array.isArray(messages)
    ? messages
    : Array.isArray((messages as { data?: unknown[] } | null)?.data)
      ? (messages as { data: unknown[] }).data
      : Array.isArray((messages as { history?: unknown[] } | null)?.history)
        ? (messages as { history: unknown[] }).history
        : Array.isArray((messages as { messages?: unknown[] } | null)?.messages)
          ? (messages as { messages: unknown[] }).messages
          : [];
  if (!list.length) return "No message history was provided.";
  return list
    .slice(-12)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const type = String(record.type ?? record.event_type ?? "MESSAGE").toUpperCase();
      const when = String(record.send_time ?? record.created_at ?? record.time ?? "");
      const body = stripHtml(String(record.email_body ?? record.body ?? record.text ?? "")).slice(0, 2000);
      return `[${type}${when ? ` ${when}` : ""}] ${body}`;
    })
    .filter(Boolean)
    .join("\n---\n");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function smartleadLeadList(value: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { data?: unknown[] } | null)?.data)
      ? (value as { data: unknown[] }).data
      : Array.isArray((value as { leads?: unknown[] } | null)?.leads)
        ? (value as { leads: unknown[] }).leads
        : [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function smartleadEmailAccountList(value: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { data?: unknown[] } | null)?.data)
      ? (value as { data: unknown[] }).data
      : Array.isArray((value as { email_accounts?: unknown[] } | null)?.email_accounts)
        ? (value as { email_accounts: unknown[] }).email_accounts
        : Array.isArray((value as { accounts?: unknown[] } | null)?.accounts)
          ? (value as { accounts: unknown[] }).accounts
          : [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function normalizeSmartleadEmailAccount(account: Record<string, unknown>): SmartleadEmailAccount | null {
  const id = stringField(account, ["id", "email_account_id", "account_id"]);
  const email = stringField(account, ["from_email", "email", "username", "sender_email"])?.toLowerCase();
  if (!id || !email || !email.includes("@")) return null;
  const warmup = objectField(account, "warmup_details", "warmup", "warmupStats");
  const status = normalizeAccountStatus(stringField(account, ["status", "account_status", "connection_status"]));
  const warmupStatus = normalizeAccountStatus(
    stringField(warmup, ["status", "warmup_status", "state"]) ??
    stringField(account, ["warmup_status", "warmupStatus"])
  );
  return {
    id: Number.isFinite(Number(id)) ? Number(id) : id,
    email,
    status,
    warmupStatus,
    dailyLimit: numberField(account, ["daily_limit", "dailyLimit", "max_emails_per_day", "maxEmailsPerDay", "daily_sending_limit"]),
    sentToday: numberField(account, ["sent_today", "sentToday", "daily_sent_count", "emails_sent_today", "sent_count_today"]),
    bounceRate: numberField(account, ["bounce_rate", "bounceRate"]),
    replyRate: numberField(account, ["reply_rate", "replyRate"]),
    reputationScore: numberField(account, ["reputation_score", "reputationScore", "health_score", "score"]),
  };
}

function objectField(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function normalizeAccountStatus(value?: string): SmartleadEmailAccount["status"] {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (["active", "connected", "healthy", "running", "enabled"].includes(normalized)) return "active";
  if (["paused", "disabled", "inactive", "stopped"].includes(normalized)) return "paused";
  if (["error", "failed", "disconnected", "bounced", "blocked"].includes(normalized)) return "error";
  if (["warming", "warmup", "warmupactive", "inwarmup"].includes(normalized)) return "warming";
  return "unknown";
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace("%", "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
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
