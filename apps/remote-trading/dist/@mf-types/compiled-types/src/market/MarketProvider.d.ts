import type { ReactNode } from "react";
import { type FeedStatus } from "./feed";
import { type QuoteStore } from "./store";
interface MarketContextValue {
    readonly store: QuoteStore;
    readonly status: FeedStatus;
}
export interface MarketProviderProps {
    readonly children: ReactNode;
    readonly store?: QuoteStore;
}
export declare function MarketProvider({ children, store: injected }: MarketProviderProps): import("react").JSX.Element;
export declare function useMarket(): MarketContextValue;
export {};
//# sourceMappingURL=MarketProvider.d.ts.map