import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import {
  replay,
  canonicalStringify,
  hashString,
  computeHistoryRoot,
} from "../core";
import { accountBalanceReducer } from "../state";
import { query } from "../infrastructure/db";
import { createPublicKey, verify } from "crypto";
import https from "https";
import fs from "fs";
import path from "path";

export class AuditCertificateService {
  private readonly store = new PostgresEventStore();

  public async generate(entityId: string, version: number) {
    // 1. Load all events
    const allEvents = await this.store.getByEntity(entityId);

    const relevantEvents = allEvents.filter(
      (e) => e.metadata.version <= version,
    );

    if (relevantEvents.length === 0) {
      throw new Error("No events found for entity/version");
    }

    // 2. Replay (validates signatures internally)
    const state = replay(relevantEvents, {}, accountBalanceReducer);

    // 3. Compute history root
    const historyRoot = computeHistoryRoot(relevantEvents);

    // 4. Check snapshot for that version
    interface SnapshotRow {
      merkle_root: string;
    }

    const snapshotRows = (await query(
      `
  SELECT merkle_root
  FROM snapshots
  WHERE entity_id = $1
  AND version = $2
  `,
      [entityId, version],
    )) as SnapshotRow[];

    const snapshotRoot =
      snapshotRows.length > 0 ? snapshotRows[0].merkle_root : null;

    const certificate = {
      entityId,
      version,
      eventCount: relevantEvents.length,
      historyRoot,
      snapshotRoot,
      verifiedAt: new Date().toISOString(),
    };

    const canonical = canonicalStringify(certificate);
    const certificateHash = hashString(canonical);

    const certPath = path.join(__dirname, "../../certs");

    const requestOptions: https.RequestOptions = {
      hostname: "localhost",
      port: 4000,
      path: "/sign",
      method: "POST",
      key: fs.readFileSync(path.join(certPath, "core.key")),
      cert: fs.readFileSync(path.join(certPath, "core.crt")),
      ca: fs.readFileSync(path.join(certPath, "ca.crt")),
      rejectUnauthorized: true,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const signature = await new Promise<string>((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.signature);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", reject);

      req.write(JSON.stringify({ hash: certificateHash }));
      req.end();
    });

    const PUBLIC_KEY_DER_BASE64 = process.env.SIGNER_PUBLIC_KEY_DER_BASE64;

    if (!PUBLIC_KEY_DER_BASE64) {
      throw new Error("Missing SIGNER_PUBLIC_KEY_DER_BASE64");
    }

    const publicKeyObject = createPublicKey({
      key: Buffer.from(PUBLIC_KEY_DER_BASE64, "base64"),
      format: "der",
      type: "spki",
    });

    const isValid = verify(
      null,
      Buffer.from(certificateHash),
      publicKeyObject,
      Buffer.from(signature, "base64"),
    );

    if (!isValid) {
      throw new Error("Signature verification failed");
    }

    return {
      certificate,
      certificateHash,
      signature,
    };
  }
}
