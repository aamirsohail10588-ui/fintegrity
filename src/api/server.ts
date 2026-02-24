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
import { RawTransactionSchema } from "../validation/ingestionSchemas";
import { errorMiddleware } from "./errorMiddleware";
import { asyncHandler } from "./asyncHandler";
import { ValidationError } from "../errors/ValidationError";
import { AuthorizationError } from "../errors/AuthorizationError";
import { IngestionService } from "../ingestion/IngestionService";

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

  app.post(
    "/ingest",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = RawTransactionSchema.safeParse(req.body);

      if (!parseResult.success) {
        throw new ValidationError("Invalid request payload");
      }

      const input = parseResult.data;

      const idempotencyKey = req.header("Idempotency-Key");

      if (!idempotencyKey) {
        throw new ValidationError("Missing Idempotency-Key header");
      }

      const authReq = req as AuthenticatedRequest;

      if (authReq.role !== "admin" && authReq.role !== "accountant") {
        throw new AuthorizationError(
          "Actor not authorized to ingest transactions",
        );
      }

      const store = new PostgresEventStore();
      const ingestion = new IngestionService(store);

      const eventId = await ingestion.ingest(
        {
          ...input,
          actorId: authReq.userId,
          actorRole: authReq.role,
        },
        idempotencyKey,
        authReq.tenantId,
      );

      res.status(201).json({
        status: "success",
        eventId,
      });
    }),
  );

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

  app.get(
    "/events/:entityId",
    asyncHandler(async (req: Request, res: Response) => {
      const rawEntityId = req.params.entityId;

      if (!rawEntityId || Array.isArray(rawEntityId)) {
        throw new ValidationError("Invalid entityId");
      }

      const store = new PostgresEventStore();
      const events = await store.getByEntity(rawEntityId);

      res.status(200).json({
        status: "success",
        entityId: rawEntityId,
        eventCount: events.length,
        events,
      });
    }),
  );
  app.get(
    "/integrity/:entityId",
    asyncHandler(async (req: Request, res: Response) => {
      const rawEntityId = req.params.entityId;

      if (!rawEntityId || Array.isArray(rawEntityId)) {
        throw new ValidationError("Invalid entityId");
      }

      const store = new PostgresEventStore();
      const events = await store.getByEntity(rawEntityId);

      if (events.length === 0) {
        throw new ValidationError("No events found for entity");
      }

      const { replay, computeHistoryRoot } = await import("../core");
      const { accountBalanceReducer } = await import("../state");

      replay(events, {}, accountBalanceReducer);

      const historyRoot = computeHistoryRoot(events);

      res.status(200).json({
        status: "success",
        entityId: rawEntityId,
        eventCount: events.length,
        historyRoot,
        integrity: "verified",
      });
    }),
  );

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
    asyncHandler(async (req: Request, res: Response) => {
      const rawEntityId = req.params.entityId;
      const rawVersion = req.params.version;

      if (!rawEntityId || Array.isArray(rawEntityId)) {
        throw new ValidationError("Invalid entityId");
      }

      if (!rawVersion || Array.isArray(rawVersion)) {
        throw new ValidationError("Invalid version");
      }

      const version = Number(rawVersion);

      if (Number.isNaN(version)) {
        throw new ValidationError("Version must be a number");
      }

      const snapshotRows = (await query(
        `
      SELECT version, leaf_count, merkle_root
      FROM snapshots
      WHERE entity_id = $1
      AND version = $2
      `,
        [rawEntityId, version],
      )) as SnapshotRow[];

      if (snapshotRows.length === 0) {
        throw new ValidationError("Snapshot not found");
      }

      const snapshot = snapshotRows[0];

      const store = new PostgresEventStore();
      const allEvents = await store.getByEntity(rawEntityId);

      const relevantEvents = allEvents.filter(
        (e) => e.metadata.version <= version,
      );

      const { replay } = await import("../core");
      const { accountBalanceReducer } = await import("../state");
      const { buildLeafHashes, buildMerkleRoot } = await import("../core");

      const fullState = replay(relevantEvents, {}, accountBalanceReducer);

      const leaves = buildLeafHashes(rawEntityId, version, fullState);
      const recomputedRoot = buildMerkleRoot(leaves);

      const match = recomputedRoot === snapshot.merkle_root;

      res.status(200).json({
        status: "success",
        entityId: rawEntityId,
        version,
        storedRoot: snapshot.merkle_root,
        recomputedRoot,
        match,
        eventCount: relevantEvents.length,
      });
    }),
  );

  app.get(
    "/entities/:entityId/ledger",
    asyncHandler(async (req: Request, res: Response) => {
      const rawEntityId = req.params.entityId;

      if (!rawEntityId || Array.isArray(rawEntityId)) {
        throw new ValidationError("Invalid entityId");
      }

      // 1️⃣ Entity metadata
      const entityRows = (await query(
        `
      SELECT id, version
      FROM entities
      WHERE id = $1
      `,
        [rawEntityId],
      )) as EntityRow[];

      if (entityRows.length === 0) {
        throw new ValidationError("Entity not found");
      }

      const entity = entityRows[0];

      // 2️⃣ Events
      const store = new PostgresEventStore();
      const events = await store.getByEntity(rawEntityId);

      // 3️⃣ Latest snapshot
      const snapshotRows = (await query(
        `
      SELECT id, version, merkle_root, created_at
      FROM snapshots
      WHERE entity_id = $1
      ORDER BY version DESC
      LIMIT 1
      `,
        [rawEntityId],
      )) as SnapshotListRow[];

      const snapshot = snapshotRows.length > 0 ? snapshotRows[0] : null;

      // 4️⃣ Projection
      const projectionRows = (await query(
        `
      SELECT balances_json, version, rebuilt_at
      FROM entity_read_models
      WHERE entity_id = $1
      `,
        [rawEntityId],
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
    }),
  );

  app.post(
    "/entities",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;

      if (authReq.role !== "admin") {
        throw new AuthorizationError("Only admin can create entities");
      }

      const { entityId } = req.body;

      if (!entityId || typeof entityId !== "string") {
        throw new ValidationError("entityId is required");
      }

      const existing = (await query(
        `
      SELECT id
      FROM entities
      WHERE id = $1
      `,
        [entityId],
      )) as EntityRow[];

      if (existing.length > 0) {
        throw new ValidationError("Entity already exists");
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
    }),
  );

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

  async function start(): Promise<void> {
    console.log("DB URL:", process.env.DATABASE_URL);

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
    } catch {
      logger.error({
        module: "SYSTEM",
        action: "DB connection failed. Exiting.",
      });

      process.exit(1);
    }
  }

  app.use(errorMiddleware);

  start();
}
