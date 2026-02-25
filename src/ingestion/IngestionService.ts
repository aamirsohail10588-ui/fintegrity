import { IngestionDomainService } from "../domain/ingestion/IngestionDomainService";

import type { IEventStore } from "../core/IEventStore";
import { getPool } from "../infrastructure/db";
import { canonicalStringify, hashString } from "../core";
import { verifySignature } from "../core/signature";

export interface LedgerEntryInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface RawTransactionInput {
  entityId: string;
  reference: string;
  entries: LedgerEntryInput[];
  actorId: string;
  actorRole: string;
  correctionOf?: string;
}

export class IngestionService {
  private readonly store: IEventStore;

  constructor(store: IEventStore) {
    this.store = store;
  }

  public async ingest(
    input: RawTransactionInput,
    idempotencyKey: string,
    tenantId: string,
  ): Promise<string> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const requestHash = hashString(canonicalStringify(input));

      // 🔎 Check existing idempotency
      const existingKey = await client.query(
        `
      SELECT request_hash, response_event_id
      FROM idempotency_keys
      WHERE entity_id = $1 AND id = $2
      `,
        [input.entityId, idempotencyKey],
      );

      if (existingKey.rows.length > 0) {
        const row = existingKey.rows[0];

        if (row.request_hash !== requestHash) {
          throw new Error(
            "[INGESTION] Idempotency key reused with different payload",
          );
        }

        await client.query("ROLLBACK");
        return row.response_event_id;
      }

      const { BusinessRuleEngine } =
        await import("../governance/BusinessRuleEngine");

      const ruleEngine = new BusinessRuleEngine();

      const amount = input.entries.reduce((sum, entry) => sum + entry.debit, 0);

      const decision = await ruleEngine.evaluate({
        entityId: input.entityId,
        businessId: input.reference,
        amount,
      });

      const versionResult = await client.query(
        `
  SELECT version
  FROM entities
  WHERE id = $1 AND tenant_id = $2
  FOR UPDATE
  `,
        [input.entityId, tenantId],
      );

      if (versionResult.rows.length === 0) {
        throw new Error("[INGESTION] Entity does not exist");
      }

      const expectedEventCount = Number(versionResult.rows[0].version);

      const nextVersion = expectedEventCount + 1;

      const domain = new IngestionDomainService();

      const eventsToPersist = await domain.buildEvents(
        input,
        decision.type,
        nextVersion,
      );

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

        const valid = verifySignature(signatureBase, event.metadata.signature);

        if (!valid) {
          throw new Error(
            `Invalid signature during ingestion for eventId: ${event.metadata.eventId}`,
          );
        }
      }

      const persistedEventId = await this.store.appendBatch(
        client,
        eventsToPersist,
        expectedEventCount,
      );

      // 💾 Insert idempotency record
      await client.query(
        `
      INSERT INTO idempotency_keys (
        id,
        tenant_id,
        entity_id,
        request_hash,
        response_event_id
      )
      VALUES ($1,$2,$3,$4,$5)
      `,
        [
          idempotencyKey,
          tenantId,
          input.entityId,
          requestHash,
          persistedEventId,
        ],
      );

      await client.query("COMMIT");

      console.log(">>> REBUILD TRIGGERED FOR", input.entityId, tenantId);

      // 🔄 Projection rebuild AFTER commit
      const { ProjectionService } =
        await import("../projection/ProjectionService");

      const projector = new ProjectionService(this.store);
      await projector.rebuild(input.entityId, tenantId);

      return persistedEventId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
