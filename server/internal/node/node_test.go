package node

import (
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

const device = "8c1f4be27a90d35e6b0f2c9a41d7e3b58f06a2c4d9e1b7f3a5c08d2e6f4b1a97" // synthetic

func deviceSignal(id string, ind protocol.Indicator, now time.Time) (protocol.Envelope, protocol.Payload) {
	env := protocol.Envelope{SchemaVersion: 1, SignalID: id, Revision: 1, Event: protocol.EventUpsert, Issuer: "bank-e",
		Kind: "ato_device", ExpiresAt: now.Add(time.Hour)}
	return env, protocol.Payload{Indicator: ind, EvidenceLevel: "issuer_analyst_verified", ReasonCode: "account_takeover"}
}

func TestCacheMatchesDeviceIndicator(t *testing.T) {
	key := GroupKey("test")
	now := time.Now()
	c := NewCache()
	env, p := deviceSignal("s1", protocol.DeviceIndicator(key, device), now)
	if c.Apply(env, p, now) != protocol.AckApplied {
		t.Fatal("apply")
	}
	if _, ok := c.Match(protocol.DeviceIndicator(key, " "+device[:8]+":"+device[8:]), now); !ok {
		t.Error("normalised device id should match")
	}
	if _, ok := c.Match(protocol.DeviceIndicator(key, "00"+device[2:]), now); ok {
		t.Error("other device matched")
	}
	if _, ok := c.Match(protocol.Indicator{Type: "account_hmac", Value: p.Indicator.Value}, now); ok {
		t.Error("account indicator with the same value must not match a device signal")
	}
	if _, ok := c.Match(protocol.Indicator{}, now); ok {
		t.Error("empty indicator matched")
	}
	if _, ok := c.Match(p.Indicator, env.ExpiresAt); ok {
		t.Error("expired device signal matched")
	}
	ret := env
	ret.Revision, ret.Event = 2, protocol.EventRetract
	if c.Apply(ret, p, now) != protocol.AckApplied {
		t.Fatal("retract")
	}
	if _, ok := c.Match(p.Indicator, now); ok {
		t.Error("retracted device signal matched")
	}
}

func TestNodeCheckDevice(t *testing.T) {
	n, err := New("bank-b", "Mashreq", "t", "aud", GroupKey("test"), "http://unused", nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	n.now = func() time.Time { return now }
	env, p := deviceSignal("s1", n.DeviceIndicator(device), now)
	n.cache.Apply(env, p, now)

	if e, ok := n.CheckDevice(device); !ok || e.Envelope.SignalID != "s1" {
		t.Fatalf("CheckDevice = %v, %v", e, ok)
	}
	if _, ok := n.CheckDevice(""); ok {
		t.Error("empty device id matched")
	}
	if _, ok := n.Check(device); ok {
		t.Error("IBAN check must not match a device signal")
	}
	now = env.ExpiresAt
	if _, ok := n.CheckDevice(device); ok {
		t.Error("expired signal matched")
	}
}
