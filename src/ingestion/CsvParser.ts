import fs from "fs";
import { parse } from "csv-parse";

export interface CanonicalRow {
  date: string;
  account: string;
  debit: number;
  credit: number;
  reference: string;
  vendor?: string;
  taxRate?: number;
  taxAmount?: number;
}

export async function parseCsvFile(filePath: string): Promise<CanonicalRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CanonicalRow[] = [];

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: (header) => header.map((h) => h.toLowerCase()),
          trim: true,
          skip_empty_lines: true,
        }),
      )
      .on("data", (row: Record<string, string>) => {
        try {
          const canonical: CanonicalRow = {
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
        } catch (err) {
          reject(err);
        }
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", reject);
  });
}
