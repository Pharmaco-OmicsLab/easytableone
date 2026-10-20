import type { JournalConfig } from '../../core/types';

interface JournalStyleCardProps {
  config: JournalConfig;
}

/**
 * JournalStyleCard — Step 9
 *
 * Renders an inline info card listing the journal-specific style choices
 * that will be applied to the generated table. Shown at Stage 8 (Format & Export)
 * above the docx preview.
 */
export function JournalStyleCard({ config }: JournalStyleCardProps) {
  const numFmt = config.number_format;
  const sumStats = config.summary_statistics;
  const pFmt = config.p_value_formatting;

  const rows: { label: string; value: string; example?: string }[] = [
    {
      label: 'IQR delimiter',
      value: `"${sumStats.iqr_delimiter}"`,
      example: `29.6 (27.0${sumStats.iqr_delimiter}34.0)`,
    },
    ...(numFmt
      ? [
          {
            label: 'Thousand separator',
            value: numFmt.thousand_separator ? 'enabled' : 'disabled',
            example: numFmt.thousand_separator ? '1,100' : '1100',
          },
          {
            label: 'Trailing zero',
            value: numFmt.suppress_trailing_zero ? 'suppressed' : 'shown',
            example: numFmt.suppress_trailing_zero ? '"1100" not "1100.0"' : '"1100.0"',
          },
        ]
      : []),
    {
      label: 'P-value format',
      value: `threshold ${pFmt.threshold_low}; ${pFmt.max_decimal_places} decimal places`,
      example: `${pFmt.threshold_low} or 0.034`,
    },
    {
      label: 'Coding notes section',
      value:
        config.variable_coding_section_title === null
          ? 'suppressed'
          : `included ("${config.variable_coding_section_title ?? 'Variable coding notes'}")`,
    },
    {
      label: 'Title format',
      value: config.table_title_template ?? 'Table 1: Baseline Characteristics, by {grouping_label}',
    },
  ];

  return (
    <div
      id={`journal-style-card-${config.journal_id}`}
      className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600 font-semibold text-base">📋 {config.display_name}</span>
        <span className="text-blue-400 text-xs">Style applied to your table</span>
      </div>
      <p className="mb-3 text-gray-700">
        Based on: {config.provenance.source_url ? (
          <a href={config.provenance.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            {config.provenance.source_title}
          </a>
        ) : config.provenance.source_title}, retrieved {config.provenance.retrieved_on ?? "not applicable"}; last reviewed {config.provenance.last_reviewed_on}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap gap-1 items-baseline">
            <span className="text-gray-600 font-medium min-w-[140px]">{r.label}:</span>
            <span className="text-gray-800">{r.value}</span>
            {r.example && (
              <span className="text-gray-400 text-xs ml-1">(e.g., {r.example})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
