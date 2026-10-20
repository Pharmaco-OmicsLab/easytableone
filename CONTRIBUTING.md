This document sets expectations for contributions to EasyTableOne.
It describes release v3.40 (Phase 51 Round 3 Part A).

# Contributing

Open an issue for defects or proposed behavior changes and include a minimal reproduction when possible. Pull requests should explain the user-visible effect, include focused tests, and report verification results.

`src/core/format/journal_rulesets.json` is the single source of truth for journal formatting. Do not add journal-specific branches in formatters. See [the ruleset guide](docs/RULESETS.md) before adding a journal.

The golden harness is a release gate: no pull request may move 814 comparable records, 53 non-comparable records, or maximum absolute difference 0.0005 without explicit statistical justification and review. Changes to statistical thresholds must also update [the statistical reference](docs/STATISTICAL_REFERENCE.md).

Follow repository Biome rules (`pnpm lint`). Keep changes scoped, add regression tests, and document meaningful behavior changes.
