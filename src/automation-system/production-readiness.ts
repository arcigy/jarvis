import { runIntegrationDiagnostics, type DiagnosticCheck, type DiagnosticsResult } from "./diagnostics.ts";
import { getIntegrationHealth, type IntegrationHealth, type RuntimeEnv } from "./env.ts";
import type { FetchLike } from "./gemini.ts";
import { listJarvisMcpTools } from "./mcp-tools.ts";

export type ReadinessStatus = "ready" | "attention" | "blocked";

export type ReadinessBlocker = {
  key: string;
  severity: "warning" | "blocking";
  message: string;
  nextAction: string;
};

export type ProductionReadinessReport = {
  status: ReadinessStatus;
  checkedAt: string;
  summary: string;
  integrations: {
    ready: number;
    total: number;
    missing: Array<{ key: string; missing: string[] }>;
  };
  mcp: {
    toolCount: number;
    approvalRequired: string[];
  };
  blockers: ReadinessBlocker[];
  nextActions: string[];
  fixGuide: ReadinessFixStep[];
  diagnostics?: DiagnosticsResult;
};

export type ProductionReadinessInput = {
  live?: boolean;
  dbPath?: string;
};

export type ReadinessFixStep = {
  id: string;
  title: string;
  detail: string;
  envKeys: string[];
  validationCommand: string;
};

