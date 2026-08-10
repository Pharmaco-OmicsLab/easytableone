export function buildOutlierNote(count: number, displayVar: string, suffix = ""): string {
  const valueWord = count === 1 ? "value" : "values";
  const verbWord = count === 1 ? "was" : "were";
  const outlierPhrase = count === 1 ? "a potential outlier" : "potential outliers";
  return `${count} ${valueWord} in ${displayVar} ${verbWord} flagged as ${outlierPhrase}${suffix}`;
}

export function buildOutlierFindingDetail(count: number, displayVar: string): string {
  const valueWord = count === 1 ? "value" : "values";
  const verbWord = count === 1 ? "was" : "were";
  const outlierPhrase = count === 1 ? "a potential outlier" : "potential outliers";
  return `${count} ${valueWord} ${verbWord} flagged as ${outlierPhrase} in ${displayVar}.`;
}

export function buildOutlierHistoryLine(count: number, displayVar: string): string {
  const valueWord = count === 1 ? "value" : "values";
  const verbWord = count === 1 ? "was" : "were";
  const outlierPhrase = count === 1 ? "a potential outlier" : "potential outliers";
  return `- ${count} ${valueWord} ${verbWord} flagged as ${outlierPhrase} in ${displayVar}`;
}
