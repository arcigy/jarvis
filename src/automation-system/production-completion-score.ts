import { getIntegrationHealth, type RuntimeEnv } from "./env.ts";
import type { JarvisCapabilityAudit } from "./jarvis-capability-audit.ts";
import { listJarvisMcpTools, localStateWriteToolNames } from "./mcp-tools.ts";
import type { ProductionReadinessReport } from "./production-readiness.ts";
import type { ProductionVerificationEvidence } from "./production-verification-evidence.ts";

export type ProductionCompletionStatus = "ready" | "attention" | "blocked";

export type ProductionCompletionComponent = {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  status: ProductionCompletionStatus;
  proof: string;
  nextAction: string;
};

export type ProductionCompletionScore = {
  mode: "arcigy-jarvis-production-completion-score";
  status: ProductionCompletionStatus;
  generatedAt: string;
  percent: number;
  overallPercent: number;
  completionPercent: number;
  summary: string;
  components: ProductionCompletionComponent[];
  nextActions: string[];
  secretPolicy: string;
};

export function buildProductionCompletionScore(input: {
  readiness: ProductionReadinessReport;
  productionEvidence: ProductionVerificationEvidence;
  capabilityAudit: JarvisCapabilityAudit;
  env?: RuntimeEnv;
  generatedAt?: string;
}): ProductionCompletionScore {
  const components = [
    verificationComponent(input.productionEvidence),
    capabilityComponent(input.capabilityAudit),
    readinessComponent(input.readiness),
    mcpSafetyComponent(input.capabilityAudit),
    integrationComponent(input.env),
  ];
  const earned = components.reduce((sum, item) => sum + item.score, 0);
  const max = components.reduce((sum, item) => sum + item.maxScore, 0);
  const percent = Math.round((earned / max) * 100);
  const status: ProductionCompletionStatus = percent >= 95 ? "ready" : percent >= 75 ? "attention" : "blocked";
  const nextActions = components.filter((item) => item.status !== "ready").map((item) => item.nextAction);
  return {
    mode: "arcigy-jarvis-production-completion-score",
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    percent,
    overallPercent: percent,
    completionPercent: percent,
    summary:
      status === "ready"
        ? `Jarvis production completion je ${percent}%. Vsetky hlavne vrstvy su evidence-ready.`
        : `Jarvis production completion je ${percent}%. ${components.filter((item) => item.status !== "ready").length} oblast(i) potrebuje attention.`,
    components,
    nextActions: nextActions.length ? nextActions : ["Drz production proof cerstvy a pred write toolmi vyzaduj explicitne approval.approved=true."],
    secretPolicy: "Secret-safe: score uses only statuses, counts, proof gates, and redacted evidence; it never returns API keys, OAuth tokens, bearer tokens, or database URLs.",
  };
}

export function summarizeProductionCompletionScoreForVoice(score: Pick<ProductionCompletionScore, "status" | "percent" | "summary" | "components" | "nextActions">): string {
  const ready = score.components.filter((item) => item.status === "ready").length;
  const attention = score.components.filter((item) => item.status === "attention").length;
  const blocked = score.components.filter((item) => item.status === "blocked").length;
  const weakest = [...score.components].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore)[0];
  const next = score.nextActions[0] ?? "Drz production proof cerstvy.";
  return [
    `Sme na ${score.percent}% production completion.`,
    `Status: ${score.status}.`,
    score.summary,
    `Komponenty: ${ready}/${score.components.length} ready, ${attention} attention, ${blocked} blocked.`,
    weakest && weakest.status !== "ready" ? `Najslabsia oblast: ${weakest.title}, ${weakest.score}/${weakest.maxScore}.` : "Najslabsia oblast: ziadna kriticka.",
    `Najblizsi krok: ${next}`,
  ].join(" ");
}

function verificationComponent(evidence: ProductionVerificationEvidence): ProductionCompletionComponent {
  const release = asRecord(evidence.release);
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const readyChecks = checks.filter((check) => asRecord(check)?.status === "ready").length;
  const failedChecks = checks.filter((check) => asRecord(check)?.status === "failed").length;
  const gates = Array.isArray(release?.requiredRemoteMcpSmokeGates) ? release.requiredRemoteMcpSmokeGates.length : 0;
  const score =
    (evidence.status === "ready" ? 8 : 0) +
    (evidence.freshness.fresh ? 7 : 0) +
    (release?.dirty === false ? 5 : 0) +
    (gates >= 37 ? 5 : Math.floor((Math.max(0, gates) / 37) * 5)) +
    (checks.length > 0 && readyChecks === checks.length ? 5 : Math.floor((readyChecks / Math.max(checks.length, 1)) * 5));
  return {
    id: "verification-evidence",
    title: "Production verification evidence",
    score,
    maxScore: 30,
    status: score >= 29 ? "ready" : score >= 18 ? "attention" : "blocked",
    proof: `${readyChecks}/${checks.length} checks ready, ${failedChecks} failed, ${gates}/37 remote gates, fresh=${evidence.freshness.fresh}, dirty=${String(release?.dirty ?? "unknown")}.`,
    nextAction: "Run npm run verify:production and require status=ready, dirty=false, freshness.fresh=true, and all remote gates.",
  };
}

