import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectFeed, type EventSourceLike, type FeedStatus } from "./feed";
import { createQuoteStore, type QuoteStore } from "./store";

let pending: (() => void)[] = [];
const schedule = (flush: () => void) => pending.push(flush);
const nextFrame = () => {
  const queued = pending;
  pending = [];
  for (const flush of queued) flush();
};

interface FakeSource extends EventSourceLike {
  emit(type: string, data?: string): void;
  readonly url: string;
  readonly closed: boolean;
}

function fakeSource(): {
  factory: (url: string) => EventSourceLike;
  source: () => FakeSource;
} {
  let created: FakeSource | null = null;

  const factory = (url: string): EventSourceLike => {
    const handlers = new Map<string, ((event: { data: string }) => void)[]>();
    let closed = false;

    created = {
      url,
      get closed() {
        return closed;
      },
      addEventListener(type, listener) {
        const list = handlers.get(type) ?? [];
        handlers.set(type, list);
        list.push(listener);
      },
      close() {
        closed = true;
      },
      emit(type, data = "") {
        for (const listener of handlers.get(type) ?? []) listener({ data });
      },
    };
    return created;
  };

  return { factory, source: () => created! };
}

const wireQuote = (ticker: string, priceCents: string) =>
  JSON.stringify({
    ticker,
    priceCents,
    openingPriceCents: "3850",
    changeCents: "0",
    changeBps: 0,
    bidCents: "3849",
    askCents: "3851",
    at: "2026-09-08T13:00:00.000Z",
  });

let store: QuoteStore;
let statuses: FeedStatus[];

beforeEach(() => {
  pending = [];
  store = createQuoteStore({ schedule });
  statuses = [];
});

describe("subscribing", () => {
  it("asks only for the instruments it needs", () => {
    const { factory, source } = fakeSource();
    connectFeed({
      url: "http://market.test/stream",
      store,
      tickers: ["PETR4", "VALE3"],
      open: factory,
    });

    expect(source().url).toBe("http://market.test/stream?tickers=PETR4%2CVALE3");
  });

  it("asks for the whole board when given no list", () => {
    const { factory, source } = fakeSource();
    connectFeed({ url: "http://market.test/stream", store, open: factory });

    expect(source().url).toBe("http://market.test/stream");
  });

  it("closes the connection on teardown", () => {
    const { factory, source } = fakeSource();
    const disconnect = connectFeed({
      url: "http://market.test/stream",
      store,
      open: factory,
    });

    disconnect();
    expect(source().closed).toBe(true);
  });
});

describe("applying ticks", () => {
  it("loads the opening snapshot into the store", () => {
    const { factory, source } = fakeSource();
    connectFeed({ url: "http://market.test/stream", store, open: factory });

    source().emit(
      "snapshot",
      JSON.stringify({
        quotes: [
          JSON.parse(wireQuote("PETR4", "3850")),
          JSON.parse(wireQuote("VALE3", "6120")),
        ],
      }),
    );

    expect(store.size).toBe(2);
    expect(store.read("PETR4")?.priceCents).toBe(3850n);
  });

  it("converts wire strings into bigint cents", () => {
    const { factory, source } = fakeSource();
    connectFeed({ url: "http://market.test/stream", store, open: factory });

    source().emit("quote", wireQuote("PETR4", "9007199254740993"));

    expect(store.read("PETR4")?.priceCents).toBe(9_007_199_254_740_993n);
  });

  it("keeps the latest price", () => {
    const { factory, source } = fakeSource();
    connectFeed({ url: "http://market.test/stream", store, open: factory });

    source().emit("quote", wireQuote("PETR4", "3860"));
    source().emit("quote", wireQuote("PETR4", "3870"));

    expect(store.read("PETR4")?.priceCents).toBe(3870n);
  });

  it("still batches notifications through the store", () => {
    const { factory, source } = fakeSource();
    connectFeed({ url: "http://market.test/stream", store, open: factory });

    const listener = vi.fn();
    store.subscribe("PETR4", listener);

    for (let i = 0; i < 50; i += 1) {
      source().emit("quote", wireQuote("PETR4", String(3800 + i)));
    }
    nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("a bad message does not kill the feed", () => {
  it("reports invalid JSON and carries on", () => {
    const { factory, source } = fakeSource();
    const onMalformed = vi.fn();
    connectFeed({ url: "http://market.test/stream", store, open: factory, onMalformed });

    source().emit("quote", "{ not json");
    source().emit("quote", wireQuote("PETR4", "3860"));

    expect(onMalformed).toHaveBeenCalledOnce();
    expect(store.read("PETR4")?.priceCents).toBe(3860n);
  });

  it("rejects a price sent as a JSON number", () => {
    const { factory, source } = fakeSource();
    const onMalformed = vi.fn();
    connectFeed({ url: "http://market.test/stream", store, open: factory, onMalformed });

    source().emit(
      "quote",
      JSON.stringify({ ...JSON.parse(wireQuote("PETR4", "3860")), priceCents: 3860 }),
    );

    expect(onMalformed).toHaveBeenCalledOnce();
    expect(store.size).toBe(0);
  });

  it("rejects a tick missing a field", () => {
    const { factory, source } = fakeSource();
    const onMalformed = vi.fn();
    connectFeed({ url: "http://market.test/stream", store, open: factory, onMalformed });

    source().emit("quote", JSON.stringify({ ticker: "PETR4" }));

    expect(onMalformed).toHaveBeenCalledOnce();
    expect(store.size).toBe(0);
  });
});

describe("connection status", () => {
  it("starts as connecting", () => {
    const { factory } = fakeSource();
    connectFeed({
      url: "http://market.test/stream",
      store,
      open: factory,
      onStatus: (s) => statuses.push(s),
    });

    expect(statuses).toEqual(["connecting"]);
  });

  it("becomes live once the stream opens", () => {
    const { factory, source } = fakeSource();
    connectFeed({
      url: "http://market.test/stream",
      store,
      open: factory,
      onStatus: (s) => statuses.push(s),
    });

    source().emit("open");

    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("becomes degraded when the stream errors", () => {
    const { factory, source } = fakeSource();
    connectFeed({
      url: "http://market.test/stream",
      store,
      open: factory,
      onStatus: (s) => statuses.push(s),
    });

    source().emit("open");
    source().emit("error");

    expect(statuses.at(-1)).toBe("degraded");
  });

  it("recovers to live when ticks resume", () => {
    const { factory, source } = fakeSource();
    connectFeed({
      url: "http://market.test/stream",
      store,
      open: factory,
      onStatus: (s) => statuses.push(s),
    });

    source().emit("error");
    source().emit("quote", wireQuote("PETR4", "3860"));

    expect(statuses.at(-1)).toBe("live");
  });
});
