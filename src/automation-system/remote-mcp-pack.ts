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
    exactMcpCall: {
      tool: string;
      method: "POST";
      url: string;
      body: Record<string, unknown>;
      approvalRequired: boolean;
    };
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
      "Nacitaj actionManifestUrl, ked remote agent podporuje ai-plugin/action manifests.",
      "Import openApiSchemaUrl when the remote agent supports ChatGPT custom actions, Grok actions, or OpenAPI-based HTTP tool setup.",
      "Nacitaj productionVerificationEvidenceUrl alebo zavolaj arcigy.get_production_verification_evidence pre najnovsi overeny production proof.",
      "Zavolaj arcigy.get_jarvis_capability_audit a arcigy.get_production_completion_score a cituj coverage, completion percento, MCP counts a evidence status.",
      "Run the smokeTestUrl before handoff and require status=ready with all 37 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-quick-start-exact-mcp-calls, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction. Production evidence must be status=ready with release proof, dirty=false, freshness.fresh=true, and arcigy.get_production_completion_score quick-start coverage within 24h.",
      "Call MCP tools with POST JSON to mcpToolCallPattern.",
      "Use the bearer auth header placeholder; the real token must be supplied by the operator and is never returned by this pack.",
      "Use tunnel.statusUrl to inspect public tunnel URLs from the redacted secure-tunnel log. Browser-launched tunnel start requires a strong JARVIS_WEB_TOKEN.",
      "Treat generate_contract_documents, generate_price_offer_document, approve_prepared_outreach_reply, send_approved_outreach_reply, send_smartlead_thread_reply, update_client_need_status, export_leads_csv, create_smartlead_campaign, configure_smartlead_campaign, add_leads_to_smartlead_campaign, and append_leads_to_google_sheet as approval-gated actions.",
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
    "Fetch the connection pack, capability audit, production verification evidence, and remote smoke with Authorization: Bearer <JARVIS_WEB_TOKEN>. " +
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
      Claude: `${sharedPrompt} In Claude, use the external HTTP MCP bridge and start with arcigy.get_operator_briefing plus arcigy.get_jarvis_capability_audit and arcigy.get_production_completion_score.`,
      ChatGPT: `${sharedPrompt} In ChatGPT, import ${shareWithAgent.openApiSchemaUrl} as a custom action schema and start with arcigy.get_operator_briefing plus arcigy.get_jarvis_capability_audit and arcigy.get_production_completion_score.`,
      Grok: `${sharedPrompt} In Grok, import ${shareWithAgent.openApiSchemaUrl} when actions are available, otherwise call POST ${shareWithAgent.mcpToolCallPattern}. Start with arcigy.get_operator_briefing plus arcigy.get_jarvis_capability_audit and arcigy.get_production_completion_score.`,
      "Generic HTTP agent": `${sharedPrompt} Use POST JSON calls against ${shareWithAgent.mcpToolCallPattern} and start with arcigy.get_operator_briefing plus arcigy.get_jarvis_capability_audit and arcigy.get_production_completion_score.`,
    },
    proofPolicy: {
      freshnessMaxAgeHours: 24,
      beforeAnyWork: [
        "Fetch the connection pack and confirm tokenValueReturned=false.",
        "Call arcigy.get_jarvis_capability_audit and arcigy.get_production_completion_score, then cite quick-start coverage, completion percent, MCP counts, and evidence status.",
        "Nacitaj productionVerificationEvidenceUrl alebo zavolaj arcigy.get_production_verification_evidence.",
        "Run smokeTestUrl and require status=ready with all 37 required remote MCP smoke gates ready.",
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
    "Do not ask for or reveal secrets. Start with arcigy.get_operator_briefing, arcigy.get_jarvis_capability_audit, and arcigy.get_production_completion_score. Use read-only/draft tools first. " +
    "Nikdy nevolaj approvalRequired tooly, kym operator nepotvrdi presny payload.";
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
      "Nacitaj actionManifestUrl, ak agent podporuje ai-plugin/action manifests.",
      "Import openApiSchemaUrl if the agent supports OpenAPI or custom actions.",
      "Nacitaj productionVerificationEvidenceUrl alebo zavolaj arcigy.get_production_verification_evidence a cituj status.",
      "Zavolaj arcigy.get_jarvis_capability_audit a arcigy.get_production_completion_score a cituj coverage, completion percento, MCP counts a evidence status.",
      "Fetch handoff.connectionPackUrl and confirm tokenValueReturned=false plus repo-only limits.",
      "Run smokeTestUrl and require status=ready with all 37 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-quick-start-exact-mcp-calls, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction. Production evidence must include release proof, dirty=false, freshness.fresh=true, and arcigy.get_production_completion_score quick-start coverage within 24h.",
      "Inspect tunnel.statusUrl after any tunnel start and never ask for the real bearer token.",
    ],
    safetyRules: [
      "Never request, print, store, or infer the real bearer token from this pack.",
      "Start with read-only or draft tools before proposing any write action.",
      "Use dryRun: true before Gmail sync writes.",
      "Nevolaj approvalRequired tooly, kym operator nepotvrdi presny payload.",
      "Keep outputs family-friendly, client-safe, and secret-redacted.",
    ],
  };
}

