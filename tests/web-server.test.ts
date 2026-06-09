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
      generatedAt: "2026-06-09T06:37:47.066Z",
      webUrl: "http://127.0.0.1:8765",
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
    assert.match(html, /copyRemotePack/);
    assert.match(html, /runRemoteSmoke/);
    assert.match(html, /verificationEvidence/);

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
    assert.match(rendererText, /renderRemoteMcpSmoke/);
    assert.match(rendererText, /renderProductionVerificationEvidence/);
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
    assert.ok(manifest.toolPolicy.localStateWrite.includes("arcigy.sync_gmail_recent_messages"));
    assert.ok(manifest.toolPolicy.localStateWrite.includes("arcigy.prepare_positive_outreach_reply"));
    assert.equal(manifest.toolPolicy.readOnlyOrDraft.includes("arcigy.ingest_client_message"), false);
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.draft_contract_intake" && tool.method === "POST"));
    assert.ok(manifest.tools.every((tool) => tool.method === "POST" && tool.url.endsWith(`/api/mcp/${tool.name}`)));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.generate_contract_documents" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.send_approved_outreach_reply" && tool.approval.required === true && tool.approval.field === "approval.approved"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_smartlead_outreach_brief" && tool.method === "POST"));
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.get_production_verification_evidence" && tool.readOnlyOrDraft === true));
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
    const operatorBriefingBody = (await operatorBriefing.json()) as { speechText: string };
    assert.match(operatorBriefingBody.speechText, /Jarvis briefing/);

    const mcpOperatorBriefing = await postJson(`${baseUrl}/api/mcp/arcigy.get_operator_briefing`, {
      dbPath: mcpDbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    });
    assert.match(mcpOperatorBriefing.result.speechText, /Jarvis briefing/);

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
      launchChecklist: Array<{ id: string; status: string }>;
      launchEvidence: { mode: string; proofGates: Array<{ id: string; validationCommand: string }>; remoteHandoff: { tunnelCommand: string; requiredBeforeExternalAgent: string[] } };
    };
    assert.ok(["ready", "attention", "blocked"].includes(readinessBody.status));
    assert.equal(readinessBody.mcp.toolCount, listJarvisMcpTools().length);
    assert.ok(Array.isArray(readinessBody.nextActions));
    assert.ok(Array.isArray(readinessBody.fixGuide));
    assert.ok(Array.isArray(readinessBody.attentionQueue));
    assert.ok(readinessBody.launchChecklist.some((item) => item.id === "approval-locks" && item.status === "ready"));
    assert.equal(readinessBody.launchEvidence.mode, "production-launch-evidence");
    assert.ok(readinessBody.launchEvidence.proofGates.some((gate) => gate.id === "mcp-registry" && gate.validationCommand === "npm test"));
    assert.equal(readinessBody.launchEvidence.remoteHandoff.tunnelCommand, "npm run web:tunnel:secure");
    assert.ok(readinessBody.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step) => step.includes("/.well-known/ai-plugin.json") && step.includes("/api/openapi.json")));
    assert.ok(readinessBody.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step) => step.includes("cors-preflight") && step.includes("external-auth-gate") && step.includes("secret-redaction")));

    const verificationEvidence = await fetch(`${baseUrl}/api/production-verification-evidence`);
    assert.equal(verificationEvidence.status, 200);
    const verificationEvidenceText = await verificationEvidence.text();
    assert.equal(verificationEvidenceText.includes(syntheticGoogleKey), false);
    const verificationEvidenceBody = JSON.parse(verificationEvidenceText) as { status: string; summary: string; checks: Array<{ name: string; status: string; detail: string }> };
    assert.equal(verificationEvidenceBody.status, "ready");
    assert.match(verificationEvidenceBody.summary, /2 ready, 0 failed/);
    assert.ok(verificationEvidenceBody.checks.some((check) => check.name === "secret-scan" && check.status === "ready"));
    assert.match(verificationEvidenceText, /\[redacted-google-api-key\]/);

    const mcpReadiness = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_readiness`, { live: false });
    assert.equal(mcpReadiness.result.mcp.toolCount, listJarvisMcpTools().length);
    assert.ok(Array.isArray(mcpReadiness.result.fixGuide));
    assert.ok(Array.isArray(mcpReadiness.result.attentionQueue));
    assert.ok(mcpReadiness.result.launchChecklist.some((item: { id: string }) => item.id === "mcp-registry"));
    assert.ok(mcpReadiness.result.launchEvidence.proofGates.some((gate: { id: string }) => gate.id === "approval-locks"));
    assert.ok(mcpReadiness.result.launchEvidence.remoteHandoff.requiredBeforeExternalAgent.some((step: string) => step.includes("action-manifest") || step.includes("/.well-known/ai-plugin.json")));

    const mcpEvidence = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_verification_evidence`, {});
    assert.equal(mcpEvidence.result.status, "ready");
    assert.match(mcpEvidence.result.summary, /2 ready, 0 failed/);
    assert.equal(JSON.stringify(mcpEvidence).includes(syntheticGoogleKey), false);

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
    };
    assert.equal(openApiBody.openapi, "3.1.0");
    assert.equal(openApiBody.servers[0].url, baseUrl);
    assert.equal(openApiBody.components.securitySchemes.bearerAuth.bearerFormat, "JARVIS_WEB_TOKEN");
    assert.equal(Object.keys(openApiBody.paths).length, listJarvisMcpTools().length);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.get_operator_briefing"]);
    assert.ok(openApiBody.paths["/api/mcp/arcigy.generate_contract_documents"]);
    const openApiOperator = openApiBody.paths["/api/mcp/arcigy.get_operator_briefing"] as OpenApiPathFixture;
    const openApiGmailSync = openApiBody.paths["/api/mcp/arcigy.sync_gmail_recent_messages"] as OpenApiPathFixture;
    const openApiContract = openApiBody.paths["/api/mcp/arcigy.generate_contract_documents"] as OpenApiPathFixture;
    assert.equal(openApiOperator.post.requestBody.content["application/json"].examples.quickStart.value.syncGmail, false);
    assert.equal(openApiGmailSync.post.requestBody.content["application/json"].examples.quickStart.value.dryRun, true);
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
      quickStartCalls: Array<{ tool: string; method: string; url: string; approvalRequired: boolean; body: Record<string, unknown> }>;
      handoff: { connectionPackUrl: string; requiredProof: Array<{ key: string; url: string; expected: string }>; agentFirstSteps: string[] };
      agentCompatibility: { supportedAgents: string[]; safetyRules: string[]; requiredBeforeWork: string[] };
      agentPromptTemplates: { claude: string; chatgpt: string; grok: string; generic: string };
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
    assert.ok(remotePackBody.handoff.requiredProof.some((item) => item.key === "remote-smoke" && item.expected.includes("approval-shape-gate")));
    assert.ok(remotePackBody.handoff.agentFirstSteps.some((step) => step.includes("secret-redaction")));
    assert.deepEqual(remotePackBody.agentCompatibility.supportedAgents.slice(0, 3), ["Claude", "ChatGPT", "Grok"]);
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("repo-only limits")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("pack-limits")));
    assert.ok(remotePackBody.agentCompatibility.requiredBeforeWork.some((step) => step.includes("cors-preflight") && step.includes("external-auth-gate") && step.includes("pack-auth-throttle-policy") && step.includes("action-manifest")));
    assert.ok(remotePackBody.agentCompatibility.safetyRules.some((rule) => rule.includes("family-friendly")));
    assert.match(remotePackBody.agentPromptTemplates.grok, /xAI-compatible agents/);
    assert.match(remotePackBody.agentPromptTemplates.grok, /approvalRequired tools/);
    assert.match(remotePackBody.agentPromptTemplates.chatgpt, /POST http:\/\/127\.0\.0\.1:\d+\/api\/mcp\/\{toolName\}/);
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.method === "POST" && call.url.endsWith(`/api/mcp/${call.tool}`)));
    assert.ok(remotePackBody.quickStartCalls.every((call) => call.approvalRequired === remotePackBody.tools.approvalRequired.includes(call.tool)));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_production_verification_evidence" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.identify_email" && typeof call.body.email === "string"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_client_need_alerts" && call.body.status === "new"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.get_audit_events" && call.body.limit === 20));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.append_leads_to_google_sheet"));
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.send_approved_outreach_reply"));
    assert.ok(remotePackBody.tools.localStateWrite.includes("arcigy.sync_gmail_recent_messages"));
    assert.ok(remotePackBody.tools.localStateWrite.includes("arcigy.prepare_positive_outreach_reply"));
    assert.equal(remotePackBody.tools.readOnlyOrDraft.includes("arcigy.ingest_client_message"), false);
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.run_remote_mcp_smoke" && call.approvalRequired === false));
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
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.prepare_positive_outreach_reply" && call.body.leadEmail === "lead@example.com"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.send_approved_outreach_reply" && call.approvalRequired === true));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.sync_gmail_recent_messages" && call.body.dryRun === true));
    assert.ok(
      remotePackBody.quickStartCalls.some(
        (call) => call.tool === "arcigy.draft_contract_intake" && call.approvalRequired === false && typeof call.body.brief === "string"
      )
    );
    const contractQuickStart = remotePackBody.quickStartCalls.find((call) => call.tool === "arcigy.generate_contract_documents");
    assert.equal(contractQuickStart?.approvalRequired, true);
    assert.equal((contractQuickStart?.body.approval as { approved?: boolean } | undefined)?.approved, true);
    const contractIntake = contractQuickStart?.body.intake as { client?: { businessName?: string }; project?: { includedModules?: unknown[] }; pricing?: unknown } | undefined;
    assert.equal(contractIntake?.client?.businessName, "Demo Klient s. r. o.");
    assert.ok(Array.isArray(contractIntake?.project?.includedModules));
    assert.ok(contractIntake?.pricing);
    assert.doesNotMatch(JSON.stringify(contractQuickStart?.body), /dopln|todo|tbd|xxx|\?\?\?/i);
    assert.equal(remotePackBody.tunnel.secureCommand, "npm run web:tunnel:secure");
    assert.match(remotePackBody.tunnel.statusUrl, /\/api\/secure-tunnel-status$/);
    assert.match(remotePackBody.tunnel.startUrl, /\/api\/start-secure-tunnel$/);
    assert.match(remotePackBody.tunnel.stopUrl, /\/api\/stop-secure-tunnel$/);
    assert.equal(remotePackBody.tunnel.browserStartRequiresStrongToken, true);

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
