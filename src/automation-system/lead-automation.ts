import { redactSensitiveText, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { discoverLeads, type NormalizedLead } from "./lead-discovery.ts";
import { buildSmartleadLead, type SmartleadLead, type SmartleadSchedule, type SmartleadSequence } from "./smartlead.ts";
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

export type BatchScrapedWebsiteContacts = {
  mode: "batch-website-contact-scrape";
  totals: { input: number; scraped: number; failed: number; emailsFound: number; phonesFound: number };
  results: ScrapedWebsiteContacts[];
  failures: Array<{ url: string; error: string }>;
  summary: string;
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

export type BatchLeadIntroDraft = {
  mode: "batch-lead-intro-draft";
  totals: { input: number; drafted: number; failed: number };
  drafts: LeadIntroDraft[];
  failures: Array<{ companyName: string; website?: string; error: string }>;
  summary: string;
};

export type AiIntroQualityAuditPreview = {
  mode: "ai-intro-quality-audit-preview";
  summary: string;
  totals: {
    input: number;
    ready: number;
    redraft: number;
    manualReview: number;
    missingIntro: number;
    genericIntro: number;
    placeholderIntro: number;
    greetingIntro: number;
    tooShort: number;
    weakEvidence: number;
  };
  items: Array<{
    lead: LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string; evidenceText?: string };
    status: "ready" | "redraft" | "manual_review";
    intro?: string;
    issues: string[];
    evidenceTerms: string[];
  }>;
  redraftInputs: LeadIntroInput[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type AiIntroCleanupPreview = {
  mode: "ai-intro-cleanup-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    input: number;
    cleaned: number;
    unchanged: number;
    needsRedraft: number;
    removedGreeting: number;
    removedName: number;
    normalizedPrefix: number;
    smartleadReady: number;
  };
  items: Array<{
    lead: LeadCandidateInput & { decisionMakerName?: string; decision_maker_name?: string; customFields?: Record<string, string | number | boolean | null | undefined>; context?: string; evidenceText?: string };
    status: "cleaned" | "unchanged" | "needs_redraft";
    originalIntro?: string;
    cleanedIntro?: string;
    changes: string[];
    issues: string[];
  }>;
  cleanedLeads: PreparedSmartleadLeadInput[];
  redraftInputs: LeadIntroInput[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type LeadCsvMappingPreview = {
  mode: "lead-csv-mapping-preview";
  summary: string;
  source: { name?: string; type?: "google_maps" | "csv" | "serper" | "manual" | "other" };
  headers: string[];
  totals: { rows: number; mappedLeads: number; withCompany: number; withWebsite: number; withEmail: number; withPhone: number; withSmartleadStatus: number; skippedRows: number };
  mappedFields: Record<string, string[]>;
  sampleLeads: LeadCsvRow[];
  warnings: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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
  smartleadCampaignId?: string | number | null;
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
  smartlead_campaign_id?: string | number | null;
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

export type SmartleadImportAuditPreview = {
  mode: "smartlead-import-audit-preview";
  summary: string;
  totals: { input: number; normalized: number; newLeads: number; duplicateInInput: number; alreadyInSmartlead: number; skipped: number };
  campaignId?: string | number;
  newLeads: SmartleadLead[];
  duplicateInInput: Array<{ lead: SmartleadLead; duplicateOf: string; reason: string }>;
  alreadyInSmartlead: Array<{ lead: SmartleadLead; existingEmail: string; reason: string }>;
  skipped: Array<{ email?: string; reason: string }>;
  addLeadsApprovalPayload?: { campaignId: string | number; leads: SmartleadLead[]; settings: { ignore_global_block_list: false; ignore_unsubscribe_list: false }; approval: { approved: true } };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type SmartleadCampaignLaunchPreview = {
  mode: "smartlead-campaign-launch-preview";
  summary: string;
  campaignMode: "create" | "configure-existing";
  campaignSetup: NicheSmartleadCampaignSetupDraft;
  injectionPlan: SmartleadInjectionPlan;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  approvalPayloads: {
    createCampaign?: NicheSmartleadCampaignSetupDraft["createCampaignApprovalPayload"];
    configureCampaign?: {
      campaignId: string | number;
      sequences: NicheSmartleadCampaignSetupDraft["sequences"];
      emailAccountIds?: Array<string | number>;
      schedule: NicheSmartleadCampaignSetupDraft["schedule"];
      settings: NicheSmartleadCampaignSetupDraft["settings"];
      webhook: NicheSmartleadCampaignSetupDraft["webhook"];
      approval: { approved: true };
    };
    addLeads?: NonNullable<SmartleadInjectionPlan["addLeadsApprovalPayload"]>;
  };
};

export type SmartleadCampaignQaPreview = {
  mode: "smartlead-campaign-qa-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  checks: Array<{ key: string; status: "ready" | "attention" | "blocked"; message: string }>;
  totals: {
    leads: number;
    duplicateEmails: number;
    genericEmails: number;
    missingPersonalizedIntro: number;
    sequenceCount: number;
    variants: number;
    approvalCalls: number;
  };
  requiredVariables: string[];
  missingVariables: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadSequenceVariableRepairPreview = {
  mode: "smartlead-sequence-variable-repair-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: { sequences: number; variants: number; subjectsChanged: number; bodyOccurrences: number; unchangedVariants: number };
  targetVariable: string;
  replacementVariable: string;
  rewrittenSequences: SmartleadSequence[];
  changes: Array<{ sequenceNumber: number; variantLabel: string; beforeSubject: string; afterSubject: string; bodyOccurrences: number }>;
  warnings: string[];
  configureCampaignApprovalPayload?: { campaignId: string | number; sequences: SmartleadSequence[]; approval: { approved: true } };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadEmailRenderingPreview = {
  mode: "smartlead-email-rendering-preview";
  summary: string;
  totals: { leads: number; sequenceSteps: number; variants: number; renderedEmails: number; missingVariableInstances: number };
  rendered: Array<{
    email: string;
    companyName?: string;
    sequenceNumber: number;
    variantLabel: string;
    subject: string;
    emailBody: string;
    missingVariables: string[];
  }>;
  warnings: string[];
};

export type ColdOutreachCsvImportPreview = {
  mode: "cold-outreach-csv-import-preview";
  summary: string;
  totals: {
    parsed: number;
    skippedRows: number;
    blocked: number;
    allowed: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
  };
  parsed: ReturnType<typeof parseLeadsCsv>;
  filtered: ReturnType<typeof filterBlacklistedLeads>;
  pipelinePreview: LeadgenCampaignPipelinePreview;
  launchPreview?: SmartleadCampaignLaunchPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadSourceImportQueueLead = LeadCandidateInput & {
  nicheSlug?: string;
  nicheName?: string;
  campaignId?: string | number | null;
  smartleadCampaignId?: string | number | null;
  placeId?: string;
  rating?: number;
  reviewCount?: number;
  scraped?: Partial<ScrapedWebsiteContacts>;
  intro?: Partial<LeadIntroDraft>;
  context?: string;
};

export type LeadSourceImportQueuePreview = {
  mode: "lead-source-import-queue-preview";
  summary: string;
  source: { name: string; type: "google_maps" | "csv" | "serper" | "manual" | "other" };
  totals: {
    input: number;
    parsedFromCsv: number;
    allowed: number;
    blocked: number;
    groups: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
    websitesToScrape: number;
    introsToDraft: number;
    unassigned: number;
  };
  groups: Array<{
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    leads: LeadSourceImportQueueLead[];
    pipelinePreview: LeadgenCampaignPipelinePreview;
    importAudit?: SmartleadImportAuditPreview;
  }>;
  unassigned: LeadSourceImportQueueLead[];
  blocked: ReturnType<typeof filterBlacklistedLeads>["blocked"];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadSourceBundlePreview = {
  mode: "lead-source-bundle-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  sources: Array<{
    name: string;
    type: "google_maps" | "csv" | "json" | "serper" | "manual" | "other";
    totals: { directLeads: number; parsedCsv: number; parsedJson: number; skippedRows: number; warnings: number };
    warnings: string[];
  }>;
  totals: {
    sources: number;
    inputLeads: number;
    parsedCsv: number;
    parsedJson: number;
    skippedRows: number;
    groups: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
    websitesToScrape: number;
    introsToDraft: number;
    unassigned: number;
    approvalCalls: number;
    readOnlyCalls: number;
  };
  sourcePreview: LeadSourceImportQueuePreview;
  autopilotPreview?: LeadgenAutopilotBatchPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadSourceBundleCampaignLaunchPreview = {
  mode: "lead-source-bundle-campaign-launch-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  bundlePreview: LeadSourceBundlePreview;
  handoffPackages: Array<{
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    readyLeads: number;
    handoffPackage: SmartleadCampaignHandoffPackagePreview;
  }>;
  skippedGroups: Array<{ niche: { id?: string; slug: string; name: string; campaignId?: string | number | null }; reason: string }>;
  totals: {
    groups: number;
    launchGroups: number;
    skippedGroups: number;
    readyLeads: number;
    approvalCalls: number;
    readOnlyCalls: number;
    blockedPackages: number;
    attentionPackages: number;
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenAutopilotBatchPreview = {
  mode: "leadgen-autopilot-batch-preview";
  summary: string;
  status: "ready" | "attention" | "blocked";
  sourcePreview: LeadSourceImportQueuePreview;
  introAudit?: AiIntroQualityAuditPreview;
  totals: {
    input: number;
    groups: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
    websitesToScrape: number;
    introsToDraft: number;
    introsToRedraft: number;
    approvalCalls: number;
    readOnlyCalls: number;
  };
  runbook: Array<{ order: number; tool: string; purpose: string; approvalRequired: boolean; payload: Record<string, unknown> }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadRepairQueueLead = LeadCandidateInput & {
  id?: string | number;
  ico?: string;
  decisionMakerName?: string;
  decision_maker_name?: string;
  verificationStatus?: "ok" | "flagged" | "failed";
  verificationNotes?: string;
  sentToSmartlead?: boolean;
  manuallyReviewed?: boolean;
  scraped?: Partial<ScrapedWebsiteContacts>;
  register?: Partial<SlovakRegisterLookup>;
  intro?: Partial<LeadIntroDraft>;
  context?: string;
};

export type LeadRepairQueuePreview = {
  mode: "lead-repair-queue-preview";
  summary: string;
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    readyNow: number;
    needsEmail: number;
    needsWebsite: number;
    needsIntro: number;
    badIntro: number;
    needsDecisionMaker: number;
    failedVerification: number;
    alreadySent: number;
    manualReview: number;
    rejected: number;
  };
  items: Array<{
    lead: LeadRepairQueueLead;
    issues: string[];
    severity: "ready" | "repair" | "manual_review" | "reject";
    recommendedTools: string[];
  }>;
  duplicates: ReturnType<typeof dedupeLeadCandidates>["duplicates"];
  repairBatches: {
    websitesToScrape: string[];
    introsToDraft: LeadIntroInput[];
    registerLookups: Array<{ ico?: string; companyName?: string }>;
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SlovakRegisterBatchPreview = {
  mode: "slovak-register-batch-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; parsedRows: number; warnings: string[] };
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    alreadyVerified: number;
    needsLookup: number;
    byIco: number;
    byName: number;
    missingLookupKey: number;
    missingDecisionMaker: number;
    mergeCandidates: number;
  };
  lookupQueue: Array<{
    leadKey: string;
    ico?: string;
    companyName?: string;
    reason: string;
    priority: number;
    lead: LeadRepairQueueLead;
  }>;
  alreadyVerified: LeadRepairQueueLead[];
  missingLookupKey: LeadRepairQueueLead[];
  duplicates: ReturnType<typeof dedupeLeadCandidates>["duplicates"];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SlovakSalutationPreview = {
  mode: "slovak-salutation-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: { input: number; enriched: number; missingName: number; male: number; female: number; unknown: number; smartleadReady: number };
  items: Array<{
    lead: LeadRepairQueueLead;
    status: "ready" | "missing_name";
    fullName?: string;
    firstName?: string;
    lastName?: string;
    gender: "male" | "female" | "unknown";
    salutation?: "pan" | "pani";
    lastNameWithSalutation?: string;
    customFields?: Record<string, string | number | boolean | null | undefined>;
  }>;
  enhancedLeads: PreparedSmartleadLeadInput[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type OrphanLeadAssignmentPreview = {
  mode: "orphan-lead-assignment-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    input: number;
    assigned: number;
    unassigned: number;
    readyNow: number;
    needsRepair: number;
    needsEmail: number;
    needsIntro: number;
    needsDecisionMaker: number;
    groups: number;
  };
  assigned: Array<{ lead: LeadSourceImportQueueLead; niche: { id?: string; slug: string; name: string; campaignId?: string | number | null }; confidence: number; reasons: string[] }>;
  unassigned: LeadSourceImportQueueLead[];
  repairPreview: LeadRepairQueuePreview;
  importQueuePreview?: LeadSourceImportQueuePreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type UrlIntelligenceQueuePreview = {
  mode: "url-intelligence-queue-preview";
  summary: string;
  source: { name: string; type: "url_list" | "manual" | "mixed" };
  totals: {
    inputUrls: number;
    validUrls: number;
    invalidUrls: number;
    inputLeads: number;
    generatedLeads: number;
    totalLeads: number;
    fetchUrls: number;
    scrapeUrls: number;
    introsToDraft: number;
    readyForSmartlead: number;
    manualReview: number;
  };
  urlBatches: {
    fetch: string[];
    scrape: string[];
    invalid: Array<{ value: string; error: string }>;
  };
  generatedLeads: LeadSourceImportQueueLead[];
  repairPreview: LeadRepairQueuePreview;
  importQueuePreview?: LeadSourceImportQueuePreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type SuppressionListPreview = {
  mode: "suppression-list-preview";
  summary: string;
  totals: {
    inputLeads: number;
    suppressedEmails: number;
    suppressedDomains: number;
    suppressedKeywords: number;
    allowedLeads: number;
    blockedLeads: number;
    duplicateSignals: number;
  };
  suppression: {
    emails: string[];
    domains: string[];
    keywords: string[];
    reasons: Array<{ value: string; type: "email" | "domain" | "keyword"; reason: string }>;
  };
  filtered: ReturnType<typeof filterBlacklistedLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadHistorySuppressionPreview = {
  mode: "smartlead-history-suppression-preview";
  summary: string;
  source: { name?: string; type?: "google_maps" | "csv" | "serper" | "manual" | "other" };
  totals: { input: number; allowed: number; suppressed: number; alreadySent: number; replied: number; blockedStatus: number; alreadyInSmartlead: number };
  allowedLeads: LeadCandidateInput[];
  suppressed: Array<{ lead: LeadCandidateInput; reason: string; evidence: Record<string, string> }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadNonreplyCallListPreview = {
  mode: "smartlead-nonreply-call-list-preview";
  summary: string;
  source: { name?: string; type?: "smartlead" | "csv" | "manual" | "other"; campaignId?: string | number | null };
  totals: {
    input: number;
    nonRepliers: number;
    replied: number;
    blockedOrUnsubscribed: number;
    callable: number;
    needsPhoneScrape: number;
    belowSentThreshold: number;
  };
  callableRows: Array<LeadCandidateInput & { customFields?: Record<string, string | number | boolean | null | undefined> }>;
  needsPhoneScrape: LeadCandidateInput[];
  excluded: Array<{ lead: LeadCandidateInput; reason: string; evidence: Record<string, string> }>;
  exportPreview: ReturnType<typeof serializeLeadsCsv>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type NicheOpsDashboardInput = {
  id?: string;
  slug: string;
  name: string;
  status?: "active" | "paused" | "archived";
  tier?: number;
  regions?: string[];
  currentRegionIndex?: number;
  dailyTarget?: number;
  todaySent?: number;
  smartleadCampaignId?: string | number | null;
  lastWorkedAt?: string;
  stats?: { discovered?: number; enriched?: number; qualified?: number; sentToSmartlead?: number; failed?: number; opened?: number; replied?: number };
  stuckLeads?: LeadRepairQueueLead[];
  readyLeads?: LeadRepairQueueLead[];
  failedLeads?: LeadRepairQueueLead[];
};

export type NicheOpsDashboardPreview = {
  mode: "niche-ops-dashboard-preview";
  summary: string;
  totals: { niches: number; active: number; paused: number; healthy: number; attention: number; blocked: number; dailyTarget: number; todaySent: number; readyLeads: number; stuckLeads: number; failedLeads: number };
  niches: Array<{
    niche: NicheOpsDashboardInput;
    activeRegion?: string;
    status: "healthy" | "attention" | "blocked";
    progressPercent: number;
    issues: string[];
    nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadSenderAccountInput = {
  id: string | number;
  email: string;
  status?: "active" | "paused" | "error" | "warming" | "unknown";
  warmupStatus?: "active" | "paused" | "error" | "warming" | "unknown";
  dailyLimit?: number;
  sentToday?: number;
  bounceRate?: number;
  replyRate?: number;
  reputationScore?: number;
};

export type SmartleadSenderCapacityPreview = {
  mode: "smartlead-sender-capacity-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    accounts: number;
    usableAccounts: number;
    blockedAccounts: number;
    dailyCapacity: number;
    remainingToday: number;
    requestedDailyLimit: number;
    recommendedDailyLimit: number;
    leadBacklog: number;
    estimatedDays: number;
  };
  accounts: Array<SmartleadSenderAccountInput & { usable: boolean; remainingToday: number; warnings: string[] }>;
  warnings: string[];
  configureCampaignPayload?: {
    campaignId: string | number;
    emailAccountIds: Array<string | number>;
    schedule: { max_new_leads_per_day: number; min_time_btw_emails: number };
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadDeliverabilityGuardPreview = {
  mode: "smartlead-deliverability-guard-preview";
  status: "ready" | "attention" | "blocked";
  recommendation: "continue" | "reduce_daily_limit" | "pause_campaign";
  summary: string;
  campaign: { id?: string | number | null; name?: string };
  metrics: {
    sent: number;
    opened: number;
    replied: number;
    positiveReplies: number;
    bounced: number;
    unsubscribed: number;
    openRate: number;
    replyRate: number;
    positiveReplyRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  thresholds: { maxBounceRate: number; maxUnsubscribeRate: number; minReplyRate: number; minOpenRate: number };
  risks: Array<{ key: string; severity: "attention" | "blocked"; message: string }>;
  senderCapacityPreview?: SmartleadSenderCapacityPreview;
  safeDailyLimit: number;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadCampaignHandoffPackagePreview = {
  mode: "smartlead-campaign-handoff-package-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  launchPreview: SmartleadCampaignLaunchPreview;
  qaPreview: SmartleadCampaignQaPreview;
  senderCapacityPreview?: SmartleadSenderCapacityPreview;
  approvals: {
    required: number;
    ready: number;
    blocked: number;
    calls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean; status: "ready" | "blocked" }>;
  };
  operatorChecklist: Array<{ item: string; status: "ready" | "attention" | "blocked"; detail: string }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadCampaignBackupPlanCampaign = {
  id?: string | number;
  name?: string;
  status?: string;
  protected?: boolean;
  leadCount?: number;
  lead_count?: number;
  total_leads?: number;
  sequenceCount?: number;
  sequence_count?: number;
  webhookCount?: number;
  webhook_count?: number;
  emailAccountCount?: number;
  email_account_count?: number;
  leads?: unknown[];
  sequences?: unknown[];
  webhooks?: unknown[];
  emailAccounts?: unknown[];
  email_accounts?: unknown[];
  [key: string]: unknown;
};

export type SmartleadCampaignBackupPlan = {
  mode: "smartlead-campaign-backup-plan";
  status: "ready" | "attention" | "blocked";
  summary: string;
  run: {
    runId: string;
    createdAt: string;
    backupRoot: string;
    runDir: string;
    sqlitePath: string;
    note?: string;
  };
  totals: {
    campaigns: number;
    protected: number;
    backupCandidates: number;
    deleteCandidates: number;
    estimatedLeads: number;
    missingLeadCounts: number;
  };
  campaigns: Array<{
    id: string;
    name: string;
    status?: string;
    protected: boolean;
    protectionReasons: string[];
    leadCount?: number;
    sequenceCount?: number;
    webhookCount?: number;
    emailAccountCount?: number;
    backupDir: string;
    fetchEndpoints: Array<{ artifact: "campaign" | "sequences" | "leads" | "webhooks" | "email_accounts"; method: "GET"; path: string; paginated?: boolean }>;
  }>;
  protectedCampaigns: SmartleadCampaignBackupPlan["campaigns"];
  deleteCandidates: SmartleadCampaignBackupPlan["campaigns"];
  manifestTemplate: {
    run_id: string;
    created_at: string;
    db_path: string;
    backup_dir: string;
    execute_delete: false;
    protected_campaigns: Array<{ id: string; name: string }>;
    delete_candidates: Array<{ id: string; name: string }>;
    delete_results: [];
  };
  safetyGates: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadCampaignRestoreBackup = {
  campaign?: Record<string, unknown>;
  sequences?: unknown[];
  leads?: unknown[];
  webhooks?: unknown[];
  emailAccounts?: unknown[];
  email_accounts?: unknown[];
  sourceBackupDir?: string;
  targetCampaignId?: string | number | null;
  targetCampaignName?: string;
  restoreMode?: "create-new" | "configure-existing";
  [key: string]: unknown;
};

export type SmartleadCampaignRestorePlan = {
  mode: "smartlead-campaign-restore-plan";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    backups: number;
    restorable: number;
    blocked: number;
    protectedSources: number;
    leads: number;
    batches: number;
    approvalCalls: number;
  };
  campaigns: Array<{
    sourceCampaignId?: string;
    sourceName: string;
    targetCampaignId?: string | number | null;
    targetCampaignName: string;
    restoreMode: "create-new" | "configure-existing";
    status: "ready" | "attention" | "blocked";
    issues: string[];
    sourceBackupDir?: string;
    sequences: SmartleadSequence[];
    emailAccountIds: Array<string | number>;
    schedule?: SmartleadSchedule;
    settings?: { trackOpen?: boolean; stopOnReply?: boolean; followUpPercentage?: number };
    webhook?: { url: string; name?: string; eventTypes?: string[] };
    leadBatches: Array<{ index: number; size: number; leads: SmartleadLead[] }>;
    approvalPayloads: {
      createCampaign?: Record<string, unknown>;
      configureCampaign?: Record<string, unknown>;
      addLeads: Array<Record<string, unknown>>;
    };
    nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  }>;
  safetyGates: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadEnrichmentBatchPreview = {
  mode: "lead-enrichment-batch-preview";
  summary: string;
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
  };
  leads: LeadCandidateInput[];
  duplicates: ReturnType<typeof dedupeLeadCandidates>["duplicates"];
  score: ReturnType<typeof scoreLeadQuality>;
  reviewQueue: ReturnType<typeof buildManualReviewQueue>;
  smartleadPlan?: SmartleadInjectionPlan;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string }>;
};

export type LeadEnrichmentMergePreview = {
  mode: "lead-enrichment-merge-preview";
  summary: string;
  totals: {
    input: number;
    enriched: number;
    matchedScrapes: number;
    matchedIntros: number;
    unmatchedScrapes: number;
    unmatchedIntros: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
  };
  leads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
  unmatchedScrapes: Array<Partial<ScrapedWebsiteContacts>>;
  unmatchedIntros: Array<Partial<LeadIntroDraft>>;
  enrichmentPreview: LeadEnrichmentBatchPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenGapReport = {
  mode: "leadgen-gap-report";
  summary: string;
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
    missingEmail: number;
    missingWebsite: number;
    missingIntro: number;
    missingDecisionMaker: number;
    missingCampaignId: number;
  };
  leads: Array<{ lead: LeadCandidateInput; gaps: string[]; recommendation: "ready_for_import" | "manual_review" | "reject"; score: number }>;
  duplicates: ReturnType<typeof dedupeLeadCandidates>["duplicates"];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenCampaignPipelinePreview = {
  mode: "leadgen-campaign-pipeline-preview";
  summary: string;
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    contactsPrepared: number;
    introsPrepared: number;
    websitesToScrape: number;
    introsToDraft: number;
    readyForSmartlead: number;
    manualReview: number;
    rejected: number;
  };
  leads: LeadCandidateInput[];
  websitesToScrape: string[];
  introInputs: LeadIntroInput[];
  enrichmentPreview: LeadEnrichmentBatchPreview;
  smartleadPlan?: SmartleadInjectionPlan;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string }>;
};

export type WebsiteLeadEnrichmentPreview = {
  mode: "website-lead-enrichment-preview";
  summary: string;
  totals: {
    input: number;
    enriched: number;
    scraped: number;
    scrapeFailed: number;
    introsDrafted: number;
    introFailed: number;
    readyForSmartlead: number;
    manualReview: number;
  };
  leads: Array<LeadCandidateInput & { scraped?: ScrapedWebsiteContacts; intro?: LeadIntroDraft }>;
  scrape: BatchScrapedWebsiteContacts;
  intros?: BatchLeadIntroDraft;
  pipelinePreview: LeadgenCampaignPipelinePreview;
  launchPreview?: SmartleadCampaignLaunchPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type DailyLeadgenRunbook = {
  mode: "daily-leadgen-runbook";
  summary: string;
  niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
  target: { discoveryCount: number; dailyLimit: number; batchSize: number };
  queryPlan: NicheLeadgenPlan;
  steps: Array<{ order: number; tool: string; payload: Record<string, unknown>; purpose: string; writes: boolean; approvalRequired: boolean }>;
  safetyGates: string[];
};

export type BatchNicheDiscoveryPlan = {
  mode: "batch-niche-discovery-plan";
  summary: string;
  totals: { niches: number; regions: number; runbooks: number; discoveryCalls: number; estimatedDailyLimit: number };
  plans: Array<{
    niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
    queryPlan: NicheLeadgenPlan;
    runbook: DailyLeadgenRunbook;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type LeadDiscoveryMatrixPreview = {
  mode: "lead-discovery-matrix-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    niches: number;
    regions: number;
    keywords: number;
    matrixRows: number;
    mapsQueries: number;
    serperQueries: number;
    estimatedSearchCalls: number;
    targetLeads: number;
  };
  niches: Array<{
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    regions: string[];
    keywords: string[];
    blacklistDomains: string[];
    blacklistKeywords: string[];
    targetPerRegion: number;
    rows: Array<{
      region: string;
      keyword: string;
      mapsQuery: string;
      serperQuery: string;
      targetCount: number;
      priority: number;
    }>;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  safetyGates: string[];
  warnings: string[];
};

export type LeadgenExecutionQueuePreview = {
  mode: "leadgen-execution-queue-preview";
  summary: string;
  date: string;
  totals: {
    niches: number;
    queued: number;
    skipped: number;
    discoveryCalls: number;
    readOnlyCalls: number;
    approvalCalls: number;
    estimatedDailyLimit: number;
    estimatedDiscoveryCount: number;
  };
  queue: Array<{
    order: number;
    niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
    priority: number;
    status: "ready" | "attention" | "blocked";
    reason: string;
    target: { remainingToday: number; discoveryCount: number; dailyLimit: number; batchSize: number };
    phases: Array<{ order: number; tool: string; purpose: string; writes: boolean; approvalRequired: boolean }>;
    runbook: DailyLeadgenRunbook;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type RegionExpansionQueuePreview = {
  mode: "region-expansion-queue-preview";
  summary: string;
  preset: "capitals" | "all_slovakia" | "custom";
  totals: { niches: number; regions: number; queuedRegions: number; skippedRegions: number; runbooks: number; estimatedDailyLimit: number };
  regions: string[];
  niches: Array<{
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    queuedRegions: string[];
    skippedRegions: string[];
    batchPlan: BatchNicheDiscoveryPlan;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

const genericEmailPrefixes = new Set(["info", "kontakt", "contact", "office", "admin", "sales", "hello", "support", "recepcia"]);

const slovakiaCapitalRegions = ["Bratislava", "Trnava", "Trencin", "Nitra", "Zilina", "Banska Bystrica", "Presov", "Kosice"];
const slovakiaExpansionRegions = unique([
  ...slovakiaCapitalRegions,
  "Malacky", "Pezinok", "Senec", "Dunajska Streda", "Galanta", "Hlohovec", "Senica", "Skalica",
  "Povazska Bystrica", "Puchov", "Komarno", "Levice", "Nove Zamky", "Sala", "Topolcany",
  "Zvolen", "Liptovsky Mikulas", "Martin", "Ruzomberok", "Cadca", "Poprad", "Spisska Nova Ves",
  "Michalovce", "Humenne", "Bardejov", "Stara Lubovna", "Roznava", "Rimavska Sobota", "Lucenec",
  "Ziar nad Hronom", "Trebisov", "Vranov nad Toplou", "Svidnik", "Stropkov", "Kezmarok",
  "Sabinov", "Levoca", "Gelnica", "Snina", "Sobrance", "Medzilaborce", "Revuca", "Poltar",
  "Detva", "Krupina", "Velky Krtis", "Banska Stiavnica", "Zarnovica", "Zlate Moravce",
  "Turcianske Teplice", "Bytca", "Kysucke Nove Mesto", "Namestovo", "Tvrdosin", "Dolny Kubin",
  "Myjava", "Nove Mesto nad Vahom", "Banovce nad Bebravou", "Ilava",
]);

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

export async function batchScrapeWebsiteContacts(
  input: { urls: string[]; includePriorityPages?: boolean; maxPages?: number; maxSites?: number },
  fetchImpl: FetchLike = fetch
): Promise<BatchScrapedWebsiteContacts> {
  const maxSites = Math.min(Math.max(Math.trunc(input.maxSites ?? 20), 1), 50);
  const urls = unique(input.urls.map((url) => url.trim()).filter(Boolean)).slice(0, maxSites);
  const results: ScrapedWebsiteContacts[] = [];
  const failures: BatchScrapedWebsiteContacts["failures"] = [];
  for (const url of urls) {
    try {
      results.push(await scrapeWebsiteContacts({ url, includePriorityPages: input.includePriorityPages, maxPages: input.maxPages }, fetchImpl));
    } catch (error) {
      failures.push({ url, error: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    }
  }
  const emailsFound = unique(results.flatMap((result) => result.emails)).length;
  const phonesFound = unique(results.flatMap((result) => result.phones)).length;
  return {
    mode: "batch-website-contact-scrape",
    totals: { input: urls.length, scraped: results.length, failed: failures.length, emailsFound, phonesFound },
    results,
    failures,
    summary: `Batch scrape hotovy: ${results.length}/${urls.length} webov, ${emailsFound} unikatnych emailov, ${phonesFound} telefonov. Ziadny zapis neprebehol.`,
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

export async function batchDraftLeadIntros(
  input: { leads: LeadIntroInput[]; offer?: string; language?: "sk" | "en"; maxLeads?: number },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<BatchLeadIntroDraft> {
  const maxLeads = Math.min(Math.max(Math.trunc(input.maxLeads ?? 20), 1), 50);
  const seen = new Set<string>();
  const leads = input.leads
    .filter((lead) => lead.companyName?.trim())
    .filter((lead) => {
      const key = `${lead.companyName.trim().toLowerCase()}|${lead.website?.trim().toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxLeads);
  const drafts: LeadIntroDraft[] = [];
  const failures: BatchLeadIntroDraft["failures"] = [];
  for (const lead of leads) {
    try {
      drafts.push(await draftLeadIntro({ ...lead, offer: lead.offer ?? input.offer, language: lead.language ?? input.language }, env, fetchImpl));
    } catch (error) {
      failures.push({
        companyName: lead.companyName,
        website: lead.website,
        error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  return {
    mode: "batch-lead-intro-draft",
    totals: { input: leads.length, drafted: drafts.length, failed: failures.length },
    drafts,
    failures,
    summary: `Batch AI intro draft hotovy: ${drafts.length}/${leads.length} leadov, ${failures.length} chyb. Ziadny email ani zapis neprebehol.`,
  };
}

export function buildAiIntroQualityAuditPreview(input: {
  leads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string; evidenceText?: string }>;
  offer?: string;
  language?: "sk" | "en";
  minEvidenceTerms?: number;
  maxRedrafts?: number;
  maxNextCalls?: number;
}): AiIntroQualityAuditPreview {
  const minEvidenceTerms = Math.min(Math.max(Math.trunc(input.minEvidenceTerms ?? 1), 0), 10);
  const maxRedrafts = Math.min(Math.max(Math.trunc(input.maxRedrafts ?? 50), 1), 200);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 100);
  const items = input.leads.map((lead) => {
    const intro = extractLeadIntro(lead);
    const evidence = introEvidenceText(lead);
    const evidenceTerms = importantIntroTerms(evidence);
    const issues = introQualityIssues(intro, evidenceTerms, minEvidenceTerms, lead);
    const status = issues.some((issue) => ["missing_intro", "intro_too_short", "intro_contains_greeting", "intro_has_placeholder", "generic_intro"].includes(issue))
      ? "redraft" as const
      : issues.length
        ? "manual_review" as const
        : "ready" as const;
    return { lead, status, intro, issues, evidenceTerms };
  });
  const redraftInputs = items
    .filter((item) => item.status === "redraft" && item.lead.companyName)
    .slice(0, maxRedrafts)
    .map((item) => ({
      companyName: String(item.lead.companyName),
      website: item.lead.website,
      context: introEvidenceText(item.lead).slice(0, 1200) || item.lead.context,
      offer: input.offer,
      language: input.language ?? "sk",
    }));
  const missingEvidenceUrls = unique(items
    .filter((item) => item.lead.website && item.issues.includes("missing_evidence"))
    .map((item) => String(item.lead.website)))
    .slice(0, maxNextCalls);
  const nextToolCalls: AiIntroQualityAuditPreview["nextToolCalls"] = [];
  if (missingEvidenceUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: missingEvidenceUrls, includePriorityPages: true, maxPages: 4, maxSites: missingEvidenceUrls.length },
      reason: "Intro nema podklad z webu; najprv vytiahni overeny kontext.",
      approvalRequired: false,
    });
  }
  if (redraftInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: redraftInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: Math.min(redraftInputs.length, 50) },
      reason: "Tieto intra su chybajuce, genericke, kratke alebo obsahuju pozdrav/placeholders.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_lead_repair_queue_preview",
    payload: { leads: input.leads.slice(0, maxNextCalls), offer: input.offer, language: input.language ?? "sk", maxNextCalls },
    reason: "Po oprave intr znovu skontroluj leady pred Smartlead importom.",
    approvalRequired: false,
  });
  const totals = {
    input: input.leads.length,
    ready: items.filter((item) => item.status === "ready").length,
    redraft: items.filter((item) => item.status === "redraft").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    missingIntro: items.filter((item) => item.issues.includes("missing_intro")).length,
    genericIntro: items.filter((item) => item.issues.includes("generic_intro")).length,
    placeholderIntro: items.filter((item) => item.issues.includes("intro_has_placeholder")).length,
    greetingIntro: items.filter((item) => item.issues.includes("intro_contains_greeting")).length,
    tooShort: items.filter((item) => item.issues.includes("intro_too_short")).length,
    weakEvidence: items.filter((item) => item.issues.includes("weak_evidence_grounding") || item.issues.includes("missing_evidence")).length,
  };
  return {
    mode: "ai-intro-quality-audit-preview",
    summary: `AI intro audit: ${totals.ready} ready, ${totals.redraft} na redraft, ${totals.manualReview} manual review; chyba ${totals.missingIntro}, genericke ${totals.genericIntro}, slaby podklad ${totals.weakEvidence}. Ziadny email ani zapis neprebehol.`,
    totals,
    items,
    redraftInputs,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildAiIntroCleanupPreview(input: {
  leads: Array<LeadCandidateInput & { decisionMakerName?: string; decision_maker_name?: string; customFields?: Record<string, string | number | boolean | null | undefined>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string }>;
  offer?: string;
  language?: "sk" | "en";
  defaultSource?: string;
  campaignId?: string | number | null;
  maxRedrafts?: number;
}): AiIntroCleanupPreview {
  const maxRedrafts = Math.min(Math.max(Math.trunc(input.maxRedrafts ?? 50), 1), 200);
  const items: AiIntroCleanupPreview["items"] = input.leads.map((lead) => {
    const originalIntro = extractLeadIntro(lead);
    const decisionMaker = decisionMakerForLead(lead as LeadRepairQueueLead) ?? stringField(lead.customFields ?? {}, "decision_maker_name", "decision_maker_full_name");
    const salutationLastName = stringField(lead.customFields ?? {}, "last_name_with_salutation", "decision_maker_last_name");
    const cleanup = cleanupAiIntroSentence(originalIntro, decisionMaker, salutationLastName);
    const issues = introQualityIssues(cleanup.cleanedIntro, importantIntroTerms(introEvidenceText(lead)), 0, lead);
    const needsRedraft = !cleanup.cleanedIntro || issues.some((issue) => ["missing_intro", "intro_too_short", "intro_has_placeholder", "generic_intro"].includes(issue));
    const status = needsRedraft ? "needs_redraft" as const : cleanup.changed ? "cleaned" as const : "unchanged" as const;
    return { lead, status, originalIntro, cleanedIntro: cleanup.cleanedIntro, changes: cleanup.changes, issues };
  });
  const cleanedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status !== "needs_redraft" && item.cleanedIntro && item.lead.email)
    .map((item) => ({
      email: item.lead.email as string,
      companyName: item.lead.companyName,
      firstName: item.lead.firstName,
      lastName: item.lead.lastName,
      website: item.lead.website,
      phone: item.lead.phone,
      source: item.lead.source ?? input.defaultSource,
      personalizedIntro: item.cleanedIntro,
      customFields: {
        ...item.lead.customFields,
        personalized_intro: item.cleanedIntro,
        icebreaker_sentence: item.cleanedIntro,
      },
    }));
  const redraftInputs = items
    .filter((item) => item.status === "needs_redraft" && item.lead.companyName)
    .slice(0, maxRedrafts)
    .map((item) => ({
      companyName: String(item.lead.companyName),
      website: item.lead.website,
      context: introEvidenceText(item.lead).slice(0, 1200) || item.lead.context,
      offer: input.offer,
      language: input.language ?? "sk",
    }));
  const smartleadPrepared = prepareSmartleadLeads({ leads: cleanedLeads, defaultSource: input.defaultSource ?? "ai-intro-cleanup" });
  const nextToolCalls: AiIntroCleanupPreview["nextToolCalls"] = [];
  if (redraftInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: redraftInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: Math.min(redraftInputs.length, 50) },
      reason: "Tieto intra sa nedaju bezpecne vycistit; priprav nove AI intra bez pozdravu a mena.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_ai_intro_quality_audit_preview",
    payload: { leads: cleanedLeads, offer: input.offer, language: input.language ?? "sk" },
    reason: "Po cleanup-e znovu skontroluj kvalitu intro viet pred importom.",
    approvalRequired: false,
  });
  if (input.campaignId && smartleadPrepared.leadList.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { campaignId: input.campaignId, leads: smartleadPrepared.leadList },
      reason: "Pred uploadom over duplicitne a uz existujuce leady v Smartlead kampani.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: input.leads.length,
    cleaned: items.filter((item) => item.status === "cleaned").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    needsRedraft: items.filter((item) => item.status === "needs_redraft").length,
    removedGreeting: items.filter((item) => item.changes.includes("removed_greeting")).length,
    removedName: items.filter((item) => item.changes.includes("removed_decision_maker")).length,
    normalizedPrefix: items.filter((item) => item.changes.includes("normalized_prefix")).length,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: AiIntroCleanupPreview["status"] = totals.input === 0 ? "blocked" : totals.needsRedraft > 0 ? "attention" : "ready";
  return {
    mode: "ai-intro-cleanup-preview",
    status,
    summary: `AI intro cleanup: ${totals.cleaned} vycistenych, ${totals.unchanged} bez zmeny, ${totals.needsRedraft} na redraft, ${totals.smartleadReady} ready pre Smartlead. Ziadny zapis ani upload neprebehol.`,
    totals,
    items,
    cleanedLeads,
    redraftInputs,
    smartleadPrepared,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export async function enrichWebsiteLeadsPreview(
  input: {
    leads: LeadCandidateInput[];
    niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    campaignTag?: string;
    defaultSource?: string;
    offer?: string;
    painPoint?: string;
    language?: "sk" | "en";
    scrapeWebsites?: boolean;
    draftIntros?: boolean;
    includePriorityPages?: boolean;
    maxPages?: number;
    maxLeads?: number;
    minScore?: number;
    batchSize?: number;
    clientId?: string | number | null;
    emailAccountIds?: Array<string | number>;
    webhookUrl?: string;
    schedule?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"];
    settings?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"];
  },
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<WebsiteLeadEnrichmentPreview> {
  const maxLeads = Math.min(Math.max(Math.trunc(input.maxLeads ?? 20), 1), 50);
  const leads = input.leads.slice(0, maxLeads);
  const urls = unique(leads.map((lead) => lead.website?.trim() ?? "").filter(Boolean));
  const scrape = input.scrapeWebsites === false || !urls.length
    ? emptyBatchScrape(urls)
    : await batchScrapeWebsiteContacts(
        { urls, includePriorityPages: input.includePriorityPages, maxPages: input.maxPages, maxSites: maxLeads },
        fetchImpl
      );
  const scrapeByDomain = new Map(scrape.results.flatMap((result) => {
    const keys = unique([normalizeDomain(result.url), normalizeDomain(result.finalUrl)].filter(Boolean));
    return keys.map((key) => [key, result] as const);
  }));
  const withScrape = leads.map((lead) => {
    const scraped = lead.website ? scrapeByDomain.get(normalizeDomain(lead.website)) : undefined;
    return {
      ...lead,
      email: lead.email ?? selectBestEmail(scraped?.emails ?? []),
      phone: lead.phone ?? scraped?.phones[0],
      source: lead.source ?? input.defaultSource,
      scraped,
      context: scraped?.textPreview,
    };
  });
  const introInputs: LeadIntroInput[] = withScrape
    .filter((lead) => input.draftIntros !== false && lead.companyName && !lead.personalizedIntro)
    .map((lead) => ({
      companyName: lead.companyName as string,
      website: lead.website,
      context: lead.context,
      offer: input.offer,
      language: input.language ?? "sk",
    }));
  const intros = introInputs.length
    ? await batchDraftLeadIntros({ leads: introInputs, offer: input.offer, language: input.language ?? "sk", maxLeads }, env, fetchImpl)
    : undefined;
  const introByKey = new Map((intros?.drafts ?? []).map((intro) => [leadIntroKey(intro), intro]));
  const enriched = withScrape.map((lead) => {
    const intro = lead.companyName ? introByKey.get(leadIntroKey({ companyName: lead.companyName, website: lead.website })) : undefined;
    return {
      ...lead,
      personalizedIntro: lead.personalizedIntro ?? intro?.personalizedIntro,
      intro,
    };
  });
  const pipelinePreview = buildLeadgenCampaignPipelinePreview({
    leads: enriched,
    niche: input.niche,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource ?? "website-enrichment",
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    batchSize: input.batchSize,
  });
  const readyLeads = pipelinePreview.enrichmentPreview.reviewQueue.ready.map((item) => item.lead);
  const launchPreview = input.niche && readyLeads.length
    ? buildSmartleadCampaignLaunchPreview({
        niche: input.niche,
        leads: readyLeads,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language,
        clientId: input.clientId,
        emailAccountIds: input.emailAccountIds,
        webhookUrl: input.webhookUrl,
        schedule: input.schedule,
        settings: input.settings,
        batchSize: input.batchSize,
      })
    : undefined;
  const nextToolCalls: WebsiteLeadEnrichmentPreview["nextToolCalls"] = pipelinePreview.nextToolCalls.map((call) => ({
    ...call,
    approvalRequired: call.tool === "arcigy.add_leads_to_smartlead_campaign",
  }));
  if (launchPreview) nextToolCalls.push(...launchPreview.nextToolCalls);
  return {
    mode: "website-lead-enrichment-preview",
    summary: `Website enrichment preview: ${enriched.length} leadov, ${scrape.totals.scraped} webov scraped, ${intros?.totals.drafted ?? 0} intro draftov, ${pipelinePreview.totals.readyForSmartlead} ready do Smartlead. Ziadny zapis ani upload neprebehol.`,
    totals: {
      input: leads.length,
      enriched: enriched.length,
      scraped: scrape.totals.scraped,
      scrapeFailed: scrape.totals.failed,
      introsDrafted: intros?.totals.drafted ?? 0,
      introFailed: intros?.totals.failed ?? 0,
      readyForSmartlead: pipelinePreview.totals.readyForSmartlead,
      manualReview: pipelinePreview.totals.manualReview,
    },
    leads: enriched,
    scrape,
    intros,
    pipelinePreview,
    launchPreview,
    nextToolCalls,
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

export function buildLeadCsvMappingPreview(input: {
  csvText: string;
  delimiter?: "," | ";";
  maxRows?: number;
  sourceName?: string;
  sourceType?: "google_maps" | "csv" | "serper" | "manual" | "other";
  sampleSize?: number;
}): LeadCsvMappingPreview {
  const parsed = parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows });
  const sampleSize = Math.min(Math.max(Math.trunc(input.sampleSize ?? 5), 1), 25);
  const mappedFields = csvMappedFields(parsed.headers);
  const warnings: string[] = [];
  if (!mappedFields.companyName?.length) warnings.push("No company column was detected.");
  if (!mappedFields.website?.length) warnings.push("No website/domain column was detected; scraping will need manual URLs.");
  if (!mappedFields.email?.length) warnings.push("No email column was detected; batch website scraping is likely needed.");
  if (!mappedFields.personalizedIntro?.length) warnings.push("No AI intro column was detected; intro drafting will be needed.");
  const withSmartleadStatus = parsed.leads.filter((lead) => Boolean(lead.customFields?.smartlead_statuses || lead.customFields?.smartlead_match)).length;
  const nextToolCalls: LeadCsvMappingPreview["nextToolCalls"] = [
    {
      tool: "arcigy.build_leadgen_autopilot_batch_preview",
      payload: {
        sourceName: input.sourceName,
        sourceType: input.sourceType ?? "csv",
        csvText: input.csvText,
        delimiter: input.delimiter,
        maxRows: input.maxRows,
        auditIntros: true,
      },
      reason: "Po kontrole mapovania spusti read-only autopilot runbook pre scrape, AI intra a Smartlead import.",
      approvalRequired: false,
    },
  ];
  return {
    mode: "lead-csv-mapping-preview",
    summary: `CSV mapping preview: ${parsed.leads.length} leadov, ${mappedFields.companyName?.length ? "company OK" : "company chyba"}, ${mappedFields.website?.length ? "web OK" : "web chyba"}, ${mappedFields.email?.length ? "email OK" : "email chyba"}. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, type: input.sourceType },
    headers: parsed.headers,
    totals: {
      rows: parsed.leads.length + parsed.skipped.length,
      mappedLeads: parsed.leads.length,
      withCompany: parsed.leads.filter((lead) => Boolean(lead.companyName)).length,
      withWebsite: parsed.leads.filter((lead) => Boolean(lead.website)).length,
      withEmail: parsed.leads.filter((lead) => Boolean(lead.email)).length,
      withPhone: parsed.leads.filter((lead) => Boolean(lead.phone)).length,
      withSmartleadStatus,
      skippedRows: parsed.skipped.length,
    },
    mappedFields,
    sampleLeads: parsed.leads.slice(0, sampleSize),
    warnings,
    nextToolCalls,
  };
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

export function buildSuppressionListPreview(input: {
  leads?: LeadCandidateInput[];
  bouncedEmails?: string[];
  unsubscribedEmails?: string[];
  negativeReplyEmails?: string[];
  manualSuppressionEmails?: string[];
  manualSuppressionDomains?: string[];
  manualSuppressionKeywords?: string[];
  replySignals?: Array<{ email?: string; website?: string; companyName?: string; text?: string; category?: string; reason?: string }>;
  suppressWholeDomainForBounces?: boolean;
  suppressWholeDomainForUnsubscribes?: boolean;
  sourceName?: string;
  maxNextCalls?: number;
}): SuppressionListPreview {
  const reasons: SuppressionListPreview["suppression"]["reasons"] = [];
  const emails = new Set<string>();
  const domains = new Set<string>();
  const keywords = new Set<string>();
  const addEmail = (value: string | undefined, reason: string) => {
    const email = value?.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    const before = emails.size;
    emails.add(email);
    if (emails.size !== before) reasons.push({ value: email, type: "email", reason });
  };
  const addDomain = (value: string | undefined, reason: string) => {
    const domain = normalizeDomain(value ?? "");
    if (!domain) return;
    const before = domains.size;
    domains.add(domain);
    if (domains.size !== before) reasons.push({ value: domain, type: "domain", reason });
  };
  const addKeyword = (value: string | undefined, reason: string) => {
    const keyword = value?.trim().toLowerCase();
    if (!keyword) return;
    const before = keywords.size;
    keywords.add(keyword);
    if (keywords.size !== before) reasons.push({ value: keyword, type: "keyword", reason });
  };
  for (const email of input.bouncedEmails ?? []) {
    addEmail(email, "bounced email");
    if (input.suppressWholeDomainForBounces) addDomain(email.split("@")[1], "bounce domain");
  }
  for (const email of input.unsubscribedEmails ?? []) {
    addEmail(email, "unsubscribed email");
    if (input.suppressWholeDomainForUnsubscribes) addDomain(email.split("@")[1], "unsubscribe domain");
  }
  for (const email of input.negativeReplyEmails ?? []) addEmail(email, "negative reply email");
  for (const email of input.manualSuppressionEmails ?? []) addEmail(email, "manual suppression email");
  for (const domain of input.manualSuppressionDomains ?? []) addDomain(domain, "manual suppression domain");
  for (const keyword of input.manualSuppressionKeywords ?? []) addKeyword(keyword, "manual suppression keyword");
  for (const signal of input.replySignals ?? []) {
    const text = `${signal.category ?? ""} ${signal.reason ?? ""} ${signal.text ?? ""}`.toLowerCase();
    if (/(unsubscribe|odhlasit|nepiste|stop|remove|nemam zaujem|nemame zaujem|not interested|no thanks)/i.test(text)) {
      addEmail(signal.email, "negative or unsubscribe reply signal");
      addDomain(signal.website ?? signal.email?.split("@")[1], "negative or unsubscribe reply signal");
      if (signal.companyName) addKeyword(signal.companyName, "negative company reply signal");
    }
  }
  const emailDomains = [...emails].map((email) => email.split("@")[1]).filter(Boolean);
  const suppressionDomains = unique([...domains, ...emailDomains.map((domain) => normalizeDomain(domain))]).filter(Boolean);
  const filtered = filterBlacklistedLeads({ leads: input.leads ?? [], domains: suppressionDomains, keywords: [...keywords] });
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 20), 1), 80);
  const nextToolCalls: SuppressionListPreview["nextToolCalls"] = [];
  if ((input.leads ?? []).length) {
    nextToolCalls.push({
      tool: "arcigy.filter_blacklisted_leads",
      payload: { leads: input.leads, domains: suppressionDomains, keywords: [...keywords] },
      reason: "Aplikuj suppression list na leady pred dalsim enrichmentom alebo Smartlead importom.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: filtered.allowed, maxNextCalls },
      reason: "Po odfiltrovani suppression leadov skontroluj opravitelne gapy.",
      approvalRequired: false,
    });
  }
  const duplicateSignals = (input.bouncedEmails?.length ?? 0) + (input.unsubscribedEmails?.length ?? 0) + (input.negativeReplyEmails?.length ?? 0) + (input.manualSuppressionEmails?.length ?? 0) - emails.size;
  return {
    mode: "suppression-list-preview",
    summary: `Suppression list preview: ${emails.size} emailov, ${suppressionDomains.length} domen, ${keywords.size} keywordov, ${filtered.blocked.length} leadov blokovanych. Ziadny zapis ani upload neprebehol.`,
    totals: {
      inputLeads: input.leads?.length ?? 0,
      suppressedEmails: emails.size,
      suppressedDomains: suppressionDomains.length,
      suppressedKeywords: keywords.size,
      allowedLeads: filtered.allowed.length,
      blockedLeads: filtered.blocked.length,
      duplicateSignals: Math.max(duplicateSignals, 0),
    },
    suppression: { emails: [...emails], domains: suppressionDomains, keywords: [...keywords], reasons },
    filtered,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
  };
}

export function buildSmartleadHistorySuppressionPreview(input: {
  leads?: LeadCandidateInput[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  sourceName?: string;
  sourceType?: "google_maps" | "csv" | "serper" | "manual" | "other";
  suppressAlreadySent?: boolean;
  suppressReplies?: boolean;
  suppressBlockedStatuses?: boolean;
  suppressExistingSmartleadMatch?: boolean;
  maxNextCalls?: number;
}): SmartleadHistorySuppressionPreview {
  const parsed = input.csvText ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : { leads: [] as LeadCsvRow[] };
  const leads = [...(input.leads ?? []), ...parsed.leads];
  const suppressed: SmartleadHistorySuppressionPreview["suppressed"] = [];
  const allowedLeads: LeadCandidateInput[] = [];
  for (const lead of leads) {
    const evidence = smartleadHistoryEvidence(lead);
    const reason = smartleadHistorySuppressionReason(evidence, input);
    if (reason) suppressed.push({ lead, reason, evidence });
    else allowedLeads.push(lead);
  }
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const nextToolCalls: SmartleadHistorySuppressionPreview["nextToolCalls"] = [];
  if (allowedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_leadgen_autopilot_batch_preview",
      payload: {
        sourceName: input.sourceName,
        sourceType: input.sourceType ?? (input.csvText ? "csv" : "manual"),
        leads: allowedLeads,
        auditIntros: true,
      },
      reason: "Spusti leadgen autopilot iba na leadoch bez Smartlead historie.",
      approvalRequired: false,
    });
  }
  return {
    mode: "smartlead-history-suppression-preview",
    summary: `Smartlead history suppression: ${allowedLeads.length} allowed, ${suppressed.length} suppressed; sent ${suppressed.filter((item) => item.reason === "already_sent").length}, replied ${suppressed.filter((item) => item.reason === "already_replied").length}, blocked ${suppressed.filter((item) => item.reason === "blocked_status").length}. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, type: input.sourceType },
    totals: {
      input: leads.length,
      allowed: allowedLeads.length,
      suppressed: suppressed.length,
      alreadySent: suppressed.filter((item) => item.reason === "already_sent").length,
      replied: suppressed.filter((item) => item.reason === "already_replied").length,
      blockedStatus: suppressed.filter((item) => item.reason === "blocked_status").length,
      alreadyInSmartlead: suppressed.filter((item) => item.reason === "already_in_smartlead").length,
    },
    allowedLeads,
    suppressed,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
  };
}

export function buildSmartleadNonreplyCallListPreview(input: {
  leads?: LeadCandidateInput[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  sourceName?: string;
  sourceType?: "smartlead" | "csv" | "manual" | "other";
  campaignId?: string | number | null;
  minSentMessages?: number;
  excludeBlockedOrUnsubscribed?: boolean;
  includeWithoutPhone?: boolean;
  maxNextCalls?: number;
}): SmartleadNonreplyCallListPreview {
  const parsed = input.csvText ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : { leads: [] as LeadCsvRow[] };
  const leads = [...(input.leads ?? []), ...parsed.leads];
  const minSentMessages = Math.min(Math.max(Math.trunc(input.minSentMessages ?? 1), 0), 20);
  const excludeBlockedOrUnsubscribed = input.excludeBlockedOrUnsubscribed !== false;
  const includeWithoutPhone = input.includeWithoutPhone === true;
  const callableRows: SmartleadNonreplyCallListPreview["callableRows"] = [];
  const needsPhoneScrape: LeadCandidateInput[] = [];
  const excluded: SmartleadNonreplyCallListPreview["excluded"] = [];
  let nonRepliers = 0;
  let replied = 0;
  let blockedOrUnsubscribed = 0;
  let belowSentThreshold = 0;

  for (const lead of leads) {
    const evidence = smartleadHistoryEvidence(lead);
    const sentMessages = numericEvidence(evidence.smartlead_sent_messages || stringField(lead.customFields ?? {}, "sent_messages"));
    const hasReply = truthyEvidence(evidence.smartlead_replied);
    const blocked = smartleadBlockedEvidence(lead, evidence);
    if (hasReply) {
      replied += 1;
      excluded.push({ lead, reason: "already_replied", evidence });
      continue;
    }
    if (blocked && excludeBlockedOrUnsubscribed) {
      blockedOrUnsubscribed += 1;
      excluded.push({ lead, reason: "blocked_or_unsubscribed", evidence });
      continue;
    }
    if (sentMessages < minSentMessages) {
      belowSentThreshold += 1;
      excluded.push({ lead, reason: "below_sent_threshold", evidence });
      continue;
    }
    nonRepliers += 1;
    const phone = lead.phone ?? stringField(lead.customFields ?? {}, "phone", "phones", "phone_number", "international_phone");
    const row = {
      ...lead,
      phone,
      customFields: {
        ...lead.customFields,
        campaign_id: input.campaignId ?? stringField(lead.customFields ?? {}, "campaign_id", "smartlead_campaign_id"),
        smartlead_status: evidence.smartlead_statuses || stringField(lead.customFields ?? {}, "smartlead_status"),
        sent_messages: sentMessages,
        blocked_or_unsubscribed: blocked,
      },
    };
    if (phone || includeWithoutPhone) callableRows.push(row);
    if (!phone && lead.website) needsPhoneScrape.push(lead);
  }

  const exportPreview = serializeLeadsCsv({
    leads: callableRows,
    columns: ["companyName", "email", "firstName", "lastName", "website", "phone", "source", "smartlead_status", "sent_messages", "blocked_or_unsubscribed"],
  });
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const nextToolCalls: SmartleadNonreplyCallListPreview["nextToolCalls"] = [];
  if (input.campaignId) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId: input.campaignId, offset: 0, limit: 500 },
      reason: "Nacitaj aktualny Smartlead lead list pred finalnym non-replier exportom.",
      approvalRequired: false,
    });
  }
  if (needsPhoneScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: unique(needsPhoneScrape.map((lead) => lead.website).filter((url): url is string => Boolean(url))).slice(0, 50), includePriorityPages: true, maxPages: 4, maxSites: Math.min(needsPhoneScrape.length, 50) },
      reason: "Dohladat telefonne cisla pre non-replierov bez telefonu pred cold calling exportom.",
      approvalRequired: false,
    });
  }
  if (callableRows.length) {
    nextToolCalls.push({
      tool: "arcigy.export_leads_csv",
      payload: { leads: callableRows, columns: exportPreview.columns, approval: { approved: true } },
      reason: "Exportuj call list az po kontrole riadkov operatorom.",
      approvalRequired: true,
    });
  }
  return {
    mode: "smartlead-nonreply-call-list-preview",
    summary: `Smartlead non-reply call list: ${callableRows.length} callable, ${needsPhoneScrape.length} potrebuje phone scrape, ${replied} replied, ${blockedOrUnsubscribed} blocked/unsubscribed. Ziadny zapis ani export neprebehol.`,
    source: { name: input.sourceName, type: input.sourceType ?? (input.csvText ? "csv" : "manual"), campaignId: input.campaignId },
    totals: {
      input: leads.length,
      nonRepliers,
      replied,
      blockedOrUnsubscribed,
      callable: callableRows.length,
      needsPhoneScrape: needsPhoneScrape.length,
      belowSentThreshold,
    },
    callableRows,
    needsPhoneScrape,
    excluded,
    exportPreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
  };
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

export function buildSmartleadImportAuditPreview(input: {
  campaignId?: string | number | null;
  leads: SmartleadLead[];
  existingSmartleadLeads?: Array<Record<string, unknown>>;
}): SmartleadImportAuditPreview {
  const prepared = prepareSmartleadLeads({
    leads: input.leads.map((lead) => ({
      email: lead.email,
      firstName: lead.first_name,
      lastName: lead.last_name,
      companyName: lead.company_name,
      website: lead.website,
      customFields: lead.custom_fields,
    })),
  });
  const duplicateInInput = duplicateSmartleadInputLeads(input.leads);
  const newLeads: SmartleadLead[] = [];
  const existingEmails = new Set((input.existingSmartleadLeads ?? []).map(extractSmartleadEmail).filter((email): email is string => Boolean(email)));
  const alreadyInSmartlead: SmartleadImportAuditPreview["alreadyInSmartlead"] = [];
  for (const lead of prepared.leadList) {
    const email = lead.email.trim().toLowerCase();
    if (existingEmails.has(email)) {
      alreadyInSmartlead.push({ lead, existingEmail: email, reason: "email already exists in Smartlead campaign lead list" });
      continue;
    }
    newLeads.push(lead);
  }
  const campaignId = input.campaignId ?? undefined;
  const addLeadsApprovalPayload = campaignId && newLeads.length
    ? {
        campaignId,
        leads: newLeads,
        settings: { ignore_global_block_list: false as const, ignore_unsubscribe_list: false as const },
        approval: { approved: true as const },
      }
    : undefined;
  const nextToolCalls: SmartleadImportAuditPreview["nextToolCalls"] = [];
  if (campaignId) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId, offset: 0, limit: 500 },
      reason: "Pred dalsim importom nacitaj aktualnych leadov zo Smartlead kampane a zopakuj audit.",
      approvalRequired: false,
    });
  }
  if (addLeadsApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: addLeadsApprovalPayload,
      reason: "Importuj iba nove leady po explicitnom schvaleni operatora.",
      approvalRequired: true,
    });
  }
  return {
    mode: "smartlead-import-audit-preview",
    summary: `Smartlead import audit: ${newLeads.length} novych, ${alreadyInSmartlead.length} uz v Smartlead, ${duplicateInInput.length} duplicit v batchi, ${prepared.skipped.length} skipped. Ziadny upload neprebehol.`,
    totals: {
      input: input.leads.length,
      normalized: prepared.leadList.length,
      newLeads: newLeads.length,
      duplicateInInput: duplicateInInput.length,
      alreadyInSmartlead: alreadyInSmartlead.length,
      skipped: prepared.skipped.length,
    },
    campaignId,
    newLeads,
    duplicateInInput,
    alreadyInSmartlead,
    skipped: prepared.skipped,
    addLeadsApprovalPayload,
    nextToolCalls,
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

export function buildSmartleadCampaignLaunchPreview(input: {
  niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  leads: ManualReviewPickupLead[];
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  schedule?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"];
  settings?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"];
  batchSize?: number;
}): SmartleadCampaignLaunchPreview {
  const campaignSetup = draftNicheSmartleadCampaignSetup({
    niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name },
    offer: input.offer,
    painPoint: input.painPoint,
    language: input.language,
    clientId: input.clientId,
    emailAccountIds: input.emailAccountIds,
    webhookUrl: input.webhookUrl,
    schedule: input.schedule,
    settings: input.settings,
  });
  const injectionPlan = buildSmartleadInjectionPlan({
    niche: input.niche,
    leads: input.leads,
    batchSize: input.batchSize,
  });
  const campaignId = input.niche.campaignId ?? undefined;
  const configureCampaign = campaignId
    ? {
        campaignId,
        sequences: campaignSetup.sequences,
        emailAccountIds: input.emailAccountIds,
        schedule: campaignSetup.schedule,
        settings: campaignSetup.settings,
        webhook: campaignSetup.webhook,
        approval: { approved: true as const },
      }
    : undefined;
  const nextToolCalls: SmartleadCampaignLaunchPreview["nextToolCalls"] = [];
  if (campaignId && configureCampaign) {
    nextToolCalls.push({
      tool: "arcigy.configure_smartlead_campaign",
      payload: configureCampaign as unknown as Record<string, unknown>,
      reason: "Existujuca Smartlead kampan sa da nakonfigurovat sekvenciami, schedule, settings a webhookom po schvaleni.",
      approvalRequired: true,
    });
  } else {
    nextToolCalls.push({
      tool: "arcigy.create_smartlead_campaign",
      payload: campaignSetup.createCampaignApprovalPayload as unknown as Record<string, unknown>,
      reason: "Niche nema campaignId; najprv vytvor Smartlead kampan po explicitnom schvaleni.",
      approvalRequired: true,
    });
  }
  if (injectionPlan.addLeadsApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: injectionPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>,
      reason: "Ready leady mozu ist do existujucej kampane az po kontrole payloadu a schvaleni.",
      approvalRequired: true,
    });
  }
  return {
    mode: "smartlead-campaign-launch-preview",
    summary: campaignId
      ? `Smartlead launch preview: nakonfiguruj kampan ${campaignId} a priprav ${injectionPlan.totals.prepared} leadov v ${injectionPlan.totals.batches} batchoch. Ziadny zapis ani upload neprebehol.`
      : `Smartlead launch preview: pripravena nova kampan ${campaignSetup.campaignName} a ${injectionPlan.totals.prepared} leadov. Po vytvoreni kampane dopln campaignId a spusti add-leads preview.`,
    campaignMode: campaignId ? "configure-existing" : "create",
    campaignSetup,
    injectionPlan,
    nextToolCalls,
    approvalPayloads: {
      createCampaign: campaignId ? undefined : campaignSetup.createCampaignApprovalPayload,
      configureCampaign,
      addLeads: injectionPlan.addLeadsApprovalPayload,
    },
  };
}

export function buildSmartleadCampaignQaPreview(input: {
  launchPreview?: SmartleadCampaignLaunchPreview;
  campaignId?: string | number | null;
  campaignName?: string;
  leads?: SmartleadLead[];
  sequences?: NicheSmartleadCampaignSetupDraft["sequences"];
  schedule?: NicheSmartleadCampaignSetupDraft["schedule"];
  settings?: NicheSmartleadCampaignSetupDraft["settings"];
  nextToolCalls?: SmartleadCampaignLaunchPreview["nextToolCalls"];
  maxNewLeadsPerDay?: number;
}): SmartleadCampaignQaPreview {
  const launch = input.launchPreview;
  const campaignId = input.campaignId ?? launch?.injectionPlan.niche.campaignId ?? launch?.approvalPayloads.configureCampaign?.campaignId ?? null;
  const campaignName = input.campaignName ?? launch?.campaignSetup.campaignName;
  const leads = input.leads ?? launch?.injectionPlan.batches.flatMap((batch) => batch.leads) ?? [];
  const sequences = input.sequences ?? launch?.campaignSetup.sequences ?? [];
  const schedule = input.schedule ?? launch?.campaignSetup.schedule;
  const settings = input.settings ?? launch?.campaignSetup.settings;
  const nextToolCalls = input.nextToolCalls ?? launch?.nextToolCalls ?? [];
  const emails = leads.map((lead) => lead.email.trim().toLowerCase()).filter(Boolean);
  const duplicates = duplicateValues(emails);
  const genericEmails = emails.filter(isGenericEmail);
  const missingIntro = leads.filter((lead) => !String(lead.custom_fields?.personalized_intro ?? "").trim());
  const variantBodies = sequences.flatMap((sequence) => sequence.seq_variants.map((variant) => `${variant.subject}\n${variant.email_body}`));
  const requiredVariables = unique(["{{company_name}}", "{{personalized_intro}}", ...variantBodies.flatMap(extractTemplateVariables)]);
  const combinedSequenceText = variantBodies.join("\n");
  const missingVariables = requiredVariables.filter((variable) => !combinedSequenceText.includes(variable));
  const approvalCalls = nextToolCalls.filter((call) => call.approvalRequired).length;
  const checks: SmartleadCampaignQaPreview["checks"] = [];
  checks.push(checkItem(Boolean(campaignId || campaignName), "campaign-target", campaignId ? `Existing campaignId ${campaignId} is targeted.` : campaignName ? `New campaign ${campaignName} is prepared.` : "Missing campaignId or campaign name."));
  checks.push(checkItem(leads.length > 0, "lead-count", leads.length ? `${leads.length} lead(s) prepared.` : "No Smartlead leads prepared."));
  checks.push(checkItem(duplicates.length === 0, "duplicate-emails", duplicates.length ? `Duplicate emails: ${duplicates.join(", ")}` : "No duplicate emails."));
  checks.push(attentionItem(genericEmails.length === 0, "generic-emails", genericEmails.length ? `${genericEmails.length} generic inbox email(s) need review.` : "No generic inbox emails."));
  checks.push(attentionItem(missingIntro.length === 0, "personalized-intros", missingIntro.length ? `${missingIntro.length} lead(s) missing personalized_intro.` : "Every lead has personalized_intro."));
  checks.push(checkItem(sequences.length > 0, "sequences", sequences.length ? `${sequences.length} sequence step(s) prepared.` : "No sequence steps prepared."));
  checks.push(checkItem(missingVariables.length === 0, "sequence-variables", missingVariables.length ? `Missing variables in sequence copy: ${missingVariables.join(", ")}` : "Required variables appear in sequence copy."));
  checks.push(attentionItem(Boolean(schedule?.timezone && schedule.start_hour && schedule.end_hour), "schedule", schedule ? `Schedule ${schedule.timezone ?? "unknown"} ${schedule.start_hour ?? "?"}-${schedule.end_hour ?? "?"}.` : "No schedule prepared."));
  checks.push(attentionItem((schedule?.max_new_leads_per_day ?? 0) <= (input.maxNewLeadsPerDay ?? 50), "daily-limit", `Daily new-lead limit is ${schedule?.max_new_leads_per_day ?? "missing"}.`));
  checks.push(attentionItem(settings?.stopOnReply !== false, "stop-on-reply", settings?.stopOnReply === false ? "stopOnReply is disabled." : "stopOnReply is enabled or defaulted."));
  checks.push(checkItem(approvalCalls > 0, "approval-payloads", approvalCalls ? `${approvalCalls} approval-gated next call(s) prepared.` : "No approval-gated next calls prepared."));
  const status = checks.some((check) => check.status === "blocked") ? "blocked" : checks.some((check) => check.status === "attention") ? "attention" : "ready";
  return {
    mode: "smartlead-campaign-qa-preview",
    status,
    summary: `Smartlead campaign QA ${status}: ${leads.length} leadov, ${sequences.length} sekvencii, ${duplicates.length} duplicit, ${genericEmails.length} generic emailov, ${missingIntro.length} bez intra. Ziadny zapis ani upload neprebehol.`,
    checks,
    totals: {
      leads: leads.length,
      duplicateEmails: duplicates.length,
      genericEmails: genericEmails.length,
      missingPersonalizedIntro: missingIntro.length,
      sequenceCount: sequences.length,
      variants: sequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0),
      approvalCalls,
    },
    requiredVariables,
    missingVariables,
    nextToolCalls,
  };
}

export function buildSmartleadSequenceVariableRepairPreview(input: {
  sequences: SmartleadSequence[];
  campaignId?: string | number | null;
  targetVariable?: string;
  replacementVariable?: string;
  includeConfigurePayload?: boolean;
  leads?: SmartleadLead[];
}): SmartleadSequenceVariableRepairPreview {
  const targetVariable = input.targetVariable ?? "{{company_name}}";
  const replacementVariable = input.replacementVariable ?? "{{company_name_short}}";
  const changes: SmartleadSequenceVariableRepairPreview["changes"] = [];
  let bodyOccurrences = 0;
  let unchangedVariants = 0;
  const rewrittenSequences = input.sequences.map((sequence) => ({
    ...sequence,
    seq_variants: sequence.seq_variants.map((variant) => {
      const beforeSubject = variant.subject ?? "";
      const afterSubject = beforeSubject.split(targetVariable).join(replacementVariable);
      const bodyCount = countOccurrences(variant.email_body ?? "", targetVariable);
      bodyOccurrences += bodyCount;
      if (beforeSubject !== afterSubject) {
        changes.push({
          sequenceNumber: sequence.seq_number,
          variantLabel: variant.variant_label,
          beforeSubject,
          afterSubject,
          bodyOccurrences: bodyCount,
        });
      } else {
        unchangedVariants += 1;
      }
      return { ...variant, subject: afterSubject };
    }),
  }));
  const campaignId = input.campaignId ?? undefined;
  const configureCampaignApprovalPayload = campaignId && input.includeConfigurePayload !== false && changes.length
    ? { campaignId, sequences: rewrittenSequences, approval: { approved: true as const } }
    : undefined;
  const nextToolCalls: SmartleadSequenceVariableRepairPreview["nextToolCalls"] = [];
  if (configureCampaignApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.configure_smartlead_campaign",
      payload: configureCampaignApprovalPayload as unknown as Record<string, unknown>,
      reason: `Po schvaleni prepis Smartlead sequence subjecty z ${targetVariable} na ${replacementVariable}.`,
      approvalRequired: true,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_smartlead_campaign_qa_preview",
    payload: { campaignId, sequences: rewrittenSequences, leads: input.leads ?? [] },
    reason: "Po oprave premennych znovu skontroluj kampan pred odoslanim alebo uploadom leadov.",
    approvalRequired: false,
  });
  const warnings: string[] = [];
  if (bodyOccurrences > 0) warnings.push(`${targetVariable} sa stale nachadza v email_body ${bodyOccurrences} krat; tento preview meni iba subjecty.`);
  if (changes.length > 0) warnings.push(`Leady musia mat custom_fields.${replacementVariable.replace(/[{}]/g, "")} pred spustenim kampane.`);
  const totals = {
    sequences: input.sequences.length,
    variants: input.sequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0),
    subjectsChanged: changes.length,
    bodyOccurrences,
    unchangedVariants,
  };
  const status: SmartleadSequenceVariableRepairPreview["status"] = input.sequences.length === 0 ? "blocked" : changes.length > 0 ? "ready" : bodyOccurrences > 0 ? "attention" : "attention";
  return {
    mode: "smartlead-sequence-variable-repair-preview",
    status,
    summary: `Smartlead sequence variable repair: ${totals.subjectsChanged} subjectov prepisanych z ${targetVariable} na ${replacementVariable}, ${totals.bodyOccurrences} body vyskytov ostava na kontrolu. Ziadny Smartlead zapis neprebehol.`,
    totals,
    targetVariable,
    replacementVariable,
    rewrittenSequences,
    changes,
    warnings,
    configureCampaignApprovalPayload,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function previewSmartleadEmailRendering(input: {
  leads: SmartleadLead[];
  sequences: NicheSmartleadCampaignSetupDraft["sequences"];
  signature?: string;
  maxLeads?: number;
  maxRendered?: number;
}): SmartleadEmailRenderingPreview {
  const maxLeads = Math.min(Math.max(Math.trunc(input.maxLeads ?? 10), 1), 50);
  const maxRendered = Math.min(Math.max(Math.trunc(input.maxRendered ?? 50), 1), 250);
  const leads = input.leads.slice(0, maxLeads);
  const signature = input.signature ?? "%signature%";
  const rendered: SmartleadEmailRenderingPreview["rendered"] = [];
  for (const lead of leads) {
    const values = smartleadTemplateValues(lead, signature);
    for (const sequence of input.sequences) {
      for (const variant of sequence.seq_variants) {
        const subject = renderTemplate(variant.subject, values);
        const emailBody = renderTemplate(variant.email_body, values);
        const missingVariables = unique([...unresolvedTemplateVariables(subject), ...unresolvedTemplateVariables(emailBody)]);
        rendered.push({
          email: lead.email,
          companyName: lead.company_name,
          sequenceNumber: sequence.seq_number,
          variantLabel: variant.variant_label,
          subject,
          emailBody,
          missingVariables,
        });
        if (rendered.length >= maxRendered) break;
      }
      if (rendered.length >= maxRendered) break;
    }
    if (rendered.length >= maxRendered) break;
  }
  const warnings: string[] = [];
  const missingVariableInstances = rendered.reduce((sum, item) => sum + item.missingVariables.length, 0);
  if (missingVariableInstances) warnings.push(`${missingVariableInstances} unresolved template variable instance(s).`);
  if (input.signature === undefined) warnings.push("Signature placeholder was left as %signature%; Smartlead/account signature should fill it.");
  const variants = input.sequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0);
  return {
    mode: "smartlead-email-rendering-preview",
    summary: `Smartlead email rendering preview: ${rendered.length} email variantov pre ${leads.length} leadov, ${missingVariableInstances} unresolved premennych. Ziadny email nebol odoslany.`,
    totals: { leads: leads.length, sequenceSteps: input.sequences.length, variants, renderedEmails: rendered.length, missingVariableInstances },
    rendered,
    warnings,
  };
}

export function previewLeadEnrichmentBatch(input: {
  leads: Array<ManualReviewPickupLead & {
    scraped?: Partial<ScrapedWebsiteContacts>;
    register?: Partial<SlovakRegisterLookup>;
    preAi?: { emails?: string[]; phones?: string[]; contextPreview?: string };
  }>;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  campaignTag?: string;
  defaultSource?: string;
  minScore?: number;
  batchSize?: number;
}): LeadEnrichmentBatchPreview {
  const normalized = input.leads.map((lead) => normalizeEnrichmentLead(lead, input.campaignTag ?? input.niche?.slug, input.defaultSource));
  const deduped = dedupeLeadCandidates({ leads: normalized });
  const minScore = input.minScore ?? 70;
  const reviewQueue = buildManualReviewQueue({ leads: deduped.unique, minScore });
  const score = scoreLeadQuality({
    minScore,
    leads: deduped.unique.map((lead) => ({
      email: lead.email,
      companyName: lead.companyName,
      website: lead.website,
      decisionMaker: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || stringField(lead.customFields ?? {}, "decision_maker_name"),
      ico: stringField(lead.customFields ?? {}, "ico"),
      registerVerified: booleanField(lead.customFields ?? {}, "register_verified"),
      personalizedIntro: lead.personalizedIntro,
      verificationStatus: stringField(lead.customFields ?? {}, "verification_status") as LeadQualityInput["verificationStatus"],
    })),
  });
  const smartleadPlan = input.niche
    ? buildSmartleadInjectionPlan({
        niche: input.niche,
        leads: reviewQueue.ready.map((item) => ({
          ...item.lead,
          manuallyReviewed: true,
          sentToSmartlead: false,
          nicheId: input.niche?.id,
          nicheSlug: input.niche?.slug,
          nicheName: input.niche?.name,
          smartleadCampaignId: input.niche?.campaignId ?? undefined,
        })),
        batchSize: input.batchSize,
      })
    : undefined;
  const nextToolCalls = buildEnrichmentNextToolCalls(deduped.unique, reviewQueue, input.niche, smartleadPlan);
  return {
    mode: "lead-enrichment-batch-preview",
    summary: `Lead enrichment preview: ${reviewQueue.ready.length} ready, ${reviewQueue.review.length} manual review, ${reviewQueue.rejected.length} rejected, ${deduped.duplicates.length} duplicate. Ziadny zapis ani upload neprebehol.`,
    totals: {
      input: input.leads.length,
      unique: deduped.unique.length,
      duplicates: deduped.duplicates.length,
      readyForSmartlead: reviewQueue.ready.length,
      manualReview: reviewQueue.review.length,
      rejected: reviewQueue.rejected.length,
    },
    leads: deduped.unique,
    duplicates: deduped.duplicates,
    score,
    reviewQueue,
    smartleadPlan,
    nextToolCalls,
  };
}

export function buildLeadEnrichmentMergePreview(input: {
  leads: LeadCandidateInput[];
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  introDrafts?: Array<Partial<LeadIntroDraft>>;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  campaignTag?: string;
  defaultSource?: string;
  minScore?: number;
  batchSize?: number;
  maxNextCalls?: number;
}): LeadEnrichmentMergePreview {
  const scrapedUsed = new Set<number>();
  const introUsed = new Set<number>();
  const scraped = input.scrapedResults ?? [];
  const intros = input.introDrafts ?? [];
  const leads = input.leads.map((lead) => {
    const scrapeIndex = scraped.findIndex((item, index) => !scrapedUsed.has(index) && scrapeMatchesLead(item, lead));
    if (scrapeIndex >= 0) scrapedUsed.add(scrapeIndex);
    const introIndex = intros.findIndex((item, index) => !introUsed.has(index) && introMatchesLead(item, lead));
    if (introIndex >= 0) introUsed.add(introIndex);
    const matchedScrape = scrapeIndex >= 0 ? scraped[scrapeIndex] : undefined;
    const matchedIntro = introIndex >= 0 ? intros[introIndex] : undefined;
    return {
      ...lead,
      email: lead.email ?? selectBestEmail(matchedScrape?.emails ?? []),
      phone: lead.phone ?? matchedScrape?.phones?.[0],
      scraped: matchedScrape,
      intro: matchedIntro,
      personalizedIntro: lead.personalizedIntro ?? matchedIntro?.personalizedIntro,
      context: matchedScrape?.textPreview,
    };
  });
  const enrichmentPreview = previewLeadEnrichmentBatch({
    leads,
    niche: input.niche,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource ?? "enrichment-merge",
    minScore: input.minScore,
    batchSize: input.batchSize,
  });
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 100);
  const nextToolCalls = dedupeNextToolCalls(enrichmentPreview.nextToolCalls.map((call) => ({
    ...call,
    approvalRequired: call.tool === "arcigy.add_leads_to_smartlead_campaign",
  }))).slice(0, maxNextCalls);
  const unmatchedScrapes = scraped.filter((_item, index) => !scrapedUsed.has(index));
  const unmatchedIntros = intros.filter((_item, index) => !introUsed.has(index));
  return {
    mode: "lead-enrichment-merge-preview",
    summary: `Lead enrichment merge: ${leads.length} leadov, ${scrapedUsed.size} scrape matchov, ${introUsed.size} intro matchov, ${enrichmentPreview.totals.readyForSmartlead} ready do Smartlead. Ziadny zapis ani upload neprebehol.`,
    totals: {
      input: input.leads.length,
      enriched: leads.filter((lead) => lead.scraped || lead.intro || lead.email || lead.personalizedIntro).length,
      matchedScrapes: scrapedUsed.size,
      matchedIntros: introUsed.size,
      unmatchedScrapes: unmatchedScrapes.length,
      unmatchedIntros: unmatchedIntros.length,
      readyForSmartlead: enrichmentPreview.totals.readyForSmartlead,
      manualReview: enrichmentPreview.totals.manualReview,
      rejected: enrichmentPreview.totals.rejected,
    },
    leads,
    unmatchedScrapes,
    unmatchedIntros,
    enrichmentPreview,
    nextToolCalls,
  };
}

export function buildLeadgenGapReport(input: {
  leads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  minScore?: number;
  batchSize?: number;
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
}): LeadgenGapReport {
  const normalized = input.leads.map((lead) => normalizePipelineLead(lead, input.campaignTag ?? input.niche?.slug, input.defaultSource));
  const deduped = dedupeLeadCandidates({ leads: normalized });
  const score = scoreLeadQuality({
    leads: deduped.unique.map((lead) => ({
      email: lead.email,
      companyName: lead.companyName,
      website: lead.website,
      decisionMaker: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || String(lead.customFields?.decision_maker_name ?? ""),
      personalizedIntro: lead.personalizedIntro,
      verificationStatus: lead.customFields?.verification_status === "failed" ? "failed" : lead.customFields?.verification_status === "flagged" ? "flagged" : undefined,
    })),
    minScore: input.minScore ?? 70,
  });
  const queue = buildManualReviewQueue({ leads: deduped.unique, minScore: input.minScore ?? 70 });
  const scoredByKey = new Map(score.scoredLeads.map((lead) => [leadIdentityKey(lead)?.value ?? `${lead.companyName ?? ""}|${lead.email ?? ""}|${lead.website ?? ""}`, lead]));
  const recommendationByKey = new Map(
    [...queue.ready, ...queue.review, ...queue.rejected].map((item) => [leadIdentityKey(item.lead)?.value ?? `${item.lead.companyName ?? ""}|${item.lead.email ?? ""}|${item.lead.website ?? ""}`, item])
  );
  const leads = deduped.unique.map((lead) => {
    const key = leadIdentityKey(lead)?.value ?? `${lead.companyName ?? ""}|${lead.email ?? ""}|${lead.website ?? ""}`;
    const scored = scoredByKey.get(key);
    const recommendation = recommendationByKey.get(key);
    return {
      lead,
      gaps: leadGaps(lead),
      recommendation: recommendation?.recommendation ?? (scored?.passed ? "ready_for_import" as const : "manual_review" as const),
      score: scored?.score ?? 0,
    };
  });
  const readyLeads = queue.ready.map((item) => item.lead);
  const smartleadPlan = input.niche && readyLeads.length
    ? buildSmartleadInjectionPlan({ niche: input.niche, leads: readyLeads, batchSize: input.batchSize })
    : undefined;
  const websitesToScrape = unique(deduped.unique.filter((lead) => lead.website && !lead.email).map((lead) => String(lead.website))).slice(0, 50);
  const introsToDraft = deduped.unique
    .filter((lead) => lead.companyName && !lead.personalizedIntro)
    .slice(0, 50)
    .map((lead) => ({ companyName: String(lead.companyName), website: lead.website, context: String(lead.customFields?.context_preview ?? ""), offer: input.offer, language: input.language ?? "sk" }));
  const nextToolCalls: LeadgenGapReport["nextToolCalls"] = [];
  if (websitesToScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: websitesToScrape, includePriorityPages: true, maxPages: 4, maxSites: Math.min(websitesToScrape.length, 50) },
      reason: "Leady maju web, ale chyba email; najprv skus batch scrape kontaktov.",
      approvalRequired: false,
    });
  }
  if (introsToDraft.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: introsToDraft, offer: input.offer, language: input.language ?? "sk", maxLeads: Math.min(introsToDraft.length, 50) },
      reason: "Chybaju personalizovane AI intra pred Smartlead sekvenciou.",
      approvalRequired: false,
    });
  }
  if (input.niche && readyLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { niche: input.niche, leads: readyLeads, batchSize: input.batchSize },
      reason: "Ready leady priprav do Smartlead lead_list batchov bez uploadu.",
      approvalRequired: false,
    });
  }
  if (smartleadPlan?.addLeadsApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: smartleadPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>,
      reason: "Upload do Smartlead az po explicitnom schvaleni operatora.",
      approvalRequired: true,
    });
  } else if (input.niche && readyLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.draft_niche_smartlead_campaign_setup",
      payload: { niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name }, offer: input.offer, language: input.language ?? "sk" },
      reason: "Niche nema campaignId; pred uploadom priprav Smartlead kampan.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: input.leads.length,
    unique: deduped.unique.length,
    duplicates: deduped.duplicates.length,
    readyForSmartlead: queue.ready.length,
    manualReview: queue.review.length,
    rejected: queue.rejected.length,
    missingEmail: leads.filter((item) => item.gaps.includes("email")).length,
    missingWebsite: leads.filter((item) => item.gaps.includes("website")).length,
    missingIntro: leads.filter((item) => item.gaps.includes("personalized_intro")).length,
    missingDecisionMaker: leads.filter((item) => item.gaps.includes("decision_maker")).length,
    missingCampaignId: input.niche?.campaignId ? 0 : queue.ready.length,
  };
  return {
    mode: "leadgen-gap-report",
    summary: `Leadgen gap report: ${totals.readyForSmartlead} ready, ${totals.manualReview} manual review, ${totals.rejected} rejected; chyba ${totals.missingEmail} emailov, ${totals.missingIntro} intier. Ziadny zapis ani upload neprebehol.`,
    totals,
    leads,
    duplicates: deduped.duplicates,
    nextToolCalls,
  };
}

export function buildLeadgenCampaignPipelinePreview(input: {
  leads: Array<LeadCandidateInput & {
    scraped?: Partial<ScrapedWebsiteContacts>;
    intro?: Partial<LeadIntroDraft>;
    context?: string;
  }>;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  maxNextCalls?: number;
}): LeadgenCampaignPipelinePreview {
  const normalized = input.leads.map((lead) => normalizePipelineLead(lead, input.campaignTag ?? input.niche?.slug, input.defaultSource));
  const enrichmentPreview = previewLeadEnrichmentBatch({
    leads: normalized,
    niche: input.niche,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource,
    minScore: input.minScore,
    batchSize: input.batchSize,
  });
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 20), 1), 50);
  const websitesToScrape = unique(enrichmentPreview.leads.filter((lead) => lead.website && !lead.email).map((lead) => lead.website as string)).slice(0, maxNextCalls);
  const introInputs = enrichmentPreview.leads
    .filter((lead) => lead.companyName && !lead.personalizedIntro)
    .map((lead) => ({
      companyName: lead.companyName as string,
      website: lead.website,
      context: stringField(lead.customFields ?? {}, "context_preview"),
      offer: input.offer,
      language: input.language ?? "sk",
    }))
    .slice(0, maxNextCalls);
  const nextToolCalls: LeadgenCampaignPipelinePreview["nextToolCalls"] = [];
  if (websitesToScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: websitesToScrape, includePriorityPages: true, maxPages: 4, maxSites: websitesToScrape.length },
      reason: "Tieto leady maju web, ale chybaju im emaily; najprv vytiahni kontakty z webu.",
    });
  }
  if (introInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: introInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: introInputs.length },
      reason: "Tieto leady maju firmu, ale chybaju im personalizovane intra pre cold email.",
    });
  }
  nextToolCalls.push({
    tool: "arcigy.preview_lead_enrichment_batch",
    payload: {
      leads: normalized,
      niche: input.niche,
      campaignTag: input.campaignTag,
      defaultSource: input.defaultSource,
      minScore: input.minScore,
      batchSize: input.batchSize,
    },
    reason: "Po scrape/intro krokoch znovu prepocitaj dedupe, score, manual review a Smartlead plan.",
  });
  if (enrichmentPreview.smartleadPlan?.addLeadsApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: enrichmentPreview.smartleadPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>,
      reason: "Ready leady mozu ist do Smartlead az po explicitnom schvaleni operatorom.",
    });
  } else if (input.niche && enrichmentPreview.totals.readyForSmartlead > 0) {
    nextToolCalls.push({
      tool: "arcigy.draft_niche_smartlead_campaign_setup",
      payload: { niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name }, offer: input.offer, language: input.language ?? "sk" },
      reason: "Niche nema campaignId; priprav Smartlead kampan pred uploadom leadov.",
    });
  }
  const contactsPrepared = enrichmentPreview.leads.filter((lead) => Boolean(lead.email)).length;
  const introsPrepared = enrichmentPreview.leads.filter((lead) => Boolean(lead.personalizedIntro)).length;
  return {
    mode: "leadgen-campaign-pipeline-preview",
    summary: `Leadgen pipeline preview: ${enrichmentPreview.totals.readyForSmartlead} ready do Smartlead, ${websitesToScrape.length} webov na scrape, ${introInputs.length} intro draftov, ${enrichmentPreview.totals.manualReview} manual review. Ziadny zapis ani upload neprebehol.`,
    totals: {
      input: input.leads.length,
      unique: enrichmentPreview.totals.unique,
      duplicates: enrichmentPreview.totals.duplicates,
      contactsPrepared,
      introsPrepared,
      websitesToScrape: websitesToScrape.length,
      introsToDraft: introInputs.length,
      readyForSmartlead: enrichmentPreview.totals.readyForSmartlead,
      manualReview: enrichmentPreview.totals.manualReview,
      rejected: enrichmentPreview.totals.rejected,
    },
    leads: enrichmentPreview.leads,
    websitesToScrape,
    introInputs,
    enrichmentPreview,
    smartleadPlan: enrichmentPreview.smartleadPlan,
    nextToolCalls,
  };
}

export function buildColdOutreachCsvImportPreview(input: {
  csvText: string;
  delimiter?: "," | ";";
  maxRows?: number;
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  schedule?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"];
  settings?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"];
  minScore?: number;
  batchSize?: number;
}): ColdOutreachCsvImportPreview {
  const parsed = parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows });
  const filtered = filterBlacklistedLeads({
    leads: parsed.leads,
    domains: input.blacklistDomains,
    keywords: input.blacklistKeywords,
  });
  const pipelinePreview = buildLeadgenCampaignPipelinePreview({
    leads: filtered.allowed,
    niche: input.niche,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource ?? "csv-import",
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    batchSize: input.batchSize,
  });
  const readyLeads = pipelinePreview.enrichmentPreview.reviewQueue.ready.map((item) => item.lead);
  const launchPreview = input.niche && readyLeads.length
    ? buildSmartleadCampaignLaunchPreview({
        niche: input.niche,
        leads: readyLeads,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language,
        clientId: input.clientId,
        emailAccountIds: input.emailAccountIds,
        webhookUrl: input.webhookUrl,
        schedule: input.schedule,
        settings: input.settings,
        batchSize: input.batchSize,
      })
    : undefined;
  const nextToolCalls: ColdOutreachCsvImportPreview["nextToolCalls"] = [
    ...pipelinePreview.nextToolCalls.map((call) => ({
      ...call,
      approvalRequired: call.tool === "arcigy.add_leads_to_smartlead_campaign",
    })),
  ];
  if (launchPreview) nextToolCalls.push(...launchPreview.nextToolCalls);
  return {
    mode: "cold-outreach-csv-import-preview",
    summary: `CSV import preview: ${parsed.leads.length} parsed, ${filtered.blocked.length} blocked, ${pipelinePreview.totals.readyForSmartlead} ready do Smartlead, ${pipelinePreview.totals.manualReview} manual review. Ziadny zapis ani upload neprebehol.`,
    totals: {
      parsed: parsed.leads.length,
      skippedRows: parsed.skipped.length,
      blocked: filtered.blocked.length,
      allowed: filtered.allowed.length,
      readyForSmartlead: pipelinePreview.totals.readyForSmartlead,
      manualReview: pipelinePreview.totals.manualReview,
      rejected: pipelinePreview.totals.rejected,
    },
    parsed,
    filtered,
    pipelinePreview,
    launchPreview,
    nextToolCalls,
  };
}

export function buildLeadSourceImportQueuePreview(input: {
  sourceName?: string;
  sourceType?: "google_maps" | "csv" | "serper" | "manual" | "other";
  leads?: LeadSourceImportQueueLead[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  niches?: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[] }>;
  defaultNiche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingSmartleadLeadsByCampaign?: Record<string, Array<Record<string, unknown>>>;
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  maxNextCalls?: number;
}): LeadSourceImportQueuePreview {
  const parsed = input.csvText
    ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows })
    : { headers: [], leads: [], skipped: [] };
  const rawLeads = [...(input.leads ?? []), ...parsed.leads] as LeadSourceImportQueueLead[];
  const filtered = filterBlacklistedLeads({
    leads: rawLeads,
    domains: input.blacklistDomains,
    keywords: input.blacklistKeywords,
  });
  const allowed = filtered.allowed.map((lead) => normalizeSourceQueueLead(lead as LeadSourceImportQueueLead, input.sourceName, input.defaultSource));
  const groups = new Map<string, { niche: { id?: string; slug: string; name: string; campaignId?: string | number | null }; leads: LeadSourceImportQueueLead[] }>();
  const unassigned: LeadSourceImportQueueLead[] = [];
  for (const lead of allowed) {
    const niche = resolveLeadQueueNiche(lead, input.niches, input.defaultNiche);
    if (!niche) {
      unassigned.push(lead);
      continue;
    }
    const key = niche.slug;
    const group = groups.get(key) ?? { niche, leads: [] };
    group.leads.push(lead);
    groups.set(key, group);
  }

  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 80);
  const nextToolCalls: LeadSourceImportQueuePreview["nextToolCalls"] = [];
  const groupResults = [...groups.values()].map((group) => {
    const pipelinePreview = buildLeadgenCampaignPipelinePreview({
      leads: group.leads,
      niche: group.niche,
      campaignTag: input.campaignTag ?? group.niche.slug,
      defaultSource: input.defaultSource ?? input.sourceName ?? "lead-source-import",
      offer: input.offer,
      language: input.language,
      minScore: input.minScore,
      batchSize: input.batchSize,
      maxNextCalls,
    });
    const readyLeads = pipelinePreview.enrichmentPreview.reviewQueue.ready
      .map((item) => item.lead)
      .filter((lead): lead is PreparedSmartleadLeadInput => Boolean(lead.email));
    const smartleadLeads = prepareSmartleadLeads({ leads: readyLeads, defaultSource: input.defaultSource ?? input.sourceName }).leadList;
    const campaignKey = group.niche.campaignId === undefined || group.niche.campaignId === null ? undefined : String(group.niche.campaignId);
    const importAudit = smartleadLeads.length
      ? buildSmartleadImportAuditPreview({
          campaignId: group.niche.campaignId,
          leads: smartleadLeads,
          existingSmartleadLeads: campaignKey ? input.existingSmartleadLeadsByCampaign?.[campaignKey] : undefined,
        })
      : undefined;
    nextToolCalls.push(
      ...pipelinePreview.nextToolCalls.map((call) => ({
        ...call,
        approvalRequired: call.tool === "arcigy.add_leads_to_smartlead_campaign",
      }))
    );
    if (importAudit) nextToolCalls.push(...importAudit.nextToolCalls);
    return { niche: group.niche, leads: group.leads, pipelinePreview, importAudit };
  });

  if (unassigned.length) {
    nextToolCalls.push({
      tool: "arcigy.build_batch_niche_discovery_plan",
      payload: {
        niches: unique(unassigned.map((lead) => lead.companyName ?? lead.website ?? "unassigned-leads")).slice(0, Math.min(unassigned.length, 20)).map((name) => ({ slug: slugify(String(name)), name: String(name) })),
      },
      reason: "Cast leadov nema priradenu niche/kampan; najprv priprav niche mapping pred Smartlead importom.",
      approvalRequired: false,
    });
  }

  const dedupedCalls = dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls);
  const totals = {
    input: rawLeads.length,
    parsedFromCsv: parsed.leads.length,
    allowed: allowed.length,
    blocked: filtered.blocked.length,
    groups: groupResults.length,
    readyForSmartlead: groupResults.reduce((sum, group) => sum + group.pipelinePreview.totals.readyForSmartlead, 0),
    manualReview: groupResults.reduce((sum, group) => sum + group.pipelinePreview.totals.manualReview, 0),
    rejected: groupResults.reduce((sum, group) => sum + group.pipelinePreview.totals.rejected, 0),
    websitesToScrape: groupResults.reduce((sum, group) => sum + group.pipelinePreview.totals.websitesToScrape, 0),
    introsToDraft: groupResults.reduce((sum, group) => sum + group.pipelinePreview.totals.introsToDraft, 0),
    unassigned: unassigned.length,
  };
  return {
    mode: "lead-source-import-queue-preview",
    summary: `Lead source import queue: ${totals.groups} skupin, ${totals.readyForSmartlead} ready do Smartlead, ${totals.manualReview} manual review, ${totals.websitesToScrape} webov na scrape, ${totals.introsToDraft} intro draftov. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName ?? "lead-source", type: input.sourceType ?? (input.csvText ? "csv" : "manual") },
    totals,
    groups: groupResults,
    unassigned,
    blocked: filtered.blocked,
    nextToolCalls: dedupedCalls,
  };
}

export function buildLeadSourceBundlePreview(input: {
  bundleName?: string;
  sources: Array<{
    sourceName?: string;
    sourceType?: "google_maps" | "csv" | "json" | "serper" | "manual" | "other";
    leads?: LeadSourceImportQueueLead[];
    csvText?: string;
    jsonText?: string;
    delimiter?: "," | ";";
    maxRows?: number;
    defaultNiche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  }>;
  niches?: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[] }>;
  defaultNiche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingSmartleadLeadsByCampaign?: Record<string, Array<Record<string, unknown>>>;
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  auditIntros?: boolean;
  maxNextCalls?: number;
}): LeadSourceBundlePreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 80), 1), 150);
  const sourceSummaries: LeadSourceBundlePreview["sources"] = [];
  const mergedLeads: LeadSourceImportQueueLead[] = [];
  let parsedCsv = 0;
  let parsedJson = 0;
  let skippedRows = 0;
  for (const [index, source] of input.sources.slice(0, 20).entries()) {
    const name = source.sourceName?.trim() || `${input.bundleName ?? "lead-source"}-${index + 1}`;
    const warnings: string[] = [];
    const csv = source.csvText
      ? parseLeadsCsv({ csvText: source.csvText, delimiter: source.delimiter, maxRows: source.maxRows })
      : { headers: [], leads: [] as LeadCsvRow[], skipped: [] };
    const json = source.jsonText ? parseJsonLeadExport(source.jsonText) : { leads: [] as LeadSourceImportQueueLead[], warnings: [] as string[] };
    warnings.push(...json.warnings);
    const direct = source.leads ?? [];
    const niche = source.defaultNiche ?? input.defaultNiche;
    const sourceLeads = [...direct, ...csv.leads, ...json.leads].map((lead) => withSourceBundleDefaults(lead, name, source.sourceType, niche));
    mergedLeads.push(...sourceLeads);
    parsedCsv += csv.leads.length;
    parsedJson += json.leads.length;
    skippedRows += csv.skipped.length;
    sourceSummaries.push({
      name,
      type: source.sourceType ?? (source.csvText ? "csv" : source.jsonText ? "json" : "manual"),
      totals: {
        directLeads: direct.length,
        parsedCsv: csv.leads.length,
        parsedJson: json.leads.length,
        skippedRows: csv.skipped.length,
        warnings: warnings.length,
      },
      warnings,
    });
  }

  const sourcePreview = buildLeadSourceImportQueuePreview({
    sourceName: input.bundleName ?? "lead-source-bundle",
    sourceType: "manual",
    leads: mergedLeads,
    niches: input.niches,
    defaultNiche: input.defaultNiche,
    blacklistDomains: input.blacklistDomains,
    blacklistKeywords: input.blacklistKeywords,
    existingSmartleadLeadsByCampaign: input.existingSmartleadLeadsByCampaign,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource ?? input.bundleName ?? "lead-source-bundle",
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    batchSize: input.batchSize,
    maxNextCalls,
  });
  const autopilotPreview = input.auditIntros === false
    ? undefined
    : buildLeadgenAutopilotBatchPreview({
        sourceName: input.bundleName ?? "lead-source-bundle",
        sourceType: "manual",
        leads: mergedLeads,
        niches: input.niches,
        defaultNiche: input.defaultNiche,
        blacklistDomains: input.blacklistDomains,
        blacklistKeywords: input.blacklistKeywords,
        existingSmartleadLeadsByCampaign: input.existingSmartleadLeadsByCampaign,
        campaignTag: input.campaignTag,
        defaultSource: input.defaultSource ?? input.bundleName ?? "lead-source-bundle",
        offer: input.offer,
        language: input.language,
        minScore: input.minScore,
        batchSize: input.batchSize,
        auditIntros: true,
        maxNextCalls,
      });
  const nextToolCalls = dedupeNextToolCalls(autopilotPreview?.nextToolCalls ?? sourcePreview.nextToolCalls).slice(0, maxNextCalls);
  const approvalCalls = nextToolCalls.filter((call) => call.approvalRequired).length;
  const totals = {
    sources: sourceSummaries.length,
    inputLeads: mergedLeads.length,
    parsedCsv,
    parsedJson,
    skippedRows,
    groups: sourcePreview.totals.groups,
    readyForSmartlead: sourcePreview.totals.readyForSmartlead,
    manualReview: sourcePreview.totals.manualReview,
    rejected: sourcePreview.totals.rejected,
    websitesToScrape: sourcePreview.totals.websitesToScrape,
    introsToDraft: sourcePreview.totals.introsToDraft,
    unassigned: sourcePreview.totals.unassigned,
    approvalCalls,
    readOnlyCalls: nextToolCalls.length - approvalCalls,
  };
  const status: LeadSourceBundlePreview["status"] =
    totals.sources === 0 || totals.inputLeads === 0 || totals.groups === 0 || totals.unassigned > 0
      ? "blocked"
      : totals.readyForSmartlead > 0 && totals.websitesToScrape === 0 && totals.introsToDraft === 0
        ? "ready"
        : "attention";
  return {
    mode: "lead-source-bundle-preview",
    status,
    summary: `Lead source bundle: ${status}, ${totals.sources} zdrojov, ${totals.inputLeads} leadov, ${totals.groups} skupin, ${totals.readyForSmartlead} ready do Smartlead, ${totals.websitesToScrape} scrape, ${totals.introsToDraft} intro draft, ${approvalCalls} approval krokov. Ziadny zapis ani upload neprebehol.`,
    sources: sourceSummaries,
    totals,
    sourcePreview,
    autopilotPreview,
    nextToolCalls,
  };
}

export function buildLeadSourceBundleCampaignLaunchPreview(input: {
  bundleName?: string;
  sources: Parameters<typeof buildLeadSourceBundlePreview>[0]["sources"];
  niches?: Parameters<typeof buildLeadSourceBundlePreview>[0]["niches"];
  defaultNiche?: Parameters<typeof buildLeadSourceBundlePreview>[0]["defaultNiche"];
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingSmartleadLeadsByCampaign?: Record<string, Array<Record<string, unknown>>>;
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  auditIntros?: boolean;
  maxNextCalls?: number;
  maxLaunchGroups?: number;
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  schedule?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"];
  settings?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"];
  senderAccounts?: SmartleadSenderAccountInput[];
  requestedDailyLimit?: number;
  minTimeBetweenEmailsMinutes?: number;
}): LeadSourceBundleCampaignLaunchPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 120), 1), 180);
  const maxLaunchGroups = Math.min(Math.max(Math.trunc(input.maxLaunchGroups ?? 5), 1), 20);
  const bundlePreview = buildLeadSourceBundlePreview({
    bundleName: input.bundleName,
    sources: input.sources,
    niches: input.niches,
    defaultNiche: input.defaultNiche,
    blacklistDomains: input.blacklistDomains,
    blacklistKeywords: input.blacklistKeywords,
    existingSmartleadLeadsByCampaign: input.existingSmartleadLeadsByCampaign,
    campaignTag: input.campaignTag,
    defaultSource: input.defaultSource,
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    batchSize: input.batchSize,
    auditIntros: input.auditIntros,
    maxNextCalls,
  });
  const handoffPackages: LeadSourceBundleCampaignLaunchPreview["handoffPackages"] = [];
  const skippedGroups: LeadSourceBundleCampaignLaunchPreview["skippedGroups"] = [];
  for (const group of bundlePreview.sourcePreview.groups.slice(0, maxLaunchGroups)) {
    const readyLeads = group.pipelinePreview.enrichmentPreview.reviewQueue.ready.map((item) => item.lead);
    if (!readyLeads.length) {
      skippedGroups.push({ niche: group.niche, reason: "No ready leads after enrichment/review; run scrape/AI intro/manual review first." });
      continue;
    }
    const handoffPackage = buildSmartleadCampaignHandoffPackagePreview({
      niche: group.niche,
      leads: readyLeads,
      offer: input.offer,
      painPoint: input.painPoint,
      language: input.language,
      clientId: input.clientId,
      emailAccountIds: input.emailAccountIds,
      webhookUrl: input.webhookUrl,
      schedule: input.schedule,
      settings: input.settings,
      batchSize: input.batchSize,
      senderAccounts: input.senderAccounts,
      requestedDailyLimit: input.requestedDailyLimit,
      minTimeBetweenEmailsMinutes: input.minTimeBetweenEmailsMinutes,
    });
    handoffPackages.push({ niche: group.niche, readyLeads: readyLeads.length, handoffPackage });
  }
  for (const group of bundlePreview.sourcePreview.groups.slice(maxLaunchGroups)) {
    skippedGroups.push({ niche: group.niche, reason: `Skipped by maxLaunchGroups=${maxLaunchGroups}; run this niche in a separate launch preview.` });
  }
  const nextToolCalls = dedupeNextToolCalls([
    ...bundlePreview.nextToolCalls,
    ...handoffPackages.flatMap((item) => item.handoffPackage.nextToolCalls),
  ]).slice(0, maxNextCalls);
  const approvalCalls = nextToolCalls.filter((call) => call.approvalRequired).length;
  const blockedPackages = handoffPackages.filter((item) => item.handoffPackage.status === "blocked").length;
  const attentionPackages = handoffPackages.filter((item) => item.handoffPackage.status === "attention").length;
  const readyLeads = handoffPackages.reduce((sum, item) => sum + item.readyLeads, 0);
  const status: LeadSourceBundleCampaignLaunchPreview["status"] =
    bundlePreview.status === "blocked" || !handoffPackages.length || blockedPackages > 0
      ? "blocked"
      : bundlePreview.status === "attention" || attentionPackages > 0 || skippedGroups.length > 0
        ? "attention"
        : "ready";
  return {
    mode: "lead-source-bundle-campaign-launch-preview",
    status,
    summary: `Bundle campaign launch preview: ${status}, ${handoffPackages.length}/${bundlePreview.sourcePreview.totals.groups} launch skupin, ${readyLeads} ready leadov, ${approvalCalls} approval krokov. Ziadny zapis ani upload neprebehol.`,
    bundlePreview,
    handoffPackages,
    skippedGroups,
    totals: {
      groups: bundlePreview.sourcePreview.totals.groups,
      launchGroups: handoffPackages.length,
      skippedGroups: skippedGroups.length,
      readyLeads,
      approvalCalls,
      readOnlyCalls: nextToolCalls.length - approvalCalls,
      blockedPackages,
      attentionPackages,
    },
    nextToolCalls,
  };
}

export function buildLeadgenAutopilotBatchPreview(input: {
  sourceName?: string;
  sourceType?: "google_maps" | "csv" | "serper" | "manual" | "other";
  leads?: LeadSourceImportQueueLead[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  niches?: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[] }>;
  defaultNiche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingSmartleadLeadsByCampaign?: Record<string, Array<Record<string, unknown>>>;
  campaignTag?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  auditIntros?: boolean;
  maxNextCalls?: number;
}): LeadgenAutopilotBatchPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 60), 1), 120);
  const sourcePreview = buildLeadSourceImportQueuePreview({ ...input, maxNextCalls });
  const auditLeads = sourcePreview.groups.flatMap((group) => group.pipelinePreview.leads);
  const introAudit = input.auditIntros === false || !auditLeads.length
    ? undefined
    : buildAiIntroQualityAuditPreview({
        leads: auditLeads,
        offer: input.offer,
        language: input.language ?? "sk",
        maxNextCalls: Math.min(maxNextCalls, 80),
      });
  const nextToolCalls = dedupeNextToolCalls([
    ...sourcePreview.nextToolCalls,
    ...(introAudit?.nextToolCalls ?? []),
  ]).slice(0, maxNextCalls);
  const runbook = nextToolCalls.map((call, index) => ({
    order: index + 1,
    tool: call.tool,
    purpose: call.reason,
    approvalRequired: call.approvalRequired,
    payload: call.payload,
  }));
  const approvalCalls = nextToolCalls.filter((call) => call.approvalRequired).length;
  const readOnlyCalls = nextToolCalls.length - approvalCalls;
  const totals = {
    input: sourcePreview.totals.input,
    groups: sourcePreview.totals.groups,
    readyForSmartlead: sourcePreview.totals.readyForSmartlead,
    manualReview: sourcePreview.totals.manualReview,
    rejected: sourcePreview.totals.rejected,
    websitesToScrape: sourcePreview.totals.websitesToScrape,
    introsToDraft: sourcePreview.totals.introsToDraft,
    introsToRedraft: introAudit?.totals.redraft ?? 0,
    approvalCalls,
    readOnlyCalls,
  };
  const status: LeadgenAutopilotBatchPreview["status"] =
    sourcePreview.totals.groups === 0 || sourcePreview.totals.unassigned > 0
      ? "blocked"
      : totals.readyForSmartlead > 0 && totals.websitesToScrape === 0 && totals.introsToDraft === 0 && totals.introsToRedraft === 0
        ? "ready"
        : "attention";
  return {
    mode: "leadgen-autopilot-batch-preview",
    status,
    summary: `Leadgen autopilot batch: ${status}, ${totals.groups} skupin, ${totals.readyForSmartlead} ready do Smartlead, ${totals.websitesToScrape} scrape, ${totals.introsToDraft} intro draft, ${totals.introsToRedraft} intro redraft, ${approvalCalls} approval krokov. Ziadny zapis ani upload neprebehol.`,
    sourcePreview,
    introAudit,
    totals,
    runbook,
    nextToolCalls,
  };
}

export function buildLeadRepairQueuePreview(input: {
  leads: LeadRepairQueueLead[];
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  maxNextCalls?: number;
}): LeadRepairQueuePreview {
  const normalized = input.leads.map((lead) => normalizePipelineLead(lead) as LeadRepairQueueLead);
  const deduped = dedupeLeadCandidates({ leads: normalized });
  const duplicateKeys = new Set(deduped.duplicates.map((item) => leadIdentityKey(item.lead)?.value).filter((value): value is string => Boolean(value)));
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 80);
  const items = deduped.unique.map((lead) => {
    const issues = leadRepairIssues(lead, duplicateKeys);
    const recommendedTools = repairToolsForIssues(issues);
    const severity = leadRepairSeverity(issues);
    return { lead: lead as LeadRepairQueueLead, issues, severity, recommendedTools };
  });
  const websitesToScrape = unique(items.filter((item) => item.issues.some((issue) => ["missing_email", "invalid_email", "generic_email"].includes(issue)) && item.lead.website).map((item) => item.lead.website as string)).slice(0, maxNextCalls);
  const introsToDraft = items
    .filter((item) => item.issues.includes("missing_intro") || item.issues.includes("bad_intro_greeting") || item.issues.includes("bad_intro_too_short"))
    .filter((item) => item.lead.companyName)
    .map((item) => ({
      companyName: item.lead.companyName as string,
      website: item.lead.website,
      context: stringField(item.lead.customFields ?? {}, "context_preview") ?? item.lead.context,
      offer: input.offer,
      language: input.language ?? "sk",
    }))
    .slice(0, maxNextCalls);
  const registerLookups = items
    .filter((item) => item.issues.includes("missing_decision_maker"))
    .map((item) => ({ ico: item.lead.ico ?? stringField(item.lead.customFields ?? {}, "ico"), companyName: item.lead.companyName }))
    .filter((item) => item.ico || item.companyName)
    .slice(0, Math.min(maxNextCalls, 20));
  const nextToolCalls: LeadRepairQueuePreview["nextToolCalls"] = [];
  if (websitesToScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: websitesToScrape, includePriorityPages: true, maxPages: 4, maxSites: websitesToScrape.length },
      reason: "Oprav leady s chybajucim, nevalidnym alebo generic emailom cez website scrape.",
      approvalRequired: false,
    });
  }
  if (introsToDraft.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: introsToDraft, offer: input.offer, language: input.language ?? "sk", maxLeads: introsToDraft.length },
      reason: "Oprav chybajuce alebo zle AI intra pred cold outreachom.",
      approvalRequired: false,
    });
  }
  for (const lookup of registerLookups.slice(0, 5)) {
    nextToolCalls.push({
      tool: "arcigy.enrich_slovak_company_register",
      payload: lookup,
      reason: "Dopln decision maker alebo oficialne firemne udaje cez slovensky register.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_manual_review_queue",
    payload: { leads: deduped.unique, minScore: input.minScore ?? 70 },
    reason: "Po opravach znovu rozdel leady na ready/manual/reject.",
    approvalRequired: false,
  });
  const totals = {
    input: input.leads.length,
    unique: deduped.unique.length,
    duplicates: deduped.duplicates.length,
    readyNow: items.filter((item) => item.severity === "ready").length,
    needsEmail: items.filter((item) => item.issues.some((issue) => ["missing_email", "invalid_email", "generic_email"].includes(issue))).length,
    needsWebsite: items.filter((item) => item.issues.includes("missing_website")).length,
    needsIntro: items.filter((item) => item.issues.includes("missing_intro")).length,
    badIntro: items.filter((item) => item.issues.includes("bad_intro_greeting") || item.issues.includes("bad_intro_too_short")).length,
    needsDecisionMaker: items.filter((item) => item.issues.includes("missing_decision_maker")).length,
    failedVerification: items.filter((item) => item.issues.includes("verification_failed")).length,
    alreadySent: items.filter((item) => item.issues.includes("already_sent_to_smartlead")).length,
    manualReview: items.filter((item) => item.severity === "manual_review").length,
    rejected: items.filter((item) => item.severity === "reject").length,
  };
  return {
    mode: "lead-repair-queue-preview",
    summary: `Lead repair queue: ${totals.readyNow} ready, ${totals.manualReview} manual review, ${totals.rejected} reject, ${totals.needsEmail} email oprav, ${totals.needsIntro + totals.badIntro} intro oprav. Ziadny zapis ani upload neprebehol.`,
    totals,
    items,
    duplicates: deduped.duplicates,
    repairBatches: { websitesToScrape, introsToDraft, registerLookups },
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
  };
}

export function buildSlovakRegisterBatchPreview(input: {
  leads?: LeadRepairQueueLead[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  sourceName?: string;
  includeAlreadyVerified?: boolean;
  maxLookups?: number;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
}): SlovakRegisterBatchPreview {
  const parsed = input.csvText ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : { leads: [] as LeadCsvRow[], skipped: [] as Array<{ rowNumber: number; reason: string }>, headers: [] as string[] };
  const sourceLeads = [...(input.leads ?? []), ...parsed.leads].map((lead) => normalizePipelineLead(lead, input.sourceName, input.sourceName) as LeadRepairQueueLead);
  const deduped = dedupeLeadCandidates({ leads: sourceLeads });
  const includeAlreadyVerified = input.includeAlreadyVerified === true;
  const maxLookups = Math.min(Math.max(Math.trunc(input.maxLookups ?? 25), 1), 80);
  const alreadyVerified: LeadRepairQueueLead[] = [];
  const missingLookupKey: LeadRepairQueueLead[] = [];
  const lookupQueue: SlovakRegisterBatchPreview["lookupQueue"] = [];

  for (const lead of deduped.unique as LeadRepairQueueLead[]) {
    const registerFound = lead.register?.found === true || booleanField(lead.customFields ?? {}, "register_verified", "orsr_verified") === true;
    const decisionMaker = decisionMakerForLead(lead) ?? lead.register?.executives?.[0] ?? stringField(lead.customFields ?? {}, "decision_maker_name");
    if (registerFound && !includeAlreadyVerified) {
      alreadyVerified.push(lead);
      continue;
    }
    const ico = stringField(lead, "ico") ?? stringField(lead.customFields ?? {}, "ico", "ICO");
    const companyName = companyNameForLead(lead) ?? stringField(lead.customFields ?? {}, "company", "company_name", "official_company_name");
    if (!ico && !companyName) {
      missingLookupKey.push(lead);
      continue;
    }
    const leadKey = leadIdentityKey(lead)?.value ?? `${ico ?? ""}|${companyName ?? ""}`.toLowerCase();
    const priority = (ico ? 60 : 35) + (decisionMaker ? 0 : 25) + (lead.email ? 5 : 0) + (lead.website ? 5 : 0);
    lookupQueue.push({
      leadKey,
      ico,
      companyName,
      reason: decisionMaker ? "register verification and official company fields" : "missing decision maker / konatel",
      priority,
      lead,
    });
  }

  lookupQueue.sort((a, b) => b.priority - a.priority || (a.companyName ?? "").localeCompare(b.companyName ?? ""));
  const limitedLookups = lookupQueue.slice(0, maxLookups);
  const nextToolCalls: SlovakRegisterBatchPreview["nextToolCalls"] = limitedLookups.slice(0, 10).map((item) => ({
    tool: "arcigy.enrich_slovak_company_register",
    payload: item.ico ? { ico: item.ico, companyName: item.companyName } : { companyName: item.companyName },
    reason: item.reason,
    approvalRequired: false,
  }));
  if (deduped.unique.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: deduped.unique, offer: input.offer, language: input.language ?? "sk", minScore: input.minScore ?? 70 },
      reason: "Po register lookupoch znovu zisti, ktore leady este potrebuju email, intro alebo manual review.",
      approvalRequired: false,
    });
  }
  if (limitedLookups.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_enrichment_merge_preview",
      payload: { leads: deduped.unique, defaultSource: input.sourceName ?? "slovak-register-batch", minScore: input.minScore ?? 70 },
      reason: "Po doplneni register vysledkov zluc enrichment data pred Smartlead importom.",
      approvalRequired: false,
    });
  }
  const missingDecisionMaker = (deduped.unique as LeadRepairQueueLead[]).filter((lead) => !decisionMakerForLead(lead) && !lead.register?.executives?.length && !stringField(lead.customFields ?? {}, "decision_maker_name")).length;
  const totals = {
    input: sourceLeads.length,
    unique: deduped.unique.length,
    duplicates: deduped.duplicates.length,
    alreadyVerified: alreadyVerified.length,
    needsLookup: lookupQueue.length,
    byIco: lookupQueue.filter((item) => item.ico).length,
    byName: lookupQueue.filter((item) => !item.ico && item.companyName).length,
    missingLookupKey: missingLookupKey.length,
    missingDecisionMaker,
    mergeCandidates: limitedLookups.length,
  };
  const status: SlovakRegisterBatchPreview["status"] = totals.unique === 0 || (totals.needsLookup === 0 && totals.alreadyVerified === 0) ? "blocked" : totals.missingLookupKey > 0 ? "attention" : "ready";
  return {
    mode: "slovak-register-batch-preview",
    status,
    summary: `Slovak register batch: ${status}, ${totals.needsLookup} lookupov (${totals.byIco} ICO, ${totals.byName} nazov), ${totals.alreadyVerified} uz overenych, ${totals.missingLookupKey} bez ICO/nazvu. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, parsedRows: parsed.leads.length, warnings: parsed.skipped.length ? [`Skipped ${parsed.skipped.length} CSV rows.`] : [] },
    totals,
    lookupQueue: limitedLookups,
    alreadyVerified,
    missingLookupKey,
    duplicates: deduped.duplicates,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildSlovakSalutationPreview(input: {
  leads: LeadRepairQueueLead[];
  defaultSource?: string;
  campaignId?: string | number | null;
  includeSmartleadPreview?: boolean;
  maxItems?: number;
}): SlovakSalutationPreview {
  const maxItems = Math.min(Math.max(Math.trunc(input.maxItems ?? 200), 1), 1000);
  const leads = input.leads.slice(0, maxItems).map((lead) => normalizePipelineLead(lead, input.defaultSource, input.defaultSource) as LeadRepairQueueLead);
  const items: SlovakSalutationPreview["items"] = leads.map((lead) => {
    const fullName = decisionMakerForLead(lead) ?? lead.register?.executives?.[0] ?? stringField(lead.customFields ?? {}, "decision_maker_name", "decision_maker_full_name");
    const split = splitNameForSalutation(fullName, lead);
    if (!split.lastName) {
      return { lead, status: "missing_name", fullName, firstName: split.firstName, lastName: split.lastName, gender: "unknown" };
    }
    const gender = normalizeGender(stringField(lead.customFields ?? {}, "decision_maker_gender", "gender")) ?? inferSlovakGender(split.firstName, split.lastName);
    const salutation = gender === "female" ? "pani" : gender === "male" ? "pan" : inferSlovakGender(split.firstName, split.lastName) === "female" ? "pani" : "pan";
    const lastNameWithSalutation = `${salutation} ${split.lastName}`;
    const customFields = {
      ...lead.customFields,
      decision_maker_name: fullName,
      decision_maker_first_name: split.firstName,
      decision_maker_last_name: split.lastName,
      decision_maker_gender: gender,
      last_name_with_salutation: lastNameWithSalutation,
      greeting: `Dobry den ${lastNameWithSalutation}`,
    };
    return { lead, status: "ready", fullName, firstName: split.firstName, lastName: split.lastName, gender, salutation, lastNameWithSalutation, customFields };
  });
  const enhancedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status === "ready" && Boolean(item.lead.email))
    .map((item) => ({
      ...item.lead,
      email: item.lead.email as string,
      firstName: item.firstName ?? item.lead.firstName,
      lastName: item.lastName ?? item.lead.lastName,
      customFields: item.customFields,
    }));
  const smartleadPrepared = prepareSmartleadLeads({ leads: enhancedLeads, defaultSource: input.defaultSource ?? "slovak-salutation-preview" });
  const nextToolCalls: SlovakSalutationPreview["nextToolCalls"] = [];
  if (input.includeSmartleadPreview !== false && enhancedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.prepare_smartlead_leads",
      payload: { leads: enhancedLeads, defaultSource: input.defaultSource ?? "slovak-salutation-preview" },
      reason: "Skontroluj Smartlead lead payload s doplnenym last_name_with_salutation pred importom.",
      approvalRequired: false,
    });
  }
  if (input.campaignId && smartleadPrepared.leadList.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { campaignId: input.campaignId, leads: smartleadPrepared.leadList },
      reason: "Pred uploadom porovnaj leady so Smartlead kampanou a priprav approval payload iba pre nove kontakty.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: leads.length,
    enriched: items.filter((item) => item.status === "ready").length,
    missingName: items.filter((item) => item.status === "missing_name").length,
    male: items.filter((item) => item.gender === "male").length,
    female: items.filter((item) => item.gender === "female").length,
    unknown: items.filter((item) => item.gender === "unknown").length,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: SlovakSalutationPreview["status"] = totals.input === 0 ? "blocked" : totals.missingName > 0 ? "attention" : "ready";
  return {
    mode: "slovak-salutation-preview",
    status,
    summary: `Slovak salutation preview: ${totals.enriched} leadov obohatenych o last_name_with_salutation, ${totals.missingName} bez mena, ${totals.smartleadReady} ready pre Smartlead. Ziadny zapis ani upload neprebehol.`,
    totals,
    items,
    enhancedLeads,
    smartleadPrepared,
    nextToolCalls,
  };
}

export function buildOrphanLeadAssignmentPreview(input: {
  leads?: LeadSourceImportQueueLead[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  niches: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[]; keywords?: string[] }>;
  sourceName?: string;
  defaultSource?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  maxNextCalls?: number;
}): OrphanLeadAssignmentPreview {
  const parsed = input.csvText ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : { leads: [] as LeadCsvRow[] };
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 120);
  const orphanLeads = [...(input.leads ?? []), ...parsed.leads].map((lead) => normalizeSourceQueueLead(lead as LeadSourceImportQueueLead, input.sourceName, input.defaultSource ?? "orphan-leads"));
  const assigned: OrphanLeadAssignmentPreview["assigned"] = [];
  const unassigned: LeadSourceImportQueueLead[] = [];
  for (const lead of orphanLeads) {
    const match = inferOrphanLeadNiche(lead, input.niches);
    if (!match) {
      unassigned.push(lead);
      continue;
    }
    assigned.push({
      lead: { ...lead, nicheSlug: match.niche.slug, nicheName: match.niche.name, campaignId: lead.campaignId ?? lead.smartleadCampaignId ?? match.niche.campaignId },
      niche: match.niche,
      confidence: match.confidence,
      reasons: match.reasons,
    });
  }
  const assignedLeads = assigned.map((item) => item.lead);
  const repairPreview = buildLeadRepairQueuePreview({
    leads: orphanLeads as LeadRepairQueueLead[],
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    maxNextCalls,
  });
  const importQueuePreview = assignedLeads.length
    ? buildLeadSourceImportQueuePreview({
        sourceName: input.sourceName ?? "orphan-leads",
        sourceType: input.csvText ? "csv" : "manual",
        leads: assignedLeads,
        niches: input.niches,
        defaultSource: input.defaultSource ?? "orphan-leads",
        offer: input.offer,
        language: input.language,
        minScore: input.minScore,
        batchSize: input.batchSize,
        maxNextCalls,
      })
    : undefined;
  const nextToolCalls = dedupeNextToolCalls([
    ...repairPreview.nextToolCalls,
    ...(importQueuePreview?.nextToolCalls ?? []),
  ]).slice(0, maxNextCalls);
  if (unassigned.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_source_import_queue_preview",
      payload: { sourceName: input.sourceName ?? "orphan-leads-unassigned", sourceType: input.csvText ? "csv" : "manual", leads: unassigned, niches: input.niches, offer: input.offer, language: input.language ?? "sk" },
      reason: "Orphan leady bez jasnej niche skontroluj manualne alebo dopln aliases/keywords.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: orphanLeads.length,
    assigned: assigned.length,
    unassigned: unassigned.length,
    readyNow: repairPreview.totals.readyNow,
    needsRepair: repairPreview.totals.unique - repairPreview.totals.readyNow,
    needsEmail: repairPreview.totals.needsEmail,
    needsIntro: repairPreview.totals.needsIntro + repairPreview.totals.badIntro,
    needsDecisionMaker: repairPreview.totals.needsDecisionMaker,
    groups: importQueuePreview?.totals.groups ?? 0,
  };
  const status: OrphanLeadAssignmentPreview["status"] = totals.input === 0 || input.niches.length === 0
    ? "blocked"
    : totals.unassigned > 0 || totals.needsRepair > 0
      ? "attention"
      : "ready";
  return {
    mode: "orphan-lead-assignment-preview",
    status,
    summary: `Orphan lead assignment: ${status}, ${totals.assigned}/${totals.input} priradenych, ${totals.readyNow} ready, ${totals.needsRepair} potrebuje opravu, ${totals.groups} import skupin. Ziadny zapis ani upload neprebehol.`,
    totals,
    assigned,
    unassigned,
    repairPreview,
    importQueuePreview,
    nextToolCalls: nextToolCalls.slice(0, maxNextCalls),
  };
}

export function buildUrlIntelligenceQueuePreview(input: {
  urls?: string[];
  leads?: LeadSourceImportQueueLead[];
  sourceName?: string;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  niches?: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[] }>;
  includeFetchPreview?: boolean;
  includeScrape?: boolean;
  includeIntroDrafts?: boolean;
  includeImportQueue?: boolean;
  includePriorityPages?: boolean;
  maxPages?: number;
  maxUrls?: number;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  maxNextCalls?: number;
}): UrlIntelligenceQueuePreview {
  const maxUrls = Math.min(Math.max(Math.trunc(input.maxUrls ?? 100), 1), 300);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 100);
  const normalizedUrls: string[] = [];
  const invalid: UrlIntelligenceQueuePreview["urlBatches"]["invalid"] = [];
  for (const raw of (input.urls ?? []).slice(0, maxUrls)) {
    try {
      normalizedUrls.push(normalizeHttpUrl(raw));
    } catch (error) {
      invalid.push({ value: raw, error: error instanceof Error ? error.message : "Invalid URL" });
    }
  }
  const uniqueUrls = unique(normalizedUrls).slice(0, maxUrls);
  const generatedLeads: LeadSourceImportQueueLead[] = uniqueUrls.map((url) => {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return {
      website: url,
      companyName: titleFromHostname(hostname),
      source: input.sourceName ?? "url-intelligence",
      nicheSlug: input.niche?.slug,
      nicheName: input.niche?.name,
      campaignId: input.niche?.campaignId,
      customFields: { source_url: url, source_type: "url_intelligence" },
    };
  });
  const allLeads = [...(input.leads ?? []), ...generatedLeads].map((lead) => normalizeSourceQueueLead(lead, input.sourceName, "url-intelligence"));
  const repairPreview = buildLeadRepairQueuePreview({
    leads: allLeads as LeadRepairQueueLead[],
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    maxNextCalls,
  });
  const importQueuePreview = input.includeImportQueue !== false && (input.niche || input.niches?.length)
    ? buildLeadSourceImportQueuePreview({
        sourceName: input.sourceName ?? "url-intelligence",
        sourceType: "manual",
        leads: allLeads,
        niches: input.niches,
        defaultNiche: input.niche,
        blacklistDomains: input.blacklistDomains,
        blacklistKeywords: input.blacklistKeywords,
        offer: input.offer,
        language: input.language,
        minScore: input.minScore,
        batchSize: input.batchSize,
        maxNextCalls,
      })
    : undefined;
  const nextToolCalls: UrlIntelligenceQueuePreview["nextToolCalls"] = [];
  if (uniqueUrls.length && input.includeFetchPreview !== false) {
    nextToolCalls.push({
      tool: "arcigy.batch_fetch_url_previews",
      payload: { urls: uniqueUrls, method: "GET", parseJson: false, maxBytes: 12000, maxUrls: uniqueUrls.length },
      reason: "Rychlo nacitaj URL preview pred detailnym contact scrapingom.",
      approvalRequired: false,
    });
  }
  if (uniqueUrls.length && input.includeScrape !== false) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: uniqueUrls, includePriorityPages: input.includePriorityPages !== false, maxPages: input.maxPages ?? 4, maxSites: uniqueUrls.length },
      reason: "Najdi emaily, telefony a kontaktne podstranky z URL zoznamu.",
      approvalRequired: false,
    });
  }
  if (repairPreview.repairBatches.introsToDraft.length && input.includeIntroDrafts !== false) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: repairPreview.repairBatches.introsToDraft, offer: input.offer, language: input.language ?? "sk", maxLeads: repairPreview.repairBatches.introsToDraft.length },
      reason: "Dopln AI intra pre leady pred manual review alebo Smartlead importom.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_lead_repair_queue_preview",
    payload: { leads: allLeads, offer: input.offer, language: input.language ?? "sk", minScore: input.minScore, maxNextCalls },
    reason: "Po fetchnuti/scrape znovu skontroluj, co chyba pred importom.",
    approvalRequired: false,
  });
  if (importQueuePreview) nextToolCalls.push(...importQueuePreview.nextToolCalls);
  const warnings: string[] = [];
  if (!input.niche && !input.niches?.length) warnings.push("No niche mapping was provided; Smartlead import queue is not prepared.");
  if (invalid.length) warnings.push(`${invalid.length} URL could not be normalized.`);
  return {
    mode: "url-intelligence-queue-preview",
    source: { name: input.sourceName ?? "url-intelligence", type: input.urls?.length && input.leads?.length ? "mixed" : input.urls?.length ? "url_list" : "manual" },
    summary: `URL intelligence queue: ${uniqueUrls.length} URL na fetch/scrape, ${allLeads.length} leadov, ${repairPreview.totals.needsIntro} intro draftov, ${importQueuePreview?.totals.readyForSmartlead ?? 0} ready do Smartlead. Ziadny zapis ani upload neprebehol.`,
    totals: {
      inputUrls: input.urls?.length ?? 0,
      validUrls: uniqueUrls.length,
      invalidUrls: invalid.length,
      inputLeads: input.leads?.length ?? 0,
      generatedLeads: generatedLeads.length,
      totalLeads: allLeads.length,
      fetchUrls: input.includeFetchPreview === false ? 0 : uniqueUrls.length,
      scrapeUrls: input.includeScrape === false ? 0 : uniqueUrls.length,
      introsToDraft: repairPreview.repairBatches.introsToDraft.length,
      readyForSmartlead: importQueuePreview?.totals.readyForSmartlead ?? 0,
      manualReview: importQueuePreview?.totals.manualReview ?? repairPreview.totals.manualReview,
    },
    urlBatches: { fetch: input.includeFetchPreview === false ? [] : uniqueUrls, scrape: input.includeScrape === false ? [] : uniqueUrls, invalid },
    generatedLeads,
    repairPreview,
    importQueuePreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildNicheOpsDashboardPreview(input: {
  niches: NicheOpsDashboardInput[];
  offer?: string;
  language?: "sk" | "en";
  defaultDailyTarget?: number;
  maxNextCalls?: number;
}): NicheOpsDashboardPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 100);
  const niches = input.niches.map((niche) => {
    const dailyTarget = Math.max(0, Math.trunc(niche.dailyTarget ?? input.defaultDailyTarget ?? 30));
    const todaySent = Math.max(0, Math.trunc(niche.todaySent ?? niche.stats?.sentToSmartlead ?? 0));
    const progressPercent = dailyTarget > 0 ? Math.min(100, Math.round((todaySent / dailyTarget) * 100)) : 100;
    const stuckCount = niche.stuckLeads?.length ?? 0;
    const readyCount = niche.readyLeads?.length ?? 0;
    const failedCount = niche.failedLeads?.length ?? niche.stats?.failed ?? 0;
    const issues: string[] = [];
    if (niche.status === "paused") issues.push("paused");
    if (!niche.smartleadCampaignId && readyCount > 0) issues.push("missing_campaign");
    if (stuckCount > 0) issues.push("stuck_leads");
    if (failedCount > 0) issues.push("failed_leads");
    if (dailyTarget > 0 && todaySent < dailyTarget) issues.push("below_daily_target");
    const status: "healthy" | "attention" | "blocked" = issues.includes("missing_campaign") || issues.includes("paused") ? "blocked" : issues.length ? "attention" : "healthy";
    const activeRegion = niche.regions?.length ? niche.regions[(niche.currentRegionIndex ?? 0) % niche.regions.length] : undefined;
    const calls: NicheOpsDashboardPreview["nextToolCalls"] = [];
    if (issues.includes("below_daily_target")) {
      calls.push({
        tool: "arcigy.build_daily_leadgen_runbook",
        payload: {
          niche: { id: niche.id, slug: niche.slug, name: niche.name, keywords: [], region: activeRegion, campaignId: niche.smartleadCampaignId },
          dailyLimit: dailyTarget,
          targetCount: Math.max(dailyTarget * 2, dailyTarget + stuckCount + readyCount),
        },
        reason: "Niche je pod dennym targetom; priprav presny discovery/enrichment/runbook.",
        approvalRequired: false,
      });
    }
    if (stuckCount || failedCount) {
      calls.push({
        tool: "arcigy.build_lead_repair_queue_preview",
        payload: { leads: [...(niche.stuckLeads ?? []), ...(niche.failedLeads ?? [])], offer: input.offer, language: input.language ?? "sk" },
        reason: "Oprav stuck alebo failed leady pred dalsim uploadom.",
        approvalRequired: false,
      });
    }
    if (readyCount) {
      calls.push({
        tool: niche.smartleadCampaignId ? "arcigy.build_smartlead_injection_plan" : "arcigy.draft_niche_smartlead_campaign_setup",
        payload: niche.smartleadCampaignId
          ? { niche: { id: niche.id, slug: niche.slug, name: niche.name, campaignId: niche.smartleadCampaignId }, leads: niche.readyLeads, batchSize: 50 }
          : { niche: { id: niche.id, slug: niche.slug, name: niche.name }, offer: input.offer, language: input.language ?? "sk" },
        reason: niche.smartleadCampaignId ? "Ready leady priprav do Smartlead batchov bez uploadu." : "Ready leady existuju, ale niche nema Smartlead campaignId.",
        approvalRequired: false,
      });
    }
    return { niche, activeRegion, status, progressPercent, issues, nextToolCalls: calls };
  });
  const allCalls = dedupeNextToolCalls(niches.flatMap((item) => item.nextToolCalls)).slice(0, maxNextCalls);
  const totals = {
    niches: niches.length,
    active: niches.filter((item) => item.niche.status !== "paused" && item.niche.status !== "archived").length,
    paused: niches.filter((item) => item.niche.status === "paused").length,
    healthy: niches.filter((item) => item.status === "healthy").length,
    attention: niches.filter((item) => item.status === "attention").length,
    blocked: niches.filter((item) => item.status === "blocked").length,
    dailyTarget: niches.reduce((sum, item) => sum + (item.niche.dailyTarget ?? input.defaultDailyTarget ?? 30), 0),
    todaySent: niches.reduce((sum, item) => sum + (item.niche.todaySent ?? item.niche.stats?.sentToSmartlead ?? 0), 0),
    readyLeads: niches.reduce((sum, item) => sum + (item.niche.readyLeads?.length ?? 0), 0),
    stuckLeads: niches.reduce((sum, item) => sum + (item.niche.stuckLeads?.length ?? 0), 0),
    failedLeads: niches.reduce((sum, item) => sum + (item.niche.failedLeads?.length ?? item.niche.stats?.failed ?? 0), 0),
  };
  return {
    mode: "niche-ops-dashboard-preview",
    summary: `Niche ops dashboard: ${totals.healthy} healthy, ${totals.attention} attention, ${totals.blocked} blocked, ${totals.todaySent}/${totals.dailyTarget} dnes odoslanych. Ziadny zapis ani upload neprebehol.`,
    totals,
    niches,
    nextToolCalls: allCalls,
  };
}

export function buildSmartleadSenderCapacityPreview(input: {
  campaignId?: string | number | null;
  accounts: SmartleadSenderAccountInput[];
  leadBacklog?: number;
  requestedDailyLimit?: number;
  minTimeBetweenEmailsMinutes?: number;
  maxPerAccountPerDay?: number;
  includePausedAccounts?: boolean;
}): SmartleadSenderCapacityPreview {
  const maxPerAccount = Math.min(Math.max(Math.trunc(input.maxPerAccountPerDay ?? 40), 1), 200);
  const requestedDailyLimit = Math.min(Math.max(Math.trunc(input.requestedDailyLimit ?? 30), 1), 1000);
  const leadBacklog = Math.max(Math.trunc(input.leadBacklog ?? 0), 0);
  const accounts = input.accounts.map((account) => {
    const dailyLimit = Math.min(Math.max(Math.trunc(account.dailyLimit ?? maxPerAccount), 0), maxPerAccount);
    const sentToday = Math.max(Math.trunc(account.sentToday ?? 0), 0);
    const remainingToday = Math.max(dailyLimit - sentToday, 0);
    const warnings: string[] = [];
    const status = account.status ?? "unknown";
    const warmupStatus = account.warmupStatus ?? "unknown";
    if (!["active", "unknown"].includes(status)) warnings.push(`account_status_${status}`);
    if (["paused", "error"].includes(warmupStatus)) warnings.push(`warmup_${warmupStatus}`);
    if ((account.bounceRate ?? 0) >= 5) warnings.push("high_bounce_rate");
    if ((account.reputationScore ?? 100) < 70) warnings.push("low_reputation");
    if (remainingToday <= 0) warnings.push("no_remaining_capacity_today");
    const usable = (input.includePausedAccounts === true || !warnings.some((warning) => warning.startsWith("account_status_") || warning.startsWith("warmup_"))) && remainingToday > 0;
    return { ...account, dailyLimit, sentToday, usable, remainingToday, warnings };
  });
  const usableAccounts = accounts.filter((account) => account.usable);
  const dailyCapacity = usableAccounts.reduce((sum, account) => sum + Math.min(account.dailyLimit ?? maxPerAccount, maxPerAccount), 0);
  const remainingToday = usableAccounts.reduce((sum, account) => sum + account.remainingToday, 0);
  const recommendedDailyLimit = Math.min(requestedDailyLimit, dailyCapacity || requestedDailyLimit);
  const warnings = unique(accounts.flatMap((account) => account.warnings));
  if (!usableAccounts.length) warnings.push("no_usable_sender_accounts");
  if (requestedDailyLimit > dailyCapacity && dailyCapacity > 0) warnings.push("requested_limit_exceeds_sender_capacity");
  if (leadBacklog > 0 && recommendedDailyLimit <= 0) warnings.push("cannot_send_backlog_without_capacity");
  const status: SmartleadSenderCapacityPreview["status"] = !usableAccounts.length ? "blocked" : warnings.length ? "attention" : "ready";
  const estimatedDays = leadBacklog > 0 && recommendedDailyLimit > 0 ? Math.ceil(leadBacklog / recommendedDailyLimit) : 0;
  const configureCampaignPayload = input.campaignId && usableAccounts.length
    ? {
        campaignId: input.campaignId,
        emailAccountIds: usableAccounts.map((account) => account.id),
        schedule: {
          max_new_leads_per_day: recommendedDailyLimit,
          min_time_btw_emails: Math.max(Math.trunc(input.minTimeBetweenEmailsMinutes ?? 12), 1),
        },
      }
    : undefined;
  const nextToolCalls: SmartleadSenderCapacityPreview["nextToolCalls"] = [];
  if (configureCampaignPayload) {
    nextToolCalls.push({
      tool: "arcigy.configure_smartlead_campaign",
      payload: { ...configureCampaignPayload, approval: { approved: true } },
      reason: "Prirad usable sender ucty a nastav denny limit az po explicitnom schvaleni operatora.",
      approvalRequired: true,
    });
  }
  if (!input.campaignId) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_status",
      payload: { maxCampaigns: 50 },
      reason: "Chyba campaignId; najprv vyber existujucu Smartlead kampan alebo priprav niche campaign setup.",
      approvalRequired: false,
    });
  }
  return {
    mode: "smartlead-sender-capacity-preview",
    status,
    summary: `Smartlead sender capacity: ${usableAccounts.length}/${accounts.length} usable uctov, odporucany denny limit ${recommendedDailyLimit}, backlog ${leadBacklog}${estimatedDays ? ` na ~${estimatedDays} dni` : ""}. Ziadny zapis ani upload neprebehol.`,
    totals: {
      accounts: accounts.length,
      usableAccounts: usableAccounts.length,
      blockedAccounts: accounts.length - usableAccounts.length,
      dailyCapacity,
      remainingToday,
      requestedDailyLimit,
      recommendedDailyLimit,
      leadBacklog,
      estimatedDays,
    },
    accounts,
    warnings,
    configureCampaignPayload,
    nextToolCalls,
  };
}

export function buildSmartleadDeliverabilityGuardPreview(input: {
  campaignId?: string | number | null;
  campaignName?: string;
  stats?: {
    sent?: number;
    opened?: number;
    replied?: number;
    positiveReplies?: number;
    bounced?: number;
    unsubscribed?: number;
  };
  senderAccounts?: SmartleadSenderAccountInput[];
  leadBacklog?: number;
  requestedDailyLimit?: number;
  maxBounceRate?: number;
  maxUnsubscribeRate?: number;
  minReplyRate?: number;
  minOpenRate?: number;
  minTimeBetweenEmailsMinutes?: number;
}): SmartleadDeliverabilityGuardPreview {
  const sent = Math.max(Math.trunc(input.stats?.sent ?? 0), 0);
  const opened = Math.max(Math.trunc(input.stats?.opened ?? 0), 0);
  const replied = Math.max(Math.trunc(input.stats?.replied ?? 0), 0);
  const positiveReplies = Math.max(Math.trunc(input.stats?.positiveReplies ?? 0), 0);
  const bounced = Math.max(Math.trunc(input.stats?.bounced ?? 0), 0);
  const unsubscribed = Math.max(Math.trunc(input.stats?.unsubscribed ?? 0), 0);
  const rate = (count: number) => sent > 0 ? Math.round((count / sent) * 1000) / 10 : 0;
  const thresholds = {
    maxBounceRate: input.maxBounceRate ?? 4,
    maxUnsubscribeRate: input.maxUnsubscribeRate ?? 1,
    minReplyRate: input.minReplyRate ?? 1,
    minOpenRate: input.minOpenRate ?? 20,
  };
  const metrics: SmartleadDeliverabilityGuardPreview["metrics"] = {
    sent,
    opened,
    replied,
    positiveReplies,
    bounced,
    unsubscribed,
    openRate: rate(opened),
    replyRate: rate(replied),
    positiveReplyRate: rate(positiveReplies),
    bounceRate: rate(bounced),
    unsubscribeRate: rate(unsubscribed),
  };
  const risks: SmartleadDeliverabilityGuardPreview["risks"] = [];
  if (sent <= 0) risks.push({ key: "missing_campaign_stats", severity: "attention", message: "Campaign stats are missing or empty." });
  if (metrics.bounceRate >= thresholds.maxBounceRate * 2) risks.push({ key: "critical_bounce_rate", severity: "blocked", message: `Bounce rate ${metrics.bounceRate}% is critically high.` });
  else if (metrics.bounceRate >= thresholds.maxBounceRate) risks.push({ key: "high_bounce_rate", severity: "attention", message: `Bounce rate ${metrics.bounceRate}% is above ${thresholds.maxBounceRate}%.` });
  if (metrics.unsubscribeRate >= thresholds.maxUnsubscribeRate * 2) risks.push({ key: "critical_unsubscribe_rate", severity: "blocked", message: `Unsubscribe rate ${metrics.unsubscribeRate}% is critically high.` });
  else if (metrics.unsubscribeRate >= thresholds.maxUnsubscribeRate) risks.push({ key: "high_unsubscribe_rate", severity: "attention", message: `Unsubscribe rate ${metrics.unsubscribeRate}% is above ${thresholds.maxUnsubscribeRate}%.` });
  if (sent >= 50 && metrics.replyRate < thresholds.minReplyRate) risks.push({ key: "low_reply_rate", severity: "attention", message: `Reply rate ${metrics.replyRate}% is below ${thresholds.minReplyRate}%.` });
  if (sent >= 50 && metrics.openRate < thresholds.minOpenRate) risks.push({ key: "low_open_rate", severity: "attention", message: `Open rate ${metrics.openRate}% is below ${thresholds.minOpenRate}%.` });
  const senderCapacityPreview = input.senderAccounts?.length
    ? buildSmartleadSenderCapacityPreview({
        campaignId: input.campaignId,
        accounts: input.senderAccounts,
        leadBacklog: input.leadBacklog,
        requestedDailyLimit: input.requestedDailyLimit,
        minTimeBetweenEmailsMinutes: input.minTimeBetweenEmailsMinutes,
      })
    : undefined;
  if (senderCapacityPreview?.status === "blocked") risks.push({ key: "sender_capacity_blocked", severity: "blocked", message: "No usable sender capacity is available." });
  if (senderCapacityPreview?.status === "attention") risks.push({ key: "sender_capacity_attention", severity: "attention", message: "Sender capacity has warnings." });
  const status: SmartleadDeliverabilityGuardPreview["status"] = risks.some((risk) => risk.severity === "blocked") ? "blocked" : risks.length ? "attention" : "ready";
  const requestedDailyLimit = Math.min(Math.max(Math.trunc(input.requestedDailyLimit ?? senderCapacityPreview?.totals.recommendedDailyLimit ?? 30), 1), 1000);
  const capacityLimit = senderCapacityPreview?.totals.recommendedDailyLimit ?? requestedDailyLimit;
  const safeDailyLimit = status === "blocked" ? 0 : status === "attention" ? Math.max(1, Math.floor(Math.min(requestedDailyLimit, capacityLimit) * 0.5)) : Math.min(requestedDailyLimit, capacityLimit);
  const recommendation: SmartleadDeliverabilityGuardPreview["recommendation"] = status === "blocked" ? "pause_campaign" : status === "attention" ? "reduce_daily_limit" : "continue";
  const nextToolCalls: SmartleadDeliverabilityGuardPreview["nextToolCalls"] = [];
  nextToolCalls.push({
    tool: "arcigy.get_smartlead_outreach_brief",
    payload: { campaignId: input.campaignId },
    reason: "Refresh Smartlead stats before changing send volume.",
    approvalRequired: false,
  });
  if (senderCapacityPreview) nextToolCalls.push(...senderCapacityPreview.nextToolCalls);
  if (input.campaignId && safeDailyLimit > 0 && safeDailyLimit < requestedDailyLimit) {
    nextToolCalls.push({
      tool: "arcigy.configure_smartlead_campaign",
      payload: { campaignId: input.campaignId, schedule: { max_new_leads_per_day: safeDailyLimit, min_time_btw_emails: Math.max(Math.trunc(input.minTimeBetweenEmailsMinutes ?? 20), 1) }, approval: { approved: true } },
      reason: "Zniz denny limit kampane az po explicitnom schvaleni operatora.",
      approvalRequired: true,
    });
  }
  return {
    mode: "smartlead-deliverability-guard-preview",
    status,
    recommendation,
    summary: `Smartlead deliverability guard: ${status}, bounce ${metrics.bounceRate}%, reply ${metrics.replyRate}%, unsubscribe ${metrics.unsubscribeRate}%, safe daily limit ${safeDailyLimit}. Ziadny zapis ani upload neprebehol.`,
    campaign: { id: input.campaignId ?? null, name: input.campaignName },
    metrics,
    thresholds,
    risks,
    senderCapacityPreview,
    safeDailyLimit,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildSmartleadCampaignHandoffPackagePreview(input: {
  niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  leads: ManualReviewPickupLead[];
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  schedule?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["schedule"];
  settings?: Parameters<typeof draftNicheSmartleadCampaignSetup>[0]["settings"];
  batchSize?: number;
  senderAccounts?: SmartleadSenderAccountInput[];
  requestedDailyLimit?: number;
  minTimeBetweenEmailsMinutes?: number;
}): SmartleadCampaignHandoffPackagePreview {
  const senderCapacityPreview = input.senderAccounts?.length
    ? buildSmartleadSenderCapacityPreview({
        campaignId: input.niche.campaignId,
        accounts: input.senderAccounts,
        leadBacklog: input.leads.length,
        requestedDailyLimit: input.requestedDailyLimit ?? input.schedule?.max_new_leads_per_day,
        minTimeBetweenEmailsMinutes: input.minTimeBetweenEmailsMinutes ?? input.schedule?.min_time_btw_emails,
      })
    : undefined;
  const launchPreview = buildSmartleadCampaignLaunchPreview({
    niche: input.niche,
    leads: input.leads,
    offer: input.offer,
    painPoint: input.painPoint,
    language: input.language,
    clientId: input.clientId,
    emailAccountIds: input.emailAccountIds ?? senderCapacityPreview?.configureCampaignPayload?.emailAccountIds,
    webhookUrl: input.webhookUrl,
    schedule: input.schedule,
    settings: input.settings,
    batchSize: input.batchSize,
  });
  const qaPreview = buildSmartleadCampaignQaPreview({
    launchPreview,
    maxNewLeadsPerDay: senderCapacityPreview?.totals.recommendedDailyLimit,
  });
  const allCalls = dedupeNextToolCalls([...(senderCapacityPreview?.nextToolCalls ?? []), ...launchPreview.nextToolCalls, ...qaPreview.nextToolCalls]);
  const status: SmartleadCampaignHandoffPackagePreview["status"] =
    qaPreview.status === "blocked" || senderCapacityPreview?.status === "blocked"
      ? "blocked"
      : qaPreview.status === "attention" || senderCapacityPreview?.status === "attention"
        ? "attention"
        : "ready";
  const approvalCalls = allCalls.filter((call) => call.approvalRequired).map((call) => ({
    ...call,
    status: status === "blocked" ? "blocked" as const : "ready" as const,
  }));
  const checklist: SmartleadCampaignHandoffPackagePreview["operatorChecklist"] = [
    { item: "Campaign target", status: qaPreview.checks.find((check) => check.key === "campaign-target")?.status ?? "blocked", detail: qaPreview.checks.find((check) => check.key === "campaign-target")?.message ?? "Campaign target missing." },
    { item: "Leads", status: qaPreview.checks.find((check) => check.key === "lead-count")?.status ?? "blocked", detail: `${launchPreview.injectionPlan.totals.prepared} prepared, ${launchPreview.injectionPlan.totals.skipped} skipped.` },
    { item: "Sequence QA", status: qaPreview.checks.some((check) => ["sequences", "sequence-variables"].includes(check.key) && check.status === "blocked") ? "blocked" : "ready", detail: `${qaPreview.totals.sequenceCount} sequence step(s), ${qaPreview.totals.variants} variant(s).` },
    { item: "Sender capacity", status: senderCapacityPreview?.status ?? "attention", detail: senderCapacityPreview ? `${senderCapacityPreview.totals.usableAccounts}/${senderCapacityPreview.totals.accounts} usable, daily limit ${senderCapacityPreview.totals.recommendedDailyLimit}.` : "Sender accounts were not provided." },
    { item: "Approvals", status: approvalCalls.length && status !== "blocked" ? "ready" : status === "blocked" ? "blocked" : "attention", detail: `${approvalCalls.length} approval-gated call(s) prepared.` },
  ];
  const approvals = {
    required: approvalCalls.length,
    ready: approvalCalls.filter((call) => call.status === "ready").length,
    blocked: approvalCalls.filter((call) => call.status === "blocked").length,
    calls: approvalCalls,
  };
  return {
    mode: "smartlead-campaign-handoff-package-preview",
    status,
    summary: `Smartlead handoff package: ${status}, ${launchPreview.injectionPlan.totals.prepared} leadov, ${approvals.required} approval krokov, QA ${qaPreview.status}${senderCapacityPreview ? `, sender capacity ${senderCapacityPreview.status}` : ""}. Ziadny zapis ani upload neprebehol.`,
    launchPreview,
    qaPreview,
    senderCapacityPreview,
    approvals,
    operatorChecklist: checklist,
    nextToolCalls: allCalls,
  };
}

export function buildSmartleadCampaignBackupPlan(input: {
  campaigns?: SmartleadCampaignBackupPlanCampaign[];
  runId?: string;
  createdAt?: string;
  backupRoot?: string;
  note?: string;
  protectedCampaignIds?: Array<string | number>;
  protectedNameParts?: string[];
  includeDeletePlan?: boolean;
  maxCampaigns?: number;
  leadPageSize?: number;
}): SmartleadCampaignBackupPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const runId = input.runId?.trim() || `smartlead_backup_${createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const backupRoot = (input.backupRoot?.trim() || "outputs/smartlead-backups").replace(/[\\/]+$/g, "");
  const runDir = `${backupRoot}/${runId}`;
  const sqlitePath = `${backupRoot}/smartlead_campaign_backup.sqlite`;
  const maxCampaigns = Math.min(Math.max(Math.trunc(input.maxCampaigns ?? 100), 1), 500);
  const leadPageSize = Math.min(Math.max(Math.trunc(input.leadPageSize ?? 100), 1), 500);
  const protectedIds = new Set(["3209165", "3085887", ...(input.protectedCampaignIds ?? []).map(String)]);
  const protectedNameParts = unique(["KUCHYNE_SK", "KUCHYNE-NA-MIRU-CZ", "KUCHYNE-NA-MIRU", ...(input.protectedNameParts ?? [])]
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean));
  const rawCampaigns = (input.campaigns ?? []).slice(0, maxCampaigns);

  const campaigns = rawCampaigns
    .map((campaign, index) => {
      const id = stringField(campaign, "id", "campaign_id", "campaignId") ?? String(index + 1);
      const name = stringField(campaign, "name", "campaign_name", "campaignName") ?? `campaign-${id}`;
      const status = stringField(campaign, "status");
      const upperName = name.toUpperCase();
      const matchedNameParts = protectedNameParts.filter((part) => upperName.includes(part));
      const explicitProtected = campaign.protected === true;
      const protectionReasons = [
        explicitProtected ? "explicit protected flag" : null,
        protectedIds.has(String(id)) ? "protected campaign id" : null,
        ...matchedNameParts.map((part) => `protected name match: ${part}`),
      ].filter((reason): reason is string => Boolean(reason));
      const protectedCampaign = protectionReasons.length > 0;
      const leadCount = numberField(campaign, "leadCount", "lead_count", "total_leads") ?? arrayLengthField(campaign, "leads");
      const sequenceCount = numberField(campaign, "sequenceCount", "sequence_count") ?? arrayLengthField(campaign, "sequences");
      const webhookCount = numberField(campaign, "webhookCount", "webhook_count") ?? arrayLengthField(campaign, "webhooks");
      const emailAccountCount = numberField(campaign, "emailAccountCount", "email_account_count") ?? arrayLengthField(campaign, "emailAccounts", "email_accounts");
      const backupDir = `${runDir}/${id}_${slugify(name).slice(0, 80)}`;
      return {
        id: String(id),
        name,
        status,
        protected: protectedCampaign,
        protectionReasons,
        leadCount,
        sequenceCount,
        webhookCount,
        emailAccountCount,
        backupDir,
        fetchEndpoints: smartleadBackupFetchEndpoints(String(id), leadPageSize),
      };
    });

  const protectedCampaigns = campaigns.filter((campaign) => campaign.protected);
  const deleteCandidates = input.includeDeletePlan ? campaigns.filter((campaign) => !campaign.protected) : [];
  const missingLeadCounts = campaigns.filter((campaign) => typeof campaign.leadCount !== "number").length;
  const nextToolCalls: SmartleadCampaignBackupPlan["nextToolCalls"] = [];
  if (!campaigns.length) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_status",
      payload: {},
      reason: "Najprv nacitaj zoznam Smartlead kampani, potom z neho vytvor backup plan.",
      approvalRequired: false,
    });
  }
  for (const campaign of campaigns.slice(0, 10)) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_status",
      payload: { campaignId: campaign.id },
      reason: "Stiahni campaign detail/statistiky pred backup manifestom.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId: campaign.id, offset: 0, limit: leadPageSize },
      reason: "Stiahni prvu stranu leadov; pri vacsom pocte pokracuj offsetom po limit.",
      approvalRequired: false,
    });
  }

  const status: SmartleadCampaignBackupPlan["status"] = !campaigns.length ? "blocked" : deleteCandidates.length ? "attention" : "ready";
  return {
    mode: "smartlead-campaign-backup-plan",
    status,
    summary: `Smartlead backup plan: ${campaigns.length} kampani, ${protectedCampaigns.length} protected, ${deleteCandidates.length} delete kandidatov. Ziadny backup, delete ani Smartlead zapis neprebehol.`,
    run: { runId, createdAt, backupRoot, runDir, sqlitePath, note: input.note },
    totals: {
      campaigns: campaigns.length,
      protected: protectedCampaigns.length,
      backupCandidates: campaigns.length,
      deleteCandidates: deleteCandidates.length,
      estimatedLeads: campaigns.reduce((sum, campaign) => sum + (campaign.leadCount ?? 0), 0),
      missingLeadCounts,
    },
    campaigns,
    protectedCampaigns,
    deleteCandidates,
    manifestTemplate: {
      run_id: runId,
      created_at: createdAt,
      db_path: sqlitePath,
      backup_dir: runDir,
      execute_delete: false,
      protected_campaigns: protectedCampaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })),
      delete_candidates: deleteCandidates.map((campaign) => ({ id: campaign.id, name: campaign.name })),
      delete_results: [],
    },
    safetyGates: [
      "Pred akoukolvek zmenou kampane uloz campaign.json, sequences.json, leads.json, webhooks.json a email_accounts.json.",
      "Delete kandidat je iba navrh; tento MCP tool nikdy nemaze kampane.",
      "Kampane oznacene protected sa nesmu mazat ani hromadne prepisat bez samostatneho operator approval.",
      "Ak chyba leadCount, najprv dotiahni vsetky strany /campaigns/{id}/leads cez offset/limit.",
      "Po backupe porovnaj pocet leadov v manifeste so Smartlead countom.",
    ],
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildSmartleadCampaignRestorePlan(input: {
  backups: SmartleadCampaignRestoreBackup[];
  restoreMode?: "create-new" | "configure-existing";
  targetNameSuffix?: string;
  targetCampaignId?: string | number | null;
  clientId?: string | number | null;
  batchSize?: number;
  maxLeadsPerCampaign?: number;
  includeLeads?: boolean;
  includeWebhooks?: boolean;
}): SmartleadCampaignRestorePlan {
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 100), 1), 100);
  const maxLeadsPerCampaign = Math.min(Math.max(Math.trunc(input.maxLeadsPerCampaign ?? 1000), 0), 10_000);
  const includeLeads = input.includeLeads !== false;
  const includeWebhooks = input.includeWebhooks === true;
  const campaigns = input.backups.map((backup, index) => {
    const campaign = isRecord(backup.campaign) ? backup.campaign : backup;
    const sourceCampaignId = stringField(campaign, "id", "campaign_id", "campaignId");
    const sourceName = stringField(campaign, "name", "campaign_name", "campaignName") ?? `restored-campaign-${index + 1}`;
    const restoreMode = backup.restoreMode ?? input.restoreMode ?? (backup.targetCampaignId || input.targetCampaignId ? "configure-existing" : "create-new");
    const targetCampaignId = backup.targetCampaignId ?? input.targetCampaignId ?? null;
    const targetCampaignName = backup.targetCampaignName ?? `${sourceName}${input.targetNameSuffix ?? " RESTORE"}`;
    const sequences = normalizeBackupSequences(Array.isArray(backup.sequences) ? backup.sequences : []);
    const leads = includeLeads ? normalizeBackupLeads(Array.isArray(backup.leads) ? backup.leads : []).slice(0, maxLeadsPerCampaign) : [];
    const emailAccountIds = normalizeBackupEmailAccountIds(Array.isArray(backup.emailAccounts) ? backup.emailAccounts : Array.isArray(backup.email_accounts) ? backup.email_accounts : []);
    const schedule = normalizeBackupSchedule(campaign);
    const settings = normalizeBackupSettings(campaign);
    const webhook = includeWebhooks ? normalizeBackupWebhook(Array.isArray(backup.webhooks) ? backup.webhooks : []) : undefined;
    const issues: string[] = [];
    if (restoreMode === "configure-existing" && !targetCampaignId) issues.push("missing targetCampaignId for configure-existing restore");
    if (restoreMode === "create-new" && !targetCampaignName.trim()) issues.push("missing target campaign name");
    if (!sequences.length) issues.push("missing sequences backup");
    if (includeLeads && !leads.length) issues.push("missing leads backup or includeLeads=false is required");
    if (!emailAccountIds.length) issues.push("missing email account ids; restore can still draft campaign but cannot link senders");
    const status: SmartleadCampaignRestorePlan["campaigns"][number]["status"] = issues.some((issue) => issue.startsWith("missing target") || issue === "missing sequences backup") ? "blocked" : issues.length ? "attention" : "ready";
    const leadBatches = chunk(leads, batchSize).map((batch, batchIndex) => ({ index: batchIndex + 1, size: batch.length, leads: batch }));
    const approvalPayloads: SmartleadCampaignRestorePlan["campaigns"][number]["approvalPayloads"] = { addLeads: [] };
    const nextToolCalls: SmartleadCampaignRestorePlan["campaigns"][number]["nextToolCalls"] = [];
    if (restoreMode === "create-new") {
      approvalPayloads.createCampaign = {
        name: targetCampaignName,
        clientId: input.clientId ?? null,
        sequences,
        emailAccountIds,
        schedule,
        settings,
        webhook,
        approval: { approved: true },
      };
      nextToolCalls.push({
        tool: "arcigy.create_smartlead_campaign",
        payload: approvalPayloads.createCampaign,
        reason: "Vytvor obnovenu Smartlead kampan az po explicitnom schvaleni operatora.",
        approvalRequired: true,
      });
    } else {
      approvalPayloads.configureCampaign = {
        campaignId: targetCampaignId,
        sequences,
        emailAccountIds,
        schedule,
        settings,
        webhook,
        approval: { approved: true },
      };
      nextToolCalls.push({
        tool: "arcigy.configure_smartlead_campaign",
        payload: approvalPayloads.configureCampaign,
        reason: "Nakonfiguruj existujucu Smartlead kampan zo zalohy az po explicitnom schvaleni operatora.",
        approvalRequired: true,
      });
    }
    for (const batch of leadBatches) {
      const payload = {
        campaignId: restoreMode === "configure-existing" ? targetCampaignId : "NEW_CAMPAIGN_ID_FROM_CREATE_STEP",
        leads: batch.leads,
        settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false },
        approval: { approved: true },
      };
      approvalPayloads.addLeads.push(payload);
      nextToolCalls.push({
        tool: "arcigy.add_leads_to_smartlead_campaign",
        payload,
        reason: "Obnov leadov po batchi az po vytvoreni/konfiguracii kampane a explicitnom schvaleni.",
        approvalRequired: true,
      });
    }
    return {
      sourceCampaignId,
      sourceName,
      targetCampaignId,
      targetCampaignName,
      restoreMode,
      status,
      issues,
      sourceBackupDir: backup.sourceBackupDir,
      sequences,
      emailAccountIds,
      schedule,
      settings,
      webhook,
      leadBatches,
      approvalPayloads,
      nextToolCalls,
    };
  });
  const blocked = campaigns.filter((campaign) => campaign.status === "blocked").length;
  const approvalCalls = campaigns.reduce((sum, campaign) => sum + campaign.nextToolCalls.filter((call) => call.approvalRequired).length, 0);
  const status: SmartleadCampaignRestorePlan["status"] = !campaigns.length || blocked === campaigns.length ? "blocked" : blocked ? "attention" : campaigns.some((campaign) => campaign.status === "attention") ? "attention" : "ready";
  return {
    mode: "smartlead-campaign-restore-plan",
    status,
    summary: `Smartlead restore plan: ${campaigns.length} backupov, ${campaigns.length - blocked} restorable, ${blocked} blocked, ${approvalCalls} approval krokov. Ziadny Smartlead zapis ani upload neprebehol.`,
    totals: {
      backups: campaigns.length,
      restorable: campaigns.length - blocked,
      blocked,
      protectedSources: campaigns.filter((campaign) => /kuchyne|protected/i.test(campaign.sourceName)).length,
      leads: campaigns.reduce((sum, campaign) => sum + campaign.leadBatches.reduce((batchSum, batch) => batchSum + batch.size, 0), 0),
      batches: campaigns.reduce((sum, campaign) => sum + campaign.leadBatches.length, 0),
      approvalCalls,
    },
    campaigns,
    safetyGates: [
      "Restore plan iba pripravuje approval payloady; nespusta create/configure/add-leads.",
      "Pri create-new najprv vytvor kampan, potom nahraj leady s NEW_CAMPAIGN_ID_FROM_CREATE_STEP nahradenym realnym ID.",
      "Pred restore porovnaj lead count zo zalohy s poctom pripravenych leadov v batchoch.",
      "Neprepajaj stare tracking/webhook URL bez kontroly, ak includeWebhooks nie je explicitne true.",
      "Pouzi ignore_global_block_list=false a ignore_unsubscribe_list=false pri restore leadov.",
    ],
    nextToolCalls: dedupeNextToolCalls(campaigns.flatMap((campaign) => campaign.nextToolCalls)),
  };
}

