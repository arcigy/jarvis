import { buildColdOutreachBrief } from "./cold-outreach-summary.ts";
import { answerJarvisIntent } from "./jarvis-intents.ts";
import type { ClientNeedSignal, ColdOutreachMetrics, LocalPerson } from "./types.ts";

export type JarvisMcpToolName =
  | "arcigy.generate_contract_documents"
  | "arcigy.draft_contract_intake"
  | "arcigy.draft_price_offer_intake"
  | "arcigy.build_pricing_proposal_preview"
  | "arcigy.build_service_capacity_preview"
  | "arcigy.generate_price_offer_document"
  | "arcigy.get_cold_outreach_brief"
  | "arcigy.get_cold_outreach_brief_from_db"
  | "arcigy.add_cold_outreach_event"
  | "arcigy.prepare_positive_outreach_reply"
  | "arcigy.get_prepared_outreach_replies"
  | "arcigy.get_approval_queue"
  | "arcigy.approve_prepared_outreach_reply"
  | "arcigy.send_approved_outreach_reply"
  | "arcigy.upsert_local_person"
  | "arcigy.upsert_local_niche"
  | "arcigy.get_local_niche_queue"
  | "arcigy.record_local_niche_run"
  | "arcigy.add_client_need_signal"
  | "arcigy.ingest_client_message"
  | "arcigy.get_client_need_alerts"
  | "arcigy.update_client_need_status"
  | "arcigy.get_audit_events"
  | "arcigy.get_local_memory_snapshot"
  | "arcigy.export_local_memory_snapshot"
  | "arcigy.identify_email"
  | "arcigy.get_system_health"
  | "arcigy.run_integration_diagnostics"
  | "arcigy.get_production_readiness"
  | "arcigy.get_production_verification_evidence"
  | "arcigy.get_production_completion_score"
  | "arcigy.get_jarvis_capability_audit"
  | "arcigy.get_remote_mcp_pack"
  | "arcigy.run_remote_mcp_smoke"
  | "arcigy.get_operator_briefing"
  | "arcigy.get_proactive_attention_digest"
  | "arcigy.get_leadgen_daily_report"
  | "arcigy.get_leadgen_evening_summary"
  | "arcigy.build_leadgen_slack_report_preview"
  | "arcigy.send_slack_message"
  | "arcigy.build_leadgen_ops_digest"
  | "arcigy.select_next_niche"
  | "arcigy.generate_ai_reply"
  | "arcigy.sync_gmail_recent_messages"
  | "arcigy.get_gmail_lead_context"
  | "arcigy.lookup_public_email_profile"
  | "arcigy.get_gmail_unread_triage"
  | "arcigy.label_gmail_thread"
  | "arcigy.get_smartlead_campaign_status"
  | "arcigy.get_smartlead_outreach_brief"
  | "arcigy.get_smartlead_campaign_leads"
  | "arcigy.get_smartlead_email_accounts"
  | "arcigy.preview_smartlead_lead_sync"
  | "arcigy.get_smartlead_campaign_webhooks"
  | "arcigy.upsert_smartlead_campaign_webhook"
  | "arcigy.get_smartlead_message_history"
  | "arcigy.classify_outreach_reply"
  | "arcigy.build_outreach_reply_triage_preview"
  | "arcigy.build_showcase_reply_preview"
  | "arcigy.preview_smartlead_ai_reply"
  | "arcigy.preview_gmail_ai_reply"
  | "arcigy.draft_smartlead_thread_reply"
  | "arcigy.send_smartlead_thread_reply"
  | "arcigy.create_smartlead_campaign"
  | "arcigy.configure_smartlead_campaign"
  | "arcigy.fetch_url_preview"
  | "arcigy.batch_fetch_url_previews"
  | "arcigy.build_url_intelligence_queue_preview"
  | "arcigy.search_serper"
  | "arcigy.search_google_places"
  | "arcigy.discover_leads"
  | "arcigy.scrape_website_contacts"
  | "arcigy.batch_scrape_website_contacts"
  | "arcigy.build_website_scrape_quality_audit_preview"
  | "arcigy.build_outreach_contact_selection_preview"
  | "arcigy.enrich_slovak_company_register"
  | "arcigy.build_local_lead_register_update_preview"
  | "arcigy.apply_local_lead_register_update"
  | "arcigy.build_slovak_register_batch_preview"
  | "arcigy.build_slovak_salutation_preview"
  | "arcigy.build_gmail_name_enrichment_queue_preview"
  | "arcigy.build_lead_identity_repair_preview"
  | "arcigy.score_lead_quality"
  | "arcigy.build_lead_validation_scorecard_preview"
  | "arcigy.dedupe_lead_candidates"
  | "arcigy.build_suppression_list_preview"
  | "arcigy.build_smartlead_history_suppression_preview"
  | "arcigy.build_smartlead_nonreply_call_list_preview"
  | "arcigy.build_niche_leadgen_plan"
  | "arcigy.build_batch_niche_discovery_plan"
  | "arcigy.build_lead_discovery_matrix_preview"
  | "arcigy.build_leadgen_execution_queue_preview"
  | "arcigy.build_daily_leadgen_run_closure_preview"
  | "arcigy.build_leadgen_run_resume_preview"
  | "arcigy.build_region_expansion_queue_preview"
  | "arcigy.draft_smartlead_campaign_sequence"
  | "arcigy.build_smartlead_sequence_work_packet_preview"
  | "arcigy.preview_smartlead_email_rendering"
  | "arcigy.build_smartlead_sequence_variable_repair_preview"
  | "arcigy.build_company_short_name_preview"
  | "arcigy.build_lead_batch_qa_preview"
  | "arcigy.preview_manual_review_pickup"
  | "arcigy.build_smartlead_injection_plan"
  | "arcigy.build_bulk_smartlead_upload_queue_preview"
  | "arcigy.build_smartlead_import_audit_preview"
  | "arcigy.build_smartlead_campaign_sync_plan_preview"
  | "arcigy.build_smartlead_local_reconciliation_preview"
  | "arcigy.build_smartlead_safe_sync_runbook_preview"
  | "arcigy.build_smartlead_sender_capacity_preview"
  | "arcigy.build_smartlead_deliverability_guard_preview"
  | "arcigy.build_smartlead_campaign_backup_plan"
  | "arcigy.build_smartlead_campaign_restore_plan"
  | "arcigy.draft_niche_smartlead_campaign_setup"
  | "arcigy.build_smartlead_campaign_launch_preview"
  | "arcigy.build_smartlead_campaign_qa_preview"
  | "arcigy.build_smartlead_campaign_handoff_package_preview"
  | "arcigy.preview_lead_enrichment_batch"
  | "arcigy.build_lead_enrichment_merge_preview"
  | "arcigy.build_leadgen_gap_report"
  | "arcigy.build_leadgen_status_board_preview"
  | "arcigy.build_leadgen_db_status_preview"
  | "arcigy.build_google_sheet_sync_preview"
  | "arcigy.build_leadgen_campaign_pipeline_preview"
  | "arcigy.build_lead_source_import_queue_preview"
  | "arcigy.build_lead_source_bundle_preview"
  | "arcigy.build_lead_source_bundle_campaign_launch_preview"
  | "arcigy.build_leadgen_autopilot_batch_preview"
  | "arcigy.build_lead_repair_queue_preview"
  | "arcigy.build_phone_enrichment_queue_preview"
  | "arcigy.build_orphan_lead_assignment_preview"
  | "arcigy.build_niche_ops_dashboard_preview"
  | "arcigy.build_cold_outreach_csv_import_preview"
  | "arcigy.build_daily_leadgen_runbook"
  | "arcigy.build_full_leadgen_pipeline_runbook_preview"
  | "arcigy.build_lead_csv_mapping_preview"
  | "arcigy.parse_leads_csv"
  | "arcigy.filter_blacklisted_leads"
  | "arcigy.build_manual_review_queue"
  | "arcigy.export_leads_csv"
  | "arcigy.draft_lead_intro"
  | "arcigy.batch_draft_lead_intros"
  | "arcigy.build_ai_intro_quality_audit_preview"
  | "arcigy.build_flagged_lead_review_preview"
  | "arcigy.build_ai_intro_work_packet_preview"
  | "arcigy.build_ai_intro_import_preview"
  | "arcigy.build_ai_icebreaker_writeback_preview"
  | "arcigy.build_ai_intro_cleanup_preview"
  | "arcigy.enrich_website_leads_preview"
  | "arcigy.prepare_smartlead_leads"
  | "arcigy.run_leadgen_research_pipeline"
  | "arcigy.add_leads_to_smartlead_campaign"
  | "arcigy.append_leads_to_google_sheet"
  | "arcigy.replace_google_sheet_rows"
  | "arcigy.jarvis_voice_event";

