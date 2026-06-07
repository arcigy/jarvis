# Jarvis automation pack

This repo currently contains the scoped Arcigy/Jarvis automation additions requested for local MCP/dashboard use.

## Added automations

- Contract generator: `src/automation-system/jarvis-automations.ts`
- Cold outreach MCP briefing: `src/automation-system/cold-outreach-summary.ts`
- Local client/lead identity matching schema: `migrations/0001_jarvis_local_entities.sql`
- MCP tool facade: `src/automation-system/mcp-tools.ts`
- MCP stdio server: `src/automation-system/mcp-server.ts`
- Jarvis voice listener state: `src/automation-system/jarvis-voice.ts`

## MCP server

Run the local Arcigy/Jarvis MCP server:

```powershell
npm run mcp
```

Server tools:

- `arcigy.generate_contract_documents`
- `arcigy.get_cold_outreach_brief`
- `arcigy.upsert_local_person`
- `arcigy.add_client_need_signal`
- `arcigy.identify_email`
- `arcigy.jarvis_voice_event`

Example MCP command config:

```json
{
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "C:\\Users\\laube\\Documents\\JARVIS"
}
```

## Local clients/leads DB

Initialize or use the SQLite DB:

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts\jarvis_local_db.py init --db data\jarvis-local.db
python scripts\jarvis_local_db.py identify --db data\jarvis-local.db --email klient@example.com
```

## Contract templates

Universal Arcigy templates are in:

- `docs/contracts/templates/ramcova-zmluva-univerzalna.docx`
- `docs/contracts/templates/projektova-priloha-univerzalna.docx`

The MCP/client form schema is:

- `docs/contracts/contract-intake.schema.json`

Regenerate the DOCX templates from the downloaded source files:

```powershell
$env:PYTHONIOENCODING='utf-8'
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\universalize_contract_templates.py
```

Generate client-ready DOCX files from a filled MCP/AI form:

```powershell
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\generate_contract_documents.py --input docs\contracts\examples\sample-intake.json --output-dir generated\contracts
```

## Verification

```powershell
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check src\automation-system\cold-outreach-summary.ts
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check src\automation-system\jarvis-automations.ts
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check src\automation-system\identity-matching.ts
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check src\automation-system\jarvis-intents.ts
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m py_compile scripts\universalize_contract_templates.py
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m py_compile scripts\generate_contract_documents.py
& 'C:\Users\laube\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m py_compile scripts\jarvis_local_db.py
npm run typecheck
npm test
```

DOCX render QA requires LibreOffice/`soffice`.
