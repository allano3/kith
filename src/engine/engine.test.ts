import { describe, expect, it } from 'vitest';
import { demoVault } from '../domain/demo';
import { newInteraction, newPerson } from '../domain/factory';
import type { Actor, Interaction, InteractionTypeId, Person } from '../domain/types';
import { assessAll, assessPerson, buildDashboard, buildMirror, deriveCommitments, evaluateAdvice, pauseAndReflect } from './index';
import { addDays } from './time';

const AS_OF = '2026-06-01';

type Add = (daysAgo: number, type: InteractionTypeId, actor: Actor, extra?: Partial<Interaction>) => Interaction;

function fixture(p: Partial<Person> = {}) {
  const person = newPerson({ name: 'Sam', since: '2020', ...p });
  const log: Interaction[] = [];
  const add: Add = (daysAgo, type, actor, extra = {}) => {
    const i = newInteraction({ personId: person.id, type, actor, date: addDays(AS_OF, -daysAgo), ...extra });
    log.push(i);
    return i;
  };
  return { person, log, add, assess: () => assessPerson(person, log, AS_OF) };
}

describe('patterns over incidents', () => {
  it('a single broken promise does not produce a reliability concern; repetition does', () => {
    const f = fixture();
    for (const d of [300, 200, 100]) {
      const p = f.add(d, 'promise_made', 'them');
      f.add(d - 5, 'promise_kept', 'them', { relatesTo: p.id });
    }
    const p = f.add(40, 'promise_made', 'them');
    f.add(30, 'promise_broken', 'them', { relatesTo: p.id });
    expect(f.assess().dimensions.reliability.level).not.toBe('concern');

    for (const d of [25, 15]) {
      const q = f.add(d, 'promise_made', 'them');
      f.add(d - 2, 'promise_broken', 'them', { relatesTo: q.id });
    }
    const a = f.assess();
    expect(a.dimensions.reliability.level).toBe('concern');
    expect(a.patterns.some((x) => x.id === 'low_follow_through')).toBe(true);
  });

  it('detects improvement so past concerns can fade', () => {
    const f = fixture();
    for (const d of [500, 450, 400]) {
      const p = f.add(d, 'promise_made', 'them');
      f.add(d - 5, 'promise_broken', 'them', { relatesTo: p.id });
    }
    for (const d of [150, 110, 70, 30]) {
      const p = f.add(d, 'promise_made', 'them');
      f.add(d - 5, 'promise_kept', 'them', { relatesTo: p.id });
    }
    const a = f.assess();
    expect(a.dimensions.reliability.change).toBe('improved');
    expect(a.patterns.find((x) => x.id === 'change_reliability')?.observation).toMatch(/concerns earlier/);
  });
});

describe('reciprocity tolerates imbalance', () => {
  const oneSided = (add: Add) => {
    // 11 of 12 initiations by the user, spread over ~8 months.
    for (let k = 0; k < 12; k++) add(250 - k * 20, 'text_conversation', k === 5 ? 'them' : 'me', { focus: 'connection' });
    // Enough care evidence (not itself contact) that "little care" is not the corroborating signal.
    for (const d of [200, 120, 60]) add(d, 'help_received', 'them');
  };

  it('uneven initiation alone is an observation, not a concern', () => {
    const f = fixture();
    oneSided(f.add);
    const a = f.assess();
    expect(a.dimensions.reciprocity.level).toBe('mixed');
    expect(a.patterns.find((p) => p.id === 'uneven_initiation')?.kind).toBe('context');
  });

  it('becomes a concern when corroborated by the user feeling depleted', () => {
    const f = fixture();
    oneSided(f.add);
    f.add(50, 'text_conversation', 'me', { mood: 'drained' });
    f.add(10, 'text_conversation', 'me', { mood: 'drained' });
    expect(f.assess().dimensions.reciprocity.level).toBe('concern');
  });

  it('a declared capacity limit prevents escalation', () => {
    const f = fixture({ capacityNote: 'newborn twins' });
    oneSided(f.add);
    f.add(50, 'text_conversation', 'me', { mood: 'drained' });
    f.add(10, 'text_conversation', 'me', { mood: 'drained' });
    const a = f.assess();
    expect(a.dimensions.reciprocity.level).toBe('mixed');
    expect(a.dimensions.reciprocity.observations.join(' ')).toMatch(/newborn twins/);
  });
});

