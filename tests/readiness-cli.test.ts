import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Jarvis readiness CLI reports blockers without leaking secrets", () => {
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
  };
  assert.equal(body.status, "blocked");
  assert.ok(body.blockers.some((blocker) => blocker.key === "postgres"));
  assert.ok(body.blockers.some((blocker) => blocker.key === "redis"));
  assert.ok(body.fixGuide.some((step) => step.id === "redis-real-password" && step.envKeys.includes("REDIS_URL")));
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
