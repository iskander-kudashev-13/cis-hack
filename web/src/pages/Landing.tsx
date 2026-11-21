import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Bot, Building2, CloudLightning, Lock, Network, ShieldCheck, X, Zap } from "lucide-react";

export type Session = { name: string; org: string; role: "bank" | "operator" };

/**
 * Intro screen with sign in / registration. Demo only: nothing is sent to a
 * server; the session lives in this browser so the right console opens.
 * Visual language: dark and pastel sections, dot matrix, diagonal stripes,
 * light large grotesk type.
 */
const PASTEL = "linear-gradient(135deg, #d9dcff 0%, #f4f5ff 45%, #f3f8d8 100%)";
const STRIPES_DARK = "repeating-linear-gradient(-58deg, rgba(255,255,255,0.07) 0 3px, transparent 3px 26px)";
const STRIPES_LIGHT = "repeating-linear-gradient(-58deg, rgba(255,255,255,0.75) 0 3px, transparent 3px 30px)";
const DOTS = "radial-gradient(circle, rgba(255,255,255,0.35) 1.2px, transparent 1.6px)";
const H = "font-light tracking-[-0.045em] leading-[0.98]";

export function Landing({ onEnter }: { onEnter: (s: Session) => void }) {
  const [auth, setAuth] = useState<null | "signin" | "register">(null);

  return (
    <div className="h-full overflow-auto bg-[#0b0b0d] text-white">
      {/* Hero */}
      <section className="relative min-h-[620px] overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-[58%]"
          style={{ backgroundImage: DOTS, backgroundSize: "16px 16px", maskImage: "radial-gradient(ellipse 70% 70% at 60% 50%, #000 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 60% 50%, #000 30%, transparent 75%)" }} />
        <div className="absolute right-[22%] top-[120px] h-[120px] w-[120px] rounded-full" style={{ background: "linear-gradient(160deg, #d9dcff, #f3f8d8)" }} />
        <div className="absolute right-[18%] top-[120px] h-[120px] w-[120px] rounded-full border border-white/70" />

        <nav className="relative mx-auto flex max-w-[1200px] items-center gap-3 px-8 py-6">
          <Logo />
          <div className="flex-1" />
          <span className="hidden text-[11px] uppercase tracking-[0.12em] text-white/50 md:block">Demo network · 7 UAE banks · synthetic data</span>
          <button onClick={() => setAuth("signin")} className="ml-6 text-[13px] text-white/80 hover:text-white">Sign in</button>
          <button onClick={() => setAuth("register")} className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90">Request access</button>
        </nav>

        <div className="relative mx-auto max-w-[1200px] px-8 pb-24 pt-[150px]">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/50">Interbank fraud intelligence</div>
          <h1 className={`mt-4 text-[88px] ${H}`}>Scam Weather.<br />Fraud Early-Warning<br />Network.</h1>
          <div className="mt-10 flex gap-3">
            <button onClick={() => setAuth("register")} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-medium text-black hover:bg-white/90">
              Join the network <ArrowRight size={16} />
            </button>
            <button onClick={() => setAuth("signin")} className="rounded-full border border-white/30 px-6 py-3 text-[14px] hover:bg-white/10">Open console</button>
          </div>
        </div>
        <SlideFoot dark />
      </section>

      {/* Problem, light */}
      <section className="relative overflow-hidden text-[#0b0b0d]" style={{ background: PASTEL }}>
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: STRIPES_LIGHT, maskImage: "linear-gradient(90deg, transparent 35%, #000 75%)", WebkitMaskImage: "linear-gradient(90deg, transparent 35%, #000 75%)" }} />
        <div className="relative mx-auto grid min-h-[520px] max-w-[1200px] grid-cols-2 px-8 py-20">
          <h2 className={`text-[64px] ${H}`}>Fraud Moves Faster Than Banks Talk.</h2>
          <p className="self-end justify-self-end max-w-[360px] text-[14px] leading-relaxed text-black/70">
            A business email is hacked, the supplier's "new" bank details go out, and the money lands in a mule account at another bank.
            The victim's bank knows within hours. The receiving bank finds out weeks later, after the next victim has paid too.
          </p>
        </div>
        <SlideFoot />
      </section>

      {/* Platform, dark stripes */}
      <section className="relative overflow-hidden" style={{ backgroundImage: STRIPES_DARK }}>
        <div className="relative mx-auto max-w-[1200px] px-8 py-20">
          <h2 className={`text-[64px] ${H}`}>One Network.<br />Every Bank Warned.</h2>
          <div className="mt-14 grid grid-cols-3 gap-4">
            <PastelCard label="Real-time warnings" icon={<Zap size={16} />}>One bank confirms a mule account; every member has it within a second and holds the next transfer.</PastelCard>
            <PastelCard label="Blind by design" icon={<Lock size={16} />}>Signed and encrypted per bank. The operator relays ciphertext and is never in the payment path.</PastelCard>
            <PastelCard label="Onboarding by Devin" icon={<Bot size={16} />}>Devin writes each bank's connector and tests, then opens a pull request for the bank to approve.</PastelCard>
          </div>
        </div>
        <SlideFoot dark />
      </section>

      {/* Product, light with mockup cards */}
      <section className="relative overflow-hidden text-[#0b0b0d]" style={{ background: PASTEL }}>
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: STRIPES_LIGHT, maskImage: "linear-gradient(90deg, transparent 45%, #000 85%)", WebkitMaskImage: "linear-gradient(90deg, transparent 45%, #000 85%)" }} />
        <div className="relative mx-auto grid min-h-[560px] max-w-[1200px] grid-cols-2 items-center px-8 py-20">
          <div>
            <h2 className={`text-[64px] ${H}`}>Built for the Way Fraud Teams Work.</h2>
            <p className="mt-10 max-w-[380px] text-[14px] leading-relaxed text-black/70">
              No new screens for analysts to watch. The check runs inside the bank's payment flow, on a local copy of the warnings, and answers in milliseconds.
            </p>
          </div>
          <div className="relative h-[380px]">
            <div className="absolute left-[60px] top-[10px] w-[330px] rotate-[8deg] rounded-2xl p-6 text-white shadow-2xl"
              style={{ background: "#141418", backgroundImage: STRIPES_DARK }}>
              <div className="flex text-[12px] text-white/60"><span>Warning · sig_8cf4</span><div className="flex-1" /><Logo small /></div>
              <div className="mt-10 text-[30px] font-light tracking-tight">AE07 •••• 3456</div>
              <div className="text-[12px] text-white/60">Delivered to 6 of 6 banks · 0.9 s</div>
            </div>
            <div className="absolute left-[140px] top-[170px] w-[330px] -rotate-[4deg] rounded-2xl p-6 shadow-2xl" style={{ background: PASTEL }}>
              <div className="flex text-[12px] text-black/60"><span>Mashreq · payment check</span><div className="flex-1" /><Logo small dark /></div>
              <div className="mt-10 text-[30px] font-light tracking-tight">AED 450,000</div>
              <div className="text-[12px] font-medium text-[#b42318]">Held for review · reported mule account</div>
            </div>
          </div>
        </div>
        <SlideFoot />
      </section>

      {/* Why, split */}
      <section className="grid min-h-[520px] grid-cols-[1fr_1.4fr]">
        <div style={{ backgroundImage: "repeating-linear-gradient(-58deg, rgba(190,200,255,0.35) 0 4px, transparent 4px 22px)" }} />
        <div className="relative text-[#0b0b0d]" style={{ background: PASTEL }}>
          <div className="px-14 py-20">
            <h2 className={`text-[64px] ${H}`}>Why Banks Join<br />Scam Weather.</h2>
            <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-8 text-[13px]">
              <Why icon={<Zap size={15} />} title="Stop the second victim">Warnings land before the next transfer, not weeks later in a report.</Why>
              <Why icon={<ShieldCheck size={15} />} title="Share without exposure">Account numbers stay encrypted; only member banks can match them.</Why>
              <Why icon={<Building2 size={15} />} title="Split liability, shared win">With the UK's 50/50 APP reimbursement, both banks pay for a missed mule.</Why>
              <Why icon={<Network size={15} />} title="Connect in a day">Devin turns a bank's payment format into a tested connector.</Why>
            </div>
          </div>
        </div>
      </section>

      {/* Mission, dark */}
      <section className="relative overflow-hidden" style={{ backgroundImage: STRIPES_DARK }}>
        <div className="relative mx-auto flex min-h-[460px] max-w-[900px] flex-col items-center justify-center px-8 py-20 text-center">
          <Logo big />
          <p className="mt-8 text-[36px] font-light leading-tight tracking-[-0.03em]">
            To make every bank's fraud signal protect the customers of every other bank.
          </p>
          <div className="mt-10 flex gap-3">
            <button onClick={() => setAuth("register")} className="rounded-full bg-white px-6 py-3 text-[14px] font-medium text-black hover:bg-white/90">Request access</button>
            <button onClick={() => setAuth("signin")} className="rounded-full border border-white/30 px-6 py-3 text-[14px] hover:bg-white/10">Sign in</button>
          </div>
        </div>
        <SlideFoot dark />
      </section>

      {auth && <AuthModal mode={auth} setMode={setAuth} onEnter={onEnter} />}
    </div>
  );
}

