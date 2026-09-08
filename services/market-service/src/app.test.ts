import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { createMarketEngine } from "./engine.ts";
import { createQuoteHub } from "./hub.ts";
import { INSTRUMENTS } from "./instruments.ts";

const at = () => new Date("2026-09-07T13:00:00.000Z");
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({ engine: createMarketEngine({ seed: 42, now: at }) });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("instruments", () => {
  it("lists what trades here", async () => {
    const response = await app.inject({ method: "GET", url: "/instruments" });
    expect(response.statusCode).toBe(200);
    expect(response.json().instruments).toHaveLength(INSTRUMENTS.length);
  });

  it("reports prices as integer strings of cents", async () => {
    const response = await app.inject({ method: "GET", url: "/instruments" });
    const petr = response
      .json()
      .instruments.find((i: { ticker: string }) => i.ticker === "PETR4");
    expect(petr.openingPriceCents).toBe("3850");
  });
});

describe("quotes", () => {
  it("returns one instrument", async () => {
    const response = await app.inject({ method: "GET", url: "/quotes/PETR4" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ticker: "PETR4",
      priceCents: "3850",
      changeCents: "0",
      changeBps: 0,
    });
  });

  it("quotes a spread around the last price", async () => {
    const quote = await app
      .inject({ method: "GET", url: "/quotes/PETR4" })
      .then((r) => r.json());

    expect(BigInt(quote.bidCents)).toBeLessThan(BigInt(quote.priceCents));
    expect(BigInt(quote.askCents)).toBeGreaterThan(BigInt(quote.priceCents));
  });

  it("answers 404 for an instrument that does not trade here", async () => {
    const response = await app.inject({ method: "GET", url: "/quotes/XXXX9" });
    expect(response.statusCode).toBe(404);
  });

  it("rejects a malformed ticker", async () => {
    const response = await app.inject({ method: "GET", url: "/quotes/petr4" });
    expect(response.statusCode).toBe(400);
  });

  it("returns the whole board at once", async () => {
    const response = await app.inject({ method: "GET", url: "/quotes" });
    expect(response.json().quotes).toHaveLength(INSTRUMENTS.length);
  });
});

describe("order book", () => {
  it("defaults to five levels a side", async () => {
    const book = await app
      .inject({ method: "GET", url: "/quotes/VALE3/book" })
      .then((r) => r.json());

    expect(book.bids).toHaveLength(5);
    expect(book.asks).toHaveLength(5);
  });

  it("honours the requested depth", async () => {
    const book = await app
      .inject({ method: "GET", url: "/quotes/VALE3/book?depth=10" })
      .then((r) => r.json());

    expect(book.bids).toHaveLength(10);
  });

  it("refuses an unreasonable depth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/quotes/VALE3/book?depth=500",
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("the tick clock only runs while somebody is watching", () => {
  it("starts idle", () => {
    const hub = createQuoteHub(createMarketEngine({ seed: 1, now: at }));
    expect(hub.running).toBe(false);
    hub.stop();
  });

  it("starts on the first subscriber and stops with the last", () => {
    const hub = createQuoteHub(createMarketEngine({ seed: 1, now: at }));

    const first = hub.subscribe(() => {});
    expect(hub.running).toBe(true);

    const second = hub.subscribe(() => {});
    first();
    expect(hub.running).toBe(true);

    second();
    expect(hub.running).toBe(false);
    hub.stop();
  });

  it("delivers ticks to every subscriber", () => {
    vi.useFakeTimers();
    const hub = createQuoteHub(createMarketEngine({ seed: 1, now: at }), {
      tickIntervalMs: 10,
    });

    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(a);
    hub.subscribe(b);

    vi.advanceTimersByTime(35);

    expect(a).toHaveBeenCalledTimes(3);
    expect(b).toHaveBeenCalledTimes(3);

    hub.stop();
    vi.useRealTimers();
  });

  it("drops a listener that throws instead of stopping the feed", () => {
    vi.useFakeTimers();
    const hub = createQuoteHub(createMarketEngine({ seed: 1, now: at }), {
      tickIntervalMs: 10,
    });

    const healthy = vi.fn();
    hub.subscribe(() => {
      throw new Error("client gone");
    });
    hub.subscribe(healthy);

    vi.advanceTimersByTime(25);

    expect(healthy).toHaveBeenCalledTimes(2);
    expect(hub.subscriberCount).toBe(1);

    hub.stop();
    vi.useRealTimers();
  });

  it("tolerates unsubscribing twice", () => {
    const hub = createQuoteHub(createMarketEngine({ seed: 1, now: at }));
    const off = hub.subscribe(() => {});
    off();
    expect(off).not.toThrow();
    hub.stop();
  });
});
