import { existsSync } from "node:fs";

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
    check.message = await run();
    check.status = "ready";
  } catch (error) {
    check.status = "failed";
    check.message = error instanceof Error ? error.message : String(error);
  }
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
  const account = listConfiguredGmailAccounts(env)[0];
  if (!account) throw new Error("No configured Google OAuth account found.");
  const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google Sheets metadata request failed: ${response.status}`);
  return "Google Sheets metadata request responded.";
}
