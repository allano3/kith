/**
 * Every analyst answer — local or model-generated — uses the same four
 * sections. This separation is the product's central design principle.
 */
export interface AnalystAnswer {
  /** Directly recorded events and counts. */
  facts: string[];
  /** Regularities across time. */
  patterns: string[];
  /** Hedged readings of what the patterns might mean. Never motives or diagnoses. */
  interpretations: string[];
  /** What the record cannot tell. */
  unknowns: string[];
  /** Names of people the answer draws on (for linking). */
  people: string[];
  /** Where the answer came from. */
  source: 'local' | 'model';
}

export const ANSWER_SECTIONS: { key: keyof Pick<AnalystAnswer, 'facts' | 'patterns' | 'interpretations' | 'unknowns'>; label: string }[] = [
  { key: 'facts', label: 'Known facts' },
  { key: 'patterns', label: 'Observed patterns' },
  { key: 'interpretations', label: 'Possible interpretations' },
  { key: 'unknowns', label: 'Unknowns' },
];
