import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production verifier wires every live release gate", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> };
  const script = readFileSync("scripts/verify_production.ts", "utf-8");

  assert.equal(packageJson.scripts["verify:production"], "node scripts/verify_production.ts");
  assert.match(script, /runNpm\("typecheck", \["run", "typecheck"\]\)/);
  assert.match(script, /runNpm\("tests", \["test"\]\)/);
  assert.equal(packageJson.scripts["local:memory:smoke"], "node scripts/local_memory_smoke.ts");
  assert.match(script, /runNpm\("local-memory-smoke", \["run", "local:memory:smoke"\]\)/);
  assert.match(script, /process\.env\.npm_execpath/);
  assert.match(script, /ensureWebBridge/);
  assert.match(script, /doctor", "--", "--live-integrations"/);
  assert.match(script, /remote:mcp:smoke/);
  assert.match(script, /ui:smoke/);
  assert.match(script, /runSecretScan/);
  assert.match(script, /writeEvidence/);
  assert.match(script, /generated", "production-verification", "latest\.json"/);
  assert.match(script, /arcigy-jarvis-production-verification/);
  assert.match(script, /Secret-safe: command output is streamed through redactSensitiveText/);
  assert.match(script, /git", \["ls-files", "-z"\]/);
  assert.match(script, /JARVIS_VERIFY_WEB_URL/);
  assert.match(script, /redactSensitiveText/);
  assert.match(script, /process\.stdout\.write\(redactSensitiveText\(result\.stdout\)\)/);
  assert.match(script, /process\.stderr\.write\(redactSensitiveText\(result\.stderr\)\)/);
  assert.match(script, /redactSensitiveText\(String\(chunk\)\)/);
  assert.match(script, /redactSensitiveText\(check\.detail\)/);
  assert.match(script, /redactSensitiveText\(JSON\.stringify\(payload, null, 2\)\)/);
  assert.match(script, /Arcigy Jarvis production verification/);
  assert.doesNotMatch(script, /API_SECRET_KEY=dummy/);
});
