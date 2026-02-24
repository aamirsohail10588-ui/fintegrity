"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpcasterRegistry = void 0;
const EventVersionRegistry_1 = require("./EventVersionRegistry");
class UpcasterRegistry {
    static register(eventType, fromVersion, upcaster) {
        if (!this.upcasters[eventType]) {
            this.upcasters[eventType] = {};
        }
        this.upcasters[eventType][fromVersion] = upcaster;
    }
    static applyUpcasters(event) {
        const currentVersion = EventVersionRegistry_1.EventVersionRegistry.getCurrentVersion(event.metadata.eventType);
        let upgradedEvent = { ...event };
        while (upgradedEvent.metadata.version < currentVersion) {
            const eventType = upgradedEvent.metadata.eventType;
            const fromVersion = upgradedEvent.metadata.version;
            const upcaster = this.upcasters[eventType]?.[fromVersion];
            if (!upcaster) {
                throw new Error(`Missing upcaster for ${eventType} v${fromVersion}`);
            }
            upgradedEvent = upcaster(upgradedEvent);
        }
        return upgradedEvent;
    }
}
exports.UpcasterRegistry = UpcasterRegistry;
UpcasterRegistry.upcasters = {};
const canonicalStringify_1 = require("../canonicalStringify");
const hash_1 = require("../hash");
UpcasterRegistry.register("transaction_ingested", 1, (event) => {
    const oldPayload = event.payload;
    const newPayload = {
        ...oldPayload,
        vendorName: oldPayload.vendor,
        vendorCode: "UNKNOWN",
    };
    delete newPayload.vendor;
    return {
        metadata: {
            ...event.metadata,
            version: 2,
            payloadHash: (0, hash_1.hashString)((0, canonicalStringify_1.canonicalStringify)(newPayload)),
        },
        payload: newPayload,
    };
});
