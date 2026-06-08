import { listJarvisMcpTools } from "./mcp-tools.ts";
import { buildProductionReadinessReport, type ProductionReadinessReport } from "./production-readiness.ts";

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
  tools: {
    count: number;
    names: string[];
    approvalRequired: string[];
    readOnlyOrDraft: string[];
  };
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
    nextActions: string[];
  };
  agentInstructions: string[];
};

export async function buildRemoteMcpConnectionPack(
  input: RemoteMcpConnectionPackInput = {}
): Promise<RemoteMcpConnectionPack> {
  const baseUrl = (input.baseUrl || "http://127.0.0.1:8765").replace(/\/+$/g, "");
  const tools = listJarvisMcpTools();
  const approvalRequired = tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
  const readiness = input.includeReadiness === false ? undefined : await buildProductionReadinessReport({ live: input.live === true, dbPath: input.dbPath });

  return {
    mode: "remote-mcp-connection-pack",
    source: input.source ?? "mcp",
    generatedAt: new Date().toISOString(),
    baseUrl,
    manifestUrl: `${baseUrl}/.well-known/arcigy-jarvis.json`,
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
    tools: {
      count: tools.length,
      names: tools.map((tool) => tool.name),
      approvalRequired,
      readOnlyOrDraft: tools.filter((tool) => !tool.requiresApproval).map((tool) => tool.name),
    },
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
          nextActions: readiness.nextActions,
        }
      : undefined,
    agentInstructions: [
      "Fetch the manifestUrl first to list live tools and schemas.",
      "Call MCP tools with POST JSON to mcpToolCallPattern.",
      "Use the bearer auth header placeholder; the real token must be supplied by the operator and is never returned by this pack.",
      "Treat generate_contract_documents, approve_prepared_outreach_reply, and append_leads_to_google_sheet as approval-gated actions.",
      "Use get_operator_briefing for a Jarvis-style daily status before making recommendations.",
    ],
  };
}
