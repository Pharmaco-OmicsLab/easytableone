import type { JournalConfig, UserOverrides } from "../types";
import { journalRulesets } from "./formatTable";

/**
 * Resolves the effective journal configuration by deep-merging user-specified overrides
 * onto the ruleset's defaults.
 *
 * @param journalId - The identifier of the target journal (case-insensitive).
 * @param overrides - Session-scoped formatting overrides.
 * @returns Fully populated effective JournalConfig.
 */
export function getEffectiveJournalSettings(
  journalId: string,
  overrides?: UserOverrides
): JournalConfig {
  const journalConfig = journalRulesets.EasyTableOne_Ruleset.journals.find(
    (j) => j.journal_id.toLowerCase() === journalId.toLowerCase()
  );
  if (!journalConfig) {
    throw new Error(`Journal configuration for ${journalId} not found`);
  }

  if (!overrides) {
    return journalConfig;
  }

  // Create a deep copy of the configuration to avoid mutating the global ruleset
  const config = JSON.parse(JSON.stringify(journalConfig)) as JournalConfig;

  // Apply numberFormat overrides
  if (overrides.numberFormat) {
    if (!config.number_format) {
      config.number_format = {
        thousand_separator: false,
        suppress_trailing_zero: true,
        decimal_precision: 1,
      };
    }
    if (overrides.numberFormat.thousandSeparator !== undefined) {
      config.number_format.thousand_separator = overrides.numberFormat.thousandSeparator;
    }
    if (overrides.numberFormat.decimalPlaces !== undefined) {
      config.number_format.decimal_precision = overrides.numberFormat.decimalPlaces;
    }
    if (overrides.numberFormat.suppressTrailingZeros !== undefined) {
      config.number_format.suppress_trailing_zero = overrides.numberFormat.suppressTrailingZeros;
    }
  }

  // Apply iqrDelimiter override
  if (overrides.iqrDelimiter !== undefined) {
    config.summary_statistics.iqr_delimiter = overrides.iqrDelimiter;
  }

  // Apply pValueThreshold override
  if (overrides.pValueThreshold !== undefined) {
    config.p_value_formatting.threshold_low = overrides.pValueThreshold;
  }

  // Apply pValueSignificantDigits override
  if (overrides.pValueSignificantDigits !== undefined) {
    config.p_value_formatting.max_decimal_places = overrides.pValueSignificantDigits;
    config.p_value_formatting.conditional_decimals = [];
  }

  // Apply titleTemplate override
  if (overrides.titleTemplate !== undefined) {
    config.table_title_template = overrides.titleTemplate;
  }

  // Apply variableCodingSectionTitle override
  if (overrides.variableCodingSectionTitle !== undefined) {
    config.variable_coding_section_title = overrides.variableCodingSectionTitle;
  }

  return config;
}
