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
  localhostBypass?: boolean;
  maxJsonBytes?: number;
  source?: "web" | "mcp";
};

export type RemoteMcpConnectionPack = {
  mode: "remote-mcp-connection-pack";
  source: "web" | "mcp";
  generatedAt: string;
  baseUrl: string;
  manifestUrl: string;
  smokeTestUrl: string;
  mcpBaseUrl: string;
  mcpToolCallPattern: string;
  auth: {
    type: "bearer";
    header: "Authorization: Bearer <JARVIS_WEB_TOKEN>";
    tokenConfigured: boolean;
    tokenValueReturned: false;
    requiredForExternalHosts: true;
    localhostBypass: boolean;
  };
  tunnel: {
    provider: "ngrok";
    secureCommand: "npm run web:tunnel:secure";
    standardCommand: "npm run web:tunnel";
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
  limits: {
    maxJsonBytes: number;
    pathPolicy: "repo-only";
    writesRequireExplicitToolCall: true;
  };
  readiness?: {
    status: ProductionReadinessReport["status"];
    summary: string;
    checkedAt: string;
    blockers: ProductionReadinessReport["blockers"];
    attentionQueue: ProductionReadinessReport["attentionQueue"];
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
    smokeTestUrl: `${baseUrl}/api/remote-mcp-smoke`,
    mcpBaseUrl: `${baseUrl}/api/mcp`,
    mcpToolCallPattern: `${baseUrl}/api/mcp/{toolName}`,
    auth: {
      type: "bearer",
      header: "Authorization: Bearer <JARVIS_WEB_TOKEN>",
      tokenConfigured: input.tokenConfigured === true,
      tokenValueReturned: false,
      requiredForExternalHosts: true,
      localhostBypass: input.localhostBypass !== false,
    },
    tunnel: {
      provider: "ngrok",
      secureCommand: "npm run web:tunnel:secure",
      standardCommand: "npm run web:tunnel",
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
    limits: {
      maxJsonBytes: input.maxJsonBytes ?? 1_000_000,
      pathPolicy: "repo-only",
      writesRequireExplicitToolCall: true,
    },
    readiness: readiness
      ? {
          status: readiness.status,
          summary: readiness.summary,
          checkedAt: readiness.checkedAt,
          blockers: readiness.blockers,
          attentionQueue: readiness.attentionQueue,
          nextActions: readiness.nextActions,
          fixGuide: readiness.fixGuide,
        }
      : undefined,
    agentInstructions: [
      "Fetch the manifestUrl first to list live tools and schemas.",
      "Run the smokeTestUrl before handoff if you need proof that the bridge, read-only MCP calls, approval gates, and secret policy are working.",
      "Call MCP tools with POST JSON to mcpToolCallPattern.",
      "Use the bearer auth header placeholder; the real token must be supplied by the operator and is never returned by this pack.",
      "Treat generate_contract_documents, approve_prepared_outreach_reply, and append_leads_to_google_sheet as approval-gated actions.",
      "Treat localStateWrite tools as local memory writes. Prefer dryRun: true for sync_gmail_recent_messages before ingesting messages.",
      "Use get_operator_briefing for a Jarvis-style daily status before making recommendations.",
    ],
  };
}

function buildHandoffRunbook(baseUrl: string): RemoteMcpConnectionPack["handoff"] {
  return {
    connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
    operatorChecklist: [
      "Run npm run web:tunnel:secure and keep the process open while the remote agent works.",
      "Give the remote agent the external manifest, connection pack, smoke test URL, MCP base URL, and bearer auth header placeholder.",
      "Approve approvalRequired tools only after reviewing the exact payload the agent will send.",
      "Run the smoke test again after any tunnel restart because ngrok URLs can change.",
    ],
    agentFirstSteps: [
      "Fetch connectionPackUrl with Authorization: Bearer <JARVIS_WEB_TOKEN>.",
      "Run smokeTestUrl and require status=ready before using MCP tools.",
      "Call arcigy.get_operator_briefing before proposing work.",
      "Use read-only or draft tools first; use dryRun: true before Gmail sync writes.",
      "Never call approvalRequired tools until the operator confirms the exact action.",
    ],
    requiredProof: [
      {
        key: "manifest",
        url: `${baseUrl}/.well-known/arcigy-jarvis.json`,
        expected: "HTTP 200, auth header placeholder, complete MCP tool registry.",
      },
      {
        key: "connection-pack",
        url: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
        expected: "HTTP 200, tokenValueReturned=false, handoff runbook present.",
      },
      {
        key: "remote-smoke",
        url: `${baseUrl}/api/remote-mcp-smoke`,
        expected: "status=ready for manifest, tool count, local write policy, approval gate, and secret redaction.",
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
      label: "Get Jarvis operator briefing",
      tool: "arcigy.get_operator_briefing",
      method: "POST",
      url: toolUrl("arcigy.get_operator_briefing"),
      body: { periodLabel: "poslednych 7 dni", live: false },
      approvalRequired: false,
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
      businessName: "Demo Klient s. r. o.",
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
      name: "Demo automatizacna aplikacia",
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
    specialTerms: ["Demo quick-start payload; operator must replace client data before real use."],
    additionalAttachments: [],
  };
}
