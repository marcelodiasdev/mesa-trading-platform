# 0001 — Pin TypeScript to the 5.x line

## Status
Accepted

## Context
TypeScript 7.0.2 is the current `latest` tag on npm. However, `typescript-eslint`
8.69.0 — the only released line at the time of writing — declares a peer
dependency range of `>=4.8.4 <6.1.0`. Installing the latest TypeScript produces
an unmet peer dependency warning and an unsupported linting setup.

## Decision
Pin TypeScript to 5.9.3, the latest stable release of the 5.x line, until the
linting toolchain declares support for TypeScript 7.

## Consequences
We forgo the newer compiler's performance improvements in exchange for a
supported, working lint pipeline. This should be revisited once
`typescript-eslint` publishes a release with an updated peer range.

More broadly, this establishes a convention for the project: dependency versions
are chosen against the peer ranges declared by the toolchain, not against the
`latest` tag. Unmet peer warnings are treated as errors, not noise.
