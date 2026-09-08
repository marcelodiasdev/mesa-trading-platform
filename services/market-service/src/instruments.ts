export interface Instrument {
  readonly ticker: string;
  readonly name: string;
  readonly openingPriceCents: bigint;
  readonly tickSizeCents: bigint;
}

export const INSTRUMENTS: readonly Instrument[] = [
  { ticker: "PETR4", name: "Petrobras PN", openingPriceCents: 38_50n, tickSizeCents: 1n },
  { ticker: "VALE3", name: "Vale ON", openingPriceCents: 61_20n, tickSizeCents: 1n },
  {
    ticker: "ITUB4",
    name: "Itaú Unibanco PN",
    openingPriceCents: 33_75n,
    tickSizeCents: 1n,
  },
  { ticker: "BBDC4", name: "Bradesco PN", openingPriceCents: 14_08n, tickSizeCents: 1n },
  {
    ticker: "BBAS3",
    name: "Banco do Brasil ON",
    openingPriceCents: 27_44n,
    tickSizeCents: 1n,
  },
  { ticker: "ABEV3", name: "Ambev ON", openingPriceCents: 12_91n, tickSizeCents: 1n },
  { ticker: "B3SA3", name: "B3 ON", openingPriceCents: 11_36n, tickSizeCents: 1n },
  { ticker: "WEGE3", name: "WEG ON", openingPriceCents: 52_18n, tickSizeCents: 1n },
  {
    ticker: "MGLU3",
    name: "Magazine Luiza ON",
    openingPriceCents: 8_74n,
    tickSizeCents: 1n,
  },
  { ticker: "SUZB3", name: "Suzano ON", openingPriceCents: 54_02n, tickSizeCents: 1n },
  { ticker: "RENT3", name: "Localiza ON", openingPriceCents: 41_63n, tickSizeCents: 1n },
  { ticker: "PRIO3", name: "PetroRio ON", openingPriceCents: 44_29n, tickSizeCents: 1n },
  {
    ticker: "BOVA11",
    name: "iShares Ibovespa",
    openingPriceCents: 128_40n,
    tickSizeCents: 1n,
  },
  {
    ticker: "IVVB11",
    name: "iShares S&P 500",
    openingPriceCents: 342_15n,
    tickSizeCents: 1n,
  },
  {
    ticker: "SMAL11",
    name: "iShares Small Cap",
    openingPriceCents: 98_77n,
    tickSizeCents: 1n,
  },
];

export const INSTRUMENTS_BY_TICKER: ReadonlyMap<string, Instrument> = new Map(
  INSTRUMENTS.map((instrument) => [instrument.ticker, instrument]),
);
