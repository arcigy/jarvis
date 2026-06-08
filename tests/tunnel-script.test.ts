import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("web tunnel script orchestrates protected Jarvis MCP exposure", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> };
  const script = readFileSync("scripts/start_web_tunnel.ts", "utf-8");

  assert.equal(packageJson.scripts["web:tunnel"], "node scripts/start_web_tunnel.ts");
  assert.equal(packageJson.scripts["web:tunnel:secure"], "node scripts/start_web_tunnel.ts --generate-token");
  assert.match(script, /JARVIS_WEB_TOKEN/);
  assert.match(script, /randomBytes/);
  assert.match(script, /src\/server\/local-api-server\.ts/);
  assert.match(script, /\/api\/web-bridge-preflight/);
  assert.match(script, /fetchJson<Preflight>\(`\$\{origin\}\/api\/web-bridge-preflight`, token\)/);
  assert.match(script, /headers\.authorization = `Bearer \$\{token\}`/);
  assert.match(script, /\/\.well-known\/arcigy-jarvis\.json/);
  assert.match(script, /External connection pack/);
  assert.match(script, /includeReadiness=true&live=true/);
  assert.match(script, /\/api\/remote-mcp-smoke/);
  assert.match(script, /verifyRemoteMcpSmoke/);
  assert.match(script, /Authorization: Bearer <JARVIS_WEB_TOKEN>/);
  assert.match(script, /--no-start-web/);
  assert.match(script, /--generate-token/);
  assert.match(script, /One-time token/);
  assert.match(script, /--help/);
  assert.match(script, /ngrok-skip-browser-warning/);
  assert.match(script, /npx/);
  assert.doesNotMatch(script, /API_SECRET_KEY=dummy/);
});
