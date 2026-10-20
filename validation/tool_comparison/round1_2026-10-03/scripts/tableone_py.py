import pandas as pd
from tableone import TableOne
d = pd.read_csv("hf_comparison.csv").drop(columns=["time", "ef_group"])
cat = ["anaemia","diabetes","high_blood_pressure","sex","smoking"]
nn = ["age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"]
t = TableOne(d, categorical=cat, groupby="DEATH_EVENT", nonnormal=nn, pval=True, smd=True, htest_name=True)
print(t.tabulate(tablefmt="github"))
