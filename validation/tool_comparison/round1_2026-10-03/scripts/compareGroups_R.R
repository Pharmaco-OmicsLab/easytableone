library(compareGroups)
d <- read.csv("hf_comparison.csv"); d$time <- NULL; d$ef_group <- NULL
res <- compareGroups(DEATH_EVENT ~ ., data = d, method = NA)  # method = NA: normality decided by Shapiro-Wilk
createTable(res, show.p.overall = TRUE)
# C4
dp <- read.csv("hf_guardrail_probe.csv")
dp$time <- NULL
dp$ef_group <- NULL
dp$rare_category <- factor(dp$rare_category)

res2 <- compareGroups(DEATH_EVENT ~ ., data = dp, method = NA)
createTable(res2)
createTable(res2, show.n = TRUE)
# C5
d2 <- read.csv("hf_comparison.csv")
d2$time <- NULL

res3 <- compareGroups(ef_group ~ ., data = d2)
createTable(res3, show.p.mul = TRUE)
# C7
strataTable(createTable(res), "sex")