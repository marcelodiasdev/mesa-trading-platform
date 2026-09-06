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
    │  (state machine)  (double-entry)     (SSE quote feed)  │
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
| High-frequency state (quotes, order book) | External store + `useSyncExternalStore` | ~20 updates/sec would overwhelm a dispatch-based store |

What is *not* in Redux is as intentional as what is. See
[Engineering decisions](#engineering-decisions).

---

## Tech stack

| Concern | Choice |
|---|---|
| UI runtime | React 19 |
| Build / module federation | Vite + `@module-federation/vite` |
| Monorepo | pnpm workspaces + Turborepo |
| Design system | MUI v6 with a custom theme, documented in Storybook |
| Routing | React Router v7 (data router) |
| Server state | TanStack Query v5 |
| Shared client state | Redux Toolkit |
| Forms | React Hook Form + Zod |
| Charts | Lightweight Charts |
| Virtualization | TanStack Virtual |
| Mock services | Fastify |
| Testing | Vitest, Testing Library, MSW, Playwright, fast-check |

---

## Domain concepts modeled

These are the parts that make it a financial application rather than a themed
CRUD.

**Monetary precision.** All amounts are integer cents (`bigint`), never
floating point. Rounding mode is an explicit argument, because rounding is a
business decision: brokerage fees round up, exchange fees truncate. Allocation
of a value across parts never loses or creates a cent.

**Idempotency.** Every write carries an `Idempotency-Key` generated when the
form mounts, not when it is submitted. Replaying a request returns the original
result instead of creating a second order. Retries use exponential backoff and
are only applied to operations that are safe to repeat.

**Order state machine.** Orders move through an explicit, validated set of
transitions (`RECEIVED → VALIDATED → WORKING → PARTIALLY_FILLED → FILLED`, plus
terminal `CANCELLED`, `REJECTED`, `EXPIRED`). Illegal transitions throw. Every
transition is appended to an event log, which gives auditability for free.

**Double-entry ledger.** Balances are derived from immutable entries, never
stored as a mutable column. Every transaction's entries sum to zero, enforced
both in application code and by a database constraint. Corrections are reversing
entries, not updates.

**Settlement.** Trades settle on T+2 using an exchange business-day calendar.
The settlement job is idempotent: running it twice on the same day does not
settle twice.

**Pre-trade risk control.** Orders exceeding a configured share of account
equity are rejected before reaching the book.

**Operational safety.** A feature-flagged kill switch can disable order
submission and surface a degraded-state banner without a deploy. A correlation
ID is generated at the edge and propagated across all services.

---

## Engineering decisions

Short write-ups in `docs/decisions/`, each in the form *problem → decision →
trade-off accepted*. Highlights:

- **Why quotes bypass Redux.** The feed emits roughly 20 updates per second
  across 200 instruments. Routing that through dispatch would make Redux
  DevTools unusable and re-render every subscribed branch. Quotes live in an
  external store with per-ticker subscriptions and `requestAnimationFrame`
  batching, so a PETR4 tick never re-renders the VALE3 row. The trade-off is
  losing time-travel debugging in that subdomain — acceptable, because quotes
  are ephemeral and not part of auditable business logic.

- **Why micro-frontends are overkill here.** Module Federation pays for itself
  when the bottleneck is organizational — teams shipping on independent release
  cycles. At this scale, the cost of contract management, dependency
  versioning and distributed observability exceeds the benefit. It is
  implemented to demonstrate command of the technique *and its limits*.

- **Why response payloads are validated at the boundary.** Zod schemas in
  `packages/contracts` are shared between services and clients. When a service
  breaks its contract, the failure surfaces at the edge with a clear error
  rather than as `undefined` three components deep.

- **Why runtime type strictness is turned up.** `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `verbatimModuleSyntax` are enabled. They add
  friction while writing and remove a class of silent bugs that is unacceptable
  in a system that moves money.

---

## Repository layout

```
mesa/
├── apps/
│   ├── host/                 # shell: auth, routing, remote loading
│   ├── remote-trading/       # order ticket, book, chart
│   └── remote-portfolio/     # positions, statement, P&L
├── packages/
│   ├── ui-kit/               # MUI theme + shared components (Storybook)
│   ├── contracts/            # Zod schemas shared with services
│   ├── shell-sdk/            # host↔remote contract, HTTP client, store
│   └── money/                # integer-cent money type
├── services/
│   ├── accounts-service/     # ledger, balances, statement
│   ├── orders-service/       # order lifecycle, risk checks
│   └── market-service/       # simulated SSE quote feed
└── docs/
    └── decisions/            # architecture decision records
```

---

## Getting started

```bash
corepack enable
pnpm install
pnpm dev          # starts host, remotes and services
pnpm storybook    # design system docs
```

Requires Node 22+.

---

## Testing

```bash
pnpm test              # unit and component tests
pnpm test:contract     # service responses validated against shared schemas
pnpm test:e2e          # Playwright, including cross-remote flows
```

Notable coverage: property-based tests asserting the ledger always balances to
zero for any sequence of operations; a test proving double form submission
produces exactly one order; a test asserting no personal data reaches the logs.

---

## Roadmap

- [x] Monorepo foundation
- [x] Design system and Storybook
- [x] Integer-cent money type with property-based tests
- [x] Shared contracts and HTTP client
- [x] Accounts service with an immutable double-entry ledger
- [x] Fund reservations, so two orders cannot commit the same cash
- [x] Orders service with a state machine and pre-trade risk checks
- [ ] Market data service
- [ ] Host shell with routing and mocked auth
- [ ] Portfolio remote via Module Federation
- [ ] Order ticket with idempotent submission
- [ ] Live quote feed, order book, chart
- [ ] Shared Redux store with dynamic reducer injection
- [ ] Per-remote error boundaries and degraded states
- [ ] CI pipeline and deployment

---

## License

MIT
