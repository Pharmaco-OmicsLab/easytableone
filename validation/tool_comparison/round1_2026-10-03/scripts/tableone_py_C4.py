import pandas as pd
from tableone import TableOne

d = pd.read_csv("hf_guardrail_probe.csv").drop(columns=["time", "ef_group"])
cat = ["anaemia", "diabetes", "high_blood_pressure", "sex", "smoking", "rare_category"]
nn = ["age", "creatinine_phosphokinase", "ejection_fraction", "platelets", "serum_creatinine", "serum_sodium"]

t = TableOne(
    d, categorical=cat, groupby="DEATH_EVENT", nonnormal=nn,
    pval=True, smd=True, htest_name=True,
    dip_test=True, normal_test=True, tukey_test=True
)
print(t.tabulate(tablefmt="github"))

t2 = TableOne(
    d, categorical=cat, groupby="DEATH_EVENT",
    pval=True, pval_adjust="bonferroni"
)
print(t2.tabulate(tablefmt="github"))