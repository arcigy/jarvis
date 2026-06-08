import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer, type Socket } from "node:net";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { matchLocalIdentity } from "../src/automation-system/identity-matching.ts";
import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";
import { draftContractIntake, parseJsonObject } from "../src/automation-system/contract-intake-draft.ts";
import { runIntegrationDiagnostics } from "../src/automation-system/diagnostics.ts";
import { getIntegrationHealth } from "../src/automation-system/env.ts";
import { buildClientReplyPrompt, generateGeminiText } from "../src/automation-system/gemini.ts";
import { defaultGmailSyncQuery, listRecentGmailMessageEvents, parseFromHeader, refreshGoogleAccessToken } from "../src/automation-system/gmail.ts";
import { appendRowsToGoogleSheet, discoverLeads, searchGooglePlaces, searchSerper } from "../src/automation-system/lead-discovery.ts";
import {
  buildContractGenerationCommand,
  getColdOutreachMcpAnswer,
  identifyEmailMcpAnswer,
  listJarvisMcpTools,
  localStateWriteToolNames,
} from "../src/automation-system/mcp-tools.ts";
import { buildSmartleadOutreachBrief, getSmartleadCampaignStatus, getSmartleadOutreachBrief } from "../src/automation-system/smartlead.ts";
import {
  containsWakeWord,
  createJarvisVoiceSession,
  handleJarvisVoiceEvent,
} from "../src/automation-system/jarvis-voice.ts";
import { resolveJarvisIntentFromTranscript } from "../src/automation-system/jarvis-intents.ts";
import { buildProductionReadinessReport } from "../src/automation-system/production-readiness.ts";
import { buildOperatorBriefing } from "../src/automation-system/operator-briefing.ts";
import { buildRemoteMcpConnectionPack } from "../src/automation-system/remote-mcp-pack.ts";
import { runRemoteMcpSmoke } from "../src/automation-system/remote-mcp-smoke.ts";

test("MCP tools expose the requested automation surface", () => {
  const names = listJarvisMcpTools().map((tool) => tool.name);
  assert.deepEqual(names, [
    "arcigy.generate_contract_documents",
    "arcigy.draft_contract_intake",
    "arcigy.get_cold_outreach_brief",
    "arcigy.get_cold_outreach_brief_from_db",
    "arcigy.add_cold_outreach_event",
    "arcigy.get_prepared_outreach_replies",
    "arcigy.approve_prepared_outreach_reply",
    "arcigy.identify_email",
    "arcigy.upsert_local_person",
    "arcigy.add_client_need_signal",
    "arcigy.ingest_client_message",
    "arcigy.get_client_need_alerts",
    "arcigy.jarvis_voice_event",
    "arcigy.get_system_health",
    "arcigy.run_integration_diagnostics",
    "arcigy.get_production_readiness",
    "arcigy.get_remote_mcp_pack",
    "arcigy.run_remote_mcp_smoke",
    "arcigy.get_operator_briefing",
    "arcigy.generate_ai_reply",
    "arcigy.sync_gmail_recent_messages",
    "arcigy.get_smartlead_campaign_status",
    "arcigy.get_smartlead_outreach_brief",
    "arcigy.search_serper",
    "arcigy.search_google_places",
    "arcigy.discover_leads",
    "arcigy.append_leads_to_google_sheet",
  ]);
  assert.ok(localStateWriteToolNames.has("arcigy.sync_gmail_recent_messages"));
  assert.ok(localStateWriteToolNames.has("arcigy.ingest_client_message"));
  assert.equal(localStateWriteToolNames.has("arcigy.generate_contract_documents"), false);
});

