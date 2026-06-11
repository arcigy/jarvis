import { buildSmartleadOutreachBrief } from "./smartlead.ts";

export type LeadgenDailyReportInput = {
  periodLabel?: string;
  campaigns?: unknown;
  stuckLeads?: Array<{ website?: string; email?: string; nicheName?: string; decisionMakerName?: string; phone?: string }>;
  settings?: { leadgenActive?: boolean; aiRepliesActive?: boolean };
};

export type LeadgenEveningSummaryInput = {
  periodLabel?: string;
  sentToday?: number;
  repliesToday?: number;
  positiveToday?: number;
  recentReplies?: Array<{ decisionMakerName?: string; companyName?: string; replySentiment?: string; website?: string }>;
};

export type NicheRotationInput = {
  niches: Array<{
    id: string;
    slug?: string;
    name: string;
    keywords?: string[];
    regions: string[];
    currentRegionIndex?: number;
    dailyTarget?: number;
    smartleadCampaignId?: string | null;
    todaySent?: number;
    status?: string;
    tier?: number;
    lastWorkedAt?: string | null;
    createdAt?: string | null;
  }>;
};

export type LeadgenSlackReportPreviewInput = LeadgenDailyReportInput & {
  dateLabel?: string;
  title?: string;
};

export type LeadgenOpsDigestInput = {
  periodLabel?: string;
  campaigns?: unknown;
  stuckLeads?: LeadgenDailyReportInput["stuckLeads"];
  recentReplies?: LeadgenEveningSummaryInput["recentReplies"];
  settings?: LeadgenDailyReportInput["settings"];
  niches?: NicheRotationInput["niches"];
  sentToday?: number;
  repliesToday?: number;
  positiveToday?: number;
  manualReviewLimit?: number;
};

export function buildLeadgenDailyReport(input: LeadgenDailyReportInput) {
  const periodLabel = input.periodLabel ?? "dnes";
  const outreach = buildSmartleadOutreachBrief({
    campaignId: "daily",
    campaignCount: Array.isArray(input.campaigns) ? input.campaigns.length : undefined,
    periodLabel,
    statistics: input.campaigns ?? [],
  });
  const stuckLeads = input.stuckLeads ?? [];
  const stuckPreview = stuckLeads.slice(0, 15).map((lead) => ({
    website: lead.website,
    email: lead.email,
    nicheName: lead.nicheName,
    decisionMakerName: lead.decisionMakerName,
    phone: lead.phone,
  }));
  const leadgenState = input.settings?.leadgenActive === false ? "paused" : "active";
  const aiReplyState = input.settings?.aiRepliesActive === false ? "paused" : "active";
  const summary = [
    `Denny leadgen report za ${periodLabel}.`,
    outreach.summary,
    stuckLeads.length
      ? `Na manualnu kontrolu caka ${stuckLeads.length} leadov.`
      : "Vsetky dodane leady su spracovane alebo pripravene na dalsi krok.",
    `Leadgen je ${leadgenState}, AI replies su ${aiReplyState}.`,
  ].join(" ");
  return {
    mode: "leadgen-daily-report",
    periodLabel,
    summary,
    outreach,
    stuckLeadCount: stuckLeads.length,
    stuckPreview,
    controls: {
      leadgen: leadgenState,
      aiReplies: aiReplyState,
    },
  };
}