function capabilityComponent(audit: JarvisCapabilityAudit): ProductionCompletionComponent {
  const total = audit.capabilities.length;
  const ready = audit.capabilities.filter((item) => item.status === "ready").length;
  const blocked = audit.capabilities.filter((item) => item.status === "blocked").length;
  const score = Math.round((ready / Math.max(total, 1)) * 25);
  return {
    id: "capability-coverage",
    title: "Jarvis capability coverage",
    score,
    maxScore: 25,
    status: blocked ? "blocked" : ready === total ? "ready" : "attention",
    proof: `${ready}/${total} capability groups ready; ${blocked} blocked.`,
    nextAction: audit.nextActions[0] ?? "Restore missing capability evidence and rerun npm run verify:production.",
  };
}

function readinessComponent(readiness: ProductionReadinessReport): ProductionCompletionComponent {
  const checklist = readiness.launchChecklist ?? [];
  const checklistReady = checklist.filter((item) => item.status === "ready").length;
  const blocking = readiness.blockers.filter((item) => item.severity === "blocking").length;
  const approvalLocks = readiness.mcp.approvalRequired.length;
  const score =
    (readiness.status === "ready" ? 8 : readiness.status === "attention" ? 5 : 0) +
    (blocking === 0 ? 4 : 0) +
    Math.round((checklistReady / Math.max(checklist.length, 1)) * 5) +
    (approvalLocks >= 6 ? 3 : Math.floor((approvalLocks / 6) * 3));
  return {
    id: "readiness-launch",
    title: "Readiness and launch checklist",
    score,
    maxScore: 20,
    status: score >= 19 ? "ready" : score >= 12 ? "attention" : "blocked",
    proof: `Readiness ${readiness.status}; launch checklist ${checklistReady}/${checklist.length}; approval locks ${approvalLocks}; blocking ${blocking}.`,
    nextAction: readiness.nextActions[0] ?? "Open production readiness and clear attention queue.",
  };
}

function mcpSafetyComponent(audit: JarvisCapabilityAudit): ProductionCompletionComponent {
  const tools = listJarvisMcpTools();
  const approvalCount = tools.filter((tool) => tool.requiresApproval).length;
  const localWriteCount = tools.filter((tool) => localStateWriteToolNames.has(tool.name)).length;
  const remoteReady = audit.capabilities.some((item) => item.id === "remote-mcp" && item.status === "ready");
  const safetyReady = audit.capabilities.some((item) => item.id === "approval-safety" && item.status === "ready");
  const score =
    (tools.length >= 37 ? 4 : Math.floor((tools.length / 37) * 4)) +
    (approvalCount >= 6 ? 4 : Math.floor((approvalCount / 6) * 4)) +
    (localWriteCount >= 7 ? 3 : Math.floor((localWriteCount / 7) * 3)) +
    (remoteReady ? 2 : 0) +
    (safetyReady ? 2 : 0);
  return {
    id: "mcp-approval-safety",
    title: "MCP and approval safety",
    score,
    maxScore: 15,
    status: score >= 14 ? "ready" : score >= 9 ? "attention" : "blocked",
    proof: `${tools.length} MCP tools, ${approvalCount} approval locks, ${localWriteCount} local-write tools, remote=${remoteReady}, safety=${safetyReady}.`,
    nextAction: "Restore MCP registry parity, approval gates, and remote smoke before external handoff.",
  };
}

function integrationComponent(env?: RuntimeEnv): ProductionCompletionComponent {
  const health = getIntegrationHealth(env);
  const required = health.filter((item) => item.requiredForProduction);
  const ready = required.filter((item) => item.configured).length;
  const score = Math.round((ready / Math.max(required.length, 1)) * 10);
  return {
    id: "production-integrations",
    title: "Production integrations",
    score,
    maxScore: 10,
    status: ready === required.length ? "ready" : ready >= Math.ceil(required.length * 0.7) ? "attention" : "blocked",
    proof: `${ready}/${required.length} required integration groups configured.`,
    nextAction: "Configure missing required integration secrets in .env.local and rerun npm run doctor -- --live-integrations.",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
