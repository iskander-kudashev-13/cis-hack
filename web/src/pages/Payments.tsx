import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Loader2, Search, ShieldAlert, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { api } from "../api/client";
import type { KindRow, Priority, State, Txn, TxnStatus } from "../api/types";
import { clock } from "../components/ui";

type Run = (fn: () => Promise<State>) => Promise<void>;

const STATUS: Record<TxnStatus, { label: string; bg: string; fg: string }> = {
  approved: { label: "Approved", bg: "rgba(95,191,123,0.16)", fg: "#5fbf7b" },
  held: { label: "Held · warning match", bg: "rgba(232,87,58,0.18)", fg: "#ff7a5c" },
  unverified: { label: "Held · not covered", bg: "rgba(245,200,75,0.16)", fg: "#f5c84b" },
  released: { label: "Released by analyst", bg: "rgba(59,120,240,0.18)", fg: "#7aa5ff" },
  declined: { label: "Declined by analyst", bg: "#2a2a2e", fg: "#c9c9cf" },
};
const PRIORITY: Record<Priority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#ff5a4e" },
  high: { label: "High", color: "#ff9a3c" },
  medium: { label: "Medium", color: "#f5c84b" },
  low: { label: "Low", color: "#5fbf7b" },
};
const aed = (n: number) => `AED ${n.toLocaleString("en-US")}`;
const payeeMasked = (t: Txn) =>
  t.payee_type === "mobile" ? `${t.payee_id.slice(0, 6)} ••• ${t.payee_id.slice(-4)}` : `${t.payee_id.slice(0, 4)} •••• ${t.payee_id.slice(-4)}`;

/**
 * Mashreq's fraud desk: every outgoing payment, a review queue for held ones
 * with release/decline, full search, and the log of alerts from other banks
 * that Mashreq cannot check yet, each with an "Implement with Devin" action.
 */
