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
export declare function createCandleSeries(options?: CandleSeriesOptions): {
    push: (priceCents: bigint, atMs: number) => {
        candle: Candle;
        opened: boolean;
    };
    snapshot: () => readonly Candle[];
    reset: () => void;
    readonly length: number;
    readonly bucketSeconds: number;
};
export type CandleSeries = ReturnType<typeof createCandleSeries>;
export declare const toChartPrice: (cents: bigint) => number;
//# sourceMappingURL=candles.d.ts.map