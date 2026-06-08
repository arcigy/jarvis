# Arcigy Jarvis desktop shell

Run:

```powershell
npm run desktop
```

This opens a local Electron desktop window. It is a working fallback shell until the project has a Rust/Cargo toolchain for Tauri.

## Voice behavior

- Click `Enable` to start microphone recognition when `SpeechRecognition` is available.
- Say `Jarvis` to wake the assistant.
- Jarvis answers through `speechSynthesis` in Slovak.
- After wake, Jarvis can answer voice commands for cold outreach, integrations health, email identity, lead discovery, and Gemini reply drafts.
- If speech recognition is not available, use the transcript text box and `Send transcript`.
- The renderer calls the local Electron preload bridge for Jarvis voice events and cold outreach briefs.
- The diagnostics action checks configured integrations and can run live read-only probes, including Postgres TCP and Redis PING.
- The cold outreach panel lists prepared positive-reply drafts and only marks the first pending reply approved after the user clicks `Approve first`.
- The client memory panel identifies email addresses and ingests client requests into the local SQLite database.
- The client memory panel starts a local watch loop that refreshes open requests every minute and speaks only newly detected client needs.
- The Gemini panel drafts client replies without sending them.
- The operations panel syncs recent Gmail messages into the local SQLite memory and checks Smartlead campaign status.
- The lead discovery panel runs company discovery through Serper and Google Places, then exports selected results to Google Sheets only after the user clicks `Export`.
- The contract panel accepts a structured intake form, can draft the intake JSON from an AI brief, keeps the JSON editable, and generates local DOCX files through the main-process bridge.

## Security shape

- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- The preload exposes only a small `arcigyDesktop` bridge.

The desktop shell is local-first and does not send audio or transcripts to external APIs.
