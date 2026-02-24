"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSandbox = runSandbox;
const core_1 = require("../core");
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const state_1 = require("../state");
async function runSandbox() {
    const store = new PostgresEventStore_1.PostgresEventStore();
    const events = await store.getByEntity("FIN-IN-001");
    const historyRoot = (0, core_1.computeHistoryRoot)(events);
    const snapshot = (0, core_1.createSnapshot)(historyRoot, events.length);
    (0, core_1.validateSnapshot)(snapshot, events);
    const transactionCount = (0, core_1.replay)(events, 0, (state, event) => event.metadata.eventType === "transaction_ingested" ? state + 1 : state);
    const balances = (0, core_1.replay)(events, {}, state_1.accountBalanceReducer);
    console.log("Transaction Count:", transactionCount);
    console.log("Balances:", balances);
    console.log("Snapshot:", snapshot.snapshotId);
}
