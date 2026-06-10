import { redactSensitiveText, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { discoverLeads, type NormalizedLead } from "./lead-discovery.ts";
import { buildSmartleadLead, type SmartleadLead } from "./smartlead.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";
import type { RuntimeEnv } from "./env.ts";

export type ScrapedWebsiteContacts = {
  url: string;
  finalUrl: string;
  title: string;
  description?: string;
  textPreview: string;
  emails: string[];
  phones: string[];
  internalLinks: string[];
  fetchedAt: string;
};

export type LeadIntroInput = {
  companyName: string;
  website?: string;
  context?: string;
  offer?: string;
  language?: "sk" | "en";
};

export type LeadIntroDraft = LeadIntroInput & {
  personalizedIntro: string;
  model: string;
};

export type PreparedSmartleadLeadInput = {
  email: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  website?: string;
  phone?: string;
  source?: string;
  personalizedIntro?: string;
  customFields?: Record<string, string | number | boolean | null | undefined>;
};

export type LeadCandidateInput = Partial<PreparedSmartleadLeadInput> & { email?: string };

export type LeadQualityInput = {
  email?: string;
  companyName?: string;
  website?: string;
  decisionMaker?: string;
  ico?: string;
  registerVerified?: boolean;
  personalizedIntro?: string;
  verificationStatus?: "ok" | "flagged" | "failed";
};

export type NicheLeadgenPlan = {
  niche: string;
  region?: string;
  mapsQueries: string[];
  serperQueries: string[];
  blacklistKeywords: string[];
  notes: string[];
};

export type SlovakRegisterLookup = {
  query: { ico?: string; companyName?: string };
  found: boolean;
  companyName?: string;
  ico?: string;
  address?: string;
  executives: string[];
  sourceUrl?: string;
  source: "orsr_ico" | "orsr_name" | "not_found";
  fetchedAt: string;
};

export type LeadCsvRow = LeadCandidateInput & {
  raw: Record<string, string>;
};

export type ManualReviewItem = {
  lead: LeadCandidateInput;
  score: number;
  reasons: string[];
  reviewReasons: string[];
  recommendation: "ready_for_import" | "manual_review" | "reject";
};

export type ManualReviewPickupLead = LeadCandidateInput & {
  id?: string | number;
  nicheId?: string;
  nicheSlug?: string;
  nicheName?: string;
  manuallyReviewed?: boolean;
  sentToSmartlead?: boolean;
  decisionMakerName?: string;
  officialCompanyName?: string;
  companyNameShort?: string;
  icebreakerSentence?: string;
  verificationStatus?: "ok" | "flagged" | "failed";
  manually_reviewed?: boolean;
  sent_to_smartlead?: boolean;
  decision_maker_name?: string;
  niche_id?: string;
  niche_slug?: string;
  niche_name?: string;
  official_company_name?: string;
  company_name_short?: string;
  icebreaker_sentence?: string;
  verification_status?: "ok" | "flagged" | "failed";
};

export type ManualReviewPickupPlan = {
  mode: "manual-review-pickup-preview";
  summary: string;
  totals: {
    input: number;
    eligible: number;
    qualified: number;
    rejected: number;
    groups: number;
    preparedSmartleadLeads: number;
  };
  groups: Array<{
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    leads: ManualReviewPickupLead[];
    prepared: ReturnType<typeof prepareSmartleadLeads>;
    injectionPlan: SmartleadInjectionPlan;
  }>;
  rejected: Array<{ lead: ManualReviewPickupLead; reason: string }>;
};

export type SmartleadInjectionPlan = {
  mode: "smartlead-injection-plan";
  campaignName: string;
  niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  totals: { input: number; prepared: number; skipped: number; batches: number };
  batches: Array<{ index: number; size: number; leads: SmartleadLead[] }>;
  skipped: Array<{ email?: string; reason: string }>;
  addLeadsApprovalPayload?: {
    campaignId: string | number;
    leads: SmartleadLead[];
    settings: { ignore_global_block_list: boolean; ignore_unsubscribe_list: boolean };
    approval: { approved: true };
  };
  summary: string;
};

export type NicheSmartleadCampaignSetupDraft = {
  mode: "niche-smartlead-campaign-setup-draft";
  campaignName: string;
  niche: { id?: string; slug: string; name: string };
  sequences: ReturnType<typeof draftSmartleadCampaignSequence>["sequences"];
  schedule: {
    timezone: string;
    start_hour: string;
    end_hour: string;
    days_of_the_week: number[];
    max_new_leads_per_day: number;
    min_time_btw_emails: number;
    schedule_start_time: string | null;
  };
  settings: { trackOpen: boolean; stopOnReply: boolean; followUpPercentage: number };
  webhook: { url: string; name: string; eventTypes: string[] };
  createCampaignApprovalPayload: {
    name: string;
    clientId?: string | number | null;
    sequences: ReturnType<typeof draftSmartleadCampaignSequence>["sequences"];
    emailAccountIds?: Array<string | number>;
    schedule: NicheSmartleadCampaignSetupDraft["schedule"];
    settings: NicheSmartleadCampaignSetupDraft["settings"];
    webhook: NicheSmartleadCampaignSetupDraft["webhook"];
    approval: { approved: true };
  };
  summary: string;
};

const genericEmailPrefixes = new Set(["info", "kontakt", "contact", "office", "admin", "sales", "hello", "support", "recepcia"]);

const nicheTemplates: Record<string, Omit<NicheLeadgenPlan, "niche" | "region" | "notes">> = {
  stavebniny: {
    mapsQueries: ["stavebniny", "stavebny material", "stavebny sklad", "predaj tehal"],
    serperQueries: ["predaj stavebneho materialu", "stavebny sklad staviva", "stavebniny SK"],
    blacklistKeywords: ["baumax", "obi", "hornbach", "hobby", "bauhaus", "jysk"],
  },
  realitky: {
    mapsQueries: ["realitna kancelaria", "nehnutelnosti", "reality", "realitna agentura"],
    serperQueries: ["kupa predaj nehnutelnosti", "realitna kancelaria Slovakia", "predaj bytov"],
    blacklistKeywords: ["bazos", "nehnutelnosti.sk", "reality.sk", "topreality", "sreality"],
  },
  autoservisy: {
    mapsQueries: ["autoservis", "autoopravovna", "servis aut", "pneuservis", "car service"],
    serperQueries: ["oprava aut servis", "autoopravovna pneuservis", "lakovacie stredisko"],
    blacklistKeywords: ["autobazar", "autohaus", "skoda auto", "volkswagen dealership"],
  },
  "dom-na-kluc": {
    mapsQueries: ["dom na kluc", "stavba domu na kluc", "rodinne domy na kluc", "montovany dom na kluc", "drevodomy na kluc"],
    serperQueries: ['"dom na kluc" stavba', '"stavba domu na kluc" kontakt', '"rodinne domy na kluc" firma'],
    blacklistKeywords: ["topreality", "nehnutelnosti", "bazos", "wikipedia", "openstreetmap", "booking", "tripadvisor"],
  },
  uctovnici: {
    mapsQueries: ["uctovnik", "uctovnictvo", "danovy poradca", "mzdova agenda"],
    serperQueries: ["externe uctovnictvo firma SK", "danovy poradca mzdova agenda"],
    blacklistKeywords: [],
  },
  "tepelne-cerpadla": {
    mapsQueries: ["montaz tepelnych cerpadiel", "tepelne cerpadla", "kurenie a chladenie", "plynoinstalacia kurenie"],
    serperQueries: ["montaz tepelneho cerpadla firma SK", "tepelne cerpadla a solarne systemy", "predaj montaz tepelnych cerpadiel"],
    blacklistKeywords: ["bazos", "heureka", "alza", "mall"],
  },
};

export async function scrapeWebsiteContacts(
  input: { url: string; includePriorityPages?: boolean; maxPages?: number },
  fetchImpl: FetchLike = fetch
): Promise<ScrapedWebsiteContacts> {
  const startUrl = normalizeHttpUrl(input.url);
  const first = await fetchHtmlPage(startUrl, fetchImpl);
  const pages = [first];
  if (input.includePriorityPages !== false) {
    const priorityLinks = first.internalLinks.filter(isPriorityLink).slice(0, Math.max(0, (input.maxPages ?? 4) - 1));
    for (const link of priorityLinks) {
      const page = await fetchHtmlPage(link, fetchImpl).catch(() => null);
      if (page) pages.push(page);
    }
  }

  const combinedText = pages.map((page) => page.textPreview).join(" ");
  const combinedHtml = pages.map((page) => page.rawHtml).join("\n");
  const emails = unique([...extractEmails(combinedHtml), ...extractEmails(combinedText)]).slice(0, 20);
  const phones = unique(extractPhones(combinedText)).slice(0, 10);
  return {
    url: startUrl,
    finalUrl: first.finalUrl,
    title: first.title,
    description: first.description,
    textPreview: redactSensitiveText(combinedText).slice(0, 4000),
    emails,
    phones,
    internalLinks: unique(pages.flatMap((page) => page.internalLinks)).slice(0, 30),
    fetchedAt: new Date().toISOString(),
  };
}

export async function draftLeadIntro(
  input: LeadIntroInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<LeadIntroDraft> {
  const language = input.language ?? "sk";
  const offer = input.offer ?? "Arcigy automatizacie, leadgen, AI asistenti a systemy pre obchodny rast";
  const result = await generateGeminiText(
    {
      systemInstruction:
        "Si Arcigy Jarvis. Pises kratke cold outreach intra pre B2B leady. Nehovor, ze si nieco uz odoslal. Nevymyslaj neoverene tvrdenia. Vrat jednu vetu, maximalne 220 znakov.",
      prompt: [
        `Jazyk: ${language}.`,
        `Firma: ${safeAiPromptPart(input.companyName)}.`,
        input.website ? `Web: ${safeAiPromptPart(input.website)}.` : null,
        `Ponuka: ${safeAiPromptPart(offer)}.`,
        input.context ? `Overeny kontext z webu alebo lead zdroja:\n${safeUntrustedAiPromptPart(input.context, "lead context")}` : null,
        "Vytvor personalizovane intro pre prvy cold email. Bez markdownu, bez pozdravu, bez podpisu.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.35,
    },
    env,
    fetchImpl
  );
  return {
    ...input,
    personalizedIntro: result.text.replace(/\s+/g, " ").trim(),
    model: result.model,
  };
}

export function prepareSmartleadLeads(input: {
  leads: PreparedSmartleadLeadInput[];
  defaultSource?: string;
}): { leadList: SmartleadLead[]; skipped: Array<{ email?: string; reason: string }> } {
  const skipped: Array<{ email?: string; reason: string }> = [];
  const leadList = input.leads.flatMap((lead) => {
    const email = lead.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      skipped.push({ email: lead.email, reason: "missing or invalid email" });
      return [];
    }
    return [
      buildSmartleadLead({
        email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        companyName: lead.companyName,
        website: lead.website,
        customFields: {
          phone: lead.phone,
          source: lead.source ?? input.defaultSource,
          personalized_intro: lead.personalizedIntro,
          ...lead.customFields,
        },
      }),
    ];
  });
  return { leadList: dedupeSmartleadLeads(leadList), skipped };
}

export function parseLeadsCsv(input: { csvText: string; delimiter?: "," | ";"; maxRows?: number }): {
  headers: string[];
  leads: LeadCsvRow[];
  skipped: Array<{ rowNumber: number; reason: string }>;
} {
  const rows = parseCsv(input.csvText, input.delimiter);
  if (!rows.length) return { headers: [], leads: [], skipped: [{ rowNumber: 0, reason: "empty csv" }] };
  const headers = rows[0].map((header) => header.trim());
  const maxRows = Math.min(Math.max(Math.trunc(input.maxRows ?? 1000), 1), 10_000);
  const skipped: Array<{ rowNumber: number; reason: string }> = [];
  const leads = rows.slice(1, maxRows + 1).flatMap((row, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex]?.trim() ?? ""]));
    if (Object.values(raw).every((value) => !value)) {
      skipped.push({ rowNumber: index + 2, reason: "empty row" });
      return [];
    }
    return [mapCsvLead(raw)];
  });
  return { headers, leads, skipped };
}

