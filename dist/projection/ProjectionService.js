"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectionService = void 0;
const core_1 = require("../core");
const state_1 = require("../state");
const db_1 = require("../infrastructure/db");
class ProjectionService {
    constructor(store) {
        this.store = store;
    }
    async rebuild(entityId) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // 1️⃣ Load events using same transaction client
            const events = await this.store.getByEntity(entityId, client);
            // 2️⃣ Deterministic replay
            const initialState = {};
            const state = (0, core_1.replay)(events, initialState, state_1.accountBalanceReducer);
            const currentVersion = events.length === 0 ? 0 : events[events.length - 1].metadata.version;
            const lastEventId = events.length === 0 ? null : events[events.length - 1].metadata.eventId;
            // 3️⃣ Overwrite projection safely
            await client.query(`
  INSERT INTO entity_read_models (
    entity_id,
    balances_json,
    version,
    last_event_id,
    rebuilt_at
  )
  VALUES ($1, $2, $3, $4, now())
  ON CONFLICT (entity_id)
  DO UPDATE SET
    balances_json = EXCLUDED.balances_json,
    version = EXCLUDED.version,
    last_event_id = EXCLUDED.last_event_id,
    rebuilt_at = now()
  `, [entityId, JSON.stringify(state), currentVersion, lastEventId]);
            await client.query("COMMIT");
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
    // STRICT full rebuild — admin only
    async rebuildEntity(client, entityId) {
        const events = await this.store.getByEntity(entityId, client);
        if (events.length === 0) {
            throw new Error("[PROJECTION] No events found for entity");
        }
        const initialState = {};
        const state = (0, core_1.replay)(events, initialState, state_1.accountBalanceReducer);
        const currentVersion = events[events.length - 1].metadata.version;
        const lastEventId = events[events.length - 1].metadata.eventId;
        await client.query(`
    INSERT INTO entity_read_models (
      entity_id,
      balances_json,
      version,
      last_event_id,
      rebuilt_at
    )
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (entity_id)
    DO UPDATE SET
      balances_json = EXCLUDED.balances_json,
      version = EXCLUDED.version,
      last_event_id = EXCLUDED.last_event_id,
      rebuilt_at = now()
    `, [entityId, JSON.stringify(state), currentVersion, lastEventId]);
    }
}
exports.ProjectionService = ProjectionService;
