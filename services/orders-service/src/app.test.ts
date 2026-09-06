import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import {
  AccountsUnavailableError,
  InsufficientFundsError,
  type AccountsClient,
} from "./accounts-client.ts";

const ACCOUNT = "acc-1";
let app: FastifyInstance;
let accounts: AccountsClient;
let released: string[];

function fakeAccounts(over: Partial<AccountsClient> = {}): AccountsClient {
  let cash = 1_000_000n;
  return {
    snapshot: async () => ({ buyingPowerCents: cash, equityCents: 10_000_000n }),
    reserve: async (_account, amountCents) => {
      if (amountCents > cash) throw new InsufficientFundsError(cash, amountCents);
      cash -= amountCents;
      return { reservationId: `res-${crypto.randomUUID()}`, buyingPowerCents: cash };
    },
    release: async (_account, reservationId) => {
      released.push(reservationId);
    },
    ...over,
  };
}

async function boot(client: AccountsClient = fakeAccounts()) {
  accounts = client;
  app = buildApp({ accounts });
  await app.ready();
}

const place = (over: Record<string, unknown> = {}, key = crypto.randomUUID()) =>
  app.inject({
    method: "POST",
    url: "/orders",
    headers: { "Idempotency-Key": key },
    payload: {
      accountId: ACCOUNT,
      ticker: "PETR4",
      side: "BUY",
      type: "LIMIT",
      quantity: 100,
      limitPriceCents: "3850",
      referencePriceCents: "3850",
      ...over,
    },
  });

beforeEach(async () => {
  released = [];
  await boot();
});

afterEach(async () => {
  await app.close();
});

