import { INTERACTION_TYPE } from '../domain/taxonomy';
import type { DimensionId, Interaction, ISODate, Person } from '../domain/types';
import { deriveCommitments, type Commitment } from './commitments';
import { evidenceFor, type Evidence } from './evidence';
import { PARAMS } from './params';
import { addDays, daysBetween, humanSpan, num, plural, times } from './time';

export type Level = 'strong' | 'solid' | 'mixed' | 'concern' | 'insufficient';
export type Confidence = 'low' | 'moderate' | 'high';

export interface DimensionResult {
  id: DimensionId;
  level: Level;
  confidence: Confidence;
  /** Distinct interactions contributing evidence. */
  n: number;
  /** Factual statements (counts, dates). Never interpretations. */
  observations: string[];
  /** Calm qualitative phrase for the level. */
  summary: string;
  evidenceIds: string[];
  /** IDs of significant single events (e.g. a broken confidence). */
  severeIds: string[];
  change?: 'improved' | 'declined';
  /** Internal balance in [0,1] used only for ordering; never displayed. */
  balance: number;
}

/** Everything the engine needs about one relationship, restricted to a time window. */
export interface Ctx {
  person: Person;
  /** This person's interactions within [from, asOf], ascending by date. */
  items: Interaction[];
  asOf: ISODate;
  from?: ISODate;
  commitments: Commitment[];
  /** Dates of repair behavior (apology, reconciliation…). Breaches only start to fade after repair. */
  repairDates: ISODate[];
}

const REPAIR_TYPES: Interaction['type'][] = ['apology_received', 'issue_discussed', 'reconciliation', 'behavior_improved', 'trust_restored'];

export function makeCtx(person: Person, interactions: Interaction[], asOf: ISODate, from?: ISODate): Ctx {
  const items = interactions
    .filter((i) => i.personId === person.id && i.date <= asOf && (!from || i.date >= from))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const repairDates = items.filter((i) => REPAIR_TYPES.includes(i.type)).map((i) => i.date);
  return { person, items, asOf, from, commitments: deriveCommitments(items, asOf), repairDates };
}

const SUMMARY: Record<DimensionId, Record<Level, string>> = {
  reciprocity: {
    strong: 'Strong evidence of mutual investment',
    solid: 'Effort appears generally mutual',
    mixed: 'You tend to initiate more often',
    concern: 'Effort currently appears one-sided',
    insufficient: 'Not enough evidence yet',
  },
  reliability: {
    strong: 'Consistently follows through',
    solid: 'Generally reliable',
    mixed: 'Mixed follow-through',
    concern: 'Recent reliability concerns',
    insufficient: 'Not enough evidence yet',
  },
  trust: {
    strong: 'Trust demonstrated repeatedly',
    solid: 'Trust generally supported by evidence',
    mixed: 'Some uncertainty',
    concern: 'Trust concerns worth weighing',
    insufficient: 'Not enough evidence yet',
  },
  care: {
    strong: 'Consistent, demonstrated care',
    solid: 'Shows care',
    mixed: 'Limited recent evidence of care',
    concern: 'Care has seemed limited',
    insufficient: 'Not enough evidence yet',
  },
  mutuality: {
    strong: 'Relationship feels balanced',
    solid: 'Generally balanced',
    mixed: 'Balance varies',
    concern: 'Recently centered more on their needs',
    insufficient: 'Not enough evidence yet',
  },
  growth: {
    strong: 'Consistently encourages growth',
    solid: 'Generally supports your growth',
    mixed: 'Mixed influence',
    concern: 'Interactions often pull away from your goals',
    insufficient: 'Not enough evidence yet',
  },
  respect: {
    strong: 'Boundaries consistently respected',
    solid: 'Generally respectful',
    mixed: 'Some boundary friction',
    concern: 'Repeated boundary concerns',
    insufficient: 'Not enough evidence yet',
  },
  consistency: {
    strong: 'Steady over time',
    solid: 'Reasonably consistent',
    mixed: 'Some cycles of closeness and distance',
    concern: 'Contact tends to resume around requests',
    insufficient: 'Not enough evidence yet',
  },
  safety: {
    strong: 'Emotionally safe',
    solid: 'Generally safe to be open',
    mixed: 'Some uncertainty about openness',
    concern: 'Consider sharing selectively for now',
    insufficient: 'Not enough evidence yet',
  },
  availability: {
    strong: 'Readily available',
    solid: 'Generally available',
    mixed: 'Variable availability',
    concern: 'Limited availability right now',
    insufficient: 'Unknown',
  },
};

