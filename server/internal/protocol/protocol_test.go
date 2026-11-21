package protocol

import "testing"

func TestNormalizeDeviceID(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"already normalised", "3f9a0c7e5b21d4e8", "3f9a0c7e5b21d4e8"},
		{"upper-case hex", "3F9A0C7E5B21D4E8", "3f9a0c7e5b21d4e8"},
		{"surrounding whitespace", "  3f9a0c7e5b21d4e8\n", "3f9a0c7e5b21d4e8"},
		{"colon separated", "3F:9A:0C:7E:5B:21:D4:E8", "3f9a0c7e5b21d4e8"},
		{"dash separated", "3f9a0c7e-5b21-d4e8", "3f9a0c7e5b21d4e8"},
		{"spaces and tabs", "3f9a 0c7e\t5b21 d4e8", "3f9a0c7e5b21d4e8"},
		{"empty", "", ""},
		{"whitespace only", " \t ", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := NormalizeDeviceID(c.in); got != c.want {
				t.Errorf("NormalizeDeviceID(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestDeviceIndicator(t *testing.T) {
	key := []byte("synthetic-group-key")
	want := DeviceIndicator(key, "3f9a0c7e5b21d4e8")
	if want.Type != "device_hmac" || len(want.Value) != 64 {
		t.Fatalf("unexpected indicator %+v", want)
	}
	for _, in := range []string{"3F9A0C7E5B21D4E8", " 3f:9a:0c:7e:5b:21:d4:e8 "} {
		if got := DeviceIndicator(key, in); got != want {
			t.Errorf("DeviceIndicator(%q) = %+v, want %+v", in, got, want)
		}
	}
	if got := DeviceIndicator([]byte("other-group"), "3f9a0c7e5b21d4e8"); got == want {
		t.Error("indicator must depend on the group key")
	}
	if got := DeviceIndicator(key, "3f9a0c7e5b21d4e9"); got == want {
		t.Error("different devices must not collide")
	}
	if acc := AccountIndicator(key, "3f9a0c7e5b21d4e8"); acc.Value == want.Value && acc.Type == want.Type {
		t.Error("device and account indicators must differ in type")
	}
}
