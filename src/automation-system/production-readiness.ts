import { runIntegrationDiagnostics, type DiagnosticCheck, type DiagnosticsResult } from "./diagnostics.ts";
import { getIntegrationHealth, isUnusedRedisPlaceholderIssue, type IntegrationHealth, type RuntimeEnv } from "./env.ts";
import type { FetchLike } from "./gemini.ts";
import { listJarvisMcpTools, type JarvisMcpTool, type JarvisMcpToolName } from "./mcp-tools.ts";

export type ReadinessStatus = "ready" | "attention" | "blocked";

export type ReadinessBlocker = {
  key: string;
  severity: "warning" | "blocking";
  message: string;
  nextAction: string;
};

export type ProductionReadinessReport = {
  status: ReadinessStatus;
  checkedAt: string;
  summary: string;
  integrations: {
    ready: number;
    total: number;
    missing: Array<{ key: string; missing: string[] }>;
  };
  mcp: {
    toolCount: number;
    approvalRequired: string[];
  };
  blockers: ReadinessBlocker[];
  attentionQueue: ReadinessAttentionItem[];
  launchChecklist: ReadinessLaunchChecklistItem[];
  launchEvidence: ReadinessLaunchEvidence;
  nextActions: string[];
  fixGuide: ReadinessFixStep[];
  diagnostics?: DiagnosticsResult;
};

export type ProductionReadinessInput = {
  live?: boolean;
  dbPath?: string;
};

export type ReadinessFixStep = {
  id: string;
  title: string;
  detail: string;
  envKeys: string[];
  validationCommand: string;
};

export type ReadinessAttentionItem = {
  id: string;
  key: string;
  severity: ReadinessBlocker["severity"];
  source: "configuration" | "live-diagnostic";
  title: string;
  message: string;
  nextAction: string;
  envKeys: string[];
  validationCommand: string;
};

export type ReadinessLaunchChecklistItem = {
  id: string;
  title: string;
  status: ReadinessStatus;
  proof: string;
  nextAction: string;
};

export type ReadinessLaunchEvidence = {
  mode: "production-launch-evidence";
  decision: "ready_for_operator_handoff" | "needs_attention" | "blocked";
  generatedAt: string;
  secretPolicy: string;
  proofGates: Array<{
    id: string;
    title: string;
    status: ReadinessStatus;
    proof: string;
    validationCommand: string;
  }>;
  remoteHandoff: {
    requiredBeforeExternalAgent: string[];
    smokeCommand: string;
    tunnelCommand: string;
  };
  operatorNextAction: string;
};

export async function buildProductionReadinessReport(
  input: ProductionReadinessInput = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<ProductionReadinessReport> {
  const health = getIntegrationHealth(env);
  const tools = listJarvisMcpTools();
  const diagnostics = input.live ? await runIntegrationDiagnostics(input, env, fetchImpl) : undefined;
  const diagnosticChecks = diagnostics?.checks ?? [];
  const blockers = [
    ...health.flatMap(integrationHealthBlockers),
    ...diagnosticChecks.flatMap((check) => diagnosticBlockers(check, diagnosticChecks)),
    ...buildWorkflowSurfaceBlockers(tools),
  ];
  const uniqueBlockers = dedupeBlockers(blockers);
  const blockingCount = uniqueBlockers.filter((blocker) => blocker.severity === "blocking").length;
  const status: ReadinessStatus = blockingCount ? "blocked" : uniqueBlockers.length ? "attention" : "ready";
  const readyIntegrations = health.filter(isOperationallyConfigured).length;
  const fixGuide = buildFixGuide(uniqueBlockers);
  const launchChecklist = buildLaunchChecklist(health, tools, uniqueBlockers, diagnostics);
  const nextActions = uniqueBlockers.length ? uniqueBlockers.map((blocker) => blocker.nextAction) : ["Netreba akciu. Drz secrets mimo gitu a pred zmenami spusti doctor."];

  return {
    status,
    checkedAt: new Date().toISOString(),
    summary: buildSummary(status, readyIntegrations, health.length, tools.length, uniqueBlockers),
    integrations: {
      ready: readyIntegrations,
      total: health.length,
      missing: health.filter((item) => !isOperationallyConfigured(item)).map((item) => ({ key: item.key, missing: item.missing })),
    },
    mcp: {
      toolCount: tools.length,
      approvalRequired: tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name),
    },
    blockers: uniqueBlockers,
    attentionQueue: buildAttentionQueue(uniqueBlockers, fixGuide),
    launchChecklist,
    launchEvidence: buildLaunchEvidence(status, launchChecklist, nextActions),
    nextActions,
    fixGuide,
    diagnostics,
  };
}

