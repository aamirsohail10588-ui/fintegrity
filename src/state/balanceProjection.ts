import type { DomainEvent } from "../core";
import type { CanonicalTransaction } from "../core";

export interface AccountBalanceState {
  readonly [account: string]: number;
}

export function accountBalanceReducer(
  state: AccountBalanceState,
  event: DomainEvent<unknown>,
): AccountBalanceState {
  if (
    event.metadata.eventType !== "transaction_ingested" &&
    event.metadata.eventType !== "transaction_reversed"
  ) {
    return state;
  }

  const tx = event.payload as CanonicalTransaction;

  const newState = { ...state };

  for (const entry of tx.entries) {
    const existingBalance = newState[entry.accountId] ?? 0;

    newState[entry.accountId] = existingBalance + entry.debit - entry.credit;
  }

  return newState;
}
