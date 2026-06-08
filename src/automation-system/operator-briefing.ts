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
  coldOutreachSummary: string;
  liveSyncSummary?: string | null;
  openClientNeedCount: number;
  preparedReplyCount: number;
  nextActions: string[];
};

export type OperatorBriefing = {
  summary: string;
  speechText: string;
  sections: {
    readiness: string;
    readinessAttention?: string;
    coldOutreach: string;
    liveSync?: string;
    clientNeeds: string;
    preparedReplies: string;
    nextAction: string;
  };
};

export function buildOperatorBriefing(input: OperatorBriefingInput): OperatorBriefing {
  const nextAction = input.nextActions[0] ?? "Ziadny urgentny krok.";
  const readinessAttention = summarizeReadinessAttention(input.readinessAttentionQueue ?? []);
  const sections = {
    readiness: `Readiness: ${input.readinessStatus}. ${input.readinessSummary}`,
    readinessAttention,
    coldOutreach: `Cold outreach: ${input.coldOutreachSummary}`,
    liveSync: input.liveSyncSummary ? `Live sync: ${input.liveSyncSummary}` : undefined,
    clientNeeds:
      input.openClientNeedCount > 0
        ? `Klientske poziadavky: ${input.openClientNeedCount} otvorenych.`
        : "Klientske poziadavky: ziadne otvorene.",
    preparedReplies:
      input.preparedReplyCount > 0
        ? `Pripravene odpovede: ${input.preparedReplyCount} caka na schvalenie.`
        : "Pripravene odpovede: nic necaka na schvalenie.",
    nextAction: `Najblizsi krok: ${nextAction}`,
  };
  const speechText = [
    "Jarvis briefing.",
    sections.readiness,
    sections.readinessAttention,
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
    .map((item) => `${item.key}: ${item.title}`)
    .join("; ");
  return `Production attention queue: ${queue.length} item(s). ${topItems}.`;
}
