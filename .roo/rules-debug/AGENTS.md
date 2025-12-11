# Debug Mode Rules

- **Server Port:** The unified backend server runs on **port 6987**. Check `http://localhost:6987/` for health status.
- **Log Files:** Main process logs are written to `userData/logs/main-DATE.log`. Console output is redirected there.
- **Crash Guards:** Global handlers for `uncaughtException` and `unhandledRejection` prevent silent crashes but may mask issues. Check logs.
- **Proxy Debugging:** External streams (Nuvio, Comet) are proxied. Check `/api/nuvio/stream/...` and `/api/comet/stream/...` endpoints for issues.
- **Webview Tools:** Use "Developer: Open Webview Developer Tools" to debug the UI, not just the standard toggle dev tools.