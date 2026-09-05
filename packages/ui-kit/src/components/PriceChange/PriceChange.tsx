import { Box, Typography } from "@mui/material";

export type Direction = "up" | "down" | "flat";

export interface PriceChangeProps {
  /** Percentage change, e.g. -1.24 for a 1.24% drop. */
  percent: number;
  /** Optional pre-formatted absolute change, e.g. "R$ 0,48". */
  absolute?: string;
  /** Compact variant for dense tables. */
  dense?: boolean;
}

const GLYPH: Record<Direction, string> = { up: "▲", down: "▼", flat: "—" };
const LABEL: Record<Direction, string> = { up: "up", down: "down", flat: "unchanged" };

export function directionOf(percent: number): Direction {
  if (percent > 0) return "up";
  if (percent < 0) return "down";
  return "flat";
}

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function PriceChange({ percent, absolute, dense = false }: PriceChangeProps) {
  const direction = directionOf(percent);
  const formatted = `${percentFormatter.format(percent)}%`;

  return (
    <Box
      component="span"
      role="img"
      aria-label={`${LABEL[direction]} ${formatted}${absolute ? `, ${absolute}` : ""}`}
      sx={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 1,
        color: `market.${direction}`,
      }}
    >
      <Box component="span" aria-hidden sx={{ fontSize: dense ? "0.65em" : "0.75em" }}>
        {GLYPH[direction]}
      </Box>
      <Typography variant={dense ? "numericSmall" : "numeric"} component="span">
        {formatted}
      </Typography>
      {absolute ? (
        <Typography
          variant="numericSmall"
          component="span"
          sx={{ color: "text.secondary" }}
        >
          {absolute}
        </Typography>
      ) : null}
    </Box>
  );
}
