import { existsSync } from "node:fs";
import { connect as connectNet } from "node:net";
import { connect as connectTls } from "node:tls";

import { getEnv, getIntegrationHealth, type RuntimeEnv } from "./env.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";
import { listConfiguredGmailAccounts, refreshGoogleAccessToken } from "./gmail.ts";
import { searchGooglePlaces, searchSerper } from "./lead-discovery.ts";
import { getSmartleadCampaignStatus } from "./smartlead.ts";

export type DiagnosticStatus = "ready" | "missing" | "failed";

export type DiagnosticCheck = {
  key: string;
  status: DiagnosticStatus;
  message: string;
};

export type DiagnosticsInput = {
  live?: boolean;
  dbPath?: string;
};

export type DiagnosticsResult = {
  live: boolean;
  checkedAt: string;
  checks: DiagnosticCheck[];
};

export async function runIntegrationDiagnostics(
  input: DiagnosticsInput = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<DiagnosticsResult> {
  const checks: DiagnosticCheck[] = getIntegrationHealth(env).map((item) => ({
    key: item.key,
    status: item.configured ? "ready" : "missing",
    message: item.configured ? "Configured." : `Missing: ${item.missing.join(", ")}`,
  }));

  checks.push({
    key: "sqlite",
    status: "ready",
    message: input.dbPath
      ? `DB path ${existsSync(input.dbPath) ? "exists" : "can be created on demand"}.`
      : "Default local DB path can be created on demand.",
  });

  if (input.live) {
    await Promise.all([
      updateLiveCheck(checks, "gemini", () => checkGemini(env, fetchImpl)),
      updateLiveCheck(checks, "gmail", () => checkGmail(env, fetchImpl)),
      updateLiveCheck(checks, "smartlead", () => checkSmartlead(env, fetchImpl)),
      updateLiveCheck(checks, "postgres", () => checkPostgres(env)),
      updateLiveCheck(checks, "redis", () => checkRedis(env)),
      updateLiveCheck(checks, "googleMaps", () => checkGoogleMaps(env, fetchImpl)),
      updateLiveCheck(checks, "serper", () => checkSerper(env, fetchImpl)),
      updateLiveCheck(checks, "googleSheets", () => checkGoogleSheets(env, fetchImpl)),
    ]);
  }

  return {
    live: input.live === true,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function updateLiveCheck(checks: DiagnosticCheck[], key: string, run: () => Promise<string>) {
  const check = checks.find((item) => item.key === key);
  if (!check || check.status === "missing") return;
  try {
    check.message = await runWithTransientRetry(run);
    check.status = "ready";
  } catch (error) {
    check.status = "failed";
    check.message = error instanceof Error ? error.message : String(error);
  }
}

async function runWithTransientRetry(run: () => Promise<string>, maxRetries = 2): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isTransientNetworkError(lastError) || attempt === maxRetries) break;
      await sleep(350 * (attempt + 1));
    }
  }
  throw lastError ?? new Error("Live diagnostic failed.");
}

