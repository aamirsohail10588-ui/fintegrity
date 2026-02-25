"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresEventStore = void 0;
const db_1 = require("./db");
class PostgresEventStore {
    async append(client, event, expectedVersion) {
        const versionResult = await client.query(`
  SELECT version, tenant_id
  FROM entities
  WHERE id = $1
  FOR UPDATE
  `, [event.metadata.entityId]);
        if (versionResult.rows.length === 0) {
            throw new Error(`[EVENT_STORE] Entity not found: ${event.metadata.entityId}`);
        }
        const currentVersion = Number(versionResult.rows[0].version);
        const tenantId = versionResult.rows[0].tenant_id;
        if (currentVersion !== expectedVersion) {
            throw new Error(`[EVENT_STORE] Concurrency violation for entity ${event.metadata.entityId}. Expected version ${expectedVersion}, found ${currentVersion}`);
        }
        await client.query(`
    INSERT INTO events (
  event_id,
  event_type,
  module,
  version,
  occurred_at,
  payload_hash,
  payload,
  entity_id,
  tenant_id,
  signature,
  corrects_event_id,
  actor_id,
  actor_role
)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
            event.metadata.eventId,
            event.metadata.eventType,
            event.metadata.module,
            event.metadata.version,
            event.metadata.occurredAt,
            event.metadata.payloadHash,
            JSON.stringify(event.payload),
            event.metadata.entityId,
            tenantId,
            event.metadata.signature,
            event.metadata.correctsEventId ?? null,
            event.metadata.actorId,
            event.metadata.actorRole,
        ]);
        await client.query(`
    UPDATE entities
    SET version = version + 1
    WHERE id = $1
    `, [event.metadata.entityId]);
        return event.metadata.eventId;
    }
    async appendBatch(client, events, expectedVersion) {
        if (events.length === 0) {
            throw new Error("[EVENT_STORE] appendBatch called with empty events");
        }
        const entityId = events[0].metadata.entityId;
        const versionResult = await client.query(`SELECT version, tenant_id FROM entities WHERE id = $1 FOR UPDATE`, [entityId]);
        if (versionResult.rows.length === 0) {
            throw new Error(`[EVENT_STORE] Entity not found: ${entityId}`);
        }
        const currentVersion = Number(versionResult.rows[0].version);
        const tenantId = versionResult.rows[0].tenant_id;
        if (currentVersion !== expectedVersion) {
            throw new Error(`[EVENT_STORE] Concurrency violation for entity ${entityId}. Expected ${expectedVersion}, found ${currentVersion}`);
        }
        let nextVersion = currentVersion;
        for (const event of events) {
            nextVersion += 1;
            await client.query(`
    INSERT INTO events (
  event_id,
  event_type,
  module,
  version,
  occurred_at,
  payload_hash,
  payload,
  entity_id,
  tenant_id,
  signature,
  corrects_event_id,
  actor_id,
  actor_role
)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
                event.metadata.eventId,
                event.metadata.eventType,
                event.metadata.module,
                nextVersion,
                event.metadata.occurredAt,
                event.metadata.payloadHash,
                JSON.stringify(event.payload),
                event.metadata.entityId,
                tenantId,
                event.metadata.signature,
                event.metadata.correctsEventId ?? null,
                event.metadata.actorId,
                event.metadata.actorRole,
            ]);
        }
        await client.query(`
  UPDATE entities
  SET version = $2
  WHERE id = $1
  `, [entityId, nextVersion]);
        return events[events.length - 1].metadata.eventId;
    }
    async getByEntity(entityId, tenantId, client) {
        let rows;
        if (client) {
            const result = await client.query(`
      SELECT event_id,
             event_type,
             module,
             version,
             occurred_at,
             payload_hash,
             payload,
             entity_id,
             signature,
             actor_id,
             actor_role,
             corrects_event_id
      FROM events
      WHERE entity_id = $1
        AND tenant_id = $2
      ORDER BY version ASC
      `, [entityId, tenantId]);
            rows = result.rows;
        }
        else {
            rows = (await (0, db_1.query)(`
      SELECT event_id,
             event_type,
             module,
             version,
             occurred_at,
             payload_hash,
             payload,
             entity_id,
             signature,
             actor_id,
             actor_role,
             corrects_event_id
      FROM events
      WHERE entity_id = $1
        AND tenant_id = $2
      ORDER BY version ASC
      `, [entityId, tenantId]));
        }
        return rows.map((row) => ({
            metadata: {
                eventId: row.event_id,
                eventType: row.event_type,
                module: row.module,
                version: row.version,
                occurredAt: row.occurred_at.toISOString(),
                payloadHash: row.payload_hash,
                entityId: row.entity_id,
                actorId: row.actor_id,
                actorRole: row.actor_role,
                signature: row.signature,
                correctsEventId: row.corrects_event_id ?? undefined,
            },
            payload: row.payload,
        }));
    }
}
exports.PostgresEventStore = PostgresEventStore;
