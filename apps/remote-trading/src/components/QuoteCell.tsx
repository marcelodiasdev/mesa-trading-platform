import { memo } from "react";
import { Box, Typography } from "@mui/material";
import { PriceChange } from "@mesa/ui-kit";
import { formatAmount, brl } from "@mesa/money";
import { useQuote } from "../market/hooks";

export interface QuoteCellProps {
  readonly ticker: string;
}

export const QuoteCell = memo(function QuoteCell({ ticker }: QuoteCellProps) {
  const quote = useQuote(ticker);

  if (quote === undefined) {
    return (
      <Typography variant="numeric" sx={{ color: "market.flat" }}>
        —
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "inline-flex", gap: 3, alignItems: "baseline" }}>
      <Typography variant="numeric">{formatAmount(brl(quote.priceCents))}</Typography>
      <PriceChange percent={quote.changeBps / 100} dense />
    </Box>
  );
});
