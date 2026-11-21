// Package demo wires one hub and two bank nodes into a stand that the web
// console drives. In a real deployment each node runs in its own bank and
// the hub runs at the operator; here they share a process but still talk to
// the hub over HTTP with separate credentials.
package demo

import (
	"bytes"
	"encoding/json"
	"fmt"
	mathrand "math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/adapters"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/hub"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

const (
	Audience   = "uae-bec-pilot"
	SignalKind = "bec_beneficiary"
	SignalTTL  = 24 * time.Hour
)

// Synthetic fixtures. Bank A exports cases as JSON; Bank B's core banking
// uses its own nested format with lower-case, spaced IBANs.
var bankACases = []string{
	`{"case_id":"case-101","customer":"Northwind Trading LLC","beneficiary_iban":"AE07 0331 2345 6789 0123 456","amount":"450000.00","currency":"AED","status":"confirmed"}`,
	`{"case_id":"case-102","customer":"Gulf Marine Supplies","beneficiary_iban":"AE070331234567890123456","amount":"128000.00","currency":"AED","status":"confirmed"}`,
	`{"case_id":"case-103","customer":"Al Noor Interiors","beneficiary_iban":"ae07-0331-2345-6789-0123-456","amount":"76500.00","currency":"AED","status":"confirmed"}`,
}

var bankBPayments = []struct {
	Raw, Label, Kind string
}{
	{`{"txn_ref":"pay-match","creditor":{"iban":"ae07 0331 2345 6789 0123 456","name":"Northwind Supply"},"amt":{"value":"450000.00","ccy":"aed"}}`,
		"Supplier invoice · new bank details", "match"},
	{`{"txn_ref":"pay-control","creditor":{"iban":"AE46-0260-0012-3456-7890-101","name":"Gulf Marine Supplies"},"amt":{"value":"450000","ccy":"AED"}}`,
		"Regular supplier · known account", "control"},
}

type TimelineItem struct {
	At    time.Time `json:"at"`
	Actor string    `json:"actor"`
	Text  string    `json:"text"`
	Tone  string    `json:"tone"`
}

type Decision struct {
	AttemptID string    `json:"attempt_id"`
	PaymentID string    `json:"payment_id"`
	Decision  string    `json:"decision"`
	Reason    string    `json:"reason"`
	SignalID  string    `json:"signal_id,omitempty"`
	Revision  int       `json:"revision,omitempty"`
	At        time.Time `json:"at"`
}

type Demo struct {
	Hub       *hub.Hub
	A, B      *node.Node
	Peers     []*node.Node // the rest of the network: real nodes that sync, decrypt and ack
	mu        sync.Mutex
	cases     []adapters.Case
	pays      map[string]adapters.Payment
	timeline  []TimelineItem
	decisions []Decision
	signalID  string
	attempt   int
	wasStale  bool
	subs      map[chan []byte]bool
	resetGen  atomic.Int32 // set by Reset so background traffic forgets old signals
}

func New(hubURL string) (*Demo, error) {
	d := &Demo{Hub: hub.New(), subs: map[chan []byte]bool{}}
	gk := node.GroupKey(Audience)
	var err error
	if d.A, err = node.New("bank-a", "Emirates NBD", "token-bank-a", Audience, gk, hubURL, d.Log); err != nil {
		return nil, err
	}
	if d.B, err = node.New("bank-b", "Mashreq", "token-bank-b", Audience, gk, hubURL, d.Log); err != nil {
		return nil, err
	}
	if err := d.Hub.Register(d.A.Member(), d.A.Token, Audience); err != nil {
		return nil, err
	}
	if err := d.Hub.Register(d.B.Member(), d.B.Token, Audience); err != nil {
		return nil, err
	}
	quiet := func(actor, text, tone string) { // peers only surface problems in the timeline
		if tone == "bad" {
			d.Log(actor, text, tone)
		}
	}
	for _, p := range networkPeers {
		n, err := node.New(p.id, p.name, "token-"+p.id, Audience, gk, hubURL, quiet)
		if err != nil {
			return nil, err
		}
		if err := d.Hub.Register(n.Member(), n.Token, Audience); err != nil {
			return nil, err
		}
		d.Peers = append(d.Peers, n)
	}
	d.Hub.OnChange(d.broadcast)
	for _, raw := range bankACases {
		c, err := adapters.ParseBankACase([]byte(raw))
		if err != nil {
			return nil, err
		}
		d.cases = append(d.cases, c)
	}
	d.pays = map[string]adapters.Payment{}
	for _, p := range bankBPayments {
		pay, err := adapters.BankB{}.ParsePayment([]byte(p.Raw))
		if err != nil {
			return nil, err
		}
		d.pays[pay.PaymentID] = pay
	}
	d.Log("system", fmt.Sprintf("Stand ready: %d banks and the hub are online", 2+len(d.Peers)), "info")
	return d, nil
}

// networkPeers are the other members of the pilot network. Each one polls the hub
// at its own pace, so confirmations arrive at different times, as they would live.
var networkPeers = []struct {
	id, name string
	every    time.Duration
}{
	{"bank-d", "FAB", 1200 * time.Millisecond},
	{"bank-e", "ADCB", 1700 * time.Millisecond},
	{"bank-f", "Dubai Islamic Bank", 2300 * time.Millisecond},
	{"bank-g", "ADIB", 2900 * time.Millisecond},
	{"bank-h", "RAKBANK", 3600 * time.Millisecond},
}

// RunNodes starts every bank's sync loop.
func (d *Demo) RunNodes(stop <-chan struct{}) {
	go d.A.Run(time.Second, stop)
	go d.B.Run(time.Second, stop)
	for i, p := range d.Peers {
		go p.Run(networkPeers[i].every, stop)
	}
	go d.background(stop)
}

// background makes the rest of the network behave like a live pilot: peers
// report mule accounts of their own and withdraw some of them later.
func (d *Demo) background(stop <-chan struct{}) {
	rnd := mathrand.New(mathrand.NewSource(time.Now().UnixNano()))
	type pub struct {
		n  *node.Node
		id string
	}
	var active []pub
	reasons := []string{"confirmed_bec_case", "confirmed_app_scam", "mule_network_link", "invoice_redirection"}
	bands := []string{"10k-50k AED", "50k-100k AED", "100k-500k AED", "500k+ AED"}
	tick := func() {
		if d.Hub.Paused() {
			return
		}
		if len(active) > 6 && rnd.Intn(3) == 0 {
			i := rnd.Intn(len(active))
			if _, err := active[i].n.Retract(active[i].id); err == nil {
				active = append(active[:i], active[i+1:]...)
				return
			}
		}
		n := d.Peers[rnd.Intn(len(d.Peers))]
		iban := fmt.Sprintf("AE%02d%03d%016d", rnd.Intn(90)+10, rnd.Intn(900)+100, rnd.Int63n(1e16))
		p := protocol.Payload{
			Indicator: n.Indicator(iban), EvidenceLevel: "issuer_analyst_verified",
			ReasonCode: reasons[rnd.Intn(len(reasons))], AmountBand: bands[rnd.Intn(len(bands))],
			ActionHint: "review", FirstSeen: time.Now().UTC().Add(-time.Duration(rnd.Intn(72)) * time.Hour).Truncate(time.Minute),
			CaseCount: 1 + rnd.Intn(4),
		}
		if env, err := n.Publish(SignalKind, p, SignalTTL); err == nil {
			active = append(active, pub{n, env.SignalID})
		}
	}
	// A short burst so the operator dashboard has history right after start.
	for i := 0; i < 14; i++ {
		tick()
		time.Sleep(120 * time.Millisecond)
	}
	t := time.NewTicker(7 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			if d.resetGen.Load() != 0 {
				active, _ = nil, d.resetGen.Swap(0)
			}
			tick()
		}
	}
}

