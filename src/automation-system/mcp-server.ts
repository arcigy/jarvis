import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { redactSensitiveText } from "./ai-safety.ts";
import { draftContractIntake } from "./contract-intake-draft.ts";
import { runIntegrationDiagnostics } from "./diagnostics.ts";
import { getIntegrationHealth, loadLocalEnv, summarizeIntegrationHealth } from "./env.ts";
import { buildClientReplyPrompt, buildPositiveOutreachReplyPrompt, generateGeminiText } from "./gemini.ts";
import { defaultGmailBriefingQuery, defaultGmailSyncQuery, listConfiguredGmailAccounts, listRecentGmailMessageEvents, sendGmailTextMessage } from "./gmail.ts";
import { batchFetchPublicUrlPreviews, fetchPublicUrlPreview } from "./http-fetch.ts";
import { handleJarvisVoiceEvent, type JarvisVoiceSession } from "./jarvis-voice.ts";
import { buildJarvisCapabilityAudit, summarizeJarvisCapabilityAuditForVoice } from "./jarvis-capability-audit.ts";
import { buildLeadgenDailyReport, buildLeadgenEveningSummary, buildLeadgenOpsDigest, buildLeadgenSlackReportPreview, selectNextNiche } from "./leadgen-report.ts";
import { appendRowsToGoogleSheet, discoverLeads, searchGooglePlaces, searchSerper } from "./lead-discovery.ts";
import {
  buildBatchNicheDiscoveryPlan,
  buildLeadgenExecutionQueuePreview,
  buildNicheLeadgenPlan,
  buildLeadgenGapReport,
  buildLeadgenCampaignPipelinePreview,
  buildLeadSourceImportQueuePreview,
  buildUrlIntelligenceQueuePreview,
  buildLeadRepairQueuePreview,
  buildNicheOpsDashboardPreview,
  batchScrapeWebsiteContacts,
  batchDraftLeadIntros,
  buildManualReviewPickupPlan,
  buildManualReviewQueue,
  buildSmartleadCampaignLaunchPreview,
  buildSmartleadCampaignQaPreview,
  buildSmartleadCampaignHandoffPackagePreview,
  buildSmartleadInjectionPlan,
  buildSmartleadImportAuditPreview,
  buildSmartleadSenderCapacityPreview,
  buildSmartleadDeliverabilityGuardPreview,
  buildColdOutreachCsvImportPreview,
  dedupeLeadCandidates,
  draftNicheSmartleadCampaignSetup,
  draftLeadIntro,
  draftSmartleadCampaignSequence,
  enrichWebsiteLeadsPreview,
  enrichSlovakCompanyRegister,
  filterBlacklistedLeads,
  buildDailyLeadgenRunbook,
  parseLeadsCsv,
  previewSmartleadEmailRendering,
  previewLeadEnrichmentBatch,
  prepareSmartleadLeads,
  runLeadgenResearchPipeline,
  scoreLeadQuality,
  serializeLeadsCsv,
  scrapeWebsiteContacts,
} from "./lead-automation.ts";
import {
  buildContractGenerationCommand,
  getColdOutreachMcpAnswer,
  identifyEmailMcpAnswer,
} from "./mcp-tools.ts";
import { buildOperatorBriefing } from "./operator-briefing.ts";
import { draftPriceOfferIntake } from "./price-offer.ts";
import { buildProactiveAttentionDigest } from "./proactive-attention-digest.ts";
import { buildProductionCompletionScore, summarizeProductionCompletionScoreForVoice } from "./production-completion-score.ts";
import { buildProductionReadinessReport } from "./production-readiness.ts";
import { getProductionVerificationEvidence } from "./production-verification-evidence.ts";
import { buildOutreachReplyTriagePreview, classifyOutreachReply, previewGmailAiReply, previewSmartleadAiReply } from "./reply-decision.ts";
import { buildRemoteMcpConnectionPack } from "./remote-mcp-pack.ts";
import { runRemoteMcpSmoke } from "./remote-mcp-smoke.ts";
import {
  addLeadsToSmartleadCampaign,
  configureSmartleadCampaign,
  createSmartleadCampaign,
  draftSmartleadThreadReply,
  getSmartleadCampaignLeads,
  getSmartleadCampaignStatus,
  getSmartleadMessageHistory,
  getSmartleadOutreachBrief,
  previewSmartleadLeadSync,
  sendSmartleadThreadReply,
} from "./smartlead.ts";
import type { ClientNeedSignal, LocalPerson } from "./types.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
loadLocalEnv(repoRoot);

const approvalSchema = z.object({ approved: z.boolean().optional() }).optional();

