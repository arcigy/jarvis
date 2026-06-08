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

Run the same smoke proof from CLI when checking a local or external bridge:

```powershell
npm run remote:mcp:smoke
npm run remote:mcp:smoke -- --url https://your-ngrok-url.ngrok-free.app --token-env JARVIS_WEB_TOKEN
```

`npm run readiness` prints the same secret-safe blockers and fix guide exposed by `arcigy.get_production_readiness`. Status `ready` means there are no findings, `attention` means only non-blocking advisories remain, and `blocked` means an operator must fix production gates before exposing workflows. The tunnel runner starts the local web bridge if needed, checks `/api/web-bridge-preflight`, starts ngrok, finds the public HTTPS URL, and verifies the protected manifest before printing remote MCP URLs.

Redis is currently treated as a non-blocking infrastructure advisory because no shipped Jarvis workflow depends on Redis for state. Local memory, cold outreach, client requests, and approvals use SQLite; live API work uses the configured Google, Gemini, Smartlead, Serper, and Google Maps credentials. If a Redis-backed queue/cache is added later, move Redis back into the blocking production gate before enabling that feature.

The web bridge publishes its protected manifest at:

- `GET /api/mcp`
- `GET /.well-known/arcigy-jarvis.json`
- `GET /api/remote-mcp-pack`
- `GET /api/remote-mcp-smoke`

External hosts require `Authorization: Bearer <JARVIS_WEB_TOKEN>`. The manifest returns concrete `tools[].url` values for POST calls. The remote MCP pack returns the manifest URL, smoke test URL, tool-call pattern, approval rules, tunnel command, tool count, and readiness summary without returning the bearer token value. The smoke test verifies the manifest, connection pack, a read-only tool call, approval-gate rejection, and token redaction.

The desktop MCP panel now runs an automatic preflight watch every two minutes. It shows tunnel readiness, token/auth state, manifest availability, MCP tool count, and the exact remote tool-call pattern before you expose the bridge through ngrok.

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
- `arcigy.get_system_health`: checks runtime configuration without exposing secrets.
- `arcigy.run_integration_diagnostics`: runs configured checks or explicit live read-only probes, including Postgres TCP and Redis PING.
- `arcigy.get_production_readiness`: summarizes production readiness, blockers, next actions, MCP tool count, approval locks, and optional live diagnostics.
- `arcigy.get_remote_mcp_pack`: returns a secret-safe connection pack for Claude, ChatGPT, Grok, or another remote MCP agent.
- `arcigy.run_remote_mcp_smoke`: verifies remote web MCP manifest, connection pack, read-only tool call, approval gate, and token redaction.
- `arcigy.get_operator_briefing`: combines readiness, cold outreach, open client requests, and prepared reply approvals into one Jarvis briefing; with `live=true`, it syncs recent Gmail messages, cold outreach prefers live Smartlead statistics, and both fall back safely.
- `arcigy.generate_ai_reply`: uses Gemini to draft a client reply without sending it.
- `arcigy.sync_gmail_recent_messages`: fetches Gmail messages and ingests client requests into SQLite.
- `arcigy.get_smartlead_campaign_status`: reads Smartlead campaigns or campaign statistics.
- `arcigy.get_smartlead_outreach_brief`: normalizes one Smartlead campaign, or aggregates recent campaign statistics when `campaignId` is omitted, into one Jarvis cold outreach briefing.
- `arcigy.search_serper`: read-only Serper web search for lead discovery.
- `arcigy.search_google_places`: read-only Google Places Text Search for company discovery.
- `arcigy.discover_leads`: combines Serper and Google Places into normalized lead candidates.
- `arcigy.append_leads_to_google_sheet`: explicit Google Sheets append for prepared lead rows.
- `arcigy.jarvis_voice_event`: wake-word state handling for the desktop voice layer.

Use `JARVIS_PYTHON` if the MCP runtime needs a specific Python executable.

Store live keys in `.env.local`, not in committed files.
