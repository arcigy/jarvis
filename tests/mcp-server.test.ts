import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createJarvisMcpServer } from "../src/automation-system/mcp-server.ts";

test("Jarvis MCP server lists and calls automation tools", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  assert.ok(names.includes("arcigy.draft_contract_intake"));
  assert.ok(names.includes("arcigy.get_cold_outreach_brief"));
  assert.ok(names.includes("arcigy.get_cold_outreach_brief_from_db"));
  assert.ok(names.includes("arcigy.add_cold_outreach_event"));
  assert.ok(names.includes("arcigy.get_prepared_outreach_replies"));
  assert.ok(names.includes("arcigy.approve_prepared_outreach_reply"));
  assert.ok(names.includes("arcigy.identify_email"));
  assert.ok(names.includes("arcigy.ingest_client_message"));
  assert.ok(names.includes("arcigy.get_client_need_alerts"));
  assert.ok(names.includes("arcigy.jarvis_voice_event"));
  assert.ok(names.includes("arcigy.get_system_health"));
  assert.ok(names.includes("arcigy.run_integration_diagnostics"));
  assert.ok(names.includes("arcigy.get_production_readiness"));
  assert.ok(names.includes("arcigy.get_remote_mcp_pack"));
  assert.ok(names.includes("arcigy.run_remote_mcp_smoke"));
  assert.ok(names.includes("arcigy.get_operator_briefing"));
  assert.ok(names.includes("arcigy.generate_ai_reply"));
  assert.ok(names.includes("arcigy.sync_gmail_recent_messages"));
  assert.ok(names.includes("arcigy.get_smartlead_campaign_status"));
  assert.ok(names.includes("arcigy.get_smartlead_outreach_brief"));
  assert.ok(names.includes("arcigy.search_serper"));
  assert.ok(names.includes("arcigy.search_google_places"));
  assert.ok(names.includes("arcigy.discover_leads"));
  assert.ok(names.includes("arcigy.append_leads_to_google_sheet"));

  const result = await client.callTool({
    name: "arcigy.get_cold_outreach_brief",
    arguments: {
      periodLabel: "dnes",
      contacted: 10,
      opened: 5,
      replied: 2,
      positiveReplies: 1,
      preparedPositiveReplyCount: 1,
      pendingApprovalCount: 1,
    },
  });

  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content[0]?.type === "text" ? content[0].text ?? "" : "";
  assert.match(text, /Za dnes sme napísali 10 ľuďom/);

  const healthResult = await client.callTool({
    name: "arcigy.get_system_health",
    arguments: { format: "json" },
  });
  const health = getStructuredResult(healthResult) as { integrations: Array<{ key: string; configured: boolean }> };
  assert.ok(health.integrations.some((item) => item.key === "gemini"));

  const diagnosticsResult = await client.callTool({
    name: "arcigy.run_integration_diagnostics",
    arguments: { live: false },
  });
  const diagnostics = getStructuredResult(diagnosticsResult) as { live: boolean; checks: Array<{ key: string }> };
  assert.equal(diagnostics.live, false);
  assert.ok(diagnostics.checks.some((item) => item.key === "sqlite"));

  const readinessResult = await client.callTool({
    name: "arcigy.get_production_readiness",
    arguments: { live: false },
  });
  const readiness = getStructuredResult(readinessResult) as { status: string; mcp: { toolCount: number }; nextActions: string[]; fixGuide: unknown[] };
  assert.ok(["ready", "attention", "blocked"].includes(readiness.status));
  assert.equal(readiness.mcp.toolCount, 27);
  assert.ok(Array.isArray(readiness.nextActions));
  assert.ok(Array.isArray(readiness.fixGuide));

  const packResult = await client.callTool({
    name: "arcigy.get_remote_mcp_pack",
    arguments: { baseUrl: "https://jarvis.example.ngrok-free.app", includeReadiness: false },
  });
  const pack = getStructuredResult(packResult) as {
    manifestUrl: string;
    smokeTestUrl: string;
    auth: { header: string; tokenValueReturned: boolean };
    tools: { count: number; approvalRequired: string[] };
    quickStartCalls: Array<{ tool: string; approvalRequired: boolean; body: Record<string, unknown> }>;
    tunnel: { secureCommand: string };
  };
  assert.equal(pack.manifestUrl, "https://jarvis.example.ngrok-free.app/.well-known/arcigy-jarvis.json");
  assert.equal(pack.smokeTestUrl, "https://jarvis.example.ngrok-free.app/api/remote-mcp-smoke");
  assert.equal(pack.auth.header, "Authorization: Bearer <JARVIS_WEB_TOKEN>");
  assert.equal(pack.auth.tokenValueReturned, false);
  assert.equal(pack.tools.count, 27);
  assert.ok(pack.tools.approvalRequired.includes("arcigy.generate_contract_documents"));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.run_remote_mcp_smoke" && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_outreach_brief" && call.approvalRequired === false));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.get_smartlead_outreach_brief" && !("campaignId" in call.body)));
  assert.ok(pack.quickStartCalls.some((call) => call.tool === "arcigy.generate_contract_documents" && call.approvalRequired === true));
  assert.equal(pack.tunnel.secureCommand, "npm run web:tunnel:secure");

  await client.close();
  await server.close();
});

