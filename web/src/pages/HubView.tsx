import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Lock, MessagesSquare, Network, ShieldCheck } from "lucide-react";
import type { State, StoredSignal, Tone } from "../api/types";
import { Badge, clock, Empty, money, Panel, short } from "../components/ui";

/** One row in the feed: a message between participants, or a local payment check. */
type Row = {
  key: string;
  at: string;
  banks: string[]; // participants other than the Hub, for the bank filter
  from: string;
  to: string;
  kind: "message" | "payment";
  title: string;
  status: { tone: Tone | "muted"; text: string };
  details?: ReactNode;
};

// Filled from hub.members on every render, so any number of banks works.
let NAMES: Record<string, string> = { hub: "Hub" };
const name = (id: string) => NAMES[id] ?? id;

function Party({ id }: { id: string }) {
  return <Badge tone={id === "hub" ? "muted" : "info"} className="min-w-[62px] justify-center">{name(id)}</Badge>;
}

function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3 py-0.5 text-[12px]">
      <span className="w-[150px] flex-none text-text-3">{k}</span>
      <span className={`min-w-0 break-all ${mono ? "font-mono text-[11.5px]" : ""}`}>{v}</span>
    </div>
  );
}

function SignalDetails({ s }: { s: StoredSignal }) {
  const e = s.envelope;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">Hub can read (envelope)</div>
        <KV k="Signal" v={`${e.signal_id} · rev ${e.revision}`} mono />
        <KV k="Event" v={e.event === "RETRACT" ? "RETRACT (withdrawn)" : "UPSERT (warning)"} />
        <KV k="Kind" v={e.kind} />
        <KV k="From → audience" v={`${name(e.issuer)} → ${e.audience}`} />
        <KV k="Expires" v={clock(e.expires_at)} />
        <KV k="Signature" v={`${short(s.signature, 20)}… (Ed25519, checked by Hub)`} mono />
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warn">
          <Lock size={11} /> Hub cannot read (payload)
        </div>
        {Object.entries(s.ciphertexts).map(([to, c]) => (
          <KV key={to} k={`for ${name(to)}`} v={`${short(c.ct, 44)}…`} mono />
        ))}
        <div className="mt-2 text-[11.5px] text-text-3">
          The account indicator, reason and amount band are encrypted for each recipient bank. Each bank opens only its own copy with its own key.
        </div>
      </div>
    </div>
  );
}

