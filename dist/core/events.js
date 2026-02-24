"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
const canonicalStringify_1 = require("./canonicalStringify");
const hash_1 = require("./hash");
const signature_1 = require("./signature");
function createEvent(entityId, eventType, module, payload, actorId, actorRole, version = 1, correctsEventId) {
    const occurredAt = new Date().toISOString();
    const payloadHash = (0, hash_1.hashString)((0, canonicalStringify_1.canonicalStringify)(payload));
    const canonicalPayload = (0, canonicalStringify_1.canonicalStringify)(payload);
    const rawId = `${entityId}-${eventType}-${occurredAt}-${canonicalPayload}`;
    const eventId = (0, hash_1.hashString)(rawId);
    const signatureBase = [
        eventId,
        payloadHash,
        eventType,
        String(version),
        correctsEventId ?? "",
        actorId,
        actorRole,
        module,
    ].join(":");
    const signature = (0, signature_1.signData)(signatureBase);
    return {
        metadata: {
            eventId,
            eventType,
            occurredAt,
            version,
            module,
            payloadHash,
            entityId,
            actorId,
            actorRole,
            signature,
            correctsEventId,
        },
        payload,
    };
}
