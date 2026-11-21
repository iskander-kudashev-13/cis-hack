package adapters

import (
	"strings"
	"testing"
)

func pacs008(tx string) []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf><CdtTrfTxInf>` + tx + `</CdtTrfTxInf></FIToFICstmrCdtTrf>
</Document>`)
}

func TestBankCRejectsMissingIBAN(t *testing.T) {
	_, err := (BankC{}).ParsePayment(pacs008(`<PmtId><EndToEndId>x</EndToEndId></PmtId>
		<IntrBkSttlmAmt Ccy="AED">100.00</IntrBkSttlmAmt>`))
	if err == nil || !strings.Contains(err.Error(), "IBAN") {
		t.Errorf("expected missing IBAN error, got %v", err)
	}
}

func TestBankCRejectsMissingAmount(t *testing.T) {
	_, err := (BankC{}).ParsePayment(pacs008(`<PmtId><EndToEndId>x</EndToEndId></PmtId>
		<CdtrAcct><Id><IBAN>AE070331234567890123456</IBAN></Id></CdtrAcct>`))
	if err == nil || !strings.Contains(err.Error(), "IntrBkSttlmAmt") {
		t.Errorf("expected missing amount error, got %v", err)
	}
}

func TestBankCNormalizesIBANWithSpaces(t *testing.T) {
	got, err := (BankC{}).ParsePayment(pacs008(`<PmtId><EndToEndId>x</EndToEndId></PmtId>
		<IntrBkSttlmAmt Ccy="AED">1.00</IntrBkSttlmAmt>
		<CdtrAcct><Id><IBAN>ae07 0331 2345 6789 0123 456</IBAN></Id></CdtrAcct>`))
	if err != nil {
		t.Fatal(err)
	}
	if got.BeneficiaryIBAN != "AE070331234567890123456" {
		t.Errorf("BeneficiaryIBAN = %q", got.BeneficiaryIBAN)
	}
}

func TestBankCAmountWithoutDecimals(t *testing.T) {
	got, err := (BankC{}).ParsePayment(pacs008(`<PmtId><EndToEndId>x</EndToEndId></PmtId>
		<IntrBkSttlmAmt Ccy="aed">450000</IntrBkSttlmAmt>
		<CdtrAcct><Id><IBAN>AE070331234567890123456</IBAN></Id></CdtrAcct>`))
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountMinor != 45000000 || got.Currency != "AED" {
		t.Errorf("got %+v", got)
	}
}
