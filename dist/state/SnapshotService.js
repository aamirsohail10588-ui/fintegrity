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
exports.SnapshotService = void 0;
const uuid_1 = require("uuid");
const core_1 = require("../core");
const state_1 = require("../state");
const core_2 = require("../core");
const signature_1 = require("../core/signature");
const CommandService_1 = require("../application/CommandService");
class SnapshotService {
    constructor(store) {
        this.store = store;
        this.commandService = new CommandService_1.CommandService(store);
    }
    async sealSnapshot(entityId, actorId, actorRole) {
        const pool = (await Promise.resolve().then(() => __importStar(require("../infrastructure/db")))).getPool();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const entityResult = await client.query(`
  SELECT version
  FROM entities
  WHERE id = $1
  FOR UPDATE
  `, [entityId]);
            if (entityResult.rows.length === 0) {
                throw new Error("[SNAPSHOT] Entity not found");
            }
            const lockedVersion = Number(entityResult.rows[0].version);
            // 1️⃣ Load all events
            const events = await this.store.getByEntity(entityId, client);
            const lastEvent = events[events.length - 1];
            if (lastEvent.metadata.eventType === "snapshot_sealed") {
                throw new Error("[SNAPSHOT] Already sealed at current version");
            }
            if (events.length === 0) {
                throw new Error("[SNAPSHOT] Cannot seal snapshot with no events");
            }
            const currentVersion = lockedVersion;
            const existingSnapshot = await client.query(`
  SELECT 1
  FROM snapshots
  WHERE entity_id = $1
  AND version = $2
  `, [entityId, currentVersion]);
            if (existingSnapshot.rows.length > 0) {
                throw new Error(`[SNAPSHOT] Snapshot already exists for version ${currentVersion}`);
            }
            // 2️⃣ Replay full state
            const initialState = {};
            const fullState = (0, core_1.replay)(events, initialState, state_1.accountBalanceReducer);
            // 3️⃣ Build Merkle root
            const leaves = (0, core_2.buildLeafHashes)(entityId, currentVersion, fullState);
            const merkleRoot = (0, core_2.buildMerkleRoot)(leaves);
            const snapshotId = (0, uuid_1.v4)();
            // 4️⃣ Insert snapshot row
            await client.query(`
      INSERT INTO snapshots (
        id,
        entity_id,
        version,
        merkle_root,
        leaf_count
      )
      VALUES ($1,$2,$3,$4,$5)
      `, [snapshotId, entityId, currentVersion, merkleRoot, leaves.length]);
            // 5️⃣ Emit snapshot_sealed event via EventStore
            const { canonicalStringify, hashString } = await Promise.resolve().then(() => __importStar(require("../core")));
            const eventId = (0, uuid_1.v4)();
            const payload = {
                snapshotId,
                merkleRoot,
                version: currentVersion,
            };
            const payloadHash = hashString(canonicalStringify(payload));
            const occurredAt = new Date().toISOString();
            const signatureBase = [
                eventId,
                payloadHash,
                "snapshot_sealed",
                String(currentVersion + 1),
                "",
                actorId,
                actorRole,
                "SNAPSHOT",
            ].join(":");
            const signature = (0, signature_1.signData)(signatureBase);
            const snapshotEvent = {
                metadata: {
                    eventId,
                    eventType: "snapshot_sealed",
                    module: "SNAPSHOT",
                    version: currentVersion + 1,
                    occurredAt,
                    payloadHash,
                    entityId,
                    actorId,
                    actorRole,
                    correctsEventId: undefined,
                    signature,
                },
                payload,
            };
            await this.commandService.appendAndProject(client, entityId, snapshotEvent, currentVersion);
            await client.query("COMMIT");
            return snapshotId;
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
exports.SnapshotService = SnapshotService;
