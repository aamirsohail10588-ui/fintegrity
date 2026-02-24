"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandService = void 0;
const core_1 = require("../core");
const state_1 = require("../state");
class CommandService {
    constructor(store) {
        this.store = store;
    }
    async appendAndProject(client, entityId, event, expectedVersion) {
        // 1️⃣ Append event
        await this.store.append(client, event, expectedVersion);
        // 2️⃣ Load full stream in same TX
        const events = await this.store.getByEntity(entityId, client);
        // 3️⃣ Replay deterministically
        const initialState = {};
        const state = (0, core_1.replay)(events, initialState, state_1.accountBalanceReducer);
        const currentVersion = events.length === 0 ? 0 : events[events.length - 1].metadata.version;
        const lastEventId = events.length === 0 ? null : events[events.length - 1].metadata.eventId;
        // 4️⃣ Overwrite projection atomically
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
        // 5️⃣ Strict validation
        const versionCheck = await client.query(`SELECT version FROM entities WHERE id = $1`, [entityId]);
        const entityVersion = Number(versionCheck.rows[0].version);
        if (entityVersion !== currentVersion) {
            throw new Error("[INTEGRITY] Projection version mismatch");
        }
    }
}
exports.CommandService = CommandService;
