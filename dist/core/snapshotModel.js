"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSnapshot = createSnapshot;
const hash_1 = require("./hash");
function createSnapshot(historyRoot, eventCount) {
    const createdAt = new Date().toISOString();
    const rawId = `${historyRoot}-${eventCount}-${createdAt}`;
    const snapshotId = (0, hash_1.hashString)(rawId);
    return {
        snapshotId,
        createdAt,
        eventCount,
        historyRoot,
        sealed: true,
    };
}
