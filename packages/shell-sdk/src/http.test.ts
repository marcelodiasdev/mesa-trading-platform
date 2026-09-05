import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "./http";
import { ContractViolationError, HttpError, NetworkError, TimeoutError } from "./errors";

const Schema = z.object({ id: z.string(), balanceCents: z.string() });
const payload = { id: "acc-1", balanceCents: "125000" };

const baseUrls = {
  accounts: "http://accounts.test/",
  orders: "http://orders.test/",
  market: "http://market.test/",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let calls: { url: string; init: RequestInit }[] = [];

function makeClient(
  responder: (attempt: number) => Response | Promise<Response> | never,
  overrides: Partial<Parameters<typeof createHttpClient>[0]> = {},
) {
  let attempt = 0;
  return createHttpClient({
    baseUrls,
    getToken: async () => "token-123",
    newCorrelationId: () => "corr-fixed",
    sleep: async () => {},
    fetch: (async (url: string, init: RequestInit) => {
      attempt += 1;
      calls.push({ url: String(url), init });
      return responder(attempt);
    }) as unknown as typeof fetch,
    ...overrides,
  });
}

beforeEach(() => {
  calls = [];
});

describe("headers", () => {
  it("sends a correlation id on every request", async () => {
    const client = makeClient(() => jsonResponse(payload));
    await client.request({ service: "accounts", path: "/accounts/1", schema: Schema });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Correlation-Id"]).toBe("corr-fixed");
  });

  it("sends the bearer token", async () => {
    const client = makeClient(() => jsonResponse(payload));
    await client.request({ service: "accounts", path: "/accounts/1", schema: Schema });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
  });

  it("sends the idempotency key when given", async () => {
    const client = makeClient(() => jsonResponse(payload));
    await client.request({
      service: "orders",
      path: "/orders",
      method: "POST",
      body: { ticker: "PETR4" },
      idempotencyKey: "key-abc",
      schema: Schema,
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("key-abc");
  });

  it("resolves the service base url", async () => {
    const client = makeClient(() => jsonResponse(payload));
    await client.request({
      service: "market",
      path: "/quotes",
      query: { ticker: "VALE3", depth: 5 },
      schema: Schema,
    });
    expect(calls[0]!.url).toBe("http://market.test/quotes?ticker=VALE3&depth=5");
  });
});

describe("retry safety", () => {
  it("retries a GET on 503 and succeeds", async () => {
    const client = makeClient((attempt) =>
      attempt < 3 ? jsonResponse({ error: "busy" }, 503) : jsonResponse(payload),
    );
    const result = await client.request({
      service: "accounts",
      path: "/accounts/1",
      schema: Schema,
    });
    expect(result.balanceCents).toBe("125000");
    expect(calls).toHaveLength(3);
  });

  it("never retries a POST without an idempotency key", async () => {
    const client = makeClient(() => jsonResponse({ error: "busy" }, 503));
    await expect(
      client.request({
        service: "orders",
        path: "/orders",
        method: "POST",
        body: {},
        schema: Schema,
      }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("retries a POST that carries an idempotency key", async () => {
    const client = makeClient((attempt) =>
      attempt < 2 ? jsonResponse({ error: "busy" }, 503) : jsonResponse(payload),
    );
    await client.request({
      service: "orders",
      path: "/orders",
      method: "POST",
      body: {},
      idempotencyKey: "key-abc",
      schema: Schema,
    });
    expect(calls).toHaveLength(2);
  });

  it("replays the same idempotency key on every attempt", async () => {
    const client = makeClient((attempt) =>
      attempt < 3 ? jsonResponse({ error: "busy" }, 503) : jsonResponse(payload),
    );
    await client.request({
      service: "orders",
      path: "/orders",
      method: "POST",
      body: {},
      idempotencyKey: "key-abc",
      schema: Schema,
    });
    const keys = calls.map(
      (c) => (c.init.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["key-abc", "key-abc", "key-abc"]);
  });

  it("does not retry a 4xx, which will fail identically", async () => {
    const client = makeClient(() => jsonResponse({ error: "bad request" }, 400));
    await expect(
      client.request({ service: "accounts", path: "/accounts/1", schema: Schema }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("gives up after the configured number of attempts", async () => {
    const client = makeClient(() => jsonResponse({ error: "busy" }, 503));
    await expect(
      client.request({
        service: "accounts",
        path: "/accounts/1",
        schema: Schema,
        retry: { attempts: 4, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(4);
  });

  it("reports each retry so it can be observed", async () => {
    const onRetry = vi.fn();
    const client = makeClient(
      (attempt) => (attempt < 2 ? jsonResponse({}, 503) : jsonResponse(payload)),
      { onRetry },
    );
    await client.request({ service: "accounts", path: "/accounts/1", schema: Schema });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry.mock.calls[0]![0]).toMatchObject({
      service: "accounts",
      attempt: 1,
      correlationId: "corr-fixed",
      reason: "status 503",
    });
  });
});

describe("contract enforcement", () => {
  it("rejects a response that does not match the schema", async () => {
    const client = makeClient(() => jsonResponse({ id: "acc-1", balanceCents: 125000 }));
    await expect(
      client.request({ service: "accounts", path: "/accounts/1", schema: Schema }),
    ).rejects.toBeInstanceOf(ContractViolationError);
  });

  it("names the offending field", async () => {
    const client = makeClient(() => jsonResponse({ id: "acc-1" }));
    try {
      await client.request({ service: "accounts", path: "/accounts/1", schema: Schema });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContractViolationError);
      expect((error as ContractViolationError).issues[0]!.path).toBe("balanceCents");
    }
  });

  it("does not retry a contract violation, since the shape will not change", async () => {
    const client = makeClient(() => jsonResponse({ wrong: true }));
    await expect(
      client.request({ service: "accounts", path: "/accounts/1", schema: Schema }),
    ).rejects.toBeInstanceOf(ContractViolationError);
    expect(calls).toHaveLength(1);
  });
});

describe("failure modes", () => {
  it("wraps a network failure", async () => {
    const client = makeClient(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      client.request({
        service: "market",
        path: "/quotes",
        schema: Schema,
        retry: false,
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it("wraps an aborted request as a timeout", async () => {
    const client = makeClient(() => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      client.request({
        service: "market",
        path: "/quotes",
        schema: Schema,
        retry: false,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("carries the correlation id on every error", async () => {
    const client = makeClient(() => jsonResponse({}, 500));
    try {
      await client.request({
        service: "accounts",
        path: "/accounts/1",
        schema: Schema,
        retry: false,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as HttpError).correlationId).toBe("corr-fixed");
    }
  });
});
