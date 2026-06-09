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
      "  --force            Rotate JARVIS_WEB_TOKEN even when a strong token already exists.",
      "  --repo-root <path>  Test/support override for the repository root.",
      "",
      "Creates or updates only .env.local. Secret values are never printed.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

const result = bootstrapJarvisWebToken(repoRoot, args.has("--force"));
const output = args.has("--json") ? `${JSON.stringify(result, null, 2)}\n` : renderText(result);
process.stdout.write(redactSensitiveText(output));

function bootstrapJarvisWebToken(root: string, force: boolean) {
  const envPath = join(root, ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const current = readEnvValue(existing, "JARVIS_WEB_TOKEN");
  const currentStrong = isStrongToken(current);
  const changed = force || !currentStrong;
  const nextToken = changed ? generateToken() : current;
  const nextContent = changed ? upsertEnvValue(existing, "JARVIS_WEB_TOKEN", nextToken) : existing;
  if (changed) {
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, nextContent, "utf-8");
  }
  return {
    mode: "arcigy-jarvis-env-bootstrap",
    status: "ready",
    envFile: ".env.local",
    changed,
    rotated: force && changed && Boolean(current),
    tokenState: "configured",
    tokenLength: nextToken.length,
    tokenFingerprint: secretFingerprint(nextToken),
    nextActions: ["Run npm run secrets:audit, then npm run doctor before starting a remote MCP tunnel."],
    secretPolicy: "Secret-safe: generated token is written to .env.local and never printed; output includes only length and SHA-256 fingerprint.",
  };
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

function renderText(result: ReturnType<typeof bootstrapJarvisWebToken>): string {
  return [
    "Arcigy Jarvis env bootstrap",
    `Status: ${result.status}`,
    `Env file: ${result.envFile}`,
    `JARVIS_WEB_TOKEN: ${result.changed ? "generated" : "already configured"}`,
    `Token fingerprint: ${result.tokenFingerprint}`,
    "",
    "Next actions:",
    ...result.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}
