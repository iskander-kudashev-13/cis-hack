import { useCallback, useEffect, useState } from "react";
import { api, enableMock, isMock, subscribe } from "./api/client";
import type { State } from "./api/types";
import { Header, type LiveMode } from "./components/Header";
import { Sidebar, type Page } from "./components/Sidebar";
import { OnboardingPage } from "./pages/Onboarding";
import { OrchestratorView } from "./pages/Orchestrator";
import { BankView } from "./pages/BankView";
import { PaymentsPage } from "./pages/Payments";
import { NetworkPage } from "./pages/Network";
import { DemoPanel } from "./components/DemoPanel";
import { Landing, type Session } from "./pages/Landing";

const TITLES: Record<Page, string> = {
  live: "Mashreq · fraud desk console",
  txns: "Mashreq · payments, review queue and uncovered alerts",
  network: "Network graph · how banks and the hub exchange signals",
  signals: "Network operator · warnings and delivery, no bank data",
  hub: "Network operator · warnings and delivery, no bank data",
  onboarding: "Devin · how a new bank is connected",
};

function initialPage(): Page {
  const h = window.location.hash.replace("#", "");
  return (["live", "txns", "network", "signals", "hub", "onboarding"] as Page[]).includes(h as Page) ? (h as Page) : "live";
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [session, setSession] = useState<Session | null>(() => {
    try { const raw = localStorage.getItem("sw-session"); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; }
  });
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
  useEffect(() => {
    const onHash = () => { const h = window.location.hash.replace("#", "") as Page; if (TITLES[h]) setPage(h); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("sw-sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  const enter = (s: Session) => {
    try { localStorage.setItem("sw-session", JSON.stringify(s)); } catch { /* ignore */ }
    setSession(s);
    go(s.role === "operator" ? "hub" : "live");
  };
  const signOut = () => {
    try { localStorage.removeItem("sw-session"); } catch { /* ignore */ }
    setSession(null);
  };
  if (!session) return <Landing onEnter={enter} />;

  return (
    <div className="console-shell flex h-full overflow-hidden">
      <Sidebar page={page} onPage={go} collapsed={collapsed} onToggle={toggle} user={session} onSignOut={signOut} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            <BankView state={state} busy={busy} run={run} />
          ) : page === "network" ? (
            <NetworkPage state={state} defaultRole={session.role === "operator" ? "operator" : "bank"} />
          ) : page === "txns" ? (
            <PaymentsPage state={state} busy={busy} run={run} />
          ) : page === "signals" ? (
            <OrchestratorView state={state} />
          ) : page === "hub" ? (
            <OrchestratorView state={state} />
          ) : (
            <OnboardingPage />
          )}
        </main>
      </div>
      {state && <DemoPanel state={state} run={run} go={go} busy={busy} />}
    </div>
  );
}
