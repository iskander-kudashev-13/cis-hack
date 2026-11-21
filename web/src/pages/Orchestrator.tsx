import { Check, Clock, Inbox, Radio, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { State, StoredSignal } from "../api/types";
import { Badge, clock, Empty, Panel } from "../components/ui";
import { HubPage } from "./HubView";

/** The orchestrator's screen: every signal as a pipeline across the whole network. */
export function OrchestratorView({ state }: { state: State }) {
  const h = state.hub;
  const names = Object.fromEntries(h.members.map((m) => [m.id, m.name]));
  const signals = [...h.stored].reverse();

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Signal pipeline" icon={<Radio size={15} />} bodyClass="flex flex-col gap-3 p-3.5"
        right={<span className="text-[11.5px] text-text-3">{h.members.length} banks in the network · newest first</span>}>
        {signals.length === 0 && <Empty>No signals yet. Switch to the bank view and send a warning from Bank A.</Empty>}
        {signals.map((s) => <Pipeline key={`${s.envelope.signal_id}-${s.envelope.revision}`} s={s} state={state} names={names} />)}
      </Panel>
      <HubPage state={state} />
    </div>
  );
}

function Pipeline({ s, state, names }: { s: StoredSignal; state: State; names: Record<string, string> }) {
  const e = s.envelope;
  const h = state.hub;
  const same = (j: { signal_id?: string; revision?: number }) => j.signal_id === e.signal_id && j.revision === e.revision;
  const pub = h.journal.find((j) => same(j) && (j.type === "published" || j.type === "revised"));
  const queued = h.journal.filter((j) => same(j) && j.type === "queued").map((j) => (j.detail ?? "").replace(/^for /, ""));
  const acks = h.acks.filter((a) => same(a));
  const applied = acks.filter((a) => a.status === "applied").length;
  const recipients = queued.length || h.members.length - 1;
  const done = acks.length >= recipients && recipients > 0;
  const slowest = acks.reduce((m, a) => Math.max(m, a.latency_ms), 0);
  const retract = e.event === "RETRACT";

  return (
    <div className="rounded-lg border border-border-2 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold">{e.signal_id}</span>
        <Badge tone="muted">rev {e.revision}</Badge>
        <Badge tone={retract ? "muted" : "warn"}>{retract ? "withdrawal" : "mule-account warning"}</Badge>
        <span className="text-[12px] text-text-3">from {names[e.issuer] ?? e.issuer} · {pub ? clock(pub.at) : "—"}</span>
        <div className="flex-1" />
        <Badge tone={done ? "good" : "info"} dot pulse={!done}>
          {done ? `delivered to all ${recipients} · slowest ${slowest} ms` : `${acks.length}/${recipients} confirmed`}
        </Badge>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stage icon={<Inbox size={14} />} title="Received" sub={`from ${names[e.issuer] ?? e.issuer}`} ok={!!pub} />
        <Stage icon={<ShieldCheck size={14} />} title="Verified" sub="signature and revision order" ok={!!pub} />
        <Stage icon={<Send size={14} />} title="Relayed" sub={`encrypted for ${queued.length} banks`} ok={queued.length > 0} />
        <Stage icon={<Check size={14} />} title="Confirmed" sub={`${applied} applied · ${acks.length - applied} other`} ok={done}
          progress={recipients ? acks.length / recipients : 0} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {queued.map((id) => {
          const a = acks.find((x) => x.member === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11.5px]">
              <span className="font-medium">{names[id] ?? id}</span>
              {a
                ? <span style={{ color: a.status === "applied" ? "var(--pos)" : "var(--warn)" }}>{a.status} · {a.latency_ms} ms</span>
                : <span className="inline-flex items-center gap-1 text-text-3"><Clock size={11} /> waiting</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Stage({ icon, title, sub, ok, progress }: { icon: ReactNode; title: string; sub: string; ok: boolean; progress?: number }) {
  return (
    <div className="rounded-md border px-2.5 py-2"
      style={{ borderColor: ok ? "color-mix(in srgb, var(--pos) 45%, transparent)" : "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
        <span style={{ color: ok ? "var(--pos)" : "var(--text-3)" }}>{ok ? <Check size={14} /> : icon}</span>{title}
      </div>
      <div className="mt-0.5 text-[11.5px] text-text-3">{sub}</div>
      {progress !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-border">
          <div className="h-full rounded bg-pos transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
