import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Jarvis secrets audit reports local setup without leaking secret values", () => {
  const source = readFileSync("scripts/jarvis_env_audit.ts", "utf-8");
  assert.match(source, /arcigy-jarvis-secrets-audit/);
  assert.match(source, /redactSensitiveText\(output\)/);
  assert.match(source, /sha256:/);
  assert.match(source, /localEnvIgnoredByGit/);

  const rawGemini = "gemini-secret-value-that-should-not-leak";
  const rawGoogleSecret = "google-client-secret-that-should-not-leak";
  const rawRefresh = "gmail-refresh-token-that-should-not-leak";
  const result = spawnSync("node", ["scripts/jarvis_env_audit.ts", "--json", "--no-env-file"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      API_SECRET_KEY: "local-api-secret",
      JARVIS_WEB_TOKEN: "local-web-token-with-enough-length",
      DATABASE_URL: "postgres://postgres:real-password@example.com:5432/db",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
      SMARTLEAD_API_KEY: "smartlead-secret",
      GEMINI_API_KEY: rawGemini,
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: rawGoogleSecret,
      GOOGLE_SHEET_ID: "sheet-id",
      GOOGLE_MAPS_API_KEY: "maps-secret",
      SERPER_API_KEY: "serper-secret",
      GMAIL_REFRESH_TOKEN_BRANISLAV_ARCIGY_GROUP: rawRefresh,
      GMAIL_REFRESH_TOKEN_BRANISLAV_L_ARCIGY_GROUP: "refresh-two",
      GMAIL_REFRESH_TOKEN_ANDREJ_ARCIGY_GROUP: "refresh-three",
      GMAIL_REFRESH_TOKEN_ANDREJ_R_ARCIGY_GROUP: "refresh-four",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(rawGemini), false);
  assert.equal(result.stdout.includes(rawGoogleSecret), false);
  assert.equal(result.stdout.includes(rawRefresh), false);
  assert.equal(result.stdout.includes("PASSWORD"), false);

  const body = JSON.parse(result.stdout) as {
    mode: string;
    status: string;
    localEnvIgnoredByGit: boolean;
    keys: Array<{ key: string; state: string; length: number; fingerprint: string | null; issue: string | null }>;
    integrations: Array<{ key: string; configured: boolean; requiredForProduction: boolean }>;
  };
  assert.equal(body.mode, "arcigy-jarvis-secrets-audit");
  assert.equal(body.status, "attention");
  assert.equal(body.localEnvIgnoredByGit, true);
  assert.equal(body.integrations.find((item) => item.key === "redis")?.requiredForProduction, false);
  assert.equal(body.integrations.find((item) => item.key === "remoteMcp")?.configured, true);
  assert.equal(body.integrations.find((item) => item.key === "remoteMcp")?.requiredForProduction, false);
  assert.equal(body.keys.find((item) => item.key === "REDIS_URL")?.state, "placeholder");
  assert.match(body.keys.find((item) => item.key === "GEMINI_API_KEY")?.fingerprint ?? "", /^sha256:[0-9a-f]{12}$/);
});

test("Jarvis secrets audit strict mode blocks missing required production secrets", () => {
  const rawDatabaseUrl = "postgres://postgres:PASSWORD@example.com:5432/db";
  const result = spawnSync("node", ["scripts/jarvis_env_audit.ts", "--json", "--strict", "--no-env-file"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      GEMINI_API_KEY: "dummy",
      DATABASE_URL: rawDatabaseUrl,
    },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.includes(rawDatabaseUrl), false);
  assert.equal(result.stdout.includes("PASSWORD"), false);
  const body = JSON.parse(result.stdout) as { status: string; nextActions: string[] };
  assert.equal(body.status, "blocked");
  assert.ok(body.nextActions.some((action) => action.includes("gemini")));
  assert.ok(body.nextActions.some((action) => action.includes("postgres")));
});

test("Jarvis env bootstrap writes a strong web token without printing it", () => {
  const source = readFileSync("scripts/jarvis_env_bootstrap.ts", "utf-8");
  assert.match(source, /arcigy-jarvis-env-bootstrap/);
  assert.match(source, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(source, /redactSensitiveText\(output\)/);
  assert.match(source, /Secret-safe: generated token is written to \.env\.local and never printed/);

  const root = mkdtempSync(join(tmpdir(), "jarvis-env-bootstrap-"));
  writeFileSync(join(root, ".env.local"), "GEMINI_API_KEY=existing\n", "utf-8");

  const result = spawnSync("node", ["scripts/jarvis_env_bootstrap.ts", "--json", "--repo-root", root], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout) as { mode: string; changed: boolean; tokenLength: number; tokenFingerprint: string; secretPolicy: string };
  const envFile = readFileSync(join(root, ".env.local"), "utf-8");
  const token = envFile.match(/^JARVIS_WEB_TOKEN=(.+)$/m)?.[1] ?? "";

  assert.equal(body.mode, "arcigy-jarvis-env-bootstrap");
  assert.equal(body.changed, true);
  assert.equal(body.tokenLength, token.length);
  assert.ok(token.length >= 32);
  assert.match(body.tokenFingerprint, /^sha256:[0-9a-f]{12}$/);
  assert.equal(result.stdout.includes(token), false);
  assert.match(body.secretPolicy, /never printed/);
});

test("Jarvis env bootstrap preserves strong token unless forced", () => {
  const root = mkdtempSync(join(tmpdir(), "jarvis-env-bootstrap-existing-"));
  const existingToken = "existing-strong-jarvis-web-token-value";
  writeFileSync(join(root, ".env.local"), `JARVIS_WEB_TOKEN=${existingToken}\n`, "utf-8");

  const noForce = spawnSync("node", ["scripts/jarvis_env_bootstrap.ts", "--json", "--repo-root", root], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  assert.equal(noForce.status, 0, noForce.stderr);
  assert.equal(JSON.parse(noForce.stdout).changed, false);
  assert.equal(readFileSync(join(root, ".env.local"), "utf-8").includes(existingToken), true);

  const forced = spawnSync("node", ["scripts/jarvis_env_bootstrap.ts", "--json", "--force", "--repo-root", root], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(JSON.parse(forced.stdout).changed, true);
  const envFile = readFileSync(join(root, ".env.local"), "utf-8");
  assert.equal(envFile.includes(existingToken), false);
  const nextToken = envFile.match(/^JARVIS_WEB_TOKEN=(.+)$/m)?.[1] ?? "";
  assert.equal(forced.stdout.includes(nextToken), false);
});
