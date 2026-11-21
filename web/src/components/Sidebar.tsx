import { CloudLightning, Layers, MonitorPlay, PanelLeftClose, PanelLeftOpen, Radio, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

export type Page = "live" | "signals" | "hub" | "onboarding";

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "live", label: "Live demo", icon: <MonitorPlay size={16} /> },
  { id: "signals", label: "Signals", icon: <Radio size={16} /> },
  { id: "hub", label: "Hub view", icon: <Layers size={16} /> },
  { id: "onboarding", label: "Onboarding", icon: <UserPlus size={16} /> },
];

export function Sidebar({ page, onPage, collapsed, onToggle }: {
  page: Page; onPage: (p: Page) => void; collapsed: boolean; onToggle: () => void;
}) {
  return (
    <aside className={`flex h-full flex-none flex-col border-r border-border bg-sidebar pb-3 pt-3.5 transition-[width] duration-200 ${collapsed ? "w-[56px] px-2" : "w-[200px] px-3"}`}>
      <div className={`flex items-center gap-2.5 pb-3 pt-0.5 ${collapsed ? "justify-center px-0" : "px-2"}`}>
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#7c5cd6] text-white">
          <CloudLightning size={17} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">Scam Weather</div>
            <div className="truncate text-[11px] text-text-3">Interbank mule alerts</div>
          </div>
        )}
      </div>
      {!collapsed && <div className="mt-2 px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-3">Console</div>}
      <nav className="flex flex-col gap-[2px]">
        {NAV.map((n) => {
          const active = n.id === page;
          return (
            <button key={n.id} onClick={() => onPage(n.id)} title={collapsed ? n.label : undefined}
              className={`flex items-center gap-[11px] rounded-lg py-[6px] text-[12.5px] font-medium transition hover:bg-surface-2 ${collapsed ? "justify-center px-0" : "px-[9px]"}`}
              style={{ background: active ? "var(--surface-2)" : undefined, color: active ? "var(--text)" : "var(--text-2)" }}>
              <span className="flex w-4 flex-none justify-center" style={{ color: active ? "var(--accent)" : "var(--text-3)" }}>{n.icon}</span>
              {!collapsed && <span className="flex-1 text-left">{n.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      <button onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-2 rounded-lg py-[6px] text-[12px] text-text-3 transition hover:bg-surface-2 hover:text-text ${collapsed ? "justify-center" : "px-[9px]"}`}>
        {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>Collapse</span></>}
      </button>
    </aside>
  );
}
