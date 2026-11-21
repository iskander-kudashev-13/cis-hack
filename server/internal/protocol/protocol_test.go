package protocol

import "testing"

func TestNormalizeWallet(t *testing.T) {
	cases := map[string]string{
		"0xABCDEF0123456789":         "0xabcdef0123456789",
		"  0xAbCd EF01\t2345\n6789 ": "0xabcdef0123456789",
		"bc1QSYNTHETIC0000":          "bc1qsynthetic0000",
		" \t\n":                      "",
	}
	for in, want := range cases {
		if got := NormalizeWallet(in); got != want {
			t.Errorf("NormalizeWallet(%q) = %q; want %q", in, got, want)
		}
	}
}

func TestWalletIndicator(t *testing.T) {
	key := []byte("synthetic-group-key")
	a := WalletIndicator(key, "0xABCD EF01 2345")
	b := WalletIndicator(key, "0xabcdef012345")
	if a != b {
		t.Fatalf("normalized variants differ: %v vs %v", a, b)
	}
	if a.Type != IndicatorWalletHMAC || len(a.Value) != 64 {
		t.Fatalf("unexpected indicator %+v", a)
	}
	if WalletIndicator([]byte("other-key"), "0xabcdef012345") == a {
		t.Fatal("different group keys must give different indicators")
	}
	acct := AccountIndicator(key, "0xabcdef012345")
	if acct.Type != IndicatorAccountHMAC || acct == a {
		t.Fatalf("account and wallet indicators must not be equal: %+v vs %+v", acct, a)
	}
}

func TestSupportsIndicator(t *testing.T) {
	if !SupportsIndicator(1, IndicatorAccountHMAC) || !SupportsIndicator(2, IndicatorAccountHMAC) || !SupportsIndicator(2, IndicatorWalletHMAC) {
		t.Fatal("expected support")
	}
	if SupportsIndicator(1, IndicatorWalletHMAC) || SupportsIndicator(2, "phone_hmac") {
		t.Fatal("unexpected support")
	}
}
