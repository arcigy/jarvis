import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
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
    assert.match(await page.text(), /Arcigy Jarvis/);

    const health = await fetch(`${baseUrl}/api/system-health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { integrations: Array<{ key: string }> };
    assert.ok(body.integrations.some((item) => item.key === "gemini"));

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

    const dbPath = join(mkdtempSync(join(tmpdir(), "jarvis-web-")), "memory.db");
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
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

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
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