export function recencyWeight(date: ISODate, asOf: ISODate): number {
  return 0.5 ** (Math.max(0, daysBetween(date, asOf)) / PARAMS.recencyHalfLifeDays);
}

function confidenceFor(effectiveN: number): Confidence {
  if (effectiveN >= PARAMS.confidenceHigh) return 'high';
  if (effectiveN >= PARAMS.confidenceModerate) return 'moderate';
  return 'low';
}

function result(
  id: DimensionId,
  level: Level,
  confidence: Confidence,
  n: number,
  balance: number,
  observations: string[],
  evidenceIds: string[],
  severeIds: string[] = [],
): DimensionResult {
  return { id, level, confidence, n, balance, observations, evidenceIds, severeIds, summary: SUMMARY[id][level] };
}

/**
 * Recency weight. Routine evidence halves every 180 days; rare high-information
 * events every 365; breaches do not fade by time alone — only after repair.
 */
function evidenceWeight(e: Evidence, ctx: Ctx): number {
  const age = Math.max(0, daysBetween(e.date, ctx.asOf));
  if (e.decay === 'until_repair') {
    return ctx.repairDates.some((d) => d >= e.date) ? 0.5 ** (age / PARAMS.slowHalfLifeDays) : 1;
  }
  return 0.5 ** (age / (e.decay === 'slow' ? PARAMS.slowHalfLifeDays : PARAMS.recencyHalfLifeDays));
}

/** Turns signed, recency-weighted evidence into a qualitative level. Repetition, not single incidents, drives concern. */
export function levelFromEvidence(id: DimensionId, evidence: Evidence[], ctx: Ctx, observations: string[]): DimensionResult {
  let pos = 0;
  let neg = 0;
  const sources = new Map<string, number>();
  const negSources = new Set<string>();
  const severe = new Set<string>();
  for (const e of evidence) {
    const w = evidenceWeight(e, ctx);
    if (e.weight > 0) pos += e.weight * w;
    else neg += -e.weight * w;
    sources.set(e.sourceId, Math.max(sources.get(e.sourceId) ?? 0, w));
    if (e.weight < 0 && daysBetween(e.date, ctx.asOf) <= 365) negSources.add(e.sourceId);
    if (e.severe) severe.add(e.sourceId);
  }
  const n = sources.size;
  const effectiveN = [...sources.values()].reduce((a, b) => a + b, 0);
  const ids = [...sources.keys()];
  if (n < PARAMS.minEvidence || pos + neg === 0) {
    return result(id, 'insufficient', 'low', n, 0.5, observations, ids, [...severe]);
  }
  const r = pos / (pos + neg);
  let level: Level;
  if (r >= 0.8) level = n >= PARAMS.confidenceModerate ? 'strong' : 'solid';
  else if (r >= 0.6) level = 'solid';
  else if (r >= 0.4) level = 'mixed';
  else level = negSources.size >= PARAMS.minNegativeEventsForConcern ? 'concern' : 'mixed';
  // Confidence reflects how much evidence exists; mostly-stale evidence lowers it one step.
  const base = confidenceFor(n);
  const confidence: Confidence = effectiveN >= n / 3 ? base : base === 'high' ? 'moderate' : 'low';
  return result(id, level, confidence, n, r, observations, ids, [...severe]);
}

const count = (items: Interaction[], pred: (i: Interaction) => boolean) => items.filter(pred).length;

/** Contacts with a known initiator, most recent last. */
export function initiations(items: Interaction[]): Interaction[] {
  return items.filter((i) => INTERACTION_TYPE[i.type].contact && (i.actor === 'me' || i.actor === 'them' || i.actor === 'both'));
}

