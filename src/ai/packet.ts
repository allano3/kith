/**
 * The evidence packet: the only thing an external model may ever see. Plain,
 * structured text built from the engine's assessments — optionally with names
 * replaced by aliases and with free-text notes withheld.
 */
import {
  BALANCE_LABEL,
  CATEGORY,
  CIRCLE,
  CONCERN_TAG,
  DATING_STATUS_LABEL,
  DIMENSION,
  FOCUS_LABEL,
  GREEN_FLAG,
  INFLUENCE_LABEL,
  INTERACTION_TYPE,
  INVITE_RESPONSE_LABEL,
  MOOD_LABEL,
  OUTCOME_LABEL,
  RECEPTION_LABEL,
  REQUEST_KIND_LABEL,
  TRUST_DOMAIN_LABEL,
} from '../domain/taxonomy';
import type { DimensionId, Interaction, Person, Vault } from '../domain/types';
import { buildMirror, type Assessment } from '../engine';
import { daysBetween } from '../engine/time';

export interface PacketOptions {
  /** Replace every person's name (including inside free text) with an alias. */
  pseudonymize: boolean;
  /** Include interaction notes, reflections, profile notes and availability context. */
  includeNotes: boolean;
  /** Restrict the per-person sections to these people. */
  focusPersonIds?: string[];
}

export interface EvidencePacket {
  text: string;
  /** alias → real name. Empty when not pseudonymized. */
  aliases: Map<string, string>;
}

