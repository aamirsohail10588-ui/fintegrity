import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { query } from "../infrastructure/db";
import { PostgresEventStore } from "../infrastructure/PostgresEventStore";
import { createEvent } from "../core/events";
import { getPool } from "../infrastructure/db";

export interface CanonicalLedgerRow {
  date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance?: number;
  rowIndex: number;
  sourceFileId: string;
}

export class IngestionProcessor {
  async process(
    fileId: string,
    mappingVersionId: string,
    entityId: string,
  ): Promise<void> {
    // 1️⃣ Load mapping from DB
    interface MappingRow {
      mapping_json: {
        debit: string;
        credit: string;
        date: string;
        reference?: string;
        description?: string;
        runningBalance?: string;
        [key: string]: unknown;
      };
    }

    const mappingRows = (await query(
      `
  SELECT mapping_json
  FROM ingestion_mappings
  WHERE id = $1
  `,
      [mappingVersionId],
    )) as MappingRow[];

    if (mappingRows.length === 0) {
      throw new Error("Mapping not found");
    }

    const mapping = mappingRows[0].mapping_json;

    // 2️⃣ Resolve file path
    const uploadDir = path.join(__dirname, "../../uploads");
    const filePath = path.join(uploadDir, fileId);

    if (!fs.existsSync(filePath)) {
      throw new Error("Uploaded file not found");
    }

    // 3️⃣ Parse full CSV
    const records: Record<string, string>[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on("data", (row) => records.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (records.length === 0) {
      throw new Error("CSV file contains no rows");
    }

    // 4️⃣ Build canonical ledger rows
    const canonicalRows: CanonicalLedgerRow[] = [];

    records.forEach((row, index) => {
      const debitField = mapping.debit;
      const creditField = mapping.credit;
      const dateField = mapping.date;
      const referenceField = mapping.reference;
      const descriptionField = mapping.description;
      const balanceField = mapping.runningBalance;

      const debit = Number(row[debitField] || 0);
      const credit = Number(row[creditField] || 0);
      const runningBalance = balanceField
        ? Number(row[balanceField])
        : undefined;

      canonicalRows.push({
        date: row[dateField],
        reference: referenceField ? row[referenceField] : null,
        description: descriptionField ? row[descriptionField] : null,
        debit,
        credit,
        runningBalance,
        rowIndex: index + 1,
        sourceFileId: fileId,
      });
    });

    // 5️⃣ Structural + Balance Validation

    let computedBalance = 0;
    const errors: string[] = [];

    canonicalRows.forEach((row) => {
      const { debit, credit, runningBalance, rowIndex } = row;

      // Rule 1: Only one side must be > 0
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        errors.push(
          `Row ${rowIndex}: Exactly one of debit or credit must be > 0`,
        );
      }

      // Rule 2: No negative values
      if (debit < 0 || credit < 0) {
        errors.push(`Row ${rowIndex}: Negative values not allowed`);
      }

      // Update computed balance
      computedBalance += debit - credit;

      // Rule 3: Running balance consistency (if provided)
      if (runningBalance !== undefined) {
        const tolerance = 0.01;

        if (Math.abs(computedBalance - runningBalance) > tolerance) {
          errors.push(
            `Row ${rowIndex}: Running balance mismatch. Expected ${computedBalance}, found ${runningBalance}`,
          );
        }
      }
    });

    // If any errors → reject entire ingestion
    if (errors.length > 0) {
      throw new Error(`Ledger validation failed:\n` + errors.join("\n"));
    }

    // 6️⃣ Atomic ingestion transaction

    const client = await getPool().connect();

    try {
      await client.query("BEGIN");

      const entityResult = await client.query(
        `
    SELECT version
    FROM entities
    WHERE id = $1
    FOR UPDATE
    `,
        [entityId],
      );

      if (entityResult.rows.length === 0) {
        throw new Error("Entity not found");
      }

      let currentVersion = Number(entityResult.rows[0].version);

      const store = new PostgresEventStore();

      for (const row of canonicalRows) {
        currentVersion += 1;

        const domainEvent = createEvent(
          entityId,
          "ledger_row_ingested",
          "ingestion",
          row,
          "system",
          "system",
          currentVersion,
        );

        await store.append(client, domainEvent, currentVersion);
      }

      await client.query(
        `
    UPDATE entities
    SET version = $1
    WHERE id = $2
    `,
        [currentVersion, entityId],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
