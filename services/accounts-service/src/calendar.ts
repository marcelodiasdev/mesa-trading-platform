const B3_HOLIDAYS: ReadonlySet<string> = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-06-04",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-15",
  "2026-11-20",
  "2026-12-24",
  "2026-12-25",
  "2026-12-31",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-03-26",
  "2027-04-21",
  "2027-05-01",
  "2027-05-27",
  "2027-09-07",
  "2027-10-12",
  "2027-11-02",
  "2027-11-15",
  "2027-11-20",
  "2027-12-24",
  "2027-12-25",
  "2027-12-31",
]);

/** A trading day in São Paulo, as YYYY-MM-DD. */
export type TradingDate = string;

export function toTradingDate(value: Date): TradingDate {
  return value.toISOString().slice(0, 10);
}

function addDays(date: TradingDate, days: number): TradingDate {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toTradingDate(parsed);
}

export function isBusinessDay(date: TradingDate): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !B3_HOLIDAYS.has(date);
}

export function addBusinessDays(date: TradingDate, count: number): TradingDate {
  let cursor = date;
  let remaining = count;

  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) remaining -= 1;
  }

  return cursor;
}

export const SETTLEMENT_LAG_DAYS = 2;

export function settlementDateFor(tradeDate: TradingDate): TradingDate {
  return addBusinessDays(tradeDate, SETTLEMENT_LAG_DAYS);
}
