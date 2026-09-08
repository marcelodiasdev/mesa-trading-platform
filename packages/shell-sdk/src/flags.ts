export const FLAGS = {
  orderEntry: "orderEntry.enabled",
  portfolioUnrealised: "portfolio.showUnrealised",
  bookDepth10: "book.depth10",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
