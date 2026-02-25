import {
  replay,
  computeHistoryRoot,
  createSnapshot,
  validateSnapshot,
} from "../core";

import { PostgresEventStore } from "../infrastructure/PostgresEventStore";

import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";

import { v4 as uuid } from "uuid";
import { getPool } from "../infrastructure/db";

export async function runSandbox(): Promise<void> {
  const store = new PostgresEventStore();
  const pool = getPool();
  const client = await pool.connect();

  const tenantId = uuid();
  const entityId = "FIN-IN-001";

  try {
    await client.query("BEGIN");

    // Create tenant
    await client.query(
      `INSERT INTO tenants (id, name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [tenantId, "Sandbox Tenant"],
    );

    // Create entity under tenant
    await client.query(
      `INSERT INTO entities (id, version, tenant_id)
       VALUES ($1, 0, $2)
       ON CONFLICT DO NOTHING`,
      [entityId, tenantId],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const events = await store.getByEntity(entityId, tenantId);

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
