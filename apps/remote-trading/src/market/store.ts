export interface Quote {
  readonly ticker: string;
  readonly priceCents: bigint;
  readonly openingPriceCents: bigint;
  readonly changeCents: bigint;
  readonly changeBps: number;
  readonly bidCents: bigint;
  readonly askCents: bigint;
  readonly at: string;
}

export type Listener = () => void;

export interface QuoteStoreOptions {
  readonly schedule?: (flush: () => void) => void;
}

const frameScheduler = (flush: () => void): void => {
  requestAnimationFrame(flush);
};

export function createQuoteStore(options: QuoteStoreOptions = {}) {
  const schedule = options.schedule ?? frameScheduler;

  const quotes = new Map<string, Quote>();
  const listeners = new Map<string, Set<Listener>>();
  const globalListeners = new Set<Listener>();

  const dirty = new Set<string>();
  let scheduled = false;

  let version = 0;
  let cachedSnapshot: readonly Quote[] = [];
  let cachedVersion = -1;

  function flush(): void {
    scheduled = false;
    if (dirty.size === 0) return;

    version += 1;

    const touched = [...dirty];
    dirty.clear();

    for (const ticker of touched) {
      const set = listeners.get(ticker);
      if (set === undefined) continue;
      for (const listener of [...set]) listener();
    }

    for (const listener of [...globalListeners]) listener();
  }

  function apply(quote: Quote): void {
    quotes.set(quote.ticker, quote);
    dirty.add(quote.ticker);

    if (scheduled) return;
    scheduled = true;
    schedule(flush);
  }

  function applyMany(incoming: readonly Quote[]): void {
    for (const quote of incoming) apply(quote);
  }

  function subscribe(ticker: string, listener: Listener): () => void {
    const set = listeners.get(ticker) ?? new Set<Listener>();
    listeners.set(ticker, set);
    set.add(listener);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(listener);
      if (set.size === 0) listeners.delete(ticker);
    };
  }

  function subscribeAll(listener: Listener): () => void {
    globalListeners.add(listener);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      globalListeners.delete(listener);
    };
  }

  const read = (ticker: string): Quote | undefined => quotes.get(ticker);

  function snapshot(): readonly Quote[] {
    if (cachedVersion !== version) {
      cachedSnapshot = [...quotes.values()].sort((a, b) =>
        a.ticker.localeCompare(b.ticker),
      );
      cachedVersion = version;
    }
    return cachedSnapshot;
  }

  function reset(): void {
    quotes.clear();
    dirty.clear();
    version += 1;
  }

  return {
    apply,
    applyMany,
    subscribe,
    subscribeAll,
    read,
    snapshot,
    reset,
    get size() {
      return quotes.size;
    },
    get version() {
      return version;
    },
    get subscriberCount() {
      let total = globalListeners.size;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}

export type QuoteStore = ReturnType<typeof createQuoteStore>;
