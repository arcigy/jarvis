import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../automation-system/ai-safety.ts";
import { draftContractIntake } from "../automation-system/contract-intake-draft.ts";
import { runIntegrationDiagnostics } from "../automation-system/diagnostics.ts";
import { getIntegrationHealth, loadLocalEnv } from "../automation-system/env.ts";
import { buildClientReplyPrompt, buildPositiveOutreachReplyPrompt, generateGeminiText } from "../automation-system/gemini.ts";
import { defaultGmailBriefingQuery, defaultGmailSyncQuery, listConfiguredGmailAccounts, listRecentGmailMessageEvents, sendGmailTextMessage } from "../automation-system/gmail.ts";
import { containsWakeWord, extractCommandAfterWakeWord, type JarvisVoiceSession } from "../automation-system/jarvis-voice.ts";
import { appendRowsToGoogleSheet, discoverLeads, searchGooglePlaces, searchSerper } from "../automation-system/lead-discovery.ts";
import { buildContractGenerationCommand, getColdOutreachMcpAnswer, listJarvisMcpTools, localStateWriteToolNames } from "../automation-system/mcp-tools.ts";
import { buildOperatorBriefing } from "../automation-system/operator-briefing.ts";
import { buildProductionReadinessReport } from "../automation-system/production-readiness.ts";
import { getProductionVerificationEvidence } from "../automation-system/production-verification-evidence.ts";
import { buildRemoteMcpOpenApiDocument } from "../automation-system/remote-mcp-openapi.ts";
import { buildRemoteMcpConnectionPack } from "../automation-system/remote-mcp-pack.ts";
import { runRemoteMcpSmoke } from "../automation-system/remote-mcp-smoke.ts";
import { getSmartleadCampaignStatus, getSmartleadOutreachBrief } from "../automation-system/smartlead.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const desktopRoot = join(repoRoot, "src", "desktop");
const defaultDbPath = join(repoRoot, "data", "jarvis-local.db");
const defaultMaxJsonBytes = 1_000_000;
const defaultAuthFailureLimit = 20;
const defaultAuthFailureWindowMs = 60_000;
let webTunnelProcess: ChildProcess | null = null;
const authFailureBuckets = new Map<string, { count: number; resetAt: number }>();

loadLocalEnv(repoRoot);

export type LocalApiServerOptions = {
  host?: string;
  port?: number;
};

export function createLocalApiServer() {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      writeJson(response, getErrorStatus(error), {
        error: safeErrorMessage(error),
      });
    }
  });
}