export type JarvisMcpTool = {
  name: JarvisMcpToolName;
  description: string;
  inputSchemaRef?: string;
  requiresApproval: boolean;
};

export const localStateWriteToolNames = new Set<JarvisMcpToolName>([
  "arcigy.add_cold_outreach_event",
  "arcigy.prepare_positive_outreach_reply",
  "arcigy.upsert_local_person",
  "arcigy.upsert_local_niche",
  "arcigy.record_local_niche_run",
  "arcigy.add_client_need_signal",
  "arcigy.ingest_client_message",
  "arcigy.update_client_need_status",
  "arcigy.apply_local_lead_register_update",
  "arcigy.export_local_memory_snapshot",
  "arcigy.export_leads_csv",
  "arcigy.sync_gmail_recent_messages",
]);

export type ContractGenerationCommand = {
  command: "python";
  args: string[];
  outputDir: string;
};

export function listJarvisMcpTools(): JarvisMcpTool[] {
  return [
    {
      name: "arcigy.generate_contract_documents",
      description: "Vygeneruje ramcovu zmluvu a projektovu prilohu z vyplneneho Arcigy JSON formulara.",
      inputSchemaRef: "docs/contracts/contract-intake.schema.json",
      requiresApproval: true,
    },
    {
      name: "arcigy.draft_contract_intake",
      description: "Pouzije Gemini na navrh Arcigy contract intake JSON z kratkeho briefu bez generovania dokumentov.",
      inputSchemaRef: "docs/contracts/contract-intake.schema.json",
      requiresApproval: false,
    },
    {
      name: "arcigy.draft_price_offer_intake",
      description: "Pouzije Gemini na navrh JSON vstupu pre Arcigy cenovu ponuku bez generovania dokumentu.",
      inputSchemaRef: "docs/pricing/price-offer.schema.json",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_pricing_proposal_preview",
      description: "Read-only vypocita cenovu ponuku, zlavove pravidla, DPH a marzu a pripravi schvalovaci next call na DOCX.",
      inputSchemaRef: "docs/pricing/price-offer.schema.json",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_service_capacity_preview",
      description: "Read-only skontroluje kapacitu Arcigy sluzieb pred ponukou a pripravi pricing preview next call.",
      requiresApproval: false,
    },
    {
      name: "arcigy.generate_price_offer_document",
      description: "Vygeneruje Arcigy cenovu ponuku DOCX zo schvaleneho price-offer JSON formulara.",
      inputSchemaRef: "docs/pricing/price-offer.schema.json",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_cold_outreach_brief",
      description: "Vrati strucny slovensky brief o cold outreach aktivite za zvolene obdobie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_cold_outreach_brief_from_db",
      description: "Vypocita cold outreach brief z lokalnych SQLite eventov za zvolene obdobie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.add_cold_outreach_event",
      description: "Ulozi lokalny cold outreach event, napriklad sent, opened, replied alebo positive_reply.",
      requiresApproval: false,
    },
    {
      name: "arcigy.prepare_positive_outreach_reply",
      description: "Pouzije Gemini na pripravu odpovede pozitivnemu leadu a ulozi ju ako prepared_reply cakajuci na schvalenie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_prepared_outreach_replies",
      description: "Vrati pripravene cold outreach odpovede cakajuce na schvalenie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_approval_queue",
      description: "Vrati jednotny Jarvis approval inbox s pripravenymi odpovedami a klientskymi rozhodnutiami cakajucimi na potvrdenie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.approve_prepared_outreach_reply",
      description: "Oznaci pripravenu cold outreach odpoved ako schvalenu az po explicitnom potvrdeni.",
      requiresApproval: true,
    },
    {
      name: "arcigy.send_approved_outreach_reply",
      description: "Odosle uz schvalenu prepared outreach odpoved cez Gmail az po explicitnom potvrdeni.",
      requiresApproval: true,
    },
    {
      name: "arcigy.identify_email",
      description: "Podla emailu najde lokalneho klienta alebo lead a otvorene klientske poziadavky.",
      requiresApproval: false,
    },
    {
      name: "arcigy.upsert_local_person",
      description: "Vytvori alebo aktualizuje lokalneho klienta, lead alebo kontakt podla emailu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.upsert_local_niche",
      description: "Po schvaleni vytvori alebo aktualizuje lokalny leadgen niche s keywordmi, regionmi, dennym targetom a Smartlead campaignId.",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_local_niche_queue",
      description: "Read-only nacita aktivnu lokalnu niche queue, aktualny region a dalsie safe MCP kroky pre leadgen.",
      requiresApproval: false,
    },
    {
      name: "arcigy.record_local_niche_run",
      description: "Po schvaleni zapise denny niche run, inkrementuje region index a volitelne oznaci vycerpany niche ako completed.",
      requiresApproval: true,
    },
    {
      name: "arcigy.add_client_need_signal",
      description: "Ulozi lokalny signal, ze klient nieco chce alebo potrebuje.",
      requiresApproval: false,
    },
    {
      name: "arcigy.ingest_client_message",
      description: "Ulozi prijatu spravu alebo email, sparuje odosielatela a pri poziadavke vytvori Jarvis alert.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_client_need_alerts",
      description: "Vrati persistentny inbox otvorenych klientskych poziadaviek, ktore ma Jarvis pripomenut.",
      requiresApproval: false,
    },
    {
      name: "arcigy.update_client_need_status",
      description: "Oznaci klientsku poziadavku ako seen, resolved alebo ignored po explicitnom potvrdeni operatorom.",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_audit_events",
      description: "Vrati lokalny audit trail Jarvis operacii, approval-gated akcii a citlivych workflow krokov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_local_memory_snapshot",
      description: "Vrati secret-safe snapshot lokalnej klientovej pamate, email aktivit, klientskych poziadaviek a audit eventov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.export_local_memory_snapshot",
      description: "Ulozi redigovany local memory snapshot do JSON suboru v repozitari az po explicitnom potvrdeni operatorom.",
      requiresApproval: true,
    },
    {
      name: "arcigy.jarvis_voice_event",
      description: "Spracuje transcript event pre Jarvis wake-word a vrati text na hlasovu odpoved.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_system_health",
      description: "Skontroluje, ktore produkcne integracie maju runtime konfiguraciu bez odhalenia secretov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.run_integration_diagnostics",
      description: "Spusti konfiguracne alebo live read-only diagnostiky integracii bez odhalenia secretov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_production_readiness",
      description: "Vrati produkcny readiness report s blockermi, next actions, MCP stavom a volitelnymi live diagnostikami.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_production_verification_evidence",
      description: "Vrati posledny secret-safe production verification artifact z npm run verify:production.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_production_completion_score",
      description: "Vrati evidence-based percento produkcnej dokoncenosti Jarvisa s komponentmi, proofom a dalsim krokom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_jarvis_capability_audit",
      description: "Vrati secret-safe audit pokrytia celeho Jarvis ciela: tooly, approval locky, integracie, remote MCP a production evidence.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_remote_mcp_pack",
      description: "Vrati secret-safe connection pack pre Claude, ChatGPT, Grok alebo iny remote MCP agent.",
      requiresApproval: false,
    },
    {
      name: "arcigy.run_remote_mcp_smoke",
      description: "Overi remote MCP manifest, action manifest, OpenAPI, CORS preflight, external auth gate, connection pack, read-only tool call a approval gate bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_operator_briefing",
      description: "Spoji readiness, cold outreach, klientske poziadavky a pripravene odpovede do jedneho Jarvis briefingu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_proactive_attention_digest",
      description: "Vrati Jarvis attention digest s klientskymi poziadavkami, odpovedami na schvalenie, urgenciou a bezpecnym dalsim krokom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_leadgen_daily_report",
      description: "Vytvori denny leadgen report zo Smartlead stats, stuck leadov a system settingov bez Slack odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_leadgen_evening_summary",
      description: "Vytvori vecerny prehlad odoslanych emailov, odpovedi, pozitivnych reakcii a dnesnych reply signalov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_slack_report_preview",
      description: "Pripravi Slack Block Kit payload pre denny leadgen report a ovladacie tlacidla bez odoslania do Slacku.",
      requiresApproval: false,
    },
    {
      name: "arcigy.send_slack_message",
      description: "Po explicitnom schvaleni odosle text alebo Block Kit payload do Slacku cez bot token alebo webhook.",
      requiresApproval: true,
    },
    {
      name: "arcigy.build_leadgen_ops_digest",
      description: "Spoji denny report, vecerny summary, niche rotaciu a stuck leady do ops digestu s dalsimi MCP tool callmi.",
      requiresApproval: false,
    },
    {
      name: "arcigy.select_next_niche",
      description: "Read-only preview niche-manager rotacie: vyberie dalsi niche a region bez posunu indexu v databaze.",
      requiresApproval: false,
    },
    {
      name: "arcigy.generate_ai_reply",
      description: "Pouzije Gemini na pripravu navrhu odpovede klientovi bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.sync_gmail_recent_messages",
      description: "Nacita posledne Gmail spravy a ulozi klientske potreby do lokalnej databazy.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_gmail_lead_context",
      description: "Read-only vyhlada lead email v Gmail uctoch, vrati display name, historiu threadu a safe dalsi preview_gmail_ai_reply krok bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.lookup_public_email_profile",
      description: "Read-only vyhlada verejny email profil cez Gravatar, vrati meno/avatar signaly a identity repair next call bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_gmail_unread_triage",
      description: "Read-only nacita unread primary Gmail spravy, roztriedi lead replies vs automaticke/interne emaily a pripravi get_gmail_lead_context/preview_gmail_ai_reply dalsie kroky bez labelu, zapisu alebo odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.label_gmail_thread",
      description: "Po explicitnom schvaleni vytvori alebo najde Gmail label, prida ho na thread a volitelne odstrani UNREAD.",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_smartlead_campaign_status",
      description: "Nacita kampane alebo statistiky kampane zo Smartlead API.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_smartlead_outreach_brief",
      description: "Normalizuje Smartlead statistiky kampane do hotoveho Jarvis cold outreach briefu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_smartlead_campaign_leads",
      description: "Read-only nacita leadov v Smartlead kampani s offset/limit pre audit alebo kontrolu importu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_smartlead_email_accounts",
      description: "Read-only nacita Smartlead sender ucty, warmup statusy a limity a pripravi sender-capacity preview payload.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_smartlead_lead_sync",
      description: "Read-only nacita Smartlead lead statusy a vrati lokalne update kandidaty bez zapisu do databazy.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_smartlead_campaign_webhooks",
      description: "Read-only nacita aktualne Smartlead webhooky kampane pred AI reply alebo launch konfiguraciou.",
      requiresApproval: false,
    },
    {
      name: "arcigy.upsert_smartlead_campaign_webhook",
      description: "Po explicitnom schvaleni prida alebo aktualizuje Smartlead webhook pre kampan, typicky EMAIL_REPLY a LEAD_CATEGORY_UPDATED.",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_smartlead_message_history",
      description: "Read-only nacita Smartlead message history pre lead email a pripravi metadata posledneho odoslaneho emailu pre reply flow.",
      requiresApproval: false,
    },
    {
      name: "arcigy.classify_outreach_reply",
      description: "Read-only klasifikuje odpoved leada na POSITIVE, NEGATIVE, ALREADY_SENT alebo NEUTRAL pred akymkolvek draftom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_outreach_reply_triage_preview",
      description: "Read-only roztriedi viac outreach odpovedi naraz a pripravi bezpecne draft next-step payloady bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_showcase_reply_preview",
      description: "Read-only pripravi kratku slovensku showcase odpoved s linkom pri jasnom pozitivnom zaujme, bez Gemini a bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_smartlead_ai_reply",
      description: "Preview Smartlead AI reply webhooku: skontroluje event, prazdne telo, duplicitu, human-in-loop a vrati dalsi bezpecny krok.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_gmail_ai_reply",
      description: "Preview Gmail AI reply workflowu: overi znameho leada, thread, human-in-loop a pozitivny signal bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.draft_smartlead_thread_reply",
      description: "Pouzije Gemini a Smartlead message history na draft odpovede vo vlakne bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.send_smartlead_thread_reply",
      description: "Odosle schvalenu odpoved do existujuceho Smartlead email vlakna cez reply-email-thread.",
      requiresApproval: true,
    },
    {
      name: "arcigy.create_smartlead_campaign",
      description: "Vytvori Smartlead kampan a volitelne nastavi sekvencie, email ucty, schedule, settings, webhook a leady po explicitnom schvaleni.",
      requiresApproval: true,
    },
    {
      name: "arcigy.configure_smartlead_campaign",
      description: "Nastavi existujucu Smartlead kampan: sekvencie, email ucty, schedule, settings alebo webhook po explicitnom schvaleni.",
      requiresApproval: true,
    },
    {
      name: "arcigy.fetch_url_preview",
      description: "Bezpecne fetchne verejnu HTTP/HTTPS URL cez GET alebo HEAD, blokuje private hosty a vrati redigovany text/JSON preview.",
      requiresApproval: false,
    },
    {
      name: "arcigy.batch_fetch_url_previews",
      description: "Bezpecne fetchne viac verejnych HTTP/HTTPS URL naraz a vrati redigovane per-URL preview bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_url_intelligence_queue_preview",
      description: "Z raw URL a leadov pripravi fetch, scrape, AI intro, repair a Smartlead import queue bez spustenia zapisov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.search_serper",
      description: "Vyhlada webove vysledky cez Serper pre lead discovery.",
      requiresApproval: false,
    },
    {
      name: "arcigy.search_google_places",
      description: "Vyhlada firmy cez Google Places Text Search.",
      requiresApproval: false,
    },
    {
      name: "arcigy.discover_leads",
      description: "Skombinuje Serper a Google Places do normalizovaneho zoznamu leadov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.scrape_website_contacts",
      description: "Fetchne web a kontaktne podstranky, vytiahne emaily, telefony, title, popis a textovy preview pre lead enrichment.",
      requiresApproval: false,
    },
    {
      name: "arcigy.batch_scrape_website_contacts",
      description: "Batch read-only scrape viacerych webov pre emaily, telefony a text preview s per-site error reportom bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_website_scrape_quality_audit_preview",
      description: "Skontroluje kvalitu website scrape vysledkov, vyberie preferovane emaily/telefony/kontext a pripravi rescrape, AI intro a merge kroky bez fetchu alebo zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_outreach_contact_selection_preview",
      description: "Rankne scraped emaily/telefony pre outreach, vyberie najlepsi kontakt a pripravi fallback search, rescrape, intro a repair kroky bez fetchu alebo zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.enrich_slovak_company_register",
      description: "Read-only vyhlada slovensku firmu v ORSR podla ICO alebo nazvu a vytiahne firmu, adresu a konatelov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_local_lead_register_update_preview",
      description: "Read-only ORSR enrichment pre jednu lokalnu osobu/leada: pripravi presny JSON data patch a approval payload bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.apply_local_lead_register_update",
      description: "Po explicitnom schvaleni ulozi ORSR enrichment patch do lokalnej lead/client memory osoby cez existujuci JSON data payload.",
      requiresApproval: true,
    },
    {
      name: "arcigy.build_slovak_register_batch_preview",
      description: "Pripravi batch ORSR/register enrichment frontu pre leady s ICO/nazvom, next lookup calls a repair/merge krokmi bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_slovak_salutation_preview",
      description: "Pripravi pan/pani oslovenia a Smartlead custom fields last_name_with_salutation/greeting pre batch leadov bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_gmail_name_enrichment_queue_preview",
      description: "Pripravi batch obnovu decision-maker mien z Gmail display-name historie, public email hintov a personal email patternov pred salutation/intro/Smartlead krokmi.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_identity_repair_preview",
      description: "Opravi identitu leadov pred Smartleadom: inferuje meno z personal emailu, vycisti company_name_short a pripravi safe QA/salutation kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.score_lead_quality",
      description: "Ohodnoti leady 0-100 podla emailu, webu, SK domeny, decision makera, ORSR overenia, AI intra a validation statusu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_validation_scorecard_preview",
      description: "Batch scoring pred Smartlead injectom: validate-style bucket report, minScore filter, sent lead exclusions a injection next steps bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.dedupe_lead_candidates",
      description: "Zdeduplikuje lead candidates podla emailu, webu, telefonu alebo nazvu firmy pred importom do Smartlead/Sheets.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_suppression_list_preview",
      description: "Z bounce, unsubscribe, negativnych odpovedi a manualnych pravidiel pripravi suppression/blacklist filter bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_history_suppression_preview",
      description: "Z CSV/manual leadov vyradi uz odoslane, odpovedane, blokovane alebo v Smartlead najdene leady pred autopilotom a uploadom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_nonreply_call_list_preview",
      description: "Pripravi call/follow-up list zo Smartlead alebo CSV leadov, ktorym sa pisalo a neodpovedali, vratane phone scrape a CSV export krokov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_niche_leadgen_plan",
      description: "Vrati niche-specific Google Maps/Serper query plan a blacklist keywords pre slovensky leadgen.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_batch_niche_discovery_plan",
      description: "Naplánuje discovery, scrape, AI intra, runbooky a Smartlead prep pre viac niche/regionov bez spustenia.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_discovery_matrix_preview",
      description: "Vytvori keyword-region Google Maps/Serper discovery matrix s blacklistom, dedupe a dalsimi MCP krokmi pred scrapingom/importom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_execution_queue_preview",
      description: "Zoradi denny leadgen execution queue cez niche, regiony, kvoty, discovery, enrichment a Smartlead handoff bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_daily_leadgen_run_closure_preview",
      description: "Pripravi denny post-run ledger: discovered/enriched/qualified/sent/failed, region advance, exhaustion rozhodnutie a record_local_niche_run approval payload bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_run_resume_preview",
      description: "Najde checkpoint preruseneho leadgen runu a vrati presne dalsie MCP kroky pre discovery, scrape, kontakt selection, AI intro, repair, Smartlead upload alebo closure bez opakovania hotovej prace.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_region_expansion_queue_preview",
      description: "Rozbali niche cez capitals/all-Slovakia/custom regiony, preskoci uz prejdene a pripravi discovery/execution queue bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.draft_smartlead_campaign_sequence",
      description: "Vytvori draft Smartlead email sequence struktury s variantmi a follow-upom bez zapisu do Smartlead.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_sequence_work_packet_preview",
      description: "Pripravi AI work packet pre tvorbu Smartlead sekvencii, validuje vratene sekvencie a navrhne QA/repair/configure kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_smartlead_email_rendering",
      description: "Vyrenderuje Smartlead sekvencie pre konkretne leady a ukaze chybajuce premenne bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_sequence_variable_repair_preview",
      description: "Prepise Smartlead subject premenne z company_name na company_name_short a pripravi schvalovaci configure payload bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_company_short_name_preview",
      description: "Normalizuje kratky nazov firmy pre Smartlead custom_fields.company_name_short bez DB zapisu alebo uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_batch_qa_preview",
      description: "Skontroluje batch leadov pred Smartleadom: emaily, blokovane zdroje, company_short, AI intro a repair next steps bez DB zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_manual_review_pickup",
      description: "Preview manual-review-pickup workflowu: vyberie opravene nesent leady, kvalifikuje ich a rozdeli podla niche bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_injection_plan",
      description: "Pripravi Smartlead lead_list batche a approval payload pre upload leadov do existujucej kampane bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_bulk_smartlead_upload_queue_preview",
      description: "Naplánuje approval-gated Smartlead uploady napriec viac kampanami s prioritami, dennymi limitmi a setup fallbackmi bez uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_import_audit_preview",
      description: "Porovna pripravene Smartlead leady s existujucimi leadmi v kampani, oddeli nove/duplicitne a pripravi safe approval payload bez uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_sync_plan_preview",
      description: "Porovna lokalne pripravene leady s remote Smartlead kampanou a pripravi missing upload aj manual update payloady bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_local_reconciliation_preview",
      description: "Porovna lokalne lead flagy so Smartlead remote/sync vysledkami a pripravi patch plan pre sent_to_smartlead, contact id, reply status a sentiment bez DB zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_safe_sync_runbook_preview",
      description: "Zlozi bezpecny Smartlead sync runbook: nacitanie remote leadov, backup, pauza checklist, sync plan, approval upload/update a re-check bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_sender_capacity_preview",
      description: "Skontroluje Smartlead sender ucty, warmup/reputaciu/limity, vypocita dennu kapacitu a navrhne safe configure payload.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_deliverability_guard_preview",
      description: "Skontroluje Smartlead deliverability metriky, sender kapacitu a navrhne continue/reduce/pause pred dalsim uploadom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_backup_plan",
      description: "Pripravi read-only Smartlead backup manifest, protected kampane, fetch endpointy a delete safety gates pred rizikovymi zmenami.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_restore_plan",
      description: "Normalizuje Smartlead backup JSON do approval-gated create/configure/add-leads restore payloadov bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.draft_niche_smartlead_campaign_setup",
      description: "Pripravi campaign setup payload pre novu niche Smartlead kampan vratane sekvencii, schedule, settings a webhooku bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_launch_preview",
      description: "Pripravi kompletny Smartlead launch plan: create/configure kampan, sekvencie, schedule, webhook a add-leads payloady bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_qa_preview",
      description: "Skontroluje Smartlead campaign launch payloady, leady, sekvencie, schedule a approval kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_smartlead_campaign_handoff_package_preview",
      description: "Zlozi Smartlead launch, QA, sender kapacitu a approval checklist do jedneho handoff balika bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.preview_lead_enrichment_batch",
      description: "Zluci scraped/register/AI data pre batch leadov, spravi dedupe, scoring, manual review queue a volitelny Smartlead injection plan bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_enrichment_merge_preview",
      description: "Spoji oddelene website scrape vysledky a AI intro drafty spat na povodne leady podla domeny/firmy a pripravi Smartlead next steps bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_gap_report",
      description: "Vyhodnoti leady pred Smartleadom, ukaze chybajuce emaily/weby/intra a navrhne dalsie safe MCP kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_status_board_preview",
      description: "Z CSV alebo leadov vytvori read-only status board po niche/campaign: ready pre Smartlead, bez emailu, bez AI intra, bez telefonu, uz odoslane a repair kroky.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_db_status_preview",
      description: "Z DB exportu, CSV alebo agregovanych niche stats vytvori leadgen DB status: enriched, Smartlead, verified, pending enrich, blacklist, resume state a dalsie MCP kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_google_sheet_sync_preview",
      description: "Pripravi Google Sheets sync plan z CSV alebo leadov: hlavicky, riadky, clear/update rozsahy a schvalovaci replace payload bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_campaign_pipeline_preview",
      description: "Z jedneho batchu leadov pripravi scrape, AI intro, enrichment a Smartlead next-step plan bez zapisu alebo uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_source_import_queue_preview",
      description: "Z Google Maps/CSV/manual lead source pripravi import queue po niche/kampaniach, gapy a Smartlead audit bez zapisu alebo uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_source_bundle_preview",
      description: "Spoji viac CSV/JSON/manual lead exportov do jedneho leadgen runbooku pre scrape, AI intra, review a Smartlead dalsie kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_source_bundle_campaign_launch_preview",
      description: "Z viacerych lead exportov pripravi Smartlead campaign launch a handoff baliky s approval krokmi bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_autopilot_batch_preview",
      description: "Z CSV alebo lead batchu zlozi autopilot runbook: scrape, fetch, AI intro audit, Smartlead import audit a approval upload kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_repair_queue_preview",
      description: "Najde pokazene leady, zle AI intra, chybajuce emaily/decision makerov a navrhne presne repair MCP kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_phone_enrichment_queue_preview",
      description: "Pripravi phone enrichment queue z CSV alebo leadov: filtruje krajinu, preskoci existujuce telefony, naplanuje scrape a export bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_orphan_lead_assignment_preview",
      description: "Analyzuje orphan leady bez niche, navrhne niche/kampan priradenie a repair/import next kroky bez DB zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_niche_ops_dashboard_preview",
      description: "Zhrnie stav niche/kampani, denne targety, stuck/failed/ready leady a navrhne dalsie MCP kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_cold_outreach_csv_import_preview",
      description: "Zo CSV leadov pripravi parse, blacklist filter, leadgen pipeline a Smartlead launch plan bez zapisu alebo uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_daily_leadgen_runbook",
      description: "Vytvori denny leadgen runbook s presnymi dalsimi MCP volaniami od discovery cez enrichment az po schvaleny Smartlead upload.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_full_leadgen_pipeline_runbook_preview",
      description: "Zlozi full leadgen runbook pre niche: discovery, fetch/scrape, scrape audit, AI intro balik, merge, QA a Smartlead handoff bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_lead_csv_mapping_preview",
      description: "Ukaze, ako Jarvis mapuje Google Maps/Smartlead CSV stlpce na leady pred autopilotom, scrapom, AI intrami a Smartlead importom.",
      requiresApproval: false,
    },
    {
      name: "arcigy.parse_leads_csv",
      description: "Sparsuje CSV text leadov do normalizovanych lead candidates pre review, scoring a Smartlead pripravu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.filter_blacklisted_leads",
      description: "Odstrani alebo oznaci leady podla blacklist domen a keywordov pred importom do Smartlead.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_manual_review_queue",
      description: "Rozdeli leady na ready, manual_review a reject podla emailu, webu, decision maker/phone, AI intra a skore.",
      requiresApproval: false,
    },
    {
      name: "arcigy.export_leads_csv",
      description: "Zapise vybrane leady do CSV suboru v repozitari pre manual review po explicitnom schvaleni.",
      requiresApproval: true,
    },
    {
      name: "arcigy.draft_lead_intro",
      description: "Pouzije Gemini na vytvorenie kratkeho personalizovaneho intra pre cold outreach lead bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.batch_draft_lead_intros",
      description: "Pouzije Gemini na batch pripravu kratkych personalizovanych cold outreach intr pre viac leadov bez odoslania alebo zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_ai_intro_quality_audit_preview",
      description: "Skontroluje AI intra pred Smartlead importom, najde chybajuce/genericke/kratke/slabo podlozene texty a pripravi redraft kroky.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_flagged_lead_review_preview",
      description: "Z flagged CSV alebo leadov po AI kontrole pripravi review queue: rescrape, redraft AI intra, identity repair, reject alebo writeback preview bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_ai_intro_work_packet_preview",
      description: "Pripravi Markdown/JSON pracovny balik pre ChatGPT alebo Claude na doplnenie chybajucich icebreakerov a validuje vratene intra bez DB zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_ai_intro_import_preview",
      description: "Sparuje ChatGPT/Claude JSON alebo CSV icebreaker vysledky s AI intro work packet leadmi, validuje ich a pripravi cleanup/audit/export/Smartlead dalsie kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_ai_icebreaker_writeback_preview",
      description: "Validuje AI icebreaker JSON podla lead ID, merguje platne intra spat na leady a pripravi cleanup/QA/Smartlead kroky bez DB zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_ai_intro_cleanup_preview",
      description: "Deterministicky vycisti AI intra od pozdravov, mien a osloveni, a pripravi redraft alebo Smartlead audit kroky bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.enrich_website_leads_preview",
      description: "Live read-only obohati leady z webov, vytvori AI intra a pripravi Smartlead preview bez zapisu alebo uploadu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.prepare_smartlead_leads",
      description: "Normalizuje vybrane leady do Smartlead lead_list payloadu vratane custom_fields a personalized_intro bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.run_leadgen_research_pipeline",
      description: "Spusti read-only pipeline: discovery cez Serper/Google Places, volitelny scrape webov a volitelne Gemini intra pre Smartlead import.",
      requiresApproval: false,
    },
    {
      name: "arcigy.add_leads_to_smartlead_campaign",
      description: "Nahra pripraveny Smartlead lead_list do kampane po explicitnom schvaleni operatorom.",
      requiresApproval: true,
    },
    {
      name: "arcigy.append_leads_to_google_sheet",
      description: "Zapise pripravene lead rows do Google Sheetu po explicitnom schvalenom volani.",
      requiresApproval: true,
    },
    {
      name: "arcigy.replace_google_sheet_rows",
      description: "Po explicitnom schvaleni vycisti cielovy Google Sheet range a prepise ho pripravenymi riadkami.",
      requiresApproval: true,
    },
  ];
}

export function buildContractGenerationCommand(inputJsonPath: string, outputDir = "generated/contracts"): ContractGenerationCommand {
  if (!inputJsonPath.trim().endsWith(".json")) {
    throw new Error("Contract generation input must be a JSON file path.");
  }

  return {
    command: "python",
    args: ["scripts/generate_contract_documents.py", "--input", inputJsonPath, "--output-dir", outputDir],
    outputDir,
  };
}

export function getColdOutreachMcpAnswer(metrics: ColdOutreachMetrics): string {
  const brief = buildColdOutreachBrief(metrics);
  return brief.approvalPrompt ? `${brief.summary} ${brief.approvalPrompt}` : brief.summary;
}

export function identifyEmailMcpAnswer(
  email: string,
  people: LocalPerson[],
  needSignals: ClientNeedSignal[] = []
): string {
  return answerJarvisIntent({
    kind: "identify_email",
    email,
    people,
    needSignals,
  });
}
