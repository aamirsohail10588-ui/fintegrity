import type { PoolClient } from "pg";
import type { DomainEvent } from "./index";

export interface IEventStore {
  append<TPayload>(
    client: PoolClient,
    event: DomainEvent<TPayload>,
    expectedVersion: number,
  ): Promise<string>;

  appendBatch<TPayload>(
    client: PoolClient,
    events: DomainEvent<TPayload>[],
    expectedVersion: number,
  ): Promise<string>;

  getByEntity(
    entityId: string,
    tenantId: string,
    client?: PoolClient,
  ): Promise<DomainEvent<unknown>[]>;
}
