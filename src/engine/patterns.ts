import { DIMENSION, GREEN_FLAG, INTERACTION_TYPE, REQUEST_KIND_PHRASE } from '../domain/taxonomy';
import type { DimensionId, GreenFlagId, Interaction } from '../domain/types';
import { contactGaps, contacts, initiations, type Ctx, type DimensionResult } from './dimensions';
import { evidenceFor, flagsDescribeThem, impliedFlags, isTheirs } from './evidence';
import { PARAMS } from './params';
import { addDays, daysBetween, formatMonth, humanSpan, num, plural, times } from './time';

export type PatternKind = 'strength' | 'concern' | 'change' | 'context';

/**
 * A detected pattern always separates what was observed (facts, counts) from
 * a hedged interpretation. Interpretations never assign motive or character.
 */
export interface Pattern {
  id: string;
  kind: PatternKind;
  title: string;
  observation: string;
  interpretation: string;
  suggestion?: string;
  dimension?: DimensionId;
  evidenceIds: string[];
}

export interface FlagTally {
  id: GreenFlagId;
  label: string;
  count: number;
  lastDate: string;
}

export function greenFlagTally(items: Interaction[]): FlagTally[] {
  const tally = new Map<GreenFlagId, FlagTally>();
  for (const i of items) {
    const flags = new Set<GreenFlagId>([...impliedFlags(i), ...(flagsDescribeThem(i) ? (i.greenFlags ?? []) : [])]);
    for (const f of flags) {
      const t = tally.get(f) ?? { id: f, label: GREEN_FLAG[f].label, count: 0, lastDate: i.date };
      t.count += 1;
      if (i.date > t.lastDate) t.lastDate = i.date;
      tally.set(f, t);
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
}

const REPAIR_TYPES = new Set(['apology_received', 'issue_discussed', 'reconciliation', 'behavior_improved', 'boundary_established']);

export function detectPatterns(
  ctx: Ctx,
  dims: Record<DimensionId, DimensionResult>,
  recent: Record<DimensionId, DimensionResult>,
): Pattern[] {
  const out: Pattern[] = [];
  const { items, asOf } = ctx;
  const yearAgo = addDays(asOf, -365);

  // ── Initiation (trailing year) ──
  const sample = initiations(items.filter((i) => i.date >= yearAgo)).slice(-PARAMS.initiationSample);
  const meCount = sample.filter((i) => i.actor === 'me').length;
  const themNonRequest = sample.filter((i) => i.actor === 'them' && i.type !== 'request_made' && i.focus !== 'request' && i.focus !== 'opportunity');
  const meShare = sample.length ? (meCount + 0.5 * sample.filter((i) => i.actor === 'both').length) / sample.length : 0;
  if (dims.reciprocity.level === 'concern') {
    out.push({
      id: 'one_sided_initiation',
      kind: 'concern',
      dimension: 'reciprocity',
      title: 'One-sided initiation',
      observation: `You initiated ${num(meCount)} of the last ${num(sample.length)} conversations.`,
      interpretation: 'Effort may currently be uneven. This can reflect their capacity or season of life as much as their interest.',
      suggestion: 'Consider adjusting your expectations — or asking directly — until their behavior becomes more consistent.',
      evidenceIds: sample.map((i) => i.id),
    });
  } else if (sample.length >= PARAMS.minContactsForReciprocity && meShare >= PARAMS.unevenShare) {
    out.push({
      id: 'uneven_initiation',
      kind: 'context',
      dimension: 'reciprocity',
      title: 'You usually initiate',
      observation: `You initiated ${num(meCount)} of the last ${num(sample.length)} conversations.`,
      interpretation: ctx.person.capacityNote
        ? `You noted their current capacity (${ctx.person.capacityNote}). Uneven initiation during a demanding season is common and not, on its own, a sign of low regard.`
        : 'Friendships rarely balance exactly, and people differ in how often they reach out. Worth watching, not concluding from.',
      evidenceIds: sample.map((i) => i.id),
    });
  } else if (sample.length >= PARAMS.minContactsForReciprocity && themNonRequest.length > meCount && themNonRequest.length >= sample.length / 2) {
    out.push({
      id: 'they_initiate',
      kind: 'strength',
      dimension: 'reciprocity',
      title: 'They make the effort',
      observation: `They initiated ${num(themNonRequest.length)} of the last ${num(sample.length)} conversations, not counting requests.`,
      interpretation: 'They appear invested in staying connected.',
      evidenceIds: themNonRequest.map((i) => i.id),
    });
  }

  // ── Plans & commitments ──
  const plans = ctx.commitments.filter((c) => c.kind === 'plans').slice(-6);
  const cancelledByThem = plans.filter((c) => c.status === 'cancelled' && c.cancelledBy === 'them');
  if (cancelledByThem.length >= 2 && cancelledByThem.length >= plans.length / 2) {
    const never = cancelledByThem.filter((c) => c.neverRescheduled).length;
    out.push({
      id: 'repeated_cancellations',
      kind: 'concern',
      dimension: 'reliability',
      title: 'Repeated cancellations',
      observation:
        `${num(cancelledByThem.length, true)} of the last ${num(plans.length)} planned meetings were cancelled by them` +
        (never ? `; ${num(never)} ${never === 1 ? 'was' : 'were'} never rescheduled.` : ', each with another time proposed.'),
      interpretation: 'Plans with this person have often not held. This may reflect limited capacity rather than low regard.',
      suggestion: never ? 'Consider lighter-weight plans, or letting them propose the next time.' : undefined,
      evidenceIds: cancelledByThem.map((c) => c.item.id),
    });
  }

  const theirPromises = ctx.commitments.filter((c) => c.kind === 'promise' && c.owner === 'them');
  const overdue = theirPromises.filter((c) => c.overdue);
  const brokenYear = theirPromises.filter((c) => c.status === 'broken' && c.item.date >= yearAgo);
  if (overdue.length + brokenYear.length >= 2) {
    out.push({
      id: 'low_follow_through',
      kind: 'concern',
      dimension: 'reliability',
      title: 'Low follow-through',
      observation: [
        overdue.length ? `${num(overdue.length, true)} ${overdue.length === 1 ? 'commitment has' : 'commitments have'} remained unresolved.` : '',
        brokenYear.length ? `${num(brokenYear.length, true)} ${brokenYear.length === 1 ? 'was' : 'were'} not kept in the past year.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      interpretation: 'Their words and follow-through have not consistently matched recently.',
      suggestion: 'Consider relying on their commitments lightly until follow-through becomes more consistent.',
      evidenceIds: [...overdue, ...brokenYear].map((c) => c.item.id),
    });
  }
  const keptYear = theirPromises.filter((c) => c.status === 'kept' && c.item.date >= yearAgo);
  if (keptYear.length >= 3 && brokenYear.length === 0 && overdue.length === 0) {
    out.push({
      id: 'follows_through',
      kind: 'strength',
      dimension: 'reliability',
      title: 'Follows through',
      observation: `Kept all ${num(keptYear.length)} promises made in the past year.`,
      interpretation: 'Their word appears dependable.',
      evidenceIds: keptYear.map((c) => c.item.id),
    });
  }

  // ── Transactional ──
  const theirInits = initiations(items)
    .filter((i) => i.actor === 'them' && i.date >= yearAgo)
    .slice(-8);
  const requestLike = theirInits.filter((i) => i.type === 'request_made' || i.focus === 'request' || i.focus === 'opportunity');
  if (theirInits.length >= PARAMS.minInitiationsForTransactional && requestLike.length / theirInits.length >= PARAMS.transactionalShare) {
    out.push({
      id: 'transactional',
      kind: 'concern',
      dimension: 'mutuality',
      title: 'Mostly request-centered contact',
      observation: `${num(requestLike.length, true)} of the previous ${num(theirInits.length)} conversations they started began with a request, introduction, project or favor.`,
      interpretation: 'This may indicate that the relationship has recently been more transactional.',
      suggestion: 'Before agreeing to the next request, it may help to understand what is being asked and why now.',
      evidenceIds: requestLike.map((i) => i.id),
    });
  }

  // ── Rhythm ──
  const gaps = contactGaps(ctx);
  const cycles = gaps.reappearWithRequest.length;
  for (const g of gaps.reappearWithRequest) {
    const req = items.find((i) => i.date === g.to && i.actor === 'them' && (i.type === 'request_made' || i.focus === 'request' || i.focus === 'opportunity'))!;
    const what = req.requestKind ? REQUEST_KIND_PHRASE[req.requestKind] : 'a request';
    out.push({
      id: `reappearance_${req.id}`,
      kind: cycles >= PARAMS.reappearanceCyclesForPattern ? 'concern' : 'context',
      dimension: 'consistency',
      title: cycles >= PARAMS.reappearanceCyclesForPattern ? 'Contact tends to resume around requests' : 'Contact resumed with a request',
      observation: `After ${humanSpan(g.days)} without contact, they got in touch in ${formatMonth(g.to)} with ${what}.`,
      interpretation:
        cycles >= PARAMS.reappearanceCyclesForPattern
          ? `This has happened ${times(cycles)}. When contact repeatedly resumes around requests, it is reasonable to understand the objective before committing.`
          : 'A single instance says little about motive. It is still reasonable to understand the objective before committing.',
      evidenceIds: [req.id],
    });
  }

  const lastContact = gaps.dates.at(-1);
  if (lastContact && daysBetween(lastContact, asOf) >= PARAMS.dormantDays) {
    out.push({
      id: 'dormant',
      kind: 'context',
      title: 'Quiet season',
      observation: `No recorded contact for ${humanSpan(daysBetween(lastContact, asOf))}.`,
      interpretation: 'A relationship can remain genuine through quiet seasons. Infrequent contact alone says little about its quality.',
      suggestion: 'If this relationship matters to you, a low-pressure check-in is an easy way to find out where it stands.',
      evidenceIds: [],
    });
  }

  const reconnectFrom = addDays(asOf, -PARAMS.reconnectWindowDays);
  const recentContactDates = gaps.dates.filter((d) => d >= reconnectFrom);
  const priorDates = gaps.dates.filter((d) => d < reconnectFrom);
  const lastPrior = priorDates.at(-1);
  if (
    recentContactDates.length >= PARAMS.reconnectContacts &&
    lastPrior &&
    daysBetween(lastPrior, recentContactDates[0]) >= PARAMS.reconnectGapDays
  ) {
    out.push({
      id: 'reconnection',
      kind: 'change',
      title: 'Reconnection',
      observation: `After ${humanSpan(daysBetween(lastPrior, recentContactDates[0]))} of little contact, you've connected ${times(recentContactDates.length)} in the last three months.`,
      interpretation: 'This friendship appears to be becoming more active again.',
      evidenceIds: contacts(items)
        .filter((i) => i.date >= reconnectFrom)
        .map((i) => i.id),
    });
  }

  // ── Care in hard times ──
  const showedUp = items.filter((i) => i.type === 'reached_out_difficulty' && isTheirs(i));
  if (showedUp.length) {
    out.push({
      id: 'shows_up',
      kind: 'strength',
      dimension: 'care',
      title: 'Shows up in hard times',
      observation: `Was there for you during difficulty ${times(showedUp.length)}, most recently in ${formatMonth(showedUp.at(-1)!.date)}.`,
      interpretation: 'Presence during difficulty is one of the clearer signals of care.',
      evidenceIds: showedUp.map((i) => i.id),
    });
  }

  // ── Boundaries ──
  const crossed = items.filter((i) => ((i.type === 'boundary_crossed' && i.actor === 'them') || i.type === 'felt_pressured' || i.concerns?.includes('guilt_after_no')) && i.date >= yearAgo);
  if (crossed.length >= 2) {
    out.push({
      id: 'boundaries',
      kind: 'concern',
      dimension: 'respect',
      title: 'Boundary friction',
      observation: `${num(crossed.length, true)} times in the past year a boundary was crossed or you felt pressured.`,
      interpretation: 'Your limits have not consistently been honored recently.',
      suggestion: 'Consider maintaining stronger boundaries until additional trust is established.',
      evidenceIds: crossed.map((i) => i.id),
    });
  }

  // ── Significant single events, with any repair that followed ──
  const severeIds = new Set([...dims.trust.severeIds, ...dims.safety.severeIds]);
  for (const id of severeIds) {
    const ev = items.find((i) => i.id === id);
    if (!ev) continue;
    const repair = items.filter((i) => i.date >= ev.date && REPAIR_TYPES.has(i.type));
    // Trust returns through counter-evidence, not elapsed time.
    const later = items.filter((i) => i.date > ev.date);
    const newBreach = later.some((i) => evidenceFor(i).some((e) => e.severe));
    const acts = later.filter((i) => evidenceFor(i).some((e) => (e.dimension === 'trust' || e.dimension === 'reliability') && e.weight > 0));
    const span = acts.length ? daysBetween(ev.date, acts.at(-1)!.date) : 0;
    let recovery: string;
    if (newBreach) recovery = 'There has been another significant event since.';
    else if (acts.length >= PARAMS.trustRestorableActs && span >= PARAMS.trustRestorableDays) {
      recovery = `Since then, ${plural(acts.length, 'trustworthy act')} over ${humanSpan(span)}. The evidence would support restoring trust, if you choose to.`;
    } else if (acts.length >= PARAMS.trustRecoveringActs && span >= PARAMS.trustRecoveringDays) {
      recovery = `Since then, ${plural(acts.length, 'trustworthy act')} over ${humanSpan(span)}. Trust appears to be recovering.`;
    } else recovery = 'It is still early to judge whether trust is rebuilding.';
    out.push({
      id: `significant_${id}`,
      kind: repair.length && !newBreach ? 'context' : 'concern',
      dimension: 'trust',
      title: 'Significant event',
      observation:
        `In ${formatMonth(ev.date)}, something you shared privately was passed on or used.` +
        (repair.length ? ` Since then: ${[...new Set(repair.map((r) => INTERACTION_TYPE[r.type].label.toLowerCase()))].join(', ')}.` : ''),
      interpretation: repair.length
        ? `Repair has begun. ${recovery}`
        : `A single event does not define a relationship, but it is reasonable to share selectively until trust is re-established. ${recovery}`,
      evidenceIds: [id, ...repair.map((r) => r.id)],
    });
  }

  // ── Conflict and repair ──
  const conflicts = items.filter((i) => i.type === 'conflict');
  for (const c of conflicts.slice(-2)) {
    const repair = items.filter((i) => REPAIR_TYPES.has(i.type) && i.date >= c.date && daysBetween(c.date, i.date) <= 90);
    if (repair.length) {
      out.push({
        id: `repair_${c.id}`,
        kind: 'strength',
        title: 'Conflict followed by repair',
        observation: `After the conflict in ${formatMonth(c.date)}: ${[...new Set(repair.map((r) => INTERACTION_TYPE[r.type].label.toLowerCase()))].join(', ')}.`,
        interpretation: 'Conflict is normal in close relationships; what follows it often matters more.',
        evidenceIds: [c.id, ...repair.map((r) => r.id)],
      });
    }
  }

  // ── Forgiveness vs trust ──
  const forgiven = items.filter((i) => i.type === 'forgiven').at(-1);
  if (forgiven) {
    const after = ctx.commitments.filter((c) => c.owner === 'them' && c.kind === 'promise' && c.item.date >= forgiven.date);
    const kept = after.filter((c) => c.status === 'kept').length;
    const broken = after.filter((c) => c.status === 'broken').length;
    const restored = items.some((i) => i.type === 'trust_restored' && i.date >= forgiven.date);
    out.push({
      id: 'forgiveness',
      kind: 'context',
      dimension: 'trust',
      title: 'Forgiveness and trust',
      observation: `You forgave in ${formatMonth(forgiven.date)}. Since then: ${num(kept)} promises kept, ${num(broken)} broken${restored ? '; you have marked trust as restored' : ''}.`,
      interpretation: restored
        ? 'Forgiveness and restored trust are both recorded. The evidence since can tell you whether that trust is holding.'
        : 'Forgiveness is yours to give; trust can rebuild gradually through evidence like this.',
      evidenceIds: [forgiven.id, ...after.map((c) => c.item.id)],
    });
  }

  // ── The user's own experience ──
  const felt = items.filter((i) => i.mood).slice(-5);
  const low = felt.filter((i) => i.mood === 'drained' || i.mood === 'hurt');
  if (felt.length >= 3 && low.length >= 3) {
    out.push({
      id: 'drained',
      kind: 'concern',
      dimension: 'safety',
      title: 'How you have been feeling',
      observation: `You noted feeling drained or hurt after ${num(low.length)} of the last ${num(felt.length)} interactions where you recorded a feeling.`,
      interpretation: 'This describes your experience, not their intent — but your experience is worth taking seriously.',
      suggestion: 'It may help to reflect on what specifically happens in these interactions.',
      evidenceIds: low.map((i) => i.id),
    });
  }

  const offered = items.filter((i) => i.type === 'help_offered' && i.date >= yearAgo);
  const received = items.filter((i) => i.type === 'help_received' && i.date >= yearAgo);
  if (offered.length >= 4 && received.length * 4 <= offered.length) {
    out.push({
      id: 'help_imbalance',
      kind: 'context',
      dimension: 'reciprocity',
      title: 'Help has mostly flowed one way',
      observation: `In the past year you offered help ${times(offered.length)} and received help ${times(received.length)}.`,
      interpretation: 'Close friendships do not need to balance exactly, especially when someone is in a hard season. If it feels heavy, it may be worth naming.',
      evidenceIds: [...offered, ...received].map((i) => i.id),
    });
  }

  // ── Change over time ──
  for (const id of ['reliability', 'trust', 'respect', 'care', 'reciprocity'] as DimensionId[]) {
    const change = dims[id].change;
    if (!change) continue;
    const label = DIMENSION[id].label.toLowerCase();
    out.push({
      id: `change_${id}`,
      kind: 'change',
      dimension: id,
      title: change === 'improved' ? `${DIMENSION[id].label} improving` : `${DIMENSION[id].label} declining`,
      observation:
        change === 'improved'
          ? `There were ${label} concerns earlier, but over the previous six months the evidence is consistently positive.` +
            (recent[id].observations[0] ? ` ${recent[id].observations[0]}` : '')
          : `Earlier ${label} evidence was positive; the last six months look different.` +
            (recent[id].observations[0] ? ` ${recent[id].observations[0]}` : ''),
      interpretation:
        change === 'improved'
          ? 'People can change. Older concerns may deserve less weight now.'
          : 'This may be a temporary season. Watch whether it continues before drawing conclusions.',
      evidenceIds: recent[id].evidenceIds,
    });
  }

  return out;
}
