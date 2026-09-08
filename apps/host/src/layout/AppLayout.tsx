import {
  AppBar,
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { NavLink, Outlet } from "react-router";
import { useFlag } from "@mesa/shell-sdk";
import { KILL_SWITCH_ORDER_ENTRY } from "../store/slices/flags";
import { useAppSelector } from "../store/hooks";

const NAV_WIDTH = 240;

const NAV_ITEMS = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/trade", label: "Trade" },
] as const;

export function AppLayout() {
  const displayName = useAppSelector((state) => state.session.user?.displayName ?? "");
  const degraded = useAppSelector((state) => state.ui.degradedServices);
  const orderEntryEnabled = useFlag(KILL_SWITCH_ORDER_ENTRY);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense" sx={{ gap: 4 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
            Mesa
          </Typography>
          {!orderEntryEnabled ? (
            <Chip size="small" color="warning" label="Order entry disabled" />
          ) : null}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {displayName}
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: NAV_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar variant="dense" />
        <Divider />
        <List dense>
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.to} component={NavLink} to={item.to}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 4, minWidth: 0 }}>
        <Toolbar variant="dense" />
        <Stack spacing={3}>
          {degraded.length > 0 ? (
            <Alert severity="warning">
              Degraded: {degraded.join(", ")}. Showing the last known data.
            </Alert>
          ) : null}
          <Outlet />
        </Stack>
      </Box>
    </Box>
  );
}
