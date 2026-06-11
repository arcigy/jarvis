import { safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";
import { draftSmartleadThreadReply, type SmartleadThreadReplyDraft } from "./smartlead.ts";
import type { RuntimeEnv } from "./env.ts";

export type OutreachReplyCategory = "POSITIVE" | "NEGATIVE" | "ALREADY_SENT" | "NEUTRAL";

export type ReplyHistoryItem = {
  type?: string;
  body?: string;
  email_body?: string;
  fromEmail?: string;
  from_email?: string;
  isMe?: boolean;
  send_time?: string;
  created_at?: string;
};

export type OutreachReplyClassification = {
  mode: "outreach-reply-classification";
  category: OutreachReplyCategory;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  summary: string;
};

export type SmartleadAiReplyPreview = {
  mode: "smartlead-ai-reply-preview";
  action: "skip" | "draft_reply";
  reason: string;
  classification?: OutreachReplyClassification;
  draftToolPayload?: Record<string, unknown>;
  draft?: SmartleadThreadReplyDraft;
  sendApprovalPayload?: Record<string, unknown>;
  summary: string;
};

export type GmailAiReplyPreview = {
  mode: "gmail-ai-reply-preview";
  action: "skip" | "draft_reply";
  reason: string;
  classification?: OutreachReplyClassification;
  draft?: {
    emailBody: string;
    model: string;
    approvalPayload: {
      senderEmail: string;
      toEmail: string;
      subject: string;
      threadId: string;
      messageId: string;
      emailBody: string;
      approval: { approved: true };
    };
  };
  summary: string;
};

export type ShowcaseReplyPreview = {
  mode: "showcase-reply-preview";
  action: "skip" | "prepare_showcase_reply";
  reason: string;
  classification?: OutreachReplyClassification;
  emailBody?: string;
  approvalPayload?: Record<string, unknown>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; approvalRequired: boolean }>;
  summary: string;
};

export type OutreachReplyTriageItemInput = {
  source: "smartlead" | "gmail";
  email: string;
  replyBody: string;
  campaignId?: string | number;
  senderEmail?: string;
  leadName?: string;
  companyName?: string;
  subject?: string;
  threadId?: string;
  messageId?: string;
  history?: ReplyHistoryItem[];
  alreadyHandled?: boolean;
};

export type OutreachReplyTriagePreview = {
  mode: "outreach-reply-triage-preview";
  summary: string;
  totals: {
    replies: number;
    positive: number;
    negative: number;
    alreadySent: number;
    neutral: number;
    draftCandidates: number;
    skipped: number;
  };
  items: Array<{
    source: "smartlead" | "gmail";
    email: string;
    leadName?: string;
    companyName?: string;
    category: OutreachReplyCategory;
    confidence: OutreachReplyClassification["confidence"];
    recommendedAction: "draft_smartlead_reply" | "draft_gmail_reply" | "skip";
    reason: string;
    nextToolCall?: { tool: string; payload: Record<string, unknown>; approvalRequired: boolean };
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; approvalRequired: boolean }>;
  warnings: string[];
};

export type SmartleadReplyFollowupEventInput = {
  campaignId?: string | number;
  campaign_id?: string | number;
  email?: string;
  leadEmail?: string;
  lead_email?: string;
  toEmail?: string;
  to_email?: string;
  eventType?: string;
  event_type?: string;
  type?: string;
  replyBody?: string;
  emailBody?: string;
  email_body?: string;
  body?: string;
  latestLeadReply?: string;
  latest_lead_reply?: string;
  fromEmail?: string;
  from_email?: string;
  senderEmail?: string;
  sender_email?: string;
  leadName?: string;
  lead_name?: string;
  companyName?: string;
  company_name?: string;
  categoryName?: string;
  category_name?: string;
  history?: ReplyHistoryItem[];
  alreadyHandled?: boolean;
  alreadySent?: boolean;
  leadId?: string | number;
  lead_id?: string | number;
  webhookId?: string | number;
  webhook_id?: string | number;
  raw?: Record<string, unknown>;
};

