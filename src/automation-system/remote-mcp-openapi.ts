import { listJarvisMcpTools } from "./mcp-tools.ts";

export type RemoteMcpOpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  security: Array<{ bearerAuth: string[] }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http";
        scheme: "bearer";
        bearerFormat: "JARVIS_WEB_TOKEN";
        description: string;
      };
    };
    schemas: Record<string, unknown>;
  };
  "x-arcigy-policy": {
    tokenValueReturned: false;
    familyFriendly: true;
    approvalRule: string;
  };
};

export function buildRemoteMcpOpenApiDocument(baseUrl = "http://127.0.0.1:8765"): RemoteMcpOpenApiDocument {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/g, "");
  const tools = listJarvisMcpTools();
  const paths: Record<string, unknown> = {};
  for (const tool of tools) {
    const example = examplePayloadForTool(tool.name);
    paths[`/api/mcp/${tool.name}`] = {
      post: {
        operationId: operationIdFor(tool.name),
        summary: tool.name,
        description: `${tool.description} ${tool.requiresApproval ? 'Requires explicit {"approval":{"approved":true}} after operator confirmation.' : "Read-only, draft, or local-memory workflow as described by the MCP registry."}`,
        tags: [tool.requiresApproval ? "approval-required" : "jarvis"],
        security: [{ bearerAuth: [] }],
        "x-arcigy-requiresApproval": tool.requiresApproval,
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: tool.requiresApproval ? { $ref: "#/components/schemas/ApprovalCapablePayload" } : { $ref: "#/components/schemas/GenericMcpPayload" },
              examples: {
                quickStart: {
                  summary: "Secret-safe quick-start payload",
                  value: example,
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Tool call succeeded. Response body is secret-redacted by Jarvis.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/McpToolResponse" },
              },
            },
          },
          "409": {
            description: "Approval required for approval-gated tools.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Arcigy Jarvis Remote MCP Actions",
      version: "0.1.0",
      description:
        "Importable OpenAPI schema for ChatGPT custom actions, Grok/xAI-compatible HTTP agents, Claude, and other remote agents calling the Arcigy Jarvis local web bridge.",
    },
    servers: [{ url: normalizedBaseUrl, description: "Arcigy Jarvis local web bridge or secure tunnel public URL." }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JARVIS_WEB_TOKEN",
          description: "Use Authorization: Bearer <JARVIS_WEB_TOKEN>. The real token is supplied by the operator and is never returned by Jarvis.",
        },
      },
      schemas: {
        GenericMcpPayload: {
          type: "object",
          additionalProperties: true,
          description: "JSON payload for a Jarvis MCP tool. Use the connection pack quickStartCalls for exact examples.",
        },
        ApprovalCapablePayload: {
          type: "object",
          additionalProperties: true,
          properties: {
            approval: { $ref: "#/components/schemas/Approval" },
          },
          description: 'Approval-gated tools require {"approval":{"approved":true}} only after the operator confirms the exact action.',
        },
        Approval: {
          type: "object",
          additionalProperties: false,
          properties: {
            approved: { type: "boolean", const: true },
          },
          required: ["approved"],
        },
        McpToolResponse: {
          type: "object",
          additionalProperties: true,
          properties: {
            result: { description: "Tool-specific result object or value." },
            error: { type: "string" },
          },
        },
        ErrorResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
      },
    },
    "x-arcigy-policy": {
      tokenValueReturned: false,
      familyFriendly: true,
      approvalRule: "Never call approval-required operations until the operator confirms the exact payload.",
    },
  };
}

function operationIdFor(toolName: string): string {
  return toolName.replace(/^arcigy\./, "arcigy_").replace(/[^A-Za-z0-9_]/g, "_");
}

function examplePayloadForTool(toolName: string): Record<string, unknown> {
  if (toolName === "arcigy.run_remote_mcp_smoke") return {};
  if (toolName === "arcigy.get_operator_briefing") return { periodLabel: "poslednych 7 dni", live: false, syncGmail: false };
  if (toolName === "arcigy.get_production_readiness") return { live: false };
  if (toolName === "arcigy.get_approval_queue") return { limit: 20 };
  if (toolName === "arcigy.identify_email") return { email: "client@example.com" };
  if (toolName === "arcigy.get_client_need_alerts") return { status: "new", limit: 10 };
  if (toolName === "arcigy.get_audit_events") return { limit: 20 };
  if (toolName === "arcigy.get_local_memory_snapshot") return { limit: 10 };
  if (toolName === "arcigy.draft_contract_intake") return { brief: "Klient potrebuje webovu aplikaciu pre lead intake, reporting a klientsku evidenciu." };
  if (toolName === "arcigy.generate_ai_reply") return { message: "Potrebujem upravit onboarding automatizaciu do piatku.", language: "sk", tone: "executive" };
  if (toolName === "arcigy.sync_gmail_recent_messages") return { dryRun: true, maxResults: 5 };
  if (toolName === "arcigy.get_smartlead_outreach_brief") return { periodLabel: "poslednych 7 dni" };
  if (toolName === "arcigy.discover_leads") return { query: "automation agency Bratislava", maxResults: 5 };
  if (toolName === "arcigy.prepare_positive_outreach_reply") {
    return {
      leadEmail: "lead@example.com",
      companyName: "Demo Company",
      positiveSignal: "Lead asked for pricing and a short discovery call.",
      language: "sk",
      tone: "executive",
    };
  }
  if (toolName === "arcigy.generate_contract_documents") {
    return {
      approval: { approved: true },
      intake: {
        client: { businessName: "Demo Klient s. r. o.", email: "client@example.com" },
        project: { name: "Demo webova aplikacia", includedModules: ["Klientsky portal", "Reporting"] },
        pricing: { implementationFeeEur: 2000, monthlyFeeEur: 200 },
      },
    };
  }
  if (toolName === "arcigy.send_approved_outreach_reply") return { preparedEventId: "prepared_reply_id", approval: { approved: true } };
  if (toolName === "arcigy.update_client_need_status") return { needSignalId: "client_need_signal_id", status: "resolved", approval: { approved: true } };
  if (toolName === "arcigy.append_leads_to_google_sheet") return { rows: [["Demo Company", "https://example.com", "lead@example.com"]], approval: { approved: true } };
  return {};
}
