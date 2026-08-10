"""
Prepare the UCI "Diabetes 130-US Hospitals for Years 1999-2008" dataset (UCI ID 296)
for use as EasyTableOne's guardrail-coverage validation dataset.

Source (authoritative):
  https://archive.ics.uci.edu/dataset/296/diabetes+130-us+hospitals+for+years+1999-2008
  Strack B, DeShazo JP, Gennings C, et al. Impact of HbA1c Measurement on Hospital
  Readmission Rates: Analysis of 70,000 Clinical Database Patient Records.
  BioMed Research International. 2014;2014:781670.

Inputs  : diabetic_data.csv, IDS_mapping.csv   (as downloaded from UCI, unmodified)
Outputs : diabetes130_clean.csv                (analysis file)
          diabetes130_dictionary.csv           (EasyTableOne data dictionary)

Every transformation below is mechanical and is listed in the manuscript's
supplementary methods. No value is imputed, recoded for convenience, or filtered
on the outcome.

Run:  python prepare_diabetes130.py
"""

from pathlib import Path
import pandas as pd

HERE = Path(__file__).parent
RAW = HERE / "diabetic_data.csv"
IDS = HERE / "IDS_mapping.csv"
OUT_DATA = HERE / "diabetes130_clean.csv"
OUT_DICT = HERE / "diabetes130_dictionary.csv"

# Discharge dispositions that make a readmission impossible (expired / hospice).
# Excluded following the source publication's rationale.
TERMINAL_DISPOSITIONS = {"11", "13", "14", "19", "20", "21"}

KEEP_MEDICATIONS = [
    "metformin", "insulin", "glipizide", "glyburide", "pioglitazone", "rosiglitazone",
    # Retained deliberately as data-quality test cases, not as clinical variables:
    "acetohexamide",   # 2 levels, one with n = 1  -> sparse contingency cell
    "examide",         # single level              -> constant column
    "citoglipton",     # single level              -> constant column
]

CONTINUOUS = [
    "time_in_hospital", "num_lab_procedures", "num_procedures", "num_medications",
    "number_outpatient", "number_emergency", "number_inpatient", "number_diagnoses",
]


def load_admission_type_map(path: Path) -> dict:
    """IDS_mapping.csv stacks three lookup tables in one file separated by blank rows.
    Read only the first block (admission_type_id)."""
    mapping = {}
    with path.open() as fh:
        next(fh)  # header: admission_type_id,description
        for line in fh:
            line = line.rstrip("\n")
            if not line.strip(" ,"):
                break
            code, _, desc = line.partition(",")
            if code.strip():
                mapping[code.strip()] = desc.strip()
    return mapping


