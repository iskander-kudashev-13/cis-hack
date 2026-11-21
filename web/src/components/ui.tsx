import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Actor, Tone } from "../api/types";

export const money = (amount: number, currency: string) => `${currency} ${Math.round(amount).toLocaleString("en-US")}`;

export function clock(isoStr: string) {
  const d = new Date(isoStr);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ago(isoStr: string | null, now: number) {
  if (!isoStr) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(isoStr)) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function until(isoStr: string, now: number) {
  const s = Math.round((Date.parse(isoStr) - now) / 1000);
  if (Number.isNaN(s)) return "—";
  if (s <= 0) return "expired";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export const short = (h: string | undefined, n = 8) => (h ? h.slice(0, n) : "—");

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function Panel({ title, icon, right, children, className = "", bodyClass = "" }: {
  title: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-border bg-surface ${className}`}>
      <header className="flex h-10 flex-none items-center gap-2 border-b border-border px-3.5">
        {icon && <span className="text-text-3">{icon}</span>}
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        <div className="flex-1" />
        {right}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function SubLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-3">
      <span className="flex-1">{children}</span>
      {right}
    </div>
  );
}

const TONE: Record<Tone | "muted", { fg: string; bg: string }> = {
  good: { fg: "var(--pos)", bg: "color-mix(in srgb, var(--pos) 16%, transparent)" },
  warn: { fg: "var(--warn)", bg: "color-mix(in srgb, var(--warn) 16%, transparent)" },
  bad: { fg: "var(--neg)", bg: "color-mix(in srgb, var(--neg) 16%, transparent)" },
  info: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  muted: { fg: "var(--text-2)", bg: "var(--surface-2)" },
};
export const toneColor = (t: Tone | "muted") => TONE[t].fg;

export function Badge({ tone, children, dot, pulse, className = "" }: {
  tone: Tone | "muted"; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string;
}) {
  const c = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-1.5 py-[3px] text-[11px] font-semibold leading-none ${className}`}
      style={{ color: c.fg, background: c.bg }}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "sw-pulse" : ""}`} style={{ background: c.fg }} />}
      {children}
    </span>
  );
}

const ACTOR: Record<Actor, { label: string; tone: Tone | "muted" }> = {
  "bank-a": { label: "Bank A", tone: "info" },
  "bank-b": { label: "Bank B", tone: "warn" },
  hub: { label: "Hub", tone: "muted" },
  devin: { label: "Devin", tone: "good" },
  system: { label: "System", tone: "muted" },
};
export function ActorChip({ actor }: { actor: string }) {
  const a = ACTOR[actor as Actor] ?? { label: actor, tone: "muted" as const };
  return <Badge tone={a.tone} className="w-[58px] justify-center">{a.label}</Badge>;
}

export function Button({ children, onClick, disabled, variant = "secondary", title, className = "" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" | "ghost"; title?: string; className?: string;
}) {
  const v = {
    primary: "bg-accent text-white hover:brightness-110 border-transparent",
    secondary: "bg-surface-2 text-text hover:bg-border border-border-2",
    danger: "bg-neg/15 text-neg hover:bg-neg/25 border-neg/30",
    ghost: "bg-transparent text-text-2 hover:bg-surface-2 hover:text-text border-transparent",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${v} ${className}`}>
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => {});
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-2 bg-surface-2 px-2 text-[11.5px] font-medium text-text-2 transition hover:text-text">
      {done ? <Check size={13} className="text-pos" /> : <Copy size={13} />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border-2 px-3 py-3 text-center text-[12px] text-text-3">{children}</div>;
}
