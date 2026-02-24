# FINTEGRITY CORE PROTOCOL — VERSION 1

This document defines the non-negotiable integrity rules of the Fintegrity event core.
Any change to these rules requires a protocol version bump.

---

## 1. Event Stream Invariants

1.1 Events are strictly ordered by version per entity.

1.2 Version must increment by exactly +1.

1.3 entity_id must remain constant within a replay stream.

1.4 (entity_id, version) must be unique.

1.5 event_id must be globally unique.

1.6 Events are immutable.
    - UPDATE is forbidden.
    - DELETE is forbidden.

---

## 2. Payload Integrity

2.1 payload_hash = hash(canonicalStringify(payload))

2.2 canonicalStringify must produce deterministic ordering.

2.3 Replay must fail if recalculated hash != stored payload_hash.

---

## 3. Signature Integrity

3.1 signatureBase format (strict):

eventId : payloadHash : eventType : version : correctsEventId : actorId : actorRole : module

3.2 signature = HMAC_SHA256(signatureBase, EVENT_SECRET)

3.3 Replay must fail if signature verification fails.

---

## 4. Replay Engine Rules

4.1 Replay must fail on:
    - Version gaps
    - Mixed entity IDs
    - Payload tampering
    - Signature tampering
    - Missing payloadHash

4.2 Upcasters must be deterministic.

---

## 5. Snapshot Rules

5.1 Snapshot version must equal entity.version.

5.2 Snapshot sealing emits snapshot_sealed event.

5.3 Double seal for same version is forbidden.

5.4 Merkle root must be deterministic.

---

## 6. Concurrency Rules

6.1 Entity row must be SELECT ... FOR UPDATE during append.

6.2 expectedVersion must match entity.version.

6.3 Concurrency violation must throw.

---

## 7. Mutation Policy

Any change to:
- signature format
- hashing method
- canonicalization method
- replay sequencing logic

Requires:
- New protocol version
- Migration strategy
- Backward compatibility layer

---

This protocol is frozen under version 1.