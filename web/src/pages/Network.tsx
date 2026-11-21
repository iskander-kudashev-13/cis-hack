import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Lock, Radio } from "lucide-react";
import type { JournalEntry, State } from "../api/types";

type Role = "bank" | "operator";

const ME = "bank-b";
const SHORT: Record<string, string> = {
  "Emirates NBD": "ENBD", Mashreq: "MSQ", FAB: "FAB", ADCB: "ADCB", "Dubai Islamic Bank": "DIB", ADIB: "ADIB", RAKBANK: "RAK", CBD: "CBD",
};
const W = 900, H = 560, HX = 450, HY = 280;
const SEND_MS = 700, DELIVER_MS = 650, ACK_MS = 500, WINDOW_MS = 4000;

type Packet = { from: string; to: string; t0: number; dur: number; color: string; size: number; sig?: string };

/**
 * Live graph of the network. The operator sees every route but only envelopes;
 * a bank sees its own traffic and decrypted content, nothing between other banks.
 */
export function NetworkGraph({ state, role }: { state: State; role: Role }) {
  const members = state.hub.members;
  const names = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const nodes = useMemo(() => {
    const ids = [...members.map((m) => m.id).sort(), "bank-c"];
    return ids.map((id, i) => {
      const a = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
      return { id, name: id === "bank-c" ? "CBD" : names[id] ?? id, x: HX + Math.cos(a) * 330, y: HY + Math.sin(a) * 210, pending: id === "bank-c" };
    });
  }, [members, names]);
  const pos = useMemo(() => Object.fromEntries([...nodes.map((n) => [n.id, n] as const), ["hub", { x: HX, y: HY }] as const]), [nodes]);

  // server time vs browser time
  const skew = useMemo(() => Date.now() - Date.parse(state.now), [state.now]);
  const envs = useMemo(() => {
    const m: Record<string, { kind: string; event: string; issuer: string }> = {};
    for (const s of state.hub.stored) m[`${s.envelope.signal_id}:${s.envelope.revision}`] = { kind: s.envelope.kind, event: s.envelope.event, issuer: s.envelope.issuer };
    return m;
  }, [state.hub.stored]);
  const cache = useMemo(() => Object.fromEntries(state.bank_b.cache.map((c) => [c.signal_id, c])), [state.bank_b.cache]);
  const kinds = useMemo(() => Object.fromEntries((state.bank_b.ops?.kinds ?? []).map((k) => [k.kind, k])), [state.bank_b.ops?.kinds]);

  const [sel, setSel] = useState<string | null>(null);
  const journalRef = useRef<JournalEntry[]>(state.hub.journal);
  journalRef.current = state.hub.journal;

  // animation clock
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => { setNow(Date.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = (e: JournalEntry) => {
    if (role === "operator") return true;
    if (e.type === "ack") return e.actor === ME;
    if (e.type === "published" || e.type === "revised") return e.actor === ME;
    return false;
  };

  const packets: Packet[] = [];
  const serverNow = now - skew;
  for (const e of journalRef.current) {
    const at = Date.parse(e.at);
    if (serverNow - at > WINDOW_MS || at > serverNow + 50) continue;
    if (!visible(e)) continue;
    const env = envs[`${e.signal_id}:${e.revision}`];
    const retract = env?.event === "RETRACT";
    const color = retract ? "#f5c84b" : "#4d86e8";
    if (e.type === "published" || e.type === "revised") {
      packets.push({ from: e.actor, to: "hub", t0: at, dur: SEND_MS, color, size: 7, sig: e.signal_id });
    } else if (e.type === "ack") {
      packets.push({ from: "hub", to: e.actor, t0: at - DELIVER_MS, dur: DELIVER_MS, color, size: 6, sig: e.signal_id });
      packets.push({ from: e.actor, to: "hub", t0: at, dur: ACK_MS, color: "#5fbf7b", size: 4, sig: e.signal_id });
    }
  }
  const liveEdges = new Set<string>();
  for (const p of packets) {
    const k = serverNow - p.t0;
    if (k >= 0 && k <= p.dur) liveEdges.add(p.from === "hub" ? p.to : p.from);
  }

  // recent messages for the side list
  const recent = useMemo(() => {
    const out: { sig: string; rev: number; at: string; issuer: string; acks: { id: string; ms?: number }[] }[] = [];
    const j = state.hub.journal;
    for (let i = j.length - 1; i >= 0 && out.length < 14; i--) {
      const e = j[i];
      if (e.type !== "published" && e.type !== "revised") continue;
      if (role === "bank" && e.actor !== ME && !state.hub.acks.some((a) => a.member === ME && a.signal_id === e.signal_id && a.revision === e.revision)) continue;
      const acks = state.hub.acks.filter((a) => a.signal_id === e.signal_id && a.revision === e.revision).map((a) => ({ id: a.member, ms: a.latency_ms }));
      out.push({ sig: e.signal_id!, rev: e.revision ?? 1, at: e.at, issuer: e.actor, acks });
    }
    return out;
  }, [state.hub.journal, state.hub.acks, role]);
  const selected = recent.find((r) => r.sig === sel) ?? null;

  const lastSeen = state.hub.last_seen ?? {};
  const online = (id: string) => { const t = lastSeen[id]; return !!t && Date.parse(state.now) - Date.parse(t) < 10000; };
  const sent = (id: string) => state.hub.journal.filter((e) => (e.type === "published" || e.type === "revised") && e.actor === id).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium tracking-tight">Network graph</h1>
        <div className="text-[12.5px] text-text-3">
          {role === "operator"
            ? "Every bank connects only to the hub. You see who sends what to whom and when it is confirmed, never the content."
            : `You are ${names[ME]}. You see your own connection, warnings delivered to you and your confirmations. Traffic between other banks is not visible to you.`}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[28px] bg-[#151517] p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
            <defs>
              <radialGradient id="hubGlow"><stop offset="0%" stopColor="#3b78f0" stopOpacity="0.45" /><stop offset="100%" stopColor="#3b78f0" stopOpacity="0" /></radialGradient>
            </defs>
            <circle cx={HX} cy={HY} r={120} fill="url(#hubGlow)" />
            {nodes.map((n) => {
              const mine = role === "bank" && n.id === ME;
              const dim = role === "bank" && n.id !== ME;
              const hot = liveEdges.has(n.id) || (selected && (selected.issuer === n.id || selected.acks.some((a) => a.id === n.id)));
              return (
                <line key={`e-${n.id}`} x1={HX} y1={HY} x2={n.x} y2={n.y}
                  stroke={hot ? "#4d86e8" : mine ? "#3b78f0" : "#2c2c31"} strokeWidth={hot || mine ? 2.2 : 1.4}
                  strokeDasharray={n.pending ? "5 6" : undefined} opacity={dim && !hot ? 0.35 : 1} />
              );
            })}
            {packets.map((p, i) => {
              const k = (serverNow - p.t0) / p.dur;
              if (k < 0 || k > 1) return null;
              const a = pos[p.from], b = pos[p.to];
              if (!a || !b) return null;
              const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
              const faded = sel && p.sig !== sel;
              return <circle key={i} cx={x} cy={y} r={p.size} fill={p.color} opacity={faded ? 0.15 : 1} style={{ filter: `drop-shadow(0 0 6px ${p.color})` }} />;
            })}
            <g>
              <circle cx={HX} cy={HY} r={46} fill="#1f1f23" stroke="#3b78f0" strokeWidth={2} />
              <text x={HX} y={HY - 2} textAnchor="middle" fontSize="15" fontWeight="600" fill="white">Hub</text>
              <text x={HX} y={HY + 16} textAnchor="middle" fontSize="11" fill="#8e8e96">blind relay</text>
            </g>
            {nodes.map((n) => {
              const mine = role === "bank" && n.id === ME;
              const on = !n.pending && online(n.id);
              return (
                <g key={n.id} opacity={role === "bank" && !mine && !n.pending ? 0.75 : 1}>
                  <circle cx={n.x} cy={n.y} r={mine ? 34 : 28} fill={mine ? "#3b78f0" : "#1f1f23"} stroke={n.pending ? "#6b6b73" : on ? "#5fbf7b" : "#e8573a"}
                    strokeWidth={2} strokeDasharray={n.pending ? "4 4" : undefined} />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="white">{SHORT[n.name] ?? n.name.slice(0, 4)}</text>
                  <text x={n.x} y={n.y + (n.y > HY ? (mine ? 52 : 46) : (mine ? -54 : -48))} textAnchor="middle" fontSize="12" fill="#c9c9cf">{mine ? `${n.name} (you)` : n.name}</text>
                  <text x={n.x} y={n.y + (n.y > HY ? (mine ? 66 : 60) : (mine ? -40 : -34))} textAnchor="middle" fontSize="10.5" fill="#7c7c85">
                    {n.pending ? "onboarding via Devin" : role === "operator" ? `${on ? "online" : "offline"} · ${sent(n.id)} sent` : mine ? "connected · outbound only" : "member"}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 pb-1 text-[11.5px] text-text-3">
            <Legend color="#4d86e8" label="warning (encrypted)" />
            <Legend color="#f5c84b" label="withdrawal" />
            <Legend color="#5fbf7b" label="confirmation (ack)" />
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t border-dashed border-[#6b6b73]" /> joining</span>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#151517]">
          <header className="flex items-center gap-2 px-6 pb-2 pt-5">
            <Radio size={15} className="text-text-3" />
            <h2 className="text-[16px] font-medium">{role === "operator" ? "Messages through the hub" : "Your traffic"}</h2>
          </header>
          <div className="px-6 pb-2 text-[11.5px] text-text-3">Click a message to follow its route on the graph.</div>
          <div className="max-h-[520px] overflow-auto pb-2">
            {recent.length === 0 && <div className="px-6 py-4 text-[13px] text-text-3">No messages yet.</div>}
            {recent.map((r) => {
              const env = envs[`${r.sig}:${r.rev}`];
              const c = cache[r.sig];
              const isSel = sel === r.sig;
              const mineAck = r.acks.find((a) => a.id === ME);
              return (
                <button key={`${r.sig}:${r.rev}`} onClick={() => setSel(isSel ? null : r.sig)}
                  className={`block w-full border-t border-white/5 px-6 py-2.5 text-left hover:bg-white/[0.03] ${isSel ? "bg-white/[0.05]" : ""}`}>
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: env?.event === "RETRACT" ? "#f5c84b" : "#4d86e8" }} />
                    <span className="font-medium">{names[r.issuer] ?? r.issuer}</span>
                    <span className="text-text-3">→ hub → {role === "operator" ? `${r.acks.length}/${members.length - 1} banks` : r.issuer === ME ? `${r.acks.length} banks` : "you"}</span>
                    <div className="flex-1" />
                    <span className="font-mono text-[11px] text-text-3">{new Date(r.at).toLocaleTimeString("en-GB")}</span>
                  </div>
                  <div className="mt-0.5 pl-4 text-[11.5px] text-text-3">
                    {role === "operator"
                      ? <span className="inline-flex items-center gap-1"><Lock size={10} /> {env?.kind ?? "signal"} · v{r.rev} · content encrypted</span>
                      : c
                        ? <>{[kinds[c.kind]?.label ?? c.kind, c.state !== "active" ? "withdrawn" : c.reason_code.replace(/_/g, " "), c.amount_band, mineAck?.ms != null ? `you confirmed in ${mineAck.ms} ms` : ""].filter(Boolean).join(" · ")}</>
                        : <>{env?.kind ?? "signal"} · v{r.rev}</>}
                  </div>
                  {isSel && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 pl-4 text-[11.5px]">
                      {(role === "operator" ? r.acks : r.acks.filter((a) => a.id === ME || r.issuer === ME)).map((a) => (
                        <div key={a.id} className="flex justify-between gap-2"><span className="text-text-2">{names[a.id] ?? a.id}</span><span className="font-mono text-[#5fbf7b]">{a.ms} ms</span></div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-auto border-t border-white/5 px-6 py-4 text-[12px] text-text-3">
            <div className="flex items-start gap-2">
              <Building2 size={14} className="mt-0.5 flex-none" />
              <span>
                {role === "operator"
                  ? "Banks never connect to each other. Each node opens an outbound connection to the hub, fetches its own queue, decrypts locally and confirms."
                  : "Your node opens an outbound connection to the hub, fetches your queue, verifies the sender's signature, decrypts inside the bank and confirms."}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>;
}

/** Network graph page with a switch between the bank's and the operator's view. */
export function NetworkPage({ state, defaultRole }: { state: State; defaultRole: Role }) {
  const [role, setRole] = useState<Role>(defaultRole);
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-full bg-[#151517] p-1 text-[12.5px]">
        {(["bank", "operator"] as Role[]).map((r) => (
          <button key={r} onClick={() => setRole(r)}
            className={`rounded-full px-4 py-1.5 font-medium ${role === r ? "bg-white text-black" : "text-text-2 hover:text-text"}`}>
            {r === "bank" ? "Bank view · Mashreq" : "Operator view · hub"}
          </button>
        ))}
      </div>
      <NetworkGraph state={state} role={role} />
    </div>
  );
}
