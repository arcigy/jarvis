import { redactSensitiveText, safeAiPromptPart, safeUntrustedAiPromptPart } from "./ai-safety.ts";
import { discoverLeads, type NormalizedLead } from "./lead-discovery.ts";
import { buildSmartleadLead, type SmartleadLead, type SmartleadSchedule, type SmartleadSequence } from "./smartlead.ts";
import { generateGeminiText, type FetchLike } from "./gemini.ts";
import type { RuntimeEnv } from "./env.ts";
import type { LocalPersonKind } from "./types.ts";

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

export type WebsiteScrapeQualityAuditPreview = {
  mode: "website-scrape-quality-audit-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    input: number;
    ready: number;
    needsRescrape: number;
    manualReview: number;
    contactsFound: number;
    phonesFound: number;
    preferredEmails: number;
    shortText: number;
    failures: number;
  };
  items: Array<{
    scrape: Partial<ScrapedWebsiteContacts>;
    status: "ready" | "needs_rescrape" | "manual_review";
    issues: string[];
    preferredEmail?: string;
    preferredPhone?: string;
    evidenceText: string;
    internalPriorityLinks: string[];
    icoCandidates: string[];
  }>;
  enrichedLeads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; evidenceText?: string }>;
  rescrapeUrls: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type FailedScrapeRecoveryQueuePreview = {
  mode: "failed-scrape-recovery-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    failedUrls: number;
    weakScrapes: number;
    retryUrls: number;
    fetchUrls: number;
    fallbackSearches: number;
    contactSelectionReady: number;
    leadsAffected: number;
  };
  retryUrls: string[];
  fetchUrls: string[];
  fallbackSearches: Array<{ query: string; website?: string; companyName?: string; reason: string }>;
  affectedLeads: LeadCandidateInput[];
  scrapeAudit: WebsiteScrapeQualityAuditPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type OutreachContactSelectionPreview = {
  mode: "outreach-contact-selection-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; scrapedResults: number; failures: number };
  totals: {
    input: number;
    ready: number;
    needsSearch: number;
    manualReview: number;
    selectedPersonalEmails: number;
    selectedGenericEmails: number;
    missingEmail: number;
    missingPhone: number;
    freeMailboxSelected: number;
    fallbackSearches: number;
    introsToDraft: number;
  };
  items: Array<{
    scrape: Partial<ScrapedWebsiteContacts>;
    lead?: LeadCandidateInput;
    status: "ready" | "needs_search" | "manual_review";
    selectedEmail?: string;
    selectedPhone?: string;
    rankedEmails: Array<{ email: string; score: number; quality: "personal" | "generic" | "free_mailbox" | "external" | "asset" | "invalid"; reasons: string[] }>;
    issues: string[];
    evidenceText: string;
  }>;
  fallbackSearches: Array<{ query: string; website?: string; companyName?: string; reason: string }>;
  enrichedLeads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; evidenceText?: string }>;
  introInputs: LeadIntroInput[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type FlaggedLeadReviewPreview = {
  mode: "flagged-lead-review-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; parsedFromCsv: number };
  totals: {
    input: number;
    readyWriteback: number;
    needsRescrape: number;
    needsRedraft: number;
    needsIdentityReview: number;
    rejected: number;
    missingDecisionMaker: number;
    noWebsiteContent: number;
    genericIntro: number;
  };
  items: Array<{
    id?: string;
    lead: LeadCandidateInput & { id?: string; raw?: Record<string, string>; evidenceText?: string };
    note?: string;
    status: "ready_writeback" | "rescrape" | "redraft" | "identity_review" | "reject";
    issues: string[];
    nextAction: string;
  }>;
  readyIcebreakers: Array<{ id: string; icebreaker: string }>;
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

export type AiIntroWorkPacketPreview = {
  mode: "ai-intro-work-packet-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; niche?: string; parsedFromCsv: number; language: "sk" | "en"; offer?: string };
  totals: {
    input: number;
    eligible: number;
    skippedExistingIntro: number;
    missingCompany: number;
    noContext: number;
    packetItems: number;
    completedIntros: number;
    validCompleted: number;
    invalidCompleted: number;
  };
  packetItems: Array<{
    id: string;
    lead: LeadCandidateInput & { id?: string; raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown };
    companyName: string;
    website?: string;
    context: string;
    evidenceTerms: string[];
  }>;
  markdownTask: string;
  expectedJson: Array<{ id: string; icebreaker: string }>;
  completedItems: Array<{ id: string; status: "valid" | "invalid" | "unknown_lead"; icebreaker?: string; issues: string[] }>;
  mergedLeads: LeadCandidateInput[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type BulkAiIntroWorkQueuePreview = {
  mode: "bulk-ai-intro-work-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    groups: number;
    batches: number;
    inputLeads: number;
    queuedLeads: number;
    skippedExistingIntro: number;
    missingCompany: number;
    noContext: number;
    parsedFromCsv: number;
  };
  queue: Array<{
    order: number;
    groupName?: string;
    niche?: string;
    status: "ready" | "attention" | "blocked";
    leadCount: number;
    packet: AiIntroWorkPacketPreview;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type AiIntroImportPreview = {
  mode: "ai-intro-import-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; niche?: string; resultFormat: "direct" | "json" | "csv" | "mixed"; parsedFromCsv: number; language: "sk" | "en"; offer?: string };
  totals: {
    leads: number;
    parsedResults: number;
    uniqueResults: number;
    duplicateIds: number;
    validCompleted: number;
    invalidCompleted: number;
    unknownLead: number;
    mergedLeads: number;
  };
  parsedResults: Array<{ id: string; icebreaker?: string; source: "direct" | "json" | "csv"; rowNumber?: number }>;
  duplicateIds: string[];
  completedItems: AiIntroWorkPacketPreview["completedItems"];
  invalidItems: AiIntroWorkPacketPreview["completedItems"];
  mergedLeads: LeadCandidateInput[];
  workPacket: AiIntroWorkPacketPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type AiIcebreakerWritebackPreview = {
  mode: "ai-icebreaker-writeback-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; niche?: string; parsedFromJson: number; language: "sk" | "en"; offer?: string };
  totals: {
    leads: number;
    parsedIcebreakers: number;
    valid: number;
    invalid: number;
    unknownLead: number;
    duplicateIds: number;
    mergedLeads: number;
    smartleadReady: number;
  };
  items: Array<{
    id: string;
    status: "valid" | "invalid" | "unknown_lead" | "duplicate";
    icebreaker?: string;
    issues: string[];
    lead?: LeadCandidateInput & { id?: string; leadId?: string; lead_id?: string; raw?: Record<string, string> };
  }>;
  mergedLeads: PreparedSmartleadLeadInput[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenStatusBoardPreview = {
  mode: "leadgen-status-board-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; parsedFromCsv: number; groupBy: "niche" | "campaign" | "source" };
  totals: {
    input: number;
    groups: number;
    readyForSmartlead: number;
    needsEmail: number;
    needsIntro: number;
    needsPhone: number;
    sentToSmartlead: number;
    verified: number;
    failed: number;
    orphan: number;
  };
  groups: Array<{
    key: string;
    label: string;
    campaignId?: string | number | null;
    totals: LeadgenStatusBoardPreview["totals"];
    readyLeads: LeadCandidateInput[];
    needsEmailLeads: LeadCandidateInput[];
    needsIntroLeads: LeadCandidateInput[];
    needsPhoneLeads: LeadCandidateInput[];
    failedLeads: LeadCandidateInput[];
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenDbStatusPreview = {
  mode: "leadgen-db-status-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; parsedFromCsv: number; nicheFilter?: string };
  totals: {
    niches: number;
    totalLeads: number;
    enriched: number;
    inSmartlead: number;
    verified: number;
    pendingEnrich: number;
    failed: number;
    blacklistDomains: number;
    resumeStates: number;
    avgEnrichedPercent: number;
    avgVerifiedPercent: number;
  };
  niches: Array<{
    slug: string;
    name: string;
    campaignId?: string | number | null;
    total: number;
    enriched: number;
    enrichedPercent: number;
    inSmartlead: number;
    smartleadPercent: number;
    verified: number;
    verifiedPercent: number;
    pendingEnrich: number;
    failed: number;
    resumeRegionIndex?: number;
    nextRegion?: string;
    updatedAt?: string;
    status: "ready_to_inject" | "needs_enrich" | "needs_verification" | "sent" | "empty";
    nextAction: string;
  }>;
  resumeStates: Array<{ key: string; regionIndex?: number; updatedAt?: string }>;
  blacklistDomains: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadgenMaintenanceRunbookPreview = {
  mode: "leadgen-maintenance-runbook-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; parsedFromCsv: number; generatedAt: string };
  totals: {
    inputLeads: number;
    niches: number;
    pendingEnrich: number;
    missingEmail: number;
    missingIntro: number;
    missingCompanyShort: number;
    missingIco: number;
    badIntro: number;
    smartleadSyncIssues: number;
    gmailLabelIssues: number;
  };
  dbStatus: LeadgenDbStatusPreview;
  campaigns: Array<{
    id?: string | number;
    name?: string;
    nicheSlug?: string;
    status?: string;
    localLeadCount?: number;
    remoteLeadCount?: number;
    issues: string[];
    nextAction: string;
  }>;
  repairQueues: {
    missingEmail: LeadCandidateInput[];
    missingIntro: LeadCandidateInput[];
    companyShort: LeadCandidateInput[];
    ico: LeadCandidateInput[];
    badIntro: LeadCandidateInput[];
  };
  gmailLabels: Array<{ accountEnvKey?: string; email?: string; labelName: string; ready: boolean; nextAction: string }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  manualChecks: string[];
  warnings: string[];
};

export type LeadgenProgressWatchdogPreview = {
  mode: "leadgen-progress-watchdog-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  source: { name?: string; parsedFromCsv: number; groupBy: "campaign" | "niche" | "source"; generatedAt: string };
  totals: {
    inputLeads: number;
    scraped: number;
    withEmail: number;
    withDecisionMaker: number;
    withIntro: number;
    verified: number;
    readyForSmartlead: number;
    sentToSmartlead: number;
    failed: number;
    remaining: number;
    completionPercent: number;
    enrichmentPercent: number;
    emailPercent: number;
    introPercent: number;
    smartleadPercent: number;
  };
  groups: Array<{
    key: string;
    label: string;
    total: number;
    completionPercent: number;
    readyForSmartlead: number;
    sentToSmartlead: number;
    failed: number;
    bottleneck: string;
    nextAction: string;
  }>;
  bottlenecks: Array<{ id: string; label: string; count: number; severity: "info" | "warning" | "critical"; nextAction: string }>;
  queues: {
    needsScrape: LeadCandidateInput[];
    missingEmail: LeadCandidateInput[];
    missingDecisionMaker: LeadCandidateInput[];
    missingIntro: LeadCandidateInput[];
    needsVerification: LeadCandidateInput[];
    readyForSmartlead: LeadCandidateInput[];
    failed: LeadCandidateInput[];
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type LeadgenTargetBackfillPreview = {
  mode: "leadgen-target-backfill-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  source: { name?: string; parsedFromCsv: number; generatedAt: string };
  targets: {
    readyLeads: number;
    minReadyLeads: number;
    readyPercent: number;
    missingEmail: number;
    missingDecisionMaker: number;
    missingIntro: number;
    missingOrsrName: number;
    retryVerification: number;
    readyForSmartlead: number;
  };
  queues: {
    missingEmail: LeadCandidateInput[];
    missingDecisionMaker: LeadCandidateInput[];
    missingIntro: LeadCandidateInput[];
    missingOrsrName: LeadCandidateInput[];
    retryVerification: LeadCandidateInput[];
    readyForSmartlead: LeadCandidateInput[];
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type ColdOutreachMonitorRunbookPreview = {
  mode: "cold-outreach-monitor-runbook-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  window: { label?: string; from?: string; to?: string };
  totals: {
    campaigns: number;
    sent: number;
    opened: number;
    openRate: number;
    replies: number;
    replyRate: number;
    positiveReplies: number;
    positiveRate: number;
    negativeReplies: number;
    bounced: number;
    unsubscribed: number;
    nonRepliers: number;
    preparedPositiveReplies: number;
  };
  campaigns: Array<{
    campaignId?: string | number;
    name?: string;
    status?: string;
    sent: number;
    opened: number;
    replies: number;
    positiveReplies: number;
    nonRepliers: number;
    issues: string[];
    nextAction: string;
  }>;
  positiveReplies: Array<{
    source: "smartlead" | "gmail" | "manual";
    campaignId?: string | number;
    email?: string;
    leadName?: string;
    companyName?: string;
    replyBody: string;
    confidence: "high" | "medium" | "low";
    nextAction: string;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type SmartleadCampaignAuditPreview = {
  mode: "smartlead-campaign-audit-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  totals: {
    campaigns: number;
    active: number;
    sent: number;
    replies: number;
    positiveReplies: number;
    missingSequence: number;
    missingSender: number;
    missingWebhook: number;
    variableIssues: number;
    deliverabilityIssues: number;
    unknownLocalMapping: number;
  };
  campaigns: Array<{
    campaignId?: string | number;
    name?: string;
    status?: string;
    localNiche?: string;
    sent: number;
    replies: number;
    positiveReplies: number;
    issues: string[];
    health: "ready" | "attention" | "blocked";
    nextAction: string;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type SmartleadWorkspaceDiagnosticPreview = {
  mode: "smartlead-workspace-diagnostic-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  totals: {
    endpointChecks: number;
    endpointReady: number;
    campaigns: number;
    activeCampaigns: number;
    sent: number;
    replies: number;
    draftCampaigns: number;
    needsCampaignAudit: number;
    senderAccounts: number;
    senderIssues: number;
  };
  endpointDiagnostics: Array<{ url?: string; authMode?: string; status?: number | string; ok: boolean; issue?: string; nextAction: string }>;
  campaigns: Array<{ campaignId?: string | number; name?: string; status?: string; sent: number; replies: number; issues: string[]; nextAction: string }>;
  senderAccounts: Array<{ id?: string | number; email?: string; status?: string; warmupStatus?: string; dailyLimit?: number; issues: string[]; nextAction: string }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type SmartleadMessageHistoryAuditPreview = {
  mode: "smartlead-message-history-audit-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  operatorBrief: string;
  campaignId?: string | number;
  totals: {
    leads: number;
    withHistory: number;
    missingHistory: number;
    replied: number;
    positiveSignals: number;
    needsHistoryFetch: number;
    missingLeadMapId: number;
  };
  leads: Array<{
    email?: string;
    leadId?: string | number;
    campaignLeadMapId?: string | number;
    historyCount: number;
    lastMessageType?: string;
    lastSubject?: string;
    replied: boolean;
    positiveSignal: boolean;
    issues: string[];
    nextAction: string;
  }>;
  historyFetchQueue: Array<{ campaignId?: string | number; email?: string; leadId?: string | number; campaignLeadMapId?: string | number; reason: string }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type GmailOutreachReadinessPreview = {
  mode: "gmail-outreach-readiness-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  targetLabel: string;
  totals: {
    accounts: number;
    authReady: number;
    labelReady: number;
    missingLabel: number;
    authIssues: number;
    unreadTotal: number;
    unreadLeadReplies: number;
    knownLeadMatches: number;
    positiveReplies: number;
  };
  accounts: Array<{
    accountEnvKey?: string;
    email?: string;
    labelName: string;
    authReady: boolean;
    labelReady: boolean;
    unreadTotal: number;
    unreadLeadReplies: number;
    issues: string[];
    nextAction: string;
  }>;
  replyQueue: Array<{
    source: "gmail" | "smartlead" | "manual";
    accountEnvKey?: string;
    threadId?: string;
    email?: string;
    leadName?: string;
    companyName?: string;
    replyBody: string;
    category: "positive" | "negative" | "neutral";
    knownLead: boolean;
    nextAction: string;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type LeadBatchQaPreview = {
  mode: "lead-batch-qa-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { campaignTag?: string; createdSince?: string; defaultSource?: string };
  totals: {
    input: number;
    readyForSmartlead: number;
    repair: number;
    manualReview: number;
    rejected: number;
    introCleaned: number;
    namesCleared: number;
    emailsCleared: number;
    blockedSources: number;
    companyShortUpdated: number;
    flagged: number;
  };
  items: Array<{
    lead: LeadRepairQueueLead & { companyNameShort?: string; company_name_short?: string; official_company_name?: string; original_name?: string; decision_maker_last_name?: string };
    status: "ready" | "repair" | "manual_review" | "rejected";
    issues: string[];
    updates: {
      email?: string | null;
      companyName?: string;
      companyNameShort?: string;
      firstName?: string;
      lastName?: string;
      personalizedIntro?: string | null;
      verificationStatus: "ok" | "flagged" | "failed";
      customFields: Record<string, string | number | boolean | null | undefined>;
    };
  }>;
  readyLeads: PreparedSmartleadLeadInput[];
  repairLeads: LeadRepairQueueLead[];
  rejectedLeads: LeadRepairQueueLead[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadValidationScorecardPreview = {
  mode: "lead-validation-scorecard-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null }; campaignId?: string | number | null; minScore: number; includeSentToSmartlead: boolean };
  totals: {
    input: number;
    scored: number;
    passed: number;
    failed: number;
    excludedSentToSmartlead: number;
    averageScore: number;
    smartleadReady: number;
  };
  buckets: Record<string, number>;
  items: Array<{
    lead: LeadCandidateInput & { id?: string | number; sentToSmartlead?: boolean; sent_to_smartlead?: boolean; verificationStatus?: "ok" | "flagged" | "failed" | "verified" };
    status: "qualified" | "below_threshold" | "excluded_sent";
    score: number;
    passed: boolean;
    reasons: string[];
  }>;
  qualifiedLeads: PreparedSmartleadLeadInput[];
  failedLeads: LeadCandidateInput[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  injectionPlan?: SmartleadInjectionPlan;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type CompanyShortNamePreview = {
  mode: "company-short-name-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; defaultSource?: string };
  totals: {
    input: number;
    normalized: number;
    unchanged: number;
    missingSourceName: number;
    derivedFromDomain: number;
    smartleadReady: number;
  };
  items: Array<{
    lead: LeadCandidateInput & { companyNameShort?: string; company_name_short?: string; officialCompanyName?: string; official_company_name?: string; originalName?: string; original_name?: string };
    status: "normalized" | "unchanged" | "missing_source_name";
    source: "current" | "official" | "company" | "original" | "domain" | "email";
    originalName?: string;
    companyNameShort?: string;
    issues: string[];
  }>;
  normalizedLeads: PreparedSmartleadLeadInput[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type LeadIdentityRepairPreview = {
  mode: "lead-identity-repair-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; defaultSource?: string };
  totals: {
    input: number;
    repaired: number;
    inferredNames: number;
    genericEmails: number;
    invalidEmails: number;
    companyShortUpdated: number;
    missingIdentity: number;
    smartleadReady: number;
  };
  items: Array<{
    lead: LeadRepairQueueLead & { companyNameShort?: string; company_name_short?: string; official_company_name?: string; original_name?: string };
    status: "repaired" | "unchanged" | "manual_review" | "rejected";
    issues: string[];
    confidence: "high" | "medium" | "low";
    updates: {
      email?: string | null;
      companyName?: string;
      companyNameShort?: string;
      firstName?: string;
      lastName?: string;
      decisionMakerName?: string;
      customFields: Record<string, string | number | boolean | null | undefined>;
    };
  }>;
  repairedLeads: PreparedSmartleadLeadInput[];
  manualReviewLeads: LeadRepairQueueLead[];
  smartleadPrepared: ReturnType<typeof prepareSmartleadLeads>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type PhoneEnrichmentQueuePreview = {
  mode: "phone-enrichment-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; countryFilter?: string; parsedFromCsv: number };
  totals: {
    input: number;
    included: number;
    filteredOut: number;
    withPhone: number;
    needsPhoneScrape: number;
    invalidWebsite: number;
    phoneFoundFromScrape: number;
  };
  items: Array<{
    lead: LeadCandidateInput & { raw?: Record<string, string> };
    status: "with_phone" | "needs_scrape" | "phone_found" | "invalid_website" | "filtered_out";
    phone?: string;
    sourceUrls: string[];
    reason: string;
  }>;
  enrichedLeads: LeadCandidateInput[];
  scrapeUrls: string[];
  exportPreview: ReturnType<typeof serializeLeadsCsv>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type PhoneEnrichmentWritebackPreview = {
  mode: "phone-enrichment-writeback-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; type: "scrape" | "csv" | "manual" | "mixed"; parsedFromCsv: number };
  totals: {
    inputLeads: number;
    phoneResults: number;
    enriched: number;
    unchanged: number;
    conflicts: number;
    missingMatch: number;
    existingPhoneKept: number;
  };
  items: Array<{
    lead: LeadCandidateInput;
    status: "enriched" | "existing_phone_kept" | "conflict" | "no_phone_match";
    phone?: string;
    candidates: string[];
    matchedBy: string[];
    sourceUrls: string[];
    reason: string;
  }>;
  enrichedLeads: LeadCandidateInput[];
  unchangedLeads: LeadCandidateInput[];
  conflicts: Array<{ lead: LeadCandidateInput; candidates: string[]; sourceUrls: string[]; reason: string }>;
  unmatchedResults: Array<Record<string, unknown>>;
  exportPreview: ReturnType<typeof serializeLeadsCsv>;
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

export type LocalLeadRegisterUpdatePreview = {
  mode: "local-lead-register-update-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  register: SlovakRegisterLookup;
  selectedDecisionMaker?: string;
  dataPatch: Record<string, unknown>;
  upsertPayload?: {
    primaryEmail: string;
    kind: LocalPersonKind;
    displayName?: string;
    companyName?: string;
    status: string;
    data: Record<string, unknown>;
    approval: { approved: true };
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type BulkSmartleadUploadQueuePreview = {
  mode: "bulk-smartlead-upload-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    campaigns: number;
    queuedCampaigns: number;
    skippedCampaigns: number;
    inputLeads: number;
    eligibleLeads: number;
    uploadLeads: number;
    skippedLeads: number;
    approvalPayloads: number;
  };
  queue: Array<{
    order: number;
    priority: number;
    status: "ready" | "attention" | "blocked";
    reason: string;
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    dailyLimit: number;
    alreadySentToday: number;
    remainingToday: number;
    inputLeads: number;
    uploadLeads: number;
    skippedLeads: number;
    injectionPlan: SmartleadInjectionPlan;
  }>;
  approvalPayloads: Array<NonNullable<SmartleadInjectionPlan["addLeadsApprovalPayload"]>>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type SmartleadSendReadinessQueuePreview = {
  mode: "smartlead-send-readiness-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  date: string;
  totals: {
    campaigns: number;
    readyCampaigns: number;
    attentionCampaigns: number;
    blockedCampaigns: number;
    inputLeads: number;
    qaReady: number;
    qualified: number;
    uploadReady: number;
    repair: number;
    approvalPayloads: number;
  };
  queue: Array<{
    order: number;
    priority: number;
    status: "ready" | "attention" | "blocked";
    reason: string;
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    dailyLimit: number;
    alreadySentToday: number;
    qaPreview: LeadBatchQaPreview;
    scorecard: LeadValidationScorecardPreview;
    uploadPlan?: SmartleadInjectionPlan;
  }>;
  bulkUploadQueue: BulkSmartleadUploadQueuePreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
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

export type SmartleadCampaignSyncPlanPreview = {
  mode: "smartlead-campaign-sync-plan-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  campaignId?: string | number;
  totals: {
    localLeads: number;
    remoteLeads: number;
    missingInSmartlead: number;
    updateExisting: number;
    unchanged: number;
    skipped: number;
  };
  missingInSmartlead: SmartleadLead[];
  updateExisting: Array<{
    email: string;
    remoteLeadId?: string | number;
    payload: SmartleadLead;
    changedFields: string[];
  }>;
  unchanged: SmartleadLead[];
  skipped: Array<{ lead: SmartleadLead; reason: string }>;
  addLeadsApprovalPayload?: { campaignId: string | number; leads: SmartleadLead[]; settings: { ignore_global_block_list: false; ignore_unsubscribe_list: false }; approval: { approved: true } };
  manualUpdateApprovalPayloads: Array<{ method: "POST"; endpoint: string; campaignId: string | number; leadId: string | number; payload: SmartleadLead; approval: { approved: true } }>;
  operatorRunbook: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadLocalReconciliationPreview = {
  mode: "smartlead-local-reconciliation-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  campaignId?: string | number | null;
  totals: {
    localLeads: number;
    remoteLeads: number;
    matched: number;
    needsLocalMarkSent: number;
    needsReplyUpdate: number;
    localSentRemoteMissing: number;
    alreadySynced: number;
    remoteUnmatched: number;
    duplicateRemoteEmails: number;
  };
  items: Array<{
    email: string;
    localLead?: LeadCandidateInput & {
      id?: string | number;
      sentToSmartlead?: boolean;
      sent_to_smartlead?: boolean;
      smartleadContactId?: string | number;
      smartlead_contact_id?: string | number;
      replyStatus?: string;
      reply_status?: string;
      replySentiment?: string | null;
      reply_sentiment?: string | null;
    };
    remoteLead?: SmartleadLead & { id?: string | number; lead_id?: string | number; status?: string; category_name?: string | null; reply_status?: string; reply_sentiment?: string | null };
    status: "needs_local_mark_sent" | "needs_reply_update" | "local_sent_remote_missing" | "already_synced" | "remote_unmatched" | "duplicate_remote";
    issues: string[];
    localUpdatePatch?: Record<string, string | number | boolean | null | undefined>;
  }>;
  localUpdatePatches: Array<{ email: string; localId?: string | number; patch: Record<string, string | number | boolean | null | undefined> }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
};

export type SmartleadSafeSyncRunbookPreview = {
  mode: "smartlead-safe-sync-runbook-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  campaign: { id?: string | number | null; name?: string };
  totals: {
    localLeads: number;
    remoteLeads: number;
    missingInSmartlead: number;
    updateExisting: number;
    unchanged: number;
    skipped: number;
    approvalSteps: number;
    manualSteps: number;
  };
  syncPlan: SmartleadCampaignSyncPlanPreview;
  backupPlan?: SmartleadCampaignBackupPlan;
  phases: Array<{
    order: number;
    key: string;
    kind: "mcp" | "manual";
    tool?: string;
    payload?: Record<string, unknown>;
    instruction: string;
    status: "ready" | "attention" | "blocked" | "approval_required";
    approvalRequired: boolean;
  }>;
  safetyGates: string[];
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

export type SmartleadSequenceWorkPacketPreview = {
  mode: "smartlead-sequence-work-packet-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: {
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    language: "sk" | "en";
    offer?: string;
    painPoint?: string;
    customInstructions?: string;
  };
  totals: {
    baselineSequences: number;
    completedSequences: number;
    acceptedSequences: number;
    rejectedSequences: number;
    variants: number;
    issues: number;
  };
  baselineSequences: SmartleadSequence[];
  markdownTask: string;
  expectedJson: { sequences: SmartleadSequence[] };
  completedItems: Array<{ sequenceNumber: number; status: "valid" | "invalid"; issues: string[]; sequence?: SmartleadSequence }>;
  acceptedSequences: SmartleadSequence[];
  configureCampaignApprovalPayload?: { campaignId: string | number; sequences: SmartleadSequence[]; approval: { approved: true } };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type GmailNameEnrichmentQueuePreview = {
  mode: "gmail-name-enrichment-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; accountEmail?: string };
  totals: {
    input: number;
    unique: number;
    duplicates: number;
    alreadyNamed: number;
    hintsApplied: number;
    inferredFromPersonalEmail: number;
    needsGmailLookup: number;
    missingEmail: number;
    unresolved: number;
    salutationReady: number;
    introsToDraft: number;
  };
  items: Array<{
    lead: LeadRepairQueueLead;
    email?: string;
    status: "already_named" | "hint_applied" | "inferred_from_personal_email" | "needs_gmail_lookup" | "missing_email" | "unresolved";
    displayName?: string;
    firstName?: string;
    lastName?: string;
    issues: string[];
  }>;
  lookupQueue: Array<{ email: string; accountEmail?: string; lead: LeadRepairQueueLead; reason: string }>;
  enhancedLeads: LeadRepairQueueLead[];
  salutationPreview: SlovakSalutationPreview;
  introInputs: LeadIntroInput[];
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

export type MapsColdCallingExportPreview = {
  mode: "maps-cold-calling-export-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; type: "google_places" | "csv" | "manual" | "mixed"; country: string; defaultRegion?: string; parsedFromCsv: number };
  totals: {
    rawResults: number;
    inputLeads: number;
    callable: number;
    missingPhone: number;
    needsPhoneScrape: number;
    invalidWebsite: number;
    blocked: number;
    duplicates: number;
  };
  callableRows: Array<LeadCandidateInput & { city?: string; address?: string; rating?: number; reviewCount?: number; placeId?: string }>;
  needsPhoneScrape: LeadCandidateInput[];
  invalidWebsite: LeadCandidateInput[];
  blocked: ReturnType<typeof filterBlacklistedLeads>["blocked"];
  duplicates: Array<{ lead: LeadCandidateInput; duplicateOf: string; reason: string }>;
  exportPreview: ReturnType<typeof serializeLeadsCsv>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
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

export type SmartleadFixedCampaignPackagePreview = {
  mode: "smartlead-fixed-campaign-package-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: {
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    campaignName: string;
    existingCampaignId?: string | number | null;
    language: "sk" | "en";
  };
  totals: {
    leads: number;
    preparedLeads: number;
    skippedLeads: number;
    sequenceSteps: number;
    variants: number;
    approvalCalls: number;
    webhookEvents: number;
    emailAccounts: number;
    warnings: number;
  };
  fixedDefaults: {
    schedule: NicheSmartleadCampaignSetupDraft["schedule"];
    settings: NicheSmartleadCampaignSetupDraft["settings"];
    webhook: NicheSmartleadCampaignSetupDraft["webhook"];
    uploadSettings: { ignore_global_block_list: boolean; ignore_unsubscribe_list: boolean };
  };
  launchPreview: SmartleadCampaignLaunchPreview;
  qaPreview: SmartleadCampaignQaPreview;
  operatorChecklist: Array<{ item: string; status: "ready" | "attention" | "blocked"; detail: string }>;
  approvalPayloads: SmartleadCampaignLaunchPreview["approvalPayloads"] & {
    activateCampaign?: { campaignId: string | number; status: "ACTIVE"; approval: { approved: true } };
  };
  warnings: string[];
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

export type SmartleadCampaignDeleteSafetyPreview = {
  mode: "smartlead-campaign-delete-safety-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  backupPlan: SmartleadCampaignBackupPlan;
  totals: {
    campaigns: number;
    deleteCandidates: number;
    readyToDelete: number;
    blocked: number;
    protected: number;
    missingBackupEvidence: number;
    estimatedLeads: number;
  };
  queue: Array<{
    campaignId: string;
    name: string;
    status?: string;
    protected: boolean;
    decision: "ready_to_delete" | "blocked" | "needs_backup_evidence";
    reasons: string[];
    requiredBackupArtifacts: string[];
    deleteRequestPreview?: { method: "DELETE"; path: string; approvalPhrase: string };
  }>;
  protectedCampaigns: SmartleadCampaignBackupPlan["protectedCampaigns"];
  requiredOperatorPhrase: string;
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

export type GoogleSheetSyncPreview = {
  mode: "google-sheet-sync-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  sheet: { spreadsheetId?: string; range: string; clearRange: string; accountEnvKey?: string; includeHeader: boolean };
  totals: {
    input: number;
    rows: number;
    dataRows: number;
    missingEmail: number;
    missingWebsite: number;
    missingIntro: number;
    skipped: number;
  };
  headers: string[];
  rowsPreview: Array<Array<string | number | boolean | null>>;
  replaceApprovalPayload?: {
    spreadsheetId?: string;
    range: string;
    clearRange: string;
    accountEnvKey?: string;
    rows: Array<Array<string | number | boolean | null>>;
  };
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

export type LeadgenToSmartleadDispatchPreview = {
  mode: "leadgen-to-smartlead-dispatch-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  totals: {
    groups: number;
    inputLeads: number;
    uniqueLeads: number;
    websitesToScrape: number;
    introsToDraft: number;
    aiIntroQueued: number;
    readyForSmartlead: number;
    uploadReady: number;
    approvalPayloads: number;
    manualReview: number;
    rejected: number;
    blockedGroups: number;
    attentionGroups: number;
    readyGroups: number;
  };
  groups: Array<{
    order: number;
    sourceName?: string;
    niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
    status: "ready" | "attention" | "blocked";
    reason: string;
    pipelinePreview: LeadgenCampaignPipelinePreview;
    aiIntroQueue: BulkAiIntroWorkQueuePreview;
    smartleadReadiness: SmartleadSendReadinessQueuePreview;
  }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type CompanyResearchQueuePreview = {
  mode: "company-research-queue-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null }; defaultRegion?: string; country: string };
  totals: {
    input: number;
    readyForDispatch: number;
    needsCompanySearch: number;
    needsContactScrape: number;
    needsIntro: number;
    manualReview: number;
    searchQueries: number;
    fetchUrls: number;
    scrapeUrls: number;
    dispatchGroups: number;
  };
  items: Array<{
    lead: LeadCandidateInput & { region?: string; city?: string; searchQuery?: string };
    status: "ready_for_dispatch" | "needs_company_search" | "needs_contact_scrape" | "needs_intro" | "manual_review";
    reason: string;
    searchQuery?: string;
    placesQuery?: string;
    fetchUrl?: string;
    scrapeUrl?: string;
  }>;
  searchQueries: Array<{ query: string; provider: "google_places" | "serper"; leadIndex: number; reason: string }>;
  fetchUrls: string[];
  scrapeUrls: string[];
  dispatchPreview?: LeadgenToSmartleadDispatchPreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type ResearchResultsImportPreview = {
  mode: "research-results-import-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { name?: string; type: "google_places" | "serper" | "mixed"; defaultRegion?: string; country: string };
  totals: {
    rawResults: number;
    normalizedLeads: number;
    blocked: number;
    duplicateDomains: number;
    withWebsite: number;
    withEmail: number;
    companyResearchItems: number;
    importGroups: number;
    readyForSmartlead: number;
    websitesToScrape: number;
    introsToDraft: number;
    unassigned: number;
  };
  leads: LeadSourceImportQueueLead[];
  blocked: ReturnType<typeof filterBlacklistedLeads>["blocked"];
  duplicates: Array<{ lead: LeadSourceImportQueueLead; duplicateOf: string; reason: string }>;
  companyResearchPreview: CompanyResearchQueuePreview;
  importQueuePreview?: LeadSourceImportQueuePreview;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
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

export type FullLeadgenPipelineRunbookPreview = {
  mode: "full-leadgen-pipeline-runbook-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: {
    niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
    language: "sk" | "en";
    offer?: string;
    hasInputLeads: boolean;
    hasScrapeResults: boolean;
  };
  target: { discoveryCount: number; dailyLimit: number; batchSize: number; minScore: number };
  totals: {
    inputLeads: number;
    unique: number;
    readyForSmartlead: number;
    websitesToScrape: number;
    introsToDraft: number;
    scrapeReady: number;
    scrapeNeedsRescrape: number;
    qaIssues: number;
    approvalSteps: number;
    phases: number;
  };
  phases: Array<{
    order: number;
    key: string;
    tool: string;
    payload: Record<string, unknown>;
    purpose: string;
    status: "ready" | "needs_input" | "approval_required" | "blocked";
    writes: boolean;
    approvalRequired: boolean;
  }>;
  previews: {
    discoveryRunbook: DailyLeadgenRunbook;
    pipelinePreview?: LeadgenCampaignPipelinePreview;
    scrapeAudit?: WebsiteScrapeQualityAuditPreview;
    introWorkPacket?: AiIntroWorkPacketPreview;
    handoffPackage?: SmartleadCampaignHandoffPackagePreview;
  };
  safetyGates: string[];
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
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

export type MapsCitySweepPreview = {
  mode: "maps-city-sweep-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  source: { niche: string; country: string; regionPreset: "capitals" | "all_slovakia" | "custom"; sourceName?: string };
  target: { targetCount: number; resultsPerSearch: number; maxSearchCalls: number; maxCities: number; maxKeywordsPerCity: number };
  totals: { cities: number; keywords: number; plannedSearchCalls: number; cappedSearchCalls: number; estimatedResultSlots: number; batches: number };
  cities: string[];
  keywords: string[];
  queryBatches: Array<{ order: number; city: string; keyword: string; query: string; maxResults: number; priority: number }>;
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  safetyGates: string[];
  warnings: string[];
};

export type InternationalMarketLeadgenPreview = {
  mode: "international-market-leadgen-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  market: {
    name: string;
    country: string;
    regionCode: string;
    languageCode: string;
    sourceName: string;
  };
  niche: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  target: { targetCount: number; resultsPerSearch: number; maxSearchCalls: number; maxRegions: number; maxKeywordsPerRegion: number };
  totals: {
    regions: number;
    keywords: number;
    placesSearchCalls: number;
    serperSearchCalls: number;
    estimatedResultSlots: number;
    nextCalls: number;
  };
  regions: string[];
  keywords: string[];
  placesQueries: Array<{ order: number; region: string; keyword: string; query: string; maxResults: number; priority: number }>;
  serperQueries: Array<{ order: number; region: string; keyword: string; query: string; priority: number }>;
  smartleadCampaign?: {
    name: string;
    offer: string;
    painPoint: string;
    emailAccountIds?: Array<string | number>;
  };
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

export type StickyNicheLeadgenDecisionPreview = {
  mode: "sticky-niche-leadgen-decision-preview";
  status: "ready" | "attention" | "blocked";
  decision: "continue_sticky_niche" | "start_next_niche" | "close_or_advance_niche" | "no_active_niche";
  summary: string;
  date: string;
  selected?: {
    niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
    reason: string;
    score: number;
    dailyTarget: number;
    todaySent: number;
    remainingToday: number;
    currentRegionIndex: number;
    lastWorkedAt?: string;
    exhaustedCandidate: boolean;
  };
  candidates: Array<{
    niche: { id?: string; slug: string; name: string; region?: string; campaignId?: string | number | null };
    status: "ready" | "attention" | "blocked";
    reason: string;
    score: number;
    dailyTarget: number;
    todaySent: number;
    remainingToday: number;
    currentRegionIndex: number;
    lastWorkedAt?: string;
    exhaustedCandidate: boolean;
  }>;
  totals: { niches: number; active: number; completed: number; paused: number; filledToday: number; stickyCandidates: number };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type DailyLeadgenRunClosurePreview = {
  mode: "daily-leadgen-run-closure-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  niche: {
    id?: string;
    slug: string;
    name: string;
    activeRegion?: string;
    nextRegion?: string;
    currentRegionIndex: number;
    nextRegionIndex: number;
    dailyTarget: number;
    campaignId?: string | number | null;
  };
  stats: { discovered: number; enriched: number; qualified: number; sentToSmartlead: number; failed: number };
  rates: { enrichmentRate: number; qualificationRate: number; sendRate: number; targetFillRate: number };
  decisions: {
    advanceRegion: boolean;
    markCompletedIfExhausted: boolean;
    exhaustedCandidate: boolean;
    needsMoreDiscovery: boolean;
    needsRepair: boolean;
    needsSmartleadUpload: boolean;
  };
  approvalPayloads: {
    recordLocalNicheRun: {
      slug: string;
      nicheId?: string;
      date?: string;
      workedAt?: string;
      advanceRegion: boolean;
      markCompletedIfExhausted: boolean;
      stats: { discovered: number; enriched: number; qualified: number; sentToSmartlead: number; failed: number };
      approval: { approved: true };
    };
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  warnings: string[];
};

export type LeadgenRunResumePreview = {
  mode: "leadgen-run-resume-preview";
  status: "ready" | "attention" | "blocked";
  summary: string;
  run: {
    runId?: string;
    date?: string;
    failedStage?: string;
    failureReason?: string;
  };
  niche: {
    id?: string;
    slug: string;
    name: string;
    region?: string;
    campaignId?: string | number | null;
    dailyTarget: number;
  };
  checkpoint: {
    discovered: number;
    scraped: number;
    contactsSelected: number;
    introsReady: number;
    readyForSmartlead: number;
    sentToSmartlead: number;
    remainingToTarget: number;
  };
  resumeFrom: "discovery" | "scrape" | "contact_selection" | "ai_intro" | "qa_repair" | "smartlead_upload" | "closure" | "done";
  decisions: {
    needsDiscovery: boolean;
    needsScrape: boolean;
    needsContactSelection: boolean;
    needsAiIntro: boolean;
    needsRepair: boolean;
    needsSmartleadUpload: boolean;
    needsClosure: boolean;
  };
  repairHints: string[];
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
  fotovoltaika: {
    mapsQueries: ["fotovoltaika", "solarne panely", "solarna energia", "montaz fotovoltaiky", "fotovoltaicke panely", "solarne systemy"],
    serperQueries: ["montaz fotovoltaiky firma SK", "solarne panely instalacia", "fotovoltaicka elektraren kontakt"],
    blacklistKeywords: ["heureka", "alza", "mall", "bazos", "wikipedia", "dotacie"],
  },
  fotovoltaiky: {
    mapsQueries: ["fotovoltaika", "solarne panely", "solarna energia", "montaz fotovoltaiky", "fotovoltaicke panely", "solarne systemy"],
    serperQueries: ["montaz fotovoltaiky firma SK", "solarne panely instalacia", "fotovoltaicka elektraren kontakt"],
    blacklistKeywords: ["heureka", "alza", "mall", "bazos", "wikipedia", "dotacie"],
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

export function buildFlaggedLeadReviewPreview(input: {
  leads?: Array<LeadCandidateInput & {
    id?: string | number;
    raw?: Record<string, string>;
    decisionMakerName?: string;
    decision_maker_name?: string;
    icebreaker_sentence?: string;
    reviewNote?: string;
    verification_notes?: string;
    note?: string;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  offer?: string;
  language?: "sk" | "en";
  campaignId?: string | number | null;
  maxNextCalls?: number;
}): FlaggedLeadReviewPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])].map(normalizeFlaggedLead);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 100);
  const items: FlaggedLeadReviewPreview["items"] = leads.map((lead) => {
    const id = flaggedLeadField(lead, "id", "ID");
    const note = flaggedLeadField(lead, "reviewNote", "verification_notes", "note", "notes", "Poznámka pre kontrolu", "Poznamka pre kontrolu");
    const intro = extractLeadIntro(lead);
    const issues = flaggedLeadIssues(lead, note);
    const status: FlaggedLeadReviewPreview["items"][number]["status"] = issues.includes("missing_website") || issues.includes("blocked_website")
      ? "reject"
      : issues.includes("no_website_content")
        ? "rescrape"
        : issues.some((issue) => ["missing_intro", "generic_intro", "weak_ai_evidence"].includes(issue))
          ? "redraft"
          : issues.includes("missing_decision_maker")
            ? "identity_review"
            : "ready_writeback";
    const nextAction = status === "reject"
      ? "Vyrad alebo oprav URL pred dalsim enrichmentom."
      : status === "rescrape"
        ? "Znovu scrapni web alebo kontaktne podstranky a potom redraftni AI intro."
        : status === "redraft"
          ? "Vrat lead do AI intro work packetu s lepsim kontextom."
          : status === "identity_review"
            ? "Dopln decision makera alebo oslovenie cez identity/register repair."
            : "Moze ist do icebreaker writeback preview a nasledne Smartlead QA.";
    return { id, lead: { ...lead, id }, note, status, issues, nextAction };
  });

  const readyItems = items.filter((item) => item.status === "ready_writeback" && item.id && extractLeadIntro(item.lead));
  const rescrapeUrls = unique(items.filter((item) => item.status === "rescrape" && item.lead.website).map((item) => item.lead.website as string)).slice(0, maxNextCalls);
  const redraftLeads = items.filter((item) => item.status === "redraft" || item.status === "rescrape").map((item) => item.lead).slice(0, maxNextCalls);
  const identityLeads = items.filter((item) => item.status === "identity_review" || item.issues.includes("missing_decision_maker")).map((item) => item.lead).slice(0, maxNextCalls);
  const readyLeads = readyItems.map((item) => item.lead).slice(0, maxNextCalls);
  const readyIcebreakers = readyItems.map((item) => ({ id: item.id as string, icebreaker: extractLeadIntro(item.lead) as string })).slice(0, maxNextCalls);
  const nextToolCalls: FlaggedLeadReviewPreview["nextToolCalls"] = [];
  if (rescrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: rescrapeUrls, includePriorityPages: true, maxPages: 4, maxSites: rescrapeUrls.length },
      reason: "Flagged poznamky hovoria, ze AI nemalo webovy obsah alebo konkrétne fakty.",
      approvalRequired: false,
    });
  }
  if (redraftLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: redraftLeads, sourceName: input.sourceName ?? "flagged-leads-review", offer: input.offer, language: input.language ?? "sk", maxLeads: redraftLeads.length },
      reason: "Genericke alebo slabo podlozene AI pochvaly vrat do work packetu na opravu.",
      approvalRequired: false,
    });
  }
  if (identityLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_identity_repair_preview",
      payload: { leads: identityLeads, defaultSource: input.sourceName ?? "flagged-leads-review", maxNextCalls },
      reason: "Leady bez decision makera alebo oslovenia potrebuju identity repair pred Smartleadom.",
      approvalRequired: false,
    });
  }
  if (readyLeads.length && readyIcebreakers.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_icebreaker_writeback_preview",
      payload: { leads: readyLeads, icebreakers: readyIcebreakers, sourceName: input.sourceName ?? "flagged-leads-review", offer: input.offer, language: input.language ?? "sk", campaignId: input.campaignId },
      reason: "Ready flagged leady priprav na writeback preview a naslednu Smartlead kontrolu.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: items.length,
    readyWriteback: items.filter((item) => item.status === "ready_writeback").length,
    needsRescrape: items.filter((item) => item.status === "rescrape").length,
    needsRedraft: items.filter((item) => item.status === "redraft").length,
    needsIdentityReview: items.filter((item) => item.status === "identity_review").length,
    rejected: items.filter((item) => item.status === "reject").length,
    missingDecisionMaker: items.filter((item) => item.issues.includes("missing_decision_maker")).length,
    noWebsiteContent: items.filter((item) => item.issues.includes("no_website_content")).length,
    genericIntro: items.filter((item) => item.issues.includes("generic_intro")).length,
  };
  const status: FlaggedLeadReviewPreview["status"] = totals.input === 0 ? "blocked" : totals.needsRescrape || totals.needsRedraft || totals.needsIdentityReview || totals.rejected ? "attention" : "ready";
  return {
    mode: "flagged-lead-review-preview",
    status,
    summary: `Flagged lead review ${status}: ${totals.input} leadov, ${totals.readyWriteback} ready writeback, ${totals.needsRescrape} rescrape, ${totals.needsRedraft} redraft, ${totals.needsIdentityReview} identity review, ${totals.rejected} reject. Ziadny DB zapis ani upload neprebehol.`,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0 },
    totals,
    items,
    readyIcebreakers,
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

export function buildCompanyShortNamePreview(input: {
  leads: Array<LeadCandidateInput & { companyNameShort?: string; company_name_short?: string; officialCompanyName?: string; official_company_name?: string; originalName?: string; original_name?: string }>;
  sourceName?: string;
  defaultSource?: string;
  maxNextCalls?: number;
}): CompanyShortNamePreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 500);
  const items: CompanyShortNamePreview["items"] = input.leads.map((lead) => {
    const custom = lead.customFields ?? {};
    const website = lead.website ?? stringField(custom, "website", "domain");
    const current = stringField(lead, "companyNameShort", "company_name_short") ?? stringField(custom, "company_name_short", "companyNameShort");
    const official = stringField(lead, "officialCompanyName", "official_company_name") ?? stringField(custom, "official_company_name", "officialCompanyName");
    const original = stringField(lead, "originalName", "original_name") ?? stringField(custom, "original_name", "originalName");
    const company = lead.companyName ?? stringField(custom, "company_name", "companyName", "company");
    const candidates: Array<{ value?: string; source: CompanyShortNamePreview["items"][number]["source"] }> = [
      { value: current, source: "current" },
      { value: official, source: "official" },
      { value: company, source: "company" },
      { value: original, source: "original" },
      { value: brandFromWebsite(website), source: "domain" },
      { value: brandFromEmail(lead.email), source: "email" },
    ];
    const selected = candidates.find((candidate) => candidate.value?.trim());
    const fallback = company ?? official ?? original ?? selected?.value;
    const companyNameShort = cleanUniversalCompanyShortName(selected?.value, website, fallback);
    const existingComparable = normalizeNameToken(current ?? "");
    const nextComparable = normalizeNameToken(companyNameShort ?? "");
    const issues: string[] = [];
    if (!selected?.value) issues.push("missing_source_name");
    if (selected?.source === "domain" || selected?.source === "email") issues.push("derived_from_domain");
    if (current && existingComparable !== nextComparable) issues.push("company_short_cleaned");
    const status: CompanyShortNamePreview["items"][number]["status"] = !companyNameShort
      ? "missing_source_name"
      : current && existingComparable === nextComparable
        ? "unchanged"
        : "normalized";
    return {
      lead,
      status,
      source: selected?.source ?? "domain",
      originalName: selected?.value,
      companyNameShort,
      issues,
    };
  });
  const normalizedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.companyNameShort)
    .map((item) => {
      const lead = item.lead;
      return {
        email: lead.email ?? "",
        companyName: lead.companyName ?? item.originalName ?? item.companyNameShort,
        firstName: lead.firstName,
        lastName: lead.lastName,
        website: lead.website,
        phone: lead.phone,
        source: input.defaultSource ?? input.sourceName ?? lead.source,
        personalizedIntro: lead.personalizedIntro,
        customFields: {
          ...lead.customFields,
          company_name_short: item.companyNameShort,
          companyNameShort: item.companyNameShort,
          company_short_name_source: item.source,
          source_name: input.sourceName ?? lead.customFields?.source_name,
        },
      };
    });
  const smartleadPrepared = prepareSmartleadLeads({ leads: normalizedLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "company-short-name-preview" });
  const nextLeads = normalizedLeads.slice(0, maxNextCalls);
  const nextToolCalls: CompanyShortNamePreview["nextToolCalls"] = [];
  if (nextLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_batch_qa_preview",
      payload: { leads: nextLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "company-short-name-preview", maxNextCalls },
      reason: "Po normalizacii company_short skontrolovat emaily, AI intro a pripravenost na Smartlead.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.prepare_smartlead_leads",
      payload: { leads: nextLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "company-short-name-preview" },
      reason: "Pripravit Smartlead lead_list s vyplnenym custom_fields.company_name_short bez uploadu.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: input.leads.length,
    normalized: items.filter((item) => item.status === "normalized").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    missingSourceName: items.filter((item) => item.status === "missing_source_name").length,
    derivedFromDomain: items.filter((item) => item.issues.includes("derived_from_domain")).length,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: CompanyShortNamePreview["status"] = totals.input === 0 || totals.missingSourceName === totals.input ? "blocked" : totals.missingSourceName > 0 ? "attention" : "ready";
  return {
    mode: "company-short-name-preview",
    status,
    summary: `Company short-name preview ${status}: ${totals.normalized} normalizovanych, ${totals.unchanged} bez zmeny, ${totals.missingSourceName} bez zdrojoveho nazvu, ${totals.smartleadReady} ready pre Smartlead. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, defaultSource: input.defaultSource },
    totals,
    items,
    normalizedLeads,
    smartleadPrepared,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildLeadBatchQaPreview(input: {
  leads: Array<LeadRepairQueueLead & { companyNameShort?: string; company_name_short?: string; official_company_name?: string; original_name?: string; decision_maker_last_name?: string }>;
  campaignTag?: string;
  createdSince?: string;
  defaultSource?: string;
  campaignId?: string | number | null;
  offer?: string;
  language?: "sk" | "en";
  maxNextCalls?: number;
}): LeadBatchQaPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const items: LeadBatchQaPreview["items"] = input.leads.map((lead) => {
    const custom = lead.customFields ?? {};
    const website = lead.website ?? stringField(custom, "website", "domain");
    const originalCompany = lead.companyName ?? stringField(lead, "official_company_name", "original_name", "company_name_short", "companyNameShort") ?? stringField(custom, "official_company_name", "original_name", "company_name_short");
    const originalShort = stringField(lead, "companyNameShort", "company_name_short") ?? stringField(custom, "company_name_short") ?? originalCompany;
    const companyNameShort = cleanLeadCompanyShort(originalShort, website, originalCompany);
    const decisionMaker = decisionMakerForLead(lead);
    const looksBusiness = looksLikeBusinessAlias(decisionMaker);
    const cleanup = cleanupAiIntroSentence(extractLeadIntro(lead), decisionMaker, stringField(lead, "decision_maker_last_name") ?? stringField(custom, "decision_maker_last_name", "last_name_with_salutation"));
    const blockedSource = website ? isBlockedLeadSourceDomain(website) : false;
    const usableEmail = isUsableBatchQaEmail(lead.email);
    const issues: string[] = [];
    let verificationStatus: "ok" | "flagged" | "failed" = (lead.verificationStatus ?? stringField(custom, "verification_status") as "ok" | "flagged" | "failed" | undefined) ?? "ok";
    let email: string | null | undefined = lead.email?.trim() || undefined;
    let firstName = lead.firstName;
    let lastName = lead.lastName;
    if (looksBusiness) {
      issues.push("decision_maker_looks_like_business_alias");
      verificationStatus = "flagged";
      firstName = undefined;
      lastName = undefined;
    }
    if (blockedSource) {
      issues.push("blocked_source_domain");
      verificationStatus = "failed";
      email = null;
      firstName = undefined;
      lastName = undefined;
    } else if (!usableEmail) {
      issues.push(email ? "invalid_or_low_quality_email" : "missing_email");
      verificationStatus = "failed";
      email = null;
    }
    if (!website) issues.push("missing_website");
    if (!originalCompany) issues.push("missing_company_name");
    if (!cleanup.cleanedIntro) issues.push("missing_or_bad_intro");
    if (companyNameShort !== originalShort) issues.push("company_short_cleaned");
    if (cleanup.changed) issues.push("intro_cleaned");
    const status: LeadBatchQaPreview["items"][number]["status"] = verificationStatus === "failed"
      ? "rejected"
      : issues.some((issue) => ["missing_website", "missing_company_name"].includes(issue))
        ? "manual_review"
        : issues.some((issue) => ["missing_or_bad_intro", "decision_maker_looks_like_business_alias"].includes(issue))
          ? "repair"
          : "ready";
    return {
      lead,
      status,
      issues,
      updates: {
        email,
        companyName: originalCompany,
        companyNameShort,
        firstName,
        lastName,
        personalizedIntro: cleanup.cleanedIntro ?? null,
        verificationStatus,
        customFields: {
          ...custom,
          campaign_tag: input.campaignTag ?? stringField(custom, "campaign_tag"),
          company_name_short: companyNameShort,
          personalized_intro: cleanup.cleanedIntro ?? null,
          icebreaker_sentence: cleanup.cleanedIntro ?? null,
          verification_status: verificationStatus,
        },
      },
    };
  });
  const readyLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status === "ready" && item.updates.email)
    .map((item) => ({
      email: item.updates.email as string,
      companyName: item.updates.companyName,
      firstName: item.updates.firstName,
      lastName: item.updates.lastName,
      website: item.lead.website,
      phone: item.lead.phone,
      source: input.defaultSource ?? input.campaignTag ?? item.lead.source,
      personalizedIntro: item.updates.personalizedIntro ?? undefined,
      customFields: item.updates.customFields,
    }));
  const repairLeads = items.filter((item) => item.status === "repair" || item.status === "manual_review").map((item) => item.lead);
  const rejectedLeads = items.filter((item) => item.status === "rejected").map((item) => item.lead);
  const smartleadPrepared = prepareSmartleadLeads({ leads: readyLeads, defaultSource: input.defaultSource ?? input.campaignTag ?? "lead-batch-qa" });
  const nextToolCalls: LeadBatchQaPreview["nextToolCalls"] = [];
  const scrapeUrls = unique(items
    .filter((item) => item.issues.some((issue) => ["missing_email", "invalid_or_low_quality_email"].includes(issue)) && item.lead.website)
    .map((item) => item.lead.website as string))
    .slice(0, maxNextCalls);
  if (scrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: scrapeUrls, includePriorityPages: true, maxPages: 4, maxSites: scrapeUrls.length },
      reason: "Dohladat emaily pre leady, ktore batch QA vycistil alebo oznacil ako missing/invalid.",
      approvalRequired: false,
    });
  }
  const redraftInputs = items
    .filter((item) => item.issues.includes("missing_or_bad_intro") && item.updates.companyName)
    .slice(0, maxNextCalls)
    .map((item) => ({ companyName: item.updates.companyName as string, website: item.lead.website, context: item.lead.context ?? item.lead.scraped?.textPreview, offer: input.offer, language: input.language ?? "sk" }));
  if (redraftInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: redraftInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: Math.min(redraftInputs.length, 50) },
      reason: "Doplnit alebo prerobit AI intro pred Smartlead uploadom.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_lead_repair_queue_preview",
    payload: { leads: repairLeads.slice(0, maxNextCalls), offer: input.offer, language: input.language ?? "sk", maxNextCalls },
    reason: "Rozdelit problemove leady na scrape, intro, register a manual review kroky.",
    approvalRequired: false,
  });
  if (input.campaignId && smartleadPrepared.leadList.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { campaignId: input.campaignId, leads: smartleadPrepared.leadList },
      reason: "Pred uploadom overit duplicity a existujuce Smartlead zaznamy.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: input.leads.length,
    readyForSmartlead: readyLeads.length,
    repair: items.filter((item) => item.status === "repair").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    rejected: rejectedLeads.length,
    introCleaned: items.filter((item) => item.issues.includes("intro_cleaned")).length,
    namesCleared: items.filter((item) => item.issues.includes("decision_maker_looks_like_business_alias")).length,
    emailsCleared: items.filter((item) => item.issues.includes("invalid_or_low_quality_email") || item.issues.includes("missing_email")).length,
    blockedSources: items.filter((item) => item.issues.includes("blocked_source_domain")).length,
    companyShortUpdated: items.filter((item) => item.issues.includes("company_short_cleaned")).length,
    flagged: items.filter((item) => item.updates.verificationStatus === "flagged" || item.updates.verificationStatus === "failed").length,
  };
  const status: LeadBatchQaPreview["status"] = input.leads.length === 0 ? "blocked" : totals.readyForSmartlead > 0 && totals.rejected === 0 ? "ready" : totals.readyForSmartlead > 0 ? "attention" : "blocked";
  return {
    mode: "lead-batch-qa-preview",
    status,
    summary: `Lead batch QA ${status}: ${totals.readyForSmartlead} ready pre Smartlead, ${totals.repair} repair, ${totals.manualReview} manual review, ${totals.rejected} rejected. Ziadny DB zapis ani upload neprebehol.`,
    source: { campaignTag: input.campaignTag, createdSince: input.createdSince, defaultSource: input.defaultSource },
    totals,
    items,
    readyLeads,
    repairLeads,
    rejectedLeads,
    smartleadPrepared,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildLeadIdentityRepairPreview(input: {
  leads: Array<LeadRepairQueueLead & { companyNameShort?: string; company_name_short?: string; official_company_name?: string; original_name?: string }>;
  sourceName?: string;
  defaultSource?: string;
  campaignId?: string | number | null;
  includeSmartleadPreview?: boolean;
  maxItems?: number;
}): LeadIdentityRepairPreview {
  const maxItems = Math.min(Math.max(Math.trunc(input.maxItems ?? 300), 1), 1000);
  const leads = input.leads.slice(0, maxItems);
  const items: LeadIdentityRepairPreview["items"] = leads.map((lead) => {
    const custom = lead.customFields ?? {};
    const email = lead.email?.trim().toLowerCase() || undefined;
    const emailQuality = classifyIdentityEmail(email);
    const website = lead.website ?? stringField(custom, "website", "domain");
    const companyName = lead.companyName ?? stringField(lead, "official_company_name", "original_name", "companyNameShort", "company_name_short") ?? stringField(custom, "official_company_name", "original_name", "company_name_short");
    const companyNameShort = cleanLeadCompanyShort(stringField(lead, "companyNameShort", "company_name_short") ?? stringField(custom, "company_name_short") ?? companyName, website, companyName);
    const existingDecisionMaker = decisionMakerForLead(lead);
    const inferred = inferPersonNameFromEmail(email, companyNameShort ?? companyName, website);
    const selectedName = existingDecisionMaker && !looksLikeBusinessAlias(existingDecisionMaker) ? existingDecisionMaker : inferred.fullName;
    const split = splitName(selectedName);
    const issues: string[] = [];
    if (!email) issues.push("missing_email");
    else if (emailQuality === "invalid") issues.push("invalid_email");
    else if (emailQuality === "generic") issues.push("generic_email");
    if (!companyName) issues.push("missing_company_name");
    if (companyNameShort && companyNameShort !== (stringField(lead, "companyNameShort", "company_name_short") ?? stringField(custom, "company_name_short") ?? companyName)) issues.push("company_short_cleaned");
    if (!existingDecisionMaker && inferred.fullName) issues.push("decision_maker_inferred_from_email");
    if (existingDecisionMaker && looksLikeBusinessAlias(existingDecisionMaker) && inferred.fullName) issues.push("business_alias_replaced");
    if (!selectedName) issues.push("missing_decision_maker");
    const rejected = emailQuality === "invalid";
    const manual = !selectedName || !companyName || emailQuality === "generic" || emailQuality === "missing";
    const status: LeadIdentityRepairPreview["items"][number]["status"] = rejected
      ? "rejected"
      : manual
        ? "manual_review"
        : issues.length
          ? "repaired"
          : "unchanged";
    const confidence: LeadIdentityRepairPreview["items"][number]["confidence"] = inferred.confidence === "high" && emailQuality === "personal" ? "high" : selectedName ? "medium" : "low";
    return {
      lead,
      status,
      issues,
      confidence,
      updates: {
        email: rejected ? null : email,
        companyName,
        companyNameShort,
        firstName: split.firstName ?? lead.firstName,
        lastName: split.lastName ?? lead.lastName,
        decisionMakerName: selectedName,
        customFields: {
          ...custom,
          source: input.defaultSource ?? lead.source ?? stringField(custom, "source"),
          company_name_short: companyNameShort,
          decision_maker_name: selectedName,
          decision_maker_first_name: split.firstName ?? lead.firstName,
          decision_maker_last_name: split.lastName ?? lead.lastName,
          identity_repair_status: status,
          identity_repair_confidence: confidence,
          identity_repair_issues: issues.join(","),
        },
      },
    };
  });
  const repairedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status !== "rejected" && item.updates.email && item.updates.companyName)
    .map((item) => ({
      email: item.updates.email as string,
      companyName: item.updates.companyName,
      firstName: item.updates.firstName,
      lastName: item.updates.lastName,
      website: item.lead.website,
      phone: item.lead.phone,
      source: input.defaultSource ?? item.lead.source,
      personalizedIntro: item.lead.personalizedIntro,
      customFields: item.updates.customFields,
    }));
  const manualReviewLeads = items.filter((item) => item.status === "manual_review" || item.status === "rejected").map((item) => item.lead);
  const smartleadPrepared = prepareSmartleadLeads({ leads: repairedLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "lead-identity-repair" });
  const nextToolCalls: LeadIdentityRepairPreview["nextToolCalls"] = [];
  if (input.includeSmartleadPreview !== false && repairedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_slovak_salutation_preview",
      payload: { leads: repairedLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "lead-identity-repair", campaignId: input.campaignId },
      reason: "Po oprave identity dopln pan/pani custom fields pre Smartlead.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_lead_batch_qa_preview",
      payload: { leads: repairedLeads, campaignId: input.campaignId, defaultSource: input.defaultSource ?? input.sourceName ?? "lead-identity-repair" },
      reason: "Pred Smartlead importom este prever emaily, intro a company_short.",
      approvalRequired: false,
    });
  }
  if (manualReviewLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_manual_review_queue",
      payload: { leads: manualReviewLeads, minScore: 50 },
      reason: "Leady s generickym emailom, chybajucim menom alebo invalid emailom nechaj na manual review.",
      approvalRequired: false,
    });
  }
  if (input.campaignId && smartleadPrepared.leadList.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { campaignId: input.campaignId, leads: smartleadPrepared.leadList },
      reason: "Pred uploadom porovnaj opravene leady s existujucou Smartlead kampanou.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: leads.length,
    repaired: items.filter((item) => item.status === "repaired").length,
    inferredNames: items.filter((item) => item.issues.includes("decision_maker_inferred_from_email") || item.issues.includes("business_alias_replaced")).length,
    genericEmails: items.filter((item) => item.issues.includes("generic_email")).length,
    invalidEmails: items.filter((item) => item.issues.includes("invalid_email")).length,
    companyShortUpdated: items.filter((item) => item.issues.includes("company_short_cleaned")).length,
    missingIdentity: items.filter((item) => item.issues.includes("missing_decision_maker")).length,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: LeadIdentityRepairPreview["status"] = totals.input === 0 ? "blocked" : totals.invalidEmails || totals.genericEmails || totals.missingIdentity ? "attention" : "ready";
  return {
    mode: "lead-identity-repair-preview",
    status,
    summary: `Lead identity repair ${status}: ${totals.repaired} opravenych, ${totals.inferredNames} mien z emailu, ${totals.companyShortUpdated} company_short uprav, ${totals.smartleadReady} ready pre Smartlead. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, defaultSource: input.defaultSource },
    totals,
    items,
    repairedLeads,
    manualReviewLeads,
    smartleadPrepared,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildPhoneEnrichmentQueuePreview(input: {
  leads?: Array<LeadCandidateInput & { raw?: Record<string, string> }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  countryFilter?: string;
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  maxNextCalls?: number;
}): PhoneEnrichmentQueuePreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as Array<LeadCandidateInput & { raw?: Record<string, string> }>;
  const countryFilter = input.countryFilter?.trim();
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const scrapeByDomain = new Map((input.scrapedResults ?? []).flatMap((scrape) => {
    const keys = unique([normalizeDomain(scrape.url ?? ""), normalizeDomain(scrape.finalUrl ?? "")].filter(Boolean));
    return keys.map((key) => [key, scrape] as const);
  }));
  const items: PhoneEnrichmentQueuePreview["items"] = leads.map((lead) => {
    if (countryFilter && !leadMatchesCountry(lead, countryFilter)) {
      return { lead, status: "filtered_out", sourceUrls: [], reason: `country not ${countryFilter}` };
    }
    const existingPhone = lead.phone ?? stringField(lead.customFields ?? {}, "phone", "international_phone", "phone_number");
    if (existingPhone) return { lead, status: "with_phone", phone: existingPhone, sourceUrls: [], reason: "phone already present" };
    if (!isScrapableLeadWebsite(lead.website)) return { lead, status: "invalid_website", sourceUrls: [], reason: "missing or unsupported website" };
    const scraped = scrapeByDomain.get(normalizeDomain(lead.website as string));
    const foundPhone = scraped?.phones?.[0];
    if (foundPhone) {
      return {
        lead,
        status: "phone_found",
        phone: foundPhone,
        sourceUrls: [scraped.finalUrl, scraped.url].filter((value): value is string => Boolean(value)),
        reason: "phone found in supplied scrape result",
      };
    }
    return { lead, status: "needs_scrape", sourceUrls: [], reason: "phone missing; scrape website/contact pages" };
  });
  const enrichedLeads = items
    .filter((item) => item.status !== "filtered_out" && item.status !== "invalid_website")
    .map((item) => ({
      ...item.lead,
      phone: item.phone ?? item.lead.phone,
      source: item.lead.source ?? input.sourceName,
      customFields: {
        ...item.lead.customFields,
        phone_source_urls: item.sourceUrls.join("; ") || item.lead.customFields?.phone_source_urls,
      },
    }));
  const scrapeUrls = unique(items
    .filter((item) => item.status === "needs_scrape" && item.lead.website)
    .map((item) => item.lead.website as string))
    .slice(0, maxNextCalls);
  const exportPreview = serializeLeadsCsv({
    leads: enrichedLeads,
    columns: ["companyName", "email", "website", "phone", "source", "phone_source_urls"],
  });
  const nextToolCalls: PhoneEnrichmentQueuePreview["nextToolCalls"] = [];
  if (scrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: scrapeUrls, includePriorityPages: true, maxPages: 3, maxSites: scrapeUrls.length },
      reason: "Dohladat telefony z webov a kontakt podstranok pre leady bez telefonu.",
      approvalRequired: false,
    });
  }
  if (enrichedLeads.some((lead) => lead.phone)) {
    nextToolCalls.push({
      tool: "arcigy.export_leads_csv",
      payload: { leads: enrichedLeads, columns: ["companyName", "email", "website", "phone", "source", "phone_source_urls"] },
      reason: "Exportuj phone-enriched CSV az po kontrole riadkov operatorom.",
      approvalRequired: true,
    });
  }
  const totals = {
    input: leads.length,
    included: items.filter((item) => item.status !== "filtered_out").length,
    filteredOut: items.filter((item) => item.status === "filtered_out").length,
    withPhone: items.filter((item) => item.status === "with_phone").length,
    needsPhoneScrape: items.filter((item) => item.status === "needs_scrape").length,
    invalidWebsite: items.filter((item) => item.status === "invalid_website").length,
    phoneFoundFromScrape: items.filter((item) => item.status === "phone_found").length,
  };
  const status: PhoneEnrichmentQueuePreview["status"] = totals.input === 0 ? "blocked" : totals.needsPhoneScrape > 0 || totals.invalidWebsite > 0 ? "attention" : "ready";
  return {
    mode: "phone-enrichment-queue-preview",
    status,
    summary: `Phone enrichment queue ${status}: ${totals.withPhone} uz ma telefon, ${totals.phoneFoundFromScrape} doplnenych zo scrape, ${totals.needsPhoneScrape} potrebuje scrape. Ziadny zapis ani export neprebehol.`,
    source: { name: input.sourceName, countryFilter, parsedFromCsv: parsed?.leads.length ?? 0 },
    totals,
    items,
    enrichedLeads,
    scrapeUrls,
    exportPreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildPhoneEnrichmentWritebackPreview(input: {
  leads?: LeadCandidateInput[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  phoneResults?: Array<Partial<ScrapedWebsiteContacts> & Record<string, unknown>>;
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts> & Record<string, unknown>>;
  batch?: { results?: Array<Partial<ScrapedWebsiteContacts> & Record<string, unknown>> };
  sourceName?: string;
  sourceType?: "scrape" | "csv" | "manual" | "mixed";
  overwriteExisting?: boolean;
  maxNextCalls?: number;
}): PhoneEnrichmentWritebackPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])];
  const phoneResults = [...(input.phoneResults ?? []), ...(input.scrapedResults ?? []), ...(input.batch?.results ?? [])];
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const usedResults = new Set<number>();
  const items: PhoneEnrichmentWritebackPreview["items"] = leads.map((lead) => {
    const existingPhone = lead.phone ?? stringField(lead.customFields ?? {}, "phone", "international_phone", "phone_number");
    const matches = phoneResults
      .map((result, index) => ({ result, index, match: phoneResultMatchesLead(result, lead) }))
      .filter((item) => item.match.matchedBy.length);
    const candidates = unique(matches.flatMap((item) => phoneResultPhones(item.result)));
    const sourceUrls = unique(matches.flatMap((item) => phoneResultUrls(item.result)));
    const matchedBy = unique(matches.flatMap((item) => item.match.matchedBy));
    if (existingPhone && !input.overwriteExisting) {
      matches.forEach((item) => usedResults.add(item.index));
      return { lead, status: "existing_phone_kept", phone: existingPhone, candidates, matchedBy, sourceUrls, reason: "phone already present; overwriteExisting is false" };
    }
    if (!candidates.length) {
      return { lead, status: "no_phone_match", candidates: [], matchedBy: [], sourceUrls: [], reason: "no matching phone result found" };
    }
    matches.forEach((item) => usedResults.add(item.index));
    if (candidates.length > 1) {
      return { lead, status: "conflict", candidates, matchedBy, sourceUrls, reason: "multiple different phone candidates need manual review" };
    }
    return { lead, status: "enriched", phone: candidates[0], candidates, matchedBy, sourceUrls, reason: existingPhone ? "phone overwritten from approved enrichment result" : "phone merged from enrichment result" };
  });
  const enrichedLeads = items
    .filter((item) => item.status === "enriched" && item.phone)
    .map((item) => ({
      ...item.lead,
      phone: item.phone,
      source: item.lead.source ?? input.sourceName,
      customFields: {
        ...item.lead.customFields,
        phone_source_urls: item.sourceUrls.join("; ") || item.lead.customFields?.phone_source_urls,
        phone_match_method: item.matchedBy.join("; "),
        phone_candidates: item.candidates.join("; "),
      },
    }));
  const unchangedLeads = items
    .filter((item) => item.status === "existing_phone_kept" || item.status === "no_phone_match")
    .map((item) => item.lead);
  const conflicts = items
    .filter((item) => item.status === "conflict")
    .map((item) => ({ lead: item.lead, candidates: item.candidates, sourceUrls: item.sourceUrls, reason: item.reason }));
  const unmatchedResults = phoneResults
    .map((result, index) => ({ result, index }))
    .filter((item) => !usedResults.has(item.index) && phoneResultPhones(item.result).length)
    .map((item) => item.result as Record<string, unknown>);
  const exportPreview = serializeLeadsCsv({
    leads: [...enrichedLeads, ...unchangedLeads],
    columns: ["companyName", "email", "website", "phone", "source", "phone_source_urls", "phone_match_method", "phone_candidates"],
  });
  const missingPhoneLeads = items
    .filter((item) => item.status === "no_phone_match" && isScrapableLeadWebsite(item.lead.website))
    .map((item) => item.lead)
    .slice(0, maxNextCalls);
  const nextToolCalls: PhoneEnrichmentWritebackPreview["nextToolCalls"] = [];
  if (missingPhoneLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_phone_enrichment_queue_preview",
      payload: { leads: missingPhoneLeads, sourceName: input.sourceName, maxNextCalls },
      reason: "Dohladat telefony pre leady, ktore nemali match vo vysledkoch.",
      approvalRequired: false,
    });
  }
  if (enrichedLeads.length) {
    nextToolCalls.push(
      {
        tool: "arcigy.build_smartlead_nonreply_call_list_preview",
        payload: { leads: enrichedLeads, sourceName: input.sourceName, maxRows: maxNextCalls },
        reason: "Z enriched leadov priprav call list pre non-reply follow-up.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.export_leads_csv",
        payload: { leads: [...enrichedLeads, ...unchangedLeads], columns: exportPreview.columns },
        reason: "Export phone-enriched CSV az po kontrole operatorom.",
        approvalRequired: true,
      }
    );
  }
  const totals = {
    inputLeads: leads.length,
    phoneResults: phoneResults.length,
    enriched: enrichedLeads.length,
    unchanged: unchangedLeads.length,
    conflicts: conflicts.length,
    missingMatch: items.filter((item) => item.status === "no_phone_match").length,
    existingPhoneKept: items.filter((item) => item.status === "existing_phone_kept").length,
  };
  const status: PhoneEnrichmentWritebackPreview["status"] = totals.inputLeads === 0 ? "blocked" : totals.conflicts || totals.missingMatch ? "attention" : "ready";
  return {
    mode: "phone-enrichment-writeback-preview",
    status,
    summary: `Phone enrichment writeback ${status}: ${totals.enriched} doplnenych, ${totals.existingPhoneKept} ponechanych, ${totals.conflicts} konfliktov, ${totals.missingMatch} bez matchu. Ziadny zapis ani export neprebehol.`,
    source: { name: input.sourceName, type: input.sourceType ?? "mixed", parsedFromCsv: parsed?.leads.length ?? 0 },
    totals,
    items,
    enrichedLeads,
    unchangedLeads,
    conflicts,
    unmatchedResults,
    exportPreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildWebsiteScrapeQualityAuditPreview(input: {
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  batch?: Partial<BatchScrapedWebsiteContacts>;
  leads?: LeadCandidateInput[];
  minTextChars?: number;
  maxNextCalls?: number;
  offer?: string;
  language?: "sk" | "en";
}): WebsiteScrapeQualityAuditPreview {
  const scrapedResults = [...(input.scrapedResults ?? []), ...(input.batch?.results ?? [])];
  const failures = input.batch?.failures ?? [];
  const minTextChars = Math.min(Math.max(Math.trunc(input.minTextChars ?? 180), 40), 2000);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const items: WebsiteScrapeQualityAuditPreview["items"] = scrapedResults.map((scrape) => {
    const emails = unique((scrape.emails ?? []).map((email) => email.trim()).filter(Boolean));
    const preferredEmail = preferBusinessEmail(emails);
    const preferredPhone = scrape.phones?.find((phone) => phone.trim());
    const evidenceText = [scrape.title, scrape.description, scrape.textPreview].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const internalPriorityLinks = unique((scrape.internalLinks ?? []).filter(isPriorityLink)).slice(0, 10);
    const icoCandidates = unique(evidenceText.match(/\b\d{8}\b/g) ?? []).slice(0, 5);
    const issues: string[] = [];
    if (!emails.length) issues.push("missing_email");
    if (emails.length && !preferredEmail) issues.push("only_generic_email");
    if (!preferredPhone) issues.push("missing_phone");
    if (evidenceText.length < minTextChars) issues.push("short_text");
    if (!internalPriorityLinks.length) issues.push("missing_priority_links");
    const status = issues.includes("missing_email") || issues.includes("short_text")
      ? "needs_rescrape" as const
      : issues.length
        ? "manual_review" as const
        : "ready" as const;
    return { scrape, status, issues, preferredEmail, preferredPhone, evidenceText, internalPriorityLinks, icoCandidates };
  });
  const enrichedLeads = items.map((item) => {
    const matchedLead = (input.leads ?? []).find((lead) => scrapeMatchesLead(item.scrape, lead));
    return {
      ...(matchedLead ?? {}),
      website: matchedLead?.website ?? item.scrape.url ?? item.scrape.finalUrl,
      email: matchedLead?.email ?? item.preferredEmail,
      phone: matchedLead?.phone ?? item.preferredPhone,
      scraped: item.scrape,
      evidenceText: item.evidenceText,
      customFields: {
        ...matchedLead?.customFields,
        preferred_email_source: item.scrape.finalUrl ?? item.scrape.url,
        scrape_quality_issues: item.issues.join(","),
        ico_candidates: item.icoCandidates.join(","),
      },
    };
  });
  const rescrapeUrls = unique([
    ...items.filter((item) => item.status === "needs_rescrape").map((item) => item.scrape.url ?? item.scrape.finalUrl).filter((value): value is string => Boolean(value)),
    ...failures.map((failure) => failure.url),
  ]).slice(0, maxNextCalls);
  const introLeads = enrichedLeads
    .filter((lead) => lead.companyName && lead.email && lead.evidenceText && !extractLeadIntro(lead))
    .slice(0, maxNextCalls);
  const nextToolCalls: WebsiteScrapeQualityAuditPreview["nextToolCalls"] = [];
  if (rescrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: rescrapeUrls, includePriorityPages: true, maxPages: 5, maxSites: rescrapeUrls.length },
      reason: "Scrape vysledky su kratke, bez emailu alebo predchadzajuce URL zlyhali; zopakuj hlbsi contact/about scrape.",
      approvalRequired: false,
    });
  }
  if (introLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: introLeads, offer: input.offer, language: input.language ?? "sk", maxLeads: introLeads.length },
      reason: "Pouzi kvalitny scrape text ako podklad na personalizovane AI intra.",
      approvalRequired: false,
    });
  }
  if (enrichedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_enrichment_merge_preview",
      payload: { leads: input.leads ?? enrichedLeads, scrapedResults, minScore: 70, maxNextCalls },
      reason: "Zluc preferovane kontakty a scrape kontext spat do leadov pred review/Smartlead.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: scrapedResults.length,
    ready: items.filter((item) => item.status === "ready").length,
    needsRescrape: items.filter((item) => item.status === "needs_rescrape").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    contactsFound: items.filter((item) => item.preferredEmail).length,
    phonesFound: items.filter((item) => item.preferredPhone).length,
    preferredEmails: items.filter((item) => item.preferredEmail && !isGenericEmail(item.preferredEmail)).length,
    shortText: items.filter((item) => item.issues.includes("short_text")).length,
    failures: failures.length,
  };
  const status: WebsiteScrapeQualityAuditPreview["status"] = totals.input === 0 && totals.failures === 0 ? "blocked" : totals.needsRescrape || totals.manualReview || totals.failures ? "attention" : "ready";
  return {
    mode: "website-scrape-quality-audit-preview",
    status,
    summary: `Website scrape audit ${status}: ${totals.ready} ready, ${totals.needsRescrape} na rescrape, ${totals.contactsFound} s preferovanym emailom, ${totals.phonesFound} s telefonom, ${totals.failures} zlyhani. Ziadny fetch ani zapis neprebehol.`,
    totals,
    items,
    enrichedLeads,
    rescrapeUrls,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildFailedScrapeRecoveryQueuePreview(input: {
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  batch?: Partial<BatchScrapedWebsiteContacts>;
  failures?: Array<{ url: string; error?: string }>;
  leads?: LeadCandidateInput[];
  sourceName?: string;
  minTextChars?: number;
  maxRetryUrls?: number;
  maxFetchUrls?: number;
  includeFallbackSearch?: boolean;
  offer?: string;
  language?: "sk" | "en";
}): FailedScrapeRecoveryQueuePreview {
  const scrapeAudit = buildWebsiteScrapeQualityAuditPreview({
    scrapedResults: input.scrapedResults,
    batch: input.batch,
    leads: input.leads,
    minTextChars: input.minTextChars,
    offer: input.offer,
    language: input.language,
  });
  const failures = [...(input.batch?.failures ?? []), ...(input.failures ?? [])];
  const maxRetryUrls = Math.min(Math.max(Math.trunc(input.maxRetryUrls ?? 30), 1), 100);
  const maxFetchUrls = Math.min(Math.max(Math.trunc(input.maxFetchUrls ?? 20), 1), 50);
  const failedUrls = unique(failures.map((failure) => failure.url).filter(Boolean));
  const weakUrls = unique(scrapeAudit.items
    .filter((item) => item.status === "needs_rescrape")
    .map((item) => item.scrape.url ?? item.scrape.finalUrl)
    .filter((value): value is string => Boolean(value)));
  const retryUrls = unique([...failedUrls, ...weakUrls]).slice(0, maxRetryUrls);
  const fetchUrls = unique([...weakUrls, ...failedUrls]).slice(0, maxFetchUrls);
  const affectedLeads = uniqueByLeadIdentity([
    ...(input.leads ?? []).filter((lead) => {
      const domain = normalizeDomain(lead.website ?? "");
      return Boolean(domain && retryUrls.some((url) => normalizeDomain(url) === domain));
    }),
    ...scrapeAudit.enrichedLeads.filter((lead) => lead.website && retryUrls.some((url) => normalizeDomain(url) === normalizeDomain(lead.website ?? ""))),
  ]);
  const fallbackSearches = input.includeFallbackSearch === false
    ? []
    : unique([
        ...affectedLeads.map((lead) => {
          const companyName = companyNameForLead(lead) ?? lead.companyName;
          const website = lead.website;
          const domain = normalizeDomain(website ?? "");
          const query = [companyName, domain, "kontakt email"].filter(Boolean).join(" ");
          return JSON.stringify({ query: query || `${website} kontakt email`, website, companyName, reason: "scrape failed or returned weak contact evidence" });
        }),
        ...failedUrls.map((url) => {
          const domain = normalizeDomain(url);
          const companyName = titleFromHostname(domain || url);
          return JSON.stringify({ query: `${domain || url} kontakt email`, website: url, companyName, reason: "failed URL needs fallback search" });
        }),
      ])
      .map((value) => JSON.parse(value) as { query: string; website?: string; companyName?: string; reason: string })
      .filter((item) => item.query.trim())
      .slice(0, 30);

  const nextToolCalls: FailedScrapeRecoveryQueuePreview["nextToolCalls"] = [];
  if (retryUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: retryUrls, includePriorityPages: true, maxPages: 6, maxSites: retryUrls.length },
      reason: "Zlyhane alebo slabe scrape vysledky retryni hlbsim contact/about scrape.",
      approvalRequired: false,
    });
  }
  if (fetchUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_fetch_url_previews",
      payload: { urls: fetchUrls, method: "GET", maxBytes: 30000, maxUrls: fetchUrls.length },
      reason: "Ak scrape parser zlyhal, nacitaj redacted public fetch preview pre diagnostiku obsahu a blokovani.",
      approvalRequired: false,
    });
  }
  if (fallbackSearches.length) {
    nextToolCalls.push({
      tool: "arcigy.search_serper",
      payload: { query: fallbackSearches[0].query, num: 10 },
      reason: "Pri zlyhanom webe pouzi fallback web search na kontakt alebo alternativnu domenu.",
      approvalRequired: false,
    });
  }
  const contactReadyScrapes = scrapeAudit.items
    .filter((item) => item.status !== "needs_rescrape" && (item.preferredEmail || item.preferredPhone))
    .map((item) => item.scrape);
  if (contactReadyScrapes.length) {
    nextToolCalls.push({
      tool: "arcigy.build_outreach_contact_selection_preview",
      payload: { scrapedResults: contactReadyScrapes, leads: input.leads ?? [], sourceName: input.sourceName, offer: input.offer, language: input.language ?? "sk" },
      reason: "Cast scrape vysledkov ma kontakt; vyber najlepsi outreach email/telefon pred AI introm.",
      approvalRequired: false,
    });
  }
  if (affectedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: affectedLeads, offer: input.offer, language: input.language ?? "sk" },
      reason: "Oznac leady dotknute failed scrape na opravu emailu, webu alebo rozhodovatela.",
      approvalRequired: false,
    });
  }

  const warnings: string[] = [];
  if (!retryUrls.length && !contactReadyScrapes.length) warnings.push("No failed, weak, or contact-ready scrape records were supplied.");
  if (failedUrls.length > maxRetryUrls) warnings.push("Some failed URLs were truncated by maxRetryUrls.");
  const status: FailedScrapeRecoveryQueuePreview["status"] = !retryUrls.length && !contactReadyScrapes.length
    ? "blocked"
    : retryUrls.length || fallbackSearches.length
      ? "attention"
      : "ready";
  const totals = {
    failedUrls: failedUrls.length,
    weakScrapes: weakUrls.length,
    retryUrls: retryUrls.length,
    fetchUrls: fetchUrls.length,
    fallbackSearches: fallbackSearches.length,
    contactSelectionReady: contactReadyScrapes.length,
    leadsAffected: affectedLeads.length,
  };
  return {
    mode: "failed-scrape-recovery-queue-preview",
    status,
    summary: `Failed scrape recovery ${status}: ${totals.retryUrls} URL na retry, ${totals.fetchUrls} fetch preview, ${totals.fallbackSearches} fallback search, ${totals.contactSelectionReady} scrape pripravenych na contact selection. Ziadny fetch, scrape ani zapis neprebehol.`,
    totals,
    retryUrls,
    fetchUrls,
    fallbackSearches,
    affectedLeads,
    scrapeAudit,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    warnings,
  };
}

export function buildOutreachContactSelectionPreview(input: {
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  batch?: Partial<BatchScrapedWebsiteContacts>;
  leads?: LeadCandidateInput[];
  sourceName?: string;
  offer?: string;
  language?: "sk" | "en";
  includeFallbackSearch?: boolean;
  maxNextCalls?: number;
}): OutreachContactSelectionPreview {
  const scrapedResults = [...(input.scrapedResults ?? []), ...(input.batch?.results ?? [])];
  const failures = input.batch?.failures ?? [];
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 120);
  const items: OutreachContactSelectionPreview["items"] = scrapedResults.map((scrape) => {
    const lead = (input.leads ?? []).find((candidate) => scrapeMatchesLead(scrape, candidate));
    const website = lead?.website ?? scrape.finalUrl ?? scrape.url;
    const emails = unique([lead?.email, ...(scrape.emails ?? [])].filter((email): email is string => Boolean(email)).map((email) => email.trim().toLowerCase()));
    const rankedEmails = rankOutreachContactEmails(emails, website);
    const selected = rankedEmails.find((email) => email.quality !== "invalid" && email.quality !== "asset" && email.score >= 20) ?? rankedEmails.find((email) => email.quality === "generic" && email.score >= 5);
    const selectedPhone = lead?.phone ?? scrape.phones?.find((phone) => phone.trim());
    const evidenceText = [scrape.title, scrape.description, scrape.textPreview].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const issues: string[] = [];
    if (!selected) issues.push("missing_usable_email");
    if (selected?.quality === "generic") issues.push("selected_generic_email");
    if (selected?.quality === "free_mailbox") issues.push("selected_free_mailbox");
    if (selected?.quality === "external") issues.push("selected_external_domain");
    if (!selectedPhone) issues.push("missing_phone");
    if (rankedEmails.some((email) => email.quality === "asset")) issues.push("asset_like_emails_filtered");
    const status: OutreachContactSelectionPreview["items"][number]["status"] = !selected ? "needs_search" : issues.some((issue) => ["selected_generic_email", "selected_free_mailbox", "selected_external_domain"].includes(issue)) ? "manual_review" : "ready";
    return { scrape, lead, status, selectedEmail: selected?.email, selectedPhone, rankedEmails, issues, evidenceText };
  });
  const fallbackSearches = items
    .filter((item) => item.status === "needs_search")
    .map((item) => {
      const companyName = item.lead?.companyName ?? stringField(item.lead?.customFields ?? {}, "company_name", "original_name") ?? item.scrape.title;
      const website = item.lead?.website ?? item.scrape.finalUrl ?? item.scrape.url;
      const domain = website ? normalizeDomain(website) : undefined;
      const query = [companyName, domain, "email kontakt majitel"].filter(Boolean).join(" ");
      return { query, website, companyName, reason: "Scrape nenasiel pouzitelny outreach email; skus cielene verejne hladanie kontaktu." };
    })
    .filter((item) => item.query.trim())
    .slice(0, maxNextCalls);
  const enrichedLeads = items.map((item) => ({
    ...(item.lead ?? {}),
    companyName: item.lead?.companyName ?? item.scrape.title,
    website: item.lead?.website ?? item.scrape.finalUrl ?? item.scrape.url,
    email: item.selectedEmail ?? item.lead?.email,
    phone: item.selectedPhone ?? item.lead?.phone,
    scraped: item.scrape,
    evidenceText: item.evidenceText,
    customFields: {
      ...item.lead?.customFields,
      contact_selection_status: item.status,
      contact_selection_issues: item.issues.join(","),
      selected_email_score: item.rankedEmails.find((email) => email.email === item.selectedEmail)?.score,
      selected_email_quality: item.rankedEmails.find((email) => email.email === item.selectedEmail)?.quality,
    },
  }));
  const introInputs = enrichedLeads
    .filter((lead) => lead.companyName && lead.email && !extractLeadIntro(lead))
    .map((lead) => ({
      companyName: lead.companyName as string,
      website: lead.website,
      context: lead.evidenceText,
      offer: input.offer,
      language: input.language ?? "sk",
    }))
    .slice(0, maxNextCalls);
  const nextToolCalls: OutreachContactSelectionPreview["nextToolCalls"] = [];
  if (input.includeFallbackSearch !== false && fallbackSearches.length) {
    for (const search of fallbackSearches.slice(0, Math.min(maxNextCalls, 10))) {
      nextToolCalls.push({
        tool: "arcigy.search_serper",
        payload: { query: search.query, num: 5 },
        reason: "Fallback hladanie emailu pre lead bez pouzitelneho scrape kontaktu.",
        approvalRequired: false,
      });
    }
  }
  const rescrapeUrls = unique(items.filter((item) => item.status === "needs_search").map((item) => item.lead?.website ?? item.scrape.url ?? item.scrape.finalUrl).filter((value): value is string => Boolean(value))).slice(0, maxNextCalls);
  if (rescrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: rescrapeUrls, includePriorityPages: true, maxPages: 6, maxSites: rescrapeUrls.length },
      reason: "Kontakt chyba alebo je slaby; zopakuj hlbsi scrape kontakt/about/team stranok.",
      approvalRequired: false,
    });
  }
  if (introInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: introInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: introInputs.length },
      reason: "Vybrane kontakty maju dost kontextu; priprav AI intra pred Smartlead.",
      approvalRequired: false,
    });
  }
  if (enrichedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: enrichedLeads, offer: input.offer, language: input.language ?? "sk", maxNextCalls },
      reason: "Po vybere kontaktov skontroluj emaily, mena, intra a manual-review stav pred Smartlead.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    needsSearch: items.filter((item) => item.status === "needs_search").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    selectedPersonalEmails: items.filter((item) => item.selectedEmail && item.rankedEmails.find((email) => email.email === item.selectedEmail)?.quality === "personal").length,
    selectedGenericEmails: items.filter((item) => item.selectedEmail && item.rankedEmails.find((email) => email.email === item.selectedEmail)?.quality === "generic").length,
    missingEmail: items.filter((item) => item.issues.includes("missing_usable_email")).length,
    missingPhone: items.filter((item) => item.issues.includes("missing_phone")).length,
    freeMailboxSelected: items.filter((item) => item.issues.includes("selected_free_mailbox")).length,
    fallbackSearches: fallbackSearches.length,
    introsToDraft: introInputs.length,
  };
  const status: OutreachContactSelectionPreview["status"] = totals.input === 0 && failures.length === 0 ? "blocked" : totals.needsSearch || totals.manualReview || failures.length ? "attention" : "ready";
  return {
    mode: "outreach-contact-selection-preview",
    status,
    summary: `Outreach contact selection ${status}: ${totals.ready} ready, ${totals.manualReview} manual review, ${totals.needsSearch} potrebuje fallback search, ${totals.selectedPersonalEmails} personal emailov. Ziadny fetch, zapis ani upload neprebehol.`,
    source: { name: input.sourceName, scrapedResults: scrapedResults.length, failures: failures.length },
    totals,
    items,
    fallbackSearches,
    enrichedLeads,
    introInputs,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildAiIntroWorkPacketPreview(input: {
  leads?: Array<LeadCandidateInput & { id?: string; raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  niche?: string;
  offer?: string;
  language?: "sk" | "en";
  maxLeads?: number;
  maxContextChars?: number;
  completedIntros?: Array<{ id: string; icebreaker?: string; personalizedIntro?: string }>;
}): AiIntroWorkPacketPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as AiIntroWorkPacketPreview["packetItems"][number]["lead"][];
  const language = input.language ?? "sk";
  const maxLeads = Math.min(Math.max(Math.trunc(input.maxLeads ?? 50), 1), 200);
  const maxContextChars = Math.min(Math.max(Math.trunc(input.maxContextChars ?? 1200), 200), 5000);
  const skippedExistingIntro = leads.filter((lead) => Boolean(extractLeadIntro(lead))).length;
  const missingCompany = leads.filter((lead) => !aiIntroWorkCompanyName(lead)).length;
  const packetItems = leads
    .map((lead, index) => {
      const companyName = aiIntroWorkCompanyName(lead);
      if (!companyName || extractLeadIntro(lead)) return null;
      const context = aiIntroWorkContext(lead).slice(0, maxContextChars);
      return {
        id: aiIntroWorkLeadId(lead, index),
        lead,
        companyName,
        ...(lead.website ? { website: lead.website } : {}),
        context,
        evidenceTerms: importantIntroTerms(context),
      };
    })
    .filter((item): item is AiIntroWorkPacketPreview["packetItems"][number] => item !== null)
    .slice(0, maxLeads);
  const packetById = new Map(packetItems.map((item) => [item.id, item]));
  const completedItems: AiIntroWorkPacketPreview["completedItems"] = (input.completedIntros ?? []).map((item) => {
    const packet = packetById.get(item.id);
    const icebreaker = (item.icebreaker ?? item.personalizedIntro ?? "").replace(/\s+/g, " ").trim();
    if (!packet) return { id: item.id, status: "unknown_lead", icebreaker, issues: ["unknown_lead_id"] };
    const issues = introQualityIssues(icebreaker, packet.evidenceTerms, 0, packet.lead)
      .filter((issue) => issue !== "missing_evidence" && issue !== "weak_evidence_grounding");
    return { id: item.id, status: issues.length ? "invalid" : "valid", icebreaker, issues };
  });
  const validById = new Map(completedItems
    .filter((item) => item.status === "valid" && item.icebreaker)
    .map((item) => [item.id, item.icebreaker as string]));
  const mergedLeads: LeadCandidateInput[] = packetItems
    .filter((item) => validById.has(item.id))
    .map((item) => {
      const intro = validById.get(item.id) as string;
      return {
        ...item.lead,
        companyName: item.companyName,
        personalizedIntro: intro,
        source: item.lead.source ?? input.sourceName,
        customFields: {
          ...item.lead.customFields,
          ai_intro_work_packet_id: item.id,
          personalized_intro: intro,
          icebreaker_sentence: intro,
        },
      };
    });
  const draftInputs = packetItems.map((item) => ({
    companyName: item.companyName,
    website: item.website,
    context: item.context,
    offer: input.offer,
    language,
  }));
  const nextToolCalls: AiIntroWorkPacketPreview["nextToolCalls"] = [];
  if (draftInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: draftInputs.slice(0, 50), offer: input.offer, language, maxLeads: Math.min(draftInputs.length, 50) },
      reason: "Alternativa k manualnemu AI baliku: nech Jarvis/Gemini navrhne intra priamo z pripraveneho kontextu.",
      approvalRequired: false,
    });
  }
  if (mergedLeads.length) {
    nextToolCalls.push(
      {
        tool: "arcigy.build_ai_intro_cleanup_preview",
        payload: { leads: mergedLeads, offer: input.offer, language, defaultSource: input.sourceName },
        reason: "Vycistit validne AI intra od pozdravov a mien pred importom.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.build_ai_intro_quality_audit_preview",
        payload: { leads: mergedLeads, offer: input.offer, language, minEvidenceTerms: 0 },
        reason: "Skontrolovat vygenerovane intra pred Smartlead uploadom alebo exportom.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.export_leads_csv",
        payload: { leads: mergedLeads, columns: ["companyName", "email", "website", "personalizedIntro", "source", "ai_intro_work_packet_id"] },
        reason: "Exportovat AI intro vysledky az po kontrole operatorom.",
        approvalRequired: true,
      }
    );
  }
  const totals = {
    input: leads.length,
    eligible: packetItems.length,
    skippedExistingIntro,
    missingCompany,
    noContext: packetItems.filter((item) => !item.context).length,
    packetItems: packetItems.length,
    completedIntros: input.completedIntros?.length ?? 0,
    validCompleted: completedItems.filter((item) => item.status === "valid").length,
    invalidCompleted: completedItems.filter((item) => item.status !== "valid").length,
  };
  const status: AiIntroWorkPacketPreview["status"] = totals.input === 0 || totals.packetItems === 0 ? "blocked" : totals.noContext || totals.invalidCompleted ? "attention" : "ready";
  return {
    mode: "ai-intro-work-packet-preview",
    status,
    summary: `AI intro work packet ${status}: ${totals.packetItems} leadov pripravenych pre AI, ${totals.validCompleted}/${totals.completedIntros} dodanych intr validnych. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, niche: input.niche, parsedFromCsv: parsed?.leads.length ?? 0, language, offer: input.offer },
    totals,
    packetItems,
    markdownTask: buildAiIntroWorkMarkdownTask({ packetItems, niche: input.niche, offer: input.offer, language }),
    expectedJson: packetItems.map((item) => ({ id: item.id, icebreaker: "" })),
    completedItems,
    mergedLeads,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildBulkAiIntroWorkQueuePreview(input: {
  groups: Array<{
    sourceName?: string;
    niche?: string;
    offer?: string;
    language?: "sk" | "en";
    leads?: Array<LeadCandidateInput & { id?: string; raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown }>;
    csvText?: string;
    delimiter?: "," | ";";
  }>;
  offer?: string;
  language?: "sk" | "en";
  batchSize?: number;
  maxBatches?: number;
  maxContextChars?: number;
}): BulkAiIntroWorkQueuePreview {
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 40), 1), 100);
  const maxBatches = Math.min(Math.max(Math.trunc(input.maxBatches ?? 30), 1), 100);
  const language = input.language ?? "sk";
  const queue: BulkAiIntroWorkQueuePreview["queue"] = [];
  const nextToolCalls: BulkAiIntroWorkQueuePreview["nextToolCalls"] = [];
  const warnings: string[] = [];
  let parsedFromCsv = 0;
  let inputLeads = 0;
  let skippedExistingIntro = 0;
  let missingCompany = 0;

  for (const group of input.groups) {
    if (queue.length >= maxBatches) break;
    const parsed = group.csvText?.trim() ? parseLeadsCsv({ csvText: group.csvText, delimiter: group.delimiter }) : undefined;
    parsedFromCsv += parsed?.leads.length ?? 0;
    const groupLeads = [...(group.leads ?? []), ...(parsed?.leads ?? [])] as AiIntroWorkPacketPreview["packetItems"][number]["lead"][];
    inputLeads += groupLeads.length;
    skippedExistingIntro += groupLeads.filter((lead) => Boolean(extractLeadIntro(lead))).length;
    missingCompany += groupLeads.filter((lead) => !aiIntroWorkCompanyName(lead)).length;
    const eligible = groupLeads.filter((lead) => aiIntroWorkCompanyName(lead) && !extractLeadIntro(lead));
    const batches = chunk(eligible, batchSize);
    for (const leads of batches) {
      if (queue.length >= maxBatches) break;
      const packet = buildAiIntroWorkPacketPreview({
        leads,
        sourceName: group.sourceName,
        niche: group.niche,
        offer: group.offer ?? input.offer,
        language: group.language ?? language,
        maxLeads: batchSize,
        maxContextChars: input.maxContextChars,
      });
      const status: BulkAiIntroWorkQueuePreview["queue"][number]["status"] = packet.status;
      const order = queue.length + 1;
      queue.push({ order, groupName: group.sourceName, niche: group.niche, status, leadCount: leads.length, packet });
      nextToolCalls.push({
        tool: "arcigy.build_ai_intro_work_packet_preview",
        payload: {
          leads,
          sourceName: group.sourceName,
          niche: group.niche,
          offer: group.offer ?? input.offer,
          language: group.language ?? language,
          maxLeads: batchSize,
          maxContextChars: input.maxContextChars,
        },
        reason: `Priprav AI intro work packet batch ${order}${group.niche ? ` pre ${group.niche}` : ""}.`,
        approvalRequired: false,
      });
      nextToolCalls.push({
        tool: "arcigy.build_ai_intro_import_preview",
        payload: {
          leads,
          sourceName: group.sourceName,
          niche: group.niche,
          offer: group.offer ?? input.offer,
          language: group.language ?? language,
          completedIntros: [],
        },
        reason: `Po vyplneni AI JSONu validuj a mergni intra pre batch ${order}.`,
        approvalRequired: false,
      });
    }
  }

  if (input.groups.length && queue.length >= maxBatches) warnings.push("Queue was truncated by maxBatches.");
  if (!queue.length) warnings.push("No leads without personalized intro were eligible for AI intro work packets.");
  const totals = {
    groups: input.groups.length,
    batches: queue.length,
    inputLeads,
    queuedLeads: queue.reduce((sum, item) => sum + item.packet.totals.packetItems, 0),
    skippedExistingIntro,
    missingCompany,
    noContext: queue.reduce((sum, item) => sum + item.packet.totals.noContext, 0),
    parsedFromCsv,
  };
  const status: BulkAiIntroWorkQueuePreview["status"] = !queue.length
    ? "blocked"
    : totals.noContext || warnings.length
      ? "attention"
      : "ready";
  return {
    mode: "bulk-ai-intro-work-queue-preview",
    status,
    summary: `Bulk AI intro queue ${status}: ${totals.queuedLeads} leadov v ${totals.batches} batchoch, ${totals.skippedExistingIntro} uz malo intro, ${totals.noContext} bez kontextu. Ziadny AI call, zapis ani upload neprebehol.`,
    totals,
    queue,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    warnings,
  };
}

export function buildAiIntroImportPreview(input: {
  leads?: Array<LeadCandidateInput & { id?: string; raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  niche?: string;
  offer?: string;
  language?: "sk" | "en";
  maxLeads?: number;
  maxContextChars?: number;
  completedIntros?: Array<{ id: string; icebreaker?: string; personalizedIntro?: string }>;
  resultJsonText?: string;
  resultCsvText?: string;
  resultDelimiter?: "," | ";";
}): AiIntroImportPreview {
  const parsedResults = parseAiIntroImportResults(input);
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const uniqueCompleted = parsedResults.flatMap((item) => {
    if (!item.id) return [];
    if (seen.has(item.id)) {
      duplicateIds.push(item.id);
      return [];
    }
    seen.add(item.id);
    return [{ id: item.id, icebreaker: item.icebreaker }];
  });
  const workPacket = buildAiIntroWorkPacketPreview({
    leads: input.leads,
    csvText: input.csvText,
    delimiter: input.delimiter,
    sourceName: input.sourceName,
    niche: input.niche,
    offer: input.offer,
    language: input.language,
    maxLeads: input.maxLeads,
    maxContextChars: input.maxContextChars,
    completedIntros: uniqueCompleted,
  });
  const invalidItems = workPacket.completedItems.filter((item) => item.status !== "valid");
  const resultFormat = input.completedIntros?.length && (input.resultJsonText?.trim() || input.resultCsvText?.trim())
    ? "mixed"
    : input.resultJsonText?.trim()
      ? input.resultCsvText?.trim() ? "mixed" : "json"
      : input.resultCsvText?.trim()
        ? "csv"
        : "direct";
  const totals = {
    leads: workPacket.totals.input,
    parsedResults: parsedResults.length,
    uniqueResults: uniqueCompleted.length,
    duplicateIds: duplicateIds.length,
    validCompleted: workPacket.totals.validCompleted,
    invalidCompleted: workPacket.totals.invalidCompleted,
    unknownLead: workPacket.completedItems.filter((item) => item.status === "unknown_lead").length,
    mergedLeads: workPacket.mergedLeads.length,
  };
  const nextToolCalls: AiIntroImportPreview["nextToolCalls"] = [...workPacket.nextToolCalls];
  if (workPacket.mergedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.prepare_smartlead_leads",
      payload: { leads: workPacket.mergedLeads, source: input.sourceName, campaignId: null },
      reason: "Po validacii a cisteni intr priprav Smartlead payload bez uploadu.",
      approvalRequired: false,
    });
  }
  if (invalidItems.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: {
        leads: workPacket.packetItems
          .filter((item) => invalidItems.some((invalid) => invalid.id === item.id))
          .map((item) => item.lead),
        sourceName: input.sourceName,
        niche: input.niche,
        offer: input.offer,
        language: input.language ?? "sk",
        maxLeads: Math.min(invalidItems.length, 50),
      },
      reason: "Neplatne alebo nezname AI intra vrat do noveho work packetu na opravu.",
      approvalRequired: false,
    });
  }
  const status: AiIntroImportPreview["status"] = totals.leads === 0 || totals.parsedResults === 0
    ? "blocked"
    : totals.validCompleted === 0 || totals.invalidCompleted > 0 || totals.duplicateIds > 0
      ? "attention"
      : "ready";
  return {
    mode: "ai-intro-import-preview",
    status,
    summary: `AI intro import ${status}: ${totals.validCompleted}/${totals.uniqueResults} vysledkov validnych, ${totals.mergedLeads} leadov pripravenych na cleanup/audit/export. Ziadny DB zapis ani Smartlead upload neprebehol.`,
    source: { name: input.sourceName, niche: input.niche, resultFormat, parsedFromCsv: input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }).leads.length : 0, language: input.language ?? "sk", offer: input.offer },
    totals,
    parsedResults,
    duplicateIds: unique(duplicateIds),
    completedItems: workPacket.completedItems,
    invalidItems,
    mergedLeads: workPacket.mergedLeads,
    workPacket,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildAiIcebreakerWritebackPreview(input: {
  leads: Array<LeadCandidateInput & { id?: string; leadId?: string; lead_id?: string; raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown }>;
  icebreakers?: Array<{ id: string; icebreaker?: string; personalizedIntro?: string }>;
  resultJsonText?: string;
  sourceName?: string;
  niche?: string;
  offer?: string;
  language?: "sk" | "en";
  defaultSource?: string;
  campaignId?: string | number | null;
  maxNextCalls?: number;
}): AiIcebreakerWritebackPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 500);
  const parsed = parseAiIntroImportResults({ completedIntros: input.icebreakers, resultJsonText: input.resultJsonText });
  const leadById = new Map(input.leads.flatMap((lead) => {
    const id = aiIcebreakerWritebackLeadId(lead);
    return id ? [[id, lead] as const] : [];
  }));
  const seen = new Set<string>();
  const items: AiIcebreakerWritebackPreview["items"] = parsed.map((item) => {
    const id = item.id.trim();
    const icebreaker = item.icebreaker?.replace(/\s+/g, " ").trim();
    const lead = leadById.get(id);
    const duplicate = seen.has(id);
    if (id) seen.add(id);
    const issues: string[] = [];
    if (!id) issues.push("missing_id");
    if (!icebreaker) issues.push("missing_icebreaker");
    if (icebreaker && /dopln|doplň|sem|todo|tbd|xxx|\?\?\?/i.test(icebreaker)) issues.push("placeholder_icebreaker");
    if (icebreaker && icebreaker.length > 280) issues.push("icebreaker_too_long");
    if (lead && icebreaker) issues.push(...introQualityIssues(icebreaker, importantIntroTerms(introEvidenceText(lead)), 0, lead));
    if (!lead && id) issues.push("unknown_lead");
    const status: AiIcebreakerWritebackPreview["items"][number]["status"] = duplicate
      ? "duplicate"
      : !lead
        ? "unknown_lead"
        : issues.length
          ? "invalid"
          : "valid";
    return { id, status, icebreaker, issues: unique(issues), lead };
  });
  const mergedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status === "valid" && item.lead && item.icebreaker)
    .map((item) => {
      const lead = item.lead as LeadCandidateInput & { id?: string; leadId?: string; lead_id?: string; raw?: Record<string, string> };
      return {
        email: lead.email ?? "",
        companyName: lead.companyName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        website: lead.website,
        phone: lead.phone,
        source: input.defaultSource ?? input.sourceName ?? lead.source,
        personalizedIntro: item.icebreaker,
        customFields: {
          ...lead.customFields,
          lead_id: aiIcebreakerWritebackLeadId(lead),
          personalized_intro: item.icebreaker,
          icebreaker_sentence: item.icebreaker,
          ai_icebreaker_writeback_status: "valid",
          source_name: input.sourceName ?? lead.customFields?.source_name,
        },
      };
    });
  const smartleadPrepared = prepareSmartleadLeads({ leads: mergedLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "ai-icebreaker-writeback" });
  const nextLeads = mergedLeads.slice(0, maxNextCalls);
  const invalidLeads = items
    .filter((item) => item.status === "invalid" && item.lead)
    .slice(0, maxNextCalls)
    .map((item) => item.lead as LeadCandidateInput);
  const nextToolCalls: AiIcebreakerWritebackPreview["nextToolCalls"] = [];
  if (nextLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_cleanup_preview",
      payload: { leads: nextLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "ai-icebreaker-writeback", campaignId: input.campaignId, offer: input.offer, language: input.language ?? "sk" },
      reason: "Po writeback preview este vycistit pozdravy, mena a placeholders pred Smartleadom.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_lead_batch_qa_preview",
      payload: { leads: nextLeads, defaultSource: input.defaultSource ?? input.sourceName ?? "ai-icebreaker-writeback", campaignId: input.campaignId, offer: input.offer, language: input.language ?? "sk", maxNextCalls },
      reason: "Skontrolovat emaily, company_short a intro pred Smartlead importom.",
      approvalRequired: false,
    });
  }
  if (input.campaignId && smartleadPrepared.leadList.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { campaignId: input.campaignId, leads: smartleadPrepared.leadList },
      reason: "Pred uploadom overit duplicity a existujuce leady v Smartlead kampani.",
      approvalRequired: false,
    });
  }
  if (invalidLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: invalidLeads, sourceName: input.sourceName, niche: input.niche, offer: input.offer, language: input.language ?? "sk", maxLeads: Math.min(invalidLeads.length, 50) },
      reason: "Neplatne icebreakery vratit do AI work packetu na opravu.",
      approvalRequired: false,
    });
  }
  const totals = {
    leads: input.leads.length,
    parsedIcebreakers: parsed.length,
    valid: items.filter((item) => item.status === "valid").length,
    invalid: items.filter((item) => item.status === "invalid").length,
    unknownLead: items.filter((item) => item.status === "unknown_lead").length,
    duplicateIds: items.filter((item) => item.status === "duplicate").length,
    mergedLeads: mergedLeads.length,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: AiIcebreakerWritebackPreview["status"] = totals.leads === 0 || totals.parsedIcebreakers === 0
    ? "blocked"
    : totals.valid === 0 || totals.invalid > 0 || totals.unknownLead > 0 || totals.duplicateIds > 0
      ? "attention"
      : "ready";
  return {
    mode: "ai-icebreaker-writeback-preview",
    status,
    summary: `AI icebreaker writeback ${status}: ${totals.valid}/${totals.parsedIcebreakers} validnych, ${totals.mergedLeads} leadov mergnutych, ${totals.smartleadReady} ready pre Smartlead. Ziadny DB zapis ani upload neprebehol.`,
    source: { name: input.sourceName, niche: input.niche, parsedFromJson: input.resultJsonText?.trim() ? parsed.length : 0, language: input.language ?? "sk", offer: input.offer },
    totals,
    items,
    mergedLeads,
    smartleadPrepared,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

function aiIcebreakerWritebackLeadId(lead: LeadCandidateInput & { id?: string; leadId?: string; lead_id?: string; raw?: Record<string, string> }): string | undefined {
  return stringField(lead, "id", "leadId", "lead_id")
    ?? stringField(lead.customFields ?? {}, "id", "lead_id", "uuid")
    ?? stringField(lead.raw ?? {}, "id", "lead_id", "uuid");
}

function parseAiIntroImportResults(input: {
  completedIntros?: Array<{ id: string; icebreaker?: string; personalizedIntro?: string }>;
  resultJsonText?: string;
  resultCsvText?: string;
  resultDelimiter?: "," | ";";
}): AiIntroImportPreview["parsedResults"] {
  const direct = (input.completedIntros ?? []).map((item) => ({
    id: String(item.id ?? "").trim(),
    icebreaker: (item.icebreaker ?? item.personalizedIntro ?? "").replace(/\s+/g, " ").trim(),
    source: "direct" as const,
  }));
  const json = input.resultJsonText?.trim()
    ? parseAiIntroJsonRows(input.resultJsonText).map((item) => ({
      id: aiIntroResultString(item, "id", "leadId", "lead_id", "ai_intro_work_packet_id", "uuid"),
      icebreaker: aiIntroResultString(item, "icebreaker", "personalizedIntro", "personalized_intro", "intro", "icebreaker_sentence", "text"),
      source: "json" as const,
    }))
    : [];
  const csv = input.resultCsvText?.trim() ? parseAiIntroCsvRows(input.resultCsvText, input.resultDelimiter) : [];
  return [...direct, ...json, ...csv]
    .map((item) => ({ ...item, id: item.id.trim(), icebreaker: item.icebreaker?.replace(/\s+/g, " ").trim() }))
    .filter((item) => item.id || item.icebreaker);
}

function parseAiIntroJsonRows(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const candidates = [
    cleaned,
    cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1),
    cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate.trim().length > 1);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return aiIntroJsonRows(parsed);
    } catch {
      // Try the next candidate.
    }
  }
  return [];
}

function aiIntroJsonRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["completedIntros", "icebreakers", "intros", "results", "data"]) {
    const rows = aiIntroJsonRows(record[key]);
    if (rows.length) return rows;
  }
  return [record];
}

function parseAiIntroCsvRows(csvText: string, delimiter?: "," | ";"): AiIntroImportPreview["parsedResults"] {
  const rows = parseCsv(csvText, delimiter);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => slugify(header).replace(/-/g, "_"));
  const idIndex = firstHeaderIndex(headers, ["id", "lead_id", "leadid", "ai_intro_work_packet_id", "uuid"]);
  const introIndex = firstHeaderIndex(headers, ["icebreaker", "personalized_intro", "personalizedintro", "intro", "icebreaker_sentence", "text"]);
  return rows.slice(1).map((row, index) => ({
    id: idIndex >= 0 ? String(row[idIndex] ?? "").trim() : "",
    icebreaker: introIndex >= 0 ? String(row[introIndex] ?? "").replace(/\s+/g, " ").trim() : undefined,
    source: "csv" as const,
    rowNumber: index + 2,
  }));
}

function firstHeaderIndex(headers: string[], candidates: string[]): number {
  return candidates.map((candidate) => headers.indexOf(candidate)).find((index) => index >= 0) ?? -1;
}

function aiIntroResultString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "";
}

export function buildLeadgenStatusBoardPreview(input: {
  leads?: Array<LeadCandidateInput & {
    id?: string;
    raw?: Record<string, string>;
    nicheSlug?: string;
    nicheId?: string;
    campaignTag?: string;
    campaignId?: string | number | null;
    verificationStatus?: string;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    smartleadStatus?: string;
    smartlead_status?: string;
    ico?: string;
    official_company_name?: string;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  groupBy?: "niche" | "campaign" | "source";
  defaultNiche?: string;
  defaultCampaignId?: string | number | null;
  offer?: string;
  language?: "sk" | "en";
  maxNextCalls?: number;
}): LeadgenStatusBoardPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as NonNullable<typeof input.leads>;
  const groupBy = input.groupBy ?? "niche";
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const rows = leads.map((lead) => {
    const email = lead.email ?? leadgenStatusField(lead, "primary_email", "email");
    const intro = extractLeadIntro(lead) ?? leadgenStatusField(lead, "icebreaker_sentence", "personalized_intro", "icebreaker");
    const phone = lead.phone ?? leadgenStatusField(lead, "phone", "international_phone");
    const verificationStatus = (lead.verificationStatus ?? leadgenStatusField(lead, "verification_status", "verificationStatus") ?? "").toLowerCase();
    const smartleadStatus = (lead.smartleadStatus ?? lead.smartlead_status ?? leadgenStatusField(lead, "smartlead_status", "smartlead_statuses") ?? "").toLowerCase();
    const sentToSmartlead = lead.sentToSmartlead === true
      || lead.sent_to_smartlead === true
      || leadgenStatusBoolean(lead, "sent_to_smartlead", "cold_email_sent")
      || /sent|opened|replied|completed|paused/.test(smartleadStatus);
    const failed = verificationStatus === "failed" || verificationStatus === "rejected" || /bounced|blocked|unsubscribed|failed/.test(smartleadStatus);
    const verified = verificationStatus === "verified" || verificationStatus === "ok" || Boolean(lead.ico ?? lead.official_company_name ?? leadgenStatusField(lead, "ico", "official_company_name", "orsr_verified"));
    const group = leadgenStatusGroup(lead, groupBy, input.defaultNiche);
    const normalizedLead: LeadCandidateInput = {
      ...lead,
      email,
      phone,
      source: lead.source ?? input.sourceName,
      personalizedIntro: intro,
      customFields: {
        ...lead.customFields,
        leadgen_status_group: group.key,
        verification_status: verificationStatus || undefined,
        sent_to_smartlead: sentToSmartlead,
      },
    };
    return {
      lead: normalizedLead,
      group,
      email,
      intro,
      phone,
      sentToSmartlead,
      failed,
      verified,
      readyForSmartlead: Boolean(email && intro && !sentToSmartlead && !failed),
      needsEmail: Boolean(!email && !failed),
      needsIntro: Boolean(email && !intro && !failed),
      needsPhone: Boolean(email && intro && !phone && lead.website && !sentToSmartlead && !failed),
      orphan: group.key === "orphan",
    };
  });
  const groupMap = new Map<string, typeof rows>();
  for (const row of rows) {
    groupMap.set(row.group.key, [...(groupMap.get(row.group.key) ?? []), row]);
  }
  const groups: LeadgenStatusBoardPreview["groups"] = [...groupMap.entries()].map(([key, items]) => {
    const first = items[0];
    const readyLeads = items.filter((item) => item.readyForSmartlead).map((item) => item.lead);
    const needsEmailLeads = items.filter((item) => item.needsEmail).map((item) => item.lead);
    const needsIntroLeads = items.filter((item) => item.needsIntro).map((item) => item.lead);
    const needsPhoneLeads = items.filter((item) => item.needsPhone).map((item) => item.lead);
    const failedLeads = items.filter((item) => item.failed).map((item) => item.lead);
    return {
      key,
      label: first?.group.label ?? key,
      campaignId: first?.group.campaignId ?? input.defaultCampaignId,
      totals: { ...leadgenStatusTotals(items), groups: 1 },
      readyLeads,
      needsEmailLeads,
      needsIntroLeads,
      needsPhoneLeads,
      failedLeads,
    };
  }).sort((a, b) => b.totals.input - a.totals.input);
  const totals = { ...leadgenStatusTotals(rows), groups: groups.length };
  const nextToolCalls: LeadgenStatusBoardPreview["nextToolCalls"] = [];
  const needsEmailLeads = rows.filter((row) => row.needsEmail && row.lead.website).map((row) => row.lead).slice(0, maxNextCalls);
  const needsIntroLeads = rows.filter((row) => row.needsIntro).map((row) => row.lead).slice(0, maxNextCalls);
  const needsPhoneLeads = rows.filter((row) => row.needsPhone).map((row) => row.lead).slice(0, maxNextCalls);
  const failedLeads = rows.filter((row) => row.failed || row.needsEmail || row.needsIntro).map((row) => row.lead).slice(0, maxNextCalls);
  const readyLeads = rows.filter((row) => row.readyForSmartlead).map((row) => row.lead).slice(0, maxNextCalls);
  if (needsEmailLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: unique(needsEmailLeads.map((lead) => lead.website).filter((value): value is string => Boolean(value))), includePriorityPages: true, maxPages: 4, maxSites: needsEmailLeads.length },
      reason: "Leady bez emailu maju web; najprv vytiahni kontaktne udaje.",
      approvalRequired: false,
    });
  }
  if (needsIntroLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: needsIntroLeads, sourceName: input.sourceName, offer: input.offer, language: input.language ?? "sk", maxLeads: needsIntroLeads.length },
      reason: "Leady maju email, ale chyba personalizovane AI intro.",
      approvalRequired: false,
    });
  }
  if (needsPhoneLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_phone_enrichment_queue_preview",
      payload: { leads: needsPhoneLeads, sourceName: input.sourceName, maxNextCalls },
      reason: "Leady bez telefonu priprav na phone enrichment a contact-page scrape.",
      approvalRequired: false,
    });
  }
  if (failedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: failedLeads, offer: input.offer, language: input.language ?? "sk", maxNextCalls },
      reason: "Problemove leady posli do repair queue pred importom.",
      approvalRequired: false,
    });
  }
  if (readyLeads.length) {
    nextToolCalls.push(
      {
        tool: "arcigy.build_smartlead_injection_plan",
        payload: { leads: readyLeads, campaignId: input.defaultCampaignId, batchSize: Math.min(readyLeads.length, 50) },
        reason: "Ready leady priprav do Smartlead lead_list batchov bez uploadu.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.export_leads_csv",
        payload: { leads: readyLeads, columns: ["companyName", "email", "website", "phone", "personalizedIntro", "source", "leadgen_status_group"] },
        reason: "Exportuj ready leady az po kontrole operatorom.",
        approvalRequired: true,
      }
    );
  }
  const status: LeadgenStatusBoardPreview["status"] = totals.input === 0 ? "blocked" : totals.needsEmail || totals.needsIntro || totals.failed || totals.orphan ? "attention" : "ready";
  return {
    mode: "leadgen-status-board-preview",
    status,
    summary: `Leadgen status board ${status}: ${totals.input} leadov v ${groups.length} skupinach, ${totals.readyForSmartlead} ready pre Smartlead, ${totals.needsEmail} bez emailu, ${totals.needsIntro} bez intra, ${totals.sentToSmartlead} uz v Smartlead. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0, groupBy },
    totals,
    groups,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildLeadgenDbStatusPreview(input: {
  leads?: Array<LeadCandidateInput & {
    id?: string;
    raw?: Record<string, string>;
    nicheSlug?: string;
    nicheId?: string;
    nicheName?: string;
    campaignTag?: string;
    campaign_tag?: string;
    campaignId?: string | number | null;
    primary_email?: string;
    verificationStatus?: string;
    verification_status?: string;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    smartleadStatus?: string;
    smartlead_status?: string;
    ico?: string;
    official_company_name?: string;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  niches?: Array<{
    slug: string;
    name?: string;
    campaignId?: string | number | null;
    stats?: {
      total?: number;
      enriched?: number;
      inSmartlead?: number;
      in_smartlead?: number;
      sentToSmartlead?: number;
      verified?: number;
      pendingEnrich?: number;
      pending_enrich?: number;
      failed?: number;
    };
    resume?: { regionIndex?: number; region_index?: number; nextRegion?: string; updatedAt?: string };
  }>;
  resumeStates?: Array<{
    key: string;
    regionIndex?: number;
    region_index?: number;
    value?: { regionIndex?: number; region_index?: number };
    updatedAt?: string;
    updated_at?: string;
  }>;
  blacklistDomains?: string[];
  nicheFilter?: string;
  minEnrichedPercent?: number;
  minVerifiedPercent?: number;
  maxNextCalls?: number;
}): LeadgenDbStatusPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as NonNullable<typeof input.leads>;
  const minEnrichedPercent = Math.min(Math.max(Math.trunc(input.minEnrichedPercent ?? 70), 0), 100);
  const minVerifiedPercent = Math.min(Math.max(Math.trunc(input.minVerifiedPercent ?? 40), 0), 100);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const nicheFilter = input.nicheFilter ? slugify(input.nicheFilter) : undefined;
  type LeadgenDbNicheStats = {
    slug: string;
    name: string;
    campaignId?: string | number | null;
    total: number;
    enriched: number;
    inSmartlead: number;
    verified: number;
    pendingEnrich: number;
    failed: number;
    leads: LeadCandidateInput[];
    resumeRegionIndex?: number;
    nextRegion?: string;
    updatedAt?: string;
  };
  const statsBySlug = new Map<string, LeadgenDbNicheStats>();
  const getStats = (slug: string, name = slug, campaignId?: string | number | null) => {
    const key = slugify(slug) || "orphan";
    const current = statsBySlug.get(key);
    if (current) {
      if (name && current.name === key) current.name = name;
      if (campaignId !== undefined) current.campaignId = campaignId;
      return current;
    }
    const created: LeadgenDbNicheStats = { slug: key, name: name || key, campaignId, total: 0, enriched: 0, inSmartlead: 0, verified: 0, pendingEnrich: 0, failed: 0, leads: [] };
    statsBySlug.set(key, created);
    return created;
  };

  for (const niche of input.niches ?? []) {
    const stats = getStats(niche.slug, niche.name ?? niche.slug, niche.campaignId);
    const explicit = niche.stats ?? {};
    stats.total += explicit.total ?? 0;
    stats.enriched += explicit.enriched ?? 0;
    stats.inSmartlead += explicit.inSmartlead ?? explicit.in_smartlead ?? explicit.sentToSmartlead ?? 0;
    stats.verified += explicit.verified ?? 0;
    stats.pendingEnrich += explicit.pendingEnrich ?? explicit.pending_enrich ?? 0;
    stats.failed += explicit.failed ?? 0;
    stats.resumeRegionIndex = niche.resume?.regionIndex ?? niche.resume?.region_index ?? stats.resumeRegionIndex;
    stats.nextRegion = niche.resume?.nextRegion ?? stats.nextRegion;
    stats.updatedAt = niche.resume?.updatedAt ?? stats.updatedAt;
  }

  for (const lead of leads) {
    const group = leadgenStatusGroup({
      ...lead,
      campaignTag: lead.campaignTag ?? lead.campaign_tag ?? leadgenStatusField(lead, "campaign_tag"),
    }, "niche");
    const stats = getStats(group.key, stringField(lead as Record<string, unknown>, "nicheName", "niche_name") ?? group.label, group.campaignId);
    const email = lead.email ?? lead.primary_email ?? leadgenStatusField(lead, "primary_email", "email", "smartlead_email");
    const verificationStatus = (lead.verificationStatus ?? lead.verification_status ?? leadgenStatusField(lead, "verification_status", "verificationStatus") ?? "").toLowerCase();
    const smartleadStatus = (lead.smartleadStatus ?? lead.smartlead_status ?? leadgenStatusField(lead, "smartlead_status", "smartlead_statuses") ?? "").toLowerCase();
    const sent = lead.sentToSmartlead === true
      || lead.sent_to_smartlead === true
      || leadgenStatusBoolean(lead, "sent_to_smartlead", "cold_email_sent")
      || /sent|opened|replied|completed|paused/.test(smartleadStatus);
    const failed = verificationStatus === "failed" || verificationStatus === "rejected" || /bounced|blocked|unsubscribed|failed/.test(smartleadStatus);
    const verified = verificationStatus === "verified" || verificationStatus === "ok" || Boolean(lead.ico ?? lead.official_company_name ?? leadgenStatusField(lead, "ico", "official_company_name", "orsr_verified"));
    stats.total += 1;
    if (email) stats.enriched += 1;
    if (sent) stats.inSmartlead += 1;
    if (verified) stats.verified += 1;
    if (!email && !failed) stats.pendingEnrich += 1;
    if (failed) stats.failed += 1;
    stats.leads.push({ ...lead, email });
  }

  for (const state of input.resumeStates ?? []) {
    const slug = slugify(state.key.replace(/^resume[_:-]?/i, "")) || slugify(state.key);
    const stats = getStats(slug, slug);
    stats.resumeRegionIndex = state.regionIndex ?? state.region_index ?? state.value?.regionIndex ?? state.value?.region_index ?? stats.resumeRegionIndex;
    stats.updatedAt = state.updatedAt ?? state.updated_at ?? stats.updatedAt;
  }

  const blacklistDomains = unique((input.blacklistDomains ?? []).map((domain) => normalizeDomain(domain)).filter(Boolean));
  const niches = [...statsBySlug.values()]
    .filter((stats) => !nicheFilter || stats.slug === nicheFilter || slugify(stats.name) === nicheFilter)
    .map((stats) => {
      const enrichedPercent = percent(stats.enriched, stats.total);
      const smartleadPercent = percent(stats.inSmartlead, stats.total);
      const verifiedPercent = percent(stats.verified, stats.total);
      const status: LeadgenDbStatusPreview["niches"][number]["status"] = stats.total === 0
        ? "empty"
        : stats.inSmartlead >= stats.total
          ? "sent"
          : stats.pendingEnrich > 0 || enrichedPercent < minEnrichedPercent
            ? "needs_enrich"
            : verifiedPercent < minVerifiedPercent
              ? "needs_verification"
              : "ready_to_inject";
      const nextAction = status === "empty"
        ? "Spust discovery alebo import leadov pre tuto niche."
        : status === "sent"
          ? "Kampan je uz nahrata v Smartlead; sleduj replies a suppression."
          : status === "needs_enrich"
            ? "Doplni emaily/contact scrape a AI enrichment pre pending leady."
            : status === "needs_verification"
              ? "Over firmy/emaily pred Smartlead importom."
              : "Priprav Smartlead injection plan a approval payload.";
      return {
        slug: stats.slug,
        name: stats.name,
        campaignId: stats.campaignId,
        total: stats.total,
        enriched: stats.enriched,
        enrichedPercent,
        inSmartlead: stats.inSmartlead,
        smartleadPercent,
        verified: stats.verified,
        verifiedPercent,
        pendingEnrich: stats.pendingEnrich,
        failed: stats.failed,
        resumeRegionIndex: stats.resumeRegionIndex,
        nextRegion: stats.nextRegion,
        updatedAt: stats.updatedAt,
        status,
        nextAction,
      };
    })
    .sort((a, b) => b.total - a.total || a.slug.localeCompare(b.slug));

  const totals = {
    niches: niches.length,
    totalLeads: sum(niches.map((niche) => niche.total)),
    enriched: sum(niches.map((niche) => niche.enriched)),
    inSmartlead: sum(niches.map((niche) => niche.inSmartlead)),
    verified: sum(niches.map((niche) => niche.verified)),
    pendingEnrich: sum(niches.map((niche) => niche.pendingEnrich)),
    failed: sum(niches.map((niche) => niche.failed)),
    blacklistDomains: blacklistDomains.length,
    resumeStates: input.resumeStates?.length ?? niches.filter((niche) => niche.resumeRegionIndex !== undefined).length,
    avgEnrichedPercent: percent(sum(niches.map((niche) => niche.enriched)), sum(niches.map((niche) => niche.total))),
    avgVerifiedPercent: percent(sum(niches.map((niche) => niche.verified)), sum(niches.map((niche) => niche.total))),
  };

  const nextToolCalls: LeadgenDbStatusPreview["nextToolCalls"] = [];
  const attentionNiches = niches.filter((niche) => niche.status === "needs_enrich" || niche.status === "needs_verification" || niche.status === "empty").slice(0, maxNextCalls);
  const readyNiches = niches.filter((niche) => niche.status === "ready_to_inject").slice(0, maxNextCalls);
  if (attentionNiches.length) {
    nextToolCalls.push({
      tool: "arcigy.build_leadgen_execution_queue_preview",
      payload: { niches: attentionNiches.map((niche) => ({ slug: niche.slug, name: niche.name, campaignId: niche.campaignId, currentRegionIndex: niche.resumeRegionIndex })), maxNiches: attentionNiches.length },
      reason: "Niche s pending enrichment alebo prazdnym stavom priprav na dalsi scrape/discovery beh.",
      approvalRequired: false,
    });
  }
  if (niches.some((niche) => niche.status === "needs_verification")) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_validation_scorecard_preview",
      payload: { leads: leads.slice(0, maxNextCalls) },
      reason: "Pred Smartleadom skontroluj scorecard a verification status pre problemove leady.",
      approvalRequired: false,
    });
  }
  if (readyNiches.length) {
    const readyLeads = readyNiches.flatMap((niche) => statsBySlug.get(niche.slug)?.leads ?? []).filter((lead) => lead.email).slice(0, maxNextCalls);
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { leads: readyLeads, campaignId: readyNiches[0]?.campaignId, batchSize: Math.min(Math.max(readyLeads.length, 1), 50) },
      reason: "Niche ready_to_inject maju emaily a verifikaciu; priprav Smartlead batch bez uploadu.",
      approvalRequired: false,
    });
  }
  if (leads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_leadgen_status_board_preview",
      payload: { leads: leads.slice(0, maxNextCalls), sourceName: input.sourceName, groupBy: "niche" },
      reason: "Otvor detailny per-lead status board pre repair, AI intra a Smartlead next kroky.",
      approvalRequired: false,
    });
  }

  const status: LeadgenDbStatusPreview["status"] = totals.niches === 0 ? "blocked" : niches.some((niche) => niche.status === "needs_enrich" || niche.status === "needs_verification" || niche.status === "empty") ? "attention" : "ready";
  return {
    mode: "leadgen-db-status-preview",
    status,
    summary: `Leadgen DB status ${status}: ${totals.totalLeads} leadov v ${totals.niches} niches, ${totals.enriched} enriched, ${totals.inSmartlead} v Smartlead, ${totals.verified} verified, ${totals.pendingEnrich} pending enrich, ${totals.blacklistDomains} blacklist domen. Ziadny DB zapis ani upload neprebehol.`,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0, nicheFilter: input.nicheFilter },
    totals,
    niches,
    resumeStates: (input.resumeStates ?? []).map((state) => ({
      key: state.key,
      regionIndex: state.regionIndex ?? state.region_index ?? state.value?.regionIndex ?? state.value?.region_index,
      updatedAt: state.updatedAt ?? state.updated_at,
    })),
    blacklistDomains,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildLeadgenProgressWatchdogPreview(input: {
  leads?: Array<LeadCandidateInput & {
    raw?: Record<string, string>;
    primary_email?: string;
    decisionMakerName?: string;
    decision_maker_name?: string;
    personalized_intro?: string;
    icebreaker_sentence?: string;
    verificationStatus?: string;
    verification_status?: string;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    campaignTag?: string;
    campaign_tag?: string;
    nicheSlug?: string;
    niche_slug?: string;
    scraped?: { emails?: string[]; phones?: string[]; textPreview?: string };
    address?: string;
    official_company_name?: string;
    ico?: string;
    verification_notes?: string;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  groupBy?: "campaign" | "niche" | "source";
  targetReadyLeads?: number;
  minCompletionPercent?: number;
  includeSmartleadPlan?: boolean;
  maxNextCalls?: number;
}): LeadgenProgressWatchdogPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as NonNullable<typeof input.leads>;
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const groupBy = input.groupBy ?? "campaign";
  const targetReadyLeads = Math.max(Math.trunc(input.targetReadyLeads ?? 0), 0);
  const minCompletionPercent = Math.min(Math.max(Math.trunc(input.minCompletionPercent ?? 80), 0), 100);

  const emailFor = (lead: NonNullable<typeof input.leads>[number]) => lead.email ?? lead.primary_email ?? leadgenStatusField(lead, "email", "primary_email", "smartlead_emails");
  const websiteFor = (lead: NonNullable<typeof input.leads>[number]) => lead.website ?? leadgenStatusField(lead, "website", "web", "url");
  const decisionMakerFor = (lead: NonNullable<typeof input.leads>[number]) => lead.decisionMakerName ?? lead.decision_maker_name ?? leadgenStatusField(lead, "decision_maker_name", "decisionMakerName", "contact_name", "full_name");
  const introFor = (lead: NonNullable<typeof input.leads>[number]) => lead.personalizedIntro ?? lead.personalized_intro ?? lead.icebreaker_sentence ?? leadgenStatusField(lead, "personalized_intro", "icebreaker_sentence", "icebreaker");
  const verifiedFor = (lead: NonNullable<typeof input.leads>[number]) => /verified|ready|ok/i.test(String(lead.verificationStatus ?? lead.verification_status ?? leadgenStatusField(lead, "verification_status", "status") ?? ""));
  const failedFor = (lead: NonNullable<typeof input.leads>[number]) => /failed|error|rejected|invalid/i.test(String(lead.verificationStatus ?? lead.verification_status ?? leadgenStatusField(lead, "verification_status", "status") ?? ""));
  const sentFor = (lead: NonNullable<typeof input.leads>[number]) => lead.sentToSmartlead === true || lead.sent_to_smartlead === true || /true|sent|uploaded/i.test(String(leadgenStatusField(lead, "sent_to_smartlead", "sentToSmartlead", "smartlead_status") ?? ""));
  const scrapedFor = (lead: NonNullable<typeof input.leads>[number]) => Boolean(
    lead.scraped?.textPreview ||
    lead.scraped?.emails?.length ||
    lead.scraped?.phones?.length ||
    lead.address ||
    lead.official_company_name ||
    lead.ico ||
    leadgenStatusField(lead, "address", "official_company_name", "ico", "scraped_text", "context_preview")
  );
  const readyForSmartlead = (lead: NonNullable<typeof input.leads>[number]) =>
    Boolean(emailFor(lead) && introFor(lead) && !failedFor(lead) && !sentFor(lead));
  const leadCompletion = (lead: NonNullable<typeof input.leads>[number]) => {
    const milestones = [
      scrapedFor(lead),
      Boolean(emailFor(lead)),
      Boolean(decisionMakerFor(lead)),
      Boolean(introFor(lead)),
      verifiedFor(lead) || readyForSmartlead(lead),
      sentFor(lead),
    ];
    return percent(milestones.filter(Boolean).length, milestones.length);
  };

  const needsScrape = leads.filter((lead) => websiteFor(lead) && !scrapedFor(lead)).slice(0, maxNextCalls);
  const missingEmail = leads.filter((lead) => !emailFor(lead) && !failedFor(lead)).slice(0, maxNextCalls);
  const missingDecisionMaker = leads.filter((lead) => emailFor(lead) && !decisionMakerFor(lead) && !failedFor(lead)).slice(0, maxNextCalls);
  const missingIntro = leads.filter((lead) => emailFor(lead) && !introFor(lead) && !failedFor(lead)).slice(0, maxNextCalls);
  const needsVerification = leads.filter((lead) => emailFor(lead) && introFor(lead) && !verifiedFor(lead) && !failedFor(lead) && !sentFor(lead)).slice(0, maxNextCalls);
  const ready = leads.filter((lead) => readyForSmartlead(lead)).slice(0, maxNextCalls);
  const failed = leads.filter((lead) => failedFor(lead)).slice(0, maxNextCalls);
  const sent = leads.filter((lead) => sentFor(lead)).length;
  const total = leads.length;
  const completionScores = leads.map((lead) => leadCompletion(lead));
  const completionPercent = completionScores.length ? Math.round(sum(completionScores) / completionScores.length) : 0;

  const groupKeyFor = (lead: NonNullable<typeof input.leads>[number]) => {
    if (groupBy === "niche") return lead.nicheSlug ?? lead.niche_slug ?? leadgenStatusField(lead, "niche_slug", "niche", "niche_id") ?? "unknown-niche";
    if (groupBy === "source") return lead.source ?? leadgenStatusField(lead, "source", "source_name") ?? input.sourceName ?? "unknown-source";
    return lead.campaignTag ?? lead.campaign_tag ?? leadgenStatusField(lead, "campaign_tag", "campaign", "campaign_id") ?? "unknown-campaign";
  };
  const grouped = new Map<string, NonNullable<typeof input.leads>>();
  for (const lead of leads) {
    const key = String(groupKeyFor(lead));
    grouped.set(key, [...(grouped.get(key) ?? []), lead]);
  }
  const groups = [...grouped.entries()].map(([key, rows]) => {
    const rowScores = rows.map((lead) => leadCompletion(lead));
    const groupReady = rows.filter((lead) => readyForSmartlead(lead)).length;
    const groupSent = rows.filter((lead) => sentFor(lead)).length;
    const groupFailed = rows.filter((lead) => failedFor(lead)).length;
    const missingEmailCount = rows.filter((lead) => !emailFor(lead) && !failedFor(lead)).length;
    const missingIntroCount = rows.filter((lead) => emailFor(lead) && !introFor(lead) && !failedFor(lead)).length;
    const needsScrapeCount = rows.filter((lead) => websiteFor(lead) && !scrapedFor(lead)).length;
    const bottleneck = groupFailed
      ? "failed"
      : missingEmailCount
        ? "missing_email"
        : missingIntroCount
          ? "missing_intro"
          : needsScrapeCount
            ? "needs_scrape"
            : groupReady
              ? "ready_for_smartlead"
              : "monitor";
    const nextAction = bottleneck === "failed"
      ? "Repair failed leads before counting this group ready."
      : bottleneck === "missing_email"
        ? "Run company research/contact scrape for missing emails."
        : bottleneck === "missing_intro"
          ? "Build AI intro work packet for missing intros."
          : bottleneck === "needs_scrape"
            ? "Scrape websites before enrichment and intro generation."
            : bottleneck === "ready_for_smartlead"
              ? "Prepare Smartlead injection/import audit for ready leads."
              : "Monitor replies and campaign status.";
    return {
      key,
      label: key,
      total: rows.length,
      completionPercent: rowScores.length ? Math.round(sum(rowScores) / rowScores.length) : 0,
      readyForSmartlead: groupReady,
      sentToSmartlead: groupSent,
      failed: groupFailed,
      bottleneck,
      nextAction,
    };
  }).sort((a, b) => a.completionPercent - b.completionPercent || b.total - a.total);

  const bottlenecks = [
    { id: "failed", label: "Failed leads", count: failed.length, severity: "critical" as const, nextAction: "Run lead repair queue and inspect latest verification notes." },
    { id: "missing_email", label: "Missing email", count: missingEmail.length, severity: "critical" as const, nextAction: "Run company research and website/contact scraping." },
    { id: "missing_intro", label: "Missing AI intro", count: missingIntro.length, severity: "warning" as const, nextAction: "Build AI intro work packets or batch draft intros." },
    { id: "missing_decision_maker", label: "Missing decision maker", count: missingDecisionMaker.length, severity: "warning" as const, nextAction: "Run Gmail name enrichment and identity repair." },
    { id: "needs_verification", label: "Needs QA/verification", count: needsVerification.length, severity: "warning" as const, nextAction: "Run lead validation scorecard before upload." },
    { id: "ready_for_smartlead", label: "Ready for Smartlead", count: ready.length, severity: "info" as const, nextAction: "Prepare Smartlead injection/import audit." },
  ].filter((item) => item.count > 0);

  const nextToolCalls: LeadgenProgressWatchdogPreview["nextToolCalls"] = [];
  if (leads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_leadgen_status_board_preview",
      payload: { leads: leads.slice(0, maxNextCalls), sourceName: input.sourceName, groupBy },
      reason: "Otvor detailny status board pre vsetky leady a repair buckets.",
      approvalRequired: false,
    });
  }
  if (needsScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { websites: needsScrape.map((lead) => websiteFor(lead)).filter(Boolean).slice(0, maxNextCalls), maxSites: Math.min(needsScrape.length, maxNextCalls) },
      reason: "Scrapni weby, ktore maju URL, ale este nemaju enrichment/scrape data.",
      approvalRequired: false,
    });
  }
  if (missingEmail.length) {
    nextToolCalls.push({
      tool: "arcigy.build_company_research_queue_preview",
      payload: { leads: missingEmail, sourceName: input.sourceName, includeGooglePlaces: true, includeSerper: true, includeDispatch: true },
      reason: "Najdi email/web pre leady bez kontaktu.",
      approvalRequired: false,
    });
  }
  if (missingDecisionMaker.length) {
    nextToolCalls.push({
      tool: "arcigy.build_gmail_name_enrichment_queue_preview",
      payload: { leads: missingDecisionMaker, sourceName: input.sourceName },
      reason: "Dopln decision-maker mena cez Gmail/public hints pred salutation a intro cleanup.",
      approvalRequired: false,
    });
  }
  if (missingIntro.length) {
    nextToolCalls.push({
      tool: "arcigy.build_bulk_ai_intro_work_queue_preview",
      payload: { groups: [{ sourceName: input.sourceName ?? "progress-watchdog", niche: groupBy, leads: missingIntro }], language: "sk" },
      reason: "Priprav AI work packet pre chybajuce intra.",
      approvalRequired: false,
    });
  }
  if (needsVerification.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_validation_scorecard_preview",
      payload: { leads: needsVerification, minScore: 70, excludeSent: true },
      reason: "Skontroluj ready-looking leady pred uploadom do Smartlead.",
      approvalRequired: false,
    });
  }
  if (input.includeSmartleadPlan !== false && ready.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { leads: ready, campaignId: undefined, batchSize: Math.min(ready.length, 50) },
      reason: "Priprav approval-gated Smartlead upload payload pre ready leady bez uploadu.",
      approvalRequired: false,
    });
  }
  if (failed.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: failed, sourceName: input.sourceName },
      reason: "Oprav failed leady a vrat ich do enrichment/QA queue.",
      approvalRequired: false,
    });
  }

  const totals = {
    inputLeads: total,
    scraped: leads.filter((lead) => scrapedFor(lead)).length,
    withEmail: leads.filter((lead) => emailFor(lead)).length,
    withDecisionMaker: leads.filter((lead) => decisionMakerFor(lead)).length,
    withIntro: leads.filter((lead) => introFor(lead)).length,
    verified: leads.filter((lead) => verifiedFor(lead)).length,
    readyForSmartlead: ready.length,
    sentToSmartlead: sent,
    failed: failed.length,
    remaining: Math.max(total - sent, 0),
    completionPercent,
    enrichmentPercent: percent(leads.filter((lead) => scrapedFor(lead)).length, total),
    emailPercent: percent(leads.filter((lead) => emailFor(lead)).length, total),
    introPercent: percent(leads.filter((lead) => introFor(lead)).length, total),
    smartleadPercent: percent(sent, total),
  };
  const warnings: string[] = [];
  if (!total) warnings.push("No leads supplied; export DB/CSV first.");
  if (targetReadyLeads && totals.readyForSmartlead < targetReadyLeads) warnings.push(`Ready leads below target: ${totals.readyForSmartlead}/${targetReadyLeads}.`);
  if (totals.completionPercent < minCompletionPercent && total) warnings.push(`Completion below target: ${totals.completionPercent}%/${minCompletionPercent}%.`);
  const status: LeadgenProgressWatchdogPreview["status"] = !total
    ? "blocked"
    : totals.failed || totals.readyForSmartlead || totals.completionPercent < minCompletionPercent || warnings.length
      ? "attention"
      : "ready";
  const topBottleneck = bottlenecks.find((item) => item.id !== "ready_for_smartlead") ?? bottlenecks[0];
  const operatorBrief = [
    `Leadgen je na ${totals.completionPercent}%.`,
    `${totals.sentToSmartlead}/${totals.inputLeads} leadov je v Smartlead (${totals.smartleadPercent}%).`,
    `${totals.readyForSmartlead} leadov je pripravenych na upload.`,
    topBottleneck ? `Najvacsi bottleneck: ${topBottleneck.label} (${topBottleneck.count}).` : "Bez vacsieho bottlenecku.",
    "Ziadny scrape, AI call, DB zapis ani Smartlead upload neprebehol.",
  ].join(" ");

  return {
    mode: "leadgen-progress-watchdog-preview",
    status,
    summary: `Leadgen progress ${status}: ${totals.completionPercent}% complete, ${totals.readyForSmartlead} ready, ${totals.sentToSmartlead} sent, ${totals.failed} failed, ${totals.remaining} remaining. Ziadny zapis ani upload neprebehol.`,
    operatorBrief,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0, groupBy, generatedAt: new Date().toISOString() },
    totals,
    groups,
    bottlenecks,
    queues: { needsScrape, missingEmail, missingDecisionMaker, missingIntro, needsVerification, readyForSmartlead: ready, failed },
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildLeadgenTargetBackfillPreview(input: {
  leads?: Array<LeadCandidateInput & {
    id?: string | number;
    raw?: Record<string, string>;
    primary_email?: string;
    decisionMakerName?: string;
    decision_maker_name?: string;
    personalized_intro?: string;
    icebreaker_sentence?: string;
    verificationStatus?: string;
    verification_status?: string;
    verificationUpdatedAt?: string;
    verification_updated_at?: string;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    official_company_name?: string;
    ico?: string;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  niche?: string;
  offer?: string;
  language?: "sk" | "en";
  minReadyLeads?: number;
  retryFailedAfterHours?: number;
  includeSmartleadAudit?: boolean;
  maxQueueItems?: number;
  maxNextCalls?: number;
}): LeadgenTargetBackfillPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as NonNullable<typeof input.leads>;
  const language = input.language ?? "sk";
  const minReadyLeads = Math.max(Math.trunc(input.minReadyLeads ?? 50), 0);
  const retryFailedAfterHours = Math.max(Math.trunc(input.retryFailedAfterHours ?? 24), 1);
  const maxQueueItems = Math.min(Math.max(Math.trunc(input.maxQueueItems ?? 50), 1), 200);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const nowMs = Date.now();

  const emailFor = (lead: NonNullable<typeof input.leads>[number]) => lead.email ?? lead.primary_email ?? leadgenStatusField(lead, "email", "primary_email", "smartlead_email");
  const websiteFor = (lead: NonNullable<typeof input.leads>[number]) => lead.website ?? leadgenStatusField(lead, "website", "web", "url");
  const decisionMakerFor = (lead: NonNullable<typeof input.leads>[number]) => lead.decisionMakerName ?? lead.decision_maker_name ?? leadgenStatusField(lead, "decision_maker_name", "decisionMakerName", "contact_name", "full_name");
  const introFor = (lead: NonNullable<typeof input.leads>[number]) => lead.personalizedIntro ?? lead.personalized_intro ?? lead.icebreaker_sentence ?? leadgenStatusField(lead, "personalized_intro", "icebreaker_sentence", "icebreaker");
  const icoFor = (lead: NonNullable<typeof input.leads>[number]) => lead.ico ?? leadgenStatusField(lead, "ico", "ICO");
  const officialNameFor = (lead: NonNullable<typeof input.leads>[number]) => lead.official_company_name ?? leadgenStatusField(lead, "official_company_name", "officialCompanyName");
  const statusFor = (lead: NonNullable<typeof input.leads>[number]) => String(lead.verificationStatus ?? lead.verification_status ?? leadgenStatusField(lead, "verification_status", "status") ?? "").toLowerCase();
  const sentFor = (lead: NonNullable<typeof input.leads>[number]) => lead.sentToSmartlead === true || lead.sent_to_smartlead === true || /true|sent|uploaded|opened|replied/i.test(String(leadgenStatusField(lead, "sent_to_smartlead", "sentToSmartlead", "smartlead_status") ?? ""));
  const failedFor = (lead: NonNullable<typeof input.leads>[number]) => /failed|error|rejected|timeout|invalid/.test(statusFor(lead));
  const retryAgeOk = (lead: NonNullable<typeof input.leads>[number]) => {
    const rawDate = lead.verificationUpdatedAt ?? lead.verification_updated_at ?? leadgenStatusField(lead, "verification_updated_at", "updated_at", "updatedAt");
    if (!rawDate) return true;
    const parsedDate = Date.parse(rawDate);
    if (!Number.isFinite(parsedDate)) return true;
    return nowMs - parsedDate >= retryFailedAfterHours * 60 * 60 * 1000;
  };
  const readyLead = (lead: NonNullable<typeof input.leads>[number]) => Boolean(emailFor(lead) && introFor(lead) && !failedFor(lead) && !sentFor(lead));

  const missingEmail = leads.filter((lead) => !emailFor(lead) && !failedFor(lead)).slice(0, maxQueueItems);
  const missingDecisionMaker = leads.filter((lead) => emailFor(lead) && !decisionMakerFor(lead) && !failedFor(lead)).slice(0, maxQueueItems);
  const missingIntro = leads.filter((lead) => emailFor(lead) && !introFor(lead) && !failedFor(lead)).slice(0, maxQueueItems);
  const missingOrsrName = leads.filter((lead) => icoFor(lead) && !decisionMakerFor(lead) && !officialNameFor(lead) && !failedFor(lead)).slice(0, maxQueueItems);
  const retryVerification = leads.filter((lead) => failedFor(lead) && retryAgeOk(lead)).slice(0, maxQueueItems);
  const readyForSmartlead = leads.filter((lead) => readyLead(lead)).slice(0, maxQueueItems);
  const readyLeads = leads.filter((lead) => readyLead(lead)).length;
  const readyPercent = minReadyLeads > 0 ? percent(readyLeads, minReadyLeads) : percent(readyLeads, leads.length);

  const nextToolCalls: LeadgenTargetBackfillPreview["nextToolCalls"] = [];
  if (missingEmail.length) {
    const scrapeLeads = missingEmail.filter((lead) => websiteFor(lead)).slice(0, maxQueueItems);
    if (scrapeLeads.length) {
      nextToolCalls.push({
        tool: "arcigy.batch_scrape_website_contacts",
        payload: { leads: scrapeLeads, maxPagesPerSite: 4 },
        reason: "Dopln emaily a kontakty z webov pred AI intro a Smartlead importom.",
        approvalRequired: false,
      });
    }
    nextToolCalls.push({
      tool: "arcigy.build_company_research_queue_preview",
      payload: { leads: missingEmail, sourceName: input.sourceName, niche: input.niche ? { name: input.niche } : undefined, includeGooglePlaces: true, includeSerper: true, includeFetch: true, includeDispatch: true },
      reason: "Dohladaj firmy bez emailu cez Google Places/Serper/fetch a priprav dispatch queue.",
      approvalRequired: false,
    });
  }
  if (missingOrsrName.length || missingDecisionMaker.length) {
    nextToolCalls.push({
      tool: "arcigy.build_slovak_register_batch_preview",
      payload: { leads: [...missingOrsrName, ...missingDecisionMaker].slice(0, maxQueueItems), sourceName: input.sourceName, offer: input.offer, language },
      reason: "Dopln ORSR/konatela pre leady s ICO alebo firmou, ktore nemaju decision maker meno.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_gmail_name_enrichment_queue_preview",
      payload: { leads: missingDecisionMaker, sourceName: input.sourceName, includeSmartleadPreview: true },
      reason: "Skus doplnit meno z emailovej adresy, ked ORSR nema jasny vysledok.",
      approvalRequired: false,
    });
  }
  if (missingIntro.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: missingIntro, sourceName: input.sourceName, niche: input.niche, offer: input.offer, language, maxLeads: maxQueueItems },
      reason: "Priprav AI work packet pre chybajuce icebreakery/personalizovane intra.",
      approvalRequired: false,
    });
  }
  if (retryVerification.length) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: retryVerification, sourceName: input.sourceName, includeRegisterBatch: true, includeScrapeRecovery: true },
      reason: "Znova oprav failed/rejected leady po retry okne.",
      approvalRequired: false,
    });
  }
  if (readyForSmartlead.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_import_audit_preview",
      payload: { leads: readyForSmartlead, sourceName: input.sourceName, requirePersonalizedIntro: true },
      reason: "Skontroluj ready leady pred akymkolvek Smartlead uploadom.",
      approvalRequired: false,
    });
    if (input.includeSmartleadAudit !== false) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_send_readiness_queue_preview",
        payload: { campaigns: [{ name: input.niche ?? input.sourceName ?? "leadgen-backfill", leads: readyForSmartlead }] },
        reason: "Over batch readiness, QA a approval payload pred odoslanim do Smartleadu.",
        approvalRequired: false,
      });
    }
  }

  const targets = {
    readyLeads,
    minReadyLeads,
    readyPercent,
    missingEmail: missingEmail.length,
    missingDecisionMaker: missingDecisionMaker.length,
    missingIntro: missingIntro.length,
    missingOrsrName: missingOrsrName.length,
    retryVerification: retryVerification.length,
    readyForSmartlead: readyForSmartlead.length,
  };
  const warnings: string[] = [];
  if (!leads.length) warnings.push("No leads supplied; pass DB export, CSV, or lead rows.");
  if (minReadyLeads > 0 && readyLeads < minReadyLeads) warnings.push(`Ready target not reached: ${readyLeads}/${minReadyLeads}.`);
  const status: LeadgenTargetBackfillPreview["status"] = !leads.length
    ? "blocked"
    : targets.missingEmail || targets.missingDecisionMaker || targets.missingIntro || targets.missingOrsrName || targets.retryVerification || (minReadyLeads > 0 && readyLeads < minReadyLeads)
      ? "attention"
      : "ready";
  return {
    mode: "leadgen-target-backfill-preview",
    status,
    summary: `Leadgen target backfill ${status}: ${readyLeads}/${minReadyLeads || leads.length} ready, ${missingEmail.length} bez emailu, ${missingDecisionMaker.length} bez mena, ${missingIntro.length} bez AI intra, ${missingOrsrName.length} ORSR meno chyba, ${retryVerification.length} retry verification. Ziadny zapis ani upload neprebehol.`,
    operatorBrief: `Backfill: ready ${readyLeads}/${minReadyLeads || leads.length}. Najprv ries ${missingEmail.length} email/scrape, potom ${missingDecisionMaker.length} mena/ORSR, ${missingIntro.length} AI intra a az potom ${readyForSmartlead.length} leadov posli cez Smartlead audit.`,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0, generatedAt: new Date().toISOString() },
    targets,
    queues: { missingEmail, missingDecisionMaker, missingIntro, missingOrsrName, retryVerification, readyForSmartlead },
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildLeadgenMaintenanceRunbookPreview(input: {
  leads?: Array<LeadCandidateInput & {
    raw?: Record<string, string>;
    primary_email?: string;
    companyNameShort?: string;
    company_name_short?: string;
    official_company_name?: string;
    ico?: string;
    personalized_intro?: string;
    icebreaker_sentence?: string;
    verificationStatus?: string;
    verification_status?: string;
    campaignTag?: string;
    campaign_tag?: string;
    campaignId?: string | number | null;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
  }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  niches?: Parameters<typeof buildLeadgenDbStatusPreview>[0]["niches"];
  resumeStates?: Parameters<typeof buildLeadgenDbStatusPreview>[0]["resumeStates"];
  blacklistDomains?: string[];
  campaigns?: Array<{
    id?: string | number;
    name?: string;
    nicheSlug?: string;
    campaignId?: string | number;
    status?: string;
    localLeadCount?: number;
    remoteLeadCount?: number;
    missingInSmartlead?: number;
    customFieldDrift?: number;
    sequenceUsesCompanyName?: boolean;
    webhookMissing?: boolean;
    deliverabilityIssue?: boolean;
  }>;
  gmailAccounts?: Array<{ accountEnvKey?: string; email?: string; labelName?: string; labelReady?: boolean; unreadLeadReplies?: number }>;
  includeSmartleadSync?: boolean;
  includeGmailLabelSetup?: boolean;
  includeGoogleSheetSync?: boolean;
  maxNextCalls?: number;
}): LeadgenMaintenanceRunbookPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])] as NonNullable<typeof input.leads>;
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const dbStatus = buildLeadgenDbStatusPreview({
    leads,
    niches: input.niches,
    resumeStates: input.resumeStates,
    blacklistDomains: input.blacklistDomains,
    sourceName: input.sourceName,
    delimiter: input.delimiter,
    maxNextCalls,
  });

  const emailFor = (lead: LeadCandidateInput & { primary_email?: string }) => lead.email ?? lead.primary_email ?? leadgenStatusField(lead, "email", "primary_email", "smartlead_emails");
  const introFor = (lead: LeadCandidateInput & { personalized_intro?: string; icebreaker_sentence?: string }) =>
    lead.personalizedIntro ?? lead.personalized_intro ?? lead.icebreaker_sentence ?? leadgenStatusField(lead, "personalized_intro", "icebreaker_sentence", "icebreaker");
  const companyShortFor = (lead: LeadCandidateInput & { companyNameShort?: string; company_name_short?: string; official_company_name?: string }) =>
    lead.companyNameShort ?? lead.company_name_short ?? lead.customFields?.company_name_short ?? leadgenStatusField(lead, "company_name_short");
  const icoFor = (lead: LeadCandidateInput & { ico?: string }) => lead.ico ?? leadgenStatusField(lead, "ico");
  const missingEmail = leads.filter((lead) => !emailFor(lead)).slice(0, maxNextCalls);
  const missingIntro = leads.filter((lead) => !introFor(lead)).slice(0, maxNextCalls);
  const companyShort = leads.filter((lead) => !companyShortFor(lead) && (lead.companyName || lead.official_company_name || leadgenStatusField(lead, "company_name", "official_company_name", "original_name"))).slice(0, maxNextCalls);
  const ico = leads.filter((lead) => !icoFor(lead) && !/(failed|rejected)/i.test(lead.verificationStatus ?? lead.verification_status ?? leadgenStatusField(lead, "verification_status") ?? "")).slice(0, maxNextCalls);
  const badIntro = leads.filter((lead) => {
    const intro = introFor(lead);
    return introQualityIssues(intro, importantIntroTerms(introEvidenceText(lead)), 0, lead).some((issue) => issue !== "missing_intro");
  }).slice(0, maxNextCalls);

  const campaigns = (input.campaigns ?? []).map((campaign) => {
    const issues: string[] = [];
    const localCount = campaign.localLeadCount ?? 0;
    const remoteCount = campaign.remoteLeadCount ?? 0;
    if ((campaign.missingInSmartlead ?? 0) > 0 || localCount > remoteCount) issues.push("missing_remote_leads");
    if ((campaign.customFieldDrift ?? 0) > 0) issues.push("custom_field_drift");
    if (campaign.sequenceUsesCompanyName) issues.push("sequence_uses_company_name");
    if (campaign.webhookMissing) issues.push("webhook_missing");
    if (campaign.deliverabilityIssue) issues.push("deliverability_attention");
    const nextAction = issues.includes("sequence_uses_company_name")
      ? "Repair sequence variables before more sends."
      : issues.includes("custom_field_drift") || issues.includes("missing_remote_leads")
        ? "Run Smartlead sync/reconciliation before uploading more leads."
        : issues.includes("webhook_missing")
          ? "Audit and upsert Smartlead reply webhook after approval."
          : issues.includes("deliverability_attention")
            ? "Run deliverability guard and reduce/pause if needed."
            : "Campaign looks stable; continue reply monitoring.";
    return {
      id: campaign.id ?? campaign.campaignId,
      name: campaign.name,
      nicheSlug: campaign.nicheSlug,
      status: campaign.status,
      localLeadCount: campaign.localLeadCount,
      remoteLeadCount: campaign.remoteLeadCount,
      issues,
      nextAction,
    };
  });
  const smartleadSyncIssues = campaigns.filter((campaign) => campaign.issues.length).length;
  const gmailLabels = (input.gmailAccounts ?? []).map((account) => {
    const labelName = account.labelName?.trim() || "COLD-OUTREACH";
    const ready = account.labelReady === true;
    return {
      accountEnvKey: account.accountEnvKey,
      email: account.email,
      labelName,
      ready,
      nextAction: ready ? "Label exists; continue Gmail sync/triage." : "Create/apply label through label_gmail_thread on a real thread or configure Gmail labels manually.",
    };
  });
  const gmailLabelIssues = gmailLabels.filter((account) => !account.ready).length;

  const nextToolCalls: LeadgenMaintenanceRunbookPreview["nextToolCalls"] = [
    ...dbStatus.nextToolCalls.slice(0, maxNextCalls),
  ];
  if (missingEmail.length) {
    nextToolCalls.push({
      tool: "arcigy.build_phone_enrichment_queue_preview",
      payload: { leads: missingEmail, sourceName: input.sourceName, includeCsvExport: true },
      reason: "Leady bez emailu casto potrebuju website/contact scrape a telefon fallback pred manualnym outreachom.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_company_research_queue_preview",
      payload: { leads: missingEmail, sourceName: input.sourceName, includeGooglePlaces: true, includeSerper: true, includeDispatch: true },
      reason: "Dohladaj web/email pre incomplete leady pred AI intro a Smartlead.",
      approvalRequired: false,
    });
  }
  if (missingIntro.length || badIntro.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_cleanup_preview",
      payload: { leads: [...missingIntro, ...badIntro].slice(0, maxNextCalls), language: "sk" },
      reason: "Oprav intra s pozdravom, placeholdermi alebo generickym textom pred Smartleadom.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_bulk_ai_intro_work_queue_preview",
      payload: { groups: [{ sourceName: input.sourceName ?? "maintenance", niche: "maintenance-repair", leads: missingIntro.slice(0, maxNextCalls) }], language: "sk" },
      reason: "Chybajuce intra posli do AI work packetov pre ChatGPT/Claude.",
      approvalRequired: false,
    });
  }
  if (companyShort.length) {
    nextToolCalls.push({
      tool: "arcigy.build_company_short_name_preview",
      payload: { leads: companyShort },
      reason: "Dopln company_name_short pred subject variables a Smartlead custom fields.",
      approvalRequired: false,
    });
  }
  if (ico.length) {
    nextToolCalls.push({
      tool: "arcigy.build_slovak_register_batch_preview",
      payload: { sourceName: input.sourceName, leads: ico },
      reason: "Dopln ICO/official company name pre leady, ktore este nie su overene.",
      approvalRequired: false,
    });
  }
  if (input.includeSmartleadSync !== false && smartleadSyncIssues) {
    for (const campaign of campaigns.filter((item) => item.issues.length).slice(0, Math.min(5, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_safe_sync_runbook_preview",
        payload: { campaignId: campaign.id, campaignName: campaign.name, localLeads: [], remoteLeads: [] },
        reason: `Safe sync runbook pre kampan ${campaign.name ?? campaign.id}: ${campaign.issues.join(", ")}.`,
        approvalRequired: false,
      });
      if (campaign.issues.includes("sequence_uses_company_name")) {
        nextToolCalls.push({
          tool: "arcigy.build_smartlead_sequence_variable_repair_preview",
          payload: { campaignId: campaign.id, sequences: [] },
          reason: "Subjecty pouzivaju company_name; oprav na company_name_short pred dalsim launchom.",
          approvalRequired: false,
        });
      }
      if (campaign.issues.includes("webhook_missing")) {
        nextToolCalls.push({
          tool: "arcigy.get_smartlead_campaign_webhooks",
          payload: { campaignId: campaign.id },
          reason: "Najprv precitaj webhooky, az potom priprav approval-gated upsert.",
          approvalRequired: false,
        });
      }
    }
  }
  if (input.includeGoogleSheetSync && leads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_google_sheet_sync_preview",
      payload: { leads: leads.slice(0, maxNextCalls), sourceName: input.sourceName },
      reason: "Priprav operator review sheet pre maintenance batch bez zapisu.",
      approvalRequired: false,
    });
  }
  if (input.includeGmailLabelSetup !== false && gmailLabelIssues) {
    for (const account of gmailLabels.filter((item) => !item.ready).slice(0, Math.min(5, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.get_gmail_unread_triage",
        payload: { accountEnvKeys: account.accountEnvKey ? [account.accountEnvKey] : undefined, query: "in:inbox newer_than:14d" },
        reason: `Najdi realny thread pre account ${account.email ?? account.accountEnvKey ?? "gmail"} pred label setupom ${account.labelName}.`,
        approvalRequired: false,
      });
    }
  }

  const totals = {
    inputLeads: leads.length,
    niches: dbStatus.totals.niches,
    pendingEnrich: dbStatus.totals.pendingEnrich,
    missingEmail: missingEmail.length,
    missingIntro: missingIntro.length,
    missingCompanyShort: companyShort.length,
    missingIco: ico.length,
    badIntro: badIntro.length,
    smartleadSyncIssues,
    gmailLabelIssues,
  };
  const warnings: string[] = [];
  if (!leads.length && !input.niches?.length) warnings.push("No leads or niche stats supplied; run DB export/status first.");
  if (gmailLabelIssues) warnings.push("Gmail label setup needs a real thread id; preview only queues triage, not label creation.");
  if (smartleadSyncIssues) warnings.push("Smartlead sync/sequence/webhook repairs must stay behind backup and approval gates.");
  const status: LeadgenMaintenanceRunbookPreview["status"] = totals.inputLeads === 0 && totals.niches === 0
    ? "blocked"
    : totals.missingEmail || totals.missingIntro || totals.missingCompanyShort || totals.missingIco || totals.badIntro || totals.smartleadSyncIssues || totals.gmailLabelIssues || dbStatus.status !== "ready"
      ? "attention"
      : "ready";

  return {
    mode: "leadgen-maintenance-runbook-preview",
    status,
    summary: `Leadgen maintenance ${status}: ${totals.inputLeads} leadov, ${totals.niches} niches, ${totals.pendingEnrich} pending enrich, ${totals.missingEmail} bez emailu, ${totals.missingIntro} bez intra, ${totals.badIntro} zlych intr, ${totals.smartleadSyncIssues} Smartlead sync issues. Ziadny DB zapis, Gmail label, Smartlead update ani upload neprebehol.`,
    source: { name: input.sourceName, parsedFromCsv: parsed?.leads.length ?? 0, generatedAt: new Date().toISOString() },
    totals,
    dbStatus,
    campaigns,
    repairQueues: { missingEmail, missingIntro, companyShort, ico, badIntro },
    gmailLabels,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    manualChecks: [
      "Ak maintenance ukaze Smartlead drift, najprv sprav backup/safe sync runbook, az potom write approval.",
      "Ak Gmail label chyba, vytvor ho cez label_gmail_thread iba na realnom threade po approval, alebo manualne v Gmail UI.",
      "Po AI intro cleanup/importe spusti lead batch QA a az potom Smartlead injection/import audit.",
      "Po ORSR/ICO opravach obnov Google Sheet review export, aby operator videl aktualny stav.",
    ],
    warnings,
  };
}

export function buildColdOutreachMonitorRunbookPreview(input: {
  windowLabel?: string;
  from?: string;
  to?: string;
  campaigns?: Array<Record<string, unknown> & {
    campaignId?: string | number;
    id?: string | number;
    name?: string;
    status?: string;
    sent?: number;
    sentCount?: number;
    opened?: number;
    openedCount?: number;
    replies?: number;
    replyCount?: number;
    positiveReplies?: number;
    negativeReplies?: number;
    bounced?: number;
    unsubscribed?: number;
    totalLeads?: number;
    nonRepliers?: number;
  }>;
  replyEvents?: Array<Record<string, unknown> & {
    source?: "smartlead" | "gmail" | "manual";
    campaignId?: string | number;
    email?: string;
    leadEmail?: string;
    leadName?: string;
    companyName?: string;
    replyBody?: string;
    body?: string;
    classification?: string;
    category?: string;
    threadId?: string;
    messageId?: string;
    accountEnvKey?: string;
    leadId?: string | number;
  }>;
  preparedReplies?: Array<{ email?: string; leadEmail?: string; campaignId?: string | number; body?: string; draft?: string }>;
  nonReplyLeads?: Array<LeadCandidateInput & { sentToSmartlead?: boolean; sent_to_smartlead?: boolean }>;
  includeReplyDrafts?: boolean;
  includeNonReplyCalls?: boolean;
  includeDeliverabilityGuard?: boolean;
  maxNextCalls?: number;
}): ColdOutreachMonitorRunbookPreview {
  const campaignsInput = input.campaigns ?? [];
  const replyEvents = input.replyEvents ?? [];
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const eventCampaignIds = new Set(replyEvents.map((event) => event.campaignId).filter((value) => value !== undefined).map(String));
  const campaignRows = campaignsInput.map((campaign) => {
    const campaignId = campaign.campaignId ?? campaign.id ?? stringField(campaign, "campaign_id");
    const sent = metricNumber(campaign, "sent", "sentCount", "sent_count", "unique_sent_count", "emails_sent");
    const opened = metricNumber(campaign, "opened", "openedCount", "opened_count", "unique_opened_count", "opens");
    const replies = metricNumber(campaign, "replies", "replyCount", "reply_count", "unique_replied_count", "replied");
    const positiveReplies = metricNumber(campaign, "positiveReplies", "positive_replies", "interested", "interested_count");
    const negativeReplies = metricNumber(campaign, "negativeReplies", "negative_replies", "not_interested_count");
    const bounced = metricNumber(campaign, "bounced", "bounce_count", "bounced_count");
    const unsubscribed = metricNumber(campaign, "unsubscribed", "unsubscribe_count", "unsubscribed_count");
    const totalLeads = metricNumber(campaign, "totalLeads", "total_leads", "lead_count");
    const explicitNonRepliers = metricNumber(campaign, "nonRepliers", "non_repliers");
    const nonRepliers = explicitNonRepliers || Math.max(sent - replies - bounced - unsubscribed, 0);
    const issues: string[] = [];
    if (sent > 0 && replies === 0) issues.push("no_replies");
    if (percent(bounced, sent) >= 5) issues.push("high_bounce_rate");
    if (percent(unsubscribed, sent) >= 2) issues.push("unsubscribe_attention");
    if (totalLeads && sent < totalLeads && !/active|running|draft/i.test(String(campaign.status ?? ""))) issues.push("not_fully_sent");
    if (campaignId && eventCampaignIds.has(String(campaignId)) && replies === 0) issues.push("reply_events_not_in_stats");
    const nextAction = issues.includes("high_bounce_rate") || issues.includes("unsubscribe_attention")
      ? "Check deliverability before sending more."
      : positiveReplies > 0
        ? "Fetch reply histories and prepare positive reply drafts."
        : nonRepliers > 0
          ? "Prepare non-replier phone/call follow-up list."
          : sent > 0
            ? "Keep monitoring opens and replies."
            : "Fetch campaign status before deciding next action.";
    return {
      campaignId,
      name: campaign.name ?? stringField(campaign, "campaign_name", "name"),
      status: campaign.status ?? stringField(campaign, "status"),
      sent,
      opened,
      replies,
      positiveReplies,
      negativeReplies,
      bounced,
      unsubscribed,
      nonRepliers,
      issues,
      nextAction,
    };
  });

  const eventPositiveReplies = replyEvents
    .map((event) => classifyMonitorReply(event))
    .filter((event) => event.category === "positive");
  const eventNegativeReplies = replyEvents
    .map((event) => classifyMonitorReply(event))
    .filter((event) => event.category === "negative");
  const sent = sum(campaignRows.map((campaign) => campaign.sent));
  const opened = sum(campaignRows.map((campaign) => campaign.opened));
  const campaignReplies = sum(campaignRows.map((campaign) => campaign.replies));
  const replies = Math.max(campaignReplies, replyEvents.length);
  const campaignPositiveReplies = sum(campaignRows.map((campaign) => campaign.positiveReplies));
  const positiveRepliesCount = Math.max(campaignPositiveReplies, eventPositiveReplies.length);
  const negativeReplies = Math.max(sum(campaignRows.map((campaign) => campaign.negativeReplies)), eventNegativeReplies.length);
  const bounced = sum(campaignRows.map((campaign) => campaign.bounced));
  const unsubscribed = sum(campaignRows.map((campaign) => campaign.unsubscribed));
  const nonRepliers = input.nonReplyLeads?.length || sum(campaignRows.map((campaign) => campaign.nonRepliers));
  const preparedPositiveReplies = input.preparedReplies?.filter((reply) => reply.body || reply.draft).length ?? 0;
  const positiveReplyItems: ColdOutreachMonitorRunbookPreview["positiveReplies"] = eventPositiveReplies.slice(0, maxNextCalls).map((event) => ({
    source: event.source,
    campaignId: event.campaignId,
    email: event.email,
    leadName: event.leadName,
    companyName: event.companyName,
    replyBody: event.replyBody,
    confidence: event.confidence,
    nextAction: preparedPositiveReplies ? "Prepared reply exists; wait for operator approval before sending." : "Prepare reply draft and wait for operator approval.",
  }));

  const nextToolCalls: ColdOutreachMonitorRunbookPreview["nextToolCalls"] = [];
  for (const campaign of campaignRows.filter((row) => row.campaignId).slice(0, Math.min(5, maxNextCalls))) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_outreach_brief",
      payload: { campaignId: campaign.campaignId },
      reason: `Refresh Smartlead outreach stats for ${campaign.name ?? campaign.campaignId}.`,
      approvalRequired: false,
    });
    if (campaign.replies || campaign.positiveReplies || campaign.issues.includes("reply_events_not_in_stats")) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_campaign_leads",
        payload: { campaignId: campaign.campaignId, limit: 100 },
        reason: "Fetch campaign leads to locate replied leads and campaign_lead_map_id before message-history fetch.",
        approvalRequired: false,
      });
    }
  }
  if (input.includeReplyDrafts !== false && replyEvents.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_reply_followup_queue_preview",
      payload: { events: replyEvents.slice(0, maxNextCalls), aiRepliesActive: true, useAiClassification: false },
      reason: "Normalize reply events into history fetch, AI reply preview, and draft next steps without sending.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_outreach_reply_triage_preview",
      payload: {
        replies: replyEvents.slice(0, maxNextCalls).map((event) => ({
          source: event.source === "gmail" ? "gmail" : "smartlead",
          email: event.email ?? event.leadEmail,
          leadName: event.leadName,
          companyName: event.companyName,
          replyBody: event.replyBody ?? event.body ?? "",
          campaignId: event.campaignId,
          threadId: event.threadId,
          messageId: event.messageId,
          accountEnvKey: event.accountEnvKey,
          leadId: event.leadId,
        })),
        aiRepliesActive: true,
        useAiClassification: false,
      },
      reason: "Classify replies and prepare draft-only next calls for positives.",
      approvalRequired: false,
    });
  }
  if (input.includeNonReplyCalls !== false && (input.nonReplyLeads?.length || nonRepliers > 0)) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_nonreply_call_list_preview",
      payload: { leads: input.nonReplyLeads ?? [], sourceName: input.windowLabel ?? "cold-outreach-monitor", sourceType: "smartlead", maxRows: Math.max(nonRepliers, 1) },
      reason: "Prepare call/phone follow-up list for leads that were sent but did not reply.",
      approvalRequired: false,
    });
  }
  if (input.includeDeliverabilityGuard !== false && (bounced || unsubscribed || campaignRows.some((campaign) => campaign.issues.includes("high_bounce_rate")))) {
    for (const campaign of campaignRows.filter((row) => row.campaignId).slice(0, Math.min(3, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_deliverability_guard_preview",
        payload: { campaignId: campaign.campaignId, metrics: { sent: campaign.sent, bounced: campaign.bounced, unsubscribed: campaign.unsubscribed, replied: campaign.replies } },
        reason: "Check bounce/unsubscribe risk before more sends or uploads.",
        approvalRequired: false,
      });
    }
  }

  const totals = {
    campaigns: campaignRows.length,
    sent,
    opened,
    openRate: percent(opened, sent),
    replies,
    replyRate: percent(replies, sent),
    positiveReplies: positiveRepliesCount,
    positiveRate: percent(positiveRepliesCount, replies),
    negativeReplies,
    bounced,
    unsubscribed,
    nonRepliers,
    preparedPositiveReplies,
  };
  const warnings: string[] = [];
  if (!campaignRows.length && !replyEvents.length) warnings.push("No campaign stats or reply events supplied.");
  if (campaignRows.some((campaign) => campaign.issues.includes("reply_events_not_in_stats"))) warnings.push("Reply events exist but campaign stats show zero replies; refresh Smartlead stats.");
  if (totals.openRate === 0 && totals.sent > 0) warnings.push("Open tracking may be disabled or missing; do not over-read open rate.");
  const status: ColdOutreachMonitorRunbookPreview["status"] = !campaignRows.length && !replyEvents.length
    ? "blocked"
    : totals.positiveReplies || totals.bounced || totals.unsubscribed || warnings.length
      ? "attention"
      : "ready";
  const operatorBrief = [
    `Napisali sme ${totals.sent} ludom.`,
    `${totals.openRate}% si to otvorilo.`,
    `${totals.replies} ludi odpisalo, z toho ${totals.positiveReplies} pozitivne.`,
    totals.positiveReplies > 0
      ? preparedPositiveReplies > 0
        ? `Pripravil som ${preparedPositiveReplies} odpovedi na pozitivne reakcie; poslu sa az na tvoje znamenie.`
        : "Pozitivne reakcie su pripravene na draft odpovedi; nic neposielam bez tvojho schvalenia."
      : "Zatial nemame pozitivnu odpoved na odoslanie.",
    totals.nonRepliers > 0 ? `${totals.nonRepliers} ludi zatial neodpovedalo; pripravil som follow-up/call-list dalsie kroky.` : "",
  ].filter(Boolean).join(" ");

  return {
    mode: "cold-outreach-monitor-runbook-preview",
    status,
    summary: `Cold outreach monitor ${status}: ${totals.sent} sent, ${totals.openRate}% open rate, ${totals.replies} replies, ${totals.positiveReplies} positive, ${totals.nonRepliers} non-repliers. Ziadny fetch, reply ani export neprebehol.`,
    operatorBrief,
    window: { label: input.windowLabel, from: input.from, to: input.to },
    totals,
    campaigns: campaignRows.map(({ bounced: _bounced, unsubscribed: _unsubscribed, negativeReplies: _negativeReplies, ...campaign }) => campaign),
    positiveReplies: positiveReplyItems,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildSmartleadCampaignAuditPreview(input: {
  campaigns?: Array<Record<string, unknown> & {
    id?: string | number;
    campaignId?: string | number;
    name?: string;
    status?: string;
    totalSentCount?: number;
    total_sent_count?: number;
    sent?: number;
    uniqueRepliedCount?: number;
    unique_replied_count?: number;
    replies?: number;
    positiveReplies?: number;
    positive_replies?: number;
    sequenceCount?: number;
    sequence_count?: number;
    emailAccountCount?: number;
    email_account_count?: number;
    webhookCount?: number;
    webhook_count?: number;
    bounceRate?: number;
    bounce_rate?: number;
    unsubscribeRate?: number;
    unsubscribe_rate?: number;
  }>;
  localCampaigns?: Array<{ campaignId?: string | number; smartleadCampaignId?: string | number; nicheSlug?: string; nicheName?: string; owner?: string }>;
  sequences?: Array<{ campaignId?: string | number; sequences?: unknown[]; sequenceCount?: number; usesCompanyName?: boolean; unresolvedVariables?: string[]; missingSignature?: boolean; missingPersonalizedIntro?: boolean }>;
  webhooks?: Array<{ campaignId?: string | number; count?: number; eventTypes?: string[]; hasReplyWebhook?: boolean; hasCategoryWebhook?: boolean }>;
  senderAccounts?: Array<{ campaignId?: string | number; count?: number; activeCount?: number; warmupIssues?: number; dailyLimit?: number }>;
  includeStatsRefresh?: boolean;
  includeContentQa?: boolean;
  includeWebhookAudit?: boolean;
  includeSenderAudit?: boolean;
  maxNextCalls?: number;
}): SmartleadCampaignAuditPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const localByCampaignId = new Map((input.localCampaigns ?? []).flatMap((item) => {
    const id = String(item.campaignId ?? item.smartleadCampaignId ?? "");
    return id ? [[id, item] as const] : [];
  }));
  const sequenceByCampaignId = new Map((input.sequences ?? []).flatMap((item) => {
    const id = String(item.campaignId ?? "");
    return id ? [[id, item] as const] : [];
  }));
  const webhookByCampaignId = new Map((input.webhooks ?? []).flatMap((item) => {
    const id = String(item.campaignId ?? "");
    return id ? [[id, item] as const] : [];
  }));
  const senderByCampaignId = new Map((input.senderAccounts ?? []).flatMap((item) => {
    const id = String(item.campaignId ?? "");
    return id ? [[id, item] as const] : [];
  }));

  const campaigns = (input.campaigns ?? []).map((campaign) => {
    const campaignId = campaign.campaignId ?? campaign.id ?? stringField(campaign, "campaign_id");
    const idKey = campaignId !== undefined ? String(campaignId) : "";
    const local = idKey ? localByCampaignId.get(idKey) : undefined;
    const sequence = idKey ? sequenceByCampaignId.get(idKey) : undefined;
    const webhook = idKey ? webhookByCampaignId.get(idKey) : undefined;
    const sender = idKey ? senderByCampaignId.get(idKey) : undefined;
    const sent = metricNumber(campaign, "sent", "totalSentCount", "total_sent_count", "sent_count", "unique_sent_count");
    const replies = metricNumber(campaign, "replies", "uniqueRepliedCount", "unique_replied_count", "reply_count", "unique_replied_count");
    const positiveReplies = metricNumber(campaign, "positiveReplies", "positive_replies", "positive_reply_count", "interested_count");
    const sequenceCount = sequence?.sequenceCount ?? (Array.isArray(sequence?.sequences) ? sequence.sequences.length : undefined) ?? metricNumber(campaign, "sequenceCount", "sequence_count", "sequences_count");
    const senderCount = sender?.count ?? sender?.activeCount ?? metricNumber(campaign, "emailAccountCount", "email_account_count", "sender_count", "email_accounts_count");
    const webhookCount = webhook?.count ?? metricNumber(campaign, "webhookCount", "webhook_count");
    const bounceRate = numberField(campaign, "bounceRate", "bounce_rate") ?? 0;
    const unsubscribeRate = numberField(campaign, "unsubscribeRate", "unsubscribe_rate") ?? 0;
    const issues: string[] = [];
    if (!campaignId) issues.push("missing_campaign_id");
    if (!local) issues.push("unknown_local_mapping");
    if (!sequenceCount) issues.push("missing_sequence");
    if (sequence?.usesCompanyName || (sequence?.unresolvedVariables ?? []).length) issues.push("variable_issues");
    if (sequence?.missingSignature) issues.push("missing_signature");
    if (sequence?.missingPersonalizedIntro) issues.push("missing_personalized_intro");
    if (!senderCount) issues.push("missing_sender");
    if ((sender?.warmupIssues ?? 0) > 0) issues.push("sender_warmup_attention");
    if (!webhookCount || webhook?.hasReplyWebhook === false || webhook?.hasCategoryWebhook === false) issues.push("missing_webhook");
    if (bounceRate >= 5 || unsubscribeRate >= 2) issues.push("deliverability_attention");
    if (sent > 0 && replies === 0) issues.push("sent_no_replies");
    const health: SmartleadCampaignAuditPreview["campaigns"][number]["health"] = issues.some((issue) => issue === "missing_campaign_id" || issue === "missing_sequence" || issue === "missing_sender")
      ? "blocked"
      : issues.length
        ? "attention"
        : "ready";
    const nextAction = issues.includes("missing_sequence") || issues.includes("variable_issues") || issues.includes("missing_signature") || issues.includes("missing_personalized_intro")
      ? "Run campaign QA and sequence repair before more uploads."
      : issues.includes("missing_sender") || issues.includes("sender_warmup_attention")
        ? "Audit sender accounts and capacity before sending more."
        : issues.includes("missing_webhook")
          ? "Audit/upsert reply webhooks before AI reply automation."
          : issues.includes("deliverability_attention")
            ? "Run deliverability guard and reduce/pause if needed."
            : sent > 0
              ? "Refresh stats and monitor replies."
              : "Fetch campaign content before launch decision.";
    return {
      campaignId,
      name: campaign.name ?? stringField(campaign, "campaign_name", "name"),
      status: campaign.status ?? stringField(campaign, "status"),
      localNiche: local?.nicheName ?? local?.nicheSlug,
      sent,
      replies,
      positiveReplies,
      issues,
      health,
      nextAction,
    };
  });

  const nextToolCalls: SmartleadCampaignAuditPreview["nextToolCalls"] = [];
  for (const campaign of campaigns.filter((item) => item.campaignId).slice(0, Math.min(10, maxNextCalls))) {
    if (input.includeStatsRefresh !== false) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_outreach_brief",
        payload: { campaignId: campaign.campaignId },
        reason: `Refresh stats and Jarvis outreach brief for ${campaign.name ?? campaign.campaignId}.`,
        approvalRequired: false,
      });
    }
    if (input.includeWebhookAudit !== false && campaign.issues.includes("missing_webhook")) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_campaign_webhooks",
        payload: { campaignId: campaign.campaignId },
        reason: "Read existing webhooks before preparing any approval-gated webhook upsert.",
        approvalRequired: false,
      });
    }
    if (input.includeSenderAudit !== false && (campaign.issues.includes("missing_sender") || campaign.issues.includes("sender_warmup_attention"))) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_email_accounts",
        payload: { campaignId: campaign.campaignId, includeInactive: true },
        reason: "Read sender accounts, warmup, and daily limits before configuring campaign sending.",
        approvalRequired: false,
      });
    }
    if (input.includeContentQa !== false && campaign.issues.some((issue) => ["missing_sequence", "variable_issues", "missing_signature", "missing_personalized_intro"].includes(issue))) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_campaign_qa_preview",
        payload: { campaignId: campaign.campaignId, campaignName: campaign.name, sequences: [], leads: [] },
        reason: "Validate sequence/content variables and lead payloads before launch or more uploads.",
        approvalRequired: false,
      });
      if (campaign.issues.includes("variable_issues")) {
        nextToolCalls.push({
          tool: "arcigy.build_smartlead_sequence_variable_repair_preview",
          payload: { campaignId: campaign.campaignId, sequences: [] },
          reason: "Prepare company_name -> company_name_short subject/body variable repair without writing.",
          approvalRequired: false,
        });
      }
    }
    if (campaign.issues.includes("deliverability_attention")) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_deliverability_guard_preview",
        payload: { campaignId: campaign.campaignId, metrics: { sent: campaign.sent, replied: campaign.replies } },
        reason: "Check bounce/unsubscribe risk before additional uploads or sends.",
        approvalRequired: false,
      });
    }
    if (campaign.sent > 0) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_campaign_leads",
        payload: { campaignId: campaign.campaignId, offset: 0, limit: 100 },
        reason: "Fetch lead statuses for reply/non-reply/call-list audit.",
        approvalRequired: false,
      });
    }
  }
  if (campaigns.some((campaign) => campaign.sent > 0)) {
    nextToolCalls.push({
      tool: "arcigy.build_cold_outreach_monitor_runbook_preview",
      payload: { campaigns: campaigns.filter((campaign) => campaign.sent > 0).slice(0, maxNextCalls), windowLabel: "smartlead-campaign-audit" },
      reason: "Summarize active campaign stats into Jarvis cold outreach style.",
      approvalRequired: false,
    });
  }

  const totals = {
    campaigns: campaigns.length,
    active: campaigns.filter((campaign) => campaign.sent > 0 || /active|running/i.test(campaign.status ?? "")).length,
    sent: sum(campaigns.map((campaign) => campaign.sent)),
    replies: sum(campaigns.map((campaign) => campaign.replies)),
    positiveReplies: sum(campaigns.map((campaign) => campaign.positiveReplies)),
    missingSequence: campaigns.filter((campaign) => campaign.issues.includes("missing_sequence")).length,
    missingSender: campaigns.filter((campaign) => campaign.issues.includes("missing_sender")).length,
    missingWebhook: campaigns.filter((campaign) => campaign.issues.includes("missing_webhook")).length,
    variableIssues: campaigns.filter((campaign) => campaign.issues.includes("variable_issues") || campaign.issues.includes("missing_personalized_intro") || campaign.issues.includes("missing_signature")).length,
    deliverabilityIssues: campaigns.filter((campaign) => campaign.issues.includes("deliverability_attention")).length,
    unknownLocalMapping: campaigns.filter((campaign) => campaign.issues.includes("unknown_local_mapping")).length,
  };
  const warnings: string[] = [];
  if (!campaigns.length) warnings.push("No Smartlead campaign snapshot supplied; call get_smartlead_campaign_status first.");
  if (totals.unknownLocalMapping) warnings.push("Some Smartlead campaigns do not map to local niches.");
  if (totals.missingSequence || totals.variableIssues) warnings.push("Some campaigns need sequence/content QA before more uploads.");
  if (totals.missingSender || totals.deliverabilityIssues) warnings.push("Some campaigns need sender/deliverability checks before sending.");
  const status: SmartleadCampaignAuditPreview["status"] = !campaigns.length
    ? "blocked"
    : campaigns.some((campaign) => campaign.health === "blocked")
      ? "blocked"
      : campaigns.some((campaign) => campaign.health === "attention") || warnings.length
        ? "attention"
        : "ready";
  const operatorBrief = [
    `Nasiel som ${totals.campaigns} Smartlead kampani, z toho ${totals.active} aktivnych alebo s odoslanymi emailmi.`,
    `Spolu odoslali ${totals.sent} emailov a maju ${totals.replies} odpovedi, z toho ${totals.positiveReplies} pozitivnych.`,
    totals.missingSequence || totals.missingSender || totals.missingWebhook || totals.variableIssues
      ? `Na opravu: ${totals.missingSequence} bez sekvencie, ${totals.missingSender} bez sendera, ${totals.missingWebhook} bez webhooku, ${totals.variableIssues} s problemom premennych/obsahu.`
      : "Zakladna konfiguracia kampani vyzera pripravena.",
    "Ziadny Smartlead update, webhook upsert, delete ani upload neprebehol.",
  ].join(" ");

  return {
    mode: "smartlead-campaign-audit-preview",
    status,
    summary: `Smartlead campaign audit ${status}: ${totals.campaigns} campaigns, ${totals.active} active, ${totals.sent} sent, ${totals.replies} replies, ${totals.missingSequence} missing sequence, ${totals.missingSender} missing sender, ${totals.missingWebhook} missing webhook. Ziadny Smartlead zapis neprebehol.`,
    operatorBrief,
    totals,
    campaigns,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildSmartleadWorkspaceDiagnosticPreview(input: {
  endpointChecks?: Array<{ url?: string; authMode?: string; status?: number | string; ok?: boolean; error?: string; count?: number }>;
  campaigns?: Parameters<typeof buildSmartleadCampaignAuditPreview>[0]["campaigns"];
  localCampaigns?: Parameters<typeof buildSmartleadCampaignAuditPreview>[0]["localCampaigns"];
  sequences?: Parameters<typeof buildSmartleadCampaignAuditPreview>[0]["sequences"];
  webhooks?: Parameters<typeof buildSmartleadCampaignAuditPreview>[0]["webhooks"];
  senderAccounts?: Array<Record<string, unknown> & { id?: string | number; email?: string; status?: string; warmupStatus?: string; warmup_status?: string; dailyLimit?: number; daily_limit?: number; sentToday?: number; sent_today?: number; bounceRate?: number; bounce_rate?: number; reputationScore?: number; reputation_score?: number }>;
  expectedMinimumActive?: number;
  includeCampaignAudit?: boolean;
  includeSenderAudit?: boolean;
  includeWebhookAudit?: boolean;
  includeDeliverabilityGuard?: boolean;
  maxNextCalls?: number;
}): SmartleadWorkspaceDiagnosticPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const expectedMinimumActive = Math.max(Math.trunc(input.expectedMinimumActive ?? 1), 0);
  const endpointDiagnostics = (input.endpointChecks ?? []).map((check) => {
    const ok = check.ok === true || (typeof check.status === "number" && check.status >= 200 && check.status < 300);
    const issue = ok ? undefined : check.error ?? `endpoint_status_${check.status ?? "unknown"}`;
    const nextAction = ok
      ? `Endpoint ${check.url ?? "Smartlead"} odpoveda; pouzi ho na campaign/status fetch.`
      : "Skontroluj SMARTLEAD_API_KEY, endpoint base URL a auth mode; nevypisuj token ani hex dump.";
    return { url: check.url, authMode: check.authMode, status: check.status, ok, issue, nextAction };
  });
  const campaignAudit = buildSmartleadCampaignAuditPreview({
    campaigns: input.campaigns,
    localCampaigns: input.localCampaigns,
    sequences: input.sequences,
    webhooks: input.webhooks,
    senderAccounts: [],
    includeStatsRefresh: true,
    includeContentQa: input.includeCampaignAudit !== false,
    includeWebhookAudit: input.includeWebhookAudit !== false,
    includeSenderAudit: false,
    maxNextCalls,
  });
  const campaigns = campaignAudit.campaigns.map((campaign) => ({
    campaignId: campaign.campaignId,
    name: campaign.name,
    status: campaign.status,
    sent: campaign.sent,
    replies: campaign.replies,
    issues: campaign.issues,
    nextAction: campaign.nextAction,
  }));
  const senderAccounts = (input.senderAccounts ?? []).map((account) => {
    const dailyLimit = numberField(account, "dailyLimit", "daily_limit");
    const sentToday = numberField(account, "sentToday", "sent_today") ?? 0;
    const bounceRate = numberField(account, "bounceRate", "bounce_rate") ?? 0;
    const reputationScore = numberField(account, "reputationScore", "reputation_score");
    const status = account.status ?? stringField(account, "status");
    const warmupStatus = account.warmupStatus ?? account.warmup_status ?? stringField(account, "warmup_status", "warmupStatus");
    const issues: string[] = [];
    if (!account.email && !stringField(account, "from_email", "sender_email")) issues.push("missing_email");
    if (status && !/active|connected|ready/i.test(status)) issues.push("inactive_sender");
    if (warmupStatus && !/active|ready|enabled|ok|warming/i.test(warmupStatus)) issues.push("warmup_attention");
    if (dailyLimit !== undefined && sentToday >= dailyLimit) issues.push("daily_limit_used");
    if (bounceRate >= 3) issues.push("sender_bounce_attention");
    if (reputationScore !== undefined && reputationScore < 70) issues.push("low_reputation_score");
    const nextAction = issues.length
      ? "Audit sender warmup, limits, bounce rate and capacity before more uploads."
      : "Sender account looks usable; include it in capacity planning.";
    return {
      id: account.id ?? stringField(account, "id"),
      email: account.email ?? stringField(account, "from_email", "sender_email"),
      status,
      warmupStatus,
      dailyLimit,
      issues,
      nextAction,
    };
  });

  const nextToolCalls: SmartleadWorkspaceDiagnosticPreview["nextToolCalls"] = [];
  nextToolCalls.push({
    tool: "arcigy.get_smartlead_campaign_status",
    payload: {},
    reason: "Fetch current Smartlead campaigns before diagnosing workspace drift.",
    approvalRequired: false,
  });
  if (input.includeSenderAudit !== false) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_email_accounts",
      payload: { includeInactive: true },
      reason: "Read sender accounts, status, warmup and limits for workspace-level capacity.",
      approvalRequired: false,
    });
  }
  if (input.includeCampaignAudit !== false) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_campaign_audit_preview",
      payload: {
        campaigns: input.campaigns ?? [],
        localCampaigns: input.localCampaigns ?? [],
        sequences: input.sequences ?? [],
        webhooks: input.webhooks ?? [],
      },
      reason: "Run detailed campaign content/sender/webhook audit after workspace diagnosis.",
      approvalRequired: false,
    });
  }
  for (const campaign of campaigns.filter((item) => item.campaignId).slice(0, Math.min(10, maxNextCalls))) {
    if (input.includeWebhookAudit !== false && campaign.issues.includes("missing_webhook")) {
      nextToolCalls.push({
        tool: "arcigy.get_smartlead_campaign_webhooks",
        payload: { campaignId: campaign.campaignId },
        reason: "Read campaign webhooks before any approval-gated webhook upsert.",
        approvalRequired: false,
      });
    }
    if (input.includeDeliverabilityGuard !== false && (campaign.sent > 0 || campaign.issues.includes("deliverability_attention"))) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_deliverability_guard_preview",
        payload: { campaignId: campaign.campaignId, campaignName: campaign.name, stats: { sent: campaign.sent, replied: campaign.replies } },
        reason: "Check deliverability and sending pressure before additional uploads.",
        approvalRequired: false,
      });
    }
  }
  if (campaigns.some((campaign) => campaign.sent > 0)) {
    nextToolCalls.push({
      tool: "arcigy.build_cold_outreach_monitor_runbook_preview",
      payload: { campaigns: campaigns.filter((campaign) => campaign.sent > 0), windowLabel: "smartlead-workspace-diagnostic" },
      reason: "Summarize active campaigns into Jarvis cold outreach briefing style.",
      approvalRequired: false,
    });
  }

  const totals = {
    endpointChecks: endpointDiagnostics.length,
    endpointReady: endpointDiagnostics.filter((check) => check.ok).length,
    campaigns: campaigns.length,
    activeCampaigns: campaigns.filter((campaign) => campaign.sent > 0 || /active|running/i.test(campaign.status ?? "")).length,
    sent: sum(campaigns.map((campaign) => campaign.sent)),
    replies: sum(campaigns.map((campaign) => campaign.replies)),
    draftCampaigns: campaigns.filter((campaign) => !campaign.sent && /draft|created|paused|not_started/i.test(campaign.status ?? "")).length,
    needsCampaignAudit: campaigns.filter((campaign) => campaign.issues.length).length,
    senderAccounts: senderAccounts.length,
    senderIssues: senderAccounts.filter((account) => account.issues.length).length,
  };
  const warnings: string[] = [];
  if (!endpointDiagnostics.length) warnings.push("No endpoint diagnostic snapshot supplied; call get_smartlead_campaign_status or integration diagnostics first.");
  if (!campaigns.length) warnings.push("No campaign snapshot supplied; workspace campaign health is unknown.");
  if (expectedMinimumActive > 0 && totals.activeCampaigns < expectedMinimumActive) warnings.push(`Active campaign target not reached: ${totals.activeCampaigns}/${expectedMinimumActive}.`);
  if (totals.senderIssues) warnings.push("Some sender accounts need attention before more Smartlead uploads.");
  const status: SmartleadWorkspaceDiagnosticPreview["status"] = (!endpointDiagnostics.length && !campaigns.length)
    ? "blocked"
    : endpointDiagnostics.some((check) => !check.ok) || !campaigns.length
      ? "blocked"
      : totals.needsCampaignAudit || totals.senderIssues || warnings.length
        ? "attention"
        : "ready";
  const operatorBrief = [
    `Smartlead workspace diagnostic: ${totals.endpointReady}/${totals.endpointChecks} endpoint checks ready.`,
    `${totals.campaigns} kampani, ${totals.activeCampaigns} aktivnych, ${totals.sent} odoslanych emailov, ${totals.replies} odpovedi.`,
    `${totals.needsCampaignAudit} kampani potrebuje content/sender/webhook audit a ${totals.senderIssues} senderov ma issue.`,
    "Ziadny Smartlead update, webhook upsert, send, delete ani upload neprebehol.",
  ].join(" ");
  return {
    mode: "smartlead-workspace-diagnostic-preview",
    status,
    summary: `Smartlead workspace diagnostic ${status}: ${totals.endpointReady}/${totals.endpointChecks} endpoints ready, ${totals.campaigns} campaigns, ${totals.activeCampaigns} active, ${totals.senderAccounts} sender accounts, ${totals.senderIssues} sender issues. Ziadny Smartlead zapis neprebehol.`,
    operatorBrief,
    totals,
    endpointDiagnostics,
    campaigns,
    senderAccounts,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildSmartleadMessageHistoryAuditPreview(input: {
  campaignId?: string | number;
  campaignName?: string;
  leads?: Array<Record<string, unknown> & {
    id?: string | number;
    leadId?: string | number;
    campaignLeadMapId?: string | number;
    campaign_lead_map_id?: string | number;
    email?: string;
    leadEmail?: string;
    replied?: boolean;
    replyCount?: number;
    categoryName?: string;
    category_name?: string;
  }>;
  histories?: Array<{
    email?: string;
    leadId?: string | number;
    campaignLeadMapId?: string | number;
    messages?: Array<Record<string, unknown> & { type?: string; subject?: string; email_body?: string; body?: string; created_at?: string; send_time?: string }>;
  }>;
  maxHistoryFetches?: number;
  includeReplyTriage?: boolean;
  includeNonReplyCalls?: boolean;
  maxNextCalls?: number;
}): SmartleadMessageHistoryAuditPreview {
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const maxHistoryFetches = Math.min(Math.max(Math.trunc(input.maxHistoryFetches ?? 20), 1), 100);
  const historyByEmail = new Map((input.histories ?? []).flatMap((history) => {
    const email = history.email?.trim().toLowerCase();
    return email ? [[email, history] as const] : [];
  }));
  const historyById = new Map((input.histories ?? []).flatMap((history) => {
    const id = String(history.campaignLeadMapId ?? history.leadId ?? "");
    return id ? [[id, history] as const] : [];
  }));

  const leads = (input.leads ?? []).map((lead) => {
    const email = lead.email ?? lead.leadEmail ?? stringField(lead, "lead_email", "primary_email");
    const leadId = lead.leadId ?? lead.id ?? stringField(lead, "lead_id");
    const campaignLeadMapId = lead.campaignLeadMapId ?? lead.campaign_lead_map_id ?? stringField(lead, "campaign_lead_map_id");
    const history = (email ? historyByEmail.get(email.trim().toLowerCase()) : undefined) ?? historyById.get(String(campaignLeadMapId ?? leadId ?? ""));
    const messages = history?.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    const allHistoryText = messages.map((message) => `${message.type ?? ""} ${message.subject ?? ""} ${message.email_body ?? message.body ?? ""}`).join(" ");
    const category = String(lead.categoryName ?? lead.category_name ?? stringField(lead, "lead_category", "category") ?? "").toLowerCase();
    const replied = lead.replied === true || Number(lead.replyCount ?? numberField(lead, "reply_count", "replies") ?? 0) > 0 || /reply|lead_reply|replied/i.test(allHistoryText);
    const positiveSignal = /positive|interested|meeting|demo|zaujem|poslite|send|call|ukazku/.test(category)
      || /\b(poslite|send|demo|ukazku|zaujem|termin|meeting|call)\b/i.test(allHistoryText.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const issues: string[] = [];
    if (!campaignLeadMapId && !leadId) issues.push("missing_lead_map_id");
    if (!messages.length) issues.push("missing_history");
    if (replied && !messages.length) issues.push("reply_without_history");
    const nextAction = !campaignLeadMapId && !leadId
      ? "Fetch campaign leads first to recover campaign_lead_map_id."
      : !messages.length
        ? "Fetch Smartlead message history for this lead."
        : positiveSignal
          ? "Prepare reply/showcase draft preview and wait for approval."
          : replied
            ? "Run reply triage before drafting."
            : "Keep for non-replier follow-up or monitoring.";
    return {
      email,
      leadId,
      campaignLeadMapId,
      historyCount: messages.length,
      lastMessageType: lastMessage?.type ?? stringField(lastMessage ?? {}, "event_type", "message_type"),
      lastSubject: lastMessage?.subject ?? stringField(lastMessage ?? {}, "email_subject", "subject"),
      replied,
      positiveSignal,
      issues,
      nextAction,
    };
  });

  const historyFetchQueue = leads
    .filter((lead) => lead.issues.includes("missing_history") && (lead.campaignLeadMapId || lead.leadId || lead.email))
    .slice(0, maxHistoryFetches)
    .map((lead) => ({
      campaignId: input.campaignId,
      email: lead.email,
      leadId: lead.leadId,
      campaignLeadMapId: lead.campaignLeadMapId,
      reason: lead.issues.includes("reply_without_history") ? "Reply flag exists but no message history was supplied." : "No message history supplied for this lead.",
    }));

  const nextToolCalls: SmartleadMessageHistoryAuditPreview["nextToolCalls"] = [];
  if (input.campaignId && leads.some((lead) => lead.issues.includes("missing_lead_map_id"))) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId: input.campaignId, offset: 0, limit: 100 },
      reason: "Recover campaign_lead_map_id values before batch message-history fetch.",
      approvalRequired: false,
    });
  }
  for (const item of historyFetchQueue.slice(0, maxNextCalls)) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_message_history",
      payload: { campaignId: input.campaignId, email: item.email, leadId: item.campaignLeadMapId ?? item.leadId },
      reason: item.reason,
      approvalRequired: false,
    });
  }
  const repliedLeads = leads.filter((lead) => lead.replied || lead.positiveSignal);
  if (input.includeReplyTriage !== false && repliedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_outreach_reply_triage_preview",
      payload: {
        replies: repliedLeads.slice(0, maxNextCalls).map((lead) => ({
          source: "smartlead",
          email: lead.email,
          campaignId: input.campaignId,
          replyBody: lead.positiveSignal ? "Positive signal found in Smartlead history/category." : "Reply signal found in Smartlead history/category.",
        })),
        useAiClassification: false,
      },
      reason: "Turn replied leads into draft-only reply triage without sending.",
      approvalRequired: false,
    });
  }
  if (input.includeNonReplyCalls !== false && leads.some((lead) => !lead.replied)) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_nonreply_call_list_preview",
      payload: { leads: leads.filter((lead) => !lead.replied).slice(0, maxNextCalls), sourceName: input.campaignName ?? "smartlead-message-history-audit", sourceType: "smartlead" },
      reason: "Prepare phone/call follow-up list for sent leads without replies.",
      approvalRequired: false,
    });
  }
  if (input.campaignId) {
    nextToolCalls.push({
      tool: "arcigy.build_cold_outreach_monitor_runbook_preview",
      payload: { windowLabel: input.campaignName ?? "smartlead-message-history-audit", replyEvents: repliedLeads.slice(0, maxNextCalls).map((lead) => ({ source: "smartlead", campaignId: input.campaignId, email: lead.email, category: lead.positiveSignal ? "positive" : "neutral", replyBody: lead.positiveSignal ? "Positive Smartlead history/category signal." : "Smartlead reply signal." })) },
      reason: "Summarize reply/history findings into Jarvis cold outreach style.",
      approvalRequired: false,
    });
  }

  const totals = {
    leads: leads.length,
    withHistory: leads.filter((lead) => lead.historyCount > 0).length,
    missingHistory: leads.filter((lead) => lead.issues.includes("missing_history")).length,
    replied: leads.filter((lead) => lead.replied).length,
    positiveSignals: leads.filter((lead) => lead.positiveSignal).length,
    needsHistoryFetch: historyFetchQueue.length,
    missingLeadMapId: leads.filter((lead) => lead.issues.includes("missing_lead_map_id")).length,
  };
  const warnings: string[] = [];
  if (!leads.length) warnings.push("No Smartlead leads supplied; call get_smartlead_campaign_leads first.");
  if (totals.missingLeadMapId) warnings.push("Some leads are missing campaign_lead_map_id; fetch campaign leads before message-history calls.");
  if (totals.missingHistory) warnings.push("Some leads need message-history fetch before reply decisions.");
  const status: SmartleadMessageHistoryAuditPreview["status"] = !leads.length
    ? "blocked"
    : totals.positiveSignals || totals.replied || totals.missingHistory || totals.missingLeadMapId
      ? "attention"
      : "ready";
  const operatorBrief = [
    `Skontroloval som ${totals.leads} leadov v Smartlead kampani${input.campaignId ? ` ${input.campaignId}` : ""}.`,
    `${totals.withHistory} ma message history, ${totals.needsHistoryFetch} potrebuje history fetch.`,
    `${totals.replied} ma reply signal, z toho ${totals.positiveSignals} vyzera pozitivne.`,
    "Ziadny Smartlead update, reply ani upload neprebehol.",
  ].join(" ");

  return {
    mode: "smartlead-message-history-audit-preview",
    status,
    summary: `Smartlead message history audit ${status}: ${totals.leads} leads, ${totals.withHistory} with history, ${totals.needsHistoryFetch} need history fetch, ${totals.replied} replied, ${totals.positiveSignals} positive. Ziadny Smartlead zapis neprebehol.`,
    operatorBrief,
    campaignId: input.campaignId,
    totals,
    leads,
    historyFetchQueue,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildGmailOutreachReadinessPreview(input: {
  accounts?: Array<{
    accountEnvKey?: string;
    email?: string;
    labelName?: string;
    labelReady?: boolean;
    authReady?: boolean;
    tokenReady?: boolean;
    unreadTotal?: number;
    unreadLeadReplies?: number;
    lastSyncAt?: string;
  }>;
  replyEvents?: Array<{
    source?: "gmail" | "smartlead" | "manual";
    accountEnvKey?: string;
    threadId?: string;
    messageId?: string;
    email?: string;
    leadEmail?: string;
    fromEmail?: string;
    leadName?: string;
    companyName?: string;
    subject?: string;
    replyBody?: string;
    body?: string;
    text?: string;
    classification?: string;
    category?: string;
  }>;
  knownLeads?: LeadCandidateInput[];
  targetLabel?: string;
  query?: string;
  includeUnreadTriage?: boolean;
  includeLeadContext?: boolean;
  includeReplyDrafts?: boolean;
  includeLabelApprovalPayloads?: boolean;
  maxNextCalls?: number;
}): GmailOutreachReadinessPreview {
  const targetLabel = input.targetLabel?.trim() || "COLD-OUTREACH";
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const query = input.query?.trim() || "is:unread category:primary";
  const knownLeadEmails = new Set((input.knownLeads ?? []).map((lead) => lead.email?.trim().toLowerCase()).filter(Boolean) as string[]);
  const accounts = (input.accounts ?? []).map((account) => {
    const labelName = account.labelName?.trim() || targetLabel;
    const authReady = account.authReady ?? account.tokenReady ?? Boolean(account.accountEnvKey || account.email);
    const labelReady = account.labelReady === true;
    const unreadTotal = Math.max(0, Math.trunc(account.unreadTotal ?? 0));
    const unreadLeadReplies = Math.max(0, Math.trunc(account.unreadLeadReplies ?? 0));
    const issues: string[] = [];
    if (!authReady) issues.push("auth_missing");
    if (!labelReady) issues.push("label_missing");
    if (unreadLeadReplies > 0) issues.push("unread_lead_replies");
    const nextAction = !authReady
      ? "Reconnect Gmail OAuth account before reply automation."
      : !labelReady
        ? "Find a real thread and apply the outreach label after approval, or create it manually in Gmail."
        : unreadLeadReplies > 0
          ? "Run unread triage and prepare draft-only replies for lead messages."
          : unreadTotal > 0
            ? "Run unread triage to separate leads from automated/internal mail."
            : "Account is ready for cold outreach reply monitoring.";
    return {
      accountEnvKey: account.accountEnvKey,
      email: account.email,
      labelName,
      authReady,
      labelReady,
      unreadTotal,
      unreadLeadReplies,
      issues,
      nextAction,
    };
  });

  const replyQueue: GmailOutreachReadinessPreview["replyQueue"] = (input.replyEvents ?? []).slice(0, maxNextCalls).map((event) => {
    const email = event.email ?? event.leadEmail ?? event.fromEmail;
    const body = event.replyBody ?? event.body ?? event.text ?? "";
    const classified = classifyMonitorReply({
      source: event.source ?? "gmail",
      email,
      leadEmail: email,
      leadName: event.leadName,
      companyName: event.companyName,
      replyBody: body,
      body,
      classification: event.classification,
      category: event.category,
      threadId: event.threadId,
      messageId: event.messageId,
      accountEnvKey: event.accountEnvKey,
    });
    const knownLead = email ? knownLeadEmails.has(email.trim().toLowerCase()) : false;
    const nextAction = classified.category === "positive"
      ? "Prepare draft-only reply and wait for operator approval before sending."
      : classified.category === "negative"
        ? "Add to suppression/review list; do not draft a positive follow-up."
        : "Fetch lead context and classify before drafting.";
    return {
      source: classified.source === "smartlead" || classified.source === "manual" ? classified.source : "gmail",
      accountEnvKey: event.accountEnvKey,
      threadId: event.threadId,
      email,
      leadName: event.leadName,
      companyName: event.companyName,
      replyBody: classified.replyBody,
      category: classified.category,
      knownLead,
      nextAction,
    };
  });

  const nextToolCalls: GmailOutreachReadinessPreview["nextToolCalls"] = [];
  if (input.includeUnreadTriage !== false) {
    for (const account of accounts.filter((item) => item.authReady).slice(0, Math.min(5, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.get_gmail_unread_triage",
        payload: { accountEnvKey: account.accountEnvKey, query, maxResults: 20, includeBody: true },
        reason: `Skontroluj unread spravy pre ${account.email ?? account.accountEnvKey ?? "Gmail"} a rozdel lead replies od automatickych mailov.`,
        approvalRequired: false,
      });
    }
  }
  if (input.includeLeadContext !== false) {
    for (const reply of replyQueue.filter((item) => item.email).slice(0, Math.min(10, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.get_gmail_lead_context",
        payload: { leadEmail: reply.email, accountEnvKey: reply.accountEnvKey, maxMessages: 10, includeBody: true },
        reason: "Nacitaj Gmail historiu a display-name kontext pred AI reply preview.",
        approvalRequired: false,
      });
    }
  }
  if (input.includeReplyDrafts !== false && replyQueue.length) {
    nextToolCalls.push({
      tool: "arcigy.build_outreach_reply_triage_preview",
      payload: {
        replies: replyQueue.map((reply) => ({
          source: reply.source,
          email: reply.email,
          leadName: reply.leadName,
          companyName: reply.companyName,
          replyBody: reply.replyBody,
          threadId: reply.threadId,
          accountEnvKey: reply.accountEnvKey,
        })),
        aiRepliesActive: true,
        useAiClassification: false,
      },
      reason: "Z reply queue priprav draft-only follow-up kroky bez odoslania.",
      approvalRequired: false,
    });
  }
  if (input.includeLabelApprovalPayloads !== false) {
    for (const reply of replyQueue.filter((item) => item.threadId && item.accountEnvKey).slice(0, Math.min(10, maxNextCalls))) {
      nextToolCalls.push({
        tool: "arcigy.label_gmail_thread",
        payload: { accountEnvKey: reply.accountEnvKey, threadId: reply.threadId, labelName: targetLabel, markRead: true },
        reason: "Po operator approval oznac vybaveny outreach thread labelom a volitelne ako precitany.",
        approvalRequired: true,
      });
    }
  }

  const totals = {
    accounts: accounts.length,
    authReady: accounts.filter((account) => account.authReady).length,
    labelReady: accounts.filter((account) => account.labelReady).length,
    missingLabel: accounts.filter((account) => !account.labelReady).length,
    authIssues: accounts.filter((account) => !account.authReady).length,
    unreadTotal: sum(accounts.map((account) => account.unreadTotal)),
    unreadLeadReplies: sum(accounts.map((account) => account.unreadLeadReplies)),
    knownLeadMatches: replyQueue.filter((reply) => reply.knownLead).length,
    positiveReplies: replyQueue.filter((reply) => reply.category === "positive").length,
  };
  const warnings: string[] = [];
  if (!accounts.length) warnings.push("No Gmail accounts supplied; list configured Gmail accounts or pass account readiness first.");
  if (totals.authIssues) warnings.push("Some Gmail accounts are missing OAuth/auth readiness.");
  if (totals.missingLabel) warnings.push("Some Gmail accounts are missing the outreach label; preview only prepares approval payloads, it does not label threads.");
  if (replyQueue.some((reply) => !reply.knownLead && reply.email)) warnings.push("Some replies do not match supplied known leads; run identify_email or Gmail lead context before drafting.");
  const status: GmailOutreachReadinessPreview["status"] = !accounts.length
    ? "blocked"
    : totals.authIssues || totals.missingLabel || totals.unreadLeadReplies || totals.positiveReplies || warnings.length
      ? "attention"
      : "ready";

  return {
    mode: "gmail-outreach-readiness-preview",
    status,
    summary: `Gmail outreach readiness ${status}: ${totals.accounts} uctov, ${totals.authReady} auth ready, ${totals.labelReady} label ready, ${totals.unreadLeadReplies} unread lead replies, ${totals.positiveReplies} pozitivnych odpovedi. Ziadny Gmail label, reply ani DB zapis neprebehol.`,
    targetLabel,
    totals,
    accounts,
    replyQueue,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

const defaultGoogleSheetLeadHeaders = [
  "Status",
  "Web",
  "Official Company Name",
  "ICO",
  "Address",
  "Decision Maker",
  "Last Name / Salutation",
  "Stakeholders",
  "Email",
  "Icebreaker",
  "Original Name",
  "Note",
  "Campaign",
];

export function buildGoogleSheetSyncPreview(input: {
  leads?: Array<LeadCandidateInput & { raw?: Record<string, string>; verificationStatus?: string; campaignTag?: string; ico?: string; address?: string }>;
  csvText?: string;
  delimiter?: "," | ";";
  sourceName?: string;
  spreadsheetId?: string;
  range?: string;
  clearRange?: string;
  accountEnvKey?: string;
  includeHeader?: boolean;
  maxRows?: number;
  previewRows?: number;
}): GoogleSheetSyncPreview {
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : undefined;
  const leads = [...(input.leads ?? []), ...(parsed?.leads ?? [])];
  const includeHeader = input.includeHeader !== false;
  const range = input.range ?? "Leads!A1";
  const clearRange = input.clearRange ?? "Leads!A1:M5000";
  const dataRows = leads.map(googleSheetLeadRow);
  const rows = includeHeader ? [defaultGoogleSheetLeadHeaders, ...dataRows] : dataRows;
  const replaceApprovalPayload = rows.length
    ? {
        spreadsheetId: input.spreadsheetId,
        range,
        clearRange,
        accountEnvKey: input.accountEnvKey,
        rows,
      }
    : undefined;
  const missingEmail = leads.filter((lead) => !sheetLeadValue(lead, "email", "primary_email", "smartlead_emails")).length;
  const missingWebsite = leads.filter((lead) => !sheetLeadValue(lead, "website", "web", "url", "domain", "google_domain")).length;
  const missingIntro = leads.filter((lead) => !sheetLeadValue(lead, "personalizedIntro", "personalized_intro", "icebreaker_sentence", "icebreaker")).length;
  const status: GoogleSheetSyncPreview["status"] = leads.length === 0 ? "blocked" : missingEmail || missingWebsite || missingIntro || (parsed?.skipped.length ?? 0) ? "attention" : "ready";
  const nextToolCalls: GoogleSheetSyncPreview["nextToolCalls"] = [];
  if (replaceApprovalPayload) {
    nextToolCalls.push({
      tool: "arcigy.replace_google_sheet_rows",
      payload: replaceApprovalPayload,
      reason: "Po kontrole riadkov prepis cielovy Google Sheet cez clear+update.",
      approvalRequired: true,
    });
  }
  return {
    mode: "google-sheet-sync-preview",
    status,
    summary: `Google Sheet sync preview ${status}: ${dataRows.length} lead rows, ${missingEmail} bez emailu, ${missingWebsite} bez webu, ${missingIntro} bez intra. Ziadny zapis do Google Sheets neprebehol.`,
    sheet: { spreadsheetId: input.spreadsheetId, range, clearRange, accountEnvKey: input.accountEnvKey, includeHeader },
    totals: {
      input: leads.length,
      rows: rows.length,
      dataRows: dataRows.length,
      missingEmail,
      missingWebsite,
      missingIntro,
      skipped: parsed?.skipped.length ?? 0,
    },
    headers: defaultGoogleSheetLeadHeaders,
    rowsPreview: rows.slice(0, Math.min(Math.max(Math.trunc(input.previewRows ?? 5), 1), 25)),
    replaceApprovalPayload,
    nextToolCalls,
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

export function buildMapsColdCallingExportPreview(input: {
  leads?: LeadCandidateInput[];
  csvText?: string;
  delimiter?: "," | ";";
  maxRows?: number;
  results?: Array<Record<string, unknown>>;
  placesResults?: Array<Record<string, unknown>>;
  sourceName?: string;
  sourceType?: "google_places" | "csv" | "manual" | "mixed";
  defaultRegion?: string;
  country?: string;
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingDomains?: string[];
  existingPhones?: string[];
  maxResults?: number;
  maxNextCalls?: number;
}): MapsColdCallingExportPreview {
  const country = (input.country ?? "SK").toUpperCase();
  const maxResults = Math.min(Math.max(Math.trunc(input.maxResults ?? 1000), 1), 5000);
  const rawRows = [...(input.results ?? []), ...(input.placesResults ?? [])].slice(0, maxResults);
  const parsed = input.csvText?.trim() ? parseLeadsCsv({ csvText: input.csvText, delimiter: input.delimiter, maxRows: input.maxRows }) : undefined;
  const sourceType = input.sourceType ?? (rawRows.length && parsed?.leads.length ? "mixed" : rawRows.length ? "google_places" : parsed?.leads.length ? "csv" : "manual");
  const mappedRows = rawRows.map((row, index) => mapResearchResultRow(row, "google_places", input.sourceName, undefined, input.defaultRegion, index));
  const inputLeads = [...(input.leads ?? []), ...(parsed?.leads ?? []), ...mappedRows];
  const filtered = filterBlacklistedLeads({ leads: inputLeads, domains: input.blacklistDomains, keywords: input.blacklistKeywords });
  const existingDomains = new Set((input.existingDomains ?? []).map(normalizeDomain).filter(Boolean));
  const existingPhones = new Set((input.existingPhones ?? []).map(phoneDedupeKey).filter(Boolean));
  const seenKeys = new Map<string, LeadCandidateInput>();
  const callableRows: MapsColdCallingExportPreview["callableRows"] = [];
  const needsPhoneScrape: LeadCandidateInput[] = [];
  const invalidWebsite: LeadCandidateInput[] = [];
  const duplicates: MapsColdCallingExportPreview["duplicates"] = [];

  for (const lead of filtered.allowed) {
    const phone = normalizePhoneCandidate(lead.phone ?? stringField(lead.customFields ?? {}, "phone", "phones", "phone_number", "international_phone", "national_phone_number", "tel") ?? "");
    const domain = lead.website ? normalizeDomain(lead.website) : "";
    const phoneKey = phone ? phoneDedupeKey(phone) : "";
    const fallbackKey = slugify([lead.companyName, coldCallCity(lead, input.defaultRegion)].filter(Boolean).join(" "));
    const key = phoneKey || domain || fallbackKey;
    if ((domain && existingDomains.has(domain)) || (phoneKey && existingPhones.has(phoneKey)) || (key && seenKeys.has(key))) {
      duplicates.push({ lead, duplicateOf: domain || phoneKey || key, reason: "duplicate domain/phone/company in cold calling input" });
      continue;
    }
    if (key) seenKeys.set(key, lead);
    if (!phone) {
      if (isScrapableLeadWebsite(lead.website)) needsPhoneScrape.push(lead);
      else invalidWebsite.push(lead);
      continue;
    }
    callableRows.push({
      ...lead,
      phone,
      city: coldCallCity(lead, input.defaultRegion),
      address: stringField(lead.customFields ?? {}, "research_address", "address", "formatted_address", "vicinity", "district_city"),
      placeId: stringField(lead.customFields ?? {}, "google_place_id", "place_id", "placeId"),
      rating: numberFromLead(lead, "rating", "google_rating"),
      reviewCount: numberFromLead(lead, "reviewCount", "review_count", "reviews", "user_rating_count"),
      source: lead.source ?? input.sourceName ?? sourceType,
      customFields: {
        ...lead.customFields,
        city: coldCallCity(lead, input.defaultRegion),
        address: stringField(lead.customFields ?? {}, "research_address", "address", "formatted_address", "vicinity", "district_city"),
        phone,
        cold_call_source: input.sourceName ?? sourceType,
      },
    });
  }

  const exportPreview = serializeLeadsCsv({
    leads: callableRows,
    columns: ["companyName", "phone", "city", "website", "address", "source", "rating", "reviewCount", "placeId"],
  });
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const nextToolCalls: MapsColdCallingExportPreview["nextToolCalls"] = [];
  if (needsPhoneScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.build_phone_enrichment_queue_preview",
      payload: { leads: needsPhoneScrape.slice(0, maxNextCalls), sourceName: input.sourceName, countryFilter: input.country, maxNextCalls },
      reason: "Dohladat telefony pre Google Maps leady bez telefonu pred cold-calling exportom.",
      approvalRequired: false,
    });
  }
  if (callableRows.length) {
    nextToolCalls.push(
      {
        tool: "arcigy.build_lead_batch_qa_preview",
        payload: { leads: callableRows, sourceName: input.sourceName, requireEmail: false, requirePhoneOrDecisionMaker: true },
        reason: "Skontrolovat cold-calling leady pred exportom.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.export_leads_csv",
        payload: { leads: callableRows, columns: exportPreview.columns, approval: { approved: true } },
        reason: "Exportuj cold-calling CSV az po kontrole riadkov operatorom.",
        approvalRequired: true,
      }
    );
  }
  const warnings: string[] = [];
  if (rawRows.length >= maxResults) warnings.push("Maps results were truncated by maxResults.");
  const totals = {
    rawResults: rawRows.length,
    inputLeads: inputLeads.length,
    callable: callableRows.length,
    missingPhone: needsPhoneScrape.length + invalidWebsite.length,
    needsPhoneScrape: needsPhoneScrape.length,
    invalidWebsite: invalidWebsite.length,
    blocked: filtered.blocked.length,
    duplicates: duplicates.length,
  };
  const status: MapsColdCallingExportPreview["status"] = totals.inputLeads === 0 || totals.callable === 0 ? "blocked" : totals.missingPhone || totals.blocked || totals.duplicates || warnings.length ? "attention" : "ready";
  return {
    mode: "maps-cold-calling-export-preview",
    status,
    summary: `Maps cold-calling export ${status}: ${totals.callable} callable, ${totals.needsPhoneScrape} potrebuje phone scrape, ${totals.duplicates} duplicity. Ziadny zapis ani export neprebehol.`,
    source: { name: input.sourceName, type: sourceType, country, defaultRegion: input.defaultRegion, parsedFromCsv: parsed?.leads.length ?? 0 },
    totals,
    callableRows,
    needsPhoneScrape,
    invalidWebsite,
    blocked: filtered.blocked,
    duplicates,
    exportPreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
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

export function buildLeadValidationScorecardPreview(input: {
  leads: Array<LeadCandidateInput & { id?: string | number; sentToSmartlead?: boolean; sent_to_smartlead?: boolean; verificationStatus?: "ok" | "flagged" | "failed" | "verified"; registerVerified?: boolean; decisionMakerName?: string; decision_maker_name?: string }>;
  minScore?: number;
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null };
  campaignId?: string | number | null;
  defaultSource?: string;
  includeSentToSmartlead?: boolean;
  batchSize?: number;
  maxNextCalls?: number;
}): LeadValidationScorecardPreview {
  const minScore = Math.min(Math.max(Math.trunc(input.minScore ?? 50), 0), 100);
  const includeSentToSmartlead = input.includeSentToSmartlead === true;
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 500);
  const scoredInput = input.leads.filter((lead) => includeSentToSmartlead || !leadSentToSmartlead(lead));
  const score = scoreLeadQuality({
    leads: scoredInput.map((lead) => ({
      email: lead.email,
      companyName: lead.companyName,
      website: lead.website,
      decisionMaker: decisionMakerForLead(lead as ManualReviewPickupLead) ?? stringField(lead.customFields ?? {}, "decision_maker_name", "decision_maker_full_name"),
      ico: stringField(lead.customFields ?? {}, "ico"),
      registerVerified: lead.registerVerified ?? booleanField(lead.customFields ?? {}, "register_verified", "orsr_verified"),
      personalizedIntro: lead.personalizedIntro ?? stringField(lead.customFields ?? {}, "personalized_intro", "icebreaker_sentence"),
      verificationStatus: normalizeLeadQualityVerificationStatus(lead.verificationStatus ?? stringField(lead.customFields ?? {}, "verification_status")),
    })),
    minScore,
  });
  const items: LeadValidationScorecardPreview["items"] = [
    ...input.leads
      .filter((lead) => !includeSentToSmartlead && leadSentToSmartlead(lead))
      .map((lead) => ({ lead, status: "excluded_sent" as const, score: 0, passed: false, reasons: ["already_sent_to_smartlead"] })),
    ...scoredInput.map((lead, index) => {
      const scored = score.scoredLeads[index];
      return {
        lead,
        status: scored.passed ? "qualified" as const : "below_threshold" as const,
        score: scored.score,
        passed: scored.passed,
        reasons: scored.reasons,
      };
    }),
  ];
  const qualifiedLeads: PreparedSmartleadLeadInput[] = items
    .filter((item) => item.status === "qualified")
    .map((item) => ({
      email: item.lead.email ?? "",
      companyName: item.lead.companyName,
      firstName: item.lead.firstName,
      lastName: item.lead.lastName,
      website: item.lead.website,
      phone: item.lead.phone,
      source: input.defaultSource ?? item.lead.source ?? input.niche?.slug,
      personalizedIntro: item.lead.personalizedIntro ?? stringField(item.lead.customFields ?? {}, "personalized_intro", "icebreaker_sentence"),
      customFields: {
        ...item.lead.customFields,
        lead_score: item.score,
        lead_score_min: minScore,
        lead_validation_status: "qualified",
        source_name: input.defaultSource ?? item.lead.customFields?.source_name,
      },
    }));
  const failedLeads = items.filter((item) => item.status === "below_threshold").map((item) => item.lead);
  const smartleadPrepared = prepareSmartleadLeads({ leads: qualifiedLeads, defaultSource: input.defaultSource ?? input.niche?.slug ?? "lead-validation-scorecard" });
  const injectionPlan = input.niche && qualifiedLeads.length
    ? buildSmartleadInjectionPlan({ niche: { ...input.niche, campaignId: input.campaignId ?? input.niche.campaignId }, leads: qualifiedLeads as ManualReviewPickupLead[], batchSize: input.batchSize })
    : undefined;
  const nextToolCalls: LeadValidationScorecardPreview["nextToolCalls"] = [];
  if (qualifiedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.prepare_smartlead_leads",
      payload: { leads: qualifiedLeads.slice(0, maxNextCalls), defaultSource: input.defaultSource ?? input.niche?.slug ?? "lead-validation-scorecard" },
      reason: "Normalizovat qualified leady do Smartlead lead_list payloadu bez uploadu.",
      approvalRequired: false,
    });
    if (input.niche) {
      nextToolCalls.push({
        tool: "arcigy.build_smartlead_injection_plan",
        payload: { niche: { ...input.niche, campaignId: input.campaignId ?? input.niche.campaignId }, leads: qualifiedLeads.slice(0, maxNextCalls), batchSize: input.batchSize },
        reason: "Z qualified leadov pripravit batche a approval payload pre Smartlead upload.",
        approvalRequired: false,
      });
    }
  }
  if (failedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_manual_review_queue",
      payload: { leads: failedLeads.slice(0, maxNextCalls), minScore },
      reason: "Leadom pod prahom pripravit manual review alebo opravy pred uploadom.",
      approvalRequired: false,
    });
  }
  const excludedSentToSmartlead = items.filter((item) => item.status === "excluded_sent").length;
  const totals = {
    input: input.leads.length,
    scored: scoredInput.length,
    passed: score.passed,
    failed: score.failed,
    excludedSentToSmartlead,
    averageScore: score.averageScore,
    smartleadReady: smartleadPrepared.leadList.length,
  };
  const status: LeadValidationScorecardPreview["status"] = totals.scored === 0
    ? "blocked"
    : totals.passed === 0 || totals.failed > 0 || excludedSentToSmartlead > 0
      ? "attention"
      : "ready";
  return {
    mode: "lead-validation-scorecard-preview",
    status,
    summary: `Lead validation scorecard ${status}: ${totals.passed}/${totals.scored} preslo minScore ${minScore}, priemer ${totals.averageScore}/100, ${totals.smartleadReady} ready pre Smartlead. Ziadny DB zapis ani upload neprebehol.`,
    source: { niche: input.niche, campaignId: input.campaignId ?? input.niche?.campaignId, minScore, includeSentToSmartlead },
    totals,
    buckets: score.buckets,
    items,
    qualifiedLeads,
    failedLeads,
    smartleadPrepared,
    injectionPlan,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
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

export async function buildLocalLeadRegisterUpdatePreview(
  input: {
    primaryEmail: string;
    kind?: LocalPersonKind;
    displayName?: string;
    companyName?: string;
    status?: string;
    data?: Record<string, unknown>;
    ico?: string;
    officialCompanyName?: string;
  },
  fetchImpl: FetchLike = fetch
): Promise<LocalLeadRegisterUpdatePreview> {
  const primaryEmail = input.primaryEmail.trim().toLowerCase();
  if (!primaryEmail.includes("@")) throw new Error("primaryEmail must be a valid email.");
  const existingData = isRecord(input.data) ? input.data : {};
  const ico = input.ico?.replace(/\s/g, "") || stringField(existingData, "ico");
  const companyName = input.officialCompanyName?.trim() || stringField(existingData, "official_company_name") || input.companyName?.trim();
  const register = await enrichSlovakCompanyRegister({ ico, companyName }, fetchImpl);
  const selectedDecisionMaker = register.executives[0];
  const split = splitName(selectedDecisionMaker);
  const gender = inferSlovakGender(split.firstName, split.lastName);
  const salutation = gender === "female" ? "pani" : gender === "male" ? "pan" : split.lastName ? "pan" : undefined;
  const lastNameWithSalutation = salutation && split.lastName ? `${salutation} ${split.lastName}` : undefined;
  const dataPatch = cleanRecord({
    register: cleanRecord({
      found: register.found,
      source: register.source,
      sourceUrl: register.sourceUrl,
      fetchedAt: register.fetchedAt,
      companyName: register.companyName,
      ico: register.ico,
      address: register.address,
      executives: register.executives,
    }),
    official_company_name: register.companyName,
    address: register.address,
    ico: register.ico,
    decision_maker_name: selectedDecisionMaker,
    decision_maker_first_name: split.firstName,
    decision_maker_last_name: split.lastName,
    decision_maker_gender: gender,
    last_name_with_salutation: lastNameWithSalutation,
    greeting: lastNameWithSalutation ? `Dobry den ${lastNameWithSalutation}` : undefined,
    orsr_verified: register.found,
  });
  const mergedData = { ...existingData, ...dataPatch };
  const status: LocalLeadRegisterUpdatePreview["status"] = !ico && !companyName ? "blocked" : register.found ? "ready" : "attention";
  const upsertPayload = register.found
    ? {
        primaryEmail,
        kind: input.kind ?? "lead",
        displayName: input.displayName,
        companyName: register.companyName ?? input.companyName,
        status: input.status ?? "active",
        data: mergedData,
        approval: { approved: true as const },
      }
    : undefined;
  return {
    mode: "local-lead-register-update-preview",
    status,
    summary: register.found
      ? `Local lead register update preview: ORSR nasiel ${register.companyName ?? companyName ?? primaryEmail}, decision maker ${selectedDecisionMaker ?? "nezisteny"}. Ziadny zapis neprebehol.`
      : `Local lead register update preview: ORSR nenasiel zhodu pre ${ico ?? companyName ?? primaryEmail}. Ziadny zapis neprebehol.`,
    register,
    selectedDecisionMaker,
    dataPatch,
    upsertPayload,
    nextToolCalls: upsertPayload
      ? [
          {
            tool: "arcigy.apply_local_lead_register_update",
            payload: upsertPayload,
            reason: "Po kontrole uloz ORSR enrichment do lokalnej lead/client memory osoby.",
            approvalRequired: true,
          },
        ]
      : [],
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

export function buildBulkSmartleadUploadQueuePreview(input: {
  campaigns: Array<{
    niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
    leads: ManualReviewPickupLead[];
    priority?: number;
    dailyLimit?: number;
    alreadySentToday?: number;
    maxUpload?: number;
    paused?: boolean;
  }>;
  batchSize?: number;
  defaultDailyLimit?: number;
  globalMaxUploads?: number;
  includeCampaignSetupDrafts?: boolean;
}): BulkSmartleadUploadQueuePreview {
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const defaultDailyLimit = Math.min(Math.max(Math.trunc(input.defaultDailyLimit ?? 50), 1), 500);
  let globalRemaining = Math.min(Math.max(Math.trunc(input.globalMaxUploads ?? 500), 1), 5000);
  const warnings: string[] = [];
  const sorted = input.campaigns
    .map((campaign, index) => ({ ...campaign, index, priority: Math.min(Math.max(Math.trunc(campaign.priority ?? 50), 1), 99) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);

  const queue: BulkSmartleadUploadQueuePreview["queue"] = [];
  const nextToolCalls: BulkSmartleadUploadQueuePreview["nextToolCalls"] = [];

  for (const item of sorted) {
    const slug = item.niche.slug?.trim() || slugify(item.niche.name);
    const campaignId = item.niche.campaignId ?? item.niche.smartleadCampaignId ?? null;
    const dailyLimit = Math.min(Math.max(Math.trunc(item.dailyLimit ?? defaultDailyLimit), 1), 500);
    const alreadySentToday = Math.max(Math.trunc(item.alreadySentToday ?? 0), 0);
    const remainingToday = Math.max(dailyLimit - alreadySentToday, 0);
    const campaignMax = Math.min(Math.max(Math.trunc(item.maxUpload ?? remainingToday), 0), remainingToday, globalRemaining);
    const eligibleLeads = uniqueByLeadIdentity(item.leads.filter((lead) => !lead.sentToSmartlead && !lead.sent_to_smartlead));
    const uploadCandidates = eligibleLeads.slice(0, campaignMax);
    const niche = { id: item.niche.id, slug, name: item.niche.name, campaignId };
    const injectionPlan = buildSmartleadInjectionPlan({ niche, leads: uploadCandidates, batchSize });
    const skippedLeads = Math.max(item.leads.length - injectionPlan.totals.prepared, 0) + injectionPlan.totals.skipped;
    let status: BulkSmartleadUploadQueuePreview["queue"][number]["status"] = "ready";
    let reason = `${injectionPlan.totals.prepared} leadov pripravenych na approval upload.`;
    if (item.paused) {
      status = "blocked";
      reason = "Campaign is paused in the input.";
    } else if (!slug || !item.niche.name.trim()) {
      status = "blocked";
      reason = "Missing niche name/slug.";
    } else if (!campaignId) {
      status = "attention";
      reason = "Missing Smartlead campaignId; create or map campaign before upload.";
    } else if (remainingToday <= 0 || globalRemaining <= 0) {
      status = "attention";
      reason = "Daily/global upload capacity is exhausted.";
    } else if (injectionPlan.totals.prepared <= 0) {
      status = "attention";
      reason = "No prepared leads passed Smartlead validation.";
    }
    if (status === "ready" && injectionPlan.totals.prepared > 0) {
      globalRemaining = Math.max(globalRemaining - injectionPlan.totals.prepared, 0);
    }
    queue.push({
      order: queue.length + 1,
      priority: item.priority,
      status,
      reason,
      niche,
      dailyLimit,
      alreadySentToday,
      remainingToday,
      inputLeads: item.leads.length,
      uploadLeads: injectionPlan.totals.prepared,
      skippedLeads,
      injectionPlan,
    });
    if (injectionPlan.addLeadsApprovalPayload && status === "ready") {
      nextToolCalls.push({
        tool: "arcigy.add_leads_to_smartlead_campaign",
        payload: injectionPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>,
        reason: `Po schvaleni uploadni ${injectionPlan.totals.prepared} leadov do kampane ${campaignId}.`,
        approvalRequired: true,
      });
    } else if (!campaignId && input.includeCampaignSetupDrafts !== false) {
      nextToolCalls.push({
        tool: "arcigy.draft_niche_smartlead_campaign_setup",
        payload: { niche: { id: item.niche.id, slug, name: item.niche.name } },
        reason: `Campaign ${item.niche.name} nema Smartlead campaignId; priprav setup pred uploadom.`,
        approvalRequired: false,
      });
    }
  }

  const approvalPayloads = queue
    .map((item) => item.injectionPlan.addLeadsApprovalPayload)
    .filter((payload): payload is NonNullable<SmartleadInjectionPlan["addLeadsApprovalPayload"]> => Boolean(payload));
  const totals = {
    campaigns: input.campaigns.length,
    queuedCampaigns: queue.filter((item) => item.status === "ready").length,
    skippedCampaigns: queue.filter((item) => item.status !== "ready").length,
    inputLeads: input.campaigns.reduce((sum, item) => sum + item.leads.length, 0),
    eligibleLeads: queue.reduce((sum, item) => sum + item.injectionPlan.totals.input, 0),
    uploadLeads: queue.reduce((sum, item) => sum + item.uploadLeads, 0),
    skippedLeads: queue.reduce((sum, item) => sum + item.skippedLeads, 0),
    approvalPayloads: approvalPayloads.length,
  };
  if (queue.some((item) => !item.niche.campaignId)) warnings.push("Some campaigns are missing Smartlead campaignId.");
  if (queue.some((item) => item.status === "blocked")) warnings.push("At least one campaign is blocked and should not be uploaded.");
  const status: BulkSmartleadUploadQueuePreview["status"] = totals.queuedCampaigns === 0
    ? "blocked"
    : warnings.length || totals.skippedCampaigns > 0
      ? "attention"
      : "ready";
  return {
    mode: "bulk-smartlead-upload-queue-preview",
    status,
    summary: `Bulk Smartlead upload queue ${status}: ${totals.uploadLeads} leadov v ${totals.queuedCampaigns}/${totals.campaigns} kampaniach, ${totals.approvalPayloads} approval payloadov. Ziadny upload ani zapis neprebehol.`,
    totals,
    queue,
    approvalPayloads,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    warnings,
  };
}

export function buildSmartleadSendReadinessQueuePreview(input: {
  campaigns: Array<{
    niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
    leads: Array<LeadRepairQueueLead & { companyNameShort?: string; company_name_short?: string; official_company_name?: string; original_name?: string; decision_maker_last_name?: string; sentToSmartlead?: boolean; sent_to_smartlead?: boolean }>;
    priority?: number;
    dailyLimit?: number;
    alreadySentToday?: number;
    paused?: boolean;
    defaultSource?: string;
    campaignTag?: string;
  }>;
  date?: string;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  defaultDailyLimit?: number;
  globalMaxUploads?: number;
}): SmartleadSendReadinessQueuePreview {
  const defaultDailyLimit = Math.min(Math.max(Math.trunc(input.defaultDailyLimit ?? 50), 1), 500);
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const minScore = Math.min(Math.max(Math.trunc(input.minScore ?? 70), 0), 100);
  const sorted = input.campaigns
    .map((campaign, index) => ({ ...campaign, index, priority: Math.min(Math.max(Math.trunc(campaign.priority ?? 50), 1), 99) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);

  const queue: SmartleadSendReadinessQueuePreview["queue"] = sorted.map((campaign, index) => {
    const slug = campaign.niche.slug?.trim() || slugify(campaign.niche.name);
    const campaignId = campaign.niche.campaignId ?? campaign.niche.smartleadCampaignId ?? null;
    const niche = { id: campaign.niche.id, slug, name: campaign.niche.name, campaignId };
    const dailyLimit = Math.min(Math.max(Math.trunc(campaign.dailyLimit ?? defaultDailyLimit), 1), 500);
    const alreadySentToday = Math.max(Math.trunc(campaign.alreadySentToday ?? 0), 0);
    const qaPreview = buildLeadBatchQaPreview({
      leads: campaign.leads,
      campaignTag: campaign.campaignTag ?? slug,
      defaultSource: campaign.defaultSource ?? slug,
      campaignId,
      offer: input.offer,
      language: input.language,
    });
    const scorecard = buildLeadValidationScorecardPreview({
      leads: qaPreview.readyLeads,
      minScore,
      niche,
      campaignId,
      defaultSource: campaign.defaultSource ?? slug,
      batchSize,
      includeSentToSmartlead: false,
    });
    const uploadPlan = scorecard.injectionPlan;
    let status: SmartleadSendReadinessQueuePreview["queue"][number]["status"] = "ready";
    let reason = `${scorecard.totals.smartleadReady} leadov pripravenych na Smartlead approval upload.`;
    if (campaign.paused) {
      status = "blocked";
      reason = "Campaign is paused.";
    } else if (!campaign.niche.name.trim() || !slug) {
      status = "blocked";
      reason = "Missing niche name or slug.";
    } else if (!campaignId) {
      status = "attention";
      reason = "Missing Smartlead campaignId.";
    } else if (alreadySentToday >= dailyLimit) {
      status = "attention";
      reason = "Daily send limit is already filled.";
    } else if (qaPreview.totals.readyForSmartlead <= 0 || scorecard.totals.smartleadReady <= 0) {
      status = "attention";
      reason = "No lead passed QA and validation.";
    } else if (qaPreview.totals.repair || qaPreview.totals.manualReview || scorecard.totals.failed) {
      status = "attention";
      reason = "Some leads need repair/manual review before upload.";
    }
    return {
      order: index + 1,
      priority: campaign.priority,
      status,
      reason,
      niche,
      dailyLimit,
      alreadySentToday,
      qaPreview,
      scorecard,
      uploadPlan,
    };
  });

  const bulkUploadQueue = buildBulkSmartleadUploadQueuePreview({
    campaigns: queue.map((item) => ({
      niche: item.niche,
      priority: item.priority,
      dailyLimit: item.dailyLimit,
      alreadySentToday: item.alreadySentToday,
      paused: item.status === "blocked",
      leads: item.scorecard.qualifiedLeads as ManualReviewPickupLead[],
    })),
    batchSize,
    defaultDailyLimit,
    globalMaxUploads: input.globalMaxUploads,
  });
  const warnings: string[] = [];
  if (queue.some((item) => !item.niche.campaignId)) warnings.push("Some campaigns are missing Smartlead campaignId.");
  if (queue.some((item) => item.qaPreview.totals.repair || item.qaPreview.totals.manualReview)) warnings.push("Some campaigns still have repair or manual-review leads.");
  const totals = {
    campaigns: queue.length,
    readyCampaigns: queue.filter((item) => item.status === "ready").length,
    attentionCampaigns: queue.filter((item) => item.status === "attention").length,
    blockedCampaigns: queue.filter((item) => item.status === "blocked").length,
    inputLeads: input.campaigns.reduce((sum, item) => sum + item.leads.length, 0),
    qaReady: queue.reduce((sum, item) => sum + item.qaPreview.totals.readyForSmartlead, 0),
    qualified: queue.reduce((sum, item) => sum + item.scorecard.totals.passed, 0),
    uploadReady: bulkUploadQueue.totals.uploadLeads,
    repair: queue.reduce((sum, item) => sum + item.qaPreview.totals.repair + item.qaPreview.totals.manualReview + item.scorecard.totals.failed, 0),
    approvalPayloads: bulkUploadQueue.totals.approvalPayloads,
  };
  const status: SmartleadSendReadinessQueuePreview["status"] = totals.readyCampaigns === 0
    ? "blocked"
    : totals.attentionCampaigns || totals.blockedCampaigns || warnings.length
      ? "attention"
      : "ready";
  const nextToolCalls: SmartleadSendReadinessQueuePreview["nextToolCalls"] = [
    ...queue.flatMap((item) => [
      {
        tool: "arcigy.build_lead_batch_qa_preview",
        payload: { leads: item.qaPreview.items.map((qa) => qa.lead), campaignTag: item.niche.slug, campaignId: item.niche.campaignId, offer: input.offer, language: input.language ?? "sk" },
        reason: `Zopakuj QA pre kampan ${item.niche.name}, ak sa zmenili leady alebo opravy.`,
        approvalRequired: false,
      },
      {
        tool: "arcigy.build_lead_validation_scorecard_preview",
        payload: { leads: item.qaPreview.readyLeads, niche: item.niche, campaignId: item.niche.campaignId, minScore, batchSize },
        reason: `Prever score qualified leadov pre ${item.niche.name} pred uploadom.`,
        approvalRequired: false,
      },
    ]),
    ...bulkUploadQueue.nextToolCalls,
  ];
  return {
    mode: "smartlead-send-readiness-queue-preview",
    status,
    summary: `Smartlead send readiness ${status}: ${totals.readyCampaigns}/${totals.campaigns} kampani ready, ${totals.uploadReady} leadov upload-ready, ${totals.repair} potrebuje opravu, ${totals.approvalPayloads} approval payloadov. Ziadny zapis ani upload neprebehol.`,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    totals,
    queue,
    bulkUploadQueue,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    warnings,
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

export function buildSmartleadCampaignSyncPlanPreview(input: {
  campaignId?: string | number | null;
  localLeads: SmartleadLead[];
  remoteLeads?: Array<SmartleadLead & { id?: string | number; lead_id?: string | number }>;
  updateExisting?: boolean;
}): SmartleadCampaignSyncPlanPreview {
  const prepared = prepareSmartleadLeads({
    leads: input.localLeads.map((lead) => ({
      email: lead.email,
      firstName: lead.first_name,
      lastName: lead.last_name,
      companyName: lead.company_name,
      website: lead.website,
      customFields: lead.custom_fields,
    })),
  });
  const campaignId = input.campaignId ?? undefined;
  const remoteByEmail = new Map((input.remoteLeads ?? [])
    .filter((lead) => lead.email?.trim())
    .map((lead) => [lead.email.trim().toLowerCase(), lead]));
  const missingInSmartlead: SmartleadLead[] = [];
  const updateExisting: SmartleadCampaignSyncPlanPreview["updateExisting"] = [];
  const unchanged: SmartleadLead[] = [];
  const skipped: SmartleadCampaignSyncPlanPreview["skipped"] = prepared.skipped.map((item) => ({ lead: { email: item.email ?? "" }, reason: item.reason }));
  for (const localLead of prepared.leadList) {
    const email = localLead.email.trim().toLowerCase();
    const remoteLead = remoteByEmail.get(email);
    if (!remoteLead) {
      missingInSmartlead.push(localLead);
      continue;
    }
    const { changedFields, payload } = buildSmartleadLeadSyncPayload(localLead, remoteLead);
    if (changedFields.length && input.updateExisting !== false) {
      updateExisting.push({ email, remoteLeadId: remoteLead.id ?? remoteLead.lead_id, payload, changedFields });
    } else {
      unchanged.push(localLead);
    }
  }
  const addLeadsApprovalPayload = campaignId && missingInSmartlead.length
    ? {
        campaignId,
        leads: missingInSmartlead,
        settings: { ignore_global_block_list: false as const, ignore_unsubscribe_list: false as const },
        approval: { approved: true as const },
      }
    : undefined;
  const manualUpdateApprovalPayloads = campaignId
    ? updateExisting
        .filter((item) => item.remoteLeadId !== undefined)
        .map((item) => ({
          method: "POST" as const,
          endpoint: `/campaigns/${campaignId}/leads/${item.remoteLeadId}`,
          campaignId,
          leadId: item.remoteLeadId as string | number,
          payload: item.payload,
          approval: { approved: true as const },
        }))
    : [];
  const nextToolCalls: SmartleadCampaignSyncPlanPreview["nextToolCalls"] = [];
  if (campaignId && missingInSmartlead.length) {
    nextToolCalls.push({
      tool: "arcigy.add_leads_to_smartlead_campaign",
      payload: addLeadsApprovalPayload as unknown as Record<string, unknown>,
      reason: "Nahrat leady, ktore este nie su v Smartlead kampani.",
      approvalRequired: true,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.build_smartlead_import_audit_preview",
    payload: { campaignId, leads: prepared.leadList, existingSmartleadLeads: input.remoteLeads ?? [] },
    reason: "Pred uploadom znovu overit duplicity a uz existujuce emaily.",
    approvalRequired: false,
  });
  const totals = {
    localLeads: input.localLeads.length,
    remoteLeads: input.remoteLeads?.length ?? 0,
    missingInSmartlead: missingInSmartlead.length,
    updateExisting: updateExisting.length,
    unchanged: unchanged.length,
    skipped: skipped.length,
  };
  const status: SmartleadCampaignSyncPlanPreview["status"] = !campaignId ? "blocked" : totals.missingInSmartlead || totals.updateExisting ? "attention" : "ready";
  return {
    mode: "smartlead-campaign-sync-plan-preview",
    status,
    summary: `Smartlead campaign sync plan ${status}: ${totals.missingInSmartlead} missing upload, ${totals.updateExisting} existing update, ${totals.unchanged} unchanged. Ziadny Smartlead ani DB zapis neprebehol.`,
    campaignId,
    totals,
    missingInSmartlead,
    updateExisting,
    unchanged,
    skipped,
    addLeadsApprovalPayload,
    manualUpdateApprovalPayloads,
    operatorRunbook: [
      "Ak kampan bezi, pred manual update krokmi ju najprv pauzni v Smartlead UI.",
      "Schval add_leads payload iba pre missingInSmartlead.",
      "Manual update payloady pouzi iba po kontrole changedFields a po explicitnom schvaleni.",
      "Po synchronizacii znovu zavolaj arcigy.get_smartlead_campaign_leads a tento sync plan.",
    ],
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildSmartleadLocalReconciliationPreview(input: {
  campaignId?: string | number | null;
  localLeads: Array<LeadCandidateInput & {
    id?: string | number;
    primary_email?: string;
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    smartleadContactId?: string | number;
    smartlead_contact_id?: string | number;
    replyStatus?: string;
    reply_status?: string;
    replySentiment?: string | null;
    reply_sentiment?: string | null;
  }>;
  remoteLeads?: Array<SmartleadLead & { id?: string | number; lead_id?: string | number; status?: string; category_name?: string | null; reply_status?: string; reply_sentiment?: string | null }>;
  syncUpdates?: Array<{ campaignId?: string | number; email: string; smartleadContactId?: string | number; status?: string; categoryName?: string | null; localUpdate?: Record<string, string | number | boolean | null | undefined> }>;
  maxNextCalls?: number;
}): SmartleadLocalReconciliationPreview {
  const campaignId = input.campaignId ?? input.syncUpdates?.[0]?.campaignId ?? null;
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 50), 1), 200);
  const localByEmail = new Map(input.localLeads.flatMap((lead) => {
    const email = localReconciliationEmail(lead);
    return email ? [[email, lead] as const] : [];
  }));
  const remoteRows = [
    ...(input.remoteLeads ?? []).map((lead) => ({ email: localReconciliationEmail(lead), remoteLead: lead, update: undefined })),
    ...(input.syncUpdates ?? []).map((update) => ({ email: update.email?.trim().toLowerCase(), remoteLead: undefined, update })),
  ].filter((item) => item.email);
  const remoteCounts = new Map<string, number>();
  for (const row of remoteRows) remoteCounts.set(row.email as string, (remoteCounts.get(row.email as string) ?? 0) + 1);
  const seenRemote = new Set<string>();
  const items: SmartleadLocalReconciliationPreview["items"] = [];
  for (const row of remoteRows) {
    const email = row.email as string;
    const localLead = localByEmail.get(email);
    const remoteLead = row.remoteLead;
    const update = row.update;
    const patch = localReconciliationPatch(localLead, remoteLead, update);
    const issues: string[] = [];
    if ((remoteCounts.get(email) ?? 0) > 1) issues.push("duplicate_remote_email");
    if (!localLead) issues.push("remote_email_not_found_locally");
    if (localLead && !leadSentToSmartlead(localLead)) issues.push("local_not_marked_sent");
    if (localLead && patch && (patch.reply_status !== undefined || patch.reply_sentiment !== undefined)) issues.push("reply_fields_need_update");
    const status: SmartleadLocalReconciliationPreview["items"][number]["status"] = issues.includes("duplicate_remote_email")
      ? "duplicate_remote"
      : !localLead
        ? "remote_unmatched"
        : issues.includes("local_not_marked_sent")
          ? "needs_local_mark_sent"
          : issues.includes("reply_fields_need_update")
            ? "needs_reply_update"
            : "already_synced";
    items.push({ email, localLead, remoteLead, status, issues, localUpdatePatch: patch });
    seenRemote.add(email);
  }
  for (const [email, localLead] of localByEmail.entries()) {
    if (!leadSentToSmartlead(localLead) || seenRemote.has(email)) continue;
    items.push({
      email,
      localLead,
      status: "local_sent_remote_missing",
      issues: ["local_marked_sent_but_missing_remote"],
    });
  }
  const localUpdatePatches = items
    .filter((item) => item.localLead && item.localUpdatePatch && (item.status === "needs_local_mark_sent" || item.status === "needs_reply_update"))
    .map((item) => ({ email: item.email, localId: item.localLead?.id, patch: item.localUpdatePatch as Record<string, string | number | boolean | null | undefined> }));
  const nextToolCalls: SmartleadLocalReconciliationPreview["nextToolCalls"] = [];
  if (campaignId) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId, offset: 0, limit: 500 },
      reason: "Pred lokalnym oznacenim sent_to_smartlead znovu nacitaj remote leady zo Smartlead kampane.",
      approvalRequired: false,
    });
  }
  const missingRemoteLocalLeads = items
    .filter((item) => item.status === "local_sent_remote_missing" && item.localLead)
    .map((item) => item.localLead as LeadCandidateInput)
    .slice(0, maxNextCalls);
  if (missingRemoteLocalLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_campaign_sync_plan_preview",
      payload: { campaignId, localLeads: missingRemoteLocalLeads.map(localLeadToSmartleadLead), remoteLeads: input.remoteLeads ?? [] },
      reason: "Lokálne marked sent leady chybaju v remote kampani; over missing upload/update plan.",
      approvalRequired: false,
    });
  }
  if (localUpdatePatches.length) {
    nextToolCalls.push({
      tool: "arcigy.get_local_memory_snapshot",
      payload: { limit: Math.min(localUpdatePatches.length, maxNextCalls) },
      reason: "Pred lokalnym zapisom ukaz snapshot a porovnaj patch payloady; tento preview sam nic nezapisuje.",
      approvalRequired: false,
    });
  }
  const totals = {
    localLeads: input.localLeads.length,
    remoteLeads: remoteRows.length,
    matched: items.filter((item) => item.localLead && item.remoteLead || item.localLead && item.localUpdatePatch).length,
    needsLocalMarkSent: items.filter((item) => item.status === "needs_local_mark_sent").length,
    needsReplyUpdate: items.filter((item) => item.status === "needs_reply_update").length,
    localSentRemoteMissing: items.filter((item) => item.status === "local_sent_remote_missing").length,
    alreadySynced: items.filter((item) => item.status === "already_synced").length,
    remoteUnmatched: items.filter((item) => item.status === "remote_unmatched").length,
    duplicateRemoteEmails: items.filter((item) => item.status === "duplicate_remote").length,
  };
  const status: SmartleadLocalReconciliationPreview["status"] = !input.localLeads.length && !remoteRows.length
    ? "blocked"
    : totals.needsLocalMarkSent || totals.needsReplyUpdate || totals.localSentRemoteMissing || totals.remoteUnmatched || totals.duplicateRemoteEmails
      ? "attention"
      : "ready";
  return {
    mode: "smartlead-local-reconciliation-preview",
    status,
    summary: `Smartlead local reconciliation ${status}: ${totals.needsLocalMarkSent} oznacit sent, ${totals.needsReplyUpdate} reply update, ${totals.localSentRemoteMissing} lokalne sent ale remote chyba, ${totals.remoteUnmatched} remote bez lokalneho leada. Ziadny DB ani Smartlead zapis neprebehol.`,
    campaignId,
    totals,
    items,
    localUpdatePatches,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
  };
}

export function buildSmartleadSafeSyncRunbookPreview(input: {
  campaignId?: string | number | null;
  campaignName?: string;
  localLeads: SmartleadLead[];
  remoteLeads?: Array<SmartleadLead & { id?: string | number; lead_id?: string | number }>;
  campaignSnapshot?: SmartleadCampaignBackupPlanCampaign;
  updateExisting?: boolean;
  requirePause?: boolean;
  includeBackupPlan?: boolean;
}): SmartleadSafeSyncRunbookPreview {
  const campaignId = input.campaignId ?? input.campaignSnapshot?.id ?? null;
  const syncPlan = buildSmartleadCampaignSyncPlanPreview({
    campaignId,
    localLeads: input.localLeads,
    remoteLeads: input.remoteLeads,
    updateExisting: input.updateExisting,
  });
  const backupPlan = input.includeBackupPlan === false
    ? undefined
    : buildSmartleadCampaignBackupPlan({
        campaigns: [{
          ...(input.campaignSnapshot ?? {}),
          id: campaignId ?? input.campaignSnapshot?.id,
          name: input.campaignName ?? input.campaignSnapshot?.name ?? "Smartlead campaign sync target",
          leads: input.remoteLeads,
        }],
        protectedCampaignIds: campaignId ? [campaignId] : undefined,
        includeDeletePlan: false,
        note: "Pre-sync backup plan generated before Smartlead lead sync.",
      });
  const phases: SmartleadSafeSyncRunbookPreview["phases"] = [];
  const pushMcpPhase = (
    tool: string,
    payload: Record<string, unknown>,
    instruction: string,
    approvalRequired = false,
    status: SmartleadSafeSyncRunbookPreview["phases"][number]["status"] = approvalRequired ? "approval_required" : "ready"
  ) => {
    phases.push({ order: phases.length + 1, key: `${phases.length + 1}-${tool.replace(/^arcigy\./, "")}`, kind: "mcp", tool, payload, instruction, status, approvalRequired });
  };
  const pushManualPhase = (key: string, instruction: string, status: SmartleadSafeSyncRunbookPreview["phases"][number]["status"] = "attention") => {
    phases.push({ order: phases.length + 1, key, kind: "manual", instruction, status, approvalRequired: false });
  };
  if (campaignId) {
    pushMcpPhase("arcigy.get_smartlead_campaign_leads", { campaignId, offset: 0, limit: 100 }, "Najprv nacitaj remote leady z kampane a az potom porovnaj sync plan.");
  } else {
    pushManualPhase("missing-campaign-id", "Dopln Smartlead campaignId pred syncom.", "blocked");
  }
  if (backupPlan) {
    pushMcpPhase("arcigy.build_smartlead_campaign_backup_plan", { campaigns: backupPlan.campaigns, protectedCampaignIds: campaignId ? [campaignId] : [], includeDeletePlan: false }, "Priprav backup manifest pred akoukolvek zmenou kampane.");
  }
  if (input.requirePause !== false) {
    pushManualPhase("pause-campaign", "Pred update/upload krokmi pauzni kampan v Smartlead UI alebo schval interny status endpoint mimo MCP.");
  }
  pushMcpPhase(
    "arcigy.build_smartlead_campaign_sync_plan_preview",
    { campaignId, localLeads: input.localLeads, remoteLeads: input.remoteLeads ?? [], updateExisting: input.updateExisting !== false },
    "Po nacitani remote leadov znovu prepocitaj missing/update/unchanged rozdelenie."
  );
  if (syncPlan.addLeadsApprovalPayload) {
    pushMcpPhase("arcigy.add_leads_to_smartlead_campaign", syncPlan.addLeadsApprovalPayload as unknown as Record<string, unknown>, "Uploadni iba missing leady po explicitnom schvaleni.", true);
  }
  for (const payload of syncPlan.manualUpdateApprovalPayloads) {
    pushManualPhase(`manual-update-${String(payload.leadId)}`, `Manualne aktualizuj Smartlead lead ${String(payload.leadId)} v kampani ${String(payload.campaignId)} po kontrole changedFields.`);
  }
  if (input.requirePause !== false) {
    pushManualPhase("resume-campaign", "Po uspesnom re-checku znovu spusti kampan v Smartlead UI.");
  }
  if (campaignId) {
    pushMcpPhase("arcigy.get_smartlead_campaign_leads", { campaignId, offset: 0, limit: 100 }, "Po synci nacitaj kampan znovu a over, ze missing/update rozdiely zmizli.");
  }
  const approvalSteps = phases.filter((phase) => phase.approvalRequired).length;
  const manualSteps = phases.filter((phase) => phase.kind === "manual").length;
  const status: SmartleadSafeSyncRunbookPreview["status"] =
    !campaignId || syncPlan.status === "blocked"
      ? "blocked"
      : syncPlan.totals.missingInSmartlead || syncPlan.totals.updateExisting || manualSteps
        ? "attention"
        : "ready";
  const nextToolCalls = dedupeNextToolCalls(phases
    .filter((phase): phase is SmartleadSafeSyncRunbookPreview["phases"][number] & { tool: string; payload: Record<string, unknown> } => phase.kind === "mcp" && Boolean(phase.tool && phase.payload))
    .map((phase) => ({
      tool: phase.tool,
      payload: phase.payload,
      reason: phase.instruction,
      approvalRequired: phase.approvalRequired,
    })));
  return {
    mode: "smartlead-safe-sync-runbook-preview",
    status,
    summary: `Smartlead safe sync runbook ${status}: ${syncPlan.totals.missingInSmartlead} missing upload, ${syncPlan.totals.updateExisting} update, ${syncPlan.totals.unchanged} unchanged, ${approvalSteps} approval krokov. Ziadny Smartlead ani DB zapis neprebehol.`,
    campaign: { id: campaignId, name: input.campaignName ?? input.campaignSnapshot?.name },
    totals: {
      localLeads: syncPlan.totals.localLeads,
      remoteLeads: syncPlan.totals.remoteLeads,
      missingInSmartlead: syncPlan.totals.missingInSmartlead,
      updateExisting: syncPlan.totals.updateExisting,
      unchanged: syncPlan.totals.unchanged,
      skipped: syncPlan.totals.skipped,
      approvalSteps,
      manualSteps,
    },
    syncPlan,
    backupPlan,
    phases,
    safetyGates: [
      "Pred sync krokom maj aktualny remote lead export zo Smartlead.",
      "Pred upload/update krokmi pauzni kampan alebo explicitne potvrd, ze je bezpecne menit beziacu kampan.",
      "Schvaluj iba add_leads payload pre missingInSmartlead a manual update payloady po kontrole changedFields.",
      "Po synci znovu zavolaj get_smartlead_campaign_leads a tento safe sync runbook.",
      "Lokalne sent_to_smartlead oznacuj az po potvrdenom remote re-checku.",
    ],
    nextToolCalls,
  };
}

export function buildSmartleadSequenceWorkPacketPreview(input: {
  niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null };
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  customInstructions?: string;
  completedSequences?: SmartleadSequence[];
  sampleLeads?: PreparedSmartleadLeadInput[];
  campaignId?: string | number | null;
}): SmartleadSequenceWorkPacketPreview {
  const language = input.language ?? "sk";
  const niche = {
    id: input.niche.id,
    slug: input.niche.slug?.trim() || slugify(input.niche.name),
    name: input.niche.name,
    campaignId: input.campaignId ?? input.niche.campaignId ?? null,
  };
  const baseline = draftSmartleadCampaignSequence({ niche: niche.name, offer: input.offer, painPoint: input.painPoint, language }).sequences;
  const completedItems = (input.completedSequences ?? []).map((sequence) => {
    const issues = smartleadSequenceIssues(sequence);
    return {
      sequenceNumber: Math.trunc(sequence.seq_number || 0),
      status: issues.length ? "invalid" as const : "valid" as const,
      issues,
      sequence: normalizeSequencePreview(sequence),
    };
  });
  const acceptedSequences = completedItems
    .filter((item) => item.status === "valid" && item.sequence)
    .map((item) => item.sequence as SmartleadSequence)
    .sort((a, b) => a.seq_number - b.seq_number);
  const campaignId = niche.campaignId ?? undefined;
  const configureCampaignApprovalPayload = campaignId && acceptedSequences.length
    ? { campaignId, sequences: acceptedSequences, approval: { approved: true as const } }
    : undefined;
  const sequencesForChecks = acceptedSequences.length ? acceptedSequences : baseline;
  const nextToolCalls: SmartleadSequenceWorkPacketPreview["nextToolCalls"] = [
    {
      tool: "arcigy.draft_smartlead_campaign_sequence",
      payload: { niche: niche.name, offer: input.offer, painPoint: input.painPoint, language },
      reason: "Vytvor deterministicky fallback sequence draft, ak AI este nevratila validny JSON.",
      approvalRequired: false,
    },
    {
      tool: "arcigy.build_smartlead_campaign_qa_preview",
      payload: { campaignId: campaignId ?? "SMARTLEAD_CAMPAIGN_ID", campaignName: `${niche.slug}_SK`, sequences: sequencesForChecks },
      reason: "Skontroluj sekvencie pred configure/create kampan krokom.",
      approvalRequired: false,
    },
  ];
  if (input.sampleLeads?.length) {
    nextToolCalls.push({
      tool: "arcigy.preview_smartlead_email_rendering",
      payload: { leads: input.sampleLeads.slice(0, 5), sequences: sequencesForChecks },
      reason: "Vyrenderuj sekvenciu na vzorke leadov a odhal chybajuce premenne.",
      approvalRequired: false,
    });
  }
  if (campaignId && acceptedSequences.length) {
    nextToolCalls.push(
      {
        tool: "arcigy.build_smartlead_sequence_variable_repair_preview",
        payload: { campaignId, sequences: acceptedSequences },
        reason: "Normalizuj subject premenne pred configure kampan approvalom.",
        approvalRequired: false,
      },
      {
        tool: "arcigy.configure_smartlead_campaign",
        payload: configureCampaignApprovalPayload as unknown as Record<string, unknown>,
        reason: "Nahraj validovane AI sekvencie do existujucej Smartlead kampane az po schvaleni.",
        approvalRequired: true,
      }
    );
  }
  const issueCount = completedItems.reduce((sum, item) => sum + item.issues.length, 0);
  const totals = {
    baselineSequences: baseline.length,
    completedSequences: input.completedSequences?.length ?? 0,
    acceptedSequences: acceptedSequences.length,
    rejectedSequences: completedItems.filter((item) => item.status === "invalid").length,
    variants: acceptedSequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0),
    issues: issueCount,
  };
  const status: SmartleadSequenceWorkPacketPreview["status"] =
    totals.completedSequences === 0 ? "attention" : totals.acceptedSequences === 0 ? "blocked" : totals.issues > 0 ? "attention" : "ready";
  return {
    mode: "smartlead-sequence-work-packet-preview",
    status,
    summary: `Smartlead sequence work packet ${status}: ${totals.acceptedSequences}/${totals.completedSequences} AI sekvencii validnych, ${totals.issues} issue, ${campaignId ? "configure payload pripraveny" : "campaignId chyba"}. Ziadny zapis do Smartlead neprebehol.`,
    source: { niche, language, offer: input.offer, painPoint: input.painPoint, customInstructions: input.customInstructions },
    totals,
    baselineSequences: baseline,
    markdownTask: buildSmartleadSequenceMarkdownTask({ niche, offer: input.offer, painPoint: input.painPoint, language, customInstructions: input.customInstructions, baseline }),
    expectedJson: { sequences: baseline },
    completedItems,
    acceptedSequences,
    configureCampaignApprovalPayload,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
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
  const combinedSequenceText = variantBodies.join("\n");
  const companyVariable = combinedSequenceText.includes("{{company_name_short}}") ? "{{company_name_short}}" : "{{company_name}}";
  const requiredVariables = unique([companyVariable, "{{personalized_intro}}", ...variantBodies.flatMap(extractTemplateVariables)]);
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

export function buildLeadgenToSmartleadDispatchPreview(input: {
  groups: Array<{
    sourceName?: string;
    niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
    leads: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
    priority?: number;
    dailyLimit?: number;
    alreadySentToday?: number;
    paused?: boolean;
    campaignTag?: string;
    defaultSource?: string;
  }>;
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  aiIntroBatchSize?: number;
  defaultDailyLimit?: number;
  globalMaxUploads?: number;
  maxNextCalls?: number;
  maxContextChars?: number;
}): LeadgenToSmartleadDispatchPreview {
  const language = input.language ?? "sk";
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const aiIntroBatchSize = Math.min(Math.max(Math.trunc(input.aiIntroBatchSize ?? 40), 1), 100);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 200);
  const nextToolCalls: LeadgenToSmartleadDispatchPreview["nextToolCalls"] = [];
  const warnings: string[] = [];
  const groups: LeadgenToSmartleadDispatchPreview["groups"] = input.groups.slice(0, 50).map((group, index) => {
    const slug = group.niche.slug?.trim() || slugify(group.niche.name || group.sourceName || `leadgen-${index + 1}`);
    const campaignId = group.niche.campaignId ?? group.niche.smartleadCampaignId ?? null;
    const niche = { id: group.niche.id, slug, name: group.niche.name, campaignId };
    const sourceName = group.sourceName ?? slug;
    const pipelinePreview = buildLeadgenCampaignPipelinePreview({
      leads: group.leads,
      niche,
      campaignTag: group.campaignTag ?? slug,
      defaultSource: group.defaultSource ?? sourceName,
      offer: input.offer,
      language,
      minScore: input.minScore,
      batchSize,
      maxNextCalls: Math.min(maxNextCalls, 50),
    });
    const aiIntroQueue = buildBulkAiIntroWorkQueuePreview({
      groups: [{
        sourceName,
        niche: niche.name,
        offer: input.offer,
        language,
        leads: pipelinePreview.leads,
      }],
      offer: input.offer,
      language,
      batchSize: aiIntroBatchSize,
      maxBatches: 10,
      maxContextChars: input.maxContextChars,
    });
    const readyLeads = pipelinePreview.enrichmentPreview.reviewQueue.ready.map((item) => item.lead);
    const smartleadReadiness = buildSmartleadSendReadinessQueuePreview({
      campaigns: [{
        niche,
        leads: readyLeads as Parameters<typeof buildSmartleadSendReadinessQueuePreview>[0]["campaigns"][number]["leads"],
        priority: group.priority,
        dailyLimit: group.dailyLimit,
        alreadySentToday: group.alreadySentToday,
        paused: group.paused,
        defaultSource: group.defaultSource ?? sourceName,
        campaignTag: group.campaignTag ?? slug,
      }],
      offer: input.offer,
      language,
      minScore: input.minScore,
      batchSize,
      defaultDailyLimit: input.defaultDailyLimit,
      globalMaxUploads: input.globalMaxUploads,
    });
    if (!campaignId && readyLeads.length) warnings.push(`${niche.name} has ready leads but no Smartlead campaignId.`);
    if (group.paused) warnings.push(`${niche.name} is paused.`);
    const hasFollowUpWork = pipelinePreview.totals.websitesToScrape > 0
      || pipelinePreview.totals.introsToDraft > 0
      || aiIntroQueue.totals.queuedLeads > 0
      || smartleadReadiness.totals.uploadReady > 0;
    const status: LeadgenToSmartleadDispatchPreview["groups"][number]["status"] = group.leads.length === 0
      ? "blocked"
      : smartleadReadiness.status === "ready" && pipelinePreview.totals.websitesToScrape === 0 && pipelinePreview.totals.introsToDraft === 0
        ? "ready"
        : hasFollowUpWork
          ? "attention"
          : "blocked";
    const reason = status === "ready"
      ? `${smartleadReadiness.totals.uploadReady} leadov je pripravenych na Smartlead approval upload.`
      : group.leads.length === 0
        ? "No leads in dispatch group."
        : `${pipelinePreview.totals.websitesToScrape} scrape, ${pipelinePreview.totals.introsToDraft} intro, ${smartleadReadiness.totals.uploadReady} upload-ready.`;
    nextToolCalls.push({
      tool: "arcigy.build_leadgen_campaign_pipeline_preview",
      payload: {
        leads: group.leads,
        niche,
        campaignTag: group.campaignTag ?? slug,
        defaultSource: group.defaultSource ?? sourceName,
        offer: input.offer,
        language,
        minScore: input.minScore,
        batchSize,
      },
      reason: `Prepocitaj pipeline pre ${niche.name} po scrape/AI intro opravach.`,
      approvalRequired: false,
    });
    for (const call of pipelinePreview.nextToolCalls) {
      nextToolCalls.push({
        tool: call.tool,
        payload: call.payload,
        reason: call.reason,
        approvalRequired: call.tool === "arcigy.add_leads_to_smartlead_campaign",
      });
    }
    nextToolCalls.push(...aiIntroQueue.nextToolCalls, ...smartleadReadiness.nextToolCalls);
    return { order: index + 1, sourceName, niche, status, reason, pipelinePreview, aiIntroQueue, smartleadReadiness };
  });
  if (input.groups.length > groups.length) warnings.push("Dispatch groups were truncated to 50.");
  const totals = {
    groups: groups.length,
    inputLeads: input.groups.reduce((sum, group) => sum + group.leads.length, 0),
    uniqueLeads: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.unique, 0),
    websitesToScrape: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.websitesToScrape, 0),
    introsToDraft: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.introsToDraft, 0),
    aiIntroQueued: groups.reduce((sum, group) => sum + group.aiIntroQueue.totals.queuedLeads, 0),
    readyForSmartlead: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.readyForSmartlead, 0),
    uploadReady: groups.reduce((sum, group) => sum + group.smartleadReadiness.totals.uploadReady, 0),
    approvalPayloads: groups.reduce((sum, group) => sum + group.smartleadReadiness.totals.approvalPayloads, 0),
    manualReview: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.manualReview, 0),
    rejected: groups.reduce((sum, group) => sum + group.pipelinePreview.totals.rejected, 0),
    blockedGroups: groups.filter((group) => group.status === "blocked").length,
    attentionGroups: groups.filter((group) => group.status === "attention").length,
    readyGroups: groups.filter((group) => group.status === "ready").length,
  };
  const status: LeadgenToSmartleadDispatchPreview["status"] = totals.groups === 0 || totals.inputLeads === 0 || totals.blockedGroups === totals.groups
    ? "blocked"
    : totals.attentionGroups || totals.blockedGroups || totals.websitesToScrape || totals.introsToDraft || warnings.length
      ? "attention"
      : "ready";
  return {
    mode: "leadgen-to-smartlead-dispatch-preview",
    status,
    summary: `Leadgen to Smartlead dispatch ${status}: ${totals.websitesToScrape} scrape, ${totals.introsToDraft} AI intro, ${totals.uploadReady} upload-ready leadov, ${totals.approvalPayloads} approval payloadov. Ziadny fetch, zapis ani upload neprebehol.`,
    totals,
    groups,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildCompanyResearchQueuePreview(input: {
  leads: Array<LeadCandidateInput & { region?: string; city?: string; searchQuery?: string; googlePlaceId?: string; placeId?: string }>;
  sourceName?: string;
  niche?: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
  defaultRegion?: string;
  country?: string;
  offer?: string;
  language?: "sk" | "en";
  includeGooglePlaces?: boolean;
  includeSerper?: boolean;
  includeFetch?: boolean;
  includeDispatch?: boolean;
  minScore?: number;
  batchSize?: number;
  maxSearches?: number;
  maxFetchUrls?: number;
  maxScrapeUrls?: number;
  maxNextCalls?: number;
}): CompanyResearchQueuePreview {
  const country = (input.country ?? "SK").toUpperCase();
  const language = input.language ?? "sk";
  const includeGooglePlaces = input.includeGooglePlaces !== false;
  const includeSerper = input.includeSerper !== false;
  const includeFetch = input.includeFetch !== false;
  const includeDispatch = input.includeDispatch !== false;
  const maxSearches = Math.min(Math.max(Math.trunc(input.maxSearches ?? 50), 1), 200);
  const maxFetchUrls = Math.min(Math.max(Math.trunc(input.maxFetchUrls ?? 50), 1), 200);
  const maxScrapeUrls = Math.min(Math.max(Math.trunc(input.maxScrapeUrls ?? 50), 1), 200);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 250);
  const niche = input.niche
    ? { id: input.niche.id, slug: input.niche.slug?.trim() || slugify(input.niche.name), name: input.niche.name, campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null }
    : undefined;
  const warnings: string[] = [];
  const searchQueries: CompanyResearchQueuePreview["searchQueries"] = [];
  const items: CompanyResearchQueuePreview["items"] = input.leads.map((lead, index) => {
    const companyName = lead.companyName?.trim();
    const website = lead.website?.trim();
    const email = lead.email?.trim();
    const intro = extractLeadIntro(lead);
    const region = lead.region || lead.city || input.defaultRegion;
    const queryBase = lead.searchQuery?.trim() || [companyName, region, country === "SK" ? "kontakt email" : "contact email"].filter(Boolean).join(" ");
    if (!companyName && !website) {
      return { lead, status: "manual_review", reason: "Missing company name and website." };
    }
    if (!website && companyName) {
      const placesQuery = [companyName, region, country === "SK" ? "Slovensko" : country].filter(Boolean).join(" ");
      if (includeGooglePlaces && searchQueries.length < maxSearches) {
        searchQueries.push({ query: placesQuery, provider: "google_places", leadIndex: index, reason: "Find official website and business contact from company name." });
      }
      if (includeSerper && searchQueries.length < maxSearches) {
        searchQueries.push({ query: queryBase, provider: "serper", leadIndex: index, reason: "Find website/contact page when Places does not return a usable site." });
      }
      return { lead, status: "needs_company_search", reason: "Missing website; search company first.", searchQuery: queryBase, placesQuery };
    }
    if (website && !email) {
      return { lead, status: "needs_contact_scrape", reason: "Website exists but email is missing.", fetchUrl: website, scrapeUrl: website };
    }
    if (email && !intro) {
      return { lead, status: "needs_intro", reason: "Contact exists but personalized intro is missing.", fetchUrl: website, scrapeUrl: website };
    }
    return { lead, status: "ready_for_dispatch", reason: "Lead has contact and personalized intro.", fetchUrl: website, scrapeUrl: website };
  });
  const fetchUrls = includeFetch
    ? unique(items.map((item) => item.fetchUrl).filter((value): value is string => Boolean(value))).slice(0, maxFetchUrls)
    : [];
  const scrapeUrls = unique(items
    .filter((item) => item.status === "needs_contact_scrape" || item.status === "needs_intro")
    .map((item) => item.scrapeUrl)
    .filter((value): value is string => Boolean(value)))
    .slice(0, maxScrapeUrls);
  const dispatchLeads = items
    .filter((item) => item.status !== "manual_review" && item.status !== "needs_company_search")
    .map((item) => item.lead);
  const dispatchPreview = includeDispatch && niche && dispatchLeads.length
    ? buildLeadgenToSmartleadDispatchPreview({
        groups: [{
          sourceName: input.sourceName ?? "company-research",
          niche,
          leads: dispatchLeads,
          defaultSource: input.sourceName ?? "company-research",
          campaignTag: niche.slug,
        }],
        offer: input.offer,
        language,
        minScore: input.minScore,
        batchSize: input.batchSize,
        maxNextCalls: Math.min(maxNextCalls, 100),
      })
    : undefined;
  if (!niche && includeDispatch && dispatchLeads.length) warnings.push("Dispatch preview skipped because niche is missing.");
  if (input.leads.length > items.length) warnings.push("Some leads were not processed.");
  const nextToolCalls: CompanyResearchQueuePreview["nextToolCalls"] = [];
  for (const query of searchQueries) {
    nextToolCalls.push({
      tool: query.provider === "google_places" ? "arcigy.search_google_places" : "arcigy.search_serper",
      payload: query.provider === "google_places"
        ? { query: query.query, maxResultCount: 10, languageCode: language, regionCode: country }
        : { query: query.query, num: 10, gl: country.toLowerCase(), hl: language },
      reason: query.reason,
      approvalRequired: false,
    });
  }
  if (fetchUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_fetch_public_url_previews",
      payload: { urls: fetchUrls, maxUrls: fetchUrls.length, parseJson: false },
      reason: "Fetch known websites before contact scrape so weak pages can be triaged safely.",
      approvalRequired: false,
    });
  }
  if (scrapeUrls.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: scrapeUrls, includePriorityPages: true, maxPages: 5, maxSites: scrapeUrls.length },
      reason: "Scrape websites/contact pages for missing emails, phones, and context.",
      approvalRequired: false,
    });
  }
  const introLeads = items.filter((item) => item.status === "needs_intro").map((item) => item.lead);
  if (introLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: introLeads, sourceName: input.sourceName ?? "company-research", niche: niche?.name, offer: input.offer, language, maxLeads: introLeads.length },
      reason: "Prepare AI intro work packet for leads that already have contact data.",
      approvalRequired: false,
    });
  }
  if (dispatchPreview) nextToolCalls.push(...dispatchPreview.nextToolCalls);
  const totals = {
    input: input.leads.length,
    readyForDispatch: items.filter((item) => item.status === "ready_for_dispatch").length,
    needsCompanySearch: items.filter((item) => item.status === "needs_company_search").length,
    needsContactScrape: items.filter((item) => item.status === "needs_contact_scrape").length,
    needsIntro: items.filter((item) => item.status === "needs_intro").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    searchQueries: searchQueries.length,
    fetchUrls: fetchUrls.length,
    scrapeUrls: scrapeUrls.length,
    dispatchGroups: dispatchPreview?.totals.groups ?? 0,
  };
  const status: CompanyResearchQueuePreview["status"] = totals.input === 0 || (totals.manualReview === totals.input && totals.input > 0)
    ? "blocked"
    : totals.needsCompanySearch || totals.needsContactScrape || totals.needsIntro || totals.manualReview || warnings.length
      ? "attention"
      : "ready";
  return {
    mode: "company-research-queue-preview",
    status,
    summary: `Company research queue ${status}: ${totals.needsCompanySearch} company search, ${totals.fetchUrls} fetch, ${totals.scrapeUrls} scrape, ${totals.needsIntro} AI intro, ${totals.readyForDispatch} ready. Ziadny fetch, zapis ani upload neprebehol.`,
    source: { name: input.sourceName, niche, defaultRegion: input.defaultRegion, country },
    totals,
    items,
    searchQueries,
    fetchUrls,
    scrapeUrls,
    dispatchPreview,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildResearchResultsImportPreview(input: {
  sourceName?: string;
  sourceType?: "google_places" | "serper" | "mixed";
  results?: Array<Record<string, unknown>>;
  placesResults?: Array<Record<string, unknown>>;
  serperResults?: Array<Record<string, unknown>>;
  niche?: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null; aliases?: string[] };
  defaultRegion?: string;
  country?: string;
  blacklistDomains?: string[];
  blacklistKeywords?: string[];
  existingDomains?: string[];
  offer?: string;
  language?: "sk" | "en";
  minScore?: number;
  batchSize?: number;
  maxResults?: number;
  maxNextCalls?: number;
}): ResearchResultsImportPreview {
  const sourceType = input.sourceType ?? (input.placesResults?.length && input.serperResults?.length ? "mixed" : input.placesResults?.length ? "google_places" : input.serperResults?.length ? "serper" : "mixed");
  const country = (input.country ?? "SK").toUpperCase();
  const maxResults = Math.min(Math.max(Math.trunc(input.maxResults ?? 500), 1), 5000);
  const rawRows = [...(input.results ?? []), ...(input.placesResults ?? []), ...(input.serperResults ?? [])].slice(0, maxResults);
  const defaultNiche = input.niche
    ? { id: input.niche.id, slug: input.niche.slug?.trim() || slugify(input.niche.name), name: input.niche.name, campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null }
    : undefined;
  const mapped = rawRows.map((row, index) => mapResearchResultRow(row, sourceType, input.sourceName, defaultNiche, input.defaultRegion, index));
  const filtered = filterBlacklistedLeads({ leads: mapped, domains: input.blacklistDomains, keywords: input.blacklistKeywords });
  const existingDomains = new Set((input.existingDomains ?? []).map(normalizeDomain).filter(Boolean));
  const seenDomains = new Map<string, LeadSourceImportQueueLead>();
  const duplicates: ResearchResultsImportPreview["duplicates"] = [];
  const leads: LeadSourceImportQueueLead[] = [];
  for (const lead of filtered.allowed as LeadSourceImportQueueLead[]) {
    const domain = lead.website ? normalizeDomain(lead.website) : "";
    if (domain && (existingDomains.has(domain) || seenDomains.has(domain))) {
      duplicates.push({ lead, duplicateOf: domain, reason: existingDomains.has(domain) ? "domain already exists" : "duplicate domain in research results" });
      continue;
    }
    if (domain) seenDomains.set(domain, lead);
    leads.push(lead);
  }
  const companyResearchPreview = buildCompanyResearchQueuePreview({
    leads,
    sourceName: input.sourceName ?? "research-results",
    niche: defaultNiche,
    defaultRegion: input.defaultRegion,
    country,
    offer: input.offer,
    language: input.language,
    minScore: input.minScore,
    batchSize: input.batchSize,
    maxNextCalls: input.maxNextCalls,
  });
  const importQueuePreview = defaultNiche
    ? buildLeadSourceImportQueuePreview({
        sourceName: input.sourceName ?? "research-results",
        sourceType: sourceType === "google_places" ? "google_maps" : sourceType === "serper" ? "serper" : "manual",
        leads,
        defaultNiche,
        niches: [{ ...defaultNiche, aliases: input.niche?.aliases }],
        blacklistDomains: input.blacklistDomains,
        blacklistKeywords: input.blacklistKeywords,
        offer: input.offer,
        language: input.language,
        minScore: input.minScore,
        batchSize: input.batchSize,
        maxNextCalls: input.maxNextCalls,
      })
    : undefined;
  const warnings: string[] = [];
  if (rawRows.length >= maxResults) warnings.push("Research results were truncated by maxResults.");
  if (!defaultNiche) warnings.push("Import queue grouping skipped because niche is missing.");
  const totals = {
    rawResults: rawRows.length,
    normalizedLeads: leads.length,
    blocked: filtered.blocked.length,
    duplicateDomains: duplicates.length,
    withWebsite: leads.filter((lead) => lead.website).length,
    withEmail: leads.filter((lead) => lead.email).length,
    companyResearchItems: companyResearchPreview.totals.input,
    importGroups: importQueuePreview?.totals.groups ?? 0,
    readyForSmartlead: importQueuePreview?.totals.readyForSmartlead ?? 0,
    websitesToScrape: companyResearchPreview.totals.scrapeUrls,
    introsToDraft: companyResearchPreview.totals.needsIntro,
    unassigned: importQueuePreview?.totals.unassigned ?? (defaultNiche ? 0 : leads.length),
  };
  const status: ResearchResultsImportPreview["status"] = totals.rawResults === 0 || totals.normalizedLeads === 0
    ? "blocked"
    : totals.blocked || totals.duplicateDomains || totals.websitesToScrape || totals.introsToDraft || totals.unassigned || warnings.length
      ? "attention"
      : "ready";
  const nextToolCalls = dedupeNextToolCalls([
    ...companyResearchPreview.nextToolCalls,
    ...(importQueuePreview?.nextToolCalls ?? []),
  ]).slice(0, Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 100), 1), 250));
  return {
    mode: "research-results-import-preview",
    status,
    summary: `Research results import ${status}: ${totals.normalizedLeads}/${totals.rawResults} leadov, ${totals.websitesToScrape} scrape, ${totals.introsToDraft} AI intro, ${totals.readyForSmartlead} ready do Smartlead. Ziadny zapis ani upload neprebehol.`,
    source: { name: input.sourceName, type: sourceType, defaultRegion: input.defaultRegion, country },
    totals,
    leads,
    blocked: filtered.blocked,
    duplicates,
    companyResearchPreview,
    importQueuePreview,
    nextToolCalls,
    warnings,
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

export function buildGmailNameEnrichmentQueuePreview(input: {
  leads: LeadRepairQueueLead[];
  gmailNameHints?: Array<{ email: string; displayName?: string; name?: string; fromHeader?: string; toHeader?: string; source?: string }>;
  sourceName?: string;
  accountEmail?: string;
  defaultSource?: string;
  campaignId?: string | number | null;
  offer?: string;
  language?: "sk" | "en";
  includeEmailInference?: boolean;
  maxLookups?: number;
  maxItems?: number;
}): GmailNameEnrichmentQueuePreview {
  const maxItems = Math.min(Math.max(Math.trunc(input.maxItems ?? 300), 1), 1000);
  const maxLookups = Math.min(Math.max(Math.trunc(input.maxLookups ?? 40), 1), 120);
  const normalized = input.leads.slice(0, maxItems).map((lead) => normalizePipelineLead(lead, input.sourceName, input.defaultSource) as LeadRepairQueueLead);
  const deduped = dedupeLeadCandidates({ leads: normalized });
  const hintByEmail = new Map((input.gmailNameHints ?? []).map((hint) => [hint.email.trim().toLowerCase(), hint]));
  const items: GmailNameEnrichmentQueuePreview["items"] = [];
  const lookupQueue: GmailNameEnrichmentQueuePreview["lookupQueue"] = [];
  const enhancedLeads: LeadRepairQueueLead[] = [];

  for (const lead of deduped.unique as LeadRepairQueueLead[]) {
    const email = lead.email?.trim().toLowerCase();
    const existingName = decisionMakerForLead(lead) ?? stringField(lead.customFields ?? {}, "decision_maker_name", "decision_maker_full_name");
    const issues: string[] = [];
    if (!email) {
      issues.push("missing_email");
      items.push({ lead, status: "missing_email", issues });
      continue;
    }
    if (existingName && !looksLikeBusinessAlias(existingName)) {
      const split = splitNameForSalutation(existingName, lead);
      enhancedLeads.push(applyDecisionMakerNameToLead(lead, existingName, split.firstName, split.lastName, input.sourceName ?? "existing-name"));
      items.push({ lead, email, status: "already_named", displayName: existingName, firstName: split.firstName, lastName: split.lastName, issues });
      continue;
    }
    const hintName = cleanGmailDisplayName(gmailHintDisplayName(hintByEmail.get(email)), email);
    if (hintName) {
      const split = splitName(hintName);
      const enriched = applyDecisionMakerNameToLead(lead, hintName, split.firstName, split.lastName, input.sourceName ?? "gmail-name-hint");
      enhancedLeads.push(enriched);
      items.push({ lead: enriched, email, status: "hint_applied", displayName: hintName, firstName: split.firstName, lastName: split.lastName, issues });
      continue;
    }
    if (input.includeEmailInference !== false) {
      const inferred = inferPersonNameFromEmail(email, lead.companyName, lead.website);
      if (inferred.fullName && inferred.confidence !== "low") {
        const split = splitName(inferred.fullName);
        const enriched = applyDecisionMakerNameToLead(lead, inferred.fullName, split.firstName, split.lastName, "personal-email");
        enhancedLeads.push(enriched);
        items.push({ lead: enriched, email, status: "inferred_from_personal_email", displayName: inferred.fullName, firstName: split.firstName, lastName: split.lastName, issues: [`email_inference_${inferred.confidence}`] });
        continue;
      }
    }
    issues.push("name_not_found");
    lookupQueue.push({ email, accountEmail: input.accountEmail, lead, reason: "Lead nema decision maker meno; skus Gmail display-name historiu a public email profile hint." });
    items.push({ lead, email, status: "needs_gmail_lookup", issues });
  }

  const salutationPreview = buildSlovakSalutationPreview({
    leads: enhancedLeads,
    defaultSource: input.defaultSource ?? "gmail-name-enrichment",
    campaignId: input.campaignId,
    includeSmartleadPreview: true,
    maxItems,
  });
  const introInputs = enhancedLeads
    .filter((lead) => !lead.personalizedIntro && lead.companyName)
    .map((lead) => ({
      companyName: lead.companyName as string,
      website: lead.website,
      context: stringField(lead.customFields ?? {}, "context_preview") ?? lead.context,
      offer: input.offer,
      language: input.language ?? "sk",
    }))
    .slice(0, maxLookups);
  const nextToolCalls: GmailNameEnrichmentQueuePreview["nextToolCalls"] = [];
  for (const lookup of lookupQueue.slice(0, maxLookups)) {
    nextToolCalls.push({
      tool: "arcigy.get_gmail_lead_context",
      payload: { leadEmail: lookup.email, accountEmail: lookup.accountEmail, maxMessages: 5, includeBody: false },
      reason: "Najdi display name pre lead email v Gmail historii bez zapisu.",
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.lookup_public_email_profile",
      payload: { email: lookup.email, companyName: lookup.lead.companyName, website: lookup.lead.website, sourceName: input.sourceName ?? "gmail-name-enrichment" },
      reason: "Ak Gmail nema meno, skus verejny profilovy hint pre identitu leadu.",
      approvalRequired: false,
    });
  }
  if (enhancedLeads.length) {
    nextToolCalls.push({
      tool: "arcigy.build_slovak_salutation_preview",
      payload: { leads: enhancedLeads, defaultSource: input.defaultSource ?? "gmail-name-enrichment", campaignId: input.campaignId },
      reason: "Z doplnenych mien priprav pan/pani a Smartlead custom fields.",
      approvalRequired: false,
    });
  }
  if (introInputs.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_draft_lead_intros",
      payload: { leads: introInputs, offer: input.offer, language: input.language ?? "sk", maxLeads: introInputs.length },
      reason: "Po doplneni mien priprav chybajuce AI intra pre cold outreach.",
      approvalRequired: false,
    });
  }
  const totals = {
    input: normalized.length,
    unique: deduped.unique.length,
    duplicates: deduped.duplicates.length,
    alreadyNamed: items.filter((item) => item.status === "already_named").length,
    hintsApplied: items.filter((item) => item.status === "hint_applied").length,
    inferredFromPersonalEmail: items.filter((item) => item.status === "inferred_from_personal_email").length,
    needsGmailLookup: lookupQueue.length,
    missingEmail: items.filter((item) => item.status === "missing_email").length,
    unresolved: items.filter((item) => item.status === "needs_gmail_lookup" || item.status === "missing_email" || item.status === "unresolved").length,
    salutationReady: salutationPreview.totals.enriched,
    introsToDraft: introInputs.length,
  };
  const status: GmailNameEnrichmentQueuePreview["status"] = totals.input === 0 ? "blocked" : totals.unresolved > 0 ? "attention" : "ready";
  return {
    mode: "gmail-name-enrichment-queue-preview",
    status,
    summary: `Gmail name enrichment queue ${status}: ${totals.alreadyNamed} uz malo meno, ${totals.hintsApplied} doplnenych z hintov, ${totals.inferredFromPersonalEmail} z personal emailu, ${totals.needsGmailLookup} potrebuje Gmail lookup. Ziadny zapis ani odoslanie neprebehlo.`,
    source: { name: input.sourceName, accountEmail: input.accountEmail },
    totals,
    items,
    lookupQueue,
    enhancedLeads,
    salutationPreview,
    introInputs,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
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

export function buildSmartleadFixedCampaignPackagePreview(input: {
  niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
  leads?: ManualReviewPickupLead[];
  campaignName?: string;
  existingCampaignId?: string | number | null;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  sequences?: SmartleadSequence[];
  batchSize?: number;
  maxNewLeadsPerDay?: number;
  minTimeBetweenEmails?: number;
  includeActivationChecklist?: boolean;
}): SmartleadFixedCampaignPackagePreview {
  const language = input.language ?? "sk";
  const slug = input.niche.slug?.trim() || slugify(input.niche.name);
  const campaignId = input.existingCampaignId ?? input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null;
  const niche = { id: input.niche.id, slug, name: input.niche.name, campaignId };
  const campaignName = input.campaignName?.trim() || `${slug}_SK_FIXED`;
  const emailAccounts = input.emailAccountIds ?? [];
  const schedule = {
    timezone: "Europe/Bratislava",
    start_hour: "08:00",
    end_hour: "18:00",
    days_of_the_week: [1, 2, 3, 4, 5],
    max_new_leads_per_day: Math.min(Math.max(Math.trunc(input.maxNewLeadsPerDay ?? (emailAccounts.length ? Math.floor(120 / emailAccounts.length) : 30)), 1), 500),
    min_time_btw_emails: Math.min(Math.max(Math.trunc(input.minTimeBetweenEmails ?? 15), 1), 240),
    schedule_start_time: null,
  };
  const settings = { trackOpen: false, stopOnReply: true, followUpPercentage: 100 };
  const launchPreview = buildSmartleadCampaignLaunchPreview({
    niche,
    leads: input.leads ?? [],
    offer: input.offer,
    painPoint: input.painPoint,
    language,
    clientId: input.clientId,
    emailAccountIds: emailAccounts,
    webhookUrl: input.webhookUrl,
    schedule,
    settings,
    batchSize: input.batchSize,
  });
  const sequences = input.sequences?.length
    ? input.sequences.map(normalizeSequencePreview)
    : buildFixedSmartleadCampaignSequences({ niche: niche.name, offer: input.offer, painPoint: input.painPoint, language });
  const campaignSetup = {
    ...launchPreview.campaignSetup,
    campaignName,
    sequences,
    schedule,
    settings,
    createCampaignApprovalPayload: {
      ...launchPreview.campaignSetup.createCampaignApprovalPayload,
      name: campaignName,
      sequences,
      emailAccountIds: emailAccounts,
      schedule,
      settings,
    },
  };
  const configureCampaign = campaignId
    ? {
        campaignId,
        sequences,
        emailAccountIds: emailAccounts,
        schedule,
        settings,
        webhook: campaignSetup.webhook,
        approval: { approved: true as const },
      }
    : undefined;
  const approvalPayloads: SmartleadFixedCampaignPackagePreview["approvalPayloads"] = {
    createCampaign: campaignId ? undefined : campaignSetup.createCampaignApprovalPayload,
    configureCampaign,
    addLeads: launchPreview.approvalPayloads.addLeads,
    activateCampaign: campaignId && input.includeActivationChecklist !== false ? { campaignId, status: "ACTIVE", approval: { approved: true } } : undefined,
  };
  const fixedLaunchPreview: SmartleadCampaignLaunchPreview = {
    ...launchPreview,
    summary: campaignId
      ? `Smartlead fixed campaign package: nakonfiguruj kampan ${campaignId}, priprav ${launchPreview.injectionPlan.totals.prepared} leadov a potom manualne skontroluj ACTIVE status. Ziadny zapis ani upload neprebehol.`
      : `Smartlead fixed campaign package: pripravena nova kampan ${campaignName}, ${launchPreview.injectionPlan.totals.prepared} leadov a fixed sekvencia. Ziadny zapis ani upload neprebehol.`,
    campaignSetup,
    approvalPayloads,
    nextToolCalls: dedupeNextToolCalls([
      {
        tool: campaignId ? "arcigy.configure_smartlead_campaign" : "arcigy.create_smartlead_campaign",
        payload: (campaignId ? configureCampaign : campaignSetup.createCampaignApprovalPayload) as unknown as Record<string, unknown>,
        reason: campaignId
          ? "Po schvaleni nastav existujucu Smartlead kampan fixed sekvenciou, uctami, schedule, stop-on-reply settings a webhookom."
          : "Po schvaleni vytvor Smartlead kampan s fixed sekvenciou, uctami, schedule, stop-on-reply settings a webhookom.",
        approvalRequired: true,
      },
      ...launchPreview.nextToolCalls.filter((call) => call.tool !== "arcigy.create_smartlead_campaign" && call.tool !== "arcigy.configure_smartlead_campaign"),
    ]),
  };
  const qaPreview = buildSmartleadCampaignQaPreview({
    launchPreview: fixedLaunchPreview,
    maxNewLeadsPerDay: schedule.max_new_leads_per_day,
  });
  const warnings: string[] = [];
  if (!emailAccounts.length) warnings.push("Email account ids were not provided; campaign setup can be drafted but sender assignment needs operator review.");
  if (!campaignId) warnings.push("No existing campaignId; create campaign first, then rerun with the returned campaignId before add-leads upload.");
  if (approvalPayloads.activateCampaign) warnings.push("ACTIVE status is prepared as an operator checklist item; there is no separate Jarvis Smartlead status write tool yet.");
  const operatorChecklist: SmartleadFixedCampaignPackagePreview["operatorChecklist"] = [
    { item: "Campaign target", status: campaignId || campaignName ? "ready" : "blocked", detail: campaignId ? `Configure existing campaign ${campaignId}.` : `Create new campaign ${campaignName}.` },
    { item: "Fixed sequence", status: qaPreview.checks.find((check) => check.key === "sequences")?.status ?? "blocked", detail: `${sequences.length} steps, ${sequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0)} variants, uses company_name_short, last_name_with_salutation and personalized_intro.` },
    { item: "Stop on reply", status: settings.stopOnReply ? "ready" : "blocked", detail: "stop_lead_settings should resolve to REPLY_TO_AN_EMAIL in Smartlead." },
    { item: "Webhook", status: campaignSetup.webhook.url ? "ready" : "blocked", detail: `${campaignSetup.webhook.name}: ${campaignSetup.webhook.eventTypes.join(", ")}` },
    { item: "Lead upload", status: launchPreview.injectionPlan.totals.prepared > 0 && campaignId ? "ready" : launchPreview.injectionPlan.totals.prepared > 0 ? "attention" : "blocked", detail: `${launchPreview.injectionPlan.totals.prepared} prepared, ${launchPreview.injectionPlan.totals.skipped} skipped.` },
    { item: "Activation", status: campaignId ? "attention" : "blocked", detail: campaignId ? "After approvals, verify campaign status ACTIVE in Smartlead UI/API." : "Activation is possible only after Smartlead returns campaignId." },
  ];
  const nextToolCalls = dedupeNextToolCalls([
    ...fixedLaunchPreview.nextToolCalls,
    {
      tool: "arcigy.build_smartlead_campaign_qa_preview",
      payload: { launchPreview: fixedLaunchPreview, maxNewLeadsPerDay: schedule.max_new_leads_per_day },
      reason: "Pred schvalenim write krokov znovu skontroluj fixed campaign payload.",
      approvalRequired: false,
    },
    {
      tool: "arcigy.preview_smartlead_email_rendering",
      payload: { leads: fixedLaunchPreview.injectionPlan.batches.flatMap((batch) => batch.leads).slice(0, 5), sequences },
      reason: "Vyrenderuj prvych par emailov a over custom fields pred uploadom.",
      approvalRequired: false,
    },
  ]);
  const status: SmartleadFixedCampaignPackagePreview["status"] =
    operatorChecklist.some((item) => item.status === "blocked") || qaPreview.status === "blocked"
      ? "blocked"
      : operatorChecklist.some((item) => item.status === "attention") || qaPreview.status === "attention" || warnings.length
        ? "attention"
        : "ready";
  return {
    mode: "smartlead-fixed-campaign-package-preview",
    status,
    summary: `Smartlead fixed campaign package ${status}: ${campaignName}, ${fixedLaunchPreview.injectionPlan.totals.prepared} leadov, ${sequences.length} sekvencii, ${nextToolCalls.filter((call) => call.approvalRequired).length} approval krokov. Ziadny zapis ani upload neprebehol.`,
    source: { niche, campaignName, existingCampaignId: campaignId, language },
    totals: {
      leads: input.leads?.length ?? 0,
      preparedLeads: fixedLaunchPreview.injectionPlan.totals.prepared,
      skippedLeads: fixedLaunchPreview.injectionPlan.totals.skipped,
      sequenceSteps: sequences.length,
      variants: sequences.reduce((sum, sequence) => sum + sequence.seq_variants.length, 0),
      approvalCalls: nextToolCalls.filter((call) => call.approvalRequired).length,
      webhookEvents: campaignSetup.webhook.eventTypes.length,
      emailAccounts: emailAccounts.length,
      warnings: warnings.length,
    },
    fixedDefaults: {
      schedule,
      settings,
      webhook: campaignSetup.webhook,
      uploadSettings: { ignore_global_block_list: false, ignore_unsubscribe_list: false },
    },
    launchPreview: fixedLaunchPreview,
    qaPreview,
    operatorChecklist,
    approvalPayloads,
    warnings,
    nextToolCalls,
  };
}

function buildFixedSmartleadCampaignSequences(input: { niche: string; offer?: string; painPoint?: string; language: "sk" | "en" }): SmartleadSequence[] {
  const niche = input.niche.trim() || "firmy";
  const offer = input.offer?.trim() || "AI audit a automatizacia dopytov";
  const painPoint = input.painPoint?.trim() || "manualne filtrovanie dopytov a opakovane odpovedanie";
  if (input.language === "en") {
    return [
      {
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        seq_variants: [
          {
            variant_label: "A",
            subject: "Quick thought about {{company_name_short}}",
            email_body: `<p>Hello{{last_name_with_salutation}},</p><p>{{personalized_intro}}</p><p>I help ${escapeHtml(niche)} reduce ${escapeHtml(painPoint)} with ${escapeHtml(offer)}.</p><p>Would it make sense to send one concrete example for {{company_name_short}}?</p><p>%signature%</p>`,
          },
          {
            variant_label: "B",
            subject: "Question for {{company_name_short}}",
            email_body: `<p>Hello{{last_name_with_salutation}},</p><p>{{personalized_intro}}</p><p>Are you already solving ${escapeHtml(painPoint)}, or is it still handled manually?</p><p>I can send a short practical example if useful.</p><p>%signature%</p>`,
          },
        ],
      },
      {
        seq_number: 2,
        seq_delay_details: { delay_in_days: 3 },
        seq_variants: [{ variant_label: "A", subject: "", email_body: "<p>Hello{{last_name_with_salutation}},</p><p>just checking whether my previous email reached you.</p><p>A short yes/no is enough, so I know whether this is relevant.</p><p>%sender-firstname%</p>" }],
      },
    ];
  }
  return [
    {
      seq_number: 1,
      seq_delay_details: { delay_in_days: 0 },
      seq_variants: [
        {
          variant_label: "A",
          subject: "Len taka uvaha nad {{company_name_short}}",
          email_body: `<p>Dobry den{{last_name_with_salutation}},</p><p>{{personalized_intro}}</p><p>Pre ${escapeHtml(niche)} riesime ${escapeHtml(painPoint)} cez ${escapeHtml(offer)}.</p><p>Napadlo mi, ci by davalo zmysel poslat vam kratku ukazku, ako by to mohlo vyzerat pre {{company_name_short}}.</p><p>%signature%</p>`,
        },
        {
          variant_label: "B",
          subject: "Otazka k {{company_name_short}}",
          email_body: `<p>Dobry den{{last_name_with_salutation}},</p><p>{{personalized_intro}}</p><p>Neodchadza vam pri dopytoch vela casu na tie iste otazky a prvotne filtrovanie?</p><p>Prave tam vie pomoct jednoduchy AI audit a automatizacia. Ak chcete, poslem strucny priklad pre vas typ firmy.</p><p>%signature%</p>`,
        },
      ],
    },
    {
      seq_number: 2,
      seq_delay_details: { delay_in_days: 3 },
      seq_variants: [{ variant_label: "A", subject: "", email_body: "<p>Dobry den{{last_name_with_salutation}},</p><p>len som sa chcel uistit, ci vam moj mail nespadol do spamu.</p><p>Staci mi kratke ano/nie, ci je tema automatizacie dopytov pre vas relevantna.</p><p>%sender-firstname%</p>" }],
    },
  ];
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

export function buildSmartleadCampaignDeleteSafetyPreview(input: {
  campaigns?: SmartleadCampaignBackupPlanCampaign[];
  backupPlan?: SmartleadCampaignBackupPlan;
  backupRunId?: string;
  backedUpCampaignIds?: Array<string | number>;
  protectedCampaignIds?: Array<string | number>;
  protectedNameParts?: string[];
  backupRoot?: string;
  requireFullBackupEvidence?: boolean;
  maxDeleteCandidates?: number;
  operatorPhrase?: string;
}): SmartleadCampaignDeleteSafetyPreview {
  const backupPlan = input.backupPlan ?? buildSmartleadCampaignBackupPlan({
    campaigns: input.campaigns,
    backupRoot: input.backupRoot,
    protectedCampaignIds: input.protectedCampaignIds,
    protectedNameParts: input.protectedNameParts,
    includeDeletePlan: true,
  });
  const backedUpIds = new Set((input.backedUpCampaignIds ?? []).map(String));
  const requireFullBackupEvidence = input.requireFullBackupEvidence !== false;
  const requiredOperatorPhrase = input.operatorPhrase?.trim() || "CONFIRM SMARTLEAD DELETE AFTER BACKUP";
  const maxDeleteCandidates = Math.min(Math.max(Math.trunc(input.maxDeleteCandidates ?? 50), 1), 200);
  const requiredBackupArtifacts = ["campaign.json", "sequences.json", "leads.json", "webhooks.json", "email_accounts.json"];
  const queue = backupPlan.campaigns.slice(0, maxDeleteCandidates).map((campaign) => {
    const hasBackupEvidence = Boolean(input.backupPlan) || backedUpIds.has(campaign.id) || (input.backupRunId && backedUpIds.has(`${input.backupRunId}:${campaign.id}`));
    const reasons: string[] = [];
    if (campaign.protected) reasons.push(`Protected campaign: ${campaign.protectionReasons.join("; ") || "protected flag"}.`);
    if (requireFullBackupEvidence && !hasBackupEvidence) reasons.push("Missing backup evidence for this campaign.");
    if (typeof campaign.leadCount !== "number") reasons.push("Missing lead count; fetch all lead pages before delete approval.");
    const decision: SmartleadCampaignDeleteSafetyPreview["queue"][number]["decision"] = campaign.protected
      ? "blocked"
      : requireFullBackupEvidence && !hasBackupEvidence
        ? "needs_backup_evidence"
        : reasons.length
          ? "blocked"
          : "ready_to_delete";
    return {
      campaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      protected: campaign.protected,
      decision,
      reasons,
      requiredBackupArtifacts,
      deleteRequestPreview: decision === "ready_to_delete"
        ? { method: "DELETE" as const, path: `/campaigns/${encodeURIComponent(campaign.id)}`, approvalPhrase: requiredOperatorPhrase }
        : undefined,
    };
  });
  const readyToDelete = queue.filter((item) => item.decision === "ready_to_delete").length;
  const blocked = queue.filter((item) => item.decision === "blocked").length;
  const missingBackupEvidence = queue.filter((item) => item.decision === "needs_backup_evidence").length;
  const nextToolCalls: SmartleadCampaignDeleteSafetyPreview["nextToolCalls"] = [
    {
      tool: "arcigy.build_smartlead_campaign_backup_plan",
      payload: {
        campaigns: input.campaigns ?? backupPlan.campaigns,
        protectedCampaignIds: input.protectedCampaignIds,
        protectedNameParts: input.protectedNameParts,
        includeDeletePlan: true,
        backupRoot: input.backupRoot,
      },
      reason: "Najprv alebo znovu priprav backup manifest s delete kandidatmi pred akymkolvek manualnym delete krokom.",
      approvalRequired: false,
    },
  ];
  for (const item of queue.filter((candidate) => candidate.decision !== "ready_to_delete").slice(0, 10)) {
    nextToolCalls.push({
      tool: "arcigy.get_smartlead_campaign_leads",
      payload: { campaignId: item.campaignId, offset: 0, limit: 100 },
      reason: "Dotiahni lead count a prvu stranu leadov ako backup evidence pred delete rozhodnutim.",
      approvalRequired: false,
    });
  }
  const status: SmartleadCampaignDeleteSafetyPreview["status"] =
    queue.length === 0 ? "blocked" : readyToDelete > 0 && blocked === 0 && missingBackupEvidence === 0 ? "ready" : readyToDelete > 0 ? "attention" : "blocked";
  return {
    mode: "smartlead-campaign-delete-safety-preview",
    status,
    summary: `Smartlead delete safety preview ${status}: ${readyToDelete} ready, ${blocked} blocked, ${missingBackupEvidence} bez backup evidence, ${backupPlan.protectedCampaigns.length} protected. Ziadny delete ani Smartlead zapis neprebehol.`,
    backupPlan,
    totals: {
      campaigns: queue.length,
      deleteCandidates: queue.filter((item) => !item.protected).length,
      readyToDelete,
      blocked,
      protected: backupPlan.protectedCampaigns.length,
      missingBackupEvidence,
      estimatedLeads: backupPlan.totals.estimatedLeads,
    },
    queue,
    protectedCampaigns: backupPlan.protectedCampaigns,
    requiredOperatorPhrase,
    safetyGates: [
      ...backupPlan.safetyGates,
      `Operator must type exactly: ${requiredOperatorPhrase}`,
      "This MCP tool never deletes Smartlead campaigns; it only prepares a delete safety queue.",
      "Do not delete protected campaigns, campaigns with missing lead counts, or campaigns without backup evidence.",
      "After any manual delete, record campaign id, timestamp, result, and response in the backup manifest.",
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

export function buildFullLeadgenPipelineRunbookPreview(input: {
  niche: { id?: string; slug?: string; name: string; keywords?: string[]; region?: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
  leads?: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  completedIntros?: Array<{ id: string; icebreaker?: string; personalizedIntro?: string }>;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  targetCount?: number;
  dailyLimit?: number;
  batchSize?: number;
  minScore?: number;
  maxNextCalls?: number;
  clientId?: string | number | null;
  emailAccountIds?: Array<string | number>;
  webhookUrl?: string;
  senderAccounts?: SmartleadSenderAccountInput[];
}): FullLeadgenPipelineRunbookPreview {
  const language = input.language ?? "sk";
  const minScore = Math.min(Math.max(Math.trunc(input.minScore ?? 70), 0), 100);
  const batchSize = Math.min(Math.max(Math.trunc(input.batchSize ?? 50), 1), 100);
  const dailyLimit = Math.min(Math.max(Math.trunc(input.dailyLimit ?? 30), 1), 250);
  const targetCount = Math.min(Math.max(Math.trunc(input.targetCount ?? Math.ceil(dailyLimit * 1.5)), dailyLimit), 500);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 30), 1), 100);
  const niche = {
    id: input.niche.id,
    slug: input.niche.slug?.trim() || slugify(input.niche.name),
    name: input.niche.name,
    region: input.niche.region,
    campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null,
  };
  const discoveryRunbook = buildDailyLeadgenRunbook({
    niche: { ...niche, keywords: input.niche.keywords },
    targetCount,
    dailyLimit,
    batchSize,
    offer: input.offer,
    painPoint: input.painPoint,
    language,
    includeSmartleadSetup: !niche.campaignId,
  });
  const pipelinePreview = input.leads?.length
    ? buildLeadgenCampaignPipelinePreview({
        leads: input.leads,
        niche,
        campaignTag: niche.slug,
        defaultSource: "full-pipeline-runbook",
        offer: input.offer,
        language,
        minScore,
        batchSize,
        maxNextCalls,
      })
    : undefined;
  const scrapeAudit = input.scrapedResults?.length
    ? buildWebsiteScrapeQualityAuditPreview({
        scrapedResults: input.scrapedResults,
        leads: input.leads,
        minTextChars: 180,
        maxNextCalls,
        offer: input.offer,
        language,
      })
    : undefined;
  const introCandidates = pipelinePreview?.leads
    .filter((lead) => !lead.personalizedIntro && (lead.companyName || lead.website))
    .slice(0, maxNextCalls);
  const introWorkPacket = introCandidates?.length
    ? buildAiIntroWorkPacketPreview({
        leads: introCandidates,
        sourceName: "full-pipeline-runbook",
        niche: niche.slug,
        offer: input.offer,
        language,
        maxLeads: maxNextCalls,
        completedIntros: input.completedIntros,
      })
    : undefined;
  const readyLeads = pipelinePreview?.enrichmentPreview.reviewQueue.ready.map((item) => item.lead) ?? [];
  const handoffPackage = readyLeads.length
    ? buildSmartleadCampaignHandoffPackagePreview({
        niche,
        leads: readyLeads,
        offer: input.offer,
        painPoint: input.painPoint,
        language,
        clientId: input.clientId,
        emailAccountIds: input.emailAccountIds,
        webhookUrl: input.webhookUrl,
        batchSize,
        senderAccounts: input.senderAccounts,
        requestedDailyLimit: dailyLimit,
      })
    : undefined;
  const phases: FullLeadgenPipelineRunbookPreview["phases"] = [
    {
      order: 1,
      key: "discovery",
      tool: "arcigy.discover_leads",
      payload: {
        query: discoveryRunbook.queryPlan.mapsQueries[0] ?? `${niche.name} ${niche.region ?? "Slovensko"}`.trim(),
        placesQuery: discoveryRunbook.queryPlan.mapsQueries[0] ?? `${niche.name} ${niche.region ?? "Slovensko"}`.trim(),
        maxResults: targetCount,
      },
      purpose: "Najdi nove firmy pre niche cez Google Places/Serper.",
      status: "ready",
      writes: false,
      approvalRequired: false,
    },
  ];
  if (pipelinePreview) {
    phases.push({
      order: phases.length + 1,
      key: "pipeline-audit",
      tool: "arcigy.build_leadgen_campaign_pipeline_preview",
      payload: { leads: input.leads, niche, offer: input.offer, language, minScore, batchSize, maxNextCalls },
      purpose: "Zdeduplikuj leady, zisti chybajuce web scrape/AI intra a prepocitaj Smartlead pripravenost.",
      status: "ready",
      writes: false,
      approvalRequired: false,
    });
  } else {
    phases.push({
      order: phases.length + 1,
      key: "pipeline-audit",
      tool: "arcigy.build_leadgen_campaign_pipeline_preview",
      payload: { leads: [], niche, offer: input.offer, language, minScore, batchSize, maxNextCalls },
      purpose: "Spusti po discovery, ked budes mat leady.",
      status: "needs_input",
      writes: false,
      approvalRequired: false,
    });
  }
  if (pipelinePreview?.websitesToScrape.length) {
    phases.push({
      order: phases.length + 1,
      key: "website-scrape",
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: pipelinePreview.websitesToScrape, includePriorityPages: true, maxPages: 4, maxSites: pipelinePreview.websitesToScrape.length },
      purpose: "Vytiahni kontaktne emaily, telefony a kontext z webov, ktore este nemaju email.",
      status: "ready",
      writes: false,
      approvalRequired: false,
    });
  }
  phases.push({
    order: phases.length + 1,
    key: "scrape-quality",
    tool: "arcigy.build_website_scrape_quality_audit_preview",
    payload: { scrapedResults: input.scrapedResults ?? [], leads: input.leads ?? [], offer: input.offer, language, maxNextCalls },
    purpose: "Po web scrape vyber preferovane emaily/telefony a posli slabe weby na rescrape.",
    status: scrapeAudit ? (scrapeAudit.status === "blocked" ? "blocked" : "ready") : "needs_input",
    writes: false,
    approvalRequired: false,
  });
  if (introWorkPacket) {
    phases.push({
      order: phases.length + 1,
      key: "ai-intro-work",
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: introCandidates, sourceName: "full-pipeline-runbook", niche: niche.slug, offer: input.offer, language, maxLeads: maxNextCalls },
      purpose: "Priprav Markdown/JSON balik pre ChatGPT alebo Claude na doplnenie konkretnych AI intr.",
      status: introWorkPacket.status === "blocked" ? "blocked" : "ready",
      writes: false,
      approvalRequired: false,
    });
  }
  phases.push({
    order: phases.length + 1,
    key: "enrichment-merge",
    tool: "arcigy.build_lead_enrichment_merge_preview",
    payload: { leads: input.leads ?? [], scrapedResults: input.scrapedResults ?? [], intros: input.completedIntros ?? [], niche, minScore, batchSize },
    purpose: "Spoj povodne leady, scrape vysledky a hotove intra do jedneho hodnoteneho batchu.",
    status: input.leads?.length && (input.scrapedResults?.length || input.completedIntros?.length) ? "ready" : "needs_input",
    writes: false,
    approvalRequired: false,
  });
  if (handoffPackage) {
    phases.push({
      order: phases.length + 1,
      key: "smartlead-handoff",
      tool: "arcigy.build_smartlead_campaign_handoff_package_preview",
      payload: { niche, leads: readyLeads, offer: input.offer, painPoint: input.painPoint, language, batchSize, emailAccountIds: input.emailAccountIds, webhookUrl: input.webhookUrl },
      purpose: "Priprav QA, sender capacity a approval payloady pred Smartlead uploadom.",
      status: handoffPackage.status === "blocked" ? "blocked" : "ready",
      writes: false,
      approvalRequired: false,
    });
  }
  for (const call of handoffPackage?.nextToolCalls ?? []) {
    if (call.approvalRequired) {
      phases.push({
        order: phases.length + 1,
        key: `approval-${phases.length}`,
        tool: call.tool,
        payload: call.payload,
        purpose: call.reason,
        status: "approval_required",
        writes: true,
        approvalRequired: true,
      });
    }
  }
  const nextToolCalls = dedupeNextToolCalls(
    phases.map((phase) => ({
      tool: phase.tool,
      payload: phase.payload,
      reason: phase.purpose,
      approvalRequired: phase.approvalRequired,
    }))
  ).slice(0, maxNextCalls);
  const approvalSteps = phases.filter((phase) => phase.approvalRequired).length;
  const qaIssues = handoffPackage?.operatorChecklist.filter((item) => item.status !== "ready").length ?? 0;
  const status: FullLeadgenPipelineRunbookPreview["status"] =
    phases.some((phase) => phase.status === "blocked") || (pipelinePreview && pipelinePreview.totals.input > 0 && pipelinePreview.totals.readyForSmartlead === 0 && !pipelinePreview.websitesToScrape.length && !pipelinePreview.introInputs.length)
      ? "blocked"
      : phases.some((phase) => phase.status === "needs_input") || qaIssues > 0
        ? "attention"
        : "ready";
  return {
    mode: "full-leadgen-pipeline-runbook-preview",
    status,
    summary: `Full leadgen pipeline runbook: ${status}, ${pipelinePreview?.totals.readyForSmartlead ?? 0} ready do Smartlead, ${pipelinePreview?.totals.websitesToScrape ?? 0} webov na scrape, ${pipelinePreview?.totals.introsToDraft ?? 0} AI intr, ${approvalSteps} approval krokov. Ziadny zapis ani upload neprebehol.`,
    source: {
      niche,
      language,
      offer: input.offer,
      hasInputLeads: Boolean(input.leads?.length),
      hasScrapeResults: Boolean(input.scrapedResults?.length),
    },
    target: { discoveryCount: targetCount, dailyLimit, batchSize, minScore },
    totals: {
      inputLeads: input.leads?.length ?? 0,
      unique: pipelinePreview?.totals.unique ?? 0,
      readyForSmartlead: pipelinePreview?.totals.readyForSmartlead ?? 0,
      websitesToScrape: pipelinePreview?.totals.websitesToScrape ?? 0,
      introsToDraft: pipelinePreview?.totals.introsToDraft ?? 0,
      scrapeReady: scrapeAudit?.totals.ready ?? 0,
      scrapeNeedsRescrape: scrapeAudit?.totals.needsRescrape ?? 0,
      qaIssues,
      approvalSteps,
      phases: phases.length,
    },
    phases,
    previews: { discoveryRunbook, pipelinePreview, scrapeAudit, introWorkPacket, handoffPackage },
    safetyGates: [
      "Discovery, scrape, AI intro a QA fazy su read-only.",
      "Do Smartlead sa posielaju iba ready leady po explicitnom approval payloade.",
      "Po kazdom scrape alebo AI intro kroku spusti merge/QA preview znovu.",
      "Ak sender capacity alebo QA vrati attention/blocked, najprv oprav kampan a limity.",
    ],
    nextToolCalls,
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

export function buildMapsCitySweepPreview(input: {
  niche: string;
  keywords?: string[];
  cities?: string[];
  regionPreset?: "capitals" | "all_slovakia" | "custom";
  country?: string;
  sourceName?: string;
  targetCount?: number;
  resultsPerSearch?: number;
  maxCities?: number;
  maxKeywordsPerCity?: number;
  maxSearchCalls?: number;
  maxNextCalls?: number;
  includeColdCallingExport?: boolean;
}): MapsCitySweepPreview {
  const country = (input.country ?? "SK").toUpperCase();
  const regionPreset = input.regionPreset ?? (input.cities?.length ? "custom" : "all_slovakia");
  const baseCities = input.cities?.length
    ? input.cities
    : regionPreset === "capitals"
      ? slovakiaCapitalRegions
      : slovakiaExpansionRegions;
  const maxCities = Math.min(Math.max(Math.trunc(input.maxCities ?? (regionPreset === "all_slovakia" ? 40 : 12)), 1), 80);
  const maxKeywordsPerCity = Math.min(Math.max(Math.trunc(input.maxKeywordsPerCity ?? 6), 1), 20);
  const maxSearchCalls = Math.min(Math.max(Math.trunc(input.maxSearchCalls ?? 120), 1), 500);
  const targetCount = Math.min(Math.max(Math.trunc(input.targetCount ?? 300), 1), 5000);
  const resultsPerSearch = Math.min(Math.max(Math.trunc(input.resultsPerSearch ?? 20), 1), 50);
  const plan = buildNicheLeadgenPlan({ niche: input.niche, customKeywords: input.keywords });
  const keywords = unique([...(input.keywords ?? []), ...plan.mapsQueries]).slice(0, maxKeywordsPerCity);
  const cities = unique(baseCities).slice(0, maxCities);
  const allQueries = cities.flatMap((city, cityIndex) =>
    keywords.map((keyword, keywordIndex) => ({
      order: cityIndex * keywords.length + keywordIndex + 1,
      city,
      keyword,
      query: `${keyword} ${city} ${country === "SK" ? "Slovensko" : country}`.trim(),
      maxResults: resultsPerSearch,
      priority: cityIndex * 100 + keywordIndex,
    }))
  );
  const queryBatches = allQueries.slice(0, maxSearchCalls);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 25), 1), 100);
  const sourceName = input.sourceName ?? `${slugify(input.niche)}-maps-city-sweep`;
  const nextToolCalls: MapsCitySweepPreview["nextToolCalls"] = [
    ...queryBatches.slice(0, maxNextCalls).map((item) => ({
      tool: "arcigy.search_google_places",
      payload: { query: item.query, maxResults: item.maxResults },
      reason: `Google Places city sweep ${item.order}: ${item.keyword} / ${item.city}.`,
      approvalRequired: false,
    })),
    {
      tool: "arcigy.build_research_results_import_preview",
      payload: {
        sourceName,
        sourceType: "google_places",
        placesResults: [],
        niche: { slug: slugify(input.niche), name: input.niche },
        country,
        blacklistKeywords: plan.blacklistKeywords,
        maxResults: targetCount,
      },
      reason: "Po zozbierani Places vysledkov normalizuj leady, deduplikuj a priprav scrape/AI intro/Smartlead queue.",
      approvalRequired: false,
    },
  ];
  if (input.includeColdCallingExport !== false) {
    nextToolCalls.push({
      tool: "arcigy.build_maps_cold_calling_export_preview",
      payload: { sourceName, sourceType: "google_places", country, placesResults: [], blacklistKeywords: plan.blacklistKeywords, maxResults: targetCount },
      reason: "Ak Places vysledky obsahuju telefony, priprav cold-calling CSV preview bez zapisu.",
      approvalRequired: false,
    });
  }
  const warnings: string[] = [];
  if (allQueries.length > maxSearchCalls) warnings.push(`Search plan capped from ${allQueries.length} to ${maxSearchCalls} calls.`);
  if (queryBatches.length * resultsPerSearch < targetCount) warnings.push("Estimated result slots are below targetCount; increase maxSearchCalls or resultsPerSearch.");
  const status: MapsCitySweepPreview["status"] = !cities.length || !keywords.length ? "blocked" : warnings.length ? "attention" : "ready";
  return {
    mode: "maps-city-sweep-preview",
    status,
    summary: `Maps city sweep ${status}: ${queryBatches.length} search calls, ${cities.length} miest, ${keywords.length} keywords, target ${targetCount}. Ziadne Google Maps API volanie ani export neprebehol.`,
    source: { niche: input.niche, country, regionPreset, sourceName },
    target: { targetCount, resultsPerSearch, maxSearchCalls, maxCities, maxKeywordsPerCity },
    totals: {
      cities: cities.length,
      keywords: keywords.length,
      plannedSearchCalls: allQueries.length,
      cappedSearchCalls: queryBatches.length,
      estimatedResultSlots: queryBatches.length * resultsPerSearch,
      batches: Math.ceil(queryBatches.length / maxNextCalls),
    },
    cities,
    keywords,
    queryBatches,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    safetyGates: [
      "Spustaj search_google_places po batchoch, nie vsetky naraz.",
      "Po kazdom batchi deduplikuj placeId, telefon a domenu pred dalsim exportom.",
      "Cold-calling CSV aj Smartlead upload ostavaju approval-gated.",
      "Ak quota alebo provider zlyha, uloz ciastocne vysledky a pokracuj dalsim mestom.",
    ],
    warnings,
  };
}

export function buildInternationalMarketLeadgenPreview(input: {
  marketName?: string;
  country?: string;
  regionCode?: string;
  languageCode?: string;
  niche: { id?: string; slug?: string; name: string; campaignId?: string | number | null; smartleadCampaignId?: string | number | null };
  keywords?: string[];
  regions?: string[];
  excludeKeywords?: string[];
  sourceName?: string;
  targetCount?: number;
  resultsPerSearch?: number;
  maxRegions?: number;
  maxKeywordsPerRegion?: number;
  maxSearchCalls?: number;
  maxNextCalls?: number;
  includeSerper?: boolean;
  includeSmartleadPackage?: boolean;
  campaignName?: string;
  emailAccountIds?: Array<string | number>;
  offer?: string;
  painPoint?: string;
}): InternationalMarketLeadgenPreview {
  const country = (input.country ?? input.regionCode ?? "AU").toUpperCase();
  const regionCode = (input.regionCode ?? country).toUpperCase();
  const languageCode = (input.languageCode ?? (country === "SK" ? "sk" : "en")).toLowerCase();
  const marketName = input.marketName?.trim() || `${country} market`;
  const niche = {
    id: input.niche.id,
    slug: input.niche.slug?.trim() || slugify(input.niche.name),
    name: input.niche.name,
    campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null,
  };
  const sourceName = input.sourceName?.trim() || `${niche.slug}-${country.toLowerCase()}-market-leadgen`;
  const targetCount = Math.min(Math.max(Math.trunc(input.targetCount ?? 300), 1), 10_000);
  const resultsPerSearch = Math.min(Math.max(Math.trunc(input.resultsPerSearch ?? 20), 1), 50);
  const maxRegions = Math.min(Math.max(Math.trunc(input.maxRegions ?? 50), 1), 200);
  const maxKeywordsPerRegion = Math.min(Math.max(Math.trunc(input.maxKeywordsPerRegion ?? 10), 1), 50);
  const maxSearchCalls = Math.min(Math.max(Math.trunc(input.maxSearchCalls ?? 250), 1), 1000);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 40), 1), 200);
  const plan = buildNicheLeadgenPlan({ niche: niche.name, customKeywords: input.keywords });
  const defaultRegions = country === "AU"
    ? ["Sydney NSW Australia", "Melbourne VIC Australia", "Brisbane QLD Australia", "Perth WA Australia", "Adelaide SA Australia", "Gold Coast QLD Australia", "Canberra ACT Australia", "Newcastle NSW Australia"]
    : country === "US"
      ? ["New York NY USA", "Los Angeles CA USA", "Chicago IL USA", "Houston TX USA", "Phoenix AZ USA", "Dallas TX USA", "Miami FL USA", "Seattle WA USA"]
      : country === "UK"
        ? ["London UK", "Manchester UK", "Birmingham UK", "Leeds UK", "Glasgow UK", "Liverpool UK", "Bristol UK", "Sheffield UK"]
        : [`${country}`];
  const regions = unique((input.regions?.length ? input.regions : defaultRegions).map((region) => region.trim()).filter(Boolean)).slice(0, maxRegions);
  const keywords = unique([...(input.keywords ?? []), ...plan.mapsQueries].map((keyword) => keyword.trim()).filter(Boolean)).slice(0, maxKeywordsPerRegion);
  const allPlacesQueries = regions.flatMap((region, regionIndex) =>
    keywords.map((keyword, keywordIndex) => ({
      order: regionIndex * keywords.length + keywordIndex + 1,
      region,
      keyword,
      query: `${keyword} ${region}`.trim(),
      maxResults: resultsPerSearch,
      priority: regionIndex * 100 + keywordIndex,
    }))
  );
  const placesQueries = allPlacesQueries.slice(0, maxSearchCalls);
  const includeSerper = input.includeSerper !== false;
  const serperQueries = includeSerper
    ? placesQueries.slice(0, Math.min(placesQueries.length, Math.ceil(maxSearchCalls / 3))).map((item) => ({
        order: item.order,
        region: item.region,
        keyword: item.keyword,
        query: `${item.keyword} ${item.region} contact email`.trim(),
        priority: item.priority,
      }))
    : [];
  const offer = input.offer?.trim() || (country === "AU" ? "quote automation for custom joinery and cabinetry" : "AI automation and quote follow-up system");
  const painPoint = input.painPoint?.trim() || (country === "AU" ? "slow custom quote preparation and manual follow-up" : "manual lead qualification and follow-up");
  const campaignName = input.campaignName?.trim() || `${country} ${niche.name} - Outreach`;
  const blacklistKeywords = unique([...plan.blacklistKeywords, ...(input.excludeKeywords ?? [])]);
  const warnings: string[] = [];
  if (!regions.length) warnings.push("No market regions were provided.");
  if (!keywords.length) warnings.push("No discovery keywords were provided.");
  if (allPlacesQueries.length > maxSearchCalls) warnings.push(`Places search plan capped from ${allPlacesQueries.length} to ${maxSearchCalls} calls.`);
  if (placesQueries.length * resultsPerSearch < targetCount) warnings.push("Estimated result slots are below targetCount; increase maxSearchCalls, regions, or resultsPerSearch.");
  if (languageCode !== "en" && country !== "SK") warnings.push("Non-English international campaign selected; review sequence copy before Smartlead setup.");
  const nextToolCalls: InternationalMarketLeadgenPreview["nextToolCalls"] = [
    ...placesQueries.slice(0, maxNextCalls).map((item) => ({
      tool: "arcigy.search_google_places",
      payload: { query: item.query, maxResults: item.maxResults, languageCode, regionCode },
      reason: `International Places search ${item.order}: ${item.keyword} / ${item.region}.`,
      approvalRequired: false,
    })),
  ];
  for (const item of serperQueries.slice(0, Math.max(0, maxNextCalls - nextToolCalls.length))) {
    nextToolCalls.push({
      tool: "arcigy.search_serper",
      payload: { query: item.query, num: 10, gl: country.toLowerCase(), hl: languageCode },
      reason: `Fallback web search for contact pages: ${item.keyword} / ${item.region}.`,
      approvalRequired: false,
    });
  }
  nextToolCalls.push(
    {
      tool: "arcigy.build_research_results_import_preview",
      payload: {
        sourceName,
        sourceType: "mixed",
        placesResults: [],
        serperResults: [],
        niche,
        country,
        defaultRegion: regions[0],
        blacklistKeywords,
        offer,
        language: languageCode === "sk" ? "sk" : "en",
        maxResults: targetCount,
      },
      reason: "Po Places/Serper vysledkoch normalizuj leady, deduplikuj domeny a priprav scrape, AI intro a Smartlead queue.",
      approvalRequired: false,
    },
    {
      tool: "arcigy.build_company_research_queue_preview",
      payload: {
        sourceName,
        leads: [],
        niche,
        defaultRegion: regions[0],
        country,
        offer,
        language: languageCode === "sk" ? "sk" : "en",
        includeGooglePlaces: false,
        includeSerper: false,
        includeDispatch: true,
      },
      reason: "Po importe partial leadov priprav website scrape, AI intro a Smartlead dispatch plan.",
      approvalRequired: false,
    },
    {
      tool: "arcigy.build_bulk_ai_intro_work_queue_preview",
      payload: {
        groups: [{ sourceName, niche: niche.name, leads: [] }],
        offer,
        language: languageCode === "sk" ? "sk" : "en",
        maxLeadsPerPacket: 50,
      },
      reason: "Rozdel obohatene leady do AI intro work packetov pre ChatGPT/Claude.",
      approvalRequired: false,
    }
  );
  if (input.includeSmartleadPackage !== false) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_fixed_campaign_package_preview",
      payload: {
        niche,
        campaignName,
        offer,
        painPoint,
        language: languageCode === "sk" ? "sk" : "en",
        emailAccountIds: input.emailAccountIds,
        leads: [],
      },
      reason: "Priprav international Smartlead campaign package a approval payloady az po doplneni obohatenych leadov.",
      approvalRequired: false,
    });
  }
  const status: InternationalMarketLeadgenPreview["status"] = !regions.length || !keywords.length
    ? "blocked"
    : warnings.length
      ? "attention"
      : "ready";
  return {
    mode: "international-market-leadgen-preview",
    status,
    summary: `International market leadgen ${status}: ${marketName}, ${placesQueries.length} Places calls, ${serperQueries.length} Serper calls, target ${targetCount}, Smartlead ${input.includeSmartleadPackage === false ? "skipped" : "planned"}. Ziadny fetch, AI call, zapis ani upload neprebehol.`,
    market: { name: marketName, country, regionCode, languageCode, sourceName },
    niche,
    target: { targetCount, resultsPerSearch, maxSearchCalls, maxRegions, maxKeywordsPerRegion },
    totals: {
      regions: regions.length,
      keywords: keywords.length,
      placesSearchCalls: placesQueries.length,
      serperSearchCalls: serperQueries.length,
      estimatedResultSlots: placesQueries.length * resultsPerSearch,
      nextCalls: nextToolCalls.length,
    },
    regions,
    keywords,
    placesQueries,
    serperQueries,
    smartleadCampaign: input.includeSmartleadPackage === false ? undefined : { name: campaignName, offer, painPoint, emailAccountIds: input.emailAccountIds },
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
    safetyGates: [
      "Spustaj international Places search po batchoch a sleduj API quota.",
      "Pred scrape/importom deduplikuj podla place_id, domeny, telefonu a emailu.",
      "Pre non-local trhy skontroluj jazyk, offer, pravne formulacie a unsubscribe pravidla pred Smartleadom.",
      "Smartlead upload, CSV export a realne odoslanie ostavaju approval-gated.",
      "Ak provider vrati irelevantne katalogy alebo skoly, pridaj ich do excludeKeywords/blacklistKeywords a rerun preview.",
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

export function buildStickyNicheLeadgenDecisionPreview(input: {
  niches: Array<{
    id?: string;
    slug?: string;
    name: string;
    status?: string;
    priority?: number;
    keywords?: string[];
    regions?: string[];
    currentRegionIndex?: number;
    dailyTarget?: number;
    todaySent?: number;
    todayDiscovered?: number;
    todayEnriched?: number;
    todayQualified?: number;
    todayFailed?: number;
    readyLeads?: number;
    stuckLeads?: number;
    lastWorkedAt?: string;
    campaignId?: string | number | null;
    smartleadCampaignId?: string | number | null;
  }>;
  date?: string;
  stickyWindowHours?: number;
  defaultRegions?: string[];
  defaultDailyTarget?: number;
  targetCount?: number;
  batchSize?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  includeSmartleadSetup?: boolean;
  maxNextCalls?: number;
}): StickyNicheLeadgenDecisionPreview {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const stickyWindowHours = Math.min(Math.max(Math.trunc(input.stickyWindowHours ?? 48), 1), 720);
  const defaultRegions = input.defaultRegions?.length ? input.defaultRegions : ["Slovensko"];
  const defaultDailyTarget = Math.min(Math.max(Math.trunc(input.defaultDailyTarget ?? 30), 1), 250);
  const now = input.date ? Date.parse(`${date}T23:59:59.999Z`) : Date.now();
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 12), 1), 50);
  const warnings: string[] = [];

  const candidates = input.niches.map((source, index): StickyNicheLeadgenDecisionPreview["candidates"][number] => {
    const slug = source.slug?.trim() || slugify(source.name);
    const statusText = (source.status ?? "active").toLowerCase();
    const regions = source.regions?.length ? source.regions : defaultRegions;
    const currentRegionIndex = Math.min(Math.max(Math.trunc(source.currentRegionIndex ?? 0), 0), Math.max(regions.length - 1, 0));
    const region = regions[currentRegionIndex];
    const dailyTarget = Math.min(Math.max(Math.trunc(source.dailyTarget ?? defaultDailyTarget), 1), 250);
    const todaySent = Math.max(Math.trunc(source.todaySent ?? 0), 0);
    const remainingToday = Math.max(dailyTarget - todaySent, 0);
    const lastWorkedMs = source.lastWorkedAt ? Date.parse(source.lastWorkedAt) : NaN;
    const sticky = Number.isFinite(lastWorkedMs) && now - lastWorkedMs <= stickyWindowHours * 60 * 60 * 1000;
    const atLastRegion = currentRegionIndex >= regions.length - 1;
    const todayDiscovered = Math.max(Math.trunc(source.todayDiscovered ?? 0), 0);
    const todayQualified = Math.max(Math.trunc(source.todayQualified ?? 0), 0);
    const exhaustedCandidate = atLastRegion && todayDiscovered > 0 && todayDiscovered < Math.ceil(dailyTarget * 0.1) && todayQualified === 0;
    const blocked = !source.name.trim() || !slug || ["paused", "completed", "archived", "blocked"].includes(statusText);
    const filled = remainingToday <= 0;
    const attention = Boolean(source.stuckLeads || source.todayFailed || exhaustedCandidate || !source.campaignId && !source.smartleadCampaignId);
    const priority = Math.min(Math.max(Math.trunc(source.priority ?? 5), 1), 99);
    const score = blocked
      ? -1000 - index
      : filled
        ? -100 - index
        : (sticky ? 1000 : 0) + (source.readyLeads ?? 0) * 8 + remainingToday * 3 + (100 - priority) - currentRegionIndex;
    const status: StickyNicheLeadgenDecisionPreview["candidates"][number]["status"] = blocked ? "blocked" : attention ? "attention" : "ready";
    const reason = blocked
      ? `Skipped: status=${statusText || "missing"} alebo neplatna niche.`
      : filled
        ? "Denny target je uz naplneny."
        : sticky
          ? "Sticky niche z posledneho behu ma stale zostavajuci denny target."
          : "Aktivna niche ma zostavajucu kapacitu na dnes.";
    return {
      niche: { id: source.id, slug, name: source.name, region, campaignId: source.campaignId ?? source.smartleadCampaignId ?? null },
      status,
      reason,
      score,
      dailyTarget,
      todaySent,
      remainingToday,
      currentRegionIndex,
      lastWorkedAt: source.lastWorkedAt,
      exhaustedCandidate,
    };
  });

  for (const candidate of candidates) {
    if (!candidate.niche.name.trim()) warnings.push("Skipped niche with missing name.");
    if (!candidate.niche.slug) warnings.push(`Skipped ${candidate.niche.name || "unknown niche"} because slug is missing.`);
  }

  const active = candidates.filter((item) => item.status !== "blocked");
  const workable = active.filter((item) => item.remainingToday > 0);
  const selected = [...workable].sort((a, b) => b.score - a.score)[0];
  const stickySelected = selected?.lastWorkedAt && now - Date.parse(selected.lastWorkedAt) <= stickyWindowHours * 60 * 60 * 1000;
  const decision: StickyNicheLeadgenDecisionPreview["decision"] = !selected
    ? "no_active_niche"
    : selected.exhaustedCandidate
      ? "close_or_advance_niche"
      : stickySelected
        ? "continue_sticky_niche"
        : "start_next_niche";

  const nextToolCalls: StickyNicheLeadgenDecisionPreview["nextToolCalls"] = [];
  if (selected) {
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_runbook",
      payload: {
        niche: { ...selected.niche, keywords: input.niches.find((item) => (item.slug?.trim() || slugify(item.name)) === selected.niche.slug)?.keywords },
        targetCount: input.targetCount ?? Math.max(selected.remainingToday * 2, selected.dailyTarget),
        dailyLimit: selected.remainingToday,
        batchSize: input.batchSize,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language ?? "sk",
        includeSmartleadSetup: input.includeSmartleadSetup === true || !selected.niche.campaignId,
      },
      reason: `Priprav denny leadgen runbook pre vybranu ${selected.niche.name}${selected.niche.region ? ` / ${selected.niche.region}` : ""}.`,
      approvalRequired: false,
    });
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_run_closure_preview",
      payload: {
        niche: {
          id: selected.niche.id,
          slug: selected.niche.slug,
          name: selected.niche.name,
          region: selected.niche.region,
          campaignId: selected.niche.campaignId,
          dailyTarget: selected.dailyTarget,
        },
        stats: {
          discovered: input.niches.find((item) => (item.slug?.trim() || slugify(item.name)) === selected.niche.slug)?.todayDiscovered ?? 0,
          enriched: input.niches.find((item) => (item.slug?.trim() || slugify(item.name)) === selected.niche.slug)?.todayEnriched ?? 0,
          qualified: input.niches.find((item) => (item.slug?.trim() || slugify(item.name)) === selected.niche.slug)?.todayQualified ?? 0,
          sentToSmartlead: selected.todaySent,
          failed: input.niches.find((item) => (item.slug?.trim() || slugify(item.name)) === selected.niche.slug)?.todayFailed ?? 0,
        },
        date,
        advanceRegion: selected.exhaustedCandidate,
        offer: input.offer,
        painPoint: input.painPoint,
        language: input.language ?? "sk",
      },
      reason: "Po behu priprav closure ledger, region advance a local niche run zapis na explicitne schvalenie.",
      approvalRequired: false,
    });
  } else {
    nextToolCalls.push({
      tool: "arcigy.build_region_expansion_queue_preview",
      payload: { niches: input.niches, defaultRegions, dailyLimit: defaultDailyTarget, offer: input.offer, painPoint: input.painPoint, language: input.language ?? "sk" },
      reason: "Nie je aktivna niche s kapacitou; priprav region expansion alebo dalsiu frontu.",
      approvalRequired: false,
    });
  }

  if (selected?.exhaustedCandidate) {
    warnings.push(`${selected.niche.name} looks exhausted in current region; closure should advance region or mark completed.`);
  }
  const totals = {
    niches: candidates.length,
    active: active.length,
    completed: input.niches.filter((item) => (item.status ?? "").toLowerCase() === "completed").length,
    paused: input.niches.filter((item) => ["paused", "blocked"].includes((item.status ?? "").toLowerCase())).length,
    filledToday: candidates.filter((item) => item.remainingToday <= 0 && item.status !== "blocked").length,
    stickyCandidates: candidates.filter((item) => item.lastWorkedAt && Number.isFinite(Date.parse(item.lastWorkedAt)) && now - Date.parse(item.lastWorkedAt) <= stickyWindowHours * 60 * 60 * 1000).length,
  };
  const status: StickyNicheLeadgenDecisionPreview["status"] = !selected ? "blocked" : warnings.length || selected.status === "attention" ? "attention" : "ready";
  return {
    mode: "sticky-niche-leadgen-decision-preview",
    status,
    decision,
    date,
    summary: selected
      ? `Sticky niche decision: ${decision} -> ${selected.niche.name}${selected.niche.region ? ` / ${selected.niche.region}` : ""}, remaining ${selected.remainingToday}/${selected.dailyTarget}. Ziadny zapis, scrape ani upload neprebehol.`
      : "Sticky niche decision: no active niche with remaining daily capacity. Ziadny zapis, scrape ani upload neprebehol.",
    selected,
    candidates: candidates.sort((a, b) => b.score - a.score),
    totals,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildLeadgenRunResumePreview(input: {
  niche: {
    id?: string;
    slug?: string;
    name: string;
    region?: string;
    campaignId?: string | number | null;
    smartleadCampaignId?: string | number | null;
    keywords?: string[];
    dailyTarget?: number;
  };
  runId?: string;
  date?: string;
  failedStage?: string;
  failureReason?: string;
  discoveredLeads?: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
  scrapedResults?: Array<Partial<ScrapedWebsiteContacts>>;
  selectedContacts?: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; evidenceText?: string }>;
  preparedLeads?: Array<LeadCandidateInput & { scraped?: Partial<ScrapedWebsiteContacts>; intro?: Partial<LeadIntroDraft>; context?: string }>;
  readyLeads?: LeadCandidateInput[];
  introDrafts?: Array<Partial<LeadIntroDraft> & { id?: string; email?: string; icebreakerSentence?: string; icebreaker_sentence?: string }>;
  sentToSmartlead?: number;
  dailyTarget?: number;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  batchSize?: number;
  maxNextCalls?: number;
}): LeadgenRunResumePreview {
  const slug = input.niche.slug?.trim() || slugify(input.niche.name);
  const campaignId = input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null;
  const dailyTarget = Math.min(Math.max(Math.trunc(input.dailyTarget ?? input.niche.dailyTarget ?? 30), 1), 250);
  const language = input.language ?? "sk";
  const discoveredLeads = input.discoveredLeads ?? [];
  const scrapedResults = input.scrapedResults ?? [];
  const selectedContacts = input.selectedContacts ?? [];
  const preparedLeads = input.preparedLeads ?? [];
  const readyLeads = input.readyLeads ?? [];
  const introDrafts = input.introDrafts ?? [];
  const sentToSmartlead = Math.max(Math.trunc(input.sentToSmartlead ?? 0), 0);
  const maxNextCalls = Math.min(Math.max(Math.trunc(input.maxNextCalls ?? 12), 1), 50);

  const discoveredWithScrapes = discoveredLeads.map((lead) => {
    const scraped = lead.scraped ?? scrapedResults.find((scrape) => scrapeMatchesLead(scrape, lead));
    const intro = lead.intro ?? introDrafts.find((draft) => introMatchesLead(draft, lead));
    return normalizePipelineLead({ ...lead, scraped, intro, context: lead.context }, slug, slug);
  });
  const contactLeads = selectedContacts.length
    ? selectedContacts.map((lead) => normalizePipelineLead(lead, slug, slug))
    : preparedLeads.length
      ? preparedLeads.map((lead) => normalizePipelineLead(lead, slug, slug))
      : readyLeads.length
        ? readyLeads
        : discoveredLeads.filter((lead) => Boolean(lead.email)).map((lead) => normalizePipelineLead(lead, slug, slug));
  const introReadyLeads = uniqueByLeadIdentity([
    ...preparedLeads.map((lead) => normalizePipelineLead(lead, slug, slug)),
    ...readyLeads,
    ...contactLeads,
  ]).filter((lead) => Boolean(extractLeadIntro(lead)));
  const smartleadReady = introReadyLeads.filter((lead) => lead.email && lead.website && lead.companyName && extractLeadIntro(lead));
  const websitesToScrape = unique(discoveredLeads
    .filter((lead) => lead.website && !scrapedResults.some((scrape) => scrapeMatchesLead(scrape, lead)))
    .map((lead) => lead.website as string));
  const leadsMissingIntro = contactLeads.filter((lead) => lead.email && !extractLeadIntro(lead));
  const leadsNeedingRepair = uniqueByLeadIdentity([
    ...contactLeads.filter((lead) => !lead.email || !lead.companyName || !lead.website),
    ...introReadyLeads.filter((lead) => !lead.email || !lead.website || !lead.companyName),
  ]);

  const checkpoint = {
    discovered: discoveredLeads.length,
    scraped: scrapedResults.length,
    contactsSelected: contactLeads.length,
    introsReady: introReadyLeads.length,
    readyForSmartlead: smartleadReady.length,
    sentToSmartlead,
    remainingToTarget: Math.max(dailyTarget - sentToSmartlead, 0),
  };
  const failedStage = input.failedStage?.trim().toLowerCase();
  const failureReason = input.failureReason?.trim();
  const needsDiscovery = checkpoint.discovered === 0;
  const needsScrape = checkpoint.discovered > 0 && scrapedResults.length === 0 && websitesToScrape.length > 0;
  const needsContactSelection = scrapedResults.length > 0 && checkpoint.contactsSelected === 0;
  const needsAiIntro = checkpoint.contactsSelected > 0 && leadsMissingIntro.length > 0;
  const needsRepair = Boolean(failedStage || failureReason || leadsNeedingRepair.length > 0);
  const needsSmartleadUpload = Boolean(campaignId) && checkpoint.readyForSmartlead > checkpoint.sentToSmartlead;
  const needsClosure = checkpoint.sentToSmartlead > 0 && !needsSmartleadUpload && !needsAiIntro && !needsContactSelection && !needsScrape;

  let resumeFrom: LeadgenRunResumePreview["resumeFrom"] = "done";
  if (!input.niche.name.trim() || !slug) resumeFrom = "discovery";
  else if (needsDiscovery) resumeFrom = "discovery";
  else if (needsScrape) resumeFrom = "scrape";
  else if (needsContactSelection) resumeFrom = "contact_selection";
  else if (needsAiIntro) resumeFrom = "ai_intro";
  else if (needsRepair && !needsSmartleadUpload) resumeFrom = "qa_repair";
  else if (needsSmartleadUpload) resumeFrom = "smartlead_upload";
  else if (needsClosure) resumeFrom = "closure";

  const nextToolCalls: LeadgenRunResumePreview["nextToolCalls"] = [];
  if (resumeFrom === "discovery") {
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_runbook",
      payload: { niche: { id: input.niche.id, slug, name: input.niche.name, keywords: input.niche.keywords, region: input.niche.region, campaignId }, dailyLimit: dailyTarget, offer: input.offer, painPoint: input.painPoint, language },
      reason: "Run nema dost leadov alebo uz poslal vsetko pripravene; priprav dalsi discovery/scrape/intro runbook.",
      approvalRequired: false,
    });
  }
  if (resumeFrom === "scrape" || websitesToScrape.length) {
    nextToolCalls.push({
      tool: "arcigy.batch_scrape_website_contacts",
      payload: { urls: websitesToScrape.slice(0, 50) },
      reason: "Discovery leady maju weby bez scrape vysledkov; pokracuj kontakt scrape batchom.",
      approvalRequired: false,
    });
  }
  if (resumeFrom === "contact_selection" || (scrapedResults.length && checkpoint.contactsSelected === 0)) {
    nextToolCalls.push({
      tool: "arcigy.build_outreach_contact_selection_preview",
      payload: { scrapedResults, leads: discoveredLeads, sourceName: input.niche.name, offer: input.offer, language },
      reason: "Scrape vysledky existuju, ale este nie je vybrany najlepsi outreach kontakt.",
      approvalRequired: false,
    });
  }
  if (resumeFrom === "ai_intro" || leadsMissingIntro.length) {
    nextToolCalls.push({
      tool: "arcigy.build_ai_intro_work_packet_preview",
      payload: { leads: leadsMissingIntro.slice(0, 100), offer: input.offer, language, batchSize: input.batchSize ?? 25 },
      reason: "Kontakty maju email, ale chybaju AI icebreakery/personalized intro.",
      approvalRequired: false,
    });
  }
  if (needsRepair) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: leadsNeedingRepair.slice(0, 100), offer: input.offer, language },
      reason: "Run ma failure/stuck stav alebo leady s chybajucim emailom, webom, company name alebo introm.",
      approvalRequired: false,
    });
  }
  if (needsSmartleadUpload) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { niche: { id: input.niche.id, slug, name: input.niche.name, campaignId }, leads: smartleadReady.slice(sentToSmartlead), batchSize: input.batchSize ?? 50 },
      reason: "Ready leadov je viac ako uz odoslanych do Smartlead; priprav approval-gated upload payload.",
      approvalRequired: false,
    });
  }
  if (needsClosure || resumeFrom === "done") {
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_run_closure_preview",
      payload: { niche: { id: input.niche.id, slug, name: input.niche.name, region: input.niche.region, campaignId, dailyTarget }, stats: { discovered: checkpoint.discovered, enriched: Math.max(checkpoint.contactsSelected, checkpoint.introsReady), qualified: checkpoint.readyForSmartlead, sentToSmartlead, failed: leadsNeedingRepair.length }, offer: input.offer, painPoint: input.painPoint, language },
      reason: "Po uploadoch alebo pri hotovom rune priprav denny closure ledger a lokalny zapis na schvalenie.",
      approvalRequired: false,
    });
  }

  const warnings: string[] = [];
  if (!input.niche.name.trim()) warnings.push("Niche name is missing.");
  if (!slug) warnings.push("Niche slug is missing and could not be inferred.");
  if (!campaignId) warnings.push("Smartlead campaignId is missing; upload step will need campaign setup first.");
  if (sentToSmartlead > smartleadReady.length) warnings.push("sentToSmartlead is higher than readyForSmartlead; verify checkpoint numbers.");
  if (failedStage) warnings.push(`Run reports failedStage=${failedStage}.`);
  if (failureReason) warnings.push(`Run reports failureReason=${failureReason.slice(0, 180)}.`);
  const status: LeadgenRunResumePreview["status"] = !input.niche.name.trim() || !slug
    ? "blocked"
    : warnings.length || needsRepair || resumeFrom !== "done"
      ? "attention"
      : "ready";
  const repairHints = unique([
    ...leadsNeedingRepair.flatMap((lead) => leadGaps(lead).map((gap) => `${lead.companyName ?? lead.website ?? lead.email ?? "unknown lead"} missing ${gap}`)),
    failedStage ? `failed stage: ${failedStage}` : "",
    failureReason ? `failure: ${failureReason}` : "",
  ].filter(Boolean)).slice(0, 30);

  return {
    mode: "leadgen-run-resume-preview",
    status,
    summary: `Leadgen resume ${status}: checkpoint discovered ${checkpoint.discovered}, scraped ${checkpoint.scraped}, contacts ${checkpoint.contactsSelected}, intros ${checkpoint.introsReady}, ready ${checkpoint.readyForSmartlead}, sent ${checkpoint.sentToSmartlead}. Pokracuj od ${resumeFrom}. Ziadny scrape, AI call ani upload neprebehol.`,
    run: { runId: input.runId, date: input.date, failedStage: input.failedStage, failureReason },
    niche: { id: input.niche.id, slug, name: input.niche.name, region: input.niche.region, campaignId, dailyTarget },
    checkpoint,
    resumeFrom,
    decisions: { needsDiscovery, needsScrape, needsContactSelection, needsAiIntro, needsRepair, needsSmartleadUpload, needsClosure },
    repairHints,
    nextToolCalls: dedupeNextToolCalls(nextToolCalls).slice(0, maxNextCalls),
    warnings,
  };
}

export function buildDailyLeadgenRunClosurePreview(input: {
  niche: {
    id?: string;
    slug?: string;
    name: string;
    regions?: string[];
    currentRegionIndex?: number;
    dailyTarget?: number;
    campaignId?: string | number | null;
    smartleadCampaignId?: string | number | null;
  };
  stats: { discovered?: number; enriched?: number; qualified?: number; sentToSmartlead?: number; sent_to_smartlead?: number; failed?: number };
  date?: string;
  workedAt?: string;
  advanceRegion?: boolean;
  markCompletedIfExhausted?: boolean;
  offer?: string;
  painPoint?: string;
  language?: "sk" | "en";
  batchSize?: number;
}): DailyLeadgenRunClosurePreview {
  const slug = input.niche.slug?.trim() || slugify(input.niche.name);
  const regions = input.niche.regions?.length ? input.niche.regions : [];
  const currentRegionIndex = Math.max(Math.trunc(input.niche.currentRegionIndex ?? 0), 0);
  const activeRegion = regions.length ? regions[currentRegionIndex % regions.length] : undefined;
  const nextRegionIndex = currentRegionIndex + 1;
  const nextRegion = regions.length ? regions[nextRegionIndex % regions.length] : undefined;
  const dailyTarget = Math.min(Math.max(Math.trunc(input.niche.dailyTarget ?? 30), 1), 250);
  const stats = {
    discovered: Math.max(Math.trunc(input.stats.discovered ?? 0), 0),
    enriched: Math.max(Math.trunc(input.stats.enriched ?? 0), 0),
    qualified: Math.max(Math.trunc(input.stats.qualified ?? 0), 0),
    sentToSmartlead: Math.max(Math.trunc(input.stats.sentToSmartlead ?? input.stats.sent_to_smartlead ?? 0), 0),
    failed: Math.max(Math.trunc(input.stats.failed ?? 0), 0),
  };
  const exhaustedCandidate = stats.discovered < Math.ceil(dailyTarget * 0.1) && (!regions.length || nextRegionIndex >= regions.length);
  const needsMoreDiscovery = stats.discovered < dailyTarget && !exhaustedCandidate;
  const needsRepair = stats.enriched > stats.qualified || stats.failed > 0;
  const needsSmartleadUpload = stats.qualified > stats.sentToSmartlead;
  const advanceRegion = input.advanceRegion !== false;
  const markCompletedIfExhausted = input.markCompletedIfExhausted !== false;
  const recordLocalNicheRun = {
    slug,
    nicheId: input.niche.id,
    date: input.date,
    workedAt: input.workedAt,
    advanceRegion,
    markCompletedIfExhausted,
    stats,
    approval: { approved: true as const },
  };
  const nextToolCalls: DailyLeadgenRunClosurePreview["nextToolCalls"] = [{
    tool: "arcigy.record_local_niche_run",
    payload: recordLocalNicheRun as unknown as Record<string, unknown>,
    reason: "Po kontrole operatorom zapis denny run, posun region index a pripadne oznac vycerpany niche.",
    approvalRequired: true,
  }];
  if (needsRepair) {
    nextToolCalls.push({
      tool: "arcigy.build_lead_repair_queue_preview",
      payload: { leads: [], offer: input.offer, language: input.language ?? "sk" },
      reason: "Run ma failed/nequalified rozdiel; nacitaj stuck leady z DB/exportu a oprav email, meno alebo intro pred dalsim uploadom.",
      approvalRequired: false,
    });
  }
  if (needsSmartleadUpload) {
    nextToolCalls.push({
      tool: "arcigy.build_smartlead_injection_plan",
      payload: { niche: { id: input.niche.id, slug, name: input.niche.name, campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null }, leads: [], batchSize: input.batchSize ?? 50 },
      reason: "Qualified leady prevysuju odoslane; po nacitani ready leadov priprav Smartlead upload payload.",
      approvalRequired: false,
    });
  }
  if (needsMoreDiscovery) {
    nextToolCalls.push({
      tool: "arcigy.build_daily_leadgen_runbook",
      payload: { niche: { id: input.niche.id, slug, name: input.niche.name, region: nextRegion ?? activeRegion, campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null }, dailyLimit: dailyTarget, offer: input.offer, painPoint: input.painPoint, language: input.language ?? "sk" },
      reason: "Target nebol naplneny a niche nie je vycerpany; priprav dalsi denny run pre dalsi region.",
      approvalRequired: false,
    });
  }
  nextToolCalls.push({
    tool: "arcigy.get_leadgen_daily_report",
    payload: { date: input.date },
    reason: "Po zapise runu skontroluj denny report a stuck leady.",
    approvalRequired: false,
  });
  const warnings: string[] = [];
  if (!slug) warnings.push("Niche slug is missing and could not be inferred.");
  if (stats.sentToSmartlead > stats.qualified) warnings.push("sentToSmartlead is higher than qualified; verify run stats before approval.");
  if (stats.qualified > stats.enriched) warnings.push("qualified is higher than enriched; verify run stats before approval.");
  const status: DailyLeadgenRunClosurePreview["status"] = !slug || !input.niche.name.trim()
    ? "blocked"
    : warnings.length || needsRepair || needsSmartleadUpload || exhaustedCandidate
      ? "attention"
      : "ready";
  const rate = (num: number, denom: number) => denom > 0 ? Math.round((num / denom) * 100) : 0;
  return {
    mode: "daily-leadgen-run-closure-preview",
    status,
    summary: `Daily leadgen closure ${status}: ${stats.discovered} discovered, ${stats.enriched} enriched, ${stats.qualified} qualified, ${stats.sentToSmartlead} sent, ${stats.failed} failed. ${exhaustedCandidate ? "Niche vyzera vycerpany. " : ""}Ziadny zapis ani upload neprebehol.`,
    niche: {
      id: input.niche.id,
      slug,
      name: input.niche.name,
      activeRegion,
      nextRegion,
      currentRegionIndex,
      nextRegionIndex,
      dailyTarget,
      campaignId: input.niche.campaignId ?? input.niche.smartleadCampaignId ?? null,
    },
    stats,
    rates: {
      enrichmentRate: rate(stats.enriched, stats.discovered),
      qualificationRate: rate(stats.qualified, stats.enriched),
      sendRate: rate(stats.sentToSmartlead, stats.qualified),
      targetFillRate: rate(stats.sentToSmartlead, dailyTarget),
    },
    decisions: { advanceRegion, markCompletedIfExhausted, exhaustedCandidate, needsMoreDiscovery, needsRepair, needsSmartleadUpload },
    approvalPayloads: { recordLocalNicheRun },
    nextToolCalls: dedupeNextToolCalls(nextToolCalls),
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

function phoneResultPhones(result: Record<string, unknown>): string[] {
  const phones = [
    ...(Array.isArray(result.phones) ? result.phones.map(String) : []),
    stringField(result, "phone", "international_phone", "phone_number", "tel"),
  ].filter((phone): phone is string => Boolean(phone));
  return unique(phones.map(normalizePhoneCandidate).filter((phone): phone is string => Boolean(phone)));
}

function normalizePhoneCandidate(phone: string): string | undefined {
  const cleaned = phone.replace(/\s+/g, " ").trim();
  return cleaned.replace(/\D/g, "").length >= 7 ? cleaned : undefined;
}

function phoneDedupeKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

function coldCallCity(lead: LeadCandidateInput, fallback?: string): string | undefined {
  return stringField(lead.customFields ?? {}, "city", "district_city", "region", "research_region") ?? fallback;
}

function numberFromLead(lead: LeadCandidateInput, ...keys: string[]): number | undefined {
  const record = lead as Record<string, unknown>;
  return numberField(record, ...keys) ?? numberField(lead.customFields ?? {}, ...keys);
}

function phoneResultUrls(result: Record<string, unknown>): string[] {
  return unique([
    stringField(result, "url"),
    stringField(result, "finalUrl"),
    stringField(result, "website"),
    stringField(result, "domain"),
  ].filter((url): url is string => Boolean(url)));
}

function phoneResultEmails(result: Record<string, unknown>): string[] {
  return unique([
    ...(Array.isArray(result.emails) ? result.emails.map(String) : []),
    stringField(result, "email", "primary_email"),
  ].filter((email): email is string => Boolean(email)).map((email) => email.trim().toLowerCase()));
}

function phoneResultMatchesLead(result: Record<string, unknown>, lead: LeadCandidateInput): { matchedBy: string[] } {
  const matchedBy: string[] = [];
  const resultDomains = new Set([
    ...phoneResultUrls(result).map(normalizeDomain),
    ...phoneResultEmails(result).map((email) => normalizeDomain(email.split("@")[1] ?? "")),
  ].filter(Boolean));
  const leadDomains = unique([
    lead.website ? normalizeDomain(lead.website) : "",
    lead.email ? normalizeDomain(lead.email.split("@")[1] ?? "") : "",
  ].filter(Boolean));
  if (leadDomains.some((domain) => resultDomains.has(domain))) matchedBy.push("domain");
  const leadEmail = lead.email?.trim().toLowerCase();
  if (leadEmail && phoneResultEmails(result).includes(leadEmail)) matchedBy.push("email");
  const leadCompany = slugify(lead.companyName ?? "");
  const resultCompany = slugify(stringField(result, "companyName", "company_name", "name", "title") ?? "");
  if (leadCompany && resultCompany && (leadCompany === resultCompany || leadCompany.includes(resultCompany) || resultCompany.includes(leadCompany))) {
    matchedBy.push("company");
  }
  return { matchedBy: unique(matchedBy) };
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

function buildSmartleadLeadSyncPayload(localLead: SmartleadLead, remoteLead: SmartleadLead): { changedFields: string[]; payload: SmartleadLead } {
  const customFields = { ...(remoteLead.custom_fields ?? {}), ...(localLead.custom_fields ?? {}) };
  const payload: SmartleadLead = {
    email: localLead.email,
    first_name: localLead.first_name ?? remoteLead.first_name,
    last_name: localLead.last_name ?? remoteLead.last_name,
    company_name: localLead.company_name ?? remoteLead.company_name,
    website: localLead.website ?? remoteLead.website,
    custom_fields: customFields,
  };
  const changedFields: string[] = [];
  const compare = (field: keyof SmartleadLead, label = String(field)) => {
    if (normalizedCompareValue(payload[field]) !== normalizedCompareValue(remoteLead[field])) changedFields.push(label);
  };
  compare("first_name");
  compare("last_name");
  compare("company_name");
  compare("website");
  for (const key of ["company_name_short", "personalized_intro", "icebreaker_sentence", "ico", "last_name_with_salutation"]) {
    if (normalizedCompareValue(customFields[key]) !== normalizedCompareValue(remoteLead.custom_fields?.[key])) changedFields.push(`custom_fields.${key}`);
  }
  return { changedFields: unique(changedFields), payload };
}

function localReconciliationEmail(record: Record<string, unknown>): string | undefined {
  return stringField(record, "email", "primary_email", "lead_email")?.toLowerCase();
}

function localReconciliationPatch(
  localLead: (LeadCandidateInput & {
    sentToSmartlead?: boolean;
    sent_to_smartlead?: boolean;
    smartleadContactId?: string | number;
    smartlead_contact_id?: string | number;
    replyStatus?: string;
    reply_status?: string;
    replySentiment?: string | null;
    reply_sentiment?: string | null;
  }) | undefined,
  remoteLead?: SmartleadLead & { id?: string | number; lead_id?: string | number; status?: string; category_name?: string | null; reply_status?: string; reply_sentiment?: string | null },
  update?: { smartleadContactId?: string | number; status?: string; categoryName?: string | null; localUpdate?: Record<string, string | number | boolean | null | undefined> }
): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!localLead) return update?.localUpdate;
  const contactId = update?.smartleadContactId ?? remoteLead?.id ?? remoteLead?.lead_id;
  const replyStatus = update?.status ?? remoteLead?.status ?? remoteLead?.reply_status;
  const replySentiment = update?.categoryName ?? remoteLead?.category_name ?? remoteLead?.reply_sentiment ?? null;
  const patch: Record<string, string | number | boolean | null | undefined> = {};
  if (!leadSentToSmartlead(localLead)) patch.sent_to_smartlead = true;
  const currentContactId = stringField(localLead as Record<string, unknown>, "smartleadContactId", "smartlead_contact_id") ?? stringField(localLead.customFields ?? {}, "smartlead_contact_id");
  if (contactId !== undefined && String(contactId) !== (currentContactId ?? "")) patch.smartlead_contact_id = contactId;
  const currentReplyStatus = stringField(localLead as Record<string, unknown>, "replyStatus", "reply_status") ?? stringField(localLead.customFields ?? {}, "reply_status");
  if (replyStatus !== undefined && replyStatus !== currentReplyStatus) patch.reply_status = replyStatus;
  const currentReplySentiment = stringField(localLead as Record<string, unknown>, "replySentiment", "reply_sentiment") ?? stringField(localLead.customFields ?? {}, "reply_sentiment");
  if ((replySentiment ?? null) !== (currentReplySentiment ?? null)) patch.reply_sentiment = replySentiment ?? null;
  return Object.keys(patch).length ? patch : undefined;
}

function localLeadToSmartleadLead(lead: LeadCandidateInput): SmartleadLead {
  const customFields = cleanSmartleadCustomFields({
    ...lead.customFields,
    personalized_intro: lead.personalizedIntro ?? lead.customFields?.personalized_intro,
    icebreaker_sentence: lead.personalizedIntro ?? lead.customFields?.icebreaker_sentence,
  });
  return {
    email: lead.email ?? "",
    first_name: lead.firstName,
    last_name: lead.lastName,
    company_name: lead.companyName,
    website: lead.website,
    custom_fields: customFields,
  };
}

function cleanSmartleadCustomFields(fields: Record<string, string | number | boolean | null | undefined>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null));
}

function normalizedCompareValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
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

function leadSentToSmartlead(lead: LeadCandidateInput & { sentToSmartlead?: boolean; sent_to_smartlead?: boolean }): boolean {
  return lead.sentToSmartlead === true
    || lead.sent_to_smartlead === true
    || booleanField(lead.customFields ?? {}, "sent_to_smartlead", "sentToSmartlead", "smartlead_uploaded") === true;
}

function normalizeLeadQualityVerificationStatus(value: unknown): LeadQualityInput["verificationStatus"] | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "verified" || normalized === "ok") return "ok";
  if (normalized === "flagged") return "flagged";
  if (normalized === "failed") return "failed";
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

function buildSmartleadSequenceMarkdownTask(input: {
  niche: { slug: string; name: string; campaignId?: string | number | null };
  offer?: string;
  painPoint?: string;
  language: "sk" | "en";
  customInstructions?: string;
  baseline: SmartleadSequence[];
}): string {
  return [
    `# Smartlead sequence task - ${input.niche.name}`,
    "",
    "Vytvor alebo uprav 3-krokovu cold email sekvenciu pre Smartlead.",
    "",
    "## Kontext",
    `- Niche: ${input.niche.name}`,
    `- Slug: ${input.niche.slug}`,
    `- Jazyk: ${input.language}`,
    input.offer ? `- Offer: ${input.offer}` : "- Offer: navrhni kratko podla niche",
    input.painPoint ? `- Pain point: ${input.painPoint}` : "- Pain point: navrhni podla niche",
    input.customInstructions ? `- Instrukcie: ${input.customInstructions}` : "- Instrukcie: drz profesionalny, kratky, neprehypovany ton",
    "",
    "## Pravidla",
    "- Vrat cisty JSON bez markdownu.",
    "- Presne 3 sekvencie: delay 0, 3 a 5 dni.",
    "- Kazda sekvencia musi mat aspon variant A.",
    "- Pouzi premennu {{personalized_intro}} aspon v prvom emaile.",
    "- Pouzi %signature% na konci kazdeho emailu.",
    "- Nepouzivaj tvrdenia, ze sme uz nieco spravili alebo odoslali.",
    "- Neuvadzaj ziadne API kluce, tokeny ani interne URL.",
    "",
    "## JSON format",
    "```json",
    JSON.stringify({ sequences: input.baseline }, null, 2),
    "```",
  ].join("\n");
}

function smartleadSequenceIssues(sequence: SmartleadSequence): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(sequence.seq_number) || sequence.seq_number < 1) issues.push("missing_seq_number");
  const delay = sequence.seq_delay_details?.delay_in_days;
  if (!Number.isFinite(delay) || delay < 0) issues.push("invalid_delay");
  if (!sequence.seq_variants?.length) issues.push("missing_variants");
  for (const variant of sequence.seq_variants ?? []) {
    const subject = variant.subject?.trim() ?? "";
    const body = variant.email_body?.replace(/\s+/g, " ").trim() ?? "";
    if (!variant.variant_label?.trim()) issues.push("missing_variant_label");
    if (sequence.seq_number === 1 && !subject) issues.push("missing_first_subject");
    if (!body) issues.push("missing_body");
    if (body.length > 1800) issues.push("body_too_long");
    if (!body.includes("%signature%")) issues.push("missing_signature");
  }
  const allText = (sequence.seq_variants ?? []).map((variant) => `${variant.subject ?? ""} ${variant.email_body ?? ""}`).join(" ");
  if (sequence.seq_number === 1 && !allText.includes("{{personalized_intro}}")) issues.push("missing_personalized_intro_variable");
  if (/(api[_ -]?key|bearer token|oauth|database_url|password)/i.test(allText)) issues.push("secret_like_text");
  if (/(odoslal som|poslal som|uploadol som|sent this|i sent)/i.test(allText)) issues.push("claims_action_executed");
  return unique(issues);
}

function normalizeSequencePreview(sequence: SmartleadSequence): SmartleadSequence {
  return {
    seq_number: Math.max(1, Math.trunc(sequence.seq_number || 1)),
    seq_delay_details: { delay_in_days: Math.max(0, Math.trunc(sequence.seq_delay_details?.delay_in_days ?? 0)) },
    seq_variants: (sequence.seq_variants ?? []).map((variant, index) => ({
      variant_label: variant.variant_label?.trim() || String.fromCharCode(65 + index),
      subject: variant.subject?.trim() ?? "",
      email_body: variant.email_body?.trim() ?? "",
    })),
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

function mapResearchResultRow(
  row: Record<string, unknown>,
  sourceType: "google_places" | "serper" | "mixed",
  sourceName?: string,
  niche?: { id?: string; slug: string; name: string; campaignId?: string | number | null },
  defaultRegion?: string,
  index?: number
): LeadSourceImportQueueLead {
  const base = mapJsonLeadRow(row);
  const website = base.website
    ?? normalizeResearchWebsite(stringField(row, "websiteUri", "website_uri", "link", "url", "formattedUrl", "domain", "displayLink"));
  const companyName = base.companyName
    ?? stringField(row, "displayName", "title", "name", "businessName", "business_name");
  const address = stringField(row, "formattedAddress", "formatted_address", "address", "vicinity");
  const context = [
    base.context,
    stringField(row, "snippet", "description", "editorialSummary", "editorial_summary", "primaryTypeDisplayName", "types"),
    address,
  ].filter(Boolean).join(" ").trim() || undefined;
  const phone = base.phone ?? stringField(row, "nationalPhoneNumber", "national_phone_number", "internationalPhoneNumber", "international_phone_number");
  const placeId = base.placeId ?? stringField(row, "id", "place_id", "placeId", "googlePlaceId");
  const customFields = {
    ...base.customFields,
    source_name: sourceName,
    source_type: sourceType,
    research_result_index: index,
    research_address: address,
    google_place_id: placeId,
    niche_slug: base.nicheSlug ?? niche?.slug,
    niche_name: base.nicheName ?? niche?.name,
  };
  return {
    ...base,
    companyName,
    website,
    phone,
    source: base.source ?? sourceName ?? sourceType,
    context,
    nicheSlug: base.nicheSlug ?? niche?.slug,
    nicheName: base.nicheName ?? niche?.name,
    campaignId: base.campaignId ?? niche?.campaignId,
    smartleadCampaignId: base.smartleadCampaignId ?? niche?.campaignId,
    placeId,
    rating: base.rating ?? numberField(row, "rating"),
    reviewCount: base.reviewCount ?? numberField(row, "userRatingCount", "user_rating_count", "reviewCount", "reviews"),
    customFields,
    ...(defaultRegion ? { region: defaultRegion } : {}),
  } as LeadSourceImportQueueLead & { region?: string };
}

function normalizeResearchWebsite(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const clean = value.trim();
  if (/^https?:\/\//i.test(clean)) return normalizeWebsiteValue(clean);
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(clean)) return normalizeWebsiteValue(clean);
  return undefined;
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

function cleanRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function metricNumber(record: Record<string, unknown>, ...keys: string[]): number {
  return Math.max(0, Math.trunc(numberField(record, ...keys) ?? 0));
}

function classifyMonitorReply(event: Record<string, unknown> & {
  source?: "smartlead" | "gmail" | "manual";
  campaignId?: string | number;
  email?: string;
  leadEmail?: string;
  leadName?: string;
  companyName?: string;
  replyBody?: string;
  body?: string;
  classification?: string;
  category?: string;
}): {
  source: "smartlead" | "gmail" | "manual";
  campaignId?: string | number;
  email?: string;
  leadName?: string;
  companyName?: string;
  replyBody: string;
  category: "positive" | "negative" | "neutral";
  confidence: "high" | "medium" | "low";
} {
  const source = event.source === "gmail" || event.source === "manual" ? event.source : "smartlead";
  const replyBody = String(event.replyBody ?? event.body ?? stringField(event, "email_body", "latestLeadReply", "latest_lead_reply") ?? "").trim();
  const label = String(event.classification ?? event.category ?? stringField(event, "categoryName", "category_name", "lead_category") ?? "").toLowerCase();
  const normalizedBody = replyBody.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const negative = /negative|not interested|unsubscribe|unsubscribed|nezaujem|stop|spam/.test(label)
    || /\b(nie|nemame zaujem|nezaujem|odhlasit|unsubscribe|stop|spam)\b/.test(normalizedBody);
  const positive = /positive|interested|zaujem|ano|poslite|send|call|meeting|termin|stretn|ukaz|demo/.test(label)
    || /\b(ano|poslite|send|call|meeting|termin|demo|zaujima|zaujem|ukazku|showcase)\b/.test(normalizedBody);
  const category = negative ? "negative" : positive ? "positive" : "neutral";
  const confidence = label ? "high" : replyBody.length > 30 ? "medium" : "low";
  return {
    source,
    campaignId: event.campaignId ?? stringField(event, "campaign_id"),
    email: event.email ?? event.leadEmail ?? stringField(event, "lead_email", "to_email", "from_email"),
    leadName: event.leadName ?? stringField(event, "lead_name", "first_name"),
    companyName: event.companyName ?? stringField(event, "company_name", "company"),
    replyBody,
    category,
    confidence,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
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

function uniqueByLeadIdentity<T extends LeadCandidateInput>(leads: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const lead of leads) {
    const key = [
      lead.email?.trim().toLowerCase(),
      normalizeDomain(lead.website ?? ""),
      slugify(lead.companyName ?? ""),
    ].find(Boolean);
    if (!key) {
      result.push(lead);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(lead);
  }
  return result;
}

function extractLeadIntro(lead: LeadCandidateInput & { intro?: Partial<LeadIntroDraft>; icebreakerSentence?: string; icebreaker_sentence?: string }): string | undefined {
  return stringField(lead, "personalizedIntro", "icebreakerSentence", "icebreaker_sentence")
    ?? lead.intro?.personalizedIntro
    ?? stringField(lead.customFields ?? {}, "personalized_intro", "icebreaker_sentence");
}

function aiIntroWorkLeadId(lead: LeadCandidateInput & { id?: string; raw?: Record<string, string> }, index: number): string {
  return stringField(lead, "id", "leadId", "lead_id")
    ?? stringField(lead.customFields ?? {}, "id", "lead_id", "uuid")
    ?? stringField(lead.raw ?? {}, "id", "lead_id", "uuid")
    ?? `${slugify(aiIntroWorkCompanyName(lead) ?? lead.website ?? "lead")}-${index + 1}`;
}

function aiIntroWorkCompanyName(lead: LeadCandidateInput & { raw?: Record<string, string> }): string | undefined {
  return stringField(lead, "companyName", "company_name", "original_name", "official_company_name")
    ?? stringField(lead.customFields ?? {}, "company_name", "original_name", "official_company_name", "company_name_short")
    ?? stringField(lead.raw ?? {}, "company", "company_name", "original_name", "official_company_name");
}

function aiIntroWorkContext(lead: LeadCandidateInput & { raw?: Record<string, string>; scraped?: Partial<ScrapedWebsiteContacts>; context?: string; evidenceText?: string; businessFacts?: unknown }): string {
  const facts = Array.isArray(lead.businessFacts)
    ? lead.businessFacts.join("; ")
    : typeof lead.businessFacts === "object" && lead.businessFacts
      ? JSON.stringify(lead.businessFacts)
      : String(lead.businessFacts ?? "");
  return [
    introEvidenceText(lead),
    facts,
    stringField(lead.customFields ?? {}, "business_facts", "matched_queries", "source_context", "context_preview"),
    stringField(lead.raw ?? {}, "business_facts", "matched_queries", "description", "category"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAiIntroWorkMarkdownTask(input: {
  packetItems: AiIntroWorkPacketPreview["packetItems"];
  niche?: string;
  offer?: string;
  language: "sk" | "en";
}): string {
  const lines = [
    `# AI Intro Work Packet${input.niche ? ` - ${input.niche}` : ""}`,
    "",
    "Vytvor kratky personalizovany icebreaker pre kazdu firmu nizsie.",
    "",
    "## Pravidla",
    input.language === "en" ? "- Write in English." : "- Pis po slovensky.",
    "- Max 1-2 vety.",
    "- Musi byt konkretny k firme a vychadzat z dodaneho kontextu.",
    "- Bez pozdravu, bez mena adresata, bez tvrdenia ze si nieco vykonal.",
    "- Nepouzivaj genericke vety typu 'mate zaujimavy web' bez konkretneho faktu.",
    "- Vrat iba JSON pole v presnom formate uvedenom nizsie.",
    input.offer ? `- Ponuka/kontekst Arcigy: ${input.offer}` : "",
    "",
    "## Vystupny format",
    "```json",
    "[",
    '  { "id": "lead-id", "icebreaker": "Zaujalo ma, ze..." }',
    "]",
    "```",
    "",
    `## Firmy (${input.packetItems.length})`,
    "",
  ].filter((line) => line !== "");
  for (const item of input.packetItems) {
    lines.push(`### ${item.companyName}`);
    lines.push(`- ID: ${item.id}`);
    if (item.website) lines.push(`- Web: ${item.website}`);
    lines.push(`- Kontext: ${item.context || "(chyba kontext - pouzi len jasne dostupne fakty z nazvu/webu)"}`);
    lines.push("");
  }
  return lines.join("\n");
}

function leadgenStatusField(lead: LeadCandidateInput & { raw?: Record<string, string> }, ...keys: string[]): string | undefined {
  return stringField(lead, ...keys)
    ?? stringField(lead.customFields ?? {}, ...keys)
    ?? stringField(lead.raw ?? {}, ...keys);
}

function leadgenStatusBoolean(lead: LeadCandidateInput & { raw?: Record<string, string> }, ...keys: string[]): boolean {
  const value = leadgenStatusField(lead, ...keys);
  if (!value) return false;
  return /^(true|1|yes|ano|sent|odoslane)$/i.test(value.trim());
}

function leadgenStatusGroup(
  lead: LeadCandidateInput & { raw?: Record<string, string>; nicheSlug?: string; nicheId?: string; campaignTag?: string; campaignId?: string | number | null },
  groupBy: "niche" | "campaign" | "source",
  defaultNiche?: string
): { key: string; label: string; campaignId?: string | number | null } {
  const campaignId = lead.campaignId ?? leadgenStatusField(lead, "campaignId", "campaign_id", "smartlead_campaign_id");
  const niche = lead.nicheSlug
    ?? lead.nicheId
    ?? lead.campaignTag
    ?? leadgenStatusField(lead, "nicheSlug", "niche_slug", "niche", "niche_id", "campaign_tag")
    ?? defaultNiche;
  const source = lead.source ?? leadgenStatusField(lead, "source", "source_name");
  const raw = groupBy === "campaign"
    ? (campaignId ? String(campaignId) : niche)
    : groupBy === "source"
      ? source
      : niche;
  if (!raw?.trim()) return { key: "orphan", label: "(bez niche/campaign)", campaignId };
  const label = raw.trim();
  return { key: slugify(label) || "orphan", label, campaignId };
}

function leadgenStatusTotals(rows: Array<{
  readyForSmartlead: boolean;
  needsEmail: boolean;
  needsIntro: boolean;
  needsPhone: boolean;
  sentToSmartlead: boolean;
  verified: boolean;
  failed: boolean;
  orphan: boolean;
}>): LeadgenStatusBoardPreview["totals"] {
  return {
    input: rows.length,
    groups: 0,
    readyForSmartlead: rows.filter((row) => row.readyForSmartlead).length,
    needsEmail: rows.filter((row) => row.needsEmail).length,
    needsIntro: rows.filter((row) => row.needsIntro).length,
    needsPhone: rows.filter((row) => row.needsPhone).length,
    sentToSmartlead: rows.filter((row) => row.sentToSmartlead).length,
    verified: rows.filter((row) => row.verified).length,
    failed: rows.filter((row) => row.failed).length,
    orphan: rows.filter((row) => row.orphan).length,
  };
}

function preferBusinessEmail(emails: string[]): string | undefined {
  return emails.find((email) => !isGenericEmail(email)) ?? emails[0];
}

function rankOutreachContactEmails(emails: string[], website?: string): OutreachContactSelectionPreview["items"][number]["rankedEmails"] {
  const siteDomain = website ? normalizeDomain(website) : undefined;
  return unique(emails)
    .map((email) => {
      const value = email.trim().toLowerCase();
      const domain = value.split("@")[1] ?? "";
      const reasons: string[] = [];
      let score = 0;
      let quality: OutreachContactSelectionPreview["items"][number]["rankedEmails"][number]["quality"] = "personal";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        quality = "invalid";
        reasons.push("invalid_format");
        score -= 100;
      }
      if (isAssetLikeContactEmail(value)) {
        quality = "asset";
        reasons.push("asset_or_tracking_email");
        score -= 90;
      }
      if (siteDomain && domain === siteDomain) {
        reasons.push("same_domain");
        score += 50;
      } else if (siteDomain && domain.endsWith(`.${siteDomain}`)) {
        reasons.push("subdomain_match");
        score += 35;
      } else if (siteDomain && domain) {
        quality = quality === "personal" ? "external" : quality;
        reasons.push("external_domain");
        score -= 20;
      }
      if (isFreeMailboxContactDomain(domain)) {
        quality = quality === "personal" ? "free_mailbox" : quality;
        reasons.push("free_mailbox");
        score -= 8;
      }
      if (isGenericEmail(value)) {
        quality = quality === "personal" ? "generic" : quality;
        reasons.push("generic_inbox");
        score -= 10;
      } else {
        reasons.push("personal_like_local_part");
        score += 25;
      }
      if (/^(majitel|owner|ceo|riaditel|reditel|konatel)[.@_-]/i.test(value.split("@")[0] ?? "")) {
        reasons.push("decision_maker_alias");
        score += 15;
      }
      return { email: value, score, quality, reasons };
    })
    .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
}

function isAssetLikeContactEmail(email: string): boolean {
  return /\.(png|jpe?g|svg|gif|webp|avif|css|js)$/i.test(email) || /(^|[._-])(logo|image|img|icon|banner|tracking|noreply|no-reply)([._-]|@)/i.test(email);
}

function isFreeMailboxContactDomain(domain: string): boolean {
  return ["gmail.com", "seznam.cz", "email.cz", "centrum.cz", "post.sk", "azet.sk", "outlook.com", "hotmail.com", "icloud.com"].includes(domain);
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

function normalizeFlaggedLead(lead: LeadCandidateInput & { raw?: Record<string, string> }): LeadCandidateInput & { id?: string; raw?: Record<string, string>; evidenceText?: string } {
  const record = lead as LeadCandidateInput & { evidenceText?: string };
  const id = flaggedLeadField(lead, "id", "ID");
  const website = flaggedLeadField(lead, "website", "Webová stránka", "Webova stranka", "web", "url");
  const companyName = flaggedLeadField(lead, "companyName", "Skrátený názov", "Skrateny nazov", "Pôvodný názov firmy", "Povodny nazov firmy", "company", "company_name");
  const firstName = flaggedLeadField(lead, "firstName", "Meno Decision Makera", "decision_maker_name", "meno");
  const lastName = flaggedLeadField(lead, "lastName", "Priezvisko/Oslovenie (variable)", "decision_maker_last_name", "last_name");
  const personalizedIntro = flaggedLeadField(lead, "personalizedIntro", "AI Pochvala (Icebreaker)", "icebreaker_sentence", "icebreaker", "personalized_intro");
  const note = flaggedLeadField(lead, "Poznámka pre kontrolu", "Poznamka pre kontrolu", "verification_notes", "reviewNote", "note");
  return {
    ...lead,
    id,
    website: website ? normalizeWebsiteValue(website) : lead.website,
    companyName: companyName ?? lead.companyName,
    firstName: firstName ?? lead.firstName,
    lastName: lastName ?? lead.lastName,
    personalizedIntro: personalizedIntro ?? lead.personalizedIntro,
    evidenceText: record.evidenceText ?? note,
    customFields: {
      ...lead.customFields,
      lead_id: id ?? lead.customFields?.lead_id,
      review_note: note ?? lead.customFields?.review_note,
      decision_maker_name: firstName ?? lead.customFields?.decision_maker_name,
      decision_maker_last_name: lastName ?? lead.customFields?.decision_maker_last_name,
      icebreaker_sentence: personalizedIntro ?? lead.customFields?.icebreaker_sentence,
    },
  };
}

function flaggedLeadField(lead: LeadCandidateInput & { raw?: Record<string, string> }, ...aliases: string[]): string | undefined {
  return sheetLeadValue(lead, ...aliases);
}

function flaggedLeadIssues(lead: LeadCandidateInput & { raw?: Record<string, string>; evidenceText?: string }, note?: string): string[] {
  const issues = new Set<string>();
  const noteText = (note ?? "").toLowerCase();
  const intro = extractLeadIntro(lead);
  const website = lead.website;
  if (!website) issues.add("missing_website");
  if (website && defaultDiscoveryBlacklistDomains("sk").includes(normalizeDomain(website))) issues.add("blocked_website");
  if (!stringField(lead, "firstName", "lastName") && !stringField(lead.customFields ?? {}, "decision_maker_name", "decision_maker_last_name")) issues.add("missing_decision_maker");
  if (/no specific decision maker|decision maker[^.]{0,80}(not found|not available|could not be identified)|name not found|owner[^.]{0,80}not found|ceo[^.]{0,80}not found|founder[^.]{0,80}not found|majitel[^.]{0,80}nenajdeny|konatel[^.]{0,80}nenajdeny|no individual names/i.test(note ?? "")) issues.add("missing_decision_maker");
  if (/no website content|website content was not provided|content was not provided|provided website content|beyond the url|no content/i.test(note ?? "")) issues.add("no_website_content");
  if (/general compliment|generic compliment|domain name|company name|inferred/i.test(note ?? "")) issues.add("weak_ai_evidence");
  for (const issue of introQualityIssues(intro, importantIntroTerms(introEvidenceText(lead)), 0, lead)) issues.add(issue);
  if (intro && /naozaj ma zaujalo|v dnesnej dobe|mimoriadne dolezite|klucova|cenne/i.test(intro.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) && noteText.includes("not provided")) {
    issues.add("generic_intro");
  }
  return [...issues];
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

function isUsableBatchQaEmail(email: string | undefined): boolean {
  const value = email?.trim().toLowerCase();
  if (!value) return false;
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(value)) return false;
  if (value.includes("example") || value.includes("sentry.") || /%[0-9a-f]{2}/i.test(value)) return false;
  if (/\.(png|jpg|jpeg|svg|gif|webp|avif|webm)$/i.test(value)) return false;
  if (/^(e-?shop|support|podpora|reklamace|webmaster|marketing|newsletter|license|noreply|no-reply)@/i.test(value)) return false;
  if (/(adresa\.cz|domena\.cz|e-mail\.cz|php\.net|freebiesxpress|rambler\.ru|a\.an)$/i.test(value)) return false;
  return true;
}

function classifyIdentityEmail(email: string | undefined): "personal" | "generic" | "invalid" | "missing" {
  const value = email?.trim().toLowerCase();
  if (!value) return "missing";
  if (!isUsableBatchQaEmail(value)) return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(value) ? "generic" : "invalid";
  const local = value.split("@")[0] ?? "";
  if (genericEmailLocalParts.has(normalizeNameToken(local.replace(/[._+\-]+/g, " ")))) return "generic";
  if (/^(info|kontakt|contact|office|hello|sales|support|admin|marketing|obchod|servis|reklamacie|objednavky|recepcia|fakturacia)([._+\-]|\d|$)/i.test(local)) return "generic";
  return "personal";
}

const genericEmailLocalParts = new Set([
  "info", "kontakt", "contact", "mail", "hello", "office", "admin", "webmaster", "support", "sales",
  "dopyt", "objednavky", "predajna", "prijem", "servis", "marketing", "obchod", "technik",
  "administrativa", "fakturacia", "recepcia", "newsletter", "eshop", "team", "firma", "katalog",
]);

function inferPersonNameFromEmail(email: string | undefined, companyName?: string, website?: string): { fullName?: string; confidence: "high" | "medium" | "low" } {
  if (classifyIdentityEmail(email) !== "personal") return { confidence: "low" };
  const local = email!.split("@")[0]?.split("+")[0] ?? "";
  const tokens = local
    .split(/[._\-]+/g)
    .map((part) => part.replace(/\d+/g, "").trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !genericEmailLocalParts.has(normalizeNameToken(part)));
  const blocked = new Set([...(companyName ?? "").split(/\s+/), ...(brandFromWebsite(website) ?? "").split(/\s+/)].map((part) => normalizeNameToken(part)).filter(Boolean));
  const personTokens = tokens.filter((part) => !blocked.has(normalizeNameToken(part)));
  if (personTokens.length >= 2) {
    return { fullName: personTokens.slice(0, 2).map(titleCaseNamePart).join(" "), confidence: "high" };
  }
  if (personTokens.length === 1 && /[._\-]/.test(local)) {
    return { fullName: titleCaseNamePart(personTokens[0]), confidence: "medium" };
  }
  return { confidence: "low" };
}

function titleCaseNamePart(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function looksLikeBusinessAlias(name: string | undefined): boolean {
  const value = normalizeNameToken(name ?? "");
  if (!value) return false;
  return [
    "truhlar", "stolar", "kuchyn", "interier", "nabytok", "nabytek", "studio", "showroom", "design",
    "atelier", "wood", "team", "group", "company", "firma", "praha", "brno", "ostrava", "doprava",
    "restaurace", "menu", "eshop", "kontakt", "kvalitni", "lokalni",
  ].some((token) => value.includes(token));
}

function isBlockedLeadSourceDomain(website: string): boolean {
  const domain = normalizeWebsiteIdentity(website);
  if (!domain) return false;
  const blocked = new Set([
    "firmuj.cz", "hledat.cz", "epoptavka.cz", "jooble.org", "waze.com", "casopisobydleni.cz", "baumax.cz",
    "bazos.cz", "sbazar.cz", "facebook.com", "instagram.com", "favi.cz", "heureka.cz", "mapy.cz", "firmy.cz",
    "idatabaze.cz", "zivefirmy.cz", "najisto.cz", "modrastrecha.cz", "starofservice.cz", "stavportal.cz",
    "bydlo.cz", "doporucenefirmy.cz", "easy-prace.cz", "alza.sk", "mall.sk", "booking.com", "tripadvisor.com",
  ]);
  return blocked.has(domain) || domain.endsWith(".pl") || /^(info-|katalog-)/i.test(domain);
}

function leadMatchesCountry(lead: LeadCandidateInput & { raw?: Record<string, string> }, country: string): boolean {
  const expected = country.trim().toLowerCase();
  const values = [
    lead.customFields?.country,
    lead.customFields?.orgCountry,
    lead.customFields?.org_country,
    lead.raw?.country,
    lead.raw?.orgCountry,
    lead.raw?.org_country,
  ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  return values.some((value) => value === expected || slugify(value) === slugify(expected));
}

function isScrapableLeadWebsite(website: string | undefined): boolean {
  if (!website?.trim()) return false;
  if (/^(mailto:|tel:|javascript:)/i.test(website)) return false;
  if (/linkedin\.com|facebook\.com|instagram\.com/i.test(website)) return false;
  return Boolean(normalizeDomain(website));
}

function cleanLeadCompanyShort(value: string | undefined, website?: string, fallbackName?: string): string | undefined {
  const fallback = fallbackName?.trim() || brandFromWebsite(website);
  let raw = value?.replace(/\s+/g, " ").trim() || fallback;
  if (!raw) return undefined;
  raw = raw
    .replace(/\s+[-–—]\s+(kompletni|kompletne|vyroba|realizace|kuchyne|nabytok|nabytek).*$/iu, "")
    .replace(/:\s*(vyrobime|stolarstvo|truhlarstvi|kuchyne|nabytek|vyroba).*$/iu, "")
    .replace(/[^\p{L}\p{N}\s.&-]/gu, "")
    .trim();
  const normalized = normalizeNameToken(raw);
  if (
    raw.length < 3 ||
    raw.length > 38 ||
    ["vestavene skrine", "kuchyne praha", "kuchyne a nabytek", "nabytek na miru", "zakazkova vyroba", "showroom", "kontakt", "eshop", "logo", "o nas", "uvod"].some((token) => normalized.includes(token)) ||
    /\b(na|z|a|v)$/iu.test(raw) ||
    /telefon|e-?mail|fakturace|www\.|http/i.test(raw)
  ) {
    return fallback;
  }
  return raw.replace(/^[,\-/:.\s]+|[,\-/:.\s]+$/g, "").trim() || fallback;
}

function cleanUniversalCompanyShortName(value: string | undefined, website?: string, fallbackName?: string): string | undefined {
  const fallback = fallbackName?.trim() || brandFromWebsite(website);
  let raw = value?.replace(/\s+/g, " ").trim() || fallback;
  if (!raw) return undefined;
  raw = raw
    .replace(/\b(spol\.?\s*s\s*r\.?\s*o\.?|s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|o\.?\s*z\.?|n\.?\s*o\.?|dru[zž]stvo|se)\b\.?/giu, "")
    .replace(/\b(ltd|limited|gmbh|inc|llc)\b\.?/giu, "")
    .replace(/\b(oficialne stranky|ofici[aá]lne str[aá]nky|uvod|kontakt|eshop|shop|web|homepage)\b/giu, "")
    .replace(/[|:]\s*(vyroba|v[yý]roba|realizace|realiz[aá]cia|sluzby|slu[zž]by|kontakt).*$/iu, "")
    .replace(/[^\p{L}\p{N}\s.&-]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,\-/:.&\s]+|[,\-/:.&\s]+$/g, "")
    .trim();
  const cleaned = cleanLeadCompanyShort(raw, website, fallback);
  return cleaned?.replace(/\s+/g, " ").trim() || fallback;
}

function brandFromWebsite(website: string | undefined): string | undefined {
  if (!website) return undefined;
  const domain = normalizeWebsiteIdentity(website);
  const raw = domain.split(".")[0]?.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const cleaned = raw?.replace(/\b(kuchyne|kuchyn|truhlarstvi|stolarstvi|nabytek|interiery|studio)\b/gi, "").replace(/\s+/g, " ").trim();
  const brand = cleaned && cleaned.length >= 3 ? cleaned : raw;
  return brand ? brand.replace(/\b\w/g, (char) => char.toUpperCase()) : undefined;
}

function brandFromEmail(email: string | undefined): string | undefined {
  const domain = email?.split("@")[1]?.trim();
  if (!domain || /(gmail|googlemail|outlook|hotmail|icloud|yahoo|azet|zoznam|centrum|post|seznam)\./i.test(domain)) return undefined;
  return brandFromWebsite(`https://${domain}`);
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

function gmailHintDisplayName(hint?: { email: string; displayName?: string; name?: string; fromHeader?: string; toHeader?: string }): string | undefined {
  if (!hint) return undefined;
  return hint.displayName ?? hint.name ?? extractDisplayNameForEmail(hint.fromHeader, hint.email) ?? extractDisplayNameForEmail(hint.toHeader, hint.email);
}

function extractDisplayNameForEmail(header: string | undefined, email: string): string | undefined {
  if (!header) return undefined;
  const target = email.trim().toLowerCase();
  for (const part of header.split(",")) {
    const match = part.match(/"?([^"<]+)"?\s*<([^>]+)>/);
    if (match?.[2]?.trim().toLowerCase() === target) return match[1]?.trim();
  }
  return undefined;
}

function cleanGmailDisplayName(value: string | undefined, email: string): string | undefined {
  const name = value?.replace(/\s+/g, " ").trim();
  if (!name || name.includes("@") || looksLikeBusinessAlias(name)) return undefined;
  if (normalizeNameToken(name) === normalizeNameToken(email.split("@")[0])) return undefined;
  const parts = name.split(/\s+/).filter(Boolean).filter((part) => !/^[._\-+]+$/.test(part));
  if (!parts.length || parts.length > 5) return undefined;
  return parts.map((part) => part.replace(/^["']|["']$/g, "")).join(" ");
}

function applyDecisionMakerNameToLead(lead: LeadRepairQueueLead, fullName: string, firstName?: string, lastName?: string, source?: string): LeadRepairQueueLead {
  return {
    ...lead,
    firstName: lead.firstName ?? firstName,
    lastName: lead.lastName ?? lastName,
    decisionMakerName: lead.decisionMakerName ?? fullName,
    decision_maker_name: lead.decision_maker_name ?? fullName,
    customFields: {
      ...lead.customFields,
      decision_maker_name: fullName,
      decision_maker_first_name: firstName,
      decision_maker_last_name: lastName,
      identity_source: source,
    },
  };
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
  "phone_match_method",
  "phone_candidates",
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

function googleSheetLeadRow(lead: LeadCandidateInput & { raw?: Record<string, string>; verificationStatus?: string; campaignTag?: string; ico?: string; address?: string }): Array<string | number | boolean | null> {
  return [
    sheetLeadValue(lead, "verificationStatus", "verification_status", "smartlead_status", "smartlead_statuses") || "",
    sheetLeadValue(lead, "website", "web", "url", "domain", "google_domain") || "",
    sheetLeadValue(lead, "official_company_name", "officialCompanyName", "companyName", "company_name") || "",
    sheetLeadValue(lead, "ico") || "",
    sheetLeadValue(lead, "address", "district_city") || "",
    sheetLeadValue(lead, "decision_maker_name", "decisionMakerName", "firstName", "first_name") || "",
    sheetLeadValue(lead, "decision_maker_last_name", "lastName", "last_name", "last_name_with_salutation", "greeting") || "",
    sheetLeadValue(lead, "stakeholders", "executives", "partners") || "",
    sheetLeadValue(lead, "email", "primary_email", "smartlead_emails") || "",
    sheetLeadValue(lead, "personalizedIntro", "personalized_intro", "icebreaker_sentence", "icebreaker") || "",
    sheetLeadValue(lead, "original_name", "name", "companyName", "company_name") || "",
    sheetLeadValue(lead, "verification_notes", "note", "notes") || "",
    sheetLeadValue(lead, "campaignTag", "campaign_tag", "source", "niche") || "",
  ];
}

function sheetLeadValue(lead: LeadCandidateInput & { raw?: Record<string, string> }, ...aliases: string[]): string | undefined {
  const raw = lead.raw ?? {};
  const custom = lead.customFields ?? {};
  const normalizedRaw = new Map(Object.entries(raw).map(([key, value]) => [slugify(key).replace(/-/g, "_"), value]));
  const normalizedCustom = new Map(Object.entries(custom).map(([key, value]) => [slugify(key).replace(/-/g, "_"), value]));
  const record = lead as Record<string, unknown>;
  for (const alias of aliases) {
    const direct = record[alias];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
    const normalized = slugify(alias).replace(/-/g, "_");
    const customValue = normalizedCustom.get(normalized);
    if (typeof customValue === "string" && customValue.trim()) return customValue.trim();
    if (typeof customValue === "number" || typeof customValue === "boolean") return String(customValue);
    const rawValue = normalizedRaw.get(normalized);
    if (typeof rawValue === "string" && rawValue.trim()) return rawValue.trim();
  }
  return undefined;
}

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
