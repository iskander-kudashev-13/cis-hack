package adapters

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestConformance runs every bank's fixtures through its registered adapter.
// A bank folder in testdata without a registered adapter is a pending
// onboarding task (for example bank-c, which Devin implements).
func TestConformance(t *testing.T) {
	dirs, err := os.ReadDir("testdata")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		bank := d.Name()
		t.Run(bank, func(t *testing.T) {
			a, ok := Registry[bank]
			if !ok {
				t.Skipf("%s has fixtures but no adapter yet: onboarding task for Devin", bank)
			}
			raw, err := os.ReadFile(filepath.Join("testdata", bank, "expected.json"))
			if err != nil {
				t.Fatal(err)
			}
			var expected map[string]Payment
			if err := json.Unmarshal(raw, &expected); err != nil {
				t.Fatal(err)
			}
			for file, want := range expected {
				body, err := os.ReadFile(filepath.Join("testdata", bank, file))
				if err != nil {
					t.Fatal(err)
				}
				got, err := a.ParsePayment(body)
				if err != nil {
					t.Fatalf("%s: %v", file, err)
				}
				if got != want {
					t.Errorf("%s:\n got  %+v\n want %+v", file, got, want)
				}
			}
		})
	}
}

func TestToMinor(t *testing.T) {
	cases := map[string]int64{"450000.00": 45000000, "450000": 45000000, "12500.5": 1250050, "1,000.25": 100025}
	for in, want := range cases {
		got, err := toMinor(in)
		if err != nil || got != want {
			t.Errorf("toMinor(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	if _, err := toMinor("1.234"); err == nil {
		t.Error("expected error for 3 decimals")
	}
}

func TestBankBRejectsMissingIBAN(t *testing.T) {
	if _, err := (BankB{}).ParsePayment([]byte(`{"txn_ref":"x","amt":{"value":"1","ccy":"AED"}}`)); err == nil {
		t.Error("expected error")
	}
}

func TestBankBMapsVASPWallet(t *testing.T) {
	raw := `{"txn_ref":"pay-vasp","creditor":{"iban":"AE12 0860 0000 0012 3456 789","vasp":{"name":"Example VASP","wallet":" 0xAB12 cd34\tEF56 "}},"amt":{"value":"1000","ccy":"AED"}}`
	p, err := (BankB{}).ParsePayment([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if p.BeneficiaryWallet != "0xab12cd34ef56" {
		t.Errorf("wallet = %q", p.BeneficiaryWallet)
	}
	p, err = (BankB{}).ParsePayment([]byte(`{"txn_ref":"x","creditor":{"iban":"AE12"},"amt":{"value":"1","ccy":"AED"}}`))
	if err != nil || p.BeneficiaryWallet != "" {
		t.Errorf("payment without vasp: wallet %q, err %v", p.BeneficiaryWallet, err)
	}
}
