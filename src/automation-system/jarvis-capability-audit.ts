import { getIntegrationHealth, type IntegrationKey, type RuntimeEnv } from "./env.ts";
import { listJarvisMcpTools, localStateWriteToolNames, type JarvisMcpToolName } from "./mcp-tools.ts";
import type { ProductionReadinessReport } from "./production-readiness.ts";
import type { ProductionVerificationEvidence } from "./production-verification-evidence.ts";

export type JarvisCapabilityAuditStatus = "ready" | "attention" | "blocked";

export type JarvisCapabilityAuditItem = {
  id: string;
  title: string;
  status: JarvisCapabilityAuditStatus;
  proof: string[];
  tools: JarvisMcpToolName[];
  approvalRequired: JarvisMcpToolName[];
  evidence: string[];
  nextAction: string;
};

export type JarvisCapabilityAudit = {
  mode: "arcigy-jarvis-capability-audit";
  status: JarvisCapabilityAuditStatus;
  generatedAt: string;
  summary: string;
  toolCount: number;
  approvalRequiredCount: number;
  localStateWriteCount: number;
  productionEvidence: {
    status: string;
    fresh: boolean;
    dirty: boolean | null;
    requiredRemoteMcpSmokeGates: number;
    checks: number;
  };
  capabilities: JarvisCapabilityAuditItem[];
  nextActions: string[];
};

type CapabilityDefinition = {
  id: string;
  title: string;
  tools: JarvisMcpToolName[];
  approvalRequired: JarvisMcpToolName[];
  evidence: string[];
  envKeys?: IntegrationKey[];
};

