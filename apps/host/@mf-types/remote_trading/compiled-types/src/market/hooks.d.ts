import type { FeedStatus } from "./feed";
import type { Quote } from "./store";
export declare function useQuote(ticker: string): Quote | undefined;
export declare function useBoard(): readonly Quote[];
export declare function useFeedStatus(): FeedStatus;
//# sourceMappingURL=hooks.d.ts.map