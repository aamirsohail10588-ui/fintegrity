"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionDomainService = void 0;
const core_1 = require("../../core");
class IngestionDomainService {
    async buildEvents(input, decisionType, startingVersion) {
        this.validate(input);
        const canonical = {
            reference: input.reference,
            entries: input.entries,
        };
        if (decisionType === "DUPLICATE" && !input.correctionOf) {
            throw new Error(`[INGESTION] Business duplicate detected for reference ${canonical.reference}`);
        }
        const events = [];
        // Correction path
        let currentVersion = startingVersion;
        if (input.correctionOf) {
            const reversalEvent = this.buildReversalEvent(input, currentVersion);
            events.push(reversalEvent);
            currentVersion += 1;
        }
        const ingestionEvent = (0, core_1.createEvent)(input.entityId, "transaction_ingested", "INGESTION", canonical, input.actorId, input.actorRole, currentVersion);
        events.push(ingestionEvent);
        return events;
    }
    buildReversalEvent(input, version) {
        const reversalPayload = {
            reference: input.reference,
            entries: input.entries.map((entry) => ({
                accountId: entry.accountId,
                debit: entry.credit,
                credit: entry.debit,
            })),
        };
        return (0, core_1.createEvent)(input.entityId, "transaction_reversed", "CORRECTION", reversalPayload, input.actorId, input.actorRole, version, input.correctionOf);
    }
    validate(input) {
        if (!input.entityId)
            throw new Error("Missing entityId");
        if (!input.reference)
            throw new Error("Missing reference");
        if (!input.entries || !Array.isArray(input.entries))
            throw new Error("Entries must be an array");
        if (input.entries.length < 2)
            throw new Error("At least two ledger entries required");
        let totalDebit = 0;
        let totalCredit = 0;
        for (const entry of input.entries) {
            if (!entry.accountId)
                throw new Error("Entry missing accountId");
            if (!Number.isFinite(entry.debit))
                throw new Error("Invalid debit value");
            if (!Number.isFinite(entry.credit))
                throw new Error("Invalid credit value");
            if (entry.debit < 0 || entry.credit < 0)
                throw new Error("Debit/Credit cannot be negative");
            if (entry.debit > 0 && entry.credit > 0)
                throw new Error("Entry cannot have both debit and credit");
            if (entry.debit === 0 && entry.credit === 0)
                throw new Error("Entry must have debit or credit");
            totalDebit += entry.debit;
            totalCredit += entry.credit;
        }
        if (totalDebit !== totalCredit)
            throw new Error("Trial balance violated: debit != credit");
    }
}
exports.IngestionDomainService = IngestionDomainService;
