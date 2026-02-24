import type { DomainEvent } from "./events";
import { hashString } from "./hash";

export function computeHistoryRoot(events: DomainEvent<unknown>[]): string {
  const concatenatedData: string = events
    .map((event) => {
      return [
        event.metadata.eventId,
        event.metadata.payloadHash,
        event.metadata.eventType,
        event.metadata.version,
      ].join(":");
    })
    .join("|");

  return hashString(concatenatedData);
}

import type { Snapshot } from "./snapshotModel";

export function validateSnapshot(
  snapshot: Snapshot,
  events: DomainEvent<unknown>[],
): boolean {
  const currentRoot: string = computeHistoryRoot(events);

  if (currentRoot !== snapshot.historyRoot) {
    throw new Error("Snapshot history root mismatch");
  }

  if (events.length !== snapshot.eventCount) {
    throw new Error("Snapshot event count mismatch");
  }

  return true;
}