export function contacts(items: Interaction[]): Interaction[] {
  return items.filter((i) => INTERACTION_TYPE[i.type].contact);
}

/**
 * Who initiates, judged tolerantly: friendships run on communal norms, not
 * tit-for-tat. "Concern" needs sustained one-sidedness over a meaningful span
 * AND a corroborating signal (help flowing one way, the user feeling drained,
 * or little other evidence of care). A declared capacity limit softens it.
 */
function reciprocity(ctx: Ctx, care: DimensionResult): DimensionResult {
  const yearAgo = addDays(ctx.asOf, -365);
  const sample = initiations(ctx.items.filter((i) => i.date >= yearAgo)).slice(-PARAMS.initiationSample);
  const meWhole = sample.filter((i) => i.actor === 'me').length;
  const themWhole = sample.filter((i) => i.actor === 'them').length;
  const mutual = sample.length - meWhole - themWhole;
  const me = meWhole + 0.5 * mutual;
  const total = sample.length;
  const offered = count(ctx.items, (i) => i.type === 'help_offered' && i.date >= yearAgo);
  const received = count(ctx.items, (i) => i.type === 'help_received' && i.date >= yearAgo);
  const obs: string[] = [];
  if (total > 0) {
    const tail = `of the last ${plural(total, 'conversation')}${mutual ? ` (${num(mutual)} mutual)` : ''}.`;
    obs.push(meWhole >= themWhole ? `You initiated ${num(meWhole)} ${tail}` : `They initiated ${num(themWhole)} ${tail}`);
  }
  if (offered + received > 0) {
    obs.push(`In the past year you offered help ${times(offered)} and received help ${times(received)}.`);
  }
  const ids = sample.map((i) => i.id);
  if (total < PARAMS.minContactsForReciprocity) {
    return result('reciprocity', 'insufficient', 'low', total, 0.5, obs, ids);
  }
  const meShare = me / total;
  const span = daysBetween(sample[0].date, sample[total - 1].date);
  const halfYearAgo = addDays(ctx.asOf, -182);
  const depleted = count(ctx.items, (i) => i.date >= halfYearAgo && (i.mood === 'drained' || i.mood === 'hurt')) >= 2;
  const helpOneWay = offered >= 3 && received * 2 < offered;
  const littleCare = care.level !== 'strong' && care.level !== 'solid';
  const sustained = meShare >= PARAMS.oneSidedShare && total >= PARAMS.oneSidedMinContacts && span >= PARAMS.oneSidedMinSpanDays;
  let level: Level;
  if (sustained && (depleted || helpOneWay || littleCare) && !ctx.person.capacityNote) level = 'concern';
  else if (meShare > PARAMS.mutualShare) level = 'mixed';
  else level = total >= PARAMS.oneSidedMinContacts ? 'strong' : 'solid';
  if (sustained && ctx.person.capacityNote) obs.push(`You noted their current capacity: ${ctx.person.capacityNote}.`);
  return result('reciprocity', level, confidenceFor(total), total, 1 - Math.max(0, meShare - 0.5) * 2, obs, ids);
}

