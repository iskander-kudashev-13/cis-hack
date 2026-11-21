import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Bot, Building2, CloudLightning, Lock, Network, ShieldCheck, X, Zap } from "lucide-react";

export type Session = { name: string; org: string; role: "bank" | "operator" };

/**
 * Intro screen with sign in / registration. Demo only: nothing is sent to a
 * server; the session lives in this browser so the right console opens.
 */
export function Landing({ onEnter }: { onEnter: (s: Session) => void }) {
  const [auth, setAuth] = useState<null | "signin" | "register">(null);

  return (
    <div className="h-full overflow-auto bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 opacity-60"
        style={{ background: "radial-gradient(900px 500px at 15% -10%, color-mix(in srgb, var(--accent) 35%, transparent), transparent), radial-gradient(700px 400px at 95% 10%, color-mix(in srgb, #a855f7 25%, transparent), transparent)" }} />

      <nav className="relative mx-auto flex max-w-[1120px] items-center gap-3 px-6 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white"><CloudLightning size={18} /></span>
        <span className="text-[16px] font-semibold tracking-tight">Scam Weather</span>
        <div className="flex-1" />
        <button onClick={() => setAuth("signin")} className="rounded-lg px-3 py-2 text-[13px] font-medium text-text-2 hover:text-text">Sign in</button>
        <button onClick={() => setAuth("register")} className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:brightness-110">Request access</button>
      </nav>

      <header className="relative mx-auto max-w-[1120px] px-6 pb-14 pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-2 bg-surface/70 px-3 py-1 text-[12px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-pos" /> UAE BEC pilot · 7 banks live
        </span>
        <h1 className="mt-5 max-w-[820px] text-[52px] font-semibold leading-[1.05] tracking-[-0.03em]">
          An early-warning network for <span className="text-accent">payment fraud</span> between banks.
        </h1>
        <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-text-2">
          When one bank confirms a mule account, every other bank knows within a second, before the next victim's money leaves.
          Accounts stay encrypted end to end. The network operator never sees them.
        </p>
        <div className="mt-8 flex gap-3">
          <button onClick={() => setAuth("register")} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white hover:brightness-110">
            Join the network <ArrowRight size={16} />
          </button>
          <button onClick={() => setAuth("signin")} className="rounded-xl border border-border-2 bg-surface/70 px-5 py-3 text-[14px] font-medium hover:bg-surface-2">
            Open console
          </button>
        </div>

        <div className="mt-14 grid grid-cols-4 gap-3">
          {[["< 1 s", "warning reaches every bank"], ["0", "account numbers the operator can read"], ["£85k", "UK APP reimbursement cap per case"], ["1 day", "to connect a bank with Devin"]].map(([v, l]) => (
            <div key={l} className="rounded-xl border border-border bg-surface/70 px-4 py-4 backdrop-blur">
              <div className="text-[26px] font-semibold tracking-tight">{v}</div>
              <div className="text-[12.5px] text-text-3">{l}</div>
            </div>
          ))}
        </div>
      </header>

      <section className="relative mx-auto grid max-w-[1120px] grid-cols-3 gap-3 px-6 pb-16">
        <Feature icon={<Zap size={18} />} title="Real-time warnings">Bank A confirms a fraud; Bank B holds the next transfer to the same account. The check runs inside Bank B on its local copy.</Feature>
        <Feature icon={<Lock size={18} />} title="Blind by design">Signed and encrypted per recipient. The hub relays ciphertext and keeps a hash-linked audit log. It is never in the payment path.</Feature>
        <Feature icon={<Bot size={18} />} title="Onboarding by Devin">Each bank has its own payment format. Devin writes the connector and tests, then opens a PR for the bank's engineers to approve.</Feature>
      </section>

      <footer className="relative mx-auto flex max-w-[1120px] items-center gap-2 border-t border-border px-6 py-6 text-[12px] text-text-3">
        <ShieldCheck size={14} /> Built at CIS Sprint × Devin, Dubai 2026 · demo environment with synthetic data
      </footer>

      {auth && <AuthModal mode={auth} setMode={setAuth} onEnter={onEnter} />}
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-5 backdrop-blur">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <div className="mt-3 text-[15px] font-semibold">{title}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-2">{children}</p>
    </div>
  );
}

