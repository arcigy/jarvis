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

## Tools

- `arcigy.generate_contract_documents`: JSON intake form -> framework agreement + project appendix DOCX. Accepts either `inputJsonPath` or inline `intake`.
- `arcigy.get_cold_outreach_brief`: Slovak cold outreach summary.
- `arcigy.add_cold_outreach_event`: stores local cold outreach activity.
- `arcigy.get_cold_outreach_brief_from_db`: computes Slovak cold outreach summary from SQLite events.
- `arcigy.upsert_local_person`: local client/lead/contact upsert into SQLite.
- `arcigy.add_client_need_signal`: stores that a client needs something.
- `arcigy.ingest_client_message`: stores a received email/message, identifies the sender, and returns a Jarvis alert when the message contains a request.
- `arcigy.identify_email`: exact email/domain identity lookup with open need signals.
- `arcigy.get_system_health`: checks runtime configuration without exposing secrets.
- `arcigy.run_integration_diagnostics`: runs configured checks or explicit live read-only probes for integrations.
- `arcigy.generate_ai_reply`: uses Gemini to draft a client reply without sending it.
- `arcigy.sync_gmail_recent_messages`: fetches Gmail messages and ingests client requests into SQLite.
- `arcigy.get_smartlead_campaign_status`: reads Smartlead campaigns or campaign statistics.
- `arcigy.search_serper`: read-only Serper web search for lead discovery.
- `arcigy.search_google_places`: read-only Google Places Text Search for company discovery.
- `arcigy.discover_leads`: combines Serper and Google Places into normalized lead candidates.
- `arcigy.append_leads_to_google_sheet`: explicit Google Sheets append for prepared lead rows.
- `arcigy.jarvis_voice_event`: wake-word state handling for the desktop voice layer.

Use `JARVIS_PYTHON` if the MCP runtime needs a specific Python executable.

Store live keys in `.env.local`, not in committed files.
