import { CIRCLE, REQUEST_KIND_PHRASE, TRUST_DOMAIN_LABEL } from '../domain/taxonomy';
import type { Interaction, Person, RequestKind } from '../domain/types';
import { assessPerson, type Assessment, type DomainTrust } from './assess';
import { contactGaps, contacts, initiations, makeCtx } from './dimensions';
import { addDays, daysBetween, humanSpan, num, times } from './time';

export interface PauseReflection {
  triggered: boolean;
  /** The request differs from the relationship's recent pattern. */
  differsFromPattern: boolean;
  /** Facts worth remembering before responding. */
  context: string[];
  /** Why this differs from the pattern (observations, not motives). */
  differences: string[];
  questions: string[];
  guidance: string;
}

const HIGH_STAKES: RequestKind[] = ['money', 'business_proposal', 'major_commitment', 'confidential_info', 'major_favor'];

const BASE_QUESTIONS = [
  'What exactly is being asked of me?',
  'Why might this be appearing now?',
  'Does this benefit both of us?',
  "Does this person's previous behavior support the level of trust this requires?",
  'Do I need to respond immediately?',
  'Would I make the same decision if someone else presented this?',
  'What independent evidence supports it?',
];

const KIND_QUESTIONS: Partial<Record<RequestKind, string[]>> = {
  money: ['If this money were never returned, how would that affect me — and the relationship?'],
  confidential_info: ['Why is this information needed, and what happens to it afterwards?'],
  romantic_interest: ['Has interest been building gradually, or does this feel sudden?'],
  introduction: ['What would I be vouching for by making or accepting this introduction?'],
  business_proposal: ['What would a neutral expert say about this proposal on its own merits?'],
  major_commitment: ['What would saying “let me think about it” cost me?'],
};

/** Triggers on requests/proposals and on high-stakes advice. */
export function needsPause(i: Interaction): boolean {
  if (i.actor !== 'them') return false;
  if (i.type === 'request_made') return true;
  if (i.type === 'advice_received' && (i.trustDomain === 'financial' || i.trustDomain === 'business')) return true;
  return false;
}

/**
 * Compares a request against the relationship's history *before* it.
 * Observes differences; never infers motive.
 */
export function pauseAndReflect(person: Person, interactions: Interaction[], request: Interaction): PauseReflection {
  const prior = interactions.filter((i) => i.personId === person.id && i.id !== request.id && i.date <= request.date);
  const before = assessPerson(person, prior, request.date);
  const ctx = makeCtx(person, prior, request.date);
  const context: string[] = [];
  const differences: string[] = [];

  const sixMonthsAgo = addDays(request.date, -182);
  const theirRecentInits = initiations(ctx.items).filter((i) => i.actor === 'them' && i.date >= sixMonthsAgo).length;

  const plans = ctx.commitments.filter((c) => c.kind === 'plans');
  const cancelledByThem = plans.filter((c) => c.status === 'cancelled' && c.cancelledBy === 'them');
  const rescheduledByThem = plans.filter((c) => c.rescheduledBy.includes('them'));
  const postponed = new Set([...cancelledByThem, ...rescheduledByThem].map((c) => c.item.id)).size;
  if (postponed) {
    context.push(`${num(postponed, true)} previously planned ${postponed === 1 ? 'meeting was' : 'meetings were'} postponed or cancelled by them.`);
    const never = cancelledByThem.filter((c) => c.neverRescheduled).length;
    if (never) context.push(`${num(never, true)} ${never === 1 ? 'was' : 'were'} never rescheduled.`);
  }
  const openTheirs = ctx.commitments.filter((c) => c.owner === 'them' && c.kind === 'promise' && c.overdue).length;
  if (openTheirs) context.push(`${num(openTheirs, true)} earlier ${openTheirs === 1 ? 'promise remains' : 'promises remain'} unresolved.`);
  const lastContact = contacts(ctx.items).at(-1);
  if (lastContact) {
    context.push(
      theirRecentInits
        ? `They initiated contact ${times(theirRecentInits)} in the six months before this.`
        : 'They had not initiated contact in the six months before this.',
    );
    const gap = daysBetween(lastContact.date, request.date);
    if (gap >= 30) context.push(`Before this, the last contact was ${humanSpan(gap)} earlier.`);
    const g = contactGaps(ctx);
    if (gap > Math.max(g.threshold, 90)) differences.push(`This follows an unusually long silence (${humanSpan(gap)}).`);
  } else {
    context.push('There is no earlier recorded contact.');
  }

  const kind = request.requestKind;
  if (kind) context.push(`This concerns ${REQUEST_KIND_PHRASE[kind]}.`);

  if (theirRecentInits <= 2 && ctx.items.length >= 3) differences.push('They have rarely initiated contact recently.');
  if (before.dimensions.reliability.level === 'concern' || before.dimensions.reliability.level === 'mixed') {
    differences.push(`Recent follow-through has been ${before.dimensions.reliability.level === 'concern' ? 'low' : 'mixed'}.`);
  }
  const domain = request.trustDomain ? before.domains.find((d) => d.domain === request.trustDomain) : undefined;
  if (domain) {
    context.push(domainLine(domain));
    if (domain.evidence === 'limited' || domain.evidence === 'concern') differences.push(`Little established track record in ${domain.label.toLowerCase()}.`);
  }
  if (request.conflictOfInterest === 'yes') differences.push('They would benefit if you say yes.');
  if (request.concerns?.includes('pressured_decision')) differences.push('There is pressure to decide quickly.');
  if (before.integrityConcern) differences.push('An earlier breach of confidence has not yet been repaired; that affects trust in every area.');
  if (request.trustDomain && !ctx.items.some((i) => i.trustDomain === request.trustDomain)) {
    differences.push('This is the first request in this area of your relationship.');
  }
  if (kind === 'romantic_interest' && !person.categories.includes('dating_interest') && theirRecentInits <= 2) {
    differences.push('Romantic interest here is new relative to the recent pattern.');
  }
  if (person.circle && person.circle >= 4 && kind && HIGH_STAKES.includes(kind)) {
    differences.push(`The trust this requires is higher than the circle you placed them in (${CIRCLE[person.circle].name}).`);
  }

  const differsFromPattern = differences.length > 0;
  const questions = [...BASE_QUESTIONS, ...(kind ? (KIND_QUESTIONS[kind] ?? []) : [])];
  const guidance = differsFromPattern
    ? "Because this differs from the recent relationship pattern, consider understanding the person's objective before making a commitment."
    : 'Asking for help is a normal part of friendship, and this request is consistent with the relationship so far. It still deserves to be evaluated on its own merits.';

  // Requests as such are normal between friends; the full pause is for requests that don't fit.
  return { triggered: needsPause(request) && differsFromPattern, differsFromPattern, context, differences, questions, guidance };
}

