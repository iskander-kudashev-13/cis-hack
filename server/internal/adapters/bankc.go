package adapters

import (
	"encoding/xml"
	"fmt"
	"strings"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/protocol"
)

// ---- Bank C: ISO 20022 pacs.008 FI-to-FI customer credit transfer (XML) ----

type BankC struct{}

func (BankC) BankID() string { return "bank-c" }
func (BankC) Format() string { return "ISO 20022 pacs.008" }

type pacs008Tx struct {
	EndToEndID string `xml:"PmtId>EndToEndId"`
	Amount     *struct {
		Value string `xml:",chardata"`
		Ccy   string `xml:"Ccy,attr"`
	} `xml:"IntrBkSttlmAmt"`
	CdtrIBAN string `xml:"CdtrAcct>Id>IBAN"`
}

func (BankC) ParsePayment(raw []byte) (Payment, error) {
	var doc struct {
		Txs []pacs008Tx `xml:"FIToFICstmrCdtTrf>CdtTrfTxInf"`
	}
	if err := xml.Unmarshal(raw, &doc); err != nil {
		return Payment{}, fmt.Errorf("bank-c payment: %w", err)
	}
	if len(doc.Txs) != 1 {
		return Payment{}, fmt.Errorf("bank-c payment: expected 1 CdtTrfTxInf, got %d", len(doc.Txs))
	}
	tx := doc.Txs[0]
	id := strings.TrimSpace(tx.EndToEndID)
	iban := strings.TrimSpace(tx.CdtrIBAN)
	if iban == "" {
		return Payment{}, fmt.Errorf("bank-c payment %s: missing CdtrAcct/Id/IBAN", id)
	}
	if tx.Amount == nil || strings.TrimSpace(tx.Amount.Value) == "" {
		return Payment{}, fmt.Errorf("bank-c payment %s: missing IntrBkSttlmAmt", id)
	}
	minor, err := toMinor(tx.Amount.Value)
	if err != nil {
		return Payment{}, fmt.Errorf("bank-c payment %s: %w", id, err)
	}
	return Payment{PaymentID: id, BeneficiaryIBAN: protocol.NormalizeIBAN(iban),
		AmountMinor: minor, Currency: strings.ToUpper(strings.TrimSpace(tx.Amount.Ccy))}, nil
}
