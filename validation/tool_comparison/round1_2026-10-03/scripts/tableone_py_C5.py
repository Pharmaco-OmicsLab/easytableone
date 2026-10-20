import pandas as pd
from tableone import TableOne

d = pd.read_csv("hf_comparison.csv").drop(columns=["time"])
cat = ["anaemia", "diabetes", "high_blood_pressure", "sex", "smoking"]

t = TableOne(d, categorical=cat, groupby="ef_group", pval=True)
print(t.tabulate(tablefmt="github"))