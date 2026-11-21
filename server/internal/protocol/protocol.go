// Package protocol holds the shared Scam Weather signal contract and the
// cryptography every bank node uses: Ed25519 signatures, per-recipient
// X25519 + AES-GCM encryption, and HMAC account indicators.
//
// The hub only ever sees Envelope + Sealed ciphertexts + Signature.
package protocol

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const SchemaVersion = 1

// Event is what a revision does to a signal.
type Event string

const (
	EventUpsert  Event = "UPSERT"
	EventRetract Event = "RETRACT"
)

// Envelope is the plaintext routing metadata the hub is allowed to read.
type Envelope struct {
	SchemaVersion int       `json:"schema_version"`
	SignalID      string    `json:"signal_id"`
	Revision      int       `json:"revision"`
	Event         Event     `json:"event"`
	Issuer        string    `json:"issuer"`
	Audience      string    `json:"audience"`
	Kind          string    `json:"kind"`
	ExpiresAt     time.Time `json:"expires_at"`
}

// Payload is the confidential part. Only audience members can decrypt it.
type Payload struct {
	Indicator     Indicator `json:"indicator"`
	EvidenceLevel string    `json:"evidence_level"`
	ReasonCode    string    `json:"reason_code"`
	AmountBand    string    `json:"amount_band"`
	ActionHint    string    `json:"action_hint"`
	FirstSeen     time.Time `json:"first_seen"`
	CaseCount     int       `json:"case_count"`
}

type Indicator struct {
	Type  string `json:"type"` // IndicatorAccount or IndicatorPhone
	Value string `json:"value"`
}

// Indicator types this node can compute and match.
const (
	IndicatorAccount = "account_hmac" // HMAC of a normalized IBAN
	IndicatorPhone   = "phone_hmac"   // HMAC of an E.164 UAE mobile number
)

// Sealed is a payload encrypted for one recipient.
type Sealed struct {
	EphemeralPub string `json:"epk"`
	Nonce        string `json:"nonce"`
	Ciphertext   string `json:"ct"`
}

// SignedSignal is what a bank publishes to the hub.
type SignedSignal struct {
	Envelope    Envelope          `json:"envelope"`
	Ciphertexts map[string]Sealed `json:"ciphertexts"` // member id -> sealed payload
	Signature   string            `json:"signature"`
}

// Member is a public directory entry.
type Member struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	SignPub string `json:"sign_pub"`
	EncPub  string `json:"enc_pub"`
}

// Delivery is one item in a member's inbox.
type Delivery struct {
	DeliveryID  string            `json:"delivery_id"`
	Cursor      int64             `json:"cursor"`
	Envelope    Envelope          `json:"envelope"`
	Ciphertexts map[string]Sealed `json:"ciphertexts"` // all recipients: needed to verify the signature
	Signature   string            `json:"signature"`
	AcceptedAt  time.Time         `json:"accepted_at"`
}

type AckStatus string

const (
	AckApplied  AckStatus = "applied"
	AckObsolete AckStatus = "obsolete"
	AckExpired  AckStatus = "expired"
	AckInvalid  AckStatus = "invalid"
)

// SigningBytes is the canonical byte string covered by the issuer signature:
// the envelope plus every recipient ciphertext, in a stable order.
func SigningBytes(env Envelope, cts map[string]Sealed) []byte {
	h := sha256.New()
	envJSON, _ := json.Marshal(env)
	h.Write(envJSON)
	for _, id := range sortedKeys(cts) {
		c := cts[id]
		fmt.Fprintf(h, "|%s:%s:%s:%s", id, c.EphemeralPub, c.Nonce, c.Ciphertext)
	}
	return h.Sum(nil)
}

func sortedKeys(m map[string]Sealed) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

// Sign signs a signal in place.
func Sign(s *SignedSignal, key ed25519.PrivateKey) {
	s.Signature = b64(ed25519.Sign(key, SigningBytes(s.Envelope, s.Ciphertexts)))
}

// Verify checks the issuer signature over envelope + ciphertexts.
func Verify(env Envelope, cts map[string]Sealed, sig string, pub ed25519.PublicKey) bool {
	raw, err := unb64(sig)
	if err != nil {
		return false
	}
	return ed25519.Verify(pub, SigningBytes(env, cts), raw)
}

