/**
 * The on-device analyst. Every answer is assembled from recorded evidence via
 * the engine — nothing leaves the device. Answers keep the four-section
 * structure (facts / patterns / interpretations / unknowns); interpretations
 * are hedged readings, never motives, diagnoses or directives.
 */
import { CATEGORY, CIRCLE, DATING_STATUS_LABEL, DIMENSION, INTERACTION_TYPE, REQUEST_KIND_PHRASE, TRUST_DOMAIN_LABEL } from '../domain/taxonomy';
import type { Interaction, Person, TrustDomainId, Vault } from '../domain/types';
import {
  buildDashboard,
  buildMirror,
  evaluateAdvice,
  pauseAndReflect,
  RESPONSE_TIME_NOTE,
  type Assessment,
  type Commitment,
  type Dashboard,
  type Trend,
} from '../engine';
import { addDays, daysBetween, formatDate, formatMonth, humanSpan, num, plural, times } from '../engine/time';
import type { AnalystAnswer } from './types';

type Section = 'facts' | 'patterns' | 'interpretations' | 'unknowns';
type Line = string | null | undefined | false;

/** Collects answer lines, dropping blanks and duplicates. */
class Draft {
  readonly facts: string[] = [];
  readonly patterns: string[] = [];
  readonly interpretations: string[] = [];
  readonly unknowns: string[] = [];
  readonly people = new Set<string>();

  add(section: Section, ...lines: Line[]): this {
    for (const l of lines) if (l && !this[section].includes(l)) this[section].push(l);
    return this;
  }

  about(...people: Person[]): this {
    for (const p of people) this.people.add(p.name);
    return this;
  }

  absorb(other: Draft, prefix = ''): this {
    for (const s of SECTIONS) this.add(s, ...other[s].map((l) => prefix + l));
    for (const p of other.people) this.people.add(p);
    return this;
  }

  done(): AnalystAnswer {
    return {
      facts: this.facts,
      patterns: this.patterns,
      interpretations: this.interpretations,
      unknowns: this.unknowns,
      people: [...this.people],
      source: 'local',
    };
  }
}

const SECTIONS: Section[] = ['facts', 'patterns', 'interpretations', 'unknowns'];

const UNLOGGED = 'Anything you did not log — the record holds only what you chose to write down.';
const INNER_LIFE = 'Their feelings, intentions and circumstances. The record shows behavior, not what lies behind it.';

const TREND_TEXT: Record<Trend, string> = {
  improving: 'improving',
  stable: 'steady',
  declining: 'recently lower',
  unclear: 'unclear',
};

// ── Name matching ──

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive. Possessives ("James's", "James’s") match because the apostrophe is not a letter. */
function nameRe(name: string, flags = 'iu'): RegExp {
  const body = name.trim().split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);
}

export interface NameMatch {
  /** Every person referred to, in order of first mention. */
  people: Person[];
  /** Names that refer to more than one person. */
  ambiguous: { name: string; people: Person[] }[];
}

/**
 * Finds people named in free text. Full names win; a first name alone also
 * matches ("Sarah" for "Sarah Chen"). A name shared by several people matches
 * all of them and is reported as ambiguous.
 */
export function findPeople(text: string, people: Person[]): NameMatch {
  const hits: { key: string; index: number; person: Person }[] = [];
  let rest = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name.trim()) continue;
    const m = nameRe(p.name).exec(rest);
    if (m) hits.push({ key: p.name.trim().toLowerCase(), index: m.index, person: p });
  }
  // Mask full-name mentions so their first names don't match other people too.
  for (const h of hits) rest = rest.replace(nameRe(h.person.name, 'giu'), (s) => ' '.repeat(s.length));
  const matched = new Set(hits.map((h) => h.person.id));
  for (const p of people) {
    const first = p.name.trim().split(/\s+/)[0];
    if (matched.has(p.id) || !first || first === p.name.trim()) continue;
    const m = nameRe(first).exec(rest);
    if (m) hits.push({ key: first.toLowerCase(), index: m.index, person: p });
  }
  hits.sort((a, b) => a.index - b.index);
  const byKey = new Map<string, Person[]>();
  for (const h of hits) byKey.set(h.key, [...(byKey.get(h.key) ?? []), h.person]);
  const seen = new Set<string>();
  return {
    people: hits.filter((h) => !seen.has(h.person.id) && seen.add(h.person.id)).map((h) => h.person),
    ambiguous: [...byKey.entries()].filter(([, ps]) => ps.length > 1).map(([, ps]) => ({ name: ps[0].name.split(/\s+/)[0], people: ps })),
  };
}

function labelOf(p: Person): string {
  return p.contexts[0] ? `${p.name} (${p.contexts[0]})` : p.name;
}

// ── Shared phrasing ──

function circleName(c: Person['circle']): string {
  return c ? CIRCLE[c].name.toLowerCase() : 'no circle';
}

