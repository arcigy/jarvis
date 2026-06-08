#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";
import { getIntegrationHealth, loadLocalEnv } from "../src/automation-system/env.ts";
import { runIntegrationDiagnostics } from "../src/automation-system/diagnostics.ts";
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
const skipWebBridge = args.has("--skip-web-bridge");
const skipLocalDb = args.has("--skip-local-db");
const keepDoctorArtifacts = args.has("--keep-doctor-artifacts");
const liveIntegrations = args.has("--live-integrations");
const doctorArtifacts: string[] = [];

await main();

async function main() {
  if (!skipEnvFile) loadLocalEnv(repoRoot);

  const checks: DoctorCheck[] = [];
  checks.push(checkRequiredFiles());
  checks.push(checkMcpToolRegistry());
  checks.push(checkRuntimeEnv());
  if (!skipLocalDb) checks.push(checkLocalDbSmoke());
  if (!skipContractGeneration) checks.push(checkContractGeneration());
  if (!skipWebBridge) checks.push(await checkWebBridgeSmoke());
  if (liveIntegrations) checks.push(await checkLiveIntegrationDiagnostics());

  const failed = checks.filter((check) => check.status === "failed");
  const warnings = checks.filter((check) => check.status === "warning");
  const summary: DoctorSummary = {
    ok: failed.length === 0,
    ready: checks.filter((check) => check.status === "ready").length,
    warnings: warnings.length,
    failed: failed.length,
    checks,
  };

  if (summary.ok && !keepDoctorArtifacts) {
    cleanupDoctorArtifacts();
  }

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderHumanSummary(summary));
  }

  process.exitCode = summary.ok ? 0 : 1;
}

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
    "scripts/start_web_tunnel.ts",
    "scripts/jarvis_readiness.ts",
    "scripts/jarvis_ui_smoke.cjs",
    "scripts/verify_production.ts",
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
  const approvalToolSet = new Set<string>(approvalTools);
  const requiredApprovalTools = [
    "arcigy.generate_contract_documents",
    "arcigy.approve_prepared_outreach_reply",
    "arcigy.send_approved_outreach_reply",
    "arcigy.append_leads_to_google_sheet",
  ];
  const missingApproval = requiredApprovalTools.filter((name) => !approvalToolSet.has(name));
  const failed = duplicates.length > 0 || missingApproval.length > 0 || tools.length < 21;

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
  const missing = health.filter((item) => !item.configured).map((item) => ({ key: item.key, missing: item.missing, requiredForProduction: item.requiredForProduction }));
  const blockingMissing = missing.filter((item) => item.requiredForProduction);
  const advisoryMissing = missing.filter((item) => !item.requiredForProduction);
  const status: CheckStatus = blockingMissing.length ? (strictEnv ? "failed" : "warning") : advisoryMissing.length ? "warning" : "ready";
  return {
    key: "runtimeEnv",
    status,
    message: blockingMissing.length
      ? `${blockingMissing.length} required integration group(s) are missing runtime env. Run with --strict-env to fail on this.`
      : advisoryMissing.length
        ? `${health.length - advisoryMissing.length}/${health.length} production integration group(s) are configured; ${advisoryMissing.length} non-blocking advisory remains.`
        : `${health.length} integration group(s) have runtime env configured.`,
    details: {
      configured: health.filter((item) => item.configured).map((item) => item.key),
      missing,
      advisoryMissing,
    },
  };
}

