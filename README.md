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
- `arcigy.get_cold_outreach_brief_from_db`
- `arcigy.add_cold_outreach_event`
- `arcigy.upsert_local_person`
- `arcigy.add_client_need_signal`
- `arcigy.ingest_client_message`
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

## Desktop app

Run the local desktop shell:

```powershell
npm run desktop
```

The Electron shell opens a local Arcigy Jarvis console with:

- wake word flow for `Jarvis`
- microphone speech recognition when the Chromium runtime exposes `SpeechRecognition`
- text transcript fallback
- Slovak TTS via `speechSynthesis`
- local Electron IPC bridge for Jarvis voice events and cold outreach briefs
- voice cold outreach answers backed by `data\jarvis-local.db`
- local contract JSON intake form that generates DOCX files through the same generator as MCP
- quick cold outreach response demo

Tauri is the preferred target for a production desktop build, but this machine currently has no Rust/Cargo toolchain available. Electron is used here as the working desktop fallback.

## Local clients/leads DB

Initialize or use the SQLite DB:

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts\jarvis_local_db.py init --db data\jarvis-local.db
python scripts\jarvis_local_db.py identify --db data\jarvis-local.db --email klient@example.com
python scripts\jarvis_local_db.py ingest-message --db data\jarvis-local.db --payload "{""fromEmail"":""klient@example.com"",""source"":""email"",""text"":""Potrebujem upraviť automatizáciu.""}"
```

Cold outreach events can also be stored locally and summarized by period:

```powershell
python scripts\jarvis_local_db.py add-cold-event --db data\jarvis-local.db --payload "{""leadEmail"":""lead@example.com"",""eventType"":""sent"",""occurredAt"":""2026-06-07T10:00:00Z""}"
python scripts\jarvis_local_db.py cold-brief --db data\jarvis-local.db --payload "{""since"":""2026-06-01T00:00:00Z"",""until"":""2026-06-08T00:00:00Z"",""periodLabel"":""posledných 7 dní""}"
```

## Contract templates

Universal Arcigy templates are in:

- `docs/contracts/templates/ramcova-zmluva-univerzalna.docx`
- `docs/contracts/templates/projektova-priloha-univerzalna.docx`
- `docs/contracts/templates/doplnkova-priloha-univerzalna.docx`

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

MCP can pass the same form directly as inline `intake` JSON to `arcigy.generate_contract_documents`; creating a temporary JSON file first is optional. The JSON form can include `additionalAttachments[]` with a DOCX template path and output name. The generator writes all generated files plus `generation-manifest.json`.

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
