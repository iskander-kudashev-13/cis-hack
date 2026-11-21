package protocol

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestNormalizeWallet(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"already normal", "0x52908400098527886e0f7030069857d2e4169ee7", "0x52908400098527886e0f7030069857d2e4169ee7"},
		{"checksum case", "0x52908400098527886E0F7030069857D2E4169EE7", "0x52908400098527886e0f7030069857d2e4169ee7"},
		{"surrounding spaces", "  0xAbC123  ", "0xabc123"},
		{"inner spaces", "0x5290 8400 0985 2788", "0x5290840009852788"},
		{"tabs and newlines", "\t0xABC\n123\r\n", "0xabc123"},
		{"non-breaking space", "0xabc\u00a0123", "0xabc123"},
		{"bech32", "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"},
		{"dashes kept", "0xabc-123", "0xabc-123"},
		{"empty", "", ""},
		{"only whitespace", " \t\n ", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := NormalizeWallet(c.in); got != c.want {
				t.Errorf("NormalizeWallet(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestWalletIndicator(t *testing.T) {
	key := []byte("synthetic-group-key")
	addr := "0x52908400098527886E0F7030069857D2E4169EE7"

	m := hmac.New(sha256.New, key)
	m.Write([]byte("0x52908400098527886e0f7030069857d2e4169ee7"))
	want := Indicator{Type: IndicatorWallet, Value: hex.EncodeToString(m.Sum(nil))}
	if got := WalletIndicator(key, addr); got != want {
		t.Fatalf("WalletIndicator = %+v, want %+v", got, want)
	}
	if WalletIndicator(key, " 0x5290 8400098527886e0f7030069857d2e4169ee7\n") != want {
		t.Error("spacing and case variants must give the same indicator")
	}
	if WalletIndicator([]byte("other-group"), addr) == want {
		t.Error("a different group key must give a different indicator")
	}
	if WalletIndicator(key, "0x52908400098527886e0f7030069857d2e4169ee8") == want {
		t.Error("a different address must give a different indicator")
	}
	if a := AccountIndicator(key, "0x52908400098527886e0f7030069857d2e4169ee7"); a.Type == want.Type {
		t.Error("account and wallet indicators must carry different types")
	}
}
