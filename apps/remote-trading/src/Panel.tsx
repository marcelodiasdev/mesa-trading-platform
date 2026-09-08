import { useEffect, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useBus } from "@mesa/shell-sdk";
import { MarketProvider } from "./market/MarketProvider";
import { Watchlist } from "./components/Watchlist";
import { OrderBookLadder } from "./components/OrderBookLadder";
import { OrderTicket } from "./ticket/OrderTicket";

function TradingDesk() {
  const [selected, setSelected] = useState<string | null>(null);
  const bus = useBus();

  useEffect(() => bus.on("ticket:open", ({ ticker }) => setSelected(ticker)), [bus]);

  return (
    <Stack direction={{ xs: "column", lg: "row" }} spacing={4} alignItems="flex-start">
      <Box sx={{ width: { xs: "100%", lg: 320 }, flexShrink: 0 }}>
        <Watchlist selected={selected} onSelect={setSelected} />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%" }}>
        <OrderBookLadder ticker={selected} />
      </Box>
      <Box sx={{ width: { xs: "100%", lg: 340 }, flexShrink: 0 }}>
        <OrderTicket ticker={selected} />
      </Box>
    </Stack>
  );
}

export default function Panel() {
  return (
    <MarketProvider>
      <TradingDesk />
    </MarketProvider>
  );
}
