import { describe, it, expect } from 'vitest';
import { generateTableTitle, stripBracketPrefix, stripBracketCodes, DEFAULT_TITLE_TEMPLATE } from './tableTitle';

describe('stripBracketPrefix', () => {
  it('strips bracket prefix from "[c10] Edema"', () => {
    expect(stripBracketPrefix('[c10] Edema')).toBe('Edema');
  });

  it('strips compact prefix "[b1]Gestational age"', () => {
    expect(stripBracketPrefix('[b1]Gestational age')).toBe('Gestational age');
  });

  it('passthrough for label without bracket prefix', () => {
    expect(stripBracketPrefix('Edema')).toBe('Edema');
  });

  it('handles empty string', () => {
    expect(stripBracketPrefix('')).toBe('');
  });
});

describe('stripBracketCodes', () => {
  it('strips leading bracket prefix "[c10] Edema"', () => {
    expect(stripBracketCodes('[c10] Edema')).toBe('Edema');
  });

  it('strips compact leading prefix "[b1]Gestational age"', () => {
    expect(stripBracketCodes('[b1]Gestational age')).toBe('Gestational age');
  });

  it('strips trailing bracket code "Edema [c10]"', () => {
    expect(stripBracketCodes('Edema [c10]')).toBe('Edema');
  });

  it('strips trailing bracket code with no space "Edema[c10]"', () => {
    expect(stripBracketCodes('Edema[c10]')).toBe('Edema');
  });

  it('strips both leading and trailing bracket codes', () => {
    expect(stripBracketCodes('[b1] Gestational age [b1]')).toBe('Gestational age');
  });

  it('passthrough for label without any bracket code', () => {
    expect(stripBracketCodes('Edema')).toBe('Edema');
  });

  it('handles empty string', () => {
    expect(stripBracketCodes('')).toBe('');
  });
});

describe('generateTableTitle', () => {
  it('default template + "Edema" grouping label', () => {
    expect(generateTableTitle(DEFAULT_TITLE_TEMPLATE, 'Edema')).toBe(
      'Table 1: Baseline Characteristics, by Edema'
    );
  });

  it('strips bracket prefix from "[c10] Edema"', () => {
    expect(generateTableTitle(DEFAULT_TITLE_TEMPLATE, '[c10] Edema')).toBe(
      'Table 1: Baseline Characteristics, by Edema'
    );
  });

  it('custom template renders correctly', () => {
    expect(
      generateTableTitle(
        'Baseline characteristics stratified by {grouping_label}',
        'Edema'
      )
    ).toBe('Baseline characteristics stratified by Edema');
  });

  it('falls back to default template when null provided', () => {
    expect(generateTableTitle(null, 'Edema')).toBe(
      'Table 1: Baseline Characteristics, by Edema'
    );
  });

  it('falls back to default template when undefined provided', () => {
    expect(generateTableTitle(undefined, 'Edema')).toBe(
      'Table 1: Baseline Characteristics, by Edema'
    );
  });

  it('returns template as-is when missing {grouping_label}', () => {
    expect(
      generateTableTitle('Table 1: Baseline Characteristics', 'Edema')
    ).toBe('Table 1: Baseline Characteristics');
  });
});
