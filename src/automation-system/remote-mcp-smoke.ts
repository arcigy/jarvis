import { redactSensitiveText } from "./ai-safety.ts";
import { listJarvisMcpTools, localStateWriteToolNames } from "./mcp-tools.ts";

export type RemoteMcpSmokeStatus = "ready" | "blocked";

export type RemoteMcpSmokeCheck = {
  key: string;
  status: RemoteMcpSmokeStatus;
  message: string;
};

export type RemoteMcpSmokeInput = {
  baseUrl?: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
};

export type RemoteMcpSmokeReport = {
  mode: "remote-mcp-smoke";
  status: RemoteMcpSmokeStatus;
  checkedAt: string;
  baseUrl: string;
  summary: string;
  tokenValueReturned: false;
  expectedToolCount: number;
  checks: RemoteMcpSmokeCheck[];
};

const requiredReleaseProofGates = [
  "manifest",
  "tool-count",
  "manifest-tool-registry",
  "manifest-tool-metadata",
  "auth-placeholder",
  "manifest-local-write-policy",
  "action-manifest",
  "openapi-schema",
  "cors-preflight",
  "external-auth-gate",
  "connection-pack",
  "pack-secret-policy",
  "pack-auth-throttle-policy",
  "pack-limits",
  "pack-tunnel-controls",
  "secure-tunnel-status",
  "pack-local-write-policy",
  "pack-tool-registry",
  "pack-quick-start-urls",
  "pack-quick-start-approval-policy",
  "pack-quick-start-exact-mcp-calls",
  "pack-contract-quick-start",
  "pack-contract-draft-quick-start",
  "pack-agent-setup-profiles",
  "pack-agent-launch-bundle",
  "pack-voice-quick-start",
  "pack-handoff-proof",
  "pack-agent-compatibility",
  "pack-client-memory-quick-start",
  "pack-audit-quick-start",
  "voice-tool-call",
  "pack-production-evidence-quick-start",
  "read-only-tool-call",
  "production-evidence-tool-call",
  "approval-gate",
  "approval-shape-gate",
  "secret-redaction",
];

