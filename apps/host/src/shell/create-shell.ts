import {
  createEventBus,
  createHttpClient,
  type EventBus,
  type ShellContextValue,
} from "@mesa/shell-sdk";
import { config } from "../config";
import type { AppStore } from "../store/index";
import { serviceDegraded } from "../store/slices/ui";
import { createFlagStore } from "./flag-store";
import { getToken } from "../auth/mock-session";

export interface ShellDependencies {
  readonly store: AppStore;
  readonly navigate: (path: string) => void;
  readonly bus?: EventBus;
}

export function createShell({
  store,
  navigate,
  bus = createEventBus(),
}: ShellDependencies): ShellContextValue {
  const http = createHttpClient({
    baseUrls: config.serviceUrls,
    getToken,
    onRetry: ({ service }) => {
      store.dispatch(serviceDegraded(service));
    },
  });

  const session = store.getState().session;
  if (session.user === null || session.activeAccountId === null) {
    throw new Error("createShell requires an authenticated session");
  }

  return {
    session: {
      userId: session.user.userId,
      accountId: session.activeAccountId,
      displayName: session.user.displayName,
    },
    http,
    serviceUrls: config.serviceUrls,
    bus,
    flags: createFlagStore(store),
    navigate,
  };
}