describe('commitments', () => {
  it('tracks reschedules, cancellations and never-rescheduled plans', () => {
    const f = fixture();
    const a = f.add(40, 'plans_made', 'me', { dueDate: addDays(AS_OF, -30) });
    f.add(32, 'rescheduled_plans', 'them', { relatesTo: a.id, dueDate: addDays(AS_OF, 10) });
    const b = f.add(160, 'plans_made', 'me', { dueDate: addDays(AS_OF, -150) });
    f.add(151, 'cancelled_plans', 'them', { relatesTo: b.id, rescheduleOffered: false });
    const c = f.add(90, 'plans_made', 'me', { dueDate: addDays(AS_OF, -85) });
    f.add(86, 'cancelled_plans', 'them', { relatesTo: c.id, rescheduleOffered: false });
    f.add(80, 'plans_made', 'them'); // fresh plans within 30 days of the cancellation count as rescheduling
    const byId = new Map(deriveCommitments(f.log, AS_OF).map((x) => [x.item.id, x]));
    expect(byId.get(a.id)).toMatchObject({ status: 'open', dueDate: addDays(AS_OF, 10), overdue: false });
    expect(byId.get(b.id)).toMatchObject({ status: 'cancelled', cancelledBy: 'them', neverRescheduled: true });
    expect(byId.get(c.id)).toMatchObject({ status: 'cancelled', neverRescheduled: false });
  });
});

describe('trust after a breach', () => {
  it('a breach does not fade by time alone, only after repair', () => {
    const f = fixture();
    f.add(700, 'confidence_broken', 'them');
    for (const d of [600, 500]) f.add(d, 'confidence_kept', 'them');
    const unrepaired = f.assess();
    expect(unrepaired.integrityConcern).toBe(true);
    expect(unrepaired.patterns.find((p) => p.id.startsWith('significant_'))?.kind).toBe('concern');

    f.add(650, 'apology_received', 'them');
    const repaired = f.assess();
    expect(repaired.integrityConcern).toBe(false);
    expect(repaired.dimensions.trust.balance).toBeGreaterThan(unrepaired.dimensions.trust.balance);
  });

  it('reports recovery only after enough trustworthy acts over time', () => {
    const f = fixture();
    f.add(300, 'confidence_broken', 'them');
    f.add(290, 'apology_received', 'them');
    for (const d of [250, 200, 150, 100, 60, 20]) f.add(d, 'confidence_kept', 'them');
    const p = f.assess().patterns.find((x) => x.id.startsWith('significant_'))!;
    expect(p.kind).toBe('context');
    expect(p.interpretation).toMatch(/would support restoring trust/);
  });
});

describe('circle suggestions', () => {
  it('reserves circle 5 for respect, safety or trust concerns', () => {
    const f = fixture();
    for (let k = 0; k < 8; k++) f.add(300 - k * 30, 'text_conversation', 'me');
    for (const d of [200, 150, 100, 50]) {
      const p = f.add(d, 'plans_made', 'me');
      f.add(d - 2, 'cancelled_plans', 'them', { relatesTo: p.id });
    }
    expect(f.assess().suggestedCircle).not.toBe(5);
    f.add(40, 'boundary_crossed', 'them');
    f.add(20, 'boundary_crossed', 'them');
    f.add(10, 'felt_pressured', 'them');
    expect(f.assess().suggestedCircle).toBe(5);
  });

  it('never suggests circles 1–2 for a forming relationship', () => {
    const f = fixture({ since: addDays(AS_OF, -40) });
    for (let k = 0; k < 9; k++) {
      f.add(38 - k * 4, 'met_in_person', k % 2 ? 'them' : 'me', { balance: 'balanced', mood: 'uplifted', greenFlags: ['remembered_details', 'spoke_truth'] });
    }
    const a = f.assess();
    expect(a.suggestedCircle === null || a.suggestedCircle >= 3).toBe(true);
  });
});

