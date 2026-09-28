import { DIMENSION, INTERACTION_TYPE, TRUST_DOMAINS } from '../domain/taxonomy';
import type { CategoryId, CircleId, DimensionId, DomainTrustSelf, Interaction, ISODate, Person, TrustDomainId } from '../domain/types';
import type { Commitment } from './commitments';
import { assessDimensions, contacts, makeCtx, type Ctx, type DimensionResult, type Level } from './dimensions';
import { assessDating, type DatingAssessment } from './dating';
import { detectPatterns, greenFlagTally, type FlagTally, type Pattern } from './patterns';
import { PARAMS } from './params';
import { addDays, daysBetween, monthsBetween, parseSince } from './time';

export type Trend = 'improving' | 'stable' | 'declining' | 'unclear';

export type DomainEvidence = 'strong' | 'some' | 'mixed' | 'concern' | 'limited';

export interface DomainTrust {
  domain: TrustDomainId;
  label: string;
  evidence: DomainEvidence;
  positive: number;
  negative: number;
  pending: number;
  userLevel: DomainTrustSelf;
  userNote?: string;
  evidenceIds: string[];
}

export type ExpectationGap = 'exceeds' | 'matches' | 'below' | 'unknown';

export interface Assessment {
  person: Person;
  asOf: ISODate;
  dimensions: Record<DimensionId, DimensionResult>;
  patterns: Pattern[];
  strengths: string[];
  worthNoting: string[];
  trend: Trend;
  trendReason: string;
  suggestedCircle: CircleId | null;
  circleReasons: string[];
  suggestedCategory: CategoryId | null;
  expectationGap: ExpectationGap;
  lastMeaningful?: Interaction;
  daysSinceMeaningful: number | null;
  firstDate?: ISODate;
  historyMonths: number;
  /** Interactions for this person in the last 12 months. */
  volumeYear: number;
  evidenceVolume: 'none' | 'thin' | 'some' | 'rich';
  openCommitments: Commitment[];
  greenFlags: FlagTally[];
  domains: DomainTrust[];
  domainSummary: string | null;
  /**
   * An unrepaired breach of honesty/good faith. Competence is domain-specific,
   * but integrity is not: this applies to every domain.
   */
  integrityConcern: boolean;
  memories: Interaction[];
  dating: DatingAssessment | null;
  reflectionPrompts: string[];
  /** Internal ordering key for "closest" lists. Never displayed. */
  closeness: number;
}

const LEVEL_POINTS: Record<Level, number> = { strong: 3, solid: 2, mixed: 1, concern: -2, insufficient: 0 };
const POSITIVE: Level[] = ['strong', 'solid'];
const CORE: DimensionId[] = ['trust', 'reliability', 'reciprocity', 'safety', 'care', 'respect'];

function changeBetween(earlier: DimensionResult, recent: DimensionResult): DimensionResult['change'] {
  if (recent.n < PARAMS.minEvidenceForChange || earlier.n < PARAMS.minEvidenceForChange) return undefined;
  const earlierNeg = earlier.level === 'concern' || earlier.level === 'mixed';
  const recentPos = POSITIVE.includes(recent.level);
  if (earlierNeg && recentPos) return 'improved';
  if (POSITIVE.includes(earlier.level) && (recent.level === 'concern' || (earlier.level === 'strong' && recent.level === 'mixed'))) {
    return 'declined';
  }
  return undefined;
}

/**
 * Suggests the circle the evidence supports. The user always decides.
 * Circle 5 (limited/caution) is reserved for concerns about respect, safety or
 * trust — uneven effort or flaky plans suggest lighter expectations (circle 3–4),
 * not caution. Forming relationships are never suggested for circles 1–2.
 */
