"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../infrastructure/db");
const signature_1 = require("../core/signature");
async function backfill() {
    const rows = (await (0, db_1.query)(`
    SELECT event_id,
           event_id,
           payload_hash,
           event_type,
           version
    FROM events
    `));
    for (const row of rows) {
        const signatureBase = [
            row.event_id,
            row.payload_hash,
            row.event_type,
            row.version,
        ].join(":");
        const signature = (0, signature_1.signData)(signatureBase);
        await (0, db_1.query)(`
      UPDATE events
      SET signature = $1
      WHERE id = $2
      `, [signature, row.event_id]);
        console.log(`[MIGRATION] Updated event ${row.event_id}`);
    }
    console.log("[MIGRATION] Signature backfill complete");
}
backfill().catch(console.error);
