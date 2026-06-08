#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { redactSensitiveText } from "../src/automation-system/ai-safety.ts";
import { loadLocalEnv } from "../src/automation-system/env.ts";

type Tunnel = {
  public_url?: string;
  proto?: string;
};

type Preflight = {
  readyForTunnel?: boolean;
  tokenConfigured?: boolean;
  tokenStrong?: boolean;
  manifestUrl?: string;
  mcpToolCount?: number;
  warnings?: string[];
};

type RemoteMcpSmoke = {
  status?: string;
  summary?: string;
};

type RemoteConnectionPack = {
  auth?: {
    tokenValueReturned?: boolean;
  };
  tools?: {
    count?: number;
    approvalRequired?: string[];
    localStateWrite?: string[];
  };
  handoff?: {
    requiredProof?: Array<{ key?: string }>;
    agentFirstSteps?: string[];
  };
};

class TunnelExit extends Error {}

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

loadLocalEnv(repoRoot);

const host = getArg("host", process.env.JARVIS_WEB_HOST || "127.0.0.1");
const port = Number(getArg("port", process.env.JARVIS_WEB_PORT || "8765"));
const origin = `http://${host}:${port}`;
const ngrokApi = getArg("ngrok-api", "http://127.0.0.1:4040");
const noStartWeb = args.includes("--no-start-web");
const allowMissingToken = args.includes("--allow-missing-token");
const generateToken = args.includes("--generate-token");

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Arcigy Jarvis web tunnel",
      "",
      "Usage:",
      "  npm run web:tunnel",
      "  npm run web:tunnel -- --no-start-web",
      "",
      "Options:",
      "  --host <host>           Local web bridge host. Default: 127.0.0.1",
      "  --port <port>           Local web bridge port. Default: 8765",
      "  --ngrok-api <url>       Local ngrok API URL. Default: http://127.0.0.1:4040",
      "  --no-start-web          Require an already running npm run web process.",
      "  --allow-missing-token   Development only; do not use for external access.",
      "  --generate-token        Generate a one-time bearer token for this tunnel process.",
      "",
      "Requires JARVIS_WEB_TOKEN in .env.local before exposing remote MCP tools.",
      "Alternatively use --generate-token for an ephemeral token that is printed once.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

try {
  await main();
} catch (error) {
  if (error instanceof TunnelExit) {
    process.stderr.write(`${redactSensitiveText(error.message)}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

async function main() {
  if (!Number.isInteger(port) || port <= 0) exitWithMessage(`Invalid --port value: ${String(port)}`);

  const generatedToken = !getWebToken() && generateToken ? randomBytes(32).toString("base64url") : null;
  if (generatedToken) process.env.JARVIS_WEB_TOKEN = generatedToken;
  const token = getWebToken();
  if (!token && !allowMissingToken) {
    exitWithMessage("Set JARVIS_WEB_TOKEN in .env.local or run npm run web:tunnel:secure before exposing Jarvis through a tunnel.");
  }

  let webChild: ChildProcess | null = null;
  let ngrokChild: ChildProcess | null = null;

  try {
    if (!(await isWebBridgeOnline())) {
      if (noStartWeb) exitWithMessage(`Web bridge is not responding at ${origin}. Start npm run web first or remove --no-start-web.`);
      webChild = startWebBridge();
      await waitForWebBridge();
    }

    const preflight = await fetchJson<Preflight>(`${origin}/api/web-bridge-preflight`, token);
    if (!preflight.readyForTunnel && !allowMissingToken) {
      if (generatedToken && preflight.tokenConfigured === false) {
        exitWithMessage(
          "A web bridge is already running without this generated token. Stop the existing web process, then rerun npm run web:tunnel:secure so the tunnel runner can start the protected bridge."
        );
      }
      exitWithMessage(`Web bridge is not ready for tunnel: ${(preflight.warnings ?? []).join(" ") || "unknown preflight failure"}`);
    }

    ngrokChild = startNgrok();
    const publicUrl = await waitForPublicTunnel();
    await verifyExternalManifest(publicUrl, token);
    const pack = await verifyExternalConnectionPack(publicUrl, token);
    const smoke = await verifyRemoteMcpSmoke(publicUrl, token);

    process.stdout.write(
      renderTunnelReadySummary({
        publicUrl,
        preflight,
        pack,
        smoke,
        generatedToken,
      })
    );

    await waitUntilStopped([ngrokChild, webChild]);
  } finally {
    stopChild(ngrokChild);
    stopChild(webChild);
  }
}

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function isWebBridgeOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/web-bridge-preflight`);
    return response.ok;
  } catch {
    return false;
  }
}

