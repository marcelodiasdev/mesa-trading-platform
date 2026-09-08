import { INSTRUMENTS, INSTRUMENTS_BY_TICKER, type Instrument } from "./instruments.ts";
import { createSeededRandom, type Random } from "./random.ts";

export interface Quote {
  readonly ticker: string;
  readonly priceCents: bigint;
  readonly openingPriceCents: bigint;
  readonly changeCents: bigint;
  readonly changeBps: number;
  readonly bidCents: bigint;
  readonly askCents: bigint;
  readonly at: string;
}

export interface BookLevel {
  readonly priceCents: bigint;
  readonly quantity: number;
}

export interface OrderBook {
  readonly ticker: string;
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  readonly at: string;
}

export interface EngineOptions {
  readonly seed?: number;
  readonly volatilityBps?: number;
  readonly spreadBps?: number;
  readonly now?: () => Date;
}

const MIN_PRICE_CENTS = 1n;

export function createMarketEngine(options: EngineOptions = {}) {
  const random: Random = createSeededRandom(options.seed ?? 1);
  const volatilityBps = BigInt(options.volatilityBps ?? 25);
  const spreadBps = BigInt(options.spreadBps ?? 8);
  const now = options.now ?? (() => new Date());

  const prices = new Map<string, bigint>(
    INSTRUMENTS.map((instrument) => [instrument.ticker, instrument.openingPriceCents]),
  );

  function roundToTick(priceCents: bigint, instrument: Instrument): bigint {
    const tick = instrument.tickSizeCents;
    if (tick <= 1n) return priceCents;
    const remainder = priceCents % tick;
    return remainder * 2n >= tick
      ? priceCents - remainder + tick
      : priceCents - remainder;
  }

  function spread(priceCents: bigint): { bidCents: bigint; askCents: bigint } {
    const half = (priceCents * spreadBps) / 20_000n;
    const offset = half < 1n ? 1n : half;
    const bid = priceCents - offset;
    return {
      bidCents: bid < MIN_PRICE_CENTS ? MIN_PRICE_CENTS : bid,
      askCents: priceCents + offset,
    };
  }

  function quoteOf(instrument: Instrument): Quote {
    const priceCents = prices.get(instrument.ticker) ?? instrument.openingPriceCents;
    const changeCents = priceCents - instrument.openingPriceCents;
    const { bidCents, askCents } = spread(priceCents);

    return {
      ticker: instrument.ticker,
      priceCents,
      openingPriceCents: instrument.openingPriceCents,
      changeCents,
      changeBps: Number((changeCents * 10_000n) / instrument.openingPriceCents),
      bidCents,
      askCents,
      at: now().toISOString(),
    };
  }

  function quote(ticker: string): Quote | undefined {
    const instrument = INSTRUMENTS_BY_TICKER.get(ticker);
    return instrument === undefined ? undefined : quoteOf(instrument);
  }

  function snapshot(): Quote[] {
    return INSTRUMENTS.map(quoteOf);
  }

  function advance(instrument: Instrument): bigint {
    const current = prices.get(instrument.ticker) ?? instrument.openingPriceCents;
    const drawBps = BigInt(Math.round((random.next() * 2 - 1) * Number(volatilityBps)));
    const delta = (current * drawBps) / 10_000n;
    const moved = current + (delta === 0n ? (drawBps < 0n ? -1n : 1n) : delta);
    const bounded = moved < MIN_PRICE_CENTS ? MIN_PRICE_CENTS : moved;
    const rounded = roundToTick(bounded, instrument);

    prices.set(instrument.ticker, rounded);
    return rounded;
  }

  function tick(): Quote {
    const index = Math.floor(random.next() * INSTRUMENTS.length);
    const instrument = INSTRUMENTS[index] ?? INSTRUMENTS[0]!;
    advance(instrument);
    return quoteOf(instrument);
  }

  function book(ticker: string, depth = 5): OrderBook | undefined {
    const instrument = INSTRUMENTS_BY_TICKER.get(ticker);
    if (instrument === undefined) return undefined;

    const { bidCents, askCents } = spread(
      prices.get(ticker) ?? instrument.openingPriceCents,
    );
    const step = instrument.tickSizeCents;

    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    for (let level = 0; level < depth; level += 1) {
      const size = 100 * (1 + Math.floor(random.next() * 20));
      const bid = bidCents - BigInt(level) * step;
      bids.push({
        priceCents: bid < MIN_PRICE_CENTS ? MIN_PRICE_CENTS : bid,
        quantity: size,
      });
      asks.push({
        priceCents: askCents + BigInt(level) * step,
        quantity: 100 * (1 + Math.floor(random.next() * 20)),
      });
    }

    return { ticker, bids, asks, at: now().toISOString() };
  }

  return { quote, snapshot, tick, book, prices };
}

export type MarketEngine = ReturnType<typeof createMarketEngine>;
