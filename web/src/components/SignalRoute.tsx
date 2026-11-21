import { Building2, Check, Radio, Send, ShieldCheck, Undo2 } from "lucide-react";
import type { State } from "../api/types";

type Props = { state: State; busy: boolean; publish: () => void; withdraw: () => void };

export function SignalRoute({ state, busy, publish, withdraw }: Props) {
  const { bank_a: source, bank_b: bank, hub } = state;
  const signal = source.signal;
  const withdrawing = signal?.event === "RETRACT";
  const received = bank.cache.find((row) => row.signal_id === signal?.signal_id && row.revision === signal?.revision);
  const receipts = signal?.deliveries.filter((delivery) => delivery.status === "applied").length ?? 0;
  const recipientStatus = received ? { active: "Warning active", retracted: "Withdrawal applied", expired: "Warning expired" }[received.state]
    : signal ? "Awaiting update" : "Ready to receive";
  const stops = [
    { title: source.name, detail: signal ? (withdrawing ? "Withdrawal sent" : "Warning sent") : "Ready to publish", Icon: Building2 },
    { title: "Network hub", detail: hub.paused ? "Delivery paused" : signal ? `${receipts}/${signal.deliveries.length} banks applied` : "Encrypted relay", Icon: Radio },
    { title: bank.name, detail: recipientStatus, Icon: received ? Check : ShieldCheck },
  ];
  return (
    <section className="signal-route" aria-labelledby="route-title">
      <div className="route-controls">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="route-title" className="text-[17px] font-medium tracking-tight">Warning delivery</h2>
          <span className="route-tag">Demo controls</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy || (!!signal && !withdrawing)} onClick={publish}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90 disabled:opacity-40">
            <Send size={14} /> Send warning
          </button>
          <button disabled={busy || !signal || withdrawing} onClick={withdraw}
            className="inline-flex items-center gap-2 rounded-full bg-[#252529] px-4 py-2 text-[13px] font-medium hover:bg-[#303036] disabled:opacity-40">
            <Undo2 size={14} /> Withdraw
          </button>
        </div>
      </div>
      <ol className="route-stops" aria-label="Delivery path">
        {stops.map(({ title, detail, Icon }, index) => (
          <li key={index} className="route-stop" data-state={index === 1 && hub.paused ? "paused" : index === 2 && received?.state === "active" ? "active" : signal ? "sent" : "ready"}>
            <div className="route-line"><span className="route-icon"><Icon size={16} /></span></div>
            <span className="block text-[13px] font-medium">{title}</span>
            <span className="block text-[12px] text-text-2">{detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
