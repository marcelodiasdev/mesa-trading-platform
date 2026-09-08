import { useStore } from "react-redux";
import { TRADING_DRAFT_KEY, tradingDraftReducer } from "./slice";

interface InjectableStore {
  injectReducer?: (key: string, reducer: typeof tradingDraftReducer) => void;
  hasReducer?: (key: string) => boolean;
}

export function useInjectDraft(): boolean {
  const store = useStore() as unknown as InjectableStore;

  if (typeof store.injectReducer !== "function") {
    return false;
  }

  if (store.hasReducer?.(TRADING_DRAFT_KEY) !== true) {
    store.injectReducer(TRADING_DRAFT_KEY, tradingDraftReducer);
  }

  return true;
}