func (d *Demo) Log(actor, text, tone string) {
	d.mu.Lock()
	d.timeline = append(d.timeline, TimelineItem{At: time.Now().UTC(), Actor: actor, Text: text, Tone: tone})
	if len(d.timeline) > 200 {
		d.timeline = d.timeline[len(d.timeline)-200:]
	}
	d.mu.Unlock()
	d.broadcast()
}

func (d *Demo) Reset() {
	d.Hub.Reset()
	d.A.Reset()
	d.B.Reset()
	for _, p := range d.Peers {
		p.Reset()
	}
	d.resetGen.Store(1)
	d.mu.Lock()
	d.timeline = nil
	d.decisions = nil
	d.signalID = ""
	d.attempt = 0
	d.wasStale = false
	d.mu.Unlock()
	d.Log("system", "Reset: hub and all banks cleared", "info")
}

func (d *Demo) PublishSignal() error {
	d.mu.Lock()
	active := d.signalID
	d.mu.Unlock()
	if active != "" {
		if e, ok := d.latestEnv(active); ok && e.Event != protocol.EventRetract {
			return fmt.Errorf("signal %s is already active", active)
		}
	}
	first := d.cases[0]
	p := protocol.Payload{
		Indicator:     d.A.Indicator(first.BeneficiaryIBAN),
		EvidenceLevel: "issuer_analyst_verified",
		ReasonCode:    "confirmed_bec_case",
		AmountBand:    "100k-500k AED",
		ActionHint:    "review",
		FirstSeen:     time.Now().UTC().Add(-3 * time.Hour).Truncate(time.Minute),
		CaseCount:     len(d.cases),
	}
	env, err := d.A.Publish(SignalKind, p, SignalTTL)
	if err != nil {
		d.Log("bank-a", "Publish failed: "+err.Error(), "bad")
		return err
	}
	d.mu.Lock()
	d.signalID = env.SignalID
	d.mu.Unlock()
	d.Log("bank-a", fmt.Sprintf("Published %s rev 1: account hashed, signed, encrypted for the group", env.SignalID), "good")
	return nil
}

