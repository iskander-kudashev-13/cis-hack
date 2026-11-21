import { useMemo, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, Check, ChevronDown, ChevronRight, Clock, Gauge, Link2, Lock, Radio, Server, ShieldCheck, Timer, Users } from "lucide-react";
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
  const series = a.perMinute.map((b) => b.up + b.down);
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((x, y) => x + y, 0), cur = series.slice(half).reduce((x, y) => x + y, 0);
  const trend = prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 100 : 0;
  const delivery = h.members.filter((m) => a.member[m.id]?.received).map((m) => ({
    label: m.name.replace("Bank ", ""), pct: Math.round((a.member[m.id].acked / a.member[m.id].received) * 100),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[24px] font-medium tracking-tight">Network operations</div>
          <div className="text-[12.5px] text-text-3">UAE BEC pilot · routing metadata only, contents end-to-end encrypted</div>
        </div>
        <div className="flex-1" />
        <span className="font-mono text-[12px] text-text-3">{new Date(now).toLocaleTimeString("en-GB")}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Hero: network status */}
        <div className="relative overflow-hidden rounded-[28px] p-7 text-white" style={{ background: "#3b78f0" }}>
          <div className="absolute -right-16 -top-16 h-[220px] w-[220px] rounded-full border border-white/25" />
          <div className="absolute -right-4 -top-24 h-[220px] w-[220px] rounded-full border border-white/15" />
          <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/90">Scam Weather</div>
          <div className="mt-1 text-[14px] text-white/70">Network status</div>
          <div className="mt-6 text-[52px] font-medium leading-none tracking-tight tabular-nums">{online}/{h.members.length}</div>
          <div className="mt-1 text-[14px] text-white/80">banks online {h.paused ? "· hub paused" : ""}</div>
          <div className="mt-8 flex text-[14px] text-white/85">
            <span>●●●● {h.chain_ok ? "audit verified" : "audit broken"}</span><div className="flex-1" /><span>{h.journal.length} entries</span>
          </div>
        </div>

        {/* Signals volume */}
        <Tile title="Signals" sub={`last ${WINDOW_MIN} minutes`}>
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[52px] font-medium leading-none tracking-tight tabular-nums">{a.windowTotal}</span>
            <Pill tone={trend >= 0 ? "pos" : "neg"}>{trend >= 0 ? "+" : ""}{trend}%</Pill>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Mini label="Warnings" value={a.perMinute.reduce((n, b) => n + b.up, 0)} color="#4d86e8" />
            <Mini label="Withdrawals" value={a.perMinute.reduce((n, b) => n + b.down, 0)} color="#f5c84b" />
          </div>
        </Tile>

        {/* Members */}
        <Tile title="Members" sub="banks in the pilot">
          <div className="mt-5 flex -space-x-2.5">
            {h.members.slice(0, 6).map((m, i) => (
              <span key={m.id} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#151517] text-[14px] font-semibold text-black"
                style={{ background: ["#9ad4a8", "#f5c84b", "#8fb3ff", "#f0a27a", "#c7b3ff", "#7fd6cf"][i % 6] }}>
                {m.name.replace("Bank ", "")}
              </span>
            ))}
            {h.members.length > 6 && <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#151517] bg-[#5fbf7b] text-[14px] font-semibold text-black">+{h.members.length - 6}</span>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Mini label="Delivery rate" value={`${a.deliveryRate.toFixed(1)}%`} color="#5fbf7b" />
            <Mini label="Latency p50" value={`${a.p50} ms`} color="#8fb3ff" />
          </div>
        </Tile>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Tile title="Delivery by bank" sub="confirmed / received">
          <HatchBars rows={delivery} />
        </Tile>

        <div className="col-span-2 rounded-[28px] p-7 text-white" style={{ background: "#e8573a" }}>
          <div className="flex items-start">
            <div>
              <div className="text-[17px] font-medium">Signal traffic</div>
              <div className="text-[13px] text-white/75">per minute, all banks</div>
            </div>
            <div className="flex-1" />
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"><ArrowUpRight size={18} /></span>
          </div>
          <SmoothLine buckets={a.perMinute} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Latency p95" value={`${a.p95} ms`} pill={a.p95 < 3000 ? ["within SLA", "pos"] : ["above SLA", "neg"]} />
        <Stat label="Confirmations" value={`${a.acked}`} pill={[`of ${a.expected}`, "muted"]} />
        <Stat label="Delivery rate" value={`${a.deliveryRate.toFixed(1)}%`} pill={a.deliveryRate > 95 ? ["healthy", "pos"] : ["degraded", "neg"]} />
        <Stat label="Hub" value={h.paused ? "Paused" : "Online"} pill={h.paused ? ["check", "neg"] : ["operational", "pos"]} />
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <Card title="Member health" icon={<Server size={14} />} pad={false}>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text-3">
              <Th>Bank</Th><Th>Status</Th><Th>Last sync</Th><Th right>Sent</Th><Th right>Received</Th><Th right>Avg latency</Th>
            </tr></thead>
            <tbody>
              {h.members.map((m) => {
                const st = a.member[m.id];
                const on = isOnline(h.last_seen?.[m.id], now);
                return (
                  <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 font-medium">{m.name}</td>
                    <td className="px-5 py-2.5"><Pill tone={on ? "pos" : "neg"}>{on ? "online" : "stale"}</Pill></td>
                    <td className="px-5 py-2.5 font-mono text-[11.5px] text-text-3">{ago(h.last_seen?.[m.id], now)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{st?.sent ?? 0}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{st?.received ?? 0}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{st?.acked ? `${Math.round(st.latency / st.acked)} ms` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="Signals by issuing bank" icon={<Radio size={14} />}>
          <Donut slices={a.byIssuer} names={a.names} />
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Card title="Live message stream" icon={<Activity size={14} />} pad={false}
          right={<span className="flex items-center gap-1 text-[11px] text-text-3"><Lock size={11} /> click a row for routing details</span>}>
          <div className="max-h-[420px] overflow-auto">
            {[...h.stored].reverse().slice(0, 25).map((s) => <StreamRow key={`${s.envelope.signal_id}-${s.envelope.revision}`} s={s} state={state} names={a.names} />)}
          </div>
        </Card>
        <Card title="Audit log" icon={<Link2 size={14} />} pad={false} right={<Pill tone={h.chain_ok ? "pos" : "neg"}>{h.chain_ok ? "chain verified" : "chain broken"}</Pill>}>
          <div className="max-h-[420px] overflow-auto font-mono text-[11px]">
            {[...h.journal].reverse().slice(0, 60).map((j) => (
              <div key={j.seq} className="flex items-center gap-2 border-t border-white/5 px-5 py-1.5">
                <span className="w-[42px] text-text-3">#{j.seq}</span>
                <span className="w-[58px] text-text-3">{clock(j.at)}</span>
                <span className="w-[66px]" style={{ color: j.type === "ack" ? "#5fbf7b" : j.type === "rejected" ? "#e8573a" : j.type === "queued" ? "var(--text-3)" : "#8fb3ff" }}>{j.type}</span>
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

function Tile({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rounded-[28px] bg-[#151517] p-7">
      <div className="flex items-start">
        <div>
          <div className="text-[17px] font-medium">{title}</div>
          {sub && <div className="text-[13px] text-text-3">{sub}</div>}
        </div>
        <div className="flex-1" />
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f1f22] shadow-[0_6px_16px_rgba(0,0,0,0.5)]"><ArrowUpRight size={17} className="text-text-2" /></span>
      </div>
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "pos" | "neg" | "muted"; children: ReactNode }) {
  const bg = tone === "pos" ? "#5fbf7b" : tone === "neg" ? "#e8573a" : "#2a2a2e";
  return <span className="inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-medium tabular-nums text-white" style={{ background: bg }}>{children}</span>;
}

function Mini({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div className="rounded-2xl bg-[#1c1c1f] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[12px] text-text-3"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
      <div className="mt-1 text-[20px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Stat({ label, value, pill }: { label: string; value: string; pill: [string, "pos" | "neg" | "muted"] }) {
  return (
    <div className="flex items-center rounded-[24px] bg-[#151517] px-6 py-5">
      <div>
        <div className="text-[13px] text-text-3">{label}</div>
        <div className="mt-1 text-[26px] font-medium tracking-tight tabular-nums">{value}</div>
      </div>
      <div className="flex-1" />
      <Pill tone={pill[1]}>{pill[0]}</Pill>
    </div>
  );
}

function HatchBars({ rows }: { rows: { label: string; pct: number }[] }) {
  const colors = ["#5fbf7b", "#f5c84b", "#4d86e8"];
  return (
    <div className="mt-5 flex h-[210px] gap-2">
      {rows.map((r, i) => (
        <div key={r.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="relative w-full flex-1 overflow-hidden rounded-xl"
            style={{ backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 9px)", background: undefined }}>
            <div className="absolute inset-x-0 bottom-0 rounded-xl transition-all" style={{ height: `${r.pct}%`, background: colors[i % 3] }}>
              <div className="px-1.5 pt-1.5 text-[11px] font-semibold text-black/75">{r.pct}%</div>
            </div>
          </div>
          <span className="text-[12px] text-text-3">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function SmoothLine({ buckets }: { buckets: { t: number; up: number; down: number }[] }) {
  const W = 760, H = 230, top = 40, bottom = 30;
  const vals = buckets.map((b) => b.up + b.down);
  const max = Math.max(4, ...vals);
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W;
  const y = (v: number) => top + (1 - v / max) * (H - top - bottom);
  let d = `M ${x(0)} ${y(vals[0] ?? 0)}`;
  for (let i = 1; i < vals.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    d += ` C ${cx} ${y(vals[i - 1])}, ${cx} ${y(vals[i])}, ${x(i)} ${y(vals[i])}`;
  }
  const peak = vals.reduce((bi, v, i) => (v > vals[bi] ? i : bi), 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-[230px] w-full overflow-visible">
      {vals.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={top} y2={H - bottom} stroke="rgba(255,255,255,0.12)" />)}
      <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="rgba(255,255,255,0.35)" />
      <rect x={x(peak) - 14} y={y(vals[peak])} width={28} height={H - bottom - y(vals[peak])} rx={14} fill="rgba(255,255,255,0.35)" />
      <path d={d} fill="none" stroke="white" strokeWidth={2.5} />
      <circle cx={x(peak)} cy={y(vals[peak])} r={4} fill="white" />
      <g transform={`translate(${Math.min(W - 30, Math.max(30, x(peak)))}, ${y(vals[peak]) - 26})`}>
        <rect x={-28} y={-15} width={56} height={30} rx={15} fill="white" />
        <text textAnchor="middle" y={5} fontSize="14" fontWeight="600" fill="#1a1a1a">{vals[peak]}</text>
      </g>
      {buckets.map((b, i) => i % 2 === 0 && (
        <text key={b.t} x={x(i)} y={H - 8} fontSize="12" textAnchor="middle" fill="rgba(255,255,255,0.85)">
          {new Date(b.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </text>
      ))}
    </svg>
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
  // Delivery is measured over the signals still in the window, so both sides match.
  const inWindow = new Set(h.stored.map((x) => `${x.envelope.signal_id}#${x.envelope.revision}`));
  let expected = 0, acked = 0;
  for (const x of h.stored) {
    for (const mem of h.members) if (mem.id !== x.envelope.issuer) { expected++; m(mem.id).received = 0; }
  }
  for (const x of h.stored) for (const mem of h.members) if (mem.id !== x.envelope.issuer) m(mem.id).received++;
  for (const st of Object.values(member)) { st.acked = 0; st.latency = 0; st.maxLatency = 0; }
  for (const ack of h.acks) {
    if (!inWindow.has(`${ack.signal_id}#${ack.revision}`)) continue;
    const st = m(ack.member);
    st.acked++; st.latency += ack.latency_ms; st.maxLatency = Math.max(st.maxLatency, ack.latency_ms);
    acked++;
  }
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
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-[#151517]">
      <header className="flex items-center gap-2 px-6 pb-3 pt-5">
        <span className="text-text-3">{icon}</span>
        <h2 className="text-[16px] font-medium">{title}</h2>
        <div className="flex-1" />{right}
      </header>
      <div className={pad ? "px-6 pb-6" : "pb-2"}>{children}</div>
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
