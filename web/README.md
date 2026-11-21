# Scam Weather · web console

- Run: `npm install && npm run dev` (Vite proxies `/api` and `/v1` to the Go server on http://localhost:8080).
- Mock: open `http://localhost:5173/?mock=1` to run the whole flow in the browser; the console also falls back to the mock automatically if `GET /api/state` fails on first load.
- Build: `npm run build` → `web/dist`, served by the Go server in production.
- API contract types: `src/api/types.ts`; client + SSE/polling: `src/api/client.ts`; simulator: `src/api/mock.ts`.