function buildRows(state: State): Row[] {
  const h = state.hub;
  const rows: Row[] = [];
  const stored = new Map(h.stored.map((s) => [`${s.envelope.signal_id}#${s.envelope.revision}`, s]));

  for (const j of h.journal) {
    const sig = j.signal_id ? `${j.signal_id} rev ${j.revision}` : "";
    const s = stored.get(`${j.signal_id}#${j.revision}`);
    const retract = s?.envelope.event === "RETRACT";
    if (j.type === "published" || j.type === "revised") {
      rows.push({
        key: `j${j.seq}`, at: j.at, from: j.actor, to: "hub", kind: "message", banks: [j.actor],
        title: retract ? `Withdraws the warning (${sig})` : `Sends a mule-account warning (${sig})`,
        status: { tone: "good", text: "accepted · signature OK" },
        details: s && <SignalDetails s={s} />,
      });
    } else if (j.type === "queued") {
      const to = (j.detail ?? "").replace(/^for /, "");
      rows.push({
        key: `j${j.seq}`, at: j.at, from: "hub", to, kind: "message", banks: [to, s?.envelope.issuer ?? ""],
        title: `Forwards the encrypted ${retract ? "withdrawal" : "warning"} (${sig})`,
        status: { tone: "muted", text: "queued" },
        details: s && <SignalDetails s={s} />,
      });
    } else if (j.type === "ack") {
      const [st, ...rest] = (j.detail ?? "").split(" ");
      rows.push({
        key: `j${j.seq}`, at: j.at, from: j.actor, to: "hub", kind: "message", banks: [j.actor],
        title: `Confirms receipt (${sig})`,
        status: { tone: st === "applied" ? "good" : "warn", text: `${st} ${rest.join(" ")}`.trim() },
      });
    } else if (j.type === "rejected") {
      rows.push({
        key: `j${j.seq}`, at: j.at, from: j.actor, to: "hub", kind: "message", banks: [j.actor],
        title: `Message rejected (${sig})`,
        status: { tone: "bad", text: "rejected" },
        details: <KV k="Reason" v={j.detail} />,
      });
    }
  }

  const pays = new Map(state.bank_b.payments.map((p) => [p.payment_id, p]));
  for (const d of state.bank_b.decisions) {
    const p = pays.get(d.payment_id);
    const review = d.decision === "REVIEW_REQUIRED";
    rows.push({
      key: d.attempt_id, at: d.at, from: state.bank_b.id, to: state.bank_b.id, kind: "payment", banks: [state.bank_b.id],
      title: p ? `Checks transfer ${money(p.amount, p.currency)} to ${p.beneficiary_masked}` : `Checks transfer ${d.payment_id}`,
      status: { tone: review ? "bad" : "good", text: review ? "review required" : "approved" },
      details: (
        <>
          <KV k="Payment" v={p ? `${p.label} (${d.payment_id})` : d.payment_id} />
          <KV k="Decision" v={d.decision} />
          <KV k="Why" v={d.reason} />
          {d.signal_id && <KV k="Matched signal" v={`${d.signal_id} rev ${d.revision}`} mono />}
          <KV k="Where" v="Inside Bank B against its local cache. The payment itself never goes to the Hub." />
        </>
      ),
    });
  }

  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function FeedRow({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  const local = r.kind === "payment";
  return (
    <li className="border-b border-border last:border-0">
      <button onClick={() => r.details && setOpen(!open)}
        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${r.details ? "hover:bg-surface-2" : "cursor-default"}`}>
        <span className="w-[62px] flex-none font-mono text-[11.5px] text-text-3">{clock(r.at)}</span>
        <span className="flex w-[190px] flex-none items-center gap-1.5">
          <Party id={r.from} />
          {local ? <span className="text-[11px] text-text-3">local</span> : <><ArrowRight size={13} className="text-text-3" /><Party id={r.to} /></>}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{r.title}</span>
        <Badge tone={r.status.tone}>{r.status.text}</Badge>
        <span className="w-4 flex-none text-text-3">{r.details && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</span>
      </button>
      {open && r.details && <div className="border-t border-border bg-bg px-5 py-3">{r.details}</div>}
    </li>
  );
}

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "message", label: "Messages between banks" },
  { id: "payment", label: "Payment checks" },
] as const;

type Stats = { sent: number; received: number; confirmed: number; checks: number };

function memberStats(state: State): Record<string, Stats> {
  const st: Record<string, Stats> = {};
  const get = (id: string) => (st[id] ??= { sent: 0, received: 0, confirmed: 0, checks: 0 });
  for (const m of state.hub.members) get(m.id);
  for (const j of state.hub.journal) {
    if (j.type === "published" || j.type === "revised") get(j.actor).sent++;
    else if (j.type === "queued") get((j.detail ?? "").replace(/^for /, "")).received++;
    else if (j.type === "ack") get(j.actor).confirmed++;
  }
  get(state.bank_b.id).checks = state.bank_b.decisions.length;
  return st;
}

export function HubPage({ state }: { state: State }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [bank, setBank] = useState("all");
  const h = state.hub;
  NAMES = { hub: "Hub", ...Object.fromEntries(h.members.map((m) => [m.id, m.name])) };
  const rows = useMemo(() => buildRows(state), [state]);
  const shown = rows.filter((r) => (filter === "all" || r.kind === filter) && (bank === "all" || r.banks.includes(bank)));
  const stats = memberStats(state);

  return (
    <div className="flex flex-col gap-3">
      <Panel title={<>Network · {h.members.length} banks</>} icon={<Network size={15} />} bodyClass="p-4"
        right={<Badge tone={h.paused ? "warn" : h.chain_ok ? "good" : "bad"} dot>
          Hub {h.paused ? "paused" : "online"} · journal {h.chain_ok ? "intact" : "broken"}
        </Badge>}>
        <div className="mb-3 text-[12px] text-text-3">
          Every bank talks only to the Hub. The Hub forwards encrypted warnings to the banks in the audience and collects their confirmations. Click a bank to see only its messages.
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {h.members.map((m) => {
            const s = stats[m.id];
            const on = bank === m.id;
            return (
              <button key={m.id} onClick={() => setBank(on ? "all" : m.id)}
                className="rounded-lg border px-3 py-2.5 text-left transition hover:border-accent"
                style={{ borderColor: on ? "var(--accent)" : "var(--border-2)", background: on ? "var(--accent-soft)" : "var(--surface-2)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold">{m.name}</span>
                  <span className="font-mono text-[11px] text-text-3">{m.id}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px] text-text-2">
                  <span>sent <b className="text-text">{s.sent}</b></span>
                  <span>received <b className="text-text">{s.received}</b></span>
                  <span>confirmed <b className="text-text">{s.confirmed}</b></span>
                  <span>checks <b className="text-text">{s.checks}</b></span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={bank === "all" ? "What happened" : <>What happened · {name(bank)}</>} icon={<MessagesSquare size={15} />}
        right={
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${filter === f.id ? "bg-accent-soft text-accent" : "text-text-3 hover:text-text"}`}>
                {f.label}
              </button>
            ))}
            <select value={bank} onChange={(e) => setBank(e.target.value)}
              className="ml-1 h-7 rounded-md border border-border-2 bg-surface-2 px-1.5 text-[11.5px] text-text-2">
              <option value="all">All banks</option>
              {h.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        }>
        {shown.length === 0
          ? <div className="p-3.5"><Empty>Nothing yet. On the Live demo, send a warning or check a transfer.</Empty></div>
          : <ul>{shown.map((r) => <FeedRow key={r.key} r={r} />)}</ul>}
      </Panel>

      <div className="flex items-start gap-2 px-1 text-[12px] text-text-3">
        <ShieldCheck size={14} className="mt-0.5 flex-none" />
        <span>Click a message to see what the Hub stores. It sees who sent what kind of message and when. It cannot see the account, amount or reason: those are encrypted for each receiving bank.</span>
      </div>
    </div>
  );
}
