import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
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
  assert.ok(names.includes("arcigy.get_cold_outreach_brief"));
  assert.ok(names.includes("arcigy.identify_email"));
  assert.ok(names.includes("arcigy.jarvis_voice_event"));

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

  await client.close();
  await server.close();
});

function getStructuredResult(value: unknown): unknown {
  const result = value as { structuredContent?: { result?: unknown } };
  assert.ok(result.structuredContent);
  return result.structuredContent.result;
}