function Logo({ small, big, dark }: { small?: boolean; big?: boolean; dark?: boolean }) {
  const size = big ? 44 : small ? 14 : 20;
  return (
    <span className={`inline-flex items-center gap-2 ${dark ? "text-black" : "text-white"}`}>
      <CloudLightning size={size} strokeWidth={1.5} />
      {!big && <span className={small ? "text-[12px] font-medium" : "text-[16px] font-medium tracking-tight"}>scam weather</span>}
    </span>
  );
}

function SlideFoot({ dark }: { dark?: boolean }) {
  return (
    <div className={`relative mx-auto flex max-w-[1200px] items-center px-8 pb-6 text-[11px] ${dark ? "text-white/40" : "text-black/50"}`}>
      <Logo small dark={!dark} /><div className="flex-1" /><span>CIS Sprint × Devin · Dubai 2026</span><div className="flex-1" /><span>demo with synthetic data · bank names for illustration, no affiliation</span>
    </div>
  );
}

function PastelCard({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[190px] rounded-md p-5 text-[#0b0b0d]" style={{ background: PASTEL }}>
      <div className="flex items-center text-[10.5px] uppercase tracking-[0.12em] text-black/60"><span className="flex-1">{label}</span>{icon}</div>
      <p className="mt-12 text-[13.5px] leading-relaxed text-black/75">{children}</p>
    </div>
  );
}

function Why({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-black/60">{icon}</span>
      <div><div className="font-medium">{title}</div><div className="mt-1 text-black/60">{children}</div></div>
    </div>
  );
}

function AuthModal({ mode, setMode, onEnter }: { mode: "signin" | "register"; setMode: (m: null | "signin" | "register") => void; onEnter: (s: Session) => void }) {
  const [role, setRole] = useState<Session["role"]>("bank");
  const [org, setOrg] = useState("Mashreq");
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
                    {["Emirates NBD", "Mashreq", "FAB", "ADCB", "Dubai Islamic Bank", "ADIB", "RAKBANK"].map((b) => <option key={b}>{b}</option>)}
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