/** Interactions listed per person, most recent first. */
export const PACKET_INTERACTION_CAP = 25;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wordRe(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/** "A", "B", … "Z", "AA", "AB", … */
function aliasLetters(n: number): string {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

/**
 * Replaces real names with their aliases in free text. Full names are replaced
 * first; a first name alone is replaced when exactly one person has it.
 */
export function pseudonymizeText(text: string, aliases: Map<string, string>): string {
  const firstCount: Record<string, number> = {};
  for (const name of aliases.values()) {
    const first = name.trim().split(/\s+/)[0].toLowerCase();
    firstCount[first] = (firstCount[first] ?? 0) + 1;
  }
  const rules: [string, string][] = [];
  for (const [alias, name] of aliases) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    rules.push([trimmed, alias]);
    const first = trimmed.split(/\s+/)[0];
    if (first !== trimmed && firstCount[first.toLowerCase()] === 1) rules.push([first, alias]);
  }
  rules.sort((a, b) => b[0].length - a[0].length);
  // Placeholders keep an alias from being rewritten by a later, shorter rule.
  let out = text;
  rules.forEach(([name], i) => {
    out = out.replace(wordRe(name), `\u0000${i}\u0000`);
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => rules[Number(i)][1]);
}

/** Puts real names back into model output. */
export function restoreNames(text: string, aliases: Map<string, string>): string {
  if (!aliases.size) return text;
  const sorted = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return text.replace(re, (alias) => aliases.get(alias) ?? alias);
}

function interactionLine(i: Interaction, asOf: string, includeNotes: boolean, clean: (s: string) => string): string {
  const def = INTERACTION_TYPE[i.type];
  const parts = [i.date, def.label, def.actors[i.actor] ?? (i.actor === 'unknown' ? 'actor not recorded' : i.actor)];
  if (i.significance !== 'routine') parts.push(i.significance);
  if (i.focus) parts.push(`focus: ${FOCUS_LABEL[i.focus]}`);
  if (i.balance) parts.push(`balance: ${BALANCE_LABEL[i.balance]}`);
  if (i.mood) parts.push(`user felt: ${MOOD_LABEL[i.mood]}`);
  if (i.influence) parts.push(`influence: ${INFLUENCE_LABEL[i.influence]}`);
  if (i.trustDomain) parts.push(`domain: ${TRUST_DOMAIN_LABEL[i.trustDomain]}`);
  if (i.requestKind) parts.push(`request: ${REQUEST_KIND_LABEL[i.requestKind]}`);
  if (i.outcome) parts.push(`outcome: ${OUTCOME_LABEL[i.outcome]}`);
  if (i.conflictOfInterest && i.conflictOfInterest !== 'unknown') parts.push(`they would benefit: ${i.conflictOfInterest}`);
  if (i.independentEvidence && i.independentEvidence !== 'unknown') parts.push(`independent evidence: ${i.independentEvidence}`);
  if (i.inviteResponse) parts.push(`response: ${INVITE_RESPONSE_LABEL[i.inviteResponse]}`);
  if (i.reception) parts.push(`received: ${RECEPTION_LABEL[i.reception]}`);
  if (i.rescheduleOffered !== undefined) parts.push(i.rescheduleOffered ? 'another time offered' : 'no other time offered');
  if (i.costly) parts.push('cost them something');
  if (i.dueDate) parts.push(`due ${i.dueDate}${i.dueDate < asOf ? ` (${daysBetween(i.dueDate, asOf)} days ago)` : ''}`);
  if (i.released) parts.push('released');
  if (i.greenFlags?.length) parts.push(`green flags: ${i.greenFlags.map((f) => GREEN_FLAG[f].label).join(', ')}`);
  if (i.concerns?.length) parts.push(`worth noting: ${i.concerns.map((c) => CONCERN_TAG[c].label).join(', ')}`);
  if (i.decision) parts.push(`decision: ${i.decision.status}`);
  let line = `- ${parts.join(' · ')}`;
  if (includeNotes && i.note) line += `\n  note: ${clean(i.note)}`;
  if (includeNotes && i.reflection) line += `\n  reflection: ${clean(i.reflection)}`;
  if (includeNotes && i.decision?.note) line += `\n  decision note: ${clean(i.decision.note)}`;
  return line;
}

function personSection(a: Assessment, label: string, vault: Vault, asOf: string, opts: PacketOptions, clean: (s: string) => string): string {
  const p: Person = a.person;
  const lines: string[] = [`## ${label}`];
  lines.push(`Categories: ${p.categories.map((c) => CATEGORY[c].label).join(', ') || 'none'}`);
  lines.push(
    `Circle — user's choice: ${p.circle ? CIRCLE[p.circle].name : 'not placed'}; evidence suggests: ${a.suggestedCircle ? CIRCLE[a.suggestedCircle].name : 'not enough evidence'} (expectation vs evidence: ${a.expectationGap})`,
  );
  if (a.suggestedCategory) lines.push(`Suggested category: ${CATEGORY[a.suggestedCategory].label}`);
  lines.push(
    `History: since ${a.firstDate ?? 'unknown'} · evidence volume: ${a.evidenceVolume} · ${a.volumeYear} interactions in the last 12 months` +
      (a.lastMeaningful ? ` · last meaningful contact ${a.lastMeaningful.date} (${a.daysSinceMeaningful} days ago)` : ''),
  );
  if (p.contexts.length) lines.push(`Contexts: ${p.contexts.map(clean).join(', ')}`);
  if (p.capacityNote) lines.push(`Availability context: ${opts.includeNotes ? clean(p.capacityNote) : 'recorded (text withheld)'}`);
  if (opts.includeNotes && p.notes) lines.push(`Profile notes: ${clean(p.notes)}`);
  lines.push(`Trend: ${a.trend} — ${clean(a.trendReason)}`);

  lines.push('Dimensions:');
  for (const id of Object.keys(a.dimensions) as DimensionId[]) {
    const d = a.dimensions[id];
    lines.push(`- ${DIMENSION[id].label}: ${d.level}${d.level !== 'insufficient' ? ` (${d.confidence} confidence)` : ''}${d.change ? `, ${d.change}` : ''} — ${d.summary}.${d.observations.length ? ` ${clean(d.observations.join(' '))}` : ''}`);
  }
  if (a.patterns.length) {
    lines.push('Patterns:');
    for (const pat of a.patterns) {
      lines.push(`- [${pat.kind}] ${pat.title}. Observation: ${clean(pat.observation)} Interpretation: ${clean(pat.interpretation)}`);
    }
  }
  if (a.openCommitments.length) {
    lines.push('Open commitments:');
    for (const c of a.openCommitments) {
      const note = opts.includeNotes && c.item.note ? ` — ${clean(c.item.note)}` : '';
      lines.push(`- ${c.kind} by ${c.owner === 'me' ? 'user' : c.owner === 'them' ? 'them' : c.owner}, made ${c.item.date}${c.dueDate ? `, due ${c.dueDate}` : ''}${c.overdue ? ', overdue' : ''}${note}`);
    }
  }
  const domains = a.domains.filter((d) => d.evidence !== 'limited' || d.pending > 0 || d.userLevel !== 'unassessed');
  if (a.domainSummary || domains.length) {
    lines.push(`Trust by domain: ${a.domainSummary ? clean(a.domainSummary) : 'no summary'}`);
    for (const d of domains) {
      const note = opts.includeNotes && d.userNote ? ` — ${clean(d.userNote)}` : '';
      lines.push(`- ${d.label}: evidence ${d.evidence} (${d.positive} positive, ${d.negative} negative, ${d.pending} pending); user's own view: ${d.userLevel}${note}`);
    }
  }
  if (a.integrityConcern) lines.push('Integrity: an earlier breach of confidence has not been repaired.');
  if (a.greenFlags.length) lines.push(`Green flags: ${a.greenFlags.map((f) => `${f.label} ×${f.count}`).join(', ')}`);
  if (a.dating) {
    lines.push(`Dating: ${DATING_STATUS_LABEL[a.dating.status]} — ${clean(a.dating.statusReason)}${p.datingStatus ? ` (user marked: ${DATING_STATUS_LABEL[p.datingStatus]})` : ''}`);
    for (const s of a.dating.signals) lines.push(`- ${s.label}: ${clean(s.observation)}`);
  }

  const items = vault.interactions.filter((i) => i.personId === p.id && i.date <= asOf).sort((x, y) => y.date.localeCompare(x.date));
  const shown = items.slice(0, PACKET_INTERACTION_CAP);
  lines.push(`Recent interactions (${shown.length} of ${items.length}, newest first):`);
  for (const i of shown) lines.push(interactionLine(i, asOf, opts.includeNotes, clean));
  return lines.join('\n');
}

/** Builds the structured text an external model may see, plus the alias table to restore names afterwards. */
export function buildEvidencePacket(vault: Vault, assessments: Map<string, Assessment>, asOf: string, opts: PacketOptions): EvidencePacket {
  const aliases = new Map<string, string>();
  const labelOf = new Map<string, string>();
  vault.people.forEach((p, i) => {
    const label = opts.pseudonymize ? `Person ${aliasLetters(i)}` : p.name;
    labelOf.set(p.id, label);
    if (opts.pseudonymize) aliases.set(label, p.name);
  });
  let clean = (s: string) => s;
  if (opts.pseudonymize) clean = (s) => pseudonymizeText(s, aliases);
  const withheld = opts.includeNotes ? [] : vault.people.map((p) => p.capacityNote).filter((n): n is string => !!n);
  if (withheld.length) {
    const scrub = clean;
    // Engine text quotes availability context verbatim; withhold it along with other free text.
    clean = (s) => scrub(withheld.reduce((acc, n) => acc.split(n).join('(availability context withheld)'), s));
  }

  const focus = opts.focusPersonIds ? new Set(opts.focusPersonIds) : null;
  const people = vault.people.filter((p) => !p.archived && (!focus || focus.has(p.id)));
  const sections: string[] = [
    `KITH EVIDENCE SUMMARY — as of ${asOf}`,
    `Names: ${opts.pseudonymize ? 'replaced with aliases (Person A, Person B, …)' : 'real names'}. Free-text notes and reflections: ${opts.includeNotes ? 'included' : 'withheld'}.`,
    'Everything below was logged by the user about their own relationships. "user" / "me" is the user; "them" is the other person. Levels are qualitative (strong, solid, mixed, concern, insufficient); there are no scores. Response time is not tracked.',
  ];

  const mirror = buildMirror(vault.people, assessments, vault.interactions, asOf);
  sections.push(['## The user (same standards, reflected back)', ...mirror.stats.map((s) => `- ${s.question} ${s.observation}`)].join('\n'));

  for (const p of people) {
    const a = assessments.get(p.id);
    if (a) sections.push(personSection(a, labelOf.get(p.id) ?? p.name, vault, asOf, opts, clean));
  }
  if (!people.length) sections.push('No people are recorded.');
  return { text: sections.join('\n\n'), aliases };
}