function buildLaunchEvidence(
  status: ReadinessStatus,
  launchChecklist: ReadinessLaunchChecklistItem[],
  nextActions: string[]
): ReadinessLaunchEvidence {
  const gateCommand = (id: string) => {
    if (id === "mcp-registry" || id === "approval-locks") return "npm test";
    if (id.endsWith("-workflow")) return "npm test && npm run doctor";
    if (id === "live-diagnostics" || id === "required-integrations") return "npm run doctor -- --live-integrations";
    return "npm run verify:production";
  };
  return {
    mode: "production-launch-evidence",
    decision: status === "ready" ? "ready_for_operator_handoff" : status === "blocked" ? "blocked" : "needs_attention",
    generatedAt: new Date().toISOString(),
    secretPolicy: "Secret-safe: reports only configuration state, placeholders, counts, commands, URLs with placeholders, and redacted diagnostic messages.",
    proofGates: launchChecklist.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      proof: item.proof,
      validationCommand: gateCommand(item.id),
    })),
    remoteHandoff: {
      requiredBeforeExternalAgent: [
        "Spusti npm run web:tunnel:secure alebo pouzi browser tlacidlo Spustit tunel so silnym JARVIS_WEB_TOKEN.",
        "Fetch /.well-known/ai-plugin.json, /api/openapi.json, /.well-known/arcigy-jarvis.json, and /api/remote-mcp-pack?includeReadiness=true&live=true through the external URL.",
        "Run /api/remote-mcp-smoke and require status=ready with all 37 required remote MCP smoke gates ready, including manifest, tool-count, manifest-tool-registry, manifest-tool-metadata, auth-placeholder, manifest-local-write-policy, action-manifest, openapi-schema, cors-preflight, external-auth-gate, connection-pack, pack-secret-policy, pack-auth-throttle-policy, pack-limits, pack-tunnel-controls, secure-tunnel-status, pack-local-write-policy, pack-tool-registry, pack-quick-start-urls, pack-quick-start-approval-policy, pack-quick-start-exact-mcp-calls, pack-contract-quick-start, pack-contract-draft-quick-start, pack-agent-setup-profiles, pack-agent-launch-bundle, pack-voice-quick-start, pack-handoff-proof, pack-agent-compatibility, pack-client-memory-quick-start, pack-audit-quick-start, voice-tool-call, pack-production-evidence-quick-start, read-only-tool-call, production-evidence-tool-call, approval-gate, approval-shape-gate, and secret-redaction; production evidence must also be status=ready with release proof, dirty=false, and freshness.fresh=true within 24h before any remote agent uses write-capable tools.",
      ],
      smokeCommand: "npm run remote:mcp:smoke -- --url <external-url>",
      tunnelCommand: "npm run web:tunnel:secure",
    },
    operatorNextAction: nextActions[0] ?? "Netreba akciu.",
  };
}

