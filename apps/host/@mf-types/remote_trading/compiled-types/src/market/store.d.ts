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
export type Listener = () => void;
export interface QuoteStoreOptions {
    readonly schedule?: (flush: () => void) => void;
}
export declare function createQuoteStore(options?: QuoteStoreOptions): {
    apply: (quote: Quote) => void;
    applyMany: (incoming: readonly Quote[]) => void;
    subscribe: (ticker: string, listener: Listener) => () => void;
    subscribeAll: (listener: Listener) => () => void;
    read: (ticker: string) => Quote | undefined;
    snapshot: () => readonly Quote[];
    reset: () => void;
    readonly size: number;
    readonly version: number;
    readonly subscriberCount: number;
};
export type QuoteStore = ReturnType<typeof createQuoteStore>;
//# sourceMappingURL=store.d.ts.map