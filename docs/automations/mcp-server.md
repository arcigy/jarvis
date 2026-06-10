# Arcigy Jarvis MCP server

Run:

```powershell
npm run mcp
```

Claude, ChatGPT, or another MCP client can connect over stdio with:

```json
{
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "C:\\Users\\laube\\Documents\\JARVIS"
}
```

For browser or remote-agent use, set `JARVIS_WEB_TOKEN` in `.env.local` and run:

```powershell
npm run readiness
npm run web:tunnel
```

If you do not want to store a persistent web token yet, run:

```powershell
npm run web:tunnel:secure
```

That command generates a one-time bearer token, starts the protected local bridge when needed, verifies the external manifest, and prints the token once for the remote MCP client. If another `npm run web` process is already running without that token, stop it first so the secure tunnel runner can own the protected bridge.

After the tunnel is ready, the runner writes `generated/remote-mcp-handoff/latest.json`. That artifact is safe to inspect locally: it stores the public action manifest, OpenAPI schema, connection pack, smoke URL, MCP tool pattern, tool counts, ready gate list, and first agent steps, but it never stores the bearer token value.

Run the same smoke proof from CLI when checking a local or external bridge:

```powershell
npm run remote:mcp:smoke
npm run remote:mcp:smoke -- --url https://your-ngrok-url.ngrok-free.app --token-env JARVIS_WEB_TOKEN
```

For release verification against a real public tunnel, set `JARVIS_VERIFY_REMOTE_MCP_URL` or `JARVIS_REMOTE_MCP_URL` to the current ngrok URL before `npm run verify:production`. The verifier runs the same remote smoke proof against that external URL and stores only redacted readiness evidence.

`npm run readiness` prints the same secret-safe blockers and fix guide exposed by `arcigy.get_production_readiness`. Status `ready` means there are no findings, `attention` means only non-blocking advisories remain, and `blocked` means an operator must fix production gates before exposing workflows. The tunnel runner starts the local web bridge if needed, checks `/api/web-bridge-preflight`, starts ngrok, finds the public HTTPS URL, and verifies the protected manifest before printing remote MCP URLs.

Redis is currently treated as a non-blocking infrastructure advisory because no shipped Jarvis workflow depends on Redis for state. Local memory, cold outreach, client requests, and approvals use SQLite; live API work uses the configured Google, Gemini, Smartlead, Serper, and Google Maps credentials. If a Redis-backed queue/cache is added later, move Redis back into the blocking production gate before enabling that feature.

The web bridge publishes its protected manifest at:

- `GET /api/mcp`
- `GET /.well-known/arcigy-jarvis.json`
- `GET /.well-known/ai-plugin.json`
- `GET /api/openapi.json`
- `GET /api/secure-tunnel-status`
- `POST /api/start-secure-tunnel`
- `POST /api/stop-secure-tunnel`
- `GET /api/remote-mcp-pack`
- `GET /api/remote-mcp-smoke`

External hosts require `Authorization: Bearer <JARVIS_WEB_TOKEN>`. Browser-based clients can run CORS `OPTIONS` preflight without a token, but every real external `GET` or `POST` remains bearer-protected. Failed external auth attempts are throttled after `JARVIS_AUTH_FAILURE_LIMIT` attempts per `JARVIS_AUTH_FAILURE_WINDOW_MS` window; defaults are 20 attempts per 60 seconds. The Jarvis manifest returns concrete `tools[].url` values for POST calls. `/.well-known/ai-plugin.json` returns a bearer-protected action manifest for agents that expect plugin/action metadata. `/api/openapi.json` returns an importable OpenAPI 3.1 action schema for ChatGPT custom actions, Grok-compatible OpenAPI setup, or generic HTTP agents. The remote MCP pack returns the action manifest URL, Jarvis manifest URL, OpenAPI schema URL, smoke test URL, tool-call pattern, approval rules, tunnel command, tool count, quick-start calls, and readiness summary without returning the bearer token value. The smoke test verifies all 37 required remote MCP smoke gates, including the action manifest, OpenAPI schema, CORS preflight, external auth gate, auth throttle policy, Jarvis manifest, connection pack, completion score quick-start, production evidence direct and voice quick-starts, production evidence tool call, read-only tool call, approval-gate rejection, approval-shape-gate rejection, and token redaction. Before any remote agent proposes work, require `arcigy.get_jarvis_capability_audit` and `arcigy.get_production_completion_score`, then cite coverage, completion percent, MCP counts, evidence status, release proof, `dirty=false`, `freshness.fresh=true`, and completion score quick-start coverage.

The MCP panel now runs an automatic preflight watch every two minutes. It shows tunnel readiness, token/auth state, manifest availability, MCP tool count, and the exact remote tool-call pattern before you expose the bridge through ngrok. In Electron, `Start tunnel` can generate a one-time tunnel token. In browser/web mode, `Start tunnel` launches `npm run web:tunnel` only after a strong `JARVIS_WEB_TOKEN` is already configured. `Tunnel status` reads the private secure-tunnel log, extracts the public manifest, connection pack, smoke, and MCP tool-call URLs, and redacts the bearer token from the UI. The remote connection pack includes `tunnel.statusUrl`, `tunnel.startUrl`, and `tunnel.stopUrl` so Claude, ChatGPT, Grok, or a generic HTTP agent can cite the correct handoff URLs without receiving token values.