function buildLaunchChecklist(
  health: IntegrationHealth[],
  tools: ReturnType<typeof listJarvisMcpTools>,
  blockers: ReadinessBlocker[],
  diagnostics: DiagnosticsResult | undefined
): ReadinessLaunchChecklistItem[] {
  const requiredIntegrations = health.filter((item) => item.requiredForProduction);
  const readyRequired = requiredIntegrations.filter((item) => item.configured);
  const warnings = blockers.filter((blocker) => blocker.severity === "warning");
  const blocking = blockers.filter((blocker) => blocker.severity === "blocking");
  const runtimeBlocking = blocking.filter((blocker) => !isWorkflowSurfaceKey(blocker.key));
  const approvalTools = tools.filter((tool) => tool.requiresApproval).map((tool) => String(tool.name));
  const requiredApprovalTools = [
    "arcigy.generate_contract_documents",
    "arcigy.approve_prepared_outreach_reply",
    "arcigy.send_approved_outreach_reply",
    "arcigy.append_leads_to_google_sheet",
  ];
  const approvalReady = requiredApprovalTools.every((tool) => approvalTools.includes(tool));
  const liveChecks = diagnostics?.checks ?? [];
  const visibleLiveChecks = liveChecks.filter((check) => !isCoveredOptionalDiagnosticIssue(check, liveChecks));
  const liveAdvisoryKeys = ["redis", "serper", "remoteMcp"];
  const liveBlocking = visibleLiveChecks.filter((check) => check.status === "failed" && !liveAdvisoryKeys.includes(check.key));
  const liveWarnings = visibleLiveChecks.filter((check) => check.status !== "ready" && liveAdvisoryKeys.includes(check.key));
  return [
    {
      id: "required-integrations",
      title: "Required integrations",
      status: runtimeBlocking.length ? "blocked" : "ready",
      proof: `${readyRequired.length}/${requiredIntegrations.length} required integration group(s) configured.`,
      nextAction: runtimeBlocking[0]?.nextAction ?? "Keep required integration secrets in .env.local and rerun doctor before live work.",
    },
    {
      id: "optional-advisories",
      title: "Optional advisories",
      status: warnings.length ? "attention" : "ready",
      proof: warnings.length ? `${warnings.length} non-blocking warning(s): ${warnings.map((item) => item.key).join(", ")}.` : "No non-blocking warnings.",
      nextAction: warnings[0]?.nextAction ?? "Netreba akciu.",
    },
    {
      id: "mcp-registry",
      title: "MCP tool registry",
      status: tools.length >= 28 ? "ready" : "blocked",
      proof: `${tools.length} MCP tool(s) registered.`,
      nextAction: tools.length >= 28 ? "Run npm run remote:mcp:smoke before remote agent handoff." : "Restore missing MCP tools, then rerun npm test.",
    },
    {
      id: "approval-locks",
      title: "Schvalovacie zamky",
      status: approvalReady ? "ready" : "blocked",
      proof: approvalReady ? `${approvalTools.length} approval-gated tool(s), including contract, prepared reply send, and Sheet writes.` : "One or more required approval gates are missing.",
      nextAction: approvalReady ? "Review exact payloads before approving write tools." : "Restore approval gates for write tools before live use.",
    },
    {
      id: "live-diagnostics",
      title: "Live diagnostics",
      status: diagnostics ? (liveBlocking.length ? "blocked" : liveWarnings.length ? "attention" : "ready") : "attention",
      proof: diagnostics
        ? `${visibleLiveChecks.filter((check) => check.status === "ready").length}/${visibleLiveChecks.length} live diagnostic check(s) ready.`
        : "Live diagnostics were not requested for this report.",
      nextAction: diagnostics ? liveBlocking[0]?.message ?? liveWarnings[0]?.message ?? "Live diagnostics are ready." : "Run npm run doctor -- --live-integrations.",
    },
    ...coreWorkflowSurfaces.map((surface) => workflowChecklistItem(surface, tools)),
  ];
}

type CoreWorkflowSurface = {
  id: string;
  title: string;
  tools: JarvisMcpToolName[];
  approvalRequired: JarvisMcpToolName[];
  proof: string;
};

