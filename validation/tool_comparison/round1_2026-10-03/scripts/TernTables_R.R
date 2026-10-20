library(TernTables)
packageVersion("TernTables")
?ternG
library(TernTables)
d <- read.csv("hf_comparison.csv")
res <- ternG(data = d, exclude_vars = c("time", "ef_group"), group_var = "DEATH_EVENT",
             output_docx = "TernTables_R_main.docx")
res

# second run, treating the categorical columns as categories
fv <- c("anaemia","diabetes","high_blood_pressure","sex","smoking","DEATH_EVENT")
d[fv] <- lapply(d[fv], factor)
res_b <- ternG(data = d, exclude_vars = c("time", "ef_group"), group_var = "DEATH_EVENT",
               output_docx = "TernTables_R_main_factor.docx")
res_b

dp <- read.csv("hf_guardrail_probe.csv")
dp$rare_category <- factor(dp$rare_category)
res_c4 <- ternG(data = dp, exclude_vars = c("time", "ef_group"), group_var = "DEATH_EVENT",
                output_docx = "TernTables_R_probe.docx")
res_c4

d3 <- read.csv("hf_comparison.csv")
r_default <- ternG(data = d3, exclude_vars = c("time", "DEATH_EVENT"), group_var = "ef_group",
                   output_docx = "TernTables_R_3group.docx")
r_posthoc <- ternG(data = d3, exclude_vars = c("time", "DEATH_EVENT"), group_var = "ef_group",
                   post_hoc = TRUE, output_docx = "TernTables_R_3group_posthoc.docx")

res_c7 <- ternG(data = d, exclude_vars = c("time", "ef_group"),
                group_var = c("DEATH_EVENT", "sex"))