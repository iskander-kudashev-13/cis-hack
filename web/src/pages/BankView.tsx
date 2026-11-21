import { useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowUpRight, Bell, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, GitPullRequest, Loader2, ShieldAlert,
} from "lucide-react";
import { SignalRoute } from "../components/SignalRoute";
import { api } from "../api/client";
import type { CacheRow, DevinResponse, KindRow, State } from "../api/types";
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
  const b = state.bank_b;
  const names = Object.fromEntries(state.hub.members.map((m) => [m.id, m.name]));
  const events = [...b.cache].sort((x, y) => (x.state === y.state ? Date.parse(y.expires_at) - Date.parse(x.expires_at) : x.state === "active" ? -1 : 1));
  const active = events.filter((e) => e.state === "active");
  const last = b.decisions.length ? b.decisions[b.decisions.length - 1] : null;
  const held = b.decisions.filter((d) => d.decision === "REVIEW_REQUIRED").length;
  const pay = (id: string) => b.payments.find((p) => p.payment_id === id);
  const uncovered = (b.ops?.kinds ?? []).filter((k) => !k.covered && k.active_uncovered > 0);
  const kinds = Object.fromEntries((b.ops?.kinds ?? []).map((k) => [k.kind, k]));

  return (
    <div className="bank-desk flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight tracking-tight">Payment protection</h1>
          <div className="text-[12.5px] text-text-3">{b.name} fraud desk · synthetic demo data</div>
        </div>
        <div className="flex-1" />
        <span className="font-mono text-[12px] text-text-3">{new Date(now).toLocaleTimeString("en-GB")}</span>
      </div>

      <section id="sw-payment" className="scroll-mt-4 rounded-[28px] p-7 text-white transition-colors" style={{ background: !last ? "#232326" : last.decision === "REVIEW_REQUIRED" ? "#e8573a" : "#1f9254" }}>
        <div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-medium">Latest outgoing transfer check</span>
            </div>
            <div className="mt-0.5 text-[13px] text-white/75">A {b.name} customer sends money. The payee is checked against warnings from other banks before the money leaves.</div>
            {last ? (
              <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
                <div className="text-[40px] font-medium leading-none tracking-tight">{money(pay(last.payment_id)?.amount ?? 0, pay(last.payment_id)?.currency ?? "")}</div>
                <div>
                  <div className="flex items-center gap-2 text-[16px] font-medium">
                    {last.decision === "REVIEW_REQUIRED" ? <><AlertTriangle size={18} /> Held for review</> : <><CheckCircle2 size={18} /> Approved</>}
                  </div>
                  <div className="text-[13px] text-white/85">to {pay(last.payment_id)?.beneficiary_masked} · {clock(last.at)}</div>
                </div>
                <div className="w-full text-[12.5px] text-white/85">
                  Why: {last.decision === "REVIEW_REQUIRED" ? "another bank reported this account. " : "no active warning for this account. "}
                  {last.decision === "REVIEW_REQUIRED" ? last.reason.replace(/[a-z]+(?:_[a-z]+)+/g, (m) => REASON[m] ?? m.replace(/_/g, " ")) : ""}
                </div>
              </div>
            ) : <div className="mt-4 text-[15px] text-white/85">No transfer checked yet. Open Demo scenarios (bottom right) and run scenario 1.</div>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="protection-card">
          <div className="protection-orbit" aria-hidden="true" />
          <div className="relative flex h-full flex-col items-start">
            <span className="text-[13px] font-semibold uppercase tracking-[0.12em]">{b.name}</span>
            <span className="mt-1 text-[13px] text-white/85">Payment protection</span>
            <div className="my-auto py-4">
              <div className="text-[58px] font-medium leading-none tracking-tight tabular-nums">{active.length}</div>
              <div className="mt-1 text-[14px]">active {active.length === 1 ? "warning" : "warnings"}</div>
            </div>
            <div className="flex w-full items-center justify-between border-t border-white/25 pt-3 text-[12px]">
              <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-current" />{b.channel.status === "live" ? "Network online" : "Offline · local copy"}</span>
              <span className="font-mono text-white/85">cursor {b.channel.cursor}</span>
            </div>
          </div>
        </div>
        <Tile title="Events received" sub="warnings from other banks" to="sw-inbox">
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[52px] font-medium leading-none tabular-nums">{events.length}</span>
            <Pill tone="pos">{active.length} active</Pill>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Mini label="Active" value={active.length} color="#5fbf7b" />
            <Mini label="Inactive" value={events.filter((e) => e.state !== "active").length} color="#f5c84b" />
          </div>
        </Tile>
        <Tile title="Transfers tested" sub="manual checks in this demo" to="sw-payment">
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

      <SignalRoute state={state} />

      <div className="grid items-start gap-4">
        <section id="sw-inbox" className="scroll-mt-4 overflow-hidden rounded-[28px] bg-[#151517]">
          <header className="flex items-center gap-2 px-6 pb-3 pt-5">
            <Bell size={15} className="text-text-3" />
            <h2 className="text-[16px] font-medium">Event inbox</h2>
            <div className="flex-1" />
            <span className="text-[11.5px] text-text-3">active first · click for details</span>
          </header>
          {uncovered.length > 0 && (
            <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(59,120,240,0.22), rgba(168,85,247,0.14))" }}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-white"><Bot size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">Other banks send {uncovered.length} alert {uncovered.length === 1 ? "type" : "types"} {b.name} cannot check yet</div>
                <div className="text-[12.5px] text-text-2">{uncovered.map((k) => `${k.label} (${k.active_uncovered})`).join(" · ")}. Payments that depend on them wait for an analyst. Devin can add support.</div>
              </div>
              <a href="#txns" className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90">Review in Payments &amp; alerts</a>
            </div>
          )}
          <div className="max-h-[430px] overflow-auto">
            {events.length === 0 && <div className="px-6 py-6 text-[13px] text-text-3">No warnings yet.</div>}
            {events.slice(0, 30).map((e) => <EventRow key={`${e.signal_id}-${e.revision}`} e={e} from={names[e.issuer] ?? e.issuer} now={now} kind={kinds[e.kind]} />)}
          </div>
        </section>

      </div>
    </div>
  );
}

