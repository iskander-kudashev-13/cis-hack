package demo

import (
	"fmt"
	mathrand "math/rand"
	"sort"
	"strings"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// KindInfo describes one signal kind on the network: what fraud it reports,
// which indicator it carries and whether Mashreq's node already has an
// adapter and a policy for it. Uncovered kinds are stored but cannot be
// matched against payments: they show up in the coverage gap log.
type KindInfo struct {
	Kind      string   `json:"kind"`
	Label     string   `json:"label"`
	Fraud     string   `json:"fraud"`
	Indicator string   `json:"indicator"`
	Covered   bool     `json:"covered"`
	Reasons   []string `json:"-"`
	Normalize string   `json:"-"` // how the identifier is normalised before HMAC
	PayField  string   `json:"-"` // where Mashreq's payment carries it
	Weight    int      `json:"-"`
	Severity  int      `json:"-"`       // risk points a match adds on top of the alert itself
	Explain   string   `json:"explain"` // how this fraud works, for the analyst
	Checks    []string `json:"checks"`  // what the analyst should verify before deciding
}

var signalKinds = []KindInfo{
	{Kind: "bec_beneficiary", Label: "Business email compromise", Fraud: "Invoice redirected to a mule account", Indicator: "account_hmac", Covered: true,
		Reasons: []string{"confirmed_bec_case", "invoice_redirection"}, Weight: 4, Severity: 10, Explain: "A fraudster takes over a supplier's or the customer's email and sends an invoice with new bank details. The customer pays a real invoice to a mule account.",
		Checks: []string{"Call the customer on a number from the KYC file, not from the email", "Ask whether the payee's bank details changed recently and how they were told", "Compare with the last payment to this supplier"}},
	{Kind: "app_scam_beneficiary", Label: "Authorised push payment scam", Fraud: "Investment, purchase or romance scam payee", Indicator: "account_hmac", Covered: true,
		Reasons: []string{"investment_scam", "purchase_scam", "romance_scam"}, Weight: 4, Severity: 8, Explain: "The customer is persuaded to send money themselves: fake investment platforms, goods that never arrive, or an online relationship. The payment is authorised, so the bank's usual controls pass.",
		Checks: []string{"Ask the customer what the payment is for and how they found the payee", "Look for pressure, urgency or promised returns", "Offer a cooling-off delay before release"}},
	{Kind: "mule_account", Label: "Money mule account", Fraud: "Account receiving and forwarding scam proceeds", Indicator: "account_hmac", Covered: true,
		Reasons: []string{"mule_network_link", "rapid_pass_through"}, Weight: 3, Severity: 6, Explain: "The payee account receives scam proceeds and forwards them quickly. The holder may be recruited or may have sold the account.",
		Checks: []string{"Check whether the customer knows the payee personally", "Look for round amounts and first-time payees", "Consider declining and filing a suspicious transaction report"}},
	{Kind: "aani_proxy_scam", Label: "Scam payee on Aani mobile number", Fraud: "Instant payment to a mobile-number alias used in impersonation scams", Indicator: "phone_hmac",
		Reasons: []string{"impersonation_scam", "fake_bank_call"}, Normalize: "E.164 UAE mobile number, e.g. +971501234567 (strip spaces, leading 00 → +, local 05 → +9715)",
		PayField: "creditor.proxy.mobile (Aani alias payments)", Weight: 2, Severity: 8, Explain: "Victims get a call or message from someone posing as the bank or police and are told to send money to a 'safe' mobile number via Aani. Instant payments cannot be recalled.",
		Checks: []string{"Call the customer and ask whether someone told them to move money", "Remind them the bank never asks for transfers to a safe account", "Release only after the customer confirms who the payee is"}},
	{Kind: "crypto_offramp_wallet", Label: "Crypto off-ramp wallet", Fraud: "Scam proceeds cashed out to a crypto wallet via a VASP", Indicator: "wallet_hmac",
		Reasons: []string{"investment_scam_cashout", "mule_network_link"}, Normalize: "lower-case wallet address with whitespace removed",
		PayField: "creditor.vasp.wallet (transfers to licensed VASPs)", Weight: 1, Severity: 7, Explain: "Scam proceeds are converted to crypto through a licensed exchange and sent to a wallet controlled by the fraud ring.",
		Checks: []string{"Ask the customer about the investment platform", "Check the exchange and the wallet history if available", "Look for a pattern of growing transfers"}},
	{Kind: "ato_device", Label: "Account takeover device", Fraud: "Device fingerprint seen in confirmed account takeovers", Indicator: "device_hmac", Covered: true,
		Reasons: []string{"account_takeover", "sim_swap"}, Normalize: "device fingerprint hash from the mobile banking SDK, lower-case hex",
		PayField: "channel.device_id (mobile banking session of the payer)", Weight: 1, Severity: 9, Explain: "A criminal logs in to the customer's mobile banking from a device seen in confirmed account takeovers, often after a SIM swap.",
		Checks: []string{"Confirm the session with the customer over a known channel", "Check for a recent SIM change or new device enrolment", "Block the device if the customer does not recognise it"}},
}

func kindInfo(kind string) KindInfo {
	for _, k := range signalKinds {
		if k.Kind == kind {
			return k
		}
	}
	return KindInfo{Kind: kind, Label: kind, Indicator: "unknown"}
}

func (d *Demo) pickKind(rnd *mathrand.Rand) KindInfo {
	total := 0
	for _, k := range signalKinds {
		total += k.Weight
	}
	x := rnd.Intn(total)
	for _, k := range signalKinds {
		if x < k.Weight {
			return k
		}
		x -= k.Weight
	}
	return signalKinds[0]
}

// Txn is one outgoing payment of a Mashreq customer, checked before it leaves.
type Txn struct {
	ID        string     `json:"id"`
	At        time.Time  `json:"at"`
	Customer  string     `json:"customer"`
	Channel   string     `json:"channel"` // UAEFTS (IBAN) or Aani (mobile alias)
	Payee     string     `json:"payee"`
	PayeeType string     `json:"payee_type"`          // iban | mobile
	PayeeID   string     `json:"payee_id"`            // full IBAN or mobile number: Mashreq's own data
	DeviceID  string     `json:"device_id,omitempty"` // payer's mobile banking device fingerprint, if sent from the app
	Amount    int64      `json:"amount"`
	Currency  string     `json:"currency"`
	Status    string     `json:"status"` // approved | held | unverified | released | declined
	Reason    string     `json:"reason"`
	SignalID  string     `json:"signal_id,omitempty"`
	Issuer    string     `json:"issuer,omitempty"`
	Kind      string     `json:"kind,omitempty"`
	GapKind   string     `json:"gap_kind,omitempty"`
	DecidedBy string     `json:"decided_by,omitempty"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`
	NewPayee  bool       `json:"new_payee"`
	Score     int        `json:"score"`
	Priority  string     `json:"priority"` // critical | high | medium | low
	Factors   []Factor   `json:"factors"`
}

// Factor is one explainable part of a payment's risk score.
type Factor struct {
	Label  string `json:"label"`
	Points int    `json:"points"`
}

// DevinTask is the Devin session started for one uncovered signal kind.
type DevinTask struct {
	Kind       string    `json:"kind"`
	Mode       string    `json:"mode"`
	SessionURL string    `json:"session_url,omitempty"`
	At         time.Time `json:"at"`
}

var (
	customers = []string{"Northwind Trading LLC", "Gulf Marine Supplies", "Al Noor Interiors", "Desert Rose Catering", "Falcon Logistics FZE",
		"Saeed A.", "Maria K.", "Omar H.", "Priya N.", "Blue Lagoon Tourism", "Zayed Electronics", "Palm Clinic"}
	payees = []string{"Horizon Building Materials", "Emirates Office Supply", "Crescent Freight", "Oasis Water Co", "Silverline IT", "Al Fajr Contracting",
		"Rashid M.", "Fatima S.", "Investment Desk Ltd", "Dubai Auto Parts", "Meridian Consulting", "Sunrise Rentals"}
)

func randIBAN(rnd *mathrand.Rand) string {
	return fmt.Sprintf("AE%02d%03d%016d", rnd.Intn(90)+10, rnd.Intn(900)+100, rnd.Int63n(1e16))
}

func randDevice(rnd *mathrand.Rand) string {
	return fmt.Sprintf("%016x%016x%016x%016x", rnd.Uint64(), rnd.Uint64(), rnd.Uint64(), rnd.Uint64())
}

func randMobile(rnd *mathrand.Rand) string {
	return fmt.Sprintf("+9715%d%07d", []int{0, 2, 4, 5, 6, 8}[rnd.Intn(6)], rnd.Intn(1e7))
}

// txnFeed simulates Mashreq's outgoing payments: every couple of seconds a
// customer sends money and the node checks the payee before it leaves.
func (d *Demo) txnFeed(stop <-chan struct{}) {
	rnd := mathrand.New(mathrand.NewSource(time.Now().UnixNano() + 7))
	t := time.NewTicker(2500 * time.Millisecond)
	defer t.Stop()
	for i := 0; i < 12; i++ {
		d.newTxn(rnd)
	}
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			d.newTxn(rnd)
		}
	}
}