export async function runRemoteMcpSmoke(input: RemoteMcpSmokeInput = {}): Promise<RemoteMcpSmokeReport> {
  const baseUrl = (input.baseUrl || "http://127.0.0.1:8765").replace(/\/+$/g, "");
  const fetchImpl = input.fetchImpl ?? fetch;
  const expectedToolCount = listJarvisMcpTools().length;
  const checks: RemoteMcpSmokeCheck[] = [];

  const manifest = await getJson(fetchImpl, `${baseUrl}/.well-known/arcigy-jarvis.json`, input.bearerToken);
  checks.push(check(manifest.ok, "manifest", manifest.ok ? "Manifest is reachable." : manifest.message));

  const manifestTools = Array.isArray(manifest.body?.tools) ? manifest.body.tools : [];
  checks.push(check(manifestTools.length === expectedToolCount, "tool-count", `Manifest exposes ${manifestTools.length}/${expectedToolCount} MCP tools.`));
  checks.push(
    check(
      hasExactManifestRegistry(manifestTools),
      "manifest-tool-registry",
      "Manifest exposes the exact Jarvis MCP tool registry."
    )
  );
  checks.push(
    check(
      hasValidManifestToolMetadata(manifestTools, baseUrl),
      "manifest-tool-metadata",
      "Manifest tool entries expose POST URLs and policy flags matching the MCP registry."
    )
  );
  checks.push(check(manifest.body?.auth?.header === "Authorization: Bearer <JARVIS_WEB_TOKEN>", "auth-placeholder", "Manifest returns auth placeholder, not the token value."));
  checks.push(
    check(
      hasExactToolPolicy(manifest.body?.toolPolicy),
      "manifest-local-write-policy",
      "Manifest exposes exact approval, local-write, and read-only/draft tool policy."
    )
  );

  const actionManifest = await getJson(fetchImpl, `${baseUrl}/.well-known/ai-plugin.json`, input.bearerToken);
  checks.push(
    check(
      actionManifest.ok && hasValidActionManifest(actionManifest.body, baseUrl),
      "action-manifest",
      "Remote action manifest is reachable and points to the bearer-protected OpenAPI schema."
    )
  );

  const openApi = await getJson(fetchImpl, `${baseUrl}/api/openapi.json`, input.bearerToken);
  checks.push(
    check(
      openApi.ok && hasValidOpenApiSchema(openApi.body, baseUrl),
      "openapi-schema",
      "OpenAPI action schema is reachable and maps every MCP tool to bearer-protected POST operations."
    )
  );

  const corsPreflight = await optionsRequest(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_operator_briefing`);
  checks.push(
    check(
      corsPreflight.ok,
      "cors-preflight",
      corsPreflight.ok ? "CORS preflight allows external browser-based agents without bypassing bearer-protected GET/POST calls." : corsPreflight.message
    )
  );

  const externalAuthGate = await checkExternalAuthGate(fetchImpl, baseUrl, input.bearerToken);
  checks.push(check(externalAuthGate.ok, "external-auth-gate", externalAuthGate.message));

  const pack = await getJson(fetchImpl, `${baseUrl}/api/remote-mcp-pack?includeReadiness=false`, input.bearerToken);
  checks.push(check(pack.ok, "connection-pack", pack.ok ? "Remote MCP connection pack is reachable." : pack.message));
  checks.push(check(pack.body?.auth?.tokenValueReturned === false, "pack-secret-policy", "Connection pack confirms tokenValueReturned=false."));
  checks.push(
    check(
      hasGuardedPackLimits(pack.body?.limits),
      "pack-limits",
      "Connection pack limits require repo-only paths, bounded JSON, and explicit write tool calls."
    )
  );
  checks.push(
    check(
      hasAuthThrottlePolicy(pack.body?.limits),
      "pack-auth-throttle-policy",
      "Connection pack exposes enabled external auth failure throttling with bounded attempts and a finite window."
    )
  );
  checks.push(
    check(
      hasTunnelControls(pack.body?.tunnel, baseUrl),
      "pack-tunnel-controls",
      "Connection pack exposes secure tunnel status/start/stop URLs with browser token requirements."
    )
  );
  const tunnelStatus = await getJson(fetchImpl, `${baseUrl}/api/secure-tunnel-status`, input.bearerToken);
  checks.push(
    check(
      tunnelStatus.ok && hasSafeTunnelStatus(tunnelStatus.body),
      "secure-tunnel-status",
      "Secure tunnel status endpoint is reachable and returns redacted log metadata."
    )
  );
  checks.push(
    check(
      hasExactToolPolicy(pack.body?.tools),
      "pack-local-write-policy",
      "Connection pack exposes exact approval, local-write, and read-only/draft tool policy."
    )
  );
  checks.push(
    check(
      hasExactPackRegistry(pack.body?.tools),
      "pack-tool-registry",
      "Connection pack exposes the exact Jarvis MCP tool registry."
    )
  );
  checks.push(
    check(
      hasValidQuickStartUrls(pack.body?.quickStartCalls, baseUrl),
      "pack-quick-start-urls",
      "Connection pack quick-start calls use POST URLs for registered MCP tools."
    )
  );
  checks.push(
    check(
      hasQuickStartApprovalParity(pack.body?.quickStartCalls),
      "pack-quick-start-approval-policy",
      "Connection pack quick-start calls match the MCP registry approval policy."
    )
  );
  checks.push(
    check(
      hasExactQuickStartMcpCalls(pack.body?.quickStartCalls),
      "pack-quick-start-exact-mcp-calls",
      "Connection pack quick-start calls include exact MCP call objects in parity with tool, URL, body, and approval policy."
    )
  );
  checks.push(
    check(
      hasUsableContractQuickStart(pack.body?.quickStartCalls),
      "pack-contract-quick-start",
      "Connection pack includes a usable approval-gated contract quick-start payload."
    )
  );
  checks.push(
    check(
      hasDraftContractQuickStart(pack.body?.quickStartCalls),
      "pack-contract-draft-quick-start",
      "Connection pack includes a read-only Gemini contract intake draft quick-start call."
    )
  );
  checks.push(
    check(
      hasVoiceQuickStart(pack.body?.quickStartCalls),
      "pack-voice-quick-start",
      "Connection pack includes a read-only Jarvis voice wake command quick-start call."
    )
  );
  checks.push(
    check(
      hasHandoffProof(pack.body?.handoff, baseUrl),
      "pack-handoff-proof",
      "Connection pack includes remote handoff proof URLs and first-step instructions."
    )
  );
  checks.push(
    check(
      hasAgentCompatibility(pack.body?.agentCompatibility),
      "pack-agent-compatibility",
      "Connection pack names Claude, ChatGPT, Grok, required proof, and safety rules."
    )
  );
  checks.push(
    check(
      hasAgentSetupProfiles(pack.body?.agentSetupProfiles, baseUrl),
      "pack-agent-setup-profiles",
      "Connection pack exposes structured setup profiles for Claude, ChatGPT, Grok, and generic HTTP agents."
    )
  );
  checks.push(
    check(
      hasAgentLaunchBundle(pack.body?.agentLaunchBundle, baseUrl),
      "pack-agent-launch-bundle",
      "Connection pack exposes a secret-safe remote agent launch bundle with prompts, URLs, proof policy, and tunnel controls."
    )
  );
  checks.push(
    check(
      hasClientMemoryQuickStarts(pack.body?.quickStartCalls),
      "pack-client-memory-quick-start",
      "Connection pack includes read-only client identity and open-need quick-start calls."
    )
  );
  checks.push(
    check(
      hasAuditQuickStart(pack.body?.quickStartCalls),
      "pack-audit-quick-start",
      "Connection pack includes a read-only audit trail quick-start call."
    )
  );
  checks.push(
    check(
      hasProductionEvidenceQuickStart(pack.body, baseUrl),
      "pack-production-evidence-quick-start",
      "Connection pack includes production evidence direct + voice quick-starts and a production completion score quick-start."
    )
  );

  const health = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_system_health`, { format: "json" }, input.bearerToken);
  checks.push(check(health.ok && Array.isArray(health.body?.result?.integrations), "read-only-tool-call", "Read-only MCP tool call returned integration health."));
  const voice = await postJson(
    fetchImpl,
    `${baseUrl}/api/mcp/arcigy.jarvis_voice_event`,
    { text: "Jarvis capability audit", session: { state: "idle", wakeWord: "jarvis" } },
    input.bearerToken
  );
  checks.push(
    check(
      voice.ok && hasSafeCapabilityAuditVoiceResult(voice.body?.result),
      "voice-tool-call",
      "Read-only Jarvis voice MCP call returned a live secret-safe capability audit summary."
    )
  );
  const productionEvidence = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_production_verification_evidence`, {}, input.bearerToken);
  checks.push(
    check(
      productionEvidence.ok && hasSafeProductionEvidenceResult(productionEvidence.body?.result),
      "production-evidence-tool-call",
      "Read-only production verification evidence MCP tool returned a secret-safe evidence artifact shape."
    )
  );

  const approvalGate = await checkApprovalGates(fetchImpl, baseUrl, input.bearerToken, false);
  checks.push(check(approvalGate.ok, "approval-gate", "All approval-required write tools rejected unapproved calls."));
  const topLevelApprovalGate = await checkApprovalGates(fetchImpl, baseUrl, input.bearerToken, true);
  checks.push(check(topLevelApprovalGate.ok, "approval-shape-gate", 'All approval-required write tools rejected top-level {"approved":true}.'));

  const leakedSecret = hasSensitiveLeak(
    { manifest: manifest.body, actionManifest: actionManifest.body, openApi: openApi.body, pack: pack.body, tunnelStatus: tunnelStatus.body, health: health.body, voice: voice.body, productionEvidence: productionEvidence.body, approvalGate: approvalGate.bodies, topLevelApprovalGate: topLevelApprovalGate.bodies },
    input.bearerToken
  );
  checks.push(check(!leakedSecret, "secret-redaction", "Smoke responses did not echo bearer tokens, API keys, OAuth tokens, or database URLs."));

  const status: RemoteMcpSmokeStatus = checks.every((item) => item.status === "ready") ? "ready" : "blocked";
  return {
    mode: "remote-mcp-smoke",
    status,
    checkedAt: new Date().toISOString(),
    baseUrl,
    summary:
      status === "ready"
        ? `Remote MCP smoke ready: manifest, ${expectedToolCount} tools, action manifest, OpenAPI action schema, CORS preflight, external auth gate, auth throttle policy, manifest metadata, local write policy, tunnel controls, secure tunnel status, quick-start URLs, quick-start approval policy, contract draft, contract quick-start, voice quick-start, voice tool call, client memory quick-start, audit quick-start, production evidence direct + voice quick-start, completion score quick-start, production evidence tool call, agent compatibility, structured agent setup profiles, remote agent launch bundle, handoff proof, read-only call, approval gates, and secret policy passed.`
        : `Remote MCP smoke blocked: ${checks.filter((item) => item.status === "blocked").length} check(s) failed.`,
    tokenValueReturned: false,
    expectedToolCount,
    checks,
  };
}

async function checkApprovalGates(fetchImpl: typeof fetch, baseUrl: string, bearerToken: string | undefined, topLevelApproved: boolean): Promise<{ ok: boolean; bodies: unknown[] }> {
  const payloads: Array<[string, Record<string, unknown>]> = [
    ["arcigy.generate_contract_documents", { intake: {} }],
    ["arcigy.approve_prepared_outreach_reply", { preparedEventId: "smoke-prepared-reply" }],
    ["arcigy.send_approved_outreach_reply", { preparedEventId: "smoke-prepared-reply" }],
    ["arcigy.update_client_need_status", { needSignalId: "smoke-client-need", status: "resolved" }],
    ["arcigy.export_local_memory_snapshot", { outputPath: "generated/local-memory/smoke.json" }],
    ["arcigy.append_leads_to_google_sheet", { rows: [["Smoke", "https://example.com"]] }],
    ["arcigy.add_leads_to_smartlead_campaign", { campaignId: "123", leads: [{ email: "smoke@example.com" }] }],
    ["arcigy.create_smartlead_campaign", { name: "SMOKE CAMPAIGN" }],
    ["arcigy.configure_smartlead_campaign", { campaignId: "123", schedule: { max_new_leads_per_day: 1 } }],
  ];
  const bodies = [];
  for (const [tool, payload] of payloads) {
    const response = await postJson(fetchImpl, `${baseUrl}/api/mcp/${tool}`, topLevelApproved ? { ...payload, approved: true } : payload, bearerToken);
    bodies.push(response.body);
    if (response.status !== 409) return { ok: false, bodies };
  }
  return { ok: true, bodies };
}

function hasSensitiveLeak(value: unknown, bearerToken?: string): boolean {
  const text = JSON.stringify(value);
  return (
    Boolean(bearerToken && text.includes(bearerToken)) ||
    /AIza[0-9A-Za-z_-]{20,}/.test(text) ||
    /GOCSPX-[0-9A-Za-z_-]{10,}/.test(text) ||
    /1\/\/[0-9A-Za-z_-]{20,}/.test(text) ||
    /(postgres(?:ql)?|redis):\/\/[^:\s/@]+:[^@\s]+@/i.test(text) ||
    /\b[0-9a-f]{32,}\b/i.test(text) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{8,}\b/i.test(text)
  );
}

function check(ok: boolean, key: string, message: string): RemoteMcpSmokeCheck {
  return {
    key,
    status: ok ? "ready" : "blocked",
    message,
  };
}

function hasGuardedPackLimits(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const limits = value as { maxJsonBytes?: unknown; pathPolicy?: unknown; writesRequireExplicitToolCall?: unknown };
  return (
    typeof limits.maxJsonBytes === "number" &&
    Number.isFinite(limits.maxJsonBytes) &&
    limits.maxJsonBytes > 0 &&
    limits.pathPolicy === "repo-only" &&
    limits.writesRequireExplicitToolCall === true
  );
}

function hasAuthThrottlePolicy(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const throttle = (value as { authFailureThrottle?: unknown }).authFailureThrottle as
    | { enabled?: unknown; limit?: unknown; windowMs?: unknown; scope?: unknown }
    | undefined;
  return (
    throttle?.enabled === true &&
    typeof throttle.limit === "number" &&
    Number.isFinite(throttle.limit) &&
    throttle.limit > 0 &&
    typeof throttle.windowMs === "number" &&
    Number.isFinite(throttle.windowMs) &&
    throttle.windowMs > 0 &&
    throttle.scope === "external-host-and-client"
  );
}

function hasTunnelControls(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const tunnel = value as {
    provider?: unknown;
    secureCommand?: unknown;
    standardCommand?: unknown;
    statusUrl?: unknown;
    startUrl?: unknown;
    stopUrl?: unknown;
    browserStartRequiresStrongToken?: unknown;
  };
  return (
    tunnel.provider === "ngrok" &&
    tunnel.secureCommand === "npm run web:tunnel:secure" &&
    tunnel.standardCommand === "npm run web:tunnel" &&
    tunnel.statusUrl === `${baseUrl}/api/secure-tunnel-status` &&
    tunnel.startUrl === `${baseUrl}/api/start-secure-tunnel` &&
    tunnel.stopUrl === `${baseUrl}/api/stop-secure-tunnel` &&
    tunnel.browserStartRequiresStrongToken === true
  );
}

function hasSafeTunnelStatus(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = value as { ready?: unknown; logPath?: unknown; tokenPresent?: unknown; redactedTail?: unknown; publicUrl?: unknown };
  if (typeof status.ready !== "boolean") return false;
  if (status.logPath !== undefined && typeof status.logPath !== "string") return false;
  if (status.tokenPresent !== undefined && typeof status.tokenPresent !== "boolean") return false;
  if (typeof status.redactedTail === "string" && /One-time token:\s+(?!\[redacted\])\S+/i.test(status.redactedTail)) return false;
  return status.publicUrl === undefined || status.publicUrl === null || /^https:\/\/[^/\s]+/.test(String(status.publicUrl));
}

function hasExactToolPolicy(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const policy = value as { approvalRequired?: unknown; localStateWrite?: unknown; readOnlyOrDraft?: unknown };
  return (
    Array.isArray(policy.approvalRequired) &&
    Array.isArray(policy.localStateWrite) &&
    Array.isArray(policy.readOnlyOrDraft) &&
    sameStringArray(policy.approvalRequired, approvalRequiredToolNames()) &&
    sameStringArray(policy.localStateWrite, localStateWriteToolNamesList()) &&
    sameStringArray(policy.readOnlyOrDraft, readOnlyOrDraftToolNames())
  );
}

function hasExactManifestRegistry(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return sameStringArray(
    value.map((item) => (item && typeof item === "object" ? (item as { name?: unknown }).name : null)),
    expectedToolNames()
  );
}

function hasValidActionManifest(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const manifest = value as {
    schema_version?: unknown;
    name_for_model?: unknown;
    auth?: { type?: unknown; authorization_type?: unknown; verification_tokens?: unknown };
    api?: { type?: unknown; url?: unknown; is_user_authenticated?: unknown };
    "x-arcigy-policy"?: { tokenValueReturned?: unknown; familyFriendly?: unknown };
  };
  return (
    manifest.schema_version === "v1" &&
    manifest.name_for_model === "arcigy_jarvis" &&
    manifest.auth?.type === "user_http" &&
    manifest.auth.authorization_type === "bearer" &&
    manifest.api?.type === "openapi" &&
    manifest.api.url === `${baseUrl}/api/openapi.json` &&
    manifest.api.is_user_authenticated === true &&
    manifest["x-arcigy-policy"]?.tokenValueReturned === false &&
    manifest["x-arcigy-policy"]?.familyFriendly === true
  );
}

function hasValidOpenApiSchema(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const document = value as {
    openapi?: unknown;
    servers?: unknown;
    paths?: unknown;
    components?: { securitySchemes?: { bearerAuth?: { type?: unknown; scheme?: unknown; bearerFormat?: unknown } } };
    "x-arcigy-policy"?: { tokenValueReturned?: unknown; familyFriendly?: unknown };
    "x-arcigy-agent-setup"?: unknown;
  };
  const server = Array.isArray(document.servers) ? document.servers[0] as { url?: unknown } | undefined : undefined;
  const paths = document.paths && typeof document.paths === "object" ? document.paths as Record<string, unknown> : null;
  if (document.openapi !== "3.1.0" || server?.url !== baseUrl || !paths) return false;
  if (document.components?.securitySchemes?.bearerAuth?.type !== "http") return false;
  if (document.components.securitySchemes.bearerAuth.scheme !== "bearer") return false;
  if (document.components.securitySchemes.bearerAuth.bearerFormat !== "JARVIS_WEB_TOKEN") return false;
  if (document["x-arcigy-policy"]?.tokenValueReturned !== false || document["x-arcigy-policy"]?.familyFriendly !== true) return false;
  if (!hasValidOpenApiAgentSetup(document["x-arcigy-agent-setup"], baseUrl)) return false;
  const names = expectedToolNames();
  const pathKeys = Object.keys(paths);
  if (!sameStringArray(pathKeys, names.map((name) => `/api/mcp/${name}`))) return false;
  const approvalPolicy = new Map<string, boolean>(listJarvisMcpTools().map((tool) => [tool.name, tool.requiresApproval]));
  return names.every((name) => {
    const entry = paths[`/api/mcp/${name}`];
    if (!entry || typeof entry !== "object") return false;
    const post = (entry as { post?: unknown }).post as {
      security?: unknown;
      requestBody?: { content?: { "application/json"?: { schema?: { $ref?: unknown }; examples?: { quickStart?: { value?: unknown } } } } };
    } | undefined;
    const security = Array.isArray(post?.security) ? post.security[0] as { bearerAuth?: unknown } | undefined : undefined;
    const jsonContent = post?.requestBody?.content?.["application/json"];
    const schemaRef = jsonContent?.schema?.$ref;
    return (
      Array.isArray(security?.bearerAuth) &&
      schemaRef === (approvalPolicy.get(name) ? "#/components/schemas/ApprovalCapablePayload" : "#/components/schemas/GenericMcpPayload") &&
      hasSafeOpenApiExample(name, jsonContent?.examples?.quickStart?.value)
    );
  });
}

function hasValidOpenApiAgentSetup(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const setup = value as {
    supportedAgents?: unknown;
    recommendedImports?: Record<string, unknown>;
    firstTools?: unknown;
    proofPolicy?: { freshnessMaxAgeHours?: unknown; beforeAnyWork?: unknown; beforeWrites?: unknown };
    safetyRails?: unknown;
  };
  const supportedAgents = Array.isArray(setup.supportedAgents) ? setup.supportedAgents : [];
  const firstTools = Array.isArray(setup.firstTools) ? setup.firstTools : [];
  const beforeAnyWork = Array.isArray(setup.proofPolicy?.beforeAnyWork) ? setup.proofPolicy.beforeAnyWork : [];
  const beforeWrites = Array.isArray(setup.proofPolicy?.beforeWrites) ? setup.proofPolicy.beforeWrites : [];
  const safetyRails = Array.isArray(setup.safetyRails) ? setup.safetyRails : [];
  return (
    ["Claude", "ChatGPT", "Grok"].every((agent) => supportedAgents.includes(agent)) &&
    setup.recommendedImports?.actionManifestUrl === `${baseUrl}/.well-known/ai-plugin.json` &&
    setup.recommendedImports?.openApiSchemaUrl === `${baseUrl}/api/openapi.json` &&
    setup.recommendedImports?.connectionPackUrl === `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true` &&
    setup.recommendedImports?.smokeTestUrl === `${baseUrl}/api/remote-mcp-smoke` &&
    setup.recommendedImports?.productionVerificationEvidenceUrl === `${baseUrl}/api/production-verification-evidence` &&
    setup.recommendedImports?.mcpToolCallPattern === `${baseUrl}/api/mcp/{toolName}` &&
    firstTools.includes("arcigy.get_operator_briefing") &&
    firstTools.includes("arcigy.get_jarvis_capability_audit") &&
    firstTools.includes("arcigy.get_production_completion_score") &&
    firstTools.includes("arcigy.get_production_verification_evidence") &&
    setup.proofPolicy?.freshnessMaxAgeHours === 24 &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("smokeTestUrl") && step.includes("status=ready") && step.includes("all 37 required remote MCP smoke gates")) &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("arcigy.get_production_completion_score") && step.includes("quick-start coverage")) &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("productionVerificationEvidenceUrl") && step.includes("freshness.fresh=true")) &&
    beforeWrites.some((step) => typeof step === "string" && step.includes("approval.approved=true")) &&
    safetyRails.some((rail) => typeof rail === "string" && rail.includes("family-friendly")) &&
    safetyRails.some((rail) => typeof rail === "string" && rail.includes("OAuth refresh tokens"))
  );
}

function hasSafeOpenApiExample(toolName: string, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (/AIza|GOCSPX|1\/\/|postgres(?:ql)?:\/\/|redis:\/\//i.test(JSON.stringify(payload))) return false;
  if (toolName === "arcigy.get_operator_briefing") return payload.live === false && payload.syncGmail === false;
  if (toolName === "arcigy.get_proactive_attention_digest") return payload.live === false && payload.syncGmail === false;
  if (toolName === "arcigy.sync_gmail_recent_messages") return payload.dryRun === true;
  if (toolName === "arcigy.identify_email") return typeof payload.email === "string" && payload.email.includes("@");
  if (toolName === "arcigy.generate_contract_documents") return (payload.approval as { approved?: unknown } | undefined)?.approved === true && typeof payload.intake === "object";
  if (toolName === "arcigy.append_leads_to_google_sheet") return (payload.approval as { approved?: unknown } | undefined)?.approved === true && Array.isArray(payload.rows);
  if (toolName === "arcigy.add_leads_to_smartlead_campaign") return (payload.approval as { approved?: unknown } | undefined)?.approved === true && Array.isArray(payload.leads);
  if (toolName === "arcigy.create_smartlead_campaign") return (payload.approval as { approved?: unknown } | undefined)?.approved === true && typeof payload.name === "string";
  if (toolName === "arcigy.configure_smartlead_campaign") return (payload.approval as { approved?: unknown } | undefined)?.approved === true && typeof payload.campaignId !== "undefined";
  return true;
}

function hasValidManifestToolMetadata(value: unknown, baseUrl: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const approvalPolicy = new Map<string, boolean>(listJarvisMcpTools().map((tool) => [tool.name, tool.requiresApproval]));
  const localWritePolicy = new Set<string>(localStateWriteToolNames);
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const tool = item as {
      name?: unknown;
      method?: unknown;
      url?: unknown;
      approval?: { required?: unknown; field?: unknown };
      localStateWrite?: unknown;
      readOnlyOrDraft?: unknown;
    };
    if (typeof tool.name !== "string" || !approvalPolicy.has(tool.name)) return false;
    const requiresApproval = approvalPolicy.get(tool.name);
    const localWrite = localWritePolicy.has(tool.name);
    return (
      tool.method === "POST" &&
      tool.url === `${baseUrl}/api/mcp/${tool.name}` &&
      tool.approval?.required === requiresApproval &&
      (requiresApproval ? tool.approval?.field === "approval.approved" : !("field" in (tool.approval ?? {}))) &&
      tool.localStateWrite === localWrite &&
      tool.readOnlyOrDraft === (!requiresApproval && !localWrite)
    );
  });
}

function hasExactPackRegistry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const names = (value as { names?: unknown }).names;
  return Array.isArray(names) && sameStringArray(names, expectedToolNames());
}

function expectedToolNames(): string[] {
  return listJarvisMcpTools().map((tool) => tool.name);
}

function approvalRequiredToolNames(): string[] {
  return listJarvisMcpTools().filter((tool) => tool.requiresApproval).map((tool) => tool.name);
}

function localStateWriteToolNamesList(): string[] {
  const localWritePolicy = new Set<string>(localStateWriteToolNames);
  return listJarvisMcpTools().filter((tool) => localWritePolicy.has(tool.name)).map((tool) => tool.name);
}

function readOnlyOrDraftToolNames(): string[] {
  const localWritePolicy = new Set<string>(localStateWriteToolNames);
  return listJarvisMcpTools().filter((tool) => !tool.requiresApproval && !localWritePolicy.has(tool.name)).map((tool) => tool.name);
}

function sameStringArray(actual: unknown[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function hasValidQuickStartUrls(value: unknown, baseUrl: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const names = new Set(expectedToolNames());
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const call = item as { tool?: unknown; method?: unknown; url?: unknown };
    return (
      typeof call.tool === "string" &&
      names.has(call.tool) &&
      call.method === "POST" &&
      call.url === `${baseUrl}/api/mcp/${call.tool}`
    );
  });
}

function hasQuickStartApprovalParity(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const policy = new Map<string, boolean>(listJarvisMcpTools().map((tool) => [tool.name, tool.requiresApproval]));
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const call = item as { tool?: unknown; approvalRequired?: unknown };
    return typeof call.tool === "string" && policy.has(call.tool) && call.approvalRequired === policy.get(call.tool);
  });
}

function hasExactQuickStartMcpCalls(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const call = item as {
      tool?: unknown;
      method?: unknown;
      url?: unknown;
      body?: unknown;
      approvalRequired?: unknown;
      exactMcpCall?: { tool?: unknown; method?: unknown; url?: unknown; body?: unknown; approvalRequired?: unknown };
    };
    return (
      call.exactMcpCall?.tool === call.tool &&
      call.exactMcpCall?.method === call.method &&
      call.exactMcpCall?.url === call.url &&
      call.exactMcpCall?.approvalRequired === call.approvalRequired &&
      JSON.stringify(call.exactMcpCall?.body ?? null) === JSON.stringify(call.body ?? null)
    );
  });
}

function hasUsableContractQuickStart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as { tool?: unknown }).tool === "arcigy.generate_contract_documents";
  }) as { approvalRequired?: unknown; body?: { approval?: { approved?: unknown }; intake?: unknown } } | undefined;
  if (!call || call.approvalRequired !== true || call.body?.approval?.approved !== true) return false;
  const intake = call.body.intake as { client?: { businessName?: unknown; email?: unknown }; project?: { includedModules?: unknown }; pricing?: unknown } | undefined;
  if (!intake || typeof intake !== "object") return false;
  const hasRequiredShape =
    typeof intake.client?.businessName === "string" &&
    typeof intake.client?.email === "string" &&
    Array.isArray(intake.project?.includedModules) &&
    Boolean(intake.pricing);
  return hasRequiredShape && !/dopln|todo|tbd|xxx|\?\?\?/i.test(JSON.stringify(call.body));
}

function hasDraftContractQuickStart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as { tool?: unknown }).tool === "arcigy.draft_contract_intake";
  }) as { approvalRequired?: unknown; body?: { brief?: unknown; outputDir?: unknown; approval?: unknown } } | undefined;
  return call?.approvalRequired === false && typeof call.body?.brief === "string" && call.body.brief.length >= 40 && !("outputDir" in (call.body ?? {})) && !("approval" in (call.body ?? {}));
}

function hasVoiceQuickStart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as { tool?: unknown; body?: { text?: unknown } };
    return candidate.tool === "arcigy.jarvis_voice_event" && candidate.body?.text === "Jarvis capability audit";
  }) as { approvalRequired?: unknown; method?: unknown; body?: { text?: unknown; session?: { state?: unknown; wakeWord?: unknown }; approval?: unknown; dbPath?: unknown; live?: unknown } } | undefined;
  return (
    call?.approvalRequired === false &&
    call.method === "POST" &&
    call.body?.session?.state === "idle" &&
    call.body.session.wakeWord === "jarvis" &&
    !("approval" in (call.body ?? {})) &&
    !("dbPath" in (call.body ?? {})) &&
    !("live" in (call.body ?? {}))
  );
}

function hasHandoffProof(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const handoff = value as { connectionPackUrl?: unknown; requiredProof?: unknown; agentFirstSteps?: unknown };
  if (handoff.connectionPackUrl !== `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`) return false;
  const requiredProof = Array.isArray(handoff.requiredProof) ? handoff.requiredProof : [];
  const agentFirstSteps = Array.isArray(handoff.agentFirstSteps) ? handoff.agentFirstSteps : [];
  const proofKeys = new Set(requiredProof.map((item) => (item && typeof item === "object" ? (item as { key?: unknown }).key : null)));
  const remoteSmokeProof = requiredProof.find((item) => item && typeof item === "object" && (item as { key?: unknown }).key === "remote-smoke") as
    | { expected?: unknown }
    | undefined;
  const remoteSmokeExpected = typeof remoteSmokeProof?.expected === "string" ? remoteSmokeProof.expected : "";
  return (
    proofKeys.has("action-manifest") &&
    proofKeys.has("openapi-schema") &&
    proofKeys.has("manifest") &&
    proofKeys.has("connection-pack") &&
    proofKeys.has("secure-tunnel-status") &&
    proofKeys.has("production-verification-evidence") &&
    proofKeys.has("remote-smoke") &&
    [
      "action-manifest",
      "openapi-schema",
      "cors-preflight",
      "external-auth-gate",
      "pack-auth-throttle-policy",
      "pack-limits",
      "pack-agent-setup-profiles",
      "pack-agent-launch-bundle",
      "pack-voice-quick-start",
      "voice-tool-call",
      "pack-production-evidence-quick-start",
      "production-evidence-tool-call",
      "approval-shape-gate",
      "secret-redaction",
      "dirty=false",
      "freshness.fresh=true",
    ].every((key) => remoteSmokeExpected.includes(key)) &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score")) &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("arcigy.get_operator_briefing")) &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("status=ready"))
  );
}

function hasAgentCompatibility(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const compatibility = value as { supportedAgents?: unknown; requiredBeforeWork?: unknown; safetyRules?: unknown };
  const agents = Array.isArray(compatibility.supportedAgents) ? compatibility.supportedAgents : [];
  const requiredBeforeWork = Array.isArray(compatibility.requiredBeforeWork) ? compatibility.requiredBeforeWork : [];
  const safetyRules = Array.isArray(compatibility.safetyRules) ? compatibility.safetyRules : [];
  return (
    ["Claude", "ChatGPT", "Grok"].every((agent) => agents.includes(agent)) &&
    requiredBeforeWork.some((step) => typeof step === "string" && step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score")) &&
    requiredBeforeWork.some((step) => typeof step === "string" && step.includes("status=ready")) &&
    safetyRules.some((rule) => typeof rule === "string" && rule.includes("approvalRequired")) &&
    safetyRules.some((rule) => typeof rule === "string" && rule.includes("family-friendly"))
  );
}

function hasAgentSetupProfiles(value: unknown, baseUrl: string): boolean {
  if (!Array.isArray(value)) return false;
  const profiles = new Map(
    value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => [item.agent, item])
  );
  const expected = [
    ["Claude", "external-http-mcp", `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`],
    ["ChatGPT", "openapi-custom-action", `${baseUrl}/api/openapi.json`],
    ["Grok", "openapi-or-http-json", `${baseUrl}/api/openapi.json`],
    ["Generic HTTP agent", "openapi-or-http-json", `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`],
  ];
  return expected.every(([agent, setupMode, importUrl]) => {
    const profile = profiles.get(agent);
    const gates = Array.isArray(profile?.requiredProofGates) ? profile.requiredProofGates : [];
    return (
      profile?.setupMode === setupMode &&
      profile?.importUrl === importUrl &&
      profile?.firstTool === "arcigy.get_operator_briefing" &&
      profile?.firstToolUrl === `${baseUrl}/api/mcp/arcigy.get_operator_briefing` &&
      profile?.writePolicy === "approval.approved-required" &&
      profile?.localWritePolicy === "dry-run-first" &&
      [
        "action-manifest",
        "openapi-schema",
        "cors-preflight",
        "external-auth-gate",
        "pack-auth-throttle-policy",
        "pack-limits",
        "pack-agent-setup-profiles",
        "pack-agent-launch-bundle",
        "pack-voice-quick-start",
        "voice-tool-call",
        "pack-production-evidence-quick-start",
        "production-evidence-tool-call",
        "approval-gate",
        "approval-shape-gate",
        "secret-redaction",
      ].every((gate) => gates.includes(gate))
    );
  });
}

function hasAgentLaunchBundle(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const bundle = value as {
    mode?: unknown;
    publicBaseUrl?: unknown;
    authHeaderPlaceholder?: unknown;
    shareWithAgent?: Record<string, unknown>;
    operatorControls?: Record<string, unknown>;
    firstPrompts?: Record<string, unknown>;
    proofPolicy?: { freshnessMaxAgeHours?: unknown; beforeAnyWork?: unknown; beforeWrites?: unknown };
    safetyRails?: unknown;
  };
  const share = bundle.shareWithAgent ?? {};
  const controls = bundle.operatorControls ?? {};
  const prompts = bundle.firstPrompts ?? {};
  const beforeAnyWork = Array.isArray(bundle.proofPolicy?.beforeAnyWork) ? bundle.proofPolicy.beforeAnyWork : [];
  const beforeWrites = Array.isArray(bundle.proofPolicy?.beforeWrites) ? bundle.proofPolicy.beforeWrites : [];
  const safetyRails = Array.isArray(bundle.safetyRails) ? bundle.safetyRails : [];
  return (
    bundle.mode === "remote-agent-launch-bundle" &&
    bundle.publicBaseUrl === baseUrl &&
    bundle.authHeaderPlaceholder === "Authorization: Bearer <JARVIS_WEB_TOKEN>" &&
    share.connectionPackUrl === `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true` &&
    share.actionManifestUrl === `${baseUrl}/.well-known/ai-plugin.json` &&
    share.manifestUrl === `${baseUrl}/.well-known/arcigy-jarvis.json` &&
    share.openApiSchemaUrl === `${baseUrl}/api/openapi.json` &&
    share.smokeTestUrl === `${baseUrl}/api/remote-mcp-smoke` &&
    share.productionVerificationEvidenceUrl === `${baseUrl}/api/production-verification-evidence` &&
    share.mcpToolCallPattern === `${baseUrl}/api/mcp/{toolName}` &&
    controls.secureTunnelCommand === "npm run web:tunnel:secure" &&
    controls.tunnelStatusUrl === `${baseUrl}/api/secure-tunnel-status` &&
    controls.startTunnelUrl === `${baseUrl}/api/start-secure-tunnel` &&
    controls.stopTunnelUrl === `${baseUrl}/api/stop-secure-tunnel` &&
    ["Claude", "ChatGPT", "Grok", "Generic HTTP agent"].every(
      (agent) =>
        typeof prompts[agent] === "string" &&
        String(prompts[agent]).includes("arcigy.get_operator_briefing") &&
        String(prompts[agent]).includes("arcigy.get_jarvis_capability_audit") &&
        String(prompts[agent]).includes("arcigy.get_production_completion_score")
    ) &&
    bundle.proofPolicy?.freshnessMaxAgeHours === 24 &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("tokenValueReturned=false")) &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score") && step.includes("quick-start coverage")) &&
    beforeAnyWork.some((step) => typeof step === "string" && step.includes("status=ready") && step.includes("all 37 required remote MCP smoke gates")) &&
    beforeWrites.some((step) => typeof step === "string" && step.includes("freshness.fresh=true")) &&
    beforeWrites.some((step) => typeof step === "string" && step.includes("approval.approved=true")) &&
    safetyRails.some((rail) => typeof rail === "string" && rail.includes("OAuth refresh tokens")) &&
    safetyRails.some((rail) => typeof rail === "string" && rail.includes("family-friendly"))
  );
}

function hasClientMemoryQuickStarts(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const identify = value.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.identify_email") as
    | { approvalRequired?: unknown; body?: { email?: unknown } }
    | undefined;
  const alerts = value.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.get_client_need_alerts") as
    | { approvalRequired?: unknown; body?: { status?: unknown; limit?: unknown } }
    | undefined;
  return (
    identify?.approvalRequired === false &&
    typeof identify.body?.email === "string" &&
    alerts?.approvalRequired === false &&
    alerts.body?.status === "new" &&
    typeof alerts.body?.limit === "number"
  );
}

function hasAuditQuickStart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.get_audit_events") as
    | { approvalRequired?: unknown; body?: { limit?: unknown; automationKey?: unknown; status?: unknown } }
    | undefined;
  return call?.approvalRequired === false && call.body?.limit === 20 && !("automationKey" in (call.body ?? {})) && !("status" in (call.body ?? {}));
}

function hasProductionEvidenceQuickStart(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const pack = value as { productionVerificationEvidenceUrl?: unknown; quickStartCalls?: unknown };
  if (pack.productionVerificationEvidenceUrl !== `${baseUrl}/api/production-verification-evidence`) return false;
  if (!Array.isArray(pack.quickStartCalls)) return false;
  const evidenceCall = pack.quickStartCalls.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.get_production_verification_evidence") as
    | { approvalRequired?: unknown; method?: unknown; url?: unknown; body?: unknown }
    | undefined;
  const completionCall = pack.quickStartCalls.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.get_production_completion_score") as
    | { approvalRequired?: unknown; method?: unknown; url?: unknown; body?: { live?: unknown; approval?: unknown } }
    | undefined;
  const voiceCall = pack.quickStartCalls.find((item) => {
    if (!item || typeof item !== "object") return false;
    const call = item as { tool?: unknown; body?: { text?: unknown } };
    return call.tool === "arcigy.jarvis_voice_event" && call.body?.text === "Jarvis production evidence";
  }) as { approvalRequired?: unknown; method?: unknown; url?: unknown; body?: { session?: { state?: unknown; wakeWord?: unknown }; approval?: unknown } } | undefined;
  return (
    evidenceCall?.approvalRequired === false &&
    evidenceCall.method === "POST" &&
    evidenceCall.url === `${baseUrl}/api/mcp/arcigy.get_production_verification_evidence` &&
    isEmptyRecord(evidenceCall.body) &&
    completionCall?.approvalRequired === false &&
    completionCall.method === "POST" &&
    completionCall.url === `${baseUrl}/api/mcp/arcigy.get_production_completion_score` &&
    completionCall.body?.live === false &&
    !("approval" in (completionCall.body ?? {})) &&
    voiceCall?.approvalRequired === false &&
    voiceCall.method === "POST" &&
    voiceCall.url === `${baseUrl}/api/mcp/arcigy.jarvis_voice_event` &&
    voiceCall.body?.session?.state === "idle" &&
    voiceCall.body.session.wakeWord === "jarvis" &&
    !("approval" in (voiceCall.body ?? {}))
  );
}

function hasSafeCapabilityAuditVoiceResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as { session?: { state?: unknown; lastResponse?: unknown }; shouldStopRecording?: unknown; speakText?: unknown };
  if (result.session?.state !== "idle" || result.shouldStopRecording !== true || typeof result.speakText !== "string") return false;
  if (result.session.lastResponse !== result.speakText) return false;
  return (
    /Jarvis capability audit je/i.test(result.speakText) &&
    /Coverage: \d+\/\d+ skupin ready/i.test(result.speakText) &&
    /MCP: \d+ toolov/i.test(result.speakText) &&
    /Evidence:/i.test(result.speakText)
  );
}

function hasSafeProductionEvidenceResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = value as { mode?: unknown; status?: unknown; generatedAt?: unknown; summary?: unknown; checks?: unknown; release?: unknown; freshness?: unknown };
  if (evidence.mode !== "arcigy-jarvis-production-verification") return false;
  if (typeof evidence.status !== "string" || !["ready", "attention", "missing", "failed"].includes(evidence.status)) return false;
  if (!(typeof evidence.generatedAt === "string" || evidence.generatedAt === null)) return false;
  if (typeof evidence.summary !== "string" || !evidence.summary.trim()) return false;
  if (!Array.isArray(evidence.checks)) return false;
  return evidence.status === "ready" && hasSafeReleaseProof(evidence.release) && hasFreshProductionEvidence(evidence.freshness);
}

function hasFreshProductionEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const freshness = value as { fresh?: unknown; ageHours?: unknown; maxAgeHours?: unknown; checkedAt?: unknown; detail?: unknown };
  return (
    freshness.fresh === true &&
    typeof freshness.ageHours === "number" &&
    freshness.ageHours >= 0 &&
    freshness.maxAgeHours === 24 &&
    typeof freshness.checkedAt === "string" &&
    typeof freshness.detail === "string" &&
    freshness.detail.length > 0
  );
}

function hasSafeReleaseProof(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const release = value as { repository?: unknown; branch?: unknown; shortCommit?: unknown; dirty?: unknown; requiredRemoteMcpSmokeGates?: unknown };
  const gates = Array.isArray(release.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates : [];
  return (
    release.repository === "arcigy/jarvis" &&
    typeof release.branch === "string" &&
    /^[0-9a-f]{7,12}$/i.test(String(release.shortCommit ?? "")) &&
    release.dirty === false &&
    requiredReleaseProofGates.every((gate) => gates.includes(gate))
  );
}

function isEmptyRecord(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

async function getJson(fetchImpl: typeof fetch, url: string, bearerToken?: string) {
  try {
    const response = await fetchImpl(url, { headers: requestHeaders(bearerToken) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, message: response.ok ? "OK" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, body: null, message: safeErrorMessage(error) };
  }
}

async function postJson(fetchImpl: typeof fetch, url: string, payload: unknown, bearerToken?: string) {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...requestHeaders(bearerToken) },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, message: response.ok ? "OK" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, body: null, message: safeErrorMessage(error) };
  }
}

async function optionsRequest(fetchImpl: typeof fetch, url: string) {
  try {
    const response = await fetchImpl(url, {
      method: "OPTIONS",
      headers: {
        origin: "https://chat.openai.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    const allowOrigin = response.headers.get("access-control-allow-origin") || "";
    const allowMethods = response.headers.get("access-control-allow-methods") || "";
    const allowHeaders = response.headers.get("access-control-allow-headers") || "";
    const ok =
      response.status === 204 &&
      allowOrigin === "*" &&
      /\bPOST\b/i.test(allowMethods) &&
      /\bOPTIONS\b/i.test(allowMethods) &&
      /authorization/i.test(allowHeaders) &&
      /content-type/i.test(allowHeaders);
    return { ok, status: response.status, message: ok ? "OK" : `HTTP ${response.status} missing required CORS headers` };
  } catch (error) {
    return { ok: false, status: 0, message: safeErrorMessage(error) };
  }
}

async function checkExternalAuthGate(fetchImpl: typeof fetch, baseUrl: string, bearerToken?: string) {
  if (isLocalBaseUrl(baseUrl)) {
    return { ok: true, message: "Localhost smoke uses the desktop/local auth bypass; external tunnel auth is enforced when the public URL is tested." };
  }
  if (!bearerToken) {
    return { ok: false, message: "External smoke requires a bearer token to prove unauthenticated requests are rejected." };
  }
  const manifest = await getJson(fetchImpl, `${baseUrl}/.well-known/arcigy-jarvis.json`);
  const toolCall = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_system_health`, { format: "json" });
  const ok = manifest.status === 401 && toolCall.status === 401;
  return {
    ok,
    message: ok ? "External manifest and MCP POST reject missing bearer tokens with HTTP 401." : `Expected HTTP 401 without bearer token, got manifest=${manifest.status}, mcpPost=${toolCall.status}.`,
  };
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error));
}

function requestHeaders(bearerToken?: string): Record<string, string> {
  return {
    connection: "close",
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
  };
}
