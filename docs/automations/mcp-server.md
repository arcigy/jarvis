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
- `arcigy.identify_email`: exact email/domain identity lookup with open need signals.
- `arcigy.jarvis_voice_event`: wake-word state handling for the desktop voice layer.

Use `JARVIS_PYTHON` if the MCP runtime needs a specific Python executable.
