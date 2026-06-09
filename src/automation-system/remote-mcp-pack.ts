import { listJarvisMcpTools, localStateWriteToolNames } from "./mcp-tools.ts";
import { buildProductionReadinessReport, type ProductionReadinessReport } from "./production-readiness.ts";
import type { RuntimeEnv } from "./env.ts";
import type { FetchLike } from "./gemini.ts";

export type RemoteMcpConnectionPackInput = {
  baseUrl?: string;
  live?: boolean;
  includeReadiness?: boolean;
  dbPath?: string;
  tokenConfigured?: boolean;
  tokenStrong?: boolean;
  localhostBypass?: boolean;
  maxJsonBytes?: number;
  authFailureLimit?: number;
  authFailureWindowMs?: number;
  source?: "web" | "mcp";
};

export type RemoteMcpConnectionPack = {
  mode: "remote-mcp-connection-pack";
  source: "web" | "mcp";
  generatedAt: string;
  baseUrl: string;
  manifestUrl: string;
  actionManifestUrl: string;
  openApiSchemaUrl: string;
  smokeTestUrl: string;
  productionVerificationEvidenceUrl: string;
  mcpBaseUrl: string;
  mcpToolCallPattern: string;
  auth: {
    type: "bearer";
    header: "Authorization: Bearer <JARVIS_WEB_TOKEN>";
    tokenConfigured: boolean;
    tokenStrong: boolean;
    tokenValueReturned: false;
    requiredForExternalHosts: true;
    localhostBypass: boolean;
  };
  tunnel: {
    provider: "ngrok";
    secureCommand: "npm run web:tunnel:secure";
    standardCommand: "npm run web:tunnel";
    statusUrl: string;
    startUrl: string;
    stopUrl: string;
    browserStartRequiresStrongToken: true;
  };
  handoff: {
    connectionPackUrl: string;
    operatorChecklist: string[];
    agentFirstSteps: string[];
    requiredProof: Array<{
      key: string;
      url: string;
      expected: string;
    }>;
  };
  tools: {
    count: number;
    names: string[];
    approvalRequired: string[];
    readOnlyOrDraft: string[];
    localStateWrite: string[];
  };
  quickStartCalls: Array<{
    label: string;
    tool: string;
    method: "POST";
    url: string;
    body: Record<string, unknown>;
    approvalRequired: boolean;
  }>;
  approval: {
    requiredPayload: { approval: { approved: true } };
    rule: string;
  };
  agentCompatibility: {
    supportedAgents: string[];
    protocol: "HTTP JSON MCP bridge";
    authentication: "Authorization bearer header";
    requiredBeforeWork: string[];
    safetyRules: string[];
  };
  agentPromptTemplates: {
    claude: string;
    chatgpt: string;
    grok: string;
    generic: string;
  };
  agentSetupProfiles: Array<{
    agent: "Claude" | "ChatGPT" | "Grok" | "Generic HTTP agent";
    setupMode: "external-http-mcp" | "openapi-custom-action" | "openapi-or-http-json";
    importUrl: string;
    fallbackUrl: string;
    firstTool: "arcigy.get_operator_briefing";
    firstToolUrl: string;
    requiredProofGates: string[];
    writePolicy: "approval.approved-required";
    localWritePolicy: "dry-run-first";
  }>;
  agentLaunchBundle: {
    mode: "remote-agent-launch-bundle";
    status: ProductionReadinessReport["status"] | "unknown";
    publicBaseUrl: string;
    authHeaderPlaceholder: "Authorization: Bearer <JARVIS_WEB_TOKEN>";
    shareWithAgent: {
      connectionPackUrl: string;
      actionManifestUrl: string;
      manifestUrl: string;
      openApiSchemaUrl: string;
      smokeTestUrl: string;
      productionVerificationEvidenceUrl: string;
      mcpToolCallPattern: string;
    };
    operatorControls: {
      secureTunnelCommand: "npm run web:tunnel:secure";
      tunnelStatusUrl: string;
      startTunnelUrl: string;
      stopTunnelUrl: string;
    };
    firstPrompts: Record<"Claude" | "ChatGPT" | "Grok" | "Generic HTTP agent", string>;
    proofPolicy: {
      freshnessMaxAgeHours: 24;
      beforeAnyWork: string[];
      beforeWrites: string[];
    };
    safetyRails: string[];
  };
  limits: {
    maxJsonBytes: number;
    pathPolicy: "repo-only";
    writesRequireExplicitToolCall: true;
    authFailureThrottle: {
      enabled: true;
      limit: number;
      windowMs: number;
      scope: "external-host-and-client";
    };
  };
  readiness?: {
    status: ProductionReadinessReport["status"];
    summary: string;
    checkedAt: string;
    blockers: ProductionReadinessReport["blockers"];
    attentionQueue: ProductionReadinessReport["attentionQueue"];
    launchChecklist: ProductionReadinessReport["launchChecklist"];
    launchEvidence: ProductionReadinessReport["launchEvidence"];
    nextActions: string[];
    fixGuide: ProductionReadinessReport["fixGuide"];
  };
  agentInstructions: string[];
};