export function serializeLeadsCsv(input: { leads: LeadCandidateInput[]; columns?: string[] }): {
  csvText: string;
  columns: string[];
  rowCount: number;
} {
  const columns = input.columns?.length
    ? input.columns
    : ["companyName", "email", "firstName", "lastName", "website", "phone", "source", "personalizedIntro"];
  const lines = [
    columns.map(csvEscape).join(","),
    ...input.leads.map((lead) => columns.map((column) => csvEscape(readLeadColumn(lead, column))).join(",")),
  ];
  return { csvText: lines.join("\n"), columns, rowCount: input.leads.length };
}

export function filterBlacklistedLeads(input: {
  leads: LeadCandidateInput[];
  domains?: string[];
  keywords?: string[];
}): {
  allowed: LeadCandidateInput[];
  blocked: Array<{ lead: LeadCandidateInput; reason: string }>;
} {
  const domains = new Set((input.domains ?? []).map(normalizeDomain).filter(Boolean));
  const keywords = (input.keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  const allowed: LeadCandidateInput[] = [];
  const blocked: Array<{ lead: LeadCandidateInput; reason: string }> = [];
  for (const lead of input.leads) {
    const domain = normalizeDomain(lead.website || lead.email?.split("@")[1] || "");
    const haystack = [lead.companyName, lead.website, lead.email, lead.source].filter(Boolean).join(" ").toLowerCase();
    if (domain && domains.has(domain)) {
      blocked.push({ lead, reason: `blacklisted domain: ${domain}` });
      continue;
    }
    const keyword = keywords.find((item) => haystack.includes(item));
    if (keyword) {
      blocked.push({ lead, reason: `blacklisted keyword: ${keyword}` });
      continue;
    }
    allowed.push(lead);
  }
  return { allowed, blocked };
}

export function buildManualReviewQueue(input: { leads: LeadCandidateInput[]; minScore?: number }): {
  ready: ManualReviewItem[];
  review: ManualReviewItem[];
  rejected: ManualReviewItem[];
  summary: { ready: number; review: number; rejected: number; total: number };
} {
  const minScore = Math.min(Math.max(Math.trunc(input.minScore ?? 70), 0), 100);
  const items = input.leads.map((lead): ManualReviewItem => {
    const scoringInput: LeadQualityInput = {
      email: lead.email,
      companyName: lead.companyName,
      website: lead.website,
      decisionMaker: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
      personalizedIntro: lead.personalizedIntro,
    };
    const { score, reasons } = scoreSingleLead(scoringInput);
    const reviewReasons = manualReviewReasons(lead, score, minScore);
    const recommendation: ManualReviewItem["recommendation"] = !lead.email || lead.email && !lead.email.includes("@")
      ? "reject"
      : reviewReasons.length
        ? "manual_review"
        : "ready_for_import";
    return { lead, score, reasons, reviewReasons, recommendation };
  });
  const ready = items.filter((item) => item.recommendation === "ready_for_import");
  const review = items.filter((item) => item.recommendation === "manual_review");
  const rejected = items.filter((item) => item.recommendation === "reject");
  return { ready, review, rejected, summary: { ready: ready.length, review: review.length, rejected: rejected.length, total: items.length } };
}

export function scoreLeadQuality(input: { leads: LeadQualityInput[]; minScore?: number }): {
  minScore: number;
  averageScore: number;
  passed: number;
  failed: number;
  scoredLeads: Array<LeadQualityInput & { score: number; passed: boolean; reasons: string[] }>;
  buckets: Record<string, number>;
} {
  const minScore = Math.min(Math.max(Math.trunc(input.minScore ?? 50), 0), 100);
  const scoredLeads = input.leads.map((lead) => {
    const { score, reasons } = scoreSingleLead(lead);
    return { ...lead, score, passed: score >= minScore, reasons };
  });
  const total = scoredLeads.reduce((sum, lead) => sum + lead.score, 0);
  return {
    minScore,
    averageScore: scoredLeads.length ? Math.round(total / scoredLeads.length) : 0,
    passed: scoredLeads.filter((lead) => lead.passed).length,
    failed: scoredLeads.filter((lead) => !lead.passed).length,
    scoredLeads,
    buckets: buildScoreBuckets(scoredLeads.map((lead) => lead.score)),
  };
}

export function dedupeLeadCandidates(input: { leads: LeadCandidateInput[] }): {
  unique: LeadCandidateInput[];
  duplicates: Array<{ lead: LeadCandidateInput; duplicateOf: string; reason: string }>;
} {
  const seen = new Map<string, string>();
  const uniqueLeads: LeadCandidateInput[] = [];
  const duplicates: Array<{ lead: LeadCandidateInput; duplicateOf: string; reason: string }> = [];
  for (const lead of input.leads) {
    const key = leadIdentityKey(lead);
    if (!key) {
      uniqueLeads.push(lead);
      continue;
    }
    const existing = seen.get(key.value);
    if (existing) {
      duplicates.push({ lead, duplicateOf: existing, reason: key.reason });
      continue;
    }
    seen.set(key.value, lead.email || lead.companyName || lead.website || key.value);
    uniqueLeads.push(lead);
  }
  return { unique: uniqueLeads, duplicates };
}

export function buildNicheLeadgenPlan(input: { niche: string; region?: string; customKeywords?: string[] }): NicheLeadgenPlan {
  const slug = slugify(input.niche);
  const template = nicheTemplates[slug] ?? {
    mapsQueries: [input.niche],
    serperQueries: [`${input.niche} kontakt`, `${input.niche} firma`],
    blacklistKeywords: [],
  };
  const suffix = input.region ? ` ${input.region}` : "";
  return {
    niche: slug,
    region: input.region,
    mapsQueries: unique([...template.mapsQueries, ...(input.customKeywords ?? [])].map((query) => `${query}${suffix}`.trim())),
    serperQueries: unique([...template.serperQueries, ...(input.customKeywords ?? []).map((keyword) => `${keyword} kontakt`)].map((query) => `${query}${suffix}`.trim())),
    blacklistKeywords: template.blacklistKeywords,
    notes: [
      "Run discovery first, then scrape_website_contacts only for selected leads.",
      "Use score_lead_quality before Smartlead upload.",
      "Upload to Smartlead only after prepare_smartlead_leads and explicit approval.",
    ],
  };
}

export function draftSmartleadCampaignSequence(input: {
  niche: string;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
}): {
  sequences: Array<{
    seq_number: number;
    seq_delay_details: { delay_in_days: number };
    seq_variants: Array<{ variant_label: string; subject: string; email_body: string }>;
  }>;
  requiredVariables: string[];
  warnings: string[];
} {
  const niche = input.niche.trim() || "firmy";
  const offer = input.offer?.trim() || "AI automatizacie a obchodne systemy";
  const pain = input.painPoint?.trim() || "manualna administrativa a pomala reakcia na dopyty";
  const language = input.language ?? "sk";
  const isEnglish = language === "en";
  const firstSubjectA = isEnglish ? "Quick thought about {{company_name}}" : "Len taka uvaha nad {{company_name}}";
  const firstSubjectB = isEnglish ? "Question for {{company_name}}" : "Otazka k {{company_name}}";
  const bodyA = isEnglish
    ? `<p>{{personalized_intro}}</p><p>I help ${escapeHtml(niche)} reduce ${escapeHtml(pain)} with ${escapeHtml(offer)}.</p><p>Would it make sense to send one concrete idea for {{company_name}}?</p><p>%signature%</p>`
    : `<p>{{personalized_intro}}</p><p>Pre ${escapeHtml(niche)} riesime ${escapeHtml(pain)} cez ${escapeHtml(offer)}.</p><p>Dava zmysel, aby som poslal jednu konkretnu myslienku pre {{company_name}}?</p><p>%signature%</p>`;
  const bodyB = isEnglish
    ? `<p>{{personalized_intro}}</p><p>Are you already solving ${escapeHtml(pain)}, or is it still handled manually?</p><p>%signature%</p>`
    : `<p>{{personalized_intro}}</p><p>Riesite uz ${escapeHtml(pain)}, alebo to este ide rucne?</p><p>%signature%</p>`;
  const followup = isEnglish
    ? `<p>Just checking if this is relevant for {{company_name}}.</p><p>If yes, I can send a short proposal. If not, no problem.</p><p>%signature%</p>`
    : `<p>Len overujem, ci je toto pre {{company_name}} relevantne.</p><p>Ak ano, poslem kratky navrh. Ak nie, v poriadku.</p><p>%signature%</p>`;
  return {
    sequences: [
      {
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        seq_variants: [
          { variant_label: "A", subject: firstSubjectA, email_body: bodyA },
          { variant_label: "B", subject: firstSubjectB, email_body: bodyB },
        ],
      },
      {
        seq_number: 2,
        seq_delay_details: { delay_in_days: 3 },
        seq_variants: [{ variant_label: "A", subject: "", email_body: followup }],
      },
    ],
    requiredVariables: ["{{company_name}}", "{{personalized_intro}}", "%signature%"],
    warnings: ["Follow-up subject is intentionally empty so Smartlead keeps the same thread.", "Review copy before uploading to Smartlead."],
  };
}

export async function enrichSlovakCompanyRegister(
  input: { ico?: string; companyName?: string },
  fetchImpl: FetchLike = fetch
): Promise<SlovakRegisterLookup> {
  const ico = input.ico?.replace(/\s/g, "");
  const companyName = input.companyName?.trim();
  if (!ico && !companyName) throw new Error("ICO or companyName is required.");
  const searchUrl = ico && /^\d{6,8}$/.test(ico)
    ? `https://www.orsr.sk/hladaj_ico.asp?ICO=${encodeURIComponent(ico)}&SID=0`
    : `https://www.orsr.sk/hladaj_subjekt.asp?OBMENO=${encodeURIComponent(companyName ?? "")}&SID=0`;
  const searchHtml = await fetchRegisterHtml(searchUrl, fetchImpl);
  const detailHref = extractFirstRegisterDetailHref(searchHtml);
  if (!detailHref) return notFoundRegisterResult(input);
  const detailUrl = new URL(detailHref, "https://www.orsr.sk/").toString();
  const detailHtml = await fetchRegisterHtml(detailUrl, fetchImpl);
  const parsed = parseSlovakRegisterDetail(detailHtml);
  return {
    query: { ico, companyName },
    found: Boolean(parsed.companyName || parsed.ico || parsed.executives.length),
    companyName: parsed.companyName,
    ico: parsed.ico || ico,
    address: parsed.address,
    executives: parsed.executives,
    sourceUrl: detailUrl,
    source: ico ? "orsr_ico" : "orsr_name",
    fetchedAt: new Date().toISOString(),
  };
}

export async function runLeadgenResearchPipeline(
  input: {
    query: string;
    placesQuery?: string;
    maxResults?: number;
    scrapeWebsites?: boolean;
    draftIntros?: boolean;
    offer?: string;
    language?: "sk" | "en";
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<{
  leads: Array<NormalizedLead & { scraped?: ScrapedWebsiteContacts; intro?: LeadIntroDraft; smartlead?: SmartleadLead }>;
  sources: string[];
  providerStatus: unknown[];
  preparedSmartleadCount: number;
}> {
  const discovered = await discoverLeads({ query: input.query, placesQuery: input.placesQuery, maxResults: input.maxResults ?? 10 }, env, fetchImpl);
  const enriched = [];
  for (const lead of discovered.leads) {
    const scraped = input.scrapeWebsites !== false && lead.website ? await scrapeWebsiteContacts({ url: lead.website }, fetchImpl).catch(() => undefined) : undefined;
    const intro =
      input.draftIntros === true
        ? await draftLeadIntro(
            {
              companyName: lead.name,
              website: lead.website,
              context: scraped?.textPreview ?? [lead.address, lead.phone].filter(Boolean).join(" "),
              offer: input.offer,
              language: input.language,
            },
            env,
            fetchImpl
          ).catch(() => undefined)
        : undefined;
    const firstEmail = scraped?.emails[0];
    enriched.push({
      ...lead,
      scraped,
      intro,
      smartlead: firstEmail
        ? buildSmartleadLead({
            email: firstEmail,
            companyName: lead.name,
            website: lead.website,
            customFields: {
              phone: lead.phone ?? scraped?.phones[0],
              source: lead.source,
              personalized_intro: intro?.personalizedIntro,
            },
          })
        : undefined,
    });
  }
  return {
    leads: enriched,
    sources: discovered.sources,
    providerStatus: discovered.providerStatus,
    preparedSmartleadCount: enriched.filter((lead) => lead.smartlead).length,
  };
}

export function buildManualReviewPickupPlan(input: {
  leads: ManualReviewPickupLead[];
  includeUnreviewed?: boolean;
  minScore?: number;
  batchSize?: number;
}): ManualReviewPickupPlan {
  const includeUnreviewed = input.includeUnreviewed === true;
  const eligible = input.leads.filter((lead) => {
    const manuallyReviewed = booleanField(lead, "manuallyReviewed", "manually_reviewed");
    const sentToSmartlead = booleanField(lead, "sentToSmartlead", "sent_to_smartlead");
    return (includeUnreviewed || manuallyReviewed === true) && sentToSmartlead !== true;
  });
  const rejected: ManualReviewPickupPlan["rejected"] = [];
  const qualified = eligible.filter((lead) => {
    const email = stringField(lead, "email");
    const decisionMaker = decisionMakerForLead(lead);
    const phone = stringField(lead, "phone");
    const score = scoreSingleLead({
      email,
      companyName: companyNameForLead(lead),
      website: stringField(lead, "website"),
      decisionMaker,
      personalizedIntro: stringField(lead, "personalizedIntro", "icebreakerSentence", "icebreaker_sentence"),
      verificationStatus: stringField(lead, "verificationStatus", "verification_status") as LeadQualityInput["verificationStatus"],
    }).score;
    if (!email || !email.includes("@")) {
      rejected.push({ lead, reason: "missing valid email" });
      return false;
    }
    if (!decisionMaker && !phone) {
      rejected.push({ lead, reason: "missing decision maker or phone" });
      return false;
    }
    if (score < (input.minScore ?? 50)) {
      rejected.push({ lead, reason: `score below ${input.minScore ?? 50}` });
      return false;
    }
    return true;
  });

  const grouped = new Map<string, ManualReviewPickupLead[]>();
  for (const lead of qualified) {
    const slug = stringField(lead, "nicheSlug", "niche_slug") || "default";
    const id = stringField(lead, "nicheId", "niche_id") || slug;
    const key = `${id}:${slug}`;
    grouped.set(key, [...(grouped.get(key) ?? []), lead]);
  }

  const groups = [...grouped.values()].map((leads) => {
    const first = leads[0];
    const niche = {
      id: stringField(first, "nicheId", "niche_id"),
      slug: stringField(first, "nicheSlug", "niche_slug") || "default",
      name: stringField(first, "nicheName", "niche_name") || stringField(first, "nicheSlug", "niche_slug") || "Default",
      campaignId: stringField(first, "smartleadCampaignId", "smartlead_campaign_id") ?? null,
    };
    const injectionPlan = buildSmartleadInjectionPlan({ niche, leads, batchSize: input.batchSize });
    return { niche, leads, prepared: { leadList: injectionPlan.batches.flatMap((batch) => batch.leads), skipped: injectionPlan.skipped }, injectionPlan };
  });

  const preparedSmartleadLeads = groups.reduce((sum, group) => sum + group.injectionPlan.totals.prepared, 0);
  return {
    mode: "manual-review-pickup-preview",
    summary: `Manual review pickup preview: ${preparedSmartleadLeads} leadov pripravenych do ${groups.length} Smartlead skupin. Ziadny zapis ani odoslanie neprebehlo.`,
    totals: {
      input: input.leads.length,
      eligible: eligible.length,
      qualified: qualified.length,
      rejected: rejected.length,
      groups: groups.length,
      preparedSmartleadLeads,
    },
    groups,
    rejected,
  };
}

export function buildSmartleadInjectionPlan(input: {
  niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  leads: ManualReviewPickupLead[];
  batchSize?: number;
}): SmartleadInjectionPlan {
  const prepared = prepareSmartleadLeads({
    defaultSource: `manual-review:${input.niche.slug}`,
    leads: input.leads.map((lead) => ({
      email: stringField(lead, "email") ?? "",
      companyName: companyNameForLead(lead),
      firstName: stringField(lead, "firstName") ?? splitDecisionMaker(lead).firstName,
      lastName: stringField(lead, "lastName") ?? splitDecisionMaker(lead).lastName,
      website: stringField(lead, "website"),
      phone: stringField(lead, "phone"),
      personalizedIntro: stringField(lead, "personalizedIntro", "icebreakerSentence", "icebreaker_sentence"),
      customFields: {
        ico: stringField(lead, "ico"),
        niche_slug: input.niche.slug,
        lead_id: stringField(lead, "id"),
        company_name_short: stringField(lead, "companyNameShort", "company_name_short"),
      },
    })),
  });
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const batches = chunk(prepared.leadList, batchSize).map((leads, index) => ({ index: index + 1, size: leads.length, leads }));
  const campaignName = `${input.niche.slug}_SK`;
  const campaignId = input.niche.campaignId ?? undefined;
  return {
    mode: "smartlead-injection-plan",
    campaignName,
    niche: input.niche,
    totals: { input: input.leads.length, prepared: prepared.leadList.length, skipped: prepared.skipped.length, batches: batches.length },
    batches,
    skipped: prepared.skipped,
    addLeadsApprovalPayload: campaignId
      ? {
          campaignId,
          leads: prepared.leadList,
          settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false },
          approval: { approved: true },
        }
      : undefined,
    summary: campaignId
      ? `Injection plan: ${prepared.leadList.length} leadov do kampane ${campaignId} v ${batches.length} batchoch. Odoslanie vyzaduje schvaleny add_leads payload.`
      : `Injection plan: ${prepared.leadList.length} leadov pre novu kampan ${campaignName}. Najprv vytvor alebo prirad Smartlead campaignId.`,
  };
}

export function draftNicheSmartleadCampaignSetup(input: {
  niche: { id?: string; slug: string; name: string };
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  schedule?: {
    timezone?: string;
    start_hour?: string;
    end_hour?: string;
    days_of_the_week?: number[];
    max_new_leads_per_day?: number;
    min_time_btw_emails?: number;
    schedule_start_time?: string | null;
  };
  settings?: { trackOpen?: boolean; stopOnReply?: boolean; followUpPercentage?: number };
}): NicheSmartleadCampaignSetupDraft {
  const sequenceDraft = draftSmartleadCampaignSequence({
    niche: input.niche.name,
    offer: input.offer,
    painPoint: input.painPoint,
    language: input.language,
  });
  const campaignName = `${input.niche.slug}_SK`;
  const schedule = {
    timezone: input.schedule?.timezone ?? "Europe/Bratislava",
    start_hour: input.schedule?.start_hour ?? "08:00",
    end_hour: input.schedule?.end_hour ?? "18:00",
    days_of_the_week: input.schedule?.days_of_the_week ?? [1, 2, 3, 4, 5],
    max_new_leads_per_day: input.schedule?.max_new_leads_per_day ?? 30,
    min_time_btw_emails: input.schedule?.min_time_btw_emails ?? 15,
    schedule_start_time: input.schedule?.schedule_start_time ?? null,
  };
  const settings = {
    trackOpen: input.settings?.trackOpen ?? false,
    stopOnReply: input.settings?.stopOnReply ?? true,
    followUpPercentage: input.settings?.followUpPercentage ?? 100,
  };
  const webhook = {
    url: input.webhookUrl ?? "https://automation-arcigy.up.railway.app/webhook/smartlead-ai-reply",
    name: "AI Reply Webhook",
    eventTypes: ["LEAD_CATEGORY_UPDATED", "EMAIL_SENT", "EMAIL_OPEN", "EMAIL_LINK_CLICK", "EMAIL_REPLY", "LEAD_UNSUBSCRIBED"],
  };
  return {
    mode: "niche-smartlead-campaign-setup-draft",
    campaignName,
    niche: input.niche,
    sequences: sequenceDraft.sequences,
    schedule,
    settings,
    webhook,
    createCampaignApprovalPayload: {
      name: campaignName,
      clientId: input.clientId ?? null,
      sequences: sequenceDraft.sequences,
      emailAccountIds: input.emailAccountIds,
      schedule,
      settings,
      webhook,
      approval: { approved: true },
    },
    summary: `Smartlead campaign setup draft pre ${input.niche.name}: ${campaignName}. Vytvorenie kampane vyzaduje explicitne schvalenie.`,
  };
}

async function fetchHtmlPage(url: string, fetchImpl: FetchLike) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "Arcigy-Jarvis/1.0 (+https://arcigy.group)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Website fetch failed: ${response.status}`);
  const rawHtml = await response.text();
  const finalUrl = response.url || url;
  const text = htmlToText(rawHtml);
  return {
    finalUrl,
    rawHtml,
    title: extractTag(rawHtml, "title") || new URL(finalUrl).hostname,
    description: extractMetaDescription(rawHtml),
    textPreview: text.slice(0, 6000),
    internalLinks: extractInternalLinks(rawHtml, finalUrl),
  };
}

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("URL is required.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are supported.");
  return url.toString();
}

function extractTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html);
  return decodeHtml(match?.[1] ?? "").trim();
}

function extractMetaDescription(html: string): string | undefined {
  const match = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(html);
  const value = decodeHtml(match?.[1] ?? "").trim();
  return value || undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function extractEmails(text: string): string[] {
  const normalized = decodeHtml(text).replace(/&#64;|&#x40;|\s+\[?at\]?\s+|\s+\(at\)\s+/gi, "@");
  return unique((normalized.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? []).map((email) => email.toLowerCase()))
    .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email))
    .filter((email) => !email.includes("example.") && !email.includes("sentry"));
}

function extractPhones(text: string): string[] {
  return unique(text.match(/(?:\+421|\+420|00421|00420)?\s*(?:\d[\s\-/.]?){8,11}\d/g) ?? [])
    .map((phone) => phone.replace(/\s+/g, " ").trim())
    .filter((phone) => phone.replace(/\D/g, "").length >= 9);
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string" && value.trim()) return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }
  return undefined;
}

function decisionMakerForLead(lead: ManualReviewPickupLead): string | undefined {
  return stringField(lead, "decisionMakerName", "decision_maker_name") ?? ([stringField(lead, "firstName"), stringField(lead, "lastName")].filter(Boolean).join(" ") || undefined);
}

