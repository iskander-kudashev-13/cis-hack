package demo

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/adapters"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// Synthetic numbers only.
const (
	scamMobile  = "+971501234567"
	otherMobile = "+971527654321"
)

// rakbank returns the RAKBANK peer node.
func rakbank(t *testing.T, d *Demo) *node.Node {
	t.Helper()
	for _, p := range d.Peers {
		if p.ID == "bank-h" {
			return p
		}
	}
	t.Fatal("RAKBANK peer missing")
	return nil
}

func publishAani(t *testing.T, d *Demo, n *node.Node, mobile string, ttl time.Duration) protocol.Envelope {
	t.Helper()
	p := protocol.Payload{Indicator: n.PhoneIndicator(mobile), EvidenceLevel: "issuer_analyst_verified",
		ReasonCode: "fake_bank_call", AmountBand: "10k-50k AED", ActionHint: "review", FirstSeen: time.Now().UTC(), CaseCount: 2}
	env, err := n.Publish("aani_proxy_scam", p, ttl)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	return env
}

// aaniTxn builds a Mashreq Aani payment from a core-banking record via the bank-b adapter.
func aaniTxn(t *testing.T, mobile string) Txn {
	t.Helper()
	raw := fmt.Sprintf(`{"txn_ref":"pay-aani","creditor":{"proxy":{"mobile":%q}},"amt":{"value":"9500.00","ccy":"AED"}}`, mobile)
	pay, err := adapters.BankB{}.ParsePayment([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	return Txn{ID: pay.PaymentID, Channel: "Aani", PayeeType: "mobile", PayeeID: pay.BeneficiaryMobile,
		Amount: pay.AmountMinor / 100, Currency: pay.Currency, NewPayee: true}
}

func checked(d *Demo, tx Txn) Txn {
	d.check(&tx)
	return tx
}

func TestAaniKindIsCovered(t *testing.T) {
	if !kindInfo("aani_proxy_scam").Covered {
		t.Fatal("aani_proxy_scam should be covered")
	}
	d := newStand(t)
	publishAani(t, d, rakbank(t, d), scamMobile, SignalTTL)
	if gaps := d.opsState(time.Now().UTC())["gaps"].([]map[string]any); len(gaps) != 0 {
		t.Fatalf("covered kind still listed as a gap: %v", gaps)
	}
}

func TestAaniAlertHoldsMatchingPayment(t *testing.T) {
	d := newStand(t)
	env := publishAani(t, d, rakbank(t, d), scamMobile, SignalTTL)

	tx := checked(d, aaniTxn(t, "050 123 4567"))
	if tx.Status != "held" {
		t.Fatalf("status %s, reason %q", tx.Status, tx.Reason)
	}
	if tx.SignalID != env.SignalID || tx.Issuer != "RAKBANK" || tx.Kind != "aani_proxy_scam" || tx.GapKind != "" {
		t.Fatalf("unexpected match details: %+v", tx)
	}
	if !strings.Contains(tx.Reason, "RAKBANK reported this mobile number: Scam payee on Aani mobile number") {
		t.Fatalf("reason %q", tx.Reason)
	}
}

func TestAaniAlertDoesNotHoldOtherNumber(t *testing.T) {
	d := newStand(t)
	publishAani(t, d, rakbank(t, d), scamMobile, SignalTTL)

	tx := checked(d, aaniTxn(t, otherMobile))
	if tx.Status != "approved" || tx.SignalID != "" || tx.GapKind != "" {
		t.Fatalf("non-matching payment: %+v", tx)
	}
}

func TestRetractedAaniAlertHasNoEffect(t *testing.T) {
	d := newStand(t)
	peer := rakbank(t, d)
	env := publishAani(t, d, peer, scamMobile, SignalTTL)
	if tx := checked(d, aaniTxn(t, scamMobile)); tx.Status != "held" {
		t.Fatalf("before retract: %s", tx.Status)
	}
	if _, err := peer.Retract(env.SignalID); err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	if tx := checked(d, aaniTxn(t, scamMobile)); tx.Status != "approved" || tx.SignalID != "" {
		t.Fatalf("after retract: %+v", tx)
	}
}

func TestExpiredAaniAlertHasNoEffect(t *testing.T) {
	d := newStand(t)
	env := publishAani(t, d, rakbank(t, d), scamMobile, 3*time.Second)
	if tx := checked(d, aaniTxn(t, scamMobile)); tx.Status != "held" {
		t.Fatalf("before expiry: %s", tx.Status)
	}
	time.Sleep(time.Until(env.ExpiresAt) + 50*time.Millisecond)
	if tx := checked(d, aaniTxn(t, scamMobile)); tx.Status != "approved" || tx.SignalID != "" {
		t.Fatalf("after expiry: %+v", tx)
	}
}