function EventRow({ e, from, now, kind }: { e: CacheRow; from: string; now: number; kind?: KindRow }) {
  const [open, setOpen] = useState(false);
  const covered = kind ? kind.covered : true;
  const on = e.state === "active";
  return (
    <div className="border-t border-white/5">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-white/[0.03]">
        <span className="text-text-3">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: on ? "rgba(232,87,58,0.18)" : "#232326", color: on ? "#e8573a" : "var(--text-3)" }}>
          <ShieldAlert size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{kind?.label ?? e.kind} · {REASON[e.reason_code] ?? e.reason_code.replace(/_/g, " ")}</div>
          <div className="truncate text-[12px] text-text-3">from {from} · {e.amount_band} · {e.signal_id}</div>
        </div>
        <Pill tone={on ? (covered ? "neg" : "warn") : "muted"}>{on ? (covered ? "holding payments" : "not covered") : e.state}</Pill>
      </button>
      {open && (
        <div className="mx-4 mb-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 rounded-2xl bg-[#1c1c1f] p-4 text-[12.5px]">
          <KV k="Sender" v={`${from}, signature verified`} />
          <KV k="Evidence" v={e.evidence_level.replace(/_/g, " ")} />
          <KV k="Amount band" v={e.amount_band} />
          <KV k="Version" v={`v${e.revision}`} />
          <KV k="Valid for" v={on ? until(e.expires_at, now) : "—"} />
          <KV k="Match key" v={`${e.indicator.slice(0, 14)}…`} />
          <div className="sm:col-span-2 mt-2 text-[12px] text-text-3">
            {covered
              ? <>What Mashreq does: any outgoing payment that matches this alert is held for an analyst. The identifier itself never left {from} in clear text.</>
              : <>Mashreq cannot check this alert type yet ({kind?.indicator}). Open Payments &amp; alerts to start Devin on it.</>}
          </div>
        </div>
      )}
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
        <button onClick={() => to && jump(to)} aria-label={`Open ${title.toLowerCase()} details`}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f1f22] shadow-[0_6px_16px_rgba(0,0,0,0.5)] transition hover:bg-[#2a2a2e]">
          <ArrowUpRight size={17} className="text-text-2" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "pos" | "neg" | "muted" | "warn"; children: ReactNode }) {
  const bg = tone === "pos" ? "#5fbf7b" : tone === "neg" ? "#e8573a" : tone === "warn" ? "#b8860b" : "#2a2a2e";
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
