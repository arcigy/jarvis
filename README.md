# Jarvis automation pack

This repo currently contains the scoped Arcigy/Jarvis automation additions requested for local MCP/dashboard use.

## Added automations

- Contract generator: `src/automation-system/jarvis-automations.ts`
- Cold outreach MCP briefing: `src/automation-system/cold-outreach-summary.ts`
- Local client/lead identity matching schema: `migrations/0001_jarvis_local_entities.sql`
- Jarvis voice listener definition: `src/automation-system/jarvis-automations.ts`

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
```

DOCX render QA requires LibreOffice/`soffice`.
