import { Typography } from "@mui/material";
import { brl, formatAmount, formatBRL } from "@mesa/money";

export interface MoneyProps {
  readonly cents: bigint | null;
  readonly withSymbol?: boolean;
  readonly dense?: boolean;
  readonly signed?: boolean;
  readonly coloured?: boolean;
}

export function Money({
  cents,
  withSymbol = false,
  dense = false,
  signed = false,
  coloured = false,
}: MoneyProps) {
  const variant = dense ? "numericSmall" : "numeric";

  if (cents === null) {
    return (
      <Typography variant={variant} sx={{ color: "market.flat" }}>
        —
      </Typography>
    );
  }

  const money = brl(cents < 0n ? -cents : cents);
  const body = withSymbol ? formatBRL(money) : formatAmount(money);
  const prefix = cents < 0n ? "−" : signed && cents > 0n ? "+" : "";

  const colour = !coloured
    ? undefined
    : cents > 0n
      ? "market.up"
      : cents < 0n
        ? "market.down"
        : "market.flat";

  return (
    <Typography
      variant={variant}
      {...(colour === undefined ? {} : { sx: { color: colour } })}
    >
      {prefix}
      {body}
    </Typography>
  );
}
