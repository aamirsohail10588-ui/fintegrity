import type { IEventStore } from "../core/IEventStore";
import { replay } from "../core";
import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";
import type { PoolClient } from "pg";
import type { DomainEvent } from "../core";

export class CommandService {
  private readonly store: IEventStore;

  constructor(store: IEventStore) {
    this.store = store;
  }

  public async appendAndProject(
    client: PoolClient,
    entityId: string,
    tenantId: string,
    event: DomainEvent<unknown>,
    expectedVersion: number,
  ): Promise<void> {
    // 1️⃣ Append event
    await this.store.append(client, event, expectedVersion);

    // 2️⃣ Load full stream in same TX
    const events = await this.store.getByEntity(entityId, tenantId, client);

    // 3️⃣ Replay deterministically
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

    // 4️⃣ Overwrite projection atomically
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
    // 5️⃣ Strict validation
    const versionCheck = await client.query(
      `SELECT version FROM entities WHERE id = $1`,
      [entityId],
    );

    const entityVersion = Number(versionCheck.rows[0].version);

    if (entityVersion !== currentVersion) {
      throw new Error("[INTEGRITY] Projection version mismatch");
    }
  }
}