export function createJarvisMcpServer(): McpServer {
  const server = new McpServer({
    name: "arcigy-jarvis-local",
    version: "0.1.0",
  });

  server.registerTool(
    "arcigy.generate_contract_documents",
    {
      title: "Generate Arcigy contracts",
      description: "Generate framework agreement and project appendix DOCX files from a filled JSON intake form.",
      inputSchema: {
        inputJsonPath: z.string().min(1).optional(),
        intake: z.record(z.string(), z.unknown()).optional(),
        outputDir: z.string().min(1).optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ inputJsonPath, intake, outputDir, approval }) => {
      requireExplicitApproval("arcigy.generate_contract_documents", { approval });
      if (!inputJsonPath && !intake) {
        throw new Error("Provide either inputJsonPath or inline intake payload.");
      }

      const safeOutputDir = resolveRepoPath(outputDir, "generated/contracts", "outputDir");
      const args = inputJsonPath
        ? buildContractGenerationCommand(resolveRepoPath(inputJsonPath, "", "inputJsonPath"), safeOutputDir).args
        : [
            "scripts/generate_contract_documents.py",
            "--payload",
            JSON.stringify(intake),
            "--output-dir",
            safeOutputDir,
          ];
      const result = runPython(args);
      return textResult(result.stdout.trim() || "Contract documents generated.");
    }
  );

  server.registerTool(
    "arcigy.draft_contract_intake",
    {
      title: "Draft contract intake",
      description: "Use Gemini to draft an Arcigy contract intake JSON object from a short business brief.",
      inputSchema: {
        brief: z.string().min(1),
        baseIntake: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ brief, baseIntake }) => jsonResult(await draftContractIntake({ brief, baseIntake }))
  );

  server.registerTool(
    "arcigy.draft_price_offer_intake",
    {
      title: "Draft price offer intake",
      description: "Use Gemini to draft an Arcigy price-offer JSON object from a short business brief.",
      inputSchema: {
        brief: z.string().min(1),
        baseOffer: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ brief, baseOffer }) => jsonResult(await draftPriceOfferIntake({ brief, baseOffer }))
  );

  server.registerTool(
    "arcigy.generate_price_offer_document",
    {
      title: "Generate Arcigy price offer",
      description: "Generate an Arcigy price offer DOCX from a filled JSON intake form.",
      inputSchema: {
        inputJsonPath: z.string().min(1).optional(),
        offer: z.record(z.string(), z.unknown()).optional(),
        outputDir: z.string().min(1).optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ inputJsonPath, offer, outputDir, approval }) => {
      requireExplicitApproval("arcigy.generate_price_offer_document", { approval });
      if (!inputJsonPath && !offer) {
        throw new Error("Provide either inputJsonPath or inline offer payload.");
      }
      const safeOutputDir = resolveRepoPath(outputDir, "generated/price-offers", "outputDir");
      const args = inputJsonPath
        ? ["scripts/generate_price_offer.py", "--input", resolveRepoPath(inputJsonPath, "", "inputJsonPath"), "--output-dir", safeOutputDir]
        : ["scripts/generate_price_offer.py", "--payload", JSON.stringify(offer), "--output-dir", safeOutputDir];
      const result = runPython(args);
      return textResult(result.stdout.trim() || "Price offer document generated.");
    }
  );

  server.registerTool(
    "arcigy.get_cold_outreach_brief",
    {
      title: "Cold outreach brief",
      description: "Return a concise Slovak cold outreach activity briefing.",
      inputSchema: {
        periodLabel: z.string().min(1),
        contacted: z.number().int().nonnegative(),
        opened: z.number().int().nonnegative(),
        replied: z.number().int().nonnegative(),
        positiveReplies: z.number().int().nonnegative(),
        preparedPositiveReplyCount: z.number().int().nonnegative(),
        pendingApprovalCount: z.number().int().nonnegative(),
        notableSignals: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (metrics) => textResult(getColdOutreachMcpAnswer(metrics))
  );

  server.registerTool(
    "arcigy.add_cold_outreach_event",
    {
      title: "Add cold outreach event",
      description: "Store a local cold outreach event for period summaries.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        leadEmail: z.string().email(),
        campaignId: z.string().optional(),
        campaignName: z.string().optional(),
        eventType: z.enum(["sent", "opened", "replied", "positive_reply", "prepared_reply", "approved_reply", "approved_reply_sent"]),
        occurredAt: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("add-cold-event", payload, dbPath)
  );

  server.registerTool(
    "arcigy.get_prepared_outreach_replies",
    {
      title: "Get prepared outreach replies",
      description: "Return prepared cold outreach replies waiting for operator approval.",
      inputSchema: {
        dbPath: z.string().optional(),
        status: z.enum(["pending", "approved", "all"]).default("pending"),
        since: z.string().optional(),
        until: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("list-prepared-replies", payload, dbPath)
  );

  server.registerTool(
    "arcigy.get_approval_queue",
    {
      title: "Get Jarvis approval queue",
      description: "Return a single read-only approval inbox with prepared replies and client decisions waiting for operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("list-approval-queue", payload, dbPath)
  );

  server.registerTool(
    "arcigy.prepare_positive_outreach_reply",
    {
      title: "Prepare positive outreach reply",
      description: "Use Gemini to draft a reply for a positive cold outreach lead and store it for approval.",
      inputSchema: {
        dbPath: z.string().optional(),
        leadEmail: z.string().email(),
        leadName: z.string().optional(),
        companyName: z.string().optional(),
        campaignId: z.string().optional(),
        campaignName: z.string().optional(),
        positiveSignal: z.string().min(1),
        context: z.string().optional(),
        subject: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        tone: z.enum(["direct", "warm", "executive"]).default("executive"),
        occurredAt: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ dbPath, ...payload }) => jsonResult(await preparePositiveOutreachReply(payload, dbPath))
  );

  server.registerTool(
    "arcigy.approve_prepared_outreach_reply",
    {
      title: "Approve prepared outreach reply",
      description: "Mark a prepared cold outreach reply as approved after explicit operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        preparedEventId: z.string().min(1),
        approval: approvalSchema,
        approvalNote: z.string().optional(),
        approvedBy: z.string().optional(),
        occurredAt: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => {
      requireExplicitApproval("arcigy.approve_prepared_outreach_reply", payload);
      return jsonDbTool("approve-prepared-reply", payload, dbPath);
    }
  );

  server.registerTool(
    "arcigy.send_approved_outreach_reply",
    {
      title: "Send approved outreach reply",
      description: "Send an already-approved prepared outreach reply through Gmail after explicit operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        preparedEventId: z.string().min(1),
        accountEnvKey: z.string().optional(),
        subject: z.string().optional(),
        threadId: z.string().optional(),
        approval: approvalSchema,
        sentBy: z.string().optional(),
        occurredAt: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ dbPath, ...payload }) => {
      requireExplicitApproval("arcigy.send_approved_outreach_reply", payload);
      return jsonResult(await sendApprovedOutreachReply(payload, dbPath));
    }
  );

  server.registerTool(
    "arcigy.get_cold_outreach_brief_from_db",
    {
      title: "Cold outreach brief from DB",
      description: "Calculate a concise Slovak cold outreach brief from local SQLite events.",
      inputSchema: {
        dbPath: z.string().optional(),
        since: z.string().min(1),
        until: z.string().optional(),
        periodLabel: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("cold-brief", payload, dbPath)
  );

  server.registerTool(
    "arcigy.upsert_local_person",
    {
      title: "Upsert local person",
      description: "Create or update a local client, lead, or contact in SQLite.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        kind: z.enum(["client", "lead", "contact"]).default("lead"),
        primaryEmail: z.string().email(),
        displayName: z.string().optional(),
        companyName: z.string().optional(),
        status: z.string().default("active"),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("upsert-person", payload, dbPath)
  );

  server.registerTool(
    "arcigy.add_client_need_signal",
    {
      title: "Add client need signal",
      description: "Store a local signal that a client needs or requested something.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        personId: z.string().min(1),
        source: z.string().default("mcp"),
        signalType: z.string().default("request"),
        summary: z.string().min(1),
        status: z.enum(["new", "seen", "resolved", "ignored"]).default("new"),
        confidence: z.number().min(0).max(1).default(0.7),
        occurredAt: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("add-need-signal", payload, dbPath)
  );

  server.registerTool(
    "arcigy.ingest_client_message",
    {
      title: "Ingest client message",
      description:
        "Store a received email/message, identify the sender locally, and create a Jarvis need alert when the client asks for something.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        email: z.string().email().optional(),
        fromEmail: z.string().email().optional(),
        displayName: z.string().optional(),
        companyName: z.string().optional(),
        kind: z.enum(["client", "lead", "contact"]).default("lead"),
        source: z.string().default("message"),
        eventType: z.string().default("message_received"),
        subject: z.string().optional(),
        text: z.string().optional(),
        body: z.string().optional(),
        message: z.string().optional(),
        occurredAt: z.string().optional(),
        threadId: z.string().optional(),
        externalId: z.string().optional(),
        createIfUnknown: z.boolean().default(true),
        personData: z.record(z.string(), z.unknown()).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        needSignal: z
          .union([
            z.literal(false),
            z.object({
              signalType: z.string().default("request"),
              summary: z.string().min(1),
              status: z.enum(["new", "seen", "resolved", "ignored"]).default("new"),
              confidence: z.number().min(0).max(1).default(0.8),
              data: z.record(z.string(), z.unknown()).optional(),
            }),
          ])
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("ingest-message", payload, dbPath)
  );

  server.registerTool(
    "arcigy.identify_email",
    {
      title: "Identify email",
      description: "Identify a local client or lead by email and return open need signals.",
      inputSchema: {
        email: z.string().email(),
        dbPath: z.string().optional(),
        people: z
          .array(
            z.object({
              id: z.string(),
              kind: z.enum(["client", "lead", "contact"]),
              primaryEmail: z.string().email(),
              displayName: z.string().optional(),
              companyName: z.string().optional(),
              status: z.string(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
        needSignals: z
          .array(
            z.object({
              id: z.string(),
              personId: z.string(),
              source: z.string(),
              signalType: z.string(),
              summary: z.string(),
              status: z.enum(["new", "seen", "resolved", "ignored"]),
              confidence: z.number(),
              occurredAt: z.string(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ email, dbPath, people, needSignals }) => {
      if (dbPath) {
        const result = runPython(["scripts/jarvis_local_db.py", "identify", "--db", resolveRepoPath(dbPath, "", "dbPath"), "--email", email]);
        return jsonResult(JSON.parse(result.stdout));
      }

      return textResult(identifyEmailMcpAnswer(email, (people ?? []) as LocalPerson[], (needSignals ?? []) as ClientNeedSignal[]));
    }
  );

  server.registerTool(
    "arcigy.get_client_need_alerts",
    {
      title: "Get client need alerts",
      description: "Return open client/lead requests from local SQLite memory so Jarvis can proactively tell the operator.",
      inputSchema: {
        dbPath: z.string().optional(),
        status: z.enum(["new", "seen", "resolved", "ignored"]).default("new"),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("list-open-needs", payload, dbPath)
  );

  server.registerTool(
    "arcigy.update_client_need_status",
    {
      title: "Update client need status",
      description: "Mark a local client need alert as seen, resolved, or ignored after explicit operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        needSignalId: z.string().min(1),
        status: z.enum(["new", "seen", "resolved", "ignored"]),
        note: z.string().optional(),
        updatedBy: z.string().optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, approval, ...payload }) => {
      requireExplicitApproval("arcigy.update_client_need_status", { approval });
      return jsonDbTool("update-need-status", payload, dbPath);
    }
  );

  server.registerTool(
    "arcigy.get_audit_events",
    {
      title: "Get audit events",
      description: "Return the local Jarvis audit trail for sensitive operations and approval-gated actions.",
      inputSchema: {
        dbPath: z.string().optional(),
        automationKey: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("list-audit-events", payload, dbPath)
  );

  server.registerTool(
    "arcigy.get_local_memory_snapshot",
    {
      title: "Get local memory snapshot",
      description: "Return a secret-safe read-only snapshot of local people, email activity, client needs, and audit events.",
      inputSchema: {
        dbPath: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("local-memory-snapshot", payload, dbPath)
  );

  server.registerTool(
    "arcigy.export_local_memory_snapshot",
    {
      title: "Export local memory snapshot",
      description: "Write a redacted local memory snapshot JSON file inside the repository after explicit operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        outputPath: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, approval, outputPath, ...payload }) => {
      requireExplicitApproval("arcigy.export_local_memory_snapshot", { approval });
      const safeOutputPath = outputPath ? resolveRepoPath(outputPath, "", "outputPath") : undefined;
      return jsonDbTool("export-local-memory-snapshot", { ...payload, outputPath: safeOutputPath }, dbPath);
    }
  );

  server.registerTool(
    "arcigy.jarvis_voice_event",
    {
      title: "Jarvis voice event",
      description: "Process a Jarvis transcript event and return recording/speech instructions.",
      inputSchema: {
        session: z
          .object({
            state: z.enum(["idle", "awake", "processing"]),
            wakeWord: z.string(),
            lastTranscript: z.string().optional(),
            lastResponse: z.string().optional(),
          })
          .optional(),
        text: z.string().min(1),
        kind: z.enum(["transcript"]).default("transcript"),
        live: z.boolean().default(false),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session, text, live, dbPath }) => {
      const result = handleJarvisVoiceEvent((session ?? { state: "idle", wakeWord: "jarvis" }) as JarvisVoiceSession, {
        type: "transcript",
        text,
      });
      if (result.speakText?.includes("Jarvis capability audit")) {
        const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
        const audit = buildJarvisCapabilityAudit({
          readiness: await buildProductionReadinessReport({ live, dbPath: safeDbPath }),
          productionEvidence: getProductionVerificationEvidence(repoRoot),
        });
        const speakText = summarizeJarvisCapabilityAuditForVoice(audit);
        return jsonResult({
          ...result,
          session: { ...result.session, lastResponse: speakText },
          speakText,
        });
      }
      if (result.speakText?.includes("production completion score")) {
        const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
        const readiness = await buildProductionReadinessReport({ live, dbPath: safeDbPath });
        const productionEvidence = getProductionVerificationEvidence(repoRoot);
        const capabilityAudit = buildJarvisCapabilityAudit({ readiness, productionEvidence });
        const completion = buildProductionCompletionScore({ readiness, productionEvidence, capabilityAudit });
        const speakText = summarizeProductionCompletionScoreForVoice(completion);
        return jsonResult({
          ...result,
          session: { ...result.session, lastResponse: speakText },
          speakText,
        });
      }
      if (result.speakText?.includes("proactive attention digest")) {
        const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
        const briefing = await buildOperatorBriefingForMcp({
          safeDbPath,
          periodLabel: "poslednych 7 dni",
          live,
          syncGmail: false,
        });
        const digest = buildProactiveAttentionDigest({ briefing });
        return jsonResult({
          ...result,
          session: { ...result.session, lastResponse: digest.speechText },
          speakText: digest.speechText,
        });
      }
      return jsonResult(result);
    }
  );

  server.registerTool(
    "arcigy.get_system_health",
    {
      title: "System health",
      description: "Return configured/missing production integrations without exposing secrets.",
      inputSchema: {
        format: z.enum(["json", "text"]).default("json"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format }) => {
      if (format === "text") return textResult(summarizeIntegrationHealth());
      return jsonResult({ integrations: getIntegrationHealth() });
    }
  );

  server.registerTool(
    "arcigy.run_integration_diagnostics",
    {
      title: "Run integration diagnostics",
      description: "Run configuration checks or explicit live read-only probes for production integrations.",
      inputSchema: {
        live: z.boolean().default(false),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ live, dbPath }) => jsonResult(await runIntegrationDiagnostics({ live, dbPath: resolveOptionalRepoPath(dbPath, "dbPath") }))
  );

  server.registerTool(
    "arcigy.get_production_readiness",
    {
      title: "Production readiness",
      description: "Return production readiness summary, blockers, next actions, MCP approval locks, and optional live diagnostics.",
      inputSchema: {
        live: z.boolean().default(false),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ live, dbPath }) => jsonResult(await buildProductionReadinessReport({ live, dbPath: resolveOptionalRepoPath(dbPath, "dbPath") }))
  );

  server.registerTool(
    "arcigy.get_production_verification_evidence",
    {
      title: "Production verification evidence",
      description: "Return the latest secret-safe npm run verify:production evidence artifact.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => jsonResult(getProductionVerificationEvidence(repoRoot))
  );

  server.registerTool(
    "arcigy.get_production_completion_score",
    {
      title: "Production completion score",
      description: "Return an evidence-based production completion percentage with weighted proof components and next actions.",
      inputSchema: {
        live: z.boolean().default(false),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ live, dbPath }) => {
      const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
      const readiness = await buildProductionReadinessReport({ live, dbPath: safeDbPath });
      const productionEvidence = getProductionVerificationEvidence(repoRoot);
      const capabilityAudit = buildJarvisCapabilityAudit({ readiness, productionEvidence });
      return jsonResult(buildProductionCompletionScore({ readiness, productionEvidence, capabilityAudit }));
    }
  );

  server.registerTool(
    "arcigy.get_jarvis_capability_audit",
    {
      title: "Jarvis capability audit",
      description: "Return a secret-safe audit of Jarvis capability coverage across tools, approvals, integrations, remote MCP, and production evidence.",
      inputSchema: {
        live: z.boolean().default(false),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ live, dbPath }) => {
      const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
      return jsonResult(
        buildJarvisCapabilityAudit({
          readiness: await buildProductionReadinessReport({ live, dbPath: safeDbPath }),
          productionEvidence: getProductionVerificationEvidence(repoRoot),
        })
      );
    }
  );

  server.registerTool(
    "arcigy.get_remote_mcp_pack",
    {
      title: "Remote MCP connection pack",
      description: "Return a secret-safe connection pack for remote agents using the Jarvis web bridge.",
      inputSchema: {
        baseUrl: z.string().url().optional(),
        live: z.boolean().default(false),
        includeReadiness: z.boolean().default(true),
        dbPath: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ baseUrl, live, includeReadiness, dbPath }) =>
      jsonResult(
        await buildRemoteMcpConnectionPack({
          baseUrl,
          live,
          includeReadiness,
          dbPath: resolveOptionalRepoPath(dbPath, "dbPath"),
          tokenConfigured: hasConfiguredWebToken(),
          localhostBypass: process.env.JARVIS_WEB_REQUIRE_AUTH !== "true",
          source: "mcp",
        })
      )
  );

  server.registerTool(
    "arcigy.run_remote_mcp_smoke",
    {
      title: "Remote MCP smoke test",
      description: "Verify a Jarvis web MCP bridge manifest, read-only tool call, approval gate, and secret policy.",
      inputSchema: {
        baseUrl: z.string().url().optional(),
        bearerToken: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ baseUrl, bearerToken }) => jsonResult(await runRemoteMcpSmoke({ baseUrl, bearerToken }))
  );

  server.registerTool(
    "arcigy.get_operator_briefing",
    {
      title: "Operator briefing",
      description: "Return one Jarvis briefing across readiness, cold outreach, client requests, and prepared replies.",
      inputSchema: {
        dbPath: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        periodLabel: z.string().default("poslednych 7 dni"),
        live: z.boolean().default(false),
        syncGmail: z.boolean().default(true),
        accountEnvKey: z.string().optional(),
        gmailQuery: z.string().default(defaultGmailBriefingQuery),
        gmailMaxResults: z.number().int().min(1).max(25).default(5),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, since, until, periodLabel, live, syncGmail, accountEnvKey, gmailQuery, gmailMaxResults }) => {
      const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
      return jsonResult(await buildOperatorBriefingForMcp({ safeDbPath, since, until, periodLabel, live, syncGmail, accountEnvKey, gmailQuery, gmailMaxResults }));
    }
  );

  server.registerTool(
    "arcigy.get_proactive_attention_digest",
    {
      title: "Proactive attention digest",
      description: "Return a proactive Jarvis digest of client needs, prepared replies, production attention, urgency, and next safe action.",
      inputSchema: {
        dbPath: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        periodLabel: z.string().default("poslednych 7 dni"),
        live: z.boolean().default(false),
        syncGmail: z.boolean().default(false),
        accountEnvKey: z.string().optional(),
        gmailQuery: z.string().default(defaultGmailBriefingQuery),
        gmailMaxResults: z.number().int().min(1).max(25).default(5),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, since, until, periodLabel, live, syncGmail, accountEnvKey, gmailQuery, gmailMaxResults }) => {
      const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
      const briefing = await buildOperatorBriefingForMcp({ safeDbPath, since, until, periodLabel, live, syncGmail, accountEnvKey, gmailQuery, gmailMaxResults });
      return jsonResult(buildProactiveAttentionDigest({ briefing }));
    }
  );

  server.registerTool(
    "arcigy.get_leadgen_daily_report",
    {
      title: "Leadgen daily report",
      description: "Build a daily leadgen report from Smartlead-like campaign stats, stuck leads, and system settings without sending Slack.",
      inputSchema: {
        periodLabel: z.string().default("dnes"),
        campaigns: z.unknown().optional(),
        stuckLeads: z.array(z.object({
          website: z.string().optional(),
          email: z.string().optional(),
          nicheName: z.string().optional(),
          decisionMakerName: z.string().optional(),
          phone: z.string().optional(),
        })).optional(),
        settings: z.object({
          leadgenActive: z.boolean().optional(),
          aiRepliesActive: z.boolean().optional(),
        }).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenDailyReport(input))
  );

  server.registerTool(
    "arcigy.get_leadgen_evening_summary",
    {
      title: "Leadgen evening summary",
      description: "Build an evening outreach summary from sent/reply/positive counts and recent reply signals.",
      inputSchema: {
        periodLabel: z.string().default("poslednych 24 hodin"),
        sentToday: z.number().int().nonnegative().default(0),
        repliesToday: z.number().int().nonnegative().default(0),
        positiveToday: z.number().int().nonnegative().default(0),
        recentReplies: z.array(z.object({
          decisionMakerName: z.string().optional(),
          companyName: z.string().optional(),
          replySentiment: z.string().optional(),
          website: z.string().optional(),
        })).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenEveningSummary(input))
  );

  server.registerTool(
    "arcigy.build_leadgen_slack_report_preview",
    {
      title: "Build leadgen Slack report preview",
      description: "Build a Slack Block Kit daily leadgen report with control buttons without sending it.",
      inputSchema: {
        periodLabel: z.string().optional(),
        dateLabel: z.string().optional(),
        title: z.string().optional(),
        campaigns: z.unknown().optional(),
        stuckLeads: z.array(z.object({
          website: z.string().optional(),
          email: z.string().optional(),
          nicheName: z.string().optional(),
          decisionMakerName: z.string().optional(),
          phone: z.string().optional(),
        })).optional(),
        settings: z.object({ leadgenActive: z.boolean().optional(), aiRepliesActive: z.boolean().optional() }).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenSlackReportPreview(input))
  );

  server.registerTool(
    "arcigy.build_leadgen_ops_digest",
    {
      title: "Build leadgen ops digest",
      description: "Combine daily report, evening summary, niche rotation, stuck leads, and safe next MCP calls for leadgen operations.",
      inputSchema: {
        periodLabel: z.string().optional(),
        campaigns: z.unknown().optional(),
        stuckLeads: z.array(z.object({
          website: z.string().optional(),
          email: z.string().optional(),
          nicheName: z.string().optional(),
          decisionMakerName: z.string().optional(),
          phone: z.string().optional(),
        })).optional(),
        recentReplies: z.array(z.object({
          decisionMakerName: z.string().optional(),
          companyName: z.string().optional(),
          replySentiment: z.string().optional(),
          website: z.string().optional(),
        })).optional(),
        settings: z.object({ leadgenActive: z.boolean().optional(), aiRepliesActive: z.boolean().optional() }).optional(),
        niches: z.array(z.object({
          id: z.string(),
          slug: z.string().optional(),
          name: z.string(),
          keywords: z.array(z.string()).optional(),
          regions: z.array(z.string()),
          currentRegionIndex: z.number().int().optional(),
          dailyTarget: z.number().int().optional(),
          smartleadCampaignId: z.string().nullable().optional(),
          todaySent: z.number().int().optional(),
          status: z.string().optional(),
          tier: z.number().int().optional(),
          lastWorkedAt: z.string().nullable().optional(),
          createdAt: z.string().nullable().optional(),
        })).optional(),
        sentToday: z.number().int().optional(),
        repliesToday: z.number().int().optional(),
        positiveToday: z.number().int().optional(),
        manualReviewLimit: z.number().int().min(1).max(50).default(15),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenOpsDigest(input))
  );

  server.registerTool(
    "arcigy.select_next_niche",
    {
      title: "Select next niche",
      description: "Preview niche-manager rotation: choose the next active niche and region without updating the database.",
      inputSchema: {
        niches: z.array(z.object({
          id: z.string(),
          slug: z.string().optional(),
          name: z.string(),
          keywords: z.array(z.string()).optional(),
          regions: z.array(z.string()).min(1),
          currentRegionIndex: z.number().int().optional(),
          dailyTarget: z.number().int().nonnegative().optional(),
          smartleadCampaignId: z.string().nullable().optional(),
          todaySent: z.number().int().nonnegative().optional(),
          status: z.string().optional(),
          tier: z.number().int().optional(),
          lastWorkedAt: z.string().nullable().optional(),
          createdAt: z.string().nullable().optional(),
        })).min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(selectNextNiche(input))
  );

  server.registerTool(
    "arcigy.generate_ai_reply",
    {
      title: "Generate AI reply",
      description: "Use Gemini to draft a client reply. This only prepares text; it never sends the email.",
      inputSchema: {
        clientName: z.string().optional(),
        message: z.string().min(1),
        context: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        tone: z.enum(["direct", "warm", "executive"]).default("executive"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await generateGeminiText(buildClientReplyPrompt(input)))
  );

  server.registerTool(
    "arcigy.sync_gmail_recent_messages",
    {
      title: "Sync Gmail recent messages",
      description: "Fetch recent Gmail messages and optionally ingest them into the local Jarvis DB.",
      inputSchema: {
        dbPath: z.string().optional(),
        accountEnvKey: z.string().optional(),
        query: z.string().default(defaultGmailSyncQuery),
        maxResults: z.number().int().min(1).max(25).default(10),
        dryRun: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ dbPath, accountEnvKey, query, maxResults, dryRun }) => {
      const safeDbPath = resolveOptionalRepoPath(dbPath, "dbPath");
      const accounts = listConfiguredGmailAccounts().filter((account) => !accountEnvKey || account.envKey === accountEnvKey);
      if (!accounts.length) {
        throw new Error(accountEnvKey ? `Configured Gmail account not found: ${accountEnvKey}` : "No configured Gmail accounts found.");
      }

      const synced = [];
      for (const account of accounts) {
        const events = await listRecentGmailMessageEvents(account, { query, maxResults });
        const ingested = [];
        if (!dryRun) {
          for (const event of events) {
            ingested.push(runDbCommand("ingest-message", event, safeDbPath));
          }
        }
        const createdItems = ingested.filter((item) => item.status === "created");
        const duplicateItems = ingested.filter((item) => item.status === "duplicate");
        synced.push({
          account: account.label,
          fetched: events.length,
          ingested: createdItems.length,
          created: createdItems.length,
          duplicates: duplicateItems.length,
          processed: ingested.length,
          alerts: createdItems.map((item) => item.jarvisAlert).filter(Boolean),
          preview: events.slice(0, 3).map((event) => ({
            fromEmail: event.fromEmail,
            subject: event.subject,
            text: event.text,
          })),
        });
      }
      return jsonResult({ dryRun, synced });
    }
  );

  server.registerTool(
    "arcigy.get_smartlead_campaign_status",
    {
      title: "Smartlead campaign status",
      description: "Fetch Smartlead campaigns or one campaign's statistics.",
      inputSchema: {
        campaignId: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ campaignId }) => jsonResult(await getSmartleadCampaignStatus({ campaignId }))
  );

  server.registerTool(
    "arcigy.get_smartlead_outreach_brief",
    {
      title: "Smartlead outreach brief",
      description: "Normalize Smartlead campaign statistics into a Jarvis cold outreach briefing.",
      inputSchema: {
        campaignId: z.string().optional(),
        periodLabel: z.string().default("poslednych 7 dni"),
        maxCampaigns: z.number().int().min(1).max(25).default(10),
        preparedPositiveReplyCount: z.number().int().min(0).default(0),
        pendingApprovalCount: z.number().int().min(0).default(0),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await getSmartleadOutreachBrief(input))
  );

  server.registerTool(
    "arcigy.get_smartlead_campaign_leads",
    {
      title: "Smartlead campaign leads",
      description: "Fetch leads from a Smartlead campaign with offset and limit.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await getSmartleadCampaignLeads(input))
  );

  server.registerTool(
    "arcigy.preview_smartlead_lead_sync",
    {
      title: "Preview Smartlead lead sync",
      description: "Fetch Smartlead lead statuses and return local update candidates without writing to the database.",
      inputSchema: {
        campaignIds: z.array(z.union([z.string(), z.number()])).optional(),
        maxCampaigns: z.number().int().min(1).max(25).default(10),
        limitPerCampaign: z.number().int().min(1).max(500).default(200),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await previewSmartleadLeadSync(input))
  );

  server.registerTool(
    "arcigy.get_smartlead_message_history",
    {
      title: "Smartlead message history",
      description: "Fetch Smartlead message history for a campaign lead and return latest sent-email reply metadata.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        email: z.string().email(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await getSmartleadMessageHistory(input))
  );

  const replyHistoryItemSchema = z.object({
    type: z.string().optional(),
    body: z.string().optional(),
    email_body: z.string().optional(),
    fromEmail: z.string().optional(),
    from_email: z.string().optional(),
    isMe: z.boolean().optional(),
    send_time: z.string().optional(),
    created_at: z.string().optional(),
  }).passthrough();

  server.registerTool(
    "arcigy.classify_outreach_reply",
    {
      title: "Classify outreach reply",
      description: "Classify a lead reply as POSITIVE, NEGATIVE, ALREADY_SENT, or NEUTRAL before any draft or send action.",
      inputSchema: {
        replyBody: z.string().min(1),
        history: z.array(replyHistoryItemSchema).optional(),
        senderName: z.string().optional(),
        useAi: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await classifyOutreachReply(input))
  );

  const outreachTriageItemSchema = z.object({
    source: z.enum(["smartlead", "gmail"]),
    email: z.string().email(),
    replyBody: z.string().min(1),
    campaignId: z.union([z.string(), z.number()]).optional(),
    senderEmail: z.string().email().optional(),
    leadName: z.string().optional(),
    companyName: z.string().optional(),
    subject: z.string().optional(),
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    history: z.array(replyHistoryItemSchema).optional(),
    alreadyHandled: z.boolean().optional(),
  });

  server.registerTool(
    "arcigy.build_outreach_reply_triage_preview",
    {
      title: "Build outreach reply triage preview",
      description: "Batch triage Smartlead/Gmail replies into positive, negative, already-sent, and neutral groups with safe draft next-step payloads and no sending.",
      inputSchema: {
        replies: z.array(outreachTriageItemSchema).min(1).max(100),
        aiRepliesActive: z.boolean().optional(),
        useAiClassification: z.boolean().default(false),
        maxReplies: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await buildOutreachReplyTriagePreview(input))
  );

  server.registerTool(
    "arcigy.preview_smartlead_ai_reply",
    {
      title: "Preview Smartlead AI reply",
      description: "Preview the Smartlead AI reply webhook decision without sending: event/body guards, classification, duplicate and human-in-loop checks.",
      inputSchema: {
        toEmail: z.string().email(),
        campaignId: z.union([z.string(), z.number()]),
        emailBody: z.string().optional(),
        eventType: z.string().optional(),
        fromEmail: z.string().email().optional(),
        leadName: z.string().optional(),
        companyName: z.string().optional(),
        categoryName: z.string().optional(),
        history: z.array(replyHistoryItemSchema).optional(),
        aiRepliesActive: z.boolean().optional(),
        alreadySent: z.boolean().optional(),
        generateDraft: z.boolean().default(false),
        useAiClassification: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await previewSmartleadAiReply(input))
  );

  server.registerTool(
    "arcigy.preview_gmail_ai_reply",
    {
      title: "Preview Gmail AI reply",
      description: "Preview the Gmail AI reply decision without sending: known lead, thread origin, duplicate, human-in-loop and classification checks.",
      inputSchema: {
        senderEmail: z.string().email(),
        fromEmail: z.string().email(),
        subject: z.string().optional(),
        body: z.string().min(1),
        threadId: z.string().min(1),
        messageId: z.string().min(1),
        leadName: z.string().optional(),
        history: z.array(replyHistoryItemSchema).optional(),
        leadKnown: z.boolean().optional(),
        threadStartedByUs: z.boolean().optional(),
        aiRepliesActive: z.boolean().optional(),
        alreadyProcessed: z.boolean().optional(),
        alreadySent: z.boolean().optional(),
        generateDraft: z.boolean().default(false),
        useAiClassification: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await previewGmailAiReply(input))
  );

  server.registerTool(
    "arcigy.draft_smartlead_thread_reply",
    {
      title: "Draft Smartlead thread reply",
      description: "Draft a Smartlead email-thread reply from message history without sending it.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        email: z.string().email(),
        leadName: z.string().optional(),
        companyName: z.string().optional(),
        positiveSignal: z.string().optional(),
        latestLeadReply: z.string().optional(),
        context: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional(),
        messageHistory: z.unknown().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await draftSmartleadThreadReply(input))
  );

  server.registerTool(
    "arcigy.send_smartlead_thread_reply",
    {
      title: "Send Smartlead thread reply",
      description: "Send an approved reply into an existing Smartlead email thread. This is an explicit external write action.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        email: z.string().email().optional(),
        emailBody: z.string().min(1),
        emailStatsId: z.string().optional(),
        replyMessageId: z.string().optional(),
        replyEmailTime: z.string().optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.send_smartlead_thread_reply", input);
      return jsonResult(await sendSmartleadThreadReply(input));
    }
  );

  const smartleadSequenceSchema = z.object({
    seq_number: z.number().int().min(1),
    seq_delay_details: z.object({ delay_in_days: z.number().int().min(0) }),
    seq_variants: z.array(
      z.object({
        variant_label: z.string().min(1),
        subject: z.string(),
        email_body: z.string().min(1),
      })
    ).min(1),
  });
  const smartleadScheduleSchema = z.object({
    timezone: z.string().optional(),
    start_hour: z.string().optional(),
    end_hour: z.string().optional(),
    days_of_the_week: z.array(z.number().int().min(0).max(6)).optional(),
    max_new_leads_per_day: z.number().int().min(0).max(500).optional(),
    min_time_btw_emails: z.number().int().min(0).max(240).optional(),
    schedule_start_time: z.string().nullable().optional(),
  });
  const smartleadSettingsSchema = z.object({
    trackOpen: z.boolean().optional(),
    stopOnReply: z.boolean().optional(),
    followUpPercentage: z.number().int().min(0).max(100).optional(),
  });
  const smartleadWebhookSchema = z.object({
    url: z.string().url(),
    name: z.string().optional(),
    eventTypes: z.array(z.string()).optional(),
  });
  const smartleadUploadLeadSchema = z.object({
    email: z.string().min(1),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    company_name: z.string().optional(),
    website: z.string().optional(),
    custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  });

  server.registerTool(
    "arcigy.create_smartlead_campaign",
    {
      title: "Create Smartlead campaign",
      description: "Create and optionally configure a Smartlead campaign. This is an explicit external write action.",
      inputSchema: {
        name: z.string().min(1),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        sequences: z.array(smartleadSequenceSchema).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
        webhook: smartleadWebhookSchema.optional(),
        leads: z.array(smartleadUploadLeadSchema).optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.create_smartlead_campaign", input);
      return jsonResult(await createSmartleadCampaign(input));
    }
  );

  server.registerTool(
    "arcigy.configure_smartlead_campaign",
    {
      title: "Configure Smartlead campaign",
      description: "Configure sequences, email accounts, schedule, settings, or webhook for an existing Smartlead campaign. This is an explicit external write action.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        sequences: z.array(smartleadSequenceSchema).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
        webhook: smartleadWebhookSchema.optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.configure_smartlead_campaign", input);
      return jsonResult(await configureSmartleadCampaign(input));
    }
  );

  server.registerTool(
    "arcigy.fetch_url_preview",
    {
      title: "Fetch URL preview",
      description: "Safely fetch a public HTTP/HTTPS URL with GET or HEAD, blocking localhost/private hosts and returning redacted text or JSON preview.",
      inputSchema: {
        url: z.string().min(1),
        method: z.enum(["GET", "HEAD"]).default("GET"),
        headers: z.record(z.string(), z.string()).optional(),
        timeoutMs: z.number().int().min(1000).max(30000).default(10000),
        maxBytes: z.number().int().min(1000).max(100000).default(20000),
        parseJson: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await fetchPublicUrlPreview(input))
  );

  server.registerTool(
    "arcigy.batch_fetch_url_previews",
    {
      title: "Batch fetch URL previews",
      description: "Safely fetch multiple public HTTP/HTTPS URLs with GET or HEAD, blocking localhost/private hosts and returning redacted per-URL previews.",
      inputSchema: {
        urls: z.array(z.string().min(1)).min(1).max(50),
        method: z.enum(["GET", "HEAD"]).default("GET"),
        headers: z.record(z.string(), z.string()).optional(),
        timeoutMs: z.number().int().min(1000).max(30000).default(10000),
        maxBytes: z.number().int().min(1000).max(100000).default(20000),
        parseJson: z.boolean().optional(),
        maxUrls: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await batchFetchPublicUrlPreviews(input))
  );

  server.registerTool(
    "arcigy.search_serper",
    {
      title: "Search Serper",
      description: "Search web results through Serper for lead discovery.",
      inputSchema: {
        query: z.string().min(1),
        num: z.number().int().min(1).max(20).default(10),
        gl: z.string().optional(),
        hl: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await searchSerper(input))
  );

  server.registerTool(
    "arcigy.search_google_places",
    {
      title: "Search Google Places",
      description: "Search businesses through Google Places Text Search.",
      inputSchema: {
        query: z.string().min(1),
        maxResultCount: z.number().int().min(1).max(20).default(10),
        languageCode: z.string().optional(),
        regionCode: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await searchGooglePlaces(input))
  );

  server.registerTool(
    "arcigy.discover_leads",
    {
      title: "Discover leads",
      description: "Combine Serper and Google Places into normalized lead candidates.",
      inputSchema: {
        query: z.string().min(1),
        placesQuery: z.string().optional(),
        maxResults: z.number().int().min(1).max(25).default(10),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await discoverLeads(input))
  );

  server.registerTool(
    "arcigy.scrape_website_contacts",
    {
      title: "Scrape website contacts",
      description: "Fetch a website and priority contact/about pages, then extract emails, phones, links, and text preview.",
      inputSchema: {
        url: z.string().min(1),
        includePriorityPages: z.boolean().default(true),
        maxPages: z.number().int().min(1).max(8).default(4),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await scrapeWebsiteContacts(input))
  );

  server.registerTool(
    "arcigy.batch_scrape_website_contacts",
    {
      title: "Batch scrape website contacts",
      description: "Read-only batch scrape public websites and contact pages for emails, phones, title, description, and text preview with per-site errors.",
      inputSchema: {
        urls: z.array(z.string().min(1)).min(1).max(50),
        includePriorityPages: z.boolean().default(true),
        maxPages: z.number().int().min(1).max(8).default(4),
        maxSites: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await batchScrapeWebsiteContacts(input))
  );

  server.registerTool(
    "arcigy.enrich_slovak_company_register",
    {
      title: "Enrich Slovak company register",
      description: "Read-only lookup in ORSR by ICO or company name, returning company, address, executives, and source URL.",
      inputSchema: {
        ico: z.string().optional(),
        companyName: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await enrichSlovakCompanyRegister(input))
  );

  server.registerTool(
    "arcigy.score_lead_quality",
    {
      title: "Score lead quality",
      description: "Score lead candidates from 0-100 using email, website, SK domain, decision maker, register verification, AI intro, and verification status.",
      inputSchema: {
        minScore: z.number().int().min(0).max(100).default(50),
        leads: z.array(
          z.object({
            email: z.string().optional(),
            companyName: z.string().optional(),
            website: z.string().optional(),
            decisionMaker: z.string().optional(),
            ico: z.string().optional(),
            registerVerified: z.boolean().optional(),
            personalizedIntro: z.string().optional(),
            verificationStatus: z.enum(["ok", "flagged", "failed"]).optional(),
          })
        ).min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(scoreLeadQuality(input))
  );

  server.registerTool(
    "arcigy.dedupe_lead_candidates",
    {
      title: "Dedupe lead candidates",
      description: "Deduplicate lead candidates by email, website, phone, or company name before Smartlead or Sheets preparation.",
      inputSchema: {
        leads: z.array(
          z.object({
            email: z.string().optional().default(""),
            companyName: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            website: z.string().optional(),
            phone: z.string().optional(),
            source: z.string().optional(),
            personalizedIntro: z.string().optional(),
            customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
          })
        ).min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(dedupeLeadCandidates(input))
  );

  server.registerTool(
    "arcigy.build_niche_leadgen_plan",
    {
      title: "Build niche leadgen plan",
      description: "Return niche-specific Google Maps and Serper query plan with blacklist keywords for Slovak leadgen.",
      inputSchema: {
        niche: z.string().min(1),
        region: z.string().optional(),
        customKeywords: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildNicheLeadgenPlan(input))
  );

  const batchNicheSchema = z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().min(1),
    keywords: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    dailyTarget: z.number().int().min(1).max(250).optional(),
    campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    smartleadCampaignId: z.union([z.string(), z.number(), z.null()]).optional(),
  });

  const executionQueueNicheSchema = batchNicheSchema.extend({
    status: z.string().optional(),
    tier: z.number().int().min(1).max(99).optional(),
    priority: z.number().int().min(1).max(99).optional(),
    currentRegionIndex: z.number().int().min(0).optional(),
    todaySent: z.number().int().min(0).optional(),
  });

  server.registerTool(
    "arcigy.build_batch_niche_discovery_plan",
    {
      title: "Build batch niche discovery plan",
      description: "Plan read-only discovery, scraping, AI intro, runbook, and Smartlead prep steps for multiple niches and regions without executing them.",
      inputSchema: {
        niches: z.array(batchNicheSchema).min(1).max(50),
        defaultRegions: z.array(z.string()).optional(),
        maxNiches: z.number().int().min(1).max(50).default(10),
        maxRegionsPerNiche: z.number().int().min(1).max(20).default(3),
        dailyLimit: z.number().int().min(1).max(250).optional(),
        targetCount: z.number().int().min(1).max(500).optional(),
        batchSize: z.number().int().min(1).max(100).optional(),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        includeSmartleadSetup: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildBatchNicheDiscoveryPlan(input))
  );

  server.registerTool(
    "arcigy.build_leadgen_execution_queue_preview",
    {
      title: "Build leadgen execution queue preview",
      description: "Prioritize daily leadgen work across niches, regions, quotas, discovery, enrichment, and Smartlead handoff without executing writes.",
      inputSchema: {
        niches: z.array(executionQueueNicheSchema).min(1).max(100),
        date: z.string().optional(),
        defaultRegions: z.array(z.string()).optional(),
        maxQueue: z.number().int().min(1).max(30).default(8),
        dailyLimit: z.number().int().min(1).max(250).optional(),
        targetCount: z.number().int().min(1).max(500).optional(),
        batchSize: z.number().int().min(1).max(100).optional(),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        includeSmartleadSetup: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenExecutionQueuePreview(input))
  );

  server.registerTool(
    "arcigy.draft_smartlead_campaign_sequence",
    {
      title: "Draft Smartlead campaign sequence",
      description: "Draft a Smartlead-compatible sequence payload with variants and an empty-subject follow-up, without writing to Smartlead.",
      inputSchema: {
        niche: z.string().min(1),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(draftSmartleadCampaignSequence(input))
  );

  const manualReviewPickupLeadSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    email: z.string().optional(),
    companyName: z.string().optional(),
    companyNameShort: z.string().optional(),
    officialCompanyName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    decisionMakerName: z.string().optional(),
    website: z.string().optional(),
    phone: z.string().optional(),
    nicheId: z.string().optional(),
    nicheSlug: z.string().optional(),
    nicheName: z.string().optional(),
    smartleadCampaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    manuallyReviewed: z.boolean().optional(),
    sentToSmartlead: z.boolean().optional(),
    personalizedIntro: z.string().optional(),
    icebreakerSentence: z.string().optional(),
    verificationStatus: z.enum(["ok", "flagged", "failed"]).optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }).passthrough();
  const enrichmentLeadSchema = manualReviewPickupLeadSchema.extend({
    scraped: z.object({
      url: z.string().optional(),
      finalUrl: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      textPreview: z.string().optional(),
      emails: z.array(z.string()).optional(),
      phones: z.array(z.string()).optional(),
      internalLinks: z.array(z.string()).optional(),
    }).partial().optional(),
    register: z.object({
      found: z.boolean().optional(),
      companyName: z.string().optional(),
      ico: z.string().optional(),
      address: z.string().optional(),
      executives: z.array(z.string()).optional(),
      sourceUrl: z.string().optional(),
      source: z.enum(["orsr_ico", "orsr_name", "not_found"]).optional(),
    }).partial().optional(),
    preAi: z.object({
      emails: z.array(z.string()).optional(),
      phones: z.array(z.string()).optional(),
      contextPreview: z.string().optional(),
    }).optional(),
  });
  const pipelineLeadSchema = enrichmentLeadSchema.extend({
    intro: z.object({
      personalizedIntro: z.string().optional(),
      model: z.string().optional(),
    }).partial().optional(),
    context: z.string().optional(),
  });
  const leadSourceQueueLeadSchema = pipelineLeadSchema.extend({
    nicheSlug: z.string().optional(),
    nicheName: z.string().optional(),
    campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    smartleadCampaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    placeId: z.string().optional(),
    rating: z.number().optional(),
    reviewCount: z.number().int().nonnegative().optional(),
  });
  const leadRepairQueueLeadSchema = pipelineLeadSchema.extend({
    id: z.union([z.string(), z.number()]).optional(),
    ico: z.string().optional(),
    verificationStatus: z.enum(["ok", "flagged", "failed"]).optional(),
    verificationNotes: z.string().optional(),
    sentToSmartlead: z.boolean().optional(),
    manuallyReviewed: z.boolean().optional(),
  });
  const queueNicheSchema = z.object({
    id: z.string().optional(),
    slug: z.string().min(1),
    name: z.string().min(1),
    campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    aliases: z.array(z.string()).optional(),
  });
  const nicheOpsInputSchema = z.object({
    id: z.string().optional(),
    slug: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["active", "paused", "archived"]).optional(),
    tier: z.number().int().optional(),
    regions: z.array(z.string()).optional(),
    currentRegionIndex: z.number().int().nonnegative().optional(),
    dailyTarget: z.number().int().nonnegative().optional(),
    todaySent: z.number().int().nonnegative().optional(),
    smartleadCampaignId: z.union([z.string(), z.number(), z.null()]).optional(),
    lastWorkedAt: z.string().optional(),
    stats: z.object({
      discovered: z.number().int().nonnegative().optional(),
      enriched: z.number().int().nonnegative().optional(),
      qualified: z.number().int().nonnegative().optional(),
      sentToSmartlead: z.number().int().nonnegative().optional(),
      failed: z.number().int().nonnegative().optional(),
      opened: z.number().int().nonnegative().optional(),
      replied: z.number().int().nonnegative().optional(),
    }).optional(),
    stuckLeads: z.array(leadRepairQueueLeadSchema).optional(),
    readyLeads: z.array(leadRepairQueueLeadSchema).optional(),
    failedLeads: z.array(leadRepairQueueLeadSchema).optional(),
  });
  const smartleadSenderAccountSchema = z.object({
    id: z.union([z.string(), z.number()]),
    email: z.string().email(),
    status: z.enum(["active", "paused", "error", "warming", "unknown"]).optional(),
    warmupStatus: z.enum(["active", "paused", "error", "warming", "unknown"]).optional(),
    dailyLimit: z.number().int().nonnegative().optional(),
    sentToday: z.number().int().nonnegative().optional(),
    bounceRate: z.number().min(0).optional(),
    replyRate: z.number().min(0).optional(),
    reputationScore: z.number().min(0).max(100).optional(),
  });
  const handoffLeadSchema = manualReviewPickupLeadSchema.extend({
    scraped: enrichmentLeadSchema.shape.scraped.optional(),
    intro: pipelineLeadSchema.shape.intro.optional(),
    context: z.string().optional(),
  });

  server.registerTool(
    "arcigy.preview_smartlead_email_rendering",
    {
      title: "Preview Smartlead email rendering",
      description: "Render Smartlead sequence variants for concrete leads and report unresolved variables without sending emails.",
      inputSchema: {
        leads: z.array(z.object({
          email: z.string().min(1),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          company_name: z.string().optional(),
          website: z.string().optional(),
          custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        })).min(1).max(50),
        sequences: z.array(z.object({
          seq_number: z.number().int().min(1),
          seq_delay_details: z.object({ delay_in_days: z.number().int().min(0) }),
          seq_variants: z.array(z.object({
            variant_label: z.string().min(1),
            subject: z.string(),
            email_body: z.string(),
          })).min(1),
        })).min(1),
        signature: z.string().optional(),
        maxLeads: z.number().int().min(1).max(50).default(10),
        maxRendered: z.number().int().min(1).max(250).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(previewSmartleadEmailRendering(input))
  );

  server.registerTool(
    "arcigy.preview_manual_review_pickup",
    {
      title: "Preview manual review pickup",
      description: "Preview the manual-review-pickup workflow: filter reviewed unsent leads, qualify them, group by niche, and prepare Smartlead injection plans without writes.",
      inputSchema: {
        leads: z.array(manualReviewPickupLeadSchema).min(1),
        includeUnreviewed: z.boolean().default(false),
        minScore: z.number().int().min(0).max(100).default(50),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildManualReviewPickupPlan(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_injection_plan",
    {
      title: "Build Smartlead injection plan",
      description: "Prepare Smartlead lead_list batches and approval payload for an existing campaign without uploading leads.",
      inputSchema: {
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }),
        leads: z.array(manualReviewPickupLeadSchema).min(1),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadInjectionPlan(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_import_audit_preview",
    {
      title: "Build Smartlead import audit preview",
      description: "Compare prepared Smartlead leads with existing campaign leads, separate new/duplicate/already-imported records, and prepare an approval payload without uploading.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        leads: z.array(z.object({
          email: z.string().min(1),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          company_name: z.string().optional(),
          website: z.string().optional(),
          custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        })).min(1).max(500),
        existingSmartleadLeads: z.array(z.record(z.string(), z.unknown())).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadImportAuditPreview(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_sender_capacity_preview",
    {
      title: "Build Smartlead sender capacity preview",
      description: "Check sender accounts, warmup status, reputation, remaining capacity, and prepare a safe campaign configure payload without writing.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        accounts: z.array(smartleadSenderAccountSchema).min(1).max(100),
        leadBacklog: z.number().int().nonnegative().optional(),
        requestedDailyLimit: z.number().int().min(1).max(1000).default(30),
        minTimeBetweenEmailsMinutes: z.number().int().min(1).max(240).default(12),
        maxPerAccountPerDay: z.number().int().min(1).max(200).default(40),
        includePausedAccounts: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadSenderCapacityPreview(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_deliverability_guard_preview",
    {
      title: "Build Smartlead deliverability guard preview",
      description: "Evaluate Smartlead delivery metrics, sender capacity, and recommend continue/reduce/pause before more uploads without writing.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        campaignName: z.string().optional(),
        stats: z.object({
          sent: z.number().int().nonnegative().optional(),
          opened: z.number().int().nonnegative().optional(),
          replied: z.number().int().nonnegative().optional(),
          positiveReplies: z.number().int().nonnegative().optional(),
          bounced: z.number().int().nonnegative().optional(),
          unsubscribed: z.number().int().nonnegative().optional(),
        }).optional(),
        senderAccounts: z.array(smartleadSenderAccountSchema).optional(),
        leadBacklog: z.number().int().min(0).optional(),
        requestedDailyLimit: z.number().int().min(1).max(1000).optional(),
        maxBounceRate: z.number().min(0).max(100).optional(),
        maxUnsubscribeRate: z.number().min(0).max(100).optional(),
        minReplyRate: z.number().min(0).max(100).optional(),
        minOpenRate: z.number().min(0).max(100).optional(),
        minTimeBetweenEmailsMinutes: z.number().int().min(1).max(240).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadDeliverabilityGuardPreview(input))
  );

  server.registerTool(
    "arcigy.draft_niche_smartlead_campaign_setup",
    {
      title: "Draft niche Smartlead campaign setup",
      description: "Draft a complete Smartlead campaign setup payload for a niche, including sequences, schedule, settings, and webhook, without creating it.",
      inputSchema: {
        niche: z.object({ id: z.string().optional(), slug: z.string().min(1), name: z.string().min(1) }),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        webhookUrl: z.string().url().optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(draftNicheSmartleadCampaignSetup(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_campaign_launch_preview",
    {
      title: "Build Smartlead campaign launch preview",
      description: "Prepare a complete Smartlead campaign launch plan with campaign setup, configure payload, webhook, and lead upload payloads without writes.",
      inputSchema: {
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }),
        leads: z.array(manualReviewPickupLeadSchema).min(1),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        webhookUrl: z.string().url().optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadCampaignLaunchPreview(input))
  );

  server.registerTool(
    "arcigy.build_smartlead_campaign_qa_preview",
    {
      title: "Build Smartlead campaign QA preview",
      description: "Validate Smartlead launch payloads, leads, sequences, schedule, and approval next steps without writing to Smartlead.",
      inputSchema: {
        launchPreview: z.record(z.string(), z.unknown()).optional(),
        campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        campaignName: z.string().optional(),
        leads: z.array(z.record(z.string(), z.unknown())).optional(),
        sequences: z.array(z.record(z.string(), z.unknown())).optional(),
        schedule: z.record(z.string(), z.unknown()).optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
        nextToolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
        maxNewLeadsPerDay: z.number().int().min(1).max(500).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadCampaignQaPreview(input as Parameters<typeof buildSmartleadCampaignQaPreview>[0]))
  );

  server.registerTool(
    "arcigy.build_smartlead_campaign_handoff_package_preview",
    {
      title: "Build Smartlead campaign handoff package preview",
      description: "Combine launch preview, QA, sender capacity, and approval checklist into one read-only Smartlead campaign handoff package.",
      inputSchema: {
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }),
        leads: z.array(handoffLeadSchema).min(1).max(1000),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        webhookUrl: z.string().url().optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
        batchSize: z.number().int().min(1).max(100).default(50),
        senderAccounts: z.array(smartleadSenderAccountSchema).optional(),
        requestedDailyLimit: z.number().int().min(1).max(1000).optional(),
        minTimeBetweenEmailsMinutes: z.number().int().min(1).max(240).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildSmartleadCampaignHandoffPackagePreview(input))
  );

  server.registerTool(
    "arcigy.preview_lead_enrichment_batch",
    {
      title: "Preview lead enrichment batch",
      description: "Merge scraped/register/AI fields for a batch, dedupe, score, split review states, and optionally prepare a Smartlead injection plan without writes.",
      inputSchema: {
        leads: z.array(enrichmentLeadSchema).min(1),
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(previewLeadEnrichmentBatch(input))
  );

  server.registerTool(
    "arcigy.build_leadgen_gap_report",
    {
      title: "Build leadgen gap report",
      description: "Audit a lead batch before Smartlead, report missing email/website/AI intro/decision-maker gaps, and propose safe next MCP calls without writes.",
      inputSchema: {
        leads: z.array(pipelineLeadSchema).min(1),
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenGapReport(input))
  );

  server.registerTool(
    "arcigy.build_leadgen_campaign_pipeline_preview",
    {
      title: "Build leadgen campaign pipeline preview",
      description: "Build one read-only plan that chains website scraping, AI intro drafting, enrichment scoring, manual review, and Smartlead upload payloads.",
      inputSchema: {
        leads: z.array(pipelineLeadSchema).min(1),
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
        maxNextCalls: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadgenCampaignPipelinePreview(input))
  );

  server.registerTool(
    "arcigy.build_lead_source_import_queue_preview",
    {
      title: "Build lead source import queue preview",
      description: "Turn Google Maps, CSV, Serper, or manual lead source rows into niche/campaign import queues with scrape, intro, review, and Smartlead audit next steps without writes.",
      inputSchema: {
        sourceName: z.string().optional(),
        sourceType: z.enum(["google_maps", "csv", "serper", "manual", "other"]).default("manual"),
        leads: z.array(leadSourceQueueLeadSchema).optional(),
        csvText: z.string().optional(),
        delimiter: z.enum([",", ";"]).optional(),
        maxRows: z.number().int().min(1).max(10_000).default(1000),
        niches: z.array(queueNicheSchema).optional(),
        defaultNiche: queueNicheSchema.omit({ aliases: true }).optional(),
        blacklistDomains: z.array(z.string()).optional(),
        blacklistKeywords: z.array(z.string()).optional(),
        existingSmartleadLeadsByCampaign: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
        maxNextCalls: z.number().int().min(1).max(80).default(30),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadSourceImportQueuePreview(input))
  );

  server.registerTool(
    "arcigy.build_url_intelligence_queue_preview",
    {
      title: "Build URL intelligence queue preview",
      description: "Turn raw URLs and partial leads into fetch, contact scrape, AI intro, repair, and Smartlead import queue next steps without writes.",
      inputSchema: {
        urls: z.array(z.string()).optional(),
        leads: z.array(leadSourceQueueLeadSchema).optional(),
        sourceName: z.string().optional(),
        niche: queueNicheSchema.omit({ aliases: true }).optional(),
        niches: z.array(queueNicheSchema).optional(),
        includeFetchPreview: z.boolean().default(true),
        includeScrape: z.boolean().default(true),
        includeIntroDrafts: z.boolean().default(true),
        includeImportQueue: z.boolean().default(true),
        includePriorityPages: z.boolean().default(true),
        maxPages: z.number().int().min(1).max(10).default(4),
        maxUrls: z.number().int().min(1).max(300).default(100),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
        blacklistDomains: z.array(z.string()).optional(),
        blacklistKeywords: z.array(z.string()).optional(),
        maxNextCalls: z.number().int().min(1).max(100).default(40),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildUrlIntelligenceQueuePreview(input))
  );

  server.registerTool(
    "arcigy.build_lead_repair_queue_preview",
    {
      title: "Build lead repair queue preview",
      description: "Detect broken leads, bad AI intros, missing emails, missing decision makers, failed verification, and propose exact read-only repair MCP calls.",
      inputSchema: {
        leads: z.array(leadRepairQueueLeadSchema).min(1).max(1000),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        minScore: z.number().int().min(0).max(100).default(70),
        maxNextCalls: z.number().int().min(1).max(80).default(30),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildLeadRepairQueuePreview(input))
  );

  server.registerTool(
    "arcigy.build_niche_ops_dashboard_preview",
    {
      title: "Build niche ops dashboard preview",
      description: "Summarize niche/campaign health, daily targets, stuck/failed/ready leads, and propose exact next MCP calls without writes.",
      inputSchema: {
        niches: z.array(nicheOpsInputSchema).min(1).max(100),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        defaultDailyTarget: z.number().int().min(0).max(1000).default(30),
        maxNextCalls: z.number().int().min(1).max(100).default(40),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildNicheOpsDashboardPreview(input))
  );

  server.registerTool(
    "arcigy.build_cold_outreach_csv_import_preview",
    {
      title: "Build cold outreach CSV import preview",
      description: "Parse pasted/exported lead CSV, apply blacklist filters, build leadgen pipeline preview, and prepare Smartlead launch payloads without writes.",
      inputSchema: {
        csvText: z.string().min(1),
        delimiter: z.enum([",", ";"]).optional(),
        maxRows: z.number().int().min(1).max(10_000).default(1000),
        blacklistDomains: z.array(z.string()).optional(),
        blacklistKeywords: z.array(z.string()).optional(),
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        webhookUrl: z.string().url().optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildColdOutreachCsvImportPreview(input))
  );

  server.registerTool(
    "arcigy.build_daily_leadgen_runbook",
    {
      title: "Build daily leadgen runbook",
      description: "Build an exact read-first daily leadgen runbook with MCP call payloads from discovery through enrichment and approved Smartlead upload.",
      inputSchema: {
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          keywords: z.array(z.string()).optional(),
          region: z.string().optional(),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }),
        targetCount: z.number().int().min(1).max(500).optional(),
        dailyLimit: z.number().int().min(1).max(250).optional(),
        batchSize: z.number().int().min(1).max(100).optional(),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        includeSmartleadSetup: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildDailyLeadgenRunbook(input))
  );

  const leadCandidateSchema = z.object({
    email: z.string().optional(),
    companyName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    website: z.string().optional(),
    phone: z.string().optional(),
    source: z.string().optional(),
    personalizedIntro: z.string().optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  });

  server.registerTool(
    "arcigy.parse_leads_csv",
    {
      title: "Parse leads CSV",
      description: "Parse CSV text into normalized lead candidates for review, scoring, and Smartlead preparation.",
      inputSchema: {
        csvText: z.string().min(1),
        delimiter: z.enum([",", ";"]).optional(),
        maxRows: z.number().int().min(1).max(10_000).default(1000),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(parseLeadsCsv(input))
  );

  server.registerTool(
    "arcigy.filter_blacklisted_leads",
    {
      title: "Filter blacklisted leads",
      description: "Filter lead candidates by blacklisted domains and keywords before import.",
      inputSchema: {
        leads: z.array(leadCandidateSchema).min(1),
        domains: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(filterBlacklistedLeads(input))
  );

  server.registerTool(
    "arcigy.build_manual_review_queue",
    {
      title: "Build manual review queue",
      description: "Split leads into ready, manual_review, and rejected groups using email, website, decision-maker/phone, AI intro, and score.",
      inputSchema: {
        leads: z.array(leadCandidateSchema).min(1),
        minScore: z.number().int().min(0).max(100).default(70),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(buildManualReviewQueue(input))
  );

  server.registerTool(
    "arcigy.export_leads_csv",
    {
      title: "Export leads CSV",
      description: "Write selected lead candidates to a CSV file inside the repository after explicit approval.",
      inputSchema: {
        leads: z.array(leadCandidateSchema).min(1),
        columns: z.array(z.string()).optional(),
        outputPath: z.string().default("generated/leads/manual-review.csv"),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.export_leads_csv", input);
      const safeOutputPath = resolveRepoPath(input.outputPath, "generated/leads/manual-review.csv", "outputPath");
      const serialized = serializeLeadsCsv({ leads: input.leads, columns: input.columns });
      mkdirSync(dirname(safeOutputPath), { recursive: true });
      writeFileSync(safeOutputPath, serialized.csvText, "utf-8");
      return jsonResult({ ...serialized, outputPath: safeOutputPath });
    }
  );

  server.registerTool(
    "arcigy.draft_lead_intro",
    {
      title: "Draft lead intro",
      description: "Use Gemini to draft one short personalized cold outreach intro for a lead.",
      inputSchema: {
        companyName: z.string().min(1),
        website: z.string().optional(),
        context: z.string().optional(),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await draftLeadIntro(input))
  );

  server.registerTool(
    "arcigy.batch_draft_lead_intros",
    {
      title: "Batch draft lead intros",
      description: "Use Gemini to draft short personalized cold outreach intros for multiple leads without sending or writing.",
      inputSchema: {
        leads: z.array(z.object({
          companyName: z.string().min(1),
          website: z.string().optional(),
          context: z.string().optional(),
          offer: z.string().optional(),
          language: z.enum(["sk", "en"]).optional(),
        })).min(1).max(50),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        maxLeads: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await batchDraftLeadIntros(input))
  );

  server.registerTool(
    "arcigy.enrich_website_leads_preview",
    {
      title: "Enrich website leads preview",
      description: "Read-only live enrichment: scrape lead websites, optionally draft AI intros, and prepare pipeline plus Smartlead launch previews without writes.",
      inputSchema: {
        leads: z.array(leadCandidateSchema).min(1).max(50),
        niche: z.object({
          id: z.string().optional(),
          slug: z.string().min(1),
          name: z.string().min(1),
          campaignId: z.union([z.string(), z.number(), z.null()]).optional(),
        }).optional(),
        campaignTag: z.string().optional(),
        defaultSource: z.string().optional(),
        offer: z.string().optional(),
        painPoint: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
        scrapeWebsites: z.boolean().default(true),
        draftIntros: z.boolean().default(true),
        includePriorityPages: z.boolean().default(true),
        maxPages: z.number().int().min(1).max(8).default(4),
        maxLeads: z.number().int().min(1).max(50).default(20),
        minScore: z.number().int().min(0).max(100).default(70),
        batchSize: z.number().int().min(1).max(100).default(50),
        clientId: z.union([z.string(), z.number(), z.null()]).optional(),
        emailAccountIds: z.array(z.union([z.string(), z.number()])).optional(),
        webhookUrl: z.string().url().optional(),
        schedule: smartleadScheduleSchema.optional(),
        settings: smartleadSettingsSchema.optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await enrichWebsiteLeadsPreview(input))
  );

  server.registerTool(
    "arcigy.prepare_smartlead_leads",
    {
      title: "Prepare Smartlead leads",
      description: "Normalize selected leads into Smartlead lead_list payload without writing to Smartlead.",
      inputSchema: {
        defaultSource: z.string().optional(),
        leads: z.array(
          z.object({
            email: z.string().min(1),
            companyName: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            website: z.string().optional(),
            phone: z.string().optional(),
            source: z.string().optional(),
            personalizedIntro: z.string().optional(),
            customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
          })
        ).min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(prepareSmartleadLeads(input))
  );

  server.registerTool(
    "arcigy.run_leadgen_research_pipeline",
    {
      title: "Run leadgen research pipeline",
      description: "Run read-only discovery, optional website scraping, and optional Gemini intro drafts for Smartlead-ready lead research.",
      inputSchema: {
        query: z.string().min(1),
        placesQuery: z.string().optional(),
        maxResults: z.number().int().min(1).max(15).default(5),
        scrapeWebsites: z.boolean().default(true),
        draftIntros: z.boolean().default(false),
        offer: z.string().optional(),
        language: z.enum(["sk", "en"]).default("sk"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => jsonResult(await runLeadgenResearchPipeline(input))
  );

  server.registerTool(
    "arcigy.add_leads_to_smartlead_campaign",
    {
      title: "Add leads to Smartlead campaign",
      description: "Upload a prepared Smartlead lead_list to a campaign. This is an explicit external write action.",
      inputSchema: {
        campaignId: z.union([z.string(), z.number()]),
        leads: z.array(
          z.object({
            email: z.string().min(1),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            company_name: z.string().optional(),
            website: z.string().optional(),
            custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
          })
        ).min(1),
        settings: z.object({
          ignore_global_block_list: z.boolean().optional(),
          ignore_unsubscribe_list: z.boolean().optional(),
        }).optional(),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.add_leads_to_smartlead_campaign", input);
      return jsonResult(await addLeadsToSmartleadCampaign(input));
    }
  );

  server.registerTool(
    "arcigy.append_leads_to_google_sheet",
    {
      title: "Append leads to Google Sheet",
      description: "Append prepared lead rows to a Google Sheet. This is an explicit write action.",
      inputSchema: {
        spreadsheetId: z.string().optional(),
        range: z.string().default("Leads!A1"),
        accountEnvKey: z.string().optional(),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1),
        approval: approvalSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      requireExplicitApproval("arcigy.append_leads_to_google_sheet", input);
      return jsonResult(await appendRowsToGoogleSheet(input));
    }
  );

  return server;
}

async function buildOperatorBriefingForMcp(input: {
  safeDbPath?: string;
  since?: string;
  until?: string;
  periodLabel: string;
  live: boolean;
  syncGmail: boolean;
  accountEnvKey?: string;
  gmailQuery?: string;
  gmailMaxResults?: number;
}) {
  const now = new Date();
  const defaultSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const liveSyncSummary = await maybeSyncGmailForOperatorBriefing(
    {
      live: input.live,
      syncGmail: input.syncGmail,
      accountEnvKey: input.accountEnvKey,
      gmailQuery: input.gmailQuery ?? defaultGmailBriefingQuery,
      gmailMaxResults: input.gmailMaxResults ?? 5,
    },
    input.safeDbPath
  );
  const localCold = runDbCommand(
    "cold-brief",
    { since: input.since ?? defaultSince, until: input.until ?? now.toISOString(), periodLabel: input.periodLabel },
    input.safeDbPath
  );
  const clientNeeds = runDbCommand("list-open-needs", { status: "new", limit: 10 }, input.safeDbPath);
  const preparedReplies = runDbCommand("list-prepared-replies", { status: "pending", limit: 10 }, input.safeDbPath);
  const readiness = await buildProductionReadinessReport({ live: input.live, dbPath: input.safeDbPath });
  const productionEvidence = getProductionVerificationEvidence(repoRoot);
  const preparedReplyCount = Number(preparedReplies.count ?? 0);
  const preparedPositiveReplyCount = Number(localCold.metrics?.preparedPositiveReplyCount ?? preparedReplyCount);
  const pendingPositiveApprovalCount = Number(localCold.metrics?.pendingPositiveApprovalCount ?? preparedPositiveReplyCount);
  const coldOutreachSummary = await getOperatorColdOutreachSummary(input.live, input.periodLabel, localCold.summary, {
    preparedPositiveReplyCount,
    pendingApprovalCount: pendingPositiveApprovalCount,
  });
  return buildOperatorBriefing({
    readinessStatus: readiness.status,
    readinessSummary: readiness.summary,
    readinessAttentionQueue: readiness.attentionQueue,
    productionEvidenceSummary: productionEvidence.summary,
    providerFallbackSummary: summarizeProviderFallbackForBriefing(readiness.diagnostics?.checks),
    coldOutreachSummary,
    liveSyncSummary,
    openClientNeedCount: Number(clientNeeds.count ?? 0),
    clientNeedHighlights: Array.isArray(clientNeeds.alerts) ? clientNeeds.alerts : [],
    preparedReplyCount,
    preparedReplyHighlights: Array.isArray(preparedReplies.replies) ? preparedReplies.replies : [],
    nextActions: readiness.nextActions,
  });
}

function summarizeProviderFallbackForBriefing(checks: Array<{ key?: string; status?: string }> | undefined): string | null {
  if (!checks?.length) return null;
  const byKey = new Map(checks.map((check) => [check.key, check.status]));
  const requiredKeys = ["gemini", "gmail", "smartlead", "postgres", "googleSheets", "googleMaps", "remoteMcp", "sqlite"];
  const readyRequired = requiredKeys.filter((key) => byKey.get(key) === "ready").length;
  const leadFallback =
    byKey.get("serper") === "ready"
      ? "Serper and Google Places are available."
      : byKey.get("googleMaps") === "ready"
        ? "Google Places fallback is active; Serper is optional."
        : "Lead discovery providers need attention.";
  const redis =
    byKey.get("redis") === "ready" ? "Redis is live." : "Redis is optional for shipped workflows because local state uses SQLite.";
  return `${readyRequired}/${requiredKeys.length} required providers ready. ${leadFallback} ${redis}`;
}

export async function runJarvisMcpServer(): Promise<void> {
  const server = createJarvisMcpServer();
  await server.connect(new StdioServerTransport());
}

function runPython(args: string[]): { stdout: string; stderr: string } {
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw pythonToolError(result.stderr || `Python command failed with status ${result.status}`);
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function pythonToolError(message: string): Error {
  return new Error(cleanPythonErrorMessage(message));
}

function cleanPythonErrorMessage(message: string): string {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueError = [...lines].reverse().find((line) => /^(ValueError|FileNotFoundError|TypeError|Error):\s*/.test(line));
  if (valueError) return redactSensitiveText(valueError.replace(/^(ValueError|FileNotFoundError|TypeError|Error):\s*/, ""));
  return redactSensitiveText(lines.at(-1) || String(message));
}

function resolveRepoPath(value: unknown, fallback: string, label: string): string {
  const candidate = typeof value === "string" && value.trim() ? value : fallback;
  if (!candidate) throw new Error(`${label} is required.`);
  const resolved = resolve(repoRoot, candidate);
  const root = resolve(repoRoot);
  const normalizedResolved = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`${label} must stay inside the Jarvis repository.`);
  }
  return resolved;
}

function resolveOptionalRepoPath(value: unknown, label: string): string | undefined {
  return typeof value === "string" && value.trim() ? resolveRepoPath(value, "", label) : undefined;
}

function jsonDbTool(
  command:
    | "upsert-person"
    | "add-need-signal"
    | "add-cold-event"
    | "cold-brief"
    | "list-prepared-replies"
    | "list-approval-queue"
    | "approve-prepared-reply"
    | "get-prepared-reply"
    | "ingest-message"
    | "list-open-needs"
    | "update-need-status"
    | "add-audit-event"
    | "list-audit-events"
    | "local-memory-snapshot"
    | "export-local-memory-snapshot",
  payload: Record<string, unknown>,
  dbPath?: string
) {
  return jsonResult(runDbCommand(command, payload, dbPath));
}

function runDbCommand(
  command:
    | "upsert-person"
    | "add-need-signal"
    | "add-cold-event"
    | "cold-brief"
    | "list-prepared-replies"
    | "list-approval-queue"
    | "approve-prepared-reply"
    | "get-prepared-reply"
    | "ingest-message"
    | "list-open-needs"
    | "update-need-status"
    | "add-audit-event"
    | "list-audit-events"
    | "local-memory-snapshot"
    | "export-local-memory-snapshot",
  payload: Record<string, unknown>,
  dbPath?: string
) {
  const args = ["scripts/jarvis_local_db.py", command, "--payload", JSON.stringify(payload)];
  if (dbPath) {
    args.push("--db", resolveRepoPath(dbPath, "", "dbPath"));
  }
  const result = runPython(args);
  return JSON.parse(result.stdout);
}

async function preparePositiveOutreachReply(
  payload: {
    leadEmail: string;
    leadName?: string;
    companyName?: string;
    campaignId?: string;
    campaignName?: string;
    positiveSignal: string;
    context?: string;
    subject?: string;
    language?: "sk" | "en";
    tone?: "direct" | "warm" | "executive";
    occurredAt?: string;
  },
  dbPath?: string
) {
  const draft = await generateGeminiText(buildPositiveOutreachReplyPrompt(payload));
  const event = runDbCommand(
    "add-cold-event",
    {
      leadEmail: payload.leadEmail,
      campaignId: payload.campaignId,
      campaignName: payload.campaignName,
      eventType: "prepared_reply",
      occurredAt: payload.occurredAt,
      data: {
        subject: payload.subject,
        replyText: draft.text,
        positiveSignal: payload.positiveSignal,
        leadName: payload.leadName,
        companyName: payload.companyName,
        context: payload.context,
        language: payload.language ?? "sk",
        tone: payload.tone ?? "executive",
        model: draft.model,
        attempts: draft.attempts,
        generatedBy: "gemini",
        requiresApprovalBeforeSend: true,
      },
    },
    dbPath
  );
  return {
    status: "prepared",
    preparedReply: event,
    replyText: draft.text,
    model: draft.model,
    attempts: draft.attempts,
    summary: `Jarvis: Pripravil som odpoved pre ${payload.leadEmail}. Poslem ju az po tvojom schvaleni cez arcigy.approve_prepared_outreach_reply.`,
  };
}

async function sendApprovedOutreachReply(
  payload: {
    preparedEventId: string;
    accountEnvKey?: string;
    subject?: string;
    threadId?: string;
    sentBy?: string;
    occurredAt?: string;
  },
  dbPath?: string
) {
  const status = runDbCommand("get-prepared-reply", { preparedEventId: payload.preparedEventId }, dbPath) as {
    status: string;
    preparedReply: {
      leadEmail: string;
      campaignId?: string | null;
      campaignName?: string | null;
      subject?: string | null;
      replyText?: string | null;
      data?: Record<string, unknown>;
    };
    sentEvent?: unknown;
  };
  if (status.status === "sent") {
    return {
      status: "already_sent",
      preparedReply: status.preparedReply,
      sentEvent: status.sentEvent,
      summary: `Jarvis: Odpoved pre ${status.preparedReply.leadEmail} uz bola odoslana.`,
    };
  }
  if (status.status !== "approved") {
    throw new Error("Prepared reply must be approved before sending.");
  }
  const replyText = status.preparedReply.replyText?.trim();
  if (!replyText) throw new Error("Prepared reply text is missing.");

  const accounts = listConfiguredGmailAccounts().filter((account) => !payload.accountEnvKey || account.envKey === payload.accountEnvKey);
  if (!accounts.length) {
    throw new Error(payload.accountEnvKey ? `Configured Gmail account not found: ${payload.accountEnvKey}` : "No configured Gmail accounts found.");
  }

  let lastError: Error | null = null;
  for (const account of accounts) {
    try {
      const gmail = await sendGmailTextMessage(account, {
        to: status.preparedReply.leadEmail,
        subject: payload.subject ?? status.preparedReply.subject ?? "Re: Arcigy",
        text: replyText,
        threadId: payload.threadId ?? (typeof status.preparedReply.data?.threadId === "string" ? status.preparedReply.data.threadId : undefined),
      });
      const sentEvent = runDbCommand(
        "add-cold-event",
        {
          leadEmail: status.preparedReply.leadEmail,
          campaignId: status.preparedReply.campaignId,
          campaignName: status.preparedReply.campaignName,
          eventType: "approved_reply_sent",
          occurredAt: payload.occurredAt,
          data: {
            preparedEventId: payload.preparedEventId,
            sentBy: payload.sentBy ?? "operator",
            account: account.label,
            accountEnvKey: account.envKey,
            gmailMessageId: gmail.id,
            gmailThreadId: gmail.threadId,
            subject: payload.subject ?? status.preparedReply.subject ?? "Re: Arcigy",
          },
        },
        dbPath
      );
      return {
        status: "sent",
        preparedReply: status.preparedReply,
        sentEvent,
        gmail,
        summary: `Jarvis: Odpoved pre ${status.preparedReply.leadEmail} bola odoslana cez Gmail.`,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (payload.accountEnvKey) break;
    }
  }
  throw new Error(lastError?.message ?? "Gmail send failed.");
}

function requireExplicitApproval(name: string, payload: { approval?: { approved?: boolean } }) {
  if (payload.approval?.approved === true) return;
  throw new Error(`${name} requires explicit approval. Send {"approval":{"approved":true}} after user confirmation.`);
}

async function maybeSyncGmailForOperatorBriefing(
  input: { live: boolean; syncGmail: boolean; accountEnvKey?: string; gmailQuery: string; gmailMaxResults: number },
  dbPath?: string
): Promise<string | null> {
  if (!input.live || !input.syncGmail) return null;
  try {
    const accounts = listConfiguredGmailAccounts().filter((account) => !input.accountEnvKey || account.envKey === input.accountEnvKey);
    if (!accounts.length) {
      throw new Error(input.accountEnvKey ? `Configured Gmail account not found: ${input.accountEnvKey}` : "No configured Gmail accounts found.");
    }
    const synced = [];
    for (const account of accounts) {
      const events = await listRecentGmailMessageEvents(account, { query: input.gmailQuery, maxResults: input.gmailMaxResults });
      const ingested = events.map((event) => runDbCommand("ingest-message", event, dbPath));
      const createdItems = ingested.filter((item) => item.status === "created");
      const duplicateItems = ingested.filter((item) => item.status === "duplicate");
      synced.push({
        fetched: events.length,
        created: createdItems.length,
        duplicates: duplicateItems.length,
        alerts: createdItems.map((item) => item.jarvisAlert).filter(Boolean).length,
      });
    }
    const fetched = synced.reduce((sum, item) => sum + item.fetched, 0);
    const created = synced.reduce((sum, item) => sum + item.created, 0);
    const duplicates = synced.reduce((sum, item) => sum + item.duplicates, 0);
    const alerts = synced.reduce((sum, item) => sum + item.alerts, 0);
    return `Gmail checked ${synced.length} account(s), fetched ${fetched} message(s), created ${created} new record(s), skipped ${duplicates} duplicate(s), raised ${alerts} alert(s).`;
  } catch (error) {
    const message = safeErrorMessage(error);
    return `Gmail live sync unavailable: ${message}`;
  }
}

async function getOperatorColdOutreachSummary(
  live: boolean,
  periodLabel: string,
  localSummary: string,
  approvals: { preparedPositiveReplyCount?: number; pendingApprovalCount?: number } = {}
): Promise<string> {
  if (!live) return localSummary;
  try {
    const smartlead = await getSmartleadOutreachBrief({ periodLabel, maxCampaigns: 10, ...approvals });
    return smartlead.summary;
  } catch (error) {
    const message = safeErrorMessage(error);
    return `${localSummary} Live Smartlead summary unavailable: ${message}`;
  }
}

function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error));
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

function hasConfiguredWebToken() {
  const value = (process.env.JARVIS_WEB_TOKEN || process.env.API_SECRET_KEY || "").trim();
  return value !== "" && value !== "dummy";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runJarvisMcpServer().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exit(1);
  });
}
