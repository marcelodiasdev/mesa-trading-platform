import { beforeEach, describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  OrderNotFoundError,
  OverfillError,
  createOrderRepository,
  type OrderRepository,
  type PlaceInput,
} from "./repository.ts";

const ACCOUNT = "acc-1";
let repo: OrderRepository;

const input = (over: Partial<PlaceInput> = {}): PlaceInput => ({
  accountId: ACCOUNT,
  ticker: "PETR4",
  side: "BUY",
  type: "LIMIT",
  quantity: 100,
  limitPriceCents: 38_50n,
  idempotencyKey: crypto.randomUUID(),
  ...over,
});

function working(over: Partial<PlaceInput> = {}) {
  const order = repo.place(input(over));
  repo.advance(order.id, "VALIDATED");
  repo.advance(order.id, "WORKING");
  return order.id;
}

beforeEach(() => {
  repo = createOrderRepository();
});

describe("placing an order", () => {
  it("starts in RECEIVED with nothing filled", () => {
    const order = repo.place(input());
    expect(order.status).toBe("RECEIVED");
    expect(order.filledQuantity).toBe(0);
    expect(order.averagePriceCents).toBeNull();
    expect(order.replayed).toBe(false);
  });

  it("records the opening event", () => {
    const order = repo.place(input());
    expect(repo.events(order.id)).toMatchObject([
      { sequence: 1, from: null, to: "RECEIVED" },
    ]);
  });

  it("keeps prices as bigint", () => {
    const order = repo.place(input({ limitPriceCents: 9_007_199_254_740_993n }));
    expect(order.limitPriceCents).toBe(9_007_199_254_740_993n);
  });

  it("raises for an unknown order", () => {
    expect(() => repo.get("nope")).toThrow(OrderNotFoundError);
  });
});

describe("idempotency", () => {
  it("returns the original order on replay", () => {
    const key = crypto.randomUUID();
    const first = repo.place(input({ idempotencyKey: key }));
    const second = repo.place(input({ idempotencyKey: key }));

    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    expect(repo.listByAccount(ACCOUNT)).toHaveLength(1);
  });

  it("does not append a second opening event on replay", () => {
    const key = crypto.randomUUID();
    const order = repo.place(input({ idempotencyKey: key }));
    repo.place(input({ idempotencyKey: key }));
    expect(repo.events(order.id)).toHaveLength(1);
  });

  it("treats a different key as a different order", () => {
    repo.place(input());
    repo.place(input());
    expect(repo.listByAccount(ACCOUNT)).toHaveLength(2);
  });
});

describe("the state machine is enforced by the repository", () => {
  it("walks the happy path", () => {
    const id = working();
    expect(repo.get(id).status).toBe("WORKING");
  });

  it("refuses to skip validation", () => {
    const order = repo.place(input());
    expect(() => repo.advance(order.id, "WORKING")).toThrow(IllegalTransitionError);
  });

  it("refuses to revive a cancelled order", () => {
    const id = working();
    repo.advance(id, "CANCELLED", "client requested");
    expect(() => repo.advance(id, "WORKING")).toThrow(IllegalTransitionError);
  });

  it("keeps the reason on the event, so a rejection can be explained", () => {
    const order = repo.place(input());
    repo.advance(order.id, "REJECTED", "INSUFFICIENT_BUYING_POWER");
    const last = repo.events(order.id).at(-1);
    expect(last).toMatchObject({ to: "REJECTED", reason: "INSUFFICIENT_BUYING_POWER" });
  });
});

describe("fills", () => {
  it("moves to PARTIALLY_FILLED and keeps the remainder open", () => {
    const id = working();
    const order = repo.fill(id, 40, 38_50n);
    expect(order.status).toBe("PARTIALLY_FILLED");
    expect(order.filledQuantity).toBe(40);
  });

  it("moves to FILLED when the last share is executed", () => {
    const id = working();
    repo.fill(id, 40, 38_50n);
    const order = repo.fill(id, 60, 38_60n);
    expect(order.status).toBe("FILLED");
    expect(order.filledQuantity).toBe(100);
  });

  it("averages the price across fills, weighted by quantity", () => {
    const id = working();
    repo.fill(id, 40, 38_00n);
    const order = repo.fill(id, 60, 39_00n);
    // (40 * 3800 + 60 * 3900) / 100
    expect(order.averagePriceCents).toBe(3_860n);
  });

  it("refuses to fill more than was ordered", () => {
    const id = working();
    repo.fill(id, 60, 38_50n);
    expect(() => repo.fill(id, 60, 38_50n)).toThrow(OverfillError);
  });

  it("refuses a non-positive fill", () => {
    const id = working();
    expect(() => repo.fill(id, 0, 38_50n)).toThrow(OverfillError);
  });

  it("refuses to fill a cancelled order", () => {
    const id = working();
    repo.advance(id, "CANCELLED");
    expect(() => repo.fill(id, 100, 38_50n)).toThrow(IllegalTransitionError);
  });

  it("records every execution in the log", () => {
    const id = working();
    repo.fill(id, 40, 38_00n);
    repo.fill(id, 60, 39_00n);

    const log = repo.events(id).map((e) => [e.to, e.filledDelta, e.priceCents]);
    expect(log).toEqual([
      ["RECEIVED", 0, null],
      ["VALIDATED", 0, null],
      ["WORKING", 0, null],
      ["PARTIALLY_FILLED", 40, 3_800n],
      ["FILLED", 60, 3_900n],
    ]);
  });
});

describe("the event log is the record of what happened", () => {
  it("refuses to update an event", () => {
    working();
    expect(() => repo.db.exec("UPDATE order_events SET to_status = 'FILLED'")).toThrow(
      /immutable/,
    );
  });

  it("refuses to delete an event", () => {
    working();
    expect(() => repo.db.exec("DELETE FROM order_events")).toThrow(/immutable/);
  });

  it("numbers events in order, with no gaps", () => {
    const id = working();
    repo.fill(id, 100, 38_50n);
    expect(repo.events(id).map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
  });
});

describe("position", () => {
  it("counts filled buys", () => {
    const id = working();
    repo.fill(id, 100, 38_50n);
    expect(repo.heldQuantity(ACCOUNT, "PETR4")).toBe(100);
  });

  it("nets filled sells against buys", () => {
    const buy = working();
    repo.fill(buy, 100, 38_50n);
    const sell = working({ side: "SELL" });
    repo.fill(sell, 40, 39_00n);
    expect(repo.heldQuantity(ACCOUNT, "PETR4")).toBe(60);
  });

  it("ignores orders that never filled", () => {
    working();
    expect(repo.heldQuantity(ACCOUNT, "PETR4")).toBe(0);
  });

  it("does not mix tickers", () => {
    const id = working();
    repo.fill(id, 100, 38_50n);
    expect(repo.heldQuantity(ACCOUNT, "VALE3")).toBe(0);
  });
});