## Tools

- `arcigy.generate_contract_documents`: JSON intake form -> framework agreement + project appendix DOCX. Accepts either `inputJsonPath` or inline `intake`.
- `arcigy.draft_contract_intake`: uses Gemini to draft contract intake JSON from a short business brief without generating documents.
- `arcigy.get_cold_outreach_brief`: Slovak cold outreach summary.
- `/api/cold-outreach-brief` with `live=true` prefers live Smartlead statistics and falls back to local SQLite.
- `arcigy.add_cold_outreach_event`: stores local cold outreach activity.
- `arcigy.get_cold_outreach_brief_from_db`: computes Slovak cold outreach summary from SQLite events.
- `arcigy.prepare_positive_outreach_reply`: uses Gemini to draft a reply for a positive cold outreach lead and stores it as a local `prepared_reply` waiting for approval.
- `arcigy.get_prepared_outreach_replies`: returns prepared cold outreach replies waiting for approval.
- `arcigy.get_approval_queue`: returns one read-only Jarvis approval inbox with prepared replies and client decisions waiting for operator confirmation.
- `arcigy.approve_prepared_outreach_reply`: marks one prepared outreach reply as approved after explicit confirmation.
- `arcigy.send_approved_outreach_reply`: sends an already-approved prepared outreach reply through Gmail after explicit confirmation and records `approved_reply_sent`.
- `arcigy.upsert_local_person`: local client/lead/contact upsert into SQLite.
- `arcigy.add_client_need_signal`: stores that a client needs something.
- `arcigy.ingest_client_message`: stores a received email/message, identifies the sender, and returns a Jarvis alert when the message contains a request.
- `arcigy.get_client_need_alerts`: returns the persistent inbox of open client requests Jarvis should proactively mention.
- `arcigy.update_client_need_status`: marks a client request as `seen`, `resolved`, or `ignored` after explicit confirmation.
- `arcigy.identify_email`: exact email/domain identity lookup with open need signals.
- `arcigy.get_local_memory_snapshot`: returns a secret-safe read-only snapshot of local people, email activity, client needs, and audit events.
- `arcigy.export_local_memory_snapshot`: writes a redacted local memory snapshot JSON file inside the repository after explicit confirmation.
- `arcigy.get_system_health`: checks runtime configuration without exposing secrets.
- `arcigy.run_integration_diagnostics`: runs configured checks or explicit live read-only probes, including Postgres TCP and Redis PING.
- `arcigy.get_production_readiness`: summarizes production readiness, blockers, next actions, MCP tool count, approval locks, and optional live diagnostics.
- `arcigy.get_production_verification_evidence`: returns the latest secret-safe `npm run verify:production` evidence artifact.
- `arcigy.get_production_completion_score`: returns the secret-safe production completion percent with evidence components and next actions.
- `arcigy.get_remote_mcp_pack`: returns a secret-safe connection pack for Claude, ChatGPT, Grok, or another remote MCP agent.
- `arcigy.run_remote_mcp_smoke`: verifies remote web MCP manifest, action manifest, OpenAPI schema, CORS preflight, external auth gate, connection pack, production evidence quick-starts, completion score quick-start coverage, read-only tool call, production evidence tool call, approval gate, approval-shape-gate, and token redaction.
- `arcigy.get_operator_briefing`: combines readiness, cold outreach, open client requests, and prepared reply approvals into one Jarvis briefing; with `live=true`, it syncs recent Gmail messages, cold outreach prefers live Smartlead statistics, and both fall back safely.
- `arcigy.generate_ai_reply`: uses Gemini to draft a client reply without sending it.
- `arcigy.sync_gmail_recent_messages`: fetches Gmail messages and ingests client requests into SQLite.
- `arcigy.get_smartlead_campaign_status`: reads Smartlead campaigns or campaign statistics.
- `arcigy.get_smartlead_outreach_brief`: normalizes one Smartlead campaign, or aggregates recent campaign statistics when `campaignId` is omitted, into one Jarvis cold outreach briefing.
- `arcigy.search_serper`: read-only Serper web search for lead discovery.
- `arcigy.search_google_places`: read-only Google Places Text Search for company discovery.
- `arcigy.discover_leads`: combines Serper and Google Places into normalized lead candidates.
- `arcigy.scrape_website_contacts`: read-only website/contact-page fetcher for emails, phones, links, title, description, and text preview.
- `arcigy.draft_lead_intro`: Gemini draft of one short personalized cold outreach intro for a lead.
- `arcigy.prepare_smartlead_leads`: normalizes selected leads into Smartlead `lead_list` payload without writing.
- `arcigy.run_leadgen_research_pipeline`: read-only discovery + optional website scraping + optional Gemini intro drafts for Smartlead-ready research.
- `arcigy.add_leads_to_smartlead_campaign`: approval-gated upload of prepared `lead_list` batches to a Smartlead campaign.
- `arcigy.append_leads_to_google_sheet`: explicit Google Sheets append for prepared lead rows.
- `arcigy.jarvis_voice_event`: wake-word state handling for the desktop voice layer.

Use `JARVIS_PYTHON` if the MCP runtime needs a specific Python executable.

Store live keys in `.env.local`, not in committed files.
