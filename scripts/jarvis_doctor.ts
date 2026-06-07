#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { getIntegrationHealth, loadLocalEnv } from "../src/automation-system/env.ts";
import { listJarvisMcpTools } from "../src/automation-system/mcp-tools.ts";

type CheckStatus = "ready" | "warning" | "failed";

type DoctorCheck = {
  key: string;
  status: CheckStatus;
  message: string;
  details?: unknown;
};

type DoctorSummary = {
  ok: boolean;
  ready: number;
  warnings: number;
  failed: number;
  checks: DoctorCheck[];
};

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const strictEnv = args.has("--strict-env");
const skipEnvFile = args.has("--no-env-file");
const skipContractGeneration = args.has("--skip-contract-generation");

if (!skipEnvFile) loadLocalEnv(repoRoot);

const checks: DoctorCheck[] = [];
checks.push(checkRequiredFiles());
checks.push(checkMcpToolRegistry());
checks.push(checkRuntimeEnv());
if (!skipContractGeneration) checks.push(checkContractGeneration());

const failed = checks.filter((check) => check.status === "failed");
const warnings = checks.filter((check) => check.status === "warning");
const summary: DoctorSummary = {
  ok: failed.length === 0,
  ready: checks.filter((check) => check.status === "ready").length,
  warnings: warnings.length,
  failed: failed.length,
  checks,
};

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  process.stdout.write(renderHumanSummary(summary));
}

process.exitCode = summary.ok ? 0 : 1;

function checkRequiredFiles(): DoctorCheck {
  const requiredFiles = [
    "src/desktop/index.html",
    "src/desktop/main.cjs",
    "src/server/local-api-server.ts",
    "src/automation-system/mcp-server.ts",
    "docs/contracts/contract-intake.schema.json",
    "docs/contracts/examples/sample-intake.json",
    "docs/contracts/templates/ramcova-zmluva-univerzalna.docx",
    "docs/contracts/templates/projektova-priloha-univerzalna.docx",
    "docs/contracts/templates/doplnkova-priloha-univerzalna.docx",
    "scripts/generate_contract_documents.py",
    "scripts/jarvis_local_db.py",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));
  return {
    key: "requiredFiles",
    status: missing.length ? "failed" : "ready",
    message: missing.length ? `Missing required files: ${missing.join(", ")}` : `${requiredFiles.length} required files are present.`,
    details: { missing },
  };
}

function checkMcpToolRegistry(): DoctorCheck {
  const tools = listJarvisMcpTools();
  const names = tools.map((tool) => tool.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const approvalTools = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const requiredApprovalTools = ["arcigy.generate_contract_documents", "arcigy.append_leads_to_google_sheet"];
  const missingApproval = requiredApprovalTools.filter((name) => !approvalTools.includes(name));
  const failed = duplicates.length > 0 || missingApproval.length > 0 || tools.length < 19;

  return {
    key: "mcpToolRegistry",
    status: failed ? "failed" : "ready",
    message: failed
      ? "MCP tool registry is not production safe."
      : `${tools.length} MCP tools registered; ${approvalTools.length} require explicit approval.`,
    details: {
      toolCount: tools.length,
      duplicates,
      approvalTools,
      missingApproval,
    },
  };
}

function checkRuntimeEnv(): DoctorCheck {
  const health = getIntegrationHealth();
  const missing = health.filter((item) => !item.configured).map((item) => ({ key: item.key, missing: item.missing }));
  const status: CheckStatus = missing.length ? (strictEnv ? "failed" : "warning") : "ready";
  return {
    key: "runtimeEnv",
    status,
    message: missing.length
      ? `${missing.length} integration group(s) are missing runtime env. Run with --strict-env to fail on this.`
      : `${health.length} integration group(s) have runtime env configured.`,
    details: {
      configured: health.filter((item) => item.configured).map((item) => item.key),
      missing,
    },
  };
}

function checkContractGeneration(): DoctorCheck {
  const outputDir = safeGeneratedPath(`doctor-contracts-${Date.now()}-${process.pid}`);
  mkdirSync(outputDir, { recursive: true });
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(
    python,
    [
      "scripts/generate_contract_documents.py",
      "--input",
      "docs/contracts/examples/sample-intake.json",
      "--output-dir",
      outputDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    }
  );

  if (result.status !== 0) {
    return {
      key: "contractGeneration",
      status: "failed",
      message: "Sample contract generation failed.",
      details: { status: result.status, stderr: trimOutput(result.stderr), stdout: trimOutput(result.stdout) },
    };
  }

  const manifestPath = join(outputDir, "generation-manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      key: "contractGeneration",
      status: "failed",
      message: "Sample contract generation did not create generation-manifest.json.",
      details: { outputDir },
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { generatedFiles?: string[] };
  const generatedFiles = manifest.generatedFiles ?? [];
  const missingFiles = generatedFiles.filter((file) => !existsSync(file));
  return {
    key: "contractGeneration",
    status: generatedFiles.length >= 2 && missingFiles.length === 0 ? "ready" : "failed",
    message:
      generatedFiles.length >= 2 && missingFiles.length === 0
        ? `Sample contract generation produced ${generatedFiles.length} DOCX file(s).`
        : "Sample contract generation manifest is incomplete.",
    details: { outputDir, generatedFiles: generatedFiles.length, missingFiles },
  };
}

function safeGeneratedPath(name: string): string {
  const generatedRoot = resolve(repoRoot, "generated");
  const target = resolve(generatedRoot, name);
  const normalizedRoot = generatedRoot.endsWith(sep) ? generatedRoot : `${generatedRoot}${sep}`;
  if (!target.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to write outside generated directory: ${target}`);
  }
  return target;
}

function trimOutput(value: string | null | undefined): string {
  return String(value ?? "").trim().slice(0, 2000);
}

function renderHumanSummary(summary: DoctorSummary): string {
  const lines = [
    "Arcigy Jarvis doctor",
    `Status: ${summary.ok ? "ready" : "failed"} (${summary.ready} ready, ${summary.warnings} warning, ${summary.failed} failed)`,
    "",
    ...summary.checks.map((check) => `${label(check.status)} ${check.key}: ${check.message}`),
    "",
  ];
  return lines.join("\n");
}

function label(status: CheckStatus): string {
  if (status === "ready") return "[OK]";
  if (status === "warning") return "[WARN]";
  return "[FAIL]";
}
