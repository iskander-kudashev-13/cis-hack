package demo

import (
	"strings"
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// Synthetic wallet addresses: not real on-chain addresses.
const (
	flaggedWallet = "0x5A0b54D5dc17e0AAdC383d2db43B0a0D3E029c4c"
	otherWallet   = "0x1111111111111111111111111111111111111111"
)

// publishWallet has FAB (bank-d) report a crypto off-ramp wallet; Mashreq then syncs.
func publishWallet(t *testing.T, d *Demo, wallet string, ttl time.Duration) (*node.Node, protocol.Envelope) {
	t.Helper()
	fab := d.Peers[0]
	p := protocol.Payload{Indicator: fab.WalletIndicator(wallet), EvidenceLevel: "issuer_analyst_verified",
		ReasonCode: "investment_scam_cashout", AmountBand: "50k-100k AED", ActionHint: "review", FirstSeen: time.Now().UTC(), CaseCount: 2}
	env, err := fab.Publish("crypto_offramp_wallet", p, ttl)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	return fab, env
}

func walletTxn(wallet string) Txn {
	return Txn{ID: "MSQ-TEST", Customer: "Saeed A.", Channel: "UAEFTS", Payee: "Dune Digital Assets FZE",
		PayeeType: "wallet", PayeeID: wallet, Amount: 85000, Currency: "AED", NewPayee: true}
}

func TestCryptoOfframpKindIsCovered(t *testing.T) {
	k := kindInfo("crypto_offramp_wallet")
	if !k.Covered || k.Indicator != protocol.IndicatorWallet {
		t.Fatalf("kind info: %+v", k)
	}
	d := newStand(t)
	publishWallet(t, d, flaggedWallet, SignalTTL)
	if gaps := d.opsState(time.Now().UTC())["gaps"].([]map[string]any); len(gaps) != 0 {
		t.Fatalf("covered kind still listed as a gap: %v", gaps)
	}
}

func TestWalletAlertHoldsMatchingPayment(t *testing.T) {
	d := newStand(t)
	_, env := publishWallet(t, d, flaggedWallet, SignalTTL)

	// Same wallet as the customer typed it: different case and spacing.
	tx := walletTxn(" 0x5a0b 54d5dc17e0aadc383d2db43b0a0d3e029C4C ")
	d.check(&tx)
	if tx.Status != "held" || tx.SignalID != env.SignalID || tx.Issuer != "FAB" || tx.Kind != "crypto_offramp_wallet" {
		t.Fatalf("expected held by FAB alert %s, got %+v", env.SignalID, tx)
	}
	if !strings.Contains(tx.Reason, "FAB reported this wallet: Crypto off-ramp wallet") {
		t.Fatalf("reason: %q", tx.Reason)
	}

	other := walletTxn(otherWallet)
	d.check(&other)
	if other.Status != "approved" || other.SignalID != "" {
		t.Fatalf("non-matching wallet: %+v", other)
	}

	// An IBAN payment must not match a wallet alert even with the same string.
	iban := Txn{PayeeType: "iban", PayeeID: flaggedWallet, Amount: 85000, Currency: "AED"}
	d.check(&iban)
	if iban.Status != "approved" {
		t.Fatalf("IBAN payment matched a wallet alert: %+v", iban)
	}
}

func TestRetractedWalletAlertHasNoEffect(t *testing.T) {
	d := newStand(t)
	fab, env := publishWallet(t, d, flaggedWallet, SignalTTL)
	if _, err := fab.Retract(env.SignalID); err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	tx := walletTxn(flaggedWallet)
	d.check(&tx)
	if tx.Status != "approved" {
		t.Fatalf("retracted alert still applies: %+v", tx)
	}
}

func TestExpiredWalletAlertHasNoEffect(t *testing.T) {
	d := newStand(t)
	_, env := publishWallet(t, d, flaggedWallet, 2*time.Second)
	tx := walletTxn(flaggedWallet)
	d.check(&tx)
	if tx.Status != "held" {
		t.Fatalf("alert should apply before expiry: %+v", tx)
	}
	time.Sleep(time.Until(env.ExpiresAt) + 50*time.Millisecond)
	tx = walletTxn(flaggedWallet)
	d.check(&tx)
	if tx.Status != "approved" {
		t.Fatalf("expired alert still applies: %+v", tx)
	}
}
