import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { redactSensitiveText } from "./ai-safety.ts";

export type ProductionVerificationEvidence = {
  mode: "arcigy-jarvis-production-verification";
  status: string;
  generatedAt: string | null;
  webUrl?: string;
  release?: unknown;
  secretPolicy?: string;
  evidencePath: string;
  summary: string;
  checks: unknown[];
};

export function getProductionVerificationEvidence(repoRoot: string): ProductionVerificationEvidence {
  const evidencePath = join(repoRoot, "generated", "production-verification", "latest.json");
  if (!existsSync(evidencePath)) {
    return {
      mode: "arcigy-jarvis-production-verification",
      status: "missing",
      generatedAt: null,
      evidencePath,
      summary: "Run npm run verify:production to create the latest secret-safe verification evidence artifact.",
      checks: [],
    };
  }
  try {
    const raw = redactSensitiveText(readFileSync(evidencePath, "utf-8"));
    const evidence = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: "arcigy-jarvis-production-verification",
      status: typeof evidence.status === "string" ? evidence.status : "attention",
      generatedAt: typeof evidence.generatedAt === "string" ? evidence.generatedAt : null,
      webUrl: typeof evidence.webUrl === "string" ? evidence.webUrl : undefined,
      release: isRecord(evidence.release) ? evidence.release : undefined,
      secretPolicy: typeof evidence.secretPolicy === "string" ? evidence.secretPolicy : "Secret-safe verification evidence.",
      evidencePath,
      checks: Array.isArray(evidence.checks) ? evidence.checks : [],
      summary: summarizeProductionVerificationEvidence(evidence),
    };
  } catch (error) {
    return {
      mode: "arcigy-jarvis-production-verification",
      status: "attention",
      generatedAt: null,
      evidencePath,
      summary: `Production verification evidence exists but could not be parsed: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`,
      checks: [],
    };
  }
}

function summarizeProductionVerificationEvidence(evidence: Record<string, unknown>) {
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const ready = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "ready").length;
  const failed = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "failed").length;
  const release = isRecord(evidence.release) && typeof evidence.release.shortCommit === "string" ? ` Commit ${evidence.release.shortCommit}.` : "";
  return `Production verification ${evidence.status === "ready" ? "ready" : "needs attention"}: ${ready} ready, ${failed} failed.${release}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
