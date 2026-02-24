export const CANONICAL_FIELDS = [
  "date",
  "type",
  "invoice",
  "debit",
  "credit",
  "balance",
  "note",
  "status",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
