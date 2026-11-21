// Package adapters converts each bank's own record format into the shared
// shape the node understands. This is the layer Devin writes when a new bank
// joins: one adapter + fixtures + a passing conformance test.
package adapters

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// Payment is a bank's outgoing transfer in the shared shape.
type Payment struct {
	PaymentID       string
	BeneficiaryIBAN string // normalized
	AmountMinor     int64
	Currency        string
}

// Case is a confirmed fraud case in the shared shape.
type Case struct {
	CaseID          string
	Customer        string
	BeneficiaryIBAN string // normalized
	AmountMinor     int64
	Currency        string
	Status          string
}

// PaymentAdapter parses one bank's native payment record.
type PaymentAdapter interface {
	BankID() string
	Format() string
	ParsePayment(raw []byte) (Payment, error)
}

// Registry holds every adapter the conformance suite must check.
var Registry = map[string]PaymentAdapter{}

func Register(a PaymentAdapter) { Registry[a.BankID()] = a }

func init() {
	Register(BankB{})
	Register(BankC{})
}

// ---- Bank A: fraud case export (JSON) ----

type bankACase struct {
	CaseID      string `json:"case_id"`
	Customer    string `json:"customer"`
	Beneficiary string `json:"beneficiary_iban"`
	Amount      string `json:"amount"`
	Currency    string `json:"currency"`
	Status      string `json:"status"`
}

// ParseBankACase reads Bank A's case-management export.
func ParseBankACase(raw []byte) (Case, error) {
	var c bankACase
	if err := json.Unmarshal(raw, &c); err != nil {
		return Case{}, fmt.Errorf("bank-a case: %w", err)
	}
	minor, err := toMinor(c.Amount)
	if err != nil {
		return Case{}, err
	}
	if c.Beneficiary == "" {
		return Case{}, fmt.Errorf("bank-a case %s: missing beneficiary_iban", c.CaseID)
	}
	return Case{CaseID: c.CaseID, Customer: c.Customer, BeneficiaryIBAN: protocol.NormalizeIBAN(c.Beneficiary),
		AmountMinor: minor, Currency: strings.ToUpper(c.Currency), Status: c.Status}, nil
}

// ---- Bank B: core banking payment record (JSON, nested, lower-case IBAN with spaces) ----

type BankB struct{}

func (BankB) BankID() string { return "bank-b" }
func (BankB) Format() string { return "core-banking JSON (txn_ref / creditor.iban / amt)" }

func (BankB) ParsePayment(raw []byte) (Payment, error) {
	var p struct {
		TxnRef   string `json:"txn_ref"`
		Creditor struct {
			IBAN string `json:"iban"`
		} `json:"creditor"`
		Amt struct {
			Value string `json:"value"`
			Ccy   string `json:"ccy"`
		} `json:"amt"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return Payment{}, fmt.Errorf("bank-b payment: %w", err)
	}
	if p.Creditor.IBAN == "" {
		return Payment{}, fmt.Errorf("bank-b payment %s: missing creditor.iban", p.TxnRef)
	}
	minor, err := toMinor(p.Amt.Value)
	if err != nil {
		return Payment{}, err
	}
	return Payment{PaymentID: p.TxnRef, BeneficiaryIBAN: protocol.NormalizeIBAN(p.Creditor.IBAN),
		AmountMinor: minor, Currency: strings.ToUpper(p.Amt.Ccy)}, nil
}

// toMinor converts "450000.00" to 45000000.
func toMinor(s string) (int64, error) {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	whole, frac, _ := strings.Cut(s, ".")
	if len(frac) > 2 {
		return 0, fmt.Errorf("amount %q has more than 2 decimals", s)
	}
	for len(frac) < 2 {
		frac += "0"
	}
	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: %w", s, err)
	}
	f, err := strconv.ParseInt(frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: %w", s, err)
	}
	return w*100 + f, nil
}
