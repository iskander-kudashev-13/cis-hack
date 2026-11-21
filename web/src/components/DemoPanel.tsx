import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Play, X } from "lucide-react";
import { api } from "../api/client";
import type { State } from "../api/types";
import type { Page } from "./Sidebar";

type Run = (fn: () => Promise<State>) => Promise<void>;
type Step = { title: string; expect: string; page: Page; action?: { label: string; run: () => Promise<unknown> } };
type Scenario = { id: string; title: string; story: string; steps: Step[] };

/**
 * Presenter-only panel. Everything here simulates the outside world (another
 * bank, a customer, an outage) so the product screens stay free of demo buttons.
 */
export function DemoPanel({ state, run, go, busy }: { state: State; run: Run; go: (p: Page) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("warning");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  const viaState = (fn: () => Promise<State>) => () => run(fn);
  const signal = state.bank_a.signal;
  const warningLive = !!signal && signal.event !== "RETRACT";
  const top = state.bank_b.ops?.pending[0];

  const scenarios: Scenario[] = [
    {
      id: "warning", title: "1 · A warning from another bank stops a payment",
      story: "Emirates NBD confirms a fraud. Mashreq has never seen this account, but blocks the next payment to it.",
      steps: [
        { title: "Start clean", expect: "All counters reset; other banks start sending their own traffic.", page: "live", action: { label: "Reset stand", run: viaState(api.reset) } },
        { title: "A Mashreq customer pays AED 450,000 to AE07 •••• 3456", expect: "Approved: nobody has warned about this account yet. Without the network the money would leave.", page: "live", action: { label: "Customer pays", run: viaState(() => api.evaluate("pay-match")) } },
        { title: "Emirates NBD reports AE07 •••• 3456 as a mule account", expect: "Warning delivery shows Emirates NBD → hub → Mashreq; the event appears in the inbox within seconds.", page: "live", action: { label: "Emirates NBD sends warning", run: viaState(api.publish) } },
        { title: "The customer tries the same payment again", expect: "Held for review, with the reason: reported by Emirates NBD, business email compromise, 3 related cases.", page: "live", action: { label: "Customer pays again", run: viaState(() => api.evaluate("pay-match")) } },
        { title: "The customer pays a regular supplier", expect: "Approved: normal payments are not affected.", page: "live", action: { label: "Customer pays supplier", run: viaState(() => api.evaluate("pay-control")) } },
        { title: "Emirates NBD withdraws the warning", expect: "The event becomes withdrawn; a new payment to AE07 is approved again.", page: "live", action: { label: "Emirates NBD withdraws", run: viaState(api.retract) } },
      ],
    },
    {
      id: "desk", title: "2 · The fraud desk reviews held payments",
      story: "Payments flow all the time. Risky ones wait for an analyst, sorted by risk with an explanation.",
      steps: [
        { title: "Open the review queue", expect: "Held payments sorted by risk score. Each shows why it was held, what the fraud is and what to check.", page: "txns" },
        { title: "Decide on the riskiest payment", expect: "In the queue press Approve or Decline. Or use the button: the top payment is declined and leaves the queue.", page: "txns",
          action: top ? { label: `Decline ${top.id}`, run: viaState(() => api.decideTxn(top.id, "decline")) } : undefined },
        { title: "Find any payment", expect: "Type a transaction ID, IBAN, mobile number or payee into the search bar.", page: "txns" },
      ],
    },
    {
      id: "devin", title: "3 · Devin adds support for a new fraud type",
      story: "Other banks send alerts about Aani mobile numbers. Mashreq cannot check them yet, so those payments wait. Devin writes the code.",
      steps: [
        { title: "See the gap", expect: "Signal coverage: 'Scam payee on Aani mobile number' is not covered; the uncovered alerts log lists the alerts from other banks.", page: "txns" },
        { title: "Send the task to Devin", expect: "Press Fix with Devin on that alert type (starts a real, paid Devin session). The button turns into a link to the session.", page: "txns" },
        { title: "Follow the pull request", expect: "'Pull requests from Devin' lists PRs in the bank's repo with CI status. The engineer reviews and merges.", page: "txns" },
        { title: "Show a finished example", expect: "Devin: new bank shows a completed run: connector for a new bank, tests passing, PR #1.", page: "onboarding" },
      ],
    },
    {
      id: "network", title: "4 · How banks and the hub exchange signals",
      story: "Banks never talk to each other directly. Each connects to the hub, which relays encrypted signals and confirmations.",
      steps: [
        { title: "Open the network graph", expect: "Banks around the hub; dots are live messages: blue warning, yellow withdrawal, green confirmation.", page: "network" },
        { title: "Send a warning and watch it travel", expect: "A blue dot goes Emirates NBD → hub, then to each bank; green confirmations come back.", page: "network",
          action: { label: warningLive ? "Emirates NBD withdraws" : "Emirates NBD sends warning", run: viaState(warningLive ? api.retract : api.publish) } },
        { title: "Switch between bank and operator view", expect: "Operator: every route, content locked. Bank: only its own traffic, content readable.", page: "network" },
      ],
    },
    {
      id: "outage", title: "5 · The hub goes down",
      story: "Payments must not depend on the network being up.",
      steps: [
        { title: "Pause the hub", expect: "Mashreq shows the channel as offline and keeps checking payments against its local copy.", page: "live", action: { label: "Pause hub", run: viaState(() => api.pause(true)) } },
        { title: "Resume", expect: "Delivery catches up; queued messages arrive.", page: "live", action: { label: "Resume hub", run: viaState(() => api.pause(false)) } },
      ],
    },
  ];

  async function doStep(sc: Scenario, i: number) {
    const st = sc.steps[i];
    go(st.page);
    if (st.action) {
      setNote(null);
      try { await st.action.run(); } catch (e) { setNote(String(e)); return; }
    }
    setDone((d) => ({ ...d, [`${sc.id}:${i}`]: true }));
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="demo-fab fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-semibold text-black shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <Play size={15} /> Demo scenarios
      </button>
    );
  }

  return (
    <aside className="demo-panel fixed bottom-4 right-4 top-4 z-40 flex w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] bg-[#141416] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
      <header className="demo-stripes flex items-center gap-2 px-5 py-3 text-black">
        <Play size={15} />
        <div className="flex-1">
          <div className="text-[14px] font-bold">Demo scenarios</div>
          <div className="text-[11.5px] font-medium opacity-75">Presenter only · simulates other banks and customers</div>
        </div>
        <button onClick={() => { setDone({}); run(api.reset); }} disabled={busy} className="rounded-full bg-black/15 px-3 py-1 text-[11.5px] font-semibold hover:bg-black/25">Reset stand</button>
        <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-black/10"><X size={16} /></button>
      </header>
      <div className="flex-1 overflow-auto p-3">
        {scenarios.map((sc) => {
          const isOpen = active === sc.id;
          const n = sc.steps.filter((_, i) => done[`${sc.id}:${i}`]).length;
          return (
            <div key={sc.id} className="mb-2 rounded-2xl bg-[#1c1c1f]">
              <button onClick={() => setActive(isOpen ? "" : sc.id)} className="flex w-full items-start gap-2 px-4 py-3 text-left">
                <span className="mt-0.5 text-text-3">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold">{sc.title}</span>
                  {isOpen && <span className="mt-0.5 block text-[12px] text-text-3">{sc.story}</span>}
                </span>
                <span className="text-[11px] text-text-3">{n}/{sc.steps.length}</span>
              </button>
              {isOpen && (
                <ol className="px-4 pb-3">
                  {sc.steps.map((st, i) => {
                    const ok = done[`${sc.id}:${i}`];
                    return (
                      <li key={i} className="flex gap-3 border-t border-white/5 py-2.5">
                        <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10.5px] font-bold"
                          style={{ background: ok ? "#5fbf7b" : "#2a2a2e", color: ok ? "black" : "#c9c9cf" }}>{ok ? <Check size={12} /> : i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium">{st.title}</div>
                          <div className="mt-0.5 text-[11.5px] text-text-3"><b className="text-text-2">Expect:</b> {st.expect}</div>
                          <div className="mt-1.5">
                            <Btn onClick={() => doStep(sc, i)} disabled={busy} primary={!!st.action}>
                              {st.action ? st.action.label : "Go to screen"}
                            </Btn>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
        {note && <div className="px-2 text-[12px] text-neg">{note}</div>}
      </div>
    </aside>
  );
}

function Btn({ children, onClick, disabled, primary }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50 ${primary ? "bg-[#f5c84b] text-black hover:brightness-105" : "bg-[#2a2a2e] text-text hover:bg-[#333338]"}`}>
      {children}
    </button>
  );
}
