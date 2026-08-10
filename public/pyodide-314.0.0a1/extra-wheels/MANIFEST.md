# Extra Wheels Manifest

| File | SHA-256 |
|---|---|
| `seaborn-0.13.2-py3-none-any.whl` | `636f8336facf092165e27924f223d3c62ca560b1f2bb5dff7ab7fad265361987` |
| `scikit_posthocs-0.14.0-py3-none-any.whl` | `9e2ecd5828cb783c42c1923e223eab202f529b03ab97de587647ab30f6e88333` |
| `tabulate-0.10.0-py3-none-any.whl` | `f0b0622e567335c8fabaaa659f1b33bcb6ddfe2e496071b743aa113f8774f2d3` |
| `firthlogist-0.5.0-py3-none-any.whl` | `9a38bf9ba18fa0e19991380d6518b796186af4209e5e349e9b42052e5d25ff62` |
| `tableone-0.9.6-py3-none-any.whl` | `e6b7b0f00d9f3b271b0d6aa38c636a18459994e72c744d7e0821004671760e1b` |

`tableone` is used **only by the golden cross-validation harness** (`tests/golden/`), never by the
application at runtime. It is vendored here so that the harness needs no network access, in line with the
offline-by-default rule in `agents.md`. Its declared dependencies `jinja2` and `openpyxl` are **not**
imported by any module in the package (verified against 0.9.6: only numpy, pandas, scipy, statsmodels and
tabulate are imported), so it must be installed with `deps=False`; `tabulate` is already vendored above.
