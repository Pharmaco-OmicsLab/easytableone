import { describe, expect, it } from "vitest";

function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((part) => parseInt(part, 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrastRatio(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("shell text contrast", () => {
  it.each([
    ["gray-600 on white", "#4b5563", "#ffffff"], ["gray-700 on gray-50", "#374151", "#f9fafb"],
    ["blue-700 on blue-50", "#1d4ed8", "#eff6ff"], ["green-700 on green-50", "#15803d", "#f0fdf4"],
    ["amber-800 on amber-50", "#92400e", "#fffbeb"], ["white on blue-600", "#ffffff", "#2563eb"],
  ])("meets AA for %s", (_name: string, foreground: string, background: string) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
