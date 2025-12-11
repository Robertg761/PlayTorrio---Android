# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## 🏗️ Core Architecture (Non-Obvious)
- **Hybrid Monolith:** This is an Electron app that spawns a full Express server (`server.mjs`) on **port 6987**.
- **Unified Backend:** The Express server handles EVERYTHING: API routes, static file serving (`public/`), torrent engine (`webtorrent`), and proxying.
- **Legacy Microservices:** References to "microservices" (Torrentless, 111477, etc.) refer to modules that are now **integrated directly** into `server.mjs` via `api.cjs`. Do NOT spawn them as separate processes.
- **Root-Level Source:** Source code lives in the **project root** (`main.js`, `server.mjs`, `api.cjs`), NOT in `src/`.

## 🛠️ Build & Run
- **Start:** `npm start` (Runs `electron .`)
- **Server Dev:** `npm run serve` (Runs only the server part)
- **Build:** `npm run build` (Uses `electron-builder`)

## 💾 Data Persistence (Critical)
- **Manual Management:** The app manually manages `userData` persistence to survive updates.
- **Key Files:**
  - `settings.json`, `user_settings.json`: User preferences.
  - `jackett_api_key.json`: Checked in multiple locations (userData, install dir, dev root).
  - `playback_positions.json`: Resume points.

## ⚠️ Critical Gotchas
- **Mixed Modules:** The project mixes **ESM** (`.mjs`, `type: module` in package.json) and **CommonJS** (`.cjs`). `main.js` and `server.mjs` are ESM but import `api.cjs`. Use `createRequire` where necessary.
- **Proxying:** External content (images, streams) MUST be proxied through `server.mjs` endpoints to handle CORS and headers (e.g., `/api/proxy-image`, `/stream/debrid`).
- **Player IPC:** Video playback is handed off to external players (MPV, VLC) via specific IPC channels (`open-in-mpv`, etc.), not handled purely in webview.