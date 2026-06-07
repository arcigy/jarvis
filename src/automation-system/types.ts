export type AutomationKey =
  | "contract_document_generator"
  | "cold_outreach_activity_brief"
  | "local_client_lead_identity"
  | "jarvis_voice_desktop_listener";

export type AutomationChannel = "mcp" | "dashboard" | "voice" | "scheduled";

export type AutomationDefinition = {
  key: AutomationKey;
  name: string;
  enabledByDefault: boolean;
  channels: AutomationChannel[];
  description: string;
  trigger: {
    type: string;
    payloadSchemaRef?: string;
  };
  dataPolicy: {
    storage: "json_payload";
    pii: "none" | "client_contact" | "email_activity" | "voice_input";
    approvalRequired: boolean;
  };
  output: {
    type: "docx" | "briefing" | "identity_match" | "voice_response";
    language: "sk";
  };
};

export type ColdOutreachMetrics = {
  periodLabel: string;
  contacted: number;
  opened: number;
  replied: number;
  positiveReplies: number;
  preparedPositiveReplyCount: number;
  pendingApprovalCount: number;
  notableSignals?: string[];
};

export type ColdOutreachBrief = {
  summary: string;
  approvalPrompt: string | null;
  metrics: {
    openRate: number;
    replyRate: number;
    positiveReplyRate: number;
  };
};

export type LocalPersonKind = "client" | "lead" | "contact";

export type LocalPerson = {
  id: string;
  kind: LocalPersonKind;
  primaryEmail: string;
  displayName?: string;
  companyName?: string;
  status: "active" | "inactive" | string;
  data?: Record<string, unknown>;
};

export type ClientNeedSignal = {
  id: string;
  personId: string;
  source: string;
  signalType: string;
  summary: string;
  status: "new" | "seen" | "resolved" | "ignored";
  confidence: number;
  occurredAt: string;
  data?: Record<string, unknown>;
};

export type IdentityMatch = {
  email: string;
  person: LocalPerson | null;
  confidence: number;
  reason: string;
  openNeedSignals: ClientNeedSignal[];
};
