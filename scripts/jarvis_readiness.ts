#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../src/automation-system/env.ts";
import { buildProductionReadinessReport, type ProductionReadinessReport } from "../src/automation-system/production-readiness.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const live = args.has("--live") || args.has("--live-integrations");
const skipEnvFile = args.has("--no-env-file");

if (args.has("--help") || args.has("-h")) {
  process.stdout.write(
    [
      "Arcigy Jarvis readiness",
      "",
      "Usage:",
      "  npm run readiness",
      "  npm run readiness -- --live",
      "  npm run readiness -- --json",
      "",
      "Options:",
      "  --json              Print the full secret-safe JSON report.",
      "  --live              Include read-only live integration probes.",
      "  --live-integrations Alias for --live.",
      "  --no-env-file       Do not load .env.local or .env.",
      "",
      "Exit code is 0 only when the readiness status is ready.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

if (!skipEnvFile) loadLocalEnv(repoRoot);

const report = await buildProductionReadinessReport({ live });

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(renderReadiness(report));
}

process.exitCode = report.status === "ready" ? 0 : 1;

function renderReadiness(report: ProductionReadinessReport): string {
  return [
    "Arcigy Jarvis readiness",
    `Status: ${report.status}`,
    report.summary,
    "",
    `Integrations: ${report.integrations.ready}/${report.integrations.total}`,
    `MCP tools: ${report.mcp.toolCount}`,
    `Approval locks: ${report.mcp.approvalRequired.length}`,
    "",
    report.blockers.length ? "Blockers:" : "Blockers: none",
    ...report.blockers.map((blocker) => `- [${blocker.severity}] ${blocker.key}: ${blocker.message}`),
    "",
    "Next actions:",
    ...report.nextActions.map((action) => `- ${action}`),
    "",
    "Fix guide:",
    ...report.fixGuide.map((step) =>
      [`- ${step.title}`, `  Env: ${step.envKeys.join(", ") || "none"}`, `  Validate: ${step.validationCommand}`, `  ${step.detail}`].join("\n")
    ),
    "",
  ].join("\n");
}
