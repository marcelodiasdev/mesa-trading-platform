import type { z } from "zod";
import { ContractViolationError, HttpError, NetworkError, TimeoutError } from "./errors";

export type ServiceName = "accounts" | "orders" | "market";
export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RetryPolicy {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
};

export interface RequestOptions<T> {
  readonly service: ServiceName;
  readonly path: string;
  readonly schema: z.ZodType<T>;
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly idempotencyKey?: string;
  readonly timeoutMs?: number;
  readonly retry?: RetryPolicy | false;
  readonly signal?: AbortSignal;
}

export interface HttpClientConfig {
  readonly baseUrls: Readonly<Record<ServiceName, string>>;
  readonly getToken: () => Promise<string | null>;
  readonly newCorrelationId?: () => string;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onRetry?: (info: {
    service: ServiceName;
    path: string;
    attempt: number;
    delayMs: number;
    correlationId: string;
    reason: string;
  }) => void;
}

const SAFE_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["GET"]);
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 502, 503, 504]);

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isReplaySafe(method: HttpMethod, idempotencyKey: string | undefined): boolean {
  return SAFE_METHODS.has(method) || idempotencyKey !== undefined;
}

function backoffDelay(attempt: number, policy: RetryPolicy, random: number): number {
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.round(random * Math.min(exponential, policy.maxDelayMs));
}

function buildUrl(
  base: string,
  path: string,
  query: RequestOptions<unknown>["query"],
): string {
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function createHttpClient(config: HttpClientConfig) {
  const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = config.sleep ?? defaultSleep;
  const newCorrelationId = config.newCorrelationId ?? (() => crypto.randomUUID());

  async function request<T>(options: RequestOptions<T>): Promise<T> {
    const method = options.method ?? "GET";
    const timeoutMs = options.timeoutMs ?? 10_000;
    const correlationId = newCorrelationId();
    const url = buildUrl(config.baseUrls[options.service], options.path, options.query);

    const policy =
      options.retry === false || !isReplaySafe(method, options.idempotencyKey)
        ? null
        : (options.retry ?? DEFAULT_RETRY);
    const attempts = policy?.attempts ?? 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

      try {
        const token = await config.getToken();
        const headers: Record<string, string> = {
          Accept: "application/json",
          "X-Correlation-Id": correlationId,
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (options.body !== undefined) headers["Content-Type"] = "application/json";
        if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

        const response = await doFetch(url, {
          method,
          headers,
          body: options.body === undefined ? null : JSON.stringify(options.body),
          signal: options.signal ?? timeoutController.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          const error = new HttpError(
            response.status,
            options.service,
            options.path,
            correlationId,
            body,
          );
          if (policy && RETRYABLE_STATUSES.has(response.status) && attempt < attempts) {
            lastError = error;
            const delayMs = backoffDelay(attempt, policy, Math.random());
            config.onRetry?.({
              service: options.service,
              path: options.path,
              attempt,
              delayMs,
              correlationId,
              reason: `status ${response.status}`,
            });
            await sleep(delayMs);
            continue;
          }
          throw error;
        }

        const payload: unknown = await response.json();
        const parsed = options.schema.safeParse(payload);
        if (!parsed.success) {
          throw new ContractViolationError(
            options.service,
            options.path,
            correlationId,
            parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof ContractViolationError || error instanceof HttpError) {
          throw error;
        }

        const isAbort = error instanceof DOMException && error.name === "AbortError";
        const wrapped = isAbort
          ? new TimeoutError(options.service, timeoutMs, correlationId)
          : new NetworkError(options.service, correlationId, error);

        if (options.signal?.aborted) throw wrapped;

        if (policy && attempt < attempts) {
          lastError = wrapped;
          const delayMs = backoffDelay(attempt, policy, Math.random());
          config.onRetry?.({
            service: options.service,
            path: options.path,
            attempt,
            delayMs,
            correlationId,
            reason: wrapped.kind,
          });
          await sleep(delayMs);
          continue;
        }
        throw wrapped;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  }

  return { request };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