async function routeRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const protectedBridgePath = isProtectedBridgePath(url.pathname);

  if (request.method === "OPTIONS" && protectedBridgePath) {
    writeNoContent(response, 204);
    return;
  }

  if (protectedBridgePath && !isApiAuthorized(request)) {
    const throttle = registerAuthFailure(request);
    if (throttle.throttled) {
      writeJson(
        response,
        429,
        { error: "Too many failed Jarvis web API auth attempts. Retry after the current window resets." },
        { "retry-after": String(throttle.retryAfterSeconds) }
      );
      return;
    }
    writeJson(response, 401, {
      error: "Jarvis web API is locked. Provide a bearer token using JARVIS_WEB_TOKEN or API_SECRET_KEY.",
    });
    return;
  }

  if (protectedBridgePath) clearAuthFailures(request);

  if (request.method === "GET" && (url.pathname === "/api/mcp" || url.pathname === "/.well-known/arcigy-jarvis.json")) {
    writeJson(response, 200, buildWebBridgeManifest(request));
    return;
  }

  if (request.method === "GET" && (url.pathname === "/.well-known/ai-plugin.json" || url.pathname === "/ai-plugin.json")) {
    writeJson(response, 200, buildRemoteActionManifest(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/openapi.json") {
    writeJson(response, 200, buildRemoteMcpOpenApiDocument(getRequestOrigin(request)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/web-bridge-preflight") {
    writeJson(response, 200, buildWebBridgePreflight(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/secure-tunnel-status") {
    writeJson(response, 200, getSecureTunnelStatus());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/start-secure-tunnel") {
    writeJson(response, 200, startSecureTunnelFromWeb());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stop-secure-tunnel") {
    writeJson(response, 200, stopSecureTunnelFromWeb());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/remote-mcp-pack") {
    writeJson(response, 200, await getRemoteMcpPack(request, url));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/remote-mcp-smoke") {
    writeJson(response, 200, await getRemoteMcpSmoke(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/system-health") {
    writeJson(response, 200, {
      integrations: getIntegrationHealth(),
      dbPath: defaultDbPath,
      mode: "web",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run-diagnostics") {
    const payload = await readJson(request);
    writeJson(response, 200, await runIntegrationDiagnostics({ live: payload.live === true, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/production-readiness") {
    const payload = await readJson(request);
    writeJson(response, 200, await buildProductionReadinessReport({ live: payload.live === true, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/production-verification-evidence") {
    writeJson(response, 200, getProductionVerificationEvidence(repoRoot));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/operator-briefing") {
    const payload = await readJson(request);
    writeJson(response, 200, await getOperatorBriefing(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jarvis/voice-event") {
    const payload = await readJson(request);
    writeJson(response, 200, await handleWebVoiceEvent(payload, request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cold-outreach-brief") {
    const payload = await readJson(request);
    writeJson(response, 200, await getColdOutreachBriefSummary(payload, payload.live === true));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/prepared-outreach-replies") {
    const payload = await readJson(request);
    writeJson(response, 200, runDbTool("list-prepared-replies", payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/approval-queue") {
    const payload = await readJson(request);
    writeJson(response, 200, runDbTool("list-approval-queue", payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/approve-prepared-outreach-reply") {
    const payload = await readJson(request);
    if ((payload.approval as { approved?: unknown } | undefined)?.approved !== true) {
      writeJson(response, 409, { error: 'Prepared outreach reply approval requires explicit {"approval":{"approved":true}}.' });
      return;
    }
    writeJson(response, 200, runDbTool("approve-prepared-reply", payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/identify-email") {
    const payload = await readJson(request);
    writeJson(response, 200, identifyEmail(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ingest-client-message") {
    const payload = await readJson(request);
    writeJson(response, 200, ingestClientMessage(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/client-need-alerts") {
    const payload = await readJson(request);
    writeJson(response, 200, getClientNeedAlerts(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/update-client-need-status") {
    const payload = await readJson(request);
    const approvalError = getApprovalError("arcigy.update_client_need_status", payload);
    if (approvalError) {
      writeJson(response, 409, { error: approvalError });
      return;
    }
    const result = runDbTool("update-need-status", payload);
    addAuditEvent("arcigy.update_client_need_status", "updated", payload, result, true);
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audit-events") {
    const payload = await readJson(request);
    writeJson(response, 200, runDbTool("list-audit-events", payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/local-memory-snapshot") {
    const payload = await readJson(request);
    writeJson(response, 200, runDbTool("local-memory-snapshot", payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/export-local-memory-snapshot") {
    const payload = await readJson(request);
    const approvalError = getApprovalError("arcigy.export_local_memory_snapshot", payload);
    if (approvalError) {
      writeJson(response, 409, { error: approvalError });
      return;
    }
    const result = runDbTool("export-local-memory-snapshot", {
      ...payload,
      outputPath: resolveRepoPath(payload.outputPath, join(repoRoot, "generated", "local-memory", "local-memory-snapshot.json"), "outputPath"),
    });
    addAuditEvent("arcigy.export_local_memory_snapshot", "exported", payload, result, true);
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-ai-reply") {
    const payload = await readJson(request);
    const result = await generateGeminiText(buildClientReplyPrompt(toClientReplyDraftInput(payload)));
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-contracts") {
    const payload = await readJson(request);
    const approvalError = getApprovalError("arcigy.generate_contract_documents", payload);
    if (approvalError) {
      writeJson(response, 409, { error: approvalError });
      return;
    }
    const outputDir = resolveRepoPath(payload.outputDir, join(repoRoot, "generated", "contracts"), "outputDir");
    const intake = parseContractIntake(payload.intake);
    if (!intake || typeof intake !== "object") {
      writeJson(response, 400, { error: "Contract intake JSON is required." });
      return;
    }
    const result = runPython([
      "scripts/generate_contract_documents.py",
      "--payload",
      JSON.stringify(intake),
      "--output-dir",
      outputDir,
    ]);
    const manifestPath = join(outputDir, "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const responseBody = {
      outputDir,
      manifestPath,
      generatedFiles: manifest.generatedFiles,
      stdout: result.stdout,
    };
    addAuditEvent("arcigy.generate_contract_documents", "generated", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/draft-contract-intake") {
    const payload = await readJson(request);
    writeJson(
      response,
      200,
      await draftContractIntake({
        brief: String(payload.brief ?? ""),
        baseIntake: typeof payload.baseIntake === "object" && payload.baseIntake !== null ? (payload.baseIntake as Record<string, unknown>) : undefined,
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sync-gmail-recent-messages") {
    const payload = await readJson(request);
    writeJson(response, 200, await syncGmailRecentMessages(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/smartlead-campaign-status") {
    const payload = await readJson(request);
    writeJson(response, 200, await getSmartleadCampaignStatus({ campaignId: optionalString(payload.campaignId) }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/smartlead-outreach-brief") {
    const payload = await readJson(request);
    writeJson(response, 200, await getSmartleadOutreachBrief(toSmartleadOutreachBriefInput(payload)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/discover-leads") {
    const payload = await readJson(request);
    writeJson(
      response,
      200,
      await discoverLeads({
        query: String(payload.query ?? ""),
        placesQuery: optionalString(payload.placesQuery),
        maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/search-serper") {
    const payload = await readJson(request);
    writeJson(
      response,
      200,
      await searchSerper({
        query: String(payload.query ?? ""),
        num: typeof payload.num === "number" ? payload.num : undefined,
        gl: optionalString(payload.gl),
        hl: optionalString(payload.hl),
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/search-google-places") {
    const payload = await readJson(request);
    writeJson(
      response,
      200,
      await searchGooglePlaces({
        query: String(payload.query ?? ""),
        maxResultCount: typeof payload.maxResultCount === "number" ? payload.maxResultCount : undefined,
        languageCode: optionalString(payload.languageCode),
        regionCode: optionalString(payload.regionCode),
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/append-leads-to-google-sheet") {
    const payload = await readJson(request);
    const approvalError = getApprovalError("arcigy.append_leads_to_google_sheet", payload);
    if (approvalError) {
      writeJson(response, 409, { error: approvalError });
      return;
    }
    const result = await appendRowsToGoogleSheet({
        spreadsheetId: optionalString(payload.spreadsheetId),
        range: optionalString(payload.range),
        accountEnvKey: optionalString(payload.accountEnvKey),
        rows: (payload.rows ?? []) as Array<Array<string | number | boolean | null>>,
      });
    addAuditEvent("arcigy.append_leads_to_google_sheet", "appended", payload, result, true);
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/mcp/")) {
    await routeMcpTool(url.pathname.replace("/api/mcp/", ""), request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(url.pathname, response, request.method === "HEAD");
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

function isApiAuthorized(request: IncomingMessage): boolean {
  const token = getWebToken();
  if (!token) return isLocalRequest(request);
  if (isLocalRequest(request) && process.env.JARVIS_WEB_REQUIRE_AUTH !== "true") return true;
  return getBearerToken(request) === token;
}

function isProtectedBridgePath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/.well-known/arcigy-jarvis.json" || pathname === "/.well-known/ai-plugin.json" || pathname === "/ai-plugin.json";
}

function isLocalRequest(request: IncomingMessage): boolean {
  const host = getRequestHost(request);
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function getRequestHost(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || request.headers.host || "";
  return String(raw).split(":")[0].toLowerCase();
}

function getWebToken(): string | null {
  const value = (process.env.JARVIS_WEB_TOKEN || process.env.API_SECRET_KEY || "").trim();
  if (!value || value === "dummy") return null;
  return value;
}

function isStrongWebToken(value: string | null): boolean {
  return Boolean(value && value.length >= 32);
}

function getBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header);
  return match?.[1]?.trim() || null;
}

function registerAuthFailure(request: IncomingMessage): { throttled: boolean; retryAfterSeconds: number } {
  if (isLocalRequest(request)) return { throttled: false, retryAfterSeconds: 0 };
  const key = authFailureKey(request);
  const now = Date.now();
  const windowMs = getAuthFailureWindowMs();
  const resetAt = now + windowMs;
  const current = authFailureBuckets.get(key);
  const bucket = current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt };
  authFailureBuckets.set(key, bucket);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { throttled: bucket.count > getAuthFailureLimit(), retryAfterSeconds };
}

function clearAuthFailures(request: IncomingMessage) {
  authFailureBuckets.delete(authFailureKey(request));
}

function authFailureKey(request: IncomingMessage): string {
  const forwardedFor = getForwardedValue(request.headers["x-forwarded-for"]);
  const remote = forwardedFor || request.socket.remoteAddress || "unknown";
  return `${getRequestHost(request)}|${remote}`;
}

function getAuthFailureLimit(): number {
  const value = Number(process.env.JARVIS_AUTH_FAILURE_LIMIT ?? defaultAuthFailureLimit);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultAuthFailureLimit;
}

function getAuthFailureWindowMs(): number {
  const value = Number(process.env.JARVIS_AUTH_FAILURE_WINDOW_MS ?? defaultAuthFailureWindowMs);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultAuthFailureWindowMs;
}

function buildWebBridgeManifest(request: IncomingMessage) {
  const origin = getRequestOrigin(request);
  const mcpBaseUrl = `${origin}/api/mcp`;
  const localhostBypass = process.env.JARVIS_WEB_REQUIRE_AUTH !== "true";
  const tools = listJarvisMcpTools();
  const approvalRequired = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const localStateWrite = tools.filter((tool) => localStateWriteToolNames.has(tool.name)).map((tool) => tool.name);
  return {
    name: "Arcigy Jarvis local web bridge",
    version: "0.1.0",
    mode: "local-web-bridge",
    baseUrl: origin,
    auth: {
      type: "bearer",
      requiredForExternalHosts: true,
      header: "Authorization: Bearer <JARVIS_WEB_TOKEN>",
      localhostBypass,
    },
    endpoints: {
      ui: `${origin}/index.html`,
      systemHealth: `${origin}/api/system-health`,
      diagnostics: `${origin}/api/run-diagnostics`,
      productionReadiness: `${origin}/api/production-readiness`,
      productionVerificationEvidence: `${origin}/api/production-verification-evidence`,
      secureTunnelStatus: `${origin}/api/secure-tunnel-status`,
      actionManifest: `${origin}/.well-known/ai-plugin.json`,
      openApiSchema: `${origin}/api/openapi.json`,
      mcpTools: `${origin}/api/mcp`,
      mcpToolCallPattern: `${mcpBaseUrl}/{toolName}`,
    },
    approval: {
      requiredPayload: { approval: { approved: true } },
      appliesToToolsWithRequiresApproval: true,
    },
    toolPolicy: {
      approvalRequired,
      localStateWrite,
      readOnlyOrDraft: tools.filter((tool) => !tool.requiresApproval && !localStateWriteToolNames.has(tool.name)).map((tool) => tool.name),
    },
    tools: tools.map((tool) => ({
      ...tool,
      approval: tool.requiresApproval ? { required: true, field: "approval.approved" } : { required: false },
      localStateWrite: localStateWriteToolNames.has(tool.name),
      readOnlyOrDraft: !tool.requiresApproval && !localStateWriteToolNames.has(tool.name),
      method: "POST",
      url: `${mcpBaseUrl}/${tool.name}`,
    })),
  };
}

function buildRemoteActionManifest(request: IncomingMessage) {
  const origin = getRequestOrigin(request);
  return {
    schema_version: "v1",
    name_for_human: "Arcigy Jarvis",
    name_for_model: "arcigy_jarvis",
    description_for_human: "Secret-safe remote action manifest for Arcigy Jarvis MCP tools.",
    description_for_model:
      "Use Arcigy Jarvis for operator briefing, production readiness, contracts, cold outreach, client memory, Gemini drafts, and lead discovery. Always run remote smoke first and never call approval-required actions until the operator confirms the exact payload.",
    auth: {
      type: "user_http",
      authorization_type: "bearer",
      verification_tokens: {},
    },
    api: {
      type: "openapi",
      url: `${origin}/api/openapi.json`,
      is_user_authenticated: true,
    },
    contact_email: "hello@arcigy.com",
    legal_info_url: `${origin}/index.html`,
    "x-arcigy-policy": {
      tokenValueReturned: false,
      familyFriendly: true,
      approvalRule: "Never call approval-required actions until the operator confirms the exact payload.",
    },
  };
}

function buildWebBridgePreflight(request: IncomingMessage) {
  const origin = getRequestOrigin(request);
  const tools = listJarvisMcpTools();
  const riskyToolsRequiringApproval = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const token = getWebToken();
  const tokenConfigured = token !== null;
  const tokenStrong = isStrongWebToken(token);
  const localhostBypass = process.env.JARVIS_WEB_REQUIRE_AUTH !== "true";
  const warnings: string[] = [];
  if (!tokenConfigured) warnings.push("Set JARVIS_WEB_TOKEN before exposing the bridge through a tunnel.");
  if (tokenConfigured && !tokenStrong) warnings.push("Use a JARVIS_WEB_TOKEN with at least 32 characters before exposing the bridge through a tunnel.");
  if (localhostBypass) warnings.push("Localhost auth bypass is enabled for desktop/local use.");
  if (!isCommandAvailable("ngrok") && !isCommandAvailable("npx")) warnings.push("Neither ngrok nor npx was found on PATH; npm run web:tunnel needs one of them.");

  return {
    mode: "local-web-bridge",
    host: getRequestHost(request),
    origin,
    manifestUrl: `${origin}/.well-known/arcigy-jarvis.json`,
    actionManifestUrl: `${origin}/.well-known/ai-plugin.json`,
    openApiSchemaUrl: `${origin}/api/openapi.json`,
    productionVerificationEvidenceUrl: `${origin}/api/production-verification-evidence`,
    tunnelCommand: "npm run web:tunnel",
    tunnelProvider: "ngrok",
    authRequiredForExternalHosts: true,
    tokenConfigured,
    tokenStrong,
    localhostBypass,
    maxJsonBytes: getMaxJsonBytes(),
    mcpToolCount: tools.length,
    riskyToolsRequiringApproval,
    pathPolicy: "repo-only",
    readyForTunnel: tokenConfigured && tokenStrong && riskyToolsRequiringApproval.length > 0,
    warnings,
  };
}

function getSecureTunnelStatus() {
  const logPath = secureTunnelLogPath();
  const running = Boolean(webTunnelProcess && webTunnelProcess.exitCode === null && !webTunnelProcess.killed);
  if (!existsSync(logPath)) {
    return {
      running,
      logExists: false,
      ready: false,
      logPath,
      summary: running ? "Secure tunnel process is starting; log is not written yet." : "No secure tunnel log exists yet.",
    };
  }

  const raw = readFileSync(logPath, "utf-8").slice(-80_000);
  const safe = redactSensitiveText(raw).replace(/One-time token:\s*\S+/gi, "One-time token: [redacted]");
  const publicUrl =
    matchFirst(raw, /External manifest:\s*(https:\/\/[^\s/]+(?:\/[^\s]*)?)\/\.well-known\/arcigy-jarvis\.json/i) ||
    matchFirst(raw, /External connection pack:\s*(https:\/\/[^\s/]+(?:\/[^\s]*)?)\/api\/remote-mcp-pack/i) ||
    matchFirst(raw, /External smoke test:\s*(https:\/\/[^\s/]+(?:\/[^\s]*)?)\/api\/remote-mcp-smoke/i);
  const ready = /Arcigy Jarvis tunnel is ready\./.test(raw) && Boolean(publicUrl);
  const smokeSummary = matchFirst(safe, /Smoke:\s*([^\r\n]+)/i);
  return {
    running,
    logExists: true,
    ready,
    logPath,
    publicUrl,
    manifestUrl: publicUrl ? `${publicUrl}/.well-known/arcigy-jarvis.json` : null,
    actionManifestUrl: publicUrl ? `${publicUrl}/.well-known/ai-plugin.json` : null,
    openApiSchemaUrl: publicUrl ? `${publicUrl}/api/openapi.json` : null,
    connectionPackUrl: publicUrl ? `${publicUrl}/api/remote-mcp-pack?includeReadiness=true&live=true` : null,
    smokeUrl: publicUrl ? `${publicUrl}/api/remote-mcp-smoke` : null,
    mcpToolCallPattern: publicUrl ? `${publicUrl}/api/mcp/{toolName}` : null,
    tokenPresent: /One-time token:\s*\S+|Token source:\s*JARVIS_WEB_TOKEN/i.test(raw),
    smokeSummary,
    summary: ready ? "Secure tunnel is ready. Public MCP URLs were extracted without returning the bearer token." : "Secure tunnel is not ready yet.",
    redactedTail: safe.split(/\r?\n/).filter(Boolean).slice(-18).join("\n"),
  };
}

function startSecureTunnelFromWeb() {
  if (webTunnelProcess && webTunnelProcess.exitCode === null && !webTunnelProcess.killed) {
    return {
      started: false,
      alreadyRunning: true,
      pid: webTunnelProcess.pid,
      command: "npm run web:tunnel",
      logPath: secureTunnelLogPath(),
    };
  }
  const token = getWebToken();
  if (!isStrongWebToken(token)) {
    return {
      started: false,
      alreadyRunning: false,
      requiresToken: true,
      command: "npm run web:tunnel",
      logPath: secureTunnelLogPath(),
      reason: "Set JARVIS_WEB_TOKEN to at least 32 characters before starting a browser-launched tunnel.",
    };
  }

  const logPath = secureTunnelLogPath();
  mkdirForLog(logPath);
  appendTunnelLog(`\n[${new Date().toISOString()}] Starting npm run web:tunnel from local web bridge\n`);
  const outputFd = openSync(logPath, "a");
  const errorFd = openSync(logPath, "a");
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", "web:tunnel"], {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env },
    stdio: ["ignore", outputFd, errorFd],
    windowsHide: true,
  });
  closeFd(outputFd);
  closeFd(errorFd);
  child.unref();
  webTunnelProcess = child;
  child.once("error", (error) => {
    appendTunnelLog(`[${new Date().toISOString()}] Web tunnel launch failed: ${redactSensitiveText(error.message)}\n`);
    if (webTunnelProcess === child) webTunnelProcess = null;
  });
  child.once("exit", () => {
    if (webTunnelProcess === child) webTunnelProcess = null;
  });
  return {
    started: true,
    alreadyRunning: false,
    pid: child.pid,
    command: "npm run web:tunnel",
    logPath,
  };
}

function stopSecureTunnelFromWeb() {
  const logPath = secureTunnelLogPath();
  if (!webTunnelProcess || webTunnelProcess.exitCode !== null || webTunnelProcess.killed || !webTunnelProcess.pid) {
    return { stopped: false, wasRunning: false, logPath };
  }
  const pid = webTunnelProcess.pid;
  appendTunnelLog(`[${new Date().toISOString()}] Stopping web-launched secure tunnel process ${pid}\n`);
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch (error) {
    appendTunnelLog(`[${new Date().toISOString()}] Web tunnel stop warning: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}\n`);
  }
  webTunnelProcess = null;
  return { stopped: true, wasRunning: true, pid, logPath };
}

function secureTunnelLogPath() {
  return join(repoRoot, "generated", "jarvis-secure-tunnel.log");
}

function mkdirForLog(logPath: string) {
  mkdirSync(dirname(logPath), { recursive: true });
}

function closeFd(fd: number) {
  if (fd > 2) closeSync(fd);
}

function appendTunnelLog(line: string) {
  const logPath = secureTunnelLogPath();
  mkdirForLog(logPath);
  appendFileSync(logPath, line, "utf-8");
}

function matchFirst(value: string, pattern: RegExp) {
  return String(value).match(pattern)?.[1]?.replace(/\/$/, "") || null;
}

function getRequestOrigin(request: IncomingMessage): string {
  const proto = getForwardedValue(request.headers["x-forwarded-proto"]) || (isLocalRequest(request) ? "http" : "https");
  const host = getForwardedValue(request.headers["x-forwarded-host"]) || request.headers.host || "127.0.0.1";
  return `${proto}://${host}`;
}

function getForwardedValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw.split(",")[0].trim() || null;
}

async function routeMcpTool(name: string, request: IncomingMessage, response: ServerResponse) {
  const payload = await readJson(request);
  const approvalError = getApprovalError(name, payload);
  if (approvalError) {
    writeJson(response, 409, { error: approvalError });
    return;
  }
  if (name === "arcigy.generate_contract_documents") {
    if (!payload.inputJsonPath && !payload.intake) {
      writeJson(response, 400, { error: "Provide either inputJsonPath or inline intake payload." });
      return;
    }
    const safeOutputDir = resolveRepoPath(payload.outputDir, join(repoRoot, "generated", "contracts"), "outputDir");
    const args = payload.inputJsonPath
      ? buildContractGenerationCommand(resolveRepoPath(payload.inputJsonPath, "", "inputJsonPath"), safeOutputDir).args
      : ["scripts/generate_contract_documents.py", "--payload", JSON.stringify(payload.intake), "--output-dir", safeOutputDir];
    const result = runPython(args);
    const responseBody = { result: result.stdout.trim() || "Contract documents generated." };
    addAuditEvent("arcigy.generate_contract_documents", "generated", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }
  if (name === "arcigy.get_cold_outreach_brief") {
    writeJson(response, 200, {
      result: getColdOutreachMcpAnswer({
        periodLabel: String(payload.periodLabel ?? ""),
        contacted: Number(payload.contacted ?? 0),
        opened: Number(payload.opened ?? 0),
        replied: Number(payload.replied ?? 0),
        positiveReplies: Number(payload.positiveReplies ?? 0),
        preparedPositiveReplyCount: Number(payload.preparedPositiveReplyCount ?? 0),
        pendingApprovalCount: Number(payload.pendingApprovalCount ?? 0),
      }),
    });
    return;
  }
  if (name === "arcigy.add_cold_outreach_event") {
    writeJson(response, 200, { result: runDbTool("add-cold-event", payload) });
    return;
  }
  if (name === "arcigy.get_prepared_outreach_replies") {
    writeJson(response, 200, { result: runDbTool("list-prepared-replies", payload) });
    return;
  }
  if (name === "arcigy.get_approval_queue") {
    writeJson(response, 200, { result: runDbTool("list-approval-queue", payload) });
    return;
  }
  if (name === "arcigy.prepare_positive_outreach_reply") {
    writeJson(response, 200, { result: await preparePositiveOutreachReply(payload) });
    return;
  }
  if (name === "arcigy.approve_prepared_outreach_reply") {
    writeJson(response, 200, { result: runDbTool("approve-prepared-reply", payload) });
    return;
  }
  if (name === "arcigy.send_approved_outreach_reply") {
    writeJson(response, 200, { result: await sendApprovedOutreachReply(payload) });
    return;
  }
  if (name === "arcigy.upsert_local_person") {
    writeJson(response, 200, { result: runDbTool("upsert-person", payload) });
    return;
  }
  if (name === "arcigy.add_client_need_signal") {
    writeJson(response, 200, { result: runDbTool("add-need-signal", payload) });
    return;
  }
  if (name === "arcigy.get_client_need_alerts") {
    writeJson(response, 200, { result: getClientNeedAlerts(payload) });
    return;
  }
  if (name === "arcigy.update_client_need_status") {
    const result = runDbTool("update-need-status", payload);
    addAuditEvent("arcigy.update_client_need_status", "updated", payload, result, true);
    writeJson(response, 200, { result });
    return;
  }
  if (name === "arcigy.get_audit_events") {
    writeJson(response, 200, { result: runDbTool("list-audit-events", payload) });
    return;
  }
  if (name === "arcigy.get_local_memory_snapshot") {
    writeJson(response, 200, { result: runDbTool("local-memory-snapshot", payload) });
    return;
  }
  if (name === "arcigy.export_local_memory_snapshot") {
    const result = runDbTool("export-local-memory-snapshot", {
      ...payload,
      outputPath: resolveRepoPath(payload.outputPath, join(repoRoot, "generated", "local-memory", "local-memory-snapshot.json"), "outputPath"),
    });
    addAuditEvent("arcigy.export_local_memory_snapshot", "exported", payload, result, true);
    writeJson(response, 200, { result });
    return;
  }
  if (name === "arcigy.jarvis_voice_event") {
    writeJson(response, 200, { result: await handleWebVoiceEvent(payload, request) });
    return;
  }
  if (name === "arcigy.get_system_health") {
    writeJson(response, 200, { result: { integrations: getIntegrationHealth() } });
    return;
  }
  if (name === "arcigy.run_integration_diagnostics") {
    writeJson(response, 200, {
      result: await runIntegrationDiagnostics({ live: payload.live === true, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") }),
    });
    return;
  }
  if (name === "arcigy.get_production_readiness") {
    writeJson(response, 200, {
      result: await buildProductionReadinessReport({ live: payload.live === true, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") }),
    });
    return;
  }
  if (name === "arcigy.get_production_verification_evidence") {
    writeJson(response, 200, { result: getProductionVerificationEvidence(repoRoot) });
    return;
  }
  if (name === "arcigy.get_remote_mcp_pack") {
    writeJson(response, 200, { result: await getRemoteMcpPack(request, null, payload) });
    return;
  }
  if (name === "arcigy.run_remote_mcp_smoke") {
    writeJson(response, 200, {
      result: await runRemoteMcpSmoke({
        baseUrl: optionalString(payload.baseUrl) ?? getRequestOrigin(request),
        bearerToken: optionalString(payload.bearerToken) ?? getBearerToken(request) ?? undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.get_operator_briefing") {
    writeJson(response, 200, { result: await getOperatorBriefing(payload) });
    return;
  }
  if (name === "arcigy.draft_contract_intake") {
    writeJson(response, 200, {
      result: await draftContractIntake({
        brief: String(payload.brief ?? ""),
        baseIntake: typeof payload.baseIntake === "object" && payload.baseIntake !== null ? (payload.baseIntake as Record<string, unknown>) : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.generate_ai_reply") {
    writeJson(response, 200, {
      result: await generateGeminiText(buildClientReplyPrompt(toClientReplyDraftInput(payload))),
    });
    return;
  }
  if (name === "arcigy.get_cold_outreach_brief_from_db") {
    const result = runPython([
      "scripts/jarvis_local_db.py",
      "cold-brief",
      "--db",
      resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
      "--payload",
      JSON.stringify(payload),
    ]);
    writeJson(response, 200, { result: JSON.parse(result.stdout) });
    return;
  }
  if (name === "arcigy.identify_email") {
    writeJson(response, 200, { result: identifyEmail(payload) });
    return;
  }
  if (name === "arcigy.ingest_client_message") {
    writeJson(response, 200, { result: ingestClientMessage(payload) });
    return;
  }
  if (name === "arcigy.sync_gmail_recent_messages") {
    writeJson(response, 200, { result: await syncGmailRecentMessages(payload) });
    return;
  }
  if (name === "arcigy.get_smartlead_campaign_status") {
    writeJson(response, 200, { result: await getSmartleadCampaignStatus({ campaignId: optionalString(payload.campaignId) }) });
    return;
  }
  if (name === "arcigy.get_smartlead_outreach_brief") {
    writeJson(response, 200, { result: await getSmartleadOutreachBrief(toSmartleadOutreachBriefInput(payload)) });
    return;
  }
  if (name === "arcigy.discover_leads") {
    writeJson(response, 200, {
      result: await discoverLeads({
        query: String(payload.query ?? ""),
        placesQuery: optionalString(payload.placesQuery),
        maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.search_serper") {
    writeJson(response, 200, {
      result: await searchSerper({
        query: String(payload.query ?? ""),
        num: typeof payload.num === "number" ? payload.num : undefined,
        gl: optionalString(payload.gl),
        hl: optionalString(payload.hl),
      }),
    });
    return;
  }
  if (name === "arcigy.search_google_places") {
    writeJson(response, 200, {
      result: await searchGooglePlaces({
        query: String(payload.query ?? ""),
        maxResultCount: typeof payload.maxResultCount === "number" ? payload.maxResultCount : undefined,
        languageCode: optionalString(payload.languageCode),
        regionCode: optionalString(payload.regionCode),
      }),
    });
    return;
  }
  if (name === "arcigy.append_leads_to_google_sheet") {
    const result = await appendRowsToGoogleSheet({
        spreadsheetId: optionalString(payload.spreadsheetId),
        range: optionalString(payload.range),
        accountEnvKey: optionalString(payload.accountEnvKey),
        rows: (payload.rows ?? []) as Array<Array<string | number | boolean | null>>,
      });
    const responseBody = { result };
    addAuditEvent("arcigy.append_leads_to_google_sheet", "appended", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }
  writeJson(response, 404, { error: `Unsupported web MCP bridge tool: ${name}` });
}

function getApprovalError(name: string, payload: Record<string, unknown>): string | null {
  const tool = listJarvisMcpTools().find((item) => item.name === name);
  if (!tool?.requiresApproval) return null;
  const approval = payload.approval as { approved?: unknown } | undefined;
  if (approval?.approved === true) return null;
  return `${name} requires explicit approval. Send {"approval":{"approved":true}} after user confirmation.`;
}

async function getRemoteMcpPack(request: IncomingMessage, url: URL | null, payload: Record<string, unknown> = {}) {
  const baseUrl = optionalString(payload.baseUrl) ?? getRequestOrigin(request);
  const live = payload.live === true || url?.searchParams.get("live") === "true";
  const includeReadiness = payload.includeReadiness !== false && url?.searchParams.get("includeReadiness") !== "false";
  return buildRemoteMcpConnectionPack({
    baseUrl,
    live,
    includeReadiness,
    dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
    tokenConfigured: getWebToken() !== null,
    tokenStrong: isStrongWebToken(getWebToken()),
    localhostBypass: process.env.JARVIS_WEB_REQUIRE_AUTH !== "true",
    maxJsonBytes: getMaxJsonBytes(),
    authFailureLimit: getAuthFailureLimit(),
    authFailureWindowMs: getAuthFailureWindowMs(),
    source: "web",
  });
}

async function getRemoteMcpSmoke(request: IncomingMessage) {
  return runRemoteMcpSmoke({
    baseUrl: getRequestOrigin(request),
    bearerToken: getBearerToken(request) ?? undefined,
  });
}

function runDbTool(command: string, payload: Record<string, unknown>) {
  const { dbPath, ...body } = payload;
  const result = runPython([
    "scripts/jarvis_local_db.py",
    command,
    "--db",
    resolveRepoPath(dbPath, defaultDbPath, "dbPath"),
    "--payload",
    JSON.stringify(body),
  ]);
  return JSON.parse(result.stdout);
}

function addAuditEvent(
  automationKey: string,
  status: string,
  input: Record<string, unknown>,
  output: unknown,
  requiresApproval: boolean
) {
  try {
    runDbTool("add-audit-event", {
      automationKey,
      status,
      input,
      output,
      requiresApproval,
      approvedAt: requiresApproval ? new Date().toISOString() : undefined,
    });
  } catch {
    return;
  }
}

async function syncGmailRecentMessages(payload: Record<string, unknown>) {
  const accountEnvKey = optionalString(payload.accountEnvKey);
  const query = optionalString(payload.query) ?? defaultGmailSyncQuery;
  const maxResults = typeof payload.maxResults === "number" ? Math.max(1, Math.min(payload.maxResults, 25)) : 10;
  const dryRun = payload.dryRun === true;
  const dbPath = resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath");
  const accounts = listConfiguredGmailAccounts().filter((account) => !accountEnvKey || account.envKey === accountEnvKey);
  if (!accounts.length) {
    throw new Error(accountEnvKey ? `Configured Gmail account not found: ${accountEnvKey}` : "No configured Gmail accounts found.");
  }

  const synced = [];
  for (const account of accounts) {
    const events = await listRecentGmailMessageEvents(account, { query, maxResults });
    const ingested = [];
    if (!dryRun) {
      for (const event of events) {
        ingested.push(
          JSON.parse(
            runPython([
              "scripts/jarvis_local_db.py",
              "ingest-message",
              "--db",
              dbPath,
              "--payload",
              JSON.stringify(event),
            ]).stdout
          )
        );
      }
    }
    const createdItems = ingested.filter((item) => item.status === "created");
    const duplicateItems = ingested.filter((item) => item.status === "duplicate");
    synced.push({
      account: account.label,
      fetched: events.length,
      ingested: createdItems.length,
      created: createdItems.length,
      duplicates: duplicateItems.length,
      processed: ingested.length,
      alerts: createdItems.map((item) => item.jarvisAlert).filter(Boolean),
      preview: events.slice(0, 3).map((event) => ({
        fromEmail: event.fromEmail,
        subject: event.subject,
        text: event.text,
      })),
    });
  }
  return { dryRun, synced };
}

function identifyEmail(payload: Record<string, unknown>) {
  const email = optionalString(payload.email);
  if (!email) throw new Error("Email is required.");
  return JSON.parse(
    runPython([
      "scripts/jarvis_local_db.py",
      "identify",
      "--db",
      resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
      "--email",
      email,
    ]).stdout
  );
}

function ingestClientMessage(payload: Record<string, unknown>) {
  const email = optionalString(payload.email) ?? optionalString(payload.fromEmail);
  const text = optionalString(payload.text) ?? optionalString(payload.message);
  if (!email) throw new Error("Email is required.");
  if (!text) throw new Error("Message text is required.");
  return JSON.parse(
    runPython([
      "scripts/jarvis_local_db.py",
      "ingest-message",
      "--db",
      resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
      "--payload",
      JSON.stringify({
        fromEmail: email,
        displayName: optionalString(payload.displayName),
        companyName: optionalString(payload.companyName),
        subject: optionalString(payload.subject),
        text,
        source: optionalString(payload.source) ?? "jarvis-ui",
        createIfUnknown: payload.createIfUnknown !== false,
      }),
    ]).stdout
  );
}

function getClientNeedAlerts(payload: Record<string, unknown>) {
  return JSON.parse(
    runPython([
      "scripts/jarvis_local_db.py",
      "list-open-needs",
      "--db",
      resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
      "--payload",
      JSON.stringify({
        status: payload.status ?? "new",
        limit: payload.limit ?? 10,
      }),
    ]).stdout
  );
}

async function preparePositiveOutreachReply(payload: Record<string, unknown>) {
  const leadEmail = String(payload.leadEmail ?? "").trim();
  const positiveSignal = String(payload.positiveSignal ?? "").trim();
  if (!leadEmail) throw httpError(400, "Lead email is required.");
  if (!positiveSignal) throw httpError(400, "Positive signal is required.");
  const draft = await generateGeminiText(
    buildPositiveOutreachReplyPrompt({
      leadEmail,
      leadName: optionalString(payload.leadName),
      companyName: optionalString(payload.companyName),
      positiveSignal,
      context: optionalString(payload.context),
      language: payload.language === "en" ? "en" : "sk",
      tone: payload.tone === "direct" || payload.tone === "warm" ? payload.tone : "executive",
    })
  );
  const event = runDbTool("add-cold-event", {
    dbPath: payload.dbPath,
    leadEmail,
    campaignId: optionalString(payload.campaignId),
    campaignName: optionalString(payload.campaignName),
    eventType: "prepared_reply",
    occurredAt: optionalString(payload.occurredAt),
    data: {
      subject: optionalString(payload.subject),
      replyText: draft.text,
      positiveSignal,
      leadName: optionalString(payload.leadName),
      companyName: optionalString(payload.companyName),
      context: optionalString(payload.context),
      language: payload.language === "en" ? "en" : "sk",
      tone: payload.tone === "direct" || payload.tone === "warm" ? payload.tone : "executive",
      model: draft.model,
      attempts: draft.attempts,
      generatedBy: "gemini",
      requiresApprovalBeforeSend: true,
    },
  });
  return {
    status: "prepared",
    preparedReply: event,
    replyText: draft.text,
    model: draft.model,
    attempts: draft.attempts,
    summary: `Jarvis: Pripravil som odpoved pre ${leadEmail}. Poslem ju az po tvojom schvaleni cez arcigy.approve_prepared_outreach_reply.`,
  };
}

async function sendApprovedOutreachReply(payload: Record<string, unknown>) {
  const preparedEventId = String(payload.preparedEventId ?? "").trim();
  if (!preparedEventId) throw httpError(400, "Prepared event id is required.");
  const status = runDbTool("get-prepared-reply", { dbPath: payload.dbPath, preparedEventId }) as {
    status: string;
    preparedReply: {
      leadEmail: string;
      campaignId?: string | null;
      campaignName?: string | null;
      subject?: string | null;
      replyText?: string | null;
      data?: Record<string, unknown>;
    };
    sentEvent?: unknown;
  };
  if (status.status === "sent") {
    return {
      status: "already_sent",
      preparedReply: status.preparedReply,
      sentEvent: status.sentEvent,
      summary: `Jarvis: Odpoved pre ${status.preparedReply.leadEmail} uz bola odoslana.`,
    };
  }
  if (status.status !== "approved") throw httpError(409, "Prepared reply must be approved before sending.");
  const replyText = status.preparedReply.replyText?.trim();
  if (!replyText) throw httpError(400, "Prepared reply text is missing.");

  const accountEnvKey = optionalString(payload.accountEnvKey);
  const accounts = listConfiguredGmailAccounts().filter((account) => !accountEnvKey || account.envKey === accountEnvKey);
  if (!accounts.length) {
    throw httpError(400, accountEnvKey ? `Configured Gmail account not found: ${accountEnvKey}` : "No configured Gmail accounts found.");
  }
  let lastError: Error | null = null;
  for (const account of accounts) {
    try {
      const subject = optionalString(payload.subject) ?? status.preparedReply.subject ?? "Re: Arcigy";
      const gmail = await sendGmailTextMessage(account, {
        to: status.preparedReply.leadEmail,
        subject,
        text: replyText,
        threadId: optionalString(payload.threadId) ?? (typeof status.preparedReply.data?.threadId === "string" ? status.preparedReply.data.threadId : undefined),
      });
      const sentEvent = runDbTool("add-cold-event", {
        dbPath: payload.dbPath,
        leadEmail: status.preparedReply.leadEmail,
        campaignId: status.preparedReply.campaignId,
        campaignName: status.preparedReply.campaignName,
        eventType: "approved_reply_sent",
        occurredAt: optionalString(payload.occurredAt),
        data: {
          preparedEventId,
          sentBy: optionalString(payload.sentBy) ?? "operator",
          account: account.label,
          accountEnvKey: account.envKey,
          gmailMessageId: gmail.id,
          gmailThreadId: gmail.threadId,
          subject,
        },
      });
      const result = {
        status: "sent",
        preparedReply: status.preparedReply,
        sentEvent,
        gmail,
        summary: `Jarvis: Odpoved pre ${status.preparedReply.leadEmail} bola odoslana cez Gmail.`,
      };
      addAuditEvent("arcigy.send_approved_outreach_reply", "sent", { preparedEventId, accountEnvKey, subject }, result, true);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (accountEnvKey) break;
    }
  }
  throw httpError(502, lastError?.message ?? "Gmail send failed.");
}

async function getOperatorBriefing(payload: Record<string, unknown>) {
  const period = resolveColdOutreachPeriod(String(payload.text ?? payload.periodLabel ?? ""));
  const dbPath = resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath");
  const liveSyncSummary = await maybeSyncGmailForOperatorBriefing(payload, dbPath);
  const cold = JSON.parse(
    runPython([
      "scripts/jarvis_local_db.py",
      "cold-brief",
      "--db",
      dbPath,
      "--payload",
      JSON.stringify({
        since: payload.since ?? period.since,
        until: payload.until ?? period.until,
        periodLabel: payload.periodLabel ?? period.periodLabel,
      }),
    ]).stdout
  );
  const clientNeeds = getClientNeedAlerts({ dbPath, status: "new", limit: 10 });
  const preparedReplies = runDbTool("list-prepared-replies", { dbPath, status: "pending", limit: 10 });
  const readiness = await buildProductionReadinessReport({ live: payload.live === true, dbPath });
  const productionEvidence = getProductionVerificationEvidence(repoRoot);
  const preparedReplyCount = Number(preparedReplies.count ?? 0);
  const preparedPositiveReplyCount = Number(cold.metrics?.preparedPositiveReplyCount ?? preparedReplyCount);
  const pendingPositiveApprovalCount = Number(cold.metrics?.pendingPositiveApprovalCount ?? preparedPositiveReplyCount);
  const coldOutreachSummary = await getOperatorColdOutreachSummary(payload.live === true, String(payload.periodLabel ?? period.periodLabel), cold.summary, {
    preparedPositiveReplyCount,
    pendingApprovalCount: pendingPositiveApprovalCount,
  });
  return buildOperatorBriefing({
    readinessStatus: readiness.status,
    readinessSummary: readiness.summary,
    readinessAttentionQueue: readiness.attentionQueue,
    productionEvidenceSummary: productionEvidence.summary,
    providerFallbackSummary: summarizeProviderFallbackForBriefing(readiness.diagnostics?.checks),
    coldOutreachSummary,
    liveSyncSummary,
    openClientNeedCount: Number(clientNeeds.count ?? 0),
    clientNeedHighlights: Array.isArray(clientNeeds.alerts) ? clientNeeds.alerts : [],
    preparedReplyCount,
    nextActions: readiness.nextActions,
  });
}

function summarizeProviderFallbackForBriefing(checks: Array<{ key?: string; status?: string }> | undefined): string | null {
  if (!checks?.length) return null;
  const byKey = new Map(checks.map((check) => [check.key, check.status]));
  const requiredKeys = ["gemini", "gmail", "smartlead", "postgres", "googleSheets", "googleMaps", "remoteMcp", "sqlite"];
  const readyRequired = requiredKeys.filter((key) => byKey.get(key) === "ready").length;
  const leadFallback =
    byKey.get("serper") === "ready"
      ? "Serper and Google Places are available."
      : byKey.get("googleMaps") === "ready"
        ? "Google Places fallback is active; Serper is optional."
        : "Lead discovery providers need attention.";
  const redis =
    byKey.get("redis") === "ready" ? "Redis is live." : "Redis is optional for shipped workflows because local state uses SQLite.";
  return `${readyRequired}/${requiredKeys.length} required providers ready. ${leadFallback} ${redis}`;
}

async function maybeSyncGmailForOperatorBriefing(payload: Record<string, unknown>, dbPath: string): Promise<string | null> {
  if (payload.live !== true || payload.syncGmail === false) return null;
  try {
    const result = await syncGmailRecentMessages({
      dbPath,
      accountEnvKey: optionalString(payload.accountEnvKey),
      query: optionalString(payload.gmailQuery) ?? defaultGmailBriefingQuery,
      maxResults: typeof payload.gmailMaxResults === "number" ? payload.gmailMaxResults : 5,
      dryRun: false,
    });
    const fetched = result.synced.reduce((sum, item) => sum + item.fetched, 0);
    const created = result.synced.reduce((sum, item) => sum + item.created, 0);
    const duplicates = result.synced.reduce((sum, item) => sum + item.duplicates, 0);
    const alerts = result.synced.reduce((sum, item) => sum + item.alerts.length, 0);
    return `Gmail checked ${result.synced.length} account(s), fetched ${fetched} message(s), created ${created} new record(s), skipped ${duplicates} duplicate(s), raised ${alerts} alert(s).`;
  } catch (error) {
    const message = safeErrorMessage(error);
    return `Gmail live sync unavailable: ${message}`;
  }
}

async function getColdOutreachBriefSummary(payload: Record<string, unknown>, live: boolean): Promise<string> {
  const period = resolveColdOutreachPeriod(String(payload.text ?? payload.periodLabel ?? ""));
  const result = runPython([
    "scripts/jarvis_local_db.py",
    "cold-brief",
    "--db",
    resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
    "--payload",
    JSON.stringify({
      since: payload.since ?? period.since,
      until: payload.until ?? period.until,
      periodLabel: payload.periodLabel ?? period.periodLabel,
    }),
  ]);
  const local = JSON.parse(result.stdout);
  return getOperatorColdOutreachSummary(live, String(payload.periodLabel ?? period.periodLabel), local.summary, {
    preparedPositiveReplyCount: Number(local.metrics?.preparedPositiveReplyCount ?? 0),
    pendingApprovalCount: Number(local.metrics?.pendingApprovalCount ?? 0),
  });
}

async function getOperatorColdOutreachSummary(
  live: boolean,
  periodLabel: string,
  localSummary: string,
  approvals: { preparedPositiveReplyCount?: number; pendingApprovalCount?: number } = {}
): Promise<string> {
  if (!live) return localSummary;
  try {
    const smartlead = await getSmartleadOutreachBrief({ periodLabel, maxCampaigns: 10, ...approvals });
    return smartlead.summary;
  } catch (error) {
    const message = safeErrorMessage(error);
    return `${localSummary} Live Smartlead summary unavailable: ${message}`;
  }
}

function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error));
}

function serveStatic(pathname: string, response: ServerResponse, headOnly: boolean) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(desktopRoot, relative));
  if (!filePath.startsWith(resolve(desktopRoot)) || !existsSync(filePath)) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }
  const body = headOnly ? Buffer.alloc(0) : readFileSync(filePath);
  response.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
  response.end(body);
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  const maxBytes = getMaxJsonBytes();
  let size = 0;
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, `JSON body exceeds ${maxBytes} bytes.`);
  }
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw httpError(413, `JSON body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function writeNoContent(response: ServerResponse, statusCode: number) {
  response.writeHead(statusCode, {
    ...jsonResponseHeaders(),
    "content-length": "0",
  });
  response.end();
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown, headers: Record<string, string> = {}) {
  response.writeHead(statusCode, {
    ...jsonResponseHeaders(),
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function jsonResponseHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-requested-with",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "vary": "origin",
    "x-content-type-options": "nosniff",
  };
}

function getErrorStatus(error: unknown): number {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
}

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function getMaxJsonBytes(): number {
  const value = Number(process.env.JARVIS_MAX_JSON_BYTES ?? defaultMaxJsonBytes);
  return Number.isFinite(value) && value > 0 ? value : defaultMaxJsonBytes;
}

function isCommandAvailable(command: string): boolean {
  const check =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return check.status === 0;
}

async function handleWebVoiceEvent(payload: Record<string, unknown>, request?: IncomingMessage) {
  let session = (payload.session ?? { state: "idle", wakeWord: "jarvis" }) as JarvisVoiceSession;
  let text = String(payload.text ?? "").trim();

  if (session.state === "idle") {
    if (!containsWakeWord(text, session.wakeWord)) {
      return {
        session: { ...session, lastTranscript: text },
        shouldStartRecording: false,
        shouldStopRecording: false,
        speakText: null,
      };
    }
    const wakeCommand = extractCommandAfterWakeWord(text, session.wakeWord);
    if (!wakeCommand) {
      return {
        session: { ...session, state: "awake", lastTranscript: text },
        shouldStartRecording: true,
        shouldStopRecording: false,
        speakText: "Ano, pocuvam.",
      };
    }
    session = { ...session, state: "awake", lastTranscript: text };
    text = wakeCommand;
  }

  const lowered = normalizeTranscript(text);

  if (lowered.includes("briefing") || lowered.includes("prehlad") || lowered.includes("co sa deje")) {
    const briefing = await getOperatorBriefing({ ...payload, text });
    return voiceDone(session, text, briefing.speechText);
  }

  if (isProductionEvidenceVoiceCommand(lowered)) {
    const evidence = getProductionVerificationEvidence(repoRoot);
    return voiceDone(session, text, summarizeProductionEvidenceForVoice(evidence));
  }

  if (isProductionReadinessVoiceCommand(lowered)) {
    const report = await buildProductionReadinessReport({ live: payload.live === true || lowered.includes("live"), dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") });
    return voiceDone(session, text, summarizeReadinessForVoice(report));
  }

  if (isRemoteMcpVoiceCommand(lowered)) {
    const pack = request ? await getRemoteMcpPack(request, null, { ...payload, includeReadiness: true, live: false }) : null;
    return voiceDone(session, text, pack ? summarizeRemoteMcpForVoice(pack) : "Remote MCP pack viem pripravit cez web bridge request kontext.");
  }

  if (isApprovalQueueVoiceCommand(lowered)) {
    const queue = runDbTool("list-approval-queue", { dbPath: payload.dbPath, limit: 20 });
    return voiceDone(session, text, summarizeApprovalQueueForVoice(queue));
  }

  if (isContractVoiceCommand(lowered)) {
    const brief = cleanVoiceQuery(text, ["jarvis", "zmluva", "zmluvy", "contract", "kontrakt", "formular", "intake", "navrhni", "draft"]);
    if (lowered.includes("vygeneruj") || lowered.includes("generuj")) {
      return voiceDone(session, text, "Zmluvy vygenerujem az po vyplnenom intake a explicitnom schvaleni payloadu. Hlasom mozem pripravit draft intake.");
    }
    if (brief.length >= 24 && (lowered.includes("intake") || lowered.includes("formular") || lowered.includes("navrh") || lowered.includes("draft"))) {
      const intake = await draftContractIntake({ brief });
      return voiceDone(session, text, summarizeContractDraftForVoice(intake));
    }
    return voiceDone(session, text, "Zmluvny modul je pripraveny. Povedz klienta, projekt, cenu a rozsah; pripravim intake a finalne DOCX az po tvojom schvaleni.");
  }

  if (lowered.includes("cold") || lowered.includes("outreach")) {
    return voiceDone(session, text, await getColdOutreachBriefSummary({ ...payload, text }, payload.live !== false));
  }

  if (isClientNeedsVoiceCommand(lowered)) {
    const result = getClientNeedAlerts({ dbPath: payload.dbPath, status: "new", limit: 10 });
    return voiceDone(session, text, summarizeClientNeeds(Number(result.count || 0), Array.isArray(result.alerts) ? result.alerts : []));
  }

  if (isGmailVoiceCommand(lowered)) {
    try {
      const result = await syncGmailRecentMessages({
        dbPath: payload.dbPath,
        accountEnvKey: payload.accountEnvKey,
        query: payload.gmailQuery || defaultGmailBriefingQuery,
        maxResults: typeof payload.gmailMaxResults === "number" ? payload.gmailMaxResults : 5,
        dryRun: true,
      });
      return voiceDone(session, text, summarizeGmailPreviewForVoice(result));
    } catch (error) {
      return voiceDone(session, text, `Gmail preview teraz nie je dostupny: ${safeErrorMessage(error)}`);
    }
  }

  if (lowered.includes("integracie") || lowered.includes("system") || lowered.includes("health")) {
    return voiceDone(session, text, summarizeHealthForVoice({ integrations: getIntegrationHealth() }));
  }

  if (lowered.includes("identifikuj") || lowered.includes("kto je") || lowered.includes("email")) {
    const email = extractEmail(text);
    const response = email
      ? summarizeIdentityForVoice(identifyEmail({ email, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") }))
      : "Povedz mi email, ktory mam vyhladat v lokalnej pamati.";
    return voiceDone(session, text, response);
  }

  if (lowered.includes("lead") || lowered.includes("najdi") || lowered.includes("vyhladaj")) {
    const query = cleanVoiceQuery(text, ["jarvis", "lead", "leady", "leadov", "najdi", "vyhladaj", "hladaj"]);
    const result = await discoverLeads({ query: query || "automation agency Bratislava", maxResults: 3 });
    return voiceDone(session, text, summarizeLeadsForVoice(result));
  }

  if (lowered.includes("odpoved") || lowered.includes("draft") || lowered.includes("gemini")) {
    const message = cleanVoiceQuery(text, ["jarvis", "odpoved", "odpovedz", "draft", "gemini", "navrhni"]);
    if (!message) return voiceDone(session, text, "Povedz mi spravu klienta, na ktoru mam pripravit odpoved.");
    const result = await generateGeminiText(buildClientReplyPrompt({ message, context: "Voice command inside Arcigy Jarvis." }));
    return voiceDone(session, text, result.text);
  }

  return voiceDone(
    session,
    text,
    "Rozumiem. Viem hlasom pripravit briefing, precitat approval queue, skontrolovat produkciu, remote MCP, zmluvy, cold outreach, Gmail, klientske poziadavky, integracie, email, leady alebo Gemini odpoved."
  );
}

function voiceDone(session: JarvisVoiceSession, transcript: string, response: string) {
  return {
    session: {
      ...session,
      state: "idle",
      lastTranscript: transcript,
      lastResponse: response,
    },
    shouldStartRecording: false,
    shouldStopRecording: true,
    speakText: response,
  };
}

function summarizeHealthForVoice(health: { integrations: Array<{ key: string; configured: boolean }> }) {
  const ready = health.integrations.filter((item) => item.configured).map((item) => item.key);
  const missing = health.integrations.filter((item) => !item.configured).map((item) => item.key);
  return [
    ready.length ? `Ready integracie: ${ready.join(", ")}.` : "Ziadne integracie nie su ready.",
    missing.length ? `Chybaju: ${missing.join(", ")}.` : "Nic nechyba.",
  ].join(" ");
}

function summarizeReadinessForVoice(report: {
  status?: unknown;
  summary?: unknown;
  attentionQueue?: Array<{ key?: unknown; title?: unknown }>;
  launchChecklist?: Array<{ status?: unknown }>;
  nextActions?: unknown[];
}) {
  const queue = Array.isArray(report.attentionQueue) ? report.attentionQueue : [];
  const launch = Array.isArray(report.launchChecklist) ? report.launchChecklist : [];
  const topQueue = queue
    .slice(0, 3)
    .map((item) => `${String(item.key ?? "attention")}: ${String(item.title ?? "needs review")}`)
    .join("; ");
  const checklistReady = launch.filter((item) => item.status === "ready").length;
  const nextAction = Array.isArray(report.nextActions) && report.nextActions.length ? `Najblizsi krok: ${String(report.nextActions[0])}` : "Najblizsi krok: ziadny urgentny.";
  return [
    `Production readiness je ${String(report.status ?? "unknown")}.`,
    typeof report.summary === "string" ? report.summary : null,
    launch.length ? `Launch checklist: ${checklistReady}/${launch.length} ready.` : null,
    topQueue ? `Attention queue: ${topQueue}.` : "Attention queue je prazdna.",
    nextAction,
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeProductionEvidenceForVoice(evidence: {
  status?: unknown;
  summary?: unknown;
  checks?: unknown[];
  release?: unknown;
  freshness?: unknown;
}) {
  const release = evidence.release && typeof evidence.release === "object" && !Array.isArray(evidence.release) ? (evidence.release as Record<string, unknown>) : {};
  const freshness = evidence.freshness && typeof evidence.freshness === "object" && !Array.isArray(evidence.freshness) ? (evidence.freshness as Record<string, unknown>) : {};
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const ready = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "ready").length;
  const failed = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "failed").length;
  const tree = release.dirty === false ? "clean" : release.dirty === true ? "dirty" : "unknown";
  const fresh = freshness.fresh === true ? `fresh ${String(freshness.ageHours ?? "?")}h` : "not fresh";
  return [
    `Production evidence je ${String(evidence.status ?? "unknown")}.`,
    typeof evidence.summary === "string" ? evidence.summary : null,
    `Release commit ${String(release.shortCommit ?? "unknown")}, tree ${tree}, ${fresh}.`,
    checks.length ? `Checks: ${ready}/${checks.length} ready, ${failed} failed.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeRemoteMcpForVoice(pack: {
  tools?: { count?: unknown; approvalRequired?: unknown[]; localStateWrite?: unknown[] };
  quickStartCalls?: unknown[];
  readiness?: { status?: unknown };
  manifestUrl?: unknown;
  smokeTestUrl?: unknown;
}) {
  const tools = pack.tools ?? {};
  const approvalRequired = Array.isArray(tools.approvalRequired) ? tools.approvalRequired : [];
  const localWrites = Array.isArray(tools.localStateWrite) ? tools.localStateWrite : [];
  const quickStarts = Array.isArray(pack.quickStartCalls) ? pack.quickStartCalls.length : 0;
  const readiness = pack.readiness?.status ? `Readiness: ${String(pack.readiness.status)}.` : "";
  return [
    `Remote MCP pack je pripraveny pre ${String(tools.count ?? 0)} toolov.`,
    readiness,
    `Approval locky: ${approvalRequired.length}. Lokalnych zapisov: ${localWrites.length}. Quick-start volani: ${quickStarts}.`,
    `Manifest: ${String(pack.manifestUrl ?? "not loaded")}. Smoke test: ${String(pack.smokeTestUrl ?? "not loaded")}.`,
    "Token nevraciam; pouziva sa iba bearer placeholder.",
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeContractDraftForVoice(intake: {
  client?: { businessName?: unknown; name?: unknown };
  project?: { name?: unknown; goal?: unknown };
  pricing?: { implementationFeeEur?: unknown; implementationFee?: unknown; monthlyFee?: unknown };
}) {
  const client = intake.client ?? {};
  const project = intake.project ?? {};
  const pricing = intake.pricing ?? {};
  const clientName = client.businessName || client.name || "klient nie je doplneny";
  const projectName = project.name || project.goal || "projekt nie je doplneny";
  const fee = pricing.implementationFeeEur ?? pricing.implementationFee ?? pricing.monthlyFee ?? null;
  return [
    `Pripravil som draft intake pre ${String(clientName)}.`,
    `Projekt: ${String(projectName)}.`,
    fee !== null ? `Cena v intake: ${String(fee)} EUR.` : "Cena este nie je jasna.",
    "DOCX zmluvu a prilohy vygenerujem az po tvojej kontrole a explicitnom schvaleni.",
  ].join(" ");
}

function summarizeGmailPreviewForVoice(result: { synced?: Array<{ fetched?: unknown; preview?: Array<{ fromEmail?: unknown; subject?: unknown }> }> }) {
  const synced = Array.isArray(result.synced) ? result.synced : [];
  const fetched = synced.reduce((sum, item) => sum + Number(item.fetched || 0), 0);
  const preview = synced.flatMap((item) => item.preview || []).slice(0, 3);
  const previewText = preview.length
    ? `Top preview: ${preview.map((item) => `${String(item.fromEmail ?? "unknown")}: ${String(item.subject || "bez predmetu")}`).join("; ")}.`
    : "Preview nenasiel ziadne spravy.";
  return `Gmail preview bez lokalneho zapisu skontroloval ${synced.length} account(s) a nasiel ${fetched} sprav. ${previewText}`;
}

function summarizeClientNeeds(count: number, highlights: Array<{ person?: Record<string, unknown>; needSignal?: Record<string, unknown> }>) {
  if (count <= 0) return "Klientske poziadavky: ziadne otvorene.";
  const topItems = highlights
    .slice(0, 3)
    .map((item) => {
      const person = item.person ?? {};
      const need = item.needSignal ?? {};
      const name = person.displayName || person.companyName || person.primaryEmail || "neznamy kontakt";
      const summary = need.summary || "bez detailu";
      return `${String(name)}: ${String(summary)}`;
    })
    .filter(Boolean);
  if (!topItems.length) return `Klientske poziadavky: ${count} otvorenych.`;
  return `Klientske poziadavky: ${count} otvorenych. Najnovsie: ${topItems.join("; ")}.`;
}

function summarizeIdentityForVoice(result: { email: string; person?: { displayName?: string; companyName?: string; primaryEmail: string; kind: string } | null; openNeedSignals?: Array<{ summary: string }> }) {
  if (!result.person) return `Email ${result.email} zatial nepoznam v lokalnej pamati.`;
  const name = result.person.displayName || result.person.companyName || result.person.primaryEmail;
  const needs = result.openNeedSignals || [];
  const needText = needs.length ? `Ma ${needs.length} otvorenych poziadaviek. Najnovsia: ${needs[0].summary}` : "Nema otvorene poziadavky.";
  return `${result.email} je ${name}, typ ${result.person.kind}. ${needText}`;
}

function summarizeLeadsForVoice(result: { leads: Array<{ name: string }>; sources: string[] }) {
  const leads = result.leads || [];
  if (!leads.length) return "Nenasiel som ziadne leady pre tento dotaz.";
  const names = leads.slice(0, 3).map((lead) => lead.name).join(", ");
  const sources = (result.sources || []).join(", ") || "ziadny zdroj";
  return `Nasiel som ${leads.length} leadov cez ${sources}. Top vysledky: ${names}.`;
}

function isApprovalQueueVoiceCommand(text: string) {
  return ["approval", "schvalenie", "schvalit", "potvrdenie", "potvrdit", "na moje znamenie", "cakaju na mna", "co caka"].some((term) => text.includes(term));
}

function isProductionReadinessVoiceCommand(text: string) {
  return ["production", "produkcia", "readiness", "launch", "checklist", "nasadenie"].some((term) => text.includes(term));
}

function isProductionEvidenceVoiceCommand(text: string) {
  return ["production evidence", "verification evidence", "release proof", "evidence", "verifier", "overenie", "dokaz"].some((term) => text.includes(term));
}

function isRemoteMcpVoiceCommand(text: string) {
  return ["remote mcp", "mcp", "tunel", "tunnel", "handoff", "claude", "chatgpt", "grok", "xai", "x ai"].some((term) => text.includes(term));
}

function isContractVoiceCommand(text: string) {
  return ["zmluva", "zmluvy", "contract", "kontrakt", "priloha", "docx", "intake"].some((term) => text.includes(term));
}

function isClientNeedsVoiceCommand(text: string) {
  return ["klientske poziadavky", "poziadavky klientov", "co chce klient", "co chcu klienti", "client need"].some((term) => text.includes(term));
}

function isGmailVoiceCommand(text: string) {
  return ["gmail", "inbox", "posta", "mail sync"].some((term) => text.includes(term));
}

function summarizeApprovalQueueForVoice(result: { count?: unknown; items?: unknown }) {
  const items = Array.isArray(result.items) ? result.items : [];
  const count = Number(result.count || items.length || 0);
  if (count <= 0) return "Approval queue je prazdna. Nic necaka na tvoje potvrdenie.";
  const topItems = items
    .slice(0, 3)
    .map((raw) => {
      const item = raw as { title?: unknown; type?: unknown; summary?: unknown };
      const title = typeof item.title === "string" ? item.title : typeof item.type === "string" ? item.type : "approval item";
      const summary = typeof item.summary === "string" ? item.summary : "bez detailu";
      return `${title}: ${summary}`;
    })
    .filter(Boolean);
  const detail = topItems.length ? `Najblizsie: ${topItems.join("; ")}.` : "";
  return `Na tvoje potvrdenie caka ${count} veci. ${detail} Nic neposlem ani neuzavriem bez explicitneho schvalenia.`;
}

function extractEmail(text: string) {
  return String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || null;
}

function cleanVoiceQuery(text: string, removeWords: string[]) {
  const remove = new Set(removeWords.map((word) => normalizeTranscript(word)));
  return String(text)
    .split(/\s+/)
    .filter((word) => !remove.has(normalizeTranscript(word)))
    .join(" ")
    .replace(/[,:;.]+$/g, "")
    .trim();
}

function resolveColdOutreachPeriod(text: string) {
  const lowered = normalizeTranscript(text);
  const now = new Date();
  const until = now.toISOString();
  if (lowered.includes("dnes") || lowered.includes("today")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { since: start.toISOString(), until, periodLabel: "dnes" };
  }
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until, periodLabel: "poslednych 7 dni" };
}

function normalizeTranscript(text: string) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim();
}

function runPython(args: string[]): { stdout: string; stderr: string } {
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw pythonToolError(result.stderr || `Python command failed with status ${result.status}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function pythonToolError(message: string): Error {
  const cleaned = cleanPythonErrorMessage(message);
  const statusCode = /Unresolved contract intake placeholder|Generated DOCX still contains unresolved placeholder|Missing required field|Contract intake JSON is required/i.test(cleaned)
    ? 400
    : 500;
  return Object.assign(new Error(cleaned), { statusCode });
}

function cleanPythonErrorMessage(message: string): string {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueError = [...lines].reverse().find((line) => /^(ValueError|FileNotFoundError|TypeError|Error):\s*/.test(line));
  if (valueError) return redactSensitiveText(valueError.replace(/^(ValueError|FileNotFoundError|TypeError|Error):\s*/, ""));
  return redactSensitiveText(lines.at(-1) || String(message));
}

function parseContractIntake(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, "Contract intake must be valid JSON.");
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toClientReplyDraftInput(payload: Record<string, unknown>) {
  const message = optionalString(payload.message);
  if (!message) throw httpError(400, "Client reply message is required.");
  return {
    clientName: optionalString(payload.clientName),
    message,
    context: optionalString(payload.context),
    language: payload.language === "en" ? "en" : "sk",
    tone: payload.tone === "direct" || payload.tone === "warm" ? payload.tone : "executive",
  } as const;
}

function toSmartleadOutreachBriefInput(payload: Record<string, unknown>) {
  return {
    campaignId: optionalString(payload.campaignId),
    periodLabel: optionalString(payload.periodLabel),
    maxCampaigns: nonNegativeInteger(payload.maxCampaigns),
    preparedPositiveReplyCount: nonNegativeInteger(payload.preparedPositiveReplyCount),
    pendingApprovalCount: nonNegativeInteger(payload.pendingApprovalCount),
  };
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function resolveRepoPath(value: unknown, fallback: string, label: string): string {
  const candidate = optionalString(value) ?? fallback;
  if (!candidate) throw httpError(400, `${label} is required.`);
  const resolved = resolve(repoRoot, candidate);
  const root = resolve(repoRoot);
  const normalizedResolved = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}${sep}`)) {
    throw httpError(400, `${label} must stay inside the Jarvis repository.`);
  }
  return resolved;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.JARVIS_WEB_PORT ?? 8765);
  const host = process.env.JARVIS_WEB_HOST ?? "127.0.0.1";
  createLocalApiServer().listen(port, host, () => {
    console.log(`Arcigy Jarvis web bridge listening on http://${host}:${port}`);
  });
}
