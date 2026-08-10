import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HtmlPreview } from './htmlPreview';
import type { FormattedTable } from '../types';

function makeTable(overrides: Partial<FormattedTable> = {}): FormattedTable {
  return {
    journal: 'NEJM',
    rulesetVersion: '1.2',
    title: 'Table 1: Baseline Characteristics, by Edema',
    header: ['Variable', 'Yes (n=29)', 'No (n=108)'],
    rows: [],
    footnotes: [],
    methodsParagraph: '',
    ...overrides,
  };
}

describe('HtmlPreview', () => {
  it('renders formattedTable.title as the caption (7d.2)', () => {
    render(<HtmlPreview table={makeTable()} />);
    expect(screen.getByText('Table 1: Baseline Characteristics, by Edema')).toBeTruthy();
  });

  it('updates caption when title changes (7d.2 regression)', () => {
    const { rerender } = render(<HtmlPreview table={makeTable()} />);
    rerender(<HtmlPreview table={makeTable({ title: 'Table 1: Custom Title' })} />);
    expect(screen.getByText('Table 1: Custom Title')).toBeTruthy();
    expect(screen.queryByText('Table 1: Baseline Characteristics, by Edema')).toBeNull();
  });

  it('does not fall back to a hardcoded title when title is set (7d.2 regression)', () => {
    render(<HtmlPreview table={makeTable({ title: 'Custom Journal Title' })} />);
    expect(screen.queryByText('Table 1: Baseline Characteristics')).toBeNull();
  });
});