function startWebBridge(): ChildProcess {
  const child = spawn(process.execPath, ["src/server/local-api-server.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JARVIS_WEB_HOST: host,
      JARVIS_WEB_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeChild("web", child);
  return child;
}

async function waitForWebBridge() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isWebBridgeOnline()) return;
    await delay(400);
  }
  exitWithMessage(`Timed out waiting for Jarvis web bridge at ${origin}.`);
}

function startNgrok(): ChildProcess {
  const command = resolveNgrokCommand();
  if (!command) exitWithMessage("ngrok was not found. Install ngrok or keep npx available, then run npm run web:tunnel again.");

  const child = spawn(command.executable, command.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeChild("ngrok", child);
  return child;
}

function resolveNgrokCommand(): { executable: string; args: string[] } | null {
  const ngrok = commandName("ngrok");
  if (isCommandAvailable(ngrok)) return { executable: ngrok, args: ["http", origin] };

  const npx = commandName("npx");
  if (isCommandAvailable(npx)) return { executable: npx, args: ["--yes", "ngrok", "http", origin] };

  return null;
}

function commandName(command: string): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function isCommandAvailable(command: string): boolean {
  const check =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return check.status === 0;
}

async function waitForPublicTunnel(): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const body = await fetchJson<{ tunnels?: Tunnel[] }>(`${ngrokApi}/api/tunnels`);
      const url = body.tunnels?.find((tunnel) => tunnel.proto === "https" && tunnel.public_url?.startsWith("https://"))?.public_url;
      if (url) return url.replace(/\/$/, "");
    } catch {
      // ngrok API starts after the tunnel process is ready.
    }
    await delay(750);
  }
  exitWithMessage("Timed out waiting for ngrok public HTTPS tunnel. Check ngrok auth and local network access.");
}

async function verifyExternalManifest(publicUrl: string, token: string | null) {
  if (!token) return;
  const response = await fetch(`${publicUrl}/.well-known/arcigy-jarvis.json`, {
    headers: {
      authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    },
  });
  if (!response.ok) {
    exitWithMessage(`Tunnel opened, but the external Jarvis manifest returned HTTP ${response.status}.`);
  }
}

