import { listJarvisMcpTools } from "./mcp-tools.ts";

export type RemoteMcpSmokeStatus = "ready" | "blocked";

export type RemoteMcpSmokeCheck = {
  key: string;
  status: RemoteMcpSmokeStatus;
  message: string;
};

export type RemoteMcpSmokeInput = {
  baseUrl?: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
};

export type RemoteMcpSmokeReport = {
  mode: "remote-mcp-smoke";
  status: RemoteMcpSmokeStatus;
  checkedAt: string;
  baseUrl: string;
  summary: string;
  tokenValueReturned: false;
  expectedToolCount: number;
  checks: RemoteMcpSmokeCheck[];
};

export async function runRemoteMcpSmoke(input: RemoteMcpSmokeInput = {}): Promise<RemoteMcpSmokeReport> {
  const baseUrl = (input.baseUrl || "http://127.0.0.1:8765").replace(/\/+$/g, "");
  const fetchImpl = input.fetchImpl ?? fetch;
  const expectedToolCount = listJarvisMcpTools().length;
  const checks: RemoteMcpSmokeCheck[] = [];

  const manifest = await getJson(fetchImpl, `${baseUrl}/.well-known/arcigy-jarvis.json`, input.bearerToken);
  checks.push(check(manifest.ok, "manifest", manifest.ok ? "Manifest is reachable." : manifest.message));

  const manifestTools = Array.isArray(manifest.body?.tools) ? manifest.body.tools : [];
  checks.push(check(manifestTools.length === expectedToolCount, "tool-count", `Manifest exposes ${manifestTools.length}/${expectedToolCount} MCP tools.`));
  checks.push(check(manifest.body?.auth?.header === "Authorization: Bearer <JARVIS_WEB_TOKEN>", "auth-placeholder", "Manifest returns auth placeholder, not the token value."));

  const pack = await getJson(fetchImpl, `${baseUrl}/api/remote-mcp-pack?includeReadiness=false`, input.bearerToken);
  checks.push(check(pack.ok, "connection-pack", pack.ok ? "Remote MCP connection pack is reachable." : pack.message));
  checks.push(check(pack.body?.auth?.tokenValueReturned === false, "pack-secret-policy", "Connection pack confirms tokenValueReturned=false."));

  const health = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_system_health`, { format: "json" }, input.bearerToken);
  checks.push(check(health.ok && Array.isArray(health.body?.result?.integrations), "read-only-tool-call", "Read-only MCP tool call returned integration health."));

  const approvalGate = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.generate_contract_documents`, { intake: {} }, input.bearerToken);
  checks.push(check(approvalGate.status === 409, "approval-gate", "Approval-required write tool rejected an unapproved call."));

  const leakedToken = input.bearerToken ? JSON.stringify({ manifest: manifest.body, pack: pack.body, health: health.body }).includes(input.bearerToken) : false;
  checks.push(check(!leakedToken, "secret-redaction", "Smoke responses did not echo the bearer token."));

  const status: RemoteMcpSmokeStatus = checks.every((item) => item.status === "ready") ? "ready" : "blocked";
  return {
    mode: "remote-mcp-smoke",
    status,
    checkedAt: new Date().toISOString(),
    baseUrl,
    summary:
      status === "ready"
        ? `Remote MCP smoke ready: manifest, ${expectedToolCount} tools, read-only call, approval gate, and secret policy passed.`
        : `Remote MCP smoke blocked: ${checks.filter((item) => item.status === "blocked").length} check(s) failed.`,
    tokenValueReturned: false,
    expectedToolCount,
    checks,
  };
}

function check(ok: boolean, key: string, message: string): RemoteMcpSmokeCheck {
  return {
    key,
    status: ok ? "ready" : "blocked",
    message,
  };
}

async function getJson(fetchImpl: typeof fetch, url: string, bearerToken?: string) {
  try {
    const response = await fetchImpl(url, { headers: requestHeaders(bearerToken) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, message: response.ok ? "OK" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, body: null, message: error instanceof Error ? error.message : String(error) };
  }
}

async function postJson(fetchImpl: typeof fetch, url: string, payload: unknown, bearerToken?: string) {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...requestHeaders(bearerToken) },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, message: response.ok ? "OK" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, body: null, message: error instanceof Error ? error.message : String(error) };
  }
}

function requestHeaders(bearerToken?: string): Record<string, string> {
  return bearerToken ? { authorization: `Bearer ${bearerToken}` } : {};
}
