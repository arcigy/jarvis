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
