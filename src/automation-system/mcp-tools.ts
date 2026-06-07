import { buildColdOutreachBrief } from "./cold-outreach-summary.ts";
import { answerJarvisIntent } from "./jarvis-intents.ts";
import type { ClientNeedSignal, ColdOutreachMetrics, LocalPerson } from "./types.ts";

export type JarvisMcpToolName =
  | "arcigy.generate_contract_documents"
  | "arcigy.get_cold_outreach_brief"
  | "arcigy.get_cold_outreach_brief_from_db"
  | "arcigy.add_cold_outreach_event"
  | "arcigy.upsert_local_person"
  | "arcigy.add_client_need_signal"
  | "arcigy.ingest_client_message"
  | "arcigy.identify_email"
  | "arcigy.get_system_health"
  | "arcigy.generate_ai_reply"
  | "arcigy.sync_gmail_recent_messages"
  | "arcigy.get_smartlead_campaign_status"
  | "arcigy.jarvis_voice_event";

export type JarvisMcpTool = {
  name: JarvisMcpToolName;
  description: string;
  inputSchemaRef?: string;
  requiresApproval: boolean;
};

export type ContractGenerationCommand = {
  command: "python";
  args: string[];
  outputDir: string;
};

export function listJarvisMcpTools(): JarvisMcpTool[] {
  return [
    {
      name: "arcigy.generate_contract_documents",
      description: "Vygeneruje rámcovú zmluvu a projektovú prílohu z vyplneného Arcigy JSON formulára.",
      inputSchemaRef: "docs/contracts/contract-intake.schema.json",
      requiresApproval: true,
    },
    {
      name: "arcigy.get_cold_outreach_brief",
      description: "Vráti stručný Slovak brief o cold outreach aktivite za zvolené obdobie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_cold_outreach_brief_from_db",
      description: "Vypočíta cold outreach brief z lokálnych SQLite eventov za zvolené obdobie.",
      requiresApproval: false,
    },
    {
      name: "arcigy.add_cold_outreach_event",
      description: "Uloží lokálny cold outreach event, napríklad sent, opened, replied alebo positive_reply.",
      requiresApproval: false,
    },
    {
      name: "arcigy.identify_email",
      description: "Podľa emailu nájde lokálneho klienta alebo lead a otvorené klientské požiadavky.",
      requiresApproval: false,
    },
    {
      name: "arcigy.upsert_local_person",
      description: "Vytvorí alebo aktualizuje lokálneho klienta, lead alebo kontakt podľa emailu.",
      requiresApproval: false,
    },
    {
      name: "arcigy.add_client_need_signal",
      description: "Uloží lokálny signál, že klient niečo chce alebo potrebuje.",
      requiresApproval: false,
    },
    {
      name: "arcigy.ingest_client_message",
      description: "Uloží prijatú správu/email, spáruje odosielateľa a pri požiadavke vytvorí Jarvis alert.",
      requiresApproval: false,
    },
    {
      name: "arcigy.jarvis_voice_event",
      description: "Spracuje transcript event pre Jarvis wake-word a vráti text na hlasovú odpoveď.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_system_health",
      description: "Skontroluje, ktoré produkčné integrácie majú runtime konfiguráciu bez odhalenia secretov.",
      requiresApproval: false,
    },
    {
      name: "arcigy.generate_ai_reply",
      description: "Použije Gemini na prípravu návrhu odpovede klientovi bez odoslania.",
      requiresApproval: false,
    },
    {
      name: "arcigy.sync_gmail_recent_messages",
      description: "Načíta posledné Gmail správy a uloží klientské potreby do lokálnej databázy.",
      requiresApproval: false,
    },
    {
      name: "arcigy.get_smartlead_campaign_status",
      description: "Načíta kampane alebo štatistiky kampane zo Smartlead API.",
      requiresApproval: false,
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
