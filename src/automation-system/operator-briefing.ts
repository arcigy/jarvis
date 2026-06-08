export type OperatorBriefingInput = {
  readinessStatus: string;
  readinessSummary: string;
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
    coldOutreach: string;
    liveSync?: string;
    clientNeeds: string;
    preparedReplies: string;
    nextAction: string;
  };
};

export function buildOperatorBriefing(input: OperatorBriefingInput): OperatorBriefing {
  const nextAction = input.nextActions[0] ?? "Ziadny urgentny krok.";
  const sections = {
    readiness: `Readiness: ${input.readinessStatus}. ${input.readinessSummary}`,
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
