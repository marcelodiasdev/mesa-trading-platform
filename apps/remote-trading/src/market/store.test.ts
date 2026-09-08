import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuoteStore, type Quote, type QuoteStore } from "./store";

let pending: (() => void)[] = [];
const schedule = (flush: () => void) => {
  pending.push(flush);
};
const nextFrame = () => {
  const queued = pending;
  pending = [];
  for (const flush of queued) flush();
};

let store: QuoteStore;

const quote = (ticker: string, priceCents: bigint): Quote => ({
  ticker,
  priceCents,
  openingPriceCents: 38_50n,
  changeCents: priceCents - 38_50n,
  changeBps: 0,
  bidCents: priceCents - 1n,
  askCents: priceCents + 1n,
  at: "2026-09-08T13:00:00.000Z",
});

beforeEach(() => {
  pending = [];
  store = createQuoteStore({ schedule });
});

describe("reading", () => {
  it("returns the latest quote for an instrument", () => {
    store.apply(quote("PETR4", 38_60n));
    expect(store.read("PETR4")?.priceCents).toBe(38_60n);
  });

  it("keeps only the latest tick per instrument", () => {
    store.apply(quote("PETR4", 38_60n));
    store.apply(quote("PETR4", 38_70n));
    expect(store.read("PETR4")?.priceCents).toBe(38_70n);
    expect(store.size).toBe(1);
  });

  it("returns undefined for an instrument that never ticked", () => {
    expect(store.read("VALE3")).toBeUndefined();
  });
});

describe("a tick only wakes the rows that care", () => {
  it("notifies the subscriber of that instrument", () => {
    const listener = vi.fn();
    store.subscribe("PETR4", listener);

    store.apply(quote("PETR4", 38_60n));
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify subscribers of other instruments", () => {
    const petr = vi.fn();
    const vale = vi.fn();
    store.subscribe("PETR4", petr);
    store.subscribe("VALE3", vale);

    store.apply(quote("PETR4", 38_60n));
    nextFrame();

    expect(petr).toHaveBeenCalledTimes(1);
    expect(vale).not.toHaveBeenCalled();
  });

  it("notifies every subscriber of the same instrument", () => {
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe("PETR4", first);
    store.subscribe("PETR4", second);

    store.apply(quote("PETR4", 38_60n));
    nextFrame();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const off = store.subscribe("PETR4", listener);
    off();

    store.apply(quote("PETR4", 38_60n));
    nextFrame();

    expect(listener).not.toHaveBeenCalled();
  });

  it("tolerates unsubscribing twice", () => {
    const off = store.subscribe("PETR4", vi.fn());
    off();
    expect(off).not.toThrow();
  });
});

describe("batching", () => {
  it("notifies once per frame however many ticks arrived", () => {
    const listener = vi.fn();
    store.subscribe("PETR4", listener);

    for (let i = 0; i < 100; i += 1) {
      store.apply(quote("PETR4", 38_00n + BigInt(i)));
    }
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.read("PETR4")?.priceCents).toBe(38_99n);
  });

  it("schedules a single flush for a burst", () => {
    const scheduler = vi.fn();
    const batched = createQuoteStore({ schedule: scheduler });

    batched.apply(quote("PETR4", 38_60n));
    batched.apply(quote("VALE3", 61_00n));
    batched.apply(quote("ITUB4", 33_00n));

    expect(scheduler).toHaveBeenCalledTimes(1);
  });

  it("notifies again on the next frame", () => {
    const listener = vi.fn();
    store.subscribe("PETR4", listener);

    store.apply(quote("PETR4", 38_60n));
    nextFrame();
    store.apply(quote("PETR4", 38_70n));
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does nothing on a frame with no ticks", () => {
    const listener = vi.fn();
    store.subscribe("PETR4", listener);

    nextFrame();

    expect(listener).not.toHaveBeenCalled();
  });

  it("wakes each affected instrument exactly once in a mixed burst", () => {
    const petr = vi.fn();
    const vale = vi.fn();
    store.subscribe("PETR4", petr);
    store.subscribe("VALE3", vale);

    store.applyMany([
      quote("PETR4", 38_60n),
      quote("VALE3", 61_00n),
      quote("PETR4", 38_70n),
      quote("ITUB4", 33_00n),
    ]);
    nextFrame();

    expect(petr).toHaveBeenCalledTimes(1);
    expect(vale).toHaveBeenCalledTimes(1);
  });
});

describe("watching the whole board", () => {
  it("notifies the global subscriber on any tick", () => {
    const listener = vi.fn();
    store.subscribeAll(listener);

    store.apply(quote("MGLU3", 8_00n));
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("still notifies once for a burst across instruments", () => {
    const listener = vi.fn();
    store.subscribeAll(listener);

    store.applyMany([quote("PETR4", 38_60n), quote("VALE3", 61_00n)]);
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("subscription bookkeeping", () => {
  it("counts subscribers", () => {
    const a = store.subscribe("PETR4", vi.fn());
    store.subscribe("PETR4", vi.fn());
    store.subscribeAll(vi.fn());
    expect(store.subscriberCount).toBe(3);

    a();
    expect(store.subscriberCount).toBe(2);
  });

  it("survives a listener that unsubscribes during the flush", () => {
    const second = vi.fn();
    const off = store.subscribe("PETR4", () => off());
    store.subscribe("PETR4", second);

    store.apply(quote("PETR4", 38_60n));
    expect(nextFrame).not.toThrow();
    expect(second).toHaveBeenCalledOnce();
  });

  it("clears the board on reset", () => {
    store.apply(quote("PETR4", 38_60n));
    store.reset();
    expect(store.size).toBe(0);
    expect(store.read("PETR4")).toBeUndefined();
  });
});

describe("snapshot stability", () => {
  it("returns the same array reference until something ticks", () => {
    store.apply(quote("PETR4", 38_60n));
    nextFrame();

    const first = store.snapshot();
    const second = store.snapshot();

    expect(second).toBe(first);
  });

  it("returns a new reference after a tick", () => {
    store.apply(quote("PETR4", 38_60n));
    nextFrame();
    const before = store.snapshot();

    store.apply(quote("PETR4", 38_70n));
    nextFrame();

    expect(store.snapshot()).not.toBe(before);
  });

  it("keeps the board sorted by instrument", () => {
    store.applyMany([
      quote("VALE3", 61_00n),
      quote("ABEV3", 12_00n),
      quote("PETR4", 38_60n),
    ]);
    nextFrame();

    expect(store.snapshot().map((q) => q.ticker)).toEqual(["ABEV3", "PETR4", "VALE3"]);
  });
});