test("production readiness report returns blockers and next actions without secrets", async () => {
  const report = await buildProductionReadinessReport({
    live: false,
  }, {
    GEMINI_API_KEY: "gemini",
    REDIS_URL: "redis://default:PASSWORD@example.com:6379",
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.mcp.toolCount, 27);
  assert.ok(report.blockers.some((blocker) => blocker.key === "redis" && blocker.severity === "warning"));
  assert.ok(report.nextActions.some((action) => action.includes("REDIS_URL")));
  assert.ok(report.fixGuide.some((step) => step.id === "redis-real-password" && step.envKeys.includes("REDIS_URL")));
  assert.ok(report.fixGuide.every((step) => step.validationCommand.includes("doctor")));
  assert.ok(report.attentionQueue.some((item) => item.key === "redis" && item.source === "configuration"));
  assert.ok(report.attentionQueue.every((item) => item.validationCommand.includes("doctor")));
  assert.ok(report.launchChecklist.some((item) => item.id === "required-integrations" && item.status === "blocked"));
  assert.ok(report.launchChecklist.some((item) => item.id === "approval-locks" && item.status === "ready"));
  assert.equal(JSON.stringify(report).includes("PASSWORD"), false);
});

test("remote MCP smoke checks every response for bearer token leaks", async () => {
  const token = "smoke-secret-token";
  const tools = listJarvisMcpTools().map((tool) => ({ name: tool.name }));
  const fetchImpl = async (target: string | URL, init?: RequestInit) => {
    const url = String(target);
    if (url.endsWith("/.well-known/arcigy-jarvis.json")) {
      return responseJson({
        tools,
        auth: { header: "Authorization: Bearer <JARVIS_WEB_TOKEN>" },
        toolPolicy: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
      });
    }
    if (url.includes("/api/remote-mcp-pack")) {
      return responseJson({
        auth: { tokenValueReturned: false },
        handoff: {
          connectionPackUrl: "https://jarvis.example/api/remote-mcp-pack?includeReadiness=true&live=true",
          requiredProof: [{ key: "manifest" }, { key: "connection-pack" }, { key: "remote-smoke" }],
          agentFirstSteps: ["Run smokeTestUrl and require status=ready before using MCP tools.", "Call arcigy.get_operator_briefing before proposing work."],
        },
        tools: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
        quickStartCalls: [
          {
            tool: "arcigy.identify_email",
            approvalRequired: false,
            body: { email: "client@example.com" },
          },
          {
            tool: "arcigy.get_client_need_alerts",
            approvalRequired: false,
            body: { status: "new", limit: 10 },
          },
          {
            tool: "arcigy.draft_contract_intake",
            approvalRequired: false,
            body: { brief: "Klient potrebuje webovu aplikaciu pre lead intake, reporting a klientsku evidenciu." },
          },
          {
            tool: "arcigy.generate_contract_documents",
            approvalRequired: true,
            body: {
              approval: { approved: true },
              intake: {
                client: { businessName: "Demo", email: "demo@example.com" },
                project: { includedModules: ["Portal"] },
                pricing: { monthlyFee: 100 },
              },
            },
          },
        ],
      });
    }
    if (url.endsWith("/api/mcp/arcigy.get_system_health")) {
      assert.equal((init?.headers as Record<string, string>).authorization, `Bearer ${token}`);
      return responseJson({ result: { integrations: [] } });
    }
    if (url.endsWith("/api/mcp/arcigy.generate_contract_documents")) {
      return responseJson({ error: `token leaked ${token}` }, 409);
    }
    return responseJson({ error: "unexpected URL" }, 404);
  };

  const report = await runRemoteMcpSmoke({ baseUrl: "https://jarvis.example", bearerToken: token, fetchImpl: fetchImpl as typeof fetch });

  assert.equal(report.status, "blocked");
  assert.ok(report.checks.some((check) => check.key === "secret-redaction" && check.status === "blocked"));
});

test("remote MCP smoke requires the handoff proof runbook", async () => {
  const tools = listJarvisMcpTools().map((tool) => ({ name: tool.name }));
  const fetchImpl = async (target: string | URL) => {
    const url = String(target);
    if (url.endsWith("/.well-known/arcigy-jarvis.json")) {
      return responseJson({
        tools,
        auth: { header: "Authorization: Bearer <JARVIS_WEB_TOKEN>" },
        toolPolicy: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
      });
    }
    if (url.includes("/api/remote-mcp-pack")) {
      return responseJson({
        auth: { tokenValueReturned: false },
        tools: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
        quickStartCalls: [
          {
            tool: "arcigy.identify_email",
            approvalRequired: false,
            body: { email: "client@example.com" },
          },
          {
            tool: "arcigy.get_client_need_alerts",
            approvalRequired: false,
            body: { status: "new", limit: 10 },
          },
          {
            tool: "arcigy.draft_contract_intake",
            approvalRequired: false,
            body: { brief: "Klient potrebuje webovu aplikaciu pre lead intake, reporting a klientsku evidenciu." },
          },
          {
            tool: "arcigy.generate_contract_documents",
            approvalRequired: true,
            body: {
              approval: { approved: true },
              intake: {
                client: { businessName: "Demo", email: "demo@example.com" },
                project: { includedModules: ["Portal"] },
                pricing: { monthlyFee: 100 },
              },
            },
          },
        ],
      });
    }
    if (url.endsWith("/api/mcp/arcigy.get_system_health")) return responseJson({ result: { integrations: [] } });
    if (url.endsWith("/api/mcp/arcigy.generate_contract_documents")) return responseJson({ error: "approval required" }, 409);
    return responseJson({ error: "unexpected URL" }, 404);
  };

  const report = await runRemoteMcpSmoke({ baseUrl: "https://jarvis.example", fetchImpl: fetchImpl as typeof fetch });

  assert.equal(report.status, "blocked");
  assert.ok(report.checks.some((check) => check.key === "pack-handoff-proof" && check.status === "blocked"));
});

test("remote MCP smoke requires the contract draft quick-start", async () => {
  const tools = listJarvisMcpTools().map((tool) => ({ name: tool.name }));
  const fetchImpl = async (target: string | URL) => {
    const url = String(target);
    if (url.endsWith("/.well-known/arcigy-jarvis.json")) {
      return responseJson({
        tools,
        auth: { header: "Authorization: Bearer <JARVIS_WEB_TOKEN>" },
        toolPolicy: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
      });
    }
    if (url.includes("/api/remote-mcp-pack")) {
      return responseJson({
        auth: { tokenValueReturned: false },
        handoff: {
          connectionPackUrl: "https://jarvis.example/api/remote-mcp-pack?includeReadiness=true&live=true",
          requiredProof: [{ key: "manifest" }, { key: "connection-pack" }, { key: "remote-smoke" }],
          agentFirstSteps: ["Run smokeTestUrl and require status=ready before using MCP tools.", "Call arcigy.get_operator_briefing before proposing work."],
        },
        tools: {
          localStateWrite: ["arcigy.sync_gmail_recent_messages"],
          readOnlyOrDraft: ["arcigy.generate_ai_reply"],
        },
        quickStartCalls: [
          {
            tool: "arcigy.identify_email",
            approvalRequired: false,
            body: { email: "client@example.com" },
          },
          {
            tool: "arcigy.get_client_need_alerts",
            approvalRequired: false,
            body: { status: "new", limit: 10 },
          },
          {
            tool: "arcigy.generate_contract_documents",
            approvalRequired: true,
            body: {
              approval: { approved: true },
              intake: {
                client: { businessName: "Demo", email: "demo@example.com" },
                project: { includedModules: ["Portal"] },
                pricing: { monthlyFee: 100 },
              },
            },
          },
        ],
      });
    }
    if (url.endsWith("/api/mcp/arcigy.get_system_health")) return responseJson({ result: { integrations: [] } });
    if (url.endsWith("/api/mcp/arcigy.generate_contract_documents")) return responseJson({ error: "approval required" }, 409);
    return responseJson({ error: "unexpected URL" }, 404);
  };

  const report = await runRemoteMcpSmoke({ baseUrl: "https://jarvis.example", fetchImpl: fetchImpl as typeof fetch });

  assert.equal(report.status, "blocked");
  assert.ok(report.checks.some((check) => check.key === "pack-contract-draft-quick-start" && check.status === "blocked"));
});

test("production readiness treats unused Redis as non-blocking advisory", async () => {
  const report = await buildProductionReadinessReport(
    { live: false },
    {
      GEMINI_API_KEY: "gemini",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
      GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-2",
      GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-3",
      GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-4",
      SMARTLEAD_API_KEY: "smartlead",
      DATABASE_URL: "postgres://postgres:secret@example.com:5432/db",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
      GOOGLE_SHEET_ID: "sheet",
      GOOGLE_MAPS_API_KEY: "maps",
      SERPER_API_KEY: "serper",
    }
  );

  assert.equal(report.status, "attention");
  assert.ok(report.blockers.some((blocker) => blocker.key === "redis" && blocker.severity === "warning"));
  assert.ok(report.attentionQueue.some((item) => item.key === "redis" && item.severity === "warning"));
  assert.ok(report.launchChecklist.some((item) => item.id === "optional-advisories" && item.status === "attention"));
  assert.match(report.summary, /non-blocking warning/);
});

test("remote MCP connection pack includes secret-safe readiness attention queue", async () => {
  const pack = await buildRemoteMcpConnectionPack(
    { baseUrl: "https://jarvis.example", live: false, includeReadiness: true },
    {
      GEMINI_API_KEY: "gemini",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
    }
  );

  assert.equal(pack.readiness?.status, "blocked");
  assert.ok(pack.readiness?.attentionQueue.some((item) => item.key === "redis"));
  assert.ok(pack.readiness?.launchChecklist.some((item) => item.id === "mcp-registry" && item.status === "ready"));
  assert.ok(pack.readiness?.fixGuide.some((step) => step.id === "redis-real-password"));
  assert.equal(JSON.stringify(pack).includes("PASSWORD"), false);
});

test("operator briefing combines readiness, outreach, client needs, and approvals", () => {
  const briefing = buildOperatorBriefing({
    readinessStatus: "blocked",
    readinessSummary: "Production needs attention.",
    readinessAttentionQueue: [
      {
        key: "redis",
        severity: "warning",
        title: "Replace Redis placeholder password",
        source: "configuration",
        nextAction: "Replace REDIS_URL.",
      },
    ],
    coldOutreachSummary: "Za dnes sme napisali 10 ludom.",
    liveSyncSummary: "Gmail checked 4 account(s), fetched 8 message(s), created 6 new record(s), skipped 2 duplicate(s), raised 2 alert(s).",
    openClientNeedCount: 2,
    clientNeedHighlights: [
      {
        person: { primaryEmail: "client@example.com", displayName: "Demo Client", companyName: "Demo s.r.o." },
        needSignal: { summary: "potrebuje upravit onboarding automatizaciu", occurredAt: "2026-06-08T09:00:00Z" },
      },
    ],
    preparedReplyCount: 1,
    nextActions: ["Replace REDIS_URL."],
  });

  assert.match(briefing.speechText, /Jarvis briefing/);
  assert.match(briefing.speechText, /Production attention queue: 1 item/);
  assert.match(briefing.sections.readinessAttention ?? "", /redis: Replace Redis placeholder password/);
  assert.match(briefing.speechText, /Cold outreach/);
  assert.match(briefing.speechText, /Live sync/);
  assert.match(briefing.speechText, /Klientske poziadavky: 2/);
  assert.match(briefing.sections.clientNeeds, /Demo Client: potrebuje upravit onboarding automatizaciu/);
  assert.match(briefing.speechText, /Pripravene odpovede: 1/);
  assert.equal(briefing.sections.nextAction, "Najblizsi krok: Replace REDIS_URL.");
});

test("contract intake draft parses Gemini JSON output", async () => {
  const fetchImpl = async () =>
    responseJson({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "```json\n{\"client\":{\"businessName\":\"ACME\"},\"project\":{\"name\":\"Portal\"},\"pricing\":{\"implementationFeeEur\":1000}}\n```",
              },
            ],
          },
        },
      ],
    });

  const intake = await draftContractIntake(
    { brief: "ACME wants a portal.", baseIntake: { contacts: { arcigyAuthorizedContact: "Arcigy" } } },
    { GEMINI_API_KEY: "gemini-key" },
    fetchImpl as typeof fetch
  );
  assert.deepEqual((intake.client as { businessName: string }).businessName, "ACME");
  assert.equal(parseJsonObject("{\"ok\":true}").ok, true);
});

