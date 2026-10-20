library(compareGroups)
R.version.string; packageVersion("compareGroups")

d <- read.csv("hf_comparison.csv")
d$time <- NULL
d$ef_group <- NULL

res7 <- compareGroups(DEATH_EVENT ~ . - sex, data = d, method = NA)
strataTable(createTable(res7), "sex")