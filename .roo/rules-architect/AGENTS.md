# Architect Mode Rules

- **Unified Backend Constraint:** All new backend functionality MUST be integrated into `server.mjs` (via `api.cjs` if needed). Do NOT design solutions that spawn separate server processes or microservices.
- **Persistence Strategy:** The architecture relies on manual `userData` management to survive updates. Any architectural changes to data storage must align with the existing persistence logic in `main.js`.
- **Decoupled Playback:** Video playback is architecturally decoupled from the UI (Webview) and handled by external native players (MPV/VLC) via IPC. Do not design in-app playback solutions that rely solely on HTML5 video tags for core features.