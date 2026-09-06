export interface AccountSnapshot {
  readonly buyingPowerCents: bigint;
  readonly equityCents: bigint;
}

export interface AccountsClient {
  snapshot(accountId: string, correlationId: string): Promise<AccountSnapshot>;
}

export class AccountsUnavailableError extends Error {
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super("The accounts service could not be reached");
    this.name = "AccountsUnavailableError";
    this.cause = cause;
  }
}

export interface HttpAccountsClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpAccountsClient(
  options: HttpAccountsClientOptions,
): AccountsClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3_000;

  return {
    async snapshot(accountId, correlationId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(
          new URL(`accounts/${accountId}/balance`, options.baseUrl),
          {
            headers: { Accept: "application/json", "X-Correlation-Id": correlationId },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`balance responded ${response.status}`);

        const body = (await response.json()) as { balanceCents?: unknown };
        if (typeof body.balanceCents !== "string" || !/^-?\d+$/.test(body.balanceCents)) {
          throw new Error("balance is not an integer string of cents");
        }

        const balance = BigInt(body.balanceCents);
        return { buyingPowerCents: balance, equityCents: balance };
      } catch (error) {
        throw new AccountsUnavailableError(error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
