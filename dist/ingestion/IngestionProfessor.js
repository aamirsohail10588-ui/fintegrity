"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionProcessor = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
const db_1 = require("../infrastructure/db");
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const events_1 = require("../core/events");
const db_2 = require("../infrastructure/db");
class IngestionProcessor {
    async process(fileId, mappingVersionId, entityId) {
        const mappingRows = (await (0, db_1.query)(`
  SELECT mapping_json
  FROM ingestion_mappings
  WHERE id = $1
  `, [mappingVersionId]));
        if (mappingRows.length === 0) {
            throw new Error("Mapping not found");
        }
        const mapping = mappingRows[0].mapping_json;
        // 2️⃣ Resolve file path
        const uploadDir = path_1.default.join(__dirname, "../../uploads");
        const filePath = path_1.default.join(uploadDir, fileId);
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error("Uploaded file not found");
        }
        // 3️⃣ Parse full CSV
        const records = [];
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parse_1.parse)({ columns: true, trim: true }))
                .on("data", (row) => records.push(row))
                .on("end", resolve)
                .on("error", reject);
        });
        if (records.length === 0) {
            throw new Error("CSV file contains no rows");
        }
        // 4️⃣ Build canonical ledger rows
        const canonicalRows = [];
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
        const errors = [];
        canonicalRows.forEach((row) => {
            const { debit, credit, runningBalance, rowIndex } = row;
            // Rule 1: Only one side must be > 0
            if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
                errors.push(`Row ${rowIndex}: Exactly one of debit or credit must be > 0`);
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
                    errors.push(`Row ${rowIndex}: Running balance mismatch. Expected ${computedBalance}, found ${runningBalance}`);
                }
            }
        });
        // If any errors → reject entire ingestion
        if (errors.length > 0) {
            throw new Error(`Ledger validation failed:\n` + errors.join("\n"));
        }
        // 6️⃣ Atomic ingestion transaction
        const client = await (0, db_2.getPool)().connect();
        try {
            await client.query("BEGIN");
            const entityResult = await client.query(`
    SELECT version
    FROM entities
    WHERE id = $1
    FOR UPDATE
    `, [entityId]);
            if (entityResult.rows.length === 0) {
                throw new Error("Entity not found");
            }
            let currentVersion = Number(entityResult.rows[0].version);
            const store = new PostgresEventStore_1.PostgresEventStore();
            for (const row of canonicalRows) {
                currentVersion += 1;
                const domainEvent = (0, events_1.createEvent)(entityId, "ledger_row_ingested", "ingestion", row, "system", "system", currentVersion);
                await store.append(client, domainEvent, currentVersion);
            }
            await client.query(`
    UPDATE entities
    SET version = $1
    WHERE id = $2
    `, [currentVersion, entityId]);
            await client.query("COMMIT");
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.IngestionProcessor = IngestionProcessor;
