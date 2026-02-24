"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApiServer = startApiServer;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const SnapshotService_1 = require("../state/SnapshotService");
const CsvUploadController_1 = require("../ingestion/CsvUploadController");
const AuditCertificateService_1 = require("../audit/AuditCertificateService");
const db_1 = require("../infrastructure/db");
const authMiddleware_1 = require("./authMiddleware");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const MappingController_1 = require("../ingestion/MappingController");
const core_1 = require("../core");
const ingestionSchemas_1 = require("../validation/ingestionSchemas");
const errorMiddleware_1 = require("./errorMiddleware");
const asyncHandler_1 = require("./asyncHandler");
const ValidationError_1 = require("../errors/ValidationError");
const AuthorizationError_1 = require("../errors/AuthorizationError");
const IngestionService_1 = require("../ingestion/IngestionService");
function startApiServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.post("/upload-csv", CsvUploadController_1.uploadMiddleware.single("file"), CsvUploadController_1.handleCsvUpload);
    app.post("/confirm-mapping", MappingController_1.confirmMapping);
    app.get("/health", (_req, res) => {
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
    app.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                res.status(400).json({
                    status: "error",
                    message: "Email and password required",
                });
                return;
            }
            const rows = (await (0, db_1.query)(`
  SELECT id, tenant_id, role, password_hash
  FROM users
  WHERE email = $1
  `, [email]));
            if (rows.length === 0) {
                res.status(401).json({
                    status: "error",
                    message: "Invalid credentials",
                });
                return;
            }
            const user = rows[0];
            const passwordMatch = await bcrypt_1.default.compare(password, user.password_hash);
            if (!passwordMatch) {
                res.status(401).json({
                    status: "error",
                    message: "Invalid credentials",
                });
                return;
            }
            const token = jsonwebtoken_1.default.sign({
                userId: user.id,
                role: user.role,
                tenantId: user.tenant_id,
            }, JWT_SECRET, { expiresIn: "8h" });
            res.status(200).json({
                status: "success",
                token,
            });
        }
        catch (error) {
            core_1.logger.error({
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
    app.post("/ingest", authMiddleware_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const parseResult = ingestionSchemas_1.RawTransactionSchema.safeParse(req.body);
        if (!parseResult.success) {
            throw new ValidationError_1.ValidationError("Invalid request payload");
        }
        const input = parseResult.data;
        const idempotencyKey = req.header("Idempotency-Key");
        if (!idempotencyKey) {
            throw new ValidationError_1.ValidationError("Missing Idempotency-Key header");
        }
        const authReq = req;
        if (authReq.role !== "admin" && authReq.role !== "accountant") {
            throw new AuthorizationError_1.AuthorizationError("Actor not authorized to ingest transactions");
        }
        const store = new PostgresEventStore_1.PostgresEventStore();
        const ingestion = new IngestionService_1.IngestionService(store);
        const eventId = await ingestion.ingest({
            ...input,
            actorId: authReq.userId,
            actorRole: authReq.role,
        }, idempotencyKey, authReq.tenantId);
        res.status(201).json({
            status: "success",
            eventId,
        });
    }));
    app.get("/entity/:entityId", async (req, res) => {
        try {
            const rawEntityId = req.params.entityId;
            if (Array.isArray(rawEntityId)) {
                res.status(400).json({ error: "Invalid entityId" });
                return;
            }
            const entityId = rawEntityId;
            const rows = (await (0, db_1.query)(`
  SELECT entity_id,
         last_event_id,
         balances_json,
         updated_at
  FROM entity_read_models
  WHERE entity_id = $1
  `, [entityId]));
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
        }
        catch (error) {
            core_1.logger.error({
                module: "API",
                action: "Entity fetch failed",
                details: String(error),
            });
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.get("/events/:entityId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const rawEntityId = req.params.entityId;
        if (!rawEntityId || Array.isArray(rawEntityId)) {
            throw new ValidationError_1.ValidationError("Invalid entityId");
        }
        const store = new PostgresEventStore_1.PostgresEventStore();
        const events = await store.getByEntity(rawEntityId);
        res.status(200).json({
            status: "success",
            entityId: rawEntityId,
            eventCount: events.length,
            events,
        });
    }));
    app.get("/integrity/:entityId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const rawEntityId = req.params.entityId;
        if (!rawEntityId || Array.isArray(rawEntityId)) {
            throw new ValidationError_1.ValidationError("Invalid entityId");
        }
        const store = new PostgresEventStore_1.PostgresEventStore();
        const events = await store.getByEntity(rawEntityId);
        if (events.length === 0) {
            throw new ValidationError_1.ValidationError("No events found for entity");
        }
        const { replay, computeHistoryRoot } = await Promise.resolve().then(() => __importStar(require("../core")));
        const { accountBalanceReducer } = await Promise.resolve().then(() => __importStar(require("../state")));
        replay(events, {}, accountBalanceReducer);
        const historyRoot = computeHistoryRoot(events);
        res.status(200).json({
            status: "success",
            entityId: rawEntityId,
            eventCount: events.length,
            historyRoot,
            integrity: "verified",
        });
    }));
    app.post("/snapshot/:entityId/seal", authMiddleware_1.requireAuth, async (req, res) => {
        try {
            const rawEntityId = req.params.entityId;
            if (Array.isArray(rawEntityId)) {
                res.status(400).json({
                    status: "error",
                    message: "Invalid entityId",
                });
                return;
            }
            const entityId = rawEntityId;
            const store = new PostgresEventStore_1.PostgresEventStore();
            const snapshotService = new SnapshotService_1.SnapshotService(store);
            const authReq = req;
            const snapshotId = await snapshotService.sealSnapshot(entityId, authReq.userId, authReq.role);
            res.status(201).json({
                status: "success",
                snapshotId,
            });
        }
        catch (error) {
            core_1.logger.error({
                module: "API",
                action: "Snapshot seal failed",
                details: String(error),
            });
            res.status(400).json({
                status: "error",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    app.get("/snapshot/verify/:entityId/:version", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const rawEntityId = req.params.entityId;
        const rawVersion = req.params.version;
        if (!rawEntityId || Array.isArray(rawEntityId)) {
            throw new ValidationError_1.ValidationError("Invalid entityId");
        }
        if (!rawVersion || Array.isArray(rawVersion)) {
            throw new ValidationError_1.ValidationError("Invalid version");
        }
        const version = Number(rawVersion);
        if (Number.isNaN(version)) {
            throw new ValidationError_1.ValidationError("Version must be a number");
        }
        const snapshotRows = (await (0, db_1.query)(`
      SELECT version, leaf_count, merkle_root
      FROM snapshots
      WHERE entity_id = $1
      AND version = $2
      `, [rawEntityId, version]));
        if (snapshotRows.length === 0) {
            throw new ValidationError_1.ValidationError("Snapshot not found");
        }
        const snapshot = snapshotRows[0];
        const store = new PostgresEventStore_1.PostgresEventStore();
        const allEvents = await store.getByEntity(rawEntityId);
        const relevantEvents = allEvents.filter((e) => e.metadata.version <= version);
        const { replay } = await Promise.resolve().then(() => __importStar(require("../core")));
        const { accountBalanceReducer } = await Promise.resolve().then(() => __importStar(require("../state")));
        const { buildLeafHashes, buildMerkleRoot } = await Promise.resolve().then(() => __importStar(require("../core")));
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
    }));
    app.get("/entities/:entityId/ledger", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const rawEntityId = req.params.entityId;
        if (!rawEntityId || Array.isArray(rawEntityId)) {
            throw new ValidationError_1.ValidationError("Invalid entityId");
        }
        // 1️⃣ Entity metadata
        const entityRows = (await (0, db_1.query)(`
      SELECT id, version
      FROM entities
      WHERE id = $1
      `, [rawEntityId]));
        if (entityRows.length === 0) {
            throw new ValidationError_1.ValidationError("Entity not found");
        }
        const entity = entityRows[0];
        // 2️⃣ Events
        const store = new PostgresEventStore_1.PostgresEventStore();
        const events = await store.getByEntity(rawEntityId);
        // 3️⃣ Latest snapshot
        const snapshotRows = (await (0, db_1.query)(`
      SELECT id, version, merkle_root, created_at
      FROM snapshots
      WHERE entity_id = $1
      ORDER BY version DESC
      LIMIT 1
      `, [rawEntityId]));
        const snapshot = snapshotRows.length > 0 ? snapshotRows[0] : null;
        // 4️⃣ Projection
        const projectionRows = (await (0, db_1.query)(`
      SELECT balances_json, version, rebuilt_at
      FROM entity_read_models
      WHERE entity_id = $1
      `, [rawEntityId]));
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
    }));
    app.post("/entities", authMiddleware_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const authReq = req;
        if (authReq.role !== "admin") {
            throw new AuthorizationError_1.AuthorizationError("Only admin can create entities");
        }
        const { entityId } = req.body;
        if (!entityId || typeof entityId !== "string") {
            throw new ValidationError_1.ValidationError("entityId is required");
        }
        const existing = (await (0, db_1.query)(`
      SELECT id
      FROM entities
      WHERE id = $1
      `, [entityId]));
        if (existing.length > 0) {
            throw new ValidationError_1.ValidationError("Entity already exists");
        }
        await (0, db_1.query)(`
      INSERT INTO entities (id, version, tenant_id)
      VALUES ($1, 0, $2)
      `, [entityId, authReq.tenantId]);
        res.status(201).json({
            status: "success",
            entityId,
        });
    }));
    app.get("/certificate/:entityId/:version", async (req, res) => {
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
            const service = new AuditCertificateService_1.AuditCertificateService();
            const result = await service.generate(entityId, version);
            res.status(200).json({
                status: "success",
                ...result,
            });
        }
        catch (error) {
            core_1.logger.error({
                module: "API",
                action: "Certificate generation failed",
                details: String(error),
            });
            res.status(400).json({
                status: "error",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    const PORT = 3000;
    async function start() {
        console.log("DB URL:", process.env.DATABASE_URL);
        try {
            // Fail-fast DB check
            await (0, db_1.query)("SELECT 1");
            app.listen(PORT, () => {
                core_1.logger.info({
                    module: "API",
                    action: "Server started",
                    details: `http://localhost:${PORT}`,
                });
            });
        }
        catch {
            core_1.logger.error({
                module: "SYSTEM",
                action: "DB connection failed. Exiting.",
            });
            process.exit(1);
        }
    }
    app.use(errorMiddleware_1.errorMiddleware);
    start();
}
