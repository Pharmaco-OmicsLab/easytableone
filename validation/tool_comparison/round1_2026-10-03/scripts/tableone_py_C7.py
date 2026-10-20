import pandas as pd
from tableone import TableOne
d = pd.read_csv("hf_comparison.csv").drop(columns=["time", "ef_group"])
cat = ["anaemia","diabetes","high_blood_pressure","smoking"]
t = TableOne(d, categorical=cat, groupby=["DEATH_EVENT", "sex"], pval=True)
print(t.tabulate(tablefmt="github"))