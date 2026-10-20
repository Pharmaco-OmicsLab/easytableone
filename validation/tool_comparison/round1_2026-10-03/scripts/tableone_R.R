library(tableone)
d <- read.csv("hf_comparison.csv")
fv <- c("anaemia","diabetes","high_blood_pressure","sex","smoking")
vars <- setdiff(names(d), c("time","DEATH_EVENT","ef_group"))
t1 <- CreateTableOne(vars = vars, strata = "DEATH_EVENT", data = d, factorVars = fv)
print(t1, nonnormal = c("age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"), smd = TRUE)
#C4
dp <- read.csv("hf_guardrail_probe.csv")
dp$rare_category <- factor(dp$rare_category)
vars2 <- c(setdiff(names(dp), c("time","DEATH_EVENT","ef_group")))
fv2 <- c("anaemia","diabetes","high_blood_pressure","sex","smoking","rare_category")
t2 <- CreateTableOne(vars = vars2, strata = "DEATH_EVENT", data = dp, factorVars = fv2)
print(t2, nonnormal = c("age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"), smd = TRUE)
warnings()
summary(t2)
#C5
t3 <- CreateTableOne(vars = vars, strata = "ef_group", data = d, factorVars = fv)
print(t3, nonnormal = c("age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"))
#C7
t4 <- CreateTableOne(vars = setdiff(vars, "sex"), strata = c("DEATH_EVENT","sex"), data = d,
                     factorVars = setdiff(fv, "sex"))
print(t4)
#C8
library(survey)
des <- svydesign(ids = ~1, weights = ~1, data = d)
t5 <- svyCreateTableOne(vars = vars, strata = "DEATH_EVENT", data = des, factorVars = fv)
print(t5)