import { AlertTriangle, ArrowRight, Building2, CheckCircle2, CircleSlash, Clock3, Link2, Lock, Network, Send, ShieldCheck, Undo2, WifiOff, Wifi } from "lucide-react";
import { api } from "../api/client";
import type { Decision, Delivery, State } from "../api/types";
import { ActorChip, Badge, Button, Empty, Panel, SubLabel, ago, clock, money, short, toneColor, until, useNow } from "../components/ui";

type Run = (fn: () => Promise<State>) => Promise<void>;

export function LiveDemo({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const now = useNow(500);
  return (
    <div className="grid h-full min-h-[760px] grid-rows-[minmax(0,1fr)_160px] gap-3">
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.12fr)] gap-3">
        <BankA state={state} now={now} busy={busy} run={run} />
        <Hub state={state} />
        <BankB state={state} now={now} busy={busy} run={run} />
      </div>
      <Timeline state={state} />
    </div>
  );
}

/* ---------------- Bank A ---------------- */

function deliveryView(d: Delivery) {
  switch (d.status) {
    case "awaiting": return <Badge tone="warn" dot pulse>Awaiting acknowledgement</Badge>;
    case "applied": return <Badge tone="good"><CheckCircle2 size={12} />Applied by {d.member_name}{d.latency_ms != null ? ` · ${d.latency_ms} ms` : ""}</Badge>;
    case "obsolete": return <Badge tone="muted">Obsolete (newer revision)</Badge>;
    case "expired": return <Badge tone="muted">Expired before delivery</Badge>;
    case "invalid": return <Badge tone="bad">Rejected: invalid signature</Badge>;
  }
}

function caseTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("retract") || s.includes("closed")) return "muted" as const;
  if (s.includes("confirm") || s.includes("publish")) return "warn" as const;
  return "info" as const;
}

