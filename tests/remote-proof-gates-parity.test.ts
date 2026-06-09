import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type GateSource = {
  file: string;
  variableName: string;
  label?: string;
};

const gateSources: GateSource[] = [
  { file: "scripts/verify_production.ts", variableName: "requiredRemoteMcpSmokeGates" },
  { file: "src/automation-system/remote-mcp-smoke.ts", variableName: "requiredReleaseProofGates" },
  { file: "src/desktop/main.cjs", variableName: "requiredReleaseProofGates" },
  { file: "src/desktop/renderer.js", variableName: "requiredRemoteSmokeGates" },
  { file: "scripts/start_web_tunnel.ts", variableName: "requiredChecks" },
  { file: "src/automation-system/remote-mcp-pack.ts", variableName: "requiredProofGates", label: "remote pack agent setup profiles" },
  { file: "src/desktop/main.cjs", variableName: "requiredProofGates", label: "desktop agent setup profiles" },
];

test("remote MCP release proof gates stay in parity across production surfaces", () => {
  const canonical = extractStringArray(gateSources[0]);

  assert.equal(canonical.length, 35);
  assert.deepEqual(new Set(canonical).size, canonical.length);
  assert.deepEqual(canonical.slice(0, 6), [
    "manifest",
    "tool-count",
    "manifest-tool-registry",
    "manifest-tool-metadata",
    "auth-placeholder",
    "manifest-local-write-policy",
  ]);
  assert.deepEqual(canonical.slice(-6), [
    "pack-production-evidence-quick-start",
    "read-only-tool-call",
    "production-evidence-tool-call",
    "approval-gate",
    "approval-shape-gate",
    "secret-redaction",
  ]);

  for (const source of gateSources.slice(1)) {
    assert.deepEqual(
      extractStringArray(source),
      canonical,
      `${source.file}:${source.label ?? source.variableName} drifted from verify_production.ts`,
    );
  }
});

function extractStringArray(source: GateSource): string[] {
  const text = readFileSync(source.file, "utf-8");
  const escapedName = source.variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`const\\s+${escapedName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(match, `Missing array ${source.variableName} in ${source.file}`);
  const values = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  assert.ok(values.length > 0, `No string gates found in ${source.file}:${source.variableName}`);
  return values;
}
