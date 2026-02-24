import type { DomainEvent } from "../core";
import type { IEventStore } from "../core/IEventStore";
import { query } from "./db";
import type { PoolClient, QueryResult } from "pg";

interface EventRow {
  event_id: string;
  event_type: string;
  module: string;
  version: number;
  occurred_at: Date;
  payload_hash: string;
  payload: unknown;
  entity_id: string;
  signature: string;
  actor_id: string;
  actor_role: string;
  corrects_event_id: string | null;
}

export class PostgresEventStore implements IEventStore {
  public async append<TPayload>(
    client: PoolClient,
    event: DomainEvent<TPayload>,
    expectedVersion: number,
  ): Promise<string> {
    const versionResult = await client.query(
      `
  SELECT version
  FROM entities
  WHERE id = $1
  FOR UPDATE
  `,
      [event.metadata.entityId],
    );

    if (versionResult.rows.length === 0) {
      throw new Error(
        `[EVENT_STORE] Entity not found: ${event.metadata.entityId}`,
      );
    }

    const currentVersion = Number(versionResult.rows[0].version);

    if (currentVersion !== expectedVersion) {
      throw new Error(
        `[EVENT_STORE] Concurrency violation for entity ${event.metadata.entityId}. Expected version ${expectedVersion}, found ${currentVersion}`,
      );
    }

    await client.query(
      `
    INSERT INTO events (
      event_id,
      event_type,
      module,
      version,
      occurred_at,
      payload_hash,
      payload,
      source_id,
      entity_id,
      signature,
      corrects_event_id,
      actor_id,
      actor_role
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `,
      [
        event.metadata.eventId,
        event.metadata.eventType,
        event.metadata.module,
        event.metadata.version,
        event.metadata.occurredAt,
        event.metadata.payloadHash,
        JSON.stringify(event.payload),
        null,
        event.metadata.entityId,
        event.metadata.signature,
        event.metadata.correctsEventId ?? null,
        event.metadata.actorId,
        event.metadata.actorRole,
      ],
    );

    await client.query(
      `
    UPDATE entities
    SET version = version + 1
    WHERE id = $1
    `,
      [event.metadata.entityId],
    );

    return event.metadata.eventId;
  }

  public async appendBatch<TPayload>(
    client: PoolClient,
    events: DomainEvent<TPayload>[],
    expectedVersion: number,
  ): Promise<string> {
    if (events.length === 0) {
      throw new Error("[EVENT_STORE] appendBatch called with empty events");
    }

    const entityId = events[0].metadata.entityId;

    const versionResult = await client.query(
      `SELECT version FROM entities WHERE id = $1 FOR UPDATE`,
      [entityId],
    );

    if (versionResult.rows.length === 0) {
      throw new Error(`[EVENT_STORE] Entity not found: ${entityId}`);
    }

    const currentVersion = Number(versionResult.rows[0].version);

    if (currentVersion !== expectedVersion) {
      throw new Error(
        `[EVENT_STORE] Concurrency violation for entity ${entityId}. Expected ${expectedVersion}, found ${currentVersion}`,
      );
    }

    let nextVersion = currentVersion;

    for (const event of events) {
      nextVersion += 1;

      await client.query(
        `
    INSERT INTO events (
      event_id,
      event_type,
      module,
      version,
      occurred_at,
      payload_hash,
      payload,
      source_id,
      entity_id,
      signature,
      corrects_event_id,
      actor_id,
      actor_role
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `,
        [
          event.metadata.eventId,
          event.metadata.eventType,
          event.metadata.module,
          nextVersion,
          event.metadata.occurredAt,
          event.metadata.payloadHash,
          JSON.stringify(event.payload),
          null,
          event.metadata.entityId,
          event.metadata.signature,
          event.metadata.correctsEventId ?? null,
          event.metadata.actorId,
          event.metadata.actorRole,
        ],
      );
    }

    await client.query(
      `
  UPDATE entities
  SET version = $2
  WHERE id = $1
  `,
      [entityId, nextVersion],
    );

    return events[events.length - 1].metadata.eventId;
  }

  public async getByEntity(
    entityId: string,
    client?: PoolClient,
  ): Promise<DomainEvent<unknown>[]> {
    let rows: EventRow[];

    if (client) {
      const result: QueryResult<EventRow> = await client.query(
        `
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
    ORDER BY version ASC
    `,
        [entityId],
      );

      rows = result.rows;
    } else {
      rows = (await query(
        `
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
    ORDER BY version ASC
  `,
        [entityId],
      )) as EventRow[];
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
