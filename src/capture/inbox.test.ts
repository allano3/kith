import { describe, expect, it } from 'vitest';
import { emptyVault, newInteraction, newPerson } from '../domain/factory';
import type { Vault } from '../domain/types';
import { addSuggestion, assignSender, captureOf, finishConversation, forgetPerson, importBundle, importBundles, skipSuggestion } from './inbox';
import type { CaptureBundle, CapturedMessage } from './types';

const AS_OF = '2026-09-10';
const NOW = '2026-09-10T08:00:00.000Z';

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 8, day, hour, minute).toISOString();
}

function m(guid: string, friend: string, text: string, sentAt: string, fromMe = false): CapturedMessage {
  return { guid, friend, fromMe, sentAt, text, service: 'iMessage' };
}

function bundle(id: string, messages: CapturedMessage[], includesSent = true): CaptureBundle {
  return { format: 'kith-capture', v: 1, id, createdAt: NOW, from: at(1, 0), to: at(10, 0), includesSent, friends: ['Sam Lee', 'Jo'], messages };
}

function setup(): { vault: Vault; samId: string } {
  const sam = newPerson({ name: 'Sam Lee' });
  return { vault: { ...emptyVault(), people: [sam] }, samId: sam.id };
}

const DAY5 = [
  m('a1', 'sam lee', "Can't make it Saturday, sorry! How about next week?", at(5, 10)),
  m('a2', 'sam lee', 'sure, no worries', at(5, 10, 5), true),
];

