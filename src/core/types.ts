export interface CanonicalLedgerEntry {
  readonly accountId: string;
  readonly debit: number;
  readonly credit: number;
}

export interface CanonicalTransaction {
  readonly reference: string;
  readonly entries: CanonicalLedgerEntry[];
}
