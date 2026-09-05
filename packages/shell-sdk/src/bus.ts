export interface ShellEvents {
  "ticket:open": { ticker: string; side: "BUY" | "SELL"; quantity?: number };
  "order:settled": { orderId: string; ticker: string };
  "account:changed": { accountId: string };
}

export type ShellEventName = keyof ShellEvents;
export type Unsubscribe = () => void;

export interface EventBus {
  emit<E extends ShellEventName>(event: E, payload: ShellEvents[E]): void;
  on<E extends ShellEventName>(
    event: E,
    handler: (payload: ShellEvents[E]) => void,
  ): Unsubscribe;
  once<E extends ShellEventName>(
    event: E,
    handler: (payload: ShellEvents[E]) => void,
  ): Unsubscribe;
}

export interface EventBusOptions {
  readonly onHandlerError?: (event: ShellEventName, error: unknown) => void;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const handlers = new Map<ShellEventName, Set<(payload: never) => void>>();

  function on<E extends ShellEventName>(
    event: E,
    handler: (payload: ShellEvents[E]) => void,
  ): Unsubscribe {
    const set = handlers.get(event) ?? new Set();
    handlers.set(event, set);
    set.add(handler as (payload: never) => void);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(handler as (payload: never) => void);
      if (set.size === 0) handlers.delete(event);
    };
  }

  return {
    on,

    once(event, handler) {
      const unsubscribe = on(event, (payload) => {
        unsubscribe();
        handler(payload);
      });
      return unsubscribe;
    },

    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const handler of [...set]) {
        try {
          (handler as (p: typeof payload) => void)(payload);
        } catch (error) {
          options.onHandlerError?.(event, error);
        }
      }
    },
  };
}
