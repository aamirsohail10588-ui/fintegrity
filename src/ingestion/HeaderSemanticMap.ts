import { CanonicalField } from "./constants";

type KeywordMap = Record<CanonicalField, string[]>;

export const HEADER_KEYWORDS: KeywordMap = {
  date: [
    "date",
    "transaction date",
    "posting date",
    "entry date",
    "voucher date",
    "doc date",
    "bill date",
  ],

  type: ["type", "transaction type", "voucher type", "entry type", "voucher"],

  invoice: [
    "invoice",
    "invoice number",
    "invoice no",
    "inv no",
    "bill no",
    "bill number",
    "doc no",
    "document number",
    "reference",
    "ref no",
  ],

  debit: ["debit", "dr", "dr amount", "debit amount", "withdrawal"],

  credit: ["credit", "cr", "cr amount", "credit amount", "deposit"],

  balance: [
    "balance",
    "running balance",
    "closing balance",
    "opening balance",
    "bal",
    "ledger balance",
  ],

  note: [
    "note",
    "description",
    "remarks",
    "narration",
    "particulars",
    "details",
  ],

  status: ["status", "state", "approval status"],
};