function suggestCircle(
  dims: Record<DimensionId, DimensionResult>,
  historyMonths: number,
  total: number,
): { circle: CircleId | null; reasons: string[] } {
  const reasons: string[] = [];
  const cautionDims = (['respect', 'safety', 'trust'] as DimensionId[]).filter((d) => dims[d].level === 'concern');
  if (cautionDims.length) {
    return { circle: 5, reasons: cautionDims.map((d) => dims[d].summary) };
  }
  if (total < PARAMS.minInteractionsForCircle) {
    return { circle: null, reasons: ['Not enough recorded history to suggest a circle yet.'] };
  }
  const positive = CORE.filter((d) => POSITIVE.includes(dims[d].level));
  const concerns = CORE.filter((d) => dims[d].level === 'concern');
  const forming = historyMonths < PARAMS.formingMonths || total < PARAMS.formingInteractions;
  if (
    !forming &&
    concerns.length === 0 &&
    dims.trust.level === 'strong' &&
    dims.safety.level === 'strong' &&
    POSITIVE.includes(dims.reliability.level) &&
    POSITIVE.includes(dims.reciprocity.level) &&
    POSITIVE.includes(dims.care.level) &&
    dims.trust.confidence !== 'low' &&
    historyMonths >= PARAMS.innerCircleMinMonths
  ) {
    reasons.push('Demonstrated trust, reliability and emotional safety', 'Mutual investment', `Sustained history (${Math.floor(historyMonths / 12) || 1}+ years)`);
    return { circle: 1, reasons };
  }
  if (!forming && concerns.length === 0 && positive.length >= 4 && historyMonths >= PARAMS.closeCircleMinMonths) {
    reasons.push(...positive.map((d) => dims[d].summary));
    return { circle: 2, reasons };
  }
  if (positive.length >= 2 && concerns.length <= 1) {
    reasons.push(...positive.map((d) => dims[d].summary), ...concerns.map((d) => dims[d].summary));
    if (forming) reasons.push('Still forming — closeness takes time to demonstrate.');
    return { circle: 3, reasons };
  }
  reasons.push(...concerns.map((d) => dims[d].summary));
  if (!concerns.length) reasons.push('Limited demonstrated evidence across trust, reliability and reciprocity so far.');
  return { circle: 4, reasons };
}

function suggestCategory(
  person: Person,
  circle: CircleId | null,
  ctx: Ctx,
  daysSince: number | null,
  historyMonths: number,
  trend: Trend,
): CategoryId | null {
  if (person.categories.includes('dating_interest')) return 'dating_interest';
  if (circle === 5) return 'high_caution';
  if (daysSince !== null && daysSince >= PARAMS.dormantDays) return 'dormant';
  const items = ctx.items;
  const collab = items.filter((i) => i.type === 'collaboration_completed' || i.type === 'collaboration_delayed').length;
  const business = items.filter((i) => i.focus === 'opportunity' || i.trustDomain === 'business' || i.trustDomain === 'career').length;
  const advice = items.filter((i) => i.type === 'advice_received' && i.outcome === 'helpful').length;
  if (circle === 1) return 'inner_circle';
  if (circle === 2) return 'close_friend';
  if (advice >= 3 && advice >= items.length / 4) return 'mentor';
  if (collab >= 3 && collab >= items.length / 4) return 'collaborator';
  if (business >= items.length / 2 && items.length >= 4) return 'professional_friend';
  if (historyMonths < PARAMS.closeCircleMinMonths && trend !== 'declining' && circle === 3) return 'growing_friendship';
  if (circle === 3) return 'friend';
  if (circle === 4) return 'acquaintance';
  return null;
}

