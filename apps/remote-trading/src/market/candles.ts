export interface Candle {
  readonly time: number;
  readonly open: bigint;
  readonly high: bigint;
  readonly low: bigint;
  readonly close: bigint;
}

export interface CandleSeriesOptions {
  readonly bucketSeconds?: number;
  readonly maxCandles?: number;
}

const bucketStart = (atMs: number, bucketSeconds: number): number =>
  Math.floor(atMs / 1000 / bucketSeconds) * bucketSeconds;

export function createCandleSeries(options: CandleSeriesOptions = {}) {
  const bucketSeconds = options.bucketSeconds ?? 5;
  const maxCandles = options.maxCandles ?? 240;

  let candles: Candle[] = [];

  function push(priceCents: bigint, atMs: number): { candle: Candle; opened: boolean } {
    const time = bucketStart(atMs, bucketSeconds);
    const current = candles.at(-1);

    if (current === undefined || time > current.time) {
      const candle: Candle = {
        time,
        open: current?.close ?? priceCents,
        high: priceCents,
        low: priceCents,
        close: priceCents,
      };

      candles.push(candle);
      if (candles.length > maxCandles) candles = candles.slice(-maxCandles);

      return { candle, opened: true };
    }

    if (time < current.time) return { candle: current, opened: false };

    const updated: Candle = {
      time: current.time,
      open: current.open,
      high: priceCents > current.high ? priceCents : current.high,
      low: priceCents < current.low ? priceCents : current.low,
      close: priceCents,
    };

    candles[candles.length - 1] = updated;
    return { candle: updated, opened: false };
  }

  return {
    push,
    snapshot: (): readonly Candle[] => candles,
    reset: (): void => {
      candles = [];
    },
    get length() {
      return candles.length;
    },
    get bucketSeconds() {
      return bucketSeconds;
    },
  };
}

export type CandleSeries = ReturnType<typeof createCandleSeries>;

export const toChartPrice = (cents: bigint): number => Number(cents) / 100;