const capabilityDefinitions: CapabilityDefinition[] = [
  {
    id: "contracts",
    title: "Universal Arcigy document automation",
    tools: ["arcigy.draft_contract_intake", "arcigy.generate_contract_documents", "arcigy.draft_price_offer_intake", "arcigy.generate_price_offer_document"],
    approvalRequired: ["arcigy.generate_contract_documents", "arcigy.generate_price_offer_document"],
    evidence: ["contract-template-safety", "tests", "ui-smoke"],
    envKeys: ["gemini"],
  },
  {
    id: "cold-outreach",
    title: "Cold outreach status, replies, and approvals",
    tools: [
      "arcigy.get_smartlead_outreach_brief",
      "arcigy.get_cold_outreach_brief_from_db",
      "arcigy.prepare_positive_outreach_reply",
      "arcigy.get_prepared_outreach_replies",
      "arcigy.get_approval_queue",
      "arcigy.send_approved_outreach_reply",
      "arcigy.draft_smartlead_thread_reply",
      "arcigy.send_smartlead_thread_reply",
    ],
    approvalRequired: ["arcigy.send_approved_outreach_reply", "arcigy.send_smartlead_thread_reply"],
    evidence: ["local-memory-smoke", "tests", "doctor-live", "voice-outreach-style"],
    envKeys: ["smartlead", "gmail", "gemini"],
  },
  {
    id: "client-memory",
    title: "Local client and lead memory by email",
    tools: [
      "arcigy.upsert_local_person",
      "arcigy.identify_email",
      "arcigy.ingest_client_message",
      "arcigy.get_client_need_alerts",
      "arcigy.update_client_need_status",
      "arcigy.get_local_memory_snapshot",
      "arcigy.export_local_memory_snapshot",
    ],
    approvalRequired: ["arcigy.update_client_need_status", "arcigy.export_local_memory_snapshot"],
    evidence: ["local-memory-smoke", "tests", "ui-smoke"],
    envKeys: ["postgres"],
  },
  {
    id: "voice-jarvis",
    title: "Jarvis wake-word desktop voice loop",
    tools: ["arcigy.jarvis_voice_event", "arcigy.get_operator_briefing", "arcigy.get_production_verification_evidence", "arcigy.get_production_completion_score"],
    approvalRequired: [],
    evidence: ["ui-smoke", "ui-smoke-narrow", "voice-tool-call", "pack-voice-quick-start", "voice-outreach-style"],
  },
  {
    id: "proactive-digest",
    title: "Proactive Jarvis attention digest",
    tools: [
      "arcigy.get_proactive_attention_digest",
      "arcigy.get_operator_briefing",
      "arcigy.get_leadgen_daily_report",
      "arcigy.get_leadgen_evening_summary",
      "arcigy.build_leadgen_slack_report_preview",
      "arcigy.build_leadgen_ops_digest",
      "arcigy.sync_gmail_recent_messages",
      "arcigy.get_client_need_alerts",
      "arcigy.get_approval_queue",
      "arcigy.get_production_readiness",
    ],
    approvalRequired: [],
    evidence: ["local-memory-smoke", "doctor-live", "ui-smoke"],
    envKeys: ["gmail"],
  },
  {
    id: "remote-mcp",
    title: "Remote MCP handoff for Claude, ChatGPT, Grok, and HTTP agents",
    tools: [
      "arcigy.get_remote_mcp_pack",
      "arcigy.run_remote_mcp_smoke",
      "arcigy.get_production_readiness",
      "arcigy.get_production_verification_evidence",
      "arcigy.get_production_completion_score",
      "arcigy.get_jarvis_capability_audit",
      "arcigy.get_operator_briefing",
    ],
    approvalRequired: [],
    evidence: [
      "remote-mcp-smoke",
      "remote-mcp-smoke-required-gates",
      "pack-agent-setup-profiles",
      "pack-agent-launch-bundle",
      "pack-handoff-proof",
      "pack-agent-compatibility",
      "pack-production-evidence-quick-start",
      "production-evidence-tool-call",
    ],
    envKeys: ["remoteMcp"],
  },
  {
    id: "gemini-ai",
    title: "Gemini AI drafting for replies and contract intake",
    tools: ["arcigy.generate_ai_reply", "arcigy.draft_contract_intake", "arcigy.prepare_positive_outreach_reply"],
    approvalRequired: [],
    evidence: ["tests", "doctor-live", "ai-draft-safety"],
    envKeys: ["gemini"],
  },
  {
    id: "lead-discovery",
    title: "Lead discovery, scraping, AI intros, and exports",
    tools: [
      "arcigy.search_serper",
      "arcigy.search_google_places",
      "arcigy.discover_leads",
      "arcigy.fetch_url_preview",
      "arcigy.batch_fetch_url_previews",
      "arcigy.build_url_intelligence_queue_preview",
      "arcigy.scrape_website_contacts",
      "arcigy.batch_scrape_website_contacts",
      "arcigy.enrich_slovak_company_register",
      "arcigy.build_slovak_register_batch_preview",
      "arcigy.build_slovak_salutation_preview",
      "arcigy.score_lead_quality",
      "arcigy.dedupe_lead_candidates",
      "arcigy.build_suppression_list_preview",
      "arcigy.build_smartlead_history_suppression_preview",
      "arcigy.build_smartlead_nonreply_call_list_preview",
      "arcigy.build_niche_leadgen_plan",
      "arcigy.build_batch_niche_discovery_plan",
      "arcigy.build_lead_discovery_matrix_preview",
      "arcigy.build_leadgen_execution_queue_preview",
      "arcigy.build_region_expansion_queue_preview",
      "arcigy.select_next_niche",
      "arcigy.draft_smartlead_campaign_sequence",
      "arcigy.preview_smartlead_email_rendering",
      "arcigy.preview_manual_review_pickup",
      "arcigy.build_smartlead_injection_plan",
      "arcigy.build_smartlead_import_audit_preview",
      "arcigy.build_smartlead_sender_capacity_preview",
      "arcigy.build_smartlead_deliverability_guard_preview",
      "arcigy.build_smartlead_campaign_backup_plan",
      "arcigy.build_smartlead_campaign_restore_plan",
      "arcigy.draft_niche_smartlead_campaign_setup",
      "arcigy.build_smartlead_campaign_launch_preview",
      "arcigy.build_smartlead_campaign_qa_preview",
      "arcigy.build_smartlead_campaign_handoff_package_preview",
      "arcigy.preview_lead_enrichment_batch",
      "arcigy.build_lead_enrichment_merge_preview",
      "arcigy.build_leadgen_campaign_pipeline_preview",
      "arcigy.build_lead_source_import_queue_preview",
      "arcigy.build_lead_source_bundle_preview",
      "arcigy.build_lead_source_bundle_campaign_launch_preview",
      "arcigy.build_leadgen_autopilot_batch_preview",
      "arcigy.build_lead_repair_queue_preview",
      "arcigy.build_orphan_lead_assignment_preview",
      "arcigy.build_niche_ops_dashboard_preview",
      "arcigy.build_cold_outreach_csv_import_preview",
      "arcigy.build_daily_leadgen_runbook",
      "arcigy.build_leadgen_gap_report",
      "arcigy.build_lead_csv_mapping_preview",
      "arcigy.parse_leads_csv",
      "arcigy.filter_blacklisted_leads",
      "arcigy.build_manual_review_queue",
      "arcigy.export_leads_csv",
      "arcigy.draft_lead_intro",
      "arcigy.batch_draft_lead_intros",
      "arcigy.build_ai_intro_quality_audit_preview",
      "arcigy.enrich_website_leads_preview",
      "arcigy.prepare_smartlead_leads",
      "arcigy.run_leadgen_research_pipeline",
      "arcigy.get_smartlead_campaign_leads",
      "arcigy.preview_smartlead_lead_sync",
      "arcigy.get_smartlead_message_history",
      "arcigy.classify_outreach_reply",
      "arcigy.build_outreach_reply_triage_preview",
      "arcigy.preview_smartlead_ai_reply",
      "arcigy.preview_gmail_ai_reply",
      "arcigy.draft_smartlead_thread_reply",
      "arcigy.create_smartlead_campaign",
      "arcigy.configure_smartlead_campaign",
      "arcigy.add_leads_to_smartlead_campaign",
      "arcigy.append_leads_to_google_sheet",
    ],
    approvalRequired: ["arcigy.export_leads_csv", "arcigy.create_smartlead_campaign", "arcigy.configure_smartlead_campaign", "arcigy.add_leads_to_smartlead_campaign", "arcigy.append_leads_to_google_sheet"],
    evidence: ["tests", "doctor-live"],
    envKeys: ["serper", "googleMaps", "gemini", "smartlead", "googleSheets"],
  },
  {
    id: "approval-safety",
    title: "Family-friendly approval and secret safety",
    tools: ["arcigy.get_approval_queue", "arcigy.get_audit_events", "arcigy.run_remote_mcp_smoke"],
    approvalRequired: [
      "arcigy.generate_contract_documents",
      "arcigy.generate_price_offer_document",
      "arcigy.approve_prepared_outreach_reply",
      "arcigy.send_approved_outreach_reply",
      "arcigy.update_client_need_status",
      "arcigy.export_local_memory_snapshot",
      "arcigy.export_leads_csv",
      "arcigy.send_smartlead_thread_reply",
      "arcigy.create_smartlead_campaign",
      "arcigy.configure_smartlead_campaign",
      "arcigy.add_leads_to_smartlead_campaign",
      "arcigy.append_leads_to_google_sheet",
    ],
    evidence: ["approval-gate", "approval-shape-gate", "secret-redaction", "secret-scan", "ai-draft-safety"],
  },
];

