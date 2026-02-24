"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const signature_1 = require("./signature");
const hash_1 = require("./hash");
const canonicalStringify_1 = require("./canonicalStringify");
const replay_1 = require("./replay");
const merkle_1 = require("./merkle");
const merkle_2 = require("./merkle");
function buildSignatureBase(eventId, payloadHash, eventType, version, correctsEventId, actorId, actorRole, module) {
    return [
        eventId,
        payloadHash,
        eventType,
        String(version),
        correctsEventId ?? "",
        actorId,
        actorRole,
        module,
    ].join(":");
}
// Determinism test
const payload = { amount: 100 };
const payloadHash = (0, hash_1.hashString)((0, canonicalStringify_1.canonicalStringify)(payload));
const signatureBase = buildSignatureBase("evt-1", payloadHash, "transaction_ingested", 1, undefined, "admin", "admin", "INGESTION");
const sig1 = (0, signature_1.signData)(signatureBase);
const sig2 = (0, signature_1.signData)(signatureBase);
console.log("Deterministic signature:", sig1 === sig2);
// ---------------------------
// Tamper test
// ---------------------------
const tamperedBase = signatureBase + "x";
const tamperedSig = (0, signature_1.signData)(tamperedBase);
console.log("Tamper rejected:", tamperedSig !== sig1);
// ---------------------------
// Replay integrity test
// ---------------------------
const fakeEvent = {
    metadata: {
        eventId: "evt-1",
        eventType: "transaction_ingested",
        module: "INGESTION",
        version: 1,
        occurredAt: new Date().toISOString(),
        payloadHash,
        entityId: "entity-1",
        actorId: "admin",
        actorRole: "admin",
        signature: sig1,
        correctsEventId: undefined,
    },
    payload,
};
const reducer = (state, event) => {
    return state + event.payload.amount;
};
const state = (0, replay_1.replay)([fakeEvent], 0, reducer);
console.log("Replay deterministic:", state === 100);
// ---------------------------
// Tampered payload should fail
// ---------------------------
const _tamperedEvent = {
    ...fakeEvent,
    payload: { amount: 999 }, // changed payload but same signature
};
try {
    (0, replay_1.replay)([_tamperedEvent], 0, reducer);
    console.log("Payload tamper test: FAILED");
}
catch {
    console.log("Payload tamper test: PASSED");
}
// ---------------------------
// Wrong signature should fail
// ---------------------------
const _wrongSigEvent = {
    ...fakeEvent,
    metadata: {
        ...fakeEvent.metadata,
        signature: "fake-signature",
    },
};
try {
    (0, replay_1.replay)([_wrongSigEvent], 0, reducer);
    console.log("Signature tamper test: FAILED");
}
catch {
    console.log("Signature tamper test: PASSED");
}
// ---------------------------
// Version gap should fail
// ---------------------------
const _gapEvent = {
    ...fakeEvent,
    metadata: {
        ...fakeEvent.metadata,
        version: 2, // incorrect start version
    },
};
try {
    (0, replay_1.replay)([_gapEvent], 0, reducer);
    console.log("Version gap test: FAILED");
}
catch {
    console.log("Version gap test: PASSED");
}
// ---------------------------
// Multi-event sequential test
// ---------------------------
const payload2 = { amount: 50 };
const payloadHash2 = (0, hash_1.hashString)((0, canonicalStringify_1.canonicalStringify)(payload2));
const signatureBase2 = [
    "evt-2",
    payloadHash2,
    "transaction_ingested",
    "2",
    "",
    "admin",
    "admin",
    "INGESTION",
].join(":");
const sigEvent2 = (0, signature_1.signData)(signatureBase2);
const event2 = {
    metadata: {
        eventId: "evt-2",
        eventType: "transaction_ingested",
        module: "INGESTION",
        version: 2,
        occurredAt: new Date().toISOString(),
        payloadHash: payloadHash2,
        entityId: "entity-1",
        actorId: "admin",
        actorRole: "admin",
        signature: sigEvent2,
        correctsEventId: undefined,
    },
    payload: payload2,
};
const multiState = (0, replay_1.replay)([fakeEvent, event2], 0, reducer);
console.log("Multi-event replay correct:", multiState === 150);
// ---------------------------
// Mixed entity ID should fail
// ---------------------------
const wrongEntityEvent = {
    ...event2,
    metadata: {
        ...event2.metadata,
        entityId: "entity-2",
    },
};
try {
    (0, replay_1.replay)([fakeEvent, wrongEntityEvent], 0, reducer);
    console.log("Mixed entity test: FAILED");
}
catch {
    console.log("Mixed entity test: PASSED");
}
// ---------------------------
// Merkle determinism test
// ---------------------------
const stateForMerkle = {
    cash: 100,
    revenue: 50,
};
const leavesA = (0, merkle_1.buildLeafHashes)("entity-1", 2, stateForMerkle);
const rootA = (0, merkle_2.buildMerkleRoot)(leavesA);
const leavesB = (0, merkle_1.buildLeafHashes)("entity-1", 2, stateForMerkle);
const rootB = (0, merkle_2.buildMerkleRoot)(leavesB);
console.log("Merkle deterministic:", rootA === rootB);
// ---------------------------
// Merkle tamper test
// ---------------------------
const tamperedState = {
    cash: 999,
    revenue: 50,
};
const tamperedLeaves = (0, merkle_1.buildLeafHashes)("entity-1", 2, tamperedState);
const tamperedRoot = (0, merkle_2.buildMerkleRoot)(tamperedLeaves);
console.log("Merkle tamper detected:", tamperedRoot !== rootA);
// ---------------------------
// Duplicate eventId test
// ---------------------------
try {
    (0, replay_1.replay)([fakeEvent, fakeEvent], 0, reducer);
    console.log("Duplicate eventId test: FAILED");
}
catch {
    console.log("Duplicate eventId test: PASSED");
}
// ---------------------------
// Non-monotonic timestamp test
// ---------------------------
const e1 = { ...fakeEvent };
const e2 = {
    ...fakeEvent,
    metadata: {
        ...fakeEvent.metadata,
        eventId: "evt-2",
        version: 2,
        occurredAt: new Date(new Date(fakeEvent.metadata.occurredAt).getTime() - 1000).toISOString(),
    },
};
try {
    (0, replay_1.replay)([e1, e2], 0, reducer);
    console.log("Timestamp ordering test: FAILED");
}
catch {
    console.log("Timestamp ordering test: PASSED");
}
