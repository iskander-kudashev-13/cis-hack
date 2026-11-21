import { useMemo, useState, type ReactNode } from "react";
import { Activity, Check, ChevronDown, ChevronRight, Clock, Gauge, Link2, Lock, Radio, Server, ShieldCheck, Timer, Users } from "lucide-react";
import type { State, StoredSignal } from "../api/types";
import { Badge, clock, short, until, useNow } from "../components/ui";

/**
 * Network operator dashboard. Built only from what the Hub itself knows:
 * members, envelopes (who, what kind, when), delivery confirmations and the
 * audit log. Accounts, amounts, reasons and payment checks never reach it.
 */

const PALETTE = ["#4d86e8", "#1f9254", "#d9920a", "#a855f7", "#14b8a6", "#e85d75", "#8b93a7", "#f97316"];
const MIN = 60_000;
const WINDOW_MIN = 15;

export function OrchestratorView({ state }: { state: State }) {
  const now = useNow(1000);
  const h = state.hub;
  const a = useMemo(() => analyze(state), [state]);
  const online = h.members.filter((m) => isOnline(h.last_seen?.[m.id], now)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[18px] font-semibold tracking-tight">Network operations</div>
          <div className="text-[12px] text-text-3">UAE BEC pilot · routing metadata only, contents end-to-end encrypted</div>
        </div>
        <div className="flex-1" />
        <Badge tone={h.paused ? "warn" : "good"} dot pulse={!h.paused}>{h.paused ? "Hub paused" : "All systems operational"}</Badge>
        <span className="font-mono text-[12px] text-text-3">{new Date(now).toLocaleTimeString("en-GB")}</span>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Kpi icon={<Users size={14} />} label="Members online" value={`${online}/${h.members.length}`} tone={online === h.members.length ? "good" : "warn"}
          foot={online === h.members.length ? "all banks syncing" : `${h.members.length - online} not syncing`} />
        <Kpi icon={<Radio size={14} />} label={`Signals · last ${WINDOW_MIN} min`} value={String(a.windowTotal)} spark={a.perMinute.map((b) => b.up + b.down)}
          foot={`${(a.perMinute[a.perMinute.length - 1]?.up ?? 0) + (a.perMinute[a.perMinute.length - 1]?.down ?? 0)} this minute`} />
        <Kpi icon={<Gauge size={14} />} label="Delivery rate" value={`${a.deliveryRate.toFixed(1)}%`} tone={a.deliveryRate > 99 ? "good" : "warn"}
          foot={`${a.acked} of ${a.expected} confirmations`} />
        <Kpi icon={<Timer size={14} />} label="Latency p50 / p95" value={`${a.p50} / ${a.p95} ms`} spark={a.latencySpark} foot="publish → bank confirmed" />
        <Kpi icon={<ShieldCheck size={14} />} label="Audit chain" value={h.chain_ok ? "Verified" : "Broken"} tone={h.chain_ok ? "good" : "bad"}
          foot={`${h.journal.length} entries hash-linked`} />
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <Card title="Signal traffic" icon={<Activity size={14} />} right={<Legend items={[["Warnings", PALETTE[0]], ["Withdrawals", PALETTE[2]]]} />}>
          <TrafficChart data={a.perMinute} />
        </Card>
        <Card title="Signals by issuing bank" icon={<Radio size={14} />}>
          <Donut slices={a.byIssuer} names={a.names} />
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <Card title="Member health" icon={<Server size={14} />} pad={false}>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-3">
              <Th>Bank</Th><Th>Status</Th><Th>Last sync</Th><Th right>Sent</Th><Th right>Received</Th><Th right>Delivery</Th><Th right>Avg latency</Th>
            </tr></thead>
            <tbody>
              {h.members.map((m) => {
                const s = a.member[m.id];
                const on = isOnline(h.last_seen?.[m.id], now);
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2"><Badge tone={on ? "good" : "warn"} dot>{on ? "online" : "stale"}</Badge></td>
                    <td className="px-3 py-2 font-mono text-[11.5px] text-text-3">{ago(h.last_seen?.[m.id], now)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s?.sent ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s?.received ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s?.received ? `${Math.round((s.acked / s.received) * 100)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s?.acked ? `${Math.round(s.latency / s.acked)} ms` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="Confirmation latency by bank" icon={<Timer size={14} />}>
          <Bars rows={h.members.filter((m) => a.member[m.id]?.acked).map((m) => ({
            label: m.name, value: Math.round(a.member[m.id].latency / a.member[m.id].acked), max: a.member[m.id].maxLatency,
          }))} />
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
        <Card title="Live message stream" icon={<Radio size={14} />} pad={false}
          right={<span className="flex items-center gap-1 text-[11px] text-text-3"><Lock size={11} /> click a row for routing details</span>}>
          <div className="max-h-[420px] overflow-auto">
            {[...h.stored].reverse().slice(0, 25).map((s) => <StreamRow key={`${s.envelope.signal_id}-${s.envelope.revision}`} s={s} state={state} names={a.names} />)}
          </div>
        </Card>
        <Card title="Audit log" icon={<Link2 size={14} />} pad={false} right={<Badge tone={h.chain_ok ? "good" : "bad"}>{h.chain_ok ? "chain verified" : "chain broken"}</Badge>}>
          <div className="max-h-[420px] overflow-auto font-mono text-[11px]">
            {[...h.journal].reverse().slice(0, 60).map((j) => (
              <div key={j.seq} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                <span className="w-[42px] text-text-3">#{j.seq}</span>
                <span className="w-[58px] text-text-3">{clock(j.at)}</span>
                <span className="w-[66px]" style={{ color: j.type === "ack" ? "var(--pos)" : j.type === "rejected" ? "var(--neg)" : j.type === "queued" ? "var(--text-3)" : "var(--accent)" }}>{j.type}</span>
                <span className="w-[54px] truncate">{a.names[j.actor] ?? j.actor}</span>
                <span className="flex-1 truncate text-text-3">{j.hash}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- analytics ----------

type Bucket = { t: number; up: number; down: number };
type MemberStat = { sent: number; received: number; acked: number; latency: number; maxLatency: number };

function analyze(state: State) {
  const h = state.hub;
  const names: Record<string, string> = Object.fromEntries(h.members.map((m) => [m.id, m.name]));
  const events = new Map(h.stored.map((s) => [`${s.envelope.signal_id}#${s.envelope.revision}`, s.envelope.event]));
  const nowMs = Date.parse(state.now) || Date.now();
  const start = Math.floor(nowMs / MIN) * MIN - (WINDOW_MIN - 1) * MIN;
  const perMinute: Bucket[] = Array.from({ length: WINDOW_MIN }, (_, i) => ({ t: start + i * MIN, up: 0, down: 0 }));
  const member: Record<string, MemberStat> = {};
  const m = (id: string) => (member[id] ??= { sent: 0, received: 0, acked: 0, latency: 0, maxLatency: 0 });
  const byIssuer: Record<string, number> = {};

  for (const j of h.journal) {
    if (j.type === "published" || j.type === "revised") {
      m(j.actor).sent++;
      byIssuer[j.actor] = (byIssuer[j.actor] ?? 0) + 1;
      const i = Math.floor((Date.parse(j.at) - start) / MIN);
      if (i >= 0 && i < WINDOW_MIN) {
        if (events.get(`${j.signal_id}#${j.revision}`) === "RETRACT") perMinute[i].down++; else perMinute[i].up++;
      }
    } else if (j.type === "queued") {
      m((j.detail ?? "").replace(/^for /, "")).received++;
    }
  }
  const lat: number[] = [];
  for (const ack of h.acks) {
    const s = m(ack.member);
    s.acked++; s.latency += ack.latency_ms; s.maxLatency = Math.max(s.maxLatency, ack.latency_ms);
    lat.push(ack.latency_ms);
  }
  const sorted = [...lat].sort((x, y) => x - y);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  const expected = Object.values(member).reduce((n, s) => n + s.received, 0);
  const acked = h.acks.length;
  const recentAcks = [...h.acks].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).slice(-30).map((x) => x.latency_ms);

  return {
    names, perMinute, member,
    byIssuer: Object.entries(byIssuer).sort((x, y) => y[1] - x[1]),
    windowTotal: perMinute.reduce((n, b) => n + b.up + b.down, 0),
    deliveryRate: expected ? Math.min(100, (acked / expected) * 100) : 100,
    acked, expected, p50: pct(0.5), p95: pct(0.95), latencySpark: recentAcks,
  };
}

const isOnline = (iso: string | undefined, now: number) => !!iso && now - Date.parse(iso) < 6000;
function ago(iso: string | undefined, now: number) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 1 ? "just now" : `${s}s ago`;
}

// ---------- building blocks ----------

function Card({ title, icon, right, children, pad = true }: { title: string; icon: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
      <header className="flex h-10 items-center gap-2 border-b border-border px-3.5">
        <span className="text-text-3">{icon}</span>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <div className="flex-1" />{right}
      </header>
      <div className={pad ? "p-3.5" : ""}>{children}</div>
    </section>
  );
}

const Th = ({ children, right }: { children: ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>
);

function Kpi({ icon, label, value, foot, tone, spark }: { icon: ReactNode; label: string; value: string; foot?: string; tone?: "good" | "warn" | "bad"; spark?: number[] }) {
  const color = tone ? `var(--${tone === "good" ? "pos" : tone === "warn" ? "warn" : "neg"})` : "var(--text)";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11.5px] text-text-3">{icon}{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight" style={{ color }}>{value}</div>
      {foot && <div className="text-[11px] text-text-3">{foot}</div>}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 64, h = 20, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="absolute right-3 top-3 opacity-70">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-3 text-[11px] text-text-3">
      {items.map(([l, c]) => <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}
    </div>
  );
}

function TrafficChart({ data }: { data: Bucket[] }) {
  const W = 640, H = 190, P = 26;
  const max = Math.max(4, ...data.map((b) => b.up + b.down));
  const bw = (W - P) / data.length;
  const y = (v: number) => H - 18 - (v / max) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={P} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={0} y={y(max * f) + 4} fontSize="10" fill="var(--text-3)">{Math.round(max * f)}</text>
        </g>
      ))}
      {data.map((b, i) => {
        const x = P + i * bw + 3, w = bw - 6;
        return (
          <g key={b.t}>
            <rect x={x} y={y(b.up)} width={w} height={H - 18 - y(b.up)} rx="2" fill={PALETTE[0]} opacity={i === data.length - 1 ? 1 : 0.8}>
              <title>{`${clock(new Date(b.t).toISOString())}: ${b.up} warnings, ${b.down} withdrawals`}</title>
            </rect>
            <rect x={x} y={y(b.up + b.down)} width={w} height={y(b.up) - y(b.up + b.down)} rx="2" fill={PALETTE[2]} />
            {i % 3 === 0 && <text x={x + w / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="var(--text-3)">
              {new Date(b.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </text>}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ slices, names }: { slices: [string, number][]; names: Record<string, string> }) {
  const total = slices.reduce((n, [, v]) => n + v, 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-[150px] w-[150px] flex-none -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" strokeWidth="16" />
        {slices.map(([id, v], i) => {
          const len = (v / total) * C;
          const el = <circle key={id} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="16"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}><title>{`${names[id] ?? id}: ${v}`}</title></circle>;
          off += len;
          return el;
        })}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12px]">
        {slices.map(([id, v], i) => (
          <div key={id} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{names[id] ?? id}</span>
            <span className="tabular-nums text-text-3">{v} · {Math.round((v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; max: number }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.max));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[12px]">
          <span className="w-[56px]">{r.label}</span>
          <div className="relative h-4 flex-1 rounded bg-surface-2">
            <div className="absolute inset-y-0 left-0 rounded bg-accent/25" style={{ width: `${(r.max / top) * 100}%` }} title={`max ${r.max} ms`} />
            <div className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${(r.value / top) * 100}%` }} />
          </div>
          <span className="w-[86px] text-right tabular-nums text-text-3">{r.value} <span className="text-[10.5px]">/ {r.max} ms</span></span>
        </div>
      ))}
      <div className="text-[11px] text-text-3">Solid: average. Light: worst case. Each bank syncs at its own interval.</div>
    </div>
  );
}

const same = (x: { signal_id?: string; revision?: number }, s: StoredSignal) =>
  x.signal_id === s.envelope.signal_id && x.revision === s.envelope.revision;

function StreamRow({ s, state, names }: { s: StoredSignal; state: State; names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const e = s.envelope, h = state.hub;
  const pub = h.journal.find((j) => same(j, s) && (j.type === "published" || j.type === "revised"));
  const recipients = h.members.filter((m) => m.id !== e.issuer);
  const acks = h.acks.filter((x) => same(x, s));
  const done = acks.length >= recipients.length;
  const withdraw = e.event === "RETRACT";
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] hover:bg-surface-2">
        <span className="text-text-3">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
        <span className="w-[58px] font-mono text-[11.5px] text-text-3">{pub ? clock(pub.at) : "—"}</span>
        <span className="w-[120px] truncate font-mono text-[11.5px]">{e.signal_id}</span>
        <Badge tone={withdraw ? "warn" : "info"} className="w-[84px] justify-center">{withdraw ? "withdrawal" : "warning"}</Badge>
        <span className="flex-1 truncate">{names[e.issuer] ?? e.issuer} → {recipients.length} banks</span>
        <div className="h-1.5 w-[70px] overflow-hidden rounded bg-border">
          <div className="h-full bg-pos transition-all" style={{ width: `${(acks.length / Math.max(1, recipients.length)) * 100}%` }} />
        </div>
        <span className={`w-[34px] text-right tabular-nums ${done ? "text-pos" : "text-text-3"}`}>{acks.length}/{recipients.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-4 bg-bg px-5 py-3 text-[12px]">
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Delivery</div>
            {recipients.map((m) => {
              const ack = acks.find((x) => x.member === m.id);
              return (
                <div key={m.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-[56px]">{m.name}</span>
                  {ack ? <span className="inline-flex items-center gap-1 text-pos"><Check size={12} />{ack.latency_ms} ms</span>
                    : <span className="inline-flex items-center gap-1 text-text-3"><Clock size={11} />waiting</span>}
                </div>
              );
            })}
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">Envelope (visible to operator)</div>
            <div>Version {e.revision} · {e.kind}</div>
            <div>Signed by {names[e.issuer] ?? e.issuer} · valid</div>
            <div>Expires in {until(e.expires_at, Date.now())}</div>
            <div className="mt-2 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3"><Lock size={10} /> Payload (encrypted)</div>
            <div className="font-mono text-[11px] text-text-3">{short(Object.values(s.ciphertexts)[0]?.ct, 40)}…</div>
          </div>
        </div>
      )}
    </div>
  );
}