function reliability(ctx: Ctx): DimensionResult {
  const ev: Evidence[] = [];
  for (const i of ctx.items) ev.push(...evidenceFor(i).filter((e) => e.dimension === 'reliability'));
  const theirs = ctx.commitments.filter((c) => c.owner === 'them' || c.owner === 'both');
  // Overdue open commitments are evidence too, dated when they became overdue.
  for (const c of theirs) {
    if (c.overdue && c.kind === 'promise') {
      ev.push({ dimension: 'reliability', weight: -0.5, date: c.dueDate ?? addDays(c.item.date, PARAMS.commitmentGraceDays), sourceId: c.item.id });
    }
  }
  const obs: string[] = [];
  const promises = theirs.filter((c) => c.kind === 'promise' && c.owner === 'them');
  const kept = promises.filter((c) => c.status === 'kept').length;
  const broken = promises.filter((c) => c.status === 'broken').length;
  const loosePromiseKept = count(ctx.items, (i) => i.type === 'promise_kept' && i.actor === 'them' && !i.relatesTo);
  const loosePromiseBroken = count(ctx.items, (i) => i.type === 'promise_broken' && i.actor === 'them' && !i.relatesTo);
  const totalKept = kept + loosePromiseKept;
  const totalResolved = totalKept + broken + loosePromiseBroken;
  if (totalResolved > 0) obs.push(`Kept ${num(totalKept)} of ${plural(totalResolved, 'resolved promise')}.`);
  const unresolved = promises.filter((c) => c.overdue).length;
  if (unresolved > 0) obs.push(`${num(unresolved, true)} ${unresolved === 1 ? 'promise remains' : 'promises remain'} unresolved past due.`);

  const planEvents = ctx.commitments.filter((c) => c.kind === 'plans').slice(-6);
  const cancelled = planEvents.filter((c) => c.status === 'cancelled' && c.cancelledBy === 'them');
  if (cancelled.length > 0) {
    const never = cancelled.filter((c) => c.neverRescheduled).length;
    obs.push(
      `They cancelled ${num(cancelled.length)} of the last ${plural(planEvents.length, 'planned meeting')}` +
        (never ? `; ${num(never)} never rescheduled.` : ', each time proposing another.'),
    );
  } else {
    const loose = count(ctx.items, (i) => i.type === 'cancelled_plans' && i.actor === 'them' && !i.relatesTo);
    if (loose > 0) obs.push(`They cancelled plans ${times(loose)}.`);
  }
  const collabDone = count(ctx.items, (i) => i.type === 'collaboration_completed' && i.actor !== 'me');
  const collabLate = count(ctx.items, (i) => i.type === 'collaboration_delayed' && i.actor !== 'me');
  if (collabDone + collabLate > 0) obs.push(`Collaborations: ${num(collabDone)} completed, ${num(collabLate)} delayed.`);
  return levelFromEvidence('reliability', ev, ctx, obs);
}

function eventDimension(ctx: Ctx, id: DimensionId, observe: (items: Interaction[]) => string[]): DimensionResult {
  const ev: Evidence[] = [];
  for (const i of ctx.items) ev.push(...evidenceFor(i).filter((e) => e.dimension === id));
  return levelFromEvidence(id, ev, ctx, observe(ctx.items));
}

function tally(items: Interaction[], pred: (i: Interaction) => boolean, text: (n: number) => string): string[] {
  const n = count(items, pred);
  return n > 0 ? [text(n)] : [];
}

const theirs = (i: Interaction) => i.actor === 'them' || i.actor === 'both';

function trust(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'trust', (items) => {
    const advice = items.filter((i) => i.type === 'advice_received' && i.outcome && i.outcome !== 'pending');
    const helpful = advice.filter((i) => i.outcome === 'helpful').length;
    const unhelpful = advice.filter((i) => i.outcome === 'unhelpful').length;
    return [
      ...tally(items, (i) => i.type === 'confidence_kept' && theirs(i), (n) => `Kept a confidence ${times(n)}.`),
      ...tally(items, (i) => i.type === 'confidence_broken' && theirs(i), (n) => `Shared something told in confidence ${times(n)}.`),
      ...(advice.length ? [`Advice with known outcomes: ${num(helpful)} helpful, ${num(advice.length - helpful - unhelpful)} mixed, ${num(unhelpful)} unhelpful.`] : []),
      ...tally(items, (i) => i.type === 'apology_received', (n) => `Apologized ${times(n)}.`),
      ...tally(items, (i) => i.type === 'behavior_improved', (n) => `Behavior improved after an issue ${times(n)}.`),
    ];
  });
}

function care(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'care', (items) => [
    ...tally(items, (i) => i.type === 'reached_out_difficulty' && theirs(i), (n) => `Showed up during difficulty ${times(n)}.`),
    ...tally(items, (i) => i.type === 'celebrated_success' && theirs(i), (n) => `Celebrated your successes ${times(n)}.`),
    ...tally(items, (i) => i.type === 'help_received', (n) => `Helped you ${times(n)}.`),
    ...tally(
      items,
      (i) => i.actor === 'them' && INTERACTION_TYPE[i.type].contact && (i.focus === 'connection' || i.focus === 'support'),
      (n) => `Reached out just to connect or support ${times(n)}.`,
    ),
  ]);
}

