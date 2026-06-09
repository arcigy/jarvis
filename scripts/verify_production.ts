#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const webUrl = process.env.JARVIS_VERIFY_WEB_URL || "http://127.0.0.1:8765";
const evidencePath = join(repoRoot, "generated", "production-verification", "latest.json");
const checks: Array<{ name: string; status: "ready" | "failed"; detail: string }> = [];
const requiredRemoteMcpSmokeGates = [
  "action-manifest",
  "openapi-schema",
  "cors-preflight",
  "external-auth-gate",
  "pack-auth-throttle-policy",
  "pack-limits",
  "pack-agent-setup-profiles",
  "pack-voice-quick-start",
  "voice-tool-call",
  "pack-production-evidence-quick-start",
  "production-evidence-tool-call",
  "approval-gate",
  "approval-shape-gate",
  "secret-redaction",
];
let webChild: ChildProcess | null = null;

try {
  await main();
} finally {
  stopWebBridge();
}

async function main() {
  runNpm("typecheck", ["run", "typecheck"]);
  runNpm("tests", ["test"]);
  runNpm("secrets-audit", ["run", "secrets:audit", "--", "--json"]);
  runNpm("local-memory-smoke", ["run", "local:memory:smoke"]);
  await ensureWebBridge();
  runNpm("doctor-live", ["run", "doctor", "--", "--live-integrations"]);
  const remoteMcpSmokeOutput = runNpm("remote-mcp-smoke", ["run", "remote:mcp:smoke", "--", "--url", webUrl, "--json"]);
  requireRemoteMcpSmokeGates(remoteMcpSmokeOutput);
  runNpm("ui-smoke", ["run", "ui:smoke"], {
    JARVIS_UI_SMOKE_URL: `${webUrl}/index.html`,
    JARVIS_UI_SMOKE_OUT: "generated/jarvis-ui-smoke.png",
  });
  runNpm("ui-smoke-narrow", ["run", "ui:smoke", "--", "--width", "390", "--height", "900"], {
    JARVIS_UI_SMOKE_URL: `${webUrl}/index.html`,
    JARVIS_UI_SMOKE_OUT: "generated/jarvis-ui-smoke-narrow.png",
  });
  runSecretScan();
  writeEvidence();
  validateEvidenceArtifact();
  writeEvidence();
  process.stdout.write(renderSummary());
}

function runCommand(name: string, command: string, args: string[], extraEnv: Record<string, string> = {}): string {
  process.stdout.write(`\n[verify] ${name}\n`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  });
  if (result.stdout) process.stdout.write(redactSensitiveText(result.stdout));
  if (result.stderr) process.stderr.write(redactSensitiveText(result.stderr));
  if (result.status !== 0) {
    checks.push({ name, status: "failed", detail: result.error ? redactSensitiveText(result.error.message) : `Exited with status ${result.status}.` });
    writeEvidence();
    process.stdout.write(renderSummary());
    process.exit(result.status ?? 1);
  }
  checks.push({ name, status: "ready", detail: "OK" });
  return result.stdout;
}

function runNpm(name: string, args: string[], extraEnv: Record<string, string> = {}): string {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return runCommand(name, process.execPath, [npmExecPath, ...args], extraEnv);
  }
  return runCommand(name, process.platform === "win32" ? "npm.cmd" : "npm", args, extraEnv);
}

