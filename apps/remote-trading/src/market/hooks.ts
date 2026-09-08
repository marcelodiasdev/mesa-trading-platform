import { useCallback, useSyncExternalStore } from "react";
import { useMarket } from "./MarketProvider";
import type { FeedStatus } from "./feed";
import type { Quote } from "./store";

export function useQuote(ticker: string): Quote | undefined {
  const { store } = useMarket();

  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(ticker, listener),
    [store, ticker],
  );

  const read = useCallback(() => store.read(ticker), [store, ticker]);

  return useSyncExternalStore(subscribe, read, () => undefined);
}

export function useBoard(): readonly Quote[] {
  const { store } = useMarket();

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeAll(listener),
    [store],
  );

  return useSyncExternalStore(subscribe, store.snapshot, () => []);
}

export function useFeedStatus(): FeedStatus {
  return useMarket().status;
}
