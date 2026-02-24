"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountBalanceReducer = accountBalanceReducer;
function accountBalanceReducer(state, event) {
    if (event.metadata.eventType !== "transaction_ingested" &&
        event.metadata.eventType !== "transaction_reversed") {
        return state;
    }
    const tx = event.payload;
    const newState = { ...state };
    for (const entry of tx.entries) {
        const existingBalance = newState[entry.accountId] ?? 0;
        newState[entry.accountId] = existingBalance + entry.debit - entry.credit;
    }
    return newState;
}
