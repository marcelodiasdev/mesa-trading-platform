import { useEffect, useRef } from "react";
import { Card, CardContent, Stack, Typography, useTheme } from "@mui/material";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { createCandleSeries, toChartPrice, type Candle } from "../market/candles";
import { useMarket } from "../market/MarketProvider";

const CHART_HEIGHT = 260;

const toBar = (candle: Candle): CandlestickData => ({
  time: candle.time as UTCTimestamp,
  open: toChartPrice(candle.open),
  high: toChartPrice(candle.high),
  low: toChartPrice(candle.low),
  close: toChartPrice(candle.close),
});

export interface PriceChartProps {
  readonly ticker: string | null;
}

export function PriceChart({ ticker }: PriceChartProps) {
  const theme = useTheme();
  const { store } = useMarket();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || ticker === null) return;

    const chart: IChartApi = createChart(container, {
      height: CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: theme.palette.text.secondary,
        fontFamily: theme.typography.numericSmall.fontFamily as string,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.palette.divider },
        horzLines: { color: theme.palette.divider },
      },
      rightPriceScale: { borderColor: theme.palette.divider },
      timeScale: {
        borderColor: theme.palette.divider,
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: { mode: 1 },
      handleScale: false,
      handleScroll: false,
    });

    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: theme.palette.market.up,
      downColor: theme.palette.market.down,
      wickUpColor: theme.palette.market.up,
      wickDownColor: theme.palette.market.down,
      borderVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    const candles = createCandleSeries({ bucketSeconds: 5, maxCandles: 120 });

    const opening = store.read(ticker);
    if (opening !== undefined) {
      const { candle } = candles.push(opening.priceCents, Date.parse(opening.at));
      series.setData([toBar(candle)]);
    }

    const unsubscribe = store.subscribe(ticker, () => {
      const quote = store.read(ticker);
      if (quote === undefined) return;

      const { candle } = candles.push(quote.priceCents, Date.parse(quote.at));
      series.update(toBar(candle));
    });

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      chart.applyOptions({ width: entry.contentRect.width });
    });
    observer.observe(container);
    chart.applyOptions({ width: container.clientWidth });

    return () => {
      observer.disconnect();
      unsubscribe();
      chart.remove();
    };
  }, [ticker, store, theme]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">
            {ticker === null ? "Price" : `Price · ${ticker}`}
          </Typography>

          {ticker === null ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Pick an instrument to see its price move.
            </Typography>
          ) : (
            <div ref={containerRef} style={{ width: "100%", height: CHART_HEIGHT }} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
