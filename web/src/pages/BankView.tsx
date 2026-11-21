import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Send, Undo2 } from "lucide-react";
import { api } from "../api/client";
import type { State } from "../api/types";
import { Badge, Button, clock, money, until } from "../components/ui";

type Run = (fn: () => Promise<State>) => Promise<void>;

/** The member bank's screen, told as three steps. Hub internals are not shown here. */
export function BankView({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const a = state.bank_a, b = state.bank_b;
  const sig = a.signal;
  const active = sig && sig.event !== "RETRACT";
  const delivered = sig ? sig.deliveries.filter((d) => d.status === "applied").length : 0;
  const total = sig ? sig.deliveries.length : 0;
  const lastDecision = b.decisions.length ? b.decisions[b.decisions.length - 1] : null;
  const pay = (id: string) => b.payments.find((p) => p.payment_id === id);
  const fraud = a.cases[0];

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-3">
      <Step n={1} who="Bank A" title="Bank A confirms a fraud and warns the network"
        text={fraud ? `A customer of Bank A (${fraud.customer}) was tricked into paying ${money(fraud.amount, fraud.currency)} to account ${fraud.beneficiary_masked}. Bank A warns the other banks about this account.` : ""}
        action={<Button variant="primary" className="h-9 px-3.5" disabled={busy || !!active} onClick={() => run(api.publish)}><Send size={14} /> Send warning</Button>}
        result={sig && active
          ? <Result tone="good" title={delivered === total ? `All ${total} banks received the warning` : `Delivering… ${delivered} of ${total} banks`}
              sub="The account number is encrypted; the network operator cannot read it." />
          : <Result tone="muted" title="No warning sent yet" />}
        details={sig && (
          <>
            <Line k="Warning ID" v={`${sig.signal_id} (version ${sig.revision})`} />
            <Line k="Sent at" v={clock(sig.published_at)} />
            <Line k="Valid for" v={until(sig.expires_at, Date.now())} />
            <Line k="Delivered to" v={sig.deliveries.map((d) => `${d.member_name}${d.status === "applied" ? " ✓" : " …"}`).join(", ")} />
            <Line k="Based on" v={`${a.cases.length} confirmed fraud cases to the same account`} />
          </>
        )} />

      <Step n={2} who="Bank B" title="A Bank B customer sends money"
        text="Before the money leaves, Bank B checks the receiving account against warnings it holds locally. The payment itself is never sent to anyone."
        action={
          <div className="flex gap-2">
            {b.payments.map((p) => (
              <Button key={p.payment_id} disabled={busy} onClick={() => run(() => api.evaluate(p.payment_id))}>
                {p.kind === "match" ? "Pay the reported account" : "Pay a normal supplier"}
              </Button>
            ))}
          </div>
        }
        result={lastDecision
          ? lastDecision.decision === "REVIEW_REQUIRED"
            ? <Result tone="bad" title="Payment held for review" sub={`${money(pay(lastDecision.payment_id)?.amount ?? 0, pay(lastDecision.payment_id)?.currency ?? "")} to ${pay(lastDecision.payment_id)?.beneficiary_masked}: another bank reported this account.`} />
            : <Result tone="good" title="Payment approved" sub={`${money(pay(lastDecision.payment_id)?.amount ?? 0, pay(lastDecision.payment_id)?.currency ?? "")} to ${pay(lastDecision.payment_id)?.beneficiary_masked}: no warnings for this account.`} />
          : <Result tone="muted" title="No payment checked yet" />}
        details={lastDecision && (
          <>
            <Line k="Checked at" v={clock(lastDecision.at)} />
            <Line k="Reason" v={lastDecision.reason} />
            <Line k="Warnings Bank B holds" v={b.cache.filter((c) => c.state === "active").length} />
            <Line k="Connection to network" v={b.channel.status === "live" ? "online" : "offline, checks still work from local copy"} />
            <Line k="All checks" v={b.decisions.slice().reverse().map((d) => `${clock(d.at)} ${d.decision === "APPROVED" ? "approved" : "held"}`).join(" · ")} />
          </>
        )} />

      <Step n={3} who="Bank A" title="Bank A withdraws the warning"
        text="If the account turns out to be clean, Bank A withdraws the warning and payments to it go through again."
        action={<Button disabled={busy || !active} onClick={() => run(api.retract)}><Undo2 size={14} /> Withdraw warning</Button>}
        result={sig && !active ? <Result tone="good" title="Warning withdrawn" sub="Bank B no longer holds payments to this account." /> : <Result tone="muted" title="Warning still active" />} />
    </div>
  );
}

function Step({ n, who, title, text, action, result, details }: {
  n: number; who: string; title: string; text: string; action: ReactNode; result: ReactNode; details?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <Badge tone="muted">{who}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-text-2">{text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">{action}</div>
          <div className="mt-3">{result}</div>
          {details && (
            <>
              <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-[12px] text-text-3 hover:text-text">
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Details
              </button>
              {open && <div className="mt-2 rounded-lg bg-bg p-3">{details}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Result({ tone, title, sub }: { tone: "good" | "bad" | "muted"; title: string; sub?: string }) {
  const color = tone === "good" ? "var(--pos)" : tone === "bad" ? "var(--neg)" : "var(--text-3)";
  return (
    <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5"
      style={{ borderColor: tone === "muted" ? "var(--border)" : `color-mix(in srgb, ${color} 45%, transparent)`, background: tone === "muted" ? "transparent" : `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <span style={{ color }} className="mt-0.5">{tone === "bad" ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}</span>
      <div>
        <div className="text-[14px] font-semibold" style={{ color: tone === "muted" ? "var(--text-2)" : color }}>{title}</div>
        {sub && <div className="text-[12.5px] text-text-2">{sub}</div>}
      </div>
    </div>
  );
}

const Line = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex gap-3 py-0.5 text-[12.5px]"><span className="w-[170px] flex-none text-text-3">{k}</span><span className="min-w-0 break-words">{v}</span></div>
);
