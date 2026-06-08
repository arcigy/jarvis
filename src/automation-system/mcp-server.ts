import { spawnSync } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { draftContractIntake } from "./contract-intake-draft.ts";
import { runIntegrationDiagnostics } from "./diagnostics.ts";
import { getIntegrationHealth, loadLocalEnv, summarizeIntegrationHealth } from "./env.ts";
import { buildClientReplyPrompt, generateGeminiText } from "./gemini.ts";
import { defaultGmailBriefingQuery, defaultGmailSyncQuery, listConfiguredGmailAccounts, listRecentGmailMessageEvents } from "./gmail.ts";
import { handleJarvisVoiceEvent, type JarvisVoiceSession } from "./jarvis-voice.ts";
import { appendRowsToGoogleSheet, discoverLeads, searchGooglePlaces, searchSerper } from "./lead-discovery.ts";
import {
  buildContractGenerationCommand,
  getColdOutreachMcpAnswer,
  identifyEmailMcpAnswer,
} from "./mcp-tools.ts";
import { buildOperatorBriefing } from "./operator-briefing.ts";
import { buildProductionReadinessReport } from "./production-readiness.ts";
import { buildRemoteMcpConnectionPack } from "./remote-mcp-pack.ts";
import { runRemoteMcpSmoke } from "./remote-mcp-smoke.ts";
import { getSmartleadCampaignStatus, getSmartleadOutreachBrief } from "./smartlead.ts";
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
        approved: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ inputJsonPath, intake, outputDir, approval, approved }) => {
      requireExplicitApproval("arcigy.generate_contract_documents", { approval, approved });
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
        eventType: z.enum(["sent", "opened", "replied", "positive_reply", "prepared_reply", "approved_reply_sent"]),
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
    "arcigy.approve_prepared_outreach_reply",
    {
      title: "Approve prepared outreach reply",
      description: "Mark a prepared cold outreach reply as approved after explicit operator confirmation.",
      inputSchema: {
        dbPath: z.string().optional(),
        preparedEventId: z.string().min(1),
        approval: approvalSchema,
        approved: z.boolean().optional(),
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
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session, text }) => {
      const result = handleJarvisVoiceEvent((session ?? { state: "idle", wakeWord: "jarvis" }) as JarvisVoiceSession, {
        type: "transcript",
        text,
      });
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
      const now = new Date();
      const defaultSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const liveSyncSummary = await maybeSyncGmailForOperatorBriefing({ live, syncGmail, accountEnvKey, gmailQuery, gmailMaxResults }, safeDbPath);
      const localCold = runDbCommand("cold-brief", { since: since ?? defaultSince, until: until ?? now.toISOString(), periodLabel }, safeDbPath);
      const clientNeeds = runDbCommand("list-open-needs", { status: "new", limit: 10 }, safeDbPath);
      const preparedReplies = runDbCommand("list-prepared-replies", { status: "pending", limit: 10 }, safeDbPath);
      const readiness = await buildProductionReadinessReport({ live, dbPath: safeDbPath });
      const preparedReplyCount = Number(preparedReplies.count ?? 0);
      const coldOutreachSummary = await getOperatorColdOutreachSummary(live, periodLabel, localCold.summary, {
        preparedPositiveReplyCount: preparedReplyCount,
        pendingApprovalCount: preparedReplyCount,
      });
      return jsonResult(
        buildOperatorBriefing({
          readinessStatus: readiness.status,
          readinessSummary: readiness.summary,
          readinessAttentionQueue: readiness.attentionQueue,
          coldOutreachSummary,
          liveSyncSummary,
          openClientNeedCount: Number(clientNeeds.count ?? 0),
          clientNeedHighlights: Array.isArray(clientNeeds.alerts) ? clientNeeds.alerts : [],
          preparedReplyCount,
          nextActions: readiness.nextActions,
        })
      );
    }
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
        approved: z.boolean().optional(),
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
  if (valueError) return valueError.replace(/^(ValueError|FileNotFoundError|TypeError|Error):\s*/, "");
  return lines.at(-1) || String(message);
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
    | "approve-prepared-reply"
    | "ingest-message"
    | "list-open-needs"
    | "add-audit-event"
    | "list-audit-events",
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
    | "approve-prepared-reply"
    | "ingest-message"
    | "list-open-needs"
    | "add-audit-event"
    | "list-audit-events",
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

function requireExplicitApproval(name: string, payload: { approval?: { approved?: boolean }; approved?: boolean }) {
  if (payload.approval?.approved === true || payload.approved === true) return;
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
    const message = error instanceof Error ? error.message : String(error);
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
    const message = error instanceof Error ? error.message : String(error);
    return `${localSummary} Live Smartlead summary unavailable: ${message}`;
  }
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
    console.error(error);
    process.exit(1);
  });
}
