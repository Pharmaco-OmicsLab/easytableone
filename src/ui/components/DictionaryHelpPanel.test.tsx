import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DictionaryHelpPanel } from './DictionaryHelpPanel';

describe('DictionaryHelpPanel', () => {
  it('renders collapsed by default when no dictionary is imported', () => {
    render(<DictionaryHelpPanel hasDictionary={false} />);
    const toggle = screen.getByRole('button', { name: /Format your dictionary sheet/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/can use a dictionary sheet from your XLSX workbook/i)).toBeNull();
  });

  it('renders collapsed by default when a dictionary is already imported', () => {
    render(<DictionaryHelpPanel hasDictionary={true} />);
    const toggle = screen.getByRole('button', { name: /Format your dictionary sheet/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/can use a dictionary sheet from your XLSX workbook/i)).toBeNull();
  });

  it('toggles open/closed on click', () => {
    render(<DictionaryHelpPanel hasDictionary={true} />);
    const toggle = screen.getByRole('button', { name: /Format your dictionary sheet/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Original_Var_InDATA/)).toBeDefined();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('explains what a codebook is with an example and skip note', () => {
    render(<DictionaryHelpPanel hasDictionary={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Format your dictionary sheet/ }));
    expect(screen.getByText(/sometimes called a codebook/i)).toBeDefined();
    expect(screen.getByText('Variable')).toBeDefined();
    expect(screen.getByText('Female')).toBeDefined();
    expect(screen.getByText(/You can skip this step/i)).toBeDefined();
  });
});
