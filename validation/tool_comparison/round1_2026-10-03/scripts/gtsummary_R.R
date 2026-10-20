library(gtsummary); library(dplyr)
d <- read.csv("hf_comparison.csv") |> select(-time, -ef_group)
theme_gtsummary_journal(journal = "nejm")
d |> tbl_summary(by = DEATH_EVENT) |> add_p()

# C2 - NEJM
reset_gtsummary_theme()
theme_gtsummary_journal(journal = "nejm")
d |> tbl_summary(by = DEATH_EVENT) |> add_p()
# C2 - JAMA
reset_gtsummary_theme()
theme_gtsummary_journal(journal = "jama")
d |> tbl_summary(by = DEATH_EVENT) |> add_p()
# C2 - Lancet
reset_gtsummary_theme()
theme_gtsummary_journal(journal = "lancet")
d |> tbl_summary(by = DEATH_EVENT) |> add_p()
# C2 - QJEcon
reset_gtsummary_theme()
theme_gtsummary_journal(journal = "qjecon")
d |> tbl_summary(by = DEATH_EVENT) |> add_p()
# C4
dp <- read.csv("hf_guardrail_probe.csv") |> select(-time, -ef_group)
dp |> tbl_summary(by = DEATH_EVENT) |> add_p()
# C5
d3 <- read.csv("hf_comparison.csv") |> select(-time, -DEATH_EVENT)
d3 |> tbl_summary(by = ef_group) |> add_p()
# C7
d |> tbl_strata(strata = sex, .tbl_fun = ~ .x |> tbl_summary(by = DEATH_EVENT))
# C8
library(survey)
des <- svydesign(ids = ~1, weights = ~1, data = d)
tbl_svysummary(des, by = DEATH_EVENT)