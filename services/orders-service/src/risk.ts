import type { OrderSide, OrderType } from "@mesa/contracts";

export interface RiskInput {
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: number;
  readonly referencePriceCents: bigint;
  readonly buyingPowerCents: bigint;
  readonly equityCents: bigint;
  readonly heldQuantity: number;
}

export interface RiskLimits {
  readonly maxSingleOrderBps: number;
}

export const DEFAULT_LIMITS: RiskLimits = { maxSingleOrderBps: 2_500 };

export type RiskRejection =
  | { code: "INSUFFICIENT_BUYING_POWER"; requiredCents: bigint; availableCents: bigint }
  | { code: "INSUFFICIENT_POSITION"; requestedQuantity: number; heldQuantity: number }
  | { code: "EXPOSURE_LIMIT_EXCEEDED"; notionalCents: bigint; limitCents: bigint };

export interface RiskDecision {
  readonly accepted: boolean;
  readonly notionalCents: bigint;
  readonly rejection?: RiskRejection;
}

const MARKET_ORDER_SLIPPAGE_BPS = 300n;

export function estimateNotional(input: RiskInput): bigint {
  const base = input.referencePriceCents * BigInt(input.quantity);
  if (input.type !== "MARKET") return base;
  return (base * (10_000n + MARKET_ORDER_SLIPPAGE_BPS) + 9_999n) / 10_000n;
}

export function assessRisk(
  input: RiskInput,
  limits: RiskLimits = DEFAULT_LIMITS,
): RiskDecision {
  const notionalCents = estimateNotional(input);

  if (input.side === "SELL") {
    if (input.heldQuantity < input.quantity) {
      return {
        accepted: false,
        notionalCents,
        rejection: {
          code: "INSUFFICIENT_POSITION",
          requestedQuantity: input.quantity,
          heldQuantity: input.heldQuantity,
        },
      };
    }
    return { accepted: true, notionalCents };
  }

  if (notionalCents > input.buyingPowerCents) {
    return {
      accepted: false,
      notionalCents,
      rejection: {
        code: "INSUFFICIENT_BUYING_POWER",
        requiredCents: notionalCents,
        availableCents: input.buyingPowerCents,
      },
    };
  }

  const limitCents = (input.equityCents * BigInt(limits.maxSingleOrderBps)) / 10_000n;
  if (input.equityCents > 0n && notionalCents > limitCents) {
    return {
      accepted: false,
      notionalCents,
      rejection: { code: "EXPOSURE_LIMIT_EXCEEDED", notionalCents, limitCents },
    };
  }

  return { accepted: true, notionalCents };
}