describe('Pause & Reflect', () => {
  it('stays calm for a request consistent with the relationship', () => {
    const f = fixture();
    for (let k = 0; k < 10; k++) f.add(200 - k * 20, 'phone_call', k % 2 ? 'them' : 'me', { focus: 'connection' });
    f.add(100, 'help_received', 'them', { trustDomain: 'practical' });
    const req = f.add(1, 'request_made', 'them', { requestKind: 'major_favor', trustDomain: 'practical', conflictOfInterest: 'no' });
    const r = pauseAndReflect(f.person, f.log, req);
    expect(r.triggered).toBe(false);
    expect(r.guidance).toMatch(/normal part of friendship/);
  });

  it('surfaces history when a request follows a long silence', () => {
    const f = fixture();
    for (const d of [600, 560, 520]) f.add(d, 'text_conversation', 'me');
    const req = f.add(5, 'request_made', 'them', { requestKind: 'money', conflictOfInterest: 'yes' });
    const r = pauseAndReflect(f.person, f.log, req);
    expect(r.triggered).toBe(true);
    expect(r.differences.join(' ')).toMatch(/long silence/);
    expect(r.context.join(' ')).toMatch(/a request for money/);
    expect(r.questions).toContain('Do I need to respond immediately?');
  });
});

describe('language: discernment, not suspicion', () => {
  const FORBIDDEN = /toxic|manipulat|narciss|fake friend|selfish|using you|uses you|malicious|red flag|\/ ?100|score/i;

  it('never diagnoses, labels character, or scores across the whole demo', () => {
    const v = demoVault(AS_OF);
    const all = assessAll(v.people, v.interactions, AS_OF);
    const texts: string[] = [];
    for (const a of all.values()) {
      texts.push(...a.patterns.flatMap((p) => [p.title, p.observation, p.interpretation, p.suggestion ?? '']));
      texts.push(...Object.values(a.dimensions).flatMap((d) => [d.summary, ...d.observations]));
      texts.push(...a.reflectionPrompts, a.domainSummary ?? '', a.trendReason, ...(a.dating?.signals.map((s) => s.observation) ?? []));
      for (const i of v.interactions.filter((x) => x.personId === a.person.id && x.type === 'advice_received')) {
        const e = evaluateAdvice(a, i);
        texts.push(...e.facts, ...e.patterns, ...e.interpretations, ...e.unknowns, e.guidance);
      }
    }
    const d = buildDashboard(v.people, all, v.interactions, v.settings, AS_OF);
    texts.push(...[...d.closest, ...d.nurture, ...d.recalibrate, ...d.boundaries, ...d.improving].map((x) => x.reason));
    const m = buildMirror(v.people, all, v.interactions, AS_OF);
    texts.push(...m.stats.map((s) => s.observation), ...m.prompts);
    const offending = texts.filter((t) => FORBIDDEN.test(t));
    expect(offending).toEqual([]);
    expect(texts.length).toBeGreaterThan(100);
  });

  it('advice evaluation never tells the user to accept or reject', () => {
    const v = demoVault(AS_OF);
    const all = assessAll(v.people, v.interactions, AS_OF);
    for (const a of all.values()) {
      for (const i of v.interactions.filter((x) => x.personId === a.person.id && x.type === 'advice_received')) {
        expect(evaluateAdvice(a, i).guidance).not.toMatch(/\b(accept|reject|follow their advice|ignore)\b/i);
      }
    }
  });
});

describe('dating view', () => {
  it('withholds a summary until there is enough to go on', () => {
    const f = fixture({ categories: ['dating_interest'] });
    f.add(10, 'text_conversation', 'me');
    f.add(5, 'text_conversation', 'them');
    expect(f.assess().dating?.status).toBe('insufficient');
  });

  it('reads one-directional effort as low demonstrated investment, never as their feelings', () => {
    const f = fixture({ categories: ['dating_interest'] });
    for (const d of [60, 50, 40, 30, 20, 10]) f.add(d, 'text_conversation', 'me');
    f.add(45, 'invitation', 'me', { inviteResponse: 'declined' });
    f.add(15, 'invitation', 'me', { inviteResponse: 'no_response' });
    const dating = f.assess().dating!;
    expect(dating.status).toBe('low_investment');
    expect(dating.statusReason).toMatch(/not their feelings/);
    expect(dating.signals.map((s) => s.observation).join(' ')).not.toMatch(/respon(se|d) time|hours to/i);
  });
});