function AuthModal({ mode, setMode, onEnter }: { mode: "signin" | "register"; setMode: (m: null | "signin" | "register") => void; onEnter: (s: Session) => void }) {
  const [role, setRole] = useState<Session["role"]>("bank");
  const [org, setOrg] = useState("Bank B");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const register = mode === "register";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (register && !sent) { setSent(true); return; }
    onEnter({ name: name || email.split("@")[0] || "Demo user", org: role === "operator" ? "Scam Weather Network" : org, role });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setMode(null)}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-2xl border border-border-2 bg-surface p-6 shadow-2xl">
        <div className="flex items-center">
          <div className="text-[18px] font-semibold">{register ? (sent ? "Request received" : "Request access") : "Sign in to the console"}</div>
          <div className="flex-1" />
          <button type="button" onClick={() => setMode(null)} className="text-text-3 hover:text-text"><X size={18} /></button>
        </div>

        {register && sent ? (
          <div className="mt-4 space-y-3 text-[13px] text-text-2">
            <p>Thanks{name ? `, ${name}` : ""}. In production, the network operator verifies your institution and issues signing keys.</p>
            <p>For this demo you can enter right away.</p>
            <button className="mt-2 w-full rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-white hover:brightness-110">Enter the demo console</button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <RoleCard on={role === "bank"} onClick={() => setRole("bank")} icon={<Building2 size={16} />} title="Member bank" sub="Send warnings, check payments" />
              <RoleCard on={role === "operator"} onClick={() => setRole("operator")} icon={<Network size={16} />} title="Network operator" sub="Monitor the network" />
            </div>
            <div className="mt-4 space-y-3">
              {register && <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aisha Rahman" className={INPUT} /></Field>}
              {role === "bank" && (
                <Field label="Institution">
                  <select value={org} onChange={(e) => setOrg(e.target.value)} className={INPUT}>
                    {["Bank A", "Bank B", "Bank D", "Bank E", "Bank F", "Bank G", "Bank H"].map((b) => <option key={b}>{b}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Work email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@bank.example" className={INPUT} /></Field>
              <Field label="Password"><input type="password" placeholder="Demo: any value" autoComplete="off" className={INPUT} /></Field>
            </div>
            <button className="mt-5 w-full rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-white hover:brightness-110">
              {register ? "Request access" : "Sign in"}
            </button>
            <div className="mt-3 text-center text-[12.5px] text-text-3">
              {register ? <>Already a member? <button type="button" className="text-accent" onClick={() => setMode("signin")}>Sign in</button></>
                : <>New institution? <button type="button" className="text-accent" onClick={() => setMode("register")}>Request access</button></>}
            </div>
            <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-text-3"><Lock size={11} /> Demo: nothing you type leaves this browser.</div>
          </>
        )}
      </form>
    </div>
  );
}

const INPUT = "h-10 w-full rounded-lg border border-border-2 bg-bg px-3 text-[13.5px] outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[12px] font-medium text-text-2">{label}</span>{children}</label>;
}

function RoleCard({ on, onClick, icon, title, sub }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border p-3 text-left transition"
      style={{ borderColor: on ? "var(--accent)" : "var(--border-2)", background: on ? "var(--accent-soft)" : "transparent" }}>
      <span className={on ? "text-accent" : "text-text-3"}>{icon}</span>
      <div className="mt-1.5 text-[13px] font-semibold">{title}</div>
      <div className="text-[11.5px] text-text-3">{sub}</div>
    </button>
  );
}
