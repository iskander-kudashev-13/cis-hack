package protocol

import "testing"

func TestNormalizeUAEMobile(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"e164", "+971501234567", "+971501234567"},
		{"e164 with spaces", "+971 50 123 4567", "+971501234567"},
		{"international 00", "00971501234567", "+971501234567"},
		{"international 00 with spaces", "00 971 50 123 4567", "+971501234567"},
		{"local 05", "0501234567", "+971501234567"},
		{"local 05 with spaces", "050 123 4567", "+971501234567"},
		{"dashes and brackets", "(050) 123-4567", "+971501234567"},
		{"surrounding whitespace", "\t +971521234567 \n", "+971521234567"},
		{"other mobile prefix", "0581234567", "+971581234567"},
		{"empty", "", ""},
		{"uae landline", "+97142345678", ""},
		{"local landline", "042345678", ""},
		{"too short", "+97150123456", ""},
		{"too long", "+9715012345678", ""},
		{"foreign mobile", "+447911123456", ""},
		{"missing plus", "971501234567", ""},
		{"letters", "+97150123456a", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := NormalizeUAEMobile(c.in); got != c.want {
				t.Errorf("NormalizeUAEMobile(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestPhoneIndicator(t *testing.T) {
	key := []byte("synthetic-group-key")
	want := PhoneIndicator(key, "+971501234567")
	if want.Type != IndicatorPhone || len(want.Value) != 64 {
		t.Fatalf("unexpected indicator %+v", want)
	}
	for _, in := range []string{"00971501234567", "050 123 4567", "+971 50 123 4567"} {
		if got := PhoneIndicator(key, in); got != want {
			t.Errorf("PhoneIndicator(%q) = %+v, want %+v", in, got, want)
		}
	}
	if got := PhoneIndicator(key, "+971501234568"); got.Value == want.Value {
		t.Error("different numbers produced the same indicator")
	}
	if got := PhoneIndicator([]byte("other-key"), "+971501234567"); got.Value == want.Value {
		t.Error("different group keys produced the same indicator")
	}
	if got := PhoneIndicator(key, "042345678"); got.Value != "" {
		t.Errorf("landline produced an indicator: %+v", got)
	}
	if acc := AccountIndicator(key, "+971501234567"); acc.Type == want.Type {
		t.Error("account and phone indicators share a type")
	}
}
