import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getIntegrationHealth, loadLocalEnv } from "../automation-system/env.ts";
import { buildClientReplyPrompt, generateGeminiText } from "../automation-system/gemini.ts";
import { handleJarvisVoiceEvent, type JarvisVoiceSession } from "../automation-system/jarvis-voice.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const desktopRoot = join(repoRoot, "src", "desktop");
const defaultDbPath = join(repoRoot, "data", "jarvis-local.db");

loadLocalEnv(repoRoot);

export type LocalApiServerOptions = {
  host?: string;
  port?: number;
};

export function createLocalApiServer() {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function routeRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/api/system-health") {
    writeJson(response, 200, {
      integrations: getIntegrationHealth(),
      dbPath: defaultDbPath,
      mode: "web",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jarvis/voice-event") {
    const payload = await readJson(request);
    const result = handleJarvisVoiceEvent((payload.session ?? { state: "idle", wakeWord: "jarvis" }) as JarvisVoiceSession, {
      type: "transcript",
      text: String(payload.text ?? ""),
    });
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cold-outreach-brief") {
    const payload = await readJson(request);
    const period = resolveColdOutreachPeriod(String(payload.text ?? payload.periodLabel ?? ""));
    const result = runPython([
      "scripts/jarvis_local_db.py",
      "cold-brief",
      "--db",
      String(payload.dbPath ?? defaultDbPath),
      "--payload",
      JSON.stringify({
        since: payload.since ?? period.since,
        until: payload.until ?? period.until,
        periodLabel: payload.periodLabel ?? period.periodLabel,
      }),
    ]);
    writeJson(response, 200, JSON.parse(result.stdout).summary);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-ai-reply") {
    const payload = await readJson(request);
    const result = await generateGeminiText(
      buildClientReplyPrompt({
        clientName: optionalString(payload.clientName),
        message: String(payload.message ?? ""),
        context: optionalString(payload.context),
        language: payload.language === "en" ? "en" : "sk",
        tone: payload.tone === "direct" || payload.tone === "warm" ? payload.tone : "executive",
      })
    );
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-contracts") {
    const payload = await readJson(request);
    const outputDir = String(payload.outputDir ?? join(repoRoot, "generated", "contracts"));
    const intake = typeof payload.intake === "string" ? JSON.parse(payload.intake) : payload.intake;
    if (!intake || typeof intake !== "object") {
      writeJson(response, 400, { error: "Contract intake JSON is required." });
      return;
    }
    const result = runPython([
      "scripts/generate_contract_documents.py",
      "--payload",
      JSON.stringify(intake),
      "--output-dir",
      outputDir,
    ]);
    const manifestPath = join(outputDir, "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    writeJson(response, 200, {
      outputDir,
      manifestPath,
      generatedFiles: manifest.generatedFiles,
      stdout: result.stdout,
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/mcp/")) {
    await routeMcpTool(url.pathname.replace("/api/mcp/", ""), request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(url.pathname, response, request.method === "HEAD");
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

async function routeMcpTool(name: string, request: IncomingMessage, response: ServerResponse) {
  const payload = await readJson(request);
  if (name === "arcigy.get_system_health") {
    writeJson(response, 200, { result: { integrations: getIntegrationHealth() } });
    return;
  }
  if (name === "arcigy.generate_ai_reply") {
    writeJson(response, 200, {
      result: await generateGeminiText(buildClientReplyPrompt({ message: String(payload.message ?? ""), context: optionalString(payload.context) })),
    });
    return;
  }
  if (name === "arcigy.get_cold_outreach_brief_from_db") {
    const result = runPython([
      "scripts/jarvis_local_db.py",
      "cold-brief",
      "--db",
      String(payload.dbPath ?? defaultDbPath),
      "--payload",
      JSON.stringify(payload),
    ]);
    writeJson(response, 200, { result: JSON.parse(result.stdout) });
    return;
  }
  writeJson(response, 404, { error: `Unsupported web MCP bridge tool: ${name}` });
}

function serveStatic(pathname: string, response: ServerResponse, headOnly: boolean) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(desktopRoot, relative));
  if (!filePath.startsWith(resolve(desktopRoot)) || !existsSync(filePath)) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }
  const body = headOnly ? Buffer.alloc(0) : readFileSync(filePath);
  response.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
  response.end(body);
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function resolveColdOutreachPeriod(text: string) {
  const lowered = normalizeTranscript(text);
  const now = new Date();
  const until = now.toISOString();
  if (lowered.includes("dnes") || lowered.includes("today")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { since: start.toISOString(), until, periodLabel: "dnes" };
  }
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until, periodLabel: "posledných 7 dní" };
}

function normalizeTranscript(text: string) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim();
}

function runPython(args: string[]): { stdout: string; stderr: string } {
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `Python command failed with status ${result.status}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.JARVIS_WEB_PORT ?? 8765);
  const host = process.env.JARVIS_WEB_HOST ?? "127.0.0.1";
  createLocalApiServer().listen(port, host, () => {
    console.log(`Arcigy Jarvis web bridge listening on http://${host}:${port}`);
  });
}
