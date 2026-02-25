import { v4 as uuid } from "uuid";
import { replay } from "../core";
import { accountBalanceReducer } from "../state";
import type { AccountBalanceState } from "../state";
import type { IEventStore } from "../core/IEventStore";
import { buildLeafHashes, buildMerkleRoot } from "../core";
import { signData } from "../core/signature";
import { CommandService } from "../application/CommandService";

export class SnapshotService {
  private readonly store: IEventStore;
  private readonly commandService: CommandService;

  constructor(store: IEventStore) {
    this.store = store;
    this.commandService = new CommandService(store);
  }
  public async sealSnapshot(
    tenantId: string,
    entityId: string,
    actorId: string,
    actorRole: string,
  ): Promise<string> {
    const pool = (await import("../infrastructure/db")).getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const entityResult = await client.query(
        `
  SELECT version
  FROM entities
  WHERE id = $1
    AND tenant_id = $2
  FOR UPDATE
  `,
        [entityId, tenantId],
      );

      if (entityResult.rows.length === 0) {
        throw new Error("[SNAPSHOT] Entity not found");
      }

      const lockedVersion = Number(entityResult.rows[0].version);

      // 1️⃣ Load all events
      const events = await this.store.getByEntity(entityId, tenantId, client);

      const lastEvent = events[events.length - 1];

      if (lastEvent.metadata.eventType === "snapshot_sealed") {
        throw new Error("[SNAPSHOT] Already sealed at current version");
      }

      if (events.length === 0) {
        throw new Error("[SNAPSHOT] Cannot seal snapshot with no events");
      }

      const currentVersion = lockedVersion;

      const existingSnapshot = await client.query(
        `
  SELECT 1
  FROM snapshots
  WHERE entity_id = $1
  AND version = $2
  `,
        [entityId, currentVersion],
      );

      if (existingSnapshot.rows.length > 0) {
        throw new Error(
          `[SNAPSHOT] Snapshot already exists for version ${currentVersion}`,
        );
      }

      // 2️⃣ Replay full state
      const initialState: AccountBalanceState = {};

      const fullState = replay<AccountBalanceState>(
        events,
        initialState,
        accountBalanceReducer,
      );

      // 3️⃣ Build Merkle root
      const leaves = buildLeafHashes(entityId, currentVersion, fullState);

      const merkleRoot = buildMerkleRoot(leaves);

      const snapshotId = uuid();

      // 4️⃣ Insert snapshot row
      await client.query(
        `
      INSERT INTO snapshots (
        id,
        entity_id,
        tenant_id,
        version,
        merkle_root,
        leaf_count
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
        [
          snapshotId,
          entityId,
          tenantId,
          currentVersion,
          merkleRoot,
          leaves.length,
        ],
      );

      // 5️⃣ Emit snapshot_sealed event via EventStore

      const { canonicalStringify, hashString } = await import("../core");

      const eventId = uuid();

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

      const signature = signData(signatureBase);

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

      await this.commandService.appendAndProject(
        client,
        entityId,
        tenantId,
        snapshotEvent,
        currentVersion,
      );

      await client.query("COMMIT");

      return snapshotId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
