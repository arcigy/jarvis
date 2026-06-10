import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createJarvisMcpServer } from "../src/automation-system/mcp-server.ts";
import { listJarvisMcpTools } from "../src/automation-system/mcp-tools.ts";

test("Jarvis MCP server lists and calls automation tools", async () => {
  const source = readFileSync("src/automation-system/mcp-server.ts", "utf-8");
  assert.match(source, /function safeErrorMessage/);
  assert.match(source, /redactSensitiveText\(error instanceof Error \? error\.message : String\(error\)\)/);
  assert.match(source, /console\.error\(safeErrorMessage\(error\)\)/);
  assert.match(source, /function cleanPythonErrorMessage/);
  assert.match(source, /return redactSensitiveText\(valueError\.replace/);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  assert.ok(names.includes("arcigy.draft_contract_intake"));
  assert.ok(names.includes("arcigy.draft_price_offer_intake"));
  assert.ok(names.includes("arcigy.generate_price_offer_document"));
  assert.ok(names.includes("arcigy.get_cold_outreach_brief"));
  assert.ok(names.includes("arcigy.get_cold_outreach_brief_from_db"));
  assert.ok(names.includes("arcigy.add_cold_outreach_event"));
  assert.ok(names.includes("arcigy.get_prepared_outreach_replies"));
  assert.ok(names.includes("arcigy.get_approval_queue"));
  assert.ok(names.includes("arcigy.prepare_positive_outreach_reply"));
  assert.ok(names.includes("arcigy.approve_prepared_outreach_reply"));
  assert.ok(names.includes("arcigy.send_approved_outreach_reply"));
  assert.ok(names.includes("arcigy.identify_email"));
  assert.ok(names.includes("arcigy.ingest_client_message"));
  assert.ok(names.includes("arcigy.get_client_need_alerts"));
  assert.ok(names.includes("arcigy.get_audit_events"));
  assert.ok(names.includes("arcigy.get_local_memory_snapshot"));
  assert.ok(names.includes("arcigy.export_local_memory_snapshot"));
  assert.ok(names.includes("arcigy.jarvis_voice_event"));
  assert.ok(names.includes("arcigy.get_system_health"));
  assert.ok(names.includes("arcigy.run_integration_diagnostics"));
  assert.ok(names.includes("arcigy.get_production_readiness"));
  assert.ok(names.includes("arcigy.get_production_verification_evidence"));
  assert.ok(names.includes("arcigy.get_production_completion_score"));
  assert.ok(names.includes("arcigy.get_jarvis_capability_audit"));
  assert.ok(names.includes("arcigy.get_remote_mcp_pack"));
  assert.ok(names.includes("arcigy.run_remote_mcp_smoke"));
  assert.ok(names.includes("arcigy.get_operator_briefing"));
  assert.ok(names.includes("arcigy.get_proactive_attention_digest"));
  assert.ok(names.includes("arcigy.get_leadgen_daily_report"));
  assert.ok(names.includes("arcigy.get_leadgen_evening_summary"));
  assert.ok(names.includes("arcigy.build_leadgen_slack_report_preview"));
  assert.ok(names.includes("arcigy.build_leadgen_ops_digest"));
  assert.ok(names.includes("arcigy.select_next_niche"));
  assert.ok(names.includes("arcigy.generate_ai_reply"));
  assert.ok(names.includes("arcigy.sync_gmail_recent_messages"));
  assert.ok(names.includes("arcigy.get_smartlead_campaign_status"));
  assert.ok(names.includes("arcigy.get_smartlead_outreach_brief"));
  assert.ok(names.includes("arcigy.get_smartlead_campaign_leads"));
  assert.ok(names.includes("arcigy.preview_smartlead_lead_sync"));
  assert.ok(names.includes("arcigy.get_smartlead_message_history"));
  assert.ok(names.includes("arcigy.classify_outreach_reply"));
  assert.ok(names.includes("arcigy.build_outreach_reply_triage_preview"));
  assert.ok(names.includes("arcigy.preview_smartlead_ai_reply"));
  assert.ok(names.includes("arcigy.preview_gmail_ai_reply"));
  assert.ok(names.includes("arcigy.draft_smartlead_thread_reply"));
  assert.ok(names.includes("arcigy.send_smartlead_thread_reply"));
  assert.ok(names.includes("arcigy.create_smartlead_campaign"));
  assert.ok(names.includes("arcigy.configure_smartlead_campaign"));
  assert.ok(names.includes("arcigy.fetch_url_preview"));
  assert.ok(names.includes("arcigy.batch_fetch_url_previews"));
  assert.ok(names.includes("arcigy.build_url_intelligence_queue_preview"));
  assert.ok(names.includes("arcigy.search_serper"));
  assert.ok(names.includes("arcigy.search_google_places"));
  assert.ok(names.includes("arcigy.discover_leads"));
  assert.ok(names.includes("arcigy.scrape_website_contacts"));
  assert.ok(names.includes("arcigy.batch_scrape_website_contacts"));
  assert.ok(names.includes("arcigy.enrich_slovak_company_register"));
  assert.ok(names.includes("arcigy.score_lead_quality"));
  assert.ok(names.includes("arcigy.dedupe_lead_candidates"));
  assert.ok(names.includes("arcigy.build_suppression_list_preview"));
  assert.ok(names.includes("arcigy.build_smartlead_history_suppression_preview"));
  assert.ok(names.includes("arcigy.build_niche_leadgen_plan"));
  assert.ok(names.includes("arcigy.build_batch_niche_discovery_plan"));
  assert.ok(names.includes("arcigy.build_leadgen_execution_queue_preview"));
  assert.ok(names.includes("arcigy.build_region_expansion_queue_preview"));
  assert.ok(names.includes("arcigy.draft_smartlead_campaign_sequence"));
  assert.ok(names.includes("arcigy.preview_smartlead_email_rendering"));
  assert.ok(names.includes("arcigy.preview_manual_review_pickup"));
  assert.ok(names.includes("arcigy.build_smartlead_injection_plan"));
  assert.ok(names.includes("arcigy.build_smartlead_import_audit_preview"));
  assert.ok(names.includes("arcigy.build_smartlead_sender_capacity_preview"));
  assert.ok(names.includes("arcigy.build_smartlead_deliverability_guard_preview"));
  assert.ok(names.includes("arcigy.draft_niche_smartlead_campaign_setup"));
  assert.ok(names.includes("arcigy.build_smartlead_campaign_launch_preview"));
  assert.ok(names.includes("arcigy.build_smartlead_campaign_qa_preview"));
  assert.ok(names.includes("arcigy.build_smartlead_campaign_handoff_package_preview"));
  assert.ok(names.includes("arcigy.preview_lead_enrichment_batch"));
  assert.ok(names.includes("arcigy.build_lead_enrichment_merge_preview"));
  assert.ok(names.includes("arcigy.build_leadgen_gap_report"));
  assert.ok(names.includes("arcigy.build_leadgen_campaign_pipeline_preview"));
  assert.ok(names.includes("arcigy.build_lead_source_import_queue_preview"));
  assert.ok(names.includes("arcigy.build_leadgen_autopilot_batch_preview"));
  assert.ok(names.includes("arcigy.build_lead_repair_queue_preview"));
  assert.ok(names.includes("arcigy.build_niche_ops_dashboard_preview"));
  assert.ok(names.includes("arcigy.build_cold_outreach_csv_import_preview"));
  assert.ok(names.includes("arcigy.build_daily_leadgen_runbook"));
  assert.ok(names.includes("arcigy.build_lead_csv_mapping_preview"));
  assert.ok(names.includes("arcigy.parse_leads_csv"));
  assert.ok(names.includes("arcigy.filter_blacklisted_leads"));
  assert.ok(names.includes("arcigy.build_manual_review_queue"));
  assert.ok(names.includes("arcigy.export_leads_csv"));
  assert.ok(names.includes("arcigy.draft_lead_intro"));
  assert.ok(names.includes("arcigy.batch_draft_lead_intros"));
  assert.ok(names.includes("arcigy.build_ai_intro_quality_audit_preview"));
  assert.ok(names.includes("arcigy.enrich_website_leads_preview"));
  assert.ok(names.includes("arcigy.prepare_smartlead_leads"));
  assert.ok(names.includes("arcigy.run_leadgen_research_pipeline"));
  assert.ok(names.includes("arcigy.add_leads_to_smartlead_campaign"));
  assert.ok(names.includes("arcigy.append_leads_to_google_sheet"));
  assert.match(readFileSync("src/automation-system/mcp-server.ts", "utf-8"), /localCold\.metrics\?\.preparedPositiveReplyCount/);
  assert.match(readFileSync("src/automation-system/mcp-server.ts", "utf-8"), /pendingPositiveApprovalCount/);

  const result = await client.callTool({
    name: "arcigy.get_cold_outreach_brief",
    arguments: {
      periodLabel: "dnes",
      contacted: 10,
      opened: 5,
      replied: 2,
      positiveReplies: 1,
      preparedPositiveReplyCount: 1,
      pendingApprovalCount: 1,
    },
  });

  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content[0]?.type === "text" ? content[0].text ?? "" : "";
  assert.match(text, /Za dnes sme napísali 10 ľuďom/);

  const healthResult = await client.callTool({
    name: "arcigy.get_system_health",
    arguments: { format: "json" },
  });
  const health = getStructuredResult(healthResult) as { integrations: Array<{ key: string; configured: boolean }> };
  assert.ok(health.integrations.some((item) => item.key === "gemini"));

  const diagnosticsResult = await client.callTool({
    name: "arcigy.run_integration_diagnostics",
    arguments: { live: false },
  });
  const diagnostics = getStructuredResult(diagnosticsResult) as { live: boolean; checks: Array<{ key: string }> };
  assert.equal(diagnostics.live, false);
  assert.ok(diagnostics.checks.some((item) => item.key === "sqlite"));
  assertToolError(
    await client.callTool({
      name: "arcigy.run_integration_diagnostics",
      arguments: { live: false, dbPath: join(tmpdir(), "outside-jarvis-diagnostics.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  const readinessResult = await client.callTool({
    name: "arcigy.get_production_readiness",
    arguments: { live: false },
  });
  const readiness = getStructuredResult(readinessResult) as {
    status: string;
    mcp: { toolCount: number };
    nextActions: string[];
    fixGuide: unknown[];
    attentionQueue: unknown[];
    launchChecklist: Array<{ id: string; status: string }>;
    launchEvidence: { mode: string; proofGates: Array<{ id: string; validationCommand: string }>; remoteHandoff: { tunnelCommand: string; requiredBeforeExternalAgent: string[] } };
  };
  assert.ok(["ready", "attention", "blocked"].includes(readiness.status));
  assert.equal(readiness.mcp.toolCount, listJarvisMcpTools().length);
  assert.ok(Array.isArray(readiness.nextActions));
  assert.ok(Array.isArray(readiness.fixGuide));
  assert.ok(Array.isArray(readiness.attentionQueue));
  assert.ok(readiness.launchChecklist.some((item) => item.id === "mcp-registry" && item.status === "ready"));
  assert.equal(readiness.launchEvidence.mode, "production-launch-evidence");
  assert.ok(readiness.launchEvidence.proofGates.some((gate) => gate.id === "approval-locks" && gate.validationCommand === "npm test"));
  assert.equal(readiness.launchEvidence.remoteHandoff.tunnelCommand, "npm run web:tunnel:secure");
  assert.ok(readiness.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step) => step.includes("/.well-known/ai-plugin.json") && step.includes("/api/openapi.json")));
  assert.ok(
    readiness.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some(
      (step) =>
        step.includes("all 37 required remote MCP smoke gates") &&
        step.includes("pack-client-memory-quick-start") &&
        step.includes("pack-production-evidence-quick-start") &&
        step.includes("secret-redaction")
    )
  );
  assert.ok(
    readiness.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some(
      (step) =>
        step.includes("production-evidence-tool-call") &&
        step.includes("release proof") &&
        step.includes("dirty=false") &&
        step.includes("freshness.fresh=true")
    )
  );
  assertToolError(
    await client.callTool({
      name: "arcigy.get_production_readiness",
      arguments: { live: false, dbPath: join(tmpdir(), "outside-jarvis-readiness.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  const evidenceResult = await client.callTool({
    name: "arcigy.get_production_verification_evidence",
    arguments: {},
  });
  const evidence = getStructuredResult(evidenceResult) as { mode: string; status: string; summary: string; checks: unknown[] };
  assert.equal(evidence.mode, "arcigy-jarvis-production-verification");
  assert.ok(["ready", "attention", "missing"].includes(evidence.status));
  assert.ok(Array.isArray(evidence.checks));
  assert.doesNotMatch(JSON.stringify(evidence), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

  const completionResult = await client.callTool({
    name: "arcigy.get_production_completion_score",
    arguments: { live: false },
  });
  const completion = getStructuredResult(completionResult) as { mode: string; status: string; percent: number; components: unknown[] };
  assert.equal(completion.mode, "arcigy-jarvis-production-completion-score");
  assert.ok(["ready", "attention", "blocked"].includes(completion.status));
  assert.equal(typeof completion.percent, "number");
  assert.equal(completion.percent >= 0 && completion.percent <= 100, true);
  assert.equal(Array.isArray(completion.components), true);
  assert.doesNotMatch(JSON.stringify(completion), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

  const auditResult = await client.callTool({
    name: "arcigy.get_jarvis_capability_audit",
    arguments: { live: false },
  });
  const audit = getStructuredResult(auditResult) as {
    mode: string;
    toolCount: number;
    capabilities: Array<{ id: string; tools: string[]; approvalRequired: string[] }>;
  };
  assert.equal(audit.mode, "arcigy-jarvis-capability-audit");
  assert.equal(audit.toolCount, listJarvisMcpTools().length);
  assert.ok(audit.capabilities.some((item) => item.id === "remote-mcp" && item.tools.includes("arcigy.get_jarvis_capability_audit")));
  assert.ok(audit.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.append_leads_to_google_sheet")));
  assert.doesNotMatch(JSON.stringify(audit), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

  const voiceAuditResult = await client.callTool({
    name: "arcigy.jarvis_voice_event",
    arguments: { text: "Jarvis capability audit co vsetko je pokryte", session: { state: "idle", wakeWord: "jarvis" }, live: false },
  });
  const voiceAudit = getStructuredResult(voiceAuditResult) as { session: { state: string; lastResponse?: string }; speakText?: string };
  assert.equal(voiceAudit.session.state, "idle");
  assert.match(voiceAudit.speakText ?? "", /Jarvis capability audit je/i);
  assert.match(voiceAudit.speakText ?? "", /Coverage: \d+\/\d+ skupin ready/);
  assert.match(voiceAudit.speakText ?? "", /MCP: \d+ toolov/);
  assert.equal(voiceAudit.session.lastResponse, voiceAudit.speakText);
  assert.doesNotMatch(JSON.stringify(voiceAudit), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

  const voiceCompletionResult = await client.callTool({
    name: "arcigy.jarvis_voice_event",
    arguments: { text: "Jarvis na kolko percent sme ready", session: { state: "idle", wakeWord: "jarvis" }, live: false },
  });
  const voiceCompletion = getStructuredResult(voiceCompletionResult) as { session: { state: string; lastResponse?: string }; speakText?: string };
  assert.equal(voiceCompletion.session.state, "idle");
  assert.match(voiceCompletion.speakText ?? "", /Sme na \d+% production completion/);
  assert.equal(voiceCompletion.session.lastResponse, voiceCompletion.speakText);
  assert.doesNotMatch(JSON.stringify(voiceCompletion), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);
  assertToolError(
    await client.callTool({
      name: "arcigy.jarvis_voice_event",
      arguments: { text: "Jarvis capability audit", session: { state: "idle", wakeWord: "jarvis" }, dbPath: join(tmpdir(), "outside-jarvis-voice.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  const packResult = await client.callTool({
    name: "arcigy.get_remote_mcp_pack",
    arguments: { baseUrl: "https://jarvis.example.ngrok-free.app", includeReadiness: false },
  });
  const pack = getStructuredResult(packResult) as {
    manifestUrl: string;
    actionManifestUrl: string;
    openApiSchemaUrl: string;
    smokeTestUrl: string;
    productionVerificationEvidenceUrl: string;
    auth: { header: string; tokenValueReturned: boolean };
    limits: { maxJsonBytes: number; pathPolicy: string; writesRequireExplicitToolCall: boolean; authFailureThrottle: { enabled: boolean; limit: number; windowMs: number; scope: string } };
    tools: { count: number; approvalRequired: string[]; readOnlyOrDraft: string[]; localStateWrite: string[] };
    quickStartCalls: Array<{
      tool: string;
      method: string;
      url: string;
      approvalRequired: boolean;
      body: Record<string, unknown>;
      exactMcpCall: { tool: string; method: string; url: string; approvalRequired: boolean; body: Record<string, unknown> };
    }>;
    handoff: { connectionPackUrl: string; requiredProof: Array<{ key: string; url: string; expected: string }>; agentFirstSteps: string[] };
    agentCompatibility: { supportedAgents: string[]; safetyRules: string[]; requiredBeforeWork: string[] };
    agentPromptTemplates: { claude: string; chatgpt: string; grok: string; generic: string };
    agentSetupProfiles: Array<{
      agent: string;
      setupMode: string;
      importUrl: string;
      fallbackUrl: string;
      firstTool: string;
      firstToolUrl: string;
      writePolicy: string;
      localWritePolicy: string;
      requiredProofGates: string[];
    }>;
    tunnel: { secureCommand: string; statusUrl: string; startUrl: string; stopUrl: string; browserStartRequiresStrongToken: boolean };
  };
  assert.equal(pack.manifestUrl, "https://jarvis.example.ngrok-free.app/.well-known/arcigy-jarvis.json");
  assert.equal(pack.actionManifestUrl, "https://jarvis.example.ngrok-free.app/.well-known/ai-plugin.json");
  assert.equal(pack.openApiSchemaUrl, "https://jarvis.example.ngrok-free.app/api/openapi.json");
  assert.equal(pack.smokeTestUrl, "https://jarvis.example.ngrok-free.app/api/remote-mcp-smoke");
  assert.equal(pack.productionVerificationEvidenceUrl, "https://jarvis.example.ngrok-free.app/api/production-verification-evidence");
  assert.equal(pack.auth.header, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
  assert.equal(pack.auth.tokenValueReturned, false);
  assert.equal(pack.limits.pathPolicy, "repo-only");
  assert.equal(pack.limits.maxJsonBytes > 0, true);
  assert.equal(pack.limits.writesRequireExplicitToolCall, true);
  assert.equal(pack.limits.authFailureThrottle.enabled, true);
  assert.equal(pack.limits.authFailureThrottle.scope, "external-host-and-client");
  assert.equal(pack.tools.count, listJarvisMcpTools().length);
  assert.ok(pack.tools.approvalRequired.includes("arcigy.generate_contract_documents"));
  assert.ok(pack.tools.approvalRequired.includes("arcigy.send_approved_outreach_reply"));
  assert.ok(pack.tools.localStateWrite.includes("arcigy.sync_gmail_recent_messages"));
  assert.ok(pack.tools.localStateWrite.includes("arcigy.prepare_positive_outreach_reply"));
  assert.ok(pack.tools.localStateWrite.includes("arcigy.ingest_client_message"));
  assert.equal(pack.tools.readOnlyOrDraft.includes("arcigy.sync_gmail_recent_messages"), false);
  assert.equal(pack.tools.readOnlyOrDraft.includes("arcigy.upsert_local_person"), false);
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.run_remote_mcp_smoke" && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_production_verification_evidence" && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_production_completion_score" && call.body.live === false && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_proactive_attention_digest" && call.body.syncGmail === false && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.every((call) => call.method === "POST" && call.url === `https://jarvis.example.ngrok-free.app/api/mcp/${call.tool}`));
  assert.ok(pack.quickStartCalls.every((call) => call.approvalRequired === pack.tools.approvalRequired.includes(call.tool)));
  assert.ok(pack.quickStartCalls.every((call) => call.exactMcpCall.tool === call.tool && call.exactMcpCall.url === call.url));
  assert.ok(pack.quickStartCalls.every((call) => call.exactMcpCall.method === call.method && call.exactMcpCall.approvalRequired === call.approvalRequired));
  assert.ok(pack.quickStartCalls.every((call) => call.exactMcpCall.body === call.body));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.identify_email" && call.approvalRequired === false && typeof call.body.email === "string"));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_client_need_alerts" && call.approvalRequired === false && call.body.status === "new"));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_audit_events" && call.approvalRequired === false && call.body.limit === 20));
  assert.equal(pack.handoff.connectionPackUrl, "https://jarvis.example.ngrok-free.app/api/remote-mcp-pack?includeReadiness=true&live=true");
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "action-manifest" && item.url.endsWith("/.well-known/ai-plugin.json")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.url.endsWith("/api/remote-mcp-smoke")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "secure-tunnel-status" && item.url.endsWith("/api/secure-tunnel-status")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "openapi-schema" && item.url.endsWith("/api/openapi.json")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "connection-pack" && item.expected.includes("repo-only limits")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-limits")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("cors-preflight")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("external-auth-gate")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-auth-throttle-policy")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("action-manifest")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-production-evidence-quick-start")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("production-evidence-tool-call")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("arcigy.get_production_completion_score quick-start coverage")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("dirty=false") && item.expected.includes("freshness.fresh=true")));
  assert.ok(pack.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("approval-shape-gate")));
  assert.ok(pack.handoff.agentFirstSteps.some((step) => step.includes("arcigy.get_operator_briefing")));
  assert.ok(pack.handoff.agentFirstSteps.some((step) => step.includes("secret-redaction")));
  assert.deepEqual(pack.agentCompatibility.supportedAgents.slice(0, 3), ["Claude", "ChatGPT", "Grok"]);
  assert.ok(pack.agentCompatibility.requiredBeforeWork.some((step) => step.includes("repo-only limits")));
  assert.ok(pack.agentCompatibility.requiredBeforeWork.some((step) => step.includes("arcigy.get_production_completion_score quick-start coverage")));
  assert.ok(pack.agentCompatibility.requiredBeforeWork.some((step) => step.includes("pack-limits")));
  assert.ok(pack.agentCompatibility.requiredBeforeWork.some((step) => step.includes("cors-preflight") && step.includes("external-auth-gate") && step.includes("pack-auth-throttle-policy") && step.includes("openapi-schema")));
  assert.ok(pack.agentCompatibility.safetyRules.some((rule) => rule.includes("family-friendly")));
  assert.match(pack.agentPromptTemplates.grok, /Grok or xAI-compatible agents/);
  assert.match(pack.agentPromptTemplates.generic, /POST JSON/);
  assert.ok(pack.agentSetupProfiles.some((profile) => profile.agent === "ChatGPT" && profile.setupMode === "openapi-custom-action" && profile.importUrl === "https://jarvis.example.ngrok-free.app/api/openapi.json"));
  assert.ok(pack.agentSetupProfiles.some((profile) => profile.agent === "Grok" && profile.fallbackUrl === "https://jarvis.example.ngrok-free.app/api/mcp/{toolName}"));
  assert.ok(pack.agentSetupProfiles.every((profile) => profile.firstTool === "arcigy.get_operator_briefing" && profile.writePolicy === "approval.approved-required" && profile.localWritePolicy === "dry-run-first"));
  assert.ok(pack.agentSetupProfiles.every((profile) => profile.requiredProofGates.includes("pack-agent-setup-profiles") && profile.requiredProofGates.includes("pack-agent-launch-bundle") && profile.requiredProofGates.includes("secret-redaction")));
  assert.ok(pack.agentSetupProfiles.every((profile) => profile.requiredProofGates.includes("pack-production-evidence-quick-start") && profile.requiredProofGates.includes("production-evidence-tool-call")));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_outreach_brief" && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_outreach_brief" && !("campaignId" in call.body)));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.sync_gmail_recent_messages" && call.body.dryRun === true));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.send_approved_outreach_reply" && call.approvalRequired === true));
  assert.ok(
    pack.quickStartCalls.some(
      (call) => call.tool === "arcigy.draft_contract_intake" && call.approvalRequired === false && typeof call.body.brief === "string"
    )
  );
  const contractQuickStart = pack.quickStartCalls.find((call) => call.tool === "arcigy.generate_contract_documents");
  assert.equal(contractQuickStart?.approvalRequired, true);
  assert.equal((contractQuickStart?.body.approval as { approved?: boolean } | undefined)?.approved, true);
  const contractIntake = contractQuickStart?.body.intake as { client?: { businessName?: string }; project?: { includedModules?: unknown[] }; pricing?: unknown } | undefined;
  assert.equal(contractIntake?.client?.businessName, "Modelovy Klient s. r. o.");
  assert.ok(Array.isArray(contractIntake?.project?.includedModules));
  assert.ok(contractIntake?.pricing);
  assert.doesNotMatch(JSON.stringify(contractQuickStart?.body), /dopln|todo|tbd|xxx|\?\?\?/i);
  assert.equal(pack.tunnel.secureCommand, "npm run web:tunnel:secure");
  assert.equal(pack.tunnel.statusUrl, "https://jarvis.example.ngrok-free.app/api/secure-tunnel-status");
  assert.equal(pack.tunnel.startUrl, "https://jarvis.example.ngrok-free.app/api/start-secure-tunnel");
  assert.equal(pack.tunnel.stopUrl, "https://jarvis.example.ngrok-free.app/api/stop-secure-tunnel");
  assert.equal(pack.tunnel.browserStartRequiresStrongToken, true);
  assertToolError(
    await client.callTool({
      name: "arcigy.get_remote_mcp_pack",
      arguments: { includeReadiness: true, dbPath: join(tmpdir(), "outside-jarvis-pack.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );
  assertToolError(
    await client.callTool({
      name: "arcigy.sync_gmail_recent_messages",
      arguments: { dryRun: true, dbPath: join(tmpdir(), "outside-jarvis-gmail.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  assertToolError(
    await client.callTool({
      name: "arcigy.append_leads_to_google_sheet",
      arguments: {
        rows: [["Name", "Website"], ["ACME", "https://example.com"]],
      },
    }),
    /requires explicit approval/
  );

  await client.close();
  await server.close();
});

test("Jarvis MCP server persists and identifies local people through SQLite tools", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(makeRepoTempDir("jarvis-mcp-db-"), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  assertToolError(
    await client.callTool({
      name: "arcigy.upsert_local_person",
      arguments: {
        dbPath: join(tmpdir(), "outside-jarvis-mcp-db.sqlite"),
        kind: "client",
        primaryEmail: "outside@example.com",
      },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  const upsert = await client.callTool({
    name: "arcigy.upsert_local_person",
    arguments: {
      dbPath,
      kind: "client",
      primaryEmail: "founder@example.com",
      displayName: "Founder",
      companyName: "Example",
    },
  });
  const person = getStructuredResult(upsert) as { id: string };

  const needResult = await client.callTool({
    name: "arcigy.add_client_need_signal",
    arguments: {
      dbPath,
      personId: person.id,
      summary: "chce pripraviť novú automatizáciu",
      confidence: 0.88,
    },
  });
  const need = getStructuredResult(needResult) as { id: string };

  const identified = await client.callTool({
    name: "arcigy.identify_email",
    arguments: {
      dbPath,
      email: "founder@example.com",
    },
  });
  const match = getStructuredResult(identified) as {
    reason: string;
    openNeedSignals: Array<{ summary: string }>;
  };

  assert.equal(match.reason, "exact_email_match");
  assert.equal(match.openNeedSignals[0].summary, "chce pripraviť novú automatizáciu");

  const alerts = await client.callTool({
    name: "arcigy.get_client_need_alerts",
    arguments: { dbPath, limit: 5 },
  });
  const alertBody = getStructuredResult(alerts) as { count: number; alerts: Array<{ person: { primaryEmail: string } }> };
  assert.equal(alertBody.count, 1);
  assert.equal(alertBody.alerts[0].person.primaryEmail, "founder@example.com");

  const queue = await client.callTool({
    name: "arcigy.get_approval_queue",
    arguments: { dbPath, limit: 5 },
  });
  const queueBody = getStructuredResult(queue) as { count: number; items: Array<{ approvalTool: string }> };
  assert.equal(queueBody.count, 1);
  assert.equal(queueBody.items[0].approvalTool, "arcigy.update_client_need_status");

  const snapshot = await client.callTool({
    name: "arcigy.get_local_memory_snapshot",
    arguments: { dbPath, limit: 5 },
  });
  const snapshotBody = getStructuredResult(snapshot) as { redacted: boolean; counts: { people: number; clientNeedSignals: number } };
  assert.equal(snapshotBody.redacted, true);
  assert.equal(snapshotBody.counts.people, 1);
  assert.equal(snapshotBody.counts.clientNeedSignals, 1);

  assertToolError(
    await client.callTool({
      name: "arcigy.export_local_memory_snapshot",
      arguments: {
        dbPath,
        outputPath: join("generated", "test-runs", "mcp-memory-snapshot-unapproved.json"),
      },
    }),
    /requires explicit approval/
  );
  const exportedSnapshot = await client.callTool({
    name: "arcigy.export_local_memory_snapshot",
    arguments: {
      dbPath,
      outputPath: join("generated", "test-runs", "mcp-memory-snapshot.json"),
      approval: { approved: true },
    },
  });
  const exportedSnapshotBody = getStructuredResult(exportedSnapshot) as { status: string; redacted: boolean; outputPath: string };
  assert.equal(exportedSnapshotBody.status, "exported");
  assert.equal(exportedSnapshotBody.redacted, true);
  assert.equal(existsSync(exportedSnapshotBody.outputPath), true);

  assertToolError(
    await client.callTool({
      name: "arcigy.update_client_need_status",
      arguments: {
        dbPath,
        needSignalId: need.id,
        status: "resolved",
      },
    }),
    /requires explicit approval/
  );

  const updated = await client.callTool({
    name: "arcigy.update_client_need_status",
    arguments: {
      dbPath,
      needSignalId: need.id,
      status: "resolved",
      approval: { approved: true },
    },
  });
  const updatedBody = getStructuredResult(updated) as { needSignal: { status: string } };
  assert.equal(updatedBody.needSignal.status, "resolved");

  await client.close();
  await server.close();
});

test("Jarvis MCP server generates contracts from inline intake payload", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const outputDir = makeRepoTempDir("jarvis-mcp-contracts-");
  const intake = JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8"));

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  assertToolError(
    await client.callTool({
      name: "arcigy.generate_contract_documents",
      arguments: {
        intake,
        outputDir,
      },
    }),
    /requires explicit approval/
  );
  assert.equal(existsSync(join(outputDir, "generation-manifest.json")), false);

  assertToolError(
    await client.callTool({
      name: "arcigy.generate_contract_documents",
      arguments: {
        intake,
        outputDir,
        approved: true,
      },
    }),
    /requires explicit approval/
  );
  assert.equal(existsSync(join(outputDir, "generation-manifest.json")), false);

  assertToolError(
    await client.callTool({
      name: "arcigy.generate_contract_documents",
      arguments: {
        intake,
        outputDir: join(tmpdir(), "outside-jarvis-mcp-contracts"),
        approval: { approved: true },
      },
    }),
    /outputDir must stay inside the Jarvis repository/
  );

  const unfinishedIntake = JSON.parse(JSON.stringify(intake));
  unfinishedIntake.client.businessName = "[doplnit]";
  const unfinishedResult = await client.callTool({
    name: "arcigy.generate_contract_documents",
    arguments: {
      intake: unfinishedIntake,
      outputDir: makeRepoTempDir("jarvis-mcp-unfinished-contracts-"),
      approval: { approved: true },
    },
  });
  assertToolError(unfinishedResult, /Unresolved contract intake placeholder/);
  const unfinishedText = getToolText(unfinishedResult);
  assert.doesNotMatch(unfinishedText, /Traceback|generate_contract_documents\.py/);

  const result = await client.callTool({
    name: "arcigy.generate_contract_documents",
    arguments: {
      intake,
      outputDir,
      approval: { approved: true },
    },
  });

  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content[0]?.type === "text" ? content[0].text ?? "" : "";
  assert.match(text, /generation-manifest\.json/);
  assert.equal(existsSync(join(outputDir, "generation-manifest.json")), true);

  await client.close();
  await server.close();
});

test("Jarvis MCP server ingests client messages and returns a need alert", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(makeRepoTempDir("jarvis-mcp-message-"), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  await client.callTool({
    name: "arcigy.upsert_local_person",
    arguments: {
      dbPath,
      kind: "client",
      primaryEmail: "founder@example.com",
      displayName: "Founder",
      companyName: "Example",
    },
  });

  const result = await client.callTool({
    name: "arcigy.ingest_client_message",
    arguments: {
      dbPath,
      fromEmail: "founder@example.com",
      source: "email",
      subject: "Report",
      text: "Prosím, priprav nový report pre cold outreach.",
      occurredAt: "2026-06-07T10:00:00Z",
    },
  });
  const ingested = getStructuredResult(result) as {
    jarvisAlert: string;
    needSignal: { summary: string };
    identity: { openNeedSignals: Array<{ summary: string }> };
  };

  assert.match(ingested.jarvisAlert, /Founder chce alebo potrebuje/);
  assert.equal(ingested.needSignal.summary, "Prosím, priprav nový report pre cold outreach.");
  assert.equal(ingested.identity.openNeedSignals[0].summary, "Prosím, priprav nový report pre cold outreach.");

  await client.close();
  await server.close();
});

test("Jarvis MCP server prepares positive outreach replies with Gemini", async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch.bind(globalThis);
  process.env.GEMINI_API_KEY = "gemini";
  globalThis.fetch = async (input: string | URL | Request) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Dakujem za pozitivnu reakciu, navrhujem kratky call." }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input);
  };

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(makeRepoTempDir("jarvis-mcp-positive-"), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const prepared = await client.callTool({
      name: "arcigy.prepare_positive_outreach_reply",
      arguments: {
        dbPath,
        leadEmail: "lead@example.com",
        positiveSignal: "Lead chce demo a pyta sa na termin.",
        context: "Cold outreach pre Arcigy automatizacie.",
      },
    });
    const preparedBody = getStructuredResult(prepared) as { status: string; replyText: string; preparedReply: { eventType: string } };
    assert.equal(preparedBody.status, "prepared");
    assert.equal(preparedBody.replyText, "Dakujem za pozitivnu reakciu, navrhujem kratky call.");
    assert.equal(preparedBody.preparedReply.eventType, "prepared_reply");

    const pending = await client.callTool({
      name: "arcigy.get_prepared_outreach_replies",
      arguments: { dbPath, status: "pending", limit: 5 },
    });
    const pendingBody = getStructuredResult(pending) as { count: number; replies: Array<{ replyText: string; positiveSignal: string }> };
    assert.equal(pendingBody.count, 1);
    assert.equal(pendingBody.replies[0].replyText, "Dakujem za pozitivnu reakciu, navrhujem kratky call.");
    assert.equal(pendingBody.replies[0].positiveSignal, "Lead chce demo a pyta sa na termin.");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    await client.close();
    await server.close();
  }
});

test("Jarvis MCP server sends approved outreach replies through Gmail", async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousRefresh = process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP;
  const originalFetch = globalThis.fetch.bind(globalThis);
  process.env.GEMINI_API_KEY = "gemini";
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP = "refresh";
  const gmailBodies: unknown[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Dakujem, posielam termin na kratky call." }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (target.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "access-token" }), { headers: { "content-type": "application/json" } });
    }
    if (target.includes("/messages/send")) {
      gmailBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "gmail-sent-1", threadId: "thread-1" }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(makeRepoTempDir("jarvis-mcp-send-"), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const prepared = await client.callTool({
      name: "arcigy.prepare_positive_outreach_reply",
      arguments: {
        dbPath,
        leadEmail: "lead@example.com",
        positiveSignal: "Lead chce demo.",
        subject: "Re: demo",
      },
    });
    const preparedBody = getStructuredResult(prepared) as { preparedReply: { id: string } };

    assertToolError(
      await client.callTool({
        name: "arcigy.send_approved_outreach_reply",
        arguments: { dbPath, preparedEventId: preparedBody.preparedReply.id, approval: { approved: true } },
      }),
      /must be approved before sending/
    );

    await client.callTool({
      name: "arcigy.approve_prepared_outreach_reply",
      arguments: { dbPath, preparedEventId: preparedBody.preparedReply.id, approval: { approved: true } },
    });

    assertToolError(
      await client.callTool({
        name: "arcigy.send_approved_outreach_reply",
        arguments: { dbPath, preparedEventId: preparedBody.preparedReply.id },
      }),
      /requires explicit approval/
    );

    const sent = await client.callTool({
      name: "arcigy.send_approved_outreach_reply",
      arguments: { dbPath, preparedEventId: preparedBody.preparedReply.id, approval: { approved: true }, subject: "Re: demo" },
    });
    const sentBody = getStructuredResult(sent) as { status: string; gmail: { id: string }; sentEvent: { eventType: string } };
    assert.equal(sentBody.status, "sent");
    assert.equal(sentBody.gmail.id, "gmail-sent-1");
    assert.equal(sentBody.sentEvent.eventType, "approved_reply_sent");
    assert.equal(gmailBodies.length, 1);

    const alreadySent = await client.callTool({
      name: "arcigy.send_approved_outreach_reply",
      arguments: { dbPath, preparedEventId: preparedBody.preparedReply.id, approval: { approved: true }, subject: "Re: demo" },
    });
    const alreadySentBody = getStructuredResult(alreadySent) as { status: string };
    assert.equal(alreadySentBody.status, "already_sent");
    assert.equal(gmailBodies.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousRefresh === undefined) delete process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP;
    else process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP = previousRefresh;
    await client.close();
    await server.close();
  }
});

test("Jarvis MCP server summarizes cold outreach from local SQLite events", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(makeRepoTempDir("jarvis-mcp-cold-"), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  for (const [leadEmail, eventType] of [
    ["one@example.com", "sent"],
    ["two@example.com", "sent"],
    ["one@example.com", "opened"],
    ["one@example.com", "replied"],
    ["one@example.com", "positive_reply"],
    ["one@example.com", "prepared_reply"],
  ]) {
    await client.callTool({
      name: "arcigy.add_cold_outreach_event",
      arguments: {
        dbPath,
        leadEmail,
        eventType,
        occurredAt: "2026-06-07T10:00:00Z",
      },
    });
  }

  const result = await client.callTool({
    name: "arcigy.get_cold_outreach_brief_from_db",
    arguments: {
      dbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "posledných 7 dní",
    },
  });
  const brief = getStructuredResult(result) as { summary: string; metrics: { contacted: number } };

  assert.equal(brief.metrics.contacted, 2);
  assert.match(brief.summary, /Za posledných 7 dní sme napísali 2 ľuďom/);
  assert.match(brief.summary, /Pripravil som ti 1 odpoveď/);

  const preparedEvent = await client.callTool({
    name: "arcigy.add_cold_outreach_event",
    arguments: {
      dbPath,
      leadEmail: "three@example.com",
      eventType: "prepared_reply",
      occurredAt: "2026-06-07T11:00:00Z",
      data: { subject: "Re: Jarvis", replyText: "Dakujem, navrhujem kratky call." },
    },
  });
  const preparedBody = getStructuredResult(preparedEvent) as { id: string };

  const pendingReplies = await client.callTool({
    name: "arcigy.get_prepared_outreach_replies",
    arguments: { dbPath, status: "pending", limit: 5 },
  });
  const pendingBody = getStructuredResult(pendingReplies) as { count: number; replies: Array<{ id: string; replyText: string }> };
  assert.equal(pendingBody.count, 2);
  assert.equal(pendingBody.replies[0].id, preparedBody.id);
  assert.equal(pendingBody.replies[0].replyText, "Dakujem, navrhujem kratky call.");

  assertToolError(
    await client.callTool({
      name: "arcigy.approve_prepared_outreach_reply",
      arguments: { dbPath, preparedEventId: preparedBody.id, approvedBy: "test" },
    }),
    /requires explicit approval/
  );
  assertToolError(
    await client.callTool({
      name: "arcigy.approve_prepared_outreach_reply",
      arguments: { dbPath, preparedEventId: preparedBody.id, approved: true, approvedBy: "test" },
    }),
    /requires explicit approval/
  );

  const approvedReply = await client.callTool({
    name: "arcigy.approve_prepared_outreach_reply",
    arguments: { dbPath, preparedEventId: preparedBody.id, approval: { approved: true }, approvedBy: "test" },
  });
  const approvedBody = getStructuredResult(approvedReply) as { status: string; approvedEvent: { eventType: string } };
  assert.equal(approvedBody.status, "approved");
  assert.equal(approvedBody.approvedEvent.eventType, "approved_reply");

  await client.callTool({
    name: "arcigy.ingest_client_message",
    arguments: {
      dbPath,
      fromEmail: "client@example.com",
      displayName: "Client Contact",
      source: "email",
      subject: "Onboarding",
      text: "Please update onboarding automation by Friday.",
      occurredAt: "2026-06-07T12:00:00Z",
    },
  });

  const operatorBriefing = await client.callTool({
    name: "arcigy.get_operator_briefing",
    arguments: {
      dbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    },
  });
  const operatorBody = getStructuredResult(operatorBriefing) as { speechText: string; sections: { productionEvidence?: string; coldOutreach: string; clientNeeds: string } };
  assert.match(operatorBody.speechText, /Jarvis briefing/);
  assert.match(operatorBody.speechText, /Production evidence:/);
  assert.match(operatorBody.sections.productionEvidence ?? "", /Production verification/);
  assert.match(operatorBody.sections.coldOutreach, /Cold outreach/);
  assert.match(operatorBody.sections.clientNeeds, /Client Contact/);
  assert.match(operatorBody.sections.clientNeeds, /update onboarding automation/);

  const attentionDigest = await client.callTool({
    name: "arcigy.get_proactive_attention_digest",
    arguments: {
      dbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    },
  });
  const digestBody = getStructuredResult(attentionDigest) as { mode: string; urgency: string; speechText: string; notifications: Array<{ id: string; detail: string }> };
  assert.equal(digestBody.mode, "arcigy-jarvis-proactive-attention-digest");
  assert.equal(digestBody.urgency, "attention");
  assert.ok(digestBody.notifications.some((item) => item.id === "client-needs" && item.detail.includes("Client Contact")));
  assert.match(digestBody.speechText, /Jarvis attention digest/);
  assert.doesNotMatch(JSON.stringify(digestBody), /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);
  assertToolError(
    await client.callTool({
      name: "arcigy.get_operator_briefing",
      arguments: { dbPath: join(tmpdir(), "outside-jarvis-operator.sqlite") },
    }),
    /dbPath must stay inside the Jarvis repository/
  );

  await client.close();
  await server.close();
});

function getStructuredResult(value: unknown): unknown {
  const result = value as { structuredContent?: { result?: unknown } };
  assert.ok(result.structuredContent);
  return result.structuredContent.result;
}

function assertToolError(value: unknown, pattern: RegExp) {
  const result = value as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
  assert.equal(result.isError, true);
  assert.match(getToolText(value), pattern);
}

function getToolText(value: unknown): string {
  const result = value as { content?: Array<{ type: string; text?: string }> };
  return result.content?.[0]?.type === "text" ? result.content[0].text ?? "" : "";
}

function makeRepoTempDir(prefix: string) {
  const base = join(process.cwd(), "generated", "test-runs");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}
