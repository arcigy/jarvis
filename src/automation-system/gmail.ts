import { gmailRefreshTokenEnv, getEnv, requireEnv, type RuntimeEnv } from "./env.ts";
import { redactSensitiveText } from "./ai-safety.ts";
import type { FetchLike } from "./gemini.ts";

export const defaultGmailSyncQuery = "in:inbox newer_than:7d";
export const defaultGmailBriefingQuery = "in:inbox newer_than:2d";
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

function extractEmails(value: string): string[] {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
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
