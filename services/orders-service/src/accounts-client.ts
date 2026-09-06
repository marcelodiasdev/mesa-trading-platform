export interface AccountSnapshot {
  readonly buyingPowerCents: bigint;
  readonly equityCents: bigint;
}

export interface Reservation {
  readonly reservationId: string;
  readonly buyingPowerCents: bigint;
}

export interface AccountsClient {
  snapshot(accountId: string, correlationId: string): Promise<AccountSnapshot>;
  reserve(
    accountId: string,
    amountCents: bigint,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<Reservation>;
  release(
    accountId: string,
    reservationId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<void>;
}

export class AccountsUnavailableError extends Error {
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super("The accounts service could not be reached");
    this.name = "AccountsUnavailableError";
    this.cause = cause;
  }
}

export class InsufficientFundsError extends Error {
  readonly availableCents: bigint;
  readonly requestedCents: bigint;
  constructor(availableCents: bigint, requestedCents: bigint) {
    super(`Account holds ${availableCents}, needs ${requestedCents}`);
    this.name = "InsufficientFundsError";
    this.availableCents = availableCents;
    this.requestedCents = requestedCents;
  }
}

export interface HttpAccountsClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const asCents = (value: unknown, field: string): bigint => {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new Error(`${field} is not an integer string of cents`);
  }
  return BigInt(value);
};

export function createHttpAccountsClient(
  options: HttpAccountsClientOptions,
): AccountsClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3_000;

  async function call(
    path: string,
    correlationId: string,
    init?: { method: string; body?: unknown; idempotencyKey?: string },
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Correlation-Id": correlationId,
      };
      if (init?.body !== undefined) headers["Content-Type"] = "application/json";
      if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

      const response = await doFetch(new URL(path, options.baseUrl), {
        method: init?.method ?? "GET",
        headers,
        body: init?.body === undefined ? null : JSON.stringify(init.body),
        signal: controller.signal,
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: response.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async snapshot(accountId, correlationId) {
      try {
        const { status, body } = await call(
          `accounts/${accountId}/balance`,
          correlationId,
        );
        if (status !== 200) throw new Error(`balance responded ${status}`);
        return {
          buyingPowerCents: asCents(body.buyingPowerCents, "buyingPowerCents"),
          equityCents: asCents(body.equityCents, "equityCents"),
        };
      } catch (error) {
        throw new AccountsUnavailableError(error);
      }
    },

    async reserve(accountId, amountCents, idempotencyKey, correlationId) {
      let status: number;
      let body: Record<string, unknown>;
      try {
        ({ status, body } = await call(
          `accounts/${accountId}/reservations`,
          correlationId,
          {
            method: "POST",
            idempotencyKey,
            body: { amountCents: amountCents.toString() },
          },
        ));
      } catch (error) {
        throw new AccountsUnavailableError(error);
      }

      if (status === 409) {
        throw new InsufficientFundsError(
          asCents(body.availableCents, "availableCents"),
          asCents(body.requestedCents, "requestedCents"),
        );
      }
      if (status !== 200 && status !== 201) {
        throw new AccountsUnavailableError(new Error(`reservations responded ${status}`));
      }
      if (typeof body.reservationId !== "string") {
        throw new AccountsUnavailableError(new Error("reservationId is missing"));
      }

      return {
        reservationId: body.reservationId,
        buyingPowerCents: asCents(body.buyingPowerCents, "buyingPowerCents"),
      };
    },

    async release(accountId, reservationId, idempotencyKey, correlationId) {
      try {
        const { status } = await call(
          `accounts/${accountId}/reservations/${reservationId}/release`,
          correlationId,
          { method: "POST", idempotencyKey },
        );
        if (status !== 200 && status !== 201 && status !== 404) {
          throw new Error(`release responded ${status}`);
        }
      } catch (error) {
        throw new AccountsUnavailableError(error);
      }
    },
  };
}