function requireRemoteMcpSmokeGates(output: string) {
  process.stdout.write(`\n[verify] remote-mcp-smoke-required-gates\n`);
  try {
    const report = parseRemoteMcpSmokeJson(output) as {
      status?: unknown;
      checks?: Array<{ key?: unknown; status?: unknown }>;
    };
    const readyChecks = new Set((Array.isArray(report.checks) ? report.checks : []).filter((check) => check.status === "ready").map((check) => String(check.key ?? "")));
    const missing = requiredRemoteMcpSmokeGates.filter((key) => !readyChecks.has(key));
    if (report.status !== "ready" || missing.length > 0) {
      checks.push({
        name: "remote-mcp-smoke-required-gates",
        status: "failed",
        detail: missing.length ? `Remote MCP smoke is missing required ready gate(s): ${missing.join(", ")}.` : "Remote MCP smoke report is not ready.",
      });
      writeEvidence();
      process.stdout.write(renderSummary());
      process.exit(1);
    }
    checks.push({
      name: "remote-mcp-smoke-required-gates",
      status: "ready",
      detail: `Remote MCP smoke required gates are ready: ${requiredRemoteMcpSmokeGates.join(", ")}.`,
    });
  } catch (error) {
    checks.push({
      name: "remote-mcp-smoke-required-gates",
      status: "failed",
      detail: redactSensitiveText(error instanceof Error ? error.message : String(error)),
    });
    writeEvidence();
    process.stdout.write(renderSummary());
    process.exit(1);
  }
}

function parseRemoteMcpSmokeJson(output: string): unknown {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Remote MCP smoke JSON report was not found in command output.");
  return JSON.parse(output.slice(start, end + 1));
}

async function ensureWebBridge() {
  if (await isWebBridgeOnline()) {
    checks.push({ name: "web-bridge", status: "ready", detail: `${webUrl} already online.` });
    return;
  }
  process.stdout.write(`\n[verify] web-bridge\n`);
  const url = new URL(webUrl);
  webChild = spawn(process.execPath, ["src/server/local-api-server.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JARVIS_WEB_HOST: url.hostname,
      JARVIS_WEB_PORT: url.port || "8765",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  webChild.stdout?.on("data", (chunk) => process.stdout.write(`[web] ${redactSensitiveText(String(chunk))}`));
  webChild.stderr?.on("data", (chunk) => process.stderr.write(`[web] ${redactSensitiveText(String(chunk))}`));

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isWebBridgeOnline()) {
      checks.push({ name: "web-bridge", status: "ready", detail: `${webUrl} started.` });
      return;
    }
    await delay(400);
  }
  checks.push({ name: "web-bridge", status: "failed", detail: `Timed out waiting for ${webUrl}.` });
  writeEvidence();
  process.stdout.write(renderSummary());
  process.exit(1);
}