func (d *Demo) RetractSignal() error {
	d.mu.Lock()
	id := d.signalID
	d.mu.Unlock()
	if id == "" {
		return fmt.Errorf("no signal to retract")
	}
	env, err := d.A.Retract(id)
	if err != nil {
		d.Log("bank-a", "Retract failed: "+err.Error(), "bad")
		return err
	}
	d.Log("bank-a", fmt.Sprintf("Retracted %s with rev %d", id, env.Revision), "info")
	return nil
}

func (d *Demo) Evaluate(paymentID string) (Decision, error) {
	pay, ok := d.pays[paymentID]
	if !ok {
		return Decision{}, fmt.Errorf("unknown payment %s", paymentID)
	}
	d.mu.Lock()
	d.attempt++
	attempt := d.attempt
	d.mu.Unlock()
	dec := Decision{AttemptID: fmt.Sprintf("att-%03d", attempt), PaymentID: paymentID, At: time.Now().UTC(),
		Decision: "APPROVED", Reason: "Local rules: no risk signal for this beneficiary"}
	if e, hit := d.B.Check(pay.BeneficiaryIBAN); hit {
		dec.Decision = "REVIEW_REQUIRED"
		dec.SignalID = e.Envelope.SignalID
		dec.Revision = e.Envelope.Revision
		dec.Reason = fmt.Sprintf("Active signal from %s (rev %d): %s, %d related cases", issuerName(e.Envelope.Issuer), e.Envelope.Revision, e.Payload.ReasonCode, e.Payload.CaseCount)
	}
	if d.B.Channel().Status == "stale" {
		dec.Reason += " · hub channel stale, using last known signals"
	}
	d.mu.Lock()
	d.decisions = append(d.decisions, dec)
	d.mu.Unlock()
	tone := "good"
	if dec.Decision != "APPROVED" {
		tone = "warn"
	}
	d.Log("bank-b", fmt.Sprintf("%s %s %s → %s", paymentID, fmtAmount(pay.AmountMinor), pay.Currency, strings.ReplaceAll(dec.Decision, "_", " ")), tone)
	return dec, nil
}

