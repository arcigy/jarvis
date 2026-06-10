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
  "x-arcigy-agent-setup": {
    supportedAgents: Array<"Claude" | "ChatGPT" | "Grok" | "Generic HTTP agent">;
    recommendedImports: {
      actionManifestUrl: string;
      openApiSchemaUrl: string;
      connectionPackUrl: string;
      smokeTestUrl: string;
      productionVerificationEvidenceUrl: string;
      mcpToolCallPattern: string;
    };
    firstTools: Array<"arcigy.get_operator_briefing" | "arcigy.get_jarvis_capability_audit" | "arcigy.get_production_completion_score" | "arcigy.get_production_verification_evidence">;
    proofPolicy: {
      freshnessMaxAgeHours: 24;
      beforeAnyWork: string[];
      beforeWrites: string[];
    };
    safetyRails: string[];
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
    "x-arcigy-agent-setup": buildOpenApiAgentSetup(normalizedBaseUrl),
  };
}

function buildOpenApiAgentSetup(baseUrl: string): RemoteMcpOpenApiDocument["x-arcigy-agent-setup"] {
  return {
    supportedAgents: ["Claude", "ChatGPT", "Grok", "Generic HTTP agent"],
    recommendedImports: {
      actionManifestUrl: `${baseUrl}/.well-known/ai-plugin.json`,
      openApiSchemaUrl: `${baseUrl}/api/openapi.json`,
      connectionPackUrl: `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
      smokeTestUrl: `${baseUrl}/api/remote-mcp-smoke`,
      productionVerificationEvidenceUrl: `${baseUrl}/api/production-verification-evidence`,
      mcpToolCallPattern: `${baseUrl}/api/mcp/{toolName}`,
    },
    firstTools: ["arcigy.get_operator_briefing", "arcigy.get_jarvis_capability_audit", "arcigy.get_production_completion_score", "arcigy.get_production_verification_evidence"],
    proofPolicy: {
      freshnessMaxAgeHours: 24,
      beforeAnyWork: [
        "Load connectionPackUrl and require auth.tokenValueReturned=false.",
        "Run smokeTestUrl and require status=ready with all 37 required remote MCP smoke gates ready.",
        "Call arcigy.get_jarvis_capability_audit and require status=ready or explicit operator attention.",
        "Call arcigy.get_production_completion_score and require quick-start coverage, then call productionVerificationEvidenceUrl and require status=ready, dirty=false, freshness.fresh=true.",
      ],
      beforeWrites: [
        "Show the exact approval-required payload to the operator.",
        "Only call write tools after the operator confirms approval.approved=true.",
        "Never send Gmail, export Sheets, update client status, or generate DOCX from an implicit approval.",
      ],
    },
    safetyRails: [
      "Keep all outputs family-friendly and client-safe.",
      "Never reveal bearer tokens, OAuth refresh tokens, API keys, database URLs, or local private paths.",
      "Use dry-run or read-only tools before local writes whenever available.",
    ],
  };
}

function operationIdFor(toolName: string): string {
  return toolName.replace(/^arcigy\./, "arcigy_").replace(/[^A-Za-z0-9_]/g, "_");
}

function examplePayloadForTool(toolName: string): Record<string, unknown> {
  if (toolName === "arcigy.run_remote_mcp_smoke") return {};
  if (toolName === "arcigy.get_operator_briefing") return { periodLabel: "poslednych 7 dni", live: false, syncGmail: false };
  if (toolName === "arcigy.get_proactive_attention_digest") return { periodLabel: "poslednych 7 dni", live: false, syncGmail: false };
  if (toolName === "arcigy.get_leadgen_daily_report") {
    return {
      periodLabel: "dnes",
      campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
      stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "kuchynske studia" }],
      settings: { leadgenActive: true, aiRepliesActive: true },
    };
  }
  if (toolName === "arcigy.get_leadgen_evening_summary") {
    return {
      sentToday: 30,
      repliesToday: 4,
      positiveToday: 1,
      recentReplies: [{ decisionMakerName: "Jan Novak", companyName: "Modelova Firma", replySentiment: "Interested", website: "https://example.com" }],
    };
  }
  if (toolName === "arcigy.select_next_niche") {
    return {
      niches: [{ id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", keywords: ["kuchyne na mieru"], regions: ["Bratislava", "Trnava"], currentRegionIndex: 0, dailyTarget: 25 }],
    };
  }
  if (toolName === "arcigy.get_production_readiness") return { live: false };
  if (toolName === "arcigy.get_production_completion_score") return { live: false };
  if (toolName === "arcigy.get_jarvis_capability_audit") return { live: false };
  if (toolName === "arcigy.get_approval_queue") return { limit: 20 };
  if (toolName === "arcigy.identify_email") return { email: "client@example.com" };
  if (toolName === "arcigy.get_client_need_alerts") return { status: "new", limit: 10 };
  if (toolName === "arcigy.get_audit_events") return { limit: 20 };
  if (toolName === "arcigy.get_local_memory_snapshot") return { limit: 10 };
  if (toolName === "arcigy.draft_contract_intake") return { brief: "Klient potrebuje webovu aplikaciu pre lead intake, reporting a klientsku evidenciu." };
  if (toolName === "arcigy.draft_price_offer_intake") return { brief: "Klient Modelova Firma chce automatizovat dopyty, setup 2000 EUR, mesacne 200 EUR, ciel je usetrit obchodnikovi 8 hodin tyzdenne." };
  if (toolName === "arcigy.generate_price_offer_document") {
    return {
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
    };
  }
  if (toolName === "arcigy.generate_ai_reply") return { message: "Potrebujem upravit onboarding automatizaciu do piatku.", language: "sk", tone: "executive" };
  if (toolName === "arcigy.sync_gmail_recent_messages") return { dryRun: true, maxResults: 5 };
  if (toolName === "arcigy.get_smartlead_outreach_brief") return { periodLabel: "poslednych 7 dni" };
  if (toolName === "arcigy.get_smartlead_campaign_leads") return { campaignId: "123456", offset: 0, limit: 100 };
  if (toolName === "arcigy.preview_smartlead_lead_sync") return { campaignIds: ["123456"], limitPerCampaign: 100 };
  if (toolName === "arcigy.get_smartlead_message_history") return { campaignId: "123456", email: "lead@example.com" };
  if (toolName === "arcigy.draft_smartlead_thread_reply") {
    return {
      campaignId: "123456",
      email: "lead@example.com",
      leadName: "Jan Novak",
      positiveSignal: "Lead asked to see the showcase.",
      latestLeadReply: "Dobry den, poslite mi prosim ukazku.",
      language: "sk",
    };
  }
  if (toolName === "arcigy.send_smartlead_thread_reply") {
    return {
      campaignId: "123456",
      email: "lead@example.com",
      emailBody: "Dobry den pan Novak,<br><br>posielam slubenu ukazku: <a href='https://www.arcigy.com/showcase'>https://www.arcigy.com/showcase</a>.",
      approval: { approved: true },
    };
  }
  if (toolName === "arcigy.create_smartlead_campaign") {
    return {
      name: "MODEL CAMPAIGN",
      sequences: [{ seq_number: 1, seq_delay_details: { delay_in_days: 0 }, seq_variants: [{ variant_label: "A", subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }] }],
      approval: { approved: true },
    };
  }
  if (toolName === "arcigy.configure_smartlead_campaign") {
    return {
      campaignId: "123456",
      schedule: { timezone: "Europe/Bratislava", start_hour: "08:00", end_hour: "18:00", days_of_the_week: [1, 2, 3, 4, 5], max_new_leads_per_day: 25, min_time_btw_emails: 10 },
      approval: { approved: true },
    };
  }
  if (toolName === "arcigy.discover_leads") return { query: "automation agency Bratislava", maxResults: 5 };
  if (toolName === "arcigy.scrape_website_contacts") return { url: "https://example.com", includePriorityPages: true, maxPages: 4 };
  if (toolName === "arcigy.enrich_slovak_company_register") return { companyName: "Modelova Firma s.r.o." };
  if (toolName === "arcigy.score_lead_quality") {
    return { minScore: 70, leads: [{ email: "majitel@example.sk", website: "https://example.sk", decisionMaker: "Jan Novak", registerVerified: true, personalizedIntro: "Kratke AI intro." }] };
  }
  if (toolName === "arcigy.dedupe_lead_candidates") return { leads: [{ email: "lead@example.com", companyName: "Modelova Firma" }, { email: "lead@example.com", companyName: "Duplicita" }] };
  if (toolName === "arcigy.build_niche_leadgen_plan") return { niche: "autoservisy", region: "Bratislava" };
  if (toolName === "arcigy.draft_smartlead_campaign_sequence") return { niche: "autoservisy", painPoint: "manualne riesenie dopytov", offer: "AI asistent na odpovede a follow-up", language: "sk" };
  if (toolName === "arcigy.preview_manual_review_pickup") {
    return {
      minScore: 50,
      leads: [
        {
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
        },
      ],
    };
  }
  if (toolName === "arcigy.build_smartlead_injection_plan") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      leads: [{ email: "lead@example.com", decisionMakerName: "Jan Novak", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }],
    };
  }
  if (toolName === "arcigy.draft_niche_smartlead_campaign_setup") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy" },
      offer: "AI asistent na odpovede a follow-up",
      painPoint: "manualne spracovanie dopytov",
      language: "sk",
    };
  }
  if (toolName === "arcigy.parse_leads_csv") return { csvText: "company_name,email,website\nModelova Firma,lead@example.com,https://example.com" };
  if (toolName === "arcigy.filter_blacklisted_leads") return { leads: [{ email: "lead@example.com", website: "https://example.com" }], domains: ["competitor.sk"], keywords: ["franchise"] };
  if (toolName === "arcigy.build_manual_review_queue") return { minScore: 70, leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }] };
  if (toolName === "arcigy.export_leads_csv") return { outputPath: "generated/leads/manual-review.csv", leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com" }], approval: { approved: true } };
  if (toolName === "arcigy.draft_lead_intro") return { companyName: "Modelova Firma", website: "https://example.com", context: "Firma riesi B2B obchod.", language: "sk" };
  if (toolName === "arcigy.prepare_smartlead_leads") {
    return {
      defaultSource: "jarvis-mcp",
      leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Vsimal som si, ze rastiete v B2B segmente." }],
    };
  }
  if (toolName === "arcigy.run_leadgen_research_pipeline") return { query: "kuchynske studio Slovensko", maxResults: 3, scrapeWebsites: true, draftIntros: false };
  if (toolName === "arcigy.add_leads_to_smartlead_campaign") {
    return {
      campaignId: "123456",
      leads: [{ email: "lead@example.com", company_name: "Modelova Firma", website: "example.com", custom_fields: { personalized_intro: "Kratke AI intro." } }],
      approval: { approved: true },
    };
  }
  if (toolName === "arcigy.prepare_positive_outreach_reply") {
    return {
      leadEmail: "lead@example.com",
      companyName: "Modelova Firma",
      positiveSignal: "Lead asked for pricing and a short discovery call.",
      language: "sk",
      tone: "executive",
    };
  }
  if (toolName === "arcigy.generate_contract_documents") {
    return {
      approval: { approved: true },
      intake: {
        client: { businessName: "Modelovy Klient s. r. o.", email: "client@example.com" },
        project: { name: "Modelova webova aplikacia", includedModules: ["Klientsky portal", "Reporting"] },
        pricing: { implementationFeeEur: 2000, monthlyFeeEur: 200 },
      },
    };
  }
  if (toolName === "arcigy.send_approved_outreach_reply") return { preparedEventId: "prepared_reply_id", approval: { approved: true } };
  if (toolName === "arcigy.update_client_need_status") return { needSignalId: "client_need_signal_id", status: "resolved", approval: { approved: true } };
  if (toolName === "arcigy.append_leads_to_google_sheet") return { rows: [["Modelova Firma", "https://example.com", "lead@example.com"]], approval: { approved: true } };
  return {};
}
