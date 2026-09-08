import { Typography } from "@mui/material";
import { brl, formatAmount, formatBRL } from "@mesa/money";

export interface MoneyProps {
  readonly cents: bigint | null;
  readonly withSymbol?: boolean;
  readonly dense?: boolean;
  readonly signed?: boolean;
}

export function Money({
  cents,
  withSymbol = false,
  dense = false,
  signed = false,
}: MoneyProps) {
  if (cents === null) {
    return (
      <Typography
        variant={dense ? "numericSmall" : "numeric"}
        sx={{ color: "market.flat" }}
      >
        —
      </Typography>
    );
  }

  const money = brl(cents < 0n ? -cents : cents);
  const body = withSymbol ? formatBRL(money) : formatAmount(money);
  const prefix = cents < 0n ? "−" : signed && cents > 0n ? "+" : "";

  return (
    <Typography variant={dense ? "numericSmall" : "numeric"}>
      {prefix}
      {body}
    </Typography>
  );
}