export function buildDailyLeadgenRunbook(input: {
  niche: { id?: string; slug: string; name: string; keywords?: string[]; region?: string; campaignId?: string | number | null };
  targetCount?: number;
  dailyLimit?: number;
  batchSize?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  includeSmartleadSetup?: boolean;
}): DailyLeadgenRunbook {
  const dailyLimit = Math.min(Math.max(Math.trunc(input.dailyLimit ?? 30), 1), 250);
  const discoveryCount = Math.min(Math.max(Math.trunc(input.targetCount ?? Math.ceil(dailyLimit * 1.5)), dailyLimit), 500);
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const queryPlan = buildNicheLeadgenPlan({
    niche: input.niche.slug || input.niche.name,
    region: input.niche.region,
    customKeywords: input.niche.keywords,
  });
  const primaryQuery = queryPlan.mapsQueries[0] ?? `${input.niche.name} ${input.niche.region ?? "Slovensko"}`.trim();
  const baseLead = { companyName: "Modelova Firma", website: "https://example.com", email: "lead@example.com", personalizedIntro: "Kratke AI intro." };
  const steps: DailyLeadgenRunbook["steps"] = [
    {
      order: 1,
      tool: "arcigy.build_niche_leadgen_plan",
      payload: { niche: input.niche.slug || input.niche.name, region: input.niche.region, customKeywords: input.niche.keywords },
      purpose: "Priprav niche-specific Google Maps/Serper queries a blacklist.",
      writes: false,
      approvalRequired: false,
    },
    {
      order: 2,
      tool: "arcigy.discover_leads",
      payload: { query: primaryQuery, placesQuery: primaryQuery, maxResults: discoveryCount },
      purpose: "Najdi kandidatske firmy cez Serper a Google Places.",
      writes: false,
      approvalRequired: false,
    },
    {
      order: 3,
      tool: "arcigy.preview_lead_enrichment_batch",
      payload: {
        niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name, campaignId: input.niche.campaignId ?? null },
        leads: [{ companyName: baseLead.companyName, website: baseLead.website, scraped: { emails: [baseLead.email] }, personalizedIntro: baseLead.personalizedIntro }],
        minScore: 70,
        batchSize,
      },
      purpose: "Zluc scrape/register/AI intro vysledky, dedupe, score a rozdel ready/manual/reject.",
      writes: false,
      approvalRequired: false,
    },
    {
      order: 4,
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name, campaignId: input.niche.campaignId ?? null }, leads: [baseLead], batchSize },
      purpose: "Priprav Smartlead lead_list batche a schvalovaci payload.",
      writes: false,
      approvalRequired: false,
    },
    {
      order: 5,
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: { campaignId: input.niche.campaignId ?? "SMARTLEAD_CAMPAIGN_ID", leads: [baseLead], approval: { approved: true } },
      purpose: "Uploadni iba operatorom schvalene ready leady do Smartlead.",
      writes: true,
      approvalRequired: true,
    },
  ];
  if (input.includeSmartleadSetup || !input.niche.campaignId) {
    steps.splice(4, 0, {
      order: 5,
      tool: "arcigy.draft_niche_smartlead_campaign_setup",
      payload: {
        niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name },
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language ?? "sk",
      },
      purpose: "Ak niche este nema kampan, priprav Smartlead campaign setup bez vytvorenia.",
      writes: false,
      approvalRequired: false,
    });
    steps.forEach((step, index) => (step.order = index + 1));
  }
  return {
    mode: "daily-leadgen-runbook",
    summary: `Denny leadgen runbook pre ${input.niche.name}${input.niche.region ? ` / ${input.niche.region}` : ""}: discovery ${discoveryCount}, denny limit ${dailyLimit}, batch ${batchSize}.`,
    niche: { id: input.niche.id, slug: input.niche.slug, name: input.niche.name, region: input.niche.region, campaignId: input.niche.campaignId ?? null },
    target: { discoveryCount, dailyLimit, batchSize },
    queryPlan,
    steps,
    safetyGates: [
      "Najprv pouzi read-only discovery/enrichment preview.",
      "Do Smartlead uploaduj iba ready leady so schvalenym payloadom.",
      "Manual review leady exportuj alebo oprav pred importom.",
      "Nikdy neber approval.approved=true ako implicitny suhlas bez operatora.",
    ],
  };
}