test("contract generation command points to the JSON form generator", () => {
  const command = buildContractGenerationCommand("docs/contracts/examples/sample-intake.json");
  assert.equal(command.command, "python");
  assert.deepEqual(command.args, [
    "scripts/generate_contract_documents.py",
    "--input",
    "docs/contracts/examples/sample-intake.json",
    "--output-dir",
    "generated/contracts",
  ]);
});

test("contract generation rejects non-json input", () => {
  assert.throws(() => buildContractGenerationCommand("contract.docx"), /JSON/);
});

test("contract generator rejects unresolved intake placeholders", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-contract-placeholder-"));
  const python = process.env.JARVIS_PYTHON || "python";
  const intake = JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8"));
  intake.client.businessName = "[doplnit]";
  intake.project.outputs.push("TODO");
  intake.dates.frameworkAgreementDate = "[dátum]";
  const result = spawnSync(
    python,
    ["scripts/generate_contract_documents.py", "--payload", JSON.stringify(intake), "--output-dir", dir],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unresolved contract intake placeholder/);
  assert.match(result.stderr, /\$\.client\.businessName/);
  assert.match(result.stderr, /\$\.project\.outputs/);
  assert.match(result.stderr, /\$\.dates\.frameworkAgreementDate/);
  assert.equal(existsSync(join(dir, "generation-manifest.json")), false);
});

test("contract generator creates core documents, extra attachments, and manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-contracts-"));
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(
    python,
    [
      "scripts/generate_contract_documents.py",
      "--input",
      "docs/contracts/examples/sample-intake.json",
      "--output-dir",
      dir,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const manifestPath = join(dir, "generation-manifest.json");
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.client, "Test Klient s. r. o.");
  assert.equal(manifest.generatedFiles.length, 3);
  assert.ok(manifest.generatedFiles.some((path: string) => path.endsWith("doplnkova-priloha-servisne-pravidla.docx")));
});

test("contract generator accepts inline JSON payload", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-contract-payload-"));
  const python = process.env.JARVIS_PYTHON || "python";
  const payload = readFileSync("docs/contracts/examples/sample-intake.json", "utf-8");
  const result = spawnSync(
    python,
    ["scripts/generate_contract_documents.py", "--payload", payload, "--output-dir", dir],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(dir, "generation-manifest.json"), "utf-8"));
  assert.equal(manifest.input, "inline-payload");
  assert.equal(manifest.generatedFiles.length, 3);
});

