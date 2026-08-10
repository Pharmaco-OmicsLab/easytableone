export const GLOSSARY = {
  "Variable types": "The list of variables in your dataset, with each variable's type and display label.",
  "Data checks": "Data quality checks that look for issues to fix or acknowledge before analysis.",
  EDA: "Exploratory data analysis: summaries and plots used to understand the dataset before final reporting.",
  SMD: "Standardized mean difference, an effect-size measure often used to describe baseline imbalance.",
  VIF: "Variance inflation factor, a diagnostic for overlap between predictors in a model.",
  MCAR: "Missing completely at random, meaning missingness does not depend on observed or unobserved values.",
  BH: "Benjamini-Hochberg correction, a false discovery rate method for multiple testing.",
  ordinal: "A categorical variable whose levels have a meaningful order.",
  nominal: "A categorical variable whose levels do not have a meaningful order.",
  winsorize: "Limit extreme values to a chosen percentile instead of removing them.",
  "complete-case": "Analysis that uses only rows with no missing values for the required variables.",
  "available-case": "Analysis that uses all rows available for each variable, so sample size can differ by variable.",
  imputation: "A missing-data strategy that fills in plausible replacement values before analysis.",
  kNN: "Nearest-neighbour imputation, which fills a missing value using patients with similar observed values.",
  MICE: "Multiple imputation by chained equations, a method that creates several plausible completed datasets and combines their model results.",
  "random-forest imputation": "A method that uses many decision trees to predict missing values from the other variables.",
  "multiple imputation": "A missing-data approach that repeats the fill-in step several times so uncertainty from missing values can be carried into results.",
  "single imputation": "A missing-data approach that fills one replacement value for each blank, which can make results look more certain than they are.",
  "Rubin's rules": "The standard formulas for combining estimates and uncertainty across multiple imputed datasets.",
} as const;

export type GlossaryTermKey = keyof typeof GLOSSARY;
