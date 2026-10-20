export const LARGE_N_NOTICE_THRESHOLD = 50_000;
export const LARGE_N_CONFIRM_THRESHOLD = 150_000;
export const MAX_DATA_ROWS = 100_000;

export function describeRowLimitExceeded(n: number): string {
  return `This file has ${n.toLocaleString()} data rows, above the ${MAX_DATA_ROWS.toLocaleString()}-row limit. EasyTableOne runs the whole analysis in your browser's memory, and larger files can exhaust it. Try analysing a random subsample or a subset of rows, such as one period or site.`;
}

export function describeLargeNNotice(n: number): string {
  return `This file has ${n.toLocaleString()} rows. EasyTableOne runs entirely in your browser, so Table 1 and EDA on a dataset this size may take longer to compute.`;
}

export function describeLargeNAdvisory(n: number, fastMode: boolean): string {
  const fastModeNote = fastMode
    ? "Fast validation is already on, which helps, but may still be slow at this size."
    : "Switching to thorough validation at this size is likely to be very slow or to exhaust your browser's memory; Fast validation is strongly recommended.";
  return `This dataset has ${n.toLocaleString()} rows. Logistic regression and especially the ML benchmark (SVM grid-search, repeated bootstrap) can be slow or memory-heavy at this size, entirely within your browser tab. ${fastModeNote} Fast validation bounds the bootstrap/CV repeat count; it does not bound SVM's internal grid search, which scales with N regardless.`;
}

export function describeLargeNConfirm(n: number): string {
  return `This dataset has ${n.toLocaleString()} rows, above the ${LARGE_N_CONFIRM_THRESHOLD.toLocaleString()}-row threshold where Modeling has been observed to crash the browser tab. All models remain available; nothing is disabled, but running Modeling at this size may be slow or may crash this tab. Confirm you understand the risk to continue.`;
}
