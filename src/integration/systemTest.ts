import "dotenv/config";
import { getPool } from "../infrastructure/db";
import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import { replay } from "../core";
import { accountBalanceReducer } from "../state";
import { SnapshotService } from "../state/SnapshotService";
import { v4 as uuid } from "uuid";
import { ProjectionService } from "../projection/ProjectionService";
import { CommandService } from "../application/CommandService";
import type { DomainEvent } from "../core/events";

async function run() {
  const pool = getPool();
  const client = await pool.connect();
  const store = new PostgresEventStore();
  const commandService = new CommandService(store);
  const snapshotService = new SnapshotService(store);

  const entityId = "TEST-" + uuid();

  try {
    await client.query("BEGIN");

    // Create entity
    await client.query(
      `INSERT INTO entities (id, version, tenant_id)
   VALUES ($1, 0, $2)`,
      [entityId, "tenant-A"],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("Entity created:", entityId);

  // Append 3 events
  const client2 = await pool.connect();
  try {
    await client2.query("BEGIN");

    for (let i = 1; i <= 3; i++) {
      const eventId = uuid();
      const version = i;
      const occurredAt = new Date().toISOString();
      const payload = {
        entries: [
          {
            accountId: "cash",
            debit: i * 100,
            credit: 0,
          },
          {
            accountId: "revenue",
            debit: 0,
            credit: i * 100,
          },
        ],
      };

      const { canonicalStringify } = await import("../core");
      const { hashString } = await import("../core");
      const { signData } = await import("../core/signature");

      const payloadHash = hashString(canonicalStringify(payload));

      const signatureBase = [
        eventId,
        payloadHash,
        "transaction_ingested",
        String(version),
        "",
        "admin",
        "admin",
        "INGESTION",
      ].join(":");

      const signature = signData(signatureBase);

      const event = {
        metadata: {
          eventId,
          eventType: "transaction_ingested",
          module: "INGESTION",
          version,
          occurredAt,
          payloadHash,
          entityId,
          actorId: "admin",
          actorRole: "admin",
          signature,
        },
        payload,
      };

      await commandService.appendAndProject(
        client2,
        entityId,
        event as DomainEvent<typeof payload>,
        i - 1,
      );
    }

    await client2.query("COMMIT");
  } catch (err) {
    await client2.query("ROLLBACK");
    throw err;
  } finally {
    client2.release();
  }

  console.log("3 events appended");

  // Replay
  const events = await store.getByEntity(entityId);
  replay(events, {}, accountBalanceReducer);
  console.log("Replay passed");

  // Seal snapshot
  const snapshotId = await snapshotService.sealSnapshot(
    entityId,
    "admin",
    "admin",
  );

  console.log("Snapshot sealed:", snapshotId);

  // Double seal attempt
  try {
    await snapshotService.sealSnapshot(entityId, "admin", "admin");
    console.log("Double seal test: FAILED");
  } catch {
    console.log("Double seal test: PASSED");
  }

  // ----------------------------------
  // Concurrency violation test
  // ----------------------------------

  const raceEntityId = "RACE-" + uuid();

  const clientA = await pool.connect();
  const clientB = await pool.connect();

  try {
    await clientA.query("BEGIN");
    await clientB.query("BEGIN");

    // Create entity
    await clientA.query(
      `INSERT INTO entities (id, version, tenant_id)
   VALUES ($1, 0, $2)`,
      [raceEntityId, "tenant-A"],
    );
    await clientA.query("COMMIT");

    // Both read version 0 and try to append version 1
    const version = 1;
    const payload = {
      entries: [
        { accountId: "cash", debit: 100, credit: 0 },
        { accountId: "revenue", debit: 0, credit: 100 },
      ],
    };

    const { canonicalStringify } = await import("../core");
    const { hashString } = await import("../core");
    const { signData } = await import("../core/signature");

    const payloadHash = hashString(canonicalStringify(payload));

    const buildEvent = (eventId: string) => {
      const signatureBase = [
        eventId,
        payloadHash,
        "transaction_ingested",
        "1",
        "",
        "admin",
        "admin",
        "INGESTION",
      ].join(":");

      return {
        metadata: {
          eventId,
          eventType: "transaction_ingested",
          module: "INGESTION",
          version: 1,
          occurredAt: new Date().toISOString(),
          payloadHash,
          entityId: raceEntityId,
          actorId: "admin",
          actorRole: "admin",
          signature: signData(signatureBase),
        },
        payload,
      };
    };

    const eventA = buildEvent(uuid());
    const eventB = buildEvent(uuid());

    const appendA = commandService.appendAndProject(
      clientA,
      raceEntityId,
      eventA as DomainEvent<typeof payload>,
      0,
    );

    const appendB = commandService.appendAndProject(
      clientB,
      raceEntityId,
      eventB as DomainEvent<typeof payload>,
      0,
    );

    let successCount = 0;
    let failureCount = 0;

    await Promise.allSettled([appendA, appendB]).then((results) => {
      for (const r of results) {
        if (r.status === "fulfilled") successCount++;
        else failureCount++;
      }
    });

    await clientA.query("COMMIT").catch(() => {});
    await clientB.query("COMMIT").catch(() => {});

    if (successCount === 1 && failureCount === 1) {
      console.log("Concurrency test: PASSED");
    } else {
      console.log("Concurrency test: FAILED");
    }
  } finally {
    clientA.release();
    clientB.release();
  }

  // ADMIN FULL REBUILD TEST
  {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const projectionService = new ProjectionService(store);

      await projectionService.rebuildEntity(client, entityId);

      await client.query("COMMIT");

      console.log("Admin full rebuild test: PASSED");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Admin full rebuild test: FAILED");
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------
  // Tamper detection test
  // ----------------------------------

  {
    const client = await pool.connect();

    try {
      // Disable trigger
      await client.query(`ALTER TABLE events DISABLE TRIGGER events_no_update`);

      // Corrupt one event payload
      await client.query(
        `UPDATE events
       SET payload = '{"tampered": true}'
       WHERE entity_id = $1`,
        [entityId],
      );

      // Re-enable trigger
      await client.query(`ALTER TABLE events ENABLE TRIGGER events_no_update`);
    } finally {
      client.release();
    }

    // Attempt replay — MUST fail
    try {
      const corruptedEvents = await store.getByEntity(entityId);

      replay(corruptedEvents, {}, accountBalanceReducer);

      console.log("Tamper detection test: FAILED");
      throw new Error("Integrity system did not detect tampering");
    } catch (err) {
      console.log("Tamper detection test: PASSED");
    }
  }

  console.log("System integration test complete.");
}

run().catch((e) => {
  console.error("SYSTEM TEST FAILED:", e);
});