export function buildBatchNicheDiscoveryPlan(input: {
  niches: Array<{ id?: string; slug?: string; name: string; keywords?: string[]; regions?: string[]; dailyTarget?: number; campaignId?: string | number | null; smartleadCampaignId?: string | number | null }>;
  defaultRegions?: string[];
  maxNiches?: number;
  maxRegionsPerNiche?: number;
  dailyLimit?: number;
  targetCount?: number;
  batchSize?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  includeSmartleadSetup?: boolean;
}): BatchNicheDiscoveryPlan {
  const maxNiches = Math.min(Math.max(Math.trunc(input.maxNiches ?? 10), 1), 50);
  const maxRegionsPerNiche = Math.min(Math.max(Math.trunc(input.maxRegionsPerNiche ?? 3), 1), 20);
  const selectedNiches = input.niches.slice(0, maxNiches);
  const defaultRegions = input.defaultRegions?.length ? input.defaultRegions : ["Slovensko"];
  const plans: BatchNicheDiscoveryPlan["plans"] = [];
  const warnings: string[] = [];
  for (const sourceNiche of selectedNiches) {
    const slug = sourceNiche.slug?.trim() || slugify(sourceNiche.name);
    if (!slug || !sourceNiche.name.trim()) {
      warnings.push(`Skipped niche with missing slug/name: ${JSON.stringify(sourceNiche).slice(0, 120)}`);
      continue;
    }
    const regions = (sourceNiche.regions?.length ? sourceNiche.regions : defaultRegions).slice(0, maxRegionsPerNiche);
    for (const region of regions) {
      const niche = {
        id: sourceNiche.id,
        slug,
        name: sourceNiche.name,
        keywords: sourceNiche.keywords,
        region,
        campaignId: sourceNiche.campaignId ?? sourceNiche.smartleadCampaignId ?? null,
      };
      const runbook = buildDailyLeadgenRunbook({
        niche,
        targetCount: input.targetCount,
        dailyLimit: input.dailyLimit ?? sourceNiche.dailyTarget,
        batchSize: input.batchSize,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language,
        includeSmartleadSetup: input.includeSmartleadSetup,
      });
      plans.push({ niche: runbook.niche, queryPlan: runbook.queryPlan, runbook });
    }
  }
  const nextToolCalls = plans.flatMap((plan) => {
    const primaryQuery = plan.queryPlan.mapsQueries[0] ?? `${plan.niche.name} ${plan.niche.region ?? "Slovensko"}`.trim();
    return [
      {
        tool: "arcigy.build_daily_leadgen_runbook",
        payload: {
          niche: plan.niche,
          targetCount: input.targetCount,
          dailyLimit: input.dailyLimit,
          batchSize: input.batchSize,
          offer: input.offer,
          painPoint: input.painPoint,
          language: input.language ?? "sk",
          includeSmartleadSetup: input.includeSmartleadSetup === true,
        },
        reason: `Priprav detailny denny runbook pre ${plan.niche.name}${plan.niche.region ? ` / ${plan.niche.region}` : ""}.`,
        approvalRequired: false,
      },
      {
        tool: "arcigy.run_leadgen_research_pipeline",
        payload: {
          query: primaryQuery,
          placesQuery: primaryQuery,
          maxResults: Math.min(plan.runbook.target.discoveryCount, 25),
          scrapeWebsites: true,
          draftIntros: true,
          offer: input.offer,
          language: input.language ?? "sk",
        },
        reason: "Spusti read-only discovery + scrape + AI intro pipeline pre prvy query slot.",
        approvalRequired: false,
      },
    ];
  });
  const estimatedDailyLimit = plans.reduce((sum, plan) => sum + plan.runbook.target.dailyLimit, 0);
  return {
    mode: "batch-niche-discovery-plan",
    summary: `Batch niche discovery plan: ${plans.length} runbookov pre ${selectedNiches.length} niche, odhad denny limit ${estimatedDailyLimit}. Ziadny scraping ani upload neprebehol.`,
    totals: { niches: selectedNiches.length, regions: plans.length, runbooks: plans.length, discoveryCalls: plans.length, estimatedDailyLimit },
    plans,
    nextToolCalls,
    warnings,
  };
}

