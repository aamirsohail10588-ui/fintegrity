import { snapshot } from "node:test";

export class EventVersionRegistry {
  private static readonly currentVersions: Record<string, number> = {
    transaction_ingested: 2,
    transaction_reversed: 2,
    snapshot_sealed: 1,
  };

  public static getCurrentVersion(eventType: string): number {
    const version = this.currentVersions[eventType];

    if (!version) {
      throw new Error(`No version registered for event type: ${eventType}`);
    }

    return version;
  }
}
