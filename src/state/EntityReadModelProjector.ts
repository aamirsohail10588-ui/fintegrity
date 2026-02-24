import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import { query } from "../infrastructure/db";
import { replay } from "../core";
import { accountBalanceReducer } from "./balanceProjection";
import type { AccountBalanceState } from "./balanceProjection";

export class EntityReadModelProjector {
  private readonly store = new PostgresEventStore();

  public async rebuild(entityId: string): Promise<void> {
    const events = await this.store.getByEntity(entityId);

    const balances = replay<AccountBalanceState>(
      events,
      {},
      accountBalanceReducer,
    );

    const lastEventId =
      events.length > 0 ? events[events.length - 1].metadata.eventId : "NONE";

    await query(
      `
      INSERT INTO entity_read_models (
        entity_id,
        last_event_id,
        balances_json,
        updated_at
      )
      VALUES ($1, $2, $3, now())
      ON CONFLICT (entity_id)
      DO UPDATE SET
        last_event_id = EXCLUDED.last_event_id,
        balances_json = EXCLUDED.balances_json,
        updated_at = now()
      `,
      [entityId, lastEventId, JSON.stringify(balances)],
    );
  }
}