function domainLine(d: DomainTrust): string {
  const label = d.label.toLowerCase();
  switch (d.evidence) {
    case 'strong':
      return `Strong track record in ${label} (${num(d.positive)} positive outcomes).`;
    case 'some':
      return `Some positive track record in ${label}.`;
    case 'mixed':
      return `Mixed track record in ${label} (${num(d.positive)} positive, ${num(d.negative)} negative).`;
    case 'concern':
      return `Past outcomes in ${label} have mostly been negative (${num(d.negative)} of ${num(d.positive + d.negative)}).`;
    case 'limited':
      return `Limited evidence for evaluating their ${label}.`;
  }
}

export interface AdviceEvaluation {
  facts: string[];
  patterns: string[];
  interpretations: string[];
  unknowns: string[];
  guidance: string;
}

/**
 * "How seriously should I take this?" — weighs domain track record, relationship
 * context, conflicts of interest and independent evidence. Never recommends
 * accepting or rejecting advice because of friendship status.
 */
export function evaluateAdvice(assessment: Assessment, advice: Interaction): AdviceEvaluation {
  const { person, dimensions } = assessment;
  const facts: string[] = [];
  const patterns: string[] = [];
  const interpretations: string[] = [];
  const unknowns: string[] = [];
  const domain = advice.trustDomain ? assessment.domains.find((d) => d.domain === advice.trustDomain) : undefined;
  const domainLabel = advice.trustDomain ? TRUST_DOMAIN_LABEL[advice.trustDomain].toLowerCase() : null;

  if (person.circle) facts.push(`You place ${person.name} in ${CIRCLE[person.circle].name.toLowerCase()}.`);
  if (domain) facts.push(domainLine(domain));
  else unknowns.push('No domain was recorded for this advice, so domain-specific track record cannot be checked.');

  const otherAdvice = assessment.domains
    .filter((d) => d.domain !== advice.trustDomain && (d.evidence === 'strong' || d.evidence === 'some'))
    .sort((a, b) => (b.evidence === 'strong' ? 1 : 0) - (a.evidence === 'strong' ? 1 : 0) || b.positive - a.positive);
  if (otherAdvice.length) patterns.push(`Positive track record in other areas: ${otherAdvice.map((d) => d.label.toLowerCase()).join(', ')}.`);
  if (assessment.integrityConcern) facts.push('An earlier breach of confidence has not been repaired. Unlike expertise, integrity applies across every area.');
  if (dimensions.trust.level !== 'insufficient') patterns.push(`Overall trust: ${dimensions.trust.summary.toLowerCase()}.`);
  if (dimensions.consistency.level !== 'insufficient') patterns.push(`Involvement over time: ${dimensions.consistency.summary.toLowerCase()}.`);

  if (advice.conflictOfInterest === 'yes') {
    facts.push(`${person.name} would benefit if you act on this.`);
    interpretations.push(
      'A conflict of interest does not make advice wrong, and disclosing it does not remove its influence. It is a reason to seek an independent view.',
    );
  } else if (advice.conflictOfInterest !== 'no') {
    unknowns.push(`Whether ${person.name} would benefit if you act on this.`);
  }
  if (advice.independentEvidence === 'yes') facts.push('You have independent evidence supporting this advice.');
  else if (advice.independentEvidence === 'no') facts.push('You do not yet have independent evidence supporting this advice.');
  else unknowns.push('Whether independent evidence supports the advice itself.');

  const strongHere = domain && (domain.evidence === 'strong' || domain.evidence === 'some');
  const strongElsewhere = otherAdvice.length > 0;
  let guidance: string;
  if (strongHere) {
    guidance = `${person.name} has historically been reliable with ${domainLabel}. That is a reason to take this seriously — and still to check it on its own merits.`;
  } else if (strongElsewhere && domainLabel) {
    guidance = `${person.name} has historically been reliable with ${otherAdvice[0].label.toLowerCase()}, but there is limited evidence regarding ${domainLabel}. Evaluate this independently.`;
  } else if (domain?.evidence === 'concern' || domain?.evidence === 'mixed') {
    guidance = `Past outcomes in ${domainLabel} have been ${domain.evidence === 'concern' ? 'mostly negative' : 'mixed'}. Weigh this advice primarily on independent evidence.`;
  } else {
    guidance = 'There is little track record to lean on either way. Evaluate this advice on its own merits.';
  }
  if (advice.conflictOfInterest === 'yes') guidance += ' Because they would benefit, an independent second opinion is especially worthwhile.';
  interpretations.push('Friendship status alone is not a reason to accept or reject advice.');
  return { facts, patterns, interpretations, unknowns, guidance };
}
