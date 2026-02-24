type SynonymMap = Record<string, string>;

export const SYNONYM_REGISTRY: SynonymMap = {
  // Voucher / Transaction
  vch: "voucher",
  vchr: "voucher",
  txn: "transaction",
  trn: "transaction",

  // Date
  dt: "date",

  // Number
  no: "number",
  ref: "reference",
  doc: "document",

  // Amount
  amt: "amount",

  // Debit / Credit
  dr: "debit",
  cr: "credit",

  // Balance
  bal: "balance",

  // Narration
  narr: "narration",
  desc: "description",
  particulars: "description",

  // GST common abbreviations (future-proofing)
  cgst: "cgst",
  sgst: "sgst",
  igst: "igst",
  gst: "gst",
};
