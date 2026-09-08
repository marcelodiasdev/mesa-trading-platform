import type { QuoteStore } from "./store";
export type FeedStatus = "connecting" | "live" | "degraded";
export interface EventSourceLike {
    addEventListener(type: string, listener: (event: {
        data: string;
    }) => void): void;
    close(): void;
}
export interface FeedOptions {
    readonly url: string;
    readonly store: QuoteStore;
    readonly tickers?: readonly string[];
    readonly open?: (url: string) => EventSourceLike;
    readonly onStatus?: (status: FeedStatus) => void;
    /** Called when a message cannot be parsed, so a bad tick is visible. */
    readonly onMalformed?: (raw: string, reason: string) => void;
}
export declare function connectFeed(options: FeedOptions): () => void;
//# sourceMappingURL=feed.d.ts.map