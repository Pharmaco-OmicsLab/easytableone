library(gtsummary); library(dplyr)
R.version.string; packageVersion("gtsummary")

d3 <- read.csv("hf_comparison.csv") |>
  select(-time, -DEATH_EVENT, -ejection_fraction)

pw <- function(data, variable, by, ...) {
  p <- pairwise.wilcox.test(data[[variable]], data[[by]], p.adjust.method = "holm")$p.value
  print(p)
  dplyr::tibble(p12 = p[1, 1], p13 = p[2, 1], p23 = p[2, 2])
}

d3 |> tbl_summary(by = ef_group, include = c(age, serum_creatinine)) |>
  add_stat(fns = all_continuous() ~ pw)