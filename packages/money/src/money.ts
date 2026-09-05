/**
 * Monetary values are represented as an integer number of minor units
 * (centavos for BRL). Floating point is never used: `0.1 + 0.2 !== 0.3`
 * is a rounding curiosity in most software and a reconciliation break in
 * a financial system.
 */

export type Currency = "BRL";

export interface Money {
  readonly cents: bigint;
  readonly currency: Currency;
}

/** How to resolve a fractional minor unit produced by a calculation. */
export type RoundingMode =
  /** Toward positive infinity. Used where the house must not lose a cent. */
  | "ceil"
  /** Toward zero. Used where the customer must not be overcharged. */
  | "trunc"
  /** Nearest, ties away from zero. The everyday default. */
  | "halfUp"
  /** Nearest, ties to the even neighbour. Avoids upward bias over many roundings. */
  | "halfEven";

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} with ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidAmountError extends Error {
  constructor(input: string) {
    super(`Not a valid monetary amount: "${input}"`);
    this.name = "InvalidAmountError";
  }
}

export const brl = (cents: bigint): Money => ({ cents, currency: "BRL" });

export const zero = (currency: Currency = "BRL"): Money => ({
  cents: 0n,
  currency,
});

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents + b.cents, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents - b.cents, currency: a.currency };
}

export function negate(m: Money): Money {
  return { cents: -m.cents, currency: m.currency };
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.cents < b.cents) return -1;
  if (a.cents > b.cents) return 1;
  return 0;
}

export const isZero = (m: Money): boolean => m.cents === 0n;
export const isNegative = (m: Money): boolean => m.cents < 0n;

/** Divide `numerator` by `denominator`, resolving the remainder per `mode`. */
function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");

  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  if (remainder === 0n) return negative ? -quotient : quotient;

  let rounded: bigint;
  switch (mode) {
    case "trunc":
      rounded = quotient;
      break;
    case "ceil":
      rounded = negative ? quotient : quotient + 1n;
      return negative ? -rounded : rounded;
    case "halfUp":
      rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
      break;
    case "halfEven": {
      const twice = remainder * 2n;
      if (twice > absDen) rounded = quotient + 1n;
      else if (twice < absDen) rounded = quotient;
      else rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
      break;
    }
  }
  return negative ? -rounded : rounded;
}

/**
 * Multiply by a rational factor expressed as `numerator / denominator`.
 * Rates are passed as integers to keep the whole calculation exact: a
 * brokerage fee of 0.35% is `multiplyRate(m, 35n, 10_000n, "ceil")`.
 */
export function multiplyRate(
  m: Money,
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): Money {
  return {
    cents: divideRounded(m.cents * numerator, denominator, mode),
    currency: m.currency,
  };
}

/** Multiply by a whole quantity. Exact — no rounding involved. */
export function multiplyQuantity(m: Money, quantity: bigint): Money {
  return { cents: m.cents * quantity, currency: m.currency };
}

/**
 * Split a value into `parts` shares that sum back to the original exactly.
 * Remainder cents are handed out one at a time to the leading shares, so
 * allocate(100_00n, 3) is [33_34, 33_33, 33_33] rather than three equal
 * shares that quietly lose a cent.
 */
export function allocate(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  return allocateByRatios(
    m,
    Array.from({ length: parts }, () => 1n),
  );
}

/** Split proportionally to `ratios`, preserving the total exactly. */
export function allocateByRatios(m: Money, ratios: readonly bigint[]): Money[] {
  if (ratios.length === 0) throw new RangeError("ratios must not be empty");
  if (ratios.some((r) => r < 0n)) throw new RangeError("ratios must not be negative");

  const total = ratios.reduce((acc, r) => acc + r, 0n);
  if (total === 0n) throw new RangeError("ratios must not sum to zero");

  const negative = m.cents < 0n;
  const absolute = negative ? -m.cents : m.cents;

  const shares: bigint[] = [];
  let distributed = 0n;
  for (const ratio of ratios) {
    const share = (absolute * ratio) / total;
    shares.push(share);
    distributed += share;
  }

  let remainder = absolute - distributed;
  for (let i = 0; remainder > 0n; i = (i + 1) % shares.length) {
    shares[i] = shares[i]! + 1n;
    remainder -= 1n;
  }

  return shares.map((cents) => ({
    cents: negative ? -cents : cents,
    currency: m.currency,
  }));
}

const AMOUNT_PATTERN = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/;

/** Parse Brazilian-formatted input: "1.234,56" and "1234,5" are both valid. */
export function parseBRL(input: string): Money {
  const trimmed = input.trim().replace(/^R\$\s*/, "");
  if (!AMOUNT_PATTERN.test(trimmed)) throw new InvalidAmountError(input);

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.replace(/\./g, "").split(",");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  return { cents: negative ? -cents : cents, currency: "BRL" };
}

const CURRENCY_FORMAT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DECIMAL_FORMAT = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toDecimalString(m: Money): string {
  const negative = m.cents < 0n;
  const absolute = negative ? -m.cents : m.cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Format with the currency symbol: "R$ 1.234,56". */
export function formatBRL(m: Money): string {
  return CURRENCY_FORMAT.format(Number(toDecimalString(m)));
}

/** Format without the symbol, for dense tables: "1.234,56". */
export function formatAmount(m: Money): string {
  return DECIMAL_FORMAT.format(Number(toDecimalString(m)));
}
