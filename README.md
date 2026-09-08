# Mesa

A simulated brokerage trading platform, built to explore the engineering
patterns that financial systems actually require: monetary precision,
idempotent writes, explicit order state machines, immutable ledgers, and
front-end resilience under high-frequency data.

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
- A balance cannot be a mutable column, because balances must be auditable and
  reversible.
- A trading screen receives more updates per second than a naive React tree can
  survive.

Mesa is an attempt to model those constraints honestly, at a small scale, and to
document the reasoning behind each decision.

---

## Architecture

Mesa is a micro-frontend composition. A host shell owns authentication,
routing and cross-cutting concerns; two independently built remotes own their
own domains and are loaded at runtime via Module Federation.

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
    │  order ticket · book   │    │  positions · statement │
    │  chart · live quotes   │    │  P&L · average price   │
    └───────────┬────────────┘    └───────────┬────────────┘
                │                             │
                ▼                             ▼
    ┌───────────────────────────────────────────────────────┐
    │  orders-service   accounts-service   market-service   │
    │  (state machine)  (double-entry)     (SSE quote feed) │
    └───────────────────────────────────────────────────────┘
```

Three separate services, three base URLs. Composing a single screen from
multiple independently deployed services is the actual day-to-day problem in a
microservice environment, and the client layer is designed around it.

### State is deliberately split three ways

| Kind of state | Tool | Rationale |
|---|---|---|
| Server state (positions, orders, statement) | TanStack Query | caching, invalidation, refetch |
| Shared client state (session, flags, ticket draft) | Redux Toolkit | must cross the micro-frontend boundary |
| High-frequency state (quotes, order book) | External store + `useSyncExternalStore` | a dispatch per tick would overwhelm the store and re-render every subscriber |

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
| Schema validation | Zod 4, shared between services and clients |
| Mock services | Fastify 5 on Node's built-in SQLite |
| Testing | Vitest, fast-check |

Dependency versions are chosen against the peer ranges declared by the
toolchain rather than against the `latest` tag — see
`docs/decisions/0002-dependency-version-strategy.md`.

---

## Domain concepts modeled

These are the parts that make it a financial application rather than a themed
CRUD.

**Monetary precision.** All amounts are integer cents (`bigint`), never
floating point. Rounding mode is an explicit argument, because rounding is a
business decision: brokerage fees round up, exchange fees truncate. Allocating a
value across parts never loses or creates a cent. Amounts cross the wire as
decimal strings, because a JSON number silently rounds past 2^53 — and SQLite is
told to read integers back as `BigInt` for the same reason.

**Idempotency.** Every write requires an `Idempotency-Key`; a request without
one is refused rather than accepted and later replayed ambiguously. Replaying a
key returns the original result — same transaction id, same timestamp, no second
movement of money. The key a service derives for its downstream call is
deterministic, so idempotency survives the hop between services.

**Order state machine.** Orders move through an explicit, validated set of
transitions (`RECEIVED → VALIDATED → WORKING → PARTIALLY_FILLED → FILLED`, plus
terminal `CANCELLED`, `REJECTED`, `EXPIRED`). Illegal transitions throw. Every
transition is appended to an immutable event log with its reason, so a rejected
order is a recorded fact rather than a discarded error.

**Double-entry ledger.** Balances are derived from immutable entries, never
stored as a mutable column. Every transaction's entries sum to zero, checked in
application code; database triggers refuse any `UPDATE` or `DELETE` on an entry.
Corrections are reversing transactions, so the statement shows both what
happened and what undid it.

**Fund reservations.** Accepting a buy order moves cash from the customer's cash
sub-account into a reserved one. Total equity does not change; buying power
does. This is the same mechanic as a card authorisation, and it is what stops
two concurrent orders from committing the same cash.

**Pre-trade risk control.** Before an order reaches the book it is checked
against buying power, against the position actually held (no naked shorts), and
against a concentration limit expressed in basis points of equity. A market
order's notional is padded for slippage so the reservation is never short.

**Failing closed.** When the accounts service cannot be reached, the order is
rejected with `503` — never accepted on the assumption that the customer has
money. Unavailability does not become permission.

**Operational safety.** A feature-flagged kill switch disables order entry and
surfaces a banner without a deploy. A correlation ID is generated at the edge,
echoed by every service, and attached to every error the client raises.

---

## Engineering decisions

Short write-ups in `docs/decisions/`, each in the form *problem → decision →
trade-off accepted*. Highlights:

- **Why quotes bypass Redux.** The feed emits many updates per second across
  every instrument on the board. Routing that through dispatch would make Redux
  DevTools unusable and re-render every subscribed branch. Quotes live in an
  external store with per-ticker subscriptions and `requestAnimationFrame`
  batching, so a PETR4 tick never re-renders the VALE3 row. The trade-off is
  losing time-travel debugging in that subdomain — acceptable, because quotes
  are ephemeral and not part of auditable business logic.

- **Why micro-frontends are overkill here.** Module Federation pays for itself
  when the bottleneck is organizational — teams shipping on independent release
  cycles. At this scale, the cost of contract management, dependency versioning
  and distributed observability exceeds the benefit. It is implemented to
  demonstrate command of the technique *and its limits*.

- **Why the store accepts reducers it does not know about.** Remotes are loaded
  at runtime, so their slices cannot exist at build time. The host store exposes
  `injectReducer`, which rebuilds the root reducer while preserving existing
  state, and types unknown slices honestly rather than lying with `any`.

- **Why response payloads are validated at the boundary.** Zod schemas in
  `packages/contracts` are shared between services and clients. When a service
  breaks its contract, the failure surfaces at the edge naming the offending
  field, rather than as `undefined` three components deep.

- **Why a retry needs permission.** The HTTP client retries reads freely, but
  retries a write only when an idempotency key makes the replay safe. Backoff
  carries full jitter, so a thousand clients failing together do not return
  together.

- **Why the quote generator is seeded.** `Math.random()` cannot be reproduced,
  which makes any test about price behaviour intermittent by construction. A
  seeded generator lets the suite assert properties over hundreds of ticks and
  lets a failing case be replayed exactly.

- **Why runtime type strictness is turned up.** `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and
  `erasableSyntaxOnly` are enabled. They add friction while writing and remove a
  class of silent bugs that is unacceptable in a system that moves money — the
  `override` rule alone caught two real shadowing bugs during development.