export async function buildProductionReadinessReport(
  input: ProductionReadinessInput = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<ProductionReadinessReport> {
  const health = getIntegrationHealth(env);
  const tools = listJarvisMcpTools();
  const diagnostics = input.live ? await runIntegrationDiagnostics(input, env, fetchImpl) : undefined;
  const blockers = [
    ...health.flatMap(integrationHealthBlockers),
    ...(diagnostics?.checks ?? []).flatMap(diagnosticBlockers),
  ];
  const uniqueBlockers = dedupeBlockers(blockers);
  const blockingCount = uniqueBlockers.filter((blocker) => blocker.severity === "blocking").length;
  const status: ReadinessStatus = blockingCount ? "blocked" : "ready";
  const readyIntegrations = health.filter((item) => item.configured).length;

  return {
    status,
    checkedAt: new Date().toISOString(),
    summary: buildSummary(status, readyIntegrations, health.length, tools.length, uniqueBlockers),
    integrations: {
      ready: readyIntegrations,
      total: health.length,
    missing: health.filter((item) => !item.configured).map((item) => ({ key: item.key, missing: item.missing })),
    },
    mcp: {
      toolCount: tools.length,
      approvalRequired: tools.filter((tool) => tool.requiresApproval).map((tool) => tool.name),
    },
    blockers: uniqueBlockers,
    nextActions: uniqueBlockers.length ? uniqueBlockers.map((blocker) => blocker.nextAction) : ["No action needed. Keep secrets out of git and run doctor before changes."],
    fixGuide: buildFixGuide(uniqueBlockers),
    diagnostics,
  };
}

function integrationHealthBlockers(item: IntegrationHealth): ReadinessBlocker[] {
  if (item.configured) return [];
  return item.missing.map((missing) => ({
    key: item.key,
    severity: item.requiredForProduction ? "blocking" : "warning",
    message: `Missing or invalid runtime config: ${missing}`,
    nextAction: nextActionFor(item.key, missing),
  }));
}

function diagnosticBlockers(check: DiagnosticCheck): ReadinessBlocker[] {
  if (check.status === "ready") return [];
  const requiredForProduction = !["redis", "serper"].includes(check.key);
  return [
    {
      key: check.key,
      severity: requiredForProduction ? "blocking" : "warning",
      message: check.message,
      nextAction: nextActionFor(check.key, check.message),
    },
  ];
}

function nextActionFor(key: string, message: string): string {
  const text = `${key} ${message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) return "Replace REDIS_URL with the real Railway Redis password, then rerun npm run doctor -- --live-integrations.";
  if (text.includes("redis") && text.includes("rediss")) return "Change REDIS_URL to rediss:// if the provider requires TLS, then rerun live diagnostics.";
  if (text.includes("serper") && text.includes("not enough credits")) return "Top up or replace at least one Serper API key; both configured keys were exhausted.";
  if (text.includes("gmail")) return "Refresh Google OAuth credentials for the configured Gmail accounts.";
  if (text.includes("google")) return "Verify Google API key, OAuth scopes, and the configured Sheet ID.";
  if (text.includes("smartlead")) return "Verify Smartlead API key and campaign access.";
  if (text.includes("gemini")) return "Verify GEMINI_API_KEY and Gemini API quota.";
  if (text.includes("postgres") || text.includes("database")) return "Verify DATABASE_URL credentials and network access.";
  return `Fix ${key} runtime configuration and rerun npm run doctor.`;
}

function dedupeBlockers(blockers: ReadinessBlocker[]): ReadinessBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.key}:${blocker.severity}:${blocker.nextAction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(status: ReadinessStatus, ready: number, total: number, toolCount: number, blockers: ReadinessBlocker[]): string {
  const blocking = blockers.filter((blocker) => blocker.severity === "blocking").length;
  const warnings = blockers.length - blocking;
  if (status === "ready") {
    return warnings
      ? `Production gates ready: ${ready}/${total} integrations configured, ${toolCount} MCP tools available, ${warnings} non-blocking warning(s).`
      : `Production gates ready: ${ready}/${total} integrations configured and ${toolCount} MCP tools available.`;
  }
  return `Production needs attention: ${ready}/${total} integrations ready, ${toolCount} MCP tools available, ${blocking} blocker(s), ${warnings} warning(s).`;
}

function buildFixGuide(blockers: ReadinessBlocker[]): ReadinessFixStep[] {
  const steps = blockers.map(fixStepFor).filter((step): step is ReadinessFixStep => step !== null);
  if (!steps.length) {
    return [
      {
        id: "verify-before-change",
        title: "Keep production proof green",
        detail: "Run the local doctor before changes and keep real secret values only in .env.local.",
        envKeys: [],
        validationCommand: "npm run doctor",
      },
    ];
  }
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

function fixStepFor(blocker: ReadinessBlocker): ReadinessFixStep | null {
  const text = `${blocker.key} ${blocker.message}`.toLowerCase();
  if (text.includes("redis") && text.includes("placeholder")) {
    return {
      id: "redis-real-password",
      title: "Replace Redis placeholder password",
      detail: "Set REDIS_URL to the real Railway Redis URL. The report never returns the secret value; it only flags placeholder credentials.",
      envKeys: ["REDIS_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("serper") && text.includes("not enough credits")) {
    return {
      id: "serper-credits",
      title: "Restore Serper search credits",
      detail: "Top up or replace at least one Serper key. The live check already tries SERPER_API_KEY and SERPER_API_KEY_2 before reporting exhaustion.",
      envKeys: ["SERPER_API_KEY", "SERPER_API_KEY_2"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("gmail") || text.includes("google")) {
    return {
      id: "google-oauth",
      title: "Verify Google OAuth and API access",
      detail: "Refresh OAuth credentials, confirm Sheets access, and keep Google keys in .env.local only.",
      envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_SHEET_ID", "GOOGLE_MAPS_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("smartlead")) {
    return {
      id: "smartlead-access",
      title: "Verify Smartlead access",
      detail: "Confirm the Smartlead API key has access to campaigns used by Jarvis.",
      envKeys: ["SMARTLEAD_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("gemini")) {
    return {
      id: "gemini-access",
      title: "Verify Gemini access",
      detail: "Confirm Gemini API key and quota for AI drafting features.",
      envKeys: ["GEMINI_API_KEY"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  if (text.includes("postgres") || text.includes("database")) {
    return {
      id: "postgres-access",
      title: "Verify Postgres access",
      detail: "Confirm DATABASE_URL credentials and network access.",
      envKeys: ["DATABASE_URL"],
      validationCommand: "npm run doctor -- --live-integrations",
    };
  }
  return null;
}
