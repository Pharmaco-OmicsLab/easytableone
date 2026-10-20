import * as vega from "vega";
import { expressionInterpreter } from "vega-interpreter";
import { compile } from "vega-lite";

export async function vegaLiteSpecToPng(
  vlSpec: object,
  scaleFactor = 2,
): Promise<string> {
  await Promise.resolve();
  const vegaSpec = compile(vlSpec as any).spec;
  // CSP-safe expression evaluation (D105(c)): interpret the AST instead of `new Function`.
  const view = new vega.View(vega.parse(vegaSpec, {}, { ast: true }), {
    renderer: "canvas",
    expr: expressionInterpreter,
  });
  await view.runAsync();
  const canvas = await view.toCanvas(scaleFactor);
  return canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
}
