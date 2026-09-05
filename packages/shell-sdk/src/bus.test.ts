import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./bus";

describe("event bus", () => {
  it("delivers a payload to a subscriber", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("ticket:open", handler);
    bus.emit("ticket:open", { ticker: "PETR4", side: "BUY" });
    expect(handler).toHaveBeenCalledWith({ ticker: "PETR4", side: "BUY" });
  });

  it("delivers to every subscriber of the same event", () => {
    const bus = createEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.on("account:changed", first);
    bus.on("account:changed", second);
    bus.emit("account:changed", { accountId: "acc-1" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("ignores an event nobody listens to", () => {
    const bus = createEventBus();
    expect(() =>
      bus.emit("order:settled", { orderId: "o1", ticker: "VALE3" }),
    ).not.toThrow();
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.on("ticket:open", handler);
    off();
    bus.emit("ticket:open", { ticker: "PETR4", side: "SELL" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("tolerates unsubscribing twice", () => {
    const bus = createEventBus();
    const off = bus.on("ticket:open", vi.fn());
    off();
    expect(off).not.toThrow();
  });

  it("once fires exactly one time", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once("account:changed", handler);
    bus.emit("account:changed", { accountId: "acc-1" });
    bus.emit("account:changed", { accountId: "acc-2" });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ accountId: "acc-1" });
  });

  it("keeps serving other subscribers when one throws", () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus({ onHandlerError });
    const healthy = vi.fn();

    bus.on("ticket:open", () => {
      throw new Error("remote crashed");
    });
    bus.on("ticket:open", healthy);

    bus.emit("ticket:open", { ticker: "ITUB4", side: "BUY" });

    expect(healthy).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledOnce();
    expect(onHandlerError.mock.calls[0]![0]).toBe("ticket:open");
  });

  it("survives a handler that unsubscribes during delivery", () => {
    const bus = createEventBus();
    const second = vi.fn();
    const offFirst = bus.on("ticket:open", () => offFirst());
    bus.on("ticket:open", second);
    expect(() => bus.emit("ticket:open", { ticker: "BBAS3", side: "BUY" })).not.toThrow();
    expect(second).toHaveBeenCalledOnce();
  });

  it("survives a handler that subscribes during delivery", () => {
    const bus = createEventBus();
    const late = vi.fn();
    bus.on("ticket:open", () => {
      bus.on("ticket:open", late);
    });
    bus.emit("ticket:open", { ticker: "BBAS3", side: "BUY" });
    // The new subscriber joins for the next emission, not the current one.
    expect(late).not.toHaveBeenCalled();
    bus.emit("ticket:open", { ticker: "BBAS3", side: "BUY" });
    expect(late).toHaveBeenCalledOnce();
  });
});
