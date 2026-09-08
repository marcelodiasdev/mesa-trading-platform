import { describe, expect, it } from "vitest";
import {
  centsFromTyping,
  digitsOf,
  formatCents,
  maskTyping,
  snapToTick,
} from "./money-input";

describe("typing a price", () => {
  it("treats the last two digits as cents", () => {
    expect(centsFromTyping("3850")).toBe(3850n);
  });

  it("builds up one digit at a time", () => {
    expect(maskTyping("3")).toBe("0,03");
    expect(maskTyping("38")).toBe("0,38");
    expect(maskTyping("385")).toBe("3,85");
    expect(maskTyping("3850")).toBe("38,50");
    expect(maskTyping("38500")).toBe("385,00");
  });

  it("ignores anything that is not a digit", () => {
    expect(centsFromTyping("R$ 38,50")).toBe(3850n);
    expect(centsFromTyping("38.50")).toBe(3850n);
    expect(centsFromTyping("abc")).toBe(0n);
  });

  it("treats an empty field as zero, not NaN", () => {
    expect(centsFromTyping("")).toBe(0n);
    expect(digitsOf("")).toBe("");
  });

  it("survives a value beyond Number.MAX_SAFE_INTEGER", () => {
    expect(centsFromTyping("9007199254740993")).toBe(9_007_199_254_740_993n);
  });

  it("is stable when the masked output is fed back in", () => {
    const once = maskTyping("3850");
    expect(maskTyping(once)).toBe(once);
  });
});

describe("formatting", () => {
  it("groups thousands", () => {
    expect(formatCents(123_456_78n)).toBe("123.456,78");
  });

  it("keeps trailing zeros", () => {
    expect(formatCents(3_800n)).toBe("38,00");
  });

  it("shows an empty field for zero instead of 0,00", () => {
    expect(formatCents(0n)).toBe("");
  });
});

describe("tick size", () => {
  it("leaves a price alone when the tick is one cent", () => {
    expect(snapToTick(3_857n, 1n)).toBe(3_857n);
  });

  it("snaps down to the grid", () => {
    expect(snapToTick(3_857n, 5n)).toBe(3_855n);
    expect(snapToTick(3_855n, 5n)).toBe(3_855n);
  });

  it("never snaps up, so the order is never priced better than asked", () => {
    for (let cents = 3_850n; cents < 3_860n; cents += 1n) {
      expect(snapToTick(cents, 5n)).toBeLessThanOrEqual(cents);
    }
  });
});
