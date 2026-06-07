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
- If speech recognition is not available, use the transcript text box and `Send transcript`.
- The renderer calls the local Electron preload bridge for Jarvis voice events and cold outreach briefs.
- The Gemini panel drafts client replies without sending them.
- The lead discovery panel runs read-only company discovery through Serper and Google Places.
- The contract panel accepts inline intake JSON and generates local DOCX files through the main-process bridge.

## Security shape

- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- The preload exposes only a small `arcigyDesktop` bridge.

The desktop shell is local-first and does not send audio or transcripts to external APIs.