const coreWorkflowSurfaces: CoreWorkflowSurface[] = [
  {
    id: "contract-workflow",
    title: "Contract automation workflow",
    tools: ["arcigy.draft_contract_intake", "arcigy.generate_contract_documents"],
    approvalRequired: ["arcigy.generate_contract_documents"],
    proof: "Gemini intake draft and approval-gated DOCX contract generation are registered.",
  },
  {
    id: "outreach-workflow",
    title: "Cold outreach workflow",
    tools: [
      "arcigy.get_smartlead_outreach_brief",
      "arcigy.get_cold_outreach_brief_from_db",
      "arcigy.prepare_positive_outreach_reply",
      "arcigy.get_prepared_outreach_replies",
      "arcigy.get_approval_queue",
      "arcigy.send_approved_outreach_reply",
    ],
    approvalRequired: ["arcigy.send_approved_outreach_reply"],
    proof: "Smartlead/local outreach briefs, Gemini positive reply drafts, approval queue, and approval-gated Gmail send are registered.",
  },
  {
    id: "client-memory-workflow",
    title: "Client memory workflow",
    tools: [
      "arcigy.identify_email",
      "arcigy.ingest_client_message",
      "arcigy.get_client_need_alerts",
      "arcigy.update_client_need_status",
      "arcigy.get_local_memory_snapshot",
      "arcigy.export_local_memory_snapshot",
    ],
    approvalRequired: ["arcigy.update_client_need_status", "arcigy.export_local_memory_snapshot"],
    proof: "Email identity, client need alerts, status updates, and redacted memory snapshot export are registered.",
  },
  {
    id: "voice-workflow",
    title: "Jarvis voice workflow",
    tools: ["arcigy.jarvis_voice_event", "arcigy.get_operator_briefing", "arcigy.get_production_verification_evidence"],
    approvalRequired: [],
    proof: "Wake-word command handling, operator briefing, and production evidence voice path are registered.",
  },
  {
    id: "remote-agent-workflow",
    title: "Remote agent workflow",
    tools: ["arcigy.get_remote_mcp_pack", "arcigy.run_remote_mcp_smoke", "arcigy.get_production_readiness", "arcigy.get_production_verification_evidence"],
    approvalRequired: [],
    proof: "Remote MCP pack, smoke proof, readiness, and production evidence tools are registered.",
  },
];

function buildWorkflowSurfaceBlockers(tools: JarvisMcpTool[]): ReadinessBlocker[] {
  return coreWorkflowSurfaces.flatMap((surface) => {
    const missing = missingWorkflowTools(surface, tools);
    const missingApprovals = missingWorkflowApprovalLocks(surface, tools);
    if (!missing.length && !missingApprovals.length) return [];
    return [
      {
        key: surface.id,
        severity: "blocking",
        message: `Core Jarvis workflow surface is incomplete: ${[...missing.map((tool) => `missing ${tool}`), ...missingApprovals.map((tool) => `missing approval lock for ${tool}`)].join("; ")}.`,
        nextAction: `Restore ${surface.title} MCP surface and rerun npm test.`,
      },
    ];
  });
}

function workflowChecklistItem(surface: CoreWorkflowSurface, tools: JarvisMcpTool[]): ReadinessLaunchChecklistItem {
  const missing = missingWorkflowTools(surface, tools);
  const missingApprovals = missingWorkflowApprovalLocks(surface, tools);
  const ready = missing.length === 0 && missingApprovals.length === 0;
  return {
    id: surface.id,
    title: surface.title,
    status: ready ? "ready" : "blocked",
    proof: ready
      ? surface.proof
      : `Missing ${missing.length} tool(s) and ${missingApprovals.length} approval lock(s).`,
    nextAction: ready ? "Keep this workflow covered by npm test, doctor, and production verification." : `Restore ${surface.title} MCP surface and rerun npm test.`,
  };
}

function missingWorkflowTools(surface: CoreWorkflowSurface, tools: JarvisMcpTool[]): JarvisMcpToolName[] {
  const registered = new Set(tools.map((tool) => tool.name));
  return surface.tools.filter((tool) => !registered.has(tool));
}