export function buildJarvisCapabilityAudit(
  input: {
    readiness: ProductionReadinessReport;
    productionEvidence: ProductionVerificationEvidence;
    env?: RuntimeEnv;
    generatedAt?: string;
  }
): JarvisCapabilityAudit {
  const tools = listJarvisMcpTools();
  const toolNames = new Set(tools.map((tool) => tool.name));
  const approvalNames = new Set(tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name));
  const release = asRecord(input.productionEvidence.release);
  const requiredRemoteMcpSmokeGates = Array.isArray(release?.requiredRemoteMcpSmokeGates)
    ? release.requiredRemoteMcpSmokeGates.filter((item): item is string => typeof item === "string")
    : [];
  const evidenceKeys = new Set([
    ...(input.productionEvidence.checks ?? []).map((check) => asRecord(check)?.name).filter((item): item is string => typeof item === "string"),
    ...requiredRemoteMcpSmokeGates,
  ]);
  const health = getIntegrationHealth(input.env);
  const healthByKey = new Map(health.map((item) => [item.key, item.configured]));

  const capabilities = capabilityDefinitions.map((definition): JarvisCapabilityAuditItem => {
    const missingTools = definition.tools.filter((tool) => !toolNames.has(tool));
    const missingApprovals = definition.approvalRequired.filter((tool) => !approvalNames.has(tool));
    const missingEvidence = definition.evidence.filter((item) => !evidenceKeys.has(item));
    const missingEnv = (definition.envKeys ?? []).filter((key) => healthByKey.get(key) !== true);
    const status: JarvisCapabilityAuditStatus =
      missingTools.length || missingApprovals.length
        ? "blocked"
        : missingEvidence.length || missingEnv.length
          ? "attention"
          : "ready";
    return {
      id: definition.id,
      title: definition.title,
      status,
      tools: definition.tools,
      approvalRequired: definition.approvalRequired,
      evidence: definition.evidence,
      proof: [
        `${definition.tools.length - missingTools.length}/${definition.tools.length} required MCP tool(s) registered.`,
        `${definition.approvalRequired.length - missingApprovals.length}/${definition.approvalRequired.length} required approval lock(s) registered.`,
        `${definition.evidence.length - missingEvidence.length}/${definition.evidence.length} production evidence item(s) present.`,
        ...(definition.envKeys?.length ? [`${definition.envKeys.length - missingEnv.length}/${definition.envKeys.length} related integration group(s) configured.`] : []),
      ],
      nextAction:
        status === "ready"
          ? "Covered by production verification; keep exact MCP payloads and approval gates in parity."
          : `Restore ${[...missingTools, ...missingApprovals, ...missingEvidence, ...missingEnv].join(", ")} and rerun npm run verify:production.`,
    };
  });

  const blocked = capabilities.filter((item) => item.status === "blocked");
  const attention = capabilities.filter((item) => item.status === "attention");
  const evidenceReady =
    input.productionEvidence.status === "ready" &&
    input.productionEvidence.freshness.fresh === true &&
    release?.dirty === false &&
    requiredRemoteMcpSmokeGates.length >= 37;
  const readinessReady = input.readiness.status === "ready" || input.readiness.status === "attention";
  const status: JarvisCapabilityAuditStatus = blocked.length ? "blocked" : attention.length || !evidenceReady || !readinessReady ? "attention" : "ready";

  return {
    mode: "arcigy-jarvis-capability-audit",
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary:
      status === "ready"
        ? `Jarvis capability audit ready: ${capabilities.length}/${capabilities.length} capability groups covered by MCP tools, approval locks, integrations, and production evidence.`
        : `Jarvis capability audit needs attention: ${capabilities.length - blocked.length - attention.length}/${capabilities.length} capability groups ready.`,
    toolCount: tools.length,
    approvalRequiredCount: approvalNames.size,
    localStateWriteCount: tools.filter((tool) => localStateWriteToolNames.has(tool.name)).length,
    productionEvidence: {
      status: input.productionEvidence.status,
      fresh: input.productionEvidence.freshness.fresh,
      dirty: typeof release?.dirty === "boolean" ? release.dirty : null,
      requiredRemoteMcpSmokeGates: requiredRemoteMcpSmokeGates.length,
      checks: input.productionEvidence.checks?.length ?? 0,
    },
    capabilities,
    nextActions:
      status === "ready"
        ? ["Run arcigy.get_operator_briefing before work and require explicit approval before write-capable tools."]
        : [...blocked, ...attention].map((item) => item.nextAction),
  };
}

