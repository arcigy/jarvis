import type { OperatorBriefing } from "./operator-briefing.ts";

export type ProactiveAttentionUrgency = "clear" | "watch" | "attention" | "critical";

export type ProactiveAttentionDigest = {
  mode: "arcigy-jarvis-proactive-attention-digest";
  status: "ready";
  generatedAt: string;
  urgency: ProactiveAttentionUrgency;
  summary: string;
  speechText: string;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    severity: Exclude<ProactiveAttentionUrgency, "clear">;
  }>;
  recommendedActions: string[];
  briefing: OperatorBriefing;
  secretPolicy: string;
};

export function buildProactiveAttentionDigest(input: { briefing: OperatorBriefing; generatedAt?: string }): ProactiveAttentionDigest {
  const notifications = buildNotifications(input.briefing);
  const urgency = chooseUrgency(notifications);
  const recommendedActions = buildRecommendedActions(input.briefing, notifications);
  const summary =
    urgency === "clear"
      ? "Jarvis attention digest je cisty. Ziadne nove klientske poziadavky ani pripravene odpovede necakaju."
      : `Jarvis attention digest nasiel ${notifications.length} signal(y), ktore si mas vsimnut.`;
  return {
    mode: "arcigy-jarvis-proactive-attention-digest",
    status: "ready",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    urgency,
    summary,
    speechText: buildSpeechText(urgency, summary, notifications, recommendedActions),
    notifications,
    recommendedActions,
    briefing: input.briefing,
    secretPolicy: "Secret-safe: digest only returns briefing summaries, counts, client/lead labels, and approval-safe next actions; it never returns API keys, OAuth tokens, bearer tokens, or database URLs.",
  };
}

function buildNotifications(briefing: OperatorBriefing): ProactiveAttentionDigest["notifications"] {
  const sections = briefing.sections ?? {};
  const items: ProactiveAttentionDigest["notifications"] = [];
  const readiness = String(sections.readiness ?? "");
  if (/Readiness:\s*blocked/i.test(readiness)) {
    items.push({ id: "production-blocker", title: "Production blocker", detail: compact(`${readiness} ${sections.readinessAttention ?? ""}`), severity: "critical" });
  } else if (/Readiness:\s*attention/i.test(readiness) || sections.readinessAttention) {
    items.push({ id: "production-attention", title: "Production attention", detail: compact(`${readiness} ${sections.readinessAttention ?? ""}`), severity: "attention" });
  }
  const clientNeedCount = extractCount(sections.clientNeeds);
  if (clientNeedCount > 0) {
    items.push({ id: "client-needs", title: "Klientske poziadavky", detail: sections.clientNeeds, severity: "attention" });
  }
  const preparedReplyCount = extractCount(sections.preparedReplies);
  if (preparedReplyCount > 0) {
    items.push({ id: "prepared-replies", title: "Odpovede na schvalenie", detail: sections.preparedReplies, severity: "watch" });
  }
  return items;
}

function chooseUrgency(notifications: ProactiveAttentionDigest["notifications"]): ProactiveAttentionUrgency {
  if (notifications.some((item) => item.severity === "critical")) return "critical";
  if (notifications.some((item) => item.severity === "attention")) return "attention";
  if (notifications.length) return "watch";
  return "clear";
}

function buildRecommendedActions(briefing: OperatorBriefing, notifications: ProactiveAttentionDigest["notifications"]): string[] {
  const actions = notifications.map((item) => {
    if (item.id === "client-needs") return "Otvor arcigy.get_client_need_alerts a rozhodni, ci poziadavku oznacit ako seen, resolved alebo ignored az po kontrole.";
    if (item.id === "prepared-replies") return "Otvor arcigy.get_approval_queue a posli pripravene odpovede az po explicitnom approval.approved=true.";
    return briefing.sections.nextAction;
  });
  return unique(actions.length ? actions : [briefing.sections.nextAction]);
}

function buildSpeechText(
  urgency: ProactiveAttentionUrgency,
  summary: string,
  notifications: ProactiveAttentionDigest["notifications"],
  recommendedActions: string[]
): string {
  const top = notifications
    .slice(0, 3)
    .map((item) => `${item.title}: ${item.detail}`)
    .join(" ");
  const next = recommendedActions[0] ?? "Ziadny urgentny krok.";
  return [`Jarvis attention digest: ${urgency}.`, summary, top, `Najblizsi krok: ${next}`].filter(Boolean).join(" ");
}

function extractCount(value: string | undefined): number {
  const match = String(value ?? "").match(/:\s*([1-9]\d*)\b/);
  return match ? Number(match[1]) : 0;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}