async function checkLiveIntegrationDiagnostics(): Promise<DoctorCheck> {
  const dbPath = safeGeneratedPath(`doctor-live-diagnostics-${Date.now()}-${process.pid}.db`);
  const diagnostics = await runIntegrationDiagnostics({ live: true, dbPath });
  const notReady = diagnostics.checks.filter((check) => check.status !== "ready");
  const blockingNotReady = notReady.filter((check) => !["redis", "serper"].includes(check.key));
  const advisoryNotReady = notReady.filter((check) => ["redis", "serper"].includes(check.key));
  return {
    key: "liveIntegrationDiagnostics",
    status: blockingNotReady.length ? "failed" : "ready",
    message: blockingNotReady.length
      ? `${blockingNotReady.length} live integration check(s) are not ready.`
      : advisoryNotReady.length
        ? `${diagnostics.checks.length - advisoryNotReady.length}/${diagnostics.checks.length} live integration check(s) passed; optional providers have non-blocking advisories.`
        : `${diagnostics.checks.length} live integration check(s) passed.`,
    details: {
      live: diagnostics.live,
      checkedAt: diagnostics.checkedAt,
      dbPath,
      notReady,
      advisoryNotReady,
      ready: diagnostics.checks.filter((check) => check.status === "ready").map((check) => check.key),
    },
  };
}

