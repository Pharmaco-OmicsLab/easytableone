# Browser benchmark summary

User-perceived timings include UI rendering and polling latency. Each cell is median (min–max) of completed stage measurements; failures are listed below.
Warm load navigates again in the same context after its first load, reusing that context’s HTTP cache.

## chromium 147.0.7727.15 — LenovoSlim

**Environment smoke only — not reference-laptop or paper results.**

Machine: AMD Ryzen 7 8845HS w/ Radeon 780M Graphics; 16 cores; 63 GiB RAM; win32 10.0.26200.

| Dataset | Records × variables | First load (download + start) | Baseline table (import → export) | Modeling, ridge (fast / thorough) | Peak WebAssembly memory |
| --- | ---: | ---: | ---: | ---: | ---: |
| Heart Failure | 299 × 12 | 19.3 (14.4–20.4) s | 1.2 (0.9–1.4) s | 76.7 (65.6–78.7) s / 512.1 (512.1–512.1) s | 225.2 (187.7–225.2) MB |
| Diabetes subsample | 20,000 × 19 | — | 28.5 (27–29.9) s | 634.4 (634.4–634.4) s / — | 356.8 (324.4–389.3) MB |
| Diabetes, full | — | — | — | — / — | — |
| Synthetic (resampled) | 150,000 × 19 | — | — | — | 187.7 (187.7–187.7) MB |
| Synthetic (resampled) | — | — | — | — | — |

WebAssembly linear memory is the headline memory measure. It grows but does not shrink, so its final size is its peak; Chromium JS heap is recorded separately in JSON and excludes worker memory. First-load transfer bytes and warm-load timings are in JSON.

Failures:
- Diabetes 20k, repetition 1: timeout at modelThorough — [2mexpect([22m[31mlocator[39m[2m).[22mtoBeEnabled[2m([22m[2m)[22m failed

Locator: getByRole('button', { name: 'Run logistic regression' })
Expected: enabled
Timeout: 1800000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeEnabled" with timeout 1800000ms[22m
[2m  - waiting for getByRole('button', { name: 'Run logistic regression' })[22m

- Diabetes 20k, repetition 2: error at modelFast — locator.click: Target page, context or browser has been closed
Call log:
[2m  - waiting for getByRole('button', { name: 'Clear all', exact: true })[22m

- Synthetic 150k, repetition 1: timeout at import — [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByTestId('schema-proceed')
Expected: visible
Timeout: 900000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 900000ms[22m
[2m  - waiting for getByTestId('schema-proceed')[22m


## firefox 148.0.2 — LenovoSlim

Machine: AMD Ryzen 7 8845HS w/ Radeon 780M Graphics; 16 cores; 63 GiB RAM; win32 10.0.26200.

| Dataset | Records × variables | First load (download + start) | Baseline table (import → export) | Modeling, ridge (fast / thorough) | Peak WebAssembly memory |
| --- | ---: | ---: | ---: | ---: | ---: |
| Heart Failure | — | — | — | — / — | — |
| Diabetes subsample | 20,000 × 19 | — | 144.9 (143.8–146.8) s | — / — | 324.4 (324.4–324.4) MB |
| Diabetes, full | 69,973 × 19 | — | 501.4 (498.7–537.5) s | — / — | 796.2 (187.7–796.4) MB |
| Synthetic (resampled) | — | — | — | — | — |
| Synthetic (resampled) | — | — | — | — | — |

WebAssembly linear memory is the headline memory measure. It grows but does not shrink, so its final size is its peak; Chromium JS heap is recorded separately in JSON and excludes worker memory. First-load transfer bytes and warm-load timings are in JSON.

Failures:
- Diabetes 20k, repetition 1: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 20k, repetition 2: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 20k, repetition 3: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 70k, repetition 1: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 70k, repetition 2: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 70k, repetition 3: error at modelFast — locator.selectOption: Error: strict mode violation: getByLabel('Event to model') resolved to 2 elements:
    1) <select class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('OutcomeChoose a two-group')
    2) <select aria-label="Event to model" class="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm">…</select> aka getByLabel('Event to model', { exact: true })

Call log:
[2m  - waiting for getByLabel('Event to model')[22m

- Diabetes 70k, repetition 4: error at statistics — [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByTestId('stats-continue-format-export')
Expected: visible
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 1200000ms[22m
[2m  - waiting for getByTestId('stats-continue-format-export')[22m
