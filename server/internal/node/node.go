// Package node is the bank-side connector. It runs inside a bank's perimeter:
// it hashes, signs and encrypts outgoing signals, pulls its own inbox from the
// hub, verifies and decrypts deliveries, keeps a local cache with
// "max revision wins", and answers payment checks locally with no network call.
package node

import (
	"bytes"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

const StaleAfter = 10 * time.Second

type EntryState string

const (
	StateActive    EntryState = "active"
	StateRetracted EntryState = "retracted"
	StateExpired   EntryState = "expired"
)

// CacheEntry is one signal as this bank currently knows it.
type CacheEntry struct {
	Envelope  protocol.Envelope
	Payload   protocol.Payload
	Retracted bool
}

func (e CacheEntry) State(now time.Time) EntryState {
	switch {
	case e.Retracted:
		return StateRetracted
	case !now.Before(e.Envelope.ExpiresAt):
		return StateExpired
	default:
		return StateActive
	}
}

// Cache applies deliveries with "max applied revision wins".
type Cache struct {
	entries map[string]*CacheEntry
}

func NewCache() *Cache { return &Cache{entries: map[string]*CacheEntry{}} }

// Apply stores a verified, decrypted event and returns the ACK status.
func (c *Cache) Apply(env protocol.Envelope, p protocol.Payload, now time.Time) protocol.AckStatus {
	if env.SchemaVersion != protocol.SchemaVersion {
		return protocol.AckInvalid
	}
	cur, ok := c.entries[env.SignalID]
	if ok && env.Revision <= cur.Envelope.Revision {
		return protocol.AckObsolete
	}
	if ok && cur.Retracted {
		return protocol.AckObsolete
	}
	if env.Event == protocol.EventUpsert && !now.Before(env.ExpiresAt) {
		return protocol.AckExpired
	}
	c.entries[env.SignalID] = &CacheEntry{Envelope: env, Payload: p, Retracted: env.Event == protocol.EventRetract}
	return protocol.AckApplied
}

// Match returns the active entry whose indicator has the same type and value.
// An account_hmac never matches a phone_hmac, and an empty indicator never matches.
func (c *Cache) Match(ind protocol.Indicator, now time.Time) (*CacheEntry, bool) {
	if ind.Type == "" || ind.Value == "" {
		return nil, false
	}
	for _, e := range c.entries {
		if e.State(now) == StateActive && e.Payload.Indicator.Type == ind.Type && e.Payload.Indicator.Value == ind.Value {
			return e, true
		}
	}
	return nil, false
}

func (c *Cache) List() []CacheEntry {
	out := make([]CacheEntry, 0, len(c.entries))
	for _, e := range c.entries {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Envelope.SignalID < out[j].Envelope.SignalID })
	return out
}

// Logger receives human-readable events for the timeline.
type Logger func(actor, text, tone string)

// Node is one bank's connector.
type Node struct {
	ID, Name, Token string
	Audience        string
	GroupKey        []byte

	signPriv ed25519.PrivateKey
	encPriv  *ecdh.PrivateKey

	hubURL string
	client *http.Client
	log    Logger
	now    func() time.Time

	mu          sync.Mutex
	cache       *Cache
	cursor      int64
	lastSync    time.Time
	directory   map[string]protocol.Member
	published   map[string]protocol.Envelope // my own signals: id -> latest
	lastPayload map[string]protocol.Payload
}

func New(id, name, token, audience string, groupKey []byte, hubURL string, log Logger) (*Node, error) {
	_, sp, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	ep, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	if log == nil {
		log = func(string, string, string) {}
	}
	n := &Node{ID: id, Name: name, Token: token, Audience: audience, GroupKey: groupKey,
		signPriv: sp, encPriv: ep, hubURL: hubURL, client: &http.Client{Timeout: 3 * time.Second}, log: log, now: time.Now}
	n.Reset()
	return n, nil
}

// Reset drops local state (keys are kept so the directory stays valid).
func (n *Node) Reset() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.cache = NewCache()
	n.cursor = 0
	n.lastSync = time.Time{}
	n.published = map[string]protocol.Envelope{}
	n.lastPayload = map[string]protocol.Payload{}
}

