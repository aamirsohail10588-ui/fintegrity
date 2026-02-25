"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSandbox = runSandbox;
const core_1 = require("../core");
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const state_1 = require("../state");
const uuid_1 = require("uuid");
const db_1 = require("../infrastructure/db");
async function runSandbox() {
    const store = new PostgresEventStore_1.PostgresEventStore();
    const pool = (0, db_1.getPool)();
    const client = await pool.connect();
    const tenantId = (0, uuid_1.v4)();
    const entityId = "FIN-IN-001";
    try {
        await client.query("BEGIN");
        // Create tenant
        await client.query(`INSERT INTO tenants (id, name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`, [tenantId, "Sandbox Tenant"]);
        // Create entity under tenant
        await client.query(`INSERT INTO entities (id, version, tenant_id)
       VALUES ($1, 0, $2)
       ON CONFLICT DO NOTHING`, [entityId, tenantId]);
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
    const events = await store.getByEntity(entityId, tenantId);
    const historyRoot = (0, core_1.computeHistoryRoot)(events);
    const snapshot = (0, core_1.createSnapshot)(historyRoot, events.length);
    (0, core_1.validateSnapshot)(snapshot, events);
    const transactionCount = (0, core_1.replay)(events, 0, (state, event) => event.metadata.eventType === "transaction_ingested" ? state + 1 : state);
    const balances = (0, core_1.replay)(events, {}, state_1.accountBalanceReducer);
    console.log("Transaction Count:", transactionCount);
    console.log("Balances:", balances);
    console.log("Snapshot:", snapshot.snapshotId);
}
