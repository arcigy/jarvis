#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const runId = `${Date.now()}-${process.pid}`;
const generatedDir = join(repoRoot, "generated", "local-memory-smoke");
const dbPath = join(generatedDir, `jarvis-local-memory-smoke-${runId}.db`);
const snapshotPath = join(generatedDir, `jarvis-local-memory-smoke-${runId}.json`);
const python = process.env.JARVIS_PYTHON || "python";
const syntheticGoogleKey = ["AI", "za", "S", "y", "C".repeat(32)].join("");
const syntheticDatabaseUrl = "postgresql://postgres:local-smoke-secret@example.com:5432/db";

mkdirSync(generatedDir, { recursive: true });

try {
  const person = runDb("upsert-person", {
    primaryEmail: "ceo.local-smoke@example.com",
    kind: "client",
    displayName: "Local Smoke Client",
    companyName: "Local Smoke Ltd",
    data: { syntheticGoogleKey, syntheticDatabaseUrl },
  }) as { id?: string; primaryEmail?: string };
  assert(person.id, "upsert-person returned no id.");
  assert(person.primaryEmail === "ceo.local-smoke@example.com", "upsert-person did not normalize/store the expected email.");

  const message = runDb("ingest-message", {
    fromEmail: "ceo.local-smoke@example.com",
    source: "gmail",
    externalId: `local-memory-smoke-${runId}`,
    subject: "Local memory smoke",
    text: `Please prepare the client automation report and keep this secret out: ${syntheticGoogleKey} ${syntheticDatabaseUrl}`,
  }) as { status?: string; needSignal?: { id?: string; summary?: string }; identity?: { reason?: string }; jarvisAlert?: string | null };
  assert(message.status === "created", "ingest-message did not create a new local email activity.");
  assert(message.identity?.reason === "exact_email_match", "ingest-message did not match the known client by exact email.");
  assert(message.needSignal?.id, "ingest-message did not create a client need signal.");
  assert(message.jarvisAlert, "ingest-message did not return a Jarvis alert.");

  const duplicate = runDb("ingest-message", {
    fromEmail: "ceo.local-smoke@example.com",
    source: "gmail",
    externalId: `local-memory-smoke-${runId}`,
    subject: "Local memory smoke duplicate",
    text: "Please prepare the client automation report again.",
  }) as { status?: string };
  assert(duplicate.status === "duplicate", "ingest-message did not dedupe by source/externalId.");

  for (const [leadEmail, eventType] of [
    ["one.local-smoke@example.com", "sent"],
    ["two.local-smoke@example.com", "sent"],
    ["one.local-smoke@example.com", "opened"],
    ["one.local-smoke@example.com", "replied"],
    ["one.local-smoke@example.com", "positive_reply"],
    ["one.local-smoke@example.com", "prepared_reply"],
  ] as Array<[string, string]>) {
    runDb("add-cold-event", {
      leadEmail,
      eventType,
      occurredAt: "2026-06-09T08:00:00Z",
      data: eventType === "prepared_reply" ? { positiveSignal: "Lead wants next step.", replyText: "Dakujem, posielam dalsi krok." } : {},
    });
  }

  const coldBrief = runDb("cold-brief", {
    since: "2026-06-09T00:00:00Z",
    until: "2026-06-10T00:00:00Z",
    periodLabel: "dnes",
  }) as { summary?: string; metrics?: { contacted?: number; preparedPositiveReplyCount?: number } };
  assert(coldBrief.metrics?.contacted === 2, "cold-brief did not count contacted leads.");
  assert(coldBrief.metrics?.preparedPositiveReplyCount === 1, "cold-brief did not count the prepared positive reply.");
  assertCleanSlovakText(coldBrief.summary, "cold-brief summary");
  assert(String(coldBrief.summary).includes("Za dnes sme napísali 2 ľuďom."), "cold-brief summary did not use correct Slovak contacted wording.");
  assert(String(coldBrief.summary).includes("1 človek odpísal"), "cold-brief summary did not use correct Slovak reply wording.");
  assert(String(coldBrief.summary).includes("Pripravil som ti 1 odpoveď"), "cold-brief summary did not use correct Slovak prepared reply wording.");

  const identity = runIdentify("ceo.local-smoke@example.com") as { reason?: string; openNeedSignals?: unknown[] };
  assert(identity.reason === "exact_email_match", "identify did not return exact_email_match.");
  assert((identity.openNeedSignals ?? []).length === 1, "identify did not return exactly one open need signal.");

  const alerts = runDb("list-open-needs", { status: "new", limit: 5 }) as { count?: number; alerts?: unknown[] };
  assert(alerts.count === 1 && (alerts.alerts ?? []).length === 1, "list-open-needs did not return the open client request.");

  const audit = runDb("add-audit-event", {
    automationKey: "arcigy.local_memory_smoke",
    status: "completed",
    requiresApproval: false,
    input: { syntheticGoogleKey, syntheticDatabaseUrl },
    output: { identity: identity.reason, alertCount: alerts.count },
  }) as { id?: string };
  assert(audit.id, "add-audit-event returned no id.");

  const snapshot = runDb("local-memory-snapshot", { limit: 10 }) as {
    redacted?: boolean;
    counts?: { people?: number; emailActivities?: number; openClientNeeds?: number; auditEvents?: number };
  };
  assert(snapshot.redacted === true, "local-memory-snapshot is not marked redacted.");
  assert(snapshot.counts?.people === 1, "local-memory-snapshot did not count the client.");
  assert(snapshot.counts?.emailActivities === 1, "local-memory-snapshot did not count the deduped email activity.");
  assert(snapshot.counts?.openClientNeeds === 1, "local-memory-snapshot did not count the open client need.");
  assert(snapshot.counts?.auditEvents === 1, "local-memory-snapshot did not count the audit event.");
  assertNoSecretLeak(snapshot, "local-memory-snapshot");

  const exported = runDb("export-local-memory-snapshot", { limit: 10, outputPath: snapshotPath }) as { status?: string; redacted?: boolean; outputPath?: string };
  assert(exported.status === "exported" && exported.redacted === true, "export-local-memory-snapshot did not export a redacted snapshot.");
  assert(exported.outputPath && existsSync(exported.outputPath), "export-local-memory-snapshot did not write the output file.");
  assertNoSecretLeak(readFileSync(exported.outputPath, "utf-8"), "exported local-memory-snapshot");

  const updated = runDb("update-need-status", {
    needSignalId: message.needSignal.id,
    status: "resolved",
    note: "Resolved by local memory smoke.",
    updatedBy: "production-verifier",
  }) as { needSignal?: { status?: string } };
  assert(updated.needSignal?.status === "resolved", "update-need-status did not persist the resolved status.");

  const closedAlerts = runDb("list-open-needs", { status: "new", limit: 5 }) as { count?: number };
  assert(closedAlerts.count === 0, "resolved client need still appears in new alerts.");

  const result = {
    status: "ready",
    dbPath,
    snapshotPath,
    proof: [
      "email identity exact match",
      "client need alert created",
      "duplicate Gmail event skipped",
      "redacted local memory snapshot exported",
      "audit event persisted",
      "client need status resolved",
      "Slovak cold outreach brief is UTF-8 clean",
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${redactSensitiveText(error instanceof Error ? error.message : String(error))}\n`);
  process.exit(1);
}

function runDb(command: string, payload: Record<string, unknown>) {
  return runPythonJson(["scripts/jarvis_local_db.py", command, "--db", dbPath, "--payload", JSON.stringify(payload)]);
}

function runIdentify(email: string) {
  return runPythonJson(["scripts/jarvis_local_db.py", "identify", "--db", dbPath, "--email", email]);
}

function runPythonJson(args: string[]) {
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python local DB command failed with status ${result.status}.`);
  }
  return JSON.parse(result.stdout);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoSecretLeak(value: unknown, label: string) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(syntheticGoogleKey), `${label} leaked the synthetic Google key.`);
  assert(!text.includes(syntheticDatabaseUrl), `${label} leaked the synthetic database URL.`);
  assert(/\[redacted-google-api-key\]/.test(text), `${label} did not include a redacted Google key marker.`);
  assert(/postgresql:\/\/postgres:\[redacted\]@example\.com:5432\/db/.test(text), `${label} did not redact the database URL password.`);
}

function assertCleanSlovakText(value: unknown, label: string) {
  const text = String(value ?? "");
  assert(/[áäčďéíľĺňóôŕšťúýž]/i.test(text), `${label} did not contain Slovak diacritics.`);
  assert(!/[ĂÄĹÂâ][^\s]*/.test(text), `${label} contains mojibake text: ${text}`);
}
