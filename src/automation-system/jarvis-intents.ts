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
    };

export function answerJarvisIntent(intent: JarvisIntent): string {
  if (intent.kind === "cold_outreach_status") {
    const brief = buildColdOutreachBrief(intent.metrics);
    return brief.approvalPrompt ? `${brief.summary} ${brief.approvalPrompt}` : brief.summary;
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