export function summarizeJarvisCapabilityAuditForVoice(audit: {
  status?: unknown;
  summary?: unknown;
  toolCount?: unknown;
  approvalRequiredCount?: unknown;
  localStateWriteCount?: unknown;
  productionEvidence?: { status?: unknown; fresh?: unknown; dirty?: unknown; requiredRemoteMcpSmokeGates?: unknown };
  capabilities?: Array<{ title?: unknown; status?: unknown; nextAction?: unknown }>;
  nextActions?: unknown[];
}): string {
  const capabilities = Array.isArray(audit.capabilities) ? audit.capabilities : [];
  const ready = capabilities.filter((item) => item.status === "ready").length;
  const attention = capabilities.filter((item) => item.status === "attention").length;
  const blocked = capabilities.filter((item) => item.status === "blocked").length;
  const evidence = audit.productionEvidence ?? {};
  const firstIssue = capabilities.find((item) => item.status !== "ready");
  const next = firstIssue?.nextAction ?? (Array.isArray(audit.nextActions) ? audit.nextActions[0] : null) ?? "Drz production proof cerstvy pred remote agent handoffom.";
  return [
    `Jarvis capability audit je ${String(audit.status ?? "unknown")}.`,
    typeof audit.summary === "string" ? audit.summary : null,
    `Coverage: ${ready}/${capabilities.length} skupin ready, ${attention} attention, ${blocked} blocked.`,
    `MCP: ${String(audit.toolCount ?? 0)} toolov, ${String(audit.approvalRequiredCount ?? 0)} schvalovacich zamkov, ${String(audit.localStateWriteCount ?? 0)} lokalnych zapisov.`,
    `Evidence: ${String(evidence.status ?? "unknown")}, fresh=${evidence.fresh === true}, clean=${evidence.dirty === false}, gates=${String(evidence.requiredRemoteMcpSmokeGates ?? 0)}.`,
    `Najblizsi krok: ${String(next)}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
