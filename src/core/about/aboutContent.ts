export const LAB_NAME = "Pharmaco-Omics Lab";
export const LAB_TAGLINE = "Omics for Personalized Medicine";
export const LAB_WEBSITE = "https://pharmacoomics.com/";
export const LAB_GITHUB = "https://github.com/Pharmaco-OmicsLab";
export const FEEDBACK_EMAIL = "pharmacoomicslab@gmail.com";

export const LAB_DESCRIPTION =
  "The Pharmaco-Omics Lab leverages laboratory, clinical, and computational approaches to study human metabolic disease, discover clinically relevant biomarkers, and develop personalized treatment strategies. We build tools like EasyTableOne to ease the technical burden on researchers, so more time goes to the science.";

export interface TeamMember {
  role: string;
  name: string;
}

export const TEAM: TeamMember[] = [
  { role: "Principal Investigator", name: "Nguyen Phuoc Long, M.D., Ph.D." },
  { role: "Main Contributor", name: "Nguyen Thien Luan" },
  { role: "Contributor(s)", name: "Nguyen Quang Thu" },
];

export interface Differentiator {
  title: string;
  detail: string;
}

export const DIFFERENTIATORS: Differentiator[] = [
  { title: "Runs entirely in your browser", detail: "Your data never leaves your computer; no server, no upload, no PHI ever transmitted." },
  { title: "Free, no install, no account", detail: "Open the page and start. Nothing to license, register for, or set up." },
  { title: "Journal-ready output", detail: "Table 1 exports formatted to specific journal styles (NEJM, JAMA, Lancet, and more) from a maintained ruleset, not a generic template." },
  { title: "Full reproducibility trail", detail: "Every run can export a reproducibility JSON and a standalone, runnable analysis script documenting exactly what was computed." },
  { title: "Built-in statistical guardrails and teaching", detail: "The app flags small-sample/EPV issues, separation, multiple-comparison corrections, and more, and explains why in plain language at every step." },
];

export const PRIVACY_BLURB_SHORT = "Files are processed in your browser and are never uploaded to a server.";

export const PRIVACY_POLICY_TEXT = `EasyTableOne does not collect, store, or transmit any of your data. Every file you upload, and every calculation it produces - Table 1, statistical tests, exploratory analysis, modeling - is processed entirely inside your own browser, using a Python engine (Pyodide) compiled to run locally via WebAssembly in a background worker.

EasyTableOne has no backend server and no database. There is no login and no cloud-storage feature to opt into. We collect no telemetry, analytics, or usage tracking of any kind.

The only data that ever leaves your browser is a file you explicitly choose to download - a Word document, CSV, LaTeX table, reproducibility JSON, or report. That is a local save to your own device, not a transmission to us.

Because nothing is stored anywhere outside your browser tab, closing or refreshing this page discards all in-progress work. Download anything you want to keep before you do.`;

export const TERMS_OF_SERVICE_TEXT = `By using EasyTableOne, you agree to these terms. EasyTableOne is provided by the ${LAB_NAME} as a free research tool, "as is," without warranty of any kind, express or implied.

We do not assume responsibility or liability for the accuracy, completeness, or fitness for any particular purpose of any table, statistic, model, or export produced by this application. EasyTableOne wraps established, peer-reviewed statistical libraries (SciPy, statsmodels, scikit-learn) but does not replace independent statistical review. You are solely responsible for verifying results before relying on them for publication, clinical decision-making, regulatory submission, or any other use.

You are responsible for ensuring you have the right to use, analyze, and process the data you upload, and for complying with applicable laws, your institution's policies, and any data-governance or ethics requirements (such as IRB approval or data use agreements). Because EasyTableOne never transmits or stores your data, we have no visibility into, and no responsibility for, the content of any file you process.`;