export function PaymentsPage({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const ops = state.bank_b.ops;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Txn[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.searchTxns(q.trim()).then((r) => setFound(r.txns)).catch(() => setFound([])).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, ops?.total]);

  const kinds = useMemo(() => Object.fromEntries((ops?.kinds ?? []).map((k) => [k.kind, k])), [ops?.kinds]);
  if (!ops) return <div className="text-text-3">Payments feed is not available in this mode.</div>;

  const c = ops.counts;
  const pending = ops.pending;
  const uncovered = ops.kinds.filter((k) => !k.covered);
  const decide = (id: string, action: "release" | "decline") => run(() => api.decideTxn(id, action));
  const rows = found ?? ops.txns;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[24px] font-medium tracking-tight">Payments & alerts</div>
        <div className="text-[12.5px] text-text-3">Mashreq fraud desk · every outgoing payment is checked against alerts from other banks before it leaves · demo data</div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <Stat label="Payments checked" value={ops.total} sub="since the last reset" />
        <Stat label="Approved automatically" value={(c.approved ?? 0) + (c.released ?? 0)} sub={`${c.released ?? 0} released by analyst`} dot="#5fbf7b" />
        <Stat label="Waiting for analyst" value={pending.length} sub={`${c.held ?? 0} warning match · ${c.unverified ?? 0} not covered`} dot="#e8573a" hot={pending.length > 0} />
        <Stat label="Alert types not covered" value={uncovered.filter((k) => k.active_uncovered > 0).length} sub={`${ops.gaps.length} active alerts we cannot check`} dot="#f5c84b" />
      </div>

      <label className="flex items-center gap-3 rounded-full bg-[#151517] px-5 py-3.5">
        <Search size={17} className="text-text-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by transaction ID, IBAN, mobile number, payee, customer or signal ID"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-text-3" />
        {searching && <Loader2 size={15} className="animate-spin text-text-3" />}
        {q && <button onClick={() => setQ("")} className="text-text-3 hover:text-text"><X size={15} /></button>}
      </label>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {!found && (
            <Card title="Review queue" right={<span className="text-[12px] text-text-3">{pending.length} waiting</span>}>
              {pending.length === 0 && <div className="px-6 pb-6 text-[13px] text-text-3">Nothing to review. Held payments appear here.</div>}
              <div className="flex flex-col gap-2.5 px-4 pb-4">
                {pending.slice(0, 8).map((t) => (
                  <div key={t.id} className="rounded-2xl bg-[#1c1c1f] p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: STATUS[t.status].bg, color: STATUS[t.status].fg }}>
                        {t.status === "held" ? <ShieldAlert size={16} /> : <ShieldQuestion size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityBadge t={t} />
                          <span className="text-[16px] font-medium tabular-nums">{aed(t.amount)}</span>
                          <StatusPill s={t.status} />
                          <span className="font-mono text-[11.5px] text-text-3">{t.id} · {clock(t.at)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[12.5px] text-text-2">{t.customer} → {t.payee} · {payeeMasked(t)} · {t.channel}</div>
                        <div className="mt-1 text-[12.5px]" style={{ color: STATUS[t.status].fg }}>{t.reason}</div>
                        <RiskPanel t={t} k={kinds[t.kind ?? t.gap_kind ?? ""]} />
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button disabled={busy} onClick={() => decide(t.id, "release")}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-black hover:bg-white/90 disabled:opacity-50">
                            <Check size={13} /> Approve
                          </button>
                          <button disabled={busy} onClick={() => decide(t.id, "decline")}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#e8573a] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-50">
                            <X size={13} /> Decline
                          </button>
                          {t.gap_kind && kinds[t.gap_kind] && <DevinButton k={kinds[t.gap_kind]} compact />}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {pending.length > 8 && <div className="px-2 text-[12px] text-text-3">+{pending.length - 8} more in the table below (filter by searching)</div>}
              </div>
            </Card>
          )}

          <Card title={found ? `Search results · ${found.length}` : "All payments"} right={<span className="text-[12px] text-text-3">{found ? `for “${q}”` : "newest first · click a row"}</span>}>
            <div className="txn-list-head grid grid-cols-[18px_92px_minmax(0,1.2fr)_minmax(0,1fr)_56px_100px_76px_150px] gap-3 px-6 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-3">
              <span /><span>ID</span><span>Customer → payee</span><span>Payee account</span><span>Rail</span><span className="text-right">Amount</span><span>Risk</span><span>Status</span>
            </div>
            <div className="max-h-[560px] overflow-auto">
              {rows.length === 0 && <div className="px-6 py-5 text-[13px] text-text-3">No payments match.</div>}
              {rows.map((t) => <TxnRow key={t.id} t={t} busy={busy} decide={decide} kinds={kinds} />)}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Signal coverage" right={<span className="text-[12px] text-text-3">what Mashreq can check</span>}>
            <div className="flex flex-col gap-2 px-4 pb-4">
              {ops.kinds.map((k) => (
                <div key={k.kind} className="rounded-2xl bg-[#1c1c1f] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5" style={{ color: k.covered ? "#5fbf7b" : "#f5c84b" }}>{k.covered ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{k.label}</div>
                      <div className="text-[12px] text-text-3">{k.fraud}</div>
                      <div className="mt-1 font-mono text-[11px] text-text-3">{k.kind} · {k.indicator}</div>
                      {k.covered ? (
                        <div className="mt-1.5 text-[12px] text-[#5fbf7b]">Covered: alerts are matched to payments</div>
                      ) : (
                        <>
                          <div className="mt-1.5 text-[12px] text-[#f5c84b]">
                            Not covered · {k.active_uncovered} active alerts{k.affected_txns ? ` · ${k.affected_txns} payments held` : ""}
                          </div>
                          <div className="mt-2.5"><DevinButton k={k} /></div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Uncovered alerts log" right={<span className="text-[12px] text-text-3">from other banks · {ops.gaps.length}</span>}>
            <div className="max-h-[420px] overflow-auto pb-2">
              {ops.gaps.length === 0 && <div className="px-6 pb-5 text-[13px] text-text-3">Every active alert is covered.</div>}
              {ops.gaps.map((g) => (
                <div key={g.signal_id} className="border-t border-white/5 px-6 py-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="h-2 w-2 flex-none rounded-full bg-[#f5c84b]" />
                    <span className="truncate font-medium">{g.label}</span>
                    <div className="flex-1" />
                    <span className="font-mono text-[11px] text-text-3">{clock(g.received_at)}</span>
                  </div>
                  <div className="truncate pl-4 text-[12px] text-text-3">
                    from {g.issuer} · {g.reason_code.replace(/_/g, " ")} · {g.indicator_type} unsupported · {g.signal_id}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TxnRow({ t, busy, decide, kinds }: { t: Txn; busy: boolean; decide: (id: string, a: "release" | "decline") => void; kinds: Record<string, KindRow> }) {
  const [open, setOpen] = useState(false);
  const pending = t.status === "held" || t.status === "unverified";
  return (
    <div className="border-t border-white/5">
      <button onClick={() => setOpen(!open)}
        className="txn-list-row grid w-full grid-cols-[18px_92px_minmax(0,1.2fr)_minmax(0,1fr)_56px_100px_76px_150px] items-center gap-3 px-6 py-2.5 text-left text-[12.5px] hover:bg-white/[0.03]">
        <span className="text-text-3">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
        <span className="font-mono text-[11.5px] text-text-2">{t.id}</span>
        <span className="truncate">{t.customer} <span className="text-text-3">→</span> {t.payee}</span>
        <span className="truncate font-mono text-[11.5px] text-text-2">{payeeMasked(t)}</span>
        <span className="text-text-3">{t.channel}</span>
        <span className="text-right tabular-nums">{aed(t.amount)}</span>
        <span className="flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-full" style={{ background: PRIORITY[t.priority].color }} /><span className="txn-risk-label">Risk</span>{t.score}</span>
        <span><StatusPill s={t.status} /></span>
      </button>
      {open && (
        <div className="mx-6 mb-3 rounded-2xl bg-[#1c1c1f] p-4 text-[12.5px]">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            <KV k="Time" v={new Date(t.at).toLocaleString("en-GB")} />
            <KV k="Rail" v={t.channel === "Aani" ? "Aani instant payment (mobile alias)" : "UAEFTS bank transfer"} />
            <KV k="Payee account" v={t.payee_id} mono />
            {t.device_id && <KV k="Payer device" v={`${t.device_id.slice(0, 8)}…${t.device_id.slice(-4)}`} mono />}
            <KV k="Amount" v={aed(t.amount)} />
            {t.signal_id && <KV k="Alert" v={`${t.signal_id} from ${t.issuer}`} mono />}
            {t.decided_by && <KV k="Decision" v={`${t.decided_by} · ${t.decided_at ? clock(t.decided_at) : ""}`} />}
          </div>
          <div className="mt-2" style={{ color: STATUS[t.status].fg }}>{t.reason}</div>
          <RiskPanel t={t} k={kinds[t.kind ?? t.gap_kind ?? ""]} />
          {pending && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => decide(t.id, "release")} className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-black disabled:opacity-50">Approve</button>
              <button disabled={busy} onClick={() => decide(t.id, "decline")} className="rounded-full bg-[#e8573a] px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">Decline</button>
              {t.gap_kind && kinds[t.gap_kind] && <DevinButton k={kinds[t.gap_kind]} compact />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ t }: { t: Txn }) {
  const p = PRIORITY[t.priority];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ background: `${p.color}26`, color: p.color }}>
      {p.label} · {t.score}
    </span>
  );
}

/** Why the payment got its score, what the fraud is and what to verify. */
function RiskPanel({ t, k }: { t: Txn; k?: KindRow }) {
  const [open, setOpen] = useState(t.status === "held" || t.status === "unverified");
  return (
    <div className="mt-3 rounded-xl bg-black/25 p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left text-[12px] font-medium text-text-2">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Risk assessment · score {t.score}/100 · {PRIORITY[t.priority].label} priority
        <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${t.score}%`, background: PRIORITY[t.priority].color }} />
        </div>
      </button>
      {open && (
        <div className="mt-2.5 grid grid-cols-2 gap-4 text-[12px]">
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Why this score</div>
            {(t.factors ?? []).map((f) => (
              <div key={f.label} className="flex gap-2 py-0.5">
                <span className="w-9 flex-none text-right font-mono tabular-nums" style={{ color: f.points > 0 ? "#ff9a7c" : "#5fbf7b" }}>{f.points > 0 ? `+${f.points}` : f.points}</span>
                <span className="text-text-2">{f.label}</span>
              </div>
            ))}
          </div>
          {k && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">What this fraud is</div>
              <div className="text-text-2">{k.explain}</div>
              <div className="mb-1 mt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Before you decide</div>
              <ul className="list-disc pl-4 text-text-2">{k.checks.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Starts (once per signal kind) a Devin session that adds coverage for it. */
function DevinButton({ k, compact }: { k: KindRow; compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const task = k.devin && k.devin.kind ? k.devin : null;
  async function start() {
    setLoading(true); setErr(null);
    try { const r = await api.devin("bank-b", undefined, k.kind); setPrompt(r.prompt); } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }
  if (task) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1.5 text-[#9bbcff]"><Bot size={13} /> Devin is implementing {compact ? "this alert type" : "coverage"}</span>
        {task.session_url
          ? <a href={task.session_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">open session <ExternalLink size={11} /></a>
          : <span className="text-text-3">task prepared (no API key)</span>}
        {!compact && <span className="text-text-3">→ draft PR for Mashreq engineers</span>}
        {prompt && !compact && <details className="w-full"><summary className="cursor-pointer text-text-3">Task sent to Devin</summary><pre className="mt-1 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-2.5 font-mono text-[10.5px] text-text-2">{prompt}</pre></details>}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={start} disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg,#3b78f0,#8b5cf6)" }}>
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />} Fix with Devin
      </button>
      {err && <span className="text-[11.5px] text-neg">{err}</span>}
    </span>
  );
}

function Stat({ label, value, sub, dot, hot }: { label: string; value: ReactNode; sub: string; dot?: string; hot?: boolean }) {
  return (
    <div className="rounded-[28px] p-6" style={{ background: hot ? "#e8573a" : "#151517", color: hot ? "white" : undefined }}>
      <div className="flex items-center gap-2 text-[13px]" style={{ color: hot ? "rgba(255,255,255,0.85)" : "var(--text-3)" }}>
        {dot && !hot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{hot && <CheckCircle2 size={14} className="hidden" />}{label}
      </div>
      <div className="mt-2 text-[40px] font-medium leading-none tabular-nums">{value}</div>
      <div className="mt-2 text-[12px]" style={{ color: hot ? "rgba(255,255,255,0.85)" : "var(--text-3)" }}>{sub}</div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="payments-section overflow-hidden rounded-[28px] bg-[#151517]">
      <header className="flex items-center gap-2 px-6 pb-3 pt-5"><h2 className="text-[16px] font-medium">{title}</h2><div className="flex-1" />{right}</header>
      {children}
    </section>
  );
}

function StatusPill({ s }: { s: TxnStatus }) {
  return <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium" style={{ background: STATUS[s].bg, color: STATUS[s].fg }}>{STATUS[s].label}</span>;
}

const KV = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <div className="flex gap-2"><span className="w-[100px] flex-none text-text-3">{k}</span><span className={`min-w-0 break-all ${mono ? "font-mono text-[11.5px]" : ""}`}>{v}</span></div>
);
