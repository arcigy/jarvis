export type OperatorBriefingInput = {
  readinessStatus: string;
  readinessSummary: string;
  readinessAttentionQueue?: Array<{
    key: string;
    severity: string;
    title: string;
    source: string;
    nextAction: string;
  }>;
  productionEvidenceSummary?: string | null;
  providerFallbackSummary?: string | null;
  coldOutreachSummary: string;
  liveSyncSummary?: string | null;
  openClientNeedCount: number;
  clientNeedHighlights?: Array<{
    person?: {
      primaryEmail?: string | null;
      displayName?: string | null;
      companyName?: string | null;
    } | null;
    needSignal?: {
      summary?: string | null;
      occurredAt?: string | null;
    } | null;
  }>;
  preparedReplyCount: number;
  preparedReplyHighlights?: Array<{
    leadEmail?: string | null;
    leadName?: string | null;
    companyName?: string | null;
    positiveSignal?: string | null;
    subject?: string | null;
  }>;
  nextActions: string[];
};

export type OperatorBriefing = {
  summary: string;
  speechText: string;
  sections: {
    readiness: string;
    readinessAttention?: string;
    productionEvidence?: string;
    providerFallback?: string;
    coldOutreach: string;
    liveSync?: string;
    clientNeeds: string;
    preparedReplies: string;
    nextAction: string;
  };
};

export function buildOperatorBriefing(input: OperatorBriefingInput): OperatorBriefing {
  const nextAction = cleanBriefingText(input.nextActions[0] ?? "Ziadny urgentny krok.");
  const readinessAttention = summarizeReadinessAttention(input.readinessAttentionQueue ?? []);
  const clientNeeds = summarizeClientNeeds(input.openClientNeedCount, input.clientNeedHighlights ?? []);
  const preparedReplies = summarizePreparedReplies(input.preparedReplyCount, input.preparedReplyHighlights ?? []);
  const sections = {
    readiness: `Readiness: ${cleanBriefingText(input.readinessStatus)}. ${cleanBriefingText(input.readinessSummary)}`,
    readinessAttention,
    productionEvidence: input.productionEvidenceSummary ? `Production evidence: ${cleanBriefingText(input.productionEvidenceSummary)}` : undefined,
    providerFallback: input.providerFallbackSummary ? `Provider fallback: ${cleanBriefingText(input.providerFallbackSummary)}` : undefined,
    coldOutreach: `Cold outreach: ${cleanBriefingText(input.coldOutreachSummary)}`,
    liveSync: input.liveSyncSummary ? `Live sync: ${cleanBriefingText(input.liveSyncSummary)}` : undefined,
    clientNeeds,
    preparedReplies,
    nextAction: `Najblizsi krok: ${nextAction}`,
  };
  const speechText = [
    "Jarvis briefing.",
    sections.readiness,
    sections.readinessAttention,
    sections.productionEvidence,
    sections.providerFallback,
    sections.coldOutreach,
    sections.liveSync,
    sections.clientNeeds,
    sections.preparedReplies,
    sections.nextAction,
  ].filter(Boolean).join(" ");
  return {
    summary: speechText,
    speechText,
    sections,
  };
}

function summarizeReadinessAttention(queue: NonNullable<OperatorBriefingInput["readinessAttentionQueue"]>): string | undefined {
  if (!queue.length) return undefined;
  const topItems = queue
    .slice(0, 3)
    .map((item) => `${cleanBriefingText(item.key)}: ${cleanBriefingText(item.title)}`)
    .join("; ");
  return `Production attention queue: ${queue.length} item(s). ${topItems}.`;
}

function summarizeClientNeeds(count: number, highlights: NonNullable<OperatorBriefingInput["clientNeedHighlights"]>): string {
  if (count <= 0) return "Klientske poziadavky: ziadne otvorene.";
  const topItems = highlights
    .slice(0, 3)
    .map((item) => {
      const person = item.person ?? {};
      const need = item.needSignal ?? {};
      const name = cleanBriefingText(person.displayName || person.companyName || person.primaryEmail || "neznamy kontakt");
      const summary = cleanBriefingText(need.summary || "bez detailu");
      return `${name}: ${summary}`;
    })
    .filter(Boolean);
  if (!topItems.length) return `Klientske poziadavky: ${count} otvorenych.`;
  return `Klientske poziadavky: ${count} otvorenych. Najnovsie: ${topItems.join("; ")}.`;
}

function summarizePreparedReplies(count: number, highlights: NonNullable<OperatorBriefingInput["preparedReplyHighlights"]>): string {
  if (count <= 0) return "Pripravene odpovede: nic necaka na schvalenie.";
  const topItems = highlights
    .slice(0, 3)
    .map((item) => {
      const name = cleanBriefingText(item.leadName || item.companyName || item.leadEmail || "neznamy lead");
      const signal = cleanBriefingText(item.positiveSignal || item.subject || "pozitivna odpoved");
      return `${name}: ${signal}`;
    })
    .filter(Boolean);
  const base = `Pripravene odpovede: ${count} caka na schvalenie.`;
  const guard = "Poslem ich az po tvojom schvaleni.";
  return topItems.length ? `${base} Najnovsie: ${topItems.join("; ")}. ${guard}` : `${base} ${guard}`;
}

function cleanBriefingText(value: string | null | undefined): string {
  const decoded = decodeHtmlEntities(String(value ?? ""));
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return "\"";
      if (normalized === "apos") return "'";
      return " ";
    });
}

function safeCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 32 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}
