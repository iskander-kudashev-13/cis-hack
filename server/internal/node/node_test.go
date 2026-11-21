package node

import (
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

var testKey = GroupKey("synthetic-test-group")

func phoneEntry(id string, rev int, ev protocol.Event, mobile string, expires time.Time) (protocol.Envelope, protocol.Payload) {
	env := protocol.Envelope{SchemaVersion: protocol.SchemaVersion, SignalID: id, Revision: rev, Event: ev,
		Issuer: "bank-h", Kind: "aani_proxy_scam", ExpiresAt: expires}
	return env, protocol.Payload{Indicator: protocol.PhoneIndicator(testKey, mobile), EvidenceLevel: "issuer_analyst_verified"}
}

func TestCacheMatchPhoneIndicator(t *testing.T) {
	now := time.Now()
	c := NewCache()
	env, p := phoneEntry("s1", 1, protocol.EventUpsert, "+971501234567", now.Add(time.Hour))
	if c.Apply(env, p, now) != protocol.AckApplied {
		t.Fatal("apply")
	}
	if e, ok := c.Match(protocol.PhoneIndicator(testKey, "050 123 4567"), now); !ok || e.Envelope.SignalID != "s1" {
		t.Fatal("same number in local format should match")
	}
	if _, ok := c.Match(protocol.PhoneIndicator(testKey, "+971501234568"), now); ok {
		t.Fatal("different number matched")
	}
	// Same HMAC value but a different indicator type must not match.
	if _, ok := c.Match(protocol.Indicator{Type: protocol.IndicatorAccount, Value: p.Indicator.Value}, now); ok {
		t.Fatal("account_hmac matched a phone_hmac entry")
	}
	if _, ok := c.Match(protocol.PhoneIndicator(testKey, "not a number"), now); ok {
		t.Fatal("empty indicator matched")
	}
	if _, ok := c.Match(p.Indicator, now.Add(2*time.Hour)); ok {
		t.Fatal("expired entry matched")
	}
	ret, rp := phoneEntry("s1", 2, protocol.EventRetract, "+971501234567", now.Add(time.Hour))
	if c.Apply(ret, rp, now) != protocol.AckApplied {
		t.Fatal("retract")
	}
	if _, ok := c.Match(p.Indicator, now); ok {
		t.Fatal("retracted entry matched")
	}
}

func TestNodeCheckMobile(t *testing.T) {
	n, err := New("bank-b", "Mashreq", "token", "aud", testKey, "http://127.0.0.1:0", nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	n.now = func() time.Time { return now }
	env, p := phoneEntry("s1", 1, protocol.EventUpsert, "00971501234567", now.Add(time.Minute))
	n.cache.Apply(env, p, now)

	if _, ok := n.CheckMobile("+971 50 123 4567"); !ok {
		t.Fatal("CheckMobile should match")
	}
	if _, ok := n.CheckMobile("+971521234567"); ok {
		t.Fatal("CheckMobile matched a different number")
	}
	if _, ok := n.Check("+971501234567"); ok {
		t.Fatal("IBAN check matched a phone alert")
	}
	now = now.Add(2 * time.Minute)
	if _, ok := n.CheckMobile("+971501234567"); ok {
		t.Fatal("expired alert matched")
	}
}
