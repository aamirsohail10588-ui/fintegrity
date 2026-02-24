import { createHash } from "crypto";

export function hashString(input: string): string {
  const hash = createHash("sha256");
  hash.update(input, "utf8");
  return hash.digest("hex");
}

export function hashObject(input: Record<string, unknown>): string {
  const stableString: string = JSON.stringify(sortObject(input));
  return hashString(stableString);
}

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sortedKeys: string[] = Object.keys(obj).sort();

  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const value: unknown = obj[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sortObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

import type { CanonicalTransaction } from "./types";

export function hashTransaction(tx: CanonicalTransaction): string {
  const normalized = {
    reference: tx.reference,
    entries: tx.entries
      .map((e) => ({
        accountId: e.accountId,
        debit: e.debit,
        credit: e.credit,
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId)),
  };

  return hashObject(normalized);
}
