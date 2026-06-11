import { gmailRefreshTokenEnv, getEnv, requireEnv, type RuntimeEnv } from "./env.ts";
import { redactSensitiveText } from "./ai-safety.ts";
import type { FetchLike } from "./gemini.ts";

export const defaultGmailSyncQuery = "in:inbox newer_than:7d";
export const defaultGmailBriefingQuery = "in:inbox newer_than:2d";
export const defaultGmailUnreadTriageQuery = "is:unread category:primary";
const googleOAuthTokenUrls = ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v4/token"];

export type GmailAccount = {
  envKey: string;
  label: string;
  refreshToken: string;
};

export type GmailMessageEvent = {
  fromEmail: string;
  displayName?: string;
  source: "gmail";
  subject?: string;
  text: string;
  occurredAt?: string;
  threadId?: string;
  externalId: string;
  data: Record<string, unknown>;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessageResponse["payload"][];
  };
};

type GmailLabelResponse = {
  id: string;
  name: string;
};

type GmailLabelListResponse = {
  labels?: GmailLabelResponse[];
};

export type GmailLeadContextMessage = {
  accountEnvKey: string;
  accountLabel: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  fromEmail: string;
  toEmails: string[];
  displayName?: string;
  subject?: string;
  date?: string;
  occurredAt?: string;
  snippet?: string;
  body?: string;
  isFromLead: boolean;
  isFromUs: boolean;
};