describe('import', () => {
  it('resolves senders by case-insensitive exact name and summarizes', () => {
    const { vault, samId } = setup();
    const r = importBundle(vault, bundle('b1', [...DAY5, m('j1', 'Jo', 'hi', at(6, 9))]), AS_OF, NOW);
    expect(r.summary).toMatchObject({ alreadyImported: false, conversations: 2, people: 2, duplicates: 0, unresolved: 1 });
    const pending = captureOf(r.vault).pending;
    expect(pending.find((p) => p.friend === 'sam lee')?.personId).toBe(samId);
    expect(pending.find((p) => p.friend === 'Jo')?.personId).toBeNull();
    expect(captureOf(r.vault).lastImportAt).toBe(NOW);
  });

  it('skips a bundle already imported and messages already pending or reviewed', () => {
    const { vault } = setup();
    const first = importBundle(vault, bundle('b1', DAY5), AS_OF, NOW).vault;
    expect(importBundle(first, bundle('b1', DAY5), AS_OF, NOW).summary.alreadyImported).toBe(true);

    const overlap = importBundle(first, bundle('b2', DAY5), AS_OF, NOW);
    expect(overlap.summary).toMatchObject({ conversations: 0, duplicates: 2 });
    expect(captureOf(overlap.vault).pending).toHaveLength(1);

    const conv = captureOf(first).pending[0];
    const reviewed = finishConversation(first, conv.id, AS_OF);
    const again = importBundle(reviewed, bundle('b3', DAY5), AS_OF, NOW);
    expect(again.summary.duplicates).toBe(2);
    expect(captureOf(again.vault).pending).toHaveLength(0);
  });

  it('imports several nightly files together, oldest first, counting a stitched conversation once', () => {
    const { vault } = setup();
    const night1 = { ...bundle('n1', [m('d1', 'Sam Lee', 'you around?', at(7, 22, 50))]), from: at(7, 22, 50) };
    const night2 = { ...bundle('n2', [m('d2', 'Sam Lee', "let's grab lunch tomorrow?", at(7, 23, 20)), m('j9', 'Jo', 'hi', at(8, 9))]), from: at(7, 23, 20) };
    const already = importBundle(vault, bundle('old', DAY5), AS_OF, NOW).vault;

    // Picked newest-first, as a file picker might return them, plus one already imported.
    const r = importBundles(already, [night2, night1, bundle('old', DAY5)], AS_OF, NOW);
    expect(r.summary).toMatchObject({ files: 3, alreadyImported: 1, conversations: 2, people: 2, unresolved: 1 });
    const sam = captureOf(r.vault).pending.filter((p) => p.friend === 'Sam Lee');
    expect(sam).toHaveLength(1);
    expect(sam[0].messages.map((x) => x.guid)).toEqual(['d1', 'd2']);
  });

  it('extends a pending conversation that continues across the nightly cut-off, keeping review work', () => {
    const { vault } = setup();
    const first = importBundle(
      vault,
      bundle('b1', [m('c1', 'Sam Lee', 'you around?', at(7, 22, 50)), m('c2', 'Sam Lee', "yep, I'll send you the photos", at(7, 22, 55), true)]),
      AS_OF,
      NOW,
    ).vault;
    const conv = captureOf(first).pending[0];
    const skipped = skipSuggestion(first, conv.id, 'promise_made', AS_OF);

    const next = importBundle(skipped, bundle('b2', [m('c3', 'Sam Lee', "let's grab lunch tomorrow?", at(7, 23, 20))]), AS_OF, NOW);
    expect(next.summary.conversations).toBe(1);
    const pending = captureOf(next.vault).pending;
    expect(pending).toHaveLength(1);
    expect(pending[0].messages.map((x) => x.guid)).toEqual(['c1', 'c2', 'c3']);
    expect(pending[0].suggestions.find((s) => s.type === 'promise_made')?.status).toBe('skipped');
    expect(pending[0].suggestions.find((s) => s.type === 'plans_made')?.status).toBe('pending');

    // A message more than six hours later starts a new conversation instead.
    const apart = importBundle(skipped, bundle('b3', [m('c4', 'Sam Lee', 'morning!', at(8, 7))]), AS_OF, NOW);
    expect(captureOf(apart.vault).pending).toHaveLength(2);
  });

  it('drops ignored senders and malformed messages', () => {
    const { vault } = setup();
    const ignored = assignSender(importBundle(vault, bundle('b1', [m('j1', 'Jo', 'hi', at(6, 9))]), AS_OF, NOW).vault, 'Jo', null, AS_OF);
    expect(captureOf(ignored).pending).toHaveLength(0);
    const bad = { guid: 'x', friend: 'Jo', text: 42 } as unknown as CapturedMessage;
    const r = importBundle(ignored, bundle('b2', [m('j2', 'Jo', 'hello again', at(8, 9)), bad]), AS_OF, NOW);
    expect(r.summary).toMatchObject({ conversations: 0, ignored: 1 });
  });

  it('treats fromMe as false when the bundle excludes sent messages', () => {
    const { vault } = setup();
    const r = importBundle(vault, bundle('b1', [m('a1', 'Sam Lee', 'hey', at(5, 10), true)], false), AS_OF, NOW);
    const conv = captureOf(r.vault).pending[0];
    expect(conv.includesSent).toBe(false);
    expect(conv.messages[0].fromMe).toBe(false);
    expect(conv.suggestions[0].actor).toBe('unknown');
  });
});

describe('resolving senders', () => {
  it('remembers an alias for a differently named person and proposes linking cancellations', () => {
    const { vault, samId } = setup();
    const plans = newInteraction({ personId: samId, type: 'plans_made', date: '2026-09-02', actor: 'them' });
    const withPlans = { ...vault, interactions: [plans] };
    const imported = importBundle(withPlans, bundle('b1', [m('s1', 'Sammy', "can't make it tonight", at(5, 18))]), AS_OF, NOW).vault;
    expect(captureOf(imported).pending[0].personId).toBeNull();

    const assigned = assignSender(imported, 'Sammy', samId, AS_OF);
    const c = captureOf(assigned);
    expect(c.aliases).toEqual({ Sammy: samId });
    expect(c.pending[0].personId).toBe(samId);
    expect(c.pending[0].suggestions.find((s) => s.type === 'cancelled_plans')?.relatesTo).toBe(plans.id);

    // Future bundles resolve through the alias.
    const later = importBundle(assigned, bundle('b2', [m('s2', 'Sammy', 'hi', at(9, 9))]), AS_OF, NOW);
    expect(later.summary.unresolved).toBe(0);
  });

  it('deleting a person drops their pending conversations and aliases', () => {
    const { vault, samId } = setup();
    const imported = importBundle(vault, bundle('b1', [...DAY5, m('s1', 'Sammy', 'hi', at(6, 9))]), AS_OF, NOW).vault;
    const c = forgetPerson(captureOf(assignSender(imported, 'Sammy', samId, AS_OF)), samId);
    expect(c.pending).toHaveLength(0);
    expect(c.aliases).toEqual({});
  });
});