export function buildLeadDiscoveryMatrixPreview(input: {
  niches: Array<{ id?: string; slug?: string; name: string; keywords?: string[]; regions?: string[]; campaignId?: string | number | null; smartleadCampaignId?: string | number | null; targetCount?: number; priority?: number }>;
  defaultRegions?: string[];
  maxNiches?: number;
  maxRegionsPerNiche?: number;
  maxKeywordsPerNiche?: number;
  targetPerRegion?: number;
  country?: string;
  language?: string;
  useMaps?: boolean;
  useSerper?: boolean;
  existingDomains?: string[];
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
}): LeadDiscoveryMatrixPreview {
  const maxNiches = Math.min(Math.max(Math.trunc(input.maxNiches ?? 10), 1), 50);
  const maxRegionsPerNiche = Math.min(Math.max(Math.trunc(input.maxRegionsPerNiche ?? 8), 1), 80);
  const maxKeywordsPerNiche = Math.min(Math.max(Math.trunc(input.maxKeywordsPerNiche ?? 8), 1), 50);
  const targetPerRegion = Math.min(Math.max(Math.trunc(input.targetPerRegion ?? 25), 1), 500);
  const useMaps = input.useMaps !== false;
  const useSerper = input.useSerper !== false;
  const country = input.country ?? "sk";
  const language = input.language ?? "sk";
  const defaultRegions = input.defaultRegions?.length ? input.defaultRegions : slovakiaCapitalRegions;
  const globalBlacklistDomains = unique([...(input.blacklistDomains ?? []), ...defaultDiscoveryBlacklistDomains(country)]);
  const existingDomains = new Set((input.existingDomains ?? []).map(normalizeDomain).filter(Boolean));
  const warnings: string[] = [];

  const niches = input.niches.slice(0, maxNiches).flatMap((source, sourceIndex) => {
    const slug = source.slug?.trim() || slugify(source.name);
    if (!source.name.trim() || !slug) {
      warnings.push(`Skipped niche with missing name/slug at index ${sourceIndex}.`);
      return [];
    }
    const plan = buildNicheLeadgenPlan({ niche: slug || source.name, region: undefined, customKeywords: source.keywords });
    const keywords = unique([...(source.keywords ?? []), ...plan.mapsQueries, ...plan.serperQueries])
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, maxKeywordsPerNiche);
    const regions = (source.regions?.length ? source.regions : defaultRegions).slice(0, maxRegionsPerNiche);
    const blacklistKeywords = unique([...(input.blacklistKeywords ?? []), ...plan.blacklistKeywords]);
    const rows: LeadDiscoveryMatrixPreview["niches"][number]["rows"] = [];
    for (const [regionIndex, region] of regions.entries()) {
      for (const [keywordIndex, keyword] of keywords.entries()) {
        const queryBase = `${keyword} ${region}`.trim();
        rows.push({
          region,
          keyword,
          mapsQuery: `${queryBase} ${country.toUpperCase() === "SK" ? "Slovensko" : country}`.trim(),
          serperQuery: country.toLowerCase() === "au" ? `"${keyword}" "${region}" contact email` : `"${keyword}" "${region}" kontakt email`,
          targetCount: source.targetCount ?? targetPerRegion,
          priority: (source.priority ?? 5) * 100 + regionIndex * 10 + keywordIndex,
        });
      }
    }
    return [{
      niche: { id: source.id, slug, name: source.name, campaignId: source.campaignId ?? source.smartleadCampaignId ?? null },
      regions,
      keywords,
      blacklistDomains: globalBlacklistDomains,
      blacklistKeywords,
      targetPerRegion: source.targetCount ?? targetPerRegion,
      rows: rows.sort((a, b) => a.priority - b.priority),
    }];
  });

  const matrixRows = niches.reduce((sum, niche) => sum + niche.rows.length, 0);
  const nextToolCalls: LeadDiscoveryMatrixPreview["nextToolCalls"] = [];
  for (const niche of niches) {
    const firstRows = niche.rows.slice(0, 5);
    for (const row of firstRows) {
      nextToolCalls.push({
        tool: "arcigy.discover_leads",
        payload: {
          query: useSerper ? row.serperQuery : row.mapsQuery,
          placesQuery: useMaps ? row.mapsQuery : undefined,
          maxResults: row.targetCount,
          country,
          language,
        },
        reason: `Discovery slot pre ${niche.niche.name} / ${row.region} / ${row.keyword}.`,
        approvalRequired: false,
      });
    }
    nextToolCalls.push({
      tool: "arcigy.build_lead_source_import_queue_preview",
      payload: {
        sourceName: `${niche.niche.slug}-discovery-matrix`,
        sourceType: "google_maps",
        niches: [{ id: niche.niche.id, slug: niche.niche.slug, name: niche.niche.name, campaignId: niche.niche.campaignId ?? null }],
        blacklistDomains: globalBlacklistDomains,
        blacklistKeywords: niche.blacklistKeywords,
      },
      reason: "Po discovery zoskup leady podla niche, odfiltruj blacklist a priprav scrape/AI intro/Smartlead import.",
      approvalRequired: false,
    });
  }

  const targetLeads = niches.reduce((sum, niche) => sum + niche.regions.length * niche.targetPerRegion, 0);
  const status: LeadDiscoveryMatrixPreview["status"] = !niches.length ? "blocked" : warnings.length || existingDomains.size > 0 ? "attention" : "ready";
  return {
    mode: "lead-discovery-matrix-preview",
    status,
    summary: `Lead discovery matrix: ${niches.length} niche, ${matrixRows} query slotov, target ${targetLeads} leadov. Ziadne API volanie, scrape ani upload neprebehli.`,
    totals: {
      niches: niches.length,
      regions: unique(niches.flatMap((niche) => niche.regions)).length,
      keywords: unique(niches.flatMap((niche) => niche.keywords)).length,
      matrixRows,
      mapsQueries: useMaps ? matrixRows : 0,
      serperQueries: useSerper ? matrixRows : 0,
      estimatedSearchCalls: (useMaps ? matrixRows : 0) + (useSerper ? matrixRows : 0),
      targetLeads,
    },
    niches,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    safetyGates: [
      "Najprv spustaj len read-only discovery sloty po malych batchoch.",
      "Dedupe domeny proti existingDomains pred scrape/importom.",
      "Blacklistuj katalogy, social siete, job portaly a marketplace vysledky pred AI intro.",
      "Po discovery pouzi lead_source_import_queue_preview a az potom scrape, AI intro audit a Smartlead approval upload.",
    ],
    warnings,
  };
}

