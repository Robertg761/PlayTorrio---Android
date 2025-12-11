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
    *   **Architecture Update:** Set up **Vite** build system with `android-app/src` directory.
    *   Extracted inline JS from `index.html` to `src/js/main.js`.
    *   Refactored code to eliminate Electron dependencies.

## Phase 2: Core Logic Porting (The Hard Part)

The backend (`server.mjs`, `api.cjs`) does heavy lifting. We need to move this logic into the frontend or a compatible layer.

*   [x] **HTTP & CORS Handling**
    *   The backend currently proxies requests to avoid CORS (e.g., scraping Nyaa, 1337x).
    *   **Action:** Install `@capacitor/http` or `@capacitor-community/http`.
    *   **Refactor:** Rewrite `axios` and `fetch` calls in the *frontend* (which currently call `localhost:6987`) to call the target APIs directly using the Capacitor HTTP plugin. This bypasses browser CORS restrictions on the device.
    *   *Key Task:* Port `api.cjs` scraping functions (like `anime_scrapePage`, `torrentio_api`) into a frontend utility module (e.g., `src/services/scraper.js`).

*   [x] **Torrent Engine (WebTorrent)**
    *   The app uses `webtorrent` in Node.js. WebTorrent also works in the browser (WebRTC), but hybrid apps often need TCP/UDP support for better peer discovery.
    *   **Action:** Successfully implemented `WebTorrent` client-side in `src/services/torrent.ts`.
    *   *Fallback:* If performance is poor, investigate a Capacitor torrent plugin, but pure JS WebTorrent is the first step.
    *   **Storage:** Using memory/blob storage for streaming currently.

*   [x] **Video Player Integration**
    *   The desktop app spawns MPV/VLC. This is impossible on Android directly.
    *   **Action:** Implemented `src/services/player.ts` using `capacitor-video-player` for native playback.
    *   *Intent:* Implemented `AppLauncher` support to open `vlc://` intents.

*   [x] **Settings & Persistence**
    *   **Refactor:** Replaced `fs`/`ipcRenderer` calls with a new `StorageService` using Capacitor `Preferences`.
    *   Migrated `settings.json`, `my-list.json`, and `continue-watching.json` logic.

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

*   [x] **BookTorrio (Books/Manga)**
    *   Ported Z-Library and Manga scrapers to `BookService` using `CapacitorHttp`.
    *   Updated `initializeBookTorrio` to use simpler client-side logic.


*   [x] **Music Downloader**
    *   Current backend uses `ffmpeg` spawning for music conversion. **Refactored.**
    *   **Action:** Migrated to strict **Direct Download** strategy in `MusicService`.
    *   Replaced `ffmpeg` conversion with direct file downloads using `@capacitor-community/http` to `Documents/PlayTorrio/Music`.


## Phase 4: UI/UX Adaptation

*   [x] **Responsive Design**
    *   The current UI (`public/index.html`) is desktop-first.
    *   **Action:** Add CSS media queries to `public/index.html` to ensure grids (movies, anime) stack properly on mobile screens.
    *   Fix the sidebar navigation to be a drawer/hamburger menu on mobile.
*   [x] **Touch Controls**
    *   Ensure hover states (like on movie cards) have touch equivalents (e.g., tap to show details).
    *   *Implementation:* Forced visibility of slider titles on mobile; tap interaction opens details modal.

## Phase 5: Build & Test

*   [x] **Android Build Sync**
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