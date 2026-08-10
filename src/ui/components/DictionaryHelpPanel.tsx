import { useState } from 'react';

interface DictionaryHelpPanelProps {
  /**
   * Whether a dictionary is already imported.
   */
  hasDictionary: boolean;
}

/**
 * DictionaryHelpPanel — Step 7b.5.3
 *
 * Collapsible help panel inside Stage 3 (Data Dictionary) describing how to
 * format an XLSX dictionary sheet so EasyTableOne can auto-detect it (D39).
 */
export function DictionaryHelpPanel({ hasDictionary: _hasDictionary }: DictionaryHelpPanelProps) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <div
      data-testid="dictionary-help-panel"
      className="mb-6 border border-gray-200 rounded-lg bg-gray-50"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex justify-between items-center px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 rounded-lg"
      >
        <span>Format your dictionary sheet</span>
        <span className="text-gray-500">{open ? '▲' : '▶'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-700 space-y-3">
          <p>
            A data dictionary, sometimes called a codebook, explains what each source
            column and coded value means. For example, it can turn <code>1</code> and
            <code> 2</code> into publication labels such as Yes and No.
          </p>
          <table className="min-w-full text-xs border border-gray-200 bg-white">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left">Variable</th>
                <th className="px-2 py-1 text-left">Code</th>
                <th className="px-2 py-1 text-left">Label</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="px-2 py-1 font-mono">sex</td>
                <td className="px-2 py-1">1</td>
                <td className="px-2 py-1">Female</td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="px-2 py-1 font-mono">sex</td>
                <td className="px-2 py-1">2</td>
                <td className="px-2 py-1">Male</td>
              </tr>
            </tbody>
          </table>
          <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
            Not sure if you have one? You can skip this step and keep using the
            original column names.
          </p>
          <p>
            EasyTableOne can use a dictionary sheet from your XLSX workbook or a separate
            XLSX/CSV dictionary file if it is formatted with these columns:
          </p>
          <p>
            Long-format dictionaries with one row per level are supported when the sheet
            has variable, code, and label columns.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              A column whose values are the <strong>exact</strong> column names from your
              data sheet, including any brackets and prefixes. Avoid extra spaces unless
              those spaces are truly present in the data header.
              Example header: <code className="font-mono">Original_Var_InDATA</code>.
            </li>
            <li>
              A column with the display labels you want shown in the published table.
              Clean, publication-ready labels. Example header:{' '}
              <code className="font-mono">Report_variable_names_v2</code>.
            </li>
            <li>
              (Optional) A column with units (e.g., <code>mg/L</code>, <code>weeks</code>).
              Example header: <code className="font-mono">Units</code> (or any column whose
              name contains "unit").
            </li>
          </ol>
          <p>
            The dictionary sheet can have any name. EasyTableOne scores each non-data sheet
            for "looks like a dictionary" and offers the best match. A separate CSV dictionary
            is treated as a single dictionary table. If your data has codes like{' '}
            <code>1=Male, 2=Female</code> per variable, include those level labels in the dictionary
            when available, then confirm or edit them in the Variable types step.
          </p>
          <p>
            You can always edit labels manually in the Variable types step even if you import a
            dictionary.
          </p>
        </div>
      )}
    </div>
  );
}
