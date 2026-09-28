import { describe, expect, it } from 'vitest';
import { demoVault } from '../domain/demo';
import { newInteraction, newPerson } from '../domain/factory';
import type { Vault } from '../domain/types';
import { assessAll, RESPONSE_TIME_NOTE } from '../engine';
import { answerLocally, characterize, exampleQuestions, findPeople } from './analyst';
import { buildEvidencePacket, pseudonymizeText, restoreNames } from './packet';
import type { AnalystAnswer } from './types';

const AS_OF = '2026-09-26';

function setup(v: Vault = demoVault(AS_OF)) {
  const assessments = assessAll(v.people, v.interactions, AS_OF);
  return { v, assessments, ask: (q: string) => answerLocally(q, v, assessments, AS_OF) };
}

const allText = (a: AnalystAnswer) => [...a.facts, ...a.patterns, ...a.interpretations, ...a.unknowns].join('\n');

const FORBIDDEN = /toxic|manipulat|narciss|fake friend|selfish|using you|red flag/i;

describe('local analyst routing', () => {
  const { ask } = setup();
  const cases: [string, string][] = [
    ['How would you characterize my friendship with James?', 'James'],
    ['Who are my closest relationships?', 'Marcus'],
    ['Am I investing disproportionately in anyone?', 'Sarah'],
    ['Who has consistently shown up for me?', 'Marcus'],
    ['Are there relationships I might be neglecting?', 'Lena'],
    ['What patterns should I remember before meeting Sarah?', 'Sarah'],
    ['Should I trust Michael’s business suggestion?', 'Michael'],
    ['What changed in my friendship with David over the last year?', 'David'],
    ['Where should I keep stronger boundaries?', 'Tom'],
    ['Whose advice is credible?', 'Marcus'],
  ];
  it.each(cases)('%s → draws facts from %s', (q, name) => {
    const a = ask(q);
    expect(a.source).toBe('local');
    expect(a.facts.length).toBeGreaterThan(0);
    expect(a.unknowns.length).toBeGreaterThan(0);
    expect(a.people).toContain(name);
  });

  it('person-specific questions stay on that person', () => {
    expect(ask('What patterns should I remember before meeting Sarah?').people).toEqual(['Sarah']);
    const trust = ask('Should I trust Michael’s business suggestion?');
    expect(trust.people).toEqual(['Michael']);
    expect(trust.facts.join(' ')).toContain('$15k');
  });

  it('the self-mirror answers from the user’s own behavior', () => {
    const a = ask('Am I being a good friend?');
    expect(a.facts.some((f) => f.startsWith('Do you follow through?'))).toBe(true);
  });

  it('a dating question without a name uses the only dating interest and never treats response time as evidence', () => {
    const v = demoVault(AS_OF);
    const alex = v.people.find((p) => p.name === 'Alex')!;
    const single = setup({ ...v, people: v.people.filter((p) => p.id !== alex.id), interactions: v.interactions.filter((i) => i.personId !== alex.id) });
    const a = single.ask('Is there evidence that this dating relationship is reciprocal?');
    expect(a.people).toEqual(['Priya']);
    expect(a.facts.length).toBeGreaterThan(0);
    expect(a.unknowns).toContain(RESPONSE_TIME_NOTE);
  });

  it('unrecognized questions fall back to example questions instead of guessing', () => {
    const a = ask('banana');
    expect(a.people).toEqual([]);
    expect(a.unknowns.join(' ')).toMatch(/closest relationships/);
  });
});

describe('name matching', () => {
  const { v } = setup();
  it('matches possessives and ignores longer words', () => {
    for (const q of ["What about James's plans?", 'What about James’s plans?', 'is JAMES around']) {
      expect(findPeople(q, v.people).people.map((p) => p.name)).toEqual(['James']);
    }
    expect(findPeople('Jameson called', v.people).people).toEqual([]);
  });

  it('reports people who share a name', () => {
    const base = demoVault(AS_OF);
    const other = newPerson({ name: 'James', contexts: ['Work'] });
    const v2: Vault = {
      ...base,
      people: [...base.people, other],
      interactions: [...base.interactions, newInteraction({ personId: other.id, type: 'text_conversation', date: '2026-09-01', actor: 'them' })],
    };
    const match = findPeople('Tell me about James', v2.people);
    expect(match.people).toHaveLength(2);
    expect(match.ambiguous[0].people).toHaveLength(2);
    const a = setup(v2).ask('How would you characterize my friendship with James?');
    expect(a.unknowns.some((u) => u.includes('two people named James'))).toBe(true);
  });
});

