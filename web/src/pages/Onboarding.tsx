import { Bot, Check, ExternalLink, FileCode2, GitPullRequest, Loader2, ShieldCheck, UserCheck, FileInput } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { DevinResponse } from "../api/types";
import { Button, CopyButton, Panel } from "../components/ui";

const STEPS = [
  { title: "Schema received", sub: "Bank C shares a sample ISO 20022 pacs.008 message", icon: <FileInput size={16} /> },
  { title: "Devin writes connector + tests", sub: "Maps pacs.008 to the payment-check API", icon: <FileCode2 size={16} /> },
  { title: "Conformance checks", sub: "Match, control, retract, malformed input", icon: <ShieldCheck size={16} /> },
  { title: "Draft PR", sub: "Connector, tests and fixtures in one reviewable diff", icon: <GitPullRequest size={16} /> },
  { title: "Bank engineer approves", sub: "A human at Bank C merges; Bank C joins the network", icon: <UserCheck size={16} /> },
];

export function OnboardingPage() {
  const [res, setRes] = useState<DevinResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reached = 1; // schema received; next step is Devin writing the connector

  async function start() {
    setLoading(true); setErr(null);
    try { setRes(await api.devin("bank-c")); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-3">
      <Panel title={<>Bank C · ISO 20022 pacs.008</>} icon={<Bot size={15} />} bodyClass="p-5">
        <div className="max-w-[720px] space-y-1 text-[13.5px] text-text-2">
          <p>A new bank joins by plugging its payment system into the Scam Weather check.</p>
          <p>Bank C sends a sample of its message format (ISO 20022 pacs.008).</p>
          <p>Devin, the AI engineer, writes the connector and tests, then runs the conformance suite.</p>
          <p>The result is a draft PR. Nothing goes live until a Bank C engineer approves it.</p>
        </div>

        <ol className="mt-6 grid grid-cols-5 gap-2">
          {STEPS.map((s, i) => {
            const done = i < reached, active = i === reached;
            return (
              <li key={s.title} className="relative rounded-lg border p-3"
                style={{ borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "var(--accent-soft)" : "var(--surface-2)" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: done ? "var(--pos)" : active ? "var(--accent)" : "var(--border-2)", color: done || active ? "#fff" : "var(--text-2)" }}>
                    {done ? <Check size={13} /> : active && (loading || res) ? <Loader2 size={13} className="animate-spin" /> : i + 1}
                  </span>
                  <span className="text-text-3">{s.icon}</span>
                </div>
                <div className="mt-2 text-[12.5px] font-semibold">{s.title}</div>
                <div className="mt-0.5 text-[11.5px] text-text-3">{s.sub}</div>
                {active && res && <div className="mt-1.5 text-[11px] font-semibold text-accent">{res.mode === "api" ? "Session running" : "Waiting for prompt paste"}</div>}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" className="h-10 px-4 text-[13px]" onClick={start} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />} Start Devin session
          </Button>
          {res?.session_url && (
            <a href={res.session_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
              Open Devin session <ExternalLink size={14} />
            </a>
          )}
          {err && <span className="text-[12px] text-neg">{err}</span>}
        </div>
      </Panel>

      {res && (
        <Panel title={res.mode === "manual" ? "Paste into Devin" : "Prompt sent to Devin"} icon={<FileCode2 size={15} />}
          right={<CopyButton text={res.prompt} label="Copy prompt" />} bodyClass="p-3.5">
          {res.mode === "manual" && <div className="mb-2 text-[12px] text-text-2">Devin API is not configured. Paste this prompt into a new Devin session.</div>}
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg p-3.5 font-mono text-[12px] leading-relaxed text-text">{res.prompt}</pre>
        </Panel>
      )}
    </div>
  );
}
