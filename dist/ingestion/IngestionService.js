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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionService = void 0;
const IngestionDomainService_1 = require("../domain/ingestion/IngestionDomainService");
const db_1 = require("../infrastructure/db");
const core_1 = require("../core");
const signature_1 = require("../core/signature");
class IngestionService {
    constructor(store) {
        this.store = store;
    }
    async ingest(input, idempotencyKey, tenantId) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const requestHash = (0, core_1.hashString)((0, core_1.canonicalStringify)(input));
            // 🔎 Check existing idempotency
            const existingKey = await client.query(`
      SELECT request_hash, response_event_id
      FROM idempotency_keys
      WHERE entity_id = $1 AND id = $2
      `, [input.entityId, idempotencyKey]);
            if (existingKey.rows.length > 0) {
                const row = existingKey.rows[0];
                if (row.request_hash !== requestHash) {
                    throw new Error("[INGESTION] Idempotency key reused with different payload");
                }
                await client.query("ROLLBACK");
                return row.response_event_id;
            }
            const { BusinessRuleEngine } = await Promise.resolve().then(() => __importStar(require("../governance/BusinessRuleEngine")));
            const ruleEngine = new BusinessRuleEngine();
            const amount = input.entries.reduce((sum, entry) => sum + entry.debit, 0);
            const decision = await ruleEngine.evaluate({
                entityId: input.entityId,
                businessId: input.reference,
                amount,
            });
            const versionResult = await client.query(`
  SELECT version
  FROM entities
  WHERE id = $1 AND tenant_id = $2
  FOR UPDATE
  `, [input.entityId, tenantId]);
            if (versionResult.rows.length === 0) {
                throw new Error("[INGESTION] Entity does not exist");
            }
            const expectedEventCount = Number(versionResult.rows[0].version);
            const nextVersion = expectedEventCount + 1;
            const domain = new IngestionDomainService_1.IngestionDomainService();
            const eventsToPersist = await domain.buildEvents(input, decision.type, nextVersion);
            for (const event of eventsToPersist) {
                const signatureBase = [
                    event.metadata.eventId,
                    event.metadata.payloadHash,
                    event.metadata.eventType,
                    String(event.metadata.version),
                    event.metadata.correctsEventId ?? "",
                    event.metadata.actorId,
                    event.metadata.actorRole,
                    event.metadata.module,
                ].join(":");
                const valid = (0, signature_1.verifySignature)(signatureBase, event.metadata.signature);
                if (!valid) {
                    throw new Error(`Invalid signature during ingestion for eventId: ${event.metadata.eventId}`);
                }
            }
            const persistedEventId = await this.store.appendBatch(client, eventsToPersist, expectedEventCount);
            // 💾 Insert idempotency record
            await client.query(`
      INSERT INTO idempotency_keys (
        id,
        entity_id,
        request_hash,
        response_event_id
      )
      VALUES ($1,$2,$3,$4)
      `, [idempotencyKey, input.entityId, requestHash, persistedEventId]);
            await client.query("COMMIT");
            // 🔄 Projection rebuild AFTER commit
            const { ProjectionService } = await Promise.resolve().then(() => __importStar(require("../projection/ProjectionService")));
            const projector = new ProjectionService(this.store);
            await projector.rebuild(input.entityId);
            return persistedEventId;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.IngestionService = IngestionService;