test("cold outreach answer uses the requested Slovak style", () => {
  const answer = getColdOutreachMcpAnswer({
    periodLabel: "posledných 7 dní",
    contacted: 100,
    opened: 51,
    replied: 12,
    positiveReplies: 4,
    preparedPositiveReplyCount: 4,
    pendingApprovalCount: 4,
  });

  assert.match(answer, /napísali 100 ľuďom/);
  assert.match(answer, /51% si email otvorilo/);
  assert.match(answer, /12 ľudí odpísalo, z toho 4 pozitívne/);
  assert.match(answer, /pošlem ich až na tvoje potvrdenie/);
});

test("runtime integration health reports missing secrets without throwing", () => {
  const health = getIntegrationHealth({
    GEMINI_API_KEY: "dummy",
    SMARTLEAD_API_KEY: "smartlead-key",
  });
  assert.equal(health.find((item) => item.key === "gemini")?.configured, false);
  assert.equal(health.find((item) => item.key === "smartlead")?.configured, true);
});

test("runtime integration health rejects placeholder URL credentials", () => {
  const health = getIntegrationHealth({
    DATABASE_URL: "postgres://postgres:PASSWORD@example.com:5432/db",
    REDIS_URL: "redis://default:PASSWORD@example.com:6379",
  });

  assert.deepEqual(health.find((item) => item.key === "postgres")?.missing, ["DATABASE_URL contains a placeholder credential"]);
  assert.deepEqual(health.find((item) => item.key === "redis")?.missing, ["REDIS_URL contains a placeholder credential"]);
  assert.equal(health.find((item) => item.key === "redis")?.requiredForProduction, false);
});

test("Gemini reply helper calls generateContent and extracts text", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return responseJson({
      candidates: [{ content: { parts: [{ text: "Návrh odpovede" }] } }],
    });
  };

  const result = await generateGeminiText(
    buildClientReplyPrompt({ clientName: "ACME", message: "Potrebujem nový report." }),
    { GEMINI_API_KEY: "gemini-key" },
    fetchImpl as typeof fetch
  );

  assert.equal(result.model, "gemini-2.5-flash");
  assert.equal(result.text, "Návrh odpovede");
  assert.match(calls[0].url, /generateContent/);
});

test("AI safety redacts secrets before Gemini prompts and after model output", async () => {
  const googleKey = "AI" + "za" + "S" + "y" + "A".repeat(32);
  const refreshToken = "1" + "//" + "A".repeat(34);
  const smartleadKey = ["aaaaaaaa", "bbbb", "cccc", "dddd", "eeeeeeeeeeee"].join("-") + "_abcdefgh";
  const databaseUrl = "postgres://postgres:super-private@example.com:5432/db";
  const rawMessage = `Client sent ${googleKey} and ${refreshToken} and ${smartleadKey} and ${databaseUrl}`;
  const calls: Array<{ body: { contents?: Array<{ parts?: Array<{ text?: string }> }>; systemInstruction?: { parts?: Array<{ text?: string }> } } }> = [];
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return responseJson({
      candidates: [{ content: { parts: [{ text: `Do not echo ${googleKey}` }] } }],
    });
  };

  const result = await generateGeminiText(buildClientReplyPrompt({ message: rawMessage }), { GEMINI_API_KEY: "gemini-key" }, fetchImpl as typeof fetch);
  const sentBody = JSON.stringify(calls[0].body);

  assert.equal(sentBody.includes(googleKey), false);
  assert.equal(sentBody.includes(refreshToken), false);
  assert.equal(sentBody.includes(smartleadKey), false);
  assert.equal(sentBody.includes("super-private"), false);
  assert.match(sentBody, /Arcigy Jarvis AI safety rules/);
  assert.equal(result.text.includes(googleKey), false);
  assert.match(result.text, /\[redacted-google-api-key\]/);
  assert.match(redactSensitiveText(rawMessage), /\[redacted-google-refresh-token\]/);
});

test("Gemini helper retries transient failures and falls back to the secondary model", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    if (calls.length <= 3) {
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
    return responseJson({
      candidates: [{ content: { parts: [{ text: "OK fallback" }] } }],
    });
  };

  const result = await generateGeminiText(
    { prompt: "Return OK.", temperature: 0 },
    {
      GEMINI_API_KEY: "gemini-key",
      GEMINI_MAX_RETRIES: "1",
      GEMINI_RETRY_BASE_MS: "0",
      GEMINI_FALLBACK_MODEL: "gemini-fallback",
    },
    fetchImpl as typeof fetch
  );

  assert.equal(result.model, "gemini-fallback");
  assert.equal(result.text, "OK fallback");
  assert.equal(result.attempts, 4);
  assert.equal(calls.filter((url) => url.includes("gemini-2.5-flash")).length, 2);
  assert.equal(calls.filter((url) => url.includes("gemini-fallback")).length, 2);
});

test("Gmail helper refreshes OAuth token and normalizes message events", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com")) return responseJson({ access_token: "access-token" });
    if (target.includes("/messages?")) return responseJson({ messages: [{ id: "m1", threadId: "t1" }] });
    return responseJson({
      id: "m1",
      threadId: "t1",
      snippet: "Prosím, pošli report.",
      internalDate: "1780860000000",
      payload: {
        headers: [
          { name: "From", value: "Client <client@example.com>" },
          { name: "Subject", value: "Report" },
        ],
      },
    });
  };

  const events = await listRecentGmailMessageEvents(
    { envKey: "GMAIL_REFRESH_TOKEN_TEST", label: "test", refreshToken: "refresh" },
    { query: "newer_than:1d", maxResults: 1 },
    { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" },
    fetchImpl as typeof fetch
  );

  assert.equal(parseFromHeader("Client <client@example.com>").email, "client@example.com");
  assert.equal(events[0].fromEmail, "client@example.com");
  assert.equal(events[0].subject, "Report");
});