def main() -> None:
    # Read everything as text so that "?" and "None" are preserved verbatim and
    # pandas' default NA handling cannot silently reinterpret them.
    df = pd.read_csv(RAW, dtype=str, keep_default_na=False, na_values=[])
    n_raw = len(df)

    # 1. One encounter per patient (the first), so that rows are independent.
    df = df.drop_duplicates("patient_nbr", keep="first")
    n_dedup = len(df)

    # 2. Drop encounters ending in death or hospice transfer.
    df = df[~df["discharge_disposition_id"].isin(TERMINAL_DISPOSITIONS)]
    n_final = len(df)

    # 3. "?" is this dataset's missing marker; EasyTableOne's sentinel list does not
    #    include it, so convert to empty. No other value is altered.
    df = df.replace("?", "")

    # 4. "None" in the two lab-result columns means "test not performed", which is a
    #    real category rather than a missing value. Make that explicit so it is not
    #    read as missingness.
    for col in ("max_glu_serum", "A1Cresult"):
        df[col] = df[col].replace("None", "Not measured")

    # 5. Label the admission-type codes from the repository's own lookup table.
    adm = load_admission_type_map(IDS)
    df["admission_type"] = df["admission_type_id"].map(adm).fillna("")
    df.loc[df["admission_type"].isin(["Not Available", "NULL", "Not Mapped"]), "admission_type"] = ""

    # 6. medical_specialty has 73 levels, which is unusable as a table row. Collapse to
    #    the five most frequent plus "Other". Missingness (~48%) is preserved exactly,
    #    which is the point of retaining this variable.
    spec = df["medical_specialty"]
    top5 = spec[spec != ""].value_counts().head(5).index
    df["medical_specialty_grouped"] = spec.where(spec.isin(top5) | (spec == ""), "Other")

    # 7. Binary outcome for the optional modeling run.
    df["readmitted_30d"] = (df["readmitted"] == "<30").map({True: "Yes", False: "No"})

    columns = (
        ["patient_nbr", "race", "gender", "age", "weight", "admission_type",
         "payer_code", "medical_specialty_grouped"]
        + CONTINUOUS
        + ["max_glu_serum", "A1Cresult"]
        + KEEP_MEDICATIONS
        + ["change", "diabetesMed", "readmitted", "readmitted_30d"]
    )
    out = df[columns]
    out.to_csv(OUT_DATA, index=False)

    # ---- Data dictionary -----------------------------------------------------
    rows = [
        ("patient_nbr", "Patient identifier", "", ""),
        ("race", "Race", "", ""),
        ("gender", "Sex", "", ""),
        ("age", "Age group", "years", ""),
        ("weight", "Body weight group", "kg", ""),
        ("admission_type", "Admission type", "", ""),
        ("payer_code", "Payer code", "", ""),
        ("medical_specialty_grouped", "Admitting physician specialty", "", ""),
        ("time_in_hospital", "Length of stay", "days", ""),
        ("num_lab_procedures", "Laboratory procedures during stay", "count", ""),
        ("num_procedures", "Non-laboratory procedures during stay", "count", ""),
        ("num_medications", "Distinct medications administered", "count", ""),
        ("number_outpatient", "Outpatient visits in prior year", "count", ""),
        ("number_emergency", "Emergency visits in prior year", "count", ""),
        ("number_inpatient", "Inpatient admissions in prior year", "count", ""),
        ("number_diagnoses", "Diagnoses recorded", "count", ""),
        ("max_glu_serum", "Glucose serum test result", "", ""),
        ("A1Cresult", "HbA1c test result", "", ""),
        ("metformin", "Metformin", "", ""),
        ("insulin", "Insulin", "", ""),
        ("glipizide", "Glipizide", "", ""),
        ("glyburide", "Glyburide", "", ""),
        ("pioglitazone", "Pioglitazone", "", ""),
        ("rosiglitazone", "Rosiglitazone", "", ""),
        ("acetohexamide", "Acetohexamide", "", ""),
        ("examide", "Examide", "", ""),
        ("citoglipton", "Citoglipton", "", ""),
        ("change", "Change in diabetic medication", "", "No: No change, Ch: Changed"),
        ("diabetesMed", "Any diabetic medication prescribed", "", ""),
        ("readmitted", "Readmission", "", ""),
        ("readmitted_30d", "Readmitted within 30 days", "", ""),
    ]
    pd.DataFrame(rows, columns=["variable", "label", "units", "coding"]).to_csv(OUT_DICT, index=False)

    # ---- Provenance report ---------------------------------------------------
    print(f"raw encounters            : {n_raw:,}")
    print(f"after one-per-patient     : {n_dedup:,}")
    print(f"after removing death/hospice: {n_final:,}")
    print(f"columns retained          : {len(columns)}")
    print()
    print("readmitted groups:")
    for k, v in out["readmitted"].value_counts().items():
        print(f"  {k:>4} : {v:,}")
    print()
    print("missingness (fraction):")
    miss = (out == "").mean().sort_values(ascending=False)
    for k, v in miss[miss > 0].items():
        flag = "  <- auto-excluded (>50%)" if v > 0.5 else ""
        print(f"  {k:<28} {v:.3f}{flag}")
    print()
    print(f"wrote {OUT_DATA.name} and {OUT_DICT.name}")


if __name__ == "__main__":
    main()
