import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type RuntimeEnv = Record<string, string | undefined>;

export type IntegrationKey =
  | "gemini"
  | "gmail"
  | "smartlead"
  | "postgres"
  | "redis"
  | "googleSheets"
  | "googleMaps"
  | "serper";

export type IntegrationHealth = {
  key: IntegrationKey;
  configured: boolean;
  missing: string[];
};

export const gmailRefreshTokenEnv = [
  "GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP",
  "GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP",
  "GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP",
  "GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP",
] as const;

const integrations: Array<{ key: IntegrationKey; required: string[] }> = [
  { key: "gemini", required: ["GEMINI_API_KEY"] },
  { key: "gmail", required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", ...gmailRefreshTokenEnv] },
  { key: "smartlead", required: ["SMARTLEAD_API_KEY"] },
  { key: "postgres", required: ["DATABASE_URL"] },
  { key: "redis", required: ["REDIS_URL"] },
  { key: "googleSheets", required: ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
  { key: "googleMaps", required: ["GOOGLE_MAPS_API_KEY"] },
  { key: "serper", required: ["SERPER_API_KEY"] },
];

export function getEnv(env: RuntimeEnv, key: string): string | null {
  const value = env[key]?.trim();
  if (!value || value === "dummy") return null;
  return value;
}

export function requireEnv(env: RuntimeEnv, key: string): string {
  const value = getEnv(env, key);
  if (!value) {
    throw new Error(`Missing runtime environment variable: ${key}`);
  }
  return value;
}

export function getIntegrationHealth(env: RuntimeEnv = process.env): IntegrationHealth[] {
  return integrations.map((integration) => {
    const missing = integration.required.filter((key) => !getEnv(env, key));
    return {
      key: integration.key,
      configured: missing.length === 0,
      missing,
    };
  });
}

export function summarizeIntegrationHealth(env: RuntimeEnv = process.env): string {
  const health = getIntegrationHealth(env);
  const ready = health.filter((item) => item.configured).map((item) => item.key);
  const missing = health.filter((item) => !item.configured).map((item) => `${item.key}: ${item.missing.join(", ")}`);
  return [
    ready.length ? `Ready: ${ready.join(", ")}.` : "Ready: none.",
    missing.length ? `Missing: ${missing.join("; ")}.` : "Missing: none.",
  ].join(" ");
}

export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function loadLocalEnv(repoRoot = process.cwd(), env: RuntimeEnv = process.env): void {
  for (const filename of [".env.local", ".env"]) {
    const envPath = join(repoRoot, filename);
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && typeof env[key] === "undefined") {
        env[key] = value;
      }
    }
  }
}
