import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { matchLocalIdentity } from "../src/automation-system/identity-matching.ts";
import {
  buildContractGenerationCommand,
  getColdOutreachMcpAnswer,
  identifyEmailMcpAnswer,
  listJarvisMcpTools,
} from "../src/automation-system/mcp-tools.ts";
import {
  containsWakeWord,
  createJarvisVoiceSession,
  handleJarvisVoiceEvent,
} from "../src/automation-system/jarvis-voice.ts";

test("MCP tools expose the requested automation surface", () => {
  const names = listJarvisMcpTools().map((tool) => tool.name);
  assert.deepEqual(names, [
    "arcigy.generate_contract_documents",
    "arcigy.get_cold_outreach_brief",
    "arcigy.identify_email",
    "arcigy.upsert_local_person",
    "arcigy.add_client_need_signal",
    "arcigy.jarvis_voice_event",
  ]);
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
