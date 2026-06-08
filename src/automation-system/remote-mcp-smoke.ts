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

  const openApi = await getJson(fetchImpl, `${baseUrl}/api/openapi.json`, input.bearerToken);
  checks.push(
    check(
      openApi.ok && hasValidOpenApiSchema(openApi.body, baseUrl),
      "openapi-schema",
      "OpenAPI action schema is reachable and maps every MCP tool to bearer-protected POST operations."
    )
  );

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

  const health = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_system_health`, { format: "json" }, input.bearerToken);
  checks.push(check(health.ok && Array.isArray(health.body?.result?.integrations), "read-only-tool-call", "Read-only MCP tool call returned integration health."));

  const approvalGate = await checkApprovalGates(fetchImpl, baseUrl, input.bearerToken, false);
  checks.push(check(approvalGate.ok, "approval-gate", "All approval-required write tools rejected unapproved calls."));
  const topLevelApprovalGate = await checkApprovalGates(fetchImpl, baseUrl, input.bearerToken, true);
  checks.push(check(topLevelApprovalGate.ok, "approval-shape-gate", 'All approval-required write tools rejected top-level {"approved":true}.'));

  const leakedSecret = hasSensitiveLeak(
    { manifest: manifest.body, openApi: openApi.body, pack: pack.body, tunnelStatus: tunnelStatus.body, health: health.body, approvalGate: approvalGate.bodies, topLevelApprovalGate: topLevelApprovalGate.bodies },
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
        ? `Remote MCP smoke ready: manifest, ${expectedToolCount} tools, OpenAPI action schema, manifest metadata, local write policy, tunnel controls, secure tunnel status, quick-start URLs, quick-start approval policy, contract draft, contract quick-start, client memory quick-start, audit quick-start, agent compatibility, handoff proof, read-only call, approval gates, and secret policy passed.`
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

function hasValidOpenApiSchema(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const document = value as {
    openapi?: unknown;
    servers?: unknown;
    paths?: unknown;
    components?: { securitySchemes?: { bearerAuth?: { type?: unknown; scheme?: unknown; bearerFormat?: unknown } } };
    "x-arcigy-policy"?: { tokenValueReturned?: unknown; familyFriendly?: unknown };
  };
  const server = Array.isArray(document.servers) ? document.servers[0] as { url?: unknown } | undefined : undefined;
  const paths = document.paths && typeof document.paths === "object" ? document.paths as Record<string, unknown> : null;
  if (document.openapi !== "3.1.0" || server?.url !== baseUrl || !paths) return false;
  if (document.components?.securitySchemes?.bearerAuth?.type !== "http") return false;
  if (document.components.securitySchemes.bearerAuth.scheme !== "bearer") return false;
  if (document.components.securitySchemes.bearerAuth.bearerFormat !== "JARVIS_WEB_TOKEN") return false;
  if (document["x-arcigy-policy"]?.tokenValueReturned !== false || document["x-arcigy-policy"]?.familyFriendly !== true) return false;
  const names = expectedToolNames();
  const pathKeys = Object.keys(paths);
  if (!sameStringArray(pathKeys, names.map((name) => `/api/mcp/${name}`))) return false;
  const approvalPolicy = new Map<string, boolean>(listJarvisMcpTools().map((tool) => [tool.name, tool.requiresApproval]));
  return names.every((name) => {
    const entry = paths[`/api/mcp/${name}`];
    if (!entry || typeof entry !== "object") return false;
    const post = (entry as { post?: unknown }).post as { security?: unknown; requestBody?: { content?: { "application/json"?: { schema?: { $ref?: unknown } } } } } | undefined;
    const security = Array.isArray(post?.security) ? post.security[0] as { bearerAuth?: unknown } | undefined : undefined;
    const schemaRef = post?.requestBody?.content?.["application/json"]?.schema?.$ref;
    return (
      Array.isArray(security?.bearerAuth) &&
      schemaRef === (approvalPolicy.get(name) ? "#/components/schemas/ApprovalCapablePayload" : "#/components/schemas/GenericMcpPayload")
    );
  });
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

function hasHandoffProof(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const handoff = value as { connectionPackUrl?: unknown; requiredProof?: unknown; agentFirstSteps?: unknown };
  if (handoff.connectionPackUrl !== `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`) return false;
  const requiredProof = Array.isArray(handoff.requiredProof) ? handoff.requiredProof : [];
  const agentFirstSteps = Array.isArray(handoff.agentFirstSteps) ? handoff.agentFirstSteps : [];
  const proofKeys = new Set(requiredProof.map((item) => (item && typeof item === "object" ? (item as { key?: unknown }).key : null)));
  return (
    proofKeys.has("openapi-schema") &&
    proofKeys.has("manifest") &&
    proofKeys.has("connection-pack") &&
    proofKeys.has("secure-tunnel-status") &&
    proofKeys.has("remote-smoke") &&
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
    requiredBeforeWork.some((step) => typeof step === "string" && step.includes("status=ready")) &&
    safetyRules.some((rule) => typeof rule === "string" && rule.includes("approvalRequired")) &&
    safetyRules.some((rule) => typeof rule === "string" && rule.includes("family-friendly"))
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

function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error));
}

function requestHeaders(bearerToken?: string): Record<string, string> {
  return {
    connection: "close",
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
  };
}
