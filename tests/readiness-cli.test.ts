import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Jarvis readiness CLI reports blockers without leaking secrets", () => {
  const source = readFileSync("scripts/jarvis_readiness.ts", "utf-8");
  assert.match(source, /import \{ redactSensitiveText \}/);
  assert.match(source, /redactSensitiveText\(JSON\.stringify\(report, null, 2\)\)/);
  assert.match(source, /return redactSensitiveText\(\[/);

  const result = spawnSync("node", ["scripts/jarvis_readiness.ts", "--json", "--no-env-file"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      GEMINI_API_KEY: "dummy",
      DATABASE_URL: "postgres://postgres:PASSWORD@example.com:5432/db",
      REDIS_URL: "redis://default:PASSWORD@example.com:6379",
    },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.includes("PASSWORD"), false);
  const body = JSON.parse(result.stdout) as {
    status: string;
    blockers: Array<{ key: string }>;
    fixGuide: Array<{ id: string; envKeys: string[] }>;
    attentionQueue: Array<{ key: string; validationCommand: string }>;
  };
  assert.equal(body.status, "blocked");
  assert.ok(body.blockers.some((blocker) => blocker.key === "postgres"));
  assert.equal(body.blockers.some((blocker) => blocker.key === "redis"), false);
  assert.equal(body.fixGuide.some((step) => step.id === "redis-real-password"), false);
  assert.equal(body.attentionQueue.some((item) => item.key === "redis"), false);
});

test("Jarvis readiness CLI exits ready when only unused Redis is invalid", () => {
  const result = spawnSync("node", ["scripts/jarvis_readiness.ts", "--json", "--no-env-file"], {
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
      JARVIS_WEB_TOKEN: "strong-jarvis-web-token-for-remote-mcp",
      GOOGLE_SHEET_ID: "sheet",
      GOOGLE_MAPS_API_KEY: "maps",
      SERPER_API_KEY: "serper",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("PASSWORD"), false);
  const body = JSON.parse(result.stdout) as {
    status: string;
    blockers: Array<{ key: string; severity: string }>;
    attentionQueue: Array<{ key: string; severity: string }>;
  };
  assert.equal(body.status, "ready");
  assert.equal(body.blockers.some((blocker) => blocker.key === "redis"), false);
  assert.equal(body.attentionQueue.some((item) => item.key === "redis"), false);
});

test("Jarvis readiness CLI help is available without env", () => {
  const result = spawnSync("node", ["scripts/jarvis_readiness.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Arcigy Jarvis readiness/);
  assert.match(result.stdout, /--live/);
});