export function buildLeadgenExecutionQueuePreview(input: {
  niches: Array<{
    id?: string;
    slug?: string;
    name: string;
    status?: string;
    tier?: number;
    priority?: number;
    keywords?: string[];
    regions?: string[];
    currentRegionIndex?: number;
    dailyTarget?: number;
    todaySent?: number;
    campaignId?: string | number | null;
    smartleadCampaignId?: string | number | null;
  }>;
  date?: string;
  defaultRegions?: string[];
  maxQueue?: number;
  dailyLimit?: number;
  targetCount?: number;
  batchSize?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  includeSmartleadSetup?: boolean;
}): LeadgenExecutionQueuePreview {
  const maxQueue = Math.min(Math.max(Math.trunc(input.maxQueue ?? 8), 1), 30);
  const defaultRegions = input.defaultRegions?.length ? input.defaultRegions : ["Slovensko"];
  const warnings: string[] = [];
  const candidates = input.niches
    .map((source, index) => {
      const slug = source.slug?.trim() || slugify(source.name);
      const blocked = !source.name.trim() || !slug;
      const status = (source.status ?? "active").toLowerCase();
      const regions = source.regions?.length ? source.regions : defaultRegions;
      const regionIndex = Math.min(Math.max(Math.trunc(source.currentRegionIndex ?? 0), 0), Math.max(regions.length - 1, 0));
      const dailyLimit = Math.min(Math.max(Math.trunc(input.dailyLimit ?? source.dailyTarget ?? 30), 1), 250);
      const todaySent = Math.max(Math.trunc(source.todaySent ?? 0), 0);
      const remainingToday = Math.max(dailyLimit - todaySent, 0);
      const priority = Math.min(Math.max(Math.trunc(source.priority ?? source.tier ?? 5), 1), 99);
      return { source, index, slug, blocked, status, regions, regionIndex, dailyLimit, todaySent, remainingToday, priority };
    })
    .filter((item) => {
      if (item.blocked) {
        warnings.push(`Skipped niche with missing name/slug at index ${item.index}.`);
        return false;
      }
      if (["paused", "archived", "done", "disabled"].includes(item.status)) return false;
      if (item.remainingToday <= 0) return false;
      return true;
    })
    .sort((a, b) => a.priority - b.priority || b.remainingToday - a.remainingToday || a.index - b.index)
    .slice(0, maxQueue);

  const queue: LeadgenExecutionQueuePreview["queue"] = candidates.map((item, index) => {
    const region = item.regions[item.regionIndex] ?? defaultRegions[0] ?? "Slovensko";
    const campaignId = item.source.campaignId ?? item.source.smartleadCampaignId ?? null;
    const runbook = buildDailyLeadgenRunbook({
      niche: {
        id: item.source.id,
        slug: item.slug,
        name: item.source.name,
        keywords: item.source.keywords,
        region,
        campaignId,
      },
      targetCount: input.targetCount ?? Math.ceil(item.remainingToday * 1.5),
      dailyLimit: item.dailyLimit,
      batchSize: input.batchSize,
      offer: input.offer,
      painPoint: input.painPoint,
      language: input.language,
      includeSmartleadSetup: input.includeSmartleadSetup || !campaignId,
    });
    const status: LeadgenExecutionQueuePreview["queue"][number]["status"] = campaignId ? "ready" : "attention";
    return {
      order: index + 1,
      niche: runbook.niche,
      priority: item.priority,
      status,
      reason: status === "ready" ? `Remaining today ${item.remainingToday}; campaign is mapped.` : `Remaining today ${item.remainingToday}; campaign setup draft is needed.`,
      target: {
        remainingToday: item.remainingToday,
        discoveryCount: runbook.target.discoveryCount,
        dailyLimit: runbook.target.dailyLimit,
        batchSize: runbook.target.batchSize,
      },
      phases: runbook.steps.map((step) => ({
        order: step.order,
        tool: step.tool,
        purpose: step.purpose,
        writes: step.writes,
        approvalRequired: step.approvalRequired,
      })),
      runbook,
    };
  });

  const nextToolCalls = dedupeNextToolCalls(queue.flatMap((item) => {
    const primaryQuery = item.runbook.queryPlan.mapsQueries[0] ?? `${item.niche.name} ${item.niche.region ?? "Slovensko"}`.trim();
    return [
      {
        tool: "arcigy.build_daily_leadgen_runbook",
        payload: {
          niche: item.niche,
          targetCount: item.target.discoveryCount,
          dailyLimit: item.target.dailyLimit,
          batchSize: item.target.batchSize,
          offer: input.offer,
          painPoint: input.painPoint,
          language: input.language ?? "sk",
          includeSmartleadSetup: input.includeSmartleadSetup === true || !item.niche.campaignId,
        },
        reason: `Priprav detailny runbook pre queue slot ${item.order}: ${item.niche.name}.`,
        approvalRequired: false,
      },
      {
        tool: "arcigy.run_leadgen_research_pipeline",
        payload: {
          query: primaryQuery,
          placesQuery: primaryQuery,
          maxResults: Math.min(item.target.discoveryCount, 50),
          scrapeWebsites: true,
          draftIntros: true,
          offer: input.offer,
          language: input.language ?? "sk",
        },
        reason: `Spusti read-only discovery, scrape a AI intro pre ${item.niche.name}.`,
        approvalRequired: false,
      },
      {
        tool: "arcigy.build_smartlead_campaign_handoff_package_preview",
        payload: {
          niche: item.niche,
          offer: input.offer,
          painPoint: input.painPoint,
          language: input.language ?? "sk",
          batchSize: item.target.batchSize,
          leads: [{ email: "lead@example.com", companyName: "Modelova Firma", website: "https://example.com", personalizedIntro: "Kratke AI intro." }],
        },
        reason: `Po enrichment kroku zloz launch/QA/capacity handoff pre ${item.niche.name}.`,
        approvalRequired: false,
      },
    ];
  })).slice(0, 90);

  const readOnlyCalls = nextToolCalls.filter((call) => !call.approvalRequired).length;
  const approvalCalls = nextToolCalls.filter((call) => call.approvalRequired).length;
  const estimatedDailyLimit = queue.reduce((sum, item) => sum + item.target.dailyLimit, 0);
  const estimatedDiscoveryCount = queue.reduce((sum, item) => sum + item.target.discoveryCount, 0);
  const skipped = input.niches.length - queue.length;
  return {
    mode: "leadgen-execution-queue-preview",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    summary: `Leadgen execution queue: ${queue.length}/${input.niches.length} niche pripravene, discovery ${estimatedDiscoveryCount}, denny limit ${estimatedDailyLimit}. Ziadny scraping ani upload neprebehol.`,
    totals: {
      niches: input.niches.length,
      queued: queue.length,
      skipped,
      discoveryCalls: queue.length,
      readOnlyCalls,
      approvalCalls,
      estimatedDailyLimit,
      estimatedDiscoveryCount,
    },
    queue,
    nextToolCalls,
    warnings,
  };
}

