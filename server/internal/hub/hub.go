// Package hub is the blind relay. It authenticates members, checks issuer
// signatures and revision order, fans ciphertext out to audience inboxes,
// and keeps a hash-chained journal. It never holds a decryption key.
package hub

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

type JournalEntry struct {
	Seq      int64     `json:"seq"`
	At       time.Time `json:"at"`
	Type     string    `json:"type"` // published, revised, delivered, ack, rejected
	SignalID string    `json:"signal_id,omitempty"`
	Revision int       `json:"revision,omitempty"`
	Actor    string    `json:"actor"`
	Detail   string    `json:"detail,omitempty"`
	PrevHash string    `json:"prev_hash"`
	Hash     string    `json:"hash"`
}

type memberState struct {
	member  protocol.Member
	signPub ed25519.PublicKey
	token   string
	groups  map[string]bool
	inbox   []protocol.Delivery
}

type ackRecord struct {
	Member    string             `json:"member"`
	SignalID  string             `json:"signal_id"`
	Revision  int                `json:"revision"`
	Status    protocol.AckStatus `json:"status"`
	At        time.Time          `json:"at"`
	LatencyMS int64              `json:"latency_ms"`
}

type Hub struct {
	mu         sync.Mutex
	members    map[string]*memberState
	byToken    map[string]string
	latest     map[string]protocol.Envelope // signal id -> latest envelope
	stored     []protocol.SignedSignal      // what the hub actually holds
	acks       map[string]ackRecord         // delivery id -> first ack
	deliveries map[string]protocol.Delivery
	journal    []JournalEntry
	cursor     int64
	paused     bool
	now        func() time.Time
	onChange   func()
}

func New() *Hub {
	h := &Hub{now: time.Now}
	h.Reset()
	return h
}

// Reset clears all state but keeps registered members.
func (h *Hub) Reset() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.members == nil {
		h.members = map[string]*memberState{}
		h.byToken = map[string]string{}
	}
	for _, m := range h.members {
		m.inbox = nil
	}
	h.latest = map[string]protocol.Envelope{}
	h.stored = nil
	h.acks = map[string]ackRecord{}
	h.deliveries = map[string]protocol.Delivery{}
	h.journal = nil
	h.cursor = 0
	h.paused = false
}

func (h *Hub) OnChange(f func()) { h.onChange = f }

func (h *Hub) changed() {
	if h.onChange != nil {
		go h.onChange()
	}
}

// Register adds a member with a bearer token and audience groups.
func (h *Hub) Register(m protocol.Member, token string, groups ...string) error {
	pub, err := protocol.DecodeKey(m.SignPub)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return errors.New("bad signing key")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	g := map[string]bool{}
	for _, x := range groups {
		g[x] = true
	}
	h.members[m.ID] = &memberState{member: m, signPub: pub, token: token, groups: g}
	h.byToken[token] = m.ID
	return nil
}

func (h *Hub) SetPaused(p bool) {
	h.mu.Lock()
	h.paused = p
	h.mu.Unlock()
	h.changed()
}

func (h *Hub) Paused() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.paused
}

func (h *Hub) appendJournal(e JournalEntry) {
	h.cursor++
	e.Seq = int64(len(h.journal) + 1)
	e.At = h.now().UTC()
	if n := len(h.journal); n > 0 {
		e.PrevHash = h.journal[n-1].Hash
	} else {
		e.PrevHash = strings.Repeat("0", 16)
	}
	body, _ := json.Marshal(struct {
		Seq      int64
		At       time.Time
		Type     string
		SignalID string
		Revision int
		Actor    string
		Detail   string
		Prev     string
	}{e.Seq, e.At, e.Type, e.SignalID, e.Revision, e.Actor, e.Detail, e.PrevHash})
	sum := sha256.Sum256(body)
	e.Hash = hex.EncodeToString(sum[:])[:16]
	h.journal = append(h.journal, e)
}

var (
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("issuer not in audience group")
	ErrSignature    = errors.New("signature does not verify")
	ErrRevision     = errors.New("revision must be exactly latest+1")
	ErrNotFound     = errors.New("signal not found")
	ErrPaused       = errors.New("hub unavailable")
)

// Publish accepts a new signal (revision 1) or a revision of an existing one.
func (h *Hub) Publish(token string, s protocol.SignedSignal) (protocol.Envelope, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.paused {
		return protocol.Envelope{}, ErrPaused
	}
	issuerID, ok := h.byToken[token]
	if !ok {
		return protocol.Envelope{}, ErrUnauthorized
	}
	issuer := h.members[issuerID]
	env := s.Envelope
	reject := func(err error) (protocol.Envelope, error) {
		h.appendJournal(JournalEntry{Type: "rejected", SignalID: env.SignalID, Revision: env.Revision, Actor: issuerID, Detail: err.Error()})
		h.changed()
		return protocol.Envelope{}, err
	}
	if env.Issuer != issuerID || !issuer.groups[env.Audience] {
		return reject(ErrForbidden)
	}
	if !protocol.Verify(env, s.Ciphertexts, s.Signature, issuer.signPub) {
		return reject(ErrSignature)
	}
	prev, exists := h.latest[env.SignalID]
	switch {
	case !exists && env.Revision != 1:
		return reject(ErrRevision)
	case exists && (prev.Issuer != issuerID):
		return reject(ErrForbidden)
	case exists && env.Revision != prev.Revision+1:
		return reject(ErrRevision)
	case exists && prev.Event == protocol.EventRetract:
		return reject(errors.New("signal already retracted"))
	}
	h.latest[env.SignalID] = env
	h.stored = append(h.stored, s)
	kind := "published"
	if exists {
		kind = "revised"
	}
	h.appendJournal(JournalEntry{Type: kind, SignalID: env.SignalID, Revision: env.Revision, Actor: issuerID,
		Detail: fmt.Sprintf("%s · %s · audience %s", env.Event, env.Kind, env.Audience)})

	now := h.now().UTC()
	for id, m := range h.members {
		if id == issuerID || !m.groups[env.Audience] {
			continue
		}
		if _, ok := s.Ciphertexts[id]; !ok {
			continue
		}
		h.cursor++
		d := protocol.Delivery{
			DeliveryID:  fmt.Sprintf("d_%s_%06d", id, h.cursor),
			Cursor:      h.cursor,
			Envelope:    env,
			Ciphertexts: s.Ciphertexts,
			Signature:   s.Signature,
			AcceptedAt:  now,
		}
		m.inbox = append(m.inbox, d)
		h.deliveries[d.DeliveryID] = d
		h.appendJournal(JournalEntry{Type: "queued", SignalID: env.SignalID, Revision: env.Revision, Actor: "hub", Detail: "for " + id})
	}
	h.changed()
	return env, nil
}

