"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessRuleEngine = void 0;
const db_1 = require("../infrastructure/db");
class BusinessRuleEngine {
    async evaluate(context) {
        const rows = (await (0, db_1.query)(`
  SELECT event_id, payload
  FROM events
  WHERE entity_id = $1
    AND payload ->> 'reference' = $2
  ORDER BY id ASC
  LIMIT 1
  `, [context.entityId, context.businessId]));
        if (rows.length === 0) {
            return { type: "ALLOW" };
        }
        const existingEvent = rows[0];
        const payload = existingEvent.payload;
        const existingAmount = Array.isArray(payload.entries)
            ? payload.entries.reduce((sum, entry) => sum + Number(entry.debit ?? 0), 0)
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
exports.BusinessRuleEngine = BusinessRuleEngine;
