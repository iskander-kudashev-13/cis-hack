package node

import (
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

const (
	testIBAN   = "AE07 0331 2345 6789 0123 456"
	testWallet = "0xABCD EF01 2345 6789 ABCD EF01 2345 6789 ABCD EF01"
)

func testNode(t *testing.T, now time.Time) *Node {
	t.Helper()
	n, err := New("bank-b", "Bank B", "tok", "test", GroupKey("synthetic"), "http://127.0.0.1:0", nil)
	if err != nil {
		t.Fatal(err)
	}
	n.now = func() time.Time { return now }
	return n
}

func upsert(id string, now time.Time) protocol.Envelope {
	return protocol.Envelope{SchemaVersion: protocol.SchemaVersion, SignalID: id, Revision: 1, Event: protocol.EventUpsert, ExpiresAt: now.Add(time.Hour)}
}

func TestWalletSignalMatches(t *testing.T) {
	now := time.Now()
	n := testNode(t, now)
	p := protocol.Payload{Indicator: n.WalletIndicator(testWallet), ReasonCode: "bec_wallet"}
	if st := n.cache.Apply(upsert("w1", now), p, now); st != protocol.AckApplied {
		t.Fatalf("apply: %s", st)
	}
	e, ok := n.CheckWallet("0xabcdef0123456789abcdef0123456789abcdef01")
	if !ok || e.Envelope.SignalID != "w1" {
		t.Fatalf("wallet signal did not match: %v %v", e, ok)
	}
	if _, ok := n.Check(testWallet); ok {
		t.Fatal("wallet signal must not match an IBAN check")
	}
	if _, ok := n.CheckWallet(""); ok {
		t.Fatal("empty wallet matched")
	}
}

func TestIBANSignalDoesNotMatchWalletPayment(t *testing.T) {
	now := time.Now()
	n := testNode(t, now)
	n.cache.Apply(upsert("a1", now), protocol.Payload{Indicator: n.Indicator(testIBAN)}, now)
	// Same raw string hashed as an account: types differ, so no cross-type match.
	n.cache.Apply(upsert("a2", now), protocol.Payload{Indicator: protocol.AccountIndicator(n.GroupKey, protocol.NormalizeWallet(testWallet))}, now)
	if _, ok := n.CheckWallet(testWallet); ok {
		t.Fatal("IBAN signal matched a wallet payment")
	}
	if _, ok := n.Check(testIBAN); !ok {
		t.Fatal("IBAN signal should still match IBAN payment")
	}
	if _, ok := n.Check(""); ok {
		t.Fatal("empty IBAN matched")
	}
}

func TestWalletRetractWins(t *testing.T) {
	now := time.Now()
	n := testNode(t, now)
	p := protocol.Payload{Indicator: n.WalletIndicator(testWallet)}
	env := upsert("w1", now)
	n.cache.Apply(env, p, now)
	ret := env
	ret.Revision, ret.Event = 2, protocol.EventRetract
	if st := n.cache.Apply(ret, p, now); st != protocol.AckApplied {
		t.Fatalf("retract: %s", st)
	}
	if st := n.cache.Apply(env, p, now); st != protocol.AckObsolete {
		t.Fatalf("late rev 1 must not revive: %s", st)
	}
	again := env
	again.Revision = 3
	if st := n.cache.Apply(again, p, now); st != protocol.AckObsolete {
		t.Fatalf("upsert after retract must not revive: %s", st)
	}
	if _, ok := n.CheckWallet(testWallet); ok {
		t.Fatal("retracted wallet signal matched")
	}
}

func TestApplySchemaAndIndicatorValidation(t *testing.T) {
	now := time.Now()
	c := NewCache()
	v1 := upsert("s1", now)
	v1.SchemaVersion = 1
	if st := c.Apply(v1, protocol.Payload{Indicator: protocol.Indicator{Type: protocol.IndicatorAccountHMAC, Value: "x"}}, now); st != protocol.AckApplied {
		t.Fatalf("v1 account_hmac: %s", st)
	}
	v1.SignalID = "s2"
	if st := c.Apply(v1, protocol.Payload{Indicator: protocol.Indicator{Type: protocol.IndicatorWalletHMAC, Value: "x"}}, now); st != protocol.AckInvalid {
		t.Fatalf("v1 wallet_hmac must be invalid: %s", st)
	}
	v2 := upsert("s3", now)
	if st := c.Apply(v2, protocol.Payload{Indicator: protocol.Indicator{Type: "phone_hmac", Value: "x"}}, now); st != protocol.AckInvalid {
		t.Fatalf("unknown type must be invalid: %s", st)
	}
	v3 := upsert("s4", now)
	v3.SchemaVersion = protocol.SchemaVersion + 1
	if st := c.Apply(v3, protocol.Payload{Indicator: protocol.Indicator{Type: protocol.IndicatorAccountHMAC, Value: "x"}}, now); st != protocol.AckInvalid {
		t.Fatalf("future schema must be invalid: %s", st)
	}
}
