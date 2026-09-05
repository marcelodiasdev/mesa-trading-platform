import { createTheme } from "@mui/material/styles";
import { brand, fontStacks, marketColors, surfaces } from "./tokens";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: brand.main, dark: brand.dark, light: brand.light },
    background: { default: surfaces.canvas, paper: surfaces.raised },
    divider: surfaces.border,
    market: { ...marketColors },
  },
  shape: { borderRadius: 6 },
  spacing: 4,
  typography: {
    fontFamily: fontStacks.ui,
    numeric: {
      fontFamily: fontStacks.numeric,
      fontVariantNumeric: "tabular-nums",
      fontSize: "0.875rem",
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    numericSmall: {
      fontFamily: fontStacks.numeric,
      fontVariantNumeric: "tabular-nums",
      fontSize: "0.75rem",
      lineHeight: 1.4,
      letterSpacing: 0,
    },
  },
  components: {
    MuiTypography: {
      defaultProps: {
        variantMapping: { numeric: "span", numericSmall: "span" },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": { height: "100%" },
        body: { fontVariantNumeric: "tabular-nums" },
      },
    },
  },
});

export { marketColors, surfaces, brand, fontStacks } from "./tokens";
