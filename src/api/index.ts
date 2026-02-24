import express from "express";
import type { Request, Response } from "express";

import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import { replay } from "../core";
import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";
import { logger } from "../core/logger";

export const API_LAYER = "API_LAYER_READY";

export function startApiServer(): void {
  const app = express();
  const store = new PostgresEventStore();

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "Fintegrity API",
      timestamp: new Date().toISOString(),
    });
  });

  logger.info({
    module: "API",
    action: "Registering entity route",
  });

  app.get(
    "/entity/:entityId",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const rawEntityId = req.params.entityId;

        if (Array.isArray(rawEntityId)) {
          res.status(400).json({ error: "Invalid entityId" });
          return;
        }

        const entityId: string = rawEntityId;

        const events = await store.getByEntity(entityId);

        const balances = replay<AccountBalanceState>(
          events,
          {},
          accountBalanceReducer,
        );

        res.json({
          entityId,
          eventCount: events.length,
          balances,
        });
        return;
      } catch {
        logger.info({
          module: "API",
          action: "Registering entity route",
        });
        res.status(500).json({ error: "Internal server error" });
        return;
      }
    },
  );

  app.listen(3000, () => {
    logger.info({
      module: "API",
      action: "Server started",
      details: "http://localhost:3000",
    });
  });
}