export async function buildRemoteMcpConnectionPack(
  input: RemoteMcpConnectionPackInput = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<RemoteMcpConnectionPack> {
  const baseUrl = (input.baseUrl || "http://127.0.0.1:8765").replace(/\/+$/g, "");
  const tools = listJarvisMcpTools();
  const approvalRequired = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const localStateWrite = tools.filter((tool) => localStateWriteToolNames.has(tool.name)).map((tool) => tool.name);
  const readiness =
    input.includeReadiness === false ? undefined : await buildProductionReadinessReport({ live: input.live === true, dbPath: input.dbPath }, env, fetchImpl);

  return {
    mode: "remote-mcp-connection-pack",
    source: input.source ?? "mcp",
    generatedAt: new Date().toISOString(),
    baseUrl,
    manifestUrl: `${baseUrl}/.well-known/arcigy-jarvis.json`,
    actionManifestUrl: `${baseUrl}/.well-known/ai-plugin.json`,
    openApiSchemaUrl: `${baseUrl}/api/openapi.json`,
    smokeTestUrl: `${baseUrl}/api/remote-mcp-smoke`,
    productionVerificationEvidenceUrl: `${baseUrl}/api/production-verification-evidence`,
    mcpBaseUrl: `${baseUrl}/api/mcp`,
    mcpToolCallPattern: `${baseUrl}/api/mcp/{toolName}`,
    auth: {
      type: "bearer",
      header: "Authorization: Bearer <JARVIS_WEB_TOKEN>",
      tokenConfigured: input.tokenConfigured === true,
      tokenStrong: input.tokenStrong === true,
      tokenValueReturned: false,
      requiredForExternalHosts: true,
      localhostBypass: input.localhostBypass !== false,
    },
    tunnel: {
      provider: "ngrok",
      secureCommand: "npm run web:tunnel:secure",
      standardCommand: "npm run web:tunnel",
      statusUrl: `${baseUrl}/api/secure-tunnel-status`,
      startUrl: `${baseUrl}/api/start-secure-tunnel`,
      stopUrl: `${baseUrl}/api/stop-secure-tunnel`,
      browserStartRequiresStrongToken: true,
    },
    handoff: buildHandoffRunbook(baseUrl),
    tools: {
      count: tools.length,
      names: tools.map((tool) => tool.name),
      approvalRequired,
      readOnlyOrDraft: tools.filter((tool) => !tool.requiresApproval && !localStateWriteToolNames.has(tool.name)).map((tool) => tool.name),
      localStateWrite,
    },
    quickStartCalls: buildQuickStartCalls(baseUrl),
    approval: {
      requiredPayload: { approval: { approved: true } },
      rule: "Never call approval-required tools until the operator explicitly confirms the exact action.",
    },
    agentCompatibility: buildAgentCompatibility(),
    agentPromptTemplates: buildAgentPromptTemplates(baseUrl),
    agentSetupProfiles: buildAgentSetupProfiles(baseUrl),
    agentLaunchBundle: buildAgentLaunchBundle(baseUrl, readiness?.status),
    limits: {
      maxJsonBytes: input.maxJsonBytes ?? 1_000_000,
      pathPolicy: "repo-only",
      writesRequireExplicitToolCall: true,
      authFailureThrottle: {
        enabled: true,
        limit: input.authFailureLimit ?? 20,
        windowMs: input.authFailureWindowMs ?? 60_000,
        scope: "external-host-and-client",
      },
    },
    readiness: readiness
      ? {
          status: readiness.status,
          summary: readiness.summary,
          checkedAt: readiness.checkedAt,
          blockers: readiness.blockers,
          attentionQueue: readiness.attentionQueue,
          launchChecklist: readiness.launchChecklist,
          launchEvidence: readiness.launchEvidence,
          nextActions: readiness.nextActions,
          fixGuide: readiness.fixGuide,
        }
      : undefined,
    agentInstructions: [
      "Fetch the manifestUrl first to list live tools and schemas.",
      "Fetch actionManifestUrl when the remote agent supports ai-plugin/action manifests.",
      "Import openApiSchemaUrl when the remote agent supports ChatGPT custom actions, Grok actions, or OpenAPI-based HTTP tool setup.",
      "Fetch productionVerificationEvidenceUrl or call arcigy.get_production_verification_evidence to inspect the latest verified production proof.",
      "Run the smokeTestUrl before handoff and require status=ready with all 36 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction. Production evidence must be status=ready with release proof, dirty=false, and freshness.fresh=true within 24h.",
      "Call MCP tools with POST JSON to mcpToolCallPattern.",
      "Use the bearer auth header placeholder; the real token must be supplied by the operator and is never returned by this pack.",
      "Use tunnel.statusUrl to inspect public tunnel URLs from the redacted secure-tunnel log. Browser-launched tunnel start requires a strong JARVIS_WEB_TOKEN.",
      "Treat generate_contract_documents, approve_prepared_outreach_reply, send_approved_outreach_reply, update_client_need_status, and append_leads_to_google_sheet as approval-gated actions.",
      "Treat localStateWrite tools as local memory writes. Prefer dryRun: true for sync_gmail_recent_messages before ingesting messages.",
      "Use get_operator_briefing for a Jarvis-style daily status before making recommendations.",
    ],
  };
}

function buildAgentLaunchBundle(baseUrl: string, status: ProductionReadinessReport["status"] | undefined): RemoteMcpConnectionPack["agentLaunchBundle"] {
  const shareWithAgent = {
    connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
    actionManifestUrl: `${baseUrl}/.well-known/ai-plugin.json`,
    manifestUrl: `${baseUrl}/.well-known/arcigy-jarvis.json`,
    openApiSchemaUrl: `${baseUrl}/api/openapi.json`,
    smokeTestUrl: `${baseUrl}/api/remote-mcp-smoke`,
    productionVerificationEvidenceUrl: `${baseUrl}/api/production-verification-evidence`,
    mcpToolCallPattern: `${baseUrl}/api/mcp/{toolName}`,
  };
  const sharedPrompt =
    `Use Arcigy Jarvis at ${baseUrl}. ` +
    "Fetch the connection pack, production verification evidence, and remote smoke with Authorization: Bearer <JARVIS_WEB_TOKEN>. " +
    "Before any local write or approvalRequired action, cite the ready smoke status, fresh production evidence, and the exact payload you want the operator to approve. " +
    "Never ask for or reveal the real token.";

  return {
    mode: "remote-agent-launch-bundle",
    status: status ?? "unknown",
    publicBaseUrl: baseUrl,
    authHeaderPlaceholder: "Authorization: Bearer <JARVIS_WEB_TOKEN>",
    shareWithAgent,
    operatorControls: {
      secureTunnelCommand: "npm run web:tunnel:secure",
      tunnelStatusUrl: `${baseUrl}/api/secure-tunnel-status`,
      startTunnelUrl: `${baseUrl}/api/start-secure-tunnel`,
      stopTunnelUrl: `${baseUrl}/api/stop-secure-tunnel`,
    },
    firstPrompts: {
      Claude: `${sharedPrompt} In Claude, use the external HTTP MCP bridge and start with arcigy.get_operator_briefing.`,
      ChatGPT: `${sharedPrompt} In ChatGPT, import ${shareWithAgent.openApiSchemaUrl} as a custom action schema and start with arcigy.get_operator_briefing.`,
      Grok: `${sharedPrompt} In Grok, import ${shareWithAgent.openApiSchemaUrl} when actions are available, otherwise call POST ${shareWithAgent.mcpToolCallPattern}. Start with arcigy.get_operator_briefing.`,
      "Generic HTTP agent": `${sharedPrompt} Use POST JSON calls against ${shareWithAgent.mcpToolCallPattern} and start with arcigy.get_operator_briefing.`,
    },
    proofPolicy: {
      freshnessMaxAgeHours: 24,
      beforeAnyWork: [
        "Fetch the connection pack and confirm tokenValueReturned=false.",
        "Fetch productionVerificationEvidenceUrl or call arcigy.get_production_verification_evidence.",
        "Run smokeTestUrl and require status=ready.",
      ],
      beforeWrites: [
        "Confirm production evidence status=ready, dirty=false, and freshness.fresh=true.",
        "Confirm all remote MCP smoke gates are ready.",
        "Show the exact approvalRequired payload and wait for operator approval.approved=true.",
      ],
    },
    safetyRails: [
      "Never return bearer tokens, API keys, OAuth refresh tokens, database URLs, or provider credentials.",
      "Use read-only and draft tools before local writes.",
      "Use dryRun: true before Gmail sync writes.",
      "Keep all outputs family-friendly and client-safe.",
    ],
  };
}

function buildAgentPromptTemplates(baseUrl: string): RemoteMcpConnectionPack["agentPromptTemplates"] {
  const shared =
    `Use Arcigy Jarvis remote MCP at ${baseUrl}. ` +
    "First fetch the connection pack, action manifest, manifest, and OpenAPI schema with Authorization: Bearer <JARVIS_WEB_TOKEN>, then run remote smoke. " +
    "Do not ask for or reveal secrets. Start with arcigy.get_operator_briefing. Use read-only/draft tools first. " +
    "Never call approvalRequired tools until the operator confirms the exact payload.";
  return {
    claude: `${shared} In Claude, treat this as an external HTTP MCP bridge and cite the smoke status before any write proposal.`,
    chatgpt: `${shared} In ChatGPT, import ${baseUrl}/api/openapi.json as the custom action schema, then use tool calls only through POST ${baseUrl}/api/mcp/{toolName} and keep outputs family-friendly.`,
    grok: `${shared} In Grok or xAI-compatible agents, import or mirror ${baseUrl}/api/openapi.json when OpenAPI actions are supported; otherwise call the HTTP JSON endpoints directly and return the required proof gates before using local write tools.`,
    generic: `${shared} For any generic agent, POST JSON to ${baseUrl}/api/mcp/{toolName} and include the bearer auth header placeholder in setup docs only.`,
  };
}

function buildAgentSetupProfiles(baseUrl: string): RemoteMcpConnectionPack["agentSetupProfiles"] {
  const requiredProofGates = [
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
  const base = {
    firstTool: "arcigy.get_operator_briefing" as const,
    firstToolUrl: `${baseUrl}/api/mcp/arcigy.get_operator_briefing`,
    requiredProofGates,
    writePolicy: "approval.approved-required" as const,
    localWritePolicy: "dry-run-first" as const,
  };
  return [
    {
      agent: "Claude",
      setupMode: "external-http-mcp",
      importUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
      fallbackUrl: `${baseUrl}/.well-known/arcigy-jarvis.json`,
      ...base,
    },
    {
      agent: "ChatGPT",
      setupMode: "openapi-custom-action",
      importUrl: `${baseUrl}/api/openapi.json`,
      fallbackUrl: `${baseUrl}/.well-known/ai-plugin.json`,
      ...base,
    },
    {
      agent: "Grok",
      setupMode: "openapi-or-http-json",
      importUrl: `${baseUrl}/api/openapi.json`,
      fallbackUrl: `${baseUrl}/api/mcp/{toolName}`,
      ...base,
    },
    {
      agent: "Generic HTTP agent",
      setupMode: "openapi-or-http-json",
      importUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
      fallbackUrl: `${baseUrl}/api/mcp/{toolName}`,
      ...base,
    },
  ];
}

function buildAgentCompatibility(): RemoteMcpConnectionPack["agentCompatibility"] {
  return {
    supportedAgents: ["Claude", "ChatGPT", "Grok", "xAI-compatible HTTP agents", "generic MCP-capable HTTP agents"],
    protocol: "HTTP JSON MCP bridge",
    authentication: "Authorization bearer header",
    requiredBeforeWork: [
      "Fetch manifestUrl.",
      "Fetch actionManifestUrl if the agent supports ai-plugin/action manifests.",
      "Import openApiSchemaUrl if the agent supports OpenAPI or custom actions.",
      "Fetch productionVerificationEvidenceUrl or call arcigy.get_production_verification_evidence and cite its status.",
      "Fetch handoff.connectionPackUrl and confirm tokenValueReturned=false plus repo-only limits.",
      "Run smokeTestUrl and require status=ready with all 36 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction. Production evidence must include release proof, dirty=false, and freshness.fresh=true within 24h.",
      "Inspect tunnel.statusUrl after any tunnel start and never ask for the real bearer token.",
    ],
    safetyRules: [
      "Never request, print, store, or infer the real bearer token from this pack.",
      "Start with read-only or draft tools before proposing any write action.",
      "Use dryRun: true before Gmail sync writes.",
      "Do not call approvalRequired tools until the operator confirms the exact payload.",
      "Keep outputs family-friendly, client-safe, and secret-redacted.",
    ],
  };
}

function buildHandoffRunbook(baseUrl: string): RemoteMcpConnectionPack["handoff"] {
  return {
    connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
    operatorChecklist: [
      "Run npm run web:tunnel:secure and keep the process open while the remote agent works.",
      "If using browser mode, configure a strong JARVIS_WEB_TOKEN first, then use Start tunnel or POST /api/start-secure-tunnel.",
      "Give the remote agent the external action manifest, Jarvis manifest, connection pack, smoke test URL, MCP base URL, and bearer auth header placeholder.",
      "For ChatGPT custom actions or Grok-compatible OpenAPI setup, give the remote agent the external openApiSchemaUrl too.",
      "Approve approvalRequired tools only after reviewing the exact payload the agent will send.",
      "Run the smoke test again after any tunnel restart because ngrok URLs can change.",
    ],
    agentFirstSteps: [
      "Fetch connectionPackUrl with Authorization: Bearer <JARVIS_WEB_TOKEN>.",
      "Fetch actionManifestUrl if the agent supports ai-plugin/action manifests.",
      "Fetch openApiSchemaUrl if the agent supports OpenAPI/custom actions.",
      "Fetch productionVerificationEvidenceUrl or call arcigy.get_production_verification_evidence and cite its status.",
      "Run smokeTestUrl and require status=ready with all 36 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction before using MCP tools. Production evidence must include release proof, dirty=false, and freshness.fresh=true within 24h.",
      "Fetch tunnel.statusUrl if the operator needs the current public tunnel URLs; token values must remain redacted.",
      "Call arcigy.get_operator_briefing before proposing work.",
      "Use read-only or draft tools first; use dryRun: true before Gmail sync writes.",
      "Never call approvalRequired tools until the operator confirms the exact action.",
    ],
    requiredProof: [
      {
        key: "action-manifest",
        url: `${baseUrl}/.well-known/ai-plugin.json`,
        expected: "HTTP 200 action manifest, bearer user_http auth, OpenAPI URL, tokenValueReturned=false.",
      },
      {
        key: "openapi-schema",
        url: `${baseUrl}/api/openapi.json`,
        expected: "HTTP 200 OpenAPI 3.1 schema, bearerAuth security scheme, one POST operation per Jarvis MCP tool, no token value.",
      },
      {
        key: "manifest",
        url: `${baseUrl}/.well-known/arcigy-jarvis.json`,
        expected: "HTTP 200, auth header placeholder, complete MCP tool registry.",
      },
      {
        key: "connection-pack",
        url: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
        expected: "HTTP 200, tokenValueReturned=false, repo-only limits, bounded JSON, explicit write tool calls, handoff runbook present.",
      },
      {
        key: "secure-tunnel-status",
        url: `${baseUrl}/api/secure-tunnel-status`,
        expected: "HTTP 200, redacted log tail, public MCP URLs when a tunnel is ready, and no bearer token value.",
      },
      {
        key: "production-verification-evidence",
        url: `${baseUrl}/api/production-verification-evidence`,
        expected: "HTTP 200, latest secret-safe npm run verify:production evidence, no token or provider secret values.",
      },
      {
        key: "remote-smoke",
        url: `${baseUrl}/api/remote-mcp-smoke`,
        expected: 'status=ready with all 36 required remote MCP smoke gates, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, secret-redaction, approval-gate, approval-shape-gate for top-level {"approved":true} payload rejection, and production evidence release proof with dirty=false and freshness.fresh=true within 24h.',
      },
    ],
  };
}

function buildQuickStartCalls(baseUrl: string): RemoteMcpConnectionPack["quickStartCalls"] {
  const toolUrl = (name: string) => `${baseUrl}/api/mcp/${name}`;
  const contractIntake = buildQuickStartContractIntake();
  return [
    {
      label: "Run remote MCP smoke proof",
      tool: "arcigy.run_remote_mcp_smoke",
      method: "POST",
      url: toolUrl("arcigy.run_remote_mcp_smoke"),
      body: {},
      approvalRequired: false,
    },
    {
      label: "Get latest production verification evidence",
      tool: "arcigy.get_production_verification_evidence",
      method: "POST",
      url: toolUrl("arcigy.get_production_verification_evidence"),
      body: {},
      approvalRequired: false,
    },
    {
      label: "Ask Jarvis for production evidence",
      tool: "arcigy.jarvis_voice_event",
      method: "POST",
      url: toolUrl("arcigy.jarvis_voice_event"),
      body: { text: "Jarvis production evidence", session: { state: "idle", wakeWord: "jarvis" } },
      approvalRequired: false,
    },
    {
      label: "Ask Jarvis for full launch proof",
      tool: "arcigy.jarvis_voice_event",
      method: "POST",
      url: toolUrl("arcigy.jarvis_voice_event"),
      body: { text: "Jarvis full launch proof", session: { state: "idle", wakeWord: "jarvis" } },
      approvalRequired: false,
    },
    {
      label: "Get Jarvis operator briefing",
      tool: "arcigy.get_operator_briefing",
      method: "POST",
      url: toolUrl("arcigy.get_operator_briefing"),
      body: { periodLabel: "poslednych 7 dni", live: false },
      approvalRequired: false,
    },
    {
      label: "Test Jarvis voice wake command",
      tool: "arcigy.jarvis_voice_event",
      method: "POST",
      url: toolUrl("arcigy.jarvis_voice_event"),
      body: { text: "Jarvis integracie", session: { state: "idle", wakeWord: "jarvis" } },
      approvalRequired: false,
    },
    {
      label: "List operator approval queue",
      tool: "arcigy.get_approval_queue",
      method: "POST",
      url: toolUrl("arcigy.get_approval_queue"),
      body: { limit: 20 },
      approvalRequired: false,
    },
    {
      label: "Identify a client by email and open needs",
      tool: "arcigy.identify_email",
      method: "POST",
      url: toolUrl("arcigy.identify_email"),
      body: { email: "client@example.com" },
      approvalRequired: false,
    },
    {
      label: "List open client need alerts",
      tool: "arcigy.get_client_need_alerts",
      method: "POST",
      url: toolUrl("arcigy.get_client_need_alerts"),
      body: { status: "new", limit: 10 },
      approvalRequired: false,
    },
    {
      label: "Resolve a client need alert after approval",
      tool: "arcigy.update_client_need_status",
      method: "POST",
      url: toolUrl("arcigy.update_client_need_status"),
      body: { needSignalId: "client_need_signal_id", status: "resolved", approval: { approved: true } },
      approvalRequired: true,
    },
    {
      label: "Review recent Jarvis audit events",
      tool: "arcigy.get_audit_events",
      method: "POST",
      url: toolUrl("arcigy.get_audit_events"),
      body: { limit: 20 },
      approvalRequired: false,
    },
    {
      label: "Get redacted local memory snapshot",
      tool: "arcigy.get_local_memory_snapshot",
      method: "POST",
      url: toolUrl("arcigy.get_local_memory_snapshot"),
      body: { limit: 10 },
      approvalRequired: false,
    },
    {
      label: "Export redacted local memory snapshot after approval",
      tool: "arcigy.export_local_memory_snapshot",
      method: "POST",
      url: toolUrl("arcigy.export_local_memory_snapshot"),
      body: { outputPath: "generated/local-memory/local-memory-snapshot.json", limit: 10, approval: { approved: true } },
      approvalRequired: true,
    },
    {
      label: "Get Smartlead outreach brief",
      tool: "arcigy.get_smartlead_outreach_brief",
      method: "POST",
      url: toolUrl("arcigy.get_smartlead_outreach_brief"),
      body: { periodLabel: "poslednych 7 dni", maxCampaigns: 10 },
      approvalRequired: false,
    },
    {
      label: "Draft a Gemini client reply",
      tool: "arcigy.generate_ai_reply",
      method: "POST",
      url: toolUrl("arcigy.generate_ai_reply"),
      body: { message: "Client message here", context: "Arcigy Jarvis remote handoff.", language: "sk", tone: "executive" },
      approvalRequired: false,
    },
    {
      label: "Prepare a positive outreach reply for approval",
      tool: "arcigy.prepare_positive_outreach_reply",
      method: "POST",
      url: toolUrl("arcigy.prepare_positive_outreach_reply"),
      body: {
        leadEmail: "lead@example.com",
        positiveSignal: "Lead odpovedal pozitivne a chce kratky call.",
        context: "Remote handoff approval draft. This stores a local prepared_reply draft only.",
        language: "sk",
        tone: "executive",
      },
      approvalRequired: false,
    },
    {
      label: "Send an approved outreach reply after approval",
      tool: "arcigy.send_approved_outreach_reply",
      method: "POST",
      url: toolUrl("arcigy.send_approved_outreach_reply"),
      body: { preparedEventId: "prepared_reply_event_id", approval: { approved: true } },
      approvalRequired: true,
    },
    {
      label: "Draft contract intake JSON without writing files",
      tool: "arcigy.draft_contract_intake",
      method: "POST",
      url: toolUrl("arcigy.draft_contract_intake"),
      body: {
        brief: "Klient potrebuje webovu aplikaciu pre lead intake, klientsku evidenciu, reporty, Gemini drafty, 2 pouzivatelov, setup 2000 EUR, mesacne 200 EUR.",
      },
      approvalRequired: false,
    },
    {
      label: "Discover leads without writing",
      tool: "arcigy.discover_leads",
      method: "POST",
      url: toolUrl("arcigy.discover_leads"),
      body: { query: "automation agency Bratislava", maxResults: 8 },
      approvalRequired: false,
    },
    {
      label: "Preview Gmail without local writes",
      tool: "arcigy.sync_gmail_recent_messages",
      method: "POST",
      url: toolUrl("arcigy.sync_gmail_recent_messages"),
      body: { query: "in:inbox newer_than:7d", maxResults: 5, dryRun: true },
      approvalRequired: false,
    },
    {
      label: "Generate contract documents after approval",
      tool: "arcigy.generate_contract_documents",
      method: "POST",
      url: toolUrl("arcigy.generate_contract_documents"),
      body: { approval: { approved: true }, intake: contractIntake },
      approvalRequired: true,
    },
  ];
}

function buildQuickStartContractIntake(): Record<string, unknown> {
  return {
    client: {
      businessName: "Modelovy Klient s. r. o.",
      registeredAddress: "Hlavna 1, 811 01 Bratislava",
      companyId: "12345678",
      taxId: "SK1234567890",
      representativeName: "Jan Novak",
      representativeRole: "konatel",
      email: "jan.novak@example.com",
      phone: "+421 900 000 000",
    },
    contacts: {
      clientAuthorizedContact: "Jan Novak, jan.novak@example.com, +421 900 000 000",
      arcigyAuthorizedContact: "Branislav Laubert, Co-Founder & CEO, branislav@arcigy.group, +421 951 268 376",
    },
    project: {
      name: "Modelova automatizacna aplikacia",
      goal: "Automatizovat prijem leadov, klientsku evidenciu a reportovanie.",
      includedUserAccounts: 2,
      feedbackRounds: 3,
      includedModules: [
        {
          name: "Lead intake",
          purpose: "Zachytava a triedi nove dopyty.",
          inputs: "Kontaktne udaje, zdroj leadu, stav spracovania.",
          outputs: "Prehlad leadov a notifikacie pre operatora.",
          outOfScope: "Platene reklamne kampane.",
        },
      ],
      outputs: ["Webova aplikacia", "Administracny dashboard", "Zakladny reporting"],
      aiFeatures: ["Navrh odpovedi klientom", "Sumarizacia poziadaviek"],
      acceptanceCriteria: ["Operator vie vytvorit lead", "Dashboard zobrazi aktualny stav", "Report sa da exportovat"],
    },
    pricing: {
      implementationFeeEur: 2000,
      depositPercent: 30,
      monthlyFeeEur: 200,
      initialTermMonths: 6,
      invoiceDueDays: 14,
    },
    dates: {
      frameworkAgreementDate: "2026-06-08",
      projectAppendixDate: "2026-06-08",
      plannedLaunchDate: "2026-07-15",
    },
    specialTerms: ["Safe quick-start payload; operator must replace client data before real use."],
    additionalAttachments: [],
  };
}
