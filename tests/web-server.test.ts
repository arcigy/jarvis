import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createLocalApiServer } from "../src/server/local-api-server.ts";

test("local web bridge serves UI and API health", async () => {
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
      endpoints: { mcpToolCallPattern: string };
      tools: Array<{ name: string; method: string; url: string }>;
    };
    assert.equal(manifest.auth.type, "bearer");
    assert.equal(manifest.auth.requiredForExternalHosts, true);
    assert.match(manifest.endpoints.mcpToolCallPattern, /\/api\/mcp\/\{toolName\}$/);
    assert.ok(manifest.tools.some((tool) => tool.name === "arcigy.draft_contract_intake" && tool.method === "POST"));

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

    const unapprovedSheetExport = await fetch(`${baseUrl}/api/mcp/arcigy.append_leads_to_google_sheet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [["ACME", "https://example.com"]] }),
    });
    assert.equal(unapprovedSheetExport.status, 409);

    const contractTool = await postJson(`${baseUrl}/api/mcp/arcigy.generate_contract_documents`, {
      approval: { approved: true },
      intake: JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8")),
      outputDir: contractOutputDir,
    });
    assert.match(String(contractTool.result), /generation-manifest\.json/);

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
    const readinessBody = (await readiness.json()) as { status: string; mcp: { toolCount: number }; nextActions: string[]; fixGuide: unknown[] };
    assert.ok(["ready", "attention", "blocked"].includes(readinessBody.status));
    assert.equal(readinessBody.mcp.toolCount, 26);
    assert.ok(Array.isArray(readinessBody.nextActions));
    assert.ok(Array.isArray(readinessBody.fixGuide));

    const mcpReadiness = await postJson(`${baseUrl}/api/mcp/arcigy.get_production_readiness`, { live: false });
    assert.equal(mcpReadiness.result.mcp.toolCount, 26);
    assert.ok(Array.isArray(mcpReadiness.result.fixGuide));

    const remotePack = await fetch(`${baseUrl}/api/remote-mcp-pack?includeReadiness=false`);
    assert.equal(remotePack.status, 200);
    const remotePackText = await remotePack.text();
    assert.equal(remotePackText.includes("preflight-secret-token"), false);
    const remotePackBody = JSON.parse(remotePackText) as {
      manifestUrl: string;
      smokeTestUrl: string;
      mcpToolCallPattern: string;
      auth: { header: string; tokenValueReturned: boolean };
      tools: { count: number; approvalRequired: string[] };
      quickStartCalls: Array<{ tool: string; approvalRequired: boolean }>;
      tunnel: { secureCommand: string };
    };
    assert.match(remotePackBody.manifestUrl, /\/\.well-known\/arcigy-jarvis\.json$/);
    assert.match(remotePackBody.smokeTestUrl, /\/api\/remote-mcp-smoke$/);
    assert.match(remotePackBody.mcpToolCallPattern, /\/api\/mcp\/\{toolName\}$/);
    assert.equal(remotePackBody.auth.header, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
    assert.equal(remotePackBody.auth.tokenValueReturned, false);
    assert.equal(remotePackBody.tools.count, 26);
    assert.ok(remotePackBody.tools.approvalRequired.includes("arcigy.append_leads_to_google_sheet"));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.run_remote_mcp_smoke" && call.approvalRequired === false));
    assert.ok(remotePackBody.quickStartCalls.some((call) => call.tool === "arcigy.generate_contract_documents" && call.approvalRequired === true));
    assert.equal(remotePackBody.tunnel.secureCommand, "npm run web:tunnel:secure");

    const mcpRemotePack = await postJson(`${baseUrl}/api/mcp/arcigy.get_remote_mcp_pack`, { includeReadiness: false });
    assert.equal(mcpRemotePack.result.tools.count, 26);

    const smoke = await fetch(`${baseUrl}/api/remote-mcp-smoke`);
    assert.equal(smoke.status, 200);
    const smokeBody = (await smoke.json()) as { status: string; expectedToolCount: number; checks: Array<{ key: string; status: string }> };
    assert.equal(smokeBody.status, "ready");
    assert.equal(smokeBody.expectedToolCount, 26);
    assert.ok(smokeBody.checks.some((check) => check.key === "approval-gate" && check.status === "ready"));

    const mcpSmoke = await postJson(`${baseUrl}/api/mcp/arcigy.run_remote_mcp_smoke`, {});
    assert.equal(mcpSmoke.result.status, "ready");
    assert.equal(mcpSmoke.result.expectedToolCount, 26);

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
    const clientAlertsBody = (await clientAlerts.json()) as { count: number; alerts: Array<{ person: { primaryEmail: string } }> };
    assert.equal(clientAlertsBody.count, 1);
    assert.equal(clientAlertsBody.alerts[0].person.primaryEmail, "client@example.com");
  } finally {
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
    const denied = await fetch(`${baseUrl}/api/system-health`, {
      headers: { "x-forwarded-host": "jarvis.example.ngrok-free.app" },
    });
    assert.equal(denied.status, 401);

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
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("local web bridge preflight reports tunnel readiness without leaking secrets", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const previousApiSecret = process.env.API_SECRET_KEY;
  const secretValue = "preflight-secret-token";
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

    process.env.JARVIS_WEB_TOKEN = secretValue;
    const configured = await fetch(`${baseUrl}/api/web-bridge-preflight`);
    assert.equal(configured.status, 200);
    const configuredText = await configured.text();
    assert.equal(configuredText.includes(secretValue), false);
    const body = JSON.parse(configuredText) as {
      tokenConfigured: boolean;
      readyForTunnel: boolean;
      manifestUrl: string;
      tunnelCommand: string;
      tunnelProvider: string;
      mcpToolCount: number;
      riskyToolsRequiringApproval: string[];
      pathPolicy: string;
      maxJsonBytes: number;
    };
    assert.equal(body.tokenConfigured, true);
    assert.equal(body.readyForTunnel, true);
    assert.match(body.manifestUrl, /\/\.well-known\/arcigy-jarvis\.json$/);
    assert.equal(body.tunnelCommand, "npm run web:tunnel");
    assert.equal(body.tunnelProvider, "ngrok");
    assert.ok(body.mcpToolCount >= 26);
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.generate_contract_documents"));
    assert.ok(body.riskyToolsRequiringApproval.includes("arcigy.approve_prepared_outreach_reply"));
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