func issuerName(id string) string {
	names := map[string]string{"bank-a": "Emirates NBD", "bank-b": "Mashreq", "bank-c": "CBD"}
	for _, p := range networkPeers {
		names[p.id] = p.name
	}
	if n, ok := names[id]; ok {
		return n
	}
	return id
}

func (d *Demo) latestEnv(id string) (protocol.Envelope, bool) {
	var out protocol.Envelope
	found := false
	for _, s := range d.Hub.Snapshot().Stored {
		if s.Envelope.SignalID == id && s.Envelope.Revision >= out.Revision {
			out, found = s.Envelope, true
		}
	}
	return out, found
}

// Watch logs channel transitions and pushes periodic state for the console.
func (d *Demo) Watch(stop <-chan struct{}) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			ch := d.B.Channel()
			if ch.LastSync == nil { // not synced yet since start or reset
				d.broadcast()
				continue
			}
			stale := ch.Status == "stale"
			d.mu.Lock()
			changed := stale != d.wasStale
			d.wasStale = stale
			d.mu.Unlock()
			if changed && stale {
				d.Log("bank-b", "Hub channel STALE: no successful sync for 10 s, checks continue on the local cache", "bad")
			} else if changed {
				d.Log("bank-b", "Hub channel live again, inbox caught up", "good")
			} else {
				d.broadcast()
			}
		}
	}
}

// ---- state for the console ----

func (d *Demo) State() map[string]any {
	snap := d.Hub.Snapshot()
	now := time.Now().UTC()

	d.mu.Lock()
	sigID := d.signalID
	timeline := append([]TimelineItem{}, d.timeline...)
	decisions := append([]Decision{}, d.decisions...)
	d.mu.Unlock()
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i].At.After(timeline[j].At) })

	cases := []map[string]any{}
	for _, c := range d.cases {
		cases = append(cases, map[string]any{"case_id": c.CaseID, "customer": c.Customer, "amount": c.AmountMinor / 100, "currency": c.Currency,
			"beneficiary_masked": mask(c.BeneficiaryIBAN), "status": c.Status, "reported_at": now.Add(-3 * time.Hour).Truncate(time.Minute)})
	}

	var signal any
	if sigID != "" {
		if env, ok := d.latestEnv(sigID); ok {
			var published time.Time
			for _, j := range snap.Journal {
				if j.SignalID == sigID && j.Type == "published" {
					published = j.At
				}
			}
			deliveries := []map[string]any{}
			for _, m := range snap.Members {
				if m.ID == env.Issuer {
					continue
				}
				dl := map[string]any{"member": m.ID, "member_name": m.Name, "status": "awaiting"}
				for _, a := range snap.Acks {
					if a.Member == m.ID && a.SignalID == sigID && a.Revision == env.Revision {
						dl["status"] = string(a.Status)
						dl["latency_ms"] = a.LatencyMS
					}
				}
				deliveries = append(deliveries, dl)
			}
			signal = map[string]any{"signal_id": env.SignalID, "revision": env.Revision, "event": env.Event, "kind": env.Kind,
				"published_at": published, "expires_at": env.ExpiresAt, "deliveries": deliveries}
		}
	}

	cache := []map[string]any{}
	for _, e := range d.B.CacheList() {
		cache = append(cache, map[string]any{"signal_id": e.Envelope.SignalID, "revision": e.Envelope.Revision, "issuer": issuerName(e.Envelope.Issuer),
			"state": e.State(now), "kind": e.Envelope.Kind, "reason_code": e.Payload.ReasonCode, "evidence_level": e.Payload.EvidenceLevel,
			"amount_band": e.Payload.AmountBand, "expires_at": e.Envelope.ExpiresAt, "indicator": node.ShortIndicator(e.Payload.Indicator.Value)})
	}
	pays := []map[string]any{}
	for _, p := range bankBPayments {
		pay, _ := adapters.BankB{}.ParsePayment([]byte(p.Raw))
		pays = append(pays, map[string]any{"payment_id": pay.PaymentID, "label": p.Label, "amount": pay.AmountMinor / 100, "currency": pay.Currency,
			"beneficiary_masked": mask(pay.BeneficiaryIBAN), "kind": p.Kind})
	}

	acks := snap.Acks
	// Keep the payload small while background traffic runs: recent history only.
	stored := nonNilS(snap.Stored)
	if len(stored) > 40 {
		stored = stored[len(stored)-40:]
	}
	journal := snap.Journal
	if len(journal) > 600 {
		journal = journal[len(journal)-600:]
	}
	return map[string]any{
		"now":      now,
		"timeline": timeline,
		"bank_a":   map[string]any{"id": "bank-a", "name": "Emirates NBD", "cases": cases, "signal": signal},
		"bank_b": map[string]any{"id": "bank-b", "name": "Mashreq", "channel": d.B.Channel(), "cache": cache,
			"payments": pays, "decisions": decisions},
		"hub": map[string]any{"paused": snap.Paused, "chain_ok": snap.ChainOK, "members": nonNil(snap.Members), "stored": stored,
			"acks": acks, "journal": journal, "last_seen": snap.LastSeen},
	}
}

