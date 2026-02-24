import {
  replay,
  computeHistoryRoot,
  createSnapshot,
  validateSnapshot,
} from "../core";

import { PostgresEventStore } from "../infrastructure/PostgresEventStore";

import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";

export async function runSandbox(): Promise<void> {
  const store = new PostgresEventStore();

  const events = await store.getByEntity("FIN-IN-001");

  const historyRoot = computeHistoryRoot(events);
  const snapshot = createSnapshot(historyRoot, events.length);

  validateSnapshot(snapshot, events);

  const transactionCount = replay<number>(events, 0, (state, event) =>
    event.metadata.eventType === "transaction_ingested" ? state + 1 : state,
  );

  const balances = replay<AccountBalanceState>(
    events,
    {},
    accountBalanceReducer,
  );

  console.log("Transaction Count:", transactionCount);
  console.log("Balances:", balances);
  console.log("Snapshot:", snapshot.snapshotId);
}
