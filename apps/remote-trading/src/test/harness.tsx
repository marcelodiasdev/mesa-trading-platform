import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { configureStore, type Reducer } from "@reduxjs/toolkit";
import {
  ShellProvider,
  createEventBus,
  type EventBus,
  type FlagStore,
  type HttpClient,
  type ShellContextValue,
} from "@mesa/shell-sdk";
import { theme } from "@mesa/ui-kit";
import { MarketProvider } from "../market/MarketProvider";
import { createQuoteStore, type QuoteStore } from "../market/store";

export const TEST_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function createInjectableStore() {
  const injected = new Map<string, Reducer>();
  const placeholder: Reducer = () => null;
  const base = configureStore({ reducer: placeholder });

  const build = (): Reducer => (state: unknown, action) => {
    const previous = (state ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [name, slice] of injected) {
      next[name] = slice(previous[name], action);
    }
    return next;
  };

  return Object.assign(base, {
    injectReducer(key: string, reducer: Reducer) {
      if (injected.has(key)) return;
      injected.set(key, reducer);
      base.replaceReducer(build());
    },
    hasReducer: (key: string) => injected.has(key),
  });
}

export type RequestStub = (options: {
  service: string;
  path: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}) => Promise<unknown>;

export interface HarnessOptions {
  readonly flags?: Record<string, boolean>;
  readonly request?: RequestStub;
  readonly store?: QuoteStore;
  readonly bus?: EventBus;
}

export type Harness = RenderResult & {
  readonly quotes: QuoteStore;
  readonly bus: EventBus;
};

export function renderWithShell(ui: ReactElement, options: HarnessOptions = {}): Harness {
  const quotes = options.store ?? createQuoteStore({ schedule: (flush) => flush() });
  const bus = options.bus ?? createEventBus();

  const flags: FlagStore = {
    isEnabled: (flag) => options.flags?.[flag] ?? true,
    subscribe: () => () => {},
  };

  const stub: RequestStub =
    options.request ??
    (async () => {
      throw new Error("the test did not stub this request");
    });

  const http: HttpClient = { request: stub as unknown as HttpClient["request"] };

  const shell: ShellContextValue = {
    session: {
      userId: "11111111-1111-4111-8111-111111111111",
      accountId: TEST_ACCOUNT_ID,
      displayName: "Test",
    },
    http,
    serviceUrls: {
      accounts: "http://accounts.test/",
      orders: "http://orders.test/",
      market: "http://market.test/",
    },
    bus,
    flags,
    navigate: () => {},
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={createInjectableStore()}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            <ShellProvider {...shell}>
              <MarketProvider store={quotes}>{children}</MarketProvider>
            </ShellProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
    );
  }

  return Object.assign(render(ui, { wrapper: Wrapper }), { quotes, bus });
}
