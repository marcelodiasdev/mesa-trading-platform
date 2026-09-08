import { Box, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { brl, formatAmount } from "@mesa/money";
import { useOrderBook, type BookLevel } from "../market/book";

interface SideProps {
  readonly levels: readonly BookLevel[];
  readonly side: "bid" | "ask";
  readonly maxQuantity: number;
}

function Side({ levels, side, maxQuantity }: SideProps) {
  const tone = side === "bid" ? "market.up" : "market.down";
  const wash = side === "bid" ? "market.upSubtle" : "market.downSubtle";

  return (
    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {side === "bid" ? "Bid" : "Ask"}
      </Typography>
      {levels.map((level, index) => (
        <Box
          key={`${side}-${index}`}
          sx={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: wash,
              width: `${(level.quantity / maxQuantity) * 100}%`,
              ...(side === "ask" ? { right: 0, left: "auto" } : {}),
              borderRadius: 1,
            }}
          />
          <Typography variant="numericSmall" sx={{ color: "text.secondary", zIndex: 1 }}>
            {level.quantity}
          </Typography>
          <Typography variant="numericSmall" sx={{ color: tone, zIndex: 1 }}>
            {formatAmount(brl(level.priceCents))}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

export interface OrderBookLadderProps {
  readonly ticker: string | null;
}

export function OrderBookLadder({ ticker }: OrderBookLadderProps) {
  const { data, isPending, isError } = useOrderBook(ticker);

  if (ticker === null) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Pick an instrument to see its depth.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (isPending) return <Skeleton variant="rounded" height={260} />;

  if (isError || data === undefined) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" sx={{ color: "warning.main" }}>
            Depth is unavailable for {ticker}.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const maxQuantity = Math.max(
    1,
    ...data.bids.map((level) => level.quantity),
    ...data.asks.map((level) => level.quantity),
  );

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">Depth · {data.ticker}</Typography>
          <Stack direction="row" spacing={4}>
            <Side levels={data.bids} side="bid" maxQuantity={maxQuantity} />
            <Side levels={data.asks} side="ask" maxQuantity={maxQuantity} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
