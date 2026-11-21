export type Actor = "bank-a" | "bank-b" | "hub" | "devin" | "system";
export type Tone = "info" | "good" | "warn" | "bad";

export type TimelineItem = { at: string; actor: Actor; text: string; tone: Tone };

export type DeliveryStatus = "awaiting" | "applied" | "obsolete" | "expired" | "invalid";
export type Delivery = { member: string; member_name: string; status: DeliveryStatus; latency_ms?: number };

export type Case = {
  case_id: string; customer: string; amount: number; currency: string;
  beneficiary_masked: string; status: string; reported_at: string;
};

export type Signal = {
  signal_id: string; revision: number; event: "UPSERT" | "RETRACT"; kind: string;
  published_at: string; expires_at: string; deliveries: Delivery[];
};

export type CacheRow = {
  signal_id: string; revision: number; issuer: string; state: "active" | "retracted" | "expired";
  kind: string; reason_code: string; evidence_level: string; amount_band: string; expires_at: string; indicator: string;
};

export type Payment = {
  payment_id: string; label: string; amount: number; currency: string;
  beneficiary_masked: string; kind: "match" | "control";
};

export type Decision = {
  attempt_id: string; payment_id: string; decision: "APPROVED" | "REVIEW_REQUIRED";
  reason: string; signal_id?: string; revision?: number; at: string;
};

export type Envelope = {
  schema_version: number; signal_id: string; revision: number; event: string;
  issuer: string; audience: string; kind: string; expires_at: string;
};
export type Ciphertext = { epk: string; nonce: string; ct: string };
export type StoredSignal = { envelope: Envelope; ciphertexts: Record<string, Ciphertext>; signature: string };

export type Member = { id: string; name: string; sign_pub: string; enc_pub: string };
export type Ack = { member: string; signal_id: string; revision: number; status: string; at: string; latency_ms: number };
export type JournalEntry = {
  seq: number; at: string; type: string; signal_id?: string; revision?: number;
  actor: string; detail?: string; prev_hash: string; hash: string;
};

export type State = {
  now: string;
  timeline: TimelineItem[];
  bank_a: { id: string; name: string; cases: Case[]; signal: Signal | null };
  bank_b: {
    id: string; name: string;
    channel: { status: "live" | "stale"; last_sync_at: string | null; cursor: number };
    cache: CacheRow[];
    payments: Payment[];
    decisions: Decision[];
    ops?: Ops;
  };
  hub: {
    paused: boolean; chain_ok: boolean;
    members: Member[];
    stored: StoredSignal[];
    acks: Ack[];
    journal: JournalEntry[];
    last_seen?: Record<string, string>;
  };
};

export type TxnStatus = "approved" | "held" | "unverified" | "released" | "declined";
export type Txn = {
  id: string; at: string; customer: string; channel: string; payee: string; payee_type: "iban" | "mobile" | "wallet"; payee_id: string;
  amount: number; currency: string; status: TxnStatus; reason: string;
  signal_id?: string; issuer?: string; kind?: string; gap_kind?: string; decided_by?: string; decided_at?: string;
  new_payee: boolean; score: number; priority: Priority; factors: { label: string; points: number }[];
};
export type Priority = "critical" | "high" | "medium" | "low";
export type Gap = {
  signal_id: string; issuer: string; kind: string; label: string; indicator_type: string; reason_code: string;
  evidence_level: string; expires_at: string; received_at: string;
};
export type DevinTask = { kind: string; mode: "api" | "manual"; session_url?: string; at: string };
export type KindRow = {
  kind: string; label: string; fraud: string; indicator: string; covered: boolean;
  active_uncovered: number; affected_txns: number; devin?: DevinTask;
  explain: string; checks: string[];
};
export type Ops = { txns: Txn[]; pending: Txn[]; counts: Partial<Record<TxnStatus, number>>; total: number; gaps: Gap[]; kinds: KindRow[] };

export type RepoPR = { number: number; title: string; url: string; state: "open" | "draft" | "merged" | "closed"; author: string; branch: string; ci: "success" | "failure" | "pending" | "none"; updated_at: string };
export type RepoPRs = { repo: string; repo_url: string; prs: RepoPR[]; error?: string };

export type DevinResponse = { mode: "api" | "manual"; session_url?: string; prompt: string };
