import type { AutomationDefinition } from "./types.js";

export const jarvisAutomations: AutomationDefinition[] = [
  {
    key: "contract_document_generator",
    name: "Prepis zmluv pre klientov",
    enabledByDefault: true,
    channels: ["mcp", "dashboard"],
    description:
      "Vyplní klientsky formulár a vygeneruje rámcovú zmluvu aj projektovú prílohu z univerzálnych Arcigy šablón.",
    trigger: {
      type: "contract_form_submitted",
      payloadSchemaRef: "docs/contracts/contract-intake.schema.json",
    },
    dataPolicy: {
      storage: "json_payload",
      pii: "client_contact",
      approvalRequired: true,
    },
    output: {
      type: "docx",
      language: "sk",
    },
  },
  {
    key: "cold_outreach_activity_brief",
    name: "Cold outreach prehľad pre MCP",
    enabledByDefault: true,
    channels: ["mcp", "voice", "dashboard"],
    description:
      "Na otázku o cold outreach vráti stručný prehľad kontaktovaných ľudí, open rate, odpovedí, pozitívnych reakcií a pripravených odpovedí.",
    trigger: {
      type: "mcp_question",
    },
    dataPolicy: {
      storage: "json_payload",
      pii: "email_activity",
      approvalRequired: true,
    },
    output: {
      type: "briefing",
      language: "sk",
    },
  },
  {
    key: "local_client_lead_identity",
    name: "Lokálna identita klientov a leadov",
    enabledByDefault: true,
    channels: ["mcp", "dashboard"],
    description:
      "Podľa emailu páruje lokálnych klientov, leadov a komunikáciu, aby MCP vedel povedať kto je kto a čo klient potrebuje.",
    trigger: {
      type: "email_or_message_seen",
    },
    dataPolicy: {
      storage: "json_payload",
      pii: "client_contact",
      approvalRequired: false,
    },
    output: {
      type: "identity_match",
      language: "sk",
    },
  },
  {
    key: "jarvis_voice_desktop_listener",
    name: "Jarvis hlasový desktop listener",
    enabledByDefault: false,
    channels: ["voice"],
    description:
      "Desktopová vrstva čaká na wake word 'Jarvis', prepíše hlasový vstup, spustí lokálny intent a odpovie hlasom.",
    trigger: {
      type: "wake_word_detected",
    },
    dataPolicy: {
      storage: "json_payload",
      pii: "voice_input",
      approvalRequired: true,
    },
    output: {
      type: "voice_response",
      language: "sk",
    },
  },
];
