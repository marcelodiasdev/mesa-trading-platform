# Mesa

[![CI](https://github.com/marcelodiasdev/mesa-trading-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelodiasdev/mesa-trading-platform/actions/workflows/ci.yml)

A simulated brokerage trading platform, built to explore the front-end
patterns that financial software actually requires: monetary precision,
idempotent writes, composition across independently deployed modules, and a
UI that stays responsive under a high-frequency data feed.

Built with React 19, Module Federation, Redux Toolkit and MUI.

> **This is a learning and portfolio project.** It simulates market data and
> settlement. No real money, no real orders, no connection to any exchange.

---

## Why this project exists

Most front-end portfolio projects are CRUD applications with a theme. Financial
software is different in ways that are invisible from the outside but shape
almost every technical decision:

- A duplicated request is not a cosmetic bug — it is a duplicated order.
- A rounding error is not a display issue — it is money that does not exist.
- A trading screen receives more updates per second than a naive React tree can
  survive.
- A module failing to load cannot take the rest of the platform down with it.

Mesa models those constraints honestly, at a small scale, and documents the
reasoning behind each decision. Three mock services exist to give the front end
something real to talk to; the interesting work is in the browser.

---

## Architecture

A host shell owns authentication, routing and cross-cutting concerns. Two
remotes own their own domains and are loaded at runtime via Module Federation.

```
                    ┌─────────────────────────┐
                    │         host            │
                    │  auth · routing · flags │
                    │  Redux store · ErrorB.  │
                    └───────────┬─────────────┘
                                │  ShellContext (injected)
                 ┌──────────────┴───────────────┐
                 ▼                              ▼
    ┌────────────────────────┐    ┌────────────────────────┐
    │    remote-trading      │    │   remote-portfolio     │
    │  ticket · book · chart │    │  positions · statement │
    │  live quote feed       │    │  P&L · average price   │
    └───────────┬────────────┘    └───────────┬────────────┘
                │                             │
                ▼                             ▼
    ┌───────────────────────────────────────────────────────┐
    │  orders-service   accounts-service   market-service   │
    │  (state machine)  (double-entry)     (SSE quote feed) │
    └───────────────────────────────────────────────────────┘
```

Each remote runs standalone against a stub shell, so a module can be developed
without booting the platform. Three separate services, three base URLs:
composing one screen from several independently deployed services is the actual
day-to-day problem in this kind of system, and the client layer is designed
around it.

### State is deliberately split three ways

| Kind of state | Tool | Rationale |
|---|---|---|
| Server state (positions, orders, statement) | TanStack Query | caching, invalidation, refetch |
| Shared client state (session, flags, ticket draft) | Redux Toolkit | must cross the micro-frontend boundary |
| High-frequency state (quotes, order book, chart) | External store + `useSyncExternalStore` | a dispatch per tick would overwhelm the store and wake every subscriber |

What is *not* in Redux is as intentional as what is. See
[Engineering decisions](#engineering-decisions).

---

## Tech stack

| Concern | Choice |
|---|---|
| UI runtime | React 19 |
| Build / module federation | Vite 7 + `@module-federation/vite` |
| Monorepo | pnpm workspaces + Turborepo |
| Design system | MUI 7 with a custom theme, documented in Storybook 9 |
| Routing | React Router 7 |
| Server state | TanStack Query 5 |
| Shared client state | Redux Toolkit 2 |
| Forms | React Hook Form + Zod |
| Charting | Lightweight Charts 5 |
| Virtualisation | TanStack Virtual |
| Schema validation | Zod 4, shared between services and clients |
| Mock services | Fastify 5 on Node's built-in SQLite |
| Testing | Vitest, Testing Library, fast-check |

Dependency versions are chosen against the peer ranges declared by the
toolchain rather than against the `latest` tag — see
`docs/decisions/0002-dependency-version-strategy.md`.

---

## Front-end problems this project solves

**Surviving a high-frequency feed.** Quotes live in an external store where
each row subscribes to its own instrument, so a PETR4 tick never re-renders the
VALE3 row. Notifications are coalesced with `requestAnimationFrame`: a hundred
ticks between two frames cost a single pass over the subscribers. The chart goes
further and never re-renders at all — prices are written straight to the canvas.

**Composing modules at runtime.** Remotes receive everything they need through
an injected `ShellContext`: session, transport, feature flags, an event bus and
service URLs. They import nothing from the host, which is what lets each one run
standalone. Cross-remote communication happens through a typed event map and
through query-cache invalidation by prefix, never through a direct import.

**A Redux store that accepts slices it cannot know about.** Remotes are loaded
at runtime, so their reducers cannot exist at build time. The host store exposes
`injectReducer`, which rebuilds the root reducer while preserving existing
state, and types unknown slices honestly rather than lying with `any`.

**Failure that stays contained.** Each remote sits behind its own error
boundary with a retry. Killing a remote's dev server leaves the rest of the
platform working and shows a card instead of a blank page.

**Money in the UI.** Amounts are integer cents (`bigint`) end to end and only
become strings for display. The currency field stores cents and formats on the
way out, so the mask can never corrupt the value. Figures use tabular numerals
so columns stay aligned while prices update. A missing figure renders as a dash,
never as zero.

**Forms with rules that depend on each other.** The order ticket's cross-field
validation lives in a Zod schema rather than in the component: a limit order
requires a price, a stop order requires a trigger, a market order refuses one.
Nothing irreversible happens on a single click — the ticket validates, shows a
summary, and only then submits.

**Idempotent submission.** The ticket's idempotency key is generated when the
draft mounts, survives errors and retries, and is rotated only once the server
accepts. A replayed submission returns the original order instead of creating a
second one, and the UI says so.

**Errors the user can act on.** A rejection by pre-trade risk, an unreachable
service and a malformed payload are three different situations, and the ticket
says so differently: the first shows the figures involved, the second gives a
correlation ID and states that nothing was submitted, the third names the field.

**Accessibility as a build failure.** Storybook runs axe with violations set to
error rather than warning. Direction is encoded three ways — colour, arrow and
sign — because around 8% of men have some red-green colour vision deficiency.
Component tests query by role and accessible label, so an inaccessible change
breaks the suite.

---

## What the services do

They are a means to an end, but they are not toys.

**Accounts** keeps an immutable double-entry ledger. Balances are derived from
entries, never stored; every transaction's entries sum to zero; database
triggers refuse any `UPDATE` or `DELETE`. Accepting a buy order reserves the
funds — cash moves into a reserved sub-account, so two concurrent orders cannot
commit the same money. Trades book custody, brokerage and a settlement
obligation that clears two business days later on the B3 calendar.

**Orders** owns an order state machine with an append-only event log, and runs
pre-trade risk: buying power, position held, and a concentration limit in basis
points of equity. When the accounts service cannot be reached, the order is
rejected — unavailability never becomes permission.

**Market** generates quotes from a seeded random walk, so a run can be
reproduced exactly, and streams them over SSE with the tick clock running only
while somebody is listening.

---

## Engineering decisions

Short write-ups in `docs/decisions/`, each in the form *problem → decision →
trade-off accepted*. Highlights:

- **Why quotes bypass Redux.** Routing a feed through dispatch would make Redux
  DevTools unusable and wake every subscribed branch. Quotes live in an external
  store with per-ticker subscriptions and frame batching. The trade-off is
  losing time-travel debugging in that subdomain — acceptable, because quotes
  are ephemeral and not part of auditable business logic.

- **Why micro-frontends are overkill here.** Module Federation pays for itself
  when the bottleneck is organisational — teams shipping on independent release
  cycles. At this scale, the cost of contract management, dependency versioning
  and lost observability exceeds the benefit. It is implemented to demonstrate
  command of the technique *and its limits*.

- **What must be a singleton.** Anything carrying module identity or global
  state, including the monorepo's own packages: a second copy of the shell SDK
  means a second React context, and a provider that feeds nobody. Found the hard
  way, in runtime.

- **Why a retry needs permission.** The HTTP client retries reads freely, but
  retries a write only when an idempotency key makes the replay safe. Backoff
  carries full jitter, so a thousand clients failing together do not return
  together.

- **Why the quote generator is seeded.** `Math.random()` cannot be reproduced,
  which makes any test about price behaviour intermittent by construction.

- **Why runtime type strictness is turned up.** `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and
  `erasableSyntaxOnly` are enabled. They add friction while writing and remove a
  class of silent bug that is unacceptable in software that moves money.

---

## Repository layout

```
mesa/
├── apps/
│   ├── host/                 # shell: auth, routing, remote loading, store
│   ├── remote-trading/       # ticket, watchlist, depth, chart, quote feed
│   └── remote-portfolio/     # positions, orders, statement
├── packages/
│   ├── ui-kit/               # MUI theme + shared components (Storybook)
│   ├── contracts/            # Zod schemas shared with services
│   ├── shell-sdk/            # host↔remote contract, HTTP client, event bus
│   └── money/                # integer-cent money type
├── services/
│   ├── accounts-service/     # ledger, reservations, trades, settlement
│   ├── orders-service/       # order lifecycle, pre-trade risk
│   ├── market-service/       # seeded SSE quote feed
│   └── postman/              # importable collection for the HTTP APIs
└── docs/
    └── decisions/            # architecture decision records
```

---

## Getting started

```bash
corepack enable
pnpm install

pnpm dev:services   # accounts :4001 · orders :4002 · market :4003
pnpm dev:web        # host :5000 · remotes :5001 :5002
```

Requires Node 22 or newer. The accounts service opens a demo account with a
balance on boot, so `localhost:5000` has data on the first run — set
`SEED_DEMO=false` to start empty.

The design system runs on its own, and so does each remote:

```bash
pnpm --filter @mesa/ui-kit storybook          # :6006
pnpm --filter @mesa/remote-trading dev        # :5001, against a stub shell
```

### Seeing the failure modes

- Stop the trading remote and reload `/trade`: the shell stays up and offers a
  retry.
- Stop the market service: the watchlist keeps its last prices and marks the
  feed degraded.
- Submit an order for far more than the account holds: the ticket explains the
  shortfall in figures, and the balance never moves.

---

## Testing

```bash
pnpm test        # every package, in parallel, through Turborepo
pnpm typecheck   # strict TypeScript across the workspace
pnpm lint
```

Coverage worth pointing at:

- The order ticket rendered end to end: a kill switch that disables submission
  and says why, a confirmation dialog that refuses to open for an invalid
  ticket, a replayed submission reported as such, and three failure modes with
  distinct copy. Queried by role and accessible label throughout.
- Property-based tests asserting the ledger nets to zero for any sequence of
  operations, and that splitting a value across parts never loses a cent.
- A test proving a tick on one instrument never notifies a subscriber of
  another, and that a hundred ticks in one frame produce one notification.
- Tests that run raw `UPDATE` and `DELETE` against the ledger and expect them to
  fail, proving immutability is a property of the data rather than a convention.
- A test asserting a value survives past `Number.MAX_SAFE_INTEGER`, which is how
  a real precision bug in the SQLite read path was found.
- Accessibility checks run as errors in Storybook, not warnings.

---

## Roadmap

- [x] Monorepo foundation
- [x] Design system and Storybook
- [x] Integer-cent money type with property-based tests
- [x] Shared contracts and HTTP client
- [x] Accounts service with an immutable double-entry ledger
- [x] Fund reservations, so two orders cannot commit the same cash
- [x] Orders service with a state machine and pre-trade risk checks
- [x] Market data service with a deterministic quote engine and SSE feed
- [x] Host shell with routing and mocked auth
- [x] Shared Redux store with dynamic reducer injection
- [x] Per-remote error boundaries and degraded states
- [x] Portfolio remote via Module Federation
- [x] Order ticket with idempotent submission
- [x] Live quote feed with per-ticker subscriptions and order book
- [x] Seed endpoint, so a fresh clone starts with data
- [x] CI pipeline
- [x] Trade booking with T+2 settlement in the ledger
- [x] Component tests for the order ticket
- [x] Storybook coverage for the shared components
- [x] Live candlestick chart

Deliberately out of scope: this is a front-end portfolio project, so the
services stay a means to an end. Tax assessment, an execution engine and a
deployment pipeline would exercise skills the project is not trying to show.

---

## License

MIT
