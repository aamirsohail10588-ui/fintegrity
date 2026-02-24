import type { DomainEvent } from "../events";
import { EventVersionRegistry } from "./EventVersionRegistry";

type Upcaster = (event: DomainEvent<unknown>) => DomainEvent<unknown>;

export class UpcasterRegistry {
  private static readonly upcasters: Record<string, Record<number, Upcaster>> =
    {};

  public static register(
    eventType: string,
    fromVersion: number,
    upcaster: Upcaster,
  ): void {
    if (!this.upcasters[eventType]) {
      this.upcasters[eventType] = {};
    }

    this.upcasters[eventType][fromVersion] = upcaster;
  }

  public static applyUpcasters(
    event: DomainEvent<unknown>,
  ): DomainEvent<unknown> {
    const currentVersion = EventVersionRegistry.getCurrentVersion(
      event.metadata.eventType,
    );

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

import { canonicalStringify } from "../canonicalStringify";
import { hashString } from "../hash";

UpcasterRegistry.register("transaction_ingested", 1, (event) => {
  interface TransactionV1 {
    vendor: string;
    [key: string]: unknown;
  }

  const oldPayload = event.payload as TransactionV1;

  const newPayload: Record<string, unknown> = {
    ...oldPayload,
    vendorName: oldPayload.vendor,
    vendorCode: "UNKNOWN",
  };

  delete newPayload.vendor;

  return {
    metadata: {
      ...event.metadata,
      version: 2,
      payloadHash: hashString(canonicalStringify(newPayload)),
    },
    payload: newPayload,
  };
});