export type SmartleadReplyFollowupQueuePreview = {
  mode: "smartlead-reply-followup-queue-preview";
  summary: string;
  totals: {
    events: number;
    readyToPreview: number;
    needsHistory: number;
    positive: number;
    skipped: number;
    manualReview: number;
    draftCandidates: number;
  };
  items: Array<{
    email?: string;
    campaignId?: string | number;
    eventType?: string;
    leadName?: string;
    companyName?: string;
    category?: OutreachReplyCategory;
    confidence?: OutreachReplyClassification["confidence"];
    recommendedAction: "fetch_history" | "preview_ai_reply" | "draft_smartlead_reply" | "manual_review" | "skip";
    reason: string;
    nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; approvalRequired: boolean }>;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; approvalRequired: boolean }>;
  warnings: string[];
};

const allowedSmartleadEventTypes = new Set(["EMAIL_REPLY", "LEAD_CATEGORY_UPDATED"]);

export async function classifyOutreachReply(
  input: { replyBody: string; history?: ReplyHistoryItem[]; senderName?: string; useAi?: boolean },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<OutreachReplyClassification> {
  const replyBody = input.replyBody.trim();
  const deterministic = classifyOutreachReplyHeuristic(replyBody, input.history ?? []);
  if (!input.useAi || deterministic.confidence === "high") return deterministic;

  const senderName = input.senderName?.trim() || "Arcigy";
  const result = await generateGeminiText(
    {
      systemInstruction: [
        "Classify a cold outreach reply for Arcigy.",
        "Return only one category: POSITIVE, NEGATIVE, ALREADY_SENT, or NEUTRAL.",
        "Use POSITIVE only when the lead clearly wants the showcase, demo, price details, or next step.",
        "Use NEGATIVE for no interest, no need, unsubscribe, stop, irrelevant, or any doubtful rejection.",
        "Use ALREADY_SENT if the showcase link was already sent after the lead asked.",
      ].join(" "),
      prompt: [
        `Sender: ${safeAiPromptPart(senderName)}.`,
        safeUntrustedAiPromptPart("conversation history", formatHistory(input.history ?? [], senderName)),
        safeUntrustedAiPromptPart("latest lead reply", replyBody),
      ].join("\n"),
      temperature: 0,
    },
    env,
    fetchImpl
  );
  const category = parseCategory(result.text) ?? deterministic.category;
  return {
    mode: "outreach-reply-classification",
    category,
    confidence: category === deterministic.category ? "medium" : "low",
    reasons: [`AI classified as ${category}`, ...deterministic.reasons],
    summary: `Reply classified as ${category}.`,
  };
}

export async function previewSmartleadAiReply(
  input: {
    toEmail: string;
    campaignId: string | number;
    emailBody?: string;
    eventType?: string;
    fromEmail?: string;
    leadName?: string;
    companyName?: string;
    categoryName?: string;
    history?: ReplyHistoryItem[];
    aiRepliesActive?: boolean;
    alreadySent?: boolean;
    generateDraft?: boolean;
    useAiClassification?: boolean;
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadAiReplyPreview> {
  const eventType = input.eventType?.trim().toUpperCase();
  const body = input.emailBody?.trim() ?? "";
  if (eventType && !allowedSmartleadEventTypes.has(eventType)) return smartleadSkip(`Event type ${eventType} ignored.`);
  if (!body) return smartleadSkip("Empty email body.");
  if (input.aiRepliesActive === false) return smartleadSkip("AI replies are paused.");
  if (input.alreadySent === true) return smartleadSkip("Reply already sent previously for this lead and campaign.");
  if (hasOurReplyAfterLatestLead(input.history ?? [], input.fromEmail)) return smartleadSkip("Human-in-the-loop detected after latest lead reply.");

  const classification = await classifyOutreachReply({ replyBody: body, history: input.history, senderName: input.fromEmail, useAi: input.useAiClassification }, env, fetchImpl);
  if (classification.category !== "POSITIVE") return smartleadSkip(`Reply classified as ${classification.category}.`, classification);

  const draftToolPayload = {
    campaignId: input.campaignId,
    email: input.toEmail,
    leadName: input.leadName,
    companyName: input.companyName,
    positiveSignal: input.categoryName || body,
    latestLeadReply: body,
    senderEmail: input.fromEmail,
    messageHistory: input.history,
    language: "sk" as const,
  };
  const draft = input.generateDraft === true ? await draftSmartleadThreadReply(draftToolPayload, env, fetchImpl) : undefined;
  return {
    mode: "smartlead-ai-reply-preview",
    action: "draft_reply",
    reason: "Positive reply detected.",
    classification,
    draftToolPayload,
    draft,
    sendApprovalPayload: draft?.approvalPayload,
    summary: draft ? `Smartlead AI reply draft is ready for ${input.toEmail}; send only after approval.` : `Smartlead reply is positive; call arcigy.draft_smartlead_thread_reply before any send.`,
  };
}

export async function previewGmailAiReply(
  input: {
    senderEmail: string;
    fromEmail: string;
    subject?: string;
    body: string;
    threadId: string;
    messageId: string;
    leadName?: string;
    history?: ReplyHistoryItem[];
    leadKnown?: boolean;
    threadStartedByUs?: boolean;
    aiRepliesActive?: boolean;
    alreadyProcessed?: boolean;
    alreadySent?: boolean;
    generateDraft?: boolean;
    useAiClassification?: boolean;
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailAiReplyPreview> {
  const body = input.body.trim();
  if (!body) return gmailSkip("Empty Gmail message body.");
  if (input.aiRepliesActive === false) return gmailSkip("AI replies are paused.");
  if (input.alreadyProcessed === true) return gmailSkip("Gmail message already processed.");
  if (input.leadKnown === false) return gmailSkip("Sender is not a known lead.");
  if (input.threadStartedByUs === false) return gmailSkip("Thread was not started by Arcigy.");
  if (input.alreadySent === true) return gmailSkip("AI reply already sent to this lead.");
  if (hasOurReplyAfterLatestLead(input.history ?? [], input.senderEmail)) return gmailSkip("Human-in-the-loop detected after latest lead reply.");

  const classification = await classifyOutreachReply({ replyBody: body, history: input.history, senderName: input.senderEmail, useAi: input.useAiClassification }, env, fetchImpl);
  if (classification.category !== "POSITIVE") return gmailSkip(`Reply classified as ${classification.category}.`, classification);

  const draft = input.generateDraft === true
    ? await draftGmailReply(input, env, fetchImpl)
    : undefined;
  return {
    mode: "gmail-ai-reply-preview",
    action: "draft_reply",
    reason: "Positive Gmail reply detected.",
    classification,
    draft,
    summary: draft ? `Gmail reply draft is ready for ${input.fromEmail}; send only after approval.` : "Gmail reply is positive; generate a draft before any send.",
  };
}

export function buildShowcaseReplyPreview(input: {
  source?: "smartlead" | "gmail";
  leadEmail: string;
  leadName?: string;
  replyBody: string;
  campaignId?: string | number;
  senderEmail?: string;
  senderName?: string;
  threadId?: string;
  messageId?: string;
  subject?: string;
  history?: ReplyHistoryItem[];
  aiRepliesActive?: boolean;
  alreadySent?: boolean;
}): ShowcaseReplyPreview {
  const body = input.replyBody.trim();
  if (!body) return showcaseSkip("Empty reply body.");
  if (input.aiRepliesActive === false) return showcaseSkip("AI replies are paused.");
  if (input.alreadySent === true) return showcaseSkip("Showcase reply already sent to this lead.");
  if (hasOurReplyAfterLatestLead(input.history ?? [], input.senderEmail)) return showcaseSkip("Human-in-the-loop detected after latest lead reply.");

  const classification = classifyOutreachReplyHeuristic(body, input.history ?? []);
  if (classification.category !== "POSITIVE") return showcaseSkip(`Reply classified as ${classification.category}.`, classification);

  const emailBody = buildDeterministicShowcaseReply(input.leadName, body);
  const source = input.source ?? "smartlead";
  const approvalPayload = source === "smartlead" && input.campaignId !== undefined
    ? {
        campaignId: input.campaignId,
        email: input.leadEmail.trim().toLowerCase(),
        emailBody,
        approval: { approved: true },
      }
    : source === "gmail" && input.senderEmail && input.threadId && input.messageId
      ? {
          senderEmail: input.senderEmail,
          toEmail: input.leadEmail.trim().toLowerCase(),
          subject: input.subject ?? "",
          threadId: input.threadId,
          messageId: input.messageId,
          emailBody,
          approval: { approved: true },
        }
      : undefined;
  const nextToolCalls = source === "smartlead" && approvalPayload
    ? [{ tool: "arcigy.send_smartlead_thread_reply", payload: approvalPayload, approvalRequired: true }]
    : [];

  return {
    mode: "showcase-reply-preview",
    action: "prepare_showcase_reply",
    reason: "Positive showcase interest detected.",
    classification,
    emailBody,
    approvalPayload,
    nextToolCalls,
    summary: `Showcase reply prepared for ${input.leadEmail}. Nothing was sent; send only after approval.`,
  };
}

export async function buildOutreachReplyTriagePreview(
  input: {
    replies: OutreachReplyTriageItemInput[];
    aiRepliesActive?: boolean;
    useAiClassification?: boolean;
    maxReplies?: number;
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<OutreachReplyTriagePreview> {
  const maxReplies = Math.min(Math.max(Math.trunc(input.maxReplies ?? 50), 1), 100);
  const replies = input.replies.slice(0, maxReplies);
  const items: OutreachReplyTriagePreview["items"] = [];
  const warnings: string[] = [];
  for (const reply of replies) {
    const body = reply.replyBody.trim();
    if (!body) {
      items.push(triageSkip(reply, classification("NEUTRAL", "high", ["empty reply body"]), "Empty reply body."));
      continue;
    }
    if (input.aiRepliesActive === false || reply.alreadyHandled === true) {
      const reason = input.aiRepliesActive === false ? "AI replies are paused." : "Reply already handled.";
      items.push(triageSkip(reply, classification("NEUTRAL", "high", [reason]), reason));
      continue;
    }
    const classificationResult = await classifyOutreachReply(
      { replyBody: body, history: reply.history, senderName: reply.senderEmail, useAi: input.useAiClassification },
      env,
      fetchImpl
    );
    if (classificationResult.category !== "POSITIVE") {
      items.push(triageSkip(reply, classificationResult, `Reply classified as ${classificationResult.category}.`));
      continue;
    }
    const nextToolCall = buildPositiveReplyNextToolCall(reply, body);
    if (!nextToolCall) {
      warnings.push(`Positive reply for ${reply.email} is missing required ${reply.source} metadata for draft preparation.`);
      items.push(triageSkip(reply, classificationResult, "Positive reply is missing required metadata for draft preparation."));
      continue;
    }
    items.push({
      source: reply.source,
      email: reply.email,
      leadName: reply.leadName,
      companyName: reply.companyName,
      category: classificationResult.category,
      confidence: classificationResult.confidence,
      recommendedAction: reply.source === "smartlead" ? "draft_smartlead_reply" : "draft_gmail_reply",
      reason: "Positive reply detected; prepare a draft only, then wait for approval before sending.",
      nextToolCall,
    });
  }
  const totals = {
    replies: items.length,
    positive: items.filter((item) => item.category === "POSITIVE").length,
    negative: items.filter((item) => item.category === "NEGATIVE").length,
    alreadySent: items.filter((item) => item.category === "ALREADY_SENT").length,
    neutral: items.filter((item) => item.category === "NEUTRAL").length,
    draftCandidates: items.filter((item) => item.nextToolCall).length,
    skipped: items.filter((item) => item.recommendedAction === "skip").length,
  };
  const nextToolCalls = items.flatMap((item) => item.nextToolCall ? [item.nextToolCall] : []);
  return {
    mode: "outreach-reply-triage-preview",
    summary: `Outreach reply triage: ${totals.positive} pozitivnych, ${totals.negative} negativnych, ${totals.neutral} neutralnych, ${totals.alreadySent} uz vybavenych; ${totals.draftCandidates} draft kandidatov. Nic nebolo odoslane.`,
    totals,
    items,
    nextToolCalls,
    warnings,
  };
}

export async function buildSmartleadReplyFollowupQueuePreview(
  input: {
    events: SmartleadReplyFollowupEventInput[];
    aiRepliesActive?: boolean;
    useAiClassification?: boolean;
    maxEvents?: number;
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadReplyFollowupQueuePreview> {
  const maxEvents = Math.min(Math.max(Math.trunc(input.maxEvents ?? 50), 1), 100);
  const events = input.events.slice(0, maxEvents);
  const items: SmartleadReplyFollowupQueuePreview["items"] = [];
  const warnings: string[] = [];

  for (const event of events) {
    const normalized = normalizeSmartleadReplyEvent(event);
    const nextToolCalls: SmartleadReplyFollowupQueuePreview["nextToolCalls"] = [];
    const eventType = normalized.eventType?.toUpperCase();
    if (eventType && !allowedSmartleadEventTypes.has(eventType)) {
      items.push({
        email: normalized.email,
        campaignId: normalized.campaignId,
        eventType,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        recommendedAction: "skip",
        reason: `Event type ${eventType} ignored.`,
        nextToolCalls,
      });
      continue;
    }
    if (input.aiRepliesActive === false || normalized.alreadyHandled || normalized.alreadySent) {
      const reason = input.aiRepliesActive === false ? "AI replies are paused." : "Reply already handled or sent.";
      items.push({
        email: normalized.email,
        campaignId: normalized.campaignId,
        eventType,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        recommendedAction: "skip",
        reason,
        nextToolCalls,
      });
      continue;
    }
    if (!normalized.email || normalized.campaignId === undefined) {
      warnings.push("Smartlead reply event is missing email or campaignId.");
      items.push({
        email: normalized.email,
        campaignId: normalized.campaignId,
        eventType,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        recommendedAction: "manual_review",
        reason: "Missing email or campaignId; cannot fetch history or draft safely.",
        nextToolCalls,
      });
      continue;
    }

    nextToolCalls.push({
      tool: "arcigy.get_smartlead_message_history",
      payload: { campaignId: normalized.campaignId, email: normalized.email },
      approvalRequired: false,
    });

    if (!normalized.replyBody) {
      items.push({
        email: normalized.email,
        campaignId: normalized.campaignId,
        eventType,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        recommendedAction: "fetch_history",
        reason: "Missing latest reply body; fetch Smartlead message history before previewing an AI reply.",
        nextToolCalls,
      });
      continue;
    }

    const previewPayload = {
      toEmail: normalized.email,
      campaignId: normalized.campaignId,
      emailBody: normalized.replyBody,
      eventType,
      fromEmail: normalized.fromEmail,
      leadName: normalized.leadName,
      companyName: normalized.companyName,
      categoryName: normalized.categoryName,
      history: normalized.history,
      aiRepliesActive: input.aiRepliesActive,
      alreadySent: normalized.alreadySent,
      generateDraft: false,
      useAiClassification: input.useAiClassification === true,
    };
    nextToolCalls.push({
      tool: "arcigy.preview_smartlead_ai_reply",
      payload: previewPayload,
      approvalRequired: false,
    });

    const classificationResult = await classifyOutreachReply(
      { replyBody: normalized.replyBody, history: normalized.history, senderName: normalized.fromEmail, useAi: input.useAiClassification },
      env,
      fetchImpl
    );
    if (classificationResult.category !== "POSITIVE") {
      items.push({
        email: normalized.email,
        campaignId: normalized.campaignId,
        eventType,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        category: classificationResult.category,
        confidence: classificationResult.confidence,
        recommendedAction: "preview_ai_reply",
        reason: `Reply classified as ${classificationResult.category}; preview will skip drafting.`,
        nextToolCalls,
      });
      continue;
    }

    nextToolCalls.push({
      tool: "arcigy.draft_smartlead_thread_reply",
      payload: {
        campaignId: normalized.campaignId,
        email: normalized.email,
        leadName: normalized.leadName,
        companyName: normalized.companyName,
        positiveSignal: normalized.categoryName || normalized.replyBody,
        latestLeadReply: normalized.replyBody,
        senderEmail: normalized.fromEmail,
        messageHistory: normalized.history,
        language: "sk",
      },
      approvalRequired: false,
    });
    items.push({
      email: normalized.email,
      campaignId: normalized.campaignId,
      eventType,
      leadName: normalized.leadName,
      companyName: normalized.companyName,
      category: classificationResult.category,
      confidence: classificationResult.confidence,
      recommendedAction: "draft_smartlead_reply",
      reason: "Positive Smartlead reply detected; prepare a draft only and require explicit send approval later.",
      nextToolCalls,
    });
  }

  const nextToolCalls = dedupeToolCalls(items.flatMap((item) => item.nextToolCalls));
  const totals = {
    events: items.length,
    readyToPreview: items.filter((item) => item.nextToolCalls.some((call) => call.tool === "arcigy.preview_smartlead_ai_reply")).length,
    needsHistory: items.filter((item) => item.recommendedAction === "fetch_history").length,
    positive: items.filter((item) => item.category === "POSITIVE").length,
    skipped: items.filter((item) => item.recommendedAction === "skip").length,
    manualReview: items.filter((item) => item.recommendedAction === "manual_review").length,
    draftCandidates: items.filter((item) => item.nextToolCalls.some((call) => call.tool === "arcigy.draft_smartlead_thread_reply")).length,
  };
  return {
    mode: "smartlead-reply-followup-queue-preview",
    summary: `Smartlead reply follow-up queue: ${totals.readyToPreview} ready to preview, ${totals.needsHistory} need history fetch, ${totals.draftCandidates} draft candidates, ${totals.manualReview} manual review. Nothing was sent.`,
    totals,
    items,
    nextToolCalls,
    warnings,
  };
}

function classifyOutreachReplyHeuristic(replyBody: string, history: ReplyHistoryItem[]): OutreachReplyClassification {
  const text = normalizeText(replyBody);
  const historyText = normalizeText(formatHistory(history, "Arcigy"));
  const reasons: string[] = [];
  if (historyText.includes("arcigy.com/showcase") && positivePattern(text)) {
    reasons.push("showcase link already appears in history");
    return classification("ALREADY_SENT", "high", reasons);
  }
  if (negativePattern(text)) {
    reasons.push("negative or unsubscribe phrase detected");
    return classification("NEGATIVE", "high", reasons);
  }
  if (positivePattern(text)) {
    reasons.push("positive interest phrase detected");
    return classification("POSITIVE", "high", reasons);
  }
  if (/out of office|mimo kancelarie|automaticka odpoved|automatic reply/.test(text)) {
    reasons.push("auto-reply phrase detected");
    return classification("NEUTRAL", "high", reasons);
  }
  reasons.push("no clear positive buying intent");
  return classification("NEUTRAL", "medium", reasons);
}

function classification(category: OutreachReplyCategory, confidence: OutreachReplyClassification["confidence"], reasons: string[]): OutreachReplyClassification {
  return { mode: "outreach-reply-classification", category, confidence, reasons, summary: `Reply classified as ${category}.` };
}

function positivePattern(text: string): boolean {
  return /\b(poslite|poslat|send|sure|ok|ano|yes|zaujima|ukazku|showcase|demo|cena|pricing|call|meeting|termin|stretnutie)\b/.test(text);
}

function negativePattern(text: string): boolean {
  return /\b(nie|no thanks|not interested|nemam zaujem|nemame zaujem|nezaujima|nepotrebujem|nepotrebujeme|not relevant|irrelevant|unsubscribe|odhlasit|nepiste|stop|remove)\b/.test(text);
}

function buildDeterministicShowcaseReply(leadName?: string, replyBody?: string): string {
  const surname = extractSurname(leadName) ?? extractSurnameFromSignature(replyBody ?? "");
  const greeting = surname ? `Dobry den pan/pani ${surname},` : "Dobry den,";
  return `${greeting}<br><br>posielam slubenu ukazku: <a href='https://www.arcigy.com/showcase'>https://www.arcigy.com/showcase</a>.`;
}

function extractSurname(name?: string): string | null {
  if (!name?.trim()) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

function extractSurnameFromSignature(value: string): string | null {
  const plain = stripHtml(value);
  const match = /(?:s pozdravom|pozdravuje|regards)[,\s]+([A-Z][\p{L}'-]+)\s+([A-Z][\p{L}'-]+)/iu.exec(plain);
  return match?.[2] ?? null;
}

function hasOurReplyAfterLatestLead(history: ReplyHistoryItem[], ourEmail?: string): boolean {
  const normalized = history.map((item) => ({ ...item, type: item.type?.toUpperCase() ?? "", body: item.email_body ?? item.body ?? "" }));
  const lastLeadIndex = normalized.reduce((last, item, index) => isLeadMessage(item, ourEmail) ? index : last, -1);
  if (lastLeadIndex < 0) return false;
  return normalized.slice(lastLeadIndex + 1).some((item) => item.isMe === true || item.type === "EMAIL_SENT" || item.type === "SENT");
}

function isLeadMessage(item: ReplyHistoryItem, ourEmail?: string): boolean {
  const type = item.type?.toUpperCase();
  if (type === "EMAIL_REPLY" || type === "REPLY") return true;
  const from = (item.fromEmail ?? item.from_email ?? "").toLowerCase();
  return Boolean(from && ourEmail && from !== ourEmail.toLowerCase());
}

async function draftGmailReply(
  input: Parameters<typeof previewGmailAiReply>[0],
  env: RuntimeEnv,
  fetchImpl: FetchLike
): Promise<NonNullable<GmailAiReplyPreview["draft"]>> {
  const senderName = input.senderEmail.split("@")[0]?.split(".")[0] || "Branislav";
  const result = await generateGeminiText(
    {
      systemInstruction: [
        `You are a male professional sales assistant named ${safeAiPromptPart(senderName)} responding for Arcigy.`,
        "Write in Slovak, formal tone, maximum 3 sentences.",
        "Always include the showcase link as HTML: <a href='https://www.arcigy.com/showcase'>https://www.arcigy.com/showcase</a>.",
        "No subject, no signature, reply body only. Do not claim the email was sent.",
      ].join(" "),
      prompt: [
        input.leadName ? `Lead name: ${safeAiPromptPart(input.leadName)}.` : null,
        safeUntrustedAiPromptPart("Gmail thread history", formatHistory(input.history ?? [], senderName)),
        safeUntrustedAiPromptPart("latest Gmail reply", input.body),
      ].filter(Boolean).join("\n"),
      temperature: 0.35,
    },
    env,
    fetchImpl
  );
  const emailBody = result.text.trim();
  return {
    emailBody,
    model: result.model,
    approvalPayload: {
      senderEmail: input.senderEmail,
      toEmail: input.fromEmail,
      subject: input.subject ?? "",
      threadId: input.threadId,
      messageId: input.messageId,
      emailBody,
      approval: { approved: true },
    },
  };
}

function smartleadSkip(reason: string, classification?: OutreachReplyClassification): SmartleadAiReplyPreview {
  return { mode: "smartlead-ai-reply-preview", action: "skip", reason, classification, summary: `Smartlead AI reply skipped: ${reason}` };
}

function gmailSkip(reason: string, classification?: OutreachReplyClassification): GmailAiReplyPreview {
  return { mode: "gmail-ai-reply-preview", action: "skip", reason, classification, summary: `Gmail AI reply skipped: ${reason}` };
}

function showcaseSkip(reason: string, classification?: OutreachReplyClassification): ShowcaseReplyPreview {
  return { mode: "showcase-reply-preview", action: "skip", reason, classification, nextToolCalls: [], summary: `Showcase reply skipped: ${reason}` };
}

function triageSkip(reply: OutreachReplyTriageItemInput, classificationResult: OutreachReplyClassification, reason: string): OutreachReplyTriagePreview["items"][number] {
  return {
    source: reply.source,
    email: reply.email,
    leadName: reply.leadName,
    companyName: reply.companyName,
    category: classificationResult.category,
    confidence: classificationResult.confidence,
    recommendedAction: "skip",
    reason,
  };
}

function buildPositiveReplyNextToolCall(reply: OutreachReplyTriageItemInput, body: string): OutreachReplyTriagePreview["nextToolCalls"][number] | null {
  if (reply.source === "smartlead") {
    if (reply.campaignId === undefined) return null;
    return {
      tool: "arcigy.draft_smartlead_thread_reply",
      payload: {
        campaignId: reply.campaignId,
        email: reply.email,
        leadName: reply.leadName,
        companyName: reply.companyName,
        positiveSignal: body,
        latestLeadReply: body,
        senderEmail: reply.senderEmail,
        messageHistory: reply.history,
        language: "sk",
      },
      approvalRequired: false,
    };
  }
  if (!reply.senderEmail || !reply.threadId || !reply.messageId) return null;
  return {
    tool: "arcigy.preview_gmail_ai_reply",
    payload: {
      senderEmail: reply.senderEmail,
      fromEmail: reply.email,
      subject: reply.subject,
      body,
      threadId: reply.threadId,
      messageId: reply.messageId,
      leadName: reply.leadName,
      history: reply.history,
      leadKnown: true,
      threadStartedByUs: true,
      generateDraft: true,
    },
    approvalRequired: false,
  };
}

function normalizeSmartleadReplyEvent(event: SmartleadReplyFollowupEventInput): {
  campaignId?: string | number;
  email?: string;
  eventType?: string;
  replyBody?: string;
  fromEmail?: string;
  leadName?: string;
  companyName?: string;
  categoryName?: string;
  history?: ReplyHistoryItem[];
  alreadyHandled?: boolean;
  alreadySent?: boolean;
} {
  const raw = event.raw ?? {};
  const value = (...keys: string[]) => {
    for (const key of keys) {
      const direct = (event as Record<string, unknown>)[key];
      const nested = raw[key];
      const picked = direct ?? nested;
      if (typeof picked === "string" && picked.trim()) return picked.trim();
      if (typeof picked === "number" && Number.isFinite(picked)) return picked;
    }
    return undefined;
  };
  const campaignId = value("campaignId", "campaign_id");
  const emailValue = value("email", "leadEmail", "lead_email", "toEmail", "to_email");
  return {
    campaignId,
    email: typeof emailValue === "string" ? emailValue.toLowerCase() : undefined,
    eventType: stringFrom(value("eventType", "event_type", "type")),
    replyBody: stringFrom(value("replyBody", "emailBody", "email_body", "body", "latestLeadReply", "latest_lead_reply")),
    fromEmail: stringFrom(value("fromEmail", "from_email", "senderEmail", "sender_email")),
    leadName: stringFrom(value("leadName", "lead_name")),
    companyName: stringFrom(value("companyName", "company_name")),
    categoryName: stringFrom(value("categoryName", "category_name")),
    history: Array.isArray(event.history) ? event.history : undefined,
    alreadyHandled: event.alreadyHandled === true,
    alreadySent: event.alreadySent === true,
  };
}

function stringFrom(value: string | number | undefined): string | undefined {
  if (typeof value === "number") return String(value);
  return value;
}

function dedupeToolCalls<T extends { tool: string; payload: Record<string, unknown>; approvalRequired: boolean }>(calls: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const call of calls) {
    const key = `${call.tool}:${JSON.stringify(call.payload)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(call);
  }
  return result;
}

function parseCategory(value: string): OutreachReplyCategory | null {
  const upper = value.toUpperCase();
  if (upper.includes("ALREADY_SENT")) return "ALREADY_SENT";
  if (upper.includes("POSITIVE")) return "POSITIVE";
  if (upper.includes("NEGATIVE")) return "NEGATIVE";
  if (upper.includes("NEUTRAL")) return "NEUTRAL";
  return null;
}

function formatHistory(history: ReplyHistoryItem[], senderName: string): string {
  return history.map((item) => {
    const sender = item.isMe || item.type?.toUpperCase() === "EMAIL_SENT" || item.type?.toUpperCase() === "SENT" ? senderName : "LEAD";
    const body = stripHtml(item.email_body ?? item.body ?? "");
    return `[${sender}]: ${body}`;
  }).join("\n---\n");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return stripHtml(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
