export type RuleDecisionType = "ALLOW" | "DUPLICATE" | "REQUIRES_CORRECTION";

export interface RuleDecision {
  readonly type: RuleDecisionType;
  readonly reason?: string;
  readonly conflictingEventId?: string;
}

export interface BusinessContext {
  readonly entityId: string;
  readonly businessId: string; // invoice number, txn id, etc.
  readonly amount: number;
}

import { query } from "../infrastructure/db";

export class BusinessRuleEngine {
  public async evaluate(context: BusinessContext): Promise<RuleDecision> {
    // 1️⃣ Check existing businessId for entity
    interface EventRow {
      event_id: string;
      payload: {
        entries?: { debit?: number }[];
        [key: string]: unknown;
      };
    }

    const rows = (await query(
      `
  SELECT event_id, payload
  FROM events
  WHERE entity_id = $1
    AND payload ->> 'reference' = $2
  ORDER BY version ASC
  LIMIT 1
  `,
      [context.entityId, context.businessId],
    )) as EventRow[];

    if (rows.length === 0) {
      return { type: "ALLOW" };
    }

    const existingEvent = rows[0];

    const payload = existingEvent.payload;

    const existingAmount = Array.isArray(payload.entries)
      ? payload.entries.reduce(
          (sum: number, entry: { debit?: number }) =>
            sum + Number(entry.debit ?? 0),
          0,
        )
      : 0;

    // 2️⃣ Exact same amount → duplicate
    if (existingAmount === context.amount) {
      return {
        type: "DUPLICATE",
        reason: "Business duplicate detected",
        conflictingEventId: existingEvent.event_id,
      };
    }

    // 3️⃣ Different amount → correction required
    return {
      type: "REQUIRES_CORRECTION",
      reason: "Amount differs from existing business record",
      conflictingEventId: existingEvent.event_id,
    };
  }
}
