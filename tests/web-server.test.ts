import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createLocalApiServer } from "../src/server/local-api-server.ts";
import { listJarvisMcpTools } from "../src/automation-system/mcp-tools.ts";

test("local web bridge serves UI and API health", async () => {
  const source = readFileSync("src/server/local-api-server.ts", "utf-8");
  assert.match(source, /function cleanPythonErrorMessage/);
  assert.match(source, /return redactSensitiveText\(valueError\.replace/);
  assert.match(source, /return redactSensitiveText\(lines\.at\(-1\) \|\| String\(message\)\)/);
  const evidencePath = join(process.cwd(), "generated", "production-verification", "latest.json");
  const previousEvidence = existsSync(evidencePath) ? readFileSync(evidencePath, "utf-8") : null;
  const previousWebToken = process.env.JARVIS_WEB_TOKEN;
  const previousApiSecret = process.env.API_SECRET_KEY;
  delete process.env.JARVIS_WEB_TOKEN;
  process.env.API_SECRET_KEY = "dummy";
  const syntheticGoogleKey = "AI" + "za" + "S" + "y" + "C".repeat(32);
  mkdirSync(join(process.cwd(), "generated", "production-verification"), { recursive: true });
  writeFileSync(
    evidencePath,
    JSON.stringify({
      mode: "arcigy-jarvis-production-verification",
      status: "ready",
      generatedAt: new Date().toISOString(),
      webUrl: "http://127.0.0.1:8765",
      release: {
        repository: "arcigy/jarvis",
        branch: "main",
        shortCommit: "0123456789ab",
        dirty: false,
        requiredRemoteMcpSmokeGates: remoteSmokeRequiredGateFixture(),
      },
      freshnessPolicy: { maxAgeHours: 24, command: "npm run verify:production" },
      secretPolicy: `Secret-safe ${syntheticGoogleKey}`,
      checks: [
        { name: "typecheck", status: "ready", detail: "OK" },
        { name: "secret-scan", status: "ready", detail: `No leak ${syntheticGoogleKey}` },
      ],
    }),
    "utf-8"
  );

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const page = await fetch(`${baseUrl}/index.html`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Arcigy Jarvis/);
    assert.match(html, /commandDeck/);
    assert.match(html, /readyIntegrations/);
    assert.match(html, /remoteAgentPrompt/);
    assert.match(html, /agentSetupProfiles/);
    assert.match(html, /copyRemotePack/);
    assert.match(html, /runRemoteSmoke/);
    assert.match(html, /verificationEvidence/);
    assert.match(html, /releaseProofGrid/);

    const css = await fetch(`${baseUrl}/styles.css`);
    assert.equal(css.status, 200);
    const styles = await css.text();
    assert.match(styles, /commandDeck/);
    assert.match(styles, /scanFrame/);
    assert.match(styles, /coreVisual/);
    assert.match(styles, /bridgeCockpit/);
    assert.match(styles, /bridgeSweep/);
    assert.match(styles, /handoffPanel/);
    assert.match(styles, /handoffGrid/);
    assert.match(styles, /agentSetupGrid/);
    assert.match(styles, /agentSetupCard/);
    assert.match(styles, /releaseProof/);

    const visual = await fetch(`${baseUrl}/assets/jarvis-command-core.png`);
    assert.equal(visual.status, 200);
    assert.equal(visual.headers.get("content-type"), "image/png");
    const visualBody = Buffer.from(await visual.arrayBuffer());
    assert.equal(visualBody.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(visualBody.length > 200000, true);

    const renderer = await fetch(`${baseUrl}/renderer.js`);
    assert.equal(renderer.status, 200);
    const rendererText = await renderer.text();
    assert.match(rendererText, /renderCommandDeck/);
    assert.match(rendererText, /buildCommandTimeline/);
    assert.match(rendererText, /startWebBridgeWatch/);
    assert.match(rendererText, /renderRemoteMcpPack/);
    assert.match(rendererText, /renderAgentSetupProfiles/);
    assert.match(rendererText, /findAgentSetupProfile/);
    assert.match(rendererText, /renderRemoteMcpSmoke/);
    assert.match(rendererText, /renderProductionVerificationEvidence/);
    assert.match(rendererText, /renderReleaseProof/);
    assert.match(rendererText, /releaseProofGrid/);
    assert.match(rendererText, /\/api\/production-verification-evidence/);
    assert.match(rendererText, /\/api\/remote-mcp-pack/);
    assert.match(rendererText, /\/api\/remote-mcp-smoke/);

    const health = await fetch(`${baseUrl}/api/system-health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { integrations: Array<{ key: string }> };
    assert.ok(body.integrations.some((item) => item.key === "gemini"));

    const manifestResponse = await fetch(`${baseUrl}/api/mcp`);
    assert.equal(manifestResponse.status, 200);
    const manifest = (await manifestResponse.json()) as {
      auth: { type: string; requiredForExternalHosts: boolean };
      endpoints: { mcpToolCallPattern: string; actionManifest: string; openApiSchema: string; productionVerificationEvidence: string };
      toolPolicy: { approvalRequired: string[]; localStateWrite: string[]; readOnlyOrDraft: string[] };
      tools: Array<{ name: string; method: string; url: string; approval: { required: boolean; field?: string }; localStateWrite: boolean; readOnlyOrDraft: boolean }>;
    };
    assert.equal(manifest.auth.type, "bearer");
    assert.equal(manifest.auth.requiredForExternalHosts, true);
    assert.match(manifest.endpoints.mcpToolCallPattern, /\/api\/mcp\/\{toolName\}$/);
    assert.match(manifest.endpoints.actionManifest, /\/\.well-known\/ai-plugin\.json$/);
    assert.match(manifest.endpoints.openApiSchema, /\/api\/openapi\.json$/);
    assert.match(manifest.endpoints.productionVerificationEvidence, /\/api\/production-verification-evidence$/);
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.generate_contract_documents"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.send_approved_outreach_reply"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.label_gmail_thread"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.send_slack_message"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.upsert_local_niche"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.record_local_niche_run"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.apply_local_lead_register_update"));
    assert.ok(manifest.toolPolicy.approvalRequired.includes("arcigy.upsert_smartlead_campaign_webhook"));
    assert.ok(manifest.toolPolicy.localStateWrite.includes("arcigy.sync_gmail_recent_messages"));
    assert.ok(manifest.toolPolicy.localStateWrite.includes("arcigy.prepare_positive_outreach_reply"));
    assert.equal(manifest.toolPolicy.readOnlyOrDraft.includes("arcigy.ingest_client_message"), false);
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.draft_contract_intake" && tool.method === "POST"));
    assert.ok(manifest.tools.every((tool) => tool.method === "POST" && tool.url.endsWith(`/api/mcp/${tool.name}`)));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.generate_contract_documents" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.send_approved_outreach_reply" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.label_gmail_thread" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.send_slack_message" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.upsert_local_niche" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.record_local_niche_run" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.apply_local_lead_register_update" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.upsert_smartlead_campaign_webhook" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_smartlead_outreach_brief" && tool.method === "POST"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_production_verification_evidence" && tool.readOnlyOrDraft === true));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_production_completion_score" && tool.readOnlyOrDraft === true));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_jarvis_capability_audit" && tool.readOnlyOrDraft === true));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_proactive_attention_digest" && tool.readOnlyOrDraft === true));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.sync_gmail_recent_messages" && tool.localStateWrite === true && tool.readOnlyOrDraft === false));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.prepare_positive_outreach_reply" && tool.localStateWrite === true && tool.readOnlyOrDraft === false));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.generate_ai_reply" && tool.localStateWrite === false && tool.readOnlyOrDraft === true));

    const mcpBrief = await postJson(`${baseUrl}/api/mcp/arcigy.get_cold_outreach_brief`, {
      periodLabel: "dnes",
      contacted: 3,
      opened: 2,
      replied: 1,
      positiveReplies: 1,
      preparedPositiveReplyCount: 1,
      pendingApprovalCount: 1,
    });
    assert.match(String(mcpBrief.result), /Za dnes/);

    const periodDbDir = join(process.cwd(), "generated", "web-server-period-test");
    mkdirSync(periodDbDir, { recursive: true });
    const periodDbPath = join(periodDbDir, `period-${Date.now()}.db`);
    const fourteenDayBrief = await postJson(`${baseUrl}/api/cold-outreach-brief`, {
      text: "Jarvis cold outreach za poslednych 14 dni",
      live: false,
      dbPath: periodDbPath,
    });
    assert.match(String(fourteenDayBrief), /Za poslednych 14 dni/);
    const yesterdayBrief = await postJson(`${baseUrl}/api/cold-outreach-brief`, {
      text: "Jarvis cold outreach vcera",
      live: false,
      dbPath: periodDbPath,
    });
    assert.match(String(yesterdayBrief), /Za vcera/);
    const monthBrief = await postJson(`${baseUrl}/api/cold-outreach-brief`, {
      text: "Jarvis cold outreach za mesiac",
      live: false,
      dbPath: periodDbPath,
    });
    assert.match(String(monthBrief), /Za poslednych 30 dni/);

    const unapprovedDirectSheetExport = await fetch(`${baseUrl}/api/append-leads-to-google-sheet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(unapprovedDirectSheetExport.status, 409);

    const unapprovedDirectContract = await fetch(`${baseUrl}/api/generate-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
        outputDir: makeRepoTempDir("jarvis-web-direct-contract-"),
      }),
    });
    assert.equal(unapprovedDirectContract.status, 409);

    const mcpDbPath = join(makeRepoTempDir("jarvis-web-mcp-"), "memory.db");
    const upsert = await postJson(`${baseUrl}/api/mcp/arcigy.upsert_local_person`, {
      dbPath: mcpDbPath,
      kind: "client",
      primaryEmail: "founder@example.com",
      displayName: "Founder",
    });
    assert.equal(upsert.result.primaryEmail, "founder@example.com");

    const need = await postJson(`${baseUrl}/api/mcp/arcigy.add_client_need_signal`, {
      dbPath: mcpDbPath,
      personId: upsert.result.id,
      summary: "chce novy reporting",
    });
    assert.equal(need.result.personId, upsert.result.id);

    const mcpAlerts = await postJson(`${baseUrl}/api/mcp/arcigy.get_client_need_alerts`, {
      dbPath: mcpDbPath,
      limit: 5,
    });
    assert.equal(mcpAlerts.result.count, 1);
    assert.equal(mcpAlerts.result.alerts[0].person.primaryEmail, "founder@example.com");

    const coldEvent = await postJson(`${baseUrl}/api/mcp/arcigy.add_cold_outreach_event`, {
      dbPath: mcpDbPath,
      leadEmail: "lead@example.com",
      eventType: "prepared_reply",
      occurredAt: "2026-06-07T10:00:00Z",
      data: { subject: "Re: automations", replyText: "Dakujem, posielam dalsi krok." },
    });
    assert.equal(coldEvent.result.leadEmail, "lead@example.com");

    const preparedReplies = await postJson(`${baseUrl}/api/mcp/arcigy.get_prepared_outreach_replies`, {
      dbPath: mcpDbPath,
      status: "pending",
      limit: 5,
    });
    assert.equal(preparedReplies.result.count, 1);
    assert.equal(preparedReplies.result.replies[0].replyText, "Dakujem, posielam dalsi krok.");

    const unapprovedPreparedReply = await fetch(`${baseUrl}/api/mcp/arcigy.approve_prepared_outreach_reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath: mcpDbPath, preparedEventId: coldEvent.result.id }),
    });
    assert.equal(unapprovedPreparedReply.status, 409);

    const topLevelApprovedPreparedReply = await fetch(`${baseUrl}/api/mcp/arcigy.approve_prepared_outreach_reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath: mcpDbPath, preparedEventId: coldEvent.result.id, approved: true }),
    });
    assert.equal(topLevelApprovedPreparedReply.status, 409);

    const directTopLevelApprovedPreparedReply = await fetch(`${baseUrl}/api/approve-prepared-outreach-reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath: mcpDbPath, preparedEventId: coldEvent.result.id, approved: true }),
    });
    assert.equal(directTopLevelApprovedPreparedReply.status, 409);

    const approvedPreparedReply = await postJson(`${baseUrl}/api/mcp/arcigy.approve_prepared_outreach_reply`, {
      dbPath: mcpDbPath,
      preparedEventId: coldEvent.result.id,
      approval: { approved: true },
      approvedBy: "test",
    });
    assert.equal(approvedPreparedReply.result.status, "approved");

    const pendingBriefingReply = await postJson(`${baseUrl}/api/mcp/arcigy.add_cold_outreach_event`, {
      dbPath: mcpDbPath,
      leadEmail: "briefing-lead@example.com",
      eventType: "prepared_reply",
      occurredAt: "2026-06-07T11:00:00Z",
      data: {
        subject: "Re: demo",
        replyText: "Dakujem, navrhujem kratky call.",
        positiveSignal: "chce demo a termin callu",
      },
    });
    assert.equal(pendingBriefingReply.result.leadEmail, "briefing-lead@example.com");

    const voiceTool = await postJson(`${baseUrl}/api/mcp/arcigy.jarvis_voice_event`, {
      text: "Jarvis",
      session: { state: "idle", wakeWord: "jarvis" },
    });
    assert.equal(voiceTool.result.shouldStartRecording, true);

    const contractOutputDir = makeRepoTempDir("jarvis-web-contract-");
    const unapprovedContract = await fetch(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
        outputDir: contractOutputDir,
      }),
    });
    assert.equal(unapprovedContract.status, 409);

    const topLevelApprovedContract = await fetch(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approved: true,
        intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
        outputDir: contractOutputDir,
      }),
    });
    assert.equal(topLevelApprovedContract.status, 409);

    const unapprovedSheetExport = await fetch(`${baseUrl}/api/mcp/arcigy.append_leads_to_google_sheet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(unapprovedSheetExport.status, 409);

    const topLevelApprovedSheetExport = await fetch(`${baseUrl}/api/mcp/arcigy.append_leads_to_google_sheet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: true, rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(topLevelApprovedSheetExport.status, 409);

    const unapprovedSheetReplace = await fetch(`${baseUrl}/api/mcp/arcigy.replace_google_sheet_rows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(unapprovedSheetReplace.status, 409);

    const topLevelApprovedSheetReplace = await fetch(`${baseUrl}/api/mcp/arcigy.replace_google_sheet_rows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: true, rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(topLevelApprovedSheetReplace.status, 409);

    const contractTool = await postJson(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      approval: { approved: true },
      intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
      outputDir: contractOutputDir,
    });
    assert.match(String(contractTool.result), /generation-manifest\.json/);

    const unfinishedIntake = JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8"));
    unfinishedIntake.client.businessName = "[doplnit]";
    const unfinishedDirectContract = await fetch(`${baseUrl}/api/generate-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approval: { approved: true },
        intake: unfinishedIntake,
        outputDir: makeRepoTempDir("jarvis-web-unfinished-direct-contract-"),
      }),
    });
    assert.equal(unfinishedDirectContract.status, 400);
    const unfinishedDirectContractError = ((await unfinishedDirectContract.json()) as { error: string }).error;
    assert.match(unfinishedDirectContractError, /Unresolved contract intake placeholder/);
    assert.doesNotMatch(unfinishedDirectContractError, /Traceback|generate_contract_documents\.py/);

    const malformedDirectContract = await fetch(`${baseUrl}/api/generate-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approval: { approved: true },
        intake: "{",
        outputDir: makeRepoTempDir("jarvis-web-malformed-direct-contract-"),
      }),
    });
    assert.equal(malformedDirectContract.status, 400);
    assert.equal(((await malformedDirectContract.json()) as { error: string }).error, "Contract intake must be valid JSON.");

    const unfinishedMcpContract = await fetch(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approval: { approved: true },
        intake: unfinishedIntake,
        outputDir: makeRepoTempDir("jarvis-web-unfinished-mcp-contract-"),
      }),
    });
    assert.equal(unfinishedMcpContract.status, 400);
    const unfinishedMcpContractError = ((await unfinishedMcpContract.json()) as { error: string }).error;
    assert.match(unfinishedMcpContractError, /Unresolved contract intake placeholder/);
    assert.doesNotMatch(unfinishedMcpContractError, /Traceback|generate_contract_documents\.py/);

    const rejectedPath = await fetch(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
        outputDir: join(tmpdir(), "outside-jarvis-contracts"),
        approval: { approved: true },
      }),
    });
    assert.equal(rejectedPath.status, 400);

    const diagnostics = await fetch(`${baseUrl}/api/run-diagnostics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: false }),
    });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = (await diagnostics.json()) as { live: boolean; checks: Array<{ key: string }> };
    assert.equal(diagnosticsBody.live, false);
    assert.ok(diagnosticsBody.checks.some((item) => item.key === "sqlite"));

    const operatorBriefing = await fetch(`${baseUrl}/api/operator-briefing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath: mcpDbPath, since: "2026-06-01T00:00:00Z", until: "2026-06-08T00:00:00Z", periodLabel: "poslednych 7 dni" }),
    });
    assert.equal(operatorBriefing.status, 200);
    const operatorBriefingBody = (await operatorBriefing.json()) as { speechText: string; sections: { productionEvidence?: string; preparedReplies?: string } };
    assert.match(operatorBriefingBody.speechText, /Jarvis briefing/);
    assert.match(operatorBriefingBody.speechText, /Production evidence:/);
    assert.match(operatorBriefingBody.sections.productionEvidence ?? "", /Production verification/);
    assert.match(operatorBriefingBody.sections.preparedReplies ?? "", /briefing-lead@example\.com/);
    assert.match(operatorBriefingBody.sections.preparedReplies ?? "", /Poslem ich az po tvojom schvaleni/);

    const mcpOperatorBriefing = await postJson(`${baseUrl}/api/mcp/arcigy.get_operator_briefing`, {
      dbPath: mcpDbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    });
    assert.match(mcpOperatorBriefing.result.speechText, /Jarvis briefing/);
    assert.match(mcpOperatorBriefing.result.speechText, /Production evidence:/);
    assert.match(mcpOperatorBriefing.result.sections.preparedReplies, /briefing-lead@example\.com/);
    assert.match(mcpOperatorBriefing.result.sections.preparedReplies, /Poslem ich az po tvojom schvaleni/);

    const attentionDigest = await fetch(`${baseUrl}/api/proactive-attention-digest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath: mcpDbPath, since: "2026-06-01T00:00:00Z", until: "2026-06-08T00:00:00Z", periodLabel: "poslednych 7 dni" }),
    });
    assert.equal(attentionDigest.status, 200);
    const attentionDigestBody = (await attentionDigest.json()) as { mode: string; urgency: string; speechText: string; notifications: Array<{ id: string; detail: string }> };
    assert.equal(attentionDigestBody.mode, "arcigy-jarvis-proactive-attention-digest");
    assert.equal(attentionDigestBody.urgency, "attention");
    assert.ok(attentionDigestBody.notifications.some((item) => item.id === "prepared-replies" && item.detail.includes("briefing-lead@example.com")));

    const mcpAttentionDigest = await postJson(`${baseUrl}/api/mcp/arcigy.get_proactive_attention_digest`, {
      dbPath: mcpDbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    });
    assert.equal(mcpAttentionDigest.result.mode, "arcigy-jarvis-proactive-attention-digest");
    assert.match(mcpAttentionDigest.result.speechText, /Jarvis attention digest/);

    const readiness = await fetch(`${baseUrl}/api/production-readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: false }),
    });
    assert.equal(readiness.status, 200);
    const readinessBody = (await readiness.json()) as {
      status: string;
      mcp: { toolCount: number };
      nextActions: string[];
      fixGuide: unknown[];
      attentionQueue: unknown[];
      launchChecklist: Array<{ id: string; status: string; proof: string }>;
      launchEvidence: { mode: string; proofGates: Array<{ id: string; validationCommand: string }>; remoteHandoff: { tunnelCommand: string; requiredBeforeExternalAgent: string[] } };
    };
    assert.ok(["ready", "attention", "blocked"].includes(readinessBody.status));
    assert.equal(readinessBody.mcp.toolCount, listJarvisMcpTools().length);
    assert.ok(Array.isArray(readinessBody.nextActions));
    assert.ok(Array.isArray(readinessBody.fixGuide));
    assert.ok(Array.isArray(readinessBody.attentionQueue));
    assert.ok(readinessBody.launchChecklist.some((item) => item.id === "approval-locks" && item.status === "ready"));
    assert.ok(readinessBody.launchChecklist.some((item) => item.id === "remote-agent-workflow" && item.proof.includes("completion score")));
    assert.equal(readinessBody.launchEvidence.mode, "production-launch-evidence");
    assert.ok(readinessBody.launchEvidence.proofGates.some((gate) => gate.id === "mcp-registry" && gate.validationCommand === "npm test"));
    assert.equal(readinessBody.launchEvidence.remoteHandoff.tunnelCommand, "npm run web:tunnel:secure");
    assert.ok(readinessBody.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step) => step.includes("/.well-known/ai-plugin.json") && step.includes("/api/openapi.json")));
    assert.ok(
      readinessBody.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some(
        (step) =>
          step.includes("all 37 required remote MCP smoke gates") &&
          step.includes("pack-contract-draft-quick-start") &&
          step.includes("pack-client-memory-quick-start") &&
          step.includes("pack-production-evidence-quick-start") &&
          step.includes("production-evidence-tool-call") &&
          step.includes("release proof") &&
          step.includes("dirty=false") &&
          step.includes("freshness.fresh=true") &&
          step.includes("arcigy.get_production_completion_score") &&
          step.includes("secret-redaction")
      )
    );

    const verificationEvidence = await fetch(`${baseUrl}/api/production-verification-evidence`);
    assert.equal(verificationEvidence.status, 200);
    const verificationEvidenceText = await verificationEvidence.text();
    assert.equal(verificationEvidenceText.includes(syntheticGoogleKey), false);
    const verificationEvidenceBody = JSON.parse(verificationEvidenceText) as {
      status: string;
      summary: string;
      freshness: { fresh: boolean; ageHours: number | null; maxAgeHours: number };
      release?: { repository?: string; shortCommit?: string; dirty?: boolean; requiredRemoteMcpSmokeGates?: string[] };
      checks: Array<{ name: string; status: string; detail: string }>;
    };
    assert.equal(verificationEvidenceBody.status, "ready");
    assert.match(verificationEvidenceBody.summary, /2 ready, 0 failed/);
    assert.equal(verificationEvidenceBody.release?.repository, "arcigy/jarvis");
    assert.equal(verificationEvidenceBody.release?.shortCommit, "0123456789ab");
    assert.equal(verificationEvidenceBody.release?.dirty, false);
    assert.equal(verificationEvidenceBody.freshness.fresh, true);
    assert.equal(verificationEvidenceBody.freshness.maxAgeHours, 24);
    assert.equal(typeof verificationEvidenceBody.freshness.ageHours, "number");
    assert.ok(verificationEvidenceBody.release?.requiredRemoteMcpSmokeGates?.includes("secret-redaction"));
    assert.ok(verificationEvidenceBody.release?.requiredRemoteMcpSmokeGates?.includes("pack-agent-setup-profiles"));
    assert.ok(verificationEvidenceBody.release?.requiredRemoteMcpSmokeGates?.includes("pack-agent-launch-bundle"));
    assert.ok(verificationEvidenceBody.release?.requiredRemoteMcpSmokeGates?.includes("pack-agent-compatibility"));
    assert.ok(verificationEvidenceBody.release?.requiredRemoteMcpSmokeGates?.includes("pack-handoff-proof"));
    assert.ok(verificationEvidenceBody.checks.some((check) => check.name === "secret-scan" && check.status === "ready"));
    assert.match(verificationEvidenceText, /\[redacted-google-api-key\]/);

    const mcpReadiness = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_readiness`, { live: false });
    assert.equal(mcpReadiness.result.mcp.toolCount, listJarvisMcpTools().length);
    assert.ok(Array.isArray(mcpReadiness.result.fixGuide));
    assert.ok(Array.isArray(mcpReadiness.result.attentionQueue));
    assert.ok(mcpReadiness.result.launchChecklist.some((item: { id: string }) => item.id === "mcp-registry"));
    assert.ok(mcpReadiness.result.launchEvidence.proofGates.some((gate: { id: string }) => gate.id === "approval-locks"));
    assert.ok(mcpReadiness.result.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step: string) => step.includes("action-manifest") || step.includes("/.well-known/ai-plugin.json")));
    assert.ok(
      mcpReadiness.result.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some(
        (step: string) => step.includes("production-evidence-tool-call") && step.includes("dirty=false") && step.includes("freshness.fresh=true")
      )
    );

    const mcpEvidence = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_verification_evidence`, {});
    assert.equal(mcpEvidence.result.status, "ready");
    assert.match(mcpEvidence.result.summary, /2 ready, 0 failed/);
    assert.equal(mcpEvidence.result.release.repository, "arcigy/jarvis");
    assert.equal(mcpEvidence.result.release.shortCommit, "0123456789ab");
    assert.equal(JSON.stringify(mcpEvidence).includes(syntheticGoogleKey), false);

    const completionScore = await fetch(`${baseUrl}/api/production-completion-score`);
    assert.equal(completionScore.status, 200);
    const completionScoreBody = (await completionScore.json()) as { mode: string; status: string; percent: number; overallPercent: number; completionPercent: number; components: unknown[] };
    assert.equal(completionScoreBody.mode, "arcigy-jarvis-production-completion-score");
    assert.ok(["ready", "attention", "blocked"].includes(completionScoreBody.status));
    assert.equal(typeof completionScoreBody.percent, "number");
    assert.equal(completionScoreBody.overallPercent, completionScoreBody.percent);
    assert.equal(completionScoreBody.completionPercent, completionScoreBody.percent);
    assert.equal(Array.isArray(completionScoreBody.components), true);
    assert.equal(JSON.stringify(completionScoreBody).includes(syntheticGoogleKey), false);

    const mcpCompletionScore = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_completion_score`, { live: false });
    assert.equal(mcpCompletionScore.result.mode, "arcigy-jarvis-production-completion-score");
    assert.equal(typeof mcpCompletionScore.result.percent, "number");
    assert.equal(mcpCompletionScore.result.overallPercent, mcpCompletionScore.result.percent);
    assert.equal(mcpCompletionScore.result.completionPercent, mcpCompletionScore.result.percent);
    assert.equal(JSON.stringify(mcpCompletionScore).includes(syntheticGoogleKey), false);

    const capabilityAudit = await fetch(`${baseUrl}/api/jarvis-capability-audit`);
    assert.equal(capabilityAudit.status, 200);
    const capabilityAuditBody = (await capabilityAudit.json()) as {
      mode: string;
      toolCount: number;
      capabilities: Array<{ id: string; tools: string[]; approvalRequired: string[] }>;
    };
    assert.equal(capabilityAuditBody.mode, "arcigy-jarvis-capability-audit");
    assert.equal(capabilityAuditBody.toolCount, listJarvisMcpTools().length);
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "remote-mcp" && item.tools.includes("arcigy.get_jarvis_capability_audit")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.append_leads_to_google_sheet")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.replace_google_sheet_rows")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.label_gmail_thread")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.send_slack_message")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.upsert_local_niche")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.record_local_niche_run")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.apply_local_lead_register_update")));
    assert.ok(capabilityAuditBody.capabilities.some((item) => item.id === "approval-safety" && item.approvalRequired.includes("arcigy.upsert_smartlead_campaign_webhook")));
    assert.equal(JSON.stringify(capabilityAuditBody).includes(syntheticGoogleKey), false);

    const mcpCapabilityAudit = await postJson(`${baseUrl}/api/mcp/arcigy.get_jarvis_capability_audit`, { live: false });
    assert.equal(mcpCapabilityAudit.result.mode, "arcigy-jarvis-capability-audit");
    assert.equal(mcpCapabilityAudit.result.toolCount, listJarvisMcpTools().length);

    const actionManifest = await fetch(`${baseUrl}/.well-known/ai-plugin.json`);
    assert.equal(actionManifest.status, 200);
    const actionManifestText = await actionManifest.text();
    assert.equal(actionManifestText.includes("preflight-secret-token"), false);
    const actionManifestBody = JSON.parse(actionManifestText) as {
      schema_version: string;
      name_for_model: string;
      auth: { type: string; authorization_type: string };
      api: { type: string; url: string; is_user_authenticated: boolean };
      "x-arcigy-policy": { tokenValueReturned: boolean; familyFriendly: boolean };
    };
    assert.equal(actionManifestBody.schema_version, "v1");
    assert.equal(actionManifestBody.name_for_model, "arcigy_jarvis");
    assert.equal(actionManifestBody.auth.type, "user_http");
    assert.equal(actionManifestBody.auth.authorization_type, "bearer");
    assert.equal(actionManifestBody.api.type, "openapi");
    assert.equal(actionManifestBody.api.url, `${baseUrl}/api/openapi.json`);
    assert.equal(actionManifestBody.api.is_user_authenticated, true);
    assert.equal(actionManifestBody["x-arcigy-policy"].tokenValueReturned, false);
    assert.equal(actionManifestBody["x-arcigy-policy"].familyFriendly, true);

    const openApi = await fetch(`${baseUrl}/api/openapi.json`);
    assert.equal(openApi.status, 200);
    const openApiText = await openApi.text();
    assert.equal(openApiText.includes("preflight-secret-token"), false);
    const openApiBody = JSON.parse(openApiText) as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
      components: { securitySchemes: { bearerAuth: { bearerFormat: string } } };
      "x-arcigy-agent-setup": {
        supportedAgents: string[];
        recommendedImports: { openApiSchemaUrl: string; connectionPackUrl: string; smokeTestUrl: string };
        proofPolicy: { freshnessMaxAgeHours: number; beforeAnyWork: string[]; beforeWrites: string[] };
      };
    };
    assert.equal(openApiBody.openapi, "3.1.0");
    assert.equal(openApiBody.servers[0].url, baseUrl);
    assert.equal(openApiBody.components.securitySchemes.bearerAuth.bearerFormat, "JARVIS_WEB_TOKEN");
    assert.deepEqual(openApiBody["x-arcigy-agent-setup"].supportedAgents.slice(0, 3), ["Claude", "ChatGPT", "Grok"]);
    assert.equal(openApiBody["x-arcigy-agent-setup"].recommendedImports.openApiSchemaUrl, `${baseUrl}/api/openapi.json`);
    assert.equal(openApiBody["x-arcigy-agent-setup"].recommendedImports.connectionPackUrl, `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`);
    assert.equal(openApiBody["x-arcigy-agent-setup"].proofPolicy.freshnessMaxAgeHours, 24);
    assert.ok(openApiBody["x-arcigy-agent-setup"].proofPolicy.beforeAnyWork.some((step) => step.includes("smokeTestUrl") && step.includes("status=ready") && step.includes("all 37 required remote MCP smoke gates")));
    assert.ok(openApiBody["x-arcigy-agent-setup"].proofPolicy.beforeAnyWork.some((step) => step.includes("arcigy.get_production_completion_score") && step.includes("quick-start coverage")));
    assert.ok(openApiBody["x-arcigy-agent-setup"].proofPolicy.beforeAnyWork.some((step) => step.includes("productionVerificationEvidenceUrl") && step.includes("dirty=false") && step.includes("freshness.fresh=true")));
    assert.ok(openApiBody["x-arcigy-agent-setup"].proofPolicy.beforeWrites.some((step) => step.includes("approval.approved=true")));
    assert.equal(Object.keys(openApiBody.paths).length, listJarvisMcpTools().length);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_operator_briefing"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_proactive_attention_digest"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.generate_contract_documents"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_production_completion_score"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_jarvis_capability_audit"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.send_slack_message"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.upsert_local_niche"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_local_niche_queue"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.record_local_niche_run"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_gmail_lead_context"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.lookup_public_email_profile"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_gmail_unread_triage"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.label_gmail_thread"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_outreach_contact_selection_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_failed_scrape_recovery_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_daily_leadgen_run_closure_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_sticky_niche_leadgen_decision_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_leadgen_run_resume_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_local_lead_register_update_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.apply_local_lead_register_update"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_gmail_name_enrichment_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_lead_identity_repair_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_leadgen_to_smartlead_dispatch_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_international_market_leadgen_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_company_research_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_research_results_import_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_bulk_smartlead_upload_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_smartlead_send_readiness_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_bulk_ai_intro_work_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_smartlead_reply_followup_queue_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_smartlead_campaign_delete_safety_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_smartlead_campaign_webhooks"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.upsert_smartlead_campaign_webhook"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_smartlead_email_accounts"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_pricing_proposal_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_service_capacity_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_showcase_reply_preview"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.build_smartlead_fixed_campaign_package_preview"]);
    const openApiOperator = openApiBody.paths["/api/mcp/arcigy.get_operator_briefing"] as OpenApiPathFixture;
    const openApiAttentionDigest = openApiBody.paths["/api/mcp/arcigy.get_proactive_attention_digest"] as OpenApiPathFixture;
    const openApiCompletionScore = openApiBody.paths["/api/mcp/arcigy.get_production_completion_score"] as OpenApiPathFixture;
    const openApiSlackSend = openApiBody.paths["/api/mcp/arcigy.send_slack_message"] as OpenApiPathFixture;
    const openApiLocalNicheUpsert = openApiBody.paths["/api/mcp/arcigy.upsert_local_niche"] as OpenApiPathFixture;
    const openApiLocalNicheQueue = openApiBody.paths["/api/mcp/arcigy.get_local_niche_queue"] as OpenApiPathFixture;
    const openApiLocalNicheRun = openApiBody.paths["/api/mcp/arcigy.record_local_niche_run"] as OpenApiPathFixture;
    const openApiGmailSync = openApiBody.paths["/api/mcp/arcigy.sync_gmail_recent_messages"] as OpenApiPathFixture;
    const openApiGmailLeadContext = openApiBody.paths["/api/mcp/arcigy.get_gmail_lead_context"] as OpenApiPathFixture;
    const openApiPublicEmailProfile = openApiBody.paths["/api/mcp/arcigy.lookup_public_email_profile"] as OpenApiPathFixture;
    const openApiGmailUnreadTriage = openApiBody.paths["/api/mcp/arcigy.get_gmail_unread_triage"] as OpenApiPathFixture;
    const openApiGmailLabelThread = openApiBody.paths["/api/mcp/arcigy.label_gmail_thread"] as OpenApiPathFixture;
    const openApiLocalLeadRegisterPreview = openApiBody.paths["/api/mcp/arcigy.build_local_lead_register_update_preview"] as OpenApiPathFixture;
    const openApiLocalLeadRegisterApply = openApiBody.paths["/api/mcp/arcigy.apply_local_lead_register_update"] as OpenApiPathFixture;
    const openApiLeadIdentityRepair = openApiBody.paths["/api/mcp/arcigy.build_lead_identity_repair_preview"] as OpenApiPathFixture;
    const openApiSmartleadWebhooks = openApiBody.paths["/api/mcp/arcigy.get_smartlead_campaign_webhooks"] as OpenApiPathFixture;
    const openApiSmartleadWebhookUpsert = openApiBody.paths["/api/mcp/arcigy.upsert_smartlead_campaign_webhook"] as OpenApiPathFixture;
    const openApiSmartleadEmailAccounts = openApiBody.paths["/api/mcp/arcigy.get_smartlead_email_accounts"] as OpenApiPathFixture;
    const openApiSmartleadReplyFollowupQueue = openApiBody.paths["/api/mcp/arcigy.build_smartlead_reply_followup_queue_preview"] as OpenApiPathFixture;
    const openApiPricingProposalPreview = openApiBody.paths["/api/mcp/arcigy.build_pricing_proposal_preview"] as OpenApiPathFixture;
    const openApiServiceCapacityPreview = openApiBody.paths["/api/mcp/arcigy.build_service_capacity_preview"] as OpenApiPathFixture;
    const openApiShowcaseReplyPreview = openApiBody.paths["/api/mcp/arcigy.build_showcase_reply_preview"] as OpenApiPathFixture;
    const openApiContract = openApiBody.paths["/api/mcp/arcigy.generate_contract_documents"] as OpenApiPathFixture;
    assert.equal(openApiCompletionScore.post.requestBody.content["application/json"].examples.quickStart.value.live, false);
    assert.equal(openApiSlackSend.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiSlackSend.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiLocalNicheUpsert.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiLocalNicheUpsert.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiLocalNicheQueue.post.requestBody.content["application/json"].examples.quickStart.value.status, "active");
    assert.equal(openApiLocalNicheRun.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiLocalNicheRun.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiAttentionDigest.post.requestBody.content["application/json"].examples.quickStart.value.syncGmail, false);
    assert.equal(openApiOperator.post.requestBody.content["application/json"].examples.quickStart.value.syncGmail, false);
    assert.equal(openApiGmailSync.post.requestBody.content["application/json"].examples.quickStart.value.dryRun, true);
    assert.equal(openApiGmailLeadContext.post.requestBody.content["application/json"].examples.quickStart.value.leadEmail, "lead@example.com");
    assert.equal(openApiPublicEmailProfile.post.requestBody.content["application/json"].examples.quickStart.value.email, "jan.novak@example.com");
    assert.equal(openApiGmailUnreadTriage.post.requestBody.content["application/json"].examples.quickStart.value.query, "is:unread category:primary");
    assert.equal(openApiGmailLabelThread.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiGmailLabelThread.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiLocalLeadRegisterPreview.post.requestBody.content["application/json"].examples.quickStart.value.primaryEmail, "lead@example.com");
    assert.equal(openApiLocalLeadRegisterApply.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiLocalLeadRegisterApply.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiLeadIdentityRepair.post["x-arcigy-requiresApproval"], false);
    assert.ok(Array.isArray(openApiLeadIdentityRepair.post.requestBody.content["application/json"].examples.quickStart.value.leads));
    assert.equal(openApiSmartleadWebhooks.post.requestBody.content["application/json"].examples.quickStart.value.campaignId, "123456");
    assert.equal(openApiSmartleadEmailAccounts.post.requestBody.content["application/json"].examples.quickStart.value.requestedDailyLimit, 80);
    assert.equal(openApiSmartleadReplyFollowupQueue.post.requestBody.content["application/json"].examples.quickStart.value.events[0].event_type, "EMAIL_REPLY");
    assert.equal(openApiPricingProposalPreview.post.requestBody.content["application/json"].examples.quickStart.value.clientName, "Modelova Firma s.r.o.");
    assert.equal(openApiPricingProposalPreview.post.requestBody.content["application/json"].examples.quickStart.value.items.length, 2);
    assert.equal(openApiServiceCapacityPreview.post.requestBody.content["application/json"].examples.quickStart.value.services.length, 3);
    assert.equal(openApiShowcaseReplyPreview.post.requestBody.content["application/json"].examples.quickStart.value.leadEmail, "lead@example.com");
    assert.equal(openApiSmartleadWebhookUpsert.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiSmartleadWebhookUpsert.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);
    assert.equal(openApiContract.post["x-arcigy-requiresApproval"], true);
    assert.equal(openApiContract.post.requestBody.content["application/json"].examples.quickStart.value.approval.approved, true);

    const remotePack = await fetch(`${baseUrl}/api/remote-mcp-pack?includeReadiness=false`);
    assert.equal(remotePack.status, 200);
    const remotePackText = await remotePack.text();
    assert.equal(remotePackText.includes("preflight-secret-token"), false);
    const remotePackBody = JSON.parse(remotePackText) as {
      manifestUrl: string;
      actionManifestUrl: string;
      openApiSchemaUrl: string;
      smokeTestUrl: string;
      productionVerificationEvidenceUrl: string;
      mcpToolCallPattern: string;
      auth: { header: string; tokenStrong: boolean; tokenValueReturned: boolean };
      limits: { maxJsonBytes: number; pathPolicy: string; writesRequireExplicitToolCall: boolean; authFailureThrottle: { enabled: boolean; limit: number; windowMs: number; scope: string } };
      tools: { count: number; approvalRequired: string[]; readOnlyOrDraft: string[]; localStateWrite: string[] };
      quickStartCalls: Array<{
        tool: string;
        method: string;
        url: string;
        approvalRequired: boolean;
        body: Record<string, unknown>;
        exactMcpCall: { tool: string; method: string; url: string; approvalRequired: boolean; body: Record<string, unknown> };
      }>;
      handoff: { connectionPackUrl: string; requiredProof: Array<{ key: string; url: string; expected: string }>; agentFirstSteps: string[] };
      agentCompatibility: { supportedAgents: string[]; safetyRules: string[]; requiredBeforeWork: string[] };
      agentPromptTemplates: { claude: string; chatgpt: string; grok: string; generic: string };
      agentSetupProfiles: Array<{ agent: string; setupMode: string; importUrl: string; fallbackUrl: string; firstTool: string; writePolicy: string; localWritePolicy: string; requiredProofGates: string[] }>;
      agentLaunchBundle: {
        mode: string;
        authHeaderPlaceholder: string;
        shareWithAgent: { connectionPackUrl: string; openApiSchemaUrl: string; smokeTestUrl: string; mcpToolCallPattern: string };
        operatorControls: { secureTunnelCommand: string; tunnelStatusUrl: string; startTunnelUrl: string; stopTunnelUrl: string };
        firstPrompts: { Claude: string; ChatGPT: string; Grok: string; "Generic HTTP agent": string };
        proofPolicy: { freshnessMaxAgeHours: number; beforeAnyWork: string[]; beforeWrites: string[] };
        safetyRails: string[];
      };
      tunnel: { secureCommand: string; statusUrl: string; startUrl: string; stopUrl: string; browserStartRequiresStrongToken: boolean };
    };
    assert.match(remotePackBody.manifestUrl, /\/\.well-known\/arcigy-jarvis\.json$/);
    assert.match(remotePackBody.actionManifestUrl, /\/\.well-known\/ai-plugin\.json$/);
    assert.match(remotePackBody.openApiSchemaUrl, /\/api\/openapi\.json$/);
    assert.match(remotePackBody.smokeTestUrl, /\/api\/remote-mcp-smoke$/);
    assert.match(remotePackBody.productionVerificationEvidenceUrl, /\/api\/production-verification-evidence$/);
    assert.match(remotePackBody.mcpToolCallPattern, /\/api\/mcp\/\{toolName\}$/);
    assert.equal(remotePackBody.auth.header, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
    assert.equal(remotePackBody.auth.tokenStrong, false);
    assert.equal(remotePackBody.auth.tokenValueReturned, false);
    assert.equal(remotePackBody.limits.pathPolicy, "repo-only");
    assert.equal(remotePackBody.limits.maxJsonBytes > 0, true);
    assert.equal(remotePackBody.limits.writesRequireExplicitToolCall, true);
    assert.equal(remotePackBody.limits.authFailureThrottle.enabled, true);
    assert.equal(remotePackBody.limits.authFailureThrottle.scope, "external-host-and-client");
    assert.equal(remotePackBody.limits.authFailureThrottle.limit > 0, true);
    assert.equal(remotePackBody.limits.authFailureThrottle.windowMs > 0, true);
    assert.equal(remotePackBody.tools.count, listJarvisMcpTools().length);
    assert.match(remotePackBody.handoff.connectionPackUrl, /\/api\/remote-mcp-pack\?includeReadiness=true&live=true$/);
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "action-manifest" && item.url.endsWith("/.well-known/ai-plugin.json")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "connection-pack" && item.url.includes("includeReadiness=true")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "secure-tunnel-status" && item.url.endsWith("/api/secure-tunnel-status")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "production-verification-evidence" && item.url.endsWith("/api/production-verification-evidence")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "openapi-schema" && item.url.endsWith("/api/openapi.json")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "connection-pack" && item.expected.includes("repo-only limits")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-limits")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("cors-preflight")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("external-auth-gate")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-auth-throttle-policy")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("openapi-schema")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("pack-production-evidence-quick-start")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("production-evidence-tool-call")));
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("arcigy.get_production_completion_score quick-start coverage")));
    assert.ok(
      remotePackBody.handoff.requiredProof.some(
        (item) => item.key === "remote-smoke" && item.expected.includes("dirty=false") && item.expected.includes("freshness.fresh=true")
      )
    );
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("approval-shape-gate")));
    assert.ok(remotePackBody.handoff.agentFirstSteps.some((step) => step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score") && step.includes("completion percento")));
    assert.ok(remotePackBody.handoff.agentFirstSteps.some((step) => step.includes("arcigy.get_production_completion_score quick-start coverage")));
    assert.ok(remotePackBody.handoff.agentFirstSteps.some((step) => step.includes("secret-redaction")));
    assert.deepEqual(remotePackBody.agentCompatibility.supportedAgents.slice(0, 3), ["Claude", "ChatGPT", "Grok"]);
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("repo-only limits")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score") && step.includes("completion percento")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("arcigy.get_production_completion_score quick-start coverage")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("pack-limits")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("cors-preflight") && step.includes("external-auth-gate") && step.includes("pack-auth-throttle-policy") && step.includes("action-manifest")));
    assert.ok(remotePackBody.agentCompatibility.safetyRules.some((rule) => rule.includes("family-friendly")));
    assert.match(remotePackBody.agentPromptTemplates.grok, /xAI-compatible agents/);
    assert.match(remotePackBody.agentPromptTemplates.grok, /approvalRequired tooly/);
    assert.match(remotePackBody.agentPromptTemplates.chatgpt, /POST http:\/\/127\.0\.0\.1:\d+\/api\/mcp\/\{toolName\}/);
    assert.match(remotePackBody.agentPromptTemplates.chatgpt, /arcigy\.get_production_completion_score/);
    assert.ok(remotePackBody.agentSetupProfiles.some((profile) => profile.agent === "ChatGPT" && profile.setupMode === "openapi-custom-action" && profile.importUrl.endsWith("/api/openapi.json")));
    assert.ok(remotePackBody.agentSetupProfiles.some((profile) => profile.agent === "Grok" && profile.fallbackUrl.endsWith("/api/mcp/{toolName}")));
    assert.ok(remotePackBody.agentSetupProfiles.every((profile) => profile.firstTool === "arcigy.get_operator_briefing" && profile.writePolicy === "approval.approved-required" && profile.localWritePolicy === "dry-run-first"));
    assert.ok(remotePackBody.agentSetupProfiles.every((profile) => profile.requiredProofGates.includes("pack-agent-setup-profiles") && profile.requiredProofGates.includes("pack-agent-launch-bundle")));
    assert.ok(remotePackBody.agentSetupProfiles.every((profile) => profile.requiredProofGates.includes("pack-production-evidence-quick-start") && profile.requiredProofGates.includes("production-evidence-tool-call")));
    assert.equal(remotePackBody.agentLaunchBundle.mode, "remote-agent-launch-bundle");
    assert.equal(remotePackBody.agentLaunchBundle.authHeaderPlaceholder, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
    assert.match(remotePackBody.agentLaunchBundle.shareWithAgent.connectionPackUrl, /\/api\/remote-mcp-pack\?includeReadiness=true&live=true$/);
    assert.match(remotePackBody.agentLaunchBundle.shareWithAgent.openApiSchemaUrl, /\/api\/openapi\.json$/);
    assert.match(remotePackBody.agentLaunchBundle.shareWithAgent.smokeTestUrl, /\/api\/remote-mcp-smoke$/);
    assert.match(remotePackBody.agentLaunchBundle.firstPrompts.Grok, /api\/mcp\/\{toolName\}/);
    assert.match(remotePackBody.agentLaunchBundle.firstPrompts.Grok, /arcigy\.get_jarvis_capability_audit/);
    assert.match(remotePackBody.agentLaunchBundle.firstPrompts.Grok, /arcigy\.get_production_completion_score/);
    assert.match(remotePackBody.agentLaunchBundle.firstPrompts.ChatGPT, /custom action schema/);
    assert.equal(remotePackBody.agentLaunchBundle.proofPolicy.freshnessMaxAgeHours, 24);
    assert.ok(remotePackBody.agentLaunchBundle.proofPolicy.beforeAnyWork.some((step) => step.includes("arcigy.get_jarvis_capability_audit") && step.includes("arcigy.get_production_completion_score") && step.includes("quick-start coverage") && step.includes("completion percent")));
    assert.ok(remotePackBody.agentLaunchBundle.proofPolicy.beforeAnyWork.some((step) => step.includes("status=ready") && step.includes("all 37 required remote MCP smoke gates")));
    assert.ok(remotePackBody.agentLaunchBundle.proofPolicy.beforeWrites.some((step) => step.includes("approval.approved=true")));
    assert.ok(remotePackBody.agentLaunchBundle.safetyRails.some((rail) => rail.includes("OAuth refresh tokens")));
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.method === "POST" && call.url.endsWith(`/api/mcp/${call.tool}`)));
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.approvalRequired === remotePackBody.tools.approvalRequired.includes(call.tool)));
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.exactMcpCall.tool === call.tool && call.exactMcpCall.url === call.url));
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.exactMcpCall.method === call.method && call.exactMcpCall.approvalRequired === call.approvalRequired));
    assert.ok(remotePackBody.quickStartCalls.every((call) => JSON.stringify(call.exactMcpCall.body) === JSON.stringify(call.body)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_production_verification_evidence" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_production_completion_score" && call.body.live === false && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_jarvis_capability_audit" && call.body.live === false && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_proactive_attention_digest" && call.body.syncGmail === false && call.approvalRequired === false));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.jarvis_voice_event" &&
          call.approvalRequired === false &&
          call.body.text === "Jarvis capability audit" &&
          (call.body.session as { state?: string; wakeWord?: string } | undefined)?.wakeWord === "jarvis"
      )
    );
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.identify_email" && typeof call.body.email === "string"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_client_need_alerts" && call.body.status === "new"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_audit_events" && call.body.limit === 20));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.append_leads_to_google_sheet"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.replace_google_sheet_rows"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.send_approved_outreach_reply"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.label_gmail_thread"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.send_slack_message"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.upsert_local_niche"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.record_local_niche_run"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.apply_local_lead_register_update"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.upsert_smartlead_campaign_webhook"));
    assert.ok(remotePackBody.tools.localStateWrite.includes("arcigy.sync_gmail_recent_messages"));
    assert.ok(remotePackBody.tools.localStateWrite.includes("arcigy.prepare_positive_outreach_reply"));
    assert.equal(remotePackBody.tools.readOnlyOrDraft.includes("arcigy.ingest_client_message"), false);
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.run_remote_mcp_smoke" && call.approvalRequired === false));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.jarvis_voice_event" &&
          call.approvalRequired === false &&
          call.body.text === "Jarvis production evidence" &&
          (call.body.session as { state?: string; wakeWord?: string } | undefined)?.state === "idle"
      )
    );
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.jarvis_voice_event" &&
          call.approvalRequired === false &&
          call.body.text === "Jarvis full launch proof" &&
          (call.body.session as { state?: string; wakeWord?: string } | undefined)?.wakeWord === "jarvis"
      )
    );
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.jarvis_voice_event" &&
          call.approvalRequired === false &&
          call.body.text === "Jarvis integracie" &&
          (call.body.session as { state?: string; wakeWord?: string } | undefined)?.wakeWord === "jarvis"
      )
    );
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_outreach_brief" && !("campaignId" in call.body)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.upsert_local_niche" && call.approvalRequired === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_local_niche_queue" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.record_local_niche_run" && call.approvalRequired === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_local_lead_register_update_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.apply_local_lead_register_update" && call.approvalRequired === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_outreach_contact_selection_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_failed_scrape_recovery_queue_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_daily_leadgen_run_closure_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_sticky_niche_leadgen_decision_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_leadgen_run_resume_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_gmail_name_enrichment_queue_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_lead_identity_repair_preview" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_lead_validation_scorecard_preview" && call.approvalRequired === false && call.body.minScore === 70));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_campaign_webhooks" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_email_accounts" && call.body.requestedDailyLimit === 80 && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_smartlead_local_reconciliation_preview" && call.approvalRequired === false && Array.isArray(call.body.localLeads)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_leadgen_to_smartlead_dispatch_preview" && call.approvalRequired === false && Array.isArray(call.body.groups)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_maps_city_sweep_preview" && call.approvalRequired === false && call.body.niche === "fotovoltaika"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_international_market_leadgen_preview" && call.approvalRequired === false && call.body.country === "AU"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_company_research_queue_preview" && call.approvalRequired === false && Array.isArray(call.body.leads)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_research_results_import_preview" && call.approvalRequired === false && Array.isArray(call.body.placesResults)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_maps_cold_calling_export_preview" && call.approvalRequired === false && Array.isArray(call.body.placesResults)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_bulk_smartlead_upload_queue_preview" && call.approvalRequired === false && Array.isArray(call.body.campaigns)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_smartlead_send_readiness_queue_preview" && call.approvalRequired === false && Array.isArray(call.body.campaigns)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_bulk_ai_intro_work_queue_preview" && call.approvalRequired === false && Array.isArray(call.body.groups)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_phone_enrichment_writeback_preview" && call.approvalRequired === false && Array.isArray(call.body.scrapedResults)));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.upsert_smartlead_campaign_webhook" &&
          call.approvalRequired === true &&
          (call.body.approval as { approved?: boolean } | undefined)?.approved === true
      )
    );
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.prepare_positive_outreach_reply" && call.body.leadEmail === "lead@example.com"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.send_approved_outreach_reply" && call.approvalRequired === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.sync_gmail_recent_messages" && call.body.dryRun === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_gmail_lead_context" && call.body.leadEmail === "lead@example.com"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.lookup_public_email_profile" && call.body.email === "jan.novak@example.com"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_gmail_unread_triage" && call.body.query === "is:unread category:primary"));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.send_slack_message" &&
          call.approvalRequired === true &&
          (call.body.approval as { approved?: boolean } | undefined)?.approved === true
      )
    );
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) =>
          call.tool === "arcigy.label_gmail_thread" &&
          call.approvalRequired === true &&
          (call.body.approval as { approved?: boolean } | undefined)?.approved === true
      )
    );
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_ai_intro_import_preview" && typeof call.body.resultJsonText === "string"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_ai_icebreaker_writeback_preview" && call.approvalRequired === false && typeof call.body.resultJsonText === "string"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_flagged_lead_review_preview" && call.approvalRequired === false && typeof call.body.csvText === "string"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_showcase_reply_preview" && call.approvalRequired === false && call.body.leadEmail === "lead@example.com"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_company_short_name_preview" && call.approvalRequired === false && Array.isArray(call.body.leads)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_leadgen_db_status_preview" && call.approvalRequired === false && Array.isArray(call.body.resumeStates)));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) => call.tool === "arcigy.draft_contract_intake" && call.approvalRequired === false && typeof call.body.brief === "string"
      )
    );
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_pricing_proposal_preview" && call.approvalRequired === false && Array.isArray(call.body.items)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.build_service_capacity_preview" && call.approvalRequired === false && Array.isArray(call.body.services)));
    const contractQuickStart = remotePackBody.quickStartCalls.find((call) => call.tool === "arcigy.generate_contract_documents");
    assert.equal(contractQuickStart?.approvalRequired, true);
    assert.equal((contractQuickStart?.body.approval as { approved?: boolean } | undefined)?.approved, true);
    const contractIntake = contractQuickStart?.body.intake as { client?: { businessName?: string }; project?: { includedModules?: unknown[] }; pricing?: unknown } | undefined;
    assert.equal(contractIntake?.client?.businessName, "Modelovy Klient s. r. o.");
    assert.ok(Array.isArray(contractIntake?.project?.includedModules));
    assert.ok(contractIntake?.pricing);
    assert.doesNotMatch(JSON.stringify(contractQuickStart?.body), /dopln|todo|tbd|xxx|\?\?\?/i);
    assert.equal(remotePackBody.tunnel.secureCommand, "npm run web:tunnel:secure");
    assert.match(remotePackBody.tunnel.statusUrl, /\/api\/secure-tunnel-status$/);
    assert.match(remotePackBody.tunnel.startUrl, /\/api\/start-secure-tunnel$/);
    assert.match(remotePackBody.tunnel.stopUrl, /\/api\/stop-secure-tunnel$/);
    assert.equal(remotePackBody.tunnel.browserStartRequiresStrongToken, true);

    const launchBundle = await fetch(`${baseUrl}/api/remote-agent-launch-bundle`);
    assert.equal(launchBundle.status, 200);
    const launchBundleText = await launchBundle.text();
    assert.equal(launchBundleText.includes("preflight-secret-token"), false);
    const launchBundleBody = JSON.parse(launchBundleText) as {
      mode: string;
      authHeaderPlaceholder: string;
      tools: { count: number };
      connectionPackUrl: string;
      secureTunnelStatus: { ready: boolean; redactedTail?: string };
      productionVerificationEvidence: { tokenValueReturned?: boolean };
      firstPrompts: { Grok: string };
      proofPolicy: { beforeAnyWork: string[]; beforeWrites: string[] };
    };
    assert.equal(launchBundleBody.mode, "remote-agent-launch-bundle");
    assert.equal(launchBundleBody.authHeaderPlaceholder, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
    assert.equal(launchBundleBody.tools.count, listJarvisMcpTools().length);
    assert.match(launchBundleBody.connectionPackUrl, /\/api\/remote-mcp-pack\?includeReadiness=true&live=true$/);
    assert.match(launchBundleBody.firstPrompts.Grok, /arcigy\.get_operator_briefing/);
    assert.ok(launchBundleBody.proofPolicy.beforeAnyWork.some((step) => step.includes("tokenValueReturned=false")));
    assert.ok(launchBundleBody.proofPolicy.beforeAnyWork.some((step) => step.includes("arcigy.get_production_completion_score") && step.includes("quick-start coverage")));
    assert.ok(launchBundleBody.proofPolicy.beforeAnyWork.some((step) => step.includes("status=ready") && step.includes("all 37 required remote MCP smoke gates")));
    assert.ok(launchBundleBody.proofPolicy.beforeWrites.some((step) => step.includes("freshness.fresh=true")));
    assert.equal(JSON.stringify(launchBundleBody.secureTunnelStatus).includes("preflight-secret-token"), false);
    assert.notEqual(launchBundleBody.productionVerificationEvidence.tokenValueReturned, true);

    const mcpRemotePack = await postJson(`${baseUrl}/api/mcp/arcigy.get_remote_mcp_pack`, { includeReadiness: false });
    assert.equal(mcpRemotePack.result.tools.count, listJarvisMcpTools().length);

    const smoke = await fetch(`${baseUrl}/api/remote-mcp-smoke`);
    assert.equal(smoke.status, 200);
    const smokeBody = (await smoke.json()) as { status: string; expectedToolCount: number; checks: Array<{ key: string; status: string }> };
    assert.equal(smokeBody.status, "ready");
    assert.equal(smokeBody.expectedToolCount, listJarvisMcpTools().length);
    assert.ok(smokeBody.checks.some((check) => check.key === "approval-gate" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "action-manifest" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "openapi-schema" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "cors-preflight" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "external-auth-gate" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-auth-throttle-policy" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "secure-tunnel-status" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "manifest-local-write-policy" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-local-write-policy" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-limits" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-contract-quick-start" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-contract-draft-quick-start" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-voice-quick-start" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "voice-tool-call" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "pack-production-evidence-quick-start" && check.status === "ready"));
    assert.ok(smokeBody.checks.some((check) => check.key === "production-evidence-tool-call" && check.status === "ready"));

    const mcpSmoke = await postJson(`${baseUrl}/api/mcp/arcigy.run_remote_mcp_smoke`, {});
    assert.equal(mcpSmoke.result.status, "ready");
    assert.equal(mcpSmoke.result.expectedToolCount, listJarvisMcpTools().length);

    const voice = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voice.status, 200);
    const voiceBody = (await voice.json()) as { shouldStartRecording: boolean };
    assert.equal(voiceBody.shouldStartRecording, true);

    const voiceHealth = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "integracie", session: { state: "awake", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceHealth.status, 200);
    const voiceHealthBody = (await voiceHealth.json()) as { shouldStopRecording: boolean; speakText?: string };
    assert.equal(voiceHealthBody.shouldStopRecording, true);
    assert.match(voiceHealthBody.speakText ?? "", /integracie/i);

    const voiceDirectCommand = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis integracie", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceDirectCommand.status, 200);
    const voiceDirectCommandBody = (await voiceDirectCommand.json()) as { session: { state: string }; shouldStopRecording: boolean; speakText?: string };
    assert.equal(voiceDirectCommandBody.session.state, "idle");
    assert.equal(voiceDirectCommandBody.shouldStopRecording, true);
    assert.match(voiceDirectCommandBody.speakText ?? "", /integracie/i);

    const voiceProduction = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis skontroluj production readiness", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceProduction.status, 200);
    const voiceProductionBody = (await voiceProduction.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceProductionBody.session.state, "idle");
    assert.match(voiceProductionBody.speakText ?? "", /Production readiness/i);

    const voiceFullProof = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis full launch proof", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceFullProof.status, 200);
    const voiceFullProofBody = (await voiceFullProof.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceFullProofBody.session.state, "idle");
    assert.match(voiceFullProofBody.speakText ?? "", /Full launch proof/i);
    assert.match(voiceFullProofBody.speakText ?? "", /Remote MCP pack/i);

    const voiceProductionEvidence = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis precitaj production evidence", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceProductionEvidence.status, 200);
    const voiceProductionEvidenceBody = (await voiceProductionEvidence.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceProductionEvidenceBody.session.state, "idle");
    assert.match(voiceProductionEvidenceBody.speakText ?? "", /Production evidence je ready/i);
    assert.match(voiceProductionEvidenceBody.speakText ?? "", /Release commit 0123456789ab/);

    const voiceCapabilityAudit = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis capability audit co vsetko je pokryte", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceCapabilityAudit.status, 200);
    const voiceCapabilityAuditBody = (await voiceCapabilityAudit.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceCapabilityAuditBody.session.state, "idle");
    assert.match(voiceCapabilityAuditBody.speakText ?? "", /Jarvis capability audit je/i);
    assert.match(voiceCapabilityAuditBody.speakText ?? "", /Coverage:/);
    assert.match(voiceCapabilityAuditBody.speakText ?? "", /MCP: \d+ toolov/);
    assert.doesNotMatch(voiceCapabilityAuditBody.speakText ?? "", /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

    const voiceAttentionDigest = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis co si mam vsimnut", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceAttentionDigest.status, 200);
    const voiceAttentionDigestBody = (await voiceAttentionDigest.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceAttentionDigestBody.session.state, "idle");
    assert.match(voiceAttentionDigestBody.speakText ?? "", /Jarvis attention digest/);
    assert.doesNotMatch(voiceAttentionDigestBody.speakText ?? "", /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

    const voiceCompletionScore = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis na kolko percent sme ready", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceCompletionScore.status, 200);
    const voiceCompletionScoreBody = (await voiceCompletionScore.json()) as { session: { state: string }; speakText?: string };
    assert.equal(voiceCompletionScoreBody.session.state, "idle");
    assert.match(voiceCompletionScoreBody.speakText ?? "", /Sme na \d+% production completion/);
    assert.doesNotMatch(voiceCompletionScoreBody.speakText ?? "", /AIza|GOCSPX|1\/\/|postgresql:\/\/|redis:\/\//);

    const voiceRemoteMcp = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis priprav remote MCP handoff pre Grok", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceRemoteMcp.status, 200);
    const voiceRemoteMcpBody = (await voiceRemoteMcp.json()) as { speakText?: string };
    assert.match(voiceRemoteMcpBody.speakText ?? "", /Remote MCP pack/i);
    assert.match(voiceRemoteMcpBody.speakText ?? "", /bearer placeholder/i);

    const voiceContracts = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis zmluvy", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceContracts.status, 200);
    const voiceContractsBody = (await voiceContracts.json()) as { speakText?: string };
    assert.match(voiceContractsBody.speakText ?? "", /Zmluvny modul je pripraveny/i);

    const voiceGmail = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis skontroluj Gmail inbox", accountEnvKey: "MISSING_TEST_ACCOUNT", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceGmail.status, 200);
    const voiceGmailBody = (await voiceGmail.json()) as { speakText?: string };
    assert.match(voiceGmailBody.speakText ?? "", /Gmail preview/i);

    const dbPath = join(makeRepoTempDir("jarvis-web-"), "memory.db");
    const ingested = await fetch(`${baseUrl}/api/ingest-client-message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dbPath,
        email: "client@example.com",
        subject: "Request",
        text: "Potrebujem upravit onboarding automatizaciu do piatku.",
      }),
    });
    assert.equal(ingested.status, 200);
    const ingestedBody = (await ingested.json()) as { jarvisAlert?: string };
    assert.match(ingestedBody.jarvisAlert ?? "", /Jarvis:/);

    const identified = await fetch(`${baseUrl}/api/identify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, email: "client@example.com" }),
    });
    assert.equal(identified.status, 200);
    const identifiedBody = (await identified.json()) as { person?: { primaryEmail: string }; openNeedSignals: unknown[] };
    assert.equal(identifiedBody.person?.primaryEmail, "client@example.com");
    assert.equal(identifiedBody.openNeedSignals.length, 1);

    const clientAlerts = await fetch(`${baseUrl}/api/client-need-alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, limit: 5 }),
    });
    assert.equal(clientAlerts.status, 200);
    const clientAlertsBody = (await clientAlerts.json()) as { count: number; alerts: Array<{ person: { primaryEmail: string }; needSignal: { id: string } }> };
    assert.equal(clientAlertsBody.count, 1);
    assert.equal(clientAlertsBody.alerts[0].person.primaryEmail, "client@example.com");

    const voiceClientNeeds = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, text: "Jarvis ake su klientske poziadavky", session: { state: "idle", wakeWord: "jarvis" } }),
    });
    assert.equal(voiceClientNeeds.status, 200);
    const voiceClientNeedsBody = (await voiceClientNeeds.json()) as { speakText?: string };
    assert.match(voiceClientNeedsBody.speakText ?? "", /Klientske poziadavky: 1/);
    assert.match(voiceClientNeedsBody.speakText ?? "", /onboarding automatizaciu/);

    const approvalQueue = await fetch(`${baseUrl}/api/approval-queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, limit: 5 }),
    });
    assert.equal(approvalQueue.status, 200);
    const approvalQueueBody = (await approvalQueue.json()) as { count: number; items: Array<{ approvalTool: string }> };
    assert.equal(approvalQueueBody.count, 1);
    assert.equal(approvalQueueBody.items[0].approvalTool, "arcigy.update_client_need_status");

    const memorySnapshot = await fetch(`${baseUrl}/api/local-memory-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, limit: 5 }),
    });
    assert.equal(memorySnapshot.status, 200);
    const memorySnapshotBody = (await memorySnapshot.json()) as { redacted: boolean; counts: { people: number; openClientNeeds: number } };
    assert.equal(memorySnapshotBody.redacted, true);
    assert.equal(memorySnapshotBody.counts.people, 1);
    assert.equal(memorySnapshotBody.counts.openClientNeeds, 1);

    const rejectedSnapshotExport = await fetch(`${baseUrl}/api/export-local-memory-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, outputPath: join("generated", "test-runs", "web-memory-snapshot-unapproved.json") }),
    });
    assert.equal(rejectedSnapshotExport.status, 409);

    const approvedSnapshotExport = await fetch(`${baseUrl}/api/export-local-memory-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dbPath,
        outputPath: join("generated", "test-runs", "web-memory-snapshot.json"),
        approval: { approved: true },
      }),
    });
    assert.equal(approvedSnapshotExport.status, 200);
    const approvedSnapshotExportBody = (await approvedSnapshotExport.json()) as { status: string; redacted: boolean; outputPath: string };
    assert.equal(approvedSnapshotExportBody.status, "exported");
    assert.equal(approvedSnapshotExportBody.redacted, true);
    assert.equal(existsSync(approvedSnapshotExportBody.outputPath), true);

    const voiceApprovalQueue = await fetch(`${baseUrl}/api/jarvis/voice-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dbPath,
        text: "co caka na moje potvrdenie",
        session: { state: "awake", wakeWord: "jarvis" },
      }),
    });
    assert.equal(voiceApprovalQueue.status, 200);
    const voiceApprovalQueueBody = (await voiceApprovalQueue.json()) as { shouldStopRecording: boolean; speakText?: string };
    assert.equal(voiceApprovalQueueBody.shouldStopRecording, true);
    assert.match(voiceApprovalQueueBody.speakText ?? "", /Na tvoje potvrdenie caka 1/);
    assert.match(voiceApprovalQueueBody.speakText ?? "", /arcigy\.update_client_need_status/);
    assert.match(voiceApprovalQueueBody.speakText ?? "", /approval\.approved=true/);
    assert.match(voiceApprovalQueueBody.speakText ?? "", /Nic neposlem ani neuzavriem/);

    const memoryOperatorBriefing = await fetch(`${baseUrl}/api/operator-briefing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, periodLabel: "poslednych 7 dni" }),
    });
    assert.equal(memoryOperatorBriefing.status, 200);
    const memoryOperatorBriefingBody = (await memoryOperatorBriefing.json()) as { sections: { clientNeeds: string } };
    assert.match(memoryOperatorBriefingBody.sections.clientNeeds, /client@example\.com/);
    assert.match(memoryOperatorBriefingBody.sections.clientNeeds, /onboarding automatizaciu/);

    const rejectedUpdate = await fetch(`${baseUrl}/api/update-client-need-status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, needSignalId: clientAlertsBody.alerts[0].needSignal.id, status: "resolved" }),
    });
    assert.equal(rejectedUpdate.status, 409);

    const approvedUpdate = await fetch(`${baseUrl}/api/update-client-need-status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, needSignalId: clientAlertsBody.alerts[0].needSignal.id, status: "resolved", approval: { approved: true } }),
    });
    assert.equal(approvedUpdate.status, 200);
    const approvedUpdateBody = (await approvedUpdate.json()) as { needSignal: { status: string } };
    assert.equal(approvedUpdateBody.needSignal.status, "resolved");

    const clearedAlerts = await fetch(`${baseUrl}/api/client-need-alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, limit: 5 }),
    });
    assert.equal(clearedAlerts.status, 200);
    const clearedAlertsBody = (await clearedAlerts.json()) as { count: number };
    assert.equal(clearedAlertsBody.count, 0);
  } finally {
    if (previousEvidence === null) rmSync(evidencePath, { force: true });
    else writeFileSync(evidencePath, previousEvidence, "utf-8");
    if (previousWebToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousWebToken;
    if (previousApiSecret === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = previousApiSecret;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

function remoteSmokeRequiredGateFixture() {
  return [
    "manifest",
    "tool-count",
    "manifest-tool-registry",
    "manifest-tool-metadata",
    "auth-placeholder",
    "manifest-local-write-policy",
    "action-manifest",
    "openapi-schema",
    "cors-preflight",
    "external-auth-gate",
    "connection-pack",
    "pack-secret-policy",
    "pack-auth-throttle-policy",
    "pack-limits",
    "pack-tunnel-controls",
    "secure-tunnel-status",
    "pack-local-write-policy",
    "pack-tool-registry",
    "pack-quick-start-urls",
    "pack-quick-start-approval-policy",
    "pack-quick-start-exact-mcp-calls",
    "pack-contract-quick-start",
    "pack-contract-draft-quick-start",
    "pack-agent-setup-profiles",
    "pack-agent-launch-bundle",
    "pack-voice-quick-start",
    "pack-handoff-proof",
    "pack-agent-compatibility",
    "pack-client-memory-quick-start",
    "pack-audit-quick-start",
    "voice-tool-call",
    "pack-production-evidence-quick-start",
    "read-only-tool-call",
    "production-evidence-tool-call",
    "approval-gate",
    "approval-shape-gate",
    "secret-redaction",
  ];
}

async function postJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.status !== 200) {
    assert.fail(await response.text());
  }
  return (await response.json()) as { result: any };
}

function makeRepoTempDir(prefix: string) {
  const base = join(process.cwd(), "generated", "test-runs");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

test("local web bridge requires bearer auth on external hosts", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  process.env.JARVIS_WEB_TOKEN = "test-token";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const preflight = await fetch(`${baseUrl}/api/mcp/arcigy.get_operator_briefing`, {
      method: "OPTIONS",
      headers: {
        origin: "https://chat.openai.com",
        "x-forwarded-host": "jarvis.example.ngrok-free.app",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/);
    assert.equal(preflight.headers.get("cache-control"), "no-store");

    const denied = await fetch(`${baseUrl}/api/system-health`, {
      headers: { "x-forwarded-host": "jarvis.example.ngrok-free.app" },
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("access-control-allow-origin"), "*");
    assert.equal(denied.headers.get("x-content-type-options"), "nosniff");

    const allowed = await fetch(`${baseUrl}/api/system-health`, {
      headers: {
        "x-forwarded-host": "jarvis.example.ngrok-free.app",
        authorization: "Bearer test-token",
      },
    });
    assert.equal(allowed.status, 200);

    const deniedManifest = await fetch(`${baseUrl}/.well-known/arcigy-jarvis.json`, {
      headers: { "x-forwarded-host": "jarvis.example.ngrok-free.app" },
    });
    assert.equal(deniedManifest.status, 401);

    const allowedManifest = await fetch(`${baseUrl}/.well-known/arcigy-jarvis.json`, {
      headers: {
        "x-forwarded-host": "jarvis.example.ngrok-free.app",
        "x-forwarded-proto": "https",
        authorization: "Bearer test-token",
      },
    });
    assert.equal(allowedManifest.status, 200);
    const manifest = (await allowedManifest.json()) as { baseUrl: string; endpoints: { mcpTools: string } };
    assert.equal(manifest.baseUrl, "https://jarvis.example.ngrok-free.app");
    assert.equal(manifest.endpoints.mcpTools, "https://jarvis.example.ngrok-free.app/api/mcp");

    const deniedActionManifest = await fetch(`${baseUrl}/.well-known/ai-plugin.json`, {
      headers: { "x-forwarded-host": "jarvis.example.ngrok-free.app" },
    });
    assert.equal(deniedActionManifest.status, 401);

    const allowedActionManifest = await fetch(`${baseUrl}/.well-known/ai-plugin.json`, {
      headers: {
        "x-forwarded-host": "jarvis.example.ngrok-free.app",
        "x-forwarded-proto": "https",
        authorization: "Bearer test-token",
      },
    });
    assert.equal(allowedActionManifest.status, 200);
    const actionManifest = (await allowedActionManifest.json()) as { api: { url: string } };
    assert.equal(actionManifest.api.url, "https://jarvis.example.ngrok-free.app/api/openapi.json");
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge exposes OAuth code flow for ChatGPT MCP connectors", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const previousSecret = process.env.JARVIS_OAUTH_CLIENT_SECRET;
  process.env.JARVIS_WEB_TOKEN = "oauth-chatgpt-token-with-enough-length";
  delete process.env.JARVIS_OAUTH_CLIENT_SECRET;
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const metadata = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    assert.equal(metadata.status, 200);
    const metadataBody = (await metadata.json()) as { authorization_endpoint: string; token_endpoint: string };
    assert.equal(metadataBody.authorization_endpoint, `${baseUrl}/oauth/authorize`);
    assert.equal(metadataBody.token_endpoint, `${baseUrl}/oauth/token`);

    const redirectUri = "https://chatgpt.com/connector/oauth/test";
    const authorize = await fetch(
      `${baseUrl}/oauth/authorize?response_type=code&client_id=arcigy-chatgpt&redirect_uri=${encodeURIComponent(redirectUri)}&state=abc`,
      { redirect: "manual" }
    );
    assert.equal(authorize.status, 302);
    const redirected = new URL(authorize.headers.get("location") ?? "");
    assert.equal(`${redirected.origin}${redirected.pathname}`, redirectUri);
    assert.equal(redirected.searchParams.get("state"), "abc");
    const code = redirected.searchParams.get("code");
    assert.ok(code);

    const token = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "arcigy-chatgpt",
        redirect_uri: redirectUri,
      }),
    });
    assert.equal(token.status, 200);
    const tokenBody = (await token.json()) as { access_token: string; token_type: string };
    assert.equal(tokenBody.token_type, "Bearer");
    assert.equal(tokenBody.access_token, "oauth-chatgpt-token-with-enough-length");

    const manifest = await fetch(`${baseUrl}/.well-known/arcigy-jarvis.json`, {
      headers: {
        "x-forwarded-host": "jarvis.example",
        authorization: `Bearer ${tokenBody.access_token}`,
      },
    });
    assert.equal(manifest.status, 200);
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.JARVIS_OAUTH_CLIENT_SECRET;
    else process.env.JARVIS_OAUTH_CLIENT_SECRET = previousSecret;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge exposes Streamable HTTP MCP for ChatGPT action refresh", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  process.env.JARVIS_WEB_TOKEN = "streamable-mcp-token-with-enough-length";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: "Bearer streamable-mcp-token-with-enough-length",
    "x-forwarded-host": "jarvis.example",
  };

  try {
    const unauthenticated = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "x-forwarded-host": "jarvis.example", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list", params: {} }),
    });
    assert.equal(unauthenticated.status, 401);
    assert.match(unauthenticated.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/jarvis\.example\/\.well-known\/oauth-protected-resource"/);

    const initialize = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "chatgpt-test", version: "0" },
        },
      }),
    });
    assert.equal(initialize.status, 200);
    const initializeBody = (await initialize.json()) as { result: { serverInfo: { name: string }; capabilities: Record<string, unknown> } };
    assert.equal(initializeBody.result.serverInfo.name, "arcigy-jarvis-local");
    assert.ok(initializeBody.result.capabilities.tools);

    const tools = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    assert.equal(tools.status, 200);
    const toolsBody = (await tools.json()) as { result: { tools: Array<{ name: string }> } };
    assert.equal(toolsBody.result.tools.length, listJarvisMcpTools().length);
    assert.equal(toolsBody.result.tools[0]?.name, "arcigy.generate_contract_documents");
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge throttles repeated external auth failures", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const previousLimit = process.env.JARVIS_AUTH_FAILURE_LIMIT;
  const previousWindow = process.env.JARVIS_AUTH_FAILURE_WINDOW_MS;
  process.env.JARVIS_WEB_TOKEN = "rate-limit-token";
  process.env.JARVIS_AUTH_FAILURE_LIMIT = "2";
  process.env.JARVIS_AUTH_FAILURE_WINDOW_MS = "60000";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const externalHeaders = {
    "x-forwarded-host": "rate-limit.example.ngrok-free.app",
    "x-forwarded-for": "203.0.113.44",
  };

  try {
    const first = await fetch(`${baseUrl}/api/system-health`, { headers: externalHeaders });
    assert.equal(first.status, 401);
    const second = await fetch(`${baseUrl}/api/system-health`, { headers: externalHeaders });
    assert.equal(second.status, 401);
    const third = await fetch(`${baseUrl}/api/system-health`, { headers: externalHeaders });
    assert.equal(third.status, 429);
    assert.equal(third.headers.get("retry-after"), "60");

    const allowed = await fetch(`${baseUrl}/api/system-health`, {
      headers: { ...externalHeaders, authorization: "Bearer rate-limit-token" },
    });
    assert.equal(allowed.status, 200);

    const afterClear = await fetch(`${baseUrl}/api/system-health`, { headers: externalHeaders });
    assert.equal(afterClear.status, 401);
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    if (previousLimit === undefined) delete process.env.JARVIS_AUTH_FAILURE_LIMIT;
    else process.env.JARVIS_AUTH_FAILURE_LIMIT = previousLimit;
    if (previousWindow === undefined) delete process.env.JARVIS_AUTH_FAILURE_WINDOW_MS;
    else process.env.JARVIS_AUTH_FAILURE_WINDOW_MS = previousWindow;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge preflight reports tunnel readiness without leaking secrets", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const previousApiSecret = process.env.API_SECRET_KEY;
  const weakSecretValue = "preflight-secret-token";
  const secretValue = "preflight-secret-token-with-strong-length";
  delete process.env.JARVIS_WEB_TOKEN;
  process.env.API_SECRET_KEY = "dummy";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unconfigured = await fetch(`${baseUrl}/api/web-bridge-preflight`);
    assert.equal(unconfigured.status, 200);
    const unconfiguredBody = (await unconfigured.json()) as { tokenConfigured: boolean; readyForTunnel: boolean; warnings: string[] };
    assert.equal(unconfiguredBody.tokenConfigured, false);
    assert.equal(unconfiguredBody.readyForTunnel, false);
    assert.ok(unconfiguredBody.warnings.some((warning) => warning.includes("JARVIS_WEB_TOKEN")));

    process.env.JARVIS_WEB_TOKEN = weakSecretValue;
    const weak = await fetch(`${baseUrl}/api/web-bridge-preflight`);
    assert.equal(weak.status, 200);
    const weakText = await weak.text();
    assert.equal(weakText.includes(weakSecretValue), false);
    const weakBody = JSON.parse(weakText) as { tokenConfigured: boolean; tokenStrong: boolean; readyForTunnel: boolean; warnings: string[] };
    assert.equal(weakBody.tokenConfigured, true);
    assert.equal(weakBody.tokenStrong, false);
    assert.equal(weakBody.readyForTunnel, false);
    assert.ok(weakBody.warnings.some((warning) => warning.includes("at least 32 characters")));

    process.env.JARVIS_WEB_TOKEN = secretValue;
    const configured = await fetch(`${baseUrl}/api/web-bridge-preflight`);
    assert.equal(configured.status, 200);
    const configuredText = await configured.text();
    assert.equal(configuredText.includes(secretValue), false);
    const body = JSON.parse(configuredText) as {
      tokenConfigured: boolean;
      tokenStrong: boolean;
      readyForTunnel: boolean;
      manifestUrl: string;
      actionManifestUrl: string;
      openApiSchemaUrl: string;
      tunnelCommand: string;
      tunnelProvider: string;
      mcpToolCount: number;
      riskyToolsRequiringApproval: string[];
      pathPolicy: string;
      maxJsonBytes: number;
    };
    assert.equal(body.tokenConfigured, true);
    assert.equal(body.tokenStrong, true);
    assert.equal(body.readyForTunnel, true);
    assert.match(body.manifestUrl, /\/\.well-known\/arcigy-jarvis\.json$/);
    assert.match(body.actionManifestUrl, /\/\.well-known\/ai-plugin\.json$/);
    assert.match(body.openApiSchemaUrl, /\/api\/openapi\.json$/);
    assert.equal(body.tunnelCommand, "npm run web:tunnel");
    assert.equal(body.tunnelProvider, "ngrok");
    assert.ok(body.mcpToolCount >= 28);
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.generate_contract_documents"));
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.approve_prepared_outreach_reply"));
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.send_approved_outreach_reply"));
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.append_leads_to_google_sheet"));
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.replace_google_sheet_rows"));
    assert.equal(body.pathPolicy, "repo-only");
    assert.equal(body.maxJsonBytes > 0, true);
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    if (previousApiSecret === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = previousApiSecret;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge reports secure tunnel status without leaking one-time token", async () => {
  const logPath = join(process.cwd(), "generated", "jarvis-secure-tunnel.log");
  const previousLog = existsSync(logPath) ? readFileSync(logPath, "utf-8") : null;
  mkdirSync(join(process.cwd(), "generated"), { recursive: true });
  const token = "temporary-test-token-that-must-not-leak";
  const publicUrl = "https://jarvis-status-test.ngrok-free.app";
  writeFileSync(
    logPath,
    [
      "Arcigy Jarvis tunnel is ready.",
      `External manifest: ${publicUrl}/.well-known/arcigy-jarvis.json`,
      `External connection pack: ${publicUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`,
      `External smoke test: ${publicUrl}/api/remote-mcp-smoke`,
      `External MCP tool pattern: ${publicUrl}/api/mcp/{toolName}`,
      "Smoke: Remote MCP smoke ready.",
      `One-time token: ${token}`,
    ].join("\n"),
    "utf-8"
  );
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/secure-tunnel-status`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(token), false);
    const body = JSON.parse(text) as {
      ready: boolean;
      tokenPresent: boolean;
      publicUrl: string;
      manifestUrl: string;
      actionManifestUrl: string;
      openApiSchemaUrl: string;
      connectionPackUrl: string;
      smokeUrl: string;
      mcpToolCallPattern: string;
      redactedTail: string;
    };
    assert.equal(body.ready, true);
    assert.equal(body.tokenPresent, true);
    assert.equal(body.publicUrl, publicUrl);
    assert.equal(body.manifestUrl, `${publicUrl}/.well-known/arcigy-jarvis.json`);
    assert.equal(body.actionManifestUrl, `${publicUrl}/.well-known/ai-plugin.json`);
    assert.equal(body.openApiSchemaUrl, `${publicUrl}/api/openapi.json`);
    assert.equal(body.connectionPackUrl, `${publicUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`);
    assert.equal(body.smokeUrl, `${publicUrl}/api/remote-mcp-smoke`);
    assert.equal(body.mcpToolCallPattern, `${publicUrl}/api/mcp/{toolName}`);
    assert.match(body.redactedTail, /One-time token: \[redacted\]/);

    const manifest = await fetch(`${baseUrl}/.well-known/arcigy-jarvis.json`);
    const manifestBody = (await manifest.json()) as { endpoints: { secureTunnelStatus: string } };
    assert.equal(manifestBody.endpoints.secureTunnelStatus, `${baseUrl}/api/secure-tunnel-status`);
  } finally {
    if (previousLog === null) rmSync(logPath, { force: true });
    else writeFileSync(logPath, previousLog, "utf-8");
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge tunnel start requires a strong token", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const previousApiSecret = process.env.API_SECRET_KEY;
  delete process.env.JARVIS_WEB_TOKEN;
  process.env.API_SECRET_KEY = "dummy";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const start = await fetch(`${baseUrl}/api/start-secure-tunnel`, { method: "POST", body: "{}" });
    assert.equal(start.status, 200);
    const startText = await start.text();
    assert.doesNotMatch(startText, /dummy/);
    const startBody = JSON.parse(startText) as { started: boolean; requiresToken: boolean; command: string; reason: string };
    assert.equal(startBody.started, false);
    assert.equal(startBody.requiresToken, true);
    assert.equal(startBody.command, "npm run web:tunnel");
    assert.match(startBody.reason, /JARVIS_WEB_TOKEN/);

    const stop = await fetch(`${baseUrl}/api/stop-secure-tunnel`, { method: "POST", body: "{}" });
    assert.equal(stop.status, 200);
    const stopBody = (await stop.json()) as { stopped: boolean; wasRunning: boolean };
    assert.equal(stopBody.stopped, false);
    assert.equal(stopBody.wasRunning, false);
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    if (previousApiSecret === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = previousApiSecret;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge rejects malformed or oversized JSON bodies", async () => {
  const previousLimit = process.env.JARVIS_MAX_JSON_BYTES;
  process.env.JARVIS_MAX_JSON_BYTES = "64";
  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const malformed = await fetch(`${baseUrl}/api/run-diagnostics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformed.status, 400);
    const malformedBody = (await malformed.json()) as { error: string };
    assert.match(malformedBody.error, /valid JSON/);

    const oversized = await fetch(`${baseUrl}/api/run-diagnostics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(200) }),
    });
    assert.equal(oversized.status, 413);
    const oversizedBody = (await oversized.json()) as { error: string };
    assert.match(oversizedBody.error, /exceeds/);
  } finally {
    if (previousLimit === undefined) delete process.env.JARVIS_MAX_JSON_BYTES;
    else process.env.JARVIS_MAX_JSON_BYTES = previousLimit;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge MCP AI reply preserves prompt options", async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const geminiBodies: unknown[] = [];
  process.env.GEMINI_API_KEY = "gemini";
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      geminiBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Prepared reply." }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const reply = await postJson(`${baseUrl}/api/mcp/arcigy.generate_ai_reply`, {
      clientName: "ACME Board",
      message: "Please send a concise update.",
      context: "Renewal conversation.",
      language: "en",
      tone: "warm",
    });

    assert.equal(reply.result.text, "Prepared reply.");
    const requestText = JSON.stringify(geminiBodies[0]);
    assert.match(requestText, /Klient: ACME Board/);
    assert.match(requestText, /Jazyk odpovede: en/);
    assert.match(requestText, /Ton: warm/);
    assert.match(requestText, /BEGIN UNTRUSTED CLIENT CONTEXT/);
    assert.match(requestText, /Renewal conversation/);
    assert.match(requestText, /BEGIN UNTRUSTED CLIENT MESSAGE/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge prepares positive outreach replies with Gemini and stores approval draft", async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousRefresh = process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const geminiBodies: unknown[] = [];
  const gmailBodies: unknown[] = [];
  process.env.GEMINI_API_KEY = "gemini";
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP = "refresh";
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      geminiBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Dakujem za reakciu, navrhujem kratky 15-min call." }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (target.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "access-token" }), { headers: { "content-type": "application/json" } });
    }
    if (target.includes("/messages/send")) {
      gmailBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "gmail-web-sent-1", threadId: "thread-web-1" }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const testRunDir = join(process.cwd(), "generated", "test-runs");
  mkdirSync(testRunDir, { recursive: true });
  const dbPath = join(mkdtempSync(join(testRunDir, "jarvis-positive-web-")), "jarvis.db");

  try {
    const prepared = await postJson(`${baseUrl}/api/mcp/arcigy.prepare_positive_outreach_reply`, {
      dbPath,
      leadEmail: "lead@example.com",
      leadName: "Demo Lead",
      positiveSignal: "Lead chce demo a navrhol call.",
      context: "Cold outreach kampan pre automatizacie.",
      subject: "Re: automatizacie",
    });

    assert.equal(prepared.result.status, "prepared");
    assert.equal(prepared.result.replyText, "Dakujem za reakciu, navrhujem kratky 15-min call.");
    assert.equal(prepared.result.preparedReply.eventType, "prepared_reply");
    const requestText = JSON.stringify(geminiBodies[0]);
    assert.match(requestText, /Lead email: lead@example\.com/);
    assert.match(requestText, /Lead chce demo/);

    const pending = await postJson(`${baseUrl}/api/mcp/arcigy.get_prepared_outreach_replies`, {
      dbPath,
      status: "pending",
      limit: 5,
    });
    assert.equal(pending.result.count, 1);
    assert.equal(pending.result.replies[0].replyText, "Dakujem za reakciu, navrhujem kratky 15-min call.");
    assert.equal(pending.result.replies[0].positiveSignal, "Lead chce demo a navrhol call.");

    const unapprovedSend = await fetch(`${baseUrl}/api/mcp/arcigy.send_approved_outreach_reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dbPath, preparedEventId: prepared.result.preparedReply.id }),
    });
    assert.equal(unapprovedSend.status, 409);

    await postJson(`${baseUrl}/api/mcp/arcigy.approve_prepared_outreach_reply`, {
      dbPath,
      preparedEventId: prepared.result.preparedReply.id,
      approval: { approved: true },
    });
    const sent = await postJson(`${baseUrl}/api/mcp/arcigy.send_approved_outreach_reply`, {
      dbPath,
      preparedEventId: prepared.result.preparedReply.id,
      approval: { approved: true },
      subject: "Re: automatizacie",
    });
    assert.equal(sent.result.status, "sent");
    assert.equal(sent.result.gmail.id, "gmail-web-sent-1");
    assert.equal(sent.result.sentEvent.eventType, "approved_reply_sent");
    assert.equal(gmailBodies.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousRefresh === undefined) delete process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP;
    else process.env.GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP = previousRefresh;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge rejects empty MCP AI reply messages before Gemini", async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch.bind(globalThis);
  let geminiCalls = 0;
  process.env.GEMINI_API_KEY = "gemini";
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      geminiCalls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Should not happen." }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/mcp/arcigy.generate_ai_reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "   ", tone: "warm" }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Client reply message is required/);
    assert.equal(geminiCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge redacts secrets from API error responses", async () => {
  const googleKey = "AI" + "za" + "S" + "y" + "C".repeat(32);
  const providerKey = ["aaaaaaaa", "bbbb", "cccc", "dddd", "eeeeeeeeeeee"].join("-") + "_ehpdn6s";
  const databaseUrl = "postgresql://postgres:super-private@example.com:5432/db";
  const envKeys = [
    "GEMINI_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP",
    "GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP",
    "SMARTLEAD_API_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "GOOGLE_SHEET_ID",
    "GOOGLE_MAPS_API_KEY",
    "GOOGLE_MAPS_API_KEYS",
    "SERPER_API_KEY",
    "SERPER_API_KEY_2",
  ];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch.bind(globalThis);
  for (const key of envKeys) delete process.env[key];
  process.env.GEMINI_API_KEY = "gemini";
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("generativelanguage.googleapis.com")) {
      throw new Error(`provider failed with ${googleKey} ${providerKey} ${databaseUrl}`);
    }
    return originalFetch(input, init);
  };

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/run-diagnostics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: true }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(googleKey), false);
    assert.equal(text.includes(providerKey), false);
    assert.equal(text.includes("super-private"), false);
    assert.match(text, /\[redacted-google-api-key\]/);
    assert.match(text, /\[redacted-provider-key\]/);
    assert.match(text, /postgresql:\/\/postgres:\[redacted\]@example\.com/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

type OpenApiPathFixture = {
  post: {
    "x-arcigy-requiresApproval"?: boolean;
    requestBody: {
      content: {
        "application/json": {
          examples: {
            quickStart: {
              value: Record<string, any>;
            };
          };
        };
      };
    };
  };
};
