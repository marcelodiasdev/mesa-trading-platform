import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  isBusinessDay,
  settlementDateFor,
  toTradingDate,
} from "./calendar.ts";

describe("business days", () => {
  it("counts a plain weekday", () => {
    expect(isBusinessDay("2026-09-08")).toBe(true);
  });

  it("excludes Saturday and Sunday", () => {
    expect(isBusinessDay("2026-09-05")).toBe(false);
    expect(isBusinessDay("2026-09-06")).toBe(false);
  });

  it("excludes an exchange holiday", () => {
    expect(isBusinessDay("2026-09-07")).toBe(false);
  });
});

describe("settlement lands two business days later", () => {
  it("skips the weekend", () => {
    // Thursday 10 September settles on Monday 14
    expect(settlementDateFor("2026-09-10")).toBe("2026-09-14");
  });

  it("stays inside the week when it can", () => {
    expect(settlementDateFor("2026-09-08")).toBe("2026-09-10");
  });

  it("skips a holiday as well as the weekend", () => {
    // Friday 4 September: Monday 7 is a holiday, so D+2 is Wednesday 9
    expect(settlementDateFor("2026-09-04")).toBe("2026-09-09");
  });

  it("crosses the new year", () => {
    expect(settlementDateFor("2026-12-30")).toBe("2027-01-05");
  });

  it("never lands on a non-business day, whatever the trade date", () => {
    let date = "2026-09-01";
    for (let i = 0; i < 200; i += 1) {
      const settlement = settlementDateFor(date);
      expect(isBusinessDay(settlement)).toBe(true);
      date = addBusinessDays(date, 1);
    }
  });
});

describe("trading date", () => {
  it("takes the calendar day in UTC", () => {
    expect(toTradingDate(new Date("2026-09-08T13:45:00.000Z"))).toBe("2026-09-08");
  });
});
