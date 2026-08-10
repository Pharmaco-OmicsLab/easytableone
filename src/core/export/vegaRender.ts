import * as vega from "vega";
import { compile } from "vega-lite";

export async function vegaLiteSpecToPng(
  vlSpec: object,
  scaleFactor = 2,
): Promise<string> {
  await Promise.resolve();
  const vegaSpec = compile(vlSpec as any).spec;
  const view = new vega.View(vega.parse(vegaSpec), {
    renderer: "canvas",
  });
  await view.runAsync();
  const canvas = await view.toCanvas(scaleFactor);
  return canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
}