function missingWorkflowApprovalLocks(surface: CoreWorkflowSurface, tools: JarvisMcpTool[]): JarvisMcpToolName[] {
  const approvalTools = new Set(tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name));
  return surface.approvalRequired.filter((tool) => !approvalTools.has(tool));
}

function isWorkflowSurfaceKey(key: string): boolean {
  return coreWorkflowSurfaces.some((surface) => surface.id === key);
}

function integrationHealthBlockers(item: IntegrationHealth): ReadinessBlocker[] {
  if (isOperationallyConfigured(item)) return [];
  return item.missing
    .filter((missing) => !isUnusedRedisPlaceholderIssue(item.key, missing))
    .map((missing) => ({
      key: item.key,
      severity: item.requiredForProduction ? "blocking" : "warning",
      message: `Missing or invalid runtime config: ${missing}`,
      nextAction: nextActionFor(item.key, missing),
    }));
}

function isOperationallyConfigured(item: IntegrationHealth): boolean {
  return item.configured || item.missing.length > 0 && item.missing.every((missing) => isUnusedRedisPlaceholderIssue(item.key, missing));
}

function diagnosticBlockers(check: DiagnosticCheck, checks: DiagnosticCheck[]): ReadinessBlocker[] {
  if (check.status === "ready") return [];
  if (isCoveredOptionalDiagnosticIssue(check, checks)) return [];
  const requiredForProduction = !["redis", "serper", "remoteMcp"].includes(check.key);
  return [
    {
      key: check.key,
      severity: requiredForProduction ? "blocking" : "warning",
      message: check.message,
      nextAction: nextActionFor(check.key, check.message),
    },
  ];
}

function isCoveredOptionalDiagnosticIssue(check: DiagnosticCheck, checks: DiagnosticCheck[]): boolean {
  if (isUnusedRedisPlaceholderIssue(check.key, check.message)) return true;
  return check.key === "serper" && checks.some((item) => item.key === "googleMaps" && item.status === "ready");
}