export function buildRegionExpansionQueuePreview(input: {
  niches: Array<{
    id?: string;
    slug?: string;
    name: string;
    keywords?: string[];
    regions?: string[];
    visitedRegions?: string[];
    dailyTarget?: number;
    campaignId?: string | number | null;
    smartleadCampaignId?: string | number | null;
  }>;
  regionPreset?: "capitals" | "all_slovakia" | "custom";
  customRegions?: string[];
  excludedRegions?: string[];
  maxNiches?: number;
  maxRegionsPerNiche?: number;
  dailyLimit?: number;
  targetCount?: number;
  batchSize?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  includeSmartleadSetup?: boolean;
}): RegionExpansionQueuePreview {
  const preset = input.regionPreset ?? (input.customRegions?.length ? "custom" : "capitals");
  const baseRegions = unique((preset === "custom" ? input.customRegions : preset === "all_slovakia" ? slovakiaExpansionRegions : slovakiaCapitalRegions) ?? []).filter(Boolean);
  const excluded = new Set((input.excludedRegions ?? []).map(regionKey));
  const maxNiches = Math.min(Math.max(Math.trunc(input.maxNiches ?? 10), 1), 50);
  const maxRegionsPerNiche = Math.min(Math.max(Math.trunc(input.maxRegionsPerNiche ?? 8), 1), 80);
  const warnings: string[] = [];
  const selectedNiches = input.niches.slice(0, maxNiches);
  const results: RegionExpansionQueuePreview["niches"] = [];
  for (const source of selectedNiches) {
    const slug = source.slug?.trim() || slugify(source.name);
    if (!slug || !source.name.trim()) {
      warnings.push(`Skipped niche with missing name/slug: ${JSON.stringify(source).slice(0, 120)}`);
      continue;
    }
    const sourceRegions = source.regions?.length ? source.regions : baseRegions;
    const visited = new Set((source.visitedRegions ?? []).map(regionKey));
    const skippedRegions = sourceRegions.filter((region) => visited.has(regionKey(region)) || excluded.has(regionKey(region)));
    const queuedRegions = sourceRegions.filter((region) => !visited.has(regionKey(region)) && !excluded.has(regionKey(region))).slice(0, maxRegionsPerNiche);
    const niche = { id: source.id, slug, name: source.name, campaignId: source.campaignId ?? source.smartleadCampaignId ?? null };
    const batchPlan = buildBatchNicheDiscoveryPlan({
      niches: [{ ...niche, keywords: source.keywords, regions: queuedRegions, dailyTarget: source.dailyTarget }],
      maxNiches: 1,
      maxRegionsPerNiche,
      dailyLimit: input.dailyLimit ?? source.dailyTarget,
      targetCount: input.targetCount,
      batchSize: input.batchSize,
      offer: input.offer,
      painPoint: input.painPoint,
      language: input.language,
      includeSmartleadSetup: input.includeSmartleadSetup,
    });
    results.push({ niche, queuedRegions, skippedRegions, batchPlan });
  }
  const nextToolCalls = dedupeNextToolCalls([
    {
      tool: "arcigy.build_batch_niche_discovery_plan",
      payload: {
        niches: results.map((item) => ({
          ...item.niche,
          regions: item.queuedRegions,
          dailyTarget: input.dailyLimit,
        })),
        maxNiches,
        maxRegionsPerNiche,
        dailyLimit: input.dailyLimit,
        targetCount: input.targetCount,
        batchSize: input.batchSize,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language ?? "sk",
        includeSmartleadSetup: input.includeSmartleadSetup === true,
      },
      reason: "Priprav discovery runbooky pre vsetky zostavajuce regiony.",
      approvalRequired: false,
    },
    {
      tool: "arcigy.build_leadgen_execution_queue_preview",
      payload: {
        niches: results.map((item) => ({
          ...item.niche,
          regions: item.queuedRegions,
          dailyTarget: input.dailyLimit,
        })),
        maxQueue: Math.min(results.length, 30),
        batchSize: input.batchSize,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language ?? "sk",
        includeSmartleadSetup: input.includeSmartleadSetup === true,
      },
      reason: "Zorad najblizsi denny execution queue z region expansion planu.",
      approvalRequired: false,
    },
  ]);
  const queuedRegions = results.reduce((sum, item) => sum + item.queuedRegions.length, 0);
  const skippedRegions = results.reduce((sum, item) => sum + item.skippedRegions.length, 0);
  const estimatedDailyLimit = results.reduce((sum, item) => sum + item.batchPlan.totals.estimatedDailyLimit, 0);
  return {
    mode: "region-expansion-queue-preview",
    summary: `Region expansion queue: ${queuedRegions} regionov pre ${results.length} niche, ${skippedRegions} preskocenych, odhad denny limit ${estimatedDailyLimit}. Ziadny scraping ani upload neprebehol.`,
    preset,
    totals: { niches: results.length, regions: baseRegions.length, queuedRegions, skippedRegions, runbooks: results.reduce((sum, item) => sum + item.batchPlan.totals.runbooks, 0), estimatedDailyLimit },
    regions: baseRegions,
    niches: results,
    nextToolCalls,
    warnings,
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
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) throw new Error("Only http/https URLs are supported.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are supported.");
  return url.toString();
}