export function buildLeadgenSlackReportPreview(input: LeadgenSlackReportPreviewInput) {
  const report = buildLeadgenDailyReport(input);
  const dateLabel = input.dateLabel ?? new Date().toISOString().slice(0, 10);
  const stuck = report.stuckPreview.slice(0, 15);
  const blocks: Array<Record<string, unknown>> = [
    { type: "header", text: { type: "plain_text", text: input.title ?? `Arcigy Daily Report - ${dateLabel}` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Odoslane:* ${report.outreach.metrics.contacted}` },
        { type: "mrkdwn", text: `*Otvorene:* ${report.outreach.metrics.opened}` },
        { type: "mrkdwn", text: `*Odpovede:* ${report.outreach.metrics.replied}` },
        { type: "mrkdwn", text: `*Pozitivne:* ${report.outreach.metrics.positiveReplies}` },
      ],
    },
    { type: "divider" },
    stuck.length
      ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [`*Caka na manualnu kontrolu:* ${report.stuckLeadCount} leadov`, ...stuck.map((lead) => `- ${lead.website ?? lead.email ?? "bez kontaktu"} (${lead.nicheName ?? "bez niche"})`)].join("\n"),
          },
        }
      : { type: "section", text: { type: "mrkdwn", text: "*Vsetky leady su spracovane alebo pripravene na dalsi krok.*" } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: report.controls.leadgen === "active" ? "Pause Leadgen" : "Resume Leadgen" },
          style: report.controls.leadgen === "active" ? "danger" : "primary",
          action_id: "toggle_leadgen",
        },
        {
          type: "button",
          text: { type: "plain_text", text: report.controls.aiReplies === "active" ? "Pause AI Replies" : "Resume AI Replies" },
          style: report.controls.aiReplies === "active" ? "danger" : "primary",
          action_id: "toggle_ai_replies",
        },
      ],
    },
  ];
  return {
    mode: "leadgen-slack-report-preview",
    text: "Arcigy Daily Report",
    blocks,
    controls: report.controls,
    nextToolCalls: [
      {
        tool: "arcigy.send_slack_message",
        payload: { text: "Arcigy Daily Report", blocks },
        reason: "Po kontrole preview odoslat leadgen report do Slacku.",
        approvalRequired: true,
      },
    ],
    summary: `Slack preview pripraveny: ${report.outreach.metrics.contacted} odoslanych, ${report.stuckLeadCount} stuck leadov. Ziadne odoslanie neprebehlo.`,
  };
}

export function buildLeadgenEveningSummary(input: LeadgenEveningSummaryInput) {
  const periodLabel = input.periodLabel ?? "poslednych 24 hodin";
  const sentToday = safeNumber(input.sentToday);
  const repliesToday = safeNumber(input.repliesToday);
  const positiveToday = safeNumber(input.positiveToday);
  const positiveRate = repliesToday > 0 ? Math.round((positiveToday / repliesToday) * 1000) / 10 : 0;
  const recentReplies = (input.recentReplies ?? []).slice(0, 10).map((reply) => ({
    decisionMakerName: reply.decisionMakerName,
    companyName: reply.companyName,
    replySentiment: reply.replySentiment ?? "bez kategorie",
    website: reply.website,
  }));
  const summary = [
    `Vecerny prehlad za ${periodLabel}: odoslane ${sentToday}, odpovede ${repliesToday}, pozitivne ${positiveToday}.`,
    `${positiveRate}% odpovedi je pozitivnych.`,
    recentReplies.length ? `Dnes odpisalo ${recentReplies.length} kontaktov; prve reakcie su pripravene v zozname.` : "Dnes zatial nie su nove odpovede.",
  ].join(" ");
  return {
    mode: "leadgen-evening-summary",
    periodLabel,
    summary,
    metrics: { sentToday, repliesToday, positiveToday, positiveRate },
    recentReplies,
  };
}

export function buildLeadgenOpsDigest(input: LeadgenOpsDigestInput) {
  const periodLabel = input.periodLabel ?? "dnes";
  const daily = buildLeadgenDailyReport({
    periodLabel,
    campaigns: input.campaigns,
    stuckLeads: input.stuckLeads,
    settings: input.settings,
  });
  const evening = buildLeadgenEveningSummary({
    periodLabel,
    sentToday: input.sentToday ?? daily.outreach.metrics.contacted,
    repliesToday: input.repliesToday ?? daily.outreach.metrics.replied,
    positiveToday: input.positiveToday ?? daily.outreach.metrics.positiveReplies ?? 0,
    recentReplies: input.recentReplies,
  });
  const nichePreview = input.niches?.length ? selectNextNiche({ niches: input.niches }) : null;
  const nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string }> = [];
  if (nichePreview?.selected && daily.controls.leadgen === "active") {
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_runbook",
      payload: {
        niche: {
          id: nichePreview.selected.id,
          slug: nichePreview.selected.slug ?? nichePreview.selected.name,
          name: nichePreview.selected.name,
          keywords: nichePreview.selected.keywords,
          region: nichePreview.selected.activeRegion,
          campaignId: nichePreview.selected.smartleadCampaignId,
        },
        dailyLimit: nichePreview.selected.dailyTarget,
      },
      reason: "Leadgen je aktivny a existuje dalsi niche/region.",
    });
  }
  if (daily.stuckLeadCount > 0) {
    nextToolCalls.push({
      tool: "arcigy.preview_manual_review_pickup",
      payload: { leads: daily.stuckPreview.slice(0, input.manualReviewLimit ?? 15), includeUnreviewed: true, minScore: 50 },
      reason: "Stuck leady treba skontrolovat alebo opravit pred Smartlead importom.",
    });
  }
  if (evening.metrics.positiveToday > 0 || evening.recentReplies.length > 0) {
    nextToolCalls.push({
      tool: "arcigy.get_approval_queue",
      payload: { limit: 20 },
      reason: "Skontroluj pripravene odpovede a klientske poziadavky pred odoslanim.",
    });
  }
  return {
    mode: "leadgen-ops-digest",
    periodLabel,
    status: {
      leadgen: daily.controls.leadgen,
      aiReplies: daily.controls.aiReplies,
      hasActiveNiche: Boolean(nichePreview?.selected),
      stuckLeadCount: daily.stuckLeadCount,
      positiveReplies: evening.metrics.positiveToday,
    },
    daily,
    evening,
    nichePreview,
    nextToolCalls,
    summary: [
      daily.summary,
      nichePreview?.summary,
      nextToolCalls.length ? `Pripravil som ${nextToolCalls.length} dalsie MCP kroky.` : "Nie je potrebny dalsi automaticky krok.",
    ].filter(Boolean).join(" "),
  };
}

export function selectNextNiche(input: NicheRotationInput) {
  const active = input.niches
    .filter((niche) => (niche.status ?? "active") === "active" && niche.regions.length > 0)
    .sort((a, b) => {
      const lastA = a.lastWorkedAt ? Date.parse(a.lastWorkedAt) : 0;
      const lastB = b.lastWorkedAt ? Date.parse(b.lastWorkedAt) : 0;
      if (lastA !== lastB) return lastA - lastB;
      if ((a.tier ?? 999) !== (b.tier ?? 999)) return (a.tier ?? 999) - (b.tier ?? 999);
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    });
  const selected = active[0] ?? null;
  if (!selected) {
    return {
      mode: "niche-rotation-preview",
      selected: null,
      summary: "Nie je dostupny ziadny aktivny niche s regionmi.",
    };
  }
  const regionIndex = positiveModulo(selected.currentRegionIndex ?? 0, selected.regions.length);
  const activeRegion = selected.regions[regionIndex];
  return {
    mode: "niche-rotation-preview",
    selected: {
      id: selected.id,
      slug: selected.slug,
      name: selected.name,
      keywords: selected.keywords ?? [],
      activeRegion,
      currentRegionIndex: regionIndex,
      nextRegionIndex: positiveModulo(regionIndex + 1, selected.regions.length),
      dailyTarget: selected.dailyTarget ?? 0,
      todaySent: selected.todaySent ?? 0,
      smartleadCampaignId: selected.smartleadCampaignId ?? null,
    },
    summary: `Dalsi niche: ${selected.name}, region ${activeRegion}. Denny ciel ${selected.dailyTarget ?? 0}, dnes odoslane ${selected.todaySent ?? 0}.`,
  };
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positiveModulo(value: number, size: number): number {
  if (size <= 0) return 0;
  return ((Math.floor(value) % size) + size) % size;
}
