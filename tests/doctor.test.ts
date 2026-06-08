import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Jarvis doctor reports local readiness without leaking secrets", () => {
  const doctorSource = readFileSync("scripts/jarvis_doctor.ts", "utf-8");
  assert.match(doctorSource, /import \{ redactSensitiveText \}/);
  assert.match(doctorSource, /return redactSensitiveText\(String\(value \?\? ""\)\)\.trim\(\)\.slice\(0, 2000\)/);

  const result = spawnSync("node", ["scripts/jarvis_doctor.ts", "--json", "--no-env-file"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  for (const fragment of ["AI" + "za", "GOC" + "SPX", "1/" + "/03", "49c" + "42033", "85ae" + "49", "758b" + "bc"]) {
    assert.equal(result.stdout.includes(fragment), false);
  }

  const body = JSON.parse(result.stdout) as {
    ok: boolean;
    checks: Array<{ key: string; status: string; message?: string; details?: Record<string, unknown> }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.checks.find((check) => check.key === "requiredFiles")?.status, "ready");
  assert.match(body.checks.find((check) => check.key === "requiredFiles")?.message ?? "", /15 required files/);
  assert.equal(body.checks.find((check) => check.key === "mcpToolRegistry")?.status, "ready");
  assert.equal(body.checks.find((check) => check.key === "runtimeEnv")?.status, "warning");
  assert.equal(body.checks.some((check) => check.key === "liveIntegrationDiagnostics"), false);
  const localDb = body.checks.find((check) => check.key === "localDbSmoke");
  const contractGeneration = body.checks.find((check) => check.key === "contractGeneration");
  assert.equal(localDb?.status, "ready");
  assert.equal(contractGeneration?.status, "ready");
  const webBridge = body.checks.find((check) => check.key === "webBridgeSmoke");
  assert.equal(webBridge?.status, "ready");
  const webBridgeDetails = webBridge?.details as {
    expectedToolCount?: number;
    uiAssetsReady?: boolean;
    commandDeckReady?: boolean;
    mcpToolCallReady?: boolean;
    externalAuthReady?: boolean;
    deniedExternalManifestStatus?: number;
    approvalGateReady?: boolean;
    remoteMcpSmokeReady?: boolean;
    remoteMcpHandoffProofReady?: boolean;
    deniedContractStatus?: number;
    webContractOutputDir?: string;
  };
  assert.equal(webBridgeDetails?.expectedToolCount, 28);
  assert.equal(webBridgeDetails?.uiAssetsReady, true);
  assert.equal(webBridgeDetails?.commandDeckReady, true);
  assert.equal(webBridgeDetails?.mcpToolCallReady, true);
  assert.equal(webBridgeDetails?.externalAuthReady, true);
  assert.equal(webBridgeDetails?.deniedExternalManifestStatus, 401);
  assert.equal(webBridgeDetails?.approvalGateReady, true);
  assert.equal(webBridgeDetails?.remoteMcpSmokeReady, true);
  assert.equal(webBridgeDetails?.remoteMcpHandoffProofReady, true);
  assert.equal(webBridgeDetails?.deniedContractStatus, 409);
  assert.equal(existsSync((localDb?.details as { dbPath: string }).dbPath), false);
  assert.equal(existsSync((contractGeneration?.details as { outputDir: string }).outputDir), false);
  assert.equal(existsSync(webBridgeDetails.webContractOutputDir ?? ""), false);
});

test("Jarvis doctor surfaces non-blocking runtime advisories as warnings", () => {
  const result = spawnSync("node", ["scripts/jarvis_doctor.ts", "--json", "--no-env-file", "--skip-local-db", "--skip-contract-generation", "--skip-web-bridge"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      GEMINI_API_KEY: "gemini",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
      GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-2",
      GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-3",
      GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-4",
      SMARTLEAD_API_KEY: "smartlead",
      DATABASE_URL: "postgres://postgres:secret@example.com:5432/db",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
      GOOGLE_SHEET_ID: "sheet",
      GOOGLE_MAPS_API_KEY: "maps",
      SERPER_API_KEY: "serper",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("PASSWORD"), false);
  const body = JSON.parse(result.stdout) as {
    ok: boolean;
    warnings: number;
    failed: number;
    checks: Array<{ key: string; status: string; details?: { advisoryMissing?: unknown[] } }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
  assert.equal(body.warnings, 1);
  const runtimeEnv = body.checks.find((check) => check.key === "runtimeEnv");
  assert.equal(runtimeEnv?.status, "warning");
  assert.equal(runtimeEnv?.details?.advisoryMissing?.length, 1);
});

test("Jarvis doctor human output names advisory next actions without leaking placeholder credentials", () => {
  const result = spawnSync("node", ["scripts/jarvis_doctor.ts", "--no-env-file", "--skip-local-db", "--skip-contract-generation", "--skip-web-bridge"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      GEMINI_API_KEY: "gemini",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: "refresh",
      GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-2",
      GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-3",
      GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-4",
      SMARTLEAD_API_KEY: "smartlead",
      DATABASE_URL: "postgres://postgres:secret@example.com:5432/db",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
      GOOGLE_SHEET_ID: "sheet",
      GOOGLE_MAPS_API_KEY: "maps",
      SERPER_API_KEY: "serper",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("PASSWORD"), false);
  assert.match(result.stdout, /\[WARN\] runtimeEnv/);
  assert.match(result.stdout, /redis: REDIS_URL contains a placeholder credential/);
  assert.match(result.stdout, /Next: Replace REDIS_URL with the real Redis password/);
});