async function verifyExternalConnectionPack(publicUrl: string, token: string | null): Promise<RemoteConnectionPack | null> {
  if (!token) return null;
  const response = await fetch(`${publicUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`, {
    headers: {
      authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    },
  });
  if (!response.ok) {
    exitWithMessage(`Tunnel opened, but the external Jarvis connection pack returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as RemoteConnectionPack;
  if (body.auth?.tokenValueReturned !== false || !body.tools?.count || !body.handoff?.requiredProof?.some((item) => item.key === "remote-smoke")) {
    exitWithMessage("Tunnel opened, but the external Jarvis connection pack is missing secret policy, tool count, or remote-smoke proof.");
  }
  return body;
}

async function verifyRemoteMcpSmoke(publicUrl: string, token: string | null): Promise<RemoteMcpSmoke | null> {
  if (!token) return null;
  const response = await fetch(`${publicUrl}/api/remote-mcp-smoke`, {
    headers: {
      authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    },
  });
  if (!response.ok) {
    exitWithMessage(`Tunnel opened, but the external Jarvis remote MCP smoke returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as RemoteMcpSmoke;
  if (body.status !== "ready") {
    exitWithMessage(`Tunnel opened, but remote MCP smoke is not ready: ${body.summary ?? "unknown smoke failure"}`);
  }
  return body;
}

function renderTunnelReadySummary(input: {
  publicUrl: string;
  preflight: Preflight;
  pack: RemoteConnectionPack | null;
  smoke: RemoteMcpSmoke | null;
  generatedToken: string | null;
}): string {
  const connectionPackUrl = `${input.publicUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`;
  const smokeUrl = `${input.publicUrl}/api/remote-mcp-smoke`;
  const mcpToolPattern = `${input.publicUrl}/api/mcp/{toolName}`;
  const toolCount = input.pack?.tools?.count ?? input.preflight.mcpToolCount ?? "unknown";
  const approvalLocks = input.pack?.tools?.approvalRequired?.length ?? "unknown";
  const localWrites = input.pack?.tools?.localStateWrite?.length ?? "unknown";
  const tokenLine = input.generatedToken ? `One-time token: ${input.generatedToken}` : "Token source: JARVIS_WEB_TOKEN";
  const tokenRule = input.generatedToken ? "This token exists only for this running tunnel session." : "Keep the token only in local secrets.";
  return [
    "",
    "Arcigy Jarvis tunnel is ready.",
    `Local UI: ${origin}/index.html`,
    `External manifest: ${input.publicUrl}/.well-known/arcigy-jarvis.json`,
    `External connection pack: ${connectionPackUrl}`,
    `External smoke test: ${smokeUrl}`,
    `External MCP tool pattern: ${mcpToolPattern}`,
    `MCP tool count: ${toolCount}`,
    `Approval locks: ${approvalLocks}`,
    `Local memory write tools: ${localWrites}`,
    input.smoke?.summary ? `Smoke: ${input.smoke.summary}` : "Smoke: skipped because no bearer token was available.",
    "Auth header: Authorization: Bearer <JARVIS_WEB_TOKEN>",
    tokenLine,
    tokenRule,
    "",
    "Remote agent handoff block:",
    `- Manifest: ${input.publicUrl}/.well-known/arcigy-jarvis.json`,
    `- Connection pack: ${connectionPackUrl}`,
    `- Smoke test: ${smokeUrl}`,
    `- MCP tool call pattern: ${mcpToolPattern}`,
    "- Required proof before work: manifest HTTP 200, connection pack tokenValueReturned=false, remote smoke status=ready.",
    "- First MCP call: POST arcigy.get_operator_briefing with {\"periodLabel\":\"poslednych 7 dni\",\"live\":true}.",
    "- Approval rule: never call approval-required tools without your explicit confirmation of the exact payload.",
    "- Local write rule: preview Gmail with dryRun=true before syncing messages into local memory.",
    "",
    "Keep this process running while Claude, ChatGPT, or another remote agent uses the tunnel.",
    "Press Ctrl+C to stop Jarvis web bridge and ngrok.",
    "",
  ].join("\n");
}

async function fetchJson<T>(url: string, token: string | null = null): Promise<T> {
  const headers: Record<string, string> = { "ngrok-skip-browser-warning": "true" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

function getWebToken(): string | null {
  const value = (process.env.JARVIS_WEB_TOKEN || process.env.API_SECRET_KEY || "").trim();
  return value && value !== "dummy" ? value : null;
}

function pipeChild(label: string, child: ChildProcess) {
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${redactSensitiveText(String(chunk))}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${redactSensitiveText(String(chunk))}`));
}

async function waitUntilStopped(children: Array<ChildProcess | null>): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
    for (const child of children) {
      child?.once("exit", () => resolve());
    }
  });
}

function stopChild(child: ChildProcess | null) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill();
}

function exitWithMessage(message: string): never {
  throw new TunnelExit(message);
}