describe('answer safety', () => {
  const { v, assessments, ask } = setup();

  it('never directs the user to accept or reject a suggestion', () => {
    for (const q of ['Should I trust Michael’s business suggestion?', 'Should I trust Marcus’s investment advice?']) {
      const text = allText(ask(q));
      expect(text).not.toMatch(/\byou should (accept|reject|decline|agree|invest|say (yes|no))\b/i);
      expect(text).not.toMatch(/\b(accept|reject|decline|turn down) (it|this|the (offer|proposal|suggestion|advice))\b/i);
      expect(text).not.toMatch(/\b(end|cut off|walk away from) (the|this) (friendship|relationship)\b/i);
    }
  });

  it('never uses character labels, in any answer or profile summary', () => {
    const questions = [...exampleQuestions(v, assessments, AS_OF), 'Is there evidence that this dating relationship is reciprocal?', 'What changed recently?'];
    for (const q of questions) expect(allText(ask(q))).not.toMatch(FORBIDDEN);
    for (const a of assessments.values()) expect(allText(characterize(a, v, AS_OF))).not.toMatch(FORBIDDEN);
  });
});

describe('evidence packet', () => {
  function vaultWithCrossMentions(): Vault {
    const v = demoVault(AS_OF);
    const marcus = v.people.find((p) => p.name === 'Marcus')!;
    const sarah = v.people.find((p) => p.name === 'Sarah')!;
    sarah.capacityNote = 'Caring for her mother';
    v.interactions.push(
      newInteraction({ personId: marcus.id, type: 'text_conversation', date: '2026-09-20', actor: 'them', note: 'Asked how Sarah and Lena are doing', reflection: "Marcus's advice about Tom helped" }),
    );
    return v;
  }

  it('pseudonymization removes every real name, including inside notes', () => {
    const v = vaultWithCrossMentions();
    const { text, aliases } = buildEvidencePacket(v, assessAll(v.people, v.interactions, AS_OF), AS_OF, { pseudonymize: true, includeNotes: true });
    expect(text).toContain('Asked how');
    for (const p of v.people) expect(text).not.toMatch(new RegExp(`\\b${p.name}\\b`, 'i'));
    expect([...aliases.values()].sort()).toEqual(v.people.map((p) => p.name).sort());
  });

  it('withholds notes, reflections and availability context unless included', () => {
    const v = vaultWithCrossMentions();
    const { text } = buildEvidencePacket(v, assessAll(v.people, v.interactions, AS_OF), AS_OF, { pseudonymize: false, includeNotes: false });
    expect(text).toContain('Marcus');
    expect(text).not.toContain('Asked how');
    expect(text).not.toContain('advice about');
    expect(text).not.toContain('Caring for her mother');
  });

  it('restoreNames round-trips pseudonymized text', () => {
    const v = demoVault(AS_OF);
    const { aliases } = buildEvidencePacket(v, assessAll(v.people, v.interactions, AS_OF), AS_OF, { pseudonymize: true, includeNotes: false });
    const original = "Marcus's advice helped more than Sarah expected; Tom and Lena disagreed.";
    const hidden = pseudonymizeText(original, aliases);
    expect(hidden).not.toMatch(/Marcus|Sarah|Tom|Lena/);
    expect(restoreNames(hidden, aliases)).toBe(original);
  });

  it('focuses on the requested people', () => {
    const v = demoVault(AS_OF);
    const tom = v.people.find((p) => p.name === 'Tom')!;
    const { text } = buildEvidencePacket(v, assessAll(v.people, v.interactions, AS_OF), AS_OF, { pseudonymize: false, includeNotes: false, focusPersonIds: [tom.id] });
    expect(text).toContain('## Tom');
    expect(text).not.toContain('## Marcus');
  });
});
