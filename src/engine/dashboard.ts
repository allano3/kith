import { CIRCLE } from '../domain/taxonomy';
import type { Interaction, ISODate, Person, Settings } from '../domain/types';
import type { Assessment } from './assess';
import type { Commitment } from './commitments';
import { initiations, type Level } from './dimensions';
import { PARAMS } from './params';
import { addDays, daysBetween, humanSpan, num, times } from './time';

export interface DashboardItem {
  person: Person;
  assessment: Assessment;
  reason: string;
}

export interface Dashboard {
  closest: DashboardItem[];
  nurture: DashboardItem[];
  recalibrate: DashboardItem[];
  boundaries: DashboardItem[];
  improving: DashboardItem[];
  pendingDecisions: { person: Person; interaction: Interaction }[];
  myCommitments: { person: Person; commitment: Commitment }[];
  theirOverdue: { person: Person; commitment: Commitment }[];
  investmentCheckDue: boolean;
  /** How many people the user placed in the inner circle, when that exceeds the soft guidance. */
  innerCircleCount: number;
}

const POSITIVE: Level[] = ['strong', 'solid'];
const BOUNDARY_PATTERNS = ['repeated_cancellations', 'low_follow_through', 'boundaries', 'transactional', 'drained'];

function coreConcern(a: Assessment): boolean {
  return (['trust', 'reliability', 'reciprocity', 'safety', 'respect'] as const).some((d) => a.dimensions[d].level === 'concern');
}