test("Gmail helper defaults to inbox sync query", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("oauth2.googleapis.com")) return responseJson({ access_token: "access-token" });
    if (target.includes("/messages?")) return responseJson({ messages: [] });
    throw new Error(`Unexpected URL: ${target}`);
  };

  await listRecentGmailMessageEvents(
    { envKey: "GMAIL_REFRESH_TOKEN_TEST", label: "test", refreshToken: "refresh" },
    {},
    { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" },
    fetchImpl as typeof fetch
  );

  const listUrl = calls.find((url) => url.includes("/messages?")) ?? "";
  assert.equal(defaultGmailSyncQuery, "in:inbox newer_than:7d");
  assert.equal(new URL(listUrl).searchParams.get("q"), defaultGmailSyncQuery);
});

test("Gmail OAuth refresh falls back to the secondary Google token endpoint", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("oauth2.googleapis.com")) throw new Error("fetch failed");
    if (target.includes("www.googleapis.com/oauth2/v4/token")) return responseJson({ access_token: "fallback-access-token" });
    throw new Error(`Unexpected URL: ${target}`);
  };

  const accessToken = await refreshGoogleAccessToken(
    "refresh",
    { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" },
    fetchImpl as typeof fetch
  );

  assert.equal(accessToken, "fallback-access-token");
  assert.deepEqual(calls, ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v4/token"]);
});

test("Smartlead helper fetches campaign statistics", async () => {
  const seenUrls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    seenUrls.push(String(url));
    return responseJson({ sent_count: 10 });
  };

  const status = await getSmartleadCampaignStatus(
    { campaignId: "123" },
    { SMARTLEAD_API_KEY: "smartlead-key" },
    fetchImpl as typeof fetch
  );

  assert.equal(status.campaignId, "123");
  assert.match(seenUrls[0], /campaigns\/123\/statistics/);
  assert.match(seenUrls[0], /api_key=/);
});

test("Smartlead outreach brief normalizes campaign statistics into Jarvis style", async () => {
  const fetchImpl = async () =>
    responseJson({
      sent_count: "100",
      unique_open_count: 51,
      reply_count: 12,
      positive_reply_count: 4,
    });

  const brief = await getSmartleadOutreachBrief(
    { campaignId: "123", periodLabel: "poslednych 7 dni", preparedPositiveReplyCount: 4, pendingApprovalCount: 2 },
    { SMARTLEAD_API_KEY: "smartlead-key" },
    fetchImpl as typeof fetch
  );

  assert.equal(brief.metrics.contacted, 100);
  assert.equal(brief.metrics.openRate, 51);
  assert.equal(brief.metrics.replyRate, 12);
  assert.equal(brief.metrics.positiveReplies, 4);
  assert.match(brief.summary, /cez Smartlead napisali 100 ludom/);
  assert.match(brief.summary, /12 ludi odpisalo, z toho 4 pozitivne/);
  assert.match(brief.summary, /poslem ich az na tvoje potvrdenie/);
  assert.match(brief.summary, /Caka 2 odpovede na schvalenie/);
});

test("Smartlead outreach brief uses singular reply labels", () => {
  const brief = buildSmartleadOutreachBrief({
    campaignId: "123",
    campaignIds: ["123"],
    campaignCount: 1,
    periodLabel: "dnes",
    statistics: { sent_count: 5, open_count: 3, reply_count: 1, positive_reply_count: 1 },
    preparedPositiveReplyCount: 1,
    pendingApprovalCount: 1,
  });

  assert.match(brief.summary, /Pripravil som ti 1 odpoved na pozitivne reakcie/);
  assert.match(brief.summary, /Caka 1 odpoved na schvalenie/);
});

test("Smartlead outreach brief aggregates campaigns when campaignId is omitted", async () => {
  const seenUrls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    seenUrls.push(target);
    if (target.includes("/campaigns/?")) {
      return responseJson([
        { id: 1, name: "Founders" },
        { id: 2, name: "Agencies" },
        { id: 3, name: "Skipped" },
      ]);
    }
    if (target.includes("/campaigns/1/statistics")) {
      return responseJson({
        total_stats: 30,
        data: [
          { open_count: 1, reply_time: "2026-06-03T08:00:00Z", lead_category: "Interested" },
          { open_count: 2, reply_time: null, lead_category: null },
        ],
      });
    }
    if (target.includes("/campaigns/2/statistics")) {
      return responseJson({
        total_stats: 70,
        data: [
          { open_count: 35, reply_time: "2026-06-03T09:00:00Z", lead_category: "Meeting booked" },
          { open_count: 12, reply_time: "2026-06-03T10:00:00Z", lead_category: null },
        ],
      });
    }
    throw new Error(`Unexpected Smartlead URL: ${target}`);
  };

  const brief = await getSmartleadOutreachBrief(
    { periodLabel: "poslednych 7 dni", maxCampaigns: 2 },
    { SMARTLEAD_API_KEY: "smartlead-key" },
    fetchImpl as typeof fetch
  );

  assert.equal(brief.campaignId, "all");
  assert.deepEqual(brief.campaignIds, ["1", "2"]);
  assert.equal(brief.campaignCount, 2);
  assert.equal(brief.metrics.contacted, 100);
  assert.equal(brief.metrics.opened, 50);
  assert.equal(brief.metrics.replied, 3);
  assert.equal(brief.metrics.positiveReplies, 2);
  assert.match(brief.summary, /100 ludom v 2 kampaniach/);
  assert.equal(seenUrls.some((url) => url.includes("/campaigns/3/statistics")), false);
});

test("Smartlead outreach brief does not invent positive replies when missing", () => {
  const brief = buildSmartleadOutreachBrief({
    campaignId: "123",
    campaignIds: ["123"],
    periodLabel: "dnes",
    statistics: { total_sent: 20, opened_count: 10, replied_count: 3 },
  });

  assert.equal(brief.metrics.positiveReplies, null);
  assert.match(brief.summary, /Smartlead v tomto reporte neposlal/);
  assert.ok(brief.notes.some((note) => note.includes("positive reply field")));
});

