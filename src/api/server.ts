import "dotenv/config";
import express, { Request, Response } from "express";
import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import { SnapshotService } from "../state/SnapshotService";
import {
  uploadMiddleware,
  handleCsvUpload,
} from "../ingestion/CsvUploadController";
import { AuditCertificateService } from "../audit/AuditCertificateService";
import { query } from "../infrastructure/db";
import { requireAuth } from "./authMiddleware";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { confirmMapping } from "../ingestion/MappingController";
import { logger } from "../core";

interface AuthenticatedRequest extends Request {
  userId: string;
  role: string;
  tenantId: string;
}

// -------- DB Row Types --------

interface UserRow {
  id: string;
  tenant_id: string;
  role: string;
  password_hash: string;
}

interface EntityReadModelRow {
  entity_id: string;
  last_event_id: string;
  balances_json: Record<string, number>;
  updated_at: Date;
}

interface SnapshotRow {
  version: number;
  leaf_count: number;
  merkle_root: string;
}

interface SnapshotListRow {
  id: string;
  version: number;
  merkle_root: string;
  created_at: Date;
}

interface EntityRow {
  id: string;
  version: number;
}

interface ProjectionRow {
  balances_json: Record<string, number>;
  version: number;
  rebuilt_at: Date;
}

export function startApiServer(): void {
  const app = express();

  app.use(express.json());

  app.post("/upload-csv", uploadMiddleware.single("file"), handleCsvUpload);
  app.post("/confirm-mapping", confirmMapping);

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "Fintegrity API",
      timestamp: new Date().toISOString(),
    });
  });

  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }

  app.post("/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          status: "error",
          message: "Email and password required",
        });
        return;
      }

      const rows = (await query(
        `
  SELECT id, tenant_id, role, password_hash
  FROM users
  WHERE email = $1
  `,
        [email],
      )) as UserRow[];

      if (rows.length === 0) {
        res.status(401).json({
          status: "error",
          message: "Invalid credentials",
        });
        return;
      }

      const user = rows[0];

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        res.status(401).json({
          status: "error",
          message: "Invalid credentials",
        });
        return;
      }

      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
          tenantId: user.tenant_id,
        },
        JWT_SECRET,
        { expiresIn: "8h" },
      );

      res.status(200).json({
        status: "success",
        token,
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Login failed",
        details: String(error),
      });

      res.status(500).json({
        status: "error",
        message: "Internal server error",
      });
    }
  });

  app.post("/ingest", requireAuth, async (req: Request, res: Response) => {
    try {
      const input = req.body;

      const idempotencyKey = req.header("Idempotency-Key");

      if (!idempotencyKey) {
        res.status(400).json({
          status: "error",
          message: "Missing Idempotency-Key header",
        });
        return;
      }

      const authReq = req as AuthenticatedRequest;

      const actorId = authReq.userId;
      const actorRole = authReq.role;
      const tenantId = authReq.tenantId;

      if (actorRole !== "admin" && actorRole !== "accountant") {
        res.status(403).json({
          status: "error",
          message: "Actor not authorized to ingest transactions",
        });
        return;
      }

      const { IngestionService } =
        await import("../ingestion/IngestionService");
      const { PostgresEventStore } =
        await import("../infrastructure/PostgresEventStore");

      const store = new PostgresEventStore();
      const ingestion = new IngestionService(store);

      const eventId: string = await ingestion.ingest(
        {
          ...input,
          actorId,
          actorRole,
          tenantId,
        },
        idempotencyKey,
      );

      res.status(201).json({
        status: "success",
        eventId,
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Ingestion failed",
        details: String(error),
      });

      res.status(400).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/entity/:entityId", async (req: Request, res: Response) => {
    try {
      const rawEntityId = req.params.entityId;

      if (Array.isArray(rawEntityId)) {
        res.status(400).json({ error: "Invalid entityId" });
        return;
      }

      const entityId: string = rawEntityId;

      const rows = (await query(
        `
  SELECT entity_id,
         last_event_id,
         balances_json,
         updated_at
  FROM entity_read_models
  WHERE entity_id = $1
  `,
        [entityId],
      )) as EntityReadModelRow[];

      if (rows.length === 0) {
        res.status(404).json({ error: "Entity not found" });
        return;
      }

      const row = rows[0];

      res.json({
        entityId: row.entity_id,
        lastEventId: row.last_event_id,
        balances: row.balances_json,
        updatedAt: row.updated_at,
      });
      return;
    } catch (error) {
      logger.error({
        module: "API",
        action: "Entity fetch failed",
        details: String(error),
      });

      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/events/:entityId", async (req: Request, res: Response) => {
    try {
      const rawEntityId = req.params.entityId;

      if (Array.isArray(rawEntityId)) {
        res.status(400).json({
          status: "error",
          message: "Invalid entityId",
        });
        return;
      }

      const entityId: string = rawEntityId;

      const store = new PostgresEventStore();
      const events = await store.getByEntity(entityId);

      res.status(200).json({
        status: "success",
        entityId,
        eventCount: events.length,
        events,
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Event query failed",
        details: String(error),
      });

      res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/integrity/:entityId", async (req: Request, res: Response) => {
    try {
      const rawEntityId = req.params.entityId;

      if (Array.isArray(rawEntityId)) {
        res.status(400).json({
          status: "error",
          message: "Invalid entityId",
        });
        return;
      }

      const entityId: string = rawEntityId;

      const store = new PostgresEventStore();
      const events = await store.getByEntity(entityId);

      if (events.length === 0) {
        res.status(404).json({
          status: "error",
          message: "No events found for entity",
        });
        return;
      }

      const { replay, computeHistoryRoot } = await import("../core");
      const { accountBalanceReducer } = await import("../state");

      replay(events, {}, accountBalanceReducer);

      const historyRoot = computeHistoryRoot(events);

      res.status(200).json({
        status: "success",
        entityId,
        eventCount: events.length,
        historyRoot,
        integrity: "verified",
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Integrity check failed",
        details: String(error),
      });

      res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post(
    "/snapshot/:entityId/seal",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const rawEntityId = req.params.entityId;

        if (Array.isArray(rawEntityId)) {
          res.status(400).json({
            status: "error",
            message: "Invalid entityId",
          });
          return;
        }

        const entityId: string = rawEntityId;

        const store = new PostgresEventStore();
        const snapshotService = new SnapshotService(store);

        const authReq = req as AuthenticatedRequest;

        const snapshotId = await snapshotService.sealSnapshot(
          entityId,
          authReq.userId,
          authReq.role,
        );

        res.status(201).json({
          status: "success",
          snapshotId,
        });
      } catch (error) {
        logger.error({
          module: "API",
          action: "Snapshot seal failed",
          details: String(error),
        });

        res.status(400).json({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.get(
    "/snapshot/verify/:entityId/:version",
    async (req: Request, res: Response) => {
      try {
        const rawEntityId = req.params.entityId;
        const rawVersion = req.params.version;

        if (Array.isArray(rawEntityId) || Array.isArray(rawVersion)) {
          res.status(400).json({
            status: "error",
            message: "Invalid parameters",
          });
          return;
        }

        const entityId: string = rawEntityId;
        const version = Number(rawVersion);

        const snapshotRows = (await query(
          `
  SELECT version, leaf_count, merkle_root
  FROM snapshots
  WHERE entity_id = $1
  AND version = $2
  `,
          [entityId, version],
        )) as SnapshotRow[];

        if (snapshotRows.length === 0) {
          res.status(404).json({
            status: "error",
            message: "Snapshot not found",
          });
          return;
        }

        const snapshot = snapshotRows[0];

        const store = new PostgresEventStore();
        const allEvents = await store.getByEntity(entityId);

        const relevantEvents = allEvents.filter(
          (e) => e.metadata.version <= version,
        );

        const { replay } = await import("../core");
        const { accountBalanceReducer } = await import("../state");
        const { buildLeafHashes, buildMerkleRoot } = await import("../core");

        const initialState: Record<string, number> = {};

        const fullState = replay(
          relevantEvents,
          initialState,
          accountBalanceReducer,
        );

        const leaves = buildLeafHashes(entityId, version, fullState);

        const recomputedRoot = buildMerkleRoot(leaves);

        const match = recomputedRoot === snapshot.merkle_root;

        res.status(200).json({
          status: "success",
          entityId,
          version,
          storedRoot: snapshot.merkle_root,
          recomputedRoot,
          match,
          eventCount: relevantEvents.length,
        });
      } catch (error) {
        logger.error({
          module: "API",
          action: "Snapshot verification failed",
          details: String(error),
        });

        res.status(500).json({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.get("/entities/:entityId/ledger", async (req: Request, res: Response) => {
    try {
      const rawEntityId = req.params.entityId;

      if (Array.isArray(rawEntityId)) {
        res.status(400).json({
          status: "error",
          message: "Invalid entityId",
        });
        return;
      }

      const entityId: string = rawEntityId;

      // 1️⃣ Entity metadata
      const entityRows = (await query(
        `
  SELECT id, version
  FROM entities
  WHERE id = $1
  `,
        [entityId],
      )) as EntityRow[];

      if (entityRows.length === 0) {
        res.status(404).json({
          status: "error",
          message: "Entity not found",
        });
        return;
      }

      const entity = entityRows[0];

      // 2️⃣ Events (ordered)
      const store = new PostgresEventStore();
      const events = await store.getByEntity(entityId);

      // 3️⃣ Latest snapshot
      const snapshotRows = (await query(
        `
  SELECT id, version, merkle_root, created_at
  FROM snapshots
  WHERE entity_id = $1
  ORDER BY version DESC
  LIMIT 1
  `,
        [entityId],
      )) as SnapshotListRow[];

      const snapshot = snapshotRows.length > 0 ? snapshotRows[0] : null;

      // 4️⃣ Projection
      const projectionRows = (await query(
        `
  SELECT balances_json, version, rebuilt_at
  FROM entity_read_models
  WHERE entity_id = $1
  `,
        [entityId],
      )) as ProjectionRow[];

      const projection = projectionRows.length > 0 ? projectionRows[0] : null;

      res.status(200).json({
        status: "success",
        entity: {
          id: entity.id,
          currentVersion: entity.version,
        },
        projection,
        snapshot,
        events,
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Ledger fetch failed",
        details: String(error),
      });

      res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/entities", requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;

      if (authReq.role !== "admin") {
        res.status(403).json({
          status: "error",
          message: "Only admin can create entities",
        });
        return;
      }

      const { entityId } = req.body;

      if (!entityId || typeof entityId !== "string") {
        res.status(400).json({
          status: "error",
          message: "entityId is required",
        });
        return;
      }

      // Check if entity already exists
      const existing = (await query(
        `
  SELECT id
  FROM entities
  WHERE id = $1
  `,
        [entityId],
      )) as EntityRow[];

      if (existing.length > 0) {
        res.status(400).json({
          status: "error",
          message: "Entity already exists",
        });
        return;
      }

      await query(
        `
      INSERT INTO entities (id, version, tenant_id)
      VALUES ($1, 0, $2)
      `,
        [entityId, authReq.tenantId],
      );

      res.status(201).json({
        status: "success",
        entityId,
      });
    } catch (error) {
      logger.error({
        module: "API",
        action: "Entity creation failed",
        details: String(error),
      });

      res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get(
    "/certificate/:entityId/:version",
    async (req: Request, res: Response) => {
      try {
        const rawEntityId = req.params.entityId;
        const rawVersion = req.params.version;

        if (Array.isArray(rawEntityId) || Array.isArray(rawVersion)) {
          res.status(400).json({
            status: "error",
            message: "Invalid parameters",
          });
          return;
        }

        const entityId = rawEntityId;
        const version = Number(rawVersion);

        if (Number.isNaN(version)) {
          res.status(400).json({
            status: "error",
            message: "Version must be a number",
          });
          return;
        }

        const service = new AuditCertificateService();

        const result = await service.generate(entityId, version);

        res.status(200).json({
          status: "success",
          ...result,
        });
      } catch (error) {
        logger.error({
          module: "API",
          action: "Certificate generation failed",
          details: String(error),
        });

        res.status(400).json({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  const PORT = 3000;

  async function start() {
    try {
      // Fail-fast DB check
      await query("SELECT 1");

      app.listen(PORT, () => {
        logger.info({
          module: "API",
          action: "Server started",
          details: `http://localhost:${PORT}`,
        });
      });
    } catch (err) {
      logger.error({
        module: "SYSTEM",
        action: "DB connection failed. Exiting.",
      });

      process.exit(1);
    }
  }

  start();
}
