/**
 * Tunable heuristics. None of these are empirical constants — they are
 * conservative defaults derived in docs/RESEARCH.md §6. Changing a value here
 * changes behavior everywhere; tests pin the behavior that matters.
 */
export const PARAMS = {
  /** Routine evidence weight halves every N days (recent behavior matters more, history still counts). */
  recencyHalfLifeDays: 180,
  /** Rare, high-information events (crisis support, costly help) fade more slowly. */
  slowHalfLifeDays: 365,
  /** Multiplier for positive events the user marks as costly for the other person. */
  costlyMultiplier: 1.5,
  /** "Recent" window used for change detection and trends. */
  recentWindowDays: 180,
  /** Earlier comparison window ends where the recent one begins and spans this many days (6–18 months ago). */
  earlierWindowDays: 365,
  /** Each window needs this many data points before a change is reported. */
  minEvidenceForChange: 3,

  /** Below this many data points a dimension is "not enough evidence yet". */
  minEvidence: 3,
  /** Confidence thresholds on (recency-weighted) number of data points: low 3–5, moderate 6–11, high 12+. */
  confidenceModerate: 6,
  confidenceHigh: 12,
  /** A negative level requires at least this many negative events in the last year (patterns over incidents). */
  minNegativeEventsForConcern: 2,

  /** Reciprocity: the trailing initiations considered (within the last year). */
  initiationSample: 16,
  /** Reciprocity: below this many initiations, balance is not judged. */
  minContactsForReciprocity: 8,
  /** Reciprocity: the user initiating at least this share is an observation (low confidence). */
  unevenShare: 0.75,
  /** Reciprocity: "sustained one-sidedness" requires this share … */
  oneSidedShare: 0.8,
  /** … over at least this many initiations … */
  oneSidedMinContacts: 12,
  /** … spanning at least this many days, plus a corroborating signal (see dimensions.ts). */
  oneSidedMinSpanDays: 90,
  /** Reciprocity: user initiating up to this share is comfortably mutual (communal norms tolerate imbalance). */
  mutualShare: 0.6,

  /** Transactional: share of their initiations centered on requests/opportunities. */
  transactionalShare: 0.6,
  minInitiationsForTransactional: 4,

  /** A gap is a "long silence" if longer than max(multiplier × median gap, floor days). */
  disappearanceMultiplier: 3,
  disappearanceFloorDays: 60,
  /** Silence-then-request cycles before it becomes a pattern rather than an observation. */
  reappearanceCyclesForPattern: 3,

  /** An open commitment without due date counts as overdue after N days. */
  commitmentGraceDays: 30,

  /** Days without meaningful contact before a gentle check-in prompt, per circle. Never an automatic demotion. */
  nurtureCadenceDays: { 1: 30, 2: 90, 3: 180, 4: 365, 5: 100000 } as Record<number, number>,
  /** No contact for this long → dormant. */
  dormantDays: 270,
  /** Reconnection: previously inactive at least this long, now at least `reconnectContacts` contacts in `reconnectWindowDays`. */
  reconnectGapDays: 180,
  reconnectContacts: 3,
  reconnectWindowDays: 90,

  /** "Forming" relationships (known < N months or < M interactions) are never suggested for circles 1–2. */
  formingMonths: 3,
  formingInteractions: 10,
  /** Minimum months of history before the engine suggests inner circle. */
  innerCircleMinMonths: 12,
  closeCircleMinMonths: 6,
  /** Minimum total interactions before any circle is suggested. */
  minInteractionsForCircle: 5,
  /** Soft guidance on inner-circle size (Dunbar's ~5 support clique). */
  innerCircleSize: 5,
  /** A gentle note appears when the user's inner circle exceeds this. */
  innerCircleSoftMax: 10,

  /** Trust after a breach: "recovering" after N trustworthy acts over D days; "eligible for restoring" after more. */
  trustRecoveringActs: 3,
  trustRecoveringDays: 60,
  trustRestorableActs: 6,
  trustRestorableDays: 180,

  /** Dating view needs this many logged interactions before any summary. */
  datingMinInteractions: 4,

  /** How often the app asks "does your investment match the evidence?" */
  investmentCheckDays: 30,
} as const;