// Member is this node's public directory entry.
func (n *Node) Member() protocol.Member {
	return protocol.Member{ID: n.ID, Name: n.Name,
		SignPub: protocol.EncodeKey(n.signPriv.Public().(ed25519.PublicKey)),
		EncPub:  protocol.EncodeKey(n.encPriv.PublicKey().Bytes())}
}

// Indicator hashes an IBAN with the group key. The IBAN never leaves the bank.
func (n *Node) Indicator(iban string) protocol.Indicator {
	return protocol.AccountIndicator(n.GroupKey, iban)
}

// PhoneIndicator hashes a UAE mobile number (Aani alias) with the group key.
func (n *Node) PhoneIndicator(mobile string) protocol.Indicator {
	return protocol.PhoneIndicator(n.GroupKey, mobile)
}

func (n *Node) refreshDirectory() error {
	var ms []protocol.Member
	if err := n.do("GET", "/v1/members", nil, &ms); err != nil {
		return err
	}
	d := map[string]protocol.Member{}
	for _, m := range ms {
		d[m.ID] = m
	}
	n.mu.Lock()
	n.directory = d
	n.mu.Unlock()
	return nil
}

// Publish creates revision 1 of a new signal.
func (n *Node) Publish(kind string, p protocol.Payload, ttl time.Duration) (protocol.Envelope, error) {
	env := protocol.Envelope{SchemaVersion: protocol.SchemaVersion, SignalID: protocol.RandomID("sig_"), Revision: 1,
		Event: protocol.EventUpsert, Issuer: n.ID, Audience: n.Audience, Kind: kind, ExpiresAt: n.now().UTC().Add(ttl).Truncate(time.Second)}
	return n.send(env, p)
}

// Retract publishes the next revision with event RETRACT.
func (n *Node) Retract(signalID string) (protocol.Envelope, error) {
	n.mu.Lock()
	prev, ok := n.published[signalID]
	p := n.lastPayload[signalID]
	n.mu.Unlock()
	if !ok {
		return protocol.Envelope{}, errors.New("unknown signal")
	}
	env := prev
	env.Revision++
	env.Event = protocol.EventRetract
	return n.send(env, protocol.Payload{ReasonCode: "issuer_retracted", EvidenceLevel: p.EvidenceLevel, Indicator: p.Indicator})
}

func (n *Node) send(env protocol.Envelope, p protocol.Payload) (protocol.Envelope, error) {
	if err := n.refreshDirectory(); err != nil {
		return env, err
	}
	plain, _ := json.Marshal(p)
	cts := map[string]protocol.Sealed{}
	n.mu.Lock()
	dir := n.directory
	n.mu.Unlock()
	for id, m := range dir {
		if id == n.ID {
			continue
		}
		raw, err := protocol.DecodeKey(m.EncPub)
		if err != nil {
			continue
		}
		pub, err := ecdh.X25519().NewPublicKey(raw)
		if err != nil {
			continue
		}
		sealed, err := protocol.Seal(plain, pub, protocol.AssociatedData(env))
		if err != nil {
			return env, err
		}
		cts[id] = sealed
	}
	s := protocol.SignedSignal{Envelope: env, Ciphertexts: cts}
	protocol.Sign(&s, n.signPriv)
	path := "/v1/signals"
	if env.Revision > 1 {
		path = "/v1/signals/" + env.SignalID + "/revisions"
	}
	var out protocol.Envelope
	if err := n.do("POST", path, s, &out); err != nil {
		return env, err
	}
	n.mu.Lock()
	n.published[env.SignalID] = env
	n.lastPayload[env.SignalID] = p
	n.mu.Unlock()
	return env, nil
}

// Sync pulls the inbox once, applies every delivery, then ACKs it.
func (n *Node) Sync() error {
	n.mu.Lock()
	after := n.cursor
	n.mu.Unlock()
	var resp struct {
		Deliveries []protocol.Delivery `json:"deliveries"`
		NextCursor int64               `json:"next_cursor"`
	}
	if err := n.do("GET", fmt.Sprintf("/v1/inbox?after=%d", after), nil, &resp); err != nil {
		return err
	}
	if len(resp.Deliveries) > 0 {
		if err := n.refreshDirectory(); err != nil {
			return err
		}
	}
	for _, d := range resp.Deliveries {
		status := n.process(d)
		if err := n.do("POST", "/v1/inbox/"+d.DeliveryID+"/ack", map[string]any{"status": status}, nil); err != nil {
			return err // cursor not advanced: delivery is retried next time
		}
		n.mu.Lock()
		n.cursor = d.Cursor
		n.mu.Unlock()
	}
	n.mu.Lock()
	if resp.NextCursor > n.cursor {
		n.cursor = resp.NextCursor
	}
	n.lastSync = n.now()
	n.mu.Unlock()
	return nil
}