---

## Repository layout

```
mesa/
├── apps/
│   ├── host/                 # shell: auth, routing, remote loading, store
│   ├── remote-trading/       # order ticket, book, chart
│   └── remote-portfolio/     # positions, statement, P&L
├── packages/
│   ├── ui-kit/               # MUI theme + shared components (Storybook)
│   ├── contracts/            # Zod schemas shared with services
│   ├── shell-sdk/            # host↔remote contract, HTTP client, event bus
│   └── money/                # integer-cent money type
├── services/
│   ├── accounts-service/     # ledger, balances, reservations, statement
│   ├── orders-service/       # order lifecycle, pre-trade risk
│   ├── market-service/       # simulated SSE quote feed
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

Requires Node 22 or newer. The design system runs on its own:

```bash
pnpm --filter @mesa/ui-kit storybook
```

### Seeing it work without a browser

```bash
# fund an account
curl -X POST localhost:4001/accounts/acc-1/deposits \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: dep-1' \
  -d '{"amountCents":"6000000"}'

# place a buy order — reserves the notional on the accounts service
curl -X POST localhost:4002/orders \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: ord-1' \
  -d '{"accountId":"acc-1","ticker":"PETR4","side":"BUY","type":"LIMIT",
       "quantity":100,"limitPriceCents":"3850","referencePriceCents":"3850"}'

# buying power fell, equity did not
curl localhost:4001/accounts/acc-1/balance

# the order's full trajectory, with a reason on every transition
curl localhost:4002/orders/<ORDER_ID>/events

# live quotes
curl -N 'localhost:4003/stream?tickers=PETR4,VALE3'
```

Replaying either write with the same `Idempotency-Key` returns `200` with the
original result instead of `201` — the money moves once.

---

## Testing

```bash
pnpm test        # every package, in parallel, through Turborepo
pnpm typecheck   # strict TypeScript across the workspace
pnpm lint
```

Coverage worth pointing at:

- Property-based tests asserting the ledger nets to zero for any sequence of
  operations, and that splitting a value across parts never loses a cent.
- A test proving a replayed order submission reserves funds exactly once, by
  spying on the downstream call.
- A test proving an order rejected by pre-trade risk never touches the
  customer's cash.
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
- [x] CI pipeline
- [ ] Seed endpoint, so a fresh clone starts with data
- [ ] Price chart
- [ ] T+2 settlement and a reconciliation job
- [ ] Tax reporting: average price, realised P&L, monthly assessment
- [ ] Component and end-to-end tests
- [ ] Deployment
---

## License

MIT
