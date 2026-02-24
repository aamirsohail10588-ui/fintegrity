"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityReadModelProjector = void 0;
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const db_1 = require("../infrastructure/db");
const core_1 = require("../core");
const balanceProjection_1 = require("./balanceProjection");
class EntityReadModelProjector {
    constructor() {
        this.store = new PostgresEventStore_1.PostgresEventStore();
    }
    async rebuild(entityId) {
        const events = await this.store.getByEntity(entityId);
        const balances = (0, core_1.replay)(events, {}, balanceProjection_1.accountBalanceReducer);
        const lastEventId = events.length > 0 ? events[events.length - 1].metadata.eventId : "NONE";
        await (0, db_1.query)(`
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
      `, [entityId, lastEventId, JSON.stringify(balances)]);
    }
}
exports.EntityReadModelProjector = EntityReadModelProjector;
