import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedDictionarySheet } from '../../core/dictionary/sheetDetector';
import { DictionaryDetectModal } from './DictionaryDetectModal';

function makeCandidate(
  overrides: Partial<DetectedDictionarySheet> = {},
): DetectedDictionarySheet {
  const preview = Array.from({ length: 8 }, (_, i) => ({
    raw: `[r${i}]Col${i}`,
    label: `Display ${i}`,
  }));
  const mapping = Object.fromEntries(
    preview.map((p) => [p.raw, { label: p.label }]),
  );
  return {
    sheetName: '250113_variablecoding',
    rawColumn: 'Original_Var_InDATA',
    labelColumn: 'Report_variable_names_v2',
    matchScore: 0.97,
    preview,
    mapping,
    ...overrides,
  };
}

describe('DictionaryDetectModal', () => {
  it('renders with one candidate', () => {
    const onAccept = vi.fn();
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate()]}
        onAccept={onAccept}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/Dictionary sheet detected/i)).toBeDefined();
    expect(screen.getByText('250113_variablecoding')).toBeDefined();
    expect(screen.getByText(/97% match/)).toBeDefined();
  });

  it('renders preview table with 8 raw → label rows', () => {
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate()]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    for (let i = 0; i < 8; i++) {
      expect(screen.getAllByText(`[r${i}]Col${i}`).length).toBeGreaterThan(0);
      expect(screen.getAllByText(`Display ${i}`).length).toBeGreaterThan(0);
    }
  });

  it('collapses "show other matches" by default with two candidates', () => {
    const other = makeCandidate({ sheetName: 'second_sheet', matchScore: 0.85 });
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate(), other]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    // collapsed: button visible, second sheet name not yet shown
    expect(screen.getByText(/Show other matches \(1\)/)).toBeDefined();
    expect(screen.queryByText('second_sheet')).toBeNull();
    fireEvent.click(screen.getByText(/Show other matches \(1\)/));
    expect(screen.getByText('second_sheet')).toBeDefined();
  });

  it('fires onAccept with top candidate when "Use this dictionary" clicked', () => {
    const cand = makeCandidate();
    const onAccept = vi.fn();
    render(
      <DictionaryDetectModal
        candidates={[cand]}
        onAccept={onAccept}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Use this dictionary'));
    expect(onAccept).toHaveBeenCalledWith(cand);
  });

  it('fires onPickDifferent and onSkip when their buttons are clicked', () => {
    const onPick = vi.fn();
    const onSkip = vi.fn();
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate()]}
        onAccept={vi.fn()}
        onPickDifferent={onPick}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByText('Pick a different sheet'));
    expect(onPick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(/Skip/));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows the units column header when a units column was detected', () => {
    const withUnits = makeCandidate({
      unitsColumn: 'Units',
      preview: [
        { raw: '[b1]GA', label: 'Gestational age', units: 'weeks' },
        { raw: '[b2]BW', label: 'Birth weight', units: 'g' },
      ],
    });
    render(
      <DictionaryDetectModal
        candidates={[withUnits]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    const unitsHeaders = screen.getAllByText('Units');
    // One in metadata strip, one as <th> in preview table
    expect(unitsHeaders.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('weeks')).toBeDefined();
  });

  it('shows match quality and what will change before applying', () => {
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate({ matchScore: 0.8 })]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/matched columns/).length).toBeGreaterThan(0);
    expect(screen.getByText(/unmatched columns/)).toBeDefined();
    expect(screen.getByText(/unknown codes detected/)).toBeDefined();
    expect(screen.getByText(/What will change before applying/)).toBeDefined();
  });

  it('explains long-format dictionaries without promising display-label changes', () => {
    render(
      <DictionaryDetectModal
        candidates={[makeCandidate({
          isLongFormat: true,
          codeColumn: 'code',
          preview: [{ raw: 'smoker', label: '' }],
          mapping: { smoker: { label: '' } },
          dictionaryMap: { smoker: { levels: [{ code: 0, label: 'No' }, { code: 1, label: 'Yes' }] } },
        })]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText('Level codes')).toBeDefined();
    expect(screen.getByText(/Variable display names will stay unchanged/)).toBeDefined();
  });

  it('renders nothing when candidates list is empty', () => {
    const { container } = render(
      <DictionaryDetectModal
        candidates={[]}
        onAccept={vi.fn()}
        onPickDifferent={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
