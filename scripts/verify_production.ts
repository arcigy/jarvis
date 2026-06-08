#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const webUrl = process.env.JARVIS_VERIFY_WEB_URL || "http://127.0.0.1:8765";
const checks: Array<{ name: string; status: "ready" | "failed"; detail: string }> = [];
let webChild: ChildProcess | null = null;

try {
  await main();
} finally {
  stopWebBridge();
}

async function main() {
  runNpm("typecheck", ["run", "typecheck"]);
  runNpm("tests", ["test"]);
  await ensureWebBridge();
  runNpm("doctor-live", ["run", "doctor", "--", "--live-integrations"]);
  runNpm("remote-mcp-smoke", ["run", "remote:mcp:smoke", "--", "--url", webUrl, "--json"]);
  runNpm("ui-smoke", ["run", "ui:smoke"], {
    JARVIS_UI_SMOKE_URL: `${webUrl}/index.html`,
    JARVIS_UI_SMOKE_OUT: "generated/jarvis-ui-smoke.png",
  });
  runSecretScan();
  process.stdout.write(renderSummary());
}

function runCommand(name: string, command: string, args: string[], extraEnv: Record<string, string> = {}) {
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
    process.stdout.write(renderSummary());
    process.exit(result.status ?? 1);
  }
  checks.push({ name, status: "ready", detail: "OK" });
}

function runNpm(name: string, args: string[], extraEnv: Record<string, string> = {}) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    runCommand(name, process.execPath, [npmExecPath, ...args], extraEnv);
    return;
  }
  runCommand(name, process.platform === "win32" ? "npm.cmd" : "npm", args, extraEnv);
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
    process.stdout.write(renderSummary());
    process.exit(1);
  }
  checks.push({ name: "secret-scan", status: "ready", detail: "No tracked secret patterns found." });
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