export type GmailLeadContextResult = {
  mode: "gmail-lead-context";
  status: "ready" | "attention" | "blocked";
  summary: string;
  leadEmail: string;
  query: string;
  totals: { accountsChecked: number; accountsWithMessages: number; messages: number; leadReplies: number; sentByUs: number };
  inferredDisplayName?: string;
  accounts: Array<{ envKey: string; label: string; status: "ready" | "empty" | "failed"; messageCount: number; error?: string }>;
  messages: GmailLeadContextMessage[];
  latestLeadMessage?: GmailLeadContextMessage;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type GmailUnreadTriageMessage = {
  accountEnvKey: string;
  accountLabel: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  fromEmail: string;
  toEmails: string[];
  displayName?: string;
  subject?: string;
  date?: string;
  occurredAt?: string;
  snippet?: string;
  body?: string;
  category: "likely_lead_reply" | "automated" | "internal" | "unknown";
  reasons: string[];
};

export type GmailUnreadTriageResult = {
  mode: "gmail-unread-triage-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  query: string;
  totals: {
    accountsChecked: number;
    accountsWithUnread: number;
    messages: number;
    likelyLeadReplies: number;
    automated: number;
    internal: number;
    unknown: number;
  };
  accounts: Array<{ envKey: string; label: string; status: "ready" | "empty" | "failed"; messageCount: number; error?: string }>;
  messages: GmailUnreadTriageMessage[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type GmailThreadLabelResult = {
  mode: "gmail-thread-label";
  status: "labeled";
  summary: string;
  accountEnvKey: string;
  accountLabel: string;
  threadId: string;
  label: { id: string; name: string; created: boolean };
  markRead: boolean;
  modified: boolean;
};

export type GmailSendInput = {
  to: string;
  subject: string;
  text: string;
  threadId?: string;
};

export type GmailSendResult = {
  id: string;
  threadId?: string;
  labelIds?: string[];
};

export function listConfiguredGmailAccounts(env: RuntimeEnv = process.env): GmailAccount[] {
  const accounts: GmailAccount[] = [];
  for (const envKey of gmailRefreshTokenEnv) {
    const refreshToken = getEnv(env, envKey);
    if (!refreshToken) continue;
    accounts.push({
      envKey,
      label: envKey.replace("GMAIL_REFRESH_TOKEN_", "").toLowerCase(),
      refreshToken,
    });
  }
  return accounts;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const clientId = requireEnv(env, "GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv(env, "GOOGLE_CLIENT_SECRET");
  let lastError: Error | null = null;
  for (const url of googleOAuthTokenUrls) {
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const data = (await response.json()) as { access_token?: string };
      if (!data.access_token) {
        throw new Error("missing access token");
      }
      return data.access_token;
    } catch (error) {
      const message = redactSensitiveText(error instanceof Error ? error.message : String(error));
      lastError = new Error(`${new URL(url).hostname}: ${message}`);
    }
  }
  throw new Error(`Google OAuth refresh failed after ${googleOAuthTokenUrls.length} endpoint(s): ${lastError?.message ?? "unknown error"}`);
}

export async function listRecentGmailMessageEvents(
  account: GmailAccount,
  options: { query?: string; maxResults?: number } = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailMessageEvent[]> {
  const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 10),
    q: options.query ?? defaultGmailSyncQuery,
  });
  const listResponse = await gmailFetch<GmailListResponse>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    accessToken,
    fetchImpl
  );
  const messages = listResponse.messages ?? [];
  const events: GmailMessageEvent[] = [];
  for (const message of messages) {
    const detail = await gmailFetch<GmailMessageResponse>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      accessToken,
      fetchImpl
    );
    const headers = new Map((detail.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
    const from = parseFromHeader(headers.get("from") ?? "");
    events.push({
      fromEmail: from.email,
      displayName: from.displayName,
      source: "gmail",
      subject: headers.get("subject"),
      text: detail.snippet ?? "",
      occurredAt: detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : headers.get("date"),
      threadId: detail.threadId,
      externalId: detail.id,
      data: {
        account: account.label,
        gmailMessageId: detail.id,
      },
    });
  }
  return events.filter((event) => event.fromEmail && event.text);
}

export async function fetchGmailLeadContext(
  input: { leadEmail: string; accountEnvKey?: string; query?: string; maxMessages?: number; includeBody?: boolean },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailLeadContextResult> {
  const leadEmail = input.leadEmail.trim().toLowerCase();
  if (!leadEmail || !leadEmail.includes("@")) {
    throw new Error("leadEmail must be a valid email address.");
  }
  const maxMessages = Math.min(Math.max(Math.trunc(input.maxMessages ?? 10), 1), 50);
  const query = input.query?.trim() || leadEmail;
  const accounts = listConfiguredGmailAccounts(env).filter((account) => !input.accountEnvKey || account.envKey === input.accountEnvKey);
  if (!accounts.length) {
    throw new Error(input.accountEnvKey ? `Configured Gmail account not found: ${input.accountEnvKey}` : "No configured Gmail accounts found.");
  }
  const accountResults: GmailLeadContextResult["accounts"] = [];
  const messages: GmailLeadContextMessage[] = [];
  for (const account of accounts) {
    try {
      const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
      const params = new URLSearchParams({ maxResults: String(maxMessages), q: query });
      const listResponse = await gmailFetch<GmailListResponse>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        accessToken,
        fetchImpl
      );
      const ids = listResponse.messages ?? [];
      for (const item of ids) {
        const detail = await gmailFetch<GmailMessageResponse>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=${input.includeBody === false ? "metadata" : "full"}&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          accessToken,
          fetchImpl
        );
        messages.push(normalizeGmailLeadMessage(detail, account, leadEmail, input.includeBody !== false));
      }
      accountResults.push({ envKey: account.envKey, label: account.label, status: ids.length ? "ready" : "empty", messageCount: ids.length });
    } catch (error) {
      accountResults.push({
        envKey: account.envKey,
        label: account.label,
        status: "failed",
        messageCount: 0,
        error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  const sorted = messages
    .filter((message) => message.fromEmail === leadEmail || message.toEmails.includes(leadEmail) || JSON.stringify(message).toLowerCase().includes(leadEmail))
    .sort((a, b) => new Date(a.occurredAt ?? a.date ?? 0).getTime() - new Date(b.occurredAt ?? b.date ?? 0).getTime());
  const latestLeadMessage = [...sorted].reverse().find((message) => message.isFromLead);
  const inferredDisplayName = sorted.find((message) => message.isFromLead && message.displayName)?.displayName
    ?? sorted.find((message) => message.toEmails.includes(leadEmail) && message.displayName)?.displayName;
  const nextToolCalls: GmailLeadContextResult["nextToolCalls"] = [];
  if (latestLeadMessage) {
    nextToolCalls.push({
      tool: "arcigy.preview_gmail_ai_reply",
      payload: {
        senderEmail: latestLeadMessage.accountLabel,
        fromEmail: leadEmail,
        subject: latestLeadMessage.subject,
        body: latestLeadMessage.body || latestLeadMessage.snippet || "",
        threadId: latestLeadMessage.threadId,
        messageId: latestLeadMessage.messageId,
        leadName: inferredDisplayName,
        history: sorted.map((message) => ({ body: message.body || message.snippet, fromEmail: message.fromEmail, isMe: message.isFromUs, created_at: message.occurredAt ?? message.date })),
        leadKnown: true,
        threadStartedByUs: sorted.some((message) => message.isFromUs),
        generateDraft: false,
      },
      reason: "Latest Gmail message from the lead can be safely classified and drafted before any send.",
      approvalRequired: false,
    });
  }
  const totals = {
    accountsChecked: accountResults.length,
    accountsWithMessages: accountResults.filter((account) => account.messageCount > 0).length,
    messages: sorted.length,
    leadReplies: sorted.filter((message) => message.isFromLead).length,
    sentByUs: sorted.filter((message) => message.isFromUs).length,
  };
  const status: GmailLeadContextResult["status"] = sorted.length ? "ready" : accountResults.some((account) => account.status === "failed") ? "attention" : "blocked";
  return {
    mode: "gmail-lead-context",
    status,
    summary: `Gmail lead context ${status}: ${totals.messages} message(s) for ${leadEmail} across ${totals.accountsChecked} account(s), ${totals.leadReplies} from lead, ${totals.sentByUs} sent by Arcigy. Ziadny zapis ani odoslanie neprebehlo.`,
    leadEmail,
    query,
    totals,
    inferredDisplayName,
    accounts: accountResults,
    messages: sorted,
    latestLeadMessage,
    nextToolCalls,
  };
}

export async function fetchGmailUnreadTriage(
  input: { accountEnvKey?: string; query?: string; maxResults?: number; includeBody?: boolean; maxNextCalls?: number } = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailUnreadTriageResult> {
  const maxResults = Math.min(Math.max(Math.trunc(input.maxResults ?? 20), 1), 50);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 20), 1), 50);
  const query = input.query?.trim() || defaultGmailUnreadTriageQuery;
  const accounts = listConfiguredGmailAccounts(env).filter((account) => !input.accountEnvKey || account.envKey === input.accountEnvKey);
  if (!accounts.length) {
    throw new Error(input.accountEnvKey ? `Configured Gmail account not found: ${input.accountEnvKey}` : "No configured Gmail accounts found.");
  }
  const accountResults: GmailUnreadTriageResult["accounts"] = [];
  const messages: GmailUnreadTriageMessage[] = [];
  for (const account of accounts) {
    try {
      const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
      const params = new URLSearchParams({ maxResults: String(maxResults), q: query });
      const listResponse = await gmailFetch<GmailListResponse>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        accessToken,
        fetchImpl
      );
      const ids = listResponse.messages ?? [];
      for (const item of ids) {
        const detail = await gmailFetch<GmailMessageResponse>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=${input.includeBody === false ? "metadata" : "full"}&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          accessToken,
          fetchImpl
        );
        messages.push(normalizeGmailUnreadMessage(detail, account, input.includeBody !== false));
      }
      accountResults.push({ envKey: account.envKey, label: account.label, status: ids.length ? "ready" : "empty", messageCount: ids.length });
    } catch (error) {
      accountResults.push({
        envKey: account.envKey,
        label: account.label,
        status: "failed",
        messageCount: 0,
        error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  const sorted = messages.sort((a, b) => new Date(b.occurredAt ?? b.date ?? 0).getTime() - new Date(a.occurredAt ?? a.date ?? 0).getTime());
  const nextToolCalls: GmailUnreadTriageResult["nextToolCalls"] = [];
  for (const message of sorted.filter((item) => item.category === "likely_lead_reply").slice(0, maxNextCalls)) {
    nextToolCalls.push(
      {
        tool: "arcigy.get_gmail_lead_context",
        payload: { leadEmail: message.fromEmail, accountEnvKey: message.accountEnvKey, maxMessages: 10, includeBody: true },
        reason: "Najst celu Gmail historiu leadu pred navrhom odpovede.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.preview_gmail_ai_reply",
        payload: {
          senderEmail: message.accountLabel,
          fromEmail: message.fromEmail,
          subject: message.subject,
          body: message.body || message.snippet || "",
          threadId: message.threadId,
          messageId: message.messageId,
          leadName: message.displayName,
          leadKnown: false,
          threadStartedByUs: false,
          generateDraft: false,
        },
        reason: "Pripravit bezpecny draft odpovede na unread Gmail spravu bez odoslania.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.label_gmail_thread",
        payload: { accountEnvKey: message.accountEnvKey, threadId: message.threadId, labelName: "Jarvis/Handled", markRead: true },
        reason: "Az po vybaveni spravy oznacit Gmail thread ako spracovany a precitany.",
        approvalRequired: true,
      }
    );
  }
  if (sorted.length) {
    nextToolCalls.push({
      tool: "arcigy.sync_gmail_recent_messages",
      payload: { dryRun: true, query, maxResults },
      reason: "Volitelne porovnat unread triage so sync workflowom najprv v dry-run rezime.",
      approvalRequired: false,
    });
  }
  const totals = {
    accountsChecked: accountResults.length,
    accountsWithUnread: accountResults.filter((account) => account.messageCount > 0).length,
    messages: sorted.length,
    likelyLeadReplies: sorted.filter((message) => message.category === "likely_lead_reply").length,
    automated: sorted.filter((message) => message.category === "automated").length,
    internal: sorted.filter((message) => message.category === "internal").length,
    unknown: sorted.filter((message) => message.category === "unknown").length,
  };
  const status: GmailUnreadTriageResult["status"] = totals.messages ? "ready" : accountResults.some((account) => account.status === "failed") ? "attention" : "blocked";
  return {
    mode: "gmail-unread-triage-preview",
    status,
    summary: `Gmail unread triage ${status}: ${totals.messages} unread message(s), ${totals.likelyLeadReplies} likely lead replies, ${totals.automated} automated, ${totals.internal} internal. Ziadny zapis, label ani odoslanie neprebehlo.`,
    query,
    totals,
    accounts: accountResults,
    messages: sorted,
    nextToolCalls: dedupeGmailNextToolCalls(nextToolCalls),
  };
}

export async function sendGmailTextMessage(
  account: GmailAccount,
  input: GmailSendInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailSendResult> {
  const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
  const payload: { raw: string; threadId?: string } = {
    raw: encodeGmailRawMessage(input),
  };
  if (input.threadId) payload.threadId = input.threadId;
  return gmailPost<GmailSendResult>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", accessToken, payload, fetchImpl);
}

export async function labelGmailThread(
  input: { accountEnvKey: string; threadId: string; labelName?: string; markRead?: boolean },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<GmailThreadLabelResult> {
  const accountEnvKey = input.accountEnvKey.trim();
  const threadId = input.threadId.trim();
  const labelName = sanitizeGmailLabelName(input.labelName || "Jarvis/Handled");
  if (!accountEnvKey) throw new Error("accountEnvKey is required.");
  if (!threadId) throw new Error("threadId is required.");
  const account = listConfiguredGmailAccounts(env).find((item) => item.envKey === accountEnvKey);
  if (!account) throw new Error(`Configured Gmail account not found: ${accountEnvKey}`);
  const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
  const label = await ensureGmailLabel(labelName, accessToken, fetchImpl);
  const payload: { addLabelIds: string[]; removeLabelIds?: string[] } = { addLabelIds: [label.id] };
  if (input.markRead !== false) payload.removeLabelIds = ["UNREAD"];
  await gmailPost<unknown>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/modify`,
    accessToken,
    payload,
    fetchImpl
  );
  return {
    mode: "gmail-thread-label",
    status: "labeled",
    summary: `Gmail thread ${threadId} oznaceny labelom ${label.name}${input.markRead === false ? "" : " a oznaceny ako precitany"}.`,
    accountEnvKey: account.envKey,
    accountLabel: account.label,
    threadId,
    label,
    markRead: input.markRead !== false,
    modified: true,
  };
}

async function gmailFetch<T>(url: string, accessToken: string, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Gmail request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function gmailPost<T>(url: string, accessToken: string, payload: unknown, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Gmail request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function encodeGmailRawMessage(input: GmailSendInput): string {
  const subject = input.subject.trim() || "Re: Arcigy";
  const lines = [
    `To: ${input.to}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sanitizeGmailLabelName(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Jarvis/Handled";
  return cleaned.slice(0, 225);
}

async function ensureGmailLabel(labelName: string, accessToken: string, fetchImpl: FetchLike): Promise<GmailLabelResponse & { created: boolean }> {
  const labels = await gmailFetch<GmailLabelListResponse>("https://gmail.googleapis.com/gmail/v1/users/me/labels", accessToken, fetchImpl);
  const existing = labels.labels?.find((label) => label.name.toLowerCase() === labelName.toLowerCase());
  if (existing) return { id: existing.id, name: existing.name, created: false };
  const created = await gmailPost<GmailLabelResponse>(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    accessToken,
    { name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" },
    fetchImpl
  );
  return { id: created.id, name: created.name, created: true };
}

export function parseFromHeader(header: string): { email: string; displayName?: string } {
  const match = header.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (!match) return { email: header.trim().toLowerCase() };
  return {
    displayName: match[1]?.trim() || undefined,
    email: match[2].trim().toLowerCase(),
  };
}

function normalizeGmailLeadMessage(detail: GmailMessageResponse, account: GmailAccount, leadEmail: string, includeBody: boolean): GmailLeadContextMessage {
  const headers = new Map((detail.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const from = headers.get("from") ?? "";
  const to = headers.get("to") ?? "";
  const parsedFrom = parseFromHeader(from);
  const toEmails = extractEmails(to);
  const body = includeBody ? extractGmailBody(detail.payload) : undefined;
  return {
    accountEnvKey: account.envKey,
    accountLabel: account.label,
    messageId: detail.id,
    threadId: detail.threadId,
    from,
    to,
    fromEmail: parsedFrom.email,
    toEmails,
    displayName: parsedFrom.displayName,
    subject: headers.get("subject"),
    date: headers.get("date"),
    occurredAt: detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : headers.get("date"),
    snippet: detail.snippet,
    body,
    isFromLead: parsedFrom.email === leadEmail,
    isFromUs: parsedFrom.email !== leadEmail,
  };
}

function normalizeGmailUnreadMessage(detail: GmailMessageResponse, account: GmailAccount, includeBody: boolean): GmailUnreadTriageMessage {
  const headers = new Map((detail.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const from = headers.get("from") ?? "";
  const to = headers.get("to") ?? "";
  const parsedFrom = parseFromHeader(from);
  const body = includeBody ? extractGmailBody(detail.payload) : undefined;
  const classification = classifyGmailUnreadMessage(parsedFrom.email, headers.get("subject") ?? "", body || detail.snippet || "");
  return {
    accountEnvKey: account.envKey,
    accountLabel: account.label,
    messageId: detail.id,
    threadId: detail.threadId,
    from,
    to,
    fromEmail: parsedFrom.email,
    toEmails: extractEmails(to),
    displayName: parsedFrom.displayName,
    subject: headers.get("subject"),
    date: headers.get("date"),
    occurredAt: detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : headers.get("date"),
    snippet: detail.snippet,
    body,
    category: classification.category,
    reasons: classification.reasons,
  };
}

function classifyGmailUnreadMessage(fromEmail: string, subject: string, text: string): { category: GmailUnreadTriageMessage["category"]; reasons: string[] } {
  const lower = `${fromEmail} ${subject} ${text}`.toLowerCase();
  const reasons: string[] = [];
  if (!fromEmail || !fromEmail.includes("@")) {
    return { category: "unknown", reasons: ["missing_from_email"] };
  }
  if (/(^|[+._-])(no-?reply|noreply|mailer-daemon|notification|notifications|bounce|postmaster)@/.test(fromEmail) || /unsubscribe|delivery status notification|automatick|auto.?reply|out of office/i.test(lower)) {
    reasons.push("automated_sender_or_content");
    return { category: "automated", reasons };
  }
  if (/@arcigy\./i.test(fromEmail) || /@arcigy\.group$/i.test(fromEmail)) {
    reasons.push("arcigy_internal_sender");
    return { category: "internal", reasons };
  }
  if (/re:|odpoved|reply|pros[ií]m|zaujem|m[aá]m z[aá]ujem|po[sš]lite|uk[aá][zž]ku|kontaktujte|ponuku/i.test(`${subject} ${text}`)) {
    reasons.push("reply_or_interest_language");
  }
  if (!/^(info|kontakt|office|admin|mail|hello)@/i.test(fromEmail)) {
    reasons.push("person_like_sender");
  }
  return { category: reasons.length ? "likely_lead_reply" : "unknown", reasons: reasons.length ? reasons : ["no_clear_signal"] };
}

function extractEmails(value: string): string[] {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
}

function dedupeGmailNextToolCalls(calls: GmailUnreadTriageResult["nextToolCalls"]): GmailUnreadTriageResult["nextToolCalls"] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.tool}:${JSON.stringify(call.payload)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractGmailBody(payload: GmailMessageResponse["payload"]): string | undefined {
  if (!payload) return undefined;
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailBody(payload.body.data);
  for (const part of payload.parts ?? []) {
    const value = extractGmailBody(part);
    if (value) return value;
  }
  if (payload.body?.data) return decodeGmailBody(payload.body.data).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return undefined;
}

function decodeGmailBody(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8").replace(/\s+/g, " ").trim();
}
