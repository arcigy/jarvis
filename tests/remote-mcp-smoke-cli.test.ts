import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createLocalApiServer } from "../src/server/local-api-server.ts";

test("remote MCP smoke CLI help and package script are wired", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["remote:mcp:smoke"], "node scripts/remote_mcp_smoke.ts");

  const result = spawnSync("node", ["scripts/remote_mcp_smoke.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Arcigy Jarvis remote MCP smoke/);
  assert.match(result.stdout, /--url/);
  assert.match(result.stdout, /--token-env/);
});

test("remote MCP smoke CLI verifies a local bridge without leaking token", async () => {
  const previousToken = process.env.JARVIS_WEB_TOKEN;
  const token = "cli-smoke-token";
  process.env.JARVIS_WEB_TOKEN = token;

  const server = createLocalApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runNode(["scripts/remote_mcp_smoke.ts", "--url", baseUrl, "--token-env", "JARVIS_WEB_TOKEN", "--json"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JARVIS_WEB_TOKEN: token,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(token), false);
    const body = JSON.parse(result.stdout) as { status: string; expectedToolCount: number; tokenValueReturned: boolean; checks: Array<{ key: string; status: string }> };
    assert.equal(body.status, "ready");
    assert.equal(body.expectedToolCount, 27);
    assert.equal(body.tokenValueReturned, false);
    assert.ok(body.checks.some((check) => check.key === "manifest-local-write-policy" && check.status === "ready"));
    assert.ok(body.checks.some((check) => check.key === "pack-local-write-policy" && check.status === "ready"));
    assert.ok(body.checks.some((check) => check.key === "pack-contract-quick-start" && check.status === "ready"));
    assert.ok(body.checks.some((check) => check.key === "pack-contract-draft-quick-start" && check.status === "ready"));
  } finally {
    if (previousToken === undefined) delete process.env.JARVIS_WEB_TOKEN;
    else process.env.JARVIS_WEB_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

function runNode(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("node", args, options);
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout: stdout.join(""), stderr: stderr.join("") }));
  });
}
