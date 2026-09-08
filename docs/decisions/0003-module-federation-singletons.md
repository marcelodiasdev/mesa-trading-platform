# 0006 — What must be a singleton in Module Federation

## Status
Accepted

## Context
The trading remote failed at runtime with `useShell must be used inside a
ShellProvider`, even though the host renders that provider above the remote.
The cause was that `@mesa/shell-sdk` was not declared as shared, so the host
and the remote each loaded their own copy. Two copies mean two calls to
`createContext`, two distinct contexts, and a consumer reading the one nobody
filled.

The initial `shared` list only covered third-party runtime libraries — React,
Redux, MUI, Emotion — because those are the ones every tutorial mentions.

## Decision
Anything that carries module identity or global state is declared
`singleton: true`, including the monorepo's own packages. The list is:

- `react`, `react-dom` — two runtimes break hooks
- `react-redux`, `@reduxjs/toolkit` — two stores do not talk to each other
- `@mui/material`, `@emotion/react`, `@emotion/styled` — two theme providers,
  duplicated CSS with unpredictable specificity
- `@tanstack/react-query` — the host owns the QueryClient, and cross-remote
  cache invalidation by prefix only works against a shared instance
- `@mesa/shell-sdk` — it *is* a React context
- `@mesa/ui-kit` — it owns the theme instance

A package is only listed as shared where it is also a real dependency;
declaring one that is absent fails the build.

## Consequences
The `shared` list is now a maintenance surface: adding a context or a global
store to a shared package means revisiting three Vite configs. That is a real
cost of runtime composition, and part of why ADR-0003 records that
micro-frontends are overkill at this scale.

The rule to carry forward: the question is not "is this a well-known library",
it is "would two copies of this disagree with each other".