func (n *Node) process(d protocol.Delivery) protocol.AckStatus {
	env := d.Envelope
	n.mu.Lock()
	issuer, ok := n.directory[env.Issuer]
	n.mu.Unlock()
	if !ok {
		n.log(n.ID, "Rejected "+env.SignalID+": unknown issuer", "bad")
		return protocol.AckInvalid
	}
	pub, err := protocol.DecodeKey(issuer.SignPub)
	if err != nil || !protocol.Verify(env, d.Ciphertexts, d.Signature, ed25519.PublicKey(pub)) {
		n.log(n.ID, "Rejected "+env.SignalID+": signature does not verify", "bad")
		return protocol.AckInvalid
	}
	mine, ok := d.Ciphertexts[n.ID]
	if !ok {
		return protocol.AckInvalid
	}
	plain, err := protocol.Open(mine, n.encPriv, protocol.AssociatedData(env))
	if err != nil {
		n.log(n.ID, "Rejected "+env.SignalID+": cannot decrypt", "bad")
		return protocol.AckInvalid
	}
	var p protocol.Payload
	if err := json.Unmarshal(plain, &p); err != nil {
		return protocol.AckInvalid
	}
	n.mu.Lock()
	status := n.cache.Apply(env, p, n.now())
	n.mu.Unlock()
	switch {
	case status == protocol.AckApplied && env.Event == protocol.EventRetract:
		n.log(n.ID, fmt.Sprintf("Applied retraction of %s (rev %d) from %s", env.SignalID, env.Revision, issuer.Name), "info")
	case status == protocol.AckApplied:
		n.log(n.ID, fmt.Sprintf("Verified signature, decrypted and applied %s rev %d from %s", env.SignalID, env.Revision, issuer.Name), "good")
	default:
		n.log(n.ID, fmt.Sprintf("Ignored %s rev %d: %s", env.SignalID, env.Revision, status), "warn")
	}
	return status
}

// Run polls the inbox every interval until stop is closed.
func (n *Node) Run(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			_ = n.Sync()
		}
	}
}

// Check matches a beneficiary IBAN against the local cache. No network call.
func (n *Node) Check(iban string) (*CacheEntry, bool) {
	return n.CheckIndicator(n.Indicator(iban))
}

// CheckMobile matches a beneficiary Aani mobile number against the local cache. No network call.
func (n *Node) CheckMobile(mobile string) (*CacheEntry, bool) {
	return n.CheckIndicator(n.PhoneIndicator(mobile))
}

// CheckIndicator matches an already computed indicator of any supported type.
func (n *Node) CheckIndicator(ind protocol.Indicator) (*CacheEntry, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.cache.Match(ind, n.now())
}

type Channel struct {
	Status   string     `json:"status"`
	LastSync *time.Time `json:"last_sync_at"`
	Cursor   int64      `json:"cursor"`
}

func (n *Node) Channel() Channel {
	n.mu.Lock()
	defer n.mu.Unlock()
	c := Channel{Status: "live", Cursor: n.cursor}
	if !n.lastSync.IsZero() {
		t := n.lastSync
		c.LastSync = &t
	}
	if n.lastSync.IsZero() || n.now().Sub(n.lastSync) > StaleAfter {
		c.Status = "stale"
	}
	return c
}

func (n *Node) CacheList() []CacheEntry {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.cache.List()
}

func (n *Node) Now() time.Time { return n.now() }

func (n *Node) do(method, path string, in, out any) error {
	var body *bytes.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	} else {
		body = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, n.hubURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+n.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("hub %s %s: %d %s", method, path, resp.StatusCode, e.Error)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ShortIndicator is a display helper.
func ShortIndicator(v string) string {
	if len(v) > 12 {
		return v[:12] + "…"
	}
	return v
}

// GroupKey derives a demo group key. In a pilot it lives in each bank's HSM.
func GroupKey(seed string) []byte {
	s := sha256.Sum256([]byte("scam-weather-group|" + seed))
	return s[:]
}