function isTransientNetworkError(error: Error): boolean {
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGemini(env: RuntimeEnv, fetchImpl: FetchLike) {
  const result = await generateGeminiText({ prompt: "Return OK.", temperature: 0 }, env, fetchImpl);
  return `Gemini responded with ${result.text.length} characters.`;
}

async function checkGmail(env: RuntimeEnv, fetchImpl: FetchLike) {
  const accounts = listConfiguredGmailAccounts(env);
  if (!accounts.length) throw new Error("No configured Gmail accounts found.");
  await Promise.all(accounts.map((account) => refreshGoogleAccessToken(account.refreshToken, env, fetchImpl)));
  return `OAuth refresh succeeded for ${accounts.length} Gmail account(s).`;
}

async function checkSmartlead(env: RuntimeEnv, fetchImpl: FetchLike) {
  const result = await getSmartleadCampaignStatus({}, env, fetchImpl);
  return `Smartlead returned ${result.campaigns?.length ?? 0} campaign(s).`;
}

async function checkPostgres(env: RuntimeEnv) {
  const target = parseServiceUrl(getEnv(env, "DATABASE_URL"), "Postgres");
  await openSocket(target);
  return `Postgres TCP connection opened to ${target.host}:${target.port}.`;
}

async function checkRedis(env: RuntimeEnv) {
  const target = parseServiceUrl(getEnv(env, "REDIS_URL"), "Redis");
  try {
    await pingRedis(target);
  } catch (error) {
    if (target.protocol === "redis:" && isConnectionResetLike(error)) {
      const tlsTarget = { ...target, protocol: "rediss:" };
      await pingRedis(tlsTarget);
      return `Redis PING succeeded at ${target.host}:${target.port} using TLS fallback; update REDIS_URL to rediss:// for this provider.`;
    }
    throw error;
  }
  return `Redis PING succeeded at ${target.host}:${target.port}.`;
}

async function checkGoogleMaps(env: RuntimeEnv, fetchImpl: FetchLike) {
  await searchGooglePlaces({ query: "Arcigy", maxResultCount: 1 }, env, fetchImpl);
  return "Google Places Text Search responded.";
}

async function checkSerper(env: RuntimeEnv, fetchImpl: FetchLike) {
  await searchSerper({ query: "Arcigy", num: 1 }, env, fetchImpl);
  return "Serper responded.";
}

async function checkGoogleSheets(env: RuntimeEnv, fetchImpl: FetchLike) {
  const spreadsheetId = getEnv(env, "GOOGLE_SHEET_ID");
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID.");
  const accounts = listConfiguredGmailAccounts(env);
  if (!accounts.length) throw new Error("No configured Google OAuth account found.");
  let lastError = "";
  for (const [index, account] of accounts.entries()) {
    try {
      const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
      const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return `Google Sheets metadata request responded using account ${index + 1}/${accounts.length}.`;
      lastError = `Google Sheets metadata request failed after account ${index + 1}/${accounts.length}: ${response.status}`;
    } catch (error) {
      lastError = `Google Sheets metadata request failed after account ${index + 1}/${accounts.length}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw new Error(lastError || "Google Sheets metadata request failed.");
}

type ServiceTarget = {
  protocol: string;
  host: string;
  port: number;
  username: string;
  password: string;
};

function parseServiceUrl(value: string | null, label: string): ServiceTarget {
  if (!value) throw new Error(`Missing ${label} URL.`);
  const url = new URL(value);
  const defaultPort = url.protocol === "rediss:" ? 6380 : url.protocol.startsWith("redis") ? 6379 : 5432;
  if (!url.hostname) throw new Error(`${label} URL is missing hostname.`);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: Number(url.port || defaultPort),
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
  };
}

function openSocket(target: ServiceTarget, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = target.protocol === "rediss:" ? connectTls({ host: target.host, port: target.port }) : connectNet({ host: target.host, port: target.port });
    const readyEvent = target.protocol === "rediss:" ? "secureConnect" : "connect";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connection timed out for ${target.host}:${target.port}.`));
    }, timeoutMs);
    socket.once(readyEvent, () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`TCP connection failed for ${target.host}:${target.port}: ${error.message}`));
    });
  });
}

function pingRedis(target: ServiceTarget, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket =
      target.protocol === "rediss:"
        ? connectTls({ host: target.host, port: target.port, servername: target.host })
        : connectNet({ host: target.host, port: target.port });
    const readyEvent = target.protocol === "rediss:" ? "secureConnect" : "connect";
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Redis PING timed out for ${target.host}:${target.port}.`));
    }, timeoutMs);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const sendPing = () => socket.write(encodeRedisCommand(["PING"]));
    const authenticate = () => {
      if (!target.password) {
        sendPing();
      } else if (target.username) {
        socket.write(encodeRedisCommand(["AUTH", target.username, target.password]));
      } else {
        socket.write(encodeRedisCommand(["AUTH", target.password]));
      }
    };
    socket.once(readyEvent, authenticate);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      if (buffer.startsWith("-")) {
        finish(new Error(`Redis returned an error at ${target.host}:${target.port}.`));
      } else if (buffer.includes("+PONG")) {
        finish();
      } else if (buffer.includes("+OK")) {
        sendPing();
      }
    });
    socket.once("error", (error) => finish(new Error(`Redis connection failed for ${target.host}:${target.port}: ${error.message}`)));
  });
}

function isConnectionResetLike(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|socket hang up|connection reset/i.test(message);
}

function encodeRedisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}
