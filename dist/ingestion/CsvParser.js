"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsvFile = parseCsvFile;
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
async function parseCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parse_1.parse)({
            columns: (header) => header.map((h) => h.toLowerCase()),
            trim: true,
            skip_empty_lines: true,
        }))
            .on("data", (row) => {
            try {
                const canonical = {
                    date: row.date,
                    account: row.account,
                    debit: Number(row.debit || 0),
                    credit: Number(row.credit || 0),
                    reference: row.reference,
                    vendor: row.vendor || undefined,
                    taxRate: row.tax_rate ? Number(row.tax_rate) : undefined,
                    taxAmount: row.tax_amount ? Number(row.tax_amount) : undefined,
                };
                if (!canonical.date || !canonical.account) {
                    throw new Error("Missing required fields");
                }
                rows.push(canonical);
            }
            catch (err) {
                reject(err);
            }
        })
            .on("end", () => {
            resolve(rows);
        })
            .on("error", reject);
    });
}