function mutuality(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'mutuality', (items) => {
    const withBalance = items.filter((i) => i.balance);
    const balanced = withBalance.filter((i) => i.balance === 'balanced').length;
    const aboutThem = withBalance.filter((i) => i.balance === 'mostly_them').length;
    return withBalance.length
      ? [
          `Of ${plural(withBalance.length, 'conversation')} with recorded balance: ${num(balanced)} balanced, ${num(aboutThem)} mostly about them, ${num(withBalance.length - balanced - aboutThem)} mostly about you.`,
        ]
      : [];
  });
}

function growth(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'growth', (items) => [
    ...tally(items, (i) => i.influence === 'toward', (n) => `${num(n, true)} ${n === 1 ? 'interaction' : 'interactions'} moved you toward who you want to become.`),
    ...tally(items, (i) => i.influence === 'away', (n) => `${num(n, true)} ${n === 1 ? 'interaction' : 'interactions'} pulled you away from it.`),
  ]);
}

function respect(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'respect', (items) => [
    ...tally(items, (i) => i.type === 'boundary_respected' && theirs(i), (n) => `Respected a boundary ${times(n)}.`),
    ...tally(items, (i) => i.type === 'boundary_crossed' && theirs(i), (n) => `Crossed a stated boundary ${times(n)}.`),
    ...tally(items, (i) => i.type === 'felt_pressured' || !!i.concerns?.includes('pressured_decision'), (n) => `You felt pressured ${times(n)}.`),
    ...tally(items, (i) => i.type === 'disagreement_respectful', (n) => `Disagreements handled respectfully ${times(n)}.`),
  ]);
}

function safety(ctx: Ctx): DimensionResult {
  return eventDimension(ctx, 'safety', (items) => {
    const shared = items.filter((i) => i.type === 'vulnerability_shared' && i.actor === 'me' && i.reception);
    const withMood = items.filter((i) => i.mood);
    const low = withMood.filter((i) => i.mood === 'drained' || i.mood === 'hurt').length;
    const out: string[] = [];
    if (shared.length) {
      const supportive = shared.filter((i) => i.reception === 'supportive').length;
      out.push(`When you opened up (${times(shared.length)}), it was received with care ${times(supportive)}.`);
    }
    if (withMood.length >= 3) out.push(`You felt drained or hurt after ${num(low)} of ${plural(withMood.length, 'interaction')} where you noted a feeling.`);
    return out;
  });
}

/** Regularity relative to the relationship's own rhythm: infrequent-but-steady is consistent. */
export function contactGaps(ctx: Ctx) {
  const dates = [...new Set(contacts(ctx.items).map((i) => i.date))].sort();
  const gaps: { from: ISODate; to: ISODate; days: number }[] = [];
  for (let k = 1; k < dates.length; k++) gaps.push({ from: dates[k - 1], to: dates[k], days: daysBetween(dates[k - 1], dates[k]) });
  const sorted = gaps.map((g) => g.days).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const threshold = Math.max(PARAMS.disappearanceMultiplier * median, PARAMS.disappearanceFloorDays);
  const disappearances = gaps.filter((g) => g.days > threshold);
  // After a long silence, did contact resume with them asking for something?
  const reappearWithRequest = disappearances.filter((g) =>
    ctx.items.some(
      (i) =>
        i.date === g.to &&
        i.actor === 'them' &&
        (i.type === 'request_made' || i.focus === 'request' || i.focus === 'opportunity'),
    ),
  );
  return { dates, gaps, median, threshold, disappearances, reappearWithRequest };
}

