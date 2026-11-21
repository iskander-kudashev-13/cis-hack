package demo

import (
	"strings"
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// Synthetic device fingerprints and IBAN.
const (
	atoDevice   = "8c1f4be27a90d35e6b0f2c9a41d7e3b58f06a2c4d9e1b7f3a5c08d2e6f4b1a97"
	cleanDevice = "1d2e3f405162738495a6b7c8d9eaf0b1c2d3e4f5061728394a5b6c7d8e9f0a1b"
	payeeIBAN   = "AE120330000012345678901"
)

func publishATO(t *testing.T, d *Demo, peer *node.Node, ttl time.Duration) protocol.Envelope {
	t.Helper()
	env, err := peer.Publish("ato_device", protocol.Payload{Indicator: peer.DeviceIndicator(atoDevice),
		EvidenceLevel: "issuer_analyst_verified", ReasonCode: "sim_swap", ActionHint: "review", CaseCount: 2}, ttl)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	return env
}

func checkTxn(d *Demo, device string) Txn {
	tx := Txn{ID: "MSQ-TEST", Customer: "Maria K.", Channel: "UAEFTS", Payee: "Rashid M.", PayeeType: "iban",
		PayeeID: payeeIBAN, DeviceID: device, Amount: 18500, Currency: "AED"}
	d.check(&tx)
	return tx
}

func adcb(d *Demo) *node.Node {
	for _, p := range d.Peers {
		if p.Name == "ADCB" {
			return p
		}
	}
	panic("ADCB peer missing")
}

func TestATODeviceIsCovered(t *testing.T) {
	if !kindInfo("ato_device").Covered {
		t.Fatal("ato_device must be covered")
	}
	d := newStand(t)
	publishATO(t, d, adcb(d), SignalTTL)
	if gaps := d.opsState(time.Now().UTC())["gaps"].([]map[string]any); len(gaps) != 0 {
		t.Fatalf("covered kind listed as a gap: %+v", gaps)
	}
}

func TestATODeviceMatchHoldsPayment(t *testing.T) {
	d := newStand(t)
	env := publishATO(t, d, adcb(d), SignalTTL)

	tx := checkTxn(d, strings.ToUpper(atoDevice))
	if tx.Status != "held" || tx.SignalID != env.SignalID || tx.Issuer != "ADCB" || tx.Kind != "ato_device" {
		t.Fatalf("matching device: %+v", tx)
	}
	if !strings.Contains(tx.Reason, "ADCB") || !strings.Contains(tx.Reason, "Account takeover device") {
		t.Errorf("reason should name the issuer and the fraud: %q", tx.Reason)
	}
}

func TestATODeviceNoMatchApproves(t *testing.T) {
	d := newStand(t)
	publishATO(t, d, adcb(d), SignalTTL)
	for _, dev := range []string{cleanDevice, ""} {
		if tx := checkTxn(d, dev); tx.Status != "approved" || tx.SignalID != "" {
			t.Errorf("device %q: %+v", dev, tx)
		}
	}
}

func TestATODeviceRetractedHasNoEffect(t *testing.T) {
	d := newStand(t)
	peer := adcb(d)
	env := publishATO(t, d, peer, SignalTTL)
	if tx := checkTxn(d, atoDevice); tx.Status != "held" {
		t.Fatalf("before retract: %s", tx.Status)
	}
	if _, err := peer.Retract(env.SignalID); err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	if tx := checkTxn(d, atoDevice); tx.Status != "approved" {
		t.Fatalf("after retract: %+v", tx)
	}
}

func TestATODeviceExpiredHasNoEffect(t *testing.T) {
	d := newStand(t)
	env := publishATO(t, d, adcb(d), 2*time.Second)
	if tx := checkTxn(d, atoDevice); tx.Status != "held" {
		t.Fatalf("before expiry: %s", tx.Status)
	}
	time.Sleep(time.Until(env.ExpiresAt) + 50*time.Millisecond)
	if tx := checkTxn(d, atoDevice); tx.Status != "approved" {
		t.Fatalf("after expiry: %+v", tx)
	}
}
