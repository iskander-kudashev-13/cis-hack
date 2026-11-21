/**
 * In-browser simulator of the Scam Weather flow. Enabled with `?mock=1`, or automatically
 * when GET /api/state fails on first load. Mirrors the API contract in types.ts.
 */
import type { Actor, DevinResponse, JournalEntry, State, Tone } from "./types";

const SIGNAL_KIND = "MULE_ACCOUNT_BEC";
const MULE_BENEFICIARY = "AE07 •••• •••• 4821";
const MULE_INDICATOR = "h:9c1e7a02…4821";
const STALE_AFTER_MS = 3000;
const DELIVERY_DELAY_MS = 840;

const iso = (t = Date.now()) => new Date(t).toISOString();

function fakeHash(input: string): string {
  // Two FNV-1a passes → 16 hex chars. Visual only, not cryptographic.
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + 31), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4);
}

function randB64(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let s = "";
  arr.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}

function initial(): State {
  const now = Date.now();
  const s: State = {
    now: iso(now),
    timeline: [],
    bank_a: {
      id: "bank-a", name: "Bank A",
      cases: [
        { case_id: "CASE-0412", customer: "Al Noor Trading LLC", amount: 450000, currency: "AED", beneficiary_masked: MULE_BENEFICIARY, status: "Confirmed BEC", reported_at: iso(now - 42 * 60_000) },
        { case_id: "CASE-0409", customer: "Gulf Ridge Logistics", amount: 38500, currency: "AED", beneficiary_masked: "AE51 •••• •••• 0937", status: "Under investigation", reported_at: iso(now - 3 * 3600_000) },
        { case_id: "CASE-0398", customer: "M. Haddad", amount: 12000, currency: "AED", beneficiary_masked: "AE88 •••• •••• 2210", status: "Closed · no fraud", reported_at: iso(now - 26 * 3600_000) },
      ],
      signal: null,
    },
    bank_b: {
      id: "bank-b", name: "Bank B",
      channel: { status: "live", last_sync_at: iso(now), cursor: 0 },
      cache: [],
      payments: [
        { payment_id: "pay-match", label: "Supplier invoice INV-7781", amount: 450000, currency: "AED", beneficiary_masked: MULE_BENEFICIARY, kind: "match" },
        { payment_id: "pay-control", label: "Payroll transfer", amount: 450000, currency: "AED", beneficiary_masked: "AE33 •••• •••• 1190", kind: "control" },
      ],
      decisions: [],
    },
    hub: {
      paused: false, chain_ok: true,
      members: [
        { id: "bank-a", name: "Bank A", sign_pub: "ed25519:" + randB64(32), enc_pub: "x25519:" + randB64(32) },
        { id: "bank-b", name: "Bank B", sign_pub: "ed25519:" + randB64(32), enc_pub: "x25519:" + randB64(32) },
      ],
      stored: [], acks: [], journal: [],
    },
  };
  return s;
}