function titleFromHostname(hostname: string): string {
  const base = hostname.split(".").filter(Boolean)[0] ?? hostname;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || hostname;
}

function regionKey(value: string): string {
  return slugify(value.trim());
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

function extractSmartleadEmail(record: Record<string, unknown>): string | undefined {
  return stringField(record, "email", "lead_email", "primary_email")?.toLowerCase();
}

function duplicateSmartleadInputLeads(leads: SmartleadLead[]): SmartleadImportAuditPreview["duplicateInInput"] {
  const seen = new Set<string>();
  const duplicates: SmartleadImportAuditPreview["duplicateInInput"] = [];
  for (const lead of leads) {
    const email = lead.email?.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) {
      duplicates.push({ lead, duplicateOf: email, reason: "duplicate email in import batch" });
      continue;
    }
    seen.add(email);
  }
  return duplicates;
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

function normalizeEnrichmentLead(
  lead: ManualReviewPickupLead & {
    scraped?: Partial<ScrapedWebsiteContacts>;
    register?: Partial<SlovakRegisterLookup>;
    preAi?: { emails?: string[]; phones?: string[]; contextPreview?: string };
  },
  campaignTag?: string,
  defaultSource?: string
): LeadCandidateInput {
  const decisionMaker = decisionMakerForLead(lead) ?? lead.register?.executives?.[0];
  const names = splitName(decisionMaker);
  const email = selectBestEmail([stringField(lead, "email"), ...(lead.scraped?.emails ?? []), ...(lead.preAi?.emails ?? [])]);
  const phone = stringField(lead, "phone") ?? lead.scraped?.phones?.[0] ?? lead.preAi?.phones?.[0];
  const registerCompanyName = lead.register?.companyName;
  const companyName = companyNameForLead(lead) ?? registerCompanyName ?? stringField(lead, "originalName", "original_name") ?? "Unknown company";
  const website = stringField(lead, "website") ?? lead.scraped?.finalUrl ?? lead.scraped?.url;
  return {
    email,
    companyName,
    firstName: stringField(lead, "firstName") ?? names.firstName,
    lastName: stringField(lead, "lastName") ?? names.lastName,
    website,
    phone,
    source: defaultSource ?? stringField(lead, "source") ?? campaignTag,
    personalizedIntro: stringField(lead, "personalizedIntro", "icebreakerSentence", "icebreaker_sentence"),
    customFields: {
      ico: stringField(lead, "ico") ?? lead.register?.ico,
      address: stringField(lead, "address") ?? lead.register?.address,
      decision_maker_name: decisionMaker,
      official_company_name: stringField(lead, "officialCompanyName", "official_company_name") ?? registerCompanyName,
      company_name_short: stringField(lead, "companyNameShort", "company_name_short"),
      verification_status: stringField(lead, "verificationStatus", "verification_status") ?? (lead.register?.found ? "ok" : undefined),
      register_verified: lead.register?.found === true,
      campaign_tag: campaignTag,
      scraped_emails_count: lead.scraped?.emails?.length,
      scraped_phones_count: lead.scraped?.phones?.length,
    },
  };
}

function normalizePipelineLead(
  lead: LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string },
  campaignTag?: string,
  defaultSource?: string
): ManualReviewPickupLead & { scraped?: Partial<ScrapedWebsiteContacts> } {
  const scrapedEmail = selectBestEmail(lead.scraped?.emails ?? []);
  const scrapedPhone = lead.scraped?.phones?.[0];
  const contextPreview = lead.context ?? lead.scraped?.textPreview;
  return {
    ...lead,
    email: lead.email ?? scrapedEmail,
    phone: lead.phone ?? scrapedPhone,
    source: lead.source ?? defaultSource,
    personalizedIntro: lead.personalizedIntro ?? lead.intro?.personalizedIntro,
    customFields: {
      ...lead.customFields,
      campaign_tag: campaignTag,
      source: lead.source ?? defaultSource,
      context_preview: contextPreview ? redactSensitiveText(contextPreview).slice(0, 1200) : undefined,
    },
  };
}

function withSourceBundleDefaults(
  lead: LeadSourceImportQueueLead,
  sourceName: string,
  sourceType?: "google_maps" | "csv" | "json" | "serper" | "manual" | "other",
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null }
): LeadSourceImportQueueLead {
  return {
    ...lead,
    source: lead.source ?? sourceName,
    nicheSlug: lead.nicheSlug ?? niche?.slug,
    nicheName: lead.nicheName ?? niche?.name,
    campaignId: lead.campaignId ?? lead.smartleadCampaignId ?? niche?.campaignId,
    smartleadCampaignId: lead.smartleadCampaignId ?? niche?.campaignId,
    customFields: {
      ...lead.customFields,
      source_name: sourceName,
      source_type: sourceType,
      niche_slug: lead.nicheSlug ?? niche?.slug,
      niche_name: lead.nicheName ?? niche?.name,
      smartlead_campaign_id: lead.smartleadCampaignId ?? lead.campaignId ?? niche?.campaignId ?? undefined,
    },
  };
}

function parseJsonLeadExport(jsonText: string): { leads: LeadSourceImportQueueLead[]; warnings: string[] } {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const rows = extractJsonLeadRows(parsed);
    return {
      leads: rows.map(mapJsonLeadRow).filter((lead) => lead.companyName || lead.website || lead.email),
      warnings: rows.length ? [] : ["JSON parsed, but no lead rows were found."],
    };
  } catch (error) {
    return { leads: [], warnings: [`JSON parse failed: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`] };
  }
}

function extractJsonLeadRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ["leads", "results", "items", "data", "rows"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [value];
}

function mapJsonLeadRow(row: Record<string, unknown>): LeadSourceImportQueueLead {
  const custom = primitiveCustomFields(row);
  const website = stringField(row, "website", "web", "url", "domain", "google_domain", "finalUrl", "final_url");
  const scraped = isRecord(row.scraped) ? row.scraped as Partial<ScrapedWebsiteContacts> : undefined;
  const intro = isRecord(row.intro) ? row.intro as Partial<LeadIntroDraft> : undefined;
  const email = stringField(row, "email", "primary_email", "mail") ?? selectBestEmail(Array.isArray(row.emails) ? row.emails.map(String) : scraped?.emails ?? []);
  return {
    email,
    companyName: stringField(row, "companyName", "company_name", "official_company_name", "original_name", "name", "firma", "company", "title"),
    firstName: stringField(row, "firstName", "first_name", "meno"),
    lastName: stringField(row, "lastName", "last_name", "priezvisko", "decision_maker_last_name"),
    website: website ? normalizeWebsiteValue(website) : undefined,
    phone: stringField(row, "international_phone", "phone", "telefon", "tel") ?? (Array.isArray(row.phones) ? String(row.phones[0] ?? "") || undefined : scraped?.phones?.[0]),
    source: stringField(row, "source", "niche", "campaign_tag", "matched_queries", "smartlead_campaigns"),
    personalizedIntro: stringField(row, "personalizedIntro", "personalized_intro", "icebreaker", "icebreaker_sentence") ?? intro?.personalizedIntro,
    nicheSlug: stringField(row, "nicheSlug", "niche_slug"),
    nicheName: stringField(row, "nicheName", "niche_name"),
    campaignId: stringField(row, "campaignId", "campaign_id"),
    smartleadCampaignId: stringField(row, "smartleadCampaignId", "smartlead_campaign_id"),
    placeId: stringField(row, "placeId", "place_id", "google_place_id"),
    rating: numberField(row, "rating", "google_rating"),
    reviewCount: numberField(row, "reviewCount", "review_count", "reviews", "google_review_count"),
    scraped,
    intro,
    context: stringField(row, "context", "textPreview", "text_preview", "description"),
    customFields: custom,
  };
}

function primitiveCustomFields(row: Record<string, unknown>): Record<string, string | number | boolean | null | undefined> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [slugify(key).replace(/-/g, "_"), value as string | number | boolean | null])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function arrayLengthField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }
  return undefined;
}

function smartleadBackupFetchEndpoints(campaignId: string, leadPageSize: number): SmartleadCampaignBackupPlan["campaigns"][number]["fetchEndpoints"] {
  const encoded = encodeURIComponent(campaignId);
  return [
    { artifact: "campaign", method: "GET", path: `/campaigns/${encoded}` },
    { artifact: "sequences", method: "GET", path: `/campaigns/${encoded}/sequences` },
    { artifact: "leads", method: "GET", path: `/campaigns/${encoded}/leads?offset=0&limit=${leadPageSize}`, paginated: true },
    { artifact: "webhooks", method: "GET", path: `/campaigns/${encoded}/webhooks` },
    { artifact: "email_accounts", method: "GET", path: `/campaigns/${encoded}/email-accounts` },
  ];
}

