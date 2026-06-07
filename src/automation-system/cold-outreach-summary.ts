import type { ColdOutreachBrief, ColdOutreachMetrics } from "./types.js";

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function skPreparedReplies(count: number): string {
  if (count === 1) return "1 odpoveď";
  if (count > 1 && count < 5) return `${count} odpovede`;
  return `${count} odpovedí`;
}

export function buildColdOutreachBrief(input: ColdOutreachMetrics): ColdOutreachBrief {
  const openRate = rate(input.opened, input.contacted);
  const replyRate = rate(input.replied, input.contacted);
  const positiveReplyRate = rate(input.positiveReplies, input.replied);

  const summaryParts = [
    `Za ${input.periodLabel} sme napísali ${input.contacted} ľuďom.`,
    `${openRate}% si email otvorilo, ${input.replied} ľudí odpísalo, z toho ${input.positiveReplies} pozitívne.`,
  ];

  if (input.preparedPositiveReplyCount > 0) {
    summaryParts.push(
      `Pripravil som ti ${skPreparedReplies(input.preparedPositiveReplyCount)} na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.`
    );
  }

  if (input.notableSignals?.length) {
    summaryParts.push(`Dôležité signály: ${input.notableSignals.join("; ")}.`);
  }

  return {
    summary: summaryParts.join(" "),
    approvalPrompt:
      input.pendingApprovalCount > 0
        ? `Čaká ${input.pendingApprovalCount} odpovedí na schválenie. Môžem ich pripraviť na odoslanie.`
        : null,
    metrics: {
      openRate,
      replyRate,
      positiveReplyRate,
    },
  };
}
