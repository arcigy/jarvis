import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { redactSensitiveText } from "./ai-safety.ts";

const productionEvidenceMaxAgeHours = 24;

export type ProductionVerificationFreshness = {
  fresh: boolean;
  ageHours: number | null;
  maxAgeHours: number;
  checkedAt: string;
  detail: string;
};

export type ProductionVerificationEvidence = {
  mode: "arcigy-jarvis-production-verification";
  status: string;
  generatedAt: string | null;
  webUrl?: string;
  release?: unknown;
  freshness: ProductionVerificationFreshness;
  secretPolicy?: string;
  evidencePath: string;
  summary: string;
  checks: unknown[];
};

export function getProductionVerificationEvidence(repoRoot: string): ProductionVerificationEvidence {
  const evidencePath = join(repoRoot, "generated", "production-verification", "latest.json");
  const latestReadyEvidencePath = join(repoRoot, "generated", "production-verification", "latest-ready.json");
  if (!existsSync(evidencePath)) {
    if (existsSync(latestReadyEvidencePath)) return readProductionVerificationEvidence(latestReadyEvidencePath);
    return {
      mode: "arcigy-jarvis-production-verification",
      status: "missing",
      generatedAt: null,
      freshness: buildEvidenceFreshness(null),
      evidencePath,
      summary: "Run npm run verify:production to create the latest secret-safe verification evidence artifact.",
      checks: [],
    };
  }
  const latest = readProductionVerificationEvidence(evidencePath);
  if (latest.status === "ready" || !existsSync(latestReadyEvidencePath)) return latest;
  const latestReady = readProductionVerificationEvidence(latestReadyEvidencePath);
  return latestReady.status === "ready" ? latestReady : latest;
}

function readProductionVerificationEvidence(evidencePath: string): ProductionVerificationEvidence {
  try {
    const raw = redactSensitiveText(readFileSync(evidencePath, "utf-8"));
    const evidence = JSON.parse(raw) as Record<string, unknown>;
    const generatedAt = typeof evidence.generatedAt === "string" ? evidence.generatedAt : null;
    const freshness = buildEvidenceFreshness(generatedAt);
    const storedStatus = typeof evidence.status === "string" ? evidence.status : "attention";
    const status = storedStatus === "ready" && !freshness.fresh ? "attention" : storedStatus;
    return {
      mode: "arcigy-jarvis-production-verification",
      status,
      generatedAt,
      webUrl: typeof evidence.webUrl === "string" ? evidence.webUrl : undefined,
      release: isRecord(evidence.release) ? evidence.release : undefined,
      freshness,
      secretPolicy: typeof evidence.secretPolicy === "string" ? evidence.secretPolicy : "Secret-safe verification evidence.",
      evidencePath,
      checks: Array.isArray(evidence.checks) ? evidence.checks : [],
      summary: summarizeProductionVerificationEvidence(evidence, status, freshness),
    };
  } catch (error) {
    return {
      mode: "arcigy-jarvis-production-verification",
      status: "attention",
      generatedAt: null,
      freshness: buildEvidenceFreshness(null),
      evidencePath,
      summary: `Production verification evidence exists but could not be parsed: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`,
      checks: [],
    };
  }
}

function summarizeProductionVerificationEvidence(evidence: Record<string, unknown>, status: string, freshness: ProductionVerificationFreshness) {
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const ready = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "ready").length;
  const failed = checks.filter((check) => check && typeof check === "object" && (check as { status?: unknown }).status === "failed").length;
  const release = isRecord(evidence.release) && typeof evidence.release.shortCommit === "string" ? ` Commit ${evidence.release.shortCommit}.` : "";
  const freshnessText = freshness.fresh ? ` Fresh evidence (${freshness.ageHours}h old).` : ` ${freshness.detail}`;
  return `Production verification ${status === "ready" ? "ready" : "needs attention"}: ${ready} ready, ${failed} failed.${release}${freshnessText}`;
}

function buildEvidenceFreshness(generatedAt: string | null): ProductionVerificationFreshness {
  const checkedAt = new Date().toISOString();
  if (!generatedAt) {
    return {
      fresh: false,
      ageHours: null,
      maxAgeHours: productionEvidenceMaxAgeHours,
      checkedAt,
      detail: "Production evidence timestamp is missing.",
    };
  }
  const parsed = Date.parse(generatedAt);
  if (!Number.isFinite(parsed)) {
    return {
      fresh: false,
      ageHours: null,
      maxAgeHours: productionEvidenceMaxAgeHours,
      checkedAt,
      detail: "Production evidence timestamp is invalid.",
    };
  }
  const ageHours = Math.max(0, Math.round(((Date.now() - parsed) / 3_600_000) * 10) / 10);
  const fresh = ageHours <= productionEvidenceMaxAgeHours;
  return {
    fresh,
    ageHours,
    maxAgeHours: productionEvidenceMaxAgeHours,
    checkedAt,
    detail: fresh
      ? `Production evidence is fresh: ${ageHours}h old, max ${productionEvidenceMaxAgeHours}h.`
      : `Production evidence is stale: ${ageHours}h old, max ${productionEvidenceMaxAgeHours}h. Rerun npm run verify:production.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
