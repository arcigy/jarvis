#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { getEnv, loadLocalEnv } from "../src/automation-system/env.ts";
import { runRemoteMcpSmoke, type RemoteMcpSmokeReport } from "../src/automation-system/remote-mcp-smoke.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const skipEnvFile = args.includes("--no-env-file");

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Arcigy Jarvis remote MCP smoke",
      "",
      "Usage:",
      "  npm run remote:mcp:smoke",
      "  npm run remote:mcp:smoke -- --url https://example.ngrok-free.app",
      "  npm run remote:mcp:smoke -- --token-env JARVIS_WEB_TOKEN",
      "  npm run remote:mcp:smoke -- --json",
      "",
      "Options:",
      "  --url <url>          Base URL to test. Defaults to http://127.0.0.1:8765.",
      "  --token <token>      Bearer token for protected external URLs. Never printed.",
      "  --token-env <name>   Env var containing the bearer token. Defaults to JARVIS_WEB_TOKEN, then API_SECRET_KEY.",
      "  --json               Print the full secret-safe JSON report.",
      "  --no-env-file        Do not load .env.local or .env.",
      "",
      "Exit code is 0 only when remote MCP smoke status is ready.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

if (!skipEnvFile) loadLocalEnv(repoRoot);

const baseUrl = getArg("url", process.env.JARVIS_REMOTE_MCP_URL || process.env.JARVIS_WEB_URL || "http://127.0.0.1:8765");
const tokenEnv = getArg("token-env", "");
const bearerToken = getArg("token", "") || (tokenEnv ? getEnv(process.env, tokenEnv) : getEnv(process.env, "JARVIS_WEB_TOKEN") || getEnv(process.env, "API_SECRET_KEY")) || undefined;
const report = await runRemoteMcpSmoke({ baseUrl, bearerToken });

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(renderSmoke(report));
}

process.exitCode = report.status === "ready" ? 0 : 1;

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function renderSmoke(report: RemoteMcpSmokeReport): string {
  return [
    "Arcigy Jarvis remote MCP smoke",
    `Status: ${report.status}`,
    report.summary,
    "",
    `Base URL: ${report.baseUrl}`,
    `Expected tools: ${report.expectedToolCount}`,
    "Token value returned: no",
    "",
    "Checks:",
    ...report.checks.map((check) => `- [${check.status}] ${check.key}: ${check.message}`),
    "",
  ].join("\n");
}