func nonNil(m []protocol.Member) []protocol.Member {
	if m == nil {
		return []protocol.Member{}
	}
	return m
}

func nonNilS(s []protocol.SignedSignal) []protocol.SignedSignal {
	if s == nil {
		return []protocol.SignedSignal{}
	}
	return s
}

func mask(iban string) string {
	if len(iban) < 8 {
		return iban
	}
	return iban[:4] + " •••• " + iban[len(iban)-4:]
}

func fmtAmount(minor int64) string {
	s := fmt.Sprintf("%d", minor/100)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ---- HTTP ----

func (d *Demo) broadcast() {
	b, err := json.Marshal(d.State())
	if err != nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	for ch := range d.subs {
		select {
		case ch <- b:
		default:
		}
	}
}

func (d *Demo) Routes(mux *http.ServeMux) {
	state := func(w http.ResponseWriter) { writeJSON(w, 200, d.State()) }
	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, r *http.Request) { state(w) })
	mux.HandleFunc("POST /api/reset", func(w http.ResponseWriter, r *http.Request) { d.Reset(); state(w) })
	mux.HandleFunc("POST /api/bank-a/publish", func(w http.ResponseWriter, r *http.Request) {
		if err := d.PublishSignal(); err != nil {
			writeJSON(w, 409, map[string]string{"error": err.Error()})
			return
		}
		state(w)
	})
	mux.HandleFunc("POST /api/bank-a/retract", func(w http.ResponseWriter, r *http.Request) {
		if err := d.RetractSignal(); err != nil {
			writeJSON(w, 409, map[string]string{"error": err.Error()})
			return
		}
		state(w)
	})
	mux.HandleFunc("POST /api/bank-b/evaluate", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PaymentID string `json:"payment_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if _, err := d.Evaluate(body.PaymentID); err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		state(w)
	})
	mux.HandleFunc("POST /api/hub/pause", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Paused bool `json:"paused"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		d.Hub.SetPaused(body.Paused)
		if body.Paused {
			d.Log("hub", "Hub paused (simulated outage). Payments are not affected: banks check locally", "warn")
		} else {
			d.Log("hub", "Hub resumed", "good")
		}
		state(w)
	})
	mux.HandleFunc("GET /api/events", d.handleSSE)
	mux.HandleFunc("POST /api/onboarding/devin", d.handleDevin)
}

func (d *Demo) handleSSE(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	ch := make(chan []byte, 8)
	d.mu.Lock()
	d.subs[ch] = true
	d.mu.Unlock()
	defer func() {
		d.mu.Lock()
		delete(d.subs, ch)
		d.mu.Unlock()
	}()
	first, _ := json.Marshal(d.State())
	fmt.Fprintf(w, "event: state\ndata: %s\n\n", first)
	fl.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case b := <-ch:
			fmt.Fprintf(w, "event: state\ndata: %s\n\n", b)
			fl.Flush()
		}
	}
}

