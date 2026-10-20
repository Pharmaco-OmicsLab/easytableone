"""Build the two input files for the hands-on tool comparison (SoftwareX revision, R1.1).

Input : public/samples/heart_failure_clinical_records_dataset.csv (UCI, CC BY 4.0)
Output: hf_comparison.csv  - Heart Failure data + ef_group (3 groups, for the post-hoc criterion)
        hf_guardrail_probe.csv - hf_comparison + two deliberately problematic columns:
            serum_sodium_35pct_missing : serum_sodium with 35% of values removed (seed 20260929)
            rare_category              : 3-level category whose level "C" has only 3 patients
        Neither added column contains real information; they exist only to see whether each
        tool warns about missingness and sparse cells.
Run   : python make_comparison_datasets.py   (standard library only)
"""
import csv, random, pathlib
here = pathlib.Path(__file__).resolve().parent
root = here.parents[1]  # repo root (validation/tool_comparison/ -> repo)
src = root / "public" / "samples" / "heart_failure_clinical_records_dataset.csv"
rows = list(csv.DictReader(open(src, newline="")))
fields = list(rows[0].keys())

def ef_group(v):
    v = float(v)
    return "EF<30" if v < 30 else ("EF30-44" if v < 45 else "EF>=45")

for r in rows:
    r["ef_group"] = ef_group(r["ejection_fraction"])
with open(here / "hf_comparison.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields + ["ef_group"]); w.writeheader(); w.writerows(rows)

rng = random.Random(20260929)
n = len(rows)
miss = set(rng.sample(range(n), round(0.35 * n)))
rare_idx = rng.sample(range(n), 3 + 40)
for i, r in enumerate(rows):
    r["serum_sodium_35pct_missing"] = "" if i in miss else r["serum_sodium"]
    r["rare_category"] = "A"
for k, i in enumerate(rare_idx):
    rows[i]["rare_category"] = "C" if k < 3 else "B"
with open(here / "hf_guardrail_probe.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields + ["ef_group", "serum_sodium_35pct_missing", "rare_category"])
    w.writeheader(); w.writerows(rows)
print("wrote", n, "rows; missing:", len(miss), "; rare C:", 3)