/** Evidence about how this person has handled each domain. */
function domainTrust(person: Person, items: Interaction[]): DomainTrust[] {
  const acc = new Map<TrustDomainId, { pos: number; neg: number; pending: number; ids: string[] }>();
  const bump = (d: TrustDomainId, kind: 'pos' | 'neg' | 'pending', id: string) => {
    const e = acc.get(d) ?? { pos: 0, neg: 0, pending: 0, ids: [] };
    e[kind] += 1;
    e.ids.push(id);
    acc.set(d, e);
  };
  for (const i of items) {
    const theirs = i.actor === 'them' || i.actor === 'both';
    const d = i.trustDomain;
    switch (i.type) {
      case 'advice_received':
      case 'introduction_referral':
      case 'request_made': {
        const domain = d ?? (i.type === 'introduction_referral' ? 'introductions' : undefined);
        if (!domain || !theirs) break;
        if (i.outcome === 'helpful') bump(domain, 'pos', i.id);
        else if (i.outcome === 'unhelpful') bump(domain, 'neg', i.id);
        else if (i.type !== 'request_made') bump(domain, 'pending', i.id);
        break;
      }
      case 'help_received':
        bump(d ?? 'practical', 'pos', i.id);
        break;
      case 'confidence_kept':
        if (theirs) bump('confidential', 'pos', i.id);
        break;
      case 'confidence_broken':
        if (theirs) bump('confidential', 'neg', i.id);
        break;
      case 'reached_out_difficulty':
        if (theirs) bump('crisis', 'pos', i.id);
        break;
      case 'vulnerability_shared':
        if (i.actor === 'me' && i.reception === 'supportive') bump('emotional', 'pos', i.id);
        if (i.actor === 'me' && i.reception === 'dismissive') bump('emotional', 'neg', i.id);
        break;
      case 'collaboration_completed':
        if (theirs) bump(d ?? 'business', 'pos', i.id);
        break;
      case 'collaboration_delayed':
        if (theirs) bump(d ?? 'business', 'neg', i.id);
        break;
      case 'promise_kept':
        if (theirs && d) bump(d, 'pos', i.id);
        break;
      case 'promise_broken':
      case 'felt_pressured':
        if ((theirs || i.type === 'felt_pressured') && d) bump(d, 'neg', i.id);
        break;
      default:
        break;
    }
  }
  return TRUST_DOMAINS.map(({ id, label }) => {
    const e = acc.get(id) ?? { pos: 0, neg: 0, pending: 0, ids: [] };
    const resolved = e.pos + e.neg;
    let evidence: DomainEvidence = 'limited';
    if (resolved >= 2) {
      const r = e.pos / resolved;
      evidence = r >= 0.8 ? (resolved >= 3 ? 'strong' : 'some') : r >= 0.5 ? 'mixed' : e.neg >= 2 ? 'concern' : 'mixed';
    } else if (e.pos === 1 && e.neg === 0) evidence = 'some';
    else if (e.neg === 1 && e.pos === 0) evidence = 'mixed';
    const self = person.domainTrust[id];
    return {
      domain: id,
      label,
      evidence,
      positive: e.pos,
      negative: e.neg,
      pending: e.pending,
      userLevel: self?.level ?? 'unassessed',
      userNote: self?.note,
      evidenceIds: e.ids,
    };
  });
}

const DOMAIN_PHRASE: Record<TrustDomainId, string> = {
  emotional: 'emotional support',
  career: 'career advice',
  financial: 'financial or investment recommendations',
  business: 'business collaboration',
  confidential: 'keeping confidences',
  dating: 'dating advice',
  spiritual: 'spiritual guidance',
  practical: 'practical help',
  crisis: 'showing up in a crisis',
  introductions: 'professional introductions',
};

