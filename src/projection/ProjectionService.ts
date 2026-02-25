import type { IEventStore } from "../core/IEventStore";
import { replay } from "../core";
import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";
import { getPool } from "../infrastructure/db";
import type { PoolClient } from "pg";

export class ProjectionService {
  private readonly store: IEventStore;

  constructor(store: IEventStore) {
    this.store = store;
  }

  public async rebuild(entityId: string, tenantId: string): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ Load events using same transaction client
      const events = await this.store.getByEntity(entityId, tenantId, client);

      // 2️⃣ Deterministic replay
      const initialState: AccountBalanceState = {};
      const state = replay<AccountBalanceState>(
        events,
        initialState,
        accountBalanceReducer,
      );

      const currentVersion =
        events.length === 0 ? 0 : events[events.length - 1].metadata.version;

      const lastEventId =
        events.length === 0 ? null : events[events.length - 1].metadata.eventId;

      // 3️⃣ Overwrite projection safely
      await client.query(
        `
  INSERT INTO entity_read_models (
    entity_id,
    tenant_id,
    balances_json,
    version,
    last_event_id,
    rebuilt_at
  )
  VALUES ($1, $2, $3, $4, $5, now())
  ON CONFLICT (entity_id)
  DO UPDATE SET
    balances_json = EXCLUDED.balances_json,
    version = EXCLUDED.version,
    last_event_id = EXCLUDED.last_event_id,
    rebuilt_at = now()
  `,
        [
          entityId,
          tenantId,
          JSON.stringify(state),
          currentVersion,
          lastEventId,
        ],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  // STRICT full rebuild — admin only
  public async rebuildEntity(
    client: PoolClient,
    entityId: string,
    tenantId: string,
  ): Promise<void> {
    const events = await this.store.getByEntity(entityId, tenantId, client);

    if (events.length === 0) {
      throw new Error("[PROJECTION] No events found for entity");
    }

    const initialState: AccountBalanceState = {};
    const state = replay<AccountBalanceState>(
      events,
      initialState,
      accountBalanceReducer,
    );

    const currentVersion = events[events.length - 1].metadata.version;

    const lastEventId = events[events.length - 1].metadata.eventId;

    await client.query(
      `
    INSERT INTO entity_read_models (
      entity_id,
      tenant_id,
      balances_json,
      version,
      last_event_id,
      rebuilt_at
    )
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (entity_id)
    DO UPDATE SET
      balances_json = EXCLUDED.balances_json,
      version = EXCLUDED.version,
      last_event_id = EXCLUDED.last_event_id,
      rebuilt_at = now()
    `,
      [entityId, tenantId, JSON.stringify(state), currentVersion, lastEventId],
    );
  }
}
