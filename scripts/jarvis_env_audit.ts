#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getIntegrationHealth, loadLocalEnv, type RuntimeEnv } from "../src/automation-system/env.ts";
import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";

type AuditState = "configured" | "missing" | "placeholder";
type AuditStatus = "ready" | "attention" | "blocked";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  process.stdout.write(
    [
      "Arcigy Jarvis secrets audit",
      "",
      "Usage:",
      "  npm run secrets:audit",
      "  npm run secrets:audit -- --json",
      "  npm run secrets:audit -- --strict",
      "",
      "Options:",
      "  --json         Print machine-readable JSON.",
      "  --strict       Exit 1 when required production integration secrets are missing.",
      "  --no-env-file  Do not load .env.local or .env.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

const env: RuntimeEnv = { ...process.env };
const loadedEnvFiles = args.has("--no-env-file") ? [] : loadTrackedLocalEnv(repoRoot, env);
const report = buildSecretsAudit(repoRoot, env, loadedEnvFiles);
const output = args.has("--json") ? `${JSON.stringify(report, null, 2)}\n` : renderText(report);
process.stdout.write(redactSensitiveText(output));
if (args.has("--strict") && report.status === "blocked") process.exitCode = 1;

function buildSecretsAudit(root: string, runtimeEnv: RuntimeEnv, loadedFiles: string[]) {
  const keys = readExampleKeys(root).map((key) => summarizeKey(key, runtimeEnv[key]));
  const health = getIntegrationHealth(runtimeEnv);
  const requiredMissing = health.filter((item) => !item.configured && item.requiredForProduction);
  const advisoryMissing = health.filter((item) => !item.configured && !item.requiredForProduction);
  const status: AuditStatus = requiredMissing.length ? "blocked" : advisoryMissing.length ? "attention" : "ready";
  const nextActions = [
    ...requiredMissing.map((item) => `Set ${item.key} runtime secret(s): ${item.missing.join(", ")}.`),
    ...advisoryMissing.map((item) => `Review optional ${item.key} secret(s): ${item.missing.join(", ")}.`),
  ];

  return {
    mode: "arcigy-jarvis-secrets-audit",
    status,
    checkedAt: new Date().toISOString(),
    loadedEnvFiles: loadedFiles,
    localEnvIgnoredByGit: localEnvIgnoredByGit(root),
    secretPolicy: "Secret-safe: reports only key names, configured/missing/placeholder state, value length, and SHA-256 fingerprints.",
    summary:
      status === "ready"
        ? "All production integration secret groups are configured."
        : status === "attention"
          ? "Required production secrets are configured; optional provider secrets need attention."
          : "Required production secrets need attention before live production handoff.",
    integrations: health.map((item) => ({
      key: item.key,
      configured: item.configured,
      requiredForProduction: item.requiredForProduction,
      missing: item.missing,
    })),
    keys,
    nextActions,
  };
}

function loadTrackedLocalEnv(root: string, runtimeEnv: RuntimeEnv): string[] {
  const loaded: string[] = [];
  for (const filename of [".env.local", ".env"]) {
    if (existsSync(join(root, filename))) loaded.push(filename);
  }
  loadLocalEnv(root, runtimeEnv);
  return loaded;
}

function readExampleKeys(root: string): string[] {
  return readFileSync(join(root, ".env.example"), "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
    .filter(Boolean);
}

function summarizeKey(key: string, value: string | undefined) {
  const raw = value?.trim() ?? "";
  const placeholderReason = getPlaceholderReason(key, raw);
  const state: AuditState = !raw ? "missing" : placeholderReason ? "placeholder" : "configured";
  return {
    key,
    state,
    length: raw.length,
    fingerprint: state === "configured" ? secretFingerprint(raw) : null,
    issue: state === "placeholder" ? placeholderReason : null,
  };
}

function getPlaceholderReason(key: string, value: string): string | null {
  if (!value || value === "dummy") return value === "dummy" ? `${key} is dummy` : null;
  if (/^(PASSWORD|changeme|change-me|todo)$/i.test(value)) return `${key} is a placeholder value`;
  if (/dummy\.com/i.test(value)) return `${key} contains a dummy host`;
  if ((key === "DATABASE_URL" || key === "REDIS_URL") && hasPlaceholderUrlCredential(value)) return `${key} contains a placeholder credential`;
  return null;
}

function hasPlaceholderUrlCredential(value: string): boolean {
  try {
    const url = new URL(value);
    const credentials = [decodeURIComponent(url.username), decodeURIComponent(url.password)].map((item) => item.trim().toLowerCase());
    return credentials.some((item) => ["password", "changeme", "change-me", "todo", "dummy"].includes(item));
  } catch {
    return false;
  }
}

function secretFingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function localEnvIgnoredByGit(root: string): boolean {
  const ignorePath = join(root, ".gitignore");
  if (!existsSync(ignorePath)) return false;
  const ignore = readFileSync(ignorePath, "utf-8");
  return /^\.env\.\*$/m.test(ignore) && /^!\.env\.example$/m.test(ignore);
}

function renderText(report: ReturnType<typeof buildSecretsAudit>): string {
  return [
    "Arcigy Jarvis secrets audit",
    `Status: ${report.status}`,
    `Loaded env files: ${report.loadedEnvFiles.length ? report.loadedEnvFiles.join(", ") : "none"}`,
    `Local env ignored by git: ${report.localEnvIgnoredByGit ? "yes" : "no"}`,
    report.summary,
    "",
    "Integrations:",
    ...report.integrations.map((item) => `- ${item.key}: ${item.configured ? "configured" : item.missing.join(", ")}`),
    "",
    report.nextActions.length ? "Next actions:" : "Next actions: clear",
    ...report.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}
