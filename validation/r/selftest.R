# Hand-computed 3 x 2 table: Pearson X^2 = 16/3, df=2, p=exp(-(16/3)/2).
tab <- matrix(c(10,20,30,20,20,20), nrow=3, byrow=TRUE)
p <- stats::chisq.test(tab, correct=FALSE)$p.value
expected <- exp(-(16/3)/2)
if (abs(p-expected)>1e-10) stop(sprintf("chi-square selftest failed: %.15f != %.15f",p,expected))
cat(sprintf("chi-square no-correction selftest passed: %.15f\n",p))