// DevinSignalKindPrompt asks Devin to teach Bank B's connector a new indicator type
// announced by the network (schema v2). The bank's engineer reviews the PR.
const DevinSignalKindPrompt = `In the repo iskander-kudashev-13/cis-hack, add support for a new signal indicator type for Bank B.

The network announced schema v2: besides "account_hmac" (HMAC of a normalized IBAN), a signal may carry indicator type "wallet_hmac": HMAC-SHA256 with the group key over a lower-cased crypto wallet address with whitespace removed.

1. Create a branch devin/bank-b-wallet-indicator.
2. In server/internal/protocol add NormalizeWallet and WalletIndicator(groupKey, address) next to AccountIndicator.
3. In server/internal/node, make Cache.Match and Node.Check work for both indicator types; add Node.CheckWallet(address).
4. In server/internal/adapters, let Bank B payments carry an optional creditor.wallet field and map it into Payment.
5. Add tests: wallet normalization, a wallet signal matches, an IBAN signal does not match a wallet payment, retract still wins.
6. Run cd server && go test ./... and paste the output. Open a draft PR "Bank B: support wallet_hmac indicators".

Do not change the hub, the signature or encryption code. Use only synthetic test data.`

// DevinPrompt is the onboarding task for Bank C (ISO 20022 pacs.008).
const DevinPrompt = `Onboard Bank C to Scam Weather in the repo iskander-kudashev-13/cis-hack.

Bank C sends payments as ISO 20022 pacs.008 XML. Fixtures and the expected shared shape are in server/internal/adapters/testdata/bank-c/ (pay-match.xml, pay-control.xml, expected.json).

1. Create a branch devin/bank-c-adapter.
2. Add server/internal/adapters/bankc.go with type BankC implementing PaymentAdapter (BankID "bank-c", Format "ISO 20022 pacs.008"). Parse with encoding/xml: EndToEndId -> PaymentID, CdtrAcct/Id/IBAN -> BeneficiaryIBAN (use protocol.NormalizeIBAN), IntrBkSttlmAmt value and Ccy attribute -> AmountMinor and Currency (reuse toMinor). Return a clear error when IBAN or amount is missing.
3. Register it in init() in adapters.go next to BankB.
4. Add unit tests for: missing IBAN, missing amount, IBAN with spaces, amount without decimals.
5. Run: cd server && go test ./... and paste the full output. TestConformance/bank-c must PASS instead of SKIP.
6. Open a draft PR to main titled "Onboard Bank C: pacs.008 adapter" with the test output in the description.

Do not change the protocol, hub or node packages. Use only the synthetic fixtures.`

func (d *Demo) handleDevin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Task string `json:"task"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	prompt, title, logText := DevinPrompt, "Scam Weather · onboard Bank C (pacs.008)", "Devin session started for Bank C onboarding"
	if in.Task == "signal-kind" {
		prompt, title, logText = DevinSignalKindPrompt, "Scam Weather · Bank B: support wallet_address indicator", "Devin session started: Bank B adds support for wallet_address signals"
	}
	key := os.Getenv("DEVIN_API_KEY")
	if key == "" {
		d.Log("devin", "Devin task prepared (manual mode): "+title, "info")
		writeJSON(w, 200, map[string]any{"mode": "manual", "prompt": prompt})
		return
	}
	body, _ := json.Marshal(map[string]any{"prompt": prompt, "title": title})
	req, _ := http.NewRequest("POST", "https://api.devin.ai/v1/sessions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		writeJSON(w, 502, map[string]any{"mode": "manual", "prompt": prompt, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	var out struct {
		SessionID string `json:"session_id"`
		URL       string `json:"url"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode >= 300 || out.URL == "" {
		writeJSON(w, 502, map[string]any{"mode": "manual", "prompt": prompt, "error": fmt.Sprintf("devin api status %d", resp.StatusCode)})
		return
	}
	d.Log("devin", logText, "good")
	writeJSON(w, 200, map[string]any{"mode": "api", "session_url": out.URL, "prompt": prompt})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
