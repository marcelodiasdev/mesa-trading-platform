import { beforeEach, describe, expect, it } from "vitest";
import { createCandleSeries, toChartPrice, type CandleSeries } from "./candles";

const AT = Date.UTC(2026, 8, 8, 13, 0, 0);
const second = (n: number) => AT + n * 1000;

let series: CandleSeries;

beforeEach(() => {
  series = createCandleSeries({ bucketSeconds: 5, maxCandles: 4 });
});

describe("opening a candle", () => {
  it("takes the first price as the whole bar", () => {
    const { candle, opened } = series.push(38_50n, second(0));

    expect(opened).toBe(true);
    expect(candle).toMatchObject({
      open: 38_50n,
      high: 38_50n,
      low: 38_50n,
      close: 38_50n,
    });
  });

  it("stamps the bucket start, not the tick time", () => {
    const { candle } = series.push(38_50n, second(3));
    expect(candle.time).toBe(Math.floor(AT / 1000));
  });

  it("opens the next bar at the previous close, so the series is continuous", () => {
    series.push(38_50n, second(0));
    series.push(38_90n, second(4));
    const { candle, opened } = series.push(39_10n, second(6));

    expect(opened).toBe(true);
    expect(candle.open).toBe(38_90n);
  });
});

describe("filling a candle", () => {
  it("tracks the high and the low", () => {
    series.push(38_50n, second(0));
    series.push(39_20n, second(1));
    series.push(37_80n, second(2));
    const { candle } = series.push(38_60n, second(3));

    expect(candle).toMatchObject({
      open: 38_50n,
      high: 39_20n,
      low: 37_80n,
      close: 38_60n,
    });
  });

  it("keeps the close on the latest price", () => {
    series.push(38_50n, second(0));
    const { candle, opened } = series.push(38_55n, second(4));

    expect(opened).toBe(false);
    expect(candle.close).toBe(38_55n);
    expect(series.length).toBe(1);
  });

  it("never widens the range on a price inside it", () => {
    series.push(38_50n, second(0));
    series.push(39_00n, second(1));
    const { candle } = series.push(38_70n, second(2));

    expect(candle.high).toBe(39_00n);
    expect(candle.low).toBe(38_50n);
  });
});

describe("bucketing", () => {
  it("groups every tick inside the window into one bar", () => {
    for (let i = 0; i < 5; i += 1) series.push(38_50n + BigInt(i), second(i));
    expect(series.length).toBe(1);
  });

  it("starts a new bar once the window closes", () => {
    series.push(38_50n, second(4));
    series.push(38_60n, second(5));
    expect(series.length).toBe(2);
  });

  it("skips empty windows rather than inventing bars", () => {
    series.push(38_50n, second(0));
    series.push(38_60n, second(30));

    expect(series.length).toBe(2);
    expect(series.snapshot().map((c) => c.time)).toEqual([
      Math.floor(AT / 1000),
      Math.floor(AT / 1000) + 30,
    ]);
  });
});

describe("out of order ticks", () => {
  it("drops a price stamped before the newest bar", () => {
    series.push(38_50n, second(10));
    const { candle, opened } = series.push(99_00n, second(0));

    expect(opened).toBe(false);
    expect(candle.high).toBe(38_50n);
    expect(series.length).toBe(1);
  });
});

describe("bounded memory", () => {
  it("keeps only the most recent bars", () => {
    for (let i = 0; i < 10; i += 1) series.push(38_50n, second(i * 5));

    expect(series.length).toBe(4);
    expect(series.snapshot()[0]?.time).toBe(Math.floor(AT / 1000) + 30);
  });

  it("clears on reset", () => {
    series.push(38_50n, second(0));
    series.reset();
    expect(series.length).toBe(0);
  });
});

describe("handing prices to the chart", () => {
  it("converts cents to a decimal number", () => {
    expect(toChartPrice(38_50n)).toBe(38.5);
    expect(toChartPrice(123_456_78n)).toBe(123456.78);
  });

  it("keeps two decimal places exactly at the boundary", () => {
    expect(toChartPrice(1n)).toBe(0.01);
    expect(toChartPrice(-1n)).toBe(-0.01);
  });
});
