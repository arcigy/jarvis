#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";

const defaultRepoRoot = fileURLToPath(new URL("../", import.meta.url));
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const repoRoot = resolve(getArg("repo-root") ?? defaultRepoRoot);

if (args.has("--help")) {
  process.stdout.write(
    [
      "Arcigy Jarvis env bootstrap",
      "",
      "Usage:",
      "  npm run secrets:bootstrap",
      "  npm run secrets:bootstrap -- --json",
      "  npm run secrets:bootstrap -- --force",
      "",
      "Options:",
      "  --json             Print machine-readable JSON.",
      "  --force            Rotate generated local tokens even when strong values already exist.",
      "  --repo-root <path>  Test/support override for the repository root.",
      "",
      "Creates or updates only .env.local. Secret values are never printed.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

const result = bootstrapJarvisLocalSecrets(repoRoot, args.has("--force"));
const output = args.has("--json") ? `${JSON.stringify(result, null, 2)}\n` : renderText(result);
process.stdout.write(redactSensitiveText(output));

function bootstrapJarvisLocalSecrets(root: string, force: boolean) {
  const envPath = join(root, ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const webToken = nextSecretValue(existing, "JARVIS_WEB_TOKEN", force);
  const apiSecret = nextSecretValue(existing, "API_SECRET_KEY", force);
  const changed = webToken.changed || apiSecret.changed;
  let nextContent = existing;
  if (webToken.changed) nextContent = upsertEnvValue(nextContent, "JARVIS_WEB_TOKEN", webToken.value);
  if (apiSecret.changed) nextContent = upsertEnvValue(nextContent, "API_SECRET_KEY", apiSecret.value);
  if (changed) {
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, nextContent, "utf-8");
  }
  return {
    mode: "arcigy-jarvis-env-bootstrap",
    status: "ready",
    envFile: ".env.local",
    changed,
    rotated: force && changed,
    tokenState: "configured",
    tokenChanged: webToken.changed,
    tokenLength: webToken.value.length,
    tokenFingerprint: secretFingerprint(webToken.value),
    apiSecretState: "configured",
    apiSecretChanged: apiSecret.changed,
    apiSecretLength: apiSecret.value.length,
    apiSecretFingerprint: secretFingerprint(apiSecret.value),
    nextActions: ["Run npm run secrets:audit, then npm run doctor before starting a remote MCP tunnel."],
    secretPolicy: "Secret-safe: generated local secrets are written to .env.local and never printed; output includes only lengths and SHA-256 fingerprints.",
  };
}

function nextSecretValue(content: string, key: string, force: boolean): { value: string; changed: boolean } {
  const current = readEnvValue(content, key);
  const currentStrong = isStrongToken(current);
  const changed = force || !currentStrong;
  return { value: changed ? generateToken() : current, changed };
}

function getArg(name: string): string | null {
  const index = rawArgs.indexOf(`--${name}`);
  return index >= 0 && rawArgs[index + 1] ? rawArgs[index + 1] : null;
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function isStrongToken(value: string): boolean {
  return value.trim().length >= 32 && value.trim() !== "dummy";
}

function readEnvValue(content: string, key: string): string {
  const line = content.split(/\r?\n/).find((item) => item.trim().startsWith(`${key}=`));
  if (!line) return "";
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const lines = content ? content.split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (!line.trim().startsWith(`${key}=`)) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) {
    if (next.length && next[next.length - 1] !== "") next.push("");
    next.push(`${key}=${value}`);
  }
  return `${next.join("\n").replace(/\n+$/g, "")}\n`;
}

function secretFingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function renderText(result: ReturnType<typeof bootstrapJarvisLocalSecrets>): string {
  return [
    "Arcigy Jarvis env bootstrap",
    `Status: ${result.status}`,
    `Env file: ${result.envFile}`,
    `JARVIS_WEB_TOKEN: ${result.tokenChanged ? "generated" : "already configured"}`,
    `Token fingerprint: ${result.tokenFingerprint}`,
    `API_SECRET_KEY: ${result.apiSecretChanged ? "generated" : "already configured"}`,
    `API secret fingerprint: ${result.apiSecretFingerprint}`,
    "",
    "Next actions:",
    ...result.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}
