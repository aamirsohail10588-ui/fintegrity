"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_LAYER = void 0;
exports.startApiServer = startApiServer;
const express_1 = __importDefault(require("express"));
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const core_1 = require("../core");
const state_1 = require("../state");
const logger_1 = require("../core/logger");
exports.API_LAYER = "API_LAYER_READY";
function startApiServer() {
    const app = (0, express_1.default)();
    const store = new PostgresEventStore_1.PostgresEventStore();
    app.get("/health", (_req, res) => {
        res.json({
            status: "ok",
            service: "Fintegrity API",
            timestamp: new Date().toISOString(),
        });
    });
    logger_1.logger.info({
        module: "API",
        action: "Registering entity route",
    });
    app.get("/entity/:entityId", async (req, res) => {
        try {
            const rawEntityId = req.params.entityId;
            if (Array.isArray(rawEntityId)) {
                res.status(400).json({ error: "Invalid entityId" });
                return;
            }
            const entityId = rawEntityId;
            const events = await store.getByEntity(entityId);
            const balances = (0, core_1.replay)(events, {}, state_1.accountBalanceReducer);
            res.json({
                entityId,
                eventCount: events.length,
                balances,
            });
            return;
        }
        catch (error) {
            logger_1.logger.info({
                module: "API",
                action: "Registering entity route",
            });
            res.status(500).json({ error: "Internal server error" });
            return;
        }
    });
    app.listen(3000, () => {
        logger_1.logger.info({
            module: "API",
            action: "Server started",
            details: "http://localhost:3000",
        });
    });
}
