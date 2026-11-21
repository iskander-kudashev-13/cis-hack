import { useCallback, useEffect, useState } from "react";
import { api, enableMock, isMock, subscribe } from "./api/client";
import type { State } from "./api/types";
import { Header, type LiveMode } from "./components/Header";
import { Sidebar, type Page } from "./components/Sidebar";
import { LiveDemo } from "./pages/LiveDemo";
import { SignalsPage } from "./pages/Signals";
import { HubPage } from "./pages/HubView";
import { OnboardingPage } from "./pages/Onboarding";
import { OrchestratorView } from "./pages/Orchestrator";

const TITLES: Record<Page, string> = {
  live: "Live demo · BEC mule signal end to end",
  signals: "Signals · hub journal and acknowledgements",
  hub: "Hub · messages between banks and payment checks",
  onboarding: "Devin · how a new bank is connected",
};

function initialPage(): Page {
  const h = window.location.hash.replace("#", "");
  return (["live", "signals", "hub", "onboarding"] as Page[]).includes(h as Page) ? (h as Page) : "live";
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [role, setRole] = useState<"bank" | "orchestrator">("bank");
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sw-sidebar") === "1"; } catch { return false; } });
  const [state, setState] = useState<State | null>(null);
  const [live, setLive] = useState<LiveMode>("connecting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // First load: try the real backend, fall back to the in-browser mock.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isMock()) {
        try { const s = await api.state(); if (!cancelled) setState(s); }
        catch { enableMock(); }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    return subscribe(setState, setLive);
  }, [ready]);

  const run = useCallback(async (fn: () => Promise<State>) => {
    setBusy(true); setError(null);
    try { setState(await fn()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, []);

  const go = (p: Page) => { setPage(p); window.location.hash = p; };
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("sw-sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar page={page} onPage={go} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={TITLES[page]} state={state} live={live} busy={busy}
          onPause={(p) => run(() => api.pause(p))} onReset={() => run(api.reset)} />
        {error && (
          <div className="flex-none border-b border-neg/30 bg-neg/10 px-5 py-1.5 text-[12px] text-neg">
            {error} <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-auto p-4">
          {!state ? (
            <div className="flex h-full items-center justify-center text-text-3">Connecting to console API…</div>
          ) : page === "live" ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-none items-center gap-3">
                <div className="inline-flex rounded-lg border border-border-2 bg-surface p-0.5">
                  {([["bank", "Bank client view"], ["orchestrator", "Orchestrator view"]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setRole(id)}
                      className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium ${role === id ? "bg-accent text-white" : "text-text-2 hover:text-text"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[12px] text-text-3">
                  {role === "bank"
                    ? "What a member bank sees: Bank A reports a mule account, Bank B checks an outgoing transfer."
                    : `What the network operator sees: every signal moving through ${state.hub.members.length} banks.`}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                {role === "bank" ? <LiveDemo state={state} busy={busy} run={run} /> : <OrchestratorView state={state} />}
              </div>
            </div>
          ) : page === "signals" ? (
            <SignalsPage state={state} />
          ) : page === "hub" ? (
            <HubPage state={state} />
          ) : (
            <OnboardingPage />
          )}
        </main>
      </div>
    </div>
  );
}
