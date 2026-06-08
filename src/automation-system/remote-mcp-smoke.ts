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
  checks.push(
    check(
      hasLocalWritePolicy(manifest.body?.toolPolicy),
      "manifest-local-write-policy",
      "Manifest identifies local write tools separately from read-only/draft tools."
    )
  );

  const pack = await getJson(fetchImpl, `${baseUrl}/api/remote-mcp-pack?includeReadiness=false`, input.bearerToken);
  checks.push(check(pack.ok, "connection-pack", pack.ok ? "Remote MCP connection pack is reachable." : pack.message));
  checks.push(check(pack.body?.auth?.tokenValueReturned === false, "pack-secret-policy", "Connection pack confirms tokenValueReturned=false."));
  checks.push(
    check(
      hasLocalWritePolicy(pack.body?.tools),
      "pack-local-write-policy",
      "Connection pack identifies local write tools separately from read-only/draft tools."
    )
  );
  checks.push(
    check(
      hasUsableContractQuickStart(pack.body?.quickStartCalls),
      "pack-contract-quick-start",
      "Connection pack includes a usable approval-gated contract quick-start payload."
    )
  );
  checks.push(
    check(
      hasHandoffProof(pack.body?.handoff, baseUrl),
      "pack-handoff-proof",
      "Connection pack includes remote handoff proof URLs and first-step instructions."
    )
  );
  checks.push(
    check(
      hasClientMemoryQuickStarts(pack.body?.quickStartCalls),
      "pack-client-memory-quick-start",
      "Connection pack includes read-only client identity and open-need quick-start calls."
    )
  );

  const health = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.get_system_health`, { format: "json" }, input.bearerToken);
  checks.push(check(health.ok && Array.isArray(health.body?.result?.integrations), "read-only-tool-call", "Read-only MCP tool call returned integration health."));

  const approvalGate = await postJson(fetchImpl, `${baseUrl}/api/mcp/arcigy.generate_contract_documents`, { intake: {} }, input.bearerToken);
  checks.push(check(approvalGate.status === 409, "approval-gate", "Approval-required write tool rejected an unapproved call."));

  const leakedToken = input.bearerToken ? JSON.stringify({ manifest: manifest.body, pack: pack.body, health: health.body, approvalGate: approvalGate.body }).includes(input.bearerToken) : false;
  checks.push(check(!leakedToken, "secret-redaction", "Smoke responses did not echo the bearer token."));

  const status: RemoteMcpSmokeStatus = checks.every((item) => item.status === "ready") ? "ready" : "blocked";
  return {
    mode: "remote-mcp-smoke",
    status,
    checkedAt: new Date().toISOString(),
    baseUrl,
    summary:
      status === "ready"
        ? `Remote MCP smoke ready: manifest, ${expectedToolCount} tools, local write policy, contract quick-start, client memory quick-start, handoff proof, read-only call, approval gate, and secret policy passed.`
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

function hasLocalWritePolicy(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const policy = value as { localStateWrite?: unknown; readOnlyOrDraft?: unknown };
  const localStateWrite = Array.isArray(policy.localStateWrite) ? policy.localStateWrite : [];
  const readOnlyOrDraft = Array.isArray(policy.readOnlyOrDraft) ? policy.readOnlyOrDraft : [];
  return localStateWrite.includes("arcigy.sync_gmail_recent_messages") && !readOnlyOrDraft.includes("arcigy.sync_gmail_recent_messages");
}

function hasUsableContractQuickStart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const call = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as { tool?: unknown }).tool === "arcigy.generate_contract_documents";
  }) as { approvalRequired?: unknown; body?: { approval?: { approved?: unknown }; intake?: unknown } } | undefined;
  if (!call || call.approvalRequired !== true || call.body?.approval?.approved !== true) return false;
  const intake = call.body.intake as { client?: { businessName?: unknown; email?: unknown }; project?: { includedModules?: unknown }; pricing?: unknown } | undefined;
  if (!intake || typeof intake !== "object") return false;
  const hasRequiredShape =
    typeof intake.client?.businessName === "string" &&
    typeof intake.client?.email === "string" &&
    Array.isArray(intake.project?.includedModules) &&
    Boolean(intake.pricing);
  return hasRequiredShape && !/dopln|todo|tbd|xxx|\?\?\?/i.test(JSON.stringify(call.body));
}

function hasHandoffProof(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object") return false;
  const handoff = value as { connectionPackUrl?: unknown; requiredProof?: unknown; agentFirstSteps?: unknown };
  if (handoff.connectionPackUrl !== `${baseUrl}/api/remote-mcp-pack?includeReadiness=true&live=true`) return false;
  const requiredProof = Array.isArray(handoff.requiredProof) ? handoff.requiredProof : [];
  const agentFirstSteps = Array.isArray(handoff.agentFirstSteps) ? handoff.agentFirstSteps : [];
  const proofKeys = new Set(requiredProof.map((item) => (item && typeof item === "object" ? (item as { key?: unknown }).key : null)));
  return (
    proofKeys.has("manifest") &&
    proofKeys.has("connection-pack") &&
    proofKeys.has("remote-smoke") &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("arcigy.get_operator_briefing")) &&
    agentFirstSteps.some((step) => typeof step === "string" && step.includes("status=ready"))
  );
}

function hasClientMemoryQuickStarts(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const identify = value.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.identify_email") as
    | { approvalRequired?: unknown; body?: { email?: unknown } }
    | undefined;
  const alerts = value.find((item) => item && typeof item === "object" && (item as { tool?: unknown }).tool === "arcigy.get_client_need_alerts") as
    | { approvalRequired?: unknown; body?: { status?: unknown; limit?: unknown } }
    | undefined;
  return (
    identify?.approvalRequired === false &&
    typeof identify.body?.email === "string" &&
    alerts?.approvalRequired === false &&
    alerts.body?.status === "new" &&
    typeof alerts.body?.limit === "number"
  );
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
  return {
    connection: "close",
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
  };
}
