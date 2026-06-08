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
  };
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
