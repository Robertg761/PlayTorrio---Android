# Code Mode Rules

- **Module Interop:** This project uses ESM (`.mjs` or `type: module`), but many dependencies are CommonJS. Use `createRequire(import.meta.url)` pattern for CJS imports when necessary.
- **Server Extensions:** New API routes must be added to `api.cjs` (CommonJS) and registered in `server.mjs`. Do not create separate server processes.
- **File Operations:** Always use `app.getPath('userData')` for storing user data. The app manually manages this path to ensure data persistence across updates.
- **Async/Await:** Use `fs.promises` or `promisify` for file I/O. Avoid synchronous `fs` methods in API routes.
- **Webview Communication:** Use `ipcMain.handle` in `main.js` and `ipcRenderer.invoke` in `preload.js`. Do not use `remote` module.