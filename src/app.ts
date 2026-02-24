import "dotenv/config";
import { startApiServer } from "./api/server";
import { CORE_LAYER } from "./core";
import { INGESTION_LAYER } from "./ingestion";
import { STATE_LAYER } from "./state";
import { GOVERNANCE_LAYER } from "./governance";
import { TAX_LAYER } from "./tax";
import { API_LAYER } from "./api";
import { logger } from "./core";

import { runSandbox } from "./sandbox/runner";
import { PostgresEventStore } from "./infrastructure/PostgresEventStore";

function bootstrap(): void {
  logger.info({
    module: "SYSTEM",
    action: "Fintegrity booting",
  });

  logger.info({ module: "SYSTEM", action: CORE_LAYER });
  logger.info({ module: "SYSTEM", action: INGESTION_LAYER });
  logger.info({ module: "SYSTEM", action: STATE_LAYER });
  logger.info({ module: "SYSTEM", action: GOVERNANCE_LAYER });
  logger.info({ module: "SYSTEM", action: TAX_LAYER });
  logger.info({ module: "SYSTEM", action: API_LAYER });

  startApiServer();

  runSandbox().catch((error: unknown) => {
    logger.error({
      module: "SANDBOX",
      action: "Sandbox execution failed",
      details: String(error),
    });
  });
}

bootstrap();
