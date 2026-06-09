import { buildColdOutreachBrief } from "./cold-outreach-summary.ts";
import { answerJarvisIntent } from "./jarvis-intents.ts";
import type { ClientNeedSignal, ColdOutreachMetrics, LocalPerson } from "./types.ts";

export type JarvisMcpToolName =
  | "arcigy.generate_contract_documents"
  | "arcigy.draft_contract_intake"
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
  | "arcigy.get_remote_mcp_pack"
  | "arcigy.run_remote_mcp_smoke"
  | "arcigy.get_operator_briefing"
  | "arcigy.generate_ai_reply"
  | "arcigy.sync_gmail_recent_messages"
  | "arcigy.get_smartlead_campaign_status"
  | "arcigy.get_smartlead_outreach_brief"
  | "arcigy.search_serper"
  | "arcigy.search_google_places"
  | "arcigy.discover_leads"
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
