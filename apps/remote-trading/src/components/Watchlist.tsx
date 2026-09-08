import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useInstruments } from "../market/instruments";
import { useFeedStatus } from "../market/hooks";
import { QuoteCell } from "./QuoteCell";

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 360;

const STATUS_LABEL = {
  connecting: { label: "connecting", color: "default" },
  live: { label: "live", color: "success" },
  degraded: { label: "feed degraded", color: "warning" },
} as const;

export interface WatchlistProps {
  readonly selected: string | null;
  readonly onSelect: (ticker: string) => void;
}

export function Watchlist({ selected, onSelect }: WatchlistProps) {
  const { data, isPending, isError } = useInstruments();
  const status = useFeedStatus();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const instruments = data ?? [];

  const virtualizer = useVirtualizer({
    count: instruments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (isPending) return <Skeleton variant="rounded" height={VIEWPORT_HEIGHT} />;
  if (isError)
    return <Alert severity="warning">The instrument list is unavailable.</Alert>;

  const badge = STATUS_LABEL[status];

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={3}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Watchlist
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={badge.color}
              label={badge.label}
            />
          </Stack>

          <Box
            ref={scrollRef}
            sx={{ height: VIEWPORT_HEIGHT, overflowY: "auto", overflowX: "hidden" }}
          >
            <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((row) => {
                const instrument = instruments[row.index];
                if (instrument === undefined) return null;

                const isSelected = instrument.ticker === selected;

                return (
                  <Box
                    key={instrument.ticker}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(instrument.ticker)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(instrument.ticker);
                      }
                    }}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 3,
                      cursor: "pointer",
                      borderRadius: 1,
                      bgcolor: isSelected ? "action.selected" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                      "&:focus-visible": {
                        outline: "2px solid",
                        outlineColor: "primary.main",
                      },
                    }}
                  >
                    <Stack spacing={0} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {instrument.ticker}
                      </Typography>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ color: "text.secondary", maxWidth: 180 }}
                      >
                        {instrument.name}
                      </Typography>
                    </Stack>
                    <QuoteCell ticker={instrument.ticker} />
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
