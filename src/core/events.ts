export interface EventMetadata {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly version: number;
  readonly module: string;
  readonly payloadHash: string;
  readonly entityId: string;
  readonly signature: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly correctsEventId?: string;
}

export interface DomainEvent<TPayload> {
  readonly metadata: EventMetadata;
  readonly payload: TPayload;
}

import { canonicalStringify } from "./canonicalStringify";
import { hashString } from "./hash";
import { signData } from "./signature";

export function createEvent<TPayload>(
  entityId: string,
  eventType: string,
  module: string,
  payload: TPayload,
  actorId: string,
  actorRole: string,
  version: number = 1,
  correctsEventId?: string,
): DomainEvent<TPayload> {
  const occurredAt: string = new Date().toISOString();

  const payloadHash: string = hashString(canonicalStringify(payload));

  const canonicalPayload: string = canonicalStringify(payload);

  const rawId: string = `${entityId}-${eventType}-${occurredAt}-${canonicalPayload}`;
  const eventId: string = hashString(rawId);

  const signatureBase: string = [
    eventId,
    payloadHash,
    eventType,
    String(version),
    correctsEventId ?? "",
    actorId,
    actorRole,
    module,
  ].join(":");

  const signature = signData(signatureBase);

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