export function buildDashboard(people: Person[], assessments: Map<string, Assessment>, interactions: Interaction[], settings: Settings, asOf: ISODate): Dashboard {
  const active = people.filter((p) => !p.archived);
  const list = active.map((p) => assessments.get(p.id)!).filter(Boolean);

  // Closest: strongest demonstrated combination — frequency of contact is deliberately not a factor.
  const closest = list
    .filter((a) => a.suggestedCircle === 1 || a.suggestedCircle === 2)
    .sort((a, b) => b.closeness - a.closeness)
    .slice(0, PARAMS.innerCircleSize)
    .map((a) => ({ person: a.person, assessment: a, reason: a.strengths.slice(0, 3).join(' · ') || 'Consistently positive evidence' }));

  const nurture: DashboardItem[] = [];
  for (const a of list) {
    if (coreConcern(a) || a.person.categories.includes('dating_interest')) continue;
    const positive = (['trust', 'reliability', 'reciprocity', 'care', 'mutuality', 'safety'] as const).filter((d) => POSITIVE.includes(a.dimensions[d].level));
    if (positive.length < 3) continue;
    const circle = a.person.circle ?? a.suggestedCircle ?? 3;
    const cadence = PARAMS.nurtureCadenceDays[circle];
    if (a.daysSinceMeaningful !== null && a.daysSinceMeaningful > cadence) {
      nurture.push({ person: a.person, assessment: a, reason: `Healthy mutuality; last meaningful contact ${humanSpan(a.daysSinceMeaningful)} ago.` });
    } else if (a.expectationGap === 'below') {
      nurture.push({ person: a.person, assessment: a, reason: 'Evidence suggests more closeness than the circle you have placed them in.' });
    }
  }

  const recalibrate: DashboardItem[] = [];
  for (const a of list) {
    if (a.expectationGap === 'exceeds') {
      // Name what actually drives the gap; "reciprocity" only when effort is the issue.
      const drivers = Object.values(a.dimensions)
        .filter((d) => d.level === 'concern' && d.id !== 'availability')
        .map((d) => d.summary);
      const reciprocal = a.dimensions.reciprocity.level === 'concern' || a.dimensions.reciprocity.level === 'mixed';
      recalibrate.push({
        person: a.person,
        assessment: a,
        reason:
          `Placed in ${CIRCLE[a.person.circle!].name.toLowerCase()}; evidence currently suggests ${CIRCLE[a.suggestedCircle!].name.toLowerCase()}` +
          (drivers.length ? ` (${drivers.join('; ').toLowerCase()}). ` : '. ') +
          (reciprocal ? 'Your expectations may exceed demonstrated reciprocity.' : 'Your expectations may exceed what the relationship has shown so far.'),
      });
    } else if (a.dimensions.reciprocity.level === 'concern' && a.person.circle && a.person.circle <= 3) {
      recalibrate.push({ person: a.person, assessment: a, reason: a.dimensions.reciprocity.observations[0] ?? a.dimensions.reciprocity.summary });
    }
  }

  const boundaries: DashboardItem[] = [];
  for (const a of list) {
    const hits = a.patterns.filter(
      (p) =>
        p.kind === 'concern' &&
        (BOUNDARY_PATTERNS.includes(p.id) || p.id.startsWith('reappearance_') || p.id.startsWith('significant_')) &&
        !(p.dimension && a.dimensions[p.dimension].change === 'improved'),
    );
    const severe = hits.some((p) => p.id === 'boundaries' || p.id.startsWith('significant_'));
    if (hits.length >= 2 || severe) boundaries.push({ person: a.person, assessment: a, reason: hits.map((p) => p.title).join(' · ') });
  }

  const improving = list
    .filter((a) => a.trend === 'improving' || a.patterns.some((p) => p.id === 'reconnection'))
    .map((a) => ({
      person: a.person,
      assessment: a,
      reason: a.patterns.find((p) => p.kind === 'change')?.title ?? 'Relationship appears to be strengthening',
    }));

  const byId = new Map(active.map((p) => [p.id, p]));
  const pendingDecisions = interactions
    .filter((i) => i.decision?.status === 'open' && byId.has(i.personId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((interaction) => ({ person: byId.get(interaction.personId)!, interaction }));

  const myCommitments: Dashboard['myCommitments'] = [];
  const theirOverdue: Dashboard['theirOverdue'] = [];
  for (const a of list) {
    for (const c of a.openCommitments) {
      if (c.owner === 'me' || (c.kind === 'plans' && c.owner === 'both')) myCommitments.push({ person: a.person, commitment: c });
      else if (c.overdue) theirOverdue.push({ person: a.person, commitment: c });
    }
  }
  myCommitments.sort((x, y) => (x.commitment.dueDate ?? '9999').localeCompare(y.commitment.dueDate ?? '9999'));

  const investmentCheckDue =
    active.length >= 3 &&
    (!settings.lastInvestmentCheck || daysBetween(settings.lastInvestmentCheck, asOf) >= PARAMS.investmentCheckDays);

  return {
    closest,
    nurture,
    recalibrate,
    boundaries,
    improving,
    pendingDecisions,
    myCommitments,
    theirOverdue,
    investmentCheckDue,
    innerCircleCount: active.filter((p) => p.circle === 1).length,
  };
}

export interface MirrorStat {
  question: string;
  observation: string;
  tone: 'positive' | 'neutral' | 'uncertain';
}

export interface Mirror {
  stats: MirrorStat[];
  neglected: { person: Person; days: number | null }[];
  expectingMore: { person: Person; observation: string }[];
  prompts: string[];
}

/** The same standards, reflected back toward the user. */
export function buildMirror(people: Person[], assessments: Map<string, Assessment>, interactions: Interaction[], asOf: ISODate): Mirror {
  const yearAgo = addDays(asOf, -365);
  const active = people.filter((p) => !p.archived);
  const activeIds = new Set(active.map((p) => p.id));
  const year = interactions.filter((i) => i.date >= yearAgo && i.date <= asOf && activeIds.has(i.personId));
  const stats: MirrorStat[] = [];

  const myKept = year.filter((i) => i.type === 'promise_kept' && i.actor === 'me').length;
  const myBroken = year.filter((i) => i.type === 'promise_broken' && i.actor === 'me').length;
  const myOverdue = [...assessments.values()]
    .filter((a) => activeIds.has(a.person.id))
    .flatMap((a) => a.openCommitments.filter((c) => c.owner === 'me' && c.overdue)).length;
  stats.push({
    question: 'Do you follow through?',
    observation:
      myKept + myBroken + myOverdue === 0
        ? 'No commitments of yours recorded in the past year.'
        : `You kept ${num(myKept)} and broke ${num(myBroken)} of your promises this year; ${num(myOverdue)} ${myOverdue === 1 ? 'is' : 'are'} overdue.`,
    tone: myBroken + myOverdue === 0 ? 'positive' : myBroken + myOverdue > myKept ? 'uncertain' : 'neutral',
  });

  const myCancels = year.filter((i) => i.type === 'cancelled_plans' && i.actor === 'me');
  const theirCancels = year.filter((i) => i.type === 'cancelled_plans' && i.actor === 'them').length;
  stats.push({
    question: 'Are you available?',
    observation: `You cancelled plans ${times(myCancels.length)} this year (${num(myCancels.filter((i) => i.rescheduleOffered).length)} with another time offered). Others cancelled on you ${times(theirCancels)}.`,
    tone: myCancels.length === 0 ? 'positive' : myCancels.length > theirCancels ? 'uncertain' : 'neutral',
  });

  const inits = initiations(year);
  const meInit = inits.filter((i) => i.actor === 'me').length;
  const themInit = inits.filter((i) => i.actor === 'them').length;
  if (inits.length) {
    stats.push({
      question: 'Do you initiate?',
      observation: `Across all relationships this year, you started ${num(meInit)} conversations and others started ${num(themInit)}.`,
      tone: meInit >= themInit * 0.6 ? 'positive' : 'uncertain',
    });
  }

  const myBreaches = year.filter((i) => i.type === 'confidence_broken' && i.actor === 'me').length;
  const myKeeps = year.filter((i) => i.type === 'confidence_kept' && i.actor === 'me').length;
  stats.push({
    question: 'Do you keep confidences?',
    observation: myBreaches ? `You recorded passing on something shared in confidence ${times(myBreaches)}.` : myKeeps ? `You recorded keeping a confidence ${times(myKeeps)}.` : 'Nothing recorded either way.',
    tone: myBreaches ? 'uncertain' : 'positive',
  });

  const helped = year.filter((i) => i.type === 'help_offered').length;
  const showedUp = year.filter((i) => (i.type === 'reached_out_difficulty' || i.type === 'celebrated_success') && i.actor === 'me').length;
  stats.push({
    question: 'Do you show up?',
    observation: `You offered help ${times(helped)} and showed up for someone’s hardship or success ${times(showedUp)} this year.`,
    tone: helped + showedUp > 0 ? 'positive' : 'neutral',
  });

  // People the user values most who haven't heard from the user in a while.
  const neglected: Mirror['neglected'] = [];
  const expectingMore: Mirror['expectingMore'] = [];
  for (const p of active) {
    const a = assessments.get(p.id);
    if (!a) continue;
    const valued = (p.circle && p.circle <= 2) || a.suggestedCircle === 1 || a.suggestedCircle === 2;
    const mineToThem = interactions.filter((i) => i.personId === p.id && i.actor === 'me' && i.date <= asOf).sort((x, y) => x.date.localeCompare(y.date));
    const lastMine = mineToThem.at(-1);
    const days = lastMine ? daysBetween(lastMine.date, asOf) : null;
    const cadence = PARAMS.nurtureCadenceDays[p.circle ?? a.suggestedCircle ?? 3];
    if (valued && (days === null || days > cadence)) neglected.push({ person: p, days });

    const sample = initiations(interactions.filter((i) => i.personId === p.id && i.date <= asOf)).slice(-PARAMS.initiationSample);
    const theirs = sample.filter((i) => i.actor === 'them').length;
    if (sample.length >= PARAMS.minContactsForReciprocity && theirs / sample.length >= PARAMS.oneSidedShare) {
      expectingMore.push({ person: p, observation: `${p.name} started ${num(theirs)} of your last ${num(sample.length)} conversations.` });
    }
    const myCancelsWith = interactions.filter((i) => i.personId === p.id && i.type === 'cancelled_plans' && i.actor === 'me' && i.date >= yearAgo).length;
    if (a.dimensions.reliability.level === 'concern' && myCancelsWith >= 2) {
      expectingMore.push({ person: p, observation: `You noted reliability concerns with ${p.name}, and you also cancelled on them ${times(myCancelsWith)} this year.` });
    }
  }

  const prompts = [
    'Are you investing in the people who matter most to you?',
    'Are you expecting from others what you do not consistently provide yourself?',
    'Who has shown up for you recently — and do they know it mattered?',
  ];
  return { stats, neglected, expectingMore, prompts };
}
