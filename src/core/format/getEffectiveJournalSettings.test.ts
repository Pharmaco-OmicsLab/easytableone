import { describe, it, expect } from "vitest";
import { getEffectiveJournalSettings } from "./getEffectiveJournalSettings";
import { formatPValue, journalRulesets } from "./formatTable";

describe("getEffectiveJournalSettings", () => {
  it("returns base journal configuration when no overrides are passed", () => {
    const config = getEffectiveJournalSettings('NEJM');
    expect(config.journal_id).toBe('NEJM');
    expect(config.number_format?.thousand_separator).toBe(true);
    expect(config.number_format?.decimal_precision).toBe(1);
    expect(config.p_value_formatting.threshold_low).toBe("<0.001");
  });

  it("performs case-insensitive lookup of journal", () => {
    const config = getEffectiveJournalSettings('nejm');
    expect(config.journal_id).toBe('NEJM');
  });

  it("applies individual numberFormat overrides without resetting other properties", () => {
    const overrides = {
      numberFormat: {
        thousandSeparator: false,
        decimalPlaces: 3,
      },
    };
    const config = getEffectiveJournalSettings('NEJM', overrides);
    expect(config.number_format?.thousand_separator).toBe(false);
    expect(config.number_format?.decimal_precision).toBe(3);
    // Should preserve default suppress_trailing_zero from NEJM (true)
    expect(config.number_format?.suppress_trailing_zero).toBe(true);
  });

  it("applies p-value formatting overrides", () => {
    const overrides = {
      pValueThreshold: "<0.05",
      pValueSignificantDigits: 4,
    };
    const config = getEffectiveJournalSettings('NEJM', overrides);
    expect(config.p_value_formatting.threshold_low).toBe("<0.05");
    expect(config.p_value_formatting.max_decimal_places).toBe(4);
    expect(config.p_value_formatting.conditional_decimals).toEqual([]);
    // Should preserve italicize_p from NEJM (false)
    expect(config.p_value_formatting.italicize_p).toBe(false);
  });

  it("uses fixed P-value decimals for an explicit NEJM default-decimal override", () => {
    const overridden = getEffectiveJournalSettings('NEJM', { pValueSignificantDigits: 3 });
    const defaultConfig = getEffectiveJournalSettings('NEJM');

    expect(overridden.p_value_formatting.conditional_decimals).toEqual([]);
    expect(formatPValue(0.0431, overridden.p_value_formatting)).toBe("0.043");
    expect(formatPValue(0.1048, overridden.p_value_formatting)).toBe("0.105");
    expect(formatPValue(0.035, overridden.p_value_formatting)).toBe("0.035");
    expect(formatPValue(0.0431, defaultConfig.p_value_formatting)).toBe("0.04");
    expect(formatPValue(0.1048, defaultConfig.p_value_formatting)).toBe("0.10");
    expect(formatPValue(0.035, defaultConfig.p_value_formatting)).toBe("0.04");
  });

  it("preserves JAMA's conditional display when no P-value override is set", () => {
    const config = getEffectiveJournalSettings('JAMA');
    expect(formatPValue(0.995, config.p_value_formatting)).toBe("> .99");
  });

  it("applies text template overrides", () => {
    const overrides = {
      titleTemplate: "Custom Title: {grouping_label}",
      variableCodingSectionTitle: "Custom Coding Notes",
    };
    const config = getEffectiveJournalSettings('NEJM', overrides);
    expect(config.table_title_template).toBe("Custom Title: {grouping_label}");
    expect(config.variable_coding_section_title).toBe("Custom Coding Notes");
  });

  it("handles null/suppressed variableCodingSectionTitle override", () => {
    const overrides = {
      variableCodingSectionTitle: null,
    };
    const config = getEffectiveJournalSettings('NEJM', overrides);
    expect(config.variable_coding_section_title).toBeNull();
  });

  it("validates plot_theme on every journal ruleset", () => {
    const requiredKeys = [
      "seaborn_style",
      "color_palette",
      "font_family",
      "font_size_base",
      "despine",
      "bar_edge_color",
      "bar_edge_linewidth",
      "line_width",
      "figure_dpi_screen",
      "figure_dpi_export",
    ];

    for (const journal of journalRulesets.EasyTableOne_Ruleset.journals) {
      expect(Object.keys(journal.plot_theme).sort()).toEqual(requiredKeys.sort());
      expect(["ticks", "white", "whitegrid", "darkgrid", "dark"]).toContain(journal.plot_theme.seaborn_style);
      expect(journal.plot_theme.color_palette.length).toBeGreaterThanOrEqual(2);
      expect(journal.plot_theme.color_palette.every((color) => /^#[0-9A-Fa-f]{6}$/.test(color))).toBe(true);
      expect(typeof journal.plot_theme.font_family).toBe("string");
      expect(typeof journal.plot_theme.font_size_base).toBe("number");
      expect(typeof journal.plot_theme.despine).toBe("boolean");
      expect(typeof journal.plot_theme.bar_edge_color).toBe("string");
      expect(typeof journal.plot_theme.bar_edge_linewidth).toBe("number");
      expect(typeof journal.plot_theme.line_width).toBe("number");
      expect(journal.plot_theme.figure_dpi_screen).toBe(150);
      expect(journal.plot_theme.figure_dpi_export).toBe(300);
    }
  });

  it("returns each journal's plot_theme and keeps it isolated from user overrides", () => {
    const expectedFirstColors: Record<string, string> = {
      NEJM: "#BC3C29",
      JAMA: "#374E55",
      LANCET: "#00468B",
      NATURE_MED: "#E64B35",
      GENERIC: "#4E79A7",
    };

    for (const [journalId, firstColor] of Object.entries(expectedFirstColors)) {
      const base = getEffectiveJournalSettings(journalId);
      const overridden = getEffectiveJournalSettings(journalId, {
        numberFormat: {
          thousandSeparator: !base.number_format?.thousand_separator,
          decimalPlaces: 4,
        },
      });

      expect(base.plot_theme.color_palette[0]).toBe(firstColor);
      expect(overridden.plot_theme).toEqual(base.plot_theme);
      expect(overridden.number_format?.decimal_precision).toBe(4);
    }
  });
});
