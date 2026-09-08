import type { Order, Quote } from "./schemas";
export interface Position {
    readonly ticker: string;
    readonly quantity: number;
    readonly averageCostCents: bigint;
    readonly totalCostCents: bigint;
    readonly lastPriceCents: bigint | null;
    readonly marketValueCents: bigint | null;
    readonly unrealisedCents: bigint | null;
    readonly unrealisedBps: number | null;
}
export declare function buildPositions(orders: readonly Order[], quotes: ReadonlyMap<string, Quote>): Position[];
//# sourceMappingURL=positions.d.ts.map