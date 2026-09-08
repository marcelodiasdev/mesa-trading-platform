import {
  combineReducers,
  configureStore,
  type Reducer,
  type Store,
} from "@reduxjs/toolkit";
import { sessionReducer } from "./slices/session";
import { flagsReducer } from "./slices/flags";
import { uiReducer } from "./slices/ui";

const staticReducers = {
  session: sessionReducer,
  flags: flagsReducer,
  ui: uiReducer,
};

export type StaticState = {
  [K in keyof typeof staticReducers]: ReturnType<(typeof staticReducers)[K]>;
};

export type RootState = StaticState & Record<string, unknown>;

type BaseStore = ReturnType<typeof configureStore<StaticState>>;

export interface AppStore extends Omit<BaseStore, "getState"> {
  getState(): RootState;
  injectReducer(key: string, reducer: Reducer): void;
  ejectReducer(key: string): void;
  hasReducer(key: string): boolean;
}

export function createAppStore(preloadedState?: Partial<StaticState>): AppStore {
  const injected = new Map<string, Reducer>();

  const build = () =>
    combineReducers({ ...staticReducers, ...Object.fromEntries(injected) });

  const store: Store = configureStore({
    reducer: build(),
    ...(preloadedState === undefined ? {} : { preloadedState }),
  });

  const readState = store.getState.bind(store);

  return Object.assign(store, {
    getState: (): RootState => readState() as RootState,

    injectReducer(key: string, reducer: Reducer): void {
      if (injected.has(key)) return;
      injected.set(key, reducer);
      store.replaceReducer(build());
    },

    ejectReducer(key: string): void {
      if (!injected.delete(key)) return;
      store.replaceReducer(build());
    },

    hasReducer(key: string): boolean {
      return key in staticReducers || injected.has(key);
    },
  }) as unknown as AppStore;
}

export type AppDispatch = AppStore["dispatch"];