function normalizeBackupSequences(rows: unknown[]): SmartleadSequence[] {
  return rows
    .filter(isRecord)
    .map((row, index) => {
      const seqNumber = numberField(row, "seq_number", "seqNumber") ?? index + 1;
      const delayDetails = isRecord(row.seq_delay_details) ? row.seq_delay_details : {};
      const delay = numberField(delayDetails, "delay_in_days", "delayInDays", "delay") ?? 0;
      const variantsSource = Array.isArray(row.sequence_variants) && row.sequence_variants.length ? row.sequence_variants.filter(isRecord) : [row];
      const seqVariants = variantsSource
        .filter((variant) => booleanField(variant, "is_deleted") !== true)
        .map((variant, variantIndex) => ({
          variant_label: stringField(variant, "variant_label", "variantLabel") ?? String.fromCharCode(65 + variantIndex),
          subject: stringField(variant, "subject") ?? "",
          email_body: stringField(variant, "email_body", "emailBody") ?? "",
        }))
        .filter((variant) => variant.subject || variant.email_body);
      return {
        seq_number: seqNumber,
        seq_delay_details: { delay_in_days: delay },
        seq_variants: seqVariants.length ? seqVariants : [{ variant_label: "A", subject: "", email_body: "" }],
      };
    })
    .filter((sequence) => sequence.seq_variants.some((variant) => variant.subject || variant.email_body));
}

function normalizeBackupLeads(rows: unknown[]): SmartleadLead[] {
  const leads: SmartleadLead[] = [];
  const seen = new Set<string>();
  for (const row of rows.filter(isRecord)) {
    const source = isRecord(row.lead) ? row.lead : row;
    const email = stringField(source, "email", "lead_email", "primary_email")?.toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const custom = isRecord(source.custom_fields) ? source.custom_fields : {};
    leads.push(buildSmartleadLead({
      email,
      firstName: stringField(source, "first_name", "firstName"),
      lastName: stringField(source, "last_name", "lastName"),
      companyName: stringField(source, "company_name", "companyName"),
      website: stringField(source, "website", "company_url", "companyUrl"),
      customFields: normalizeSmartleadCustomFields(custom),
    }));
  }
  return leads;
}

function normalizeSmartleadCustomFields(record: Record<string, unknown>): Record<string, string | number | boolean | null | undefined> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, value as string | number | boolean | null])
  );
}

function normalizeBackupEmailAccountIds(rows: unknown[]): Array<string | number> {
  return unique(rows.filter(isRecord).map((row) => stringField(row, "id", "email_account_id", "emailAccountId")).filter((value): value is string => Boolean(value)));
}

function normalizeBackupSchedule(campaign: Record<string, unknown>): SmartleadSchedule | undefined {
  const cron = isRecord(campaign.scheduler_cron_value) ? campaign.scheduler_cron_value : {};
  const days = Array.isArray(cron.days) ? cron.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : undefined;
  const schedule: SmartleadSchedule = {
    timezone: stringField(cron, "tz", "timezone") ?? "Europe/Bratislava",
    start_hour: stringField(cron, "startHour", "start_hour"),
    end_hour: stringField(cron, "endHour", "end_hour"),
    days_of_the_week: days?.length ? days : undefined,
    max_new_leads_per_day: numberField(campaign, "max_leads_per_day", "maxNewLeadsPerDay"),
    min_time_btw_emails: numberField(campaign, "min_time_btwn_emails", "min_time_btw_emails", "minTimeBetweenEmails"),
    schedule_start_time: stringField(campaign, "schedule_start_time") ?? null,
  };
  return Object.values(schedule).some((value) => value !== undefined && value !== null) ? schedule : undefined;
}

function normalizeBackupSettings(campaign: Record<string, unknown>): { trackOpen?: boolean; stopOnReply?: boolean; followUpPercentage?: number } {
  const trackSettings = Array.isArray(campaign.track_settings) ? campaign.track_settings.map(String) : [];
  return {
    trackOpen: !trackSettings.includes("DONT_TRACK_EMAIL_OPEN"),
    stopOnReply: stringField(campaign, "stop_lead_settings") !== "DONT_STOP",
    followUpPercentage: numberField(campaign, "follow_up_percentage"),
  };
}

function normalizeBackupWebhook(rows: unknown[]): { url: string; name?: string; eventTypes?: string[] } | undefined {
  const first = rows.find(isRecord);
  if (!first) return undefined;
  const url = stringField(first, "webhook_url", "url");
  if (!url) return undefined;
  return {
    url,
    name: stringField(first, "name"),
    eventTypes: Array.isArray(first.event_types) ? first.event_types.map(String) : undefined,
  };
}

function normalizeSourceQueueLead(lead: LeadSourceImportQueueLead, sourceName?: string, defaultSource?: string): LeadSourceImportQueueLead {
  const normalized = normalizePipelineLead(lead, lead.nicheSlug, defaultSource ?? sourceName) as LeadSourceImportQueueLead;
  const customFields = { ...(normalized.customFields ?? {}) };
  if (lead.nicheSlug) customFields.niche_slug = lead.nicheSlug;
  if (lead.nicheName) customFields.niche_name = lead.nicheName;
  if (lead.placeId) customFields.google_place_id = lead.placeId;
  if (typeof lead.rating === "number") customFields.google_rating = lead.rating;
  if (typeof lead.reviewCount === "number") customFields.google_review_count = lead.reviewCount;
  if (sourceName) customFields.source_name = sourceName;
  return {
    ...normalized,
    nicheSlug: lead.nicheSlug,
    nicheName: lead.nicheName,
    campaignId: lead.campaignId,
    placeId: lead.placeId,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    customFields,
  };
}

function resolveLeadQueueNiche(
  lead: LeadSourceImportQueueLead,
  niches?: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[] }>,
  defaultNiche?: { id?: string; slug: string; name: string; campaignId?: string | number | null }
): { id?: string; slug: string; name: string; campaignId?: string | number | null } | undefined {
  const explicitSlug = lead.nicheSlug ?? stringField(lead.customFields ?? {}, "niche_slug");
  const explicitName = lead.nicheName ?? stringField(lead.customFields ?? {}, "niche_name");
  const campaignId = lead.campaignId ?? lead.smartleadCampaignId ?? stringField(lead.customFields ?? {}, "campaign_id", "smartlead_campaign_id");
  const direct = (niches ?? []).find((niche) => {
    const aliases = [niche.slug, niche.name, ...(niche.aliases ?? [])].map(slugify);
    return (explicitSlug && aliases.includes(slugify(explicitSlug))) || (explicitName && aliases.includes(slugify(explicitName))) || (campaignId !== undefined && campaignId !== null && String(niche.campaignId ?? "") === String(campaignId));
  });
  if (direct) return { id: direct.id, slug: direct.slug, name: direct.name, campaignId: direct.campaignId ?? campaignId };
  if (explicitSlug || explicitName || campaignId !== undefined) {
    const name = explicitName ?? explicitSlug ?? `Campaign ${campaignId}`;
    return { slug: explicitSlug ? slugify(explicitSlug) : slugify(String(name)), name: String(name), campaignId };
  }
  return defaultNiche;
}

function inferOrphanLeadNiche(
  lead: LeadSourceImportQueueLead,
  niches: Array<{ id?: string; slug: string; name: string; campaignId?: string | number | null; aliases?: string[]; keywords?: string[] }>
): { niche: { id?: string; slug: string; name: string; campaignId?: string | number | null }; confidence: number; reasons: string[] } | null {
  const direct = resolveLeadQueueNiche(lead, niches);
  if (direct) return { niche: direct, confidence: 100, reasons: ["explicit niche/campaign field"] };
  const haystack = [
    lead.companyName,
    lead.website,
    lead.source,
    lead.context,
    stringField(lead.customFields ?? {}, "matched_queries", "source_name", "source", "types", "google_maps_url", "campaign_tag"),
  ].filter(Boolean).join(" ").toLowerCase();
  let best: { niche: { id?: string; slug: string; name: string; campaignId?: string | number | null }; confidence: number; reasons: string[] } | null = null;
  for (const niche of niches) {
    const terms = unique([niche.slug, niche.name, ...(niche.aliases ?? []), ...(niche.keywords ?? [])].map((term) => term.trim()).filter(Boolean));
    const hits = terms.filter((term) => haystack.includes(term.toLowerCase()));
    if (!hits.length) continue;
    const confidence = Math.min(95, 45 + hits.length * 20);
    if (!best || confidence > best.confidence) best = { niche: { id: niche.id, slug: niche.slug, name: niche.name, campaignId: niche.campaignId }, confidence, reasons: hits.map((hit) => `matched ${hit}`) };
  }
  return best;
}

function dedupeNextToolCalls<T extends { tool: string; payload: Record<string, unknown> }>(calls: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const call of calls) {
    const key = `${call.tool}:${JSON.stringify(call.payload)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(call);
  }
  return result;
}

function extractLeadIntro(lead: LeadCandidateInput & { intro?: Partial<LeadIntroDraft>; icebreakerSentence?: string; icebreaker_sentence?: string }): string | undefined {
  return stringField(lead, "personalizedIntro", "icebreakerSentence", "icebreaker_sentence")
    ?? lead.intro?.personalizedIntro
    ?? stringField(lead.customFields ?? {}, "personalized_intro", "icebreaker_sentence");
}

function introEvidenceText(lead: LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string }): string {
  return [
    lead.evidenceText,
    lead.context,
    lead.scraped?.title,
    lead.scraped?.description,
    lead.scraped?.textPreview,
    stringField(lead.customFields ?? {}, "context_preview", "source_context"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function importantIntroTerms(text: string): string[] {
  const stopwords = new Set([
    "a", "aj", "ale", "alebo", "and", "are", "bez", "by", "do", "for", "ich", "je", "na", "ne", "of", "pre", "sa", "si", "sme", "som",
    "su", "the", "to", "vas", "vase", "vasi", "vo", "we", "with", "ze", "you", "your",
  ]);
  return unique(text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopwords.has(word)))
    .slice(0, 20);
}

function introQualityIssues(
  intro: string | undefined,
  evidenceTerms: string[],
  minEvidenceTerms: number,
  lead: LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string }
): string[] {
  const issues: string[] = [];
  const trimmed = intro?.trim();
  if (!trimmed) return ["missing_intro"];
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (trimmed.length < 18 || trimmed.split(/\s+/).length < 4) issues.push("intro_too_short");
  if (/^(ahoj|dobry den|hello|hi|dear)\b/i.test(normalized)) issues.push("intro_contains_greeting");
  if (/[{}[\]]/.test(trimmed) || /%signature%|personalized_intro|companyname/i.test(trimmed)) issues.push("intro_has_placeholder");
  if (/kratke ai intro|vsimol som si vas web|zaujala ma vasa spolocnost|narazil som na vas web|mate zaujimavy web|modelova firma|example/i.test(normalized)) {
    issues.push("generic_intro");
  }
  const evidence = introEvidenceText(lead);
  if (!evidence && lead.website) {
    issues.push("missing_evidence");
  } else if (minEvidenceTerms > 0 && evidenceTerms.length) {
    const introTerms = importantIntroTerms(trimmed);
    const matches = introTerms.filter((term) => evidenceTerms.includes(term)).length;
    if (matches < minEvidenceTerms) issues.push("weak_evidence_grounding");
  }
  return issues;
}

function cleanupAiIntroSentence(intro: string | undefined, decisionMakerName?: string, salutationLastName?: string): { cleanedIntro?: string; changed: boolean; changes: string[] } {
  const changes: string[] = [];
  if (!intro?.trim()) return { cleanedIntro: undefined, changed: false, changes };
  let cleaned = intro.replace(/\s+/g, " ").trim();
  const beforeGreeting = cleaned;
  cleaned = cleaned
    .replace(/^(dobry den|dobrý deň|ahoj|zdravim|zdravím|hello|hi|dear)(?:\s+[^,]{1,60})?,?\s*/iu, "")
    .replace(/^(vazeny|vazena|vážený|vážená)\s+[^,]{1,80},?\s*/iu, "");
  if (cleaned !== beforeGreeting) changes.push("removed_greeting");
  if (cleaned !== beforeGreeting && decisionMakerName && beforeGreeting.toLowerCase().includes(decisionMakerName.toLowerCase().split(/\s+/).slice(-1)[0] ?? "")) {
    changes.push("removed_decision_maker");
  }

  const beforeName = cleaned;
  for (const value of [decisionMakerName, salutationLastName].filter((item): item is string => Boolean(item?.trim()))) {
    cleaned = cleaned.replace(new RegExp(`${escapeRegex(value.trim())},?\\s*`, "iu"), "");
    const surname = value.trim().split(/\s+/).filter(Boolean).slice(-1)[0];
    if (surname) cleaned = cleaned.replace(new RegExp(`(?:pan|pani|pán)\\s+${escapeRegex(surname)},?\\s*`, "iu"), "");
  }
  if (cleaned !== beforeName && !changes.includes("removed_decision_maker")) changes.push("removed_decision_maker");

  cleaned = cleaned
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/^\s*[,.-]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const beforePrefix = cleaned;
  if (/^zaujalo?\s+ma\b/iu.test(cleaned)) {
    cleaned = cleaned.replace(/^zaujalo?\s+ma\b/iu, "Zaujalo ma");
  } else if (/^vsimol\s+som\s+si\b/iu.test(normalizeNameToken(cleaned))) {
    cleaned = cleaned.replace(/^vsimol\s+som\s+si\b/iu, "Vsimol som si");
  } else if (/^(ze|že)\s+/iu.test(cleaned)) {
    cleaned = `Zaujalo ma, ze ${cleaned.replace(/^(ze|že)\s+/iu, "")}`;
  } else if (!/^(zaujalo ma|vsimol som si|paci sa mi|pači sa mi|oceňujem|ocenujem)\b/iu.test(cleaned)) {
    cleaned = `Zaujalo ma, ze ${cleaned}`;
  }
  if (cleaned !== beforePrefix) changes.push("normalized_prefix");

  cleaned = cleaned.replace(/^Zaujalo ma,\s*ze\s*(ze|že)\s+/iu, "Zaujalo ma, ze ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return { cleanedIntro: undefined, changed: changes.length > 0, changes };
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return { cleanedIntro: cleaned, changed: cleaned !== intro.trim(), changes };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}

function leadRepairIssues(lead: LeadRepairQueueLead, duplicateKeys: Set<string>): string[] {
  const issues: string[] = [];
  const verificationStatus = lead.verificationStatus ?? (lead.customFields?.verification_status as LeadRepairQueueLead["verificationStatus"]);
  if (verificationStatus === "failed") return ["verification_failed"];
  if (lead.sentToSmartlead) return ["already_sent_to_smartlead"];
  const email = lead.email?.trim().toLowerCase();
  const identity = leadIdentityKey(lead)?.value;
  if (!email) issues.push("missing_email");
  else if (!email.includes("@")) issues.push("invalid_email");
  else if (isGenericEmail(email)) issues.push("generic_email");
  if (!lead.website) issues.push("missing_website");
  if (!lead.companyName) issues.push("missing_company_name");
  const intro = lead.personalizedIntro?.trim();
  if (!intro) issues.push("missing_intro");
  else {
    if (/^(ahoj|dobry den|dobrý deň|hello|hi|dear)\b/i.test(intro)) issues.push("bad_intro_greeting");
    if (intro.length < 18) issues.push("bad_intro_too_short");
  }
  if (![lead.firstName, lead.lastName].filter(Boolean).join(" ") && !lead.customFields?.decision_maker_name && !lead.register?.executives?.length) issues.push("missing_decision_maker");
  if (identity && duplicateKeys.has(identity)) issues.push("duplicate_candidate");
  return issues;
}

function repairToolsForIssues(issues: string[]): string[] {
  const tools = new Set<string>();
  if (issues.some((issue) => ["missing_email", "invalid_email", "generic_email"].includes(issue))) tools.add("arcigy.batch_scrape_website_contacts");
  if (issues.some((issue) => ["missing_intro", "bad_intro_greeting", "bad_intro_too_short"].includes(issue))) tools.add("arcigy.batch_draft_lead_intros");
  if (issues.includes("missing_decision_maker")) tools.add("arcigy.enrich_slovak_company_register");
  tools.add("arcigy.build_manual_review_queue");
  return [...tools];
}

function leadRepairSeverity(issues: string[]): "ready" | "repair" | "manual_review" | "reject" {
  if (issues.includes("verification_failed") || issues.includes("already_sent_to_smartlead")) return "reject";
  if (issues.includes("missing_company_name") || issues.includes("missing_website")) return "manual_review";
  if (issues.length) return "repair";
  return "ready";
}

function leadGaps(lead: LeadCandidateInput): string[] {
  const gaps: string[] = [];
  if (!lead.email) gaps.push("email");
  if (!lead.website) gaps.push("website");
  if (!lead.companyName) gaps.push("company_name");
  if (!lead.personalizedIntro) gaps.push("personalized_intro");
  if (![lead.firstName, lead.lastName].filter(Boolean).join(" ") && !lead.customFields?.decision_maker_name) gaps.push("decision_maker");
  return gaps;
}

function emptyBatchScrape(urls: string[]): BatchScrapedWebsiteContacts {
  return {
    mode: "batch-website-contact-scrape",
    totals: { input: urls.length, scraped: 0, failed: 0, emailsFound: 0, phonesFound: 0 },
    results: [],
    failures: [],
    summary: "Batch scrape preskoceny. Ziadny zapis neprebehol.",
  };
}

function leadIntroKey(input: { companyName: string; website?: string }): string {
  return `${input.companyName.trim().toLowerCase()}|${input.website?.trim().toLowerCase() ?? ""}`;
}

function scrapeMatchesLead(scrape: Partial<ScrapedWebsiteContacts>, lead: LeadCandidateInput): boolean {
  const leadDomain = normalizeDomain(lead.website ?? "");
  const scrapeDomains = [scrape.url, scrape.finalUrl].map((value) => normalizeDomain(value ?? "")).filter(Boolean);
  return Boolean(leadDomain && scrapeDomains.includes(leadDomain));
}

function introMatchesLead(intro: Partial<LeadIntroDraft>, lead: LeadCandidateInput): boolean {
  const introDomain = normalizeDomain(intro.website ?? "");
  const leadDomain = normalizeDomain(lead.website ?? "");
  if (introDomain && leadDomain && introDomain === leadDomain) return true;
  const introName = slugify(intro.companyName ?? "");
  const leadName = slugify(lead.companyName ?? "");
  return Boolean(introName && leadName && introName === leadName);
}

function checkItem(ok: boolean, key: string, message: string): SmartleadCampaignQaPreview["checks"][number] {
  return { key, status: ok ? "ready" : "blocked", message };
}

function attentionItem(ok: boolean, key: string, message: string): SmartleadCampaignQaPreview["checks"][number] {
  return { key, status: ok ? "ready" : "attention", message };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function extractTemplateVariables(value: string): string[] {
  return [...value.matchAll(/\{\{[a-zA-Z0-9_]+\}\}/g)].map((match) => match[0]);
}

function smartleadTemplateValues(lead: SmartleadLead, signature: string): Record<string, string> {
  const custom = Object.fromEntries(Object.entries(lead.custom_fields ?? {}).map(([key, value]) => [key, String(value)]));
  return {
    ...custom,
    email: lead.email,
    first_name: lead.first_name ?? "",
    last_name: lead.last_name ?? "",
    company_name: lead.company_name ?? "",
    website: lead.website ?? "",
    personalized_intro: String(lead.custom_fields?.personalized_intro ?? ""),
    "%signature%": signature,
  };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  const withVariables = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => values[key] ?? match);
  return withVariables.replace(/%signature%/g, values["%signature%"] ?? "%signature%");
}

function unresolvedTemplateVariables(value: string): string[] {
  return [...value.matchAll(/\{\{[a-zA-Z0-9_]+\}\}/g)].map((match) => match[0]);
}

function splitName(value?: string): { firstName?: string; lastName?: string } {
  const parts = value?.split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

function splitNameForSalutation(value: string | undefined, lead: LeadRepairQueueLead): { firstName?: string; lastName?: string } {
  const directFirst = stringField(lead, "firstName", "first_name") ?? stringField(lead.customFields ?? {}, "decision_maker_first_name", "first_name");
  const directLast = stringField(lead, "lastName", "last_name") ?? stringField(lead.customFields ?? {}, "decision_maker_last_name", "last_name");
  if (directLast) return { firstName: directFirst, lastName: directLast };
  const titles = new Set(["ing", "mgr", "bc", "mudr", "judr", "rndr", "phd", "mba"]);
  const parts = (value ?? "").replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).filter((part) => !titles.has(normalizeNameToken(part)));
  return { firstName: directFirst ?? parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

function normalizeGender(value?: string): "male" | "female" | "unknown" | undefined {
  const normalized = normalizeNameToken(value);
  if (["male", "m", "muz", "pan"].includes(normalized)) return "male";
  if (["female", "f", "zena", "pani"].includes(normalized)) return "female";
  if (normalized === "unknown") return "unknown";
  return undefined;
}

function inferSlovakGender(firstName?: string, lastName?: string): "male" | "female" | "unknown" {
  const first = normalizeNameToken(firstName);
  const last = normalizeNameToken(lastName);
  if (!first && !last) return "unknown";
  if (last.endsWith("ova") || last.endsWith("ska") || last.endsWith("cka") || last.endsWith("eva")) return "female";
  const femaleNames = new Set(["anna", "eva", "jana", "maria", "monika", "zuzana", "katarina", "martina", "lenka", "ivana", "denisa", "miriam", "karin", "viktoria", "lucia", "petra"]);
  const maleAEndings = new Set(["matusa", "misa", "laca", "pala", "palo", "miro", "mato", "kuba", "jura", "attila"]);
  if (femaleNames.has(first)) return "female";
  if (first.endsWith("a") && !maleAEndings.has(first)) return "female";
  return "male";
}

function normalizeNameToken(value?: string): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function selectBestEmail(values: Array<string | undefined>): string | undefined {
  const emails = unique(values.filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase()).filter((value) => value.includes("@")));
  return emails.find((email) => !isGenericEmail(email)) ?? emails[0];
}

function buildEnrichmentNextToolCalls(
  leads: LeadCandidateInput[],
  queue: ReturnType<typeof buildManualReviewQueue>,
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null },
  smartleadPlan?: SmartleadInjectionPlan
): LeadEnrichmentBatchPreview["nextToolCalls"] {
  const calls: LeadEnrichmentBatchPreview["nextToolCalls"] = [];
  const needsScrape = leads.filter((lead) => lead.website && !lead.email).slice(0, 5);
  for (const lead of needsScrape) {
    calls.push({ tool: "arcigy.scrape_website_contacts", payload: { url: lead.website, includePriorityPages: true, maxPages: 4 }, reason: "Chyba email, skus kontaktne podstranky." });
  }
  const needsIntro = [...queue.ready, ...queue.review].filter((item) => !item.lead.personalizedIntro && item.lead.companyName).slice(0, 5);
  for (const item of needsIntro) {
    calls.push({ tool: "arcigy.draft_lead_intro", payload: { companyName: item.lead.companyName, website: item.lead.website, language: "sk" }, reason: "Chyba personalizovane intro pre cold email." });
  }
  if (niche && smartleadPlan?.addLeadsApprovalPayload) {
    calls.push({ tool: "arcigy.add_leads_to_smartlead_campaign", payload: smartleadPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>, reason: "Ready leady su pripravene na upload po explicitnom schvaleni." });
  } else if (niche && queue.ready.length > 0) {
    calls.push({ tool: "arcigy.draft_niche_smartlead_campaign_setup", payload: { niche: { id: niche.id, slug: niche.slug, name: niche.name } }, reason: "Niche nema campaignId, najprv priprav kampan." });
  }
  return calls;
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
  const website = value("website", "web", "url", "domain", "google_domain");
  const source = value("source", "niche", "campaign_tag", "matched_queries", "smartlead_campaigns");
  return {
    raw,
    email: value("email", "primary_email", "mail", "smartlead_emails"),
    companyName: value("companyName", "company_name", "official_company_name", "original_name", "name", "firma", "company"),
    firstName: value("firstName", "first_name", "meno"),
    lastName: value("lastName", "last_name", "priezvisko", "decision_maker_last_name"),
    website: website ? normalizeWebsiteValue(website) : undefined,
    phone: value("international_phone", "phone", "telefon", "tel"),
    source,
    personalizedIntro: value("personalizedIntro", "personalized_intro", "icebreaker", "icebreaker_sentence"),
    customFields: Object.fromEntries(
      Object.entries(raw)
        .filter(([key, item]) => item && csvCustomFieldKeys.has(slugify(key).replace(/-/g, "_")))
        .map(([key, item]) => [slugify(key).replace(/-/g, "_"), item])
    ),
  };
}

const csvCustomFieldKeys = new Set([
  "address",
  "business_status",
  "cold_email_sent",
  "collected_at",
  "decision_maker_name",
  "district_city",
  "google_domain",
  "google_maps_url",
  "ico",
  "lead_category_id",
  "matched_queries",
  "phone_source_urls",
  "priority_score",
  "rating",
  "reviews",
  "sent_messages",
  "size_signal",
  "blocked_or_unsubscribed",
  "smartlead_status",
  "smartlead_campaigns",
  "smartlead_match",
  "smartlead_replied",
  "smartlead_sent_messages",
  "smartlead_statuses",
  "types",
  "verification_status",
]);

function normalizeWebsiteValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function csvMappedFields(headers: string[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  const groups: Record<string, string[]> = {
    email: ["email", "primary_email", "mail", "smartlead_emails"],
    companyName: ["companyName", "company_name", "official_company_name", "original_name", "name", "firma", "company"],
    firstName: ["firstName", "first_name", "meno"],
    lastName: ["lastName", "last_name", "priezvisko", "decision_maker_last_name"],
    website: ["website", "web", "url", "domain", "google_domain"],
    phone: ["international_phone", "phone", "telefon", "tel"],
    source: ["source", "niche", "campaign_tag", "matched_queries", "smartlead_campaigns"],
    personalizedIntro: ["personalizedIntro", "personalized_intro", "icebreaker", "icebreaker_sentence"],
    smartleadStatus: ["smartlead_statuses", "smartlead_match", "smartlead_replied", "smartlead_sent_messages", "cold_email_sent"],
  };
  for (const [field, aliases] of Object.entries(groups)) {
    const normalizedAliases = new Set(aliases.map(slugify));
    const matches = headers.filter((header) => normalizedAliases.has(slugify(header)));
    if (matches.length) fields[field] = matches;
  }
  return fields;
}

function smartleadHistoryEvidence(lead: LeadCandidateInput): Record<string, string> {
  const custom = lead.customFields ?? {};
  const field = (...keys: string[]) => keys.map((key) => custom[key]).find((value) => value !== undefined && value !== null && String(value).trim())?.toString().trim() ?? "";
  return {
    cold_email_sent: field("cold_email_sent"),
    smartlead_replied: field("smartlead_replied"),
    smartlead_match: field("smartlead_match"),
    smartlead_campaigns: field("smartlead_campaigns"),
    smartlead_statuses: field("smartlead_statuses", "smartlead_status", "status"),
    smartlead_sent_messages: field("smartlead_sent_messages", "sent_messages"),
    smartlead_emails: field("smartlead_emails"),
  };
}

function smartleadHistorySuppressionReason(
  evidence: Record<string, string>,
  input: { suppressAlreadySent?: boolean; suppressReplies?: boolean; suppressBlockedStatuses?: boolean; suppressExistingSmartleadMatch?: boolean }
): string | null {
  if (input.suppressReplies !== false && truthyHistoryFlag(evidence.smartlead_replied)) return "already_replied";
  if (input.suppressBlockedStatuses !== false && /(blocked|bounced|unsubscribed|replied|completed|stopped|paused)/i.test(evidence.smartlead_statuses)) return "blocked_status";
  if (input.suppressAlreadySent !== false && (truthyHistoryFlag(evidence.cold_email_sent) || Number(evidence.smartlead_sent_messages || 0) > 0)) return "already_sent";
  if (input.suppressExistingSmartleadMatch !== false && (truthyHistoryFlag(evidence.smartlead_match) || Boolean(evidence.smartlead_campaigns || evidence.smartlead_emails))) return "already_in_smartlead";
  return null;
}

function truthyHistoryFlag(value?: string): boolean {
  return /^(1|true|yes|ano|y|sent|replied|domain|email|match)$/i.test(String(value ?? "").trim());
}

function truthyEvidence(value?: string): boolean {
  return /^(1|true|yes|ano|y|replied|reply)$/i.test(String(value ?? "").trim());
}

function numericEvidence(value?: string): number {
  const normalized = String(value ?? "").replace(",", ".").trim();
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function smartleadBlockedEvidence(lead: LeadCandidateInput, evidence: Record<string, string>): boolean {
  const custom = lead.customFields ?? {};
  const blocked = stringField(custom, "blocked_or_unsubscribed", "is_unsubscribed", "unsubscribed");
  return truthyEvidence(blocked)
    || /(blocked|bounced|unsubscribed|stopped|paused)/i.test(evidence.smartlead_statuses)
    || /(blocked|bounced|unsubscribed|stopped|paused)/i.test(stringField(custom, "smartlead_status", "status") ?? "");
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

function defaultDiscoveryBlacklistDomains(country: string): string[] {
  const common = [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "google.com",
    "maps.google.com",
    "wikipedia.org",
    "openstreetmap.org",
  ];
  if (country.toLowerCase() === "au") {
    return unique([...common, "yellowpages.com.au", "truelocal.com.au", "hipages.com.au", "oneflare.com.au", "houzz.com.au", "airtasker.com"]);
  }
  return unique([...common, "zivefirmy.sk", "firmy.sk", "zlatestranky.sk", "azet.sk", "bazos.sk", "heureka.sk", "alza.sk"]);
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
