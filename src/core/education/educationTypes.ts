import type { AnalysisPlan, Schema, StatisticalResults } from "../types";
import type { ModelingResults, ModelingSetup } from "../modeling/types";

export type StageId =
  | "upload"
  | "sheet-header"
  | "dictionary"
  | "schema"
  | "qa"
  | "plan"
  | "stats"
  | "modeling"
  | "export";

export type ExplanationDepth = "concise" | "deep";

export interface StageOverview {
  title: string;
  purpose: string;
  whatToDo: string;
  whyItMatters: string;
}

export interface ExplanationBody {
  what: string;
  why: string;
  alternatives: string;
}

export interface DecisionExplanation {
  id: string;
  label: string;
  concise: ExplanationBody;
  deep: ExplanationBody;
}

export interface EducationContext {
  stats?: StatisticalResults | null;
  schema?: Schema | null;
  plan?: AnalysisPlan | null;
  modelingSetup?: ModelingSetup | null;
  modelingResults?: ModelingResults | null;
}

export type DecisionBuilder = (context?: EducationContext) => DecisionExplanation;