test("lead discovery helpers call Serper, Google Places, and Google Sheets", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("oauth2.googleapis.com")) return responseJson({ access_token: "access-token" });
    if (target.includes("google.serper.dev")) {
      return responseJson({ organic: [{ title: "ACME", link: "https://acme.example" }] });
    }
    if (target.includes("places.googleapis.com")) {
      return responseJson({
        places: [
          {
            displayName: { text: "ACME Office" },
            formattedAddress: "Bratislava",
            websiteUri: "https://office.example",
          },
        ],
      });
    }
    if (target.includes("sheets.googleapis.com")) return responseJson({ updates: { updatedRows: 1 } });
    throw new Error(`Unexpected URL: ${target}`);
  };

  await searchSerper({ query: "automation agencies" }, { SERPER_API_KEY: "serper-key" }, fetchImpl as typeof fetch);
  await searchGooglePlaces({ query: "automation agency Bratislava" }, { GOOGLE_MAPS_API_KEY: "maps-key" }, fetchImpl as typeof fetch);
  const discovered = await discoverLeads(
    { query: "automation agencies", maxResults: 5 },
    { SERPER_API_KEY: "serper-key", GOOGLE_MAPS_API_KEY: "maps-key" },
    fetchImpl as typeof fetch
  );
  const append = await appendRowsToGoogleSheet(
    { rows: [["ACME", "https://acme.example"]] },
    {
      GOOGLE_SHEET_ID: "sheet-id",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
    },
    fetchImpl as typeof fetch
  );

  assert.equal(discovered.leads.length, 2);
  assert.deepEqual(discovered.providerStatus.map((provider) => provider.status), ["ready", "ready"]);
  assert.deepEqual(append, { updates: { updatedRows: 1 } });
  assert.ok(calls.some((url) => url.includes("values/Leads!A1:append")));
});

test("lead discovery reports provider status and falls back when Serper credits are exhausted", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("google.serper.dev")) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: "Not enough credits", statusCode: 400 }),
      } as Response;
    }
    if (target.includes("places.googleapis.com")) {
      return responseJson({
        places: [
          {
            displayName: { text: "Fallback Place" },
            formattedAddress: "Bratislava",
            websiteUri: "https://fallback-place.example",
          },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const discovered = await discoverLeads(
    { query: "automation agency Bratislava", maxResults: 5 },
    {
      SERPER_API_KEY: "spent-key",
      SERPER_API_KEY_2: "spent-key-2",
      GOOGLE_MAPS_API_KEY: "maps-key",
    },
    fetchImpl as typeof fetch
  );

  assert.equal(discovered.leads.length, 1);
  assert.deepEqual(discovered.sources, ["google_places"]);
  assert.equal(discovered.providerStatus.find((provider) => provider.source === "serper")?.status, "failed");
  assert.equal(discovered.providerStatus.find((provider) => provider.source === "google_places")?.status, "ready");
  assert.equal(JSON.stringify(discovered).includes("spent-key"), false);
});

test("integration diagnostics run live read-only checks with mocked providers", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("generativelanguage.googleapis.com")) {
      return responseJson({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    }
    if (target.includes("oauth2.googleapis.com")) return responseJson({ access_token: "access-token" });
    if (target.includes("server.smartlead.ai")) return responseJson([{ id: 1, name: "Campaign" }]);
    if (target.includes("places.googleapis.com")) return responseJson({ places: [] });
    if (target.includes("google.serper.dev")) return responseJson({ organic: [] });
    if (target.includes("sheets.googleapis.com")) return responseJson({ spreadsheetId: "sheet-id" });
    throw new Error(`Unexpected URL: ${target}`);
  };

  const postgres = await startTcpServer();
  const redis = await startTcpServer((socket) => {
    socket.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (text.includes("AUTH")) socket.write("+OK\r\n");
      if (text.includes("PING")) socket.write("+PONG\r\n");
    });
  });

  try {
    const result = await runIntegrationDiagnostics(
      { live: true, dbPath: "missing.db" },
      {
        GEMINI_API_KEY: "gemini",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
        GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-2",
        GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-3",
        GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-4",
        SMARTLEAD_API_KEY: "smartlead",
        DATABASE_URL: `postgres://user:pass@127.0.0.1:${postgres.port}/db`,
        REDIS_URL: `redis://default:secret@127.0.0.1:${redis.port}`,
        GOOGLE_SHEET_ID: "sheet-id",
        GOOGLE_MAPS_API_KEY: "maps",
        SERPER_API_KEY: "serper",
      },
      fetchImpl as typeof fetch
    );

    assert.equal(result.live, true);
    assert.equal(result.checks.find((check) => check.key === "gemini")?.status, "ready");
    assert.equal(result.checks.find((check) => check.key === "postgres")?.status, "ready");
    assert.equal(result.checks.find((check) => check.key === "redis")?.status, "ready");
    assert.equal(result.checks.find((check) => check.key === "serper")?.status, "ready");
    assert.ok(calls.some((url) => url.includes("sheets.googleapis.com")));
  } finally {
    await postgres.close();
    await redis.close();
  }
});