function checkLocalDbSmoke(): DoctorCheck {
  const dbPath = safeGeneratedPath(`doctor-local-db-${Date.now()}-${process.pid}.db`);
  const python = process.env.JARVIS_PYTHON || "python";
  const init = runPythonTool(python, ["scripts/jarvis_local_db.py", "init", "--db", dbPath]);
  if (init.status !== 0) return failedPythonCheck("localDbSmoke", "Local DB init failed.", init);

  const ingest = runPythonTool(python, [
    "scripts/jarvis_local_db.py",
    "ingest-message",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      fromEmail: "doctor-client@example.com",
      displayName: "Doctor Client",
      companyName: "Doctor Client s. r. o.",
      subject: "Report request",
      text: "Please prepare a new weekly cold outreach report.",
      source: "doctor",
    }),
  ]);
  if (ingest.status !== 0) return failedPythonCheck("localDbSmoke", "Local DB message ingest failed.", ingest);

  const identify = runPythonTool(python, ["scripts/jarvis_local_db.py", "identify", "--db", dbPath, "--email", "doctor-client@example.com"]);
  if (identify.status !== 0) return failedPythonCheck("localDbSmoke", "Local DB identity lookup failed.", identify);

  const since = "2026-06-01T00:00:00Z";
  const until = "2026-06-08T00:00:00Z";
  const coldEvents = [
    ["lead1@example.com", "sent"],
    ["lead1@example.com", "opened"],
    ["lead1@example.com", "replied"],
    ["lead1@example.com", "positive_reply"],
    ["lead1@example.com", "prepared_reply"],
    ["lead2@example.com", "sent"],
  ];
  for (const [leadEmail, eventType] of coldEvents) {
    const event = runPythonTool(python, [
      "scripts/jarvis_local_db.py",
      "add-cold-event",
      "--db",
      dbPath,
      "--payload",
      JSON.stringify({ leadEmail, eventType, occurredAt: "2026-06-03T12:00:00Z", campaignName: "Doctor" }),
    ]);
    if (event.status !== 0) return failedPythonCheck("localDbSmoke", `Local DB cold event failed: ${eventType}.`, event);
  }

  const brief = runPythonTool(python, [
    "scripts/jarvis_local_db.py",
    "cold-brief",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ since, until, periodLabel: "doctor period" }),
  ]);
  if (brief.status !== 0) return failedPythonCheck("localDbSmoke", "Local DB cold outreach brief failed.", brief);

  const ingestBody = parseJson(ingest.stdout);
  const identifyBody = parseJson(identify.stdout);
  const briefBody = parseJson(brief.stdout);
  const ready =
    Boolean(ingestBody.jarvisAlert) &&
    identifyBody.person?.primaryEmail === "doctor-client@example.com" &&
    Array.isArray(identifyBody.openNeedSignals) &&
    identifyBody.openNeedSignals.length === 1 &&
    briefBody.metrics?.contacted === 2 &&
    briefBody.metrics?.positiveReplies === 1 &&
    briefBody.metrics?.pendingApprovalCount === 1;

  return {
    key: "localDbSmoke",
    status: ready ? "ready" : "failed",
    message: ready
      ? "Local client memory, need signals, identity lookup, and cold outreach summary work."
      : "Local DB smoke returned unexpected data.",
    details: {
      dbPath,
      hasJarvisAlert: Boolean(ingestBody.jarvisAlert),
      identityEmail: identifyBody.person?.primaryEmail,
      openNeedSignals: identifyBody.openNeedSignals?.length ?? 0,
      coldMetrics: briefBody.metrics,
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

function runPythonTool(python: string, args: string[]) {
  return spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
}

function failedPythonCheck(key: string, message: string, result: ReturnType<typeof runPythonTool>): DoctorCheck {
  return {
    key,
    status: "failed",
    message,
    details: { status: result.status, stderr: trimOutput(result.stderr), stdout: trimOutput(result.stdout) },
  };
}

function parseJson(value: string): any {
  return JSON.parse(value) as any;
}

async function checkWebBridgeSmoke(): Promise<DoctorCheck> {
  const port = await getFreePort();
  const doctorToken = "doctor-web-token-for-local-smoke-only";
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(process.execPath, ["src/server/local-api-server.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JARVIS_WEB_HOST: "127.0.0.1",
      JARVIS_WEB_PORT: String(port),
      JARVIS_WEB_TOKEN: doctorToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  try {
    const origin = `http://127.0.0.1:${port}`;
    const preflight = await fetchJsonWithRetry(`${origin}/api/web-bridge-preflight`);
    const manifest = await fetchJsonWithRetry(`${origin}/api/mcp`);
    const indexHtml = await fetchTextWithRetry(`${origin}/index.html`);
    const stylesCss = await fetchTextWithRetry(`${origin}/styles.css`);
    const rendererJs = await fetchTextWithRetry(`${origin}/renderer.js`);
    const deniedExternalManifestStatus = await fetchStatus(`${origin}/.well-known/arcigy-jarvis.json`, {
      "x-forwarded-host": "doctor.example.ngrok-free.app",
      "x-forwarded-proto": "https",
    });
    const allowedExternalManifest = await fetchJsonWithRetry(`${origin}/.well-known/arcigy-jarvis.json`, {
      authorization: `Bearer ${doctorToken}`,
      "x-forwarded-host": "doctor.example.ngrok-free.app",
      "x-forwarded-proto": "https",
    });
    const mcpBrief = await postJson(`${origin}/api/mcp/arcigy.get_cold_outreach_brief`, {
      periodLabel: "doctor period",
      contacted: 2,
      opened: 1,
      replied: 1,
      positiveReplies: 1,
      preparedPositiveReplyCount: 1,
      pendingApprovalCount: 1,
    });
    const contractIntake = JSON.parse(readFileSync(join(repoRoot, "docs/contracts/examples/sample-intake.json"), "utf-8")) as unknown;
    const webContractOutputDir = safeGeneratedPath(`doctor-web-contracts-${Date.now()}-${process.pid}`);
    const deniedContractStatus = await postJsonStatus(`${origin}/api/mcp/arcigy.generate_contract_documents`, {
      intake: contractIntake,
      outputDir: webContractOutputDir,
    });
    const approvedContract = await postJson(`${origin}/api/mcp/arcigy.generate_contract_documents`, {
      approval: { approved: true },
      intake: contractIntake,
      outputDir: webContractOutputDir,
    });
    const remoteMcpSmoke = await fetchJsonWithRetry(`${origin}/api/remote-mcp-smoke`);
    const expectedToolCount = listJarvisMcpTools().length;
    const mcpToolCount = Number((preflight as { mcpToolCount?: unknown }).mcpToolCount);
    const manifestToolCount = Array.isArray((manifest as { tools?: unknown }).tools) ? (manifest as { tools: unknown[] }).tools.length : 0;
    const uiAssetsReady =
      indexHtml.includes("Arcigy Jarvis") &&
      indexHtml.includes("checkWebBridge") &&
      stylesCss.includes(".orb") &&
      rendererJs.includes("arcigyApi") &&
      rendererJs.includes("webBridgePreflight") &&
      rendererJs.includes("remoteMcpSmoke");
    const commandDeckReady =
      indexHtml.includes("commandDeck") &&
      indexHtml.includes("readyIntegrations") &&
      stylesCss.includes(".commandDeck") &&
      stylesCss.includes(".scanFrame") &&
      rendererJs.includes("renderCommandDeck") &&
      rendererJs.includes("buildCommandTimeline");
    const mcpToolCallReady = typeof (mcpBrief as { result?: unknown }).result === "string" && String((mcpBrief as { result: string }).result).includes("doctor period");
    const externalAuthReady =
      deniedExternalManifestStatus === 401 &&
      (allowedExternalManifest as { baseUrl?: unknown }).baseUrl === "https://doctor.example.ngrok-free.app" &&
      Array.isArray((allowedExternalManifest as { tools?: unknown }).tools) &&
      (allowedExternalManifest as { tools: unknown[] }).tools.length === expectedToolCount;
    const approvalGateReady =
      deniedContractStatus === 409 &&
      typeof (approvedContract as { result?: unknown }).result === "string" &&
      String((approvedContract as { result: string }).result).includes("generation-manifest.json") &&
      existsSync(join(webContractOutputDir, "generation-manifest.json"));
    const remoteMcpSmokeReady =
      (remoteMcpSmoke as { status?: unknown }).status === "ready" &&
      (remoteMcpSmoke as { expectedToolCount?: unknown }).expectedToolCount === expectedToolCount;
    const remoteMcpHandoffProofReady =
      Array.isArray((remoteMcpSmoke as { checks?: unknown }).checks) &&
      ((remoteMcpSmoke as { checks: Array<{ key?: unknown; status?: unknown }> }).checks ?? []).some(
        (check) => check.key === "pack-handoff-proof" && check.status === "ready"
      );
    const ready =
      mcpToolCount === expectedToolCount &&
      manifestToolCount === expectedToolCount &&
      uiAssetsReady &&
      commandDeckReady &&
      mcpToolCallReady &&
      externalAuthReady &&
      approvalGateReady &&
      remoteMcpSmokeReady &&
      remoteMcpHandoffProofReady;

    return {
      key: "webBridgeSmoke",
      status: ready ? "ready" : "failed",
      message: ready
        ? `Web bridge served UI assets, MCP manifest, remote smoke, and a tool call with ${expectedToolCount} tool(s).`
        : "Web bridge smoke returned unexpected UI, manifest, remote smoke, or tool call data.",
      details: {
        origin,
        mcpToolCount,
        manifestToolCount,
        expectedToolCount,
        uiAssetsReady,
        commandDeckReady,
        mcpToolCallReady,
        externalAuthReady,
        deniedExternalManifestStatus,
        approvalGateReady,
        remoteMcpSmokeReady,
        remoteMcpHandoffProofReady,
        deniedContractStatus,
        webContractOutputDir,
      },
    };
  } catch (error) {
    return {
      key: "webBridgeSmoke",
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      details: {
        stdout: trimOutput(stdout.join("")),
        stderr: trimOutput(stderr.join("")),
      },
    };
  } finally {
    await stopChild(child);
  }
}

async function fetchJsonWithRetry(url: string, headers?: Record<string, string>): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out fetching ${url}`);
}

async function fetchTextWithRetry(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out fetching ${url}`);
}

async function postJson(url: string, payload: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function postJsonStatus(url: string, payload: unknown): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.status;
}

async function fetchStatus(url: string, headers?: Record<string, string>): Promise<number> {
  const response = await fetch(url, { headers });
  return response.status;
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("Could not allocate a free local port."));
      });
    });
  });
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolveStop) => {
    if (child.killed || child.exitCode !== null) {
      resolveStop();
      return;
    }
    child.once("exit", () => resolveStop());
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 1500).unref();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function safeGeneratedPath(name: string): string {
  const generatedRoot = resolve(repoRoot, "generated");
  const target = resolve(generatedRoot, name);
  const normalizedRoot = generatedRoot.endsWith(sep) ? generatedRoot : `${generatedRoot}${sep}`;
  if (!target.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to write outside generated directory: ${target}`);
  }
  doctorArtifacts.push(target);
  return target;
}

function cleanupDoctorArtifacts() {
  for (const artifact of doctorArtifacts) {
    if (!isDoctorArtifact(artifact)) continue;
    rmSync(artifact, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function isDoctorArtifact(artifact: string): boolean {
  const generatedRoot = resolve(repoRoot, "generated");
  const target = resolve(artifact);
  const normalizedRoot = generatedRoot.endsWith(sep) ? generatedRoot : `${generatedRoot}${sep}`;
  if (!target.startsWith(normalizedRoot)) return false;
  return target.slice(normalizedRoot.length).startsWith("doctor-");
}

function trimOutput(value: string | null | undefined): string {
  return redactSensitiveText(String(value ?? "")).trim().slice(0, 2000);
}

function renderHumanSummary(summary: DoctorSummary): string {
  const lines = [
    "Arcigy Jarvis doctor",
    `Status: ${summary.ok ? "ready" : "failed"} (${summary.ready} ready, ${summary.warnings} warning, ${summary.failed} failed)`,
    "",
    ...summary.checks.flatMap(renderHumanCheck),
    "",
  ];
  return lines.join("\n");
}

function renderHumanCheck(check: DoctorCheck): string[] {
  const lines = [`${label(check.status)} ${check.key}: ${check.message}`];
  if (check.status === "ready") return lines;
  lines.push(...renderHumanCheckDetails(check));
  return lines;
}

function renderHumanCheckDetails(check: DoctorCheck): string[] {
  if (check.key === "runtimeEnv" && isRecord(check.details)) {
    const missing = Array.isArray(check.details.advisoryMissing) ? check.details.advisoryMissing : check.details.missing;
    return renderRuntimeEnvIssues(missing);
  }
  if (check.key === "liveIntegrationDiagnostics" && isRecord(check.details)) {
    const notReady = Array.isArray(check.details.advisoryNotReady) && check.details.advisoryNotReady.length ? check.details.advisoryNotReady : check.details.notReady;
    return renderDiagnosticIssues(notReady);
  }
  return [];
}

function renderRuntimeEnvIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = String(item.key ?? "runtimeEnv");
    const missing = Array.isArray(item.missing) ? item.missing.map(String).join(", ") : "configuration issue";
    return [`  - ${key}: ${missing}`, `    Next: ${runtimeEnvNextAction(key, missing)}`];
  });
}

function renderDiagnosticIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = String(item.key ?? "diagnostic");
    const message = String(item.message ?? "not ready");
    return [`  - ${key}: ${message}`, `    Next: ${runtimeEnvNextAction(key, message)}`];
  });
}

function runtimeEnvNextAction(key: string, message: string): string {
  const text = `${key} ${message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) return "Replace REDIS_URL with the real Redis password, then rerun npm run doctor -- --live-integrations.";
  if (text.includes("redis") && text.includes("rediss")) return "Change REDIS_URL to rediss:// if the provider requires TLS.";
  if (text.includes("serper") && text.includes("not enough credits")) return "Top up or replace at least one Serper API key.";
  return `Fix ${key} and rerun npm run doctor -- --live-integrations.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function label(status: CheckStatus): string {
  if (status === "ready") return "[OK]";
  if (status === "warning") return "[WARN]";
  return "[FAIL]";
}