function buildHandoffRunbook(baseUrl: string): RemoteMcpConnectionPack["handoff"] {
  return {
    connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
    operatorChecklist: [
      "Spusti npm run web:tunnel:secure a nechaj proces otvoreny, kym remote agent pracuje.",
      "Ak pouzivas browser mode, najprv nastav silny JARVIS_WEB_TOKEN, potom pouzi Spustit tunel alebo POST /api/start-secure-tunnel.",
      "Remote agentovi daj external action manifest, Jarvis manifest, connection pack, smoke test URL, MCP base URL a bearer auth header placeholder.",
      "Pre ChatGPT custom actions alebo Grok-compatible OpenAPI setup mu daj aj external openApiSchemaUrl.",
      "approvalRequired tooly schval az po kontrole presneho payloadu, ktory agent odosle.",
      "Po kazdom restarte tunela spusti smoke test znova, lebo ngrok URL sa moze zmenit.",
    ],
    agentFirstSteps: [
      "Nacitaj connectionPackUrl s Authorization: Bearer <JARVIS_WEB_TOKEN>.",
      "Nacitaj actionManifestUrl, ak agent podporuje ai-plugin/action manifests.",
      "Nacitaj openApiSchemaUrl, ak agent podporuje OpenAPI/custom actions.",
      "Nacitaj productionVerificationEvidenceUrl alebo zavolaj arcigy.get_production_verification_evidence a cituj status.",
      "Zavolaj arcigy.get_jarvis_capability_audit a arcigy.get_production_completion_score a cituj coverage, completion percento, MCP counts a evidence status.",
      "Run smokeTestUrl and require status=ready with all 37 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-quick-start-exact-mcp-calls, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction before using MCP tools. Production evidence must include release proof, dirty=false, freshness.fresh=true, and arcigy.get_production_completion_score quick-start coverage within 24h.",
      "Nacitaj tunnel.statusUrl, ak operator potrebuje aktualne public tunnel URL; token values musia ostat redigovane.",
      "Pred navrhom prace zavolaj arcigy.get_operator_briefing.",
      "Najprv pouzi read-only alebo draft tooly; pred Gmail sync zapisom pouzi dryRun: true.",
      "Nikdy nevolaj approvalRequired tooly, kym operator nepotvrdi presnu akciu.",
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
        expected: 'status=ready with all 37 required remote MCP smoke gates, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-quick-start-exact-mcp-calls, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, secret-redaction, approval-gate, approval-shape-gate for top-level {"approved":true} payload rejection, production evidence release proof with dirty=false and freshness.fresh=true within 24h, and arcigy.get_production_completion_score quick-start coverage.',
      },
    ],
  };
}