function BankA({ state, now, busy, run }: { state: State; now: number; busy: boolean; run: Run }) {
  const a = state.bank_a;
  const sig = a.signal;
  const active = sig?.event === "UPSERT";
  return (
    <Panel title={<>{a.name} · Fraud desk</>} icon={<Building2 size={15} />}
      right={<span className="text-[11px] text-text-3">victim's bank</span>}
      bodyClass="flex flex-col gap-3 overflow-auto p-3.5">
      <div>
        <SubLabel>Fraud cases</SubLabel>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-[12px]">
            <colgroup><col /><col className="w-[96px]" /><col className="w-[120px]" /></colgroup>
            <thead className="bg-surface-2 text-[10.5px] uppercase tracking-wide text-text-3">
              <tr><th className="px-2 py-1.5 text-left font-semibold">Customer · IBAN</th><th className="px-2 py-1.5 text-right font-semibold">Amount</th><th className="px-2 py-1.5 text-right font-semibold">Status</th></tr>
            </thead>
            <tbody>
              {a.cases.map((c, i) => (
                <tr key={c.case_id} className={`border-t border-border ${i === 0 ? "bg-accent-soft/40" : ""}`}>
                  <td className="px-2 py-1.5" title={c.case_id}><div className="truncate font-medium">{c.customer}</div><div className="whitespace-nowrap font-mono text-[10.5px] text-text-3" title={c.case_id}>{c.beneficiary_masked}</div></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{money(c.amount, c.currency)}</td>
                  <td className="px-2 py-1.5 text-right"><Badge tone={caseTone(c.status)} className="max-w-full truncate">{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SubLabel>Outgoing signal</SubLabel>
        {!sig ? (
          <Empty>No signal published. Confirm the BEC case and publish to warn the network.</Empty>
        ) : (
          <div key={`${sig.signal_id}-${sig.revision}`} className="sw-pop rounded-lg border border-border-2 bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold">{sig.signal_id}</span>
              <Badge tone="muted">rev {sig.revision}</Badge>
              <div className="flex-1" />
              {sig.event === "UPSERT" ? <Badge tone="warn" className="text-[12px]">ACTIVE · UPSERT</Badge> : <Badge tone="muted" className="text-[12px]">RETRACTED</Badge>}
            </div>
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-text-3">Kind</dt><dd className="font-mono">{sig.kind}</dd>
              <dt className="text-text-3">Published</dt><dd>{clock(sig.published_at)}</dd>
              <dt className="text-text-3">{sig.event === "RETRACT" ? "Status" : "Expires in"}</dt><dd>{sig.event === "RETRACT" ? "No longer in effect" : until(sig.expires_at, now)}</dd>
            </dl>
            <div className="mt-2.5 border-t border-border pt-2.5">
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-3">Delivery</div>
              {sig.deliveries.map((d) => (
                <div key={d.member} className="flex items-center gap-2 py-0.5">
                  <span className="w-14 text-[12px] font-medium">{d.member_name}</span>
                  {deliveryView(d)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        <Button variant="primary" className="h-10 flex-1 text-[13px]" disabled={busy || active} onClick={() => run(api.publish)}
          title={active ? "An active signal already exists" : undefined}>
          <Send size={15} /> Publish signal
        </Button>
        <Button className="h-10 flex-1 text-[13px]" disabled={busy || !active} onClick={() => run(api.retract)}>
          <Undo2 size={15} /> Retract signal
        </Button>
      </div>
    </Panel>
  );
}

/* ---------------- Hub ---------------- */

function Hub({ state }: { state: State }) {
  const h = state.hub;
  const last = h.stored[h.stored.length - 1];
  const journal = [...h.journal].reverse();
  return (
    <Panel title="Hub · blind relay" icon={<Network size={15} />}
      right={h.chain_ok ? <Badge tone="good"><ShieldCheck size={12} />Chain verified</Badge> : <Badge tone="bad"><AlertTriangle size={12} />Chain broken</Badge>}
      bodyClass="flex flex-col gap-3 overflow-hidden p-3.5">
      <div className="flex-none">
        <SubLabel>Last stored envelope · plaintext routing fields</SubLabel>
        {!last ? <Empty>Nothing stored yet</Empty> : (
          <div key={`${last.envelope.signal_id}-${last.envelope.revision}`} className="sw-pop rounded-lg border border-border bg-surface-2 p-2.5">
            <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-text-3">issuer</dt><dd className="font-mono">{last.envelope.issuer}</dd>
              <dt className="text-text-3">audience</dt><dd className="font-mono">{last.envelope.audience}</dd>
              <dt className="text-text-3">kind</dt><dd className="truncate font-mono">{last.envelope.kind}</dd>
              <dt className="text-text-3">revision</dt><dd className="font-mono">{last.envelope.revision} · {last.envelope.event}</dd>
              <dt className="text-text-3">expires</dt><dd className="col-span-3 font-mono">{last.envelope.expires_at}</dd>
            </dl>
            <div className="mt-2 flex flex-col gap-1.5">
              {Object.entries(last.ciphertexts).map(([member, c]) => (
                <div key={member} className="rounded-md border border-border-2 bg-bg px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Lock size={12} className="text-warn" />
                    <span className="font-semibold">for {member}</span>
                    <div className="flex-1" />
                    <span className="text-text-3">Hub cannot read this</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] leading-snug text-text-3">{c.ct.slice(0, 96)}…</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <SubLabel right={<span className="normal-case tracking-normal">{h.journal.length} entries</span>}>Journal · hash chain</SubLabel>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          {journal.length === 0 ? <div className="p-3 text-text-3">Empty</div> : journal.map((j) => (
            <div key={j.seq} className="sw-fade grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11.5px] last:border-b-0">
              <span className="font-mono text-text-3">#{j.seq}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="font-mono font-semibold">{j.type}</span><span className="text-text-3">· {j.actor}</span>{j.revision != null && <span className="text-text-3">· rev {j.revision}</span>}</div>
                <div className="flex items-center gap-1 font-mono text-[10.5px] text-text-3"><Link2 size={10} />{short(j.prev_hash)} <ArrowRight size={10} /> <span className="text-text-2">{short(j.hash)}</span></div>
              </div>
              <span className="font-mono text-[10.5px] text-text-3">{clock(j.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ---------------- Bank B ---------------- */

function DecisionView({ d, state }: { d: Decision | undefined; state: State }) {
  if (!d) return <Empty>Run a transfer to see the payment decision</Empty>;
  const p = state.bank_b.payments.find((x) => x.payment_id === d.payment_id);
  const ok = d.decision === "APPROVED";
  const color = ok ? "var(--pos)" : "var(--warn)";
  return (
    <div key={d.attempt_id} className="sw-pop rounded-xl border-2 px-3.5 py-3"
      style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[20px] font-semibold tracking-tight">{p ? money(p.amount, p.currency) : d.payment_id}</span>
        <span className="text-[11px] text-text-3">{clock(d.at)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[30px] font-bold leading-none tracking-tight" style={{ color }}>
        {ok ? <CheckCircle2 size={30} /> : <AlertTriangle size={30} />}
        {ok ? "APPROVED" : "REVIEW REQUIRED"}
      </div>
      <div className="mt-1.5 text-[12.5px] text-text">{d.reason}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-text-3">
        {p && <span>{p.label} → <span className="font-mono">{p.beneficiary_masked}</span></span>}
        {d.signal_id && <span>Signal <span className="font-mono text-text-2">{d.signal_id}</span>{d.revision != null && ` rev ${d.revision}`}</span>}
      </div>
    </div>
  );
}

function BankB({ state, now, busy, run }: { state: State; now: number; busy: boolean; run: Run }) {
  const b = state.bank_b;
  const live = b.channel.status === "live";
  const latest = b.decisions[b.decisions.length - 1];
  return (
    <Panel title={<>{b.name} · Payment check</>} icon={<Building2 size={15} />}
      right={<span className="text-[11px] text-text-3">mule account's bank</span>}
      bodyClass="flex flex-col gap-2.5 overflow-auto p-3">
      <div className={`flex flex-none items-center gap-2.5 rounded-lg border px-3 py-1.5 ${live ? "border-pos/40 bg-pos/10" : "border-neg/50 bg-neg/10"}`}>
        {live ? <Wifi size={18} className="text-pos" /> : <WifiOff size={18} className="text-neg" />}
        <div className="flex-1">
          <div className="text-[14px] font-bold tracking-tight" style={{ color: live ? "var(--pos)" : "var(--neg)" }}>
            Channel {live ? "LIVE" : "STALE"}
          </div>
          <div className="text-[11.5px] text-text-2">
            {live ? "Syncing with hub" : "Hub unreachable · cached signals still enforced"} · last sync {ago(b.channel.last_sync_at, now)}
          </div>
        </div>
        <span className="font-mono text-[11px] text-text-3">cursor {b.channel.cursor}</span>
      </div>

      <div>
        <SubLabel>Local signal cache</SubLabel>
        {b.cache.length === 0 ? <Empty>No signals received</Empty> : (
          <div className="flex flex-col gap-1.5">
            {b.cache.map((r) => (
              <div key={r.signal_id} className="sw-pop rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  {r.state === "active" ? <Badge tone="warn">ACTIVE</Badge> : r.state === "retracted" ? <Badge tone="muted"><CircleSlash size={11} />RETRACTED</Badge> : <Badge tone="muted"><Clock3 size={11} />EXPIRED</Badge>}
                  <span className="font-mono font-semibold">{r.signal_id}</span>
                  <span className="text-text-3">rev {r.revision}</span>
                  <div className="flex-1" />
                  <span className="text-[11px] text-text-3">from {r.issuer}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-text-2">
                  <span>{r.reason_code}</span><span>{r.evidence_level}</span><span>{r.amount_band}</span><span className="font-mono text-text-3">{r.indicator}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SubLabel>Incoming transfers</SubLabel>
        <div className="flex flex-col gap-1.5">
          {b.payments.map((p) => {
            const last = [...b.decisions].reverse().find((d) => d.payment_id === p.payment_id);
            return (
              <div key={p.payment_id} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium">
                    <span className="truncate">{p.label}</span>
                    <Badge tone={p.kind === "match" ? "info" : "muted"} className="text-[10px]">{p.kind}</Badge>
                  </div>
                  <div className="truncate whitespace-nowrap font-mono text-[11.5px] text-text-2">{money(p.amount, p.currency)} → {p.beneficiary_masked}</div>
                </div>
                {last && <span className="text-[10.5px] font-semibold" style={{ color: toneColor(last.decision === "APPROVED" ? "good" : "warn") }}>{last.decision === "APPROVED" ? "APPROVED" : "REVIEW"}</span>}
                <Button variant="primary" disabled={busy} onClick={() => run(() => api.evaluate(p.payment_id))}>Run transfer</Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto">
        <SubLabel>Latest decision</SubLabel>
        <DecisionView d={latest} state={state} />
      </div>
    </Panel>
  );
}

/* ---------------- Timeline ---------------- */

function Timeline({ state }: { state: State }) {
  const items = [...state.timeline].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  return (
    <Panel title="Event timeline" icon={<Clock3 size={15} />} right={<span className="text-[11px] text-text-3">latest first</span>}
      bodyClass="overflow-auto px-3.5 py-1.5">
      {items.length === 0 ? <div className="py-3 text-text-3">No events yet</div> : items.map((t, i) => (
        <div key={`${t.at}-${i}-${t.text}`} className="sw-fade flex items-center gap-3 py-[3px] text-[12.5px]">
          <span className="w-[62px] flex-none font-mono text-[11.5px] text-text-3">{clock(t.at)}</span>
          <ActorChip actor={t.actor} />
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: toneColor(t.tone) }} />
          <span className={t.tone === "bad" ? "text-neg" : "text-text"}>{t.text}</span>
        </div>
      ))}
    </Panel>
  );
}