function summarizeDomains(domains: DomainTrust[], items: Interaction[]): string | null {
  const strong = domains.filter((d) => d.evidence === 'strong' || (d.evidence === 'some' && d.positive >= 2));
  const concern = domains.filter((d) => d.evidence === 'concern');
  // Domains where the person is active (advice, requests) but the track record is thin.
  const involved = new Set(items.map((i) => i.trustDomain).filter(Boolean) as TrustDomainId[]);
  const thin = domains.filter((d) => d.evidence === 'limited' && involved.has(d.domain));
  const parts: string[] = [];
  if (strong.length) parts.push(`Strong ${strong.map((d) => DOMAIN_PHRASE[d.domain]).join(' and ')} history`);
  if (concern.length) parts.push(`some concerns around ${concern.map((d) => DOMAIN_PHRASE[d.domain]).join(' and ')}`);
  if (thin.length) parts.push(`limited evidence for evaluating this person's ${thin.map((d) => DOMAIN_PHRASE[d.domain]).join(' or ')}`);
  if (!parts.length) return null;
  const s = parts.join(', but ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

function computeTrend(
  dims: Record<DimensionId, DimensionResult>,
  recent: Record<DimensionId, DimensionResult>,
  earlier: Record<DimensionId, DimensionResult>,
  volumeYear: number,
): { trend: Trend; reason: string } {
  if (volumeYear < 4) return { trend: 'unclear', reason: 'Too few recent interactions to see a trend.' };
  const changed = (Object.keys(dims) as DimensionId[]).filter((d) => d !== 'availability');
  const improved = changed.filter((d) => dims[d].change === 'improved');
  const declined = changed.filter((d) => dims[d].change === 'declined');
  const names = (ids: DimensionId[]) => ids.map((d) => DIMENSION[d].label).join(', ');
  if (improved.length > declined.length) return { trend: 'improving', reason: `${names(improved)} improved over the last six months.` };
  if (declined.length > improved.length) return { trend: 'declining', reason: `${names(declined)} declined over the last six months.` };
  const avg = (r: Record<DimensionId, DimensionResult>) => {
    const scored = changed.filter((d) => r[d].level !== 'insufficient');
    return scored.length ? scored.reduce((a, d) => a + r[d].balance, 0) / scored.length : null;
  };
  const a = avg(earlier);
  const b = avg(recent);
  if (a === null || b === null) return { trend: 'stable', reason: 'No earlier period to compare against yet.' };
  if (b - a >= 0.15) return { trend: 'improving', reason: 'Recent interactions are more positive than earlier ones.' };
  if (a - b >= 0.15) return { trend: 'declining', reason: 'Recent interactions are less positive than earlier ones.' };
  return { trend: 'stable', reason: 'Recent evidence looks similar to earlier evidence.' };
}

export function assessPerson(person: Person, interactions: Interaction[], asOf: ISODate): Assessment {
  const ctx = makeCtx(person, interactions, asOf);
  const recentFrom = addDays(asOf, -PARAMS.recentWindowDays);
  const earlierTo = addDays(recentFrom, -1);
  const earlierFrom = addDays(earlierTo, -PARAMS.earlierWindowDays);
  const dims = assessDimensions(ctx);
  const recent = assessDimensions(makeCtx(person, interactions, asOf, recentFrom));
  const earlier = assessDimensions(makeCtx(person, interactions, earlierTo, earlierFrom));
  for (const id of Object.keys(dims) as DimensionId[]) {
    if (id !== 'availability') dims[id].change = changeBetween(earlier[id], recent[id]);
  }

  const items = ctx.items;
  const firstDate = parseSince(person.since) ?? items[0]?.date;
  const historyMonths = firstDate ? Math.max(0, monthsBetween(firstDate, asOf)) : 0;
  const yearAgo = addDays(asOf, -365);
  const volumeYear = items.filter((i) => i.date >= yearAgo).length;
  const meaningful = items.filter((i) => INTERACTION_TYPE[i.type].contact || i.significance !== 'routine');
  const lastMeaningful = meaningful.at(-1);
  const daysSinceMeaningful = lastMeaningful ? daysBetween(lastMeaningful.date, asOf) : null;
  const evidenceVolume = items.length === 0 ? 'none' : items.length < 5 ? 'thin' : items.length < 15 ? 'some' : 'rich';

  const patterns = detectPatterns(ctx, dims, recent);
  const { trend, reason: trendReason } = computeTrend(dims, recent, earlier, volumeYear);
  const { circle: suggestedCircle, reasons: circleReasons } = suggestCircle(dims, historyMonths, items.length);
  const suggestedCategory = suggestCategory(person, suggestedCircle, ctx, daysSinceMeaningful, historyMonths, trend);

  let expectationGap: ExpectationGap = 'unknown';
  if (person.circle && suggestedCircle) {
    const coreConcern = CORE.some((d) => dims[d].level === 'concern');
    if (person.circle < suggestedCircle && (suggestedCircle - person.circle >= 2 || suggestedCircle === 5 || coreConcern)) expectationGap = 'exceeds';
    else if (person.circle > suggestedCircle && suggestedCircle <= 2) expectationGap = 'below';
    else expectationGap = 'matches';
  }

  const strengths = CORE.concat(['mutuality', 'growth', 'consistency'])
    .filter((d) => dims[d].level === 'strong' || (dims[d].level === 'solid' && dims[d].confidence !== 'low'))
    .map((d) => dims[d].summary);
  const worthNoting = patterns.filter((p) => p.kind === 'concern').map((p) => p.title);

  const domains = domainTrust(person, items);
  const dating = person.categories.includes('dating_interest') ? assessDating(ctx, dims) : null;

  const openCommitments = ctx.commitments.filter((c) => c.status === 'open');
  const memories = items.filter((i) => i.significance === 'milestone' || i.type === 'important_moment').reverse();

  const closeness = (['trust', 'reciprocity', 'reliability', 'consistency', 'safety', 'mutuality'] as DimensionId[]).reduce(
    (a, d) => a + LEVEL_POINTS[dims[d].level] * (dims[d].confidence === 'high' ? 1.2 : dims[d].confidence === 'moderate' ? 1 : 0.7),
    0,
  );

  const reflectionPrompts = buildPrompts(person, dims, patterns, expectationGap, ctx);

  return {
    person,
    asOf,
    dimensions: dims,
    patterns,
    strengths,
    worthNoting,
    trend,
    trendReason,
    suggestedCircle,
    circleReasons,
    suggestedCategory,
    expectationGap,
    lastMeaningful,
    daysSinceMeaningful,
    firstDate,
    historyMonths,
    volumeYear,
    evidenceVolume,
    openCommitments,
    greenFlags: greenFlagTally(items),
    domains,
    domainSummary: summarizeDomains(domains, items),
    integrityConcern: patterns.some((p) => p.id.startsWith('significant_') && p.kind === 'concern'),
    memories,
    dating,
    reflectionPrompts,
    closeness,
  };
}

function buildPrompts(
  person: Person,
  dims: Record<DimensionId, DimensionResult>,
  patterns: Pattern[],
  gap: ExpectationGap,
  ctx: Ctx,
): string[] {
  const out: string[] = [];
  const has = (id: string) => patterns.some((p) => p.id === id);
  if (gap === 'exceeds') out.push('Does your current level of emotional investment match the evidence from this relationship?');
  if (gap === 'below') out.push(`The evidence suggests ${person.name} has shown up consistently. Is there a way to invest a little more intentionally?`);
  if (has('one_sided_initiation')) out.push('What would it look like to leave space for them to initiate next time?');
  if (has('transactional')) out.push('What do you want this relationship to be, apart from what is being asked of you?');
  if (has('shows_up') || has('follows_through')) out.push(`Have you told ${person.name} what their consistency means to you?`);
  const myCancels = ctx.items.filter((i) => i.type === 'cancelled_plans' && i.actor === 'me').length;
  const myBroken = ctx.items.filter((i) => i.type === 'promise_broken' && i.actor === 'me').length;
  if (myCancels + myBroken >= 2) out.push('Are you expecting from them what you consistently provide yourself?');
  if (dims.growth.level === 'concern') out.push('Which of your values does this relationship support, and which does it strain?');
  if (!out.length) out.push('What do you most value in this relationship — and is that reflected in how you invest in it?');
  if (!contacts(ctx.items).length) out.push('What would you like to remember about how this relationship began?');
  return out;
}

export function assessAll(people: Person[], interactions: Interaction[], asOf: ISODate): Map<string, Assessment> {
  const byPerson = new Map<string, Interaction[]>();
  for (const i of interactions) {
    const list = byPerson.get(i.personId) ?? [];
    list.push(i);
    byPerson.set(i.personId, list);
  }
  return new Map(people.map((p) => [p.id, assessPerson(p, byPerson.get(p.id) ?? [], asOf)]));
}
