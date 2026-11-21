import {
  Bot, Check, ExternalLink, FileCode2, FileInput, GitPullRequest, Loader2, Lock, ShieldCheck, TerminalSquare, UserCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { DevinResponse } from "../api/types";
import { Badge, Button, CopyButton, Panel } from "../components/ui";
// Snapshot of Devin's draft PR #1 (commit 879b3e7, branch devin/bank-c-adapter).
import bankcGo from "../devin/bankc.go.txt?raw";
import bankcTest from "../devin/bankc_test.go.txt?raw";
import registerDiff from "../devin/adapters.diff.txt?raw";
import sampleXml from "../devin/pay-match.xml.txt?raw";
import expectedJson from "../devin/expected.json.txt?raw";

const SESSION_URL = "https://app.devin.ai/sessions/28d843de3a734885a3d5e67983ad2ab2";
const PR_URL = "https://github.com/iskander-kudashev-13/cis-hack/pull/1";

const STEPS = [
  { title: "Bank C sends its format", sub: "A sample pacs.008 payment and the expected result", icon: <FileInput size={16} /> },
  { title: "Scam Weather starts Devin", sub: "One API call with the task", icon: <Bot size={16} /> },
  { title: "Devin writes the connector", sub: "bankc.go and 4 tests", icon: <FileCode2 size={16} /> },
  { title: "Devin runs the checks", sub: "go test ./..., all pass", icon: <ShieldCheck size={16} /> },
  { title: "Draft PR", sub: "PR #1, +106 lines", icon: <GitPullRequest size={16} /> },
  { title: "Bank engineer approves", sub: "A human merges; Bank C goes live", icon: <UserCheck size={16} /> },
];
const REACHED = 5; // PR #1 is open as a draft; the merge is a human's step

const WORK_LOG: { what: string; detail: string }[] = [
  { what: "Read the task and the repo", detail: "PaymentAdapter interface, the Bank B adapter as an example, fixtures in testdata/bank-c" },
  { what: "Created branch devin/bank-c-adapter", detail: "From main; touched only the adapters package, as instructed" },
  { what: "Wrote bankc.go (52 lines)", detail: "Parses ISO 20022 pacs.008 XML into the shared payment shape" },
  { what: "Registered Bank C (+1 line)", detail: "Register(BankC{}) in adapters.go, next to Bank B" },
  { what: "Wrote bankc_test.go (53 lines)", detail: "Missing IBAN, missing amount, IBAN with spaces, amount without decimals" },
  { what: "Ran go test ./...", detail: "TestConformance/bank-c went from SKIP to PASS; nothing else broke" },
  { what: "Opened draft PR #1", detail: "\"Onboard Bank C: pacs.008 adapter\" with the test output in the description" },
];

const MAPPING: [string, string, string][] = [
  ["PmtId / EndToEndId", "PaymentID", "pay-c-match"],
  ["CdtrAcct / Id / IBAN", "BeneficiaryIBAN (normalized)", "AE070331234567890123456"],
  ["IntrBkSttlmAmt", "AmountMinor", "450000.00 → 45000000"],
  ["IntrBkSttlmAmt @Ccy", "Currency", "AED"],
];

const TESTS = [
  "TestBankCRejectsMissingIBAN", "TestBankCRejectsMissingAmount", "TestBankCNormalizesIBANWithSpaces",
  "TestBankCAmountWithoutDecimals", "TestConformance/bank-b", "TestConformance/bank-c", "TestToMinor", "TestBankBRejectsMissingIBAN",
];

const FILES = [
  { id: "bankc.go", label: "bankc.go · new", text: bankcGo },
  { id: "bankc_test.go", label: "bankc_test.go · new", text: bankcTest },
  { id: "adapters.go", label: "adapters.go · +1", text: registerDiff },
] as const;

function Code({ text, diff }: { text: string; diff?: boolean }) {
  return (
    <pre className="max-h-[460px] overflow-auto rounded-lg border border-border bg-bg p-3.5 font-mono text-[11.5px] leading-relaxed">
      {text.split("\n").map((l, i) => (
        <div key={i} className={diff && l.startsWith("+") && !l.startsWith("+++") ? "bg-pos/15 text-pos"
          : diff && l.startsWith("-") && !l.startsWith("---") ? "bg-neg/15 text-neg" : "text-text-2"}>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

function Section({ n, title, icon, right, children }: { n: number; title: string; icon: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <Panel title={<><span className="mr-1.5 text-text-3">{n}.</span>{title}</>} icon={icon} right={right} bodyClass="px-6 pb-6">
      {children}
    </Panel>
  );
}

export function OnboardingPage() {
  const [res, setRes] = useState<DevinResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<(typeof FILES)[number]["id"]>("bankc.go");

  async function start() {
    setLoading(true); setErr(null);
    try { setRes(await api.devin("bank-c")); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  const current = FILES.find((f) => f.id === file)!;

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-3">
      <Panel title="Devin connects a new bank to the network" icon={<Bot size={15} />} bodyClass="px-6 pb-6">
        <div className="max-w-[760px] space-y-1.5 text-[13.5px] text-text-2">
          <p>Every bank stores payments in its own format. To join Scam Weather, a bank needs a connector that turns its payments into our shape so they can be checked against warnings.</p>
          <p><b className="text-text">Devin writes that connector.</b> Below is a real run: Bank C uses ISO 20022 pacs.008 XML. Devin got the task through the API, wrote the code and tests, ran them and opened a draft PR. A Bank C engineer has the final say.</p>
        </div>

        <ol className="mt-5 grid grid-cols-6 gap-2">
          {STEPS.map((s, i) => {
            const done = i < REACHED, active = i === REACHED;
            return (
              <li key={s.title} className="rounded-lg border p-3"
                style={{ borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "var(--accent-soft)" : "var(--surface-2)" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: done ? "var(--pos)" : active ? "var(--accent)" : "var(--border-2)", color: "#fff" }}>
                    {done ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="text-text-3">{s.icon}</span>
                </div>
                <div className="mt-2 text-[12.5px] font-semibold leading-tight">{s.title}</div>
                <div className="mt-0.5 text-[11.5px] text-text-3">{s.sub}</div>
                {active && <div className="mt-1.5 text-[11px] font-semibold text-accent">Waiting for review</div>}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a href={PR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <GitPullRequest size={14} /> Draft PR #1 <ExternalLink size={13} />
          </a>
          <a href={SESSION_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Bot size={14} /> Devin session log <ExternalLink size={13} />
          </a>
          <div className="flex-1" />
          <Button variant="primary" className="h-9 px-3.5" onClick={start} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />} Run it again live
          </Button>
          {res?.session_url && (
            <a href={res.session_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
              New session <ExternalLink size={13} />
            </a>
          )}
          {res?.mode === "manual" && <span className="text-[12px] text-text-3">Devin API key is not set on this server: copy the task below into Devin.</span>}
          {err && <span className="text-[12px] text-neg">{err}</span>}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Section n={1} title="What Bank C gave" icon={<FileInput size={15} />}>
          <div className="mb-1.5 text-[12px] text-text-2">A sample payment in Bank C's format (pacs.008 XML):</div>
          <Code text={sampleXml.trim()} />
          <div className="mb-1.5 mt-3 text-[12px] text-text-2">And what our system should get out of it:</div>
          <Code text={expectedJson.trim()} />
        </Section>

        <Section n={2} title="What Devin was told" icon={<TerminalSquare size={15} />} right={res && <CopyButton text={res.prompt} label="Copy task" />}>
          <div className="mb-2 text-[12px] text-text-2">
            Scam Weather sends one request, <span className="font-mono text-[11.5px]">POST api.devin.ai/v1/sessions</span>, with this task. Devin works in its own sandbox with access to this repository only.
          </div>
          <ul className="space-y-1.5 text-[12.5px]">
            {[
              "Create branch devin/bank-c-adapter",
              "Write a BankC adapter for pacs.008 using the existing interface",
              "Register it next to Bank B",
              "Add tests: missing IBAN, missing amount, spaces in IBAN, no decimals",
              "Run go test ./...; the Bank C conformance test must pass",
              "Open a draft PR with the test output",
              "Do not touch the protocol, hub or node code; use only test data",
            ].map((t) => <li key={t} className="flex gap-2"><Check size={14} className="mt-0.5 flex-none text-pos" />{t}</li>)}
          </ul>
          {res && <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 font-mono text-[11px] text-text-2">{res.prompt}</pre>}
        </Section>
      </div>

      <Section n={3} title="What Devin did, step by step" icon={<Bot size={15} />}>
        <ol className="relative ml-2 border-l border-border-2">
          {WORK_LOG.map((w, i) => (
            <li key={w.what} className="relative pb-3 pl-5 last:pb-0">
              <span className="absolute -left-[9px] top-0.5 flex h-[17px] w-[17px] items-center justify-center rounded-full bg-pos text-[9.5px] font-bold text-white">{i + 1}</span>
              <div className="text-[13px] font-medium">{w.what}</div>
              <div className="text-[12px] text-text-3">{w.detail}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section n={4} title="The code Devin wrote" icon={<FileCode2 size={15} />}
        right={<Badge tone="good">+106 −0 · 3 files</Badge>}>
        <div className="mb-3 text-[12px] text-text-2">How the connector reads a Bank C payment:</div>
        <table className="mb-4 w-full text-[12px]">
          <thead><tr className="text-left text-text-3">
            <th className="pb-1.5 font-medium">Field in Bank C's XML</th><th className="pb-1.5 font-medium">Field in Scam Weather</th><th className="pb-1.5 font-medium">From the sample</th>
          </tr></thead>
          <tbody>
            {MAPPING.map(([a, b, c]) => (
              <tr key={a} className="border-t border-border">
                <td className="py-1.5 font-mono text-[11.5px]">{a}</td><td className="py-1.5">{b}</td><td className="py-1.5 font-mono text-[11.5px] text-text-2">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-2 flex gap-1">
          {FILES.map((f) => (
            <button key={f.id} onClick={() => setFile(f.id)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11.5px] ${file === f.id ? "bg-accent-soft text-accent" : "text-text-3 hover:text-text"}`}>
              {f.label}
            </button>
          ))}
          <div className="flex-1" /><CopyButton text={current.text} />
        </div>
        <Code text={current.text.trimEnd()} diff={file === "adapters.go"} />
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Section n={5} title="Test results" icon={<ShieldCheck size={15} />} right={<Badge tone="good">PASS</Badge>}>
          <div className="mb-2 font-mono text-[11.5px] text-text-3">$ cd server &amp;&amp; go test -v ./internal/adapters/</div>
          <ul className="space-y-1 font-mono text-[11.5px]">
            {TESTS.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="font-semibold text-pos">PASS</span>
                <span className={t.includes("BankC") || t.endsWith("bank-c") ? "text-text" : "text-text-3"}>{t}</span>
                {t.endsWith("bank-c") && <span className="text-[11px] text-accent">was SKIP before Devin</span>}
              </li>
            ))}
          </ul>
        </Section>

        <Section n={6} title="What Devin cannot do" icon={<Lock size={15} />}>
          <ul className="space-y-2 text-[12.5px] text-text-2">
            {[
              "Merge its own PR. A Bank C engineer reviews and merges.",
              "Touch production or real customer data. It works on synthetic test files.",
              "Change the protocol, encryption or Hub. The task limits it to the adapters package.",
              "Take part in payment checks. At run time only the bank's own code decides.",
            ].map((t) => <li key={t} className="flex gap-2"><Lock size={13} className="mt-0.5 flex-none text-text-3" />{t}</li>)}
          </ul>
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-[12px] text-text-2">
            Without Devin, a connector like this takes a bank engineer days of reading our docs and their own schema. Here a reviewer gets a working diff with passing tests.
          </div>
        </Section>
      </div>
    </div>
  );
}