test("Jarvis MCP server persists and identifies local people through SQLite tools", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(mkdtempSync(join(tmpdir(), "jarvis-mcp-db-")), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const upsert = await client.callTool({
    name: "arcigy.upsert_local_person",
    arguments: {
      dbPath,
      kind: "client",
      primaryEmail: "founder@example.com",
      displayName: "Founder",
      companyName: "Example",
    },
  });
  const person = getStructuredResult(upsert) as { id: string };

  await client.callTool({
    name: "arcigy.add_client_need_signal",
    arguments: {
      dbPath,
      personId: person.id,
      summary: "chce pripraviť novú automatizáciu",
      confidence: 0.88,
    },
  });

  const identified = await client.callTool({
    name: "arcigy.identify_email",
    arguments: {
      dbPath,
      email: "founder@example.com",
    },
  });
  const match = getStructuredResult(identified) as {
    reason: string;
    openNeedSignals: Array<{ summary: string }>;
  };

  assert.equal(match.reason, "exact_email_match");
  assert.equal(match.openNeedSignals[0].summary, "chce pripraviť novú automatizáciu");

  const alerts = await client.callTool({
    name: "arcigy.get_client_need_alerts",
    arguments: { dbPath, limit: 5 },
  });
  const alertBody = getStructuredResult(alerts) as { count: number; alerts: Array<{ person: { primaryEmail: string } }> };
  assert.equal(alertBody.count, 1);
  assert.equal(alertBody.alerts[0].person.primaryEmail, "founder@example.com");

  await client.close();
  await server.close();
});

test("Jarvis MCP server generates contracts from inline intake payload", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const outputDir = mkdtempSync(join(tmpdir(), "jarvis-mcp-contracts-"));
  const intake = JSON.parse(readFileSync("docs/contracts/examples/sample-intake.json", "utf-8"));

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: "arcigy.generate_contract_documents",
    arguments: {
      intake,
      outputDir,
    },
  });

  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content[0]?.type === "text" ? content[0].text ?? "" : "";
  assert.match(text, /generation-manifest\.json/);
  assert.equal(existsSync(join(outputDir, "generation-manifest.json")), true);

  await client.close();
  await server.close();
});

test("Jarvis MCP server ingests client messages and returns a need alert", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(mkdtempSync(join(tmpdir(), "jarvis-mcp-message-")), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  await client.callTool({
    name: "arcigy.upsert_local_person",
    arguments: {
      dbPath,
      kind: "client",
      primaryEmail: "founder@example.com",
      displayName: "Founder",
      companyName: "Example",
    },
  });

  const result = await client.callTool({
    name: "arcigy.ingest_client_message",
    arguments: {
      dbPath,
      fromEmail: "founder@example.com",
      source: "email",
      subject: "Report",
      text: "Prosím, priprav nový report pre cold outreach.",
      occurredAt: "2026-06-07T10:00:00Z",
    },
  });
  const ingested = getStructuredResult(result) as {
    jarvisAlert: string;
    needSignal: { summary: string };
    identity: { openNeedSignals: Array<{ summary: string }> };
  };

  assert.match(ingested.jarvisAlert, /Founder chce alebo potrebuje/);
  assert.equal(ingested.needSignal.summary, "Prosím, priprav nový report pre cold outreach.");
  assert.equal(ingested.identity.openNeedSignals[0].summary, "Prosím, priprav nový report pre cold outreach.");

  await client.close();
  await server.close();
});

