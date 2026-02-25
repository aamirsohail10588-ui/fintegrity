"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const server_1 = require("./api/server");
const core_1 = require("./core");
const ingestion_1 = require("./ingestion");
const state_1 = require("./state");
const governance_1 = require("./governance");
const tax_1 = require("./tax");
const core_2 = require("./core");
const runner_1 = require("./sandbox/runner");
function bootstrap() {
    core_2.logger.info({
        module: "SYSTEM",
        action: "Fintegrity booting",
    });
    core_2.logger.info({ module: "SYSTEM", action: core_1.CORE_LAYER });
    core_2.logger.info({ module: "SYSTEM", action: ingestion_1.INGESTION_LAYER });
    core_2.logger.info({ module: "SYSTEM", action: state_1.STATE_LAYER });
    core_2.logger.info({ module: "SYSTEM", action: governance_1.GOVERNANCE_LAYER });
    core_2.logger.info({ module: "SYSTEM", action: tax_1.TAX_LAYER });
    (0, server_1.startApiServer)();
    (0, runner_1.runSandbox)().catch((error) => {
        core_2.logger.error({
            module: "SANDBOX",
            action: "Sandbox execution failed",
            details: String(error),
        });
    });
}
bootstrap();
