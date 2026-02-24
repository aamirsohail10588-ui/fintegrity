import { hashString } from "./hash";

export interface Snapshot {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly historyRoot: string;
  readonly sealed: boolean;
}

export function createSnapshot(
  historyRoot: string,
  eventCount: number,
): Snapshot {
  const createdAt: string = new Date().toISOString();

  const rawId: string = `${historyRoot}-${eventCount}-${createdAt}`;
  const snapshotId: string = hashString(rawId);

  return {
    snapshotId,
    createdAt,
    eventCount,
    historyRoot,
    sealed: true,
  };
}
