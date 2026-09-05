import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";

const ACCOUNT = "acc-42";
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const deposit = (amountCents: string, key: string) =>
  app.inject({
    method: "POST",
    url: `/accounts/${ACCOUNT}/deposits`,
    headers: { "Idempotency-Key": key },
    payload: { amountCents },
  });

describe("health", () => {
  it("answers", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });
});

describe("deposits", () => {
  it("credits the account and reports the new balance", async () => {
    const response = await deposit("10000", "key-1");
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ replayed: false, balanceCents: "10000" });
  });

  it("refuses a write with no idempotency key", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/accounts/${ACCOUNT}/deposits`,
      payload: { amountCents: "10000" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Idempotency-Key");
  });

  it("returns the original result on replay, without moving money twice", async () => {
    const first = await deposit("10000", "key-1");
    const second = await deposit("10000", "key-1");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().transactionId).toBe(first.json().transactionId);
    expect(second.json().replayed).toBe(true);
    expect(second.json().balanceCents).toBe("10000");
  });

  it("rejects a JSON number, which would lose precision", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/accounts/${ACCOUNT}/deposits`,
      headers: { "Idempotency-Key": "key-n" },
      payload: { amountCents: 10000 },
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects a non-positive amount", async () => {
    const response = await deposit("0", "key-z");
    expect(response.statusCode).toBe(422);
  });

  it("carries a balance beyond Number.MAX_SAFE_INTEGER intact", async () => {
    const huge = "9007199254740993";
    const response = await deposit(huge, "key-huge");
    expect(response.json().balanceCents).toBe(huge);
  });
});

describe("balance", () => {
  it("starts at zero", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/accounts/new-acc/balance",
    });
    expect(response.json().balanceCents).toBe("0");
  });

  it("reflects the postings", async () => {
    await deposit("10000", "a");
    await deposit("2550", "b");
    const response = await app.inject({
      method: "GET",
      url: `/accounts/${ACCOUNT}/balance`,
    });
    expect(response.json().balanceCents).toBe("12550");
  });
});

describe("statement", () => {
  it("lists movements newest first with a running balance", async () => {
    await deposit("10000", "a");
    await deposit("2550", "b");

    const response = await app.inject({
      method: "GET",
      url: `/accounts/${ACCOUNT}/statement`,
    });
    const lines = response.json().lines as {
      amountCents: string;
      balanceCents: string;
    }[];

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amountCents: "2550", balanceCents: "12550" });
    expect(lines[1]).toMatchObject({ amountCents: "10000", balanceCents: "10000" });
  });

  it("rejects an out-of-range limit", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/accounts/${ACCOUNT}/statement?limit=999`,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("correlation id", () => {
  it("echoes the one the client sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "X-Correlation-Id": "corr-from-client" },
    });
    expect(response.headers["x-correlation-id"]).toBe("corr-from-client");
  });

  it("generates one when the client sends none", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("reconciliation", () => {
  it("nets to zero after any number of deposits", async () => {
    await deposit("10000", "a");
    await deposit("2550", "b");
    await deposit("99", "c");

    const response = await app.inject({ method: "GET", url: "/internal/reconciliation" });
    expect(response.json()).toEqual({ balanced: true, deltaCents: "0" });
  });
});
