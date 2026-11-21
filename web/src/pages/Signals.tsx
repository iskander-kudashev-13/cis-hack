import { CheckCircle2, ListOrdered, ShieldCheck, AlertTriangle } from "lucide-react";
import type { State } from "../api/types";
import { Badge, Panel, clock, short } from "../components/ui";

const TH = "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-text-3";
const TD = "px-3 py-2 align-top";

export function SignalsPage({ state }: { state: State }) {
  const h = state.hub;
  const journal = [...h.journal].reverse();
  const acks = [...h.acks].reverse();
  return (
    <div className="grid h-full grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
      <Panel title="Hub journal" icon={<ListOrdered size={15} />}
        right={h.chain_ok ? <Badge tone="good"><ShieldCheck size={12} />Chain verified</Badge> : <Badge tone="bad"><AlertTriangle size={12} />Chain broken</Badge>}
        bodyClass="overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-surface-2"><tr>
            <th className={TH}>Seq</th><th className={TH}>Time</th><th className={TH}>Type</th><th className={TH}>Actor</th>
            <th className={TH}>Signal</th><th className={TH}>Detail</th><th className={TH}>Prev hash</th><th className={TH}>Hash</th>
          </tr></thead>
          <tbody>
            {journal.map((j) => (
              <tr key={j.seq} className="border-t border-border hover:bg-surface-2/50">
                <td className={`${TD} font-mono text-text-3`}>#{j.seq}</td>
                <td className={`${TD} font-mono`}>{clock(j.at)}</td>
                <td className={`${TD} font-mono font-semibold`}>{j.type}</td>
                <td className={TD}>{j.actor}</td>
                <td className={`${TD} font-mono`}>{j.signal_id ? `${j.signal_id}${j.revision != null ? ` r${j.revision}` : ""}` : "—"}</td>
                <td className={`${TD} text-text-2`}>{j.detail ?? "—"}</td>
                <td className={`${TD} font-mono text-text-3`}>{short(j.prev_hash, 10)}</td>
                <td className={`${TD} font-mono text-text-2`}>{short(j.hash, 10)}</td>
              </tr>
            ))}
            {journal.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-text-3">No journal entries</td></tr>}
          </tbody>
        </table>
      </Panel>
      <Panel title="Acknowledgements" icon={<CheckCircle2 size={15} />} right={<span className="text-[11px] text-text-3">{acks.length} total</span>} bodyClass="overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-surface-2"><tr>
            <th className={TH}>Time</th><th className={TH}>Member</th><th className={TH}>Signal</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Latency</th>
          </tr></thead>
          <tbody>
            {acks.map((a, i) => (
              <tr key={`${a.signal_id}-${a.revision}-${i}`} className="border-t border-border">
                <td className={`${TD} font-mono`}>{clock(a.at)}</td>
                <td className={TD}>{a.member}</td>
                <td className={`${TD} font-mono`}>{a.signal_id} r{a.revision}</td>
                <td className={TD}><Badge tone={a.status === "applied" ? "good" : a.status === "invalid" ? "bad" : "muted"}>{a.status}</Badge></td>
                <td className={`${TD} text-right font-mono`}>{a.latency_ms} ms</td>
              </tr>
            ))}
            {acks.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-text-3">No acknowledgements yet</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
