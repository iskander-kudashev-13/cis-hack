import type { ReactNode } from "react";
import { Layers, Lock, Users } from "lucide-react";
import type { State } from "../api/types";
import { Badge, CopyButton, Empty, Panel, short } from "../components/ui";

function JsonBlock({ title, value, icon }: { title: string; value: unknown; icon?: ReactNode }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11.5px] font-semibold text-text-2">
        {icon}{title}<div className="flex-1" /><CopyButton text={text} />
      </div>
      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11.5px] leading-relaxed text-text-2">{text}</pre>
    </div>
  );
}

export function HubPage({ state }: { state: State }) {
  const h = state.hub;
  const stored = [...h.stored].reverse();
  return (
    <div className="flex flex-col gap-3">
      <Panel title="Members" icon={<Users size={15} />} bodyClass="p-3.5">
        <div className="grid grid-cols-2 gap-2">
          {h.members.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px]">
              <div className="font-semibold">{m.name} <span className="font-mono font-normal text-text-3">{m.id}</span></div>
              <div className="font-mono text-[11px] text-text-3">sign {short(m.sign_pub, 28)}…</div>
              <div className="font-mono text-[11px] text-text-3">enc&nbsp; {short(m.enc_pub, 28)}…</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Stored signals" icon={<Layers size={15} />} right={<span className="text-[11px] text-text-3">{stored.length} stored · hub sees envelope + ciphertext only</span>} bodyClass="flex flex-col gap-3 p-3.5">
        {stored.length === 0 && <Empty>No signals stored yet. Publish one from the Live demo.</Empty>}
        {stored.map((s, i) => (
          <div key={`${s.envelope.signal_id}-${s.envelope.revision}-${i}`} className="rounded-lg border border-border-2 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold">{s.envelope.signal_id}</span>
              <Badge tone="muted">rev {s.envelope.revision}</Badge>
              <Badge tone={s.envelope.event === "RETRACT" ? "muted" : "warn"}>{s.envelope.event}</Badge>
              <div className="flex-1" />
              <span className="font-mono text-[11px] text-text-3">sig {short(s.signature, 24)}…</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <JsonBlock title="Envelope (plaintext)" value={s.envelope} />
              <JsonBlock title="Ciphertexts · Hub cannot read this" value={s.ciphertexts} icon={<Lock size={12} className="text-warn" />} />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
