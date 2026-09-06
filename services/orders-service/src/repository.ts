import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  IllegalTransitionError,
  transition,
  type OrderSide,
  type OrderStatus,
  type OrderType,
} from "@mesa/contracts";

export interface Order {
  readonly id: string;
  readonly accountId: string;
  readonly ticker: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly status: OrderStatus;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly limitPriceCents: bigint | null;
  readonly stopPriceCents: bigint | null;
  readonly averagePriceCents: bigint | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

export interface OrderEvent {
  readonly sequence: number;
  readonly from: OrderStatus | null;
  readonly to: OrderStatus;
  readonly filledDelta: number;
  readonly priceCents: bigint | null;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface PlaceInput {
  readonly accountId: string;
  readonly ticker: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: number;
  readonly limitPriceCents?: bigint;
  readonly stopPriceCents?: bigint;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
}

export class OrderNotFoundError extends Error {
  readonly orderId: string;
  constructor(orderId: string) {
    super(`Unknown order ${orderId}`);
    this.name = "OrderNotFoundError";
    this.orderId = orderId;
  }
}

export class OverfillError extends Error {
  readonly orderId: string;
  constructor(orderId: string, requested: number, remaining: number) {
    super(`Fill of ${requested} exceeds ${remaining} remaining on ${orderId}`);
    this.name = "OverfillError";
    this.orderId = orderId;
  }
}

const SCHEMA = readFileSync(
  fileURLToPath(new URL("./schema.sql", import.meta.url)),
  "utf8",
);

interface OrderRow {
  id: string;
  account_id: string;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: bigint;
  filled_quantity: bigint;
  limit_price_cents: bigint | null;
  stop_price_cents: bigint | null;
  average_price_cents: bigint | null;
  created_at: string;
  updated_at: string;
}

export function createOrderRepository(location = ":memory:") {
  const db = new DatabaseSync(location);
  db.exec(SCHEMA);

  const selectById = db.prepare(`SELECT * FROM orders WHERE id = ?`);
  const selectByKey = db.prepare(`SELECT * FROM orders WHERE idempotency_key = ?`);
  const selectByAccount = db.prepare(
    `SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC, id LIMIT ?`,
  );
  const selectEvents = db.prepare(
    `SELECT sequence, from_status, to_status, filled_delta, price_cents, reason, occurred_at
     FROM order_events WHERE order_id = ? ORDER BY sequence`,
  );
  const nextSequence = db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM order_events WHERE order_id = ?`,
  );
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, account_id, ticker, side, type, status, quantity,
       filled_quantity, limit_price_cents, stop_price_cents, idempotency_key,
       correlation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEvent = db.prepare(
    `INSERT INTO order_events (order_id, sequence, from_status, to_status,
       filled_delta, price_cents, reason, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateOrder = db.prepare(
    `UPDATE orders SET status = ?, filled_quantity = ?, average_price_cents = ?, updated_at = ?
     WHERE id = ?`,
  );

  for (const statement of [
    selectById,
    selectByKey,
    selectByAccount,
    selectEvents,
    nextSequence,
  ]) {
    statement.setReadBigInts(true);
  }

  const toOrder = (row: OrderRow, replayed: boolean): Order => ({
    id: row.id,
    accountId: row.account_id,
    ticker: row.ticker,
    side: row.side,
    type: row.type,
    status: row.status,
    quantity: Number(row.quantity),
    filledQuantity: Number(row.filled_quantity),
    limitPriceCents:
      row.limit_price_cents === null ? null : BigInt(row.limit_price_cents),
    stopPriceCents: row.stop_price_cents === null ? null : BigInt(row.stop_price_cents),
    averagePriceCents:
      row.average_price_cents === null ? null : BigInt(row.average_price_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replayed,
  });

  function get(orderId: string): Order {
    const row = selectById.get(orderId) as OrderRow | undefined;
    if (!row) throw new OrderNotFoundError(orderId);
    return toOrder(row, false);
  }

  function appendEvent(
    orderId: string,
    from: OrderStatus | null,
    to: OrderStatus,
    at: string,
    filledDelta = 0,
    priceCents: bigint | null = null,
    reason: string | null = null,
  ): void {
    const { next } = nextSequence.get(orderId) as { next: bigint };
    insertEvent.run(orderId, next, from, to, filledDelta, priceCents, reason, at);
  }

  function place(input: PlaceInput, now = new Date()): Order {
    const existing = selectByKey.get(input.idempotencyKey) as OrderRow | undefined;
    if (existing) return toOrder(existing, true);

    const id = crypto.randomUUID();
    const at = now.toISOString();

    db.exec("BEGIN IMMEDIATE");
    try {
      insertOrder.run(
        id,
        input.accountId,
        input.ticker,
        input.side,
        input.type,
        "RECEIVED",
        input.quantity,
        input.limitPriceCents ?? null,
        input.stopPriceCents ?? null,
        input.idempotencyKey,
        input.correlationId ?? null,
        at,
        at,
      );
      appendEvent(id, null, "RECEIVED", at);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return get(id);
  }

  function advance(
    orderId: string,
    to: OrderStatus,
    reason?: string,
    now = new Date(),
  ): Order {
    const current = get(orderId);
    const next = transition(current.status, to);
    const at = now.toISOString();

    db.exec("BEGIN IMMEDIATE");
    try {
      updateOrder.run(
        next,
        current.filledQuantity,
        current.averagePriceCents,
        at,
        orderId,
      );
      appendEvent(orderId, current.status, next, at, 0, null, reason ?? null);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return get(orderId);
  }

  function fill(
    orderId: string,
    quantity: number,
    priceCents: bigint,
    now = new Date(),
  ): Order {
    const current = get(orderId);
    const remaining = current.quantity - current.filledQuantity;
    if (quantity <= 0 || quantity > remaining) {
      throw new OverfillError(orderId, quantity, remaining);
    }

    const filled = current.filledQuantity + quantity;
    const to: OrderStatus = filled === current.quantity ? "FILLED" : "PARTIALLY_FILLED";
    const next = transition(current.status, to);

    const previousValue =
      (current.averagePriceCents ?? 0n) * BigInt(current.filledQuantity);
    const addedValue = priceCents * BigInt(quantity);
    const averagePriceCents = (previousValue + addedValue) / BigInt(filled);

    const at = now.toISOString();

    db.exec("BEGIN IMMEDIATE");
    try {
      updateOrder.run(next, filled, averagePriceCents, at, orderId);
      appendEvent(orderId, current.status, next, at, quantity, priceCents);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return get(orderId);
  }

  function events(orderId: string): OrderEvent[] {
    const rows = selectEvents.all(orderId) as {
      sequence: bigint;
      from_status: OrderStatus | null;
      to_status: OrderStatus;
      filled_delta: bigint;
      price_cents: bigint | null;
      reason: string | null;
      occurred_at: string;
    }[];
    return rows.map((r) => ({
      sequence: Number(r.sequence),
      from: r.from_status,
      to: r.to_status,
      filledDelta: Number(r.filled_delta),
      priceCents: r.price_cents === null ? null : BigInt(r.price_cents),
      reason: r.reason,
      occurredAt: r.occurred_at,
    }));
  }

  function listByAccount(accountId: string, limit = 50): Order[] {
    const rows = selectByAccount.all(accountId, limit) as unknown as OrderRow[];
    return rows.map((row) => toOrder(row, false));
  }

  function heldQuantity(accountId: string, ticker: string): number {
    const query = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN side = 'BUY' THEN filled_quantity
                               ELSE -filled_quantity END), 0) AS held
       FROM orders WHERE account_id = ? AND ticker = ?`,
    );
    query.setReadBigInts(true);
    const row = query.get(accountId, ticker) as { held: bigint };
    return Number(row.held);
  }

  return { db, place, get, advance, fill, events, listByAccount, heldQuantity };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
export { IllegalTransitionError };
