import type * as React from "react";

export {};

type MarketPalette = {
  up: string;
  upSubtle: string;
  down: string;
  downSubtle: string;
  flat: string;
};

declare module "@mui/material/styles" {
  interface Palette {
    market: MarketPalette;
  }
  interface PaletteOptions {
    market?: MarketPalette;
  }
  interface TypographyVariants {
    numeric: React.CSSProperties;
    numericSmall: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    numeric?: React.CSSProperties;
    numericSmall?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    numeric: true;
    numericSmall: true;
  }
}