// Seal encrypts plaintext for one recipient X25519 public key.
// The envelope's signal id and revision are bound as associated data.
func Seal(plaintext []byte, recipient *ecdh.PublicKey, ad []byte) (Sealed, error) {
	eph, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return Sealed{}, err
	}
	shared, err := eph.ECDH(recipient)
	if err != nil {
		return Sealed{}, err
	}
	aead, err := aeadFrom(shared, eph.PublicKey().Bytes(), recipient.Bytes())
	if err != nil {
		return Sealed{}, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return Sealed{}, err
	}
	return Sealed{
		EphemeralPub: b64(eph.PublicKey().Bytes()),
		Nonce:        b64(nonce),
		Ciphertext:   b64(aead.Seal(nil, nonce, plaintext, ad)),
	}, nil
}

// Open decrypts a Sealed payload with the recipient's private key.
func Open(s Sealed, priv *ecdh.PrivateKey, ad []byte) ([]byte, error) {
	epkRaw, err := unb64(s.EphemeralPub)
	if err != nil {
		return nil, err
	}
	epk, err := ecdh.X25519().NewPublicKey(epkRaw)
	if err != nil {
		return nil, err
	}
	shared, err := priv.ECDH(epk)
	if err != nil {
		return nil, err
	}
	aead, err := aeadFrom(shared, epkRaw, priv.PublicKey().Bytes())
	if err != nil {
		return nil, err
	}
	nonce, err := unb64(s.Nonce)
	if err != nil {
		return nil, err
	}
	ct, err := unb64(s.Ciphertext)
	if err != nil {
		return nil, err
	}
	return aead.Open(nil, nonce, ct, ad)
}

func aeadFrom(shared, epk, rpk []byte) (cipher.AEAD, error) {
	info := append(append([]byte("scam-weather/v1|"), epk...), rpk...)
	key, err := hkdf.Key(sha256.New, shared, nil, string(info), 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// AssociatedData binds a ciphertext to its signal id and revision.
func AssociatedData(env Envelope) []byte {
	return []byte(fmt.Sprintf("%s|%d|%s", env.SignalID, env.Revision, env.Issuer))
}

// NormalizeIBAN removes spaces and dashes and upper-cases the account id.
// Every bank must normalize identically or indicators will not match.
func NormalizeIBAN(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	s = strings.NewReplacer(" ", "", "-", "", "\t", "").Replace(s)
	return s
}

// AccountIndicator returns HMAC-SHA256(groupKey, normalized IBAN) in hex.
func AccountIndicator(groupKey []byte, iban string) Indicator {
	m := hmac.New(sha256.New, groupKey)
	m.Write([]byte(NormalizeIBAN(iban)))
	return Indicator{Type: IndicatorAccount, Value: hex.EncodeToString(m.Sum(nil))}
}

// NormalizeUAEMobile returns a UAE mobile number in E.164 form (+9715XXXXXXXX).
// Spaces, dashes and brackets are removed, a leading 00 becomes +, and a local
// 05 prefix becomes +9715. Anything that is not a UAE mobile number returns ""
// so it can never produce an indicator. Every bank must normalize identically.
func NormalizeUAEMobile(s string) string {
	s = strings.NewReplacer(" ", "", "-", "", "\t", "", "(", "", ")", "", ".", "").Replace(strings.TrimSpace(s))
	switch {
	case strings.HasPrefix(s, "00"):
		s = "+" + s[2:]
	case strings.HasPrefix(s, "05"):
		s = "+971" + s[1:]
	}
	if len(s) != 13 || !strings.HasPrefix(s, "+9715") {
		return ""
	}
	for _, r := range s[1:] {
		if r < '0' || r > '9' {
			return ""
		}
	}
	return s
}

// PhoneIndicator returns HMAC-SHA256(groupKey, E.164 UAE mobile) in hex.
// The value is empty when the number does not normalize.
func PhoneIndicator(groupKey []byte, mobile string) Indicator {
	n := NormalizeUAEMobile(mobile)
	if n == "" {
		return Indicator{Type: IndicatorPhone}
	}
	m := hmac.New(sha256.New, groupKey)
	m.Write([]byte(n))
	return Indicator{Type: IndicatorPhone, Value: hex.EncodeToString(m.Sum(nil))}
}

// RandomID returns a short random id with a prefix.
func RandomID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

var ErrBadEncoding = errors.New("bad base64")

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func unb64(s string) ([]byte, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, ErrBadEncoding
	}
	return b, nil
}

// EncodeKey / DecodeKey are exported helpers for the member directory.
func EncodeKey(b []byte) string          { return b64(b) }
func DecodeKey(s string) ([]byte, error) { return unb64(s) }
