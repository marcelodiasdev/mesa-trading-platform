import type { Meta, StoryObj } from "@storybook/react-vite";
import { DepthLadder, type DepthLevel } from "./DepthLadder";

const ladder = (
  best: bigint,
  step: bigint,
  quantities: readonly number[],
  direction: 1n | -1n,
): DepthLevel[] =>
  quantities.map((quantity, index) => ({
    priceCents: best + direction * step * BigInt(index),
    quantity,
  }));

const bids = ladder(38_15n, 1n, [1600, 900, 2000, 1100, 1900], -1n);
const asks = ladder(38_17n, 1n, [700, 1200, 1700, 1100, 700], 1n);

const meta = {
  title: "Market/DepthLadder",
  component: DepthLadder,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The two sides of an order book. Bars are sized in proportion to the " +
          "quantity resting at each level and are marked aria-hidden, since the " +
          "figure beside them already carries the information. Purely " +
          "presentational: the caller decides where the levels come from.",
      },
    },
  },
  argTypes: {
    bids: { control: false },
    asks: { control: false },
    highlightPriceCents: { control: false },
  },
} satisfies Meta<typeof DepthLadder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FiveLevels: Story = {
  args: { bids, asks },
};

export const WideSpread: Story = {
  name: "Wide spread",
  args: {
    bids: ladder(37_00n, 25n, [400, 300, 200], -1n),
    asks: ladder(39_50n, 25n, [350, 250, 150], 1n),
  },
};

export const LopsidedBook: Story = {
  name: "Heavier on the bid",
  args: {
    bids: ladder(38_15n, 1n, [9000, 7500, 6000], -1n),
    asks: ladder(38_17n, 1n, [300, 200, 100], 1n),
  },
};

export const HighlightedLevel: Story = {
  name: "A level highlighted",
  args: { bids, asks, highlightPriceCents: 38_13n },
};

export const Empty: Story = {
  name: "No depth yet",
  args: { bids: [], asks: [] },
};

export const OneSideOnly: Story = {
  name: "Only one side quoted",
  args: { bids, asks: [] },
};
