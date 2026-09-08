import type { MarketEngine, Quote } from "./engine.ts";

export type QuoteListener = (quote: Quote) => void;

export interface HubOptions {
  readonly tickIntervalMs?: number;
}

export function createQuoteHub(engine: MarketEngine, options: HubOptions = {}) {
  const tickIntervalMs = options.tickIntervalMs ?? 50;
  const listeners = new Set<QuoteListener>();
  let timer: NodeJS.Timeout | null = null;

  function broadcast(): void {
    const quote = engine.tick();
    for (const listener of [...listeners]) {
      try {
        listener(quote);
      } catch {
        listeners.delete(listener);
      }
    }
  }

  function subscribe(listener: QuoteListener): () => void {
    listeners.add(listener);
    if (timer === null) {
      timer = setInterval(broadcast, tickIntervalMs);
      timer.unref?.();
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0 && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    listeners.clear();
  }

  return {
    subscribe,
    stop,
    get subscriberCount() {
      return listeners.size;
    },
    get running() {
      return timer !== null;
    },
  };
}

export type QuoteHub = ReturnType<typeof createQuoteHub>;