test("integration diagnostics retry transient fetch failures", async () => {
  let geminiAttempts = 0;
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("generativelanguage.googleapis.com")) {
      geminiAttempts += 1;
      if (geminiAttempts === 1) throw new Error("fetch failed");
      return responseJson({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const diagnostics = await runIntegrationDiagnostics({ live: true }, { GEMINI_API_KEY: "gemini" }, fetchImpl as typeof fetch);
  const gemini = diagnostics.checks.find((check) => check.key === "gemini");

  assert.equal(geminiAttempts, 2);
  assert.equal(gemini?.status, "ready");
});

test("production readiness treats Serper exhaustion as advisory when other lead provider works", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("generativelanguage.googleapis.com")) {
      return responseJson({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    }
    if (target.includes("oauth2.googleapis.com")) return responseJson({ access_token: "access-token" });
    if (target.includes("server.smartlead.ai")) return responseJson([{ id: 1, name: "Campaign" }]);
    if (target.includes("places.googleapis.com")) return responseJson({ places: [] });
    if (target.includes("google.serper.dev")) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: "Not enough credits", statusCode: 400 }),
      } as Response;
    }
    if (target.includes("sheets.googleapis.com")) return responseJson({ spreadsheetId: "sheet-id" });
    throw new Error(`Unexpected URL: ${target}`);
  };

  const postgres = await startTcpServer();
  const redis = await startTcpServer((socket) => {
    socket.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (text.includes("AUTH")) socket.write("+OK\r\n");
      if (text.includes("PING")) socket.write("+PONG\r\n");
    });
  });

  try {
    const report = await buildProductionReadinessReport(
      { live: true, dbPath: "missing.db" },
      {
        GEMINI_API_KEY: "gemini",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
        GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-2",
        GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-3",
        GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-4",
        SMARTLEAD_API_KEY: "smartlead",
        DATABASE_URL: `postgres://user:pass@127.0.0.1:${postgres.port}/db`,
        REDIS_URL: `redis://default:secret@127.0.0.1:${redis.port}`,
        GOOGLE_SHEET_ID: "sheet-id",
        GOOGLE_MAPS_API_KEY: "maps",
        SERPER_API_KEY: "spent-serper",
        SERPER_API_KEY_2: "spent-serper-2",
      },
      fetchImpl as typeof fetch
    );

    assert.equal(report.status, "attention");
    assert.equal(report.blockers.find((blocker) => blocker.key === "serper")?.severity, "warning");
    assert.equal(report.attentionQueue.find((item) => item.key === "serper")?.source, "live-diagnostic");
    assert.ok(report.launchChecklist.some((item) => item.id === "live-diagnostics" && item.status === "attention"));
    assert.match(report.summary, /non-blocking warning/);
    assert.equal(JSON.stringify(report).includes("spent-serper"), false);
  } finally {
    await postgres.close();
    await redis.close();
  }
});

test("Serper search falls back to the secondary API key when credits are exhausted", async () => {
  const seenKeys: string[] = [];
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    seenKeys.push(headers["x-api-key"]);
    if (seenKeys.length === 1) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: "Not enough credits" }),
      } as Response;
    }
    return responseJson({ organic: [{ title: "Fallback result", link: "https://fallback.example" }] });
  };

  const result = await searchSerper(
    { query: "automation agencies" },
    { SERPER_API_KEY: "spent-key", SERPER_API_KEY_2: "fallback-key" },
    fetchImpl as typeof fetch
  );

  assert.deepEqual(seenKeys, ["spent-key", "fallback-key"]);
  assert.equal((result as { organic: unknown[] }).organic.length, 1);
});

test("Serper search reports exhausted fallback attempts without leaking keys", async () => {
  const fetchImpl = async () =>
    ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "Not enough credits" }),
    }) as Response;

  await assert.rejects(
    () =>
      searchSerper(
        { query: "automation agencies" },
        { SERPER_API_KEY: "spent-key", SERPER_API_KEY_2: "fallback-key" },
        fetchImpl as typeof fetch
      ),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /key 2\/2/);
      assert.match(message, /Not enough credits/);
      assert.equal(message.includes("spent-key"), false);
      assert.equal(message.includes("fallback-key"), false);
      return true;
    }
  );
});

test("identity matching prefers exact email and returns open client needs", () => {
  const answer = identifyEmailMcpAnswer(
    "CEO@ACME.com",
    [
      {
        id: "p1",
        kind: "client",
        primaryEmail: "ceo@acme.com",
        displayName: "ACME CEO",
        status: "active",
      },
    ],
    [
      {
        id: "n1",
        personId: "p1",
        source: "email",
        signalType: "request",
        summary: "chce upraviť onboarding automatizáciu",
        status: "new",
        confidence: 0.9,
        occurredAt: "2026-06-07T10:00:00Z",
      },
    ]
  );

  assert.match(answer, /ceo@acme.com je ACME CEO/);
  assert.match(answer, /otvorenú požiadavku/);
});

test("identity matching can fall back to client domain", () => {
  const match = matchLocalIdentity("ops@acme.com", [
    {
      id: "p1",
      kind: "client",
      primaryEmail: "ceo@acme.com",
      companyName: "ACME",
      status: "active",
    },
  ]);

  assert.equal(match.reason, "client_domain_match");
  assert.equal(match.confidence, 0.72);
});

test("Jarvis voice flow wakes, answers, then returns idle", () => {
  assert.equal(containsWakeWord("Jarvis, počúvaš?"), true);

  let session = createJarvisVoiceSession();
  const wake = handleJarvisVoiceEvent(session, {
    type: "transcript",
    text: "Jarvis",
  });
  assert.equal(wake.session.state, "awake");
  assert.equal(wake.shouldStartRecording, true);
  assert.equal(wake.speakText, "Áno, počúvam.");

  session = wake.session;
  const response = handleJarvisVoiceEvent(session, {
    type: "transcript",
    text: "čo sa dialo v cold outreach",
    intent: {
      kind: "cold_outreach_status",
      metrics: {
        periodLabel: "dnes",
        contacted: 10,
        opened: 5,
        replied: 2,
        positiveReplies: 1,
        preparedPositiveReplyCount: 1,
        pendingApprovalCount: 1,
      },
    },
  });

  assert.equal(response.session.state, "idle");
  assert.equal(response.shouldStopRecording, true);
  assert.match(response.speakText ?? "", /Za dnes sme napísali 10 ľuďom/);
});

test("Jarvis voice resolves production, remote MCP, contracts, Gmail, and client memory prompts", () => {
  assert.equal(resolveJarvisIntentFromTranscript("Jarvis skontroluj production readiness")?.kind, "voice_capability");
  assert.equal(resolveJarvisIntentFromTranscript("Jarvis priprav remote MCP handoff pre Claude")?.kind, "voice_capability");
  assert.equal(resolveJarvisIntentFromTranscript("Jarvis priprav zmluvny intake")?.kind, "voice_capability");
  assert.equal(resolveJarvisIntentFromTranscript("Jarvis skontroluj Gmail inbox")?.kind, "voice_capability");
  assert.equal(resolveJarvisIntentFromTranscript("Jarvis ake su klientske poziadavky?")?.kind, "voice_capability");

  const wake = handleJarvisVoiceEvent(createJarvisVoiceSession(), {
    type: "transcript",
    text: "Jarvis",
  });
  const response = handleJarvisVoiceEvent(wake.session, {
    type: "transcript",
    text: "priprav remote MCP handoff pre ChatGPT",
  });

  assert.equal(response.session.state, "idle");
  assert.match(response.speakText ?? "", /remote MCP handoff/);
  assert.match(response.speakText ?? "", /bearer auth placeholder/);
});