function companyNameForLead(lead: ManualReviewPickupLead): string | undefined {
  return stringField(lead, "companyName", "officialCompanyName", "official_company_name", "companyNameShort", "company_name_short");
}

function splitDecisionMaker(lead: ManualReviewPickupLead): { firstName?: string; lastName?: string } {
  const parts = decisionMakerForLead(lead)?.split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function extractInternalLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)]
    .map((match) => {
      try {
        const url = new URL(decodeHtml(match[1]), base);
        return url.hostname === base.hostname && ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url));
  return unique(links);
}

function isPriorityLink(url: string): boolean {
  return /kontakt|contact|o-nas|about|team|impressum|spolocnost|kto-sme/i.test(url);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchRegisterHtml(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "Arcigy-Jarvis/1.0 (+https://arcigy.group)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Register fetch failed: ${response.status}`);
  const anyResponse = response as Response & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof anyResponse.arrayBuffer === "function") {
    const buffer = await anyResponse.arrayBuffer();
    return new TextDecoder("windows-1250").decode(buffer);
  }
  return response.text();
}

function extractFirstRegisterDetailHref(html: string): string | null {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']*vypis\.asp[^"']*)["'][^>]*>/gi)].map((match) => decodeHtml(match[1]));
  return links[0] ?? null;
}

