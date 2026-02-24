"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventVersionRegistry = void 0;
class EventVersionRegistry {
    static getCurrentVersion(eventType) {
        const version = this.currentVersions[eventType];
        if (!version) {
            throw new Error(`No version registered for event type: ${eventType}`);
        }
        return version;
    }
}
exports.EventVersionRegistry = EventVersionRegistry;
EventVersionRegistry.currentVersions = {
    transaction_ingested: 2,
    transaction_reversed: 2,
    snapshot_sealed: 1,
};
