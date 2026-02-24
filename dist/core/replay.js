"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replay = replay;
const hash_1 = require("./hash");
const UpcasterRegistry_1 = require("./versioning/UpcasterRegistry");
const canonicalStringify_1 = require("./canonicalStringify");
const signature_1 = require("./signature");
function replay(events, initialState, reducer) {
    let currentState = initialState;
    if (events.length === 0) {
        return currentState;
    }
    const entityId = events[0].metadata.entityId;
    let expectedVersion = events[0].metadata.version;
    // 🔒 Duplicate protection
    const seenEventIds = new Set();
    // 🔒 Monotonic timestamp protection
    let lastTimestamp = new Date(events[0].metadata.occurredAt).getTime();
    for (const event of events) {
        const currentTimestamp = new Date(event.metadata.occurredAt).getTime();
        if (currentTimestamp < lastTimestamp) {
            throw new Error(`[REPLAY] Non-monotonic occurredAt detected at event ${event.metadata.eventId}`);
        }
        lastTimestamp = currentTimestamp;
        if (seenEventIds.has(event.metadata.eventId)) {
            throw new Error(`[REPLAY] Duplicate eventId detected: ${event.metadata.eventId}`);
        }
        seenEventIds.add(event.metadata.eventId);
        // 1️⃣ Entity consistency
        if (event.metadata.entityId !== entityId) {
            throw new Error(`[REPLAY] Mixed entity IDs detected during replay`);
        }
        // 2️⃣ Strict version sequencing
        if (event.metadata.version !== expectedVersion) {
            throw new Error(`[REPLAY] Version gap or disorder detected. Expected ${expectedVersion}, found ${event.metadata.version}`);
        }
        if (!event.metadata.payloadHash) {
            throw new Error(`Missing payloadHash for eventId: ${event.metadata.eventId}`);
        }
        const recalculatedHash = (0, hash_1.hashString)((0, canonicalStringify_1.canonicalStringify)(event.payload));
        if (recalculatedHash !== event.metadata.payloadHash) {
            throw new Error(`Payload integrity violation for eventId: ${event.metadata.eventId}`);
        }
        const signatureBase = [
            event.metadata.eventId,
            event.metadata.payloadHash,
            event.metadata.eventType,
            String(event.metadata.version),
            event.metadata.correctsEventId ?? "",
            event.metadata.actorId,
            event.metadata.actorRole,
            event.metadata.module,
        ].join(":");
        const valid = (0, signature_1.verifySignature)(signatureBase, event.metadata.signature);
        if (!valid) {
            throw new Error(`[REPLAY] Signature validation failed for event ${event.metadata.eventId}`);
        }
        const upgradedEvent = UpcasterRegistry_1.UpcasterRegistry.applyUpcasters(event);
        currentState = reducer(currentState, upgradedEvent);
        expectedVersion += 1;
    }
    return currentState;
}