let state: State = initial();
let listeners: ((s: State) => void)[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let pendingSince: number | null = null; // when current signal revision was stored and is awaiting pull

function emit() {
  state = { ...state, now: iso() };
  const snap = structuredClone(state);
  listeners.forEach((l) => l(snap));
}

function tl(actor: Actor, text: string, tone: Tone = "info") {
  state.timeline.push({ at: iso(), actor, text, tone });
}

function journal(type: string, actor: string, extra: Partial<JournalEntry> = {}) {
  const j = state.hub.journal;
  const prev = j.length ? j[j.length - 1].hash : "0".repeat(64);
  const seq = j.length + 1;
  const at = iso();
  const hash = fakeHash(`${prev}|${seq}|${type}|${actor}|${extra.signal_id ?? ""}|${extra.revision ?? ""}|${at}`);
  j.push({ seq, at, type, actor, prev_hash: prev, hash, ...extra });
}

function seed() {
  journal("MEMBER_REGISTERED", "hub", { detail: "bank-a · ed25519 + x25519 keys" });
  journal("MEMBER_REGISTERED", "hub", { detail: "bank-b · ed25519 + x25519 keys" });
  tl("system", "Network ready: Bank A and Bank B registered with the hub", "info");
}
seed();

function store(event: "UPSERT" | "RETRACT") {
  const sig = state.bank_a.signal!;
  const env = {
    schema_version: 1, signal_id: sig.signal_id, revision: sig.revision, event,
    issuer: "bank-a", audience: "bank-b", kind: SIGNAL_KIND, expires_at: sig.expires_at,
  };
  state.hub.stored.push({
    envelope: env,
    ciphertexts: { "bank-b": { epk: randB64(32), nonce: randB64(24), ct: randB64(event === "UPSERT" ? 212 : 96) } },
    signature: randB64(64),
  });
  journal("SIGNAL_STORED", "bank-a", { signal_id: sig.signal_id, revision: sig.revision, detail: `${event} · ciphertext for bank-b` });
  pendingSince = Date.now();
}

function deliver() {
  const sig = state.bank_a.signal;
  if (!sig || pendingSince == null) return;
  const latency = Math.max(DELIVERY_DELAY_MS - 30 + Math.round(Math.random() * 50), Date.now() - pendingSince - 250);
  pendingSince = null;
  const b = state.bank_b;
  b.channel.cursor = state.hub.journal.length;
  const row = b.cache.find((r) => r.signal_id === sig.signal_id);
  if (sig.event === "UPSERT") {
    const fresh = {
      signal_id: sig.signal_id, revision: sig.revision, issuer: "bank-a", state: "active" as const, kind: SIGNAL_KIND,
      reason_code: "BEC_CONFIRMED", evidence_level: "CONFIRMED_CASE", amount_band: "AED 250k–500k",
      expires_at: sig.expires_at, indicator: MULE_INDICATOR,
    };
    if (row) Object.assign(row, fresh); else b.cache.unshift(fresh);
    tl("bank-b", `Verified signature, decrypted ${sig.signal_id} rev ${sig.revision}, cached as ACTIVE`, "warn");
  } else if (row) {
    row.state = "retracted";
    row.revision = sig.revision;
    tl("bank-b", `Applied retraction ${sig.signal_id} rev ${sig.revision}: cache entry RETRACTED`, "info");
  }
  state.hub.acks.push({ member: "bank-b", signal_id: sig.signal_id, revision: sig.revision, status: "applied", at: iso(), latency_ms: latency });
  journal("ACK", "bank-b", { signal_id: sig.signal_id, revision: sig.revision, detail: `applied · ${latency} ms` });
  sig.deliveries = sig.deliveries.map((d) => (d.member === "bank-b" ? { ...d, status: "applied", latency_ms: latency } : d));
  tl("hub", `ACK from Bank B for rev ${sig.revision} (${latency} ms)`, "good");
}

function tick() {
  const now = Date.now();
  const ch = state.bank_b.channel;
  if (!state.hub.paused) {
    if (ch.status === "stale") tl("bank-b", "Channel back to LIVE, resumed sync from cursor " + ch.cursor, "good");
    ch.status = "live";
    ch.last_sync_at = iso(now);
    if (pendingSince != null && now - pendingSince >= DELIVERY_DELAY_MS) deliver();
  } else if (ch.status === "live" && ch.last_sync_at && now - Date.parse(ch.last_sync_at) > STALE_AFTER_MS) {
    ch.status = "stale";
    tl("bank-b", "Channel STALE: no successful sync from hub for 3 s. Cached signals still enforced", "bad");
  }
  for (const r of state.bank_b.cache) {
    if (r.state === "active" && Date.parse(r.expires_at) < now) r.state = "expired";
  }
  emit();
}

function ensureTicker() {
  if (!ticker) ticker = setInterval(tick, 250);
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
const snapshot = () => delay(structuredClone({ ...state, now: iso() }));

export const mock = {
  state: () => { ensureTicker(); return snapshot(); },

  subscribe(cb: (s: State) => void) {
    ensureTicker();
    listeners.push(cb);
    cb(structuredClone(state));
    return () => { listeners = listeners.filter((l) => l !== cb); };
  },

  publish() {
    const cur = state.bank_a.signal;
    if (cur && cur.event === "UPSERT") return snapshot();
    const now = Date.now();
    state.bank_a.signal = {
      signal_id: "sig-" + fakeHash(String(now)).slice(0, 8), revision: 1, event: "UPSERT", kind: SIGNAL_KIND,
      published_at: iso(now), expires_at: iso(now + 72 * 3600_000),
      deliveries: [{ member: "bank-b", member_name: "Bank B", status: "awaiting" }],
    };
    state.bank_a.cases[0].status = "Signal published";
    tl("bank-a", `Published ${state.bank_a.signal.signal_id} rev 1 (UPSERT): signed + encrypted for Bank B`, "warn");
    store("UPSERT");
    tl("hub", "Stored envelope + ciphertext. Hub cannot read the payload", "info");
    emit();
    return snapshot();
  },

  retract() {
    const sig = state.bank_a.signal;
    if (!sig || sig.event === "RETRACT") return snapshot();
    sig.revision += 1;
    sig.event = "RETRACT";
    sig.published_at = iso();
    sig.deliveries = sig.deliveries.map((d) => ({ member: d.member, member_name: d.member_name, status: "awaiting" }));
    state.bank_a.cases[0].status = "Signal retracted";
    tl("bank-a", `Retracted ${sig.signal_id}: rev ${sig.revision} (RETRACT)`, "info");
    store("RETRACT");
    emit();
    return snapshot();
  },

  evaluate(payment_id: string) {
    const p = state.bank_b.payments.find((x) => x.payment_id === payment_id);
    if (!p) return snapshot();
    const hit = state.bank_b.cache.find((r) => r.state === "active" && p.kind === "match");
    const retracted = state.bank_b.cache.find((r) => r.state === "retracted" && p.kind === "match");
    const stale = state.bank_b.channel.status === "stale" ? " (channel stale: decision from local cache)" : "";
    const d = hit
      ? { decision: "REVIEW_REQUIRED" as const, reason: `Beneficiary matches active mule signal · ${hit.reason_code} · ${hit.evidence_level}${stale}`, signal_id: hit.signal_id, revision: hit.revision }
      : retracted
        ? { decision: "APPROVED" as const, reason: `Signal ${retracted.signal_id} retracted by issuer (rev ${retracted.revision}), no active match${stale}`, signal_id: retracted.signal_id, revision: retracted.revision }
        : { decision: "APPROVED" as const, reason: `No active signal for this beneficiary${stale}` };
    state.bank_b.decisions.push({ attempt_id: "att-" + (state.bank_b.decisions.length + 1), payment_id, at: iso(), ...d });
    const amt = `${p.currency} ${p.amount.toLocaleString("en-US")}`;
    tl("bank-b", `${p.label}: ${amt} → ${d.decision === "APPROVED" ? "APPROVED" : "REVIEW REQUIRED"}`, d.decision === "APPROVED" ? "good" : "warn");
    emit();
    return snapshot();
  },

  pause(paused: boolean) {
    if (state.hub.paused !== paused) {
      state.hub.paused = paused;
      journal(paused ? "HUB_PAUSED" : "HUB_RESUMED", "system");
      tl("hub", paused ? "Hub paused: members cannot sync" : "Hub resumed", paused ? "bad" : "good");
    }
    emit();
    return snapshot();
  },

  reset() {
    state = initial();
    pendingSince = null;
    seed();
    tl("system", "Demo reset", "info");
    emit();
    return snapshot();
  },

  devin(bank_id: string): Promise<DevinResponse> {
    tl("devin", `Onboarding session requested for ${bank_id}`, "info");
    emit();
    return delay({
      mode: "manual",
      prompt: [
        `You are onboarding ${bank_id} ("Bank C") to the Scam Weather network.`,
        "Bank C core banking emits ISO 20022 pacs.008 credit transfers.",
        "",
        "1. Read the Scam Weather connector interface in server/ and the pacs.008 sample in fixtures/bank-c/.",
        "2. Write a connector that maps pacs.008 CdtTrfTxInf → PaymentCheck{amount, currency, beneficiary_iban}.",
        "3. Hash the beneficiary IBAN with the network indicator scheme; never log raw IBANs.",
        "4. Add table tests: match → REVIEW_REQUIRED, control → APPROVED, retracted → APPROVED, malformed XML → error.",
        "5. Run the conformance suite (go test ./conformance/...) until green.",
        "6. Open a draft PR titled \"Onboard Bank C (pacs.008 connector)\" and request review from a Bank C engineer.",
      ].join("\n"),
    });
  },
};