function itemsOf(vault: Vault, personId: string, asOf: string): Interaction[] {
  return vault.interactions.filter((i) => i.personId === personId && i.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
}

function ago(days: number): string {
  return days <= 0 ? 'today' : `${humanSpan(days)} ago`;
}

function placementFact(a: Assessment): string {
  const { person } = a;
  return person.circle ? `You place ${person.name} in ${circleName(person.circle)}.` : `You have not placed ${person.name} in a circle.`;
}

function placementReading(a: Assessment): string | null {
  const { person, suggestedCircle } = a;
  switch (a.expectationGap) {
    case 'exceeds':
      return `The evidence currently fits ${circleName(suggestedCircle)} more closely than ${circleName(person.circle)}. Your expectations may currently exceed demonstrated reciprocity — the circle remains your choice.`;
    case 'below':
      return `The evidence may support more closeness than the circle you have chosen (it currently fits ${circleName(suggestedCircle)}).`;
    case 'matches':
      return 'Where you place them is broadly consistent with the evidence so far.';
    case 'unknown':
      return suggestedCircle && !person.circle ? `The evidence so far would fit ${circleName(suggestedCircle)}, if you choose to place them.` : null;
  }
}

function commitmentLine(c: Commitment, name: string, asOf: string): string {
  const what = c.item.note ? `“${c.item.note}”` : c.kind === 'plans' ? 'plans' : 'a promise';
  const who = c.owner === 'me' ? `You committed to ${name}` : c.owner === 'them' ? `${name} committed` : 'You both committed';
  const due = c.dueDate ? (c.dueDate < asOf ? `, due ${formatDate(c.dueDate)} (now past)` : `, due ${formatDate(c.dueDate)}`) : c.overdue ? `, made ${ago(daysBetween(c.item.date, asOf))}` : '';
  return `${who}: ${what}${due}. Still open.`;
}

function dimensionLine(a: Assessment, id: keyof Assessment['dimensions']): string {
  const d = a.dimensions[id];
  return `${DIMENSION[id].label} — ${d.summary}.${d.observations.length ? ` ${d.observations.slice(0, 2).join(' ')}` : ''}`;
}

function flagLine(a: Assessment, max = 4): string | null {
  const flags = a.greenFlags.slice(0, max);
  return flags.length ? `Green flags recorded: ${flags.map((f) => `${f.label.toLowerCase()} (${times(f.count)})`).join(', ')}.` : null;
}

function capacityUnknown(a: Assessment): string | null {
  if (a.person.capacityNote) {
    return `You noted: “${a.person.capacityNote}”. How much of the pattern reflects capacity rather than regard is not something the record can show.`;
  }
  return a.worthNoting.length ? 'Their current circumstances (work, family, health, distance) are not recorded; these can shape patterns as much as regard does.' : null;
}

function thinUnknown(a: Assessment, count: number): string | null {
  if (a.evidenceVolume === 'none') return `Nothing is recorded about ${a.person.name} yet, so nothing can be inferred.`;
  if (a.evidenceVolume === 'thin') return `Only ${plural(count, 'interaction')} recorded — any reading here is tentative.`;
  return null;
}

function combine(parts: { person: Person; draft: Draft }[], match: NameMatch | null): Draft {
  const out = new Draft();
  if (parts.length === 1) out.absorb(parts[0].draft);
  else {
    const ambiguousIds = new Set(match?.ambiguous.flatMap((g) => g.people.map((p) => p.id)) ?? []);
    for (const { person, draft } of parts) out.absorb(draft, `${ambiguousIds.has(person.id) ? labelOf(person) : person.name}: `);
  }
  for (const g of match?.ambiguous ?? []) {
    out.add('unknowns', `You have ${num(g.people.length)} people named ${g.name} (${g.people.map(labelOf).join('; ')}); this answer covers each. Use a full name to ask about one.`);
  }
  return out;
}

// ── Characterize ──

function characterizeBody(a: Assessment, vault: Vault, asOf: string): Draft {
  const d = new Draft().about(a.person);
  const { person } = a;
  const items = itemsOf(vault, person.id, asOf);

  d.add('facts', `Recorded as: ${person.categories.map((c) => CATEGORY[c].label).join(', ') || 'no category yet'}.`, placementFact(a));
  d.add(
    'facts',
    items.length
      ? `${plural(items.length, 'interaction')} recorded${a.firstDate ? ` since ${formatMonth(a.firstDate)}` : ''}; ${num(a.volumeYear)} in the last twelve months.`
      : `No interactions with ${person.name} are recorded yet.`,
  );
  if (a.lastMeaningful && a.daysSinceMeaningful !== null) {
    d.add('facts', `Last meaningful contact: ${formatDate(a.lastMeaningful.date)} (${ago(a.daysSinceMeaningful)}).`);
  }
  d.add('facts', flagLine(a), ...a.openCommitments.slice(0, 3).map((c) => commitmentLine(c, person.name, asOf)));

  for (const id of Object.keys(a.dimensions) as (keyof Assessment['dimensions'])[]) {
    if (id !== 'availability' && a.dimensions[id].level !== 'insufficient') d.add('patterns', dimensionLine(a, id));
  }
  for (const p of a.patterns) d.add('patterns', `${p.title}: ${p.observation}`);
  d.add('patterns', `Trend: ${TREND_TEXT[a.trend]}. ${a.trendReason}`, a.domainSummary);

  d.add('interpretations', placementReading(a));
  if (a.suggestedCategory && !person.categories.includes(a.suggestedCategory)) {
    d.add('interpretations', `The record could also fit “${CATEGORY[a.suggestedCategory].label}” — a suggestion only; categories are yours to choose.`);
  }
  for (const p of a.patterns) d.add('interpretations', `${p.title}: ${p.interpretation}${p.suggestion ? ` ${p.suggestion}` : ''}`);
  if (!a.strengths.length && !a.worthNoting.length && a.evidenceVolume !== 'none') {
    d.add('interpretations', 'The record so far shows neither clear strengths nor clear concerns; it may simply be early.');
  }
  if (a.dating) {
    d.add('interpretations', `Dating view: ${DATING_STATUS_LABEL[a.dating.status]}. ${a.dating.statusReason}`);
    if (person.datingStatus && person.datingStatus !== a.dating.status) {
      d.add('interpretations', `You marked this as “${DATING_STATUS_LABEL[person.datingStatus]}”; the evidence currently reads as “${DATING_STATUS_LABEL[a.dating.status]}”.`);
    }
  }

  d.add('unknowns', thinUnknown(a, items.length));
  const missing = (Object.keys(a.dimensions) as (keyof Assessment['dimensions'])[]).filter((id) => id !== 'availability' && a.dimensions[id].level === 'insufficient');
  if (missing.length && a.evidenceVolume !== 'none') d.add('unknowns', `Not enough evidence yet about ${missing.map((id) => DIMENSION[id].label.toLowerCase()).join(', ')}.`);
  d.add('unknowns', capacityUnknown(a));
  const pending = a.domains.filter((x) => x.pending > 0);
  if (pending.length) d.add('unknowns', `Outcomes are not yet known for their ${pending.map((x) => x.label.toLowerCase()).join(', ')}.`);
  if (a.dating) d.add('unknowns', RESPONSE_TIME_NOTE);
  return d;
}

/** The relationship summary shown on a profile. Built only from recorded evidence. */
export function characterize(assessment: Assessment, vault: Vault, asOf: string): AnalystAnswer {
  return characterizeBody(assessment, vault, asOf).add('unknowns', INNER_LIFE, UNLOGGED).done();
}

// ── Intents ──

type Intent =
  | 'mirror'
  | 'dating'
  | 'credible'
  | 'trust_suggestion'
  | 'before_meeting'
  | 'change'
  | 'invest'
  | 'shown_up'
  | 'neglect'
  | 'boundaries'
  | 'closest'
  | 'characterize';

const ADVICE_WORDS = /\b(suggestion|suggest(ed|s)?|proposal|propos(ed|es|ing)|recommendation|recommend(ed|s)?|advice|idea|pitch|offer|request|venture|deal|opportunity)\b/;

function classify(q: string, named: boolean): Intent | null {
  if (/\b(good friend|bad friend|am i (being )?(a )?(good|bad|decent|reliable|present)|how am i doing|as a friend|do i (follow through|show up|initiate|keep)|mirror)\b/.test(q)) return 'mirror';
  if (/\b(dating|romantic|romance|dates?|crush|into me|interested in me)\b/.test(q)) return 'dating';
  if (/\bwhose (advice|judgement|judgment|opinion)\b|\bcredib|\bwho (should|can) i (ask|listen|turn|go)\b/.test(q) || (!named && /\badvice\b/.test(q) && /\b(who|trust|reliable)\b/.test(q))) return 'credible';
  if (ADVICE_WORDS.test(q) && (named || /\bshould i\b/.test(q))) return 'trust_suggestion';
  if (/\bbefore (meeting|seeing|i (see|meet|talk|call)|talking|calling)\b|\bprepare\b|\bnext time i (see|meet)\b/.test(q)) return 'before_meeting';
  if (/\bchang|\bover the (last|past)\b|\bimprov|\bevolv|\bcompared\b|\bdifferent now\b/.test(q)) return 'change';
  if (/\binvest|\bdisproportion|\bone[- ]sided\b|\bimbalanc|\buneven\b|\bmore effort\b|\bputting in\b|\bcarrying\b/.test(q)) return 'invest';
  if (/\bshow(n|s|ed)? up\b|\bbeen there\b|\bthere for me\b|\brely on\b|\bdependable\b|\bcount on\b/.test(q)) return 'shown_up';
  if (/\bneglect|\blos(t|ing) touch\b|\bdrift|\bout of touch\b|\breach out\b|\breconnect|\bcheck in on\b|\bhaven'?t (seen|talked|spoken)\b/.test(q)) return 'neglect';
  if (/\bboundar|\bdistance\b|\bcareful\b|\bcaution|\bguard|\bprotect/.test(q)) return 'boundaries';
  if (/\bclosest\b|\bclose (friends|relationships)\b|\bbest friends?\b|\binner circle\b|\bmost (important|trusted)\b|\bstrongest\b/.test(q)) return 'closest';
  if (/\bcharacteri[sz]|\bdescribe\b|\bsummar|\btell me about\b|\bhow('s| is) (my|our|the) (friendship|relationship)\b|\bwhat kind of\b|\boverview\b|\bthink of\b/.test(q)) return 'characterize';
  return null;
}

interface Scope {
  question: string;
  vault: Vault;
  assessments: Map<string, Assessment>;
  asOf: string;
  match: NameMatch;
  active: Assessment[];
}

function dashboardOf(s: Scope): Dashboard {
  return buildDashboard(s.vault.people, s.assessments, s.vault.interactions, s.vault.settings, s.asOf);
}

function named(s: Scope): Assessment[] {
  return s.match.people.map((p) => s.assessments.get(p.id)).filter((a): a is Assessment => !!a);
}

function perPerson(s: Scope, list: Assessment[], body: (a: Assessment) => Draft): Draft {
  return combine(
    list.map((a) => ({ person: a.person, draft: body(a) })),
    s.match,
  );
}

function closest(s: Scope): Draft {
  const d = new Draft();
  const dash = dashboardOf(s);
  if (!dash.closest.length) {
    d.add('facts', 'No one yet has enough consistently positive evidence across trust, reciprocity and reliability to suggest the closest circles.');
    d.add('unknowns', 'With more logged history this may change; a short or sparse record says little either way.');
  }
  for (const { assessment: a, reason } of dash.closest) {
    d.about(a.person).add('facts', `${a.person.name} (you place them in ${circleName(a.person.circle)}): ${reason}.`);
    const top = a.patterns.find((p) => p.kind === 'strength');
    if (top) d.add('patterns', `${a.person.name}: ${top.title.toLowerCase()} — ${top.observation}`);
  }
  d.add(
    'interpretations',
    dash.closest.length > 0 &&
      'These readings rest on demonstrated trust, reciprocity, reliability, consistency, emotional safety and mutuality. How often you are in touch is deliberately not the measure: someone you see rarely can belong here, and someone you see often may not.',
  );
  const closestIds = new Set(dash.closest.map((c) => c.person.id));
  for (const a of s.active) {
    if (a.person.circle && a.person.circle <= 2 && !closestIds.has(a.person.id)) {
      d.about(a.person).add('interpretations', `You place ${a.person.name} in ${circleName(a.person.circle)}; the recorded evidence does not currently show the same closeness — which may reflect what has been logged as much as the relationship.`);
    }
    if (a.expectationGap === 'below') d.about(a.person).add('interpretations', `The evidence may support more closeness with ${a.person.name} than the circle you have chosen.`);
  }
  d.add('interpretations', 'These are readings of your records, not rankings. Where people sit in your life is your decision.');
  d.add('unknowns', 'Family and relationships you have not added to Kith.');
  return d;
}

const INVEST_PATTERNS = ['one_sided_initiation', 'uneven_initiation', 'help_imbalance', 'transactional', 'repeated_cancellations'];

function invest(s: Scope): Draft {
  const d = new Draft();
  const list = s.active
    .filter(
      (a) =>
        a.expectationGap === 'exceeds' ||
        a.dimensions.reciprocity.level === 'concern' ||
        (a.dimensions.reciprocity.level === 'mixed' && a.dimensions.reciprocity.confidence !== 'low') ||
        a.patterns.some((p) => p.id === 'one_sided_initiation' || p.id === 'uneven_initiation' || p.id === 'help_imbalance'),
    )
    .sort((x, y) => Number(y.expectationGap === 'exceeds') - Number(x.expectationGap === 'exceeds'));
  if (!list.length) {
    d.add('facts', 'No relationship in your records currently shows effort flowing mostly from you, or a placement that runs ahead of the evidence.');
    const mirror = buildMirror(s.vault.people, s.assessments, s.vault.interactions, s.asOf);
    for (const e of mirror.expectingMore) d.about(e.person).add('patterns', `The reverse may be worth a look: ${e.observation}`);
  }
  for (const a of list) {
    const name = a.person.name;
    d.about(a.person);
    if (a.expectationGap === 'exceeds') {
      d.add('facts', `You place ${name} in ${circleName(a.person.circle)}; the evidence currently fits ${circleName(a.suggestedCircle)}.`);
      d.add('interpretations', `With ${name}, your expectations may currently exceed demonstrated reciprocity.`);
    }
    const obs = a.dimensions.reciprocity.observations[0];
    if (obs) d.add('facts', `${name}: ${obs}`);
    for (const p of a.patterns.filter((x) => INVEST_PATTERNS.includes(x.id))) {
      d.add('patterns', `${name}: ${p.title.toLowerCase()} — ${p.observation}`);
      d.add('interpretations', `${name}: ${p.interpretation}${p.suggestion ? ` ${p.suggestion}` : ''}`);
    }
    if (a.person.capacityNote) d.add('unknowns', `${name}: you noted “${a.person.capacityNote}”. The record cannot show how much of the imbalance that explains.`);
  }
  if (list.length) {
    d.add('interpretations', 'Uneven effort can reflect capacity, a season of life, or different habits of reaching out as much as interest. Close friendships rarely balance exactly.');
    d.add('unknowns', 'Whether they know the effort feels uneven — asking directly is the only way to find out.');
  }
  return d;
}

function shownUp(s: Scope): Draft {
  const d = new Draft();
  const weight = (a: Assessment) =>
    (a.patterns.some((p) => p.id === 'shows_up') ? 3 : 0) +
    (a.patterns.some((p) => p.id === 'follows_through') ? 2 : 0) +
    (a.patterns.some((p) => p.id === 'they_initiate') ? 1 : 0) +
    (a.dimensions.care.level === 'strong' ? 2 : a.dimensions.care.level === 'solid' ? 1 : 0) +
    (a.dimensions.reliability.level === 'strong' ? 1 : 0);
  const list = s.active
    .filter((a) => !a.integrityConcern && weight(a) >= 2)
    .sort((x, y) => weight(y) - weight(x))
    .slice(0, 6);
  if (!list.length) {
    d.add('facts', 'Nobody in your records has yet shown up consistently enough for a clear pattern — this often means the record is still young.');
  }
  for (const a of list) {
    const name = a.person.name;
    d.about(a.person);
    const flags = a.greenFlags.slice(0, 3);
    d.add('facts', flags.length ? `${name}: ${flags.map((f) => `${f.label.toLowerCase()} (${times(f.count)})`).join(', ')}.` : `${name}: ${a.dimensions.care.summary.toLowerCase()}.`);
    for (const p of a.patterns.filter((x) => x.kind === 'strength')) d.add('patterns', `${name}: ${p.title.toLowerCase()} — ${p.observation}`);
    if (a.patterns.some((p) => p.id === 'dormant')) d.add('interpretations', `${name} showed up in an earlier season; a quiet season now does not erase that.`);
  }
  if (list.length) {
    d.add('interpretations', 'Presence during difficulty and kept promises are among the clearer signals of care — clearer than how often you are in touch.');
    d.add('unknowns', 'Whether they know their support mattered to you.');
  }
  d.add('unknowns', 'Support you received but did not log.');
  return d;
}

function neglect(s: Scope): Draft {
  const d = new Draft();
  const dash = dashboardOf(s);
  const mirror = buildMirror(s.vault.people, s.assessments, s.vault.interactions, s.asOf);
  for (const n of dash.nurture) d.about(n.person).add('facts', `${n.person.name}: ${n.reason}`);
  for (const n of mirror.neglected) {
    d.about(n.person).add('facts', n.days === null ? `You have not recorded reaching out to ${n.person.name}.` : `Your last recorded outreach or gesture toward ${n.person.name} was ${ago(n.days)}.`);
  }
  for (const { person, commitment } of dash.myCommitments.filter((c) => c.commitment.overdue)) {
    d.about(person).add('facts', commitmentLine(commitment, person.name, s.asOf));
  }
  for (const a of s.active) {
    const quiet = a.patterns.find((p) => p.id === 'dormant');
    if (quiet) d.about(a.person).add('patterns', `${a.person.name}: ${quiet.observation}`);
  }
  if (!d.facts.length && !d.patterns.length) {
    d.add('facts', 'No valued relationship currently looks overdue for contact, based on what you have logged.');
  } else {
    d.add('interpretations', 'Quiet seasons are normal; infrequent contact alone says little about a relationship’s quality.');
    d.add('interpretations', 'If one of these relationships matters to you, a low-pressure check-in is an easy way to find out where it stands.');
    d.add('unknowns', 'How they experience the distance, and whether they have been in a demanding season.');
  }
  d.add('unknowns', 'Contact you did not log — calls, messages, time together.');
  return d;
}

function beforeMeetingBody(a: Assessment, s: Scope): Draft {
  const d = new Draft().about(a.person);
  const { person } = a;
  const items = itemsOf(s.vault, person.id, s.asOf);
  if (a.lastMeaningful && a.daysSinceMeaningful !== null) {
    d.add('facts', `Last meaningful contact: ${formatDate(a.lastMeaningful.date)} (${ago(a.daysSinceMeaningful)}), ${INTERACTION_TYPE[a.lastMeaningful.type].label.toLowerCase()}.`);
  }
  d.add('facts', ...a.openCommitments.map((c) => commitmentLine(c, person.name, s.asOf)));
  for (const i of items.filter((x) => x.decision?.status === 'open')) {
    d.add('facts', `An open decision: ${i.requestKind ? REQUEST_KIND_PHRASE[i.requestKind] : INTERACTION_TYPE[i.type].label.toLowerCase()} from ${formatDate(i.date)}.`);
  }
  for (const i of items.filter((x) => x.note).slice(-3)) d.add('facts', `${formatDate(i.date)} · ${INTERACTION_TYPE[i.type].label}: “${i.note}”`);
  for (const m of a.memories.filter((x) => x.note).slice(0, 2)) d.add('facts', `Worth remembering (${formatMonth(m.date)}): “${m.note}”`);
  if (person.capacityNote) d.add('facts', `You noted their context: ${person.capacityNote}.`);

  for (const p of a.patterns) d.add('patterns', `${p.title}: ${p.observation}`);
  d.add('patterns', flagLine(a, 3));
  if (!a.patterns.length && a.evidenceVolume !== 'none') d.add('patterns', 'No strong patterns stand out yet.');

  for (const p of a.patterns) d.add('interpretations', `${p.title}: ${p.interpretation}${p.suggestion ? ` ${p.suggestion}` : ''}`);
  d.add('unknowns', thinUnknown(a, items.length), 'What has changed for them since you last spoke.', capacityUnknown(a));
  return d;
}

const DOMAIN_WORDS: [RegExp, TrustDomainId][] = [
  [/\bbusiness|\bventure|\bstartup|\bcompany|\bpartnership/, 'business'],
  [/\binvest|\bmoney|\bfinanc|\bsavings|\bfund|\bstock|\bloan|\blend|\bcrypto/, 'financial'],
  [/\bcareer|\bjob|\bwork|\bpromotion|\bsalary/, 'career'],
  [/\bdating|\bromantic|\brelationship advice/, 'dating'],
  [/\bspiritual|\bfaith|\bchurch|\bprayer/, 'spiritual'],
  [/\bintro(duction)?s?\b|\bnetwork/, 'introductions'],
  [/\bemotion|\bfeelings/, 'emotional'],
];

function trustSuggestionBody(a: Assessment, s: Scope, domain: TrustDomainId | null): Draft {
  const d = new Draft().about(a.person);
  const { person } = a;
  const offers = itemsOf(s.vault, person.id, s.asOf)
    .filter((i) => i.actor === 'them' && (i.type === 'request_made' || i.type === 'advice_received' || i.type === 'introduction_referral'))
    .reverse();
  const inDomain = domain ? offers.filter((i) => i.trustDomain === domain || (domain === 'business' && i.requestKind === 'business_proposal') || (domain === 'financial' && i.requestKind === 'money')) : [];
  const pick = inDomain.find((i) => i.decision?.status === 'open') ?? inDomain[0] ?? offers.find((i) => i.decision?.status === 'open') ?? offers[0];
  if (!pick) {
    d.add('facts', `No advice, request or proposal from ${person.name} is recorded.`, placementFact(a));
    d.add('patterns', a.domainSummary);
    d.add('interpretations', 'Without a recorded suggestion there is little to weigh; any suggestion deserves to be evaluated on its own merits.');
    d.add('unknowns', 'What exactly is being suggested — logging it lets Kith compare it with the relationship so far.');
    return d;
  }
  if (domain && !inDomain.length) {
    d.add('unknowns', `Nothing from ${person.name} is recorded about ${TRUST_DOMAIN_LABEL[domain].toLowerCase()}; this answer uses their most recent suggestion instead.`);
  }
  const what = pick.requestKind ? REQUEST_KIND_PHRASE[pick.requestKind] : pick.trustDomain ? `${TRUST_DOMAIN_LABEL[pick.trustDomain].toLowerCase()}` : INTERACTION_TYPE[pick.type].label.toLowerCase();
  d.add('facts', `The most relevant record: ${what} on ${formatDate(pick.date)}${pick.note ? ` — “${pick.note}”` : '.'}`);
  if (pick.decision?.status === 'open') d.add('facts', 'You have not recorded a decision yet.');
  if (pick.concerns?.includes('pressured_decision')) d.add('facts', 'You noted pressure to decide quickly.');

  const evaluation = evaluateAdvice(a, pick);
  d.add('facts', ...evaluation.facts);
  d.add('patterns', ...evaluation.patterns);
  d.add('interpretations', evaluation.guidance, ...evaluation.interpretations);
  d.add('unknowns', ...evaluation.unknowns);

  if (pick.type === 'request_made' || pick.trustDomain === 'financial' || pick.trustDomain === 'business') {
    const pause = pauseAndReflect(person, s.vault.interactions, pick);
    d.add('facts', ...pause.context);
    d.add('patterns', ...pause.differences.map((x) => `Differs from the recent pattern: ${x}`));
    d.add('interpretations', pause.guidance);
    const kindQuestions = pause.questions.slice(7);
    d.add('unknowns', ...[...kindQuestions, 'What independent evidence supports it?', 'Would I make the same decision if someone else presented this?'].map((x) => `A question only you can answer: ${x}`));
  }
  d.add('interpretations', 'This describes the evidence around the suggestion. The decision — and its timing — is yours.');
  return d;
}

function datingBody(a: Assessment): Draft {
  const d = new Draft().about(a.person);
  if (!a.dating) {
    d.add('facts', `${a.person.name} is not marked as a dating interest, so the mutual-interest view is not active.`, a.dimensions.reciprocity.observations[0]);
    d.add('patterns', dimensionLine(a, 'reciprocity'));
    d.add('unknowns', 'Mark them as a dating interest on their profile to see the mutual-interest signals.');
    return d;
  }
  for (const sig of a.dating.signals) d.add(sig.label === 'Consistency' || sig.label === 'Engagement over time' ? 'patterns' : 'facts', `${sig.label}: ${sig.observation}`);
  d.add('patterns', `Current reading: ${DATING_STATUS_LABEL[a.dating.status]}.`);
  for (const p of a.patterns.filter((x) => x.dimension === 'reciprocity')) d.add('patterns', `${p.title}: ${p.observation}`);
  d.add('interpretations', a.dating.statusReason, !a.dating.statusReason.includes('not their feelings') && 'This describes behavior, not their feelings.');
  if (a.person.datingStatus && a.person.datingStatus !== a.dating.status) {
    d.add('interpretations', `You marked this as “${DATING_STATUS_LABEL[a.person.datingStatus]}”; the evidence currently reads as “${DATING_STATUS_LABEL[a.dating.status]}”.`);
  }
  if (a.evidenceVolume === 'thin' || a.dating.status === 'insufficient') d.add('unknowns', 'It is early — a few more interactions will say much more than these do.');
  return d;
}

function dating(s: Scope): Draft {
  const list = named(s);
  if (list.length) return perPerson(s, list, datingBody).add('unknowns', RESPONSE_TIME_NOTE);
  const interests = s.active.filter((a) => a.dating);
  if (!interests.length) {
    return new Draft()
      .add('facts', 'No one in your records is marked as a dating interest.')
      .add('unknowns', 'Add the category “Dating interest” to a person to see mutual-interest signals.');
  }
  const d = perPerson(s, interests, datingBody).add('unknowns', RESPONSE_TIME_NOTE);
  if (interests.length > 1) d.add('unknowns', `You have ${num(interests.length)} dating interests recorded; ask about one by name for a focused answer.`);
  return d;
}

const CHANGE_PATTERN = /^(change_|repair_|significant_)|^(forgiveness|reconnection|dormant)$/;

function changeBody(a: Assessment, s: Scope): Draft {
  const d = new Draft().about(a.person);
  const items = itemsOf(s.vault, a.person.id, s.asOf);
  const yearAgo = addDays(s.asOf, -365);
  const twoYearsAgo = addDays(s.asOf, -730);
  const lastYear = items.filter((i) => i.date >= yearAgo).length;
  const yearBefore = items.filter((i) => i.date >= twoYearsAgo && i.date < yearAgo).length;
  d.add('facts', `${plural(lastYear, 'interaction')} logged in the past twelve months, ${num(yearBefore)} in the twelve months before.`);
  d.add('facts', `Trend: ${TREND_TEXT[a.trend]}. ${a.trendReason}`);
  const changes = a.patterns.filter((p) => CHANGE_PATTERN.test(p.id));
  for (const p of changes) d.add('patterns', `${p.title}: ${p.observation}`);
  for (const id of Object.keys(a.dimensions) as (keyof Assessment['dimensions'])[]) {
    const c = a.dimensions[id].change;
    if (c && !changes.some((p) => p.id === `change_${id}`)) d.add('patterns', `${DIMENSION[id].label}: ${c === 'improved' ? 'improving' : 'recently lower'} compared with the months before.`);
  }
  for (const p of changes) d.add('interpretations', `${p.title}: ${p.interpretation}`);
  if (items.some((i) => i.type === 'forgiven') && !items.some((i) => i.type === 'trust_restored')) {
    d.add('interpretations', 'Forgiveness and restored trust are different things; the evidence since can show whether trust is rebuilding, at whatever pace feels right to you.');
  }
  if (!changes.length && !d.patterns.length) d.add('interpretations', 'The record does not show a clear change over this period; steadiness is information too.');
  d.add('unknowns', 'What drove any change — their circumstances, deliberate effort, or events you did not log.');
  d.add('unknowns', 'Kith compares the last six months with the year before; slower shifts may not show yet.');
  return d;
}

function changeAll(s: Scope): Draft {
  const d = new Draft();
  const dash = dashboardOf(s);
  for (const i of dash.improving) d.about(i.person).add('facts', `${i.person.name}: ${i.reason.toLowerCase()} — ${i.assessment.trendReason}`);
  for (const a of s.active.filter((x) => x.trend === 'declining')) d.about(a.person).add('facts', `${a.person.name}: recently lower — ${a.trendReason}`);
  for (const a of s.active) {
    for (const p of a.patterns.filter((x) => x.kind === 'change')) d.add('patterns', `${a.person.name}: ${p.observation}`);
  }
  if (!d.facts.length) d.add('facts', 'No relationship shows a clear change between the last six months and the year before.');
  else d.add('interpretations', 'People can change in both directions. A recent shift may be a season rather than a new normal — it is worth watching before concluding.');
  d.add('unknowns', 'What drove these changes. Name a person for a closer look.');
  return d;
}

const BOUNDARY_IDS = ['repeated_cancellations', 'low_follow_through', 'boundaries', 'transactional', 'drained'];

function boundaries(s: Scope): Draft {
  const d = new Draft();
  const dash = dashboardOf(s);
  for (const b of dash.boundaries) {
    const a = b.assessment;
    d.about(a.person);
    const hits = a.patterns.filter((p) => p.kind === 'concern' && (BOUNDARY_IDS.includes(p.id) || p.id.startsWith('reappearance_') || p.id.startsWith('significant_')));
    for (const p of hits) {
      d.add('facts', `${a.person.name}: ${p.observation}`);
      d.add('patterns', `${a.person.name}: ${p.title.toLowerCase()}.`);
      d.add('interpretations', `${a.person.name}: ${p.interpretation}${p.suggestion ? ` ${p.suggestion}` : ''}`);
    }
  }
  for (const a of s.active) {
    if (a.expectationGap === 'exceeds' && a.suggestedCircle === 5) {
      d.about(a.person).add('interpretations', `With ${a.person.name}, consider maintaining stronger boundaries until additional trust is established.`);
    }
    // Domain-specific limits: close people can still be unproven in a particular area.
    for (const dom of a.domains) {
      if (dom.evidence === 'concern' || dom.evidence === 'mixed') {
        d.about(a.person).add('facts', `${a.person.name}: ${dom.label.toLowerCase()} — ${num(dom.positive)} positive and ${num(dom.negative)} negative outcomes.`);
      } else if (dom.evidence === 'limited' && dom.pending > 0 && (dom.domain === 'financial' || dom.domain === 'business')) {
        d.about(a.person).add('patterns', `${a.person.name}: advice pending in ${dom.label.toLowerCase()}, with no track record there yet.`);
        d.add('interpretations', `${a.person.name}: a strong record elsewhere is not evidence about ${dom.label.toLowerCase()}; independent checks in that area may be worthwhile, however close you are.`);
      }
    }
  }
  if (!d.facts.length && !d.patterns.length) {
    d.add('facts', 'No relationship currently shows repeated boundary friction, low follow-through, or request-centered contact.');
  }
  d.add('interpretations', 'A boundary can be specific: someone can be good company and still not the right person for a particular kind of trust.');
  d.add('unknowns', 'Whether the limits you hold have been stated to them, and how they understand them.');
  return d;
}

function credible(s: Scope): Draft {
  const d = new Draft();
  for (const a of s.active) {
    const good = a.domains.filter((x) => (x.evidence === 'strong' || x.evidence === 'some') && x.positive > 0);
    if (a.integrityConcern && good.length) {
      d.about(a.person).add('interpretations', `An unrepaired breach of confidence with ${a.person.name} affects trust in every area, whatever their expertise.`);
    }
    for (const x of good) {
      d.about(a.person).add('facts', `${a.person.name}: ${x.label.toLowerCase()} — ${plural(x.positive, 'positive outcome')}${x.negative ? `, ${num(x.negative)} negative` : ''}.`);
      if (x.userLevel === 'unassessed') continue;
      if (x.userLevel === 'caution' || x.userLevel === 'limited') {
        d.add('interpretations', `You rate ${a.person.name}'s ${x.label.toLowerCase()} as ${x.userLevel}; the recorded outcomes are more positive than that.`);
      }
    }
    if (good.length && a.domainSummary) d.add('patterns', `${a.person.name}: ${a.domainSummary}`);
    for (const x of a.domains) {
      if (x.userLevel === 'strong' && x.evidence === 'limited') {
        d.about(a.person).add('interpretations', `You rate ${a.person.name}'s ${x.label.toLowerCase()} as strong; the recorded outcomes do not show that yet — possibly because they were never logged.`);
      }
      if (x.pending) d.about(a.person).add('unknowns', `${a.person.name}: ${plural(x.pending, 'piece')} of ${x.label.toLowerCase()} still without a known outcome.`);
    }
  }
  if (!d.facts.length) d.add('facts', 'No advice with a known outcome is recorded yet. Recording outcomes (helpful, mixed, unhelpful) builds a domain track record.');
  d.add('interpretations', 'Credibility is domain-specific: a strong record in one area is not evidence in another.');
  d.add('unknowns', 'Advice whose outcome is unrecorded counts as unknown — neither success nor failure.');
  return d;
}

function mirror(s: Scope): Draft {
  const d = new Draft();
  const m = buildMirror(s.vault.people, s.assessments, s.vault.interactions, s.asOf);
  for (const st of m.stats) d.add('facts', `${st.question} ${st.observation}`);
  for (const n of m.neglected) d.about(n.person).add('patterns', n.days === null ? `You have not recorded reaching out to ${n.person.name}, whom you value.` : `Your last recorded gesture toward ${n.person.name}, whom you value, was ${ago(n.days)}.`);
  for (const e of m.expectingMore) d.about(e.person).add('patterns', e.observation);
  d.add('interpretations', 'These are the same standards Kith applies to others, turned toward you. No single number captures being a good friend, and good intentions often go unlogged.');
  const mine = s.active.flatMap((a) => a.openCommitments.filter((c) => c.owner === 'me' && c.overdue).map((c) => ({ a, c })));
  for (const { a, c } of mine) d.about(a.person).add('interpretations', `Within your control right now: ${commitmentLine(c, a.person.name, s.asOf)}`);
  d.add('unknowns', 'How others experience you — only they can say. Asking someone you trust is the most direct evidence.', ...m.prompts);
  return d;
}

// ── Examples & fallback ──

/** The §17 questions, using the user's own people where the record suggests a fitting example. */
export function exampleQuestions(vault: Vault, assessments: Map<string, Assessment>, asOf: string): string[] {
  const active = vault.people.filter((p) => !p.archived).map((p) => assessments.get(p.id)).filter((a): a is Assessment => !!a);
  const dash = buildDashboard(vault.people, assessments, vault.interactions, vault.settings, asOf);
  const byVolume = [...active].sort((a, b) => b.volumeYear - a.volumeYear);
  const friend = dash.closest[0]?.person ?? byVolume[0]?.person;
  const noteworthy = active.find((a) => !a.dating && a.patterns.some((p) => p.kind === 'concern') && a.person.id !== friend?.id)?.person ?? friend;
  const pending = dash.pendingDecisions[0];
  const changed = dash.improving[0]?.person ?? active.find((a) => a.patterns.some((p) => p.kind === 'change'))?.person;
  const datingList = active.filter((a) => a.dating);
  const pendingWord = pending?.interaction.trustDomain
    ? ({ business: 'business', financial: 'financial', career: 'career', introductions: 'introduction', dating: 'dating' } as Partial<Record<TrustDomainId, string>>)[pending.interaction.trustDomain]
    : undefined;
  const out: (string | false | undefined)[] = [
    friend && `How would you characterize my friendship with ${friend.name}?`,
    'Who are my closest relationships?',
    'Am I investing disproportionately in anyone?',
    'Who has consistently shown up for me?',
    'Are there relationships I might be neglecting?',
    noteworthy && `What patterns should I remember before meeting ${noteworthy.name}?`,
    pending && `Should I trust ${pending.person.name}’s ${pendingWord ? `${pendingWord} ` : ''}suggestion?`,
    datingList.length === 1 && 'Is there evidence that this dating relationship is reciprocal?',
    datingList.length > 1 && `Is there evidence that my dating relationship with ${datingList[0].person.name} is reciprocal?`,
    changed && `What changed in my friendship with ${changed.name} over the last year?`,
    'Where should I keep stronger boundaries?',
    'Whose advice has proven credible, and in what?',
    'Am I being a good friend?',
  ];
  return [...new Set(out.filter((x): x is string => !!x))];
}

function help(s: Scope, reason: string): Draft {
  const examples = exampleQuestions(s.vault, s.assessments, s.asOf).slice(0, 6);
  return new Draft()
    .add('facts', `Your records hold ${plural(s.active.length, 'person', 'people')} and ${plural(s.vault.interactions.length, 'interaction')}.`)
    .add('unknowns', `${reason} The on-device analyst can answer questions like: ${examples.map((e) => `“${e}”`).join(' ')}`);
}

/** Answers a free-text question from recorded evidence only. Deterministic; nothing leaves the device. */
export function answerLocally(question: string, vault: Vault, assessments: Map<string, Assessment>, asOf: string): AnalystAnswer {
  const q = question.toLowerCase().replace(/[’‘]/g, "'").trim();
  const match = findPeople(question, vault.people);
  const active = vault.people.filter((p) => !p.archived).map((p) => assessments.get(p.id)).filter((a): a is Assessment => !!a);
  const s: Scope = { question, vault, assessments, asOf, match, active };
  const people = named(s);
  const intent = classify(q, people.length > 0) ?? (people.length ? 'characterize' : null);

  let d: Draft;
  switch (intent) {
    case 'mirror':
      d = mirror(s);
      break;
    case 'dating':
      d = dating(s);
      break;
    case 'credible':
      d = credible(s);
      break;
    case 'trust_suggestion': {
      const domain = DOMAIN_WORDS.find(([re]) => re.test(q))?.[1] ?? null;
      if (people.length) d = perPerson(s, people, (a) => trustSuggestionBody(a, s, domain));
      else {
        const open = buildDashboard(vault.people, assessments, vault.interactions, vault.settings, asOf).pendingDecisions[0];
        const a = open && assessments.get(open.person.id);
        d = a ? trustSuggestionBody(a, s, domain ?? open.interaction.trustDomain ?? null).add('unknowns', `No name was given, so this uses your most recent open decision (${open.person.name}).`) : help(s, 'Whose suggestion do you mean? Name the person.');
      }
      break;
    }
    case 'before_meeting':
      d = people.length ? perPerson(s, people, (a) => beforeMeetingBody(a, s)) : help(s, 'Who are you meeting? Name the person.');
      break;
    case 'change':
      d = people.length ? perPerson(s, people, (a) => changeBody(a, s)) : changeAll(s);
      break;
    case 'invest':
      d = invest(s);
      break;
    case 'shown_up':
      d = shownUp(s);
      break;
    case 'neglect':
      d = neglect(s);
      break;
    case 'boundaries':
      d = boundaries(s);
      break;
    case 'closest':
      d = closest(s);
      break;
    case 'characterize':
      d = people.length ? perPerson(s, people, (a) => characterizeBody(a, vault, asOf)) : help(s, 'Which relationship do you mean? Name the person.');
      break;
    case null:
      d = help(s, 'This question did not match what can be answered from your records.');
      break;
  }
  if (intent) d.add('unknowns', INNER_LIFE, UNLOGGED);
  return d.done();
}
