# Roadmap: Convert PlayTorrio to Android App

This roadmap outlines the steps to convert the existing PlayTorrio Windows desktop application (Electron/Node.js) into a fully functional Android application. This is a significant porting effort as the current app relies heavily on Node.js runtime and Electron-specific APIs which are not natively available on Android.

**Core Challenge:** The current app is a "Hybrid Monolith" - an Electron frontend communicating with a local Express server (`server.mjs` + `api.cjs`) that handles complex scraping, torrenting, and API aggregation. Android does not support running a full Node.js server in the background easily.

**Strategy:** We will adopt a **Hybrid App approach using Capacitor**.
1.  **Frontend:** Port the existing `public/` web app to a Capacitor project.
2.  **Backend Logic:** Since we cannot run `server.mjs`/`api.cjs` as-is, we must refactor the critical backend logic (scraping, torrenting, API calls) into a format compatible with Android.
    *   **Option A (Preferred for this project's "local" ethos):** bundle a minimal Node.js runtime for Android (using something like `nodejs-mobile-react-native` if we went RN, or a plugin approach for Capacitor) OR refactor the logic to run purely in the JS environment of the WebView where possible, and use Capacitor plugins for "native" capabilities (filesystem, http with relaxed CORS, torrents).
    *   *Decision:* We will attempt to **refactor logic to run client-side** where possible, and use **Capacitor plugins** for heavy lifting (HTTP requests to bypass CORS, FileSystem, Video Player). The complex scraping logic in `api.cjs` (Cheerio/Axios) can largely run in a standard JS environment if we solve CORS.

## Phase 1: Project Setup & Environment

*   [x] **Initialize Android Project**
    *   Create a new directory `android-app`.
    *   Initialize a new Capacitor project: `npm init @capacitor/app`.
    *   Install Android platform: `npm i @capacitor/android && npx cap add android`.
    *   Configure `capacitor.config.json` (app ID: `com.ayman.playtorrio`, name: `PlayTorrio`).
*   [x] **Port Frontend Assets**
    *   Copy contents of `public/` (index.html, css, js) to the Capacitor `dist` or `www` folder.
    *   Identify and comment out Electron-specific code (`window.electronAPI`, `ipcRenderer`) in the frontend JS.

## Phase 2: Core Logic Porting (The Hard Part)

The backend (`server.mjs`, `api.cjs`) does heavy lifting. We need to move this logic into the frontend or a compatible layer.

*   [x] **HTTP & CORS Handling**
    *   The backend currently proxies requests to avoid CORS (e.g., scraping Nyaa, 1337x).
    *   **Action:** Install `@capacitor/http` or `@capacitor-community/http`.
    *   **Refactor:** Rewrite `axios` and `fetch` calls in the *frontend* (which currently call `localhost:6987`) to call the target APIs directly using the Capacitor HTTP plugin. This bypasses browser CORS restrictions on the device.
    *   *Key Task:* Port `api.cjs` scraping functions (like `anime_scrapePage`, `torrentio_api`) into a frontend utility module (e.g., `src/services/scraper.js`).

*   [ ] **Torrent Engine (WebTorrent)**
    *   The app uses `webtorrent` in Node.js. WebTorrent also works in the browser (WebRTC), but hybrid apps often need TCP/UDP support for better peer discovery.
    *   **Action:** Attempt to use `webtorrent` (browser version) first. Android WebView supports WebRTC.
    *   *Fallback:* If performance is poor, investigate a Capacitor torrent plugin, but pure JS WebTorrent is the first step.
    *   **Storage:** Verify if we need to write files to disk. Capacitor `FileSystem` API will be needed to save downloads to the device's public media directories.

*   [ ] **Video Player Integration**
    *   The desktop app spawns MPV/VLC. This is impossible on Android directly.
    *   **Action:** Use **Capacitor Video Player** (`capacitor-video-player`) or rely on the HTML5 `<video>` tag which is quite capable on Android.
    *   *Intent:* For external players (VLC for Android), use Capacitor `AppLauncher` or `Intent` plugins to open stream URLs with `vlc://` or `intent://`.

*   [ ] **Settings & Persistence**
    *   Current app uses `fs` to read/write JSON files in `userData`.
    *   **Refactor:** Replace all `fs` reads/writes with `localStorage` (simplest) or Capacitor `Preferences` API (better).
    *   Migrate `settings.json`, `my-list.json`, etc., to this new storage mechanism.

## Phase 3: Specific Feature Migration

*   [x] **Scrapers (Anime, Movies, TV)**
    *   Port `api.cjs` logic for:
        *   `anime/api` (Nyaa scraper)
        *   `torrentio/api`
        *   `moviebox`
        *   `111477`
    *   These currently run on the server. They must be converted to client-side JS functions using `@capacitor/http` to fetch HTML and `cheerio` (which works in browser) to parse it.

*   [x] **Real-Debrid / AllDebrid Integration**
    *   The auth flow relies on polling. This logic (in `api.cjs`) is pure JS and HTTP, so it should port easily.
    *   Ensure the "Device Code" flow works within the mobile view.

*   [ ] **BookTorrio (Books/Manga)**
    *   Port the Z-Library and Manga scrapers.
    *   Ensure the EPUB reader (which runs in an iframe or overlay) works on mobile screen sizes.

*   [ ] **Music Downloader**
    *   Current backend uses `ffmpeg` spawning for music conversion. **This will break.**
    *   **Action:** Android cannot easily spawn `ffmpeg`.
    *   *Alternative:*
        *   Look for direct download links (FLAC/MP3) without conversion.
        *   OR: Use `ffmpeg-wasm` if the device is powerful enough (experimental).
        *   OR: Disable the "converter" part and only support direct streams/downloads.

## Phase 4: UI/UX Adaptation

*   [ ] **Responsive Design**
    *   The current UI (`public/index.html`) is desktop-first.
    *   **Action:** Add CSS media queries to `public/index.html` to ensure grids (movies, anime) stack properly on mobile screens.
    *   Fix the sidebar navigation to be a drawer/hamburger menu on mobile.
*   [ ] **Touch Controls**
    *   Ensure hover states (like on movie cards) have touch equivalents (e.g., tap to show details).

## Phase 5: Build & Test

*   [ ] **Android Build**
    *   Run `npx cap sync`.
    *   Open Android Studio: `npx cap open android`.
    *   Configure permissions in `AndroidManifest.xml` (Internet, Storage).
    *   Build and run on emulator/device.

*   [ ] **Testing Checklist**
    *   [ ] App launches without white screen.
    *   [ ] Home page loads trending content (TMDB API check).
    *   [ ] Search works (proxying requests correctly).
    *   [ ] Scraping works (CORS bypass verified).
    *   [ ] Video playback works (internal player).
    *   [ ] External player launch (VLC/MPV android) works.
    *   [ ] Settings save/load correctly.

## Phase 6: Final Polish

*   [ ] **Icon & Splash Screen:** Generate Android assets.
*   [ ] **Performance:** Optimize image loading (lazy loading is already there, but check memory usage).
*   [ ] **Cleanup:** Remove unused Electron/Node.js code from the source to reduce bundle size.