func (d *Demo) newTxn(rnd *mathrand.Rand) {
	d.mu.Lock()
	d.txnSeq++
	seq := d.txnSeq
	var flagged []string
	for iban := range d.flagged {
		flagged = append(flagged, iban)
	}
	var devices []string
	for dev := range d.flaggedDev {
		devices = append(devices, dev)
	}
	d.mu.Unlock()
	sort.Strings(flagged)
	sort.Strings(devices)

	tx := Txn{ID: fmt.Sprintf("MSQ-%06d", 418200+seq), At: time.Now().UTC(), Customer: customers[rnd.Intn(len(customers))],
		Payee: payees[rnd.Intn(len(payees))], Currency: "AED", Status: "approved"}
	tx.Amount = int64(500+rnd.Intn(60)) * 100
	if rnd.Intn(4) == 0 {
		tx.Amount = int64(1+rnd.Intn(45)) * 10000
	}
	switch r := rnd.Intn(100); {
	case r < 22:
		tx.Channel, tx.PayeeType, tx.PayeeID = "Aani", "mobile", randMobile(rnd)
		tx.Amount = int64(2+rnd.Intn(40)) * 500
	case r < 36 && len(flagged) > 0:
		tx.Channel, tx.PayeeType, tx.PayeeID = "UAEFTS", "iban", flagged[rnd.Intn(len(flagged))]
	default:
		tx.Channel, tx.PayeeType, tx.PayeeID = "UAEFTS", "iban", randIBAN(rnd)
	}
	switch r := rnd.Intn(100); { // about half of the payments are sent from the mobile banking app
	case r < 6 && len(devices) > 0:
		tx.DeviceID = devices[rnd.Intn(len(devices))]
	case r < 55:
		tx.DeviceID = randDevice(rnd)
	}
	tx.NewPayee = rnd.Intn(100) < 35 || tx.PayeeType == "iban" && contains(flagged, tx.PayeeID) && rnd.Intn(3) > 0
	d.check(&tx)
	d.addTxn(tx)
}

// check runs the payee against the signals Mashreq can match. Payments that
// depend on a signal kind the node cannot read yet are held as unverified.
func (d *Demo) check(tx *Txn) {
	now := time.Now().UTC()
	var f []Factor
	add := func(label string, pts int) { f = append(f, Factor{label, pts}) }
	tx.Status, tx.Reason = "approved", "No active warning for this account"
	if tx.PayeeType == "iban" {
		if e, hit := d.B.Check(tx.PayeeID); hit {
			k := kindInfo(e.Envelope.Kind)
			tx.Status, tx.SignalID, tx.Issuer, tx.Kind = "held", e.Envelope.SignalID, issuerName(e.Envelope.Issuer), e.Envelope.Kind
			tx.Reason = fmt.Sprintf("%s reported this account: %s (%s, %d related cases)", tx.Issuer, k.Label, strings.ReplaceAll(e.Payload.ReasonCode, "_", " "), e.Payload.CaseCount)
			if e.Payload.EvidenceLevel == "issuer_analyst_verified" {
				add(fmt.Sprintf("Payee reported by %s, confirmed by their analyst", tx.Issuer), 45)
			} else {
				add(fmt.Sprintf("Payee reported by %s, not yet confirmed", tx.Issuer), 25)
			}
			add(k.Label+" pattern", k.Severity)
			c := e.Payload.CaseCount
			if c > 4 {
				c = 4
			}
			add(fmt.Sprintf("%d related cases at %s", e.Payload.CaseCount, tx.Issuer), 3*c)
		}
	} else {
		// Aani payments go to a mobile alias. Mashreq's node only matches IBANs,
		// so alerts about mobile numbers cannot be checked.
		tx.Reason = "No checkable warnings for this mobile number"
		var issuers []string
		n := 0
		for _, e := range d.B.CacheList() {
			if e.State(now) == node.StateActive && e.Payload.Indicator.Type == "phone_hmac" {
				n++
				if name := issuerName(e.Envelope.Issuer); !contains(issuers, name) {
					issuers = append(issuers, name)
				}
			}
		}
		if n > 0 && tx.Amount >= 5000 {
			tx.Status, tx.GapKind = "unverified", "aani_proxy_scam"
			tx.Reason = fmt.Sprintf("Cannot check: %d active alerts about Aani mobile numbers from %s, and Mashreq does not support this signal type yet", n, strings.Join(issuers, ", "))
			add(fmt.Sprintf("Uncovered alerts about mobile payees: %d, from %s", n, strings.Join(issuers, ", ")), 18+6*min(len(issuers), 3))
			add("Scam payee on Aani mobile number pattern", kindInfo("aani_proxy_scam").Severity)
		}
		add("Instant Aani payment, cannot be recalled", 6)
	}
	if e, hit := d.B.CheckDevice(tx.DeviceID); hit {
		k := kindInfo(e.Envelope.Kind)
		issuer := issuerName(e.Envelope.Issuer)
		reason := fmt.Sprintf("%s reported the payer's mobile banking device: %s (%s, %d related cases)", issuer, k.Label, strings.ReplaceAll(e.Payload.ReasonCode, "_", " "), e.Payload.CaseCount)
		if tx.Status == "held" {
			tx.Reason += "; " + reason
		} else {
			tx.Status, tx.SignalID, tx.Issuer, tx.Kind, tx.Reason = "held", e.Envelope.SignalID, issuer, e.Envelope.Kind, reason
		}
		if e.Payload.EvidenceLevel == "issuer_analyst_verified" {
			add(fmt.Sprintf("Payer device reported by %s, confirmed by their analyst", issuer), 45)
		} else {
			add(fmt.Sprintf("Payer device reported by %s, not yet confirmed", issuer), 25)
		}
		add(k.Label+" pattern", k.Severity)
	}
	switch {
	case tx.Amount >= 100000:
		add(fmt.Sprintf("Large amount, AED %s", fmtAmount(tx.Amount*100)), 15)
	case tx.Amount >= 25000:
		add(fmt.Sprintf("Above AED 25,000"), 8)
	}
	if tx.NewPayee {
		add("First payment from this customer to this payee", 12)
	} else {
		add("Customer has paid this payee before", -10)
	}
	score := 0
	for _, x := range f {
		score += x.Points
	}
	tx.Score = max(0, min(100, score))
	tx.Factors = f
	switch {
	case tx.Score >= 75:
		tx.Priority = "critical"
	case tx.Score >= 55:
		tx.Priority = "high"
	case tx.Score >= 35:
		tx.Priority = "medium"
	default:
		tx.Priority = "low"
	}
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func (d *Demo) addTxn(tx Txn) {
	d.mu.Lock()
	d.txns = append(d.txns, tx)
	if len(d.txns) > 1500 {
		d.txns = d.txns[len(d.txns)-1500:]
	}
	d.mu.Unlock()
	if tx.Status != "approved" {
		d.Log("bank-b", fmt.Sprintf("%s %s AED to %s → %s", tx.ID, fmtAmount(tx.Amount*100), maskPayee(tx), strings.ToUpper(tx.Status)), "warn")
	} else {
		d.broadcast()
	}
}

// DecideTxn records an analyst's decision on a held or unverified payment.
func (d *Demo) DecideTxn(id, action string) error {
	if action != "release" && action != "decline" {
		return fmt.Errorf("action must be release or decline")
	}
	d.mu.Lock()
	var tx *Txn
	for i := range d.txns {
		if d.txns[i].ID == id {
			tx = &d.txns[i]
		}
	}
	if tx == nil {
		d.mu.Unlock()
		return fmt.Errorf("unknown transaction %s", id)
	}
	if tx.Status != "held" && tx.Status != "unverified" {
		d.mu.Unlock()
		return fmt.Errorf("%s is %s, nothing to decide", id, tx.Status)
	}
	now := time.Now().UTC()
	tx.Status = map[string]string{"release": "released", "decline": "declined"}[action]
	tx.DecidedBy, tx.DecidedAt = "Fraud desk analyst", &now
	msg := fmt.Sprintf("Analyst %s %s (%s AED)", tx.Status, tx.ID, fmtAmount(tx.Amount*100))
	d.mu.Unlock()
	tone := "good"
	if action == "decline" {
		tone = "warn"
	}
	d.Log("bank-b", msg, tone)
	return nil
}

// SearchTxns finds payments by transaction id, payee IBAN or mobile number,
// payee or customer name. Spaces and case are ignored.
func (d *Demo) SearchTxns(q string) []Txn {
	norm := func(s string) string { return strings.ToLower(strings.NewReplacer(" ", "", "-", "").Replace(s)) }
	q = norm(q)
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []Txn{}
	for i := len(d.txns) - 1; i >= 0 && len(out) < 100; i-- {
		t := d.txns[i]
		if q == "" || strings.Contains(norm(t.ID), q) || strings.Contains(norm(t.PayeeID), q) || strings.Contains(norm(t.Payee), q) || strings.Contains(norm(t.Customer), q) || strings.Contains(norm(t.SignalID), q) {
			out = append(out, t)
		}
	}
	return out
}

func maskPayee(t Txn) string {
	if t.PayeeType == "mobile" && len(t.PayeeID) > 4 {
		return t.PayeeID[:6] + " ••• " + t.PayeeID[len(t.PayeeID)-4:]
	}
	return mask(t.PayeeID)
}

// opsState is the fraud desk part of /api/state.
func (d *Demo) opsState(now time.Time) map[string]any {
	d.mu.Lock()
	recent := []Txn{}
	pending := []Txn{}
	counts := map[string]int{}
	for i := len(d.txns) - 1; i >= 0; i-- {
		t := d.txns[i]
		counts[t.Status]++
		if len(recent) < 60 {
			recent = append(recent, t)
		}
		if t.Status == "held" || t.Status == "unverified" {
			pending = append(pending, t)
		}
	}
	sort.SliceStable(pending, func(i, j int) bool { return pending[i].Score > pending[j].Score })
	affected := map[string]int{}
	for _, t := range d.txns {
		if t.GapKind != "" {
			affected[t.GapKind]++
		}
	}
	tasks := map[string]DevinTask{}
	for k, v := range d.devinTasks {
		tasks[k] = v
	}
	total := len(d.txns)
	d.mu.Unlock()

	gaps := []map[string]any{}
	byKind := map[string]int{}
	for _, e := range d.B.CacheList() {
		k := kindInfo(e.Envelope.Kind)
		if k.Covered || e.State(now) != node.StateActive {
			continue
		}
		byKind[k.Kind]++
		gaps = append(gaps, map[string]any{"signal_id": e.Envelope.SignalID, "issuer": issuerName(e.Envelope.Issuer), "kind": k.Kind,
			"label": k.Label, "indicator_type": e.Payload.Indicator.Type, "reason_code": e.Payload.ReasonCode, "evidence_level": e.Payload.EvidenceLevel,
			"expires_at": e.Envelope.ExpiresAt, "received_at": e.Envelope.ExpiresAt.Add(-SignalTTL)})
	}
	sort.Slice(gaps, func(i, j int) bool {
		return gaps[i]["received_at"].(time.Time).After(gaps[j]["received_at"].(time.Time))
	})
	kinds := []map[string]any{}
	for _, k := range signalKinds {
		kinds = append(kinds, map[string]any{"kind": k.Kind, "label": k.Label, "fraud": k.Fraud, "indicator": k.Indicator, "covered": k.Covered,
			"explain": k.Explain, "checks": k.Checks, "active_uncovered": byKind[k.Kind], "affected_txns": affected[k.Kind], "devin": tasks[k.Kind]})
	}
	return map[string]any{"txns": recent, "pending": pending, "counts": counts, "total": total, "gaps": gaps, "kinds": kinds}
}

func (d *Demo) indicatorFor(n *node.Node, k KindInfo, rnd *mathrand.Rand) (protocol.Indicator, string) {
	switch k.Indicator {
	case "account_hmac":
		iban := randIBAN(rnd)
		return n.Indicator(iban), iban
	case "device_hmac":
		dev := randDevice(rnd)
		return n.DeviceIndicator(dev), dev
	case "phone_hmac":
		ind := n.Indicator(randMobile(rnd))
		ind.Type = "phone_hmac"
		return ind, ""
	default:
		ind := n.Indicator(fmt.Sprintf("%x", rnd.Int63()))
		ind.Type = k.Indicator
		return ind, ""
	}
}

// devinKindPrompt is the task Devin gets to cover one signal kind at Mashreq.
func devinKindPrompt(k KindInfo, issuers []string, n int, example string) string {
	return fmt.Sprintf(`In the repo iskander-kudashev-13/cis-hack, add support for the network signal kind %q to Mashreq's node (bank-b).

Why: other banks (%s) sent %d active %q alerts (example signal %s). Mashreq stores them but cannot match them to payments, so payments that depend on them are held as "unverified".

Signal: kind %q, indicator type %q = HMAC-SHA256 with the group key over the %s.
Mashreq data: the identifier is in %s.

1. Create a branch devin/mashreq-%s.
2. In server/internal/protocol add the normaliser and an indicator function next to AccountIndicator, with table tests for the normalisation.
3. In server/internal/node let Cache.Match and Node.Check match this indicator type.
4. In server/internal/adapters map the Mashreq field into Payment.
5. In server/internal/demo/fraudops.go mark the kind as covered and check it in Demo.check; payments that match an active alert become "held" with the issuer and reason.
6. Draft a policy rule for this kind (action: review for analyst-verified evidence, score only for suspected). Mashreq Fraud Risk approves it, so put it in the PR description, not in production config.
7. Tests: a matching alert holds the payment, a non-matching one approves it, a retracted or expired alert has no effect.
8. Run cd server && go test ./... and paste the output. Open a draft PR "Mashreq: cover %s signals".

Do not change the hub, signatures or encryption. Use synthetic data only.`,
		k.Kind, strings.Join(issuers, ", "), n, k.Label, example, k.Kind, k.Indicator, k.Normalize, k.PayField, strings.ReplaceAll(k.Kind, "_", "-"), k.Label)
}