function nextActionFor(key: string, message: string): string {
  const text = `${key} ${message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) return "Replace REDIS_URL with the real Railway Redis password, then rerun npm run doctor -- --live-integrations.";
  if (text.includes("redis") && text.includes("rediss")) return "Change REDIS_URL to rediss:// if the provider requires TLS, then rerun live diagnostics.";
  if (text.includes("serper") && text.includes("not enough credits")) return "Top up or replace at least one Serper API key; both configured keys were exhausted.";
  if (text.includes("remotemcp") || text.includes("jarvis_web_token") || text.includes("api_secret_key fallback")) {
    return "Set a strong JARVIS_WEB_TOKEN in .env.local or use npm run web:tunnel:secure for a one-time remote MCP token.";
  }
  if (text.includes("gmail")) return "Refresh Google OAuth credentials for the configured Gmail accounts.";
  if (text.includes("google")) return "Verify Google API key, OAuth scopes, and the configured Sheet ID.";
  if (text.includes("smartlead")) return "Verify Smartlead API key and campaign access.";
  if (text.includes("gemini")) return "Verify GEMINI_API_KEY and Gemini API quota.";
  if (text.includes("postgres") || text.includes("database")) return "Verify DATABASE_URL credentials and network access.";
  return `Fix ${key} runtime configuration and rerun npm run doctor.`;
}

function dedupeBlockers(blockers: ReadinessBlocker[]): ReadinessBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.key}:${blocker.severity}:${blocker.nextAction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(status: ReadinessStatus, ready: number, total: number, toolCount: number, blockers: ReadinessBlocker[]): string {
  const blocking = blockers.filter((blocker) => blocker.severity === "blocking").length;
  const warnings = blockers.length - blocking;
  if (status === "ready") {
    return `Production gates ready: ${ready}/${total} integrations configured and ${toolCount} MCP tools available.`;
  }
  if (status === "attention") {
    return warnings
      ? `Production gates need attention: ${ready}/${total} integrations configured, ${toolCount} MCP tools available, ${warnings} non-blocking warning(s).`
      : `Production gates need attention: ${ready}/${total} integrations configured and ${toolCount} MCP tools available.`;
  }
  return `Production needs attention: ${ready}/${total} integrations ready, ${toolCount} MCP tools available, ${blocking} blocker(s), ${warnings} warning(s).`;
}

function buildFixGuide(blockers: ReadinessBlocker[]): ReadinessFixStep[] {
  const steps = blockers.map(fixStepFor).filter((step): step is ReadinessFixStep => step !== null);
  if (!steps.length) {
    return [
      {
        id: "verify-before-change",
        title: "Keep production proof green",
        detail: "Run the local doctor before changes and keep real secret values only in .env.local.",
        envKeys: [],
        validationCommand: "npm run doctor",
      },
    ];
  }
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

function buildAttentionQueue(blockers: ReadinessBlocker[], fixGuide: ReadinessFixStep[]): ReadinessAttentionItem[] {
  if (!blockers.length) return [];
  return blockers.map((blocker, index) => {
    const fixStep = fixGuide.find((step) => step.envKeys.some((key) => blocker.message.includes(key))) ?? fixGuide[index] ?? null;
    return {
      id: `${blocker.severity}-${blocker.key}-${index + 1}`,
      key: blocker.key,
      severity: blocker.severity,
      source: blocker.message.startsWith("Missing or invalid runtime config") ? "configuration" : "live-diagnostic",
      title: fixStep?.title ?? `Review ${blocker.key}`,
      message: blocker.message,
      nextAction: blocker.nextAction,
      envKeys: fixStep?.envKeys ?? [],
      validationCommand: fixStep?.validationCommand ?? "npm run doctor -- --live-integrations",
    };
  });
}

function fixStepFor(blocker: ReadinessBlocker): ReadinessFixStep | null {
  const text = `${blocker.key} ${blocker.message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) {
    return {
      id: "redis-real-password",
      title: "Replace Redis placeholder password",
      detail: "Set REDIS_URL to the real Railway Redis URL. The report never returns the secret value; it only flags placeholder credentials.",
      envKeys: ["REDIS_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("serper") && text.includes("not enough credits")) {
    return {
      id: "serper-credits",
      title: "Restore Serper search credits",
      detail: "Top up or replace at least one Serper key. The live check already tries SERPER_API_KEY and SERPER_API_KEY_2 before reporting exhaustion.",
      envKeys: ["SERPER_API_KEY", "SERPER_API_KEY_2"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("remotemcp") || text.includes("jarvis_web_token") || text.includes("api_secret_key fallback")) {
    return {
      id: "remote-mcp-token",
      title: "Configure remote MCP bearer token",
      detail: "Set JARVIS_WEB_TOKEN to a non-dummy value with at least 32 characters before persistent tunnel handoff, or use npm run web:tunnel:secure for an ephemeral one-time token.",
      envKeys: ["JARVIS_WEB_TOKEN", "API_SECRET_KEY"],
      validationCommand: "npm run secrets:audit && npm run doctor",
    };
  }
  if (text.includes("gmail") || text.includes("google")) {
    return {
      id: "google-oauth",
      title: "Verify Google OAuth and API access",
      detail: "Refresh OAuth credentials, confirm Sheets access, and keep Google keys in .env.local only.",
      envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_SHEET_ID", "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEYS"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("smartlead")) {
    return {
      id: "smartlead-access",
      title: "Verify Smartlead access",
      detail: "Confirm the Smartlead API key has access to campaigns used by Jarvis.",
      envKeys: ["SMARTLEAD_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("gemini")) {
    return {
      id: "gemini-access",
      title: "Verify Gemini access",
      detail: "Confirm Gemini API key and quota for AI drafting features.",
      envKeys: ["GEMINI_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("postgres") || text.includes("database")) {
    return {
      id: "postgres-access",
      title: "Verify Postgres access",
      detail: "Confirm DATABASE_URL credentials and network access.",
      envKeys: ["DATABASE_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  return null;
}
