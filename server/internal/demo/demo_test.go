package demo

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/node"
	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// newStand starts the full stand on an httptest server: nodes really talk to
// the hub over HTTP with their own tokens.
func newStand(t *testing.T) *Demo {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	d, err := New(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	d.Hub.Routes(mux)
	d.Routes(mux)
	return d
}

func decide(t *testing.T, d *Demo, id string) string {
	t.Helper()
	dec, err := d.Evaluate(id)
	if err != nil {
		t.Fatal(err)
	}
	return dec.Decision
}

func TestEndToEnd(t *testing.T) {
	d := newStand(t)

	if got := decide(t, d, "pay-match"); got != "APPROVED" {
		t.Fatalf("before signal: %s", got)
	}
	if err := d.PublishSignal(); err != nil {
		t.Fatal(err)
	}
	if err := d.PublishSignal(); err == nil {
		t.Fatal("second publish while active should fail")
	}
	if got := decide(t, d, "pay-match"); got != "APPROVED" {
		t.Fatalf("before Bank B synced: %s", got)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	if got := decide(t, d, "pay-match"); got != "REVIEW_REQUIRED" {
		t.Fatalf("after sync: %s", got)
	}
	if got := decide(t, d, "pay-control"); got != "APPROVED" {
		t.Fatalf("control: %s", got)
	}

	snap := d.Hub.Snapshot()
	if len(snap.Acks) != 1 || snap.Acks[0].Status != protocol.AckApplied {
		t.Fatalf("expected one applied ack, got %+v", snap.Acks)
	}
	if !snap.ChainOK {
		t.Fatal("journal chain broken")
	}
	// The hub stores ciphertext only: the plaintext indicator must not appear.
	ind := d.A.Indicator(d.cases[0].BeneficiaryIBAN).Value
	for _, s := range snap.Stored {
		for _, ct := range s.Ciphertexts {
			if ct.Ciphertext == ind {
				t.Fatal("hub holds plaintext indicator")
			}
		}
	}

	if err := d.RetractSignal(); err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	if got := decide(t, d, "pay-match"); got != "APPROVED" {
		t.Fatalf("after retract: %s", got)
	}

	d.Reset()
	if got := decide(t, d, "pay-match"); got != "APPROVED" {
		t.Fatalf("after reset: %s", got)
	}
}

func TestHubRejectsForgedSignal(t *testing.T) {
	d := newStand(t)
	if err := d.PublishSignal(); err != nil {
		t.Fatal(err)
	}
	s := d.Hub.Snapshot().Stored[0]
	s.Envelope.Revision = 2
	s.Envelope.Event = protocol.EventRetract // signature no longer matches
	if _, err := d.Hub.Publish(d.A.Token, s); err == nil {
		t.Fatal("tampered signal accepted")
	}
	// Bank B cannot publish as Bank A.
	s = d.Hub.Snapshot().Stored[0]
	if _, err := d.Hub.Publish(d.B.Token, s); err == nil {
		t.Fatal("impersonation accepted")
	}
}

func TestPausedHubMakesChannelStaleButChecksContinue(t *testing.T) {
	d := newStand(t)
	if err := d.PublishSignal(); err != nil {
		t.Fatal(err)
	}
	if err := d.B.Sync(); err != nil {
		t.Fatal(err)
	}
	d.Hub.SetPaused(true)
	if err := d.B.Sync(); err == nil {
		t.Fatal("sync should fail while paused")
	}
	if got := decide(t, d, "pay-match"); got != "REVIEW_REQUIRED" {
		t.Fatalf("cached signal should still apply: %s", got)
	}
}

func TestCacheOrdering(t *testing.T) {
	c := node.NewCache()
	now := time.Now()
	env := protocol.Envelope{SchemaVersion: 1, SignalID: "s1", Revision: 1, Event: protocol.EventUpsert, ExpiresAt: now.Add(time.Hour)}
	p := protocol.Payload{Indicator: protocol.Indicator{Type: "account_hmac", Value: "x"}}
	if c.Apply(env, p, now) != protocol.AckApplied {
		t.Fatal("v1")
	}
	if c.Apply(env, p, now) != protocol.AckObsolete {
		t.Fatal("duplicate v1")
	}
	ret := env
	ret.Revision, ret.Event = 2, protocol.EventRetract
	if c.Apply(ret, p, now) != protocol.AckApplied {
		t.Fatal("v2 retract")
	}
	if c.Apply(env, p, now) != protocol.AckObsolete {
		t.Fatal("late v1 must not revive")
	}
	if _, ok := c.Match(p.Indicator, now); ok {
		t.Fatal("retracted signal matched")
	}
	exp := protocol.Envelope{SchemaVersion: 1, SignalID: "s2", Revision: 1, Event: protocol.EventUpsert, ExpiresAt: now}
	if c.Apply(exp, p, now) != protocol.AckExpired {
		t.Fatal("expired")
	}
}
