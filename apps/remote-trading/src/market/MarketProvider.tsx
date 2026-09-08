import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useServiceUrls } from "@mesa/shell-sdk";
import { connectFeed, type FeedStatus } from "./feed";
import { createQuoteStore, type QuoteStore } from "./store";

interface MarketContextValue {
  readonly store: QuoteStore;
  readonly status: FeedStatus;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export interface MarketProviderProps {
  readonly children: ReactNode;
  readonly store?: QuoteStore;
}

export function MarketProvider({ children, store: injected }: MarketProviderProps) {
  const serviceUrls = useServiceUrls();
  const store = useMemo(() => injected ?? createQuoteStore(), [injected]);
  const [status, setStatus] = useState<FeedStatus>("connecting");

  useEffect(() => {
    const disconnect = connectFeed({
      url: new URL("stream", serviceUrls.market).toString(),
      store,
      onStatus: setStatus,
      onMalformed: (raw, reason) => {
        console.warn(`[market] discarded a tick: ${reason}`, raw);
      },
    });

    return disconnect;
  }, [serviceUrls.market, store]);

  const value = useMemo(() => ({ store, status }), [store, status]);

  return <MarketContext value={value}>{children}</MarketContext>;
}

export function useMarket(): MarketContextValue {
  const context = useContext(MarketContext);
  if (context === null) {
    throw new Error("useMarket must be used inside a MarketProvider");
  }
  return context;
}
