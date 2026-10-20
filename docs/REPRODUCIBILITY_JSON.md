This document describes the reproducibility JSON export and privacy boundary.
It describes release v3.41 (Phase 51 Round 3 Part B).

# Reproducibility JSON

The record is aggregate-only: it includes analysis metadata and summary results, not source rows or patient-level arrays. `outlierActions[].rowIndex` is retained to identify which source row an acknowledged action applies to; the index contains no patient value.

This is the complete list of top-level keys that may be emitted. Conditional keys appear only when their corresponding option or result exists.

```text
aggregateOnlyNotice
appVersion
rulesetVersion
rulesetProvenance
libraryVersions
analysisPlan
schema
results
formattedTable
generatedAt
dataQualityWarnings
userOverrides (optional)
inputDataHash (optional)
testOverrides (optional)
modeling (optional)
```

| Key | JSON type | Presence | Contents |
|---|---|---|---|
| `aggregateOnlyNotice` | string | required | Privacy statement describing the aggregate-only contract. |
| `appVersion` | string | required | Application release identifier. |
| `rulesetVersion` | string | required | Journal formatting ruleset version used for this table. |
| `rulesetProvenance` | object | required | Source, retrieval/review dates and notes for the selected journal's formatting guidance. |
| `libraryVersions` | object of strings | required | Runtime library version map. |
| `analysisPlan` | object | required | Analysis choices, overrides and audit log. |
| `schema` | object | required | Column names, types, labels and coding; no observations. |
| `results` | object | required | Aggregate statistical summaries and tests. |
| `formattedTable` | object | required | The rendered table model and methods text. |
| `generatedAt` | string | required | ISO timestamp for the record. |
| `dataQualityWarnings` | array | required | Aggregate quality findings and user responses. |
| `userOverrides` | array | optional | Formatting overrides with default, value and timestamp. |
| `inputDataHash` | string | optional | Opt-in hash of the source file; never the file contents. |
| `testOverrides` | array | optional | User-selected test methods and their rationale metadata. |
| `modeling` | object | optional | Aggregate logistic/ML fit, validation, and decision-curve summaries. |

The schema describes columns and coding, not observations. `outlierActions[].rowIndex` is retained to match a user's reviewed action to the original file; it contains no source value.

```json
{
  "aggregateOnlyNotice": "Aggregate summaries only; no row-level observations are included.",
  "appVersion": "3.40.0",
  "rulesetVersion": "1.7",
  "rulesetProvenance": { "source_title": "NEJM Author Center — New Manuscripts: Statistical Reporting Guidelines (A.1.g)", "source_url": "https://www.nejm.org/author-center/new-manuscripts", "retrieved_on": "2026-10-09", "last_reviewed_on": "2026-10-09", "notes": "…" },
  "libraryVersions": { "numpy": "…", "scipy": "…" },
  "analysisPlan": {},
  "schema": {},
  "results": {},
  "formattedTable": {},
  "generatedAt": "2026-10-11T00:00:00.000Z",
  "dataQualityWarnings": []
}
```
