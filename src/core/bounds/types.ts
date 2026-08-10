export interface BoundsEntry {
  unit: string;
  lower: number;
  upper: number;
  notes?: string;
}

export interface BoundsConcept {
  concept_id: string;
  label: string;
  aliases: string[];
  metric: BoundsEntry;
  imperial: BoundsEntry;
}

export interface BoundsLibrary {
  version: string;
  population: 'adult' | 'pediatric';
  unit_system_default: 'metric' | 'imperial';
  concepts: BoundsConcept[];
}

export interface BoundsViolation {
  value: number;
  rowIndex: number;
}