test("local SQLite CLI persists people and need signals", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";

  const person = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "upsert-person",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      kind: "client",
      primaryEmail: "ceo@acme.com",
      displayName: "ACME CEO",
      companyName: "ACME",
    }),
  ]);

  assert.equal(person.primaryEmail, "ceo@acme.com");

  runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "add-need-signal",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      personId: person.id,
      summary: "chce nový report pre cold outreach",
      confidence: 0.91,
    }),
  ]);

  const match = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "identify",
    "--db",
    dbPath,
    "--email",
    "ceo@acme.com",
  ]);

  assert.equal(match.reason, "exact_email_match");
  assert.equal(match.openNeedSignals[0].summary, "chce nový report pre cold outreach");
});

test("local SQLite CLI lists open need alerts", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-alerts-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";

  const person = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "upsert-person",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      kind: "client",
      primaryEmail: "ceo@acme.com",
      displayName: "ACME CEO",
      companyName: "ACME",
    }),
  ]);

  runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "add-need-signal",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      personId: person.id,
      summary: "chce novy report pre cold outreach",
      confidence: 0.91,
    }),
  ]);

  const alerts = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "list-open-needs",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ limit: 5 }),
  ]);

  assert.equal(alerts.count, 1);
  assert.equal(alerts.alerts[0].person.primaryEmail, "ceo@acme.com");
  assert.match(alerts.summary, /otvorenych klientskych poziadaviek/);
});

test("local SQLite CLI ingests client messages and raises need alerts", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-message-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";

  runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "upsert-person",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      kind: "client",
      primaryEmail: "ceo@acme.com",
      displayName: "ACME CEO",
      companyName: "ACME",
    }),
  ]);

  const ingested = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "ingest-message",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      fromEmail: "ceo@acme.com",
      source: "email",
      subject: "Onboarding",
      text: "Potrebujem upraviť onboarding automatizáciu do piatku.",
      occurredAt: "2026-06-07T10:00:00Z",
    }),
  ]);

  assert.equal(ingested.identity.reason, "exact_email_match");
  assert.equal(ingested.needSignal.signalType, "request");
  assert.match(ingested.jarvisAlert, /ACME CEO chce alebo potrebuje/);
  assert.equal(ingested.identity.openNeedSignals[0].summary, "Potrebujem upraviť onboarding automatizáciu do piatku.");
});

test("local SQLite CLI deduplicates Gmail messages by external id", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-message-dedupe-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";
  const payload = {
    fromEmail: "ceo@acme.com",
    source: "gmail",
    subject: "Report",
    text: "Potrebujem novy report pre automatizaciu.",
    occurredAt: "2026-06-07T10:00:00Z",
    externalId: "gmail-message-1",
  };

  const first = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "ingest-message",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify(payload),
  ]);
  const second = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "ingest-message",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify(payload),
  ]);
  const alerts = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "list-open-needs",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ limit: 10 }),
  ]);

  assert.equal(first.status, "created");
  assert.equal(second.status, "duplicate");
  assert.equal(second.messageActivity.id, first.messageActivity.id);
  assert.equal(alerts.count, 1);
});

test("local SQLite CLI summarizes cold outreach events by period", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-cold-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";
  const since = "2026-06-01T00:00:00Z";
  const until = "2026-06-08T00:00:00Z";

  for (const event of [
    ["a@example.com", "sent"],
    ["b@example.com", "sent"],
    ["a@example.com", "opened"],
    ["a@example.com", "replied"],
    ["a@example.com", "positive_reply"],
    ["a@example.com", "prepared_reply"],
  ] as const) {
    runPythonJson(python, [
      "scripts/jarvis_local_db.py",
      "add-cold-event",
      "--db",
      dbPath,
      "--payload",
      JSON.stringify({
        leadEmail: event[0],
        eventType: event[1],
        occurredAt: "2026-06-07T10:00:00Z",
      }),
    ]);
  }

  const brief = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "cold-brief",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ since, until, periodLabel: "posledných 7 dní" }),
  ]);

  assert.equal(brief.metrics.contacted, 2);
  assert.equal(brief.metrics.opened, 1);
  assert.equal(brief.metrics.positiveReplies, 1);
  assert.match(brief.summary, /Za posledných 7 dní sme napísali 2 ľuďom/);
  assert.match(brief.summary, /Pripravil som ti 1 odpoveď/);
});

test("local SQLite CLI lists and approves prepared outreach replies", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-prepared-db-"));
  const dbPath = join(dir, "jarvis.db");
  const python = process.env.JARVIS_PYTHON || "python";

  const prepared = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "add-cold-event",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({
      leadEmail: "lead@example.com",
      campaignName: "Founders",
      eventType: "prepared_reply",
      occurredAt: "2026-06-07T10:00:00Z",
      data: {
        subject: "Re: automation",
        replyText: "Dakujem za odpoved, posielam dalsi krok.",
        positiveSignal: "Lead chce call.",
      },
    }),
  ]);

  const pending = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "list-prepared-replies",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ status: "pending", limit: 5 }),
  ]);
  assert.equal(pending.count, 1);
  assert.equal(pending.replies[0].id, prepared.id);
  assert.equal(pending.replies[0].replyText, "Dakujem za odpoved, posielam dalsi krok.");

  const approved = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "approve-prepared-reply",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ preparedEventId: prepared.id, approvedBy: "test" }),
  ]);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedEvent.eventType, "approved_reply_sent");

  const after = runPythonJson(python, [
    "scripts/jarvis_local_db.py",
    "list-prepared-replies",
    "--db",
    dbPath,
    "--payload",
    JSON.stringify({ status: "pending", limit: 5 }),
  ]);
  assert.equal(after.count, 0);
});

function runPythonJson(python: string, args: string[]) {
  const result = spawnSync(python, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function responseJson(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

async function startTcpServer(onConnection?: (socket: Socket) => void) {
  const server = onConnection ? createServer(onConnection) : createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
