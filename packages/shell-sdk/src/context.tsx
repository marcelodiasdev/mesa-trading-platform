import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { EventBus } from "./bus";
import type { HttpClient } from "./http";

export interface Session {
  readonly userId: string;
  readonly accountId: string;
  readonly displayName: string;
}

export interface FlagStore {
  isEnabled(flag: string): boolean;
  subscribe(listener: () => void): () => void;
}

export interface ShellContextValue {
  readonly session: Session;
  readonly http: HttpClient;
  readonly bus: EventBus;
  readonly flags: FlagStore;
  navigate(path: string): void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export interface ShellProviderProps extends ShellContextValue {
  readonly children: ReactNode;
}

export function ShellProvider({ children, ...value }: ShellProviderProps) {
  const memoised = useMemo(
    () => value,
    [value.session, value.http, value.bus, value.flags, value.navigate],
  );
  return <ShellContext value={memoised}>{children}</ShellContext>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (context === null) {
    throw new Error(
      "useShell must be used inside a ShellProvider. A remote rendered " +
        "outside the host shell has no session, transport or event bus.",
    );
  }
  return context;
}

export const useSession = (): Session => useShell().session;
export const useHttp = (): HttpClient => useShell().http;
export const useBus = (): EventBus => useShell().bus;

export function useFlag(flag: string): boolean {
  const { flags } = useShell();
  return useSyncExternalStore(
    (listener) => flags.subscribe(listener),
    () => flags.isEnabled(flag),
    () => false,
  );
}
