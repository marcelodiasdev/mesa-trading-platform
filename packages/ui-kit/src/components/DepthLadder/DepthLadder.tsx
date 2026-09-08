import { Box, Stack, Typography } from "@mui/material";
import { brl, formatAmount } from "@mesa/money";

export interface DepthLevel {
  readonly priceCents: bigint;
  readonly quantity: number;
}

export interface DepthLadderProps {
  readonly bids: readonly DepthLevel[];
  readonly asks: readonly DepthLevel[];
  readonly highlightPriceCents?: bigint;
}

interface SideProps {
  readonly levels: readonly DepthLevel[];
  readonly side: "bid" | "ask";
  readonly maxQuantity: number;
  readonly highlightPriceCents: bigint | undefined;
}

function Side({ levels, side, maxQuantity, highlightPriceCents }: SideProps) {
  const tone = side === "bid" ? "market.up" : "market.down";
  const wash = side === "bid" ? "market.upSubtle" : "market.downSubtle";

  return (
    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {side === "bid" ? "Bid" : "Ask"}
      </Typography>

      {levels.length === 0 ? (
        <Typography variant="numericSmall" sx={{ color: "market.flat", px: 2 }}>
          —
        </Typography>
      ) : (
        levels.map((level, index) => (
          <Box
            key={`${side}-${index}`}
            sx={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              px: 2,
              py: 1,
              borderRadius: 1,
              ...(level.priceCents === highlightPriceCents
                ? { outline: "1px solid", outlineColor: tone }
                : {}),
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
            <Typography
              variant="numericSmall"
              sx={{ color: "text.secondary", zIndex: 1 }}
            >
              {level.quantity}
            </Typography>
            <Typography variant="numericSmall" sx={{ color: tone, zIndex: 1 }}>
              {formatAmount(brl(level.priceCents))}
            </Typography>
          </Box>
        ))
      )}
    </Stack>
  );
}

export function DepthLadder({ bids, asks, highlightPriceCents }: DepthLadderProps) {
  const maxQuantity = Math.max(
    1,
    ...bids.map((level) => level.quantity),
    ...asks.map((level) => level.quantity),
  );

  return (
    <Stack direction="row" spacing={4}>
      <Side
        levels={bids}
        side="bid"
        maxQuantity={maxQuantity}
        highlightPriceCents={highlightPriceCents}
      />
      <Side
        levels={asks}
        side="ask"
        maxQuantity={maxQuantity}
        highlightPriceCents={highlightPriceCents}
      />
    </Stack>
  );
}
