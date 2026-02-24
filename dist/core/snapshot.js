"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHistoryRoot = computeHistoryRoot;
exports.validateSnapshot = validateSnapshot;
const hash_1 = require("./hash");
function computeHistoryRoot(events) {
    const concatenatedData = events
        .map((event) => {
        return [
            event.metadata.eventId,
            event.metadata.payloadHash,
            event.metadata.eventType,
            event.metadata.version,
        ].join(":");
    })
        .join("|");
    return (0, hash_1.hashString)(concatenatedData);
}
function validateSnapshot(snapshot, events) {
    const currentRoot = computeHistoryRoot(events);
    if (currentRoot !== snapshot.historyRoot) {
        throw new Error("Snapshot history root mismatch");
    }
    if (events.length !== snapshot.eventCount) {
        throw new Error("Snapshot event count mismatch");
    }
    return true;
}