function parseSlovakRegisterDetail(html: string): { companyName?: string; ico?: string; address?: string; executives: string[] } {
  const text = normalizeRegisterText(htmlToText(html));
  const companyName = extractAfterLabel(text, "Obchodne meno");
  const address = extractAfterLabel(text, "Sidlo");
  const ico = extractAfterLabel(text, "ICO")?.replace(/\D/g, "").slice(0, 8) || text.match(/\b\d{8}\b/)?.[0];
  const executives = extractExecutives(text);
  return { companyName, ico, address, executives };
}

function normalizeRegisterText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAfterLabel(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}:?\\s+(.{2,160}?)(?=\\s+(Obchodne meno|Sidlo|ICO|Den zapisu|Pravna forma|Statutarny organ|Konatelia|Spolocnici):|$)`, "i").exec(text);
  return cleanupRegisterValue(match?.[1]);
}

function extractExecutives(text: string): string[] {
  const section = /(?:Statutarny organ|Konatelia):?\s+(.{2,500}?)(?=\s+(Spolocnici|Dozorna rada|Zakladne imanie|Predmet podnikania):|$)/i.exec(text)?.[1] ?? "";
  const matches = section.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? [];
  return unique(matches.map(cleanupRegisterValue).filter((value): value is string => Boolean(value && !/\b(od|vznik|funkcie)\b/i.test(value)))).slice(0, 5);
}

function cleanupRegisterValue(value?: string): string | undefined {
  const cleaned = value?.replace(/\s*\(od:.*$/i, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function notFoundRegisterResult(input: { ico?: string; companyName?: string }): SlovakRegisterLookup {
  return {
    query: { ico: input.ico?.replace(/\s/g, ""), companyName: input.companyName?.trim() },
    found: false,
    executives: [],
    source: "not_found",
    fetchedAt: new Date().toISOString(),
  };
}

function scoreSingleLead(lead: LeadQualityInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const email = lead.email?.trim().toLowerCase();
  if (email && !isGenericEmail(email)) addScore(30, "personal email");
  if (lead.website) addScore(20, "has website");
  if (lead.website && /\.sk(?:\/|$)/i.test(lead.website)) addScore(10, "sk domain");
  if (lead.decisionMaker) addScore(25, "decision maker");
  if (lead.registerVerified || lead.ico) addScore(15, "register verified");
  if (lead.personalizedIntro) addScore(10, "AI intro");
  if (email && isGenericEmail(email)) addScore(-20, "generic email");
  if (!email) addScore(-10, "missing email");
  if (lead.verificationStatus === "flagged") addScore(-15, "flagged");
  if (lead.verificationStatus === "failed") addScore(-30, "verification failed");
  return { score: Math.min(Math.max(score, 0), 100), reasons };

  function addScore(points: number, reason: string) {
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${points} ${reason}`);
  }
}

