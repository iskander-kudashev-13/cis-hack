import type { DevinResponse, RepoPRs, State, Txn } from "./types";
import { mock } from "./mock";

let mockMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock")
  && new URLSearchParams(window.location.search).get("mock") !== "0";

export const isMock = () => mockMode;
export const enableMock = () => { mockMode = true; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export const api = {
  state: (): Promise<State> => (mockMode ? mock.state() : req("GET", "/api/state")),
  publish: (): Promise<State> => (mockMode ? mock.publish() : req("POST", "/api/bank-a/publish")),
  retract: (): Promise<State> => (mockMode ? mock.retract() : req("POST", "/api/bank-a/retract")),
  evaluate: (payment_id: string): Promise<State> =>
    mockMode ? mock.evaluate(payment_id) : req("POST", "/api/bank-b/evaluate", { payment_id }),
  pause: (paused: boolean): Promise<State> => (mockMode ? mock.pause(paused) : req("POST", "/api/hub/pause", { paused })),
  reset: (): Promise<State> => (mockMode ? mock.reset() : req("POST", "/api/reset")),
  devin: (bank_id = "bank-c", task?: "signal-kind", kind?: string): Promise<DevinResponse> =>
    mockMode ? mock.devin(bank_id) : req("POST", "/api/onboarding/devin", { bank_id, task, kind }),
  prs: (fresh = false): Promise<RepoPRs> => req("GET", `/api/devin/prs${fresh ? "?fresh=1" : ""}`),
  searchTxns: (q: string): Promise<{ txns: Txn[] }> => req("GET", `/api/bank-b/txns?q=${encodeURIComponent(q)}`),
  decideTxn: (id: string, action: "release" | "decline"): Promise<State> => req("POST", `/api/bank-b/txns/${encodeURIComponent(id)}/decision`, { action }),
};

/**
 * Subscribe to state updates. Uses SSE (/api/events, `event: state`), falls back to polling
 * GET /api/state every second. In mock mode the in-browser simulator pushes updates directly.
 */
export function subscribe(onState: (s: State) => void, onLive: (live: "sse" | "poll" | "mock" | "down") => void): () => void {
  if (mockMode) {
    onLive("mock");
    return mock.subscribe(onState);
  }
  let closed = false;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (timer || closed) return;
    onLive("poll");
    timer = setInterval(async () => {
      try { onState(await req<State>("GET", "/api/state")); onLive("poll"); } catch { onLive("down"); }
    }, 1000);
  };

  try {
    es = new EventSource("/api/events");
    const handle = (e: MessageEvent) => {
      try { onState(JSON.parse(e.data)); onLive("sse"); } catch { /* ignore */ }
    };
    es.addEventListener("state", handle as EventListener);
    es.onmessage = handle; // tolerate servers that omit `event: state`
    es.onerror = () => { es?.close(); es = null; startPolling(); };
  } catch {
    startPolling();
  }

  return () => {
    closed = true;
    es?.close();
    if (timer) clearInterval(timer);
  };
}