function consistency(ctx: Ctx): DimensionResult {
  const g = contactGaps(ctx);
  const obs: string[] = [];
  if (g.dates.length >= 2) obs.push(`Typical gap between contacts: about ${humanSpan(g.median)}.`);
  if (g.disappearances.length) {
    obs.push(`${num(g.disappearances.length, true)} unusually long ${g.disappearances.length === 1 ? 'silence' : 'silences'} (longest ${humanSpan(Math.max(...g.disappearances.map((d) => d.days)))}).`);
  }
  if (g.reappearWithRequest.length) {
    const n = g.reappearWithRequest.length;
    obs.push(
      g.disappearances.length === 1
        ? 'It ended with them making a request or proposal.'
        : `${num(n, true)} of those silences ended with them making a request or proposal.`,
    );
  }
  const ids = contacts(ctx.items).map((i) => i.id);
  if (g.dates.length < 4) return result('consistency', 'insufficient', 'low', g.dates.length, 0.5, obs, ids);
  const mean = g.gaps.reduce((a, b) => a + b.days, 0) / g.gaps.length;
  const sd = Math.sqrt(g.gaps.reduce((a, b) => a + (b.days - mean) ** 2, 0) / g.gaps.length);
  const cv = mean ? sd / mean : 0;
  // Silences are shared, so they never count against the other person on their own.
  // Only repeated silence-then-request cycles form a pattern; one or two are observations.
  let level: Level;
  if (g.reappearWithRequest.length >= PARAMS.reappearanceCyclesForPattern) level = 'concern';
  else if (cv > 1.5) level = 'mixed';
  else if (cv < 0.8 && g.dates.length >= PARAMS.confidenceHigh) level = 'strong';
  else level = 'solid';
  const balance = level === 'strong' ? 0.9 : level === 'solid' ? 0.7 : level === 'mixed' ? 0.5 : 0.25;
  return result('consistency', level, confidenceFor(g.dates.length), g.dates.length, balance, obs, ids);
}

/** Availability is capacity, not care. It never lowers the relationship's overall picture. */
function availability(ctx: Ctx): DimensionResult {
  const obs: string[] = [];
  if (ctx.person.capacityNote) obs.push(`Context you noted: ${ctx.person.capacityNote}.`);
  const recentFrom = addDays(ctx.asOf, -90);
  const yearFrom = addDays(ctx.asOf, -365);
  const all = contacts(ctx.items);
  const recent = all.filter((i) => i.date >= recentFrom).length;
  const priorYear = all.filter((i) => i.date >= yearFrom && i.date < recentFrom).length;
  const expectedPer90 = priorYear / 3;
  if (all.length) {
    const typical = priorYear && expectedPer90 >= 1 ? ` (typical: about ${Math.round(expectedPer90)})` : '';
    obs.push(`${num(recent, true)} ${recent === 1 ? 'contact' : 'contacts'} in the last 90 days${typical}.`);
  }
  const invites = ctx.items.filter((i) => i.type === 'invitation' && i.actor === 'me' && i.inviteResponse);
  if (invites.length) {
    const acc = invites.filter((i) => i.inviteResponse === 'accepted' || i.inviteResponse === 'alternative').length;
    obs.push(`Accepted or proposed an alternative for ${num(acc)} of ${plural(invites.length, 'invitation')}.`);
  }
  const ev: Evidence[] = invites.flatMap((i) => evidenceFor(i).filter((e) => e.dimension === 'availability'));
  if (expectedPer90 >= 2) {
    const ratio = recent / expectedPer90;
    ev.push({ dimension: 'availability', weight: ratio >= 0.7 ? 0.6 : ratio >= 0.35 ? 0 : -0.6, date: ctx.asOf, sourceId: 'frequency' });
  }
  return levelFromEvidence('availability', ev, ctx, obs);
}

export function assessDimensions(ctx: Ctx): Record<DimensionId, DimensionResult> {
  const careResult = care(ctx);
  return {
    reciprocity: reciprocity(ctx, careResult),
    reliability: reliability(ctx),
    trust: trust(ctx),
    care: careResult,
    mutuality: mutuality(ctx),
    growth: growth(ctx),
    respect: respect(ctx),
    consistency: consistency(ctx),
    safety: safety(ctx),
    availability: availability(ctx),
  };
}
