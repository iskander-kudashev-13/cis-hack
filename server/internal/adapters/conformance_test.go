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

func TestBankBDeviceID(t *testing.T) {
	const want = "8c1f4be27a90d35e6b0f2c9a41d7e3b58f06a2c4d9e1b7f3a5c08d2e6f4b1a97"
	base := `{"txn_ref":"x","creditor":{"iban":"AE12 0330 0000 1234 5678 901"},"amt":{"value":"1","ccy":"AED"}`
	cases := []struct {
		name, channel, want string
		wantErr             bool
	}{
		{"no channel", ``, "", false},
		{"string channel", `,"channel":"corporate_online"`, "", false},
		{"mobile session", `,"channel":{"type":"mobile_banking","device_id":"` + want + `"}`, want, false},
		{"upper-case with separators", `,"channel":{"device_id":" 8C1F4BE2:7A90D35E:6B0F2C9A:41D7E3B5:8F06A2C4:D9E1B7F3:A5C08D2E:6F4B1A97 "}`, want, false},
		{"object without device", `,"channel":{"type":"branch"}`, "", false},
		{"not hex", `,"channel":{"device_id":"android-pixel-7"}`, "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := (BankB{}).ParsePayment([]byte(base + c.channel + `}`))
			if c.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.DeviceID != c.want {
				t.Errorf("DeviceID = %q, want %q", got.DeviceID, c.want)
			}
		})
	}
}