test("Jarvis MCP server summarizes cold outreach from local SQLite events", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createJarvisMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const dbPath = join(mkdtempSync(join(tmpdir(), "jarvis-mcp-cold-")), "jarvis.db");

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  for (const [leadEmail, eventType] of [
    ["one@example.com", "sent"],
    ["two@example.com", "sent"],
    ["one@example.com", "opened"],
    ["one@example.com", "replied"],
    ["one@example.com", "positive_reply"],
    ["one@example.com", "prepared_reply"],
  ]) {
    await client.callTool({
      name: "arcigy.add_cold_outreach_event",
      arguments: {
        dbPath,
        leadEmail,
        eventType,
        occurredAt: "2026-06-07T10:00:00Z",
      },
    });
  }

  const result = await client.callTool({
    name: "arcigy.get_cold_outreach_brief_from_db",
    arguments: {
      dbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "posledných 7 dní",
    },
  });
  const brief = getStructuredResult(result) as { summary: string; metrics: { contacted: number } };

  assert.equal(brief.metrics.contacted, 2);
  assert.match(brief.summary, /Za posledných 7 dní sme napísali 2 ľuďom/);
  assert.match(brief.summary, /Pripravil som ti 1 odpoveď/);

  const preparedEvent = await client.callTool({
    name: "arcigy.add_cold_outreach_event",
    arguments: {
      dbPath,
      leadEmail: "three@example.com",
      eventType: "prepared_reply",
      occurredAt: "2026-06-07T11:00:00Z",
      data: { subject: "Re: Jarvis", replyText: "Dakujem, navrhujem kratky call." },
    },
  });
  const preparedBody = getStructuredResult(preparedEvent) as { id: string };

  const pendingReplies = await client.callTool({
    name: "arcigy.get_prepared_outreach_replies",
    arguments: { dbPath, status: "pending", limit: 5 },
  });
  const pendingBody = getStructuredResult(pendingReplies) as { count: number; replies: Array<{ id: string; replyText: string }> };
  assert.equal(pendingBody.count, 2);
  assert.equal(pendingBody.replies[0].id, preparedBody.id);
  assert.equal(pendingBody.replies[0].replyText, "Dakujem, navrhujem kratky call.");

  const approvedReply = await client.callTool({
    name: "arcigy.approve_prepared_outreach_reply",
    arguments: { dbPath, preparedEventId: preparedBody.id, approvedBy: "test" },
  });
  const approvedBody = getStructuredResult(approvedReply) as { status: string; approvedEvent: { eventType: string } };
  assert.equal(approvedBody.status, "approved");
  assert.equal(approvedBody.approvedEvent.eventType, "approved_reply_sent");

  const operatorBriefing = await client.callTool({
    name: "arcigy.get_operator_briefing",
    arguments: {
      dbPath,
      since: "2026-06-01T00:00:00Z",
      until: "2026-06-08T00:00:00Z",
      periodLabel: "poslednych 7 dni",
    },
  });
  const operatorBody = getStructuredResult(operatorBriefing) as { speechText: string; sections: { coldOutreach: string } };
  assert.match(operatorBody.speechText, /Jarvis briefing/);
  assert.match(operatorBody.sections.coldOutreach, /Cold outreach/);

  await client.close();
  await server.close();
});

function getStructuredResult(value: unknown): unknown {
  const result = value as { structuredContent?: { result?: unknown } };
  assert.ok(result.structuredContent);
  return result.structuredContent.result;
}
