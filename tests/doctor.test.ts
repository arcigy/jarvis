import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

test("Jarvis doctor reports local readiness without leaking secrets", () => {
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
    checks: Array<{ key: string; status: string; details?: Record<string, unknown> }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.checks.find((check) => check.key === "requiredFiles")?.status, "ready");
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
    mcpToolCallReady?: boolean;
    externalAuthReady?: boolean;
    deniedExternalManifestStatus?: number;
    approvalGateReady?: boolean;
    deniedContractStatus?: number;
    webContractOutputDir?: string;
  };
  assert.equal(webBridgeDetails?.expectedToolCount, 19);
  assert.equal(webBridgeDetails?.uiAssetsReady, true);
  assert.equal(webBridgeDetails?.mcpToolCallReady, true);
  assert.equal(webBridgeDetails?.externalAuthReady, true);
  assert.equal(webBridgeDetails?.deniedExternalManifestStatus, 401);
  assert.equal(webBridgeDetails?.approvalGateReady, true);
  assert.equal(webBridgeDetails?.deniedContractStatus, 409);
  assert.equal(existsSync((localDb?.details as { dbPath: string }).dbPath), false);
  assert.equal(existsSync((contractGeneration?.details as { outputDir: string }).outputDir), false);
  assert.equal(existsSync(webBridgeDetails.webContractOutputDir ?? ""), false);
});