function buildQuickStartCalls(baseUrl: string): RemoteMcpConnectionPack["quickStartCalls"] {
  const toolUrl = (name: string) => `${baseUrl}/api/mcp/${name}`;
  const contractIntake = buildQuickStartContractIntake();
  return withExactMcpCalls([
    {
      label: "Spustit remote MCP smoke proof",
      tool: "arcigy.run_remote_mcp_smoke",
      method: "POST",
      url: toolUrl("arcigy.run_remote_mcp_smoke"),
      body: {},
      approvalRequired: false,
    },
    {
      label: "Ziskat najnovsiu production verification evidence",
      tool: "arcigy.get_production_verification_evidence",
      method: "POST",
      url: toolUrl("arcigy.get_production_verification_evidence"),
      body: {},
      approvalRequired: false,
    },
    {
      label: "Auditovat Jarvis capability coverage",
      tool: "arcigy.get_jarvis_capability_audit",
      method: "POST",
      url: toolUrl("arcigy.get_jarvis_capability_audit"),
      body: { live: false },
      approvalRequired: false,
    },
    {
      label: "Zistit production completion percento",
      tool: "arcigy.get_production_completion_score",
      method: "POST",
      url: toolUrl("arcigy.get_production_completion_score"),
      body: { live: false },
      approvalRequired: false,
    },
    {
      label: "Spytat sa Jarvisa na capability audit",
      tool: "arcigy.jarvis_voice_event",
      method: "POST",
      url: toolUrl("arcigy.jarvis_voice_event"),
      body: { text: "Jarvis capability audit", session: { state: "idle", wakeWord: "jarvis" } },
      approvalRequired: false,
    },
    {
      label: "Spytat sa Jarvisa na production evidence",
      tool: "arcigy.jarvis_voice_event",
      method: "POST",
      url: toolUrl("arcigy.jarvis_voice_event"),
      body: { text: "Jarvis production evidence", session: { state: "idle", wakeWord: "jarvis" } },
      approvalRequired: false,
    },
    {
      label: "Spytat sa Jarvisa na full launch proof",
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
      label: "Ziskat proactive attention digest",
      tool: "arcigy.get_proactive_attention_digest",
      method: "POST",
      url: toolUrl("arcigy.get_proactive_attention_digest"),
      body: { periodLabel: "poslednych 7 dni", live: false, syncGmail: false },
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
      label: "Build leadgen daily report without Slack",
      tool: "arcigy.get_leadgen_daily_report",
      method: "POST",
      url: toolUrl("arcigy.get_leadgen_daily_report"),
      body: {
        periodLabel: "dnes",
        campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
        stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "kuchynske studia" }],
        settings: { leadgenActive: true, aiRepliesActive: true },
      },
      approvalRequired: false,
    },
    {
      label: "Build leadgen evening summary",
      tool: "arcigy.get_leadgen_evening_summary",
      method: "POST",
      url: toolUrl("arcigy.get_leadgen_evening_summary"),
      body: {
        sentToday: 30,
        repliesToday: 4,
        positiveToday: 1,
        recentReplies: [{ decisionMakerName: "Jan Novak", companyName: "Modelova Firma", replySentiment: "Interested", website: "https://example.com" }],
      },
      approvalRequired: false,
    },
    {
      label: "Preview Slack leadgen report without sending",
      tool: "arcigy.build_leadgen_slack_report_preview",
      method: "POST",
      url: toolUrl("arcigy.build_leadgen_slack_report_preview"),
      body: {
        periodLabel: "dnes",
        dateLabel: "2026-06-10",
        campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
        stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "autoservisy" }],
        settings: { leadgenActive: true, aiRepliesActive: true },
      },
      approvalRequired: false,
    },
    {
      label: "Build leadgen ops digest and next MCP calls",
      tool: "arcigy.build_leadgen_ops_digest",
      method: "POST",
      url: toolUrl("arcigy.build_leadgen_ops_digest"),
      body: {
        periodLabel: "dnes",
        campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
        stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "autoservisy" }],
        recentReplies: [{ decisionMakerName: "Jan Novak", companyName: "Modelova Firma", replySentiment: "Interested", website: "https://example.com" }],
        settings: { leadgenActive: true, aiRepliesActive: true },
        niches: [{ id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis"], regions: ["Bratislava"], dailyTarget: 30, smartleadCampaignId: "123456" }],
      },
      approvalRequired: false,
    },
    {
      label: "Preview next niche rotation",
      tool: "arcigy.select_next_niche",
      method: "POST",
      url: toolUrl("arcigy.select_next_niche"),
      body: {
        niches: [{ id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", keywords: ["kuchyne na mieru"], regions: ["Bratislava", "Trnava"], currentRegionIndex: 0, dailyTarget: 25 }],
      },
      approvalRequired: false,
    },
    {
      label: "Draft a Gemini client reply",
      tool: "arcigy.generate_ai_reply",
      method: "POST",
      url: toolUrl("arcigy.generate_ai_reply"),
      body: {
        message: "Potrebujem kratke zhrnutie dalsieho kroku pre klienta po poziadavke na upravu onboarding automatizacie.",
        context: "Arcigy Jarvis remote handoff.",
        language: "sk",
        tone: "executive",
      },
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
      label: "Draft price offer intake JSON without writing files",
      tool: "arcigy.draft_price_offer_intake",
      method: "POST",
      url: toolUrl("arcigy.draft_price_offer_intake"),
      body: {
        brief: "Klient Modelova Firma chce automatizovat dopyty, setup 2000 EUR, mesacne 200 EUR, ciel je usetrit obchodnikovi 8 hodin tyzdenne.",
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
      label: "Fetch a public URL preview without writing",
      tool: "arcigy.fetch_url_preview",
      method: "POST",
      url: toolUrl("arcigy.fetch_url_preview"),
      body: { url: "https://example.com/api/status", method: "GET", parseJson: true, maxBytes: 20000 },
      approvalRequired: false,
    },
    {
      label: "Scrape website contacts without writing",
      tool: "arcigy.scrape_website_contacts",
      method: "POST",
      url: toolUrl("arcigy.scrape_website_contacts"),
      body: { url: "https://example.com", includePriorityPages: true, maxPages: 4 },
      approvalRequired: false,
    },
    {
      label: "Batch scrape website contacts without writing",
      tool: "arcigy.batch_scrape_website_contacts",
      method: "POST",
      url: toolUrl("arcigy.batch_scrape_website_contacts"),
      body: { urls: ["https://example.com", "https://example.org"], includePriorityPages: true, maxPages: 4, maxSites: 10 },
      approvalRequired: false,
    },
    {
      label: "Build a niche leadgen plan",
      tool: "arcigy.build_niche_leadgen_plan",
      method: "POST",
      url: toolUrl("arcigy.build_niche_leadgen_plan"),
      body: { niche: "autoservisy", region: "Bratislava" },
      approvalRequired: false,
    },
    {
      label: "Enrich a Slovak company register record",
      tool: "arcigy.enrich_slovak_company_register",
      method: "POST",
      url: toolUrl("arcigy.enrich_slovak_company_register"),
      body: { companyName: "Modelova Firma s.r.o." },
      approvalRequired: false,
    },
    {
      label: "Score lead quality before import",
      tool: "arcigy.score_lead_quality",
      method: "POST",
      url: toolUrl("arcigy.score_lead_quality"),
      body: { minScore: 70, leads: [{ email: "majitel@example.sk", website: "https://example.sk", decisionMaker: "Jan Novak", registerVerified: true, personalizedIntro: "Kratke AI intro." }] },
      approvalRequired: false,
    },
    {
      label: "Dedupe lead candidates before import",
      tool: "arcigy.dedupe_lead_candidates",
      method: "POST",
      url: toolUrl("arcigy.dedupe_lead_candidates"),
      body: { leads: [{ email: "lead@example.com", companyName: "Modelova Firma" }, { email: "lead@example.com", companyName: "Modelova Firma duplicate" }] },
      approvalRequired: false,
    },
    {
      label: "Draft a Smartlead sequence without writing",
      tool: "arcigy.draft_smartlead_campaign_sequence",
      method: "POST",
      url: toolUrl("arcigy.draft_smartlead_campaign_sequence"),
      body: { niche: "autoservisy", painPoint: "manualne riesenie dopytov", offer: "AI asistent na odpovede a follow-up", language: "sk" },
      approvalRequired: false,
    },
    {
      label: "Parse lead CSV text without writing",
      tool: "arcigy.parse_leads_csv",
      method: "POST",
      url: toolUrl("arcigy.parse_leads_csv"),
      body: { csvText: "company_name,email,website\nModelova Firma,lead@example.com,https://example.com" },
      approvalRequired: false,
    },
    {
      label: "Filter blacklisted lead candidates",
      tool: "arcigy.filter_blacklisted_leads",
      method: "POST",
      url: toolUrl("arcigy.filter_blacklisted_leads"),
      body: { leads: [{ email: "lead@example.com", website: "https://example.com" }], domains: ["competitor.sk"], keywords: ["franchise"] },
      approvalRequired: false,
    },
    {
      label: "Build manual lead review queue",
      tool: "arcigy.build_manual_review_queue",
      method: "POST",
      url: toolUrl("arcigy.build_manual_review_queue"),
      body: { minScore: 70, leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }] },
      approvalRequired: false,
    },
    {
      label: "Preview manual-review pickup into Smartlead groups",
      tool: "arcigy.preview_manual_review_pickup",
      method: "POST",
      url: toolUrl("arcigy.preview_manual_review_pickup"),
      body: {
        minScore: 50,
        leads: [{
          id: "lead-1",
          email: "lead@example.com",
          decisionMakerName: "Jan Novak",
          companyName: "Modelova Firma",
          website: "https://example.com",
          nicheId: "niche-1",
          nicheSlug: "autoservisy",
          nicheName: "Autoservisy",
          smartleadCampaignId: "123456",
          manuallyReviewed: true,
          sentToSmartlead: false,
          personalizedIntro: "Kratke AI intro.",
        }],
      },
      approvalRequired: false,
    },
    {
      label: "Build Smartlead injection plan without uploading",
      tool: "arcigy.build_smartlead_injection_plan",
      method: "POST",
      url: toolUrl("arcigy.build_smartlead_injection_plan"),
      body: {
        niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
        leads: [{ email: "lead@example.com", decisionMakerName: "Jan Novak", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }],
      },
      approvalRequired: false,
    },
    {
      label: "Draft niche Smartlead campaign setup",
      tool: "arcigy.draft_niche_smartlead_campaign_setup",
      method: "POST",
      url: toolUrl("arcigy.draft_niche_smartlead_campaign_setup"),
      body: {
        niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy" },
        offer: "AI asistent na odpovede a follow-up",
        painPoint: "manualne spracovanie dopytov",
        language: "sk",
      },
      approvalRequired: false,
    },
    {
      label: "Preview enriched lead batch before Smartlead",
      tool: "arcigy.preview_lead_enrichment_batch",
      method: "POST",
      url: toolUrl("arcigy.preview_lead_enrichment_batch"),
      body: {
        niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
        leads: [{
          companyName: "Modelova Firma",
          website: "https://example.com",
          scraped: { emails: ["jan.novak@example.com"], phones: ["+421 900 111 222"] },
          register: { found: true, companyName: "Modelova Firma s.r.o.", ico: "12345678", executives: ["Jan Novak"] },
          personalizedIntro: "Vsimol som si, ze riesite servis pre firemnych klientov.",
        }],
        minScore: 70,
      },
      approvalRequired: false,
    },
    {
      label: "Build exact daily leadgen runbook",
      tool: "arcigy.build_daily_leadgen_runbook",
      method: "POST",
      url: toolUrl("arcigy.build_daily_leadgen_runbook"),
      body: {
        niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis", "pneuservis"], region: "Bratislava", campaignId: "123456" },
        dailyLimit: 30,
        targetCount: 60,
      },
      approvalRequired: false,
    },
    {
      label: "Export lead review CSV after approval",
      tool: "arcigy.export_leads_csv",
      method: "POST",
      url: toolUrl("arcigy.export_leads_csv"),
      body: { outputPath: "generated/leads/manual-review.csv", leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com" }], approval: { approved: true } },
      approvalRequired: true,
    },
    {
      label: "Read Smartlead campaign leads",
      tool: "arcigy.get_smartlead_campaign_leads",
      method: "POST",
      url: toolUrl("arcigy.get_smartlead_campaign_leads"),
      body: { campaignId: "123456", offset: 0, limit: 100 },
      approvalRequired: false,
    },
    {
      label: "Preview Smartlead lead status sync without DB writes",
      tool: "arcigy.preview_smartlead_lead_sync",
      method: "POST",
      url: toolUrl("arcigy.preview_smartlead_lead_sync"),
      body: { campaignIds: ["123456"], limitPerCampaign: 100 },
      approvalRequired: false,
    },
    {
      label: "Read Smartlead lead message history",
      tool: "arcigy.get_smartlead_message_history",
      method: "POST",
      url: toolUrl("arcigy.get_smartlead_message_history"),
      body: { campaignId: "123456", email: "lead@example.com" },
      approvalRequired: false,
    },
    {
      label: "Classify outreach reply before any draft",
      tool: "arcigy.classify_outreach_reply",
      method: "POST",
      url: toolUrl("arcigy.classify_outreach_reply"),
      body: { replyBody: "Dobry den, poslite mi prosim ukazku.", useAi: false },
      approvalRequired: false,
    },
    {
      label: "Preview Smartlead AI reply webhook decision",
      tool: "arcigy.preview_smartlead_ai_reply",
      method: "POST",
      url: toolUrl("arcigy.preview_smartlead_ai_reply"),
      body: {
        toEmail: "lead@example.com",
        campaignId: "123456",
        eventType: "EMAIL_REPLY",
        emailBody: "Dobry den, poslite mi prosim ukazku.",
        fromEmail: "andrej@arcigy.group",
        leadName: "Jan Novak",
        categoryName: "Interested",
        generateDraft: false,
      },
      approvalRequired: false,
    },
    {
      label: "Preview Gmail AI reply decision",
      tool: "arcigy.preview_gmail_ai_reply",
      method: "POST",
      url: toolUrl("arcigy.preview_gmail_ai_reply"),
      body: {
        senderEmail: "andrej@arcigy.group",
        fromEmail: "lead@example.com",
        subject: "Re: Otazka",
        body: "Dobry den, poslite mi prosim ukazku.",
        threadId: "thread-123",
        messageId: "msg-123",
        leadKnown: true,
        threadStartedByUs: true,
        generateDraft: false,
      },
      approvalRequired: false,
    },
    {
      label: "Draft Smartlead thread reply without sending",
      tool: "arcigy.draft_smartlead_thread_reply",
      method: "POST",
      url: toolUrl("arcigy.draft_smartlead_thread_reply"),
      body: {
        campaignId: "123456",
        email: "lead@example.com",
        leadName: "Jan Novak",
        positiveSignal: "Lead asked to see the showcase.",
        latestLeadReply: "Dobry den, poslite mi prosim ukazku.",
        language: "sk",
      },
      approvalRequired: false,
    },
    {
      label: "Send Smartlead thread reply after approval",
      tool: "arcigy.send_smartlead_thread_reply",
      method: "POST",
      url: toolUrl("arcigy.send_smartlead_thread_reply"),
      body: {
        campaignId: "123456",
        email: "lead@example.com",
        emailBody: "Dobry den pan Novak,<br><br>posielam slubenu ukazku: <a href='https://www.arcigy.com/showcase'>https://www.arcigy.com/showcase</a>.",
        approval: { approved: true },
      },
      approvalRequired: true,
    },
    {
      label: "Create Smartlead campaign after approval",
      tool: "arcigy.create_smartlead_campaign",
      method: "POST",
      url: toolUrl("arcigy.create_smartlead_campaign"),
      body: {
        name: "MODEL CAMPAIGN",
        sequences: [{ seq_number: 1, seq_delay_details: { delay_in_days: 0 }, seq_variants: [{ variant_label: "A", subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }] }],
        approval: { approved: true },
      },
      approvalRequired: true,
    },
    {
      label: "Configure Smartlead campaign after approval",
      tool: "arcigy.configure_smartlead_campaign",
      method: "POST",
      url: toolUrl("arcigy.configure_smartlead_campaign"),
      body: {
        campaignId: "123456",
        schedule: { timezone: "Europe/Bratislava", start_hour: "08:00", end_hour: "18:00", days_of_the_week: [1, 2, 3, 4, 5], max_new_leads_per_day: 25, min_time_btw_emails: 10 },
        approval: { approved: true },
      },
      approvalRequired: true,
    },
    {
      label: "Draft an AI intro for a lead",
      tool: "arcigy.draft_lead_intro",
      method: "POST",
      url: toolUrl("arcigy.draft_lead_intro"),
      body: { companyName: "Modelova Firma", website: "https://example.com", context: "Firma predava B2B sluzby.", language: "sk" },
      approvalRequired: false,
    },
    {
      label: "Batch draft AI intros for leads",
      tool: "arcigy.batch_draft_lead_intros",
      method: "POST",
      url: toolUrl("arcigy.batch_draft_lead_intros"),
      body: {
        leads: [
          { companyName: "Modelova Firma", website: "https://example.com", context: "Firma predava B2B sluzby." },
          { companyName: "Druha Firma", website: "https://example.org", context: "Ma kontakt formular a servisne dopyty." },
        ],
        offer: "AI asistent na dopyty a follow-up",
        language: "sk",
        maxLeads: 10,
      },
      approvalRequired: false,
    },
    {
      label: "Prepare Smartlead lead_list without writing",
      tool: "arcigy.prepare_smartlead_leads",
      method: "POST",
      url: toolUrl("arcigy.prepare_smartlead_leads"),
      body: {
        defaultSource: "jarvis-mcp",
        leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }],
      },
      approvalRequired: false,
    },
    {
      label: "Run read-only leadgen research pipeline",
      tool: "arcigy.run_leadgen_research_pipeline",
      method: "POST",
      url: toolUrl("arcigy.run_leadgen_research_pipeline"),
      body: { query: "kuchynske studio Slovensko", maxResults: 3, scrapeWebsites: true, draftIntros: false },
      approvalRequired: false,
    },
    {
      label: "Upload prepared leads to Smartlead after approval",
      tool: "arcigy.add_leads_to_smartlead_campaign",
      method: "POST",
      url: toolUrl("arcigy.add_leads_to_smartlead_campaign"),
      body: {
        campaignId: "123456",
        leads: [{ email: "lead@example.com", company_name: "Modelova Firma", website: "example.com", custom_fields: { personalized_intro: "Kratke AI intro." } }],
        approval: { approved: true },
      },
      approvalRequired: true,
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
    {
      label: "Generate price offer document after approval",
      tool: "arcigy.generate_price_offer_document",
      method: "POST",
      url: toolUrl("arcigy.generate_price_offer_document"),
      body: {
        approval: { approved: true },
        offer: {
          company: "Modelova Firma s.r.o.",
          ico: "12345678",
          customerName: "pan Novak",
          what_to_do: "Automatizacia spracovania dopytov a nasledny Smartlead follow-up.",
          cost_one: 2000,
          cost_two: 200,
          cost: 2200,
          roi_rows: [{ label: "Uspora casu obchodnika", value: "8 hodin tyzdenne" }],
        },
      },
      approvalRequired: true,
    },
  ]);
}

function withExactMcpCalls(
  calls: Array<Omit<RemoteMcpConnectionPack["quickStartCalls"][number], "exactMcpCall">>
): RemoteMcpConnectionPack["quickStartCalls"] {
  return calls.map((call) => ({
    ...call,
    exactMcpCall: {
      tool: call.tool,
      method: call.method,
      url: call.url,
      body: call.body,
      approvalRequired: call.approvalRequired,
    },
  }));
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