// Inbox returns deliveries for the member after the cursor.
func (h *Hub) Inbox(token string, after int64) ([]protocol.Delivery, int64, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.paused {
		return nil, after, ErrPaused
	}
	id, ok := h.byToken[token]
	if !ok {
		return nil, after, ErrUnauthorized
	}
	out := []protocol.Delivery{}
	next := after
	for _, d := range h.members[id].inbox {
		if d.Cursor > after {
			out = append(out, d)
			next = d.Cursor
		}
	}
	return out, next, nil
}

// Ack records the first processing result for a delivery. Repeats are no-ops.
func (h *Hub) Ack(token, deliveryID string, status protocol.AckStatus) (ackRecord, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.paused {
		return ackRecord{}, ErrPaused
	}
	id, ok := h.byToken[token]
	if !ok {
		return ackRecord{}, ErrUnauthorized
	}
	d, ok := h.deliveries[deliveryID]
	if !ok || !strings.HasPrefix(deliveryID, "d_"+id+"_") {
		return ackRecord{}, ErrNotFound
	}
	if prev, done := h.acks[deliveryID]; done {
		return prev, nil
	}
	now := h.now().UTC()
	rec := ackRecord{Member: id, SignalID: d.Envelope.SignalID, Revision: d.Envelope.Revision, Status: status, At: now,
		LatencyMS: now.Sub(d.AcceptedAt).Milliseconds()}
	h.acks[deliveryID] = rec
	h.appendJournal(JournalEntry{Type: "ack", SignalID: rec.SignalID, Revision: rec.Revision, Actor: id,
		Detail: fmt.Sprintf("%s in %d ms", status, rec.LatencyMS)})
	h.changed()
	return rec, nil
}

// Snapshot is the hub's own view: metadata and ciphertext only.
type Snapshot struct {
	Paused  bool                    `json:"paused"`
	Members []protocol.Member       `json:"members"`
	Stored  []protocol.SignedSignal `json:"stored"`
	Acks    []ackRecord             `json:"acks"`
	Journal []JournalEntry          `json:"journal"`
	ChainOK bool                    `json:"chain_ok"`
}

func (h *Hub) Snapshot() Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	s := Snapshot{Paused: h.paused, Stored: append([]protocol.SignedSignal{}, h.stored...), Journal: append([]JournalEntry{}, h.journal...), ChainOK: true}
	for _, m := range h.members {
		s.Members = append(s.Members, m.member)
	}
	for _, a := range h.acks {
		s.Acks = append(s.Acks, a)
	}
	for i := 1; i < len(h.journal); i++ {
		if h.journal[i].PrevHash != h.journal[i-1].Hash {
			s.ChainOK = false
		}
	}
	return s
}

// Members returns the public directory.
func (h *Hub) Members() []protocol.Member {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []protocol.Member{}
	for _, m := range h.members {
		out = append(out, m.member)
	}
	return out
}

// ---- HTTP ----

func (h *Hub) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/members", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, h.Members())
	})
	mux.HandleFunc("POST /v1/signals", h.handlePublish)
	mux.HandleFunc("POST /v1/signals/{id}/revisions", h.handlePublish)
	mux.HandleFunc("GET /v1/inbox", func(w http.ResponseWriter, r *http.Request) {
		after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
		ds, next, err := h.Inbox(bearer(r), after)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"deliveries": ds, "next_cursor": next})
	})
	mux.HandleFunc("POST /v1/inbox/{delivery_id}/ack", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Status protocol.AckStatus `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, 400, map[string]string{"error": "bad json"})
			return
		}
		rec, err := h.Ack(bearer(r), r.PathValue("delivery_id"), body.Status)
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, 200, rec)
	})
}

func (h *Hub) handlePublish(w http.ResponseWriter, r *http.Request) {
	var s protocol.SignedSignal
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if id := r.PathValue("id"); id != "" && id != s.Envelope.SignalID {
		writeJSON(w, 400, map[string]string{"error": "signal id mismatch"})
		return
	}
	env, err := h.Publish(bearer(r), s)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, env)
}

func bearer(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func writeErr(w http.ResponseWriter, err error) {
	code := 400
	switch {
	case errors.Is(err, ErrUnauthorized):
		code = 401
	case errors.Is(err, ErrForbidden), errors.Is(err, ErrSignature):
		code = 403
	case errors.Is(err, ErrNotFound):
		code = 404
	case errors.Is(err, ErrRevision):
		code = 409
	case errors.Is(err, ErrPaused):
		code = 503
	}
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
