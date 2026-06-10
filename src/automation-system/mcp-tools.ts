import { buildColdOutreachBrief } from "./cold-outreach-summary.ts";
import { answerJarvisIntent } from "./jarvis-intents.ts";
import type { ClientNeedSignal, ColdOutreachMetrics, LocalPerson } from "./types.ts";

export type JarvisMcpToolName =
  | "arcigy.generate_contract_documents"
  | "arcigy.draft_contract_intake"
  | "arcigy.draft_price_offer_intake"
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
  | "arcigy.build_leadgen_ops_digest"
  | "arcigy.select_next_niche"
  | "arcigy.generate_ai_reply"
  | "arcigy.sync_gmail_recent_messages"
  | "arcigy.get_smartlead_campaign_status"
  | "arcigy.get_smartlead_outreach_brief"
  | "arcigy.get_smartlead_campaign_leads"
  | "arcigy.preview_smartlead_lead_sync"
  | "arcigy.get_smartlead_message_history"
  | "arcigy.classify_outreach_reply"
  | "arcigy.preview_smartlead_ai_reply"
  | "arcigy.preview_gmail_ai_reply"
  | "arcigy.draft_smartlead_thread_reply"
  | "arcigy.send_smartlead_thread_reply"
  | "arcigy.create_smartlead_campaign"
  | "arcigy.configure_smartlead_campaign"
  | "arcigy.fetch_url_preview"
  | "arcigy.search_serper"
  | "arcigy.search_google_places"
  | "arcigy.discover_leads"
  | "arcigy.scrape_website_contacts"
  | "arcigy.batch_scrape_website_contacts"
  | "arcigy.enrich_slovak_company_register"
  | "arcigy.score_lead_quality"
  | "arcigy.dedupe_lead_candidates"
  | "arcigy.build_niche_leadgen_plan"
  | "arcigy.draft_smartlead_campaign_sequence"
  | "arcigy.preview_manual_review_pickup"
  | "arcigy.build_smartlead_injection_plan"
  | "arcigy.draft_niche_smartlead_campaign_setup"
  | "arcigy.build_smartlead_campaign_launch_preview"
  | "arcigy.preview_lead_enrichment_batch"
  | "arcigy.build_leadgen_campaign_pipeline_preview"
  | "arcigy.build_cold_outreach_csv_import_preview"
  | "arcigy.build_daily_leadgen_runbook"
  | "arcigy.parse_leads_csv"
  | "arcigy.filter_blacklisted_leads"
  | "arcigy.build_manual_review_queue"
  | "arcigy.export_leads_csv"
  | "arcigy.draft_lead_intro"
  | "arcigy.batch_draft_lead_intros"
  | "arcigy.enrich_website_leads_preview"
  | "arcigy.prepare_smartlead_leads"
  | "arcigy.run_leadgen_research_pipeline"
  | "arcigy.add_leads_to_smartlead_campaign"
  | "arcigy.append_leads_to_google_sheet"
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
  "arcigy.add_client_need_signal",
  "arcigy.ingest_client_message",
  "arcigy.update_client_need_status",
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
      name: "arcigy.preview_smartlead_lead_sync",
      description: "Read-only nacita Smartlead lead statusy a vrati lokalne update kandidaty bez zapisu do databazy.",
      requiresApproval: false,
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
      name: "arcigy.enrich_slovak_company_register",
      description: "Read-only vyhlada slovensku firmu v ORSR podla ICO alebo nazvu a vytiahne firmu, adresu a konatelov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.score_lead_quality",
      description: "Ohodnoti leady 0-100 podla emailu, webu, SK domeny, decision makera, ORSR overenia, AI intra a validation statusu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.dedupe_lead_candidates",
      description: "Zdeduplikuje lead candidates podla emailu, webu, telefonu alebo nazvu firmy pred importom do Smartlead/Sheets.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_niche_leadgen_plan",
      description: "Vrati niche-specific Google Maps/Serper query plan a blacklist keywords pre slovensky leadgen.",
      requiresApproval: false,
    },
    {
      name: "arcigy.draft_smartlead_campaign_sequence",
      description: "Vytvori draft Smartlead email sequence struktury s variantmi a follow-upom bez zapisu do Smartlead.",
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
      name: "arcigy.preview_lead_enrichment_batch",
      description: "Zluci scraped/register/AI data pre batch leadov, spravi dedupe, scoring, manual review queue a volitelny Smartlead injection plan bez zapisu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.build_leadgen_campaign_pipeline_preview",
      description: "Z jedneho batchu leadov pripravi scrape, AI intro, enrichment a Smartlead next-step plan bez zapisu alebo uploadu.",
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
