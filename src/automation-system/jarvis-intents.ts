import { buildColdOutreachBrief } from "./cold-outreach-summary.ts";
import { buildClientNeedBrief, matchLocalIdentity } from "./identity-matching.ts";
import type { ClientNeedSignal, ColdOutreachMetrics, LocalPerson } from "./types.ts";

export type JarvisIntent =
  | {
      kind: "cold_outreach_status";
      metrics: ColdOutreachMetrics;
    }
  | {
      kind: "identify_email";
      email: string;
      people: LocalPerson[];
      needSignals?: ClientNeedSignal[];
    }
  | {
      kind: "voice_capability";
      capability: JarvisVoiceCapability;
      transcript: string;
    };

export type JarvisVoiceCapability =
  | "cold_outreach_brief"
  | "operator_briefing"
  | "production_readiness"
  | "remote_mcp"
  | "contract_generation"
  | "client_memory"
  | "gmail_sync"
  | "lead_discovery"
  | "system_health"
  | "ai_reply";

export function answerJarvisIntent(intent: JarvisIntent): string {
  if (intent.kind === "cold_outreach_status") {
    const brief = buildColdOutreachBrief(intent.metrics);
    return brief.approvalPrompt ? `${brief.summary} ${brief.approvalPrompt}` : brief.summary;
  }

  if (intent.kind === "voice_capability") {
    return answerVoiceCapability(intent.capability);
  }

  const match = matchLocalIdentity(intent.email, intent.people, intent.needSignals ?? []);
  if (!match.person) {
    return `Email ${match.email} zatiaľ nepoznám v lokálnej databáze klientov a leadov.`;
  }

  const personName = match.person.displayName ?? match.person.companyName ?? match.person.primaryEmail;
  const needBrief = buildClientNeedBrief(match);
  const identity = `${match.email} je ${personName} (${match.person.kind}), zhoda: ${match.reason}.`;
  return needBrief ? `${identity} ${needBrief}` : identity;
}

export function resolveJarvisIntentFromTranscript(transcript: string): JarvisIntent | null {
  const normalized = normalizeIntentTranscript(transcript);
  const capability = resolveVoiceCapability(normalized);
  return capability ? { kind: "voice_capability", capability, transcript } : null;
}

function resolveVoiceCapability(text: string): JarvisVoiceCapability | null {
  if (hasAny(text, ["cold outreach", "outreach", "smartlead", "pozitivne odpovede"])) return "cold_outreach_brief";
  if (hasAny(text, ["briefing", "prehlad", "co sa deje", "co sa dialo", "operator"])) return "operator_briefing";
  if (hasAny(text, ["production", "produkcia", "readiness", "launch", "checklist", "nasadenie"])) return "production_readiness";
  if (hasAny(text, ["remote mcp", "mcp", "tunel", "tunnel", "handoff", "claude", "chatgpt"])) return "remote_mcp";
  if (hasAny(text, ["zmluva", "zmluvy", "contract", "priloha", "docx", "intake"])) return "contract_generation";
  if (hasAny(text, ["klient", "klientske", "poziadavky", "kto je", "email", "lokalna pamat"])) return "client_memory";
  if (hasAny(text, ["gmail", "mail", "inbox", "posta", "sync"])) return "gmail_sync";
  if (hasAny(text, ["lead", "leady", "leadov", "vyhladaj", "najdi"])) return "lead_discovery";
  if (hasAny(text, ["integracie", "integracia", "system", "health", "stav"])) return "system_health";
  if (hasAny(text, ["odpoved", "odpovedz", "draft", "gemini"])) return "ai_reply";
  return null;
}

function answerVoiceCapability(capability: JarvisVoiceCapability): string {
  const answers: Record<JarvisVoiceCapability, string> = {
    cold_outreach_brief:
      "Viem zhrnúť cold outreach v Jarvis štýle: koľkým ľuďom sme napísali, open rate, odpovede, pozitívne odpovede a pripravené odpovede čakajúce na tvoje potvrdenie.",
    operator_briefing:
      "Viem spraviť Jarvis briefing: readiness, cold outreach, Gmail sync, klientske požiadavky, pripravené odpovede a najbližší krok.",
    production_readiness:
      "Viem skontrolovať produkčný stav: integrácie, live diagnostiku, MCP registry, approval locks a launch checklist.",
    remote_mcp:
      "Viem pripraviť remote MCP handoff pre Claude alebo ChatGPT: manifest, connection pack, smoke test, bearer auth placeholder a quick-start volania.",
    contract_generation:
      "Viem pripraviť zmluvný intake a po tvojom schválení vygenerovať DOCX rámcovú zmluvu aj prílohy. Bez schválenia iba draftujem dáta.",
    client_memory:
      "Viem podľa emailu nájsť klienta alebo lead v lokálnej pamäti a povedať otvorené klientske požiadavky.",
    gmail_sync:
      "Viem skontrolovať Gmail, načítať posledné správy a pri povolenom zápise ich spárovať s lokálnou pamäťou klientov.",
    lead_discovery:
      "Viem vyhľadať leady cez dostupné lead providery a export do Sheets držím za explicitným schválením.",
    system_health:
      "Viem povedať stav integrácií a chýbajúce runtime nastavenia bez toho, aby som vracal tajné hodnoty.",
    ai_reply:
      "Viem pripraviť odpoveď klientovi alebo pozitívnemu leadu. Odošlem ju až po tvojom potvrdení cez approval krok.",
  };
  return answers[capability];
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeIntentTranscript(term)));
}

function normalizeIntentTranscript(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
