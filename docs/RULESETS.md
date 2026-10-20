This document explains the versioned journal-formatting ruleset contract.
It describes release v3.41 (Phase 51 Round 3 Part B).

# Journal rulesets

The source of truth is `src/core/format/journal_rulesets.json`, validated by `JournalRulesetSchema` in `src/core/types/index.ts`. The top-level object contains `version` (ruleset revision), `changelog` (human-readable revision history), `global_defaults` (shared missing-data and statistical-selection policy), `journals` (per-journal entries), and `logic_mapping` (declarative test-selection rules).

| Journal field | Meaning |
|---|---|
| `journal_id`, `display_name` | Stable identifier and user-facing name. |
| `missing_data_label` | Text used for missing-data rows. |
| `table_title_template` | Table title with a `{grouping_label}` replacement. |
| `variable_coding_section_title`, `data_quality_section_title` | Section names; nullable section names suppress that section. |
| `number_format` | Thousands separator, trailing-zero suppression, and base decimal precision. |
| `p_value_formatting` | Leading zero, decimal precision/ranges, low-p threshold, optional significant figures and decimal separator, plus P italics. |
| `summary_statistics` | Continuous/categorical labels, IQR delimiter, percentage precision, and optional denominator-based `percentage_decimals_rule`. |
| `table_styling` | Bold headers, subgroup indentation, spacing, and footnote marker sequence. |
| `plot_theme` | Plot palette, fonts, line widths, and screen/export DPI. |
| `provenance` | Source title/URL, retrieval/review dates, and notes distinguishing stated rules from house convention. GENERIC has no journal source, so its URL and retrieval date are null. |
| `review_policy` | Review cadence, pre-release review trigger, and discrepancy reporting route. |

`summary_statistics.percentage_decimals_rule` optionally chooses decimals when a column denominator is below `below_n`. Ruleset 1.7 includes per-journal provenance and a top-level `review_policy`; neither changes rendered formatting.

The UI allows selected presentation overrides such as number precision, trailing-zero behavior, IQR delimiter, p-value threshold/significant digits, title, and display options. Active overrides appear in the reproducibility record as `userOverrides` entries with the default, override value, and timestamp.

## Add or update a journal

1. Edit the journal entry in the JSON source and keep it within the Zod schema.
2. Increment the ruleset version and prepend a changelog entry describing the exact change.
3. Run focused format tests and snapshots, then inspect every changed cell and export path.
4. Run the statistical golden gate if the change could affect computed values; formatting-only changes must not change calculations.

The application does not offer unversioned custom journal styles. A named, versioned ruleset makes the formatting choice reproducible in exports.
