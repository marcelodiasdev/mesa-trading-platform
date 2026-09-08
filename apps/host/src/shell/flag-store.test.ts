import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "../store/index";
import { KILL_SWITCH_ORDER_ENTRY, flagSet } from "../store/slices/flags";
import { tickerSelected } from "../store/slices/ui";
import { createFlagStore } from "./flag-store";

describe("flag store", () => {
  it("reads a flag that is on", () => {
    const flags = createFlagStore(createAppStore());
    expect(flags.isEnabled(KILL_SWITCH_ORDER_ENTRY)).toBe(true);
  });

  it("treats an unknown flag as off, never undefined", () => {
    const flags = createFlagStore(createAppStore());
    expect(flags.isEnabled("no.such.flag")).toBe(false);
  });

  it("reflects a change immediately", () => {
    const store = createAppStore();
    const flags = createFlagStore(store);

    store.dispatch(flagSet({ flag: KILL_SWITCH_ORDER_ENTRY, enabled: false }));
    expect(flags.isEnabled(KILL_SWITCH_ORDER_ENTRY)).toBe(false);
  });

  it("notifies subscribers when a flag changes", () => {
    const store = createAppStore();
    const flags = createFlagStore(store);
    const listener = vi.fn();
    flags.subscribe(listener);

    store.dispatch(flagSet({ flag: KILL_SWITCH_ORDER_ENTRY, enabled: false }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when unrelated state changes", () => {
    const store = createAppStore();
    const flags = createFlagStore(store);
    const listener = vi.fn();
    flags.subscribe(listener);

    store.dispatch(tickerSelected("PETR4"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createAppStore();
    const flags = createFlagStore(store);
    const listener = vi.fn();
    const off = flags.subscribe(listener);
    off();

    store.dispatch(flagSet({ flag: KILL_SWITCH_ORDER_ENTRY, enabled: false }));

    expect(listener).not.toHaveBeenCalled();
  });
});
