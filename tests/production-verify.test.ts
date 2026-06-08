import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production verifier wires every live release gate", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> };
  const script = readFileSync("scripts/verify_production.ts", "utf-8");

  assert.equal(packageJson.scripts["verify:production"], "node scripts/verify_production.ts");
  assert.match(script, /runNpm\("typecheck", \["run", "typecheck"\]\)/);
  assert.match(script, /runNpm\("tests", \["test"\]\)/);
  assert.match(script, /process\.env\.npm_execpath/);
  assert.match(script, /ensureWebBridge/);
  assert.match(script, /doctor", "--", "--live-integrations"/);
  assert.match(script, /remote:mcp:smoke/);
  assert.match(script, /ui:smoke/);
  assert.match(script, /runSecretScan/);
  assert.match(script, /git", \["ls-files", "-z"\]/);
  assert.match(script, /JARVIS_VERIFY_WEB_URL/);
  assert.match(script, /redactSensitiveText/);
  assert.match(script, /process\.stdout\.write\(redactSensitiveText\(result\.stdout\)\)/);
  assert.match(script, /process\.stderr\.write\(redactSensitiveText\(result\.stderr\)\)/);
  assert.match(script, /redactSensitiveText\(String\(chunk\)\)/);
  assert.match(script, /redactSensitiveText\(check\.detail\)/);
  assert.match(script, /Arcigy Jarvis production verification/);
  assert.doesNotMatch(script, /API_SECRET_KEY=dummy/);
});