describe("placing an order", () => {
  it("reaches the book and reserves the notional", async () => {
    const response = await place();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "WORKING", replayed: false });
    expect(response.json().reservationId).toMatch(/^res-/);
  });

  it("records the full trajectory in the event log", async () => {
    const order = await place();
    const events = await app
      .inject({ method: "GET", url: `/orders/${order.json().id}/events` })
      .then((r) => r.json());

    expect(events.events.map((e: { to: string }) => e.to)).toEqual([
      "RECEIVED",
      "VALIDATED",
      "WORKING",
    ]);
  });

  it("refuses an order with no idempotency key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        accountId: ACCOUNT,
        ticker: "PETR4",
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        referencePriceCents: "3850",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a quantity outside the round lot", async () => {
    const response = await place({ quantity: 150 });
    expect(response.statusCode).toBe(422);
    expect(response.json().issues[0].path).toBe("quantity");
  });

  it("rejects a limit order with no price", async () => {
    const response = await place({ limitPriceCents: undefined });
    expect(response.statusCode).toBe(422);
  });

  it("does not reserve anything for a sale", async () => {
    const spy = vi.spyOn(accounts, "reserve");
    const buy = await place();
    await app.inject({
      method: "POST",
      url: `/internal/orders/${buy.json().id}/fills`,
      payload: { quantity: 100, priceCents: "3850" },
    });
    spy.mockClear();

    const sale = await place({ side: "SELL" });
    expect(sale.statusCode).toBe(201);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("idempotency across the whole flow", () => {
  it("returns the original order and reserves only once", async () => {
    const key = crypto.randomUUID();
    const spy = vi.spyOn(accounts, "reserve");

    const first = await place({}, key);
    const second = await place({}, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(second.json().replayed).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("leaves a single order on the account", async () => {
    const key = crypto.randomUUID();
    await place({}, key);
    await place({}, key);

    const list = await app
      .inject({ method: "GET", url: `/accounts/${ACCOUNT}/orders` })
      .then((r) => r.json());
    expect(list.orders).toHaveLength(1);
  });
});

describe("pre-trade risk", () => {
  it("rejects an order beyond buying power and keeps it out of the book", async () => {
    const response = await place({ quantity: 1000, referencePriceCents: "3850" });
    expect(response.statusCode).toBe(422);
    expect(response.json().rejection.code).toBe("INSUFFICIENT_BUYING_POWER");
    expect(response.json().order.status).toBe("REJECTED");
  });

  it("explains the shortfall in cents", async () => {
    const response = await place({ quantity: 1000 });
    expect(response.json().rejection).toMatchObject({
      requiredCents: "3850000",
      availableCents: "1000000",
    });
  });

  it("rejects a sale the account cannot cover", async () => {
    const response = await place({ side: "SELL" });
    expect(response.statusCode).toBe(422);
    expect(response.json().rejection.code).toBe("INSUFFICIENT_POSITION");
  });

  it("keeps the rejection reason on the event log", async () => {
    const response = await place({ quantity: 1000 });
    const events = await app
      .inject({ method: "GET", url: `/orders/${response.json().order.id}/events` })
      .then((r) => r.json());

    expect(events.events.at(-1)).toMatchObject({
      to: "REJECTED",
      reason: "INSUFFICIENT_BUYING_POWER",
    });
  });
});

describe("when the accounts service is down", () => {
  it("rejects rather than assuming the customer has money", async () => {
    await app.close();
    await boot(
      fakeAccounts({
        snapshot: async () => {
          throw new AccountsUnavailableError(new Error("ECONNREFUSED"));
        },
      }),
    );

    const response = await place();
    expect(response.statusCode).toBe(503);
    expect(response.json().order.status).toBe("REJECTED");
  });

  it("rejects when the reservation itself fails", async () => {
    await app.close();
    await boot(
      fakeAccounts({
        reserve: async () => {
          throw new AccountsUnavailableError(new Error("timeout"));
        },
      }),
    );

    const response = await place();
    expect(response.statusCode).toBe(503);
    expect(response.json().order.status).toBe("REJECTED");
  });
});

describe("cancelling", () => {
  it("releases the reservation", async () => {
    const order = await place();
    const reservationId = order.json().reservationId;

    const response = await app.inject({
      method: "POST",
      url: `/orders/${order.json().id}/cancel`,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("CANCELLED");
    expect(released).toEqual([reservationId]);
  });

  it("is idempotent", async () => {
    const order = await place();
    const cancel = () =>
      app.inject({
        method: "POST",
        url: `/orders/${order.json().id}/cancel`,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });

    await cancel();
    const second = await cancel();

    expect(second.statusCode).toBe(200);
    expect(second.json().replayed).toBe(true);
    expect(released).toHaveLength(1);
  });

  it("refuses to cancel an order that already filled", async () => {
    const order = await place();
    await app.inject({
      method: "POST",
      url: `/internal/orders/${order.json().id}/fills`,
      payload: { quantity: 100, priceCents: "3850" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/orders/${order.json().id}/cancel`,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().status).toBe("FILLED");
  });

  it("answers 404 for an unknown order", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orders/nope/cancel",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("fills", () => {
  it("moves through partial to filled", async () => {
    const order = await place();
    const id = order.json().id;

    const partial = await app.inject({
      method: "POST",
      url: `/internal/orders/${id}/fills`,
      payload: { quantity: 40, priceCents: "3800" },
    });
    expect(partial.json().status).toBe("PARTIALLY_FILLED");

    const complete = await app.inject({
      method: "POST",
      url: `/internal/orders/${id}/fills`,
      payload: { quantity: 60, priceCents: "3900" },
    });
    expect(complete.json()).toMatchObject({
      status: "FILLED",
      averagePriceCents: "3860",
    });
  });

  it("refuses to fill beyond the quantity ordered", async () => {
    const order = await place();
    const id = order.json().id;
    await app.inject({
      method: "POST",
      url: `/internal/orders/${id}/fills`,
      payload: { quantity: 100, priceCents: "3850" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/internal/orders/${id}/fills`,
      payload: { quantity: 100, priceCents: "3850" },
    });
    expect(response.statusCode).toBe(409);
  });
});
