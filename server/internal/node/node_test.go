package node

import (
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

func walletEntry(id string, ind protocol.Indicator, exp time.Time) (protocol.Envelope, protocol.Payload) {
	return protocol.Envelope{SchemaVersion: protocol.SchemaVersion, SignalID: id, Revision: 1, Event: protocol.EventUpsert,
			Issuer: "bank-d", Kind: "crypto_offramp_wallet", ExpiresAt: exp},
		protocol.Payload{Indicator: ind, EvidenceLevel: "issuer_analyst_verified", ReasonCode: "investment_scam_cashout"}
}

func TestCacheMatchWallet(t *testing.T) {
	key := GroupKey("test")
	now := time.Now()
	wallet := "0xA1b2C3d4E5f60718293a4B5c6D7e8F9012345678"
	ind := protocol.WalletIndicator(key, wallet)

	c := NewCache()
	env, p := walletEntry("s1", ind, now.Add(time.Hour))
	if c.Apply(env, p, now) != protocol.AckApplied {
		t.Fatal("apply")
	}
	if e, ok := c.Match(protocol.WalletIndicator(key, " 0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678 "), now); !ok || e.Envelope.SignalID != "s1" {
		t.Fatal("normalised wallet should match")
	}
	if _, ok := c.Match(protocol.WalletIndicator(key, "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345679"), now); ok {
		t.Fatal("other wallet matched")
	}
	if _, ok := c.Match(protocol.Indicator{Type: protocol.IndicatorAccount, Value: ind.Value}, now); ok {
		t.Fatal("account indicator with the same value matched a wallet signal")
	}
	if _, ok := c.Match(protocol.Indicator{Type: "device_hmac", Value: ind.Value}, now); ok {
		t.Fatal("unsupported indicator type matched")
	}
	if _, ok := c.Match(ind, now.Add(2*time.Hour)); ok {
		t.Fatal("expired wallet signal matched")
	}

	ret := env
	ret.Revision, ret.Event = 2, protocol.EventRetract
	if c.Apply(ret, p, now) != protocol.AckApplied {
		t.Fatal("retract")
	}
	if _, ok := c.Match(ind, now); ok {
		t.Fatal("retracted wallet signal matched")
	}
}

func TestCheckWalletIgnoresEmptyAddress(t *testing.T) {
	n, err := New("bank-b", "Mashreq", "t", "aud", GroupKey("test"), "http://unused", nil)
	if err != nil {
		t.Fatal(err)
	}
	env, p := walletEntry("s1", n.WalletIndicator(" "), time.Now().Add(time.Hour))
	n.cache.Apply(env, p, time.Now())
	if _, ok := n.CheckWallet(""); ok {
		t.Fatal("empty wallet matched")
	}
	if _, ok := n.CheckWallet(" \t"); ok {
		t.Fatal("whitespace wallet matched")
	}
}
