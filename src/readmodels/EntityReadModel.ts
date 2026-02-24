import { replay, computeHistoryRoot } from "../core";

import type { DomainEvent } from "../core";
import type { AccountBalanceState } from "../state";
import { accountBalanceReducer } from "../state";

export interface EntitySnapshotView {
  entityId: string;
  eventCount: number;
  historyRoot: string;
  balances: AccountBalanceState;
}

export class EntityReadModel {
  public static build(
    entityId: string,
    events: DomainEvent<unknown>[],
  ): EntitySnapshotView {
    const historyRoot = computeHistoryRoot(events);

    const balances = replay<AccountBalanceState>(
      events,
      {},
      accountBalanceReducer,
    );

    return {
      entityId,
      eventCount: events.length,
      historyRoot,
      balances,
    };
  }
}
