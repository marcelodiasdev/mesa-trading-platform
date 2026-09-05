# 0002 — Prefer mature versions over latest releases

## Status
Accepted

## Context
At the time of setup, the latest releases were Material UI 9, Storybook 10 and
Vite 8. Material UI 9 removed its dependency on Emotion and dropped several
deprecated APIs; Storybook 10 was published weeks earlier.

Choosing the newest release of every dependency maximises novelty but also
maximises risk: fewer answered questions, fewer compatible plugins, and a
smaller pool of engineers who have used it.

## Decision
Target the most recent *mature* major of each dependency rather than the newest:
Material UI 7.3.11, Storybook 9.1.20, Vite 7.3.6. React stays at 19, since the
concurrent features this project relies on are only available there.

Compatibility was verified against the declared peer ranges before installing.

## Consequences
We forgo Material UI 9's bundle size reduction and Storybook 10's newer
features. In exchange we get a toolchain with broad ecosystem support and a
larger body of documentation.

The underlying principle: dependency selection is a risk decision, not a
recency contest. Upgrades happen when there is a reason to upgrade, not because
a new number exists.
