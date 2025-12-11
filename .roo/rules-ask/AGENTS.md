# Ask Mode Rules

- **Source Location:** The application source code is in the **project root** (`main.js`, `server.mjs`, `api.cjs`), NOT in a `src/` directory.
- **Microservices:** References to "microservices" (e.g., Torrentless, 111477) often refer to legacy standalone services that are now integrated into `server.mjs` via `api.cjs`. They are NOT separate processes anymore.
- **Config Files:** User configuration is stored in `userData` (platform-specific), NOT in the project root. `jackett_api_key.json` and `settings.json` are critical config files.
- **Media Players:** The app uses external players (MPV, VLC, IINA) for playback, controlled via IPC. It does NOT typically play video directly in the webview.