export const SMD_GLOSSARY =
  "Standardized mean difference: the between-group difference expressed in standard-deviation units. Unlike a P value it does not grow with sample size. An absolute SMD above 0.1 is conventionally read as meaningful imbalance.";

export const SMD_WHEN_TO_USE_HEADLINE =
  "SMD is off by default. Most clinical Table 1s report P values only; turn SMD on when you need to show how balanced the groups are.";

export const SMD_USE_WHEN = [
  "Observational study comparing treatment or exposure groups (e.g. drug A vs drug B, smokers vs non-smokers), especially if you will adjust, match or weight for confounders. SMD is the standard balance measure here, and propensity-score papers are expected to report it.",
  "Randomized trial. Significance tests of baseline differences are discouraged (CONSORT); SMD describes the size of any chance imbalance instead. Consider showing SMD and hiding the P-value column.",
  "Large datasets, where trivially small differences can still give P < 0.05.",
];

export const SMD_USUALLY_NOT_NEEDED = [
  "Groups defined by an outcome or disease status (e.g. survivors vs non-survivors, cases vs controls) described for a clinical question — P values are the usual convention.",
  "Your target journal or reporting guideline does not ask for it.",
];

export const SMD_CAVEAT =
  "SMD is not a hypothesis test and has no P value. The 0.1 threshold is a convention, not a rule. For more than two groups the table shows the largest pairwise SMD.";