async function isWebBridgeOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${webUrl}/api/web-bridge-preflight`);
    return response.ok;
  } catch {
    return false;
  }
}

function runSecretScan() {
  process.stdout.write(`\n[verify] secret-scan\n`);
  const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf-8" });
  if (tracked.status !== 0) {
    checks.push({ name: "secret-scan", status: "failed", detail: "git ls-files failed." });
    writeEvidence();
    process.exit(1);
  }
  const patterns = [
    /AIza[0-9A-Za-z_-]{20,}/,
    /GOCSPX-[0-9A-Za-z_-]{10,}/,
    /1\/\/[0-9A-Za-z_-]{20,}/,
    /\b[0-9a-f]{32,}\b/i,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/i,
  ];
  const hits: string[] = [];
  for (const file of tracked.stdout.split("\0").filter(Boolean)) {
    if (shouldSkipSecretScan(file)) continue;
    const target = join(repoRoot, file);
    if (!existsSync(target)) continue;
    const content = readFileSync(target, "utf-8");
    if (patterns.some((pattern) => pattern.test(content))) hits.push(file);
  }
  if (hits.length) {
    checks.push({ name: "secret-scan", status: "failed", detail: `Potential secret in tracked file(s): ${hits.join(", ")}` });
    writeEvidence();
    process.stdout.write(renderSummary());
    process.exit(1);
  }
  checks.push({ name: "secret-scan", status: "ready", detail: "No tracked secret patterns found." });
}

function writeEvidence() {
  const failed = checks.filter((check) => check.status === "failed").length;
  const payload = {
    mode: "arcigy-jarvis-production-verification",
    status: failed ? "failed" : "ready",
    generatedAt: new Date().toISOString(),
    webUrl,
    secretPolicy: "Secret-safe: command output is streamed through redactSensitiveText and this artifact stores only redacted check details.",
    evidencePath,
    checks: checks.map((check) => ({
      name: check.name,
      status: check.status,
      detail: redactSensitiveText(check.detail),
    })),
  };
  mkdirSync(join(repoRoot, "generated", "production-verification"), { recursive: true });
  writeFileSync(evidencePath, `${redactSensitiveText(JSON.stringify(payload, null, 2))}\n`, "utf-8");
}

function validateEvidenceArtifact() {
  process.stdout.write(`\n[verify] evidence-artifact\n`);
  try {
    const raw = readFileSync(evidencePath, "utf-8");
    if (hasSecretPattern(raw)) {
      checks.push({ name: "evidence-artifact", status: "failed", detail: "Evidence artifact contains a sensitive pattern." });
      writeEvidence();
      process.stdout.write(renderSummary());
      process.exit(1);
    }
    const evidence = JSON.parse(raw) as {
      mode?: unknown;
      status?: unknown;
      generatedAt?: unknown;
      checks?: Array<{ name?: unknown; status?: unknown; detail?: unknown }>;
    };
    const expectedChecks = checks.map((check) => check.name);
    const evidenceChecks = Array.isArray(evidence.checks) ? evidence.checks : [];
    const evidenceNames = new Set(evidenceChecks.map((check) => String(check.name ?? "")));
    const missingChecks = expectedChecks.filter((name) => !evidenceNames.has(name));
    const invalid =
      evidence.mode !== "arcigy-jarvis-production-verification" ||
      evidence.status !== "ready" ||
      typeof evidence.generatedAt !== "string" ||
      missingChecks.length > 0 ||
      evidenceChecks.some((check) => check.status !== "ready" || typeof check.detail !== "string");
    if (invalid) {
      checks.push({
        name: "evidence-artifact",
        status: "failed",
        detail: missingChecks.length ? `Evidence artifact is missing check(s): ${missingChecks.join(", ")}.` : "Evidence artifact shape is invalid.",
      });
      writeEvidence();
      process.stdout.write(renderSummary());
      process.exit(1);
    }
    checks.push({ name: "evidence-artifact", status: "ready", detail: "Latest production verification evidence is valid and secret-safe." });
  } catch (error) {
    checks.push({ name: "evidence-artifact", status: "failed", detail: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    writeEvidence();
    process.stdout.write(renderSummary());
    process.exit(1);
  }
}

function hasSecretPattern(value: string): boolean {
  return [
    /AIza[0-9A-Za-z_-]{20,}/,
    /GOCSPX-[0-9A-Za-z_-]{10,}/,
    /1\/\/[0-9A-Za-z_-]{20,}/,
    /(postgres(?:ql)?|redis):\/\/[^:\s/@]+:[^@\s]+@/i,
    /\b[0-9a-f]{32,}\b/i,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/i,
  ].some((pattern) => pattern.test(value));
}

function shouldSkipSecretScan(file: string): boolean {
  return (
    file.startsWith("node_modules/") ||
    file.startsWith("generated/") ||
    file === ".env" ||
    file === ".env.local" ||
    /\.(png|jpg|jpeg|webp|gif|ico|docx|pdf|sqlite)$/i.test(file)
  );
}

function renderSummary(): string {
  const ready = checks.filter((check) => check.status === "ready").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  return [
    "",
    "Arcigy Jarvis production verification",
    `Status: ${failed ? "failed" : "ready"} (${ready} ready, ${failed} failed)`,
    ...checks.map((check) => `[${check.status.toUpperCase()}] ${check.name}: ${redactSensitiveText(check.detail)}`),
    "",
  ].join("\n");
}

function stopWebBridge() {
  const child = webChild as ChildProcess | null;
  if (child && !child.killed && child.exitCode === null) child.kill();
}
