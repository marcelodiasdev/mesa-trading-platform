import type { FlagStore } from "@mesa/shell-sdk";
import type { AppStore } from "../store/index";

export function createFlagStore(store: AppStore): FlagStore {
  let cache = store.getState().flags.values;

  return {
    isEnabled(flag) {
      return store.getState().flags.values[flag] ?? false;
    },

    subscribe(listener) {
      return store.subscribe(() => {
        const next = store.getState().flags.values;
        if (next === cache) return;
        cache = next;
        listener();
      });
    },
  };
}
