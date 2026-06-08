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
    paths[`/api/mcp/${tool.name}`] = {
      post: {
        operationId: operationIdFor(tool.name),
        summary: tool.name,
        description: `${tool.description} ${tool.requiresApproval ? 'Requires explicit {"approval":{"approved":true}} after operator confirmation.' : "Read-only, draft, or local-memory workflow as described by the MCP registry."}`,
        tags: [tool.requiresApproval ? "approval-required" : "jarvis"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: tool.requiresApproval ? { $ref: "#/components/schemas/ApprovalCapablePayload" } : { $ref: "#/components/schemas/GenericMcpPayload" },
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
