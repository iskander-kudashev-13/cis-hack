import { useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowUpRight, Bell, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, GitPullRequest, Loader2, Send, ShieldAlert, Undo2,
} from "lucide-react";
import { api } from "../api/client";
import type { CacheRow, DevinResponse, State } from "../api/types";
import { clock, money, until, useNow } from "../components/ui";

type Run = (fn: () => Promise<State>) => Promise<void>;

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const PR_URL = "https://github.com/iskander-kudashev-13/cis-hack/pull/1";
const REASON: Record<string, string> = {
  confirmed_bec_case: "Confirmed business email compromise",
  confirmed_app_scam: "Confirmed authorised push payment scam",
  mule_network_link: "Linked to a known mule network",
  invoice_redirection: "Invoice redirection fraud",
};

/**
 * Mashreq's console. Mashreq receives warnings from the network (events), checks
 * outgoing payments against them, and uses Devin when the network ships a new
 * signal type its connector does not understand yet.
 */
export function BankView({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const now = useNow(1000);
  const b = state.bank_b, a = state.bank_a;
  const names = Object.fromEntries(state.hub.members.map((m) => [m.id, m.name]));
  const events = [...b.cache].sort((x, y) => (x.state === y.state ? Date.parse(y.expires_at) - Date.parse(x.expires_at) : x.state === "active" ? -1 : 1));
  const active = events.filter((e) => e.state === "active");
  const last = b.decisions.length ? b.decisions[b.decisions.length - 1] : null;
  const held = b.decisions.filter((d) => d.decision === "REVIEW_REQUIRED").length;
  const pay = (id: string) => b.payments.find((p) => p.payment_id === id);
  const sigA = a.signal, aActive = !!sigA && sigA.event !== "RETRACT";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[24px] font-medium tracking-tight">Mashreq · payment protection</div>
          <div className="text-[12.5px] text-text-3">Fraud desk console · warnings are decrypted only inside Mashreq · demo data</div>
        </div>
        <div className="flex-1" />
        <span className="font-mono text-[12px] text-text-3">{new Date(now).toLocaleTimeString("en-GB")}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-[28px] p-7 text-white" style={{ background: "#3b78f0" }}>
          <div className="absolute -right-16 -top-16 h-[220px] w-[220px] rounded-full border border-white/25" />
          <div className="text-[13px] font-semibold uppercase tracking-[0.12em]">Mashreq</div>
          <div className="mt-1 text-[14px] text-white/70">Connected to Scam Weather</div>
          <div className="mt-6 text-[52px] font-medium leading-none tracking-tight tabular-nums">{active.length}</div>
          <div className="mt-1 text-[14px] text-white/80">active warnings protecting payments</div>
          <div className="mt-8 flex text-[14px] text-white/85">
            <span>●●●● {b.channel.status === "live" ? "network online" : "offline · local copy in use"}</span><div className="flex-1" /><span>cursor {b.channel.cursor}</span>
          </div>
        </div>
        <Tile title="Events received" sub="warnings from other banks" to="sw-inbox">
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[52px] font-medium leading-none tabular-nums">{events.length}</span>
            <Pill tone="pos">{active.length} active</Pill>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Mini label="Active" value={active.length} color="#5fbf7b" />
            <Mini label="Withdrawn" value={events.filter((e) => e.state !== "active").length} color="#f5c84b" />
          </div>
        </Tile>
        <Tile title="Payments checked" sub="before money leaves Mashreq" to="sw-payment">
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[52px] font-medium leading-none tabular-nums">{b.decisions.length}</span>
            {held > 0 && <Pill tone="neg">{held} held</Pill>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Mini label="Approved" value={b.decisions.length - held} color="#5fbf7b" />
            <Mini label="Held for review" value={held} color="#e8573a" />
          </div>
        </Tile>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <section id="sw-inbox" className="scroll-mt-4 overflow-hidden rounded-[28px] bg-[#151517]">
          <header className="flex items-center gap-2 px-6 pb-3 pt-5">
            <Bell size={15} className="text-text-3" />
            <h2 className="text-[16px] font-medium">Event inbox</h2>
            <div className="flex-1" />
            <span className="text-[11.5px] text-text-3">newest first · click for details</span>
          </header>
          <DevinEvent />
          <div className="max-h-[430px] overflow-auto">
            {events.length === 0 && <div className="px-6 py-6 text-[13px] text-text-3">No warnings yet.</div>}
            {events.slice(0, 30).map((e) => <EventRow key={`${e.signal_id}-${e.revision}`} e={e} from={names[e.issuer] ?? e.issuer} now={now} />)}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section id="sw-payment" className="scroll-mt-4 rounded-[28px] p-7 text-white" style={{ background: last?.decision === "REVIEW_REQUIRED" ? "#e8573a" : "#1f9254" }}>
            <div className="flex items-start">
              <div>
                <div className="text-[17px] font-medium">Outgoing transfer check</div>
                <div className="text-[13px] text-white/75">a Mashreq customer sends money · checked before it leaves</div>
              </div>
              <div className="flex-1" />

            </div>
            {last ? (
              <>
                <div className="mt-6 text-[40px] font-medium leading-none tracking-tight">{money(pay(last.payment_id)?.amount ?? 0, pay(last.payment_id)?.currency ?? "")}</div>
                <div className="mt-2 flex items-center gap-2 text-[16px] font-medium">
                  {last.decision === "REVIEW_REQUIRED" ? <><AlertTriangle size={18} /> Held for review</> : <><CheckCircle2 size={18} /> Approved</>}
                </div>
                <div className="mt-1 text-[13px] text-white/85">to {pay(last.payment_id)?.beneficiary_masked} · {clock(last.at)}</div>
                <div className="mt-1 text-[12.5px] text-white/75">
                  {last.decision === "REVIEW_REQUIRED" ? "Why: another bank reported this account. " : "Why: no warnings for this account. "}{last.reason}
                </div>
              </>
            ) : <div className="mt-6 text-[15px] text-white/85">No transfers checked yet.</div>}
            <div className="mt-6 text-[12px] font-medium uppercase tracking-[0.1em] text-white/70">Simulate a customer transfer</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {b.payments.map((p) => (
                <button key={p.payment_id} disabled={busy} onClick={() => run(() => api.evaluate(p.payment_id))}
                  className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90 disabled:opacity-50">
                  {p.kind === "match" ? `Pay ${p.beneficiary_masked} (reported)` : `Pay ${p.beneficiary_masked} (clean)`}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] bg-[#151517] p-7">
            <div className="text-[17px] font-medium">Simulate another bank</div>
            <div className="text-[13px] text-text-3">Emirates NBD confirms a fraud on account AE07 •••• 3456</div>
            <div className="mt-5 flex gap-2">
              <button disabled={busy || aActive} onClick={() => run(api.publish)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90 disabled:opacity-40">
                <Send size={14} /> Emirates NBD sends warning
              </button>
              <button disabled={busy || !aActive} onClick={() => run(api.retract)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#232326] px-4 py-2 text-[13px] font-medium hover:bg-[#2c2c30] disabled:opacity-40">
                <Undo2 size={14} /> Withdraw
              </button>
            </div>
            {sigA && <div className="mt-3 text-[12px] text-text-3">{aActive ? `Delivered to ${sigA.deliveries.filter((d) => d.status === "applied").length} of ${sigA.deliveries.length} banks` : "Warning withdrawn"}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function EventRow({ e, from, now }: { e: CacheRow; from: string; now: number }) {
  const [open, setOpen] = useState(false);
  const on = e.state === "active";
  return (
    <div className="border-t border-white/5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-white/[0.03]">
        <span className="text-text-3">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: on ? "rgba(232,87,58,0.18)" : "#232326", color: on ? "#e8573a" : "var(--text-3)" }}>
          <ShieldAlert size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{REASON[e.reason_code] ?? e.reason_code}</div>
          <div className="truncate text-[12px] text-text-3">from {from} · {e.amount_band} · {e.signal_id}</div>
        </div>
        <Pill tone={on ? "neg" : "muted"}>{on ? "holding payments" : e.state}</Pill>
      </button>
      {open && (
        <div className="mx-6 mb-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-2xl bg-[#1c1c1f] p-4 text-[12.5px]">
          <KV k="Sender" v={`${from}, signature verified`} />
          <KV k="Evidence" v={e.evidence_level.replace(/_/g, " ")} />
          <KV k="Amount band" v={e.amount_band} />
          <KV k="Version" v={`v${e.revision}`} />
          <KV k="Valid for" v={on ? until(e.expires_at, now) : "—"} />
          <KV k="Account match key" v={`${e.indicator.slice(0, 14)}…`} />
          <div className="col-span-2 mt-2 text-[12px] text-text-3">
            What Mashreq does: any outgoing payment to this account is held for an analyst. The account number itself never left Emirates NBD in clear text.
          </div>
        </div>
      )}
    </div>
  );
}

/** A pinned event: the network announced a new signal type; Devin adds support. */
function DevinEvent() {
  const [res, setRes] = useState<DevinResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  async function start() {
    setLoading(true);
    try { setRes(await api.devin("bank-b", "signal-kind")); setOpen(true); } catch { /* shown below */ } finally { setLoading(false); }
  }
  const steps = ["Event received", "Task sent to Devin", "Devin updates connector + tests", "Draft PR for your engineers"];
  const reached = res ? 2 : 1;
  return (
    <div className="mx-4 mb-3 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(59,120,240,0.22), rgba(168,85,247,0.14))" }}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-white"><Bot size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold">Action required · new signal type</span>
            <Pill tone="neg">not supported yet</Pill>
          </div>
          <div className="mt-0.5 text-[12.5px] text-text-2">
            The network announced schema v2: warnings can now point to a <b>crypto wallet</b>, not only an IBAN. Your connector ignores these warnings until it is updated.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={start} disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90 disabled:opacity-60">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />} Implement with Devin
            </button>
            {res?.session_url && <a href={res.session_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">Devin session <ExternalLink size={12} /></a>}
            <a href={PR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-text-3 hover:text-text"><GitPullRequest size={12} /> example PR from Devin</a>
            {res && <button onClick={() => setOpen(!open)} className="text-[12.5px] text-text-3 hover:text-text">{open ? "Hide task" : "Show task"}</button>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1.5 text-[11.5px]">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: i < reached ? "#5fbf7b" : i === reached ? "#3b78f0" : "#3a3a3f" }}>
                  {i < reached ? <Check size={10} /> : i + 1}
                </span>
                <span className="truncate">{s}</span>
              </div>
            ))}
          </div>
          {res && open && (
            <pre className="mt-3 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-3 font-mono text-[11px] text-text-2">
              {res.mode === "manual" ? "Devin API key is not set on this server: paste this task into Devin.\n\n" : ""}{res.prompt}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ title, sub, children, to }: { title: string; sub?: string; children: ReactNode; to?: string }) {
  return (
    <div className="rounded-[28px] bg-[#151517] p-7">
      <div className="flex items-start">
        <div>
          <div className="text-[17px] font-medium">{title}</div>
          {sub && <div className="text-[13px] text-text-3">{sub}</div>}
        </div>
        <div className="flex-1" />
        <button onClick={() => to && jump(to)} title="Open details"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f1f22] shadow-[0_6px_16px_rgba(0,0,0,0.5)] transition hover:bg-[#2a2a2e]">
          <ArrowUpRight size={17} className="text-text-2" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "pos" | "neg" | "muted"; children: ReactNode }) {
  const bg = tone === "pos" ? "#5fbf7b" : tone === "neg" ? "#e8573a" : "#2a2a2e";
  return <span className="inline-flex flex-none items-center rounded-full px-3 py-1 text-[12px] font-medium text-white" style={{ background: bg }}>{children}</span>;
}

function Mini({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div className="rounded-2xl bg-[#1c1c1f] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[12px] text-text-3"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
      <div className="mt-1 text-[20px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

const KV = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-2"><span className="w-[120px] flex-none text-text-3">{k}</span><span className="min-w-0 break-words">{v}</span></div>
);
