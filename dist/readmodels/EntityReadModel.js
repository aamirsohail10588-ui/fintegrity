"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityReadModel = void 0;
const core_1 = require("../core");
const state_1 = require("../state");
class EntityReadModel {
    static build(entityId, events) {
        const historyRoot = (0, core_1.computeHistoryRoot)(events);
        const balances = (0, core_1.replay)(events, {}, state_1.accountBalanceReducer);
        return {
            entityId,
            eventCount: events.length,
            historyRoot,
            balances,
        };
    }
}
exports.EntityReadModel = EntityReadModel;
