import { Pause, Play, RotateCcw } from "lucide-react";
import type { State } from "../api/types";
import { Badge, Button } from "./ui";

export type LiveMode = "sse" | "poll" | "mock" | "down" | "connecting";

export function Header({ title, state, live, busy, onPause, onReset }: {
  title: string; state: State | null; live: LiveMode; busy: boolean;
  onPause: (paused: boolean) => void; onReset: () => void;
}) {
  const paused = state?.hub.paused ?? false;
  const liveLabel = { sse: "live", poll: "polling", mock: "mock", down: "offline", connecting: "connecting" }[live];
  const liveColor = live === "down" ? "var(--neg)" : live === "connecting" ? "var(--text-3)" : live === "mock" ? "var(--warn)" : "var(--pos)";
  return (
    <header className="flex h-[52px] flex-none items-center gap-3 border-b border-border bg-surface px-5">
      <div className="text-[15px] font-semibold tracking-tight">Scam Weather</div>
      <div className="text-xs text-text-3">{title}</div>
      <div className="flex-1" />
      <span className="flex items-center gap-1.5 text-[11.5px] text-text-3" title="Connection to console API">
        <span className={`h-2 w-2 rounded-full ${live === "sse" || live === "mock" ? "sw-pulse" : ""}`} style={{ background: liveColor }} />
        {liveLabel}
      </span>
      {state && (paused
        ? <Badge tone="bad" dot className="px-2 py-1.5 text-[12px]">Hub paused</Badge>
        : <Badge tone="good" dot pulse className="px-2 py-1.5 text-[12px]">Hub live</Badge>)}
      <Button onClick={() => onPause(!paused)} disabled={!state || busy} variant={paused ? "primary" : "secondary"}>
        {paused ? <><Play size={14} /> Resume hub</> : <><Pause size={14} /> Pause hub</>}
      </Button>
      <Button onClick={onReset} disabled={busy} variant="ghost"><RotateCcw size={14} /> Reset</Button>
    </header>
  );
}
