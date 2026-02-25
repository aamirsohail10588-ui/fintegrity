import { query } from "../infrastructure/db";
import { signData } from "../core/signature";

async function backfill(): Promise<void> {
  interface BackfillRow {
    id: string;
    event_id: string;
    payload_hash: string;
    event_type: string;
    version: number;
  }
  const rows = (await query(
    `
    SELECT event_id,
           event_id,
           payload_hash,
           event_type,
           version
    FROM events
    `,
  )) as BackfillRow[];

  for (const row of rows) {
    const signatureBase = [
      row.event_id,
      row.payload_hash,
      row.event_type,
      row.version,
    ].join(":");

    const signature = signData(signatureBase);

    await query(
      `
      UPDATE events
      SET signature = $1
      WHERE id = $2
      `,
      [signature, row.event_id],
    );

    console.log(`[MIGRATION] Updated event ${row.event_id}`);
  }

  console.log("[MIGRATION] Signature backfill complete");
}

backfill().catch(console.error);