function parseCsv(csvText: string, delimiter?: "," | ";"): string[][] {
  const selectedDelimiter = delimiter ?? guessDelimiter(csvText);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === selectedDelimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function guessDelimiter(csvText: string): "," | ";" {
  const firstLine = csvText.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function mapCsvLead(raw: Record<string, string>): LeadCsvRow {
  const value = (...aliases: string[]) => {
    const normalized = new Map(Object.entries(raw).map(([key, item]) => [slugify(key), item]));
    return aliases.map(slugify).map((alias) => normalized.get(alias)).find((item) => item && item.trim())?.trim();
  };
  return {
    raw,
    email: value("email", "primary_email", "mail"),
    companyName: value("companyName", "company_name", "official_company_name", "original_name", "name", "firma"),
    firstName: value("firstName", "first_name", "meno"),
    lastName: value("lastName", "last_name", "priezvisko", "decision_maker_last_name"),
    website: value("website", "web", "url"),
    phone: value("phone", "telefon", "tel"),
    source: value("source", "niche", "campaign_tag"),
    personalizedIntro: value("personalizedIntro", "personalized_intro", "icebreaker", "icebreaker_sentence"),
    customFields: Object.fromEntries(
      Object.entries(raw)
        .filter(([key, item]) => item && ["ico", "address", "verification_status", "decision_maker_name"].includes(slugify(key).replace(/-/g, "_")))
        .map(([key, item]) => [slugify(key).replace(/-/g, "_"), item])
    ),
  };
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function readLeadColumn(lead: LeadCandidateInput, column: string): unknown {
  const key = column as keyof LeadCandidateInput;
  if (key in lead) return lead[key];
  return lead.customFields?.[column];
}

function manualReviewReasons(lead: LeadCandidateInput, score: number, minScore: number): string[] {
  const reasons: string[] = [];
  const email = lead.email?.trim().toLowerCase();
  if (!email) reasons.push("missing email");
  else if (!email.includes("@")) reasons.push("invalid email");
  else if (isGenericEmail(email)) reasons.push("generic email");
  if (!lead.website) reasons.push("missing website");
  if (!lead.firstName && !lead.lastName && !lead.phone) reasons.push("missing decision maker or phone");
  if (!lead.personalizedIntro) reasons.push("missing personalized intro");
  if (score < minScore) reasons.push(`score below ${minScore}`);
  return reasons;
}

function buildScoreBuckets(scores: number[]): Record<string, number> {
  return {
    "0-29": scores.filter((score) => score <= 29).length,
    "30-49": scores.filter((score) => score >= 30 && score <= 49).length,
    "50-69": scores.filter((score) => score >= 50 && score <= 69).length,
    "70-89": scores.filter((score) => score >= 70 && score <= 89).length,
    "90-100": scores.filter((score) => score >= 90).length,
  };
}

function isGenericEmail(email: string): boolean {
  const prefix = email.split("@")[0]?.toLowerCase();
  return genericEmailPrefixes.has(prefix);
}

function leadIdentityKey(lead: LeadCandidateInput): { value: string; reason: string } | null {
  if (lead.email?.trim()) return { value: `email:${lead.email.trim().toLowerCase()}`, reason: "same email" };
  if (lead.website?.trim()) return { value: `website:${normalizeWebsiteIdentity(lead.website)}`, reason: "same website" };
  const phone = lead.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 9) return { value: `phone:${phone}`, reason: "same phone" };
  if (lead.companyName?.trim()) return { value: `company:${slugify(lead.companyName)}`, reason: "same company name" };
  return null;
}

function normalizeWebsiteIdentity(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeDomain(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!clean) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return clean.replace(/^www\./i, "").split("/")[0];
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dedupeSmartleadLeads(leads: SmartleadLead[]): SmartleadLead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = lead.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
