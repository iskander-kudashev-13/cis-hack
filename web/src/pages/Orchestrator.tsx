import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock, Lock } from "lucide-react";
import type { State, StoredSignal } from "../api/types";
import { Badge, clock, Empty, short, until } from "../components/ui";

/**
 * The network operator's screen. It shows only what the Hub itself knows:
 * who is in the network, which warnings moved, and who confirmed them.
 * No accounts, amounts, customers or payment checks: those stay inside banks.
 */
export function OrchestratorView({ state }: { state: State }) {
  const h = state.hub;
  const names: Record<string, string> = Object.fromEntries(h.members.map((m) => [m.id, m.name]));
  const signals = [...h.stored].reverse();
  const delivered = signals.filter((s) => h.acks.filter((a) => same(a, s)).length >= h.members.length - 1).length;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Banks in the network" value={String(h.members.length)} />
        <Stat label="Warnings relayed" value={`${signals.length}`} sub={signals.length ? `${delivered} fully delivered` : undefined} />
        <Stat label="Hub" value={h.paused ? "Paused" : "Online"} tone={h.paused ? "warn" : "good"} sub={h.chain_ok ? "audit log intact" : "audit log broken"} />
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">Warnings moving through the network</h2>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-[11.5px] text-text-3"><Lock size={12} /> contents are encrypted; the operator sees only routing</span>
        </header>
        {signals.length === 0
          ? <div className="p-4"><Empty>No warnings yet. On the Bank screen, send one from Bank A.</Empty></div>
          : <ul>{signals.map((s) => <SignalRow key={`${s.envelope.signal_id}-${s.envelope.revision}`} s={s} state={state} names={names} />)}</ul>}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-[14px] font-semibold">Members</h2>
        <div className="flex flex-wrap gap-1.5">
          {h.members.map((m) => (
            <span key={m.id} className="rounded-md border border-border-2 bg-surface-2 px-2 py-1 text-[12px]">
              {m.name} <span className="font-mono text-[11px] text-text-3">key {short(m.sign_pub, 8)}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

const same = (x: { signal_id?: string; revision?: number }, s: StoredSignal) =>
  x.signal_id === s.envelope.signal_id && x.revision === s.envelope.revision;

function SignalRow({ s, state, names }: { s: StoredSignal; state: State; names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const e = s.envelope, h = state.hub;
  const pub = h.journal.find((j) => same(j, s) && (j.type === "published" || j.type === "revised"));
  const recipients = h.members.filter((m) => m.id !== e.issuer);
  const acks = h.acks.filter((a) => same(a, s));
  const done = acks.length >= recipients.length;
  const withdraw = e.event === "RETRACT";

  return (
    <li className="border-b border-border last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
        <span className="text-text-3">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        <span className="w-[62px] font-mono text-[12px] text-text-3">{pub ? clock(pub.at) : "—"}</span>
        <span className="flex-1 text-[13.5px]">
          <b>{names[e.issuer] ?? e.issuer}</b> {withdraw ? "withdrew a warning" : "sent a warning"} to {recipients.length} banks
        </span>
        <div className="h-1.5 w-[120px] overflow-hidden rounded bg-border">
          <div className="h-full rounded bg-pos transition-all" style={{ width: `${(acks.length / Math.max(1, recipients.length)) * 100}%` }} />
        </div>
        <Badge tone={done ? "good" : "info"}>{acks.length}/{recipients.length} received</Badge>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-4 border-t border-border bg-bg px-5 py-4">
          <div>
            <Title>Delivery to each bank</Title>
            {recipients.map((m) => {
              const a = acks.find((x) => x.member === m.id);
              return (
                <div key={m.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
                  <span className="w-[70px]">{m.name}</span>
                  {a ? <span className="inline-flex items-center gap-1 text-pos"><Check size={13} /> received in {a.latency_ms} ms</span>
                    : <span className="inline-flex items-center gap-1 text-text-3"><Clock size={12} /> waiting</span>}
                </div>
              );
            })}
          </div>
          <div>
            <Title>What the operator can see</Title>
            <KV k="Warning ID" v={`${e.signal_id} · v${e.revision}`} />
            <KV k="Type" v={withdraw ? "withdrawal" : e.kind} />
            <KV k="Sender" v={`${names[e.issuer] ?? e.issuer}, signature valid`} />
            <KV k="Expires" v={`in ${until(e.expires_at, Date.now())}`} />
            <Title className="mt-3"><Lock size={11} className="mr-1 inline" />What it cannot see</Title>
            <div className="text-[12px] text-text-2">The account, amount band and reason. Each bank gets its own encrypted copy:</div>
            <div className="mt-1 font-mono text-[11px] text-text-3">{short(Object.values(s.ciphertexts)[0]?.ct, 48)}…</div>
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-[12px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold" style={{ color: tone ? `var(--${tone === "good" ? "pos" : "warn"})` : undefined }}>{value}</div>
      {sub && <div className="text-[11.5px] text-text-3">{sub}</div>}
    </div>
  );
}

const Title = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-3 ${className}`}>{children}</div>
);
const KV = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3 py-0.5 text-[12.5px]"><span className="w-[90px] flex-none text-text-3">{k}</span><span>{v}</span></div>
);
