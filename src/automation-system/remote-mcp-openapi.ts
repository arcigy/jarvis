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
  if (toolName === "arcigy.build_leadgen_slack_report_preview") {
    return {
      periodLabel: "dnes",
      dateLabel: "2026-06-10",
      campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
      stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "autoservisy" }],
      settings: { leadgenActive: true, aiRepliesActive: true },
    };
  }
  if (toolName === "arcigy.build_leadgen_ops_digest") {
    return {
      periodLabel: "dnes",
      campaigns: [{ stats: { sent_count: 100, open_count: 55, reply_count: 8, positive_reply_count: 2 } }],
      stuckLeads: [{ website: "https://example.com", email: "lead@example.com", nicheName: "autoservisy" }],
      recentReplies: [{ decisionMakerName: "Jan Novak", companyName: "Modelova Firma", replySentiment: "Interested", website: "https://example.com" }],
      settings: { leadgenActive: true, aiRepliesActive: true },
      niches: [{ id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis"], regions: ["Bratislava"], dailyTarget: 30, smartleadCampaignId: "123456" }],
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
  if (toolName === "arcigy.classify_outreach_reply") return { replyBody: "Dobry den, poslite mi prosim ukazku.", useAi: false };
  if (toolName === "arcigy.build_outreach_reply_triage_preview") {
    return {
      replies: [
        { source: "smartlead", email: "lead@example.com", campaignId: "123456", replyBody: "Dobry den, poslite mi prosim ukazku.", senderEmail: "andrej@arcigy.group", leadName: "Jan Novak" },
        { source: "gmail", email: "office@example.com", replyBody: "Nie dakujem, nemame zaujem.", senderEmail: "andrej@arcigy.group", threadId: "thread-123", messageId: "msg-123" },
      ],
      useAiClassification: false,
      maxReplies: 20,
    };
  }
  if (toolName === "arcigy.preview_smartlead_ai_reply") {
    return {
      toEmail: "lead@example.com",
      campaignId: "123456",
      eventType: "EMAIL_REPLY",
      emailBody: "Dobry den, poslite mi prosim ukazku.",
      fromEmail: "andrej@arcigy.group",
      leadName: "Jan Novak",
      categoryName: "Interested",
      generateDraft: false,
    };
  }
  if (toolName === "arcigy.preview_gmail_ai_reply") {
    return {
      senderEmail: "andrej@arcigy.group",
      fromEmail: "lead@example.com",
      subject: "Re: Otazka",
      body: "Dobry den, poslite mi prosim ukazku.",
      threadId: "thread-123",
      messageId: "msg-123",
      leadKnown: true,
      threadStartedByUs: true,
      generateDraft: false,
    };
  }
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
  if (toolName === "arcigy.fetch_url_preview") return { url: "https://example.com/api/status", method: "GET", parseJson: true, maxBytes: 20000 };
  if (toolName === "arcigy.batch_fetch_url_previews") {
    return { urls: ["https://example.com/api/status", "https://example.com/robots.txt"], method: "GET", parseJson: true, maxBytes: 12000, maxUrls: 10 };
  }
  if (toolName === "arcigy.build_url_intelligence_queue_preview") {
    return {
      urls: ["https://ready.sk", "needs-scrape.sk"],
      leads: [{ companyName: "Manual Lead", website: "https://manual.sk", email: "jan@manual.sk" }],
      sourceName: "jarvis-url-batch",
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
      maxUrls: 50,
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.build_lead_source_bundle_preview") {
    return {
      bundleName: "kuchyne-sk-import",
      sources: [
        {
          sourceName: "kuchyne_sk_google_maps.csv",
          sourceType: "csv",
          csvText: "company,website,email,personalized_intro\nReady Studio,https://ready.sk,jan@ready.sk,Vsimol som si vase kuchynske realizacie.",
          defaultNiche: { id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456" },
        },
        {
          sourceName: "kuchyne_enriched.json",
          sourceType: "json",
          jsonText: "{\"leads\":[{\"companyName\":\"Needs Scrape\",\"website\":\"https://needs-scrape.sk\"}]}",
          defaultNiche: { id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456" },
        },
      ],
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
      minScore: 70,
    };
  }
  if (toolName === "arcigy.build_lead_source_bundle_campaign_launch_preview") {
    return {
      bundleName: "kuchyne-sk-launch",
      sources: [
        {
          sourceName: "kuchyne_ready.csv",
          sourceType: "csv",
          csvText: "company,website,email,first_name,phone,personalized_intro\nReady Studio,https://ready.sk,jan@ready.sk,Jan,+421 900 111 222,Vsimol som si vase kuchynske realizacie.",
          defaultNiche: { id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456" },
        },
      ],
      offer: "AI asistent na odpovede a follow-up",
      painPoint: "manualne odpovedanie na dopyty",
      language: "sk",
      emailAccountIds: ["98765"],
      maxLaunchGroups: 3,
    };
  }
  if (toolName === "arcigy.discover_leads") return { query: "automation agency Bratislava", maxResults: 5 };
  if (toolName === "arcigy.scrape_website_contacts") return { url: "https://example.com", includePriorityPages: true, maxPages: 4 };
  if (toolName === "arcigy.batch_scrape_website_contacts") return { urls: ["https://example.com", "https://example.org"], includePriorityPages: true, maxPages: 4, maxSites: 10 };
  if (toolName === "arcigy.enrich_slovak_company_register") return { companyName: "Modelova Firma s.r.o." };
  if (toolName === "arcigy.build_slovak_register_batch_preview") {
    return {
      sourceName: "kuchyne_sk_google_maps_2026-04-27.csv",
      leads: [
        { companyName: "Ready Studio s.r.o.", website: "https://ready.sk", ico: "12345678" },
        { companyName: "Needs Konatel s.r.o.", website: "https://needs-konatel.sk" },
      ],
      maxLookups: 10,
    };
  }
  if (toolName === "arcigy.build_slovak_salutation_preview") {
    return {
      defaultSource: "kuchyne-sk",
      campaignId: "123456",
      leads: [
        { companyName: "Ready Studio", email: "jan@ready.sk", firstName: "Jan", lastName: "Novak" },
        { companyName: "Eva Interier", email: "eva@interier.sk", decisionMakerName: "Eva Horakova" },
      ],
    };
  }
  if (toolName === "arcigy.score_lead_quality") {
    return { minScore: 70, leads: [{ email: "majitel@example.sk", website: "https://example.sk", decisionMaker: "Jan Novak", registerVerified: true, personalizedIntro: "Kratke AI intro." }] };
  }
  if (toolName === "arcigy.dedupe_lead_candidates") return { leads: [{ email: "lead@example.com", companyName: "Modelova Firma" }, { email: "lead@example.com", companyName: "Duplicita" }] };
  if (toolName === "arcigy.build_suppression_list_preview") {
    return {
      leads: [
        { email: "bad@example.com", website: "https://example.com", companyName: "Bad Lead" },
        { email: "good@ready.sk", website: "https://ready.sk", companyName: "Ready Lead" },
      ],
      bouncedEmails: ["bad@example.com"],
      unsubscribedEmails: ["stop@unsubscribe.sk"],
      manualSuppressionDomains: ["competitor.sk"],
      manualSuppressionKeywords: ["franchise"],
      replySignals: [{ email: "reply@blocked.sk", companyName: "Blocked Firma", text: "Nemame zaujem, prosim nepiste." }],
      suppressWholeDomainForUnsubscribes: true,
    };
  }
  if (toolName === "arcigy.build_smartlead_history_suppression_preview") {
    return {
      sourceName: "kuchyne_sk_google_maps_smartlead_enriched_2026-04-27.csv",
      sourceType: "google_maps",
      csvText: "company,website,smartlead_match,smartlead_statuses,smartlead_sent_messages,cold_email_sent,smartlead_replied\nReady Studio,https://ready.sk,,,,no,no\nAlready Sent,https://sent.sk,domain,SENT,1,yes,no\nReplied Studio,https://reply.sk,domain,REPLIED,1,yes,yes",
    };
  }
  if (toolName === "arcigy.build_smartlead_nonreply_call_list_preview") {
    return {
      sourceName: "kuchyne_sk_nonrepliers.csv",
      sourceType: "smartlead",
      campaignId: "123456",
      csvText: "company,email,website,phone,smartlead_status,sent_messages,smartlead_replied,blocked_or_unsubscribed\nReady Studio,jan@ready.sk,https://ready.sk,+421 900 111 222,SENT,2,no,no\nNeeds Phone,info@needs-phone.sk,https://needs-phone.sk,,SENT,2,no,no\nReplied Studio,reply@ready.sk,https://reply.sk,+421 900 222 333,REPLIED,2,yes,no",
      minSentMessages: 1,
    };
  }
  if (toolName === "arcigy.build_niche_leadgen_plan") return { niche: "autoservisy", region: "Bratislava" };
  if (toolName === "arcigy.build_batch_niche_discovery_plan") {
    return {
      niches: [
        { id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis"], regions: ["Bratislava", "Trnava"], dailyTarget: 30, campaignId: "123456" },
        { id: "niche-2", slug: "zubna-klinika", name: "Zubne kliniky", keywords: ["zubna klinika"], regions: ["Nitra"], dailyTarget: 20 },
      ],
      maxNiches: 5,
      maxRegionsPerNiche: 2,
      offer: "AI follow-up system",
      language: "sk",
    };
  }
  if (toolName === "arcigy.build_lead_discovery_matrix_preview") {
    return {
      niches: [
        { id: "niche-1", slug: "fotovoltaika", name: "Fotovoltaika", keywords: ["fotovoltaika", "solarne panely", "montaz fotovoltaiky"], regions: ["Bratislava", "Trnava"], campaignId: "123456", targetCount: 30, priority: 1 },
      ],
      defaultRegions: ["Bratislava", "Trnava", "Nitra"],
      maxRegionsPerNiche: 3,
      maxKeywordsPerNiche: 5,
      targetPerRegion: 25,
      country: "sk",
      language: "sk",
      useMaps: true,
      useSerper: true,
      existingDomains: ["example.sk"],
    };
  }
  if (toolName === "arcigy.build_leadgen_execution_queue_preview") {
    return {
      date: "2026-06-10",
      niches: [
        { id: "niche-1", slug: "autoservisy", name: "Autoservisy", status: "active", priority: 1, keywords: ["autoservis"], regions: ["Bratislava", "Trnava"], currentRegionIndex: 0, dailyTarget: 30, todaySent: 8, campaignId: "123456" },
        { id: "niche-2", slug: "kuchyne", name: "Kuchynske studia", status: "active", priority: 2, keywords: ["kuchynske studio"], regions: ["Kosice"], dailyTarget: 20, todaySent: 0 },
      ],
      maxQueue: 5,
      batchSize: 50,
      offer: "AI asistent na odpovede a follow-up",
      painPoint: "manualne spracovanie dopytov",
      language: "sk",
      includeSmartleadSetup: true,
    };
  }
  if (toolName === "arcigy.build_region_expansion_queue_preview") {
    return {
      regionPreset: "capitals",
      niches: [
        { id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis"], visitedRegions: ["Bratislava"], dailyTarget: 30, campaignId: "123456" },
        { id: "niche-2", slug: "kuchyne", name: "Kuchynske studia", keywords: ["kuchynske studio"], dailyTarget: 20 },
      ],
      maxRegionsPerNiche: 3,
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
    };
  }
  if (toolName === "arcigy.draft_smartlead_campaign_sequence") return { niche: "autoservisy", painPoint: "manualne riesenie dopytov", offer: "AI asistent na odpovede a follow-up", language: "sk" };
  if (toolName === "arcigy.preview_smartlead_email_rendering") {
    return {
      leads: [{ email: "jan.novak@example.com", company_name: "Modelova Firma", website: "example.com", custom_fields: { personalized_intro: "Kratke AI intro." } }],
      sequences: [{
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        seq_variants: [{ variant_label: "A", subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }],
      }],
      signature: "Branislav z Arcigy",
      maxLeads: 5,
    };
  }
  if (toolName === "arcigy.build_smartlead_sequence_variable_repair_preview") {
    return {
      campaignId: "123456",
      sequences: [{
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        seq_variants: [{ variant_label: "A", subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }],
      }],
      leads: [{ email: "jan.novak@example.com", company_name: "Modelova Firma", custom_fields: { company_name_short: "Modelova Firma", personalized_intro: "Kratke AI intro." } }],
    };
  }
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
  if (toolName === "arcigy.build_smartlead_import_audit_preview") {
    return {
      campaignId: "123456",
      leads: [
        { email: "new@example.com", first_name: "Jan", company_name: "Nova Firma", website: "https://new.example", custom_fields: { personalized_intro: "Kratke AI intro." } },
        { email: "existing@example.com", company_name: "Existujuca Firma" },
      ],
      existingSmartleadLeads: [{ email: "existing@example.com", id: "lead-1" }],
    };
  }
  if (toolName === "arcigy.build_smartlead_sender_capacity_preview") {
    return {
      campaignId: "123456",
      leadBacklog: 180,
      requestedDailyLimit: 60,
      minTimeBetweenEmailsMinutes: 12,
      accounts: [
        { id: "acct-1", email: "andrej@arcigy.group", status: "active", warmupStatus: "active", dailyLimit: 40, sentToday: 12, bounceRate: 1.2, reputationScore: 92 },
        { id: "acct-2", email: "sales@arcigy.group", status: "active", warmupStatus: "warming", dailyLimit: 30, sentToday: 4, bounceRate: 2.1, reputationScore: 84 },
      ],
    };
  }
  if (toolName === "arcigy.build_smartlead_deliverability_guard_preview") {
    return {
      campaignId: "123456",
      campaignName: "Autoservisy BA",
      stats: { sent: 240, opened: 112, replied: 14, positiveReplies: 5, bounced: 6, unsubscribed: 2 },
      senderAccounts: [
        { id: "acct-1", email: "andrej@arcigy.group", status: "active", warmupStatus: "active", dailyLimit: 40, sentToday: 12, bounceRate: 1.2, reputationScore: 92 },
      ],
      leadBacklog: 120,
      requestedDailyLimit: 40,
    };
  }
  if (toolName === "arcigy.build_smartlead_campaign_backup_plan") {
    return {
      createdAt: "2026-06-10T12:00:00.000Z",
      backupRoot: "outputs/smartlead-backups",
      includeDeletePlan: true,
      campaigns: [
        { id: 3209165, name: "KUCHYNE-NA-MIRU-CZ_SK_FIXED", status: "ACTIVE", total_leads: 420, sequenceCount: 3 },
        { id: 123456, name: "Autoservisy BA test", status: "DRAFT", total_leads: 80, sequenceCount: 2 },
      ],
      protectedCampaignIds: [3209165],
      protectedNameParts: ["KUCHYNE"],
    };
  }
  if (toolName === "arcigy.build_smartlead_campaign_restore_plan") {
    return {
      restoreMode: "create-new",
      targetNameSuffix: " RESTORE",
      batchSize: 100,
      maxLeadsPerCampaign: 200,
      backups: [{
        sourceBackupDir: "outputs/smartlead-backups/smartlead_backup_20260528T174641Z/3209165_KUCHYNE-NA-MIRU-CZ_SK_FIXED",
        campaign: { id: 3209165, name: "KUCHYNE-NA-MIRU-CZ_SK_FIXED", scheduler_cron_value: { tz: "Europe/Bratislava", days: [1, 2, 3, 4, 5], startHour: "08:00", endHour: "18:00" }, max_leads_per_day: 30, min_time_btwn_emails: 15, stop_lead_settings: "REPLY_TO_AN_EMAIL", follow_up_percentage: 100 },
        sequences: [{ seq_number: 1, seq_delay_details: { delayInDays: 0 }, subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }],
        leads: [{ lead: { email: "lead@example.com", first_name: "Jan", company_name: "Modelova Firma", website: "https://example.com", custom_fields: { personalized_intro: "Kratke AI intro." } } }],
        email_accounts: [{ id: 14382544, from_email: "branislav@arcigy.group" }],
      }],
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
  if (toolName === "arcigy.build_smartlead_campaign_launch_preview") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      offer: "AI asistent na odpovede a follow-up",
      painPoint: "manualne spracovanie dopytov",
      language: "sk",
      emailAccountIds: ["email-account-1"],
      leads: [
        { email: "jan.novak@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Vsimol som si, ze riesite servis pre firemnych klientov.", phone: "+421 900 111 222" },
      ],
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.build_smartlead_campaign_qa_preview") {
    return {
      campaignId: "123456",
      leads: [{ email: "jan.novak@example.com", company_name: "Modelova Firma", custom_fields: { personalized_intro: "Kratke AI intro." } }],
      sequences: [{
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        seq_variants: [{ variant_label: "A", subject: "Otazka k {{company_name}}", email_body: "<p>{{personalized_intro}}</p><p>%signature%</p>" }],
      }],
      schedule: { timezone: "Europe/Bratislava", start_hour: "08:00", end_hour: "18:00", days_of_the_week: [1, 2, 3, 4, 5], max_new_leads_per_day: 30, min_time_btw_emails: 15 },
      settings: { stopOnReply: true, trackOpen: false },
      nextToolCalls: [{ tool: "arcigy.add_leads_to_smartlead_campaign", approvalRequired: true, payload: { campaignId: "123456" } }],
    };
  }
  if (toolName === "arcigy.build_smartlead_campaign_handoff_package_preview") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      offer: "AI asistent na odpovede a follow-up",
      painPoint: "manualne spracovanie dopytov",
      language: "sk",
      leads: [{ email: "jan.novak@example.com", companyName: "Modelova Firma", website: "https://example.com", firstName: "Jan", personalizedIntro: "Vsimol som si, ze riesite servis pre firemnych klientov.", phone: "+421 900 111 222" }],
      senderAccounts: [{ id: "acct-1", email: "andrej@arcigy.group", status: "active", warmupStatus: "active", dailyLimit: 40, sentToday: 8, reputationScore: 92 }],
      requestedDailyLimit: 30,
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.preview_lead_enrichment_batch") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      leads: [
        {
          companyName: "Modelova Firma",
          website: "https://example.com",
          scraped: { emails: ["jan.novak@example.com"], phones: ["+421 900 111 222"] },
          register: { found: true, companyName: "Modelova Firma s.r.o.", ico: "12345678", executives: ["Jan Novak"] },
          personalizedIntro: "Vsimol som si, ze riesite servis pre firemnych klientov.",
        },
      ],
      minScore: 70,
    };
  }
  if (toolName === "arcigy.build_lead_enrichment_merge_preview") {
    return {
      niche: { id: "niche-1", slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456" },
      leads: [{ companyName: "Ready Studio", website: "https://ready.sk" }],
      scrapedResults: [{ url: "https://ready.sk", finalUrl: "https://ready.sk/", emails: ["jan@ready.sk"], phones: ["+421 900 111 222"], textPreview: "Realizacie kuchyn a showroom." }],
      introDrafts: [{ companyName: "Ready Studio", website: "https://ready.sk", personalizedIntro: "Vsimol som si vase realizacie kuchyn." }],
      minScore: 70,
    };
  }
  if (toolName === "arcigy.build_leadgen_gap_report") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      campaignTag: "autoservisy-ba",
      offer: "AI asistent na odpovede a follow-up",
      leads: [
        { companyName: "Ready Firma", website: "https://ready.sk", email: "jan@ready.sk", personalizedIntro: "Kratke AI intro." },
        { companyName: "Chyba Email", website: "https://missing-email.sk" },
      ],
      minScore: 70,
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.build_leadgen_campaign_pipeline_preview") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      campaignTag: "autoservisy-ba",
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
      leads: [
        { companyName: "Modelova Firma", website: "https://example.com", scraped: { emails: ["jan.novak@example.com"], phones: ["+421 900 111 222"] } },
        { companyName: "Druha Firma", website: "https://example.org" },
      ],
      minScore: 70,
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.build_lead_source_import_queue_preview") {
    return {
      sourceName: "kuchyne_sk_google_maps_2026-04-27.csv",
      sourceType: "google_maps",
      niches: [{ slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456", aliases: ["kuchyne", "kuchynske studio"] }],
      leads: [
        { companyName: "Ready Studio", website: "https://ready.sk", email: "jan@ready.sk", personalizedIntro: "Vsimol som si vase realizacie kuchyn.", nicheSlug: "kuchyne" },
        { companyName: "Needs Scrape", website: "https://needs-scrape.sk", nicheSlug: "kuchyne", placeId: "place-1", rating: 4.8, reviewCount: 42 },
      ],
      existingSmartleadLeadsByCampaign: { "123456": [{ email: "old@ready.sk" }] },
      offer: "AI automatizacie pre dopyty a follow-up.",
      language: "sk",
    };
  }
  if (toolName === "arcigy.build_leadgen_autopilot_batch_preview") {
    return {
      sourceName: "kuchyne_sk_google_maps_2026-04-27.csv",
      sourceType: "google_maps",
      defaultNiche: { slug: "kuchyne", name: "Kuchynske studia", campaignId: "123456" },
      leads: [
        { companyName: "Ready Studio", website: "https://ready.sk", email: "jan@ready.sk", personalizedIntro: "Vsimol som si vase realizacie kuchyn.", nicheSlug: "kuchyne" },
        { companyName: "Needs Scrape", website: "https://needs-scrape.sk", nicheSlug: "kuchyne" },
      ],
      existingSmartleadLeadsByCampaign: { "123456": [{ email: "old@ready.sk" }] },
      offer: "AI automatizacie pre dopyty a follow-up.",
      language: "sk",
      auditIntros: true,
    };
  }
  if (toolName === "arcigy.build_lead_repair_queue_preview") {
    return {
      leads: [
        { companyName: "Needs Email", website: "https://needs-email.sk", personalizedIntro: "Dobry den, vsimol som si vas web.", firstName: "Jan" },
        { companyName: "Needs Intro", website: "https://needs-intro.sk", email: "info@needs-intro.sk", phone: "+421 900 111 222" },
        { companyName: "Failed Lead", website: "https://failed.sk", email: "lead@failed.sk", verificationStatus: "failed" },
      ],
      offer: "AI automatizacie pre dopyty a follow-up.",
      language: "sk",
      minScore: 70,
    };
  }
  if (toolName === "arcigy.build_orphan_lead_assignment_preview") {
    return {
      sourceName: "orphan-leads-db-export",
      csvText: "company,website,email,matched_queries\nAuto Alfa,https://autoalfa.sk,jan@autoalfa.sk,autoservis Bratislava\nKitchen Beta,https://kitchenbeta.sk,,kuchynske studio Trnava\nUnknown Lead,https://unknown.sk,,",
      niches: [
        { id: "niche-1", slug: "autoservisy", name: "Autoservisy", aliases: ["autoservis"], keywords: ["autoservis", "pneuservis"], campaignId: "123456" },
        { id: "niche-2", slug: "kuchyne", name: "Kuchynske studia", aliases: ["kuchynske studio"], keywords: ["kuchyne", "kuchynske studio"] },
      ],
      offer: "AI automatizacie pre dopyty a follow-up.",
      language: "sk",
    };
  }
  if (toolName === "arcigy.build_niche_ops_dashboard_preview") {
    return {
      niches: [
        {
          id: "niche-1",
          slug: "kuchyne",
          name: "Kuchynske studia",
          status: "active",
          regions: ["Bratislava", "Trnava"],
          currentRegionIndex: 0,
          dailyTarget: 30,
          todaySent: 12,
          smartleadCampaignId: "123456",
          stuckLeads: [{ companyName: "Needs Email", website: "https://needs-email.sk", personalizedIntro: "Kratke intro." }],
          readyLeads: [{ companyName: "Ready Studio", website: "https://ready.sk", email: "jan@ready.sk", firstName: "Jan", personalizedIntro: "Vsimol som si vase realizacie." }],
        },
      ],
      offer: "AI automatizacie pre dopyty a follow-up.",
      language: "sk",
      defaultDailyTarget: 30,
    };
  }
  if (toolName === "arcigy.build_cold_outreach_csv_import_preview") {
    return {
      csvText: "company_name,email,website,personalized_intro\nModelova Firma,jan.novak@example.com,https://example.com,Vsimol som si vas servis.\nBlocked Firma,lead@competitor.sk,https://competitor.sk,",
      delimiter: ",",
      blacklistDomains: ["competitor.sk"],
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      campaignTag: "autoservisy-ba",
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
      minScore: 70,
      batchSize: 50,
    };
  }
  if (toolName === "arcigy.build_daily_leadgen_runbook") {
    return {
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", keywords: ["autoservis", "pneuservis"], region: "Bratislava", campaignId: "123456" },
      dailyLimit: 30,
      targetCount: 60,
      includeSmartleadSetup: false,
    };
  }
  if (toolName === "arcigy.build_lead_csv_mapping_preview") {
    return {
      sourceName: "kuchyne_sk_google_maps_2026-04-27.csv",
      sourceType: "google_maps",
      csvText: "company,district_city,phone,website,google_domain,matched_queries,priority_score,smartlead_statuses\nReady Studio,Bratislava,+421 900 111 222,https://ready.sk,ready.sk,kuchyne na mieru,92,",
      sampleSize: 3,
    };
  }
  if (toolName === "arcigy.parse_leads_csv") return { csvText: "company_name,email,website\nModelova Firma,lead@example.com,https://example.com" };
  if (toolName === "arcigy.filter_blacklisted_leads") return { leads: [{ email: "lead@example.com", website: "https://example.com" }], domains: ["competitor.sk"], keywords: ["franchise"] };
  if (toolName === "arcigy.build_manual_review_queue") return { minScore: 70, leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }] };
  if (toolName === "arcigy.export_leads_csv") return { outputPath: "generated/leads/manual-review.csv", leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com" }], approval: { approved: true } };
  if (toolName === "arcigy.draft_lead_intro") return { companyName: "Modelova Firma", website: "https://example.com", context: "Firma riesi B2B obchod.", language: "sk" };
  if (toolName === "arcigy.batch_draft_lead_intros") {
    return {
      leads: [
        { companyName: "Modelova Firma", website: "https://example.com", context: "Firma riesi B2B obchod." },
        { companyName: "Druha Firma", website: "https://example.org", context: "Ma kontakt formular a servisne dopyty." },
      ],
      offer: "AI asistent na dopyty a follow-up",
      language: "sk",
      maxLeads: 10,
    };
  }
  if (toolName === "arcigy.build_ai_intro_quality_audit_preview") {
    return {
      leads: [
        { companyName: "Ready Studio", website: "https://ready.sk", email: "jan@ready.sk", personalizedIntro: "Vsimol som si vase realizacie kuchyn.", scraped: { textPreview: "Realizacie kuchyn, showroom a navrhy interierov." } },
        { companyName: "Generic Firma", website: "https://generic.sk", email: "info@generic.sk", personalizedIntro: "Kratke AI intro." },
      ],
      offer: "AI asistent na dopyty a follow-up",
      language: "sk",
      minEvidenceTerms: 1,
    };
  }
  if (toolName === "arcigy.build_ai_intro_cleanup_preview") {
    return {
      campaignId: "123456",
      defaultSource: "kuchyne-sk",
      leads: [
        { companyName: "Ready Studio", website: "https://ready.sk", email: "jan@ready.sk", decisionMakerName: "Jan Novak", personalizedIntro: "Dobry den pan Novak, zaujalo ma, ze robite kuchyne na mieru." },
        { companyName: "Needs Redraft", website: "https://redraft.sk", email: "info@redraft.sk", personalizedIntro: "Kratke AI intro." },
      ],
    };
  }
  if (toolName === "arcigy.enrich_website_leads_preview") {
    return {
      leads: [
        { companyName: "Modelova Firma", website: "https://example.com" },
        { companyName: "Druha Firma", website: "https://example.org", email: "lead@example.org" },
      ],
      niche: { id: "niche-1", slug: "autoservisy", name: "Autoservisy", campaignId: "123456" },
      offer: "AI asistent na odpovede a follow-up",
      language: "sk",
      scrapeWebsites: true,
      draftIntros: true,
      maxLeads: 10,
      minScore: 70,
    };
  }
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