describe('review', () => {
  it('reviewing a conversation deletes its message text and keeps only guids and dates', () => {
    const { vault } = setup();
    const imported = importBundle(vault, bundle('b1', DAY5), AS_OF, NOW).vault;
    const conv = captureOf(imported).pending[0];
    const done = finishConversation(imported, conv.id, AS_OF);
    const c = captureOf(done);
    expect(c.pending).toHaveLength(0);
    expect(c.reviewedGuids).toEqual([
      { guid: 'a1', date: '2026-09-05' },
      { guid: 'a2', date: '2026-09-05' },
    ]);
    expect(JSON.stringify(done)).not.toContain("make it Saturday");
    expect(JSON.stringify(done)).not.toContain('no worries');
  });

  it('adding and skipping every suggestion logs entries and finishes the conversation', () => {
    const { vault, samId } = setup();
    const imported = importBundle(vault, bundle('b1', DAY5), AS_OF, NOW).vault;
    const conv = captureOf(imported).pending[0];
    expect(conv.suggestions.map((s) => s.type)).toEqual(['text_conversation', 'cancelled_plans']);

    const added = addSuggestion(imported, conv.id, 'cancelled_plans', AS_OF);
    expect(added.entry).toMatchObject({ personId: samId, type: 'cancelled_plans', actor: 'them', date: '2026-09-05', rescheduleOffered: true, significance: 'routine' });
    expect(added.entry.note).toBe('By text: they cancelled plans and proposed another time.');
    expect(captureOf(added.vault).pending).toHaveLength(1);
    expect(() => addSuggestion(added.vault, conv.id, 'cancelled_plans', AS_OF)).toThrow();

    const finished = skipSuggestion(added.vault, conv.id, 'text_conversation', AS_OF);
    expect(captureOf(finished).pending).toHaveLength(0);
    expect(finished.interactions).toHaveLength(1);
    expect(JSON.stringify(finished)).not.toContain('How about next week');
  });

  it('opens Pause & Reflect for a money request that differs from the pattern', () => {
    const { vault } = setup();
    const imported = importBundle(vault, bundle('b1', [m('r1', 'Sam Lee', 'Could you lend me $3,000? I will pay you back', at(8, 12))]), AS_OF, NOW).vault;
    const conv = captureOf(imported).pending[0];
    const r = addSuggestion(imported, conv.id, 'request_made', AS_OF);
    expect(r.entry).toMatchObject({ type: 'request_made', requestKind: 'money', trustDomain: 'financial' });
    expect(r.paused).toBe(true);
    expect(r.entry.decision).toEqual({ status: 'open' });
  });

  it('links a cancellation to plans added from earlier in the same conversation', () => {
    const { vault } = setup();
    const imported = importBundle(
      vault,
      bundle('b1', [m('p1', 'Sam Lee', "let's grab coffee friday", at(8, 9)), m('p2', 'Sam Lee', 'ok!', at(8, 9, 1), true), m('p3', 'Sam Lee', "oh wait I can't make it friday", at(8, 9, 30))]),
      AS_OF,
      NOW,
    ).vault;
    const conv = captureOf(imported).pending[0];
    const plans = addSuggestion(imported, conv.id, 'plans_made', AS_OF);
    const cancel = addSuggestion(plans.vault, conv.id, 'cancelled_plans', AS_OF);
    expect(cancel.entry.relatesTo).toBe(plans.entry.id);
  });

  it('cannot add before the sender is matched to a person', () => {
    const { vault } = setup();
    const imported = importBundle(vault, bundle('b1', [m('j1', 'Jo', 'hi', at(6, 9))]), AS_OF, NOW).vault;
    const conv = captureOf(imported).pending[0];
    expect(() => addSuggestion(imported, conv.id, conv.suggestions[0].id, AS_OF)).toThrow(/Choose who/);
  });
});
