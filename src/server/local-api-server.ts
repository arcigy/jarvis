import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { redactSensitiveText } from "../automation-system/ai-safety.ts";
import { draftContractIntake } from "../automation-system/contract-intake-draft.ts";
import { runIntegrationDiagnostics } from "../automation-system/diagnostics.ts";
import { getIntegrationHealth, loadLocalEnv } from "../automation-system/env.ts";
import { buildClientReplyPrompt, buildPositiveOutreachReplyPrompt, generateGeminiText } from "../automation-system/gemini.ts";
import { defaultGmailBriefingQuery, defaultGmailSyncQuery, listConfiguredGmailAccounts, listRecentGmailMessageEvents, sendGmailTextMessage } from "../automation-system/gmail.ts";
import { batchFetchPublicUrlPreviews, fetchPublicUrlPreview } from "../automation-system/http-fetch.ts";
import { containsWakeWord, extractCommandAfterWakeWord, type JarvisVoiceSession } from "../automation-system/jarvis-voice.ts";
import { buildJarvisCapabilityAudit, summarizeJarvisCapabilityAuditForVoice } from "../automation-system/jarvis-capability-audit.ts";
import { appendRowsToGoogleSheet, discoverLeads, searchGooglePlaces, searchSerper } from "../automation-system/lead-discovery.ts";
import { buildLeadgenDailyReport, buildLeadgenEveningSummary, buildLeadgenOpsDigest, buildLeadgenSlackReportPreview, selectNextNiche } from "../automation-system/leadgen-report.ts";
import {
  buildBatchNicheDiscoveryPlan,
  buildLeadgenExecutionQueuePreview,
  buildLeadDiscoveryMatrixPreview,
  buildNicheLeadgenPlan,
  buildLeadgenGapReport,
  buildLeadgenCampaignPipelinePreview,
  buildLeadgenAutopilotBatchPreview,
  buildRegionExpansionQueuePreview,
  buildLeadSourceImportQueuePreview,
  buildLeadSourceBundlePreview,
  buildLeadSourceBundleCampaignLaunchPreview,
  buildOrphanLeadAssignmentPreview,
  buildUrlIntelligenceQueuePreview,
  buildLeadRepairQueuePreview,
  buildSlovakRegisterBatchPreview,
  buildSlovakSalutationPreview,
  buildNicheOpsDashboardPreview,
  buildSuppressionListPreview,
  buildSmartleadHistorySuppressionPreview,
  buildSmartleadNonreplyCallListPreview,
  batchScrapeWebsiteContacts,
  batchDraftLeadIntros,
  buildAiIntroQualityAuditPreview,
  buildAiIntroCleanupPreview,
  buildManualReviewPickupPlan,
  buildManualReviewQueue,
  buildSmartleadCampaignLaunchPreview,
  buildSmartleadCampaignQaPreview,
  buildSmartleadCampaignHandoffPackagePreview,
  buildSmartleadCampaignBackupPlan,
  buildSmartleadCampaignRestorePlan,
  buildSmartleadInjectionPlan,
  buildSmartleadImportAuditPreview,
  buildSmartleadCampaignSyncPlanPreview,
  buildSmartleadSenderCapacityPreview,
  buildSmartleadDeliverabilityGuardPreview,
  buildColdOutreachCsvImportPreview,
  dedupeLeadCandidates,
  draftNicheSmartleadCampaignSetup,
  draftLeadIntro,
  draftSmartleadCampaignSequence,
  enrichWebsiteLeadsPreview,
  enrichSlovakCompanyRegister,
  filterBlacklistedLeads,
  buildDailyLeadgenRunbook,
  buildLeadCsvMappingPreview,
  parseLeadsCsv,
  previewSmartleadEmailRendering,
  buildSmartleadSequenceVariableRepairPreview,
  buildLeadBatchQaPreview,
  previewLeadEnrichmentBatch,
  buildLeadEnrichmentMergePreview,
  prepareSmartleadLeads,
  runLeadgenResearchPipeline,
  scoreLeadQuality,
  serializeLeadsCsv,
  scrapeWebsiteContacts,
} from "../automation-system/lead-automation.ts";
import { buildContractGenerationCommand, getColdOutreachMcpAnswer, listJarvisMcpTools, localStateWriteToolNames } from "../automation-system/mcp-tools.ts";
import { buildOperatorBriefing } from "../automation-system/operator-briefing.ts";
import { draftPriceOfferIntake } from "../automation-system/price-offer.ts";
import { buildProactiveAttentionDigest } from "../automation-system/proactive-attention-digest.ts";
import { buildProductionCompletionScore, summarizeProductionCompletionScoreForVoice } from "../automation-system/production-completion-score.ts";
import { buildProductionReadinessReport } from "../automation-system/production-readiness.ts";
import { getProductionVerificationEvidence } from "../automation-system/production-verification-evidence.ts";
import { buildOutreachReplyTriagePreview, classifyOutreachReply, previewGmailAiReply, previewSmartleadAiReply } from "../automation-system/reply-decision.ts";
import { buildRemoteMcpOpenApiDocument } from "../automation-system/remote-mcp-openapi.ts";
import { buildRemoteMcpConnectionPack } from "../automation-system/remote-mcp-pack.ts";
import { runRemoteMcpSmoke } from "../automation-system/remote-mcp-smoke.ts";
import { createJarvisMcpServer } from "../automation-system/mcp-server.ts";
import {
  addLeadsToSmartleadCampaign,
  configureSmartleadCampaign,
  createSmartleadCampaign,
  draftSmartleadThreadReply,
  getSmartleadCampaignLeads,
  getSmartleadCampaignStatus,
  getSmartleadMessageHistory,
  getSmartleadOutreachBrief,
  previewSmartleadLeadSync,
  sendSmartleadThreadReply,
} from "../automation-system/smartlead.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const desktopRoot = join(repoRoot, "src", "desktop");
const defaultDbPath = join(repoRoot, "data", "jarvis-local.db");
const defaultMaxJsonBytes = 1_000_000;
const defaultAuthFailureLimit = 20;
const defaultAuthFailureWindowMs = 60_000;
let webTunnelProcess: ChildProcess | null = null;
const authFailureBuckets = new Map<string, { count: number; resetAt: number }>();
const oauthCodes = new Map<string, { clientId: string; redirectUri: string; expiresAt: number }>();

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

  if (request.method === "OPTIONS" && isOAuthPath(url.pathname)) {
    writeNoContent(response, 204);
    return;
  }

  if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
    writeJson(response, 200, buildOAuthAuthorizationServerMetadata(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
    writeJson(response, 200, buildOAuthProtectedResourceMetadata(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/oauth/authorize") {
    handleOAuthAuthorize(request, response, url);
    return;
  }

  if (request.method === "POST" && url.pathname === "/oauth/token") {
    await handleOAuthToken(request, response);
    return;
  }

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
    }, buildBearerAuthChallengeHeaders(request));
    return;
  }

  if (protectedBridgePath) clearAuthFailures(request);

  if (url.pathname === "/mcp") {
    await handleStreamableMcp(request, response);
    return;
  }

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

  if (request.method === "GET" && url.pathname === "/api/remote-agent-launch-bundle") {
    writeJson(response, 200, await getRemoteAgentLaunchBundle(request, url));
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

  if (request.method === "GET" && url.pathname === "/api/production-completion-score") {
    writeJson(response, 200, await getProductionCompletionScore({ live: url.searchParams.get("live") === "true" }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/jarvis-capability-audit") {
    writeJson(response, 200, await getJarvisCapabilityAudit({ live: url.searchParams.get("live") === "true" }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/operator-briefing") {
    const payload = await readJson(request);
    writeJson(response, 200, await getOperatorBriefing(payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/proactive-attention-digest") {
    writeJson(response, 200, await getProactiveAttentionDigest(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/proactive-attention-digest") {
    const payload = await readJson(request);
    writeJson(response, 200, await getProactiveAttentionDigest(payload));
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
  if (pathname === "/api/openapi.json") return false;
  return pathname === "/mcp" || pathname.startsWith("/api/") || pathname === "/.well-known/arcigy-jarvis.json" || pathname === "/.well-known/ai-plugin.json" || pathname === "/ai-plugin.json";
}

function isOAuthPath(pathname: string): boolean {
  return pathname === "/oauth/authorize" || pathname === "/oauth/token" || pathname === "/.well-known/oauth-authorization-server" || pathname === "/.well-known/oauth-protected-resource";
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

async function handleStreamableMcp(request: IncomingMessage, response: ServerResponse) {
  if (!["GET", "POST", "DELETE"].includes(request.method || "")) {
    writeJson(response, 405, { error: "Method not allowed" });
    return;
  }
  const server = createJarvisMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    if (!response.headersSent) {
      writeJson(response, 500, { error: safeErrorMessage(error) });
    }
  } finally {
    await transport.close().catch(() => undefined);
  }
}

function buildOAuthAuthorizationServerMetadata(request: IncomingMessage) {
  const origin = getRequestOrigin(request);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["jarvis"],
    service_documentation: `${origin}/api/remote-mcp-pack?includeReadiness=true&live=true`,
  };
}

function buildOAuthProtectedResourceMetadata(request: IncomingMessage) {
  const origin = getRequestOrigin(request);
  return {
    resource: origin,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["jarvis"],
  };
}

function buildBearerAuthChallengeHeaders(request: IncomingMessage): Record<string, string> {
  const origin = getRequestOrigin(request);
  return {
    "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="jarvis"`,
  };
}

function handleOAuthAuthorize(_request: IncomingMessage, response: ServerResponse, url: URL) {
  const redirectUri = url.searchParams.get("redirect_uri");
  const clientId = url.searchParams.get("client_id") || "arcigy-chatgpt";
  const state = url.searchParams.get("state");
  if (!redirectUri) {
    writeJson(response, 400, { error: "invalid_request", error_description: "Missing redirect_uri." });
    return;
  }
  const code = randomBytes(32).toString("base64url");
  oauthCodes.set(code, { clientId, redirectUri, expiresAt: Date.now() + 5 * 60_000 });
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  response.writeHead(302, {
    ...jsonResponseHeaders(),
    location: redirect.toString(),
  });
  response.end();
}

async function handleOAuthToken(request: IncomingMessage, response: ServerResponse) {
  const body = await readFormBody(request);
  const grantType = body.get("grant_type");
  const code = body.get("code");
  const redirectUri = body.get("redirect_uri");
  const clientId = getOAuthClientId(request, body);
  const clientSecret = getOAuthClientSecret(request, body);
  const expectedClientSecret = process.env.JARVIS_OAUTH_CLIENT_SECRET?.trim();
  const token = getWebToken();
  if (!token) {
    writeJson(response, 503, { error: "temporarily_unavailable", error_description: "Jarvis web token is not configured." });
    return;
  }
  if (expectedClientSecret && clientSecret !== expectedClientSecret) {
    writeJson(response, 401, { error: "invalid_client" });
    return;
  }
  if (grantType !== "authorization_code" || !code) {
    writeJson(response, 400, { error: "unsupported_grant_type" });
    return;
  }
  const record = oauthCodes.get(code);
  oauthCodes.delete(code);
  if (!record || record.expiresAt < Date.now()) {
    writeJson(response, 400, { error: "invalid_grant" });
    return;
  }
  if (redirectUri && redirectUri !== record.redirectUri) {
    writeJson(response, 400, { error: "invalid_grant" });
    return;
  }
  if (clientId && clientId !== record.clientId) {
    writeJson(response, 400, { error: "invalid_client" });
    return;
  }
  writeJson(response, 200, {
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "jarvis",
  });
}

function getOAuthClientId(request: IncomingMessage, body: URLSearchParams): string | null {
  const basic = getBasicAuth(request);
  return basic?.username || body.get("client_id");
}

function getOAuthClientSecret(request: IncomingMessage, body: URLSearchParams): string | null {
  const basic = getBasicAuth(request);
  return basic?.password || body.get("client_secret");
}

function getBasicAuth(request: IncomingMessage): { username: string; password: string } | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Basic\s+(.+)$/i.exec(value || "");
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
    const index = decoded.indexOf(":");
    return index >= 0 ? { username: decoded.slice(0, index), password: decoded.slice(index + 1) } : null;
  } catch {
    return null;
  }
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
      remoteAgentLaunchBundle: `${origin}/api/remote-agent-launch-bundle`,
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
  if (name === "arcigy.draft_price_offer_intake") {
    writeJson(response, 200, {
      result: await draftPriceOfferIntake({
        brief: String(payload.brief ?? ""),
        baseOffer: payload.baseOffer && typeof payload.baseOffer === "object" ? payload.baseOffer as Record<string, unknown> : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.generate_price_offer_document") {
    if (!payload.inputJsonPath && !payload.offer) {
      writeJson(response, 400, { error: "Provide either inputJsonPath or inline offer payload." });
      return;
    }
    const safeOutputDir = resolveRepoPath(payload.outputDir, join(repoRoot, "generated", "price-offers"), "outputDir");
    const args = payload.inputJsonPath
      ? ["scripts/generate_price_offer.py", "--input", resolveRepoPath(payload.inputJsonPath, "", "inputJsonPath"), "--output-dir", safeOutputDir]
      : ["scripts/generate_price_offer.py", "--payload", JSON.stringify(payload.offer), "--output-dir", safeOutputDir];
    const result = runPython(args);
    const responseBody = { result: result.stdout.trim() || "Price offer document generated." };
    addAuditEvent("arcigy.generate_price_offer_document", "generated", payload, responseBody, true);
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
  if (name === "arcigy.get_production_completion_score") {
    writeJson(response, 200, { result: await getProductionCompletionScore({ live: payload.live === true, dbPath: payload.dbPath }) });
    return;
  }
  if (name === "arcigy.get_jarvis_capability_audit") {
    writeJson(response, 200, { result: await getJarvisCapabilityAudit({ live: payload.live === true, dbPath: payload.dbPath }) });
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
  if (name === "arcigy.get_proactive_attention_digest") {
    writeJson(response, 200, { result: await getProactiveAttentionDigest(payload) });
    return;
  }
  if (name === "arcigy.get_leadgen_daily_report") {
    writeJson(response, 200, {
      result: buildLeadgenDailyReport({
        periodLabel: optionalString(payload.periodLabel),
        campaigns: payload.campaigns,
        stuckLeads: Array.isArray(payload.stuckLeads) ? payload.stuckLeads as Parameters<typeof buildLeadgenDailyReport>[0]["stuckLeads"] : undefined,
        settings: payload.settings && typeof payload.settings === "object" ? payload.settings as Parameters<typeof buildLeadgenDailyReport>[0]["settings"] : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.get_leadgen_evening_summary") {
    writeJson(response, 200, {
      result: buildLeadgenEveningSummary({
        periodLabel: optionalString(payload.periodLabel),
        sentToday: typeof payload.sentToday === "number" ? payload.sentToday : undefined,
        repliesToday: typeof payload.repliesToday === "number" ? payload.repliesToday : undefined,
        positiveToday: typeof payload.positiveToday === "number" ? payload.positiveToday : undefined,
        recentReplies: Array.isArray(payload.recentReplies) ? payload.recentReplies as Parameters<typeof buildLeadgenEveningSummary>[0]["recentReplies"] : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_slack_report_preview") {
    writeJson(response, 200, {
      result: buildLeadgenSlackReportPreview({
        periodLabel: optionalString(payload.periodLabel),
        dateLabel: optionalString(payload.dateLabel),
        title: optionalString(payload.title),
        campaigns: payload.campaigns,
        stuckLeads: Array.isArray(payload.stuckLeads) ? payload.stuckLeads : undefined,
        settings: payload.settings as Parameters<typeof buildLeadgenSlackReportPreview>[0]["settings"],
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_ops_digest") {
    writeJson(response, 200, {
      result: buildLeadgenOpsDigest({
        periodLabel: optionalString(payload.periodLabel),
        campaigns: payload.campaigns,
        stuckLeads: Array.isArray(payload.stuckLeads) ? payload.stuckLeads : undefined,
        recentReplies: Array.isArray(payload.recentReplies) ? payload.recentReplies : undefined,
        settings: payload.settings as Parameters<typeof buildLeadgenOpsDigest>[0]["settings"],
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildLeadgenOpsDigest>[0]["niches"] : undefined,
        sentToday: typeof payload.sentToday === "number" ? payload.sentToday : undefined,
        repliesToday: typeof payload.repliesToday === "number" ? payload.repliesToday : undefined,
        positiveToday: typeof payload.positiveToday === "number" ? payload.positiveToday : undefined,
        manualReviewLimit: typeof payload.manualReviewLimit === "number" ? payload.manualReviewLimit : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.select_next_niche") {
    writeJson(response, 200, {
      result: selectNextNiche({
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof selectNextNiche>[0]["niches"] : [],
      }),
    });
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
  if (name === "arcigy.get_smartlead_campaign_leads") {
    writeJson(response, 200, {
      result: await getSmartleadCampaignLeads({
        campaignId: (payload.campaignId ?? "") as string | number,
        offset: typeof payload.offset === "number" ? payload.offset : undefined,
        limit: typeof payload.limit === "number" ? payload.limit : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.preview_smartlead_lead_sync") {
    writeJson(response, 200, {
      result: await previewSmartleadLeadSync({
        campaignIds: Array.isArray(payload.campaignIds) ? payload.campaignIds as Array<string | number> : undefined,
        maxCampaigns: typeof payload.maxCampaigns === "number" ? payload.maxCampaigns : undefined,
        limitPerCampaign: typeof payload.limitPerCampaign === "number" ? payload.limitPerCampaign : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.get_smartlead_message_history") {
    writeJson(response, 200, {
      result: await getSmartleadMessageHistory({
        campaignId: (payload.campaignId ?? "") as string | number,
        email: String(payload.email ?? ""),
      }),
    });
    return;
  }
  if (name === "arcigy.classify_outreach_reply") {
    writeJson(response, 200, {
      result: await classifyOutreachReply({
        replyBody: String(payload.replyBody ?? ""),
        history: Array.isArray(payload.history) ? payload.history as Parameters<typeof classifyOutreachReply>[0]["history"] : undefined,
        senderName: optionalString(payload.senderName),
        useAi: payload.useAi === true,
      }),
    });
    return;
  }
  if (name === "arcigy.build_outreach_reply_triage_preview") {
    writeJson(response, 200, {
      result: await buildOutreachReplyTriagePreview({
        replies: Array.isArray(payload.replies) ? payload.replies as Parameters<typeof buildOutreachReplyTriagePreview>[0]["replies"] : [],
        aiRepliesActive: typeof payload.aiRepliesActive === "boolean" ? payload.aiRepliesActive : undefined,
        useAiClassification: payload.useAiClassification === true,
        maxReplies: typeof payload.maxReplies === "number" ? payload.maxReplies : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.preview_smartlead_ai_reply") {
    writeJson(response, 200, {
      result: await previewSmartleadAiReply({
        toEmail: String(payload.toEmail ?? payload.to_email ?? ""),
        campaignId: (payload.campaignId ?? payload.campaign_id ?? "") as string | number,
        emailBody: optionalString(payload.emailBody) ?? optionalString(payload.email_body),
        eventType: optionalString(payload.eventType) ?? optionalString(payload.type),
        fromEmail: optionalString(payload.fromEmail) ?? optionalString(payload.from_email),
        leadName: optionalString(payload.leadName) ?? optionalString(payload.lead_name),
        companyName: optionalString(payload.companyName),
        categoryName: optionalString(payload.categoryName) ?? optionalString(payload.category_name),
        history: Array.isArray(payload.history) ? payload.history as Parameters<typeof previewSmartleadAiReply>[0]["history"] : undefined,
        aiRepliesActive: typeof payload.aiRepliesActive === "boolean" ? payload.aiRepliesActive : undefined,
        alreadySent: typeof payload.alreadySent === "boolean" ? payload.alreadySent : undefined,
        generateDraft: payload.generateDraft === true,
        useAiClassification: payload.useAiClassification === true,
      }),
    });
    return;
  }
  if (name === "arcigy.preview_gmail_ai_reply") {
    writeJson(response, 200, {
      result: await previewGmailAiReply({
        senderEmail: String(payload.senderEmail ?? ""),
        fromEmail: String(payload.fromEmail ?? payload.from_email ?? ""),
        subject: optionalString(payload.subject),
        body: String(payload.body ?? ""),
        threadId: String(payload.threadId ?? ""),
        messageId: String(payload.messageId ?? ""),
        leadName: optionalString(payload.leadName),
        history: Array.isArray(payload.history) ? payload.history as Parameters<typeof previewGmailAiReply>[0]["history"] : undefined,
        leadKnown: typeof payload.leadKnown === "boolean" ? payload.leadKnown : undefined,
        threadStartedByUs: typeof payload.threadStartedByUs === "boolean" ? payload.threadStartedByUs : undefined,
        aiRepliesActive: typeof payload.aiRepliesActive === "boolean" ? payload.aiRepliesActive : undefined,
        alreadyProcessed: typeof payload.alreadyProcessed === "boolean" ? payload.alreadyProcessed : undefined,
        alreadySent: typeof payload.alreadySent === "boolean" ? payload.alreadySent : undefined,
        generateDraft: payload.generateDraft === true,
        useAiClassification: payload.useAiClassification === true,
      }),
    });
    return;
  }
  if (name === "arcigy.draft_smartlead_thread_reply") {
    writeJson(response, 200, {
      result: await draftSmartleadThreadReply({
        campaignId: (payload.campaignId ?? "") as string | number,
        email: String(payload.email ?? ""),
        leadName: optionalString(payload.leadName),
        companyName: optionalString(payload.companyName),
        positiveSignal: optionalString(payload.positiveSignal),
        latestLeadReply: optionalString(payload.latestLeadReply),
        context: optionalString(payload.context),
        language: payload.language === "en" ? "en" : "sk",
        senderName: optionalString(payload.senderName),
        senderEmail: optionalString(payload.senderEmail),
        messageHistory: payload.messageHistory,
      }),
    });
    return;
  }
  if (name === "arcigy.send_smartlead_thread_reply") {
    const result = await sendSmartleadThreadReply({
      campaignId: (payload.campaignId ?? "") as string | number,
      email: optionalString(payload.email),
      emailBody: String(payload.emailBody ?? ""),
      emailStatsId: optionalString(payload.emailStatsId),
      replyMessageId: optionalString(payload.replyMessageId),
      replyEmailTime: optionalString(payload.replyEmailTime),
    });
    const responseBody = { result };
    addAuditEvent("arcigy.send_smartlead_thread_reply", "submitted", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }
  if (name === "arcigy.create_smartlead_campaign") {
    const result = await createSmartleadCampaign({
      name: String(payload.name ?? ""),
      clientId: (payload.clientId ?? null) as string | number | null,
      sequences: payload.sequences as Parameters<typeof createSmartleadCampaign>[0]["sequences"],
      emailAccountIds: payload.emailAccountIds as Parameters<typeof createSmartleadCampaign>[0]["emailAccountIds"],
      schedule: payload.schedule as Parameters<typeof createSmartleadCampaign>[0]["schedule"],
      settings: payload.settings as Parameters<typeof createSmartleadCampaign>[0]["settings"],
      webhook: payload.webhook as Parameters<typeof createSmartleadCampaign>[0]["webhook"],
      leads: payload.leads as Parameters<typeof createSmartleadCampaign>[0]["leads"],
    });
    const responseBody = { result };
    addAuditEvent("arcigy.create_smartlead_campaign", "submitted", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }
  if (name === "arcigy.configure_smartlead_campaign") {
    const result = await configureSmartleadCampaign({
      campaignId: (payload.campaignId ?? "") as string | number,
      sequences: payload.sequences as Parameters<typeof configureSmartleadCampaign>[0]["sequences"],
      emailAccountIds: payload.emailAccountIds as Parameters<typeof configureSmartleadCampaign>[0]["emailAccountIds"],
      schedule: payload.schedule as Parameters<typeof configureSmartleadCampaign>[0]["schedule"],
      settings: payload.settings as Parameters<typeof configureSmartleadCampaign>[0]["settings"],
      webhook: payload.webhook as Parameters<typeof configureSmartleadCampaign>[0]["webhook"],
    });
    const responseBody = { result };
    addAuditEvent("arcigy.configure_smartlead_campaign", "submitted", payload, responseBody, true);
    writeJson(response, 200, responseBody);
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
  if (name === "arcigy.scrape_website_contacts") {
    writeJson(response, 200, {
      result: await scrapeWebsiteContacts({
        url: String(payload.url ?? ""),
        includePriorityPages: payload.includePriorityPages !== false,
        maxPages: typeof payload.maxPages === "number" ? payload.maxPages : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.batch_scrape_website_contacts") {
    writeJson(response, 200, {
      result: await batchScrapeWebsiteContacts({
        urls: Array.isArray(payload.urls) ? payload.urls.map(String) : [],
        includePriorityPages: payload.includePriorityPages !== false,
        maxPages: typeof payload.maxPages === "number" ? payload.maxPages : undefined,
        maxSites: typeof payload.maxSites === "number" ? payload.maxSites : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.enrich_slovak_company_register") {
    writeJson(response, 200, {
      result: await enrichSlovakCompanyRegister({
        ico: optionalString(payload.ico),
        companyName: optionalString(payload.companyName),
      }),
    });
    return;
  }
  if (name === "arcigy.build_slovak_register_batch_preview") {
    writeJson(response, 200, {
      result: buildSlovakRegisterBatchPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSlovakRegisterBatchPreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        sourceName: optionalString(payload.sourceName),
        includeAlreadyVerified: payload.includeAlreadyVerified === true,
        maxLookups: typeof payload.maxLookups === "number" ? payload.maxLookups : undefined,
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_slovak_salutation_preview") {
    writeJson(response, 200, {
      result: buildSlovakSalutationPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSlovakSalutationPreview>[0]["leads"] : [],
        defaultSource: optionalString(payload.defaultSource),
        campaignId: typeof payload.campaignId === "string" || typeof payload.campaignId === "number" || payload.campaignId === null ? payload.campaignId : undefined,
        includeSmartleadPreview: payload.includeSmartleadPreview !== false,
        maxItems: typeof payload.maxItems === "number" ? payload.maxItems : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.score_lead_quality") {
    writeJson(response, 200, {
      result: scoreLeadQuality({
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        leads: (payload.leads ?? []) as Parameters<typeof scoreLeadQuality>[0]["leads"],
      }),
    });
    return;
  }
  if (name === "arcigy.dedupe_lead_candidates") {
    writeJson(response, 200, {
      result: dedupeLeadCandidates({
        leads: (payload.leads ?? []) as Parameters<typeof dedupeLeadCandidates>[0]["leads"],
      }),
    });
    return;
  }
  if (name === "arcigy.build_suppression_list_preview") {
    writeJson(response, 200, {
      result: buildSuppressionListPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSuppressionListPreview>[0]["leads"] : undefined,
        bouncedEmails: Array.isArray(payload.bouncedEmails) ? payload.bouncedEmails.map(String) : undefined,
        unsubscribedEmails: Array.isArray(payload.unsubscribedEmails) ? payload.unsubscribedEmails.map(String) : undefined,
        negativeReplyEmails: Array.isArray(payload.negativeReplyEmails) ? payload.negativeReplyEmails.map(String) : undefined,
        manualSuppressionEmails: Array.isArray(payload.manualSuppressionEmails) ? payload.manualSuppressionEmails.map(String) : undefined,
        manualSuppressionDomains: Array.isArray(payload.manualSuppressionDomains) ? payload.manualSuppressionDomains.map(String) : undefined,
        manualSuppressionKeywords: Array.isArray(payload.manualSuppressionKeywords) ? payload.manualSuppressionKeywords.map(String) : undefined,
        replySignals: Array.isArray(payload.replySignals) ? payload.replySignals as Parameters<typeof buildSuppressionListPreview>[0]["replySignals"] : undefined,
        suppressWholeDomainForBounces: payload.suppressWholeDomainForBounces === true,
        suppressWholeDomainForUnsubscribes: payload.suppressWholeDomainForUnsubscribes === true,
        sourceName: optionalString(payload.sourceName),
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_history_suppression_preview") {
    writeJson(response, 200, {
      result: buildSmartleadHistorySuppressionPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSmartleadHistorySuppressionPreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        sourceName: optionalString(payload.sourceName),
        sourceType: ["google_maps", "csv", "serper", "manual", "other"].includes(String(payload.sourceType)) ? payload.sourceType as Parameters<typeof buildSmartleadHistorySuppressionPreview>[0]["sourceType"] : undefined,
        suppressAlreadySent: payload.suppressAlreadySent !== false,
        suppressReplies: payload.suppressReplies !== false,
        suppressBlockedStatuses: payload.suppressBlockedStatuses !== false,
        suppressExistingSmartleadMatch: payload.suppressExistingSmartleadMatch !== false,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_nonreply_call_list_preview") {
    writeJson(response, 200, {
      result: buildSmartleadNonreplyCallListPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSmartleadNonreplyCallListPreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        sourceName: optionalString(payload.sourceName),
        sourceType: ["smartlead", "csv", "manual", "other"].includes(String(payload.sourceType)) ? payload.sourceType as Parameters<typeof buildSmartleadNonreplyCallListPreview>[0]["sourceType"] : undefined,
        campaignId: (payload.campaignId ?? null) as string | number | null,
        minSentMessages: typeof payload.minSentMessages === "number" ? payload.minSentMessages : undefined,
        excludeBlockedOrUnsubscribed: payload.excludeBlockedOrUnsubscribed !== false,
        includeWithoutPhone: payload.includeWithoutPhone === true,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_niche_leadgen_plan") {
    writeJson(response, 200, {
      result: buildNicheLeadgenPlan({
        niche: String(payload.niche ?? ""),
        region: optionalString(payload.region),
        customKeywords: Array.isArray(payload.customKeywords) ? payload.customKeywords.map(String) : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_batch_niche_discovery_plan") {
    writeJson(response, 200, {
      result: buildBatchNicheDiscoveryPlan({
        niches: (payload.niches ?? []) as Parameters<typeof buildBatchNicheDiscoveryPlan>[0]["niches"],
        defaultRegions: Array.isArray(payload.defaultRegions) ? payload.defaultRegions.map(String) : undefined,
        maxNiches: typeof payload.maxNiches === "number" ? payload.maxNiches : undefined,
        maxRegionsPerNiche: typeof payload.maxRegionsPerNiche === "number" ? payload.maxRegionsPerNiche : undefined,
        dailyLimit: typeof payload.dailyLimit === "number" ? payload.dailyLimit : undefined,
        targetCount: typeof payload.targetCount === "number" ? payload.targetCount : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        includeSmartleadSetup: payload.includeSmartleadSetup === true,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_discovery_matrix_preview") {
    writeJson(response, 200, {
      result: buildLeadDiscoveryMatrixPreview({
        niches: (payload.niches ?? []) as Parameters<typeof buildLeadDiscoveryMatrixPreview>[0]["niches"],
        defaultRegions: Array.isArray(payload.defaultRegions) ? payload.defaultRegions.map(String) : undefined,
        maxNiches: typeof payload.maxNiches === "number" ? payload.maxNiches : undefined,
        maxRegionsPerNiche: typeof payload.maxRegionsPerNiche === "number" ? payload.maxRegionsPerNiche : undefined,
        maxKeywordsPerNiche: typeof payload.maxKeywordsPerNiche === "number" ? payload.maxKeywordsPerNiche : undefined,
        targetPerRegion: typeof payload.targetPerRegion === "number" ? payload.targetPerRegion : undefined,
        country: optionalString(payload.country),
        language: optionalString(payload.language),
        useMaps: payload.useMaps !== false,
        useSerper: payload.useSerper !== false,
        existingDomains: Array.isArray(payload.existingDomains) ? payload.existingDomains.map(String) : undefined,
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_execution_queue_preview") {
    writeJson(response, 200, {
      result: buildLeadgenExecutionQueuePreview({
        niches: (payload.niches ?? []) as Parameters<typeof buildLeadgenExecutionQueuePreview>[0]["niches"],
        date: optionalString(payload.date),
        defaultRegions: Array.isArray(payload.defaultRegions) ? payload.defaultRegions.map(String) : undefined,
        maxQueue: typeof payload.maxQueue === "number" ? payload.maxQueue : undefined,
        dailyLimit: typeof payload.dailyLimit === "number" ? payload.dailyLimit : undefined,
        targetCount: typeof payload.targetCount === "number" ? payload.targetCount : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        includeSmartleadSetup: payload.includeSmartleadSetup === true,
      }),
    });
    return;
  }
  if (name === "arcigy.build_region_expansion_queue_preview") {
    writeJson(response, 200, {
      result: buildRegionExpansionQueuePreview({
        niches: (payload.niches ?? []) as Parameters<typeof buildRegionExpansionQueuePreview>[0]["niches"],
        regionPreset: ["capitals", "all_slovakia", "custom"].includes(String(payload.regionPreset)) ? payload.regionPreset as Parameters<typeof buildRegionExpansionQueuePreview>[0]["regionPreset"] : undefined,
        customRegions: Array.isArray(payload.customRegions) ? payload.customRegions.map(String) : undefined,
        excludedRegions: Array.isArray(payload.excludedRegions) ? payload.excludedRegions.map(String) : undefined,
        maxNiches: typeof payload.maxNiches === "number" ? payload.maxNiches : undefined,
        maxRegionsPerNiche: typeof payload.maxRegionsPerNiche === "number" ? payload.maxRegionsPerNiche : undefined,
        dailyLimit: typeof payload.dailyLimit === "number" ? payload.dailyLimit : undefined,
        targetCount: typeof payload.targetCount === "number" ? payload.targetCount : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        includeSmartleadSetup: payload.includeSmartleadSetup === true,
      }),
    });
    return;
  }
  if (name === "arcigy.draft_smartlead_campaign_sequence") {
    writeJson(response, 200, {
      result: draftSmartleadCampaignSequence({
        niche: String(payload.niche ?? ""),
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
      }),
    });
    return;
  }
  if (name === "arcigy.preview_smartlead_email_rendering") {
    writeJson(response, 200, {
      result: previewSmartleadEmailRendering({
        leads: (payload.leads ?? []) as Parameters<typeof previewSmartleadEmailRendering>[0]["leads"],
        sequences: (payload.sequences ?? []) as Parameters<typeof previewSmartleadEmailRendering>[0]["sequences"],
        signature: optionalString(payload.signature),
        maxLeads: typeof payload.maxLeads === "number" ? payload.maxLeads : undefined,
        maxRendered: typeof payload.maxRendered === "number" ? payload.maxRendered : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_sequence_variable_repair_preview") {
    writeJson(response, 200, {
      result: buildSmartleadSequenceVariableRepairPreview({
        campaignId: typeof payload.campaignId === "string" || typeof payload.campaignId === "number" || payload.campaignId === null ? payload.campaignId : undefined,
        sequences: (payload.sequences ?? []) as Parameters<typeof buildSmartleadSequenceVariableRepairPreview>[0]["sequences"],
        targetVariable: optionalString(payload.targetVariable),
        replacementVariable: optionalString(payload.replacementVariable),
        includeConfigurePayload: payload.includeConfigurePayload !== false,
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSmartleadSequenceVariableRepairPreview>[0]["leads"] : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_batch_qa_preview") {
    writeJson(response, 200, {
      result: buildLeadBatchQaPreview({
        leads: (payload.leads ?? []) as Parameters<typeof buildLeadBatchQaPreview>[0]["leads"],
        campaignTag: optionalString(payload.campaignTag),
        createdSince: optionalString(payload.createdSince),
        defaultSource: optionalString(payload.defaultSource),
        campaignId: typeof payload.campaignId === "string" || typeof payload.campaignId === "number" || payload.campaignId === null ? payload.campaignId : undefined,
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.preview_manual_review_pickup") {
    writeJson(response, 200, {
      result: buildManualReviewPickupPlan({
        leads: (payload.leads ?? []) as Parameters<typeof buildManualReviewPickupPlan>[0]["leads"],
        includeUnreviewed: payload.includeUnreviewed === true,
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_injection_plan") {
    writeJson(response, 200, {
      result: buildSmartleadInjectionPlan({
        niche: (payload.niche ?? {}) as Parameters<typeof buildSmartleadInjectionPlan>[0]["niche"],
        leads: (payload.leads ?? []) as Parameters<typeof buildSmartleadInjectionPlan>[0]["leads"],
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_import_audit_preview") {
    writeJson(response, 200, {
      result: buildSmartleadImportAuditPreview({
        campaignId: (payload.campaignId ?? null) as string | number | null,
        leads: (payload.leads ?? []) as Parameters<typeof buildSmartleadImportAuditPreview>[0]["leads"],
        existingSmartleadLeads: Array.isArray(payload.existingSmartleadLeads) ? payload.existingSmartleadLeads as Array<Record<string, unknown>> : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_sync_plan_preview") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignSyncPlanPreview({
        campaignId: typeof payload.campaignId === "string" || typeof payload.campaignId === "number" || payload.campaignId === null ? payload.campaignId : undefined,
        localLeads: (payload.localLeads ?? []) as Parameters<typeof buildSmartleadCampaignSyncPlanPreview>[0]["localLeads"],
        remoteLeads: Array.isArray(payload.remoteLeads) ? payload.remoteLeads as Parameters<typeof buildSmartleadCampaignSyncPlanPreview>[0]["remoteLeads"] : undefined,
        updateExisting: payload.updateExisting !== false,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_sender_capacity_preview") {
    writeJson(response, 200, {
      result: buildSmartleadSenderCapacityPreview({
        campaignId: (payload.campaignId ?? null) as string | number | null,
        accounts: Array.isArray(payload.accounts) ? payload.accounts as Parameters<typeof buildSmartleadSenderCapacityPreview>[0]["accounts"] : [],
        leadBacklog: typeof payload.leadBacklog === "number" ? payload.leadBacklog : undefined,
        requestedDailyLimit: typeof payload.requestedDailyLimit === "number" ? payload.requestedDailyLimit : undefined,
        minTimeBetweenEmailsMinutes: typeof payload.minTimeBetweenEmailsMinutes === "number" ? payload.minTimeBetweenEmailsMinutes : undefined,
        maxPerAccountPerDay: typeof payload.maxPerAccountPerDay === "number" ? payload.maxPerAccountPerDay : undefined,
        includePausedAccounts: payload.includePausedAccounts === true,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_deliverability_guard_preview") {
    writeJson(response, 200, {
      result: buildSmartleadDeliverabilityGuardPreview({
        campaignId: (payload.campaignId ?? null) as string | number | null,
        campaignName: optionalString(payload.campaignName),
        stats: payload.stats as Parameters<typeof buildSmartleadDeliverabilityGuardPreview>[0]["stats"],
        senderAccounts: Array.isArray(payload.senderAccounts) ? payload.senderAccounts as Parameters<typeof buildSmartleadDeliverabilityGuardPreview>[0]["senderAccounts"] : undefined,
        leadBacklog: typeof payload.leadBacklog === "number" ? payload.leadBacklog : undefined,
        requestedDailyLimit: typeof payload.requestedDailyLimit === "number" ? payload.requestedDailyLimit : undefined,
        maxBounceRate: typeof payload.maxBounceRate === "number" ? payload.maxBounceRate : undefined,
        maxUnsubscribeRate: typeof payload.maxUnsubscribeRate === "number" ? payload.maxUnsubscribeRate : undefined,
        minReplyRate: typeof payload.minReplyRate === "number" ? payload.minReplyRate : undefined,
        minOpenRate: typeof payload.minOpenRate === "number" ? payload.minOpenRate : undefined,
        minTimeBetweenEmailsMinutes: typeof payload.minTimeBetweenEmailsMinutes === "number" ? payload.minTimeBetweenEmailsMinutes : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_backup_plan") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignBackupPlan({
        campaigns: Array.isArray(payload.campaigns) ? payload.campaigns as Parameters<typeof buildSmartleadCampaignBackupPlan>[0]["campaigns"] : undefined,
        runId: optionalString(payload.runId),
        createdAt: optionalString(payload.createdAt),
        backupRoot: optionalString(payload.backupRoot),
        note: optionalString(payload.note),
        protectedCampaignIds: Array.isArray(payload.protectedCampaignIds) ? payload.protectedCampaignIds as Array<string | number> : undefined,
        protectedNameParts: Array.isArray(payload.protectedNameParts) ? payload.protectedNameParts.map(String) : undefined,
        includeDeletePlan: payload.includeDeletePlan === true,
        maxCampaigns: typeof payload.maxCampaigns === "number" ? payload.maxCampaigns : undefined,
        leadPageSize: typeof payload.leadPageSize === "number" ? payload.leadPageSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_restore_plan") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignRestorePlan({
        backups: Array.isArray(payload.backups) ? payload.backups as Parameters<typeof buildSmartleadCampaignRestorePlan>[0]["backups"] : [],
        restoreMode: payload.restoreMode === "configure-existing" ? "configure-existing" : payload.restoreMode === "create-new" ? "create-new" : undefined,
        targetNameSuffix: optionalString(payload.targetNameSuffix),
        targetCampaignId: (payload.targetCampaignId ?? null) as string | number | null,
        clientId: (payload.clientId ?? null) as string | number | null,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        maxLeadsPerCampaign: typeof payload.maxLeadsPerCampaign === "number" ? payload.maxLeadsPerCampaign : undefined,
        includeLeads: payload.includeLeads !== false,
        includeWebhooks: payload.includeWebhooks === true,
      }),
    });
    return;
  }
  if (name === "arcigy.draft_niche_smartlead_campaign_setup") {
    writeJson(response, 200, {
      result: draftNicheSmartleadCampaignSetup({
        niche: (payload.niche ?? {}) as Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["niche"],
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? (payload.emailAccountIds as Array<string | number>) : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"],
        settings: payload.settings as Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"],
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_launch_preview") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignLaunchPreview({
        niche: (payload.niche ?? {}) as Parameters<typeof buildSmartleadCampaignLaunchPreview>[0]["niche"],
        leads: (payload.leads ?? []) as Parameters<typeof buildSmartleadCampaignLaunchPreview>[0]["leads"],
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? (payload.emailAccountIds as Array<string | number>) : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof buildSmartleadCampaignLaunchPreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof buildSmartleadCampaignLaunchPreview>[0]["settings"],
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_qa_preview") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignQaPreview({
        launchPreview: payload.launchPreview as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["launchPreview"],
        campaignId: (payload.campaignId ?? null) as string | number | null,
        campaignName: optionalString(payload.campaignName),
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["leads"] : undefined,
        sequences: Array.isArray(payload.sequences) ? payload.sequences as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["sequences"] : undefined,
        schedule: payload.schedule as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["settings"],
        nextToolCalls: Array.isArray(payload.nextToolCalls) ? payload.nextToolCalls as Parameters<typeof buildSmartleadCampaignQaPreview>[0]["nextToolCalls"] : undefined,
        maxNewLeadsPerDay: typeof payload.maxNewLeadsPerDay === "number" ? payload.maxNewLeadsPerDay : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_smartlead_campaign_handoff_package_preview") {
    writeJson(response, 200, {
      result: buildSmartleadCampaignHandoffPackagePreview({
        niche: (payload.niche ?? {}) as Parameters<typeof buildSmartleadCampaignHandoffPackagePreview>[0]["niche"],
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildSmartleadCampaignHandoffPackagePreview>[0]["leads"] : [],
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? (payload.emailAccountIds as Array<string | number>) : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof buildSmartleadCampaignHandoffPackagePreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof buildSmartleadCampaignHandoffPackagePreview>[0]["settings"],
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        senderAccounts: Array.isArray(payload.senderAccounts) ? payload.senderAccounts as Parameters<typeof buildSmartleadCampaignHandoffPackagePreview>[0]["senderAccounts"] : undefined,
        requestedDailyLimit: typeof payload.requestedDailyLimit === "number" ? payload.requestedDailyLimit : undefined,
        minTimeBetweenEmailsMinutes: typeof payload.minTimeBetweenEmailsMinutes === "number" ? payload.minTimeBetweenEmailsMinutes : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.preview_lead_enrichment_batch") {
    writeJson(response, 200, {
      result: previewLeadEnrichmentBatch({
        leads: (payload.leads ?? []) as Parameters<typeof previewLeadEnrichmentBatch>[0]["leads"],
        niche: payload.niche as Parameters<typeof previewLeadEnrichmentBatch>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_enrichment_merge_preview") {
    writeJson(response, 200, {
      result: buildLeadEnrichmentMergePreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildLeadEnrichmentMergePreview>[0]["leads"] : [],
        scrapedResults: Array.isArray(payload.scrapedResults) ? payload.scrapedResults as Parameters<typeof buildLeadEnrichmentMergePreview>[0]["scrapedResults"] : undefined,
        introDrafts: Array.isArray(payload.introDrafts) ? payload.introDrafts as Parameters<typeof buildLeadEnrichmentMergePreview>[0]["introDrafts"] : undefined,
        niche: payload.niche as Parameters<typeof buildLeadEnrichmentMergePreview>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_gap_report") {
    writeJson(response, 200, {
      result: buildLeadgenGapReport({
        leads: (payload.leads ?? []) as Parameters<typeof buildLeadgenGapReport>[0]["leads"],
        niche: payload.niche as Parameters<typeof buildLeadgenGapReport>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_campaign_pipeline_preview") {
    writeJson(response, 200, {
      result: buildLeadgenCampaignPipelinePreview({
        leads: (payload.leads ?? []) as Parameters<typeof buildLeadgenCampaignPipelinePreview>[0]["leads"],
        niche: payload.niche as Parameters<typeof buildLeadgenCampaignPipelinePreview>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_source_import_queue_preview") {
    writeJson(response, 200, {
      result: buildLeadSourceImportQueuePreview({
        sourceName: optionalString(payload.sourceName),
        sourceType: ["google_maps", "csv", "serper", "manual", "other"].includes(String(payload.sourceType)) ? payload.sourceType as Parameters<typeof buildLeadSourceImportQueuePreview>[0]["sourceType"] : undefined,
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildLeadSourceImportQueuePreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildLeadSourceImportQueuePreview>[0]["niches"] : undefined,
        defaultNiche: payload.defaultNiche as Parameters<typeof buildLeadSourceImportQueuePreview>[0]["defaultNiche"],
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        existingSmartleadLeadsByCampaign: payload.existingSmartleadLeadsByCampaign as Parameters<typeof buildLeadSourceImportQueuePreview>[0]["existingSmartleadLeadsByCampaign"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_source_bundle_preview") {
    writeJson(response, 200, {
      result: buildLeadSourceBundlePreview({
        bundleName: optionalString(payload.bundleName),
        sources: Array.isArray(payload.sources) ? payload.sources as Parameters<typeof buildLeadSourceBundlePreview>[0]["sources"] : [],
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildLeadSourceBundlePreview>[0]["niches"] : undefined,
        defaultNiche: payload.defaultNiche as Parameters<typeof buildLeadSourceBundlePreview>[0]["defaultNiche"],
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        existingSmartleadLeadsByCampaign: payload.existingSmartleadLeadsByCampaign as Parameters<typeof buildLeadSourceBundlePreview>[0]["existingSmartleadLeadsByCampaign"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        auditIntros: payload.auditIntros !== false,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_source_bundle_campaign_launch_preview") {
    writeJson(response, 200, {
      result: buildLeadSourceBundleCampaignLaunchPreview({
        bundleName: optionalString(payload.bundleName),
        sources: Array.isArray(payload.sources) ? payload.sources as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["sources"] : [],
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["niches"] : undefined,
        defaultNiche: payload.defaultNiche as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["defaultNiche"],
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        existingSmartleadLeadsByCampaign: payload.existingSmartleadLeadsByCampaign as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["existingSmartleadLeadsByCampaign"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        auditIntros: payload.auditIntros !== false,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
        maxLaunchGroups: typeof payload.maxLaunchGroups === "number" ? payload.maxLaunchGroups : undefined,
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? payload.emailAccountIds as Array<string | number> : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["settings"],
        senderAccounts: Array.isArray(payload.senderAccounts) ? payload.senderAccounts as Parameters<typeof buildLeadSourceBundleCampaignLaunchPreview>[0]["senderAccounts"] : undefined,
        requestedDailyLimit: typeof payload.requestedDailyLimit === "number" ? payload.requestedDailyLimit : undefined,
        minTimeBetweenEmailsMinutes: typeof payload.minTimeBetweenEmailsMinutes === "number" ? payload.minTimeBetweenEmailsMinutes : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_url_intelligence_queue_preview") {
    writeJson(response, 200, {
      result: buildUrlIntelligenceQueuePreview({
        urls: Array.isArray(payload.urls) ? payload.urls.map(String) : undefined,
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildUrlIntelligenceQueuePreview>[0]["leads"] : undefined,
        sourceName: optionalString(payload.sourceName),
        niche: payload.niche as Parameters<typeof buildUrlIntelligenceQueuePreview>[0]["niche"],
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildUrlIntelligenceQueuePreview>[0]["niches"] : undefined,
        includeFetchPreview: payload.includeFetchPreview !== false,
        includeScrape: payload.includeScrape !== false,
        includeIntroDrafts: payload.includeIntroDrafts !== false,
        includeImportQueue: payload.includeImportQueue !== false,
        includePriorityPages: payload.includePriorityPages !== false,
        maxPages: typeof payload.maxPages === "number" ? payload.maxPages : undefined,
        maxUrls: typeof payload.maxUrls === "number" ? payload.maxUrls : undefined,
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_repair_queue_preview") {
    writeJson(response, 200, {
      result: buildLeadRepairQueuePreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildLeadRepairQueuePreview>[0]["leads"] : [],
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_orphan_lead_assignment_preview") {
    writeJson(response, 200, {
      result: buildOrphanLeadAssignmentPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildOrphanLeadAssignmentPreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildOrphanLeadAssignmentPreview>[0]["niches"] : [],
        sourceName: optionalString(payload.sourceName),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_leadgen_autopilot_batch_preview") {
    writeJson(response, 200, {
      result: buildLeadgenAutopilotBatchPreview({
        sourceName: optionalString(payload.sourceName),
        sourceType: ["google_maps", "csv", "serper", "manual", "other"].includes(String(payload.sourceType)) ? payload.sourceType as Parameters<typeof buildLeadgenAutopilotBatchPreview>[0]["sourceType"] : undefined,
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildLeadgenAutopilotBatchPreview>[0]["leads"] : undefined,
        csvText: optionalString(payload.csvText),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildLeadgenAutopilotBatchPreview>[0]["niches"] : undefined,
        defaultNiche: payload.defaultNiche as Parameters<typeof buildLeadgenAutopilotBatchPreview>[0]["defaultNiche"],
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        existingSmartleadLeadsByCampaign: payload.existingSmartleadLeadsByCampaign as Parameters<typeof buildLeadgenAutopilotBatchPreview>[0]["existingSmartleadLeadsByCampaign"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        auditIntros: payload.auditIntros !== false,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_niche_ops_dashboard_preview") {
    writeJson(response, 200, {
      result: buildNicheOpsDashboardPreview({
        niches: Array.isArray(payload.niches) ? payload.niches as Parameters<typeof buildNicheOpsDashboardPreview>[0]["niches"] : [],
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        defaultDailyTarget: typeof payload.defaultDailyTarget === "number" ? payload.defaultDailyTarget : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_cold_outreach_csv_import_preview") {
    writeJson(response, 200, {
      result: buildColdOutreachCsvImportPreview({
        csvText: String(payload.csvText ?? ""),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        blacklistDomains: Array.isArray(payload.blacklistDomains) ? payload.blacklistDomains.map(String) : undefined,
        blacklistKeywords: Array.isArray(payload.blacklistKeywords) ? payload.blacklistKeywords.map(String) : undefined,
        niche: payload.niche as Parameters<typeof buildColdOutreachCsvImportPreview>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? (payload.emailAccountIds as Array<string | number>) : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof buildColdOutreachCsvImportPreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof buildColdOutreachCsvImportPreview>[0]["settings"],
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_daily_leadgen_runbook") {
    writeJson(response, 200, {
      result: buildDailyLeadgenRunbook({
        niche: (payload.niche ?? {}) as Parameters<typeof buildDailyLeadgenRunbook>[0]["niche"],
        targetCount: typeof payload.targetCount === "number" ? payload.targetCount : undefined,
        dailyLimit: typeof payload.dailyLimit === "number" ? payload.dailyLimit : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        includeSmartleadSetup: payload.includeSmartleadSetup === true,
      }),
    });
    return;
  }
  if (name === "arcigy.build_lead_csv_mapping_preview") {
    writeJson(response, 200, {
      result: buildLeadCsvMappingPreview({
        csvText: String(payload.csvText ?? ""),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
        sourceName: optionalString(payload.sourceName),
        sourceType: ["google_maps", "csv", "serper", "manual", "other"].includes(String(payload.sourceType)) ? payload.sourceType as Parameters<typeof buildLeadCsvMappingPreview>[0]["sourceType"] : undefined,
        sampleSize: typeof payload.sampleSize === "number" ? payload.sampleSize : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.parse_leads_csv") {
    writeJson(response, 200, {
      result: parseLeadsCsv({
        csvText: String(payload.csvText ?? ""),
        delimiter: payload.delimiter === ";" ? ";" : payload.delimiter === "," ? "," : undefined,
        maxRows: typeof payload.maxRows === "number" ? payload.maxRows : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.filter_blacklisted_leads") {
    writeJson(response, 200, {
      result: filterBlacklistedLeads({
        leads: (payload.leads ?? []) as Parameters<typeof filterBlacklistedLeads>[0]["leads"],
        domains: Array.isArray(payload.domains) ? payload.domains.map(String) : undefined,
        keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String) : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_manual_review_queue") {
    writeJson(response, 200, {
      result: buildManualReviewQueue({
        leads: (payload.leads ?? []) as Parameters<typeof buildManualReviewQueue>[0]["leads"],
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.export_leads_csv") {
    const safeOutputPath = resolveRepoPath(payload.outputPath, join(repoRoot, "generated", "leads", "manual-review.csv"), "outputPath");
    const serialized = serializeLeadsCsv({
      leads: (payload.leads ?? []) as Parameters<typeof serializeLeadsCsv>[0]["leads"],
      columns: Array.isArray(payload.columns) ? payload.columns.map(String) : undefined,
    });
    mkdirSync(dirname(safeOutputPath), { recursive: true });
    writeFileSync(safeOutputPath, serialized.csvText, "utf-8");
    const responseBody = { result: { ...serialized, outputPath: safeOutputPath } };
    addAuditEvent("arcigy.export_leads_csv", "exported", payload, responseBody, true);
    writeJson(response, 200, responseBody);
    return;
  }
  if (name === "arcigy.draft_lead_intro") {
    writeJson(response, 200, {
      result: await draftLeadIntro({
        companyName: String(payload.companyName ?? ""),
        website: optionalString(payload.website),
        context: optionalString(payload.context),
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
      }),
    });
    return;
  }
  if (name === "arcigy.batch_draft_lead_intros") {
    writeJson(response, 200, {
      result: await batchDraftLeadIntros({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof batchDraftLeadIntros>[0]["leads"] : [],
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        maxLeads: typeof payload.maxLeads === "number" ? payload.maxLeads : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_ai_intro_quality_audit_preview") {
    writeJson(response, 200, {
      result: buildAiIntroQualityAuditPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildAiIntroQualityAuditPreview>[0]["leads"] : [],
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        minEvidenceTerms: typeof payload.minEvidenceTerms === "number" ? payload.minEvidenceTerms : undefined,
        maxRedrafts: typeof payload.maxRedrafts === "number" ? payload.maxRedrafts : undefined,
        maxNextCalls: typeof payload.maxNextCalls === "number" ? payload.maxNextCalls : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.build_ai_intro_cleanup_preview") {
    writeJson(response, 200, {
      result: buildAiIntroCleanupPreview({
        leads: Array.isArray(payload.leads) ? payload.leads as Parameters<typeof buildAiIntroCleanupPreview>[0]["leads"] : [],
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
        defaultSource: optionalString(payload.defaultSource),
        campaignId: typeof payload.campaignId === "string" || typeof payload.campaignId === "number" || payload.campaignId === null ? payload.campaignId : undefined,
        maxRedrafts: typeof payload.maxRedrafts === "number" ? payload.maxRedrafts : undefined,
      }),
    });
    return;
  }
  if (name === "arcigy.enrich_website_leads_preview") {
    writeJson(response, 200, {
      result: await enrichWebsiteLeadsPreview({
        leads: (payload.leads ?? []) as Parameters<typeof enrichWebsiteLeadsPreview>[0]["leads"],
        niche: payload.niche as Parameters<typeof enrichWebsiteLeadsPreview>[0]["niche"],
        campaignTag: optionalString(payload.campaignTag),
        defaultSource: optionalString(payload.defaultSource),
        offer: optionalString(payload.offer),
        painPoint: optionalString(payload.painPoint),
        language: payload.language === "en" ? "en" : "sk",
        scrapeWebsites: payload.scrapeWebsites !== false,
        draftIntros: payload.draftIntros !== false,
        includePriorityPages: payload.includePriorityPages !== false,
        maxPages: typeof payload.maxPages === "number" ? payload.maxPages : undefined,
        maxLeads: typeof payload.maxLeads === "number" ? payload.maxLeads : undefined,
        minScore: typeof payload.minScore === "number" ? payload.minScore : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
        clientId: (payload.clientId ?? null) as string | number | null,
        emailAccountIds: Array.isArray(payload.emailAccountIds) ? (payload.emailAccountIds as Array<string | number>) : undefined,
        webhookUrl: optionalString(payload.webhookUrl),
        schedule: payload.schedule as Parameters<typeof enrichWebsiteLeadsPreview>[0]["schedule"],
        settings: payload.settings as Parameters<typeof enrichWebsiteLeadsPreview>[0]["settings"],
      }),
    });
    return;
  }
  if (name === "arcigy.prepare_smartlead_leads") {
    writeJson(response, 200, {
      result: prepareSmartleadLeads({
        defaultSource: optionalString(payload.defaultSource),
        leads: (payload.leads ?? []) as Parameters<typeof prepareSmartleadLeads>[0]["leads"],
      }),
    });
    return;
  }
  if (name === "arcigy.run_leadgen_research_pipeline") {
    writeJson(response, 200, {
      result: await runLeadgenResearchPipeline({
        query: String(payload.query ?? ""),
        placesQuery: optionalString(payload.placesQuery),
        maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
        scrapeWebsites: payload.scrapeWebsites !== false,
        draftIntros: payload.draftIntros === true,
        offer: optionalString(payload.offer),
        language: payload.language === "en" ? "en" : "sk",
      }),
    });
    return;
  }
  if (name === "arcigy.fetch_url_preview") {
    writeJson(response, 200, {
      result: await fetchPublicUrlPreview({
        url: String(payload.url ?? ""),
        method: payload.method === "HEAD" ? "HEAD" : "GET",
        headers: isRecord(payload.headers) ? objectToStringRecord(payload.headers) : undefined,
        timeoutMs: typeof payload.timeoutMs === "number" ? payload.timeoutMs : undefined,
        maxBytes: typeof payload.maxBytes === "number" ? payload.maxBytes : undefined,
        parseJson: payload.parseJson === true,
      }),
    });
    return;
  }
  if (name === "arcigy.batch_fetch_url_previews") {
    writeJson(response, 200, {
      result: await batchFetchPublicUrlPreviews({
        urls: Array.isArray(payload.urls) ? payload.urls.map(String) : [],
        method: payload.method === "HEAD" ? "HEAD" : "GET",
        headers: isRecord(payload.headers) ? objectToStringRecord(payload.headers) : undefined,
        timeoutMs: typeof payload.timeoutMs === "number" ? payload.timeoutMs : undefined,
        maxBytes: typeof payload.maxBytes === "number" ? payload.maxBytes : undefined,
        parseJson: payload.parseJson === true,
        maxUrls: typeof payload.maxUrls === "number" ? payload.maxUrls : undefined,
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
  if (name === "arcigy.add_leads_to_smartlead_campaign") {
    const result = await addLeadsToSmartleadCampaign({
      campaignId: (payload.campaignId ?? "") as string | number,
      leads: (payload.leads ?? []) as Parameters<typeof addLeadsToSmartleadCampaign>[0]["leads"],
      settings: payload.settings as Parameters<typeof addLeadsToSmartleadCampaign>[0]["settings"],
    });
    const responseBody = { result };
    addAuditEvent("arcigy.add_leads_to_smartlead_campaign", "submitted", payload, responseBody, true);
    writeJson(response, 200, responseBody);
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

async function getRemoteAgentLaunchBundle(request: IncomingMessage, url: URL | null) {
  const pack = await getRemoteMcpPack(request, url);
  return {
    ...pack.agentLaunchBundle,
    generatedAt: new Date().toISOString(),
    tools: pack.tools,
    connectionPackUrl: pack.handoff.connectionPackUrl,
    secureTunnelStatus: getSecureTunnelStatus(),
    productionVerificationEvidence: getProductionVerificationEvidence(repoRoot),
  };
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

async function getJarvisCapabilityAudit(payload: Record<string, unknown>) {
  return buildJarvisCapabilityAudit({
    readiness: await buildProductionReadinessReport({
      live: payload.live === true,
      dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
    }),
    productionEvidence: getProductionVerificationEvidence(repoRoot),
  });
}

async function getProductionCompletionScore(payload: Record<string, unknown>) {
  const readiness = await buildProductionReadinessReport({
    live: payload.live === true,
    dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath"),
  });
  const productionEvidence = getProductionVerificationEvidence(repoRoot);
  const capabilityAudit = buildJarvisCapabilityAudit({ readiness, productionEvidence });
  return buildProductionCompletionScore({ readiness, productionEvidence, capabilityAudit });
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
    preparedReplyHighlights: Array.isArray(preparedReplies.replies) ? preparedReplies.replies : [],
    nextActions: readiness.nextActions,
  });
}

async function getProactiveAttentionDigest(payload: Record<string, unknown>) {
  const briefing = await getOperatorBriefing({
    ...payload,
    syncGmail: payload.syncGmail === true,
  });
  return buildProactiveAttentionDigest({ briefing });
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

async function readFormBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  const maxBytes = getMaxJsonBytes();
  let size = 0;
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, `Form body exceeds ${maxBytes} bytes.`);
  }
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw httpError(413, `Form body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf-8"));
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

  if (isProactiveAttentionDigestVoiceCommand(lowered)) {
    const digest = await getProactiveAttentionDigest({ ...payload, text });
    return voiceDone(session, text, digest.speechText);
  }

  if (lowered.includes("briefing") || lowered.includes("prehlad") || lowered.includes("co sa deje")) {
    const briefing = await getOperatorBriefing({ ...payload, text });
    return voiceDone(session, text, briefing.speechText);
  }

  if (isFullLaunchProofVoiceCommand(lowered)) {
    const report = await buildProductionReadinessReport({ live: true, dbPath: resolveRepoPath(payload.dbPath, defaultDbPath, "dbPath") });
    const evidence = getProductionVerificationEvidence(repoRoot);
    const pack = request ? await getRemoteMcpPack(request, null, { ...payload, includeReadiness: true, live: false }) : null;
    return voiceDone(session, text, summarizeFullLaunchProofForVoice(report, evidence, pack));
  }

  if (isProductionEvidenceVoiceCommand(lowered)) {
    const evidence = getProductionVerificationEvidence(repoRoot);
    return voiceDone(session, text, summarizeProductionEvidenceForVoice(evidence));
  }

  if (isProductionCompletionVoiceCommand(lowered)) {
    const score = await getProductionCompletionScore({ ...payload, live: payload.live === true || lowered.includes("live") });
    return voiceDone(session, text, summarizeProductionCompletionScoreForVoice(score));
  }

  if (isCapabilityAuditVoiceCommand(lowered)) {
    const audit = await getJarvisCapabilityAudit({ ...payload, live: payload.live === true || lowered.includes("live") });
    return voiceDone(session, text, summarizeJarvisCapabilityAuditForVoice(audit));
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

function summarizeFullLaunchProofForVoice(
  report: { status?: unknown; blockers?: Array<{ severity?: unknown; nextAction?: unknown }>; nextActions?: unknown[] },
  evidence: { status?: unknown; checks?: unknown[]; release?: unknown; freshness?: unknown },
  pack: { tools?: { count?: unknown; approvalRequired?: unknown[] }; smokeTestUrl?: unknown } | null
) {
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const blocking = blockers.filter((item) => item.severity === "blocking");
  const advisories = blockers.filter((item) => item.severity === "warning");
  const release = evidence.release && typeof evidence.release === "object" && !Array.isArray(evidence.release) ? (evidence.release as Record<string, unknown>) : {};
  const freshness = evidence.freshness && typeof evidence.freshness === "object" && !Array.isArray(evidence.freshness) ? (evidence.freshness as Record<string, unknown>) : {};
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const readyChecks = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "ready").length;
  const coreReady = evidence.status === "ready" && release.dirty === false && freshness.fresh === true && !blocking.length;
  const headline = coreReady ? (advisories.length ? "Full launch proof je ready s advisory." : "Full launch proof je ready.") : "Full launch proof potrebuje pozornost.";
  const approvalRequired = Array.isArray(pack?.tools?.approvalRequired) ? pack.tools.approvalRequired.length : 0;
  const next = blocking[0]?.nextAction ?? advisories[0]?.nextAction ?? (Array.isArray(report.nextActions) ? report.nextActions[0] : null) ?? "Keep proof fresh before remote agent handoff.";
  return [
    headline,
    `Readiness: ${String(report.status ?? "unknown")}, ${blocking.length} blocking, ${advisories.length} advisory.`,
    `Production evidence: ${String(evidence.status ?? "unknown")}, commit ${String(release.shortCommit ?? "unknown")}, tree ${release.dirty === false ? "clean" : "not clean"}, freshness ${freshness.fresh === true ? `fresh ${String(freshness.ageHours ?? "?")}h` : "stale or missing"}, checks ${readyChecks}/${checks.length}.`,
    pack ? `Remote MCP pack: ${String(pack.tools?.count ?? 0)} toolov, ${approvalRequired} approval lockov. Smoke: ${String(pack.smokeTestUrl ?? "not loaded")}.` : "Remote MCP pack nie je dostupny bez web request kontextu.",
    `Najblizsi krok: ${String(next)}`,
  ].join(" ");
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

function isFullLaunchProofVoiceCommand(text: string) {
  return ["full proof", "launch proof", "full launch", "kompletny dokaz", "uplny dokaz", "dokaz spustenia"].some((term) => text.includes(term));
}

function isProductionEvidenceVoiceCommand(text: string) {
  return ["production evidence", "verification evidence", "release proof", "evidence", "verifier", "overenie", "dokaz"].some((term) => text.includes(term));
}

function isProductionCompletionVoiceCommand(text: string) {
  return ["kolko percent", "na kolko percent", "percent hotove", "production completion", "completion score", "kolko sme ready"].some((term) => text.includes(term));
}

function isProactiveAttentionDigestVoiceCommand(text: string) {
  return ["attention digest", "co si mam vsimnut", "proaktivne", "upozorni ma", "urgentne veci"].some((term) => text.includes(term));
}

function isCapabilityAuditVoiceCommand(text: string) {
  return ["capability audit", "coverage audit", "jarvis coverage", "pokrytie", "pokryte", "co vsetko funguje", "co vsetko je hotove"].some((term) => text.includes(term));
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
      const item = raw as { title?: unknown; type?: unknown; summary?: unknown; approvalTool?: unknown; approvalPayload?: unknown };
      const title = typeof item.title === "string" ? item.title : typeof item.type === "string" ? item.type : "approval item";
      const summary = typeof item.summary === "string" ? item.summary : "bez detailu";
      const approvalTool = typeof item.approvalTool === "string" ? item.approvalTool : null;
      const payload = item.approvalPayload && typeof item.approvalPayload === "object" && !Array.isArray(item.approvalPayload) ? (item.approvalPayload as { approval?: { approved?: unknown } }) : {};
      const approvalLock = payload.approval?.approved === true ? "payload musi mat approval.approved=true" : "payload vyzaduje explicitne schvalenie";
      return `${title}: ${summary}${approvalTool ? `. Schvalovaci tool: ${approvalTool}, ${approvalLock}` : ""}`;
    })
    .filter(Boolean);
  const detail = topItems.length ? `Najblizsie: ${topItems.join("; ")}.` : "";
  return `Na tvoje potvrdenie caka ${count} veci. ${detail} Nic neposlem ani neuzavriem bez explicitneho schvalenia v approval queue.`;
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

  if (lowered.includes("vcera") || lowered.includes("yesterday")) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return { since: yesterday.toISOString(), until: today.toISOString(), periodLabel: "vcera" };
  }

  const explicitDays = lowered.match(/\b(?:poslednych|posledne|za)?\s*(\d{1,3})\s*(?:dni|den|days?)\b/);
  if (explicitDays) return rollingColdOutreachPeriod(now, Number(explicitDays[1]));

  if (lowered.includes("tyzden") || lowered.includes("week")) return rollingColdOutreachPeriod(now, 7);
  if (lowered.includes("mesiac") || lowered.includes("month")) return rollingColdOutreachPeriod(now, 30);

  return rollingColdOutreachPeriod(now, 7);
}

function rollingColdOutreachPeriod(now: Date, requestedDays: number) {
  const days = Math.min(Math.max(Math.trunc(requestedDays) || 7, 1), 365);
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until: now.toISOString(), periodLabel: `poslednych ${days} dni` };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function objectToStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
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
