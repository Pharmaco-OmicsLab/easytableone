# EasyTableOne Phase 51 R4 cross-validation
# Pinned runtime: R 4.6.0, tableone 0.13.2, jsonlite (JSON spec reader).
# Versions are printed at runtime and saved with the comparison results.
args <- commandArgs(trailingOnly = TRUE)
work <- if (length(args)) args[[1]] else "validation/r/work"
if (!requireNamespace("tableone", quietly = TRUE)) stop("Missing R package tableone; run install.packages(c(\"tableone\",\"jsonlite\"))", call.=FALSE)
if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Missing R package jsonlite; run install.packages(c(\"tableone\",\"jsonlite\"))", call.=FALSE)
if (as.character(getRversion()) != "4.6.0") warning("R 4.6.0 is the reference version; found ", as.character(getRversion()), call.=FALSE)
if (as.character(packageVersion("tableone")) != "0.13.2") warning("tableone 0.13.2 is the reference version; found ", as.character(packageVersion("tableone")), call.=FALSE)
cat("R version: ", R.version.string, "\n", sep = "")
cat("tableone version: ", as.character(packageVersion("tableone")), "\n", sep = "")

read_spec <- function(file) jsonlite::fromJSON(file, simplifyVector = FALSE)
write_long <- function(records, file) {
  out <- if (length(records)) do.call(rbind, lapply(records, as.data.frame, stringsAsFactors = FALSE)) else data.frame()
  write.csv(out, file, row.names = FALSE, na = "", fileEncoding = "UTF-8")
}
clean_numeric <- function(x) suppressWarnings(as.numeric(as.character(x)))
# tableone's n counts rows in the stratum and reports missing values separately;
# EasyTableOne's n counts observed values, so subtract the tableone missing count.
nonmissing_count <- function(n, miss) as.numeric(n) - as.numeric(miss)
add <- function(out, tier, variable, group, statistic, value) {
  if (length(value) != 1L || is.nan(value) || is.infinite(value)) value <- NA_real_
  out[[length(out) + 1L]] <- list(tier=tier, variable=variable, group=group, statistic=statistic, value=value)
  out
}

for (tier in c("A", "B", "C", "Bp", "Cp")) {
  spec_file <- file.path(work, paste0(tier, "_spec.json")); data_file <- file.path(work, paste0(tier, "_data.csv"))
  if (!file.exists(spec_file) || !file.exists(data_file)) next
  spec <- read_spec(spec_file)
  dat <- read.csv(data_file, check.names=FALSE, stringsAsFactors=FALSE, na.strings=c("", "NA", "N/A", "NULL", "na", "n/a", "null", ".", "#N/A", "None"))
  grouping <- spec$groupingVariable; group_order <- unlist(spec$groupOrder, use.names=FALSE); tests <- spec$tests
  dat[[grouping]] <- factor(as.character(dat[[grouping]]), levels=group_order)
  vars <- vapply(tests, `[[`, character(1), "variable"); roles <- vapply(tests, `[[`, character(1), "role")
  nonnormal <- vars[vapply(tests, function(x) grepl("Mann-Whitney|Kruskal-Wallis", x$test), logical(1))]
  exact_vars <- intersect(unlist(spec$fisherVariables, use.names=FALSE), vars); factor_vars <- vars[roles == "categorical"]
  # `wilcox.test` exact/continuity options differ by exported variable, while
  # CreateTableOne accepts one shared nonnormal function; direct tests below match per-variable behavior.
  set.seed(20260229)
  # CreateTableOne is used only for summaries and SMD. `nonnormal`/`exact` are print() arguments in tableone,
  # not CreateTableOne() arguments, and every P value below is computed directly with the matching base-R test,
  # so test=FALSE avoids redundant (and unused) internal tests.
  tab <- tableone::CreateTableOne(vars=vars, strata=grouping, data=dat, factorVars=factor_vars,
    includeNA=FALSE, test=FALSE, addOverall=TRUE, smd=TRUE)
  invisible(tab)
  smd <- tryCatch(tableone::ExtractSmd(tab), error=function(e) NULL); out <- list()
  set.seed(20260229)
  cont_obj <- tab$ContTable; cat_obj <- tab$CatTable
  resolve_stratum <- function(obj, group) {
    if (identical(group, "Overall")) {
      if ("Overall" %in% names(obj)) return("Overall")
      candidates <- setdiff(names(obj), group_order)
      if (length(candidates) == 1L) {
        message("Tier ", tier, ": mapping tableone overall stratum '", candidates[[1]], "' to canonical 'Overall'")
        return(candidates[[1]])
      }
      stop("Tier ", tier, ": addOverall=TRUE but tableone overall stratum could not be identified (found: ", paste(names(obj), collapse=", "), ")", call.=FALSE)
    }
    group
  }
  has_valid_value <- function(group, variable) {
    stratum <- if (identical(group, "Overall")) rep(TRUE, nrow(dat)) else as.character(dat[[grouping]]) == group
    any(stratum & !is.na(dat[[variable]]), na.rm=TRUE)
  }
  guard_value <- function(value, group, variable, statistic) {
    if (is.na(value) && has_valid_value(group, variable)) stop("Tier ", tier, ", variable ", variable, ", stratum ", group, ", statistic ", statistic, ": tableone summary extraction returned NA despite valid observations", call.=FALSE)
    value
  }
  cont_value <- function(group, stat, variable) {
    stratum_name <- resolve_stratum(cont_obj, group)
    stratum <- cont_obj[[stratum_name]]
    value <- NA_real_
    if (!is.null(stratum) && !is.null(rownames(stratum)) && !is.null(colnames(stratum)) && variable %in% rownames(stratum)) {
      if (identical(stat, "n") && all(c("n", "miss") %in% colnames(stratum))) value <- nonmissing_count(stratum[variable, "n"], stratum[variable, "miss"])
      else if (stat %in% colnames(stratum)) value <- as.numeric(stratum[variable, stat])
    }
    guard_value(value, group, variable, stat)
  }
  cat_matrix <- function(group, variable) {
    stratum <- cat_obj[[group]]
    if (is.null(stratum)) return(NULL)
    if (is.list(stratum) && !is.null(stratum[[variable]])) stratum[[variable]] else NULL
  }
  cat_value <- function(mat, category, field, group, variable) {
    value <- NA_real_
    if (is.null(mat)) {
      if (field %in% c("n", "freq", "percent") && !has_valid_value(group, variable)) value <- 0
    } else if (all(c("level", field) %in% colnames(mat))) {
      hit <- which(as.character(mat$level) == category)
      if (length(hit)) value <- as.numeric(mat[[field]][hit[1]])
      else if (field == "n" && nrow(mat) > 0L) value <- as.numeric(mat$n[1])
      else if (field %in% c("freq", "percent") && nrow(mat) > 0L) value <- 0
      else if (field %in% c("n", "freq", "percent") && !has_valid_value(group, variable)) value <- 0
    }
    guard_value(value, group, variable, field)
  }
  cat_n_value <- function(mat, group, variable) {
    value <- if ((is.null(mat) || nrow(mat) == 0L) && !has_valid_value(group, variable)) 0 else if (!is.null(mat) && nrow(mat) > 0L && all(c("n", "miss") %in% colnames(mat))) nonmissing_count(mat$n[1], mat$miss[1]) else NA_real_
    guard_value(value, group, variable, "n")
  }
  for (i in seq_along(tests)) {
    meta <- tests[[i]]; variable <- meta$variable; role <- meta$role; x <- dat[[variable]]; g <- factor(dat[[grouping]], levels=group_order)
    valid_group <- !is.na(g)
    if (role == "continuous") {
      for (level in c("Overall", group_order)) for (pair in list(c("mean","mean"),c("sd","sd"),c("median","median"),c("q1","p25"),c("q3","p75"),c("n","n")))
        out <- add(out,tier,variable,level,pair[1],cont_value(level,pair[2],variable))
    } else {
      x<-as.character(x); categories<-sort(unique(x[!is.na(x)]))
      for (level in c("Overall", group_order)) {
        mat <- cat_matrix(resolve_stratum(cat_obj, level), variable)
        out <- add(out, tier, variable, level, "n", cat_n_value(mat, level, variable))
        for (category in categories) {
          out <- add(out, tier, variable, paste(level, category, sep="|"), "count", cat_value(mat, category, "freq", level, variable))
          out <- add(out, tier, variable, paste(level, category, sep="|"), "percent", cat_value(mat, category, "percent", level, variable))
        }
      }
    }
    p<-NA_real_; r_family<-"none"; r_detail<-""; value<-x[valid_group]; gv<-g[valid_group]
    tryCatch({
      if(role=="continuous"){
        xx<-clean_numeric(value);ok<-is.finite(xx)&!is.na(gv);xx<-xx[ok];gg<-droplevels(gv[ok]);by_group<-split(xx,gg)
        if(length(by_group)==2L && grepl("Mann-Whitney",meta$test)){method<-meta$scipyMannWhitney$actual_method;r_family<-"mann_whitney";r_detail<-paste0("exact=",method,";correct=true");p<-stats::wilcox.test(by_group[[1]],by_group[[2]],alternative="two.sided",correct=TRUE,exact=identical(method,"exact"))$p.value}
        else if(length(by_group)==2L && grepl("Welch|t-test|t test",meta$test,ignore.case=TRUE)){r_family<-"welch_t";p<-stats::oneway.test(xx~gg,var.equal=FALSE)$p.value}
        else if(length(by_group)>=2L && grepl("ANOVA",meta$test,ignore.case=TRUE)){r_family<-"anova";p<-stats::oneway.test(xx~gg,var.equal=TRUE)$p.value}
        else if(length(by_group)>=2L && grepl("Kruskal",meta$test,ignore.case=TRUE)){r_family<-"kruskal_wallis";p<-stats::kruskal.test(xx~gg)$p.value}
      }else{
        ok<-!is.na(value)&!is.na(gv);tbl<-table(gv[ok],value[ok])
        if(nrow(tbl)>1&&ncol(tbl)>1&&variable%in%exact_vars){r_family<-"fisher";if(identical(dim(tbl),c(2L,2L)))p<-stats::fisher.test(tbl)$p.value else p<-stats::fisher.test(tbl,simulate.p.value=TRUE,B=9999)$p.value}
        else if(nrow(tbl)>1&&ncol(tbl)>1){r_family<-"chi_square";p<-stats::chisq.test(tbl,correct=FALSE)$p.value}
      }
    },error=function(e){p<<-NA_real_})
    out<-add(out,tier,variable,"","test_selection",r_family)
    if(nzchar(r_detail))out<-add(out,tier,variable,"","test_detail",r_detail)
    out<-add(out,tier,variable,"","p_value",p)
    if(!is.null(smd)&&variable%in%rownames(smd)){
      smd_cols<-colnames(smd); average_col<-grep("average",smd_cols,ignore.case=TRUE)
      smd_value<-if(length(group_order)==2L)as.numeric(smd[variable,1]) else if(length(average_col))as.numeric(smd[variable,average_col[1]]) else NA_real_
      out<-add(out,tier,variable,"","smd",abs(smd_value))
    }
  }
  write_long(out,file.path(work,paste0(tier,"_r.csv")))
}
writeLines(c("R version",R.version.string,"tableone version",as.character(packageVersion("tableone"))),file.path(dirname(work),"r_versions.txt"))
