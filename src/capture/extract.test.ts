import { describe, expect, it } from 'vitest';
import type { CaptureSuggestion, InteractionTypeId, PendingMessage } from '../domain/types';
import { extractConversations, splitConversations, suggest } from './extract';

const BASE = new Date(2026, 8, 1, 12, 0, 0).getTime();
let seq = 0;

/** A message `minutes` after noon on 1 Sep 2026 (local time). */
function msg(text: string, fromMe = false, minutes = seq): PendingMessage {
  seq = minutes + 1;
  return { guid: `g${minutes}-${text.length}-${fromMe ? 'me' : 'them'}`, fromMe, sentAt: new Date(BASE + minutes * 60_000).toISOString(), text };
}

/** Suggestions for a conversation of `[text, fromMe]` pairs, with sent messages included. */
function run(lines: [string, boolean?][], includesSent = true): CaptureSuggestion[] {
  seq = 0;
  return suggest(
    lines.map(([t, me]) => msg(t, me ?? false)),
    includesSent,
  ).suggestions;
}

function types(s: CaptureSuggestion[]): InteractionTypeId[] {
  return s.map((x) => x.type);
}

function find(s: CaptureSuggestion[], type: InteractionTypeId): CaptureSuggestion | undefined {
  return s.find((x) => x.type === type);
}

describe('conversation splitting', () => {
  it('splits on gaps of six hours or more and orders messages', () => {
    const later = msg('see you then', true, 60 * 12);
    const a = msg('hey', false, 0);
    const b = msg('hi!', true, 5);
    const c = msg('still up?', false, 60 * 5 + 50); // 5h45 after "hi!" — same conversation
    const groups = splitConversations([later, c, b, a]);
    expect(groups.map((g) => g.map((m) => m.text))).toEqual([['hey', 'hi!', 'still up?'], ['see you then']]);
  });

  it('dates a conversation by its first message and uses its guid as id', () => {
    const [conv] = extractConversations([msg('hello', false, 0), msg('hey', true, 3)], true);
    expect(conv.date).toBe('2026-09-01');
    expect(conv.id).toBe(conv.messages[0].guid);
  });
});

describe('initiator', () => {
  it('is the first sender when sent messages are included', () => {
    seq = 0;
    expect(suggest([msg('hey', true), msg('hi', false)], true).initiator).toBe('me');
    expect(suggest([msg('hey', false), msg('hi', true)], true).initiator).toBe('them');
  });

  it('is unknown for incoming-only capture, and the contact entry says so', () => {
    seq = 0;
    const r = suggest([msg('how are you?'), msg('been a while')], false);
    expect(r.initiator).toBe('unknown');
    expect(r.suggestions[0]).toMatchObject({ type: 'text_conversation', actor: 'unknown' });
  });
});

describe('contact entry', () => {
  it('always proposes exactly one contact entry', () => {
    expect(types(run([['ok'], ['cool', true]]))).toEqual(['text_conversation']);
    const s = run([['Congrats on the new job!!'], ['thank you!!', true]]);
    expect(s.filter((x) => x.type === 'text_conversation' || x.type === 'initiated_contact')).toHaveLength(1);
  });

  it('guesses focus from what was detected', () => {
    expect(find(run([['Could you lend me $3,000 until next month?'], ['let me think', true]]), 'text_conversation')?.focus).toBe('request');
    expect(find(run([['I have a business opportunity for you'], ['tell me more', true]]), 'text_conversation')?.focus).toBe('opportunity');
    expect(find(run([['Happy birthday!! 🎂'], ['thanks!', true]]), 'text_conversation')?.focus).toBe('celebration');
    expect(find(run([['So sorry to hear about your dad'], ['thank you', true]]), 'text_conversation')?.focus).toBe('support');
    expect(find(run([['saw this meme lol'], ['haha', true]]), 'text_conversation')?.focus).toBe('connection');
  });

  it('turns a check-in that opened the conversation into "reached out"', () => {
    const s = run([['Hey! How have you been?'], ['good! busy', true]]);
    expect(find(s, 'initiated_contact')).toMatchObject({ actor: 'them', focus: 'connection' });
    expect(find(s, 'text_conversation')).toBeUndefined();

    const mine = run([['thinking of you today', true], ['aw thanks']]);
    expect(find(mine, 'initiated_contact')?.actor).toBe('me');
  });

  it('ignores check-ins that did not open the conversation or when the initiator is unknown', () => {
    expect(find(run([['sent you the pics', true], ['how are you btw?']]), 'initiated_contact')).toBeUndefined();
    expect(find(run([['how are you?']], false), 'initiated_contact')).toBeUndefined();
  });

  it('does not call a check-in that leads to a request "just connecting"', () => {
    const s = run([['How are you? Could I borrow some money this week?'], ['how much?', true]]);
    expect(find(s, 'initiated_contact')).toBeUndefined();
    expect(find(s, 'text_conversation')?.focus).toBe('request');
  });
});

describe('cancellations', () => {
  it.each([
    "So sorry, I can't make it tonight",
    'Something came up, rain check?',
    'I have to cancel tomorrow',
    'won’t be able to make it Saturday',
    'Gonna have to bail on you, work stuff',
  ])('fires on "%s"', (text) => {
    expect(find(run([[text], ['ok', true]]), 'cancelled_plans')?.actor).toBe('them');
  });

  it.each(['I can make it!', 'no need to cancel, we can do it later', "you don't have to cancel", 'did the concert get cancelled?'])(
    'does not fire on "%s"',
    (text) => {
      expect(find(run([[text], ['ok', true]]), 'cancelled_plans')).toBeUndefined();
    },
  );

  it('uses the sender as actor, including the user', () => {
    expect(find(run([["can't make it tonight, sorry", true], ['no worries']]), 'cancelled_plans')?.actor).toBe('me');
  });

  it('detects another time proposed by the same sender', () => {
    expect(find(run([["Can't make it tonight"], ['ok', true], ['How about next Tuesday instead?']]), 'cancelled_plans')?.rescheduleOffered).toBe(true);
    expect(find(run([["Can't make it tonight, can we reschedule?"]]), 'cancelled_plans')?.rescheduleOffered).toBe(true);
    // The other person proposing a time is not the canceller offering one.
    expect(find(run([["Can't make it tonight"], ['how about next week?', true]]), 'cancelled_plans')?.rescheduleOffered).toBe(false);
    expect(find(run([["Can't make it tonight"], ['ok', true], ['how about you, good week?']]), 'cancelled_plans')?.rescheduleOffered).toBe(false);
  });

  it('does not treat the apology inside a cancellation as a separate apology', () => {
    const s = run([["I'm so sorry"], ["I can't make it tonight"], ['ok', true]]);
    expect(find(s, 'cancelled_plans')).toBeDefined();
    expect(find(s, 'apology_received')).toBeUndefined();
  });
});

describe('events', () => {
  it('plans proposed', () => {
    expect(find(run([['Let’s grab coffee Saturday?'], ['yes!', true]]), 'plans_made')?.actor).toBe('them');
    expect(find(run([['are you free Thursday?', true], ['yep']]), 'plans_made')?.actor).toBe('me');
    expect(find(run([['want to get dinner next week'], ['sure', true]]), 'plans_made')).toBeDefined();
    expect(find(run([['I had dinner with my sister'], ['nice', true]]), 'plans_made')).toBeUndefined();
    expect(find(run([["I'm not free this week"], ['ok', true]]), 'plans_made')).toBeUndefined();
  });

  it('promises, by either side', () => {
    expect(find(run([["I'll send you the link tonight"], ['thanks', true]]), 'promise_made')?.actor).toBe('them');
    expect(find(run([['I will call you tomorrow', true], ['ok']]), 'promise_made')?.actor).toBe('me');
    expect(find(run([['I will be late for work lol'], ['oh no', true]]), 'promise_made')).toBeUndefined();
  });

  it.each<[string, string]>([
    ['Could I borrow $500 until payday?', 'money'],
    ['can you spot me 200 bucks', 'money'],
    ["I'll pay you back next month I swear", 'money'],
    ['I need $3,000 for rent, could you help?', 'money'],
    ['Would you want to invest in my startup?', 'business_proposal'],
    ['I have a business opportunity for you', 'business_proposal'],
    ['I have a business opportunity I want you in on — could you invest $15k?', 'business_proposal'],
    ['Could you introduce me to your manager?', 'introduction'],
    ['Can I ask you a huge favor', 'major_favor'],
    ['could you help me move on Saturday?', 'major_favor'],
  ])('request case %#', (text, kind) => {
    expect(find(run([[text], ['hmm', true]]), 'request_made')).toMatchObject({ actor: 'them', requestKind: kind });
  });

  it('sets trust domain for business proposals', () => {
    expect(find(run([['want to partner on a new venture?']]), 'request_made')?.trustDomain).toBe('business');
  });

  it.each(['I just paid $3,000 for my couch', 'my favorite show is back', 'I invested a lot of time in that', 'can I borrow your charger'])(
    'no request for near-miss %#',
    (text) => {
      expect(find(run([[text], ['ok', true]]), 'request_made')).toBeUndefined();
    },
  );

  it('never proposes a request made by the user', () => {
    expect(find(run([['could you lend me some money?', true], ['sure']]), 'request_made')).toBeUndefined();
  });

  it('congratulations from either side, not thanks for congratulations', () => {
    expect(find(run([['Congratulations on the promotion!!'], ['thank you!', true]]), 'celebrated_success')?.actor).toBe('them');
    expect(find(run([['🎉🥳'], ['haha thanks', true]]), 'celebrated_success')?.actor).toBe('them');
    expect(find(run([['I got the job!!'], ['congrats!!', true]]), 'celebrated_success')?.actor).toBe('me');
    expect(find(run([['thanks for the congrats!'], ['of course', true]]), 'celebrated_success')).toBeUndefined();
    expect(find(run([['party tonight 🎉 bring snacks'], ['ok', true]]), 'celebrated_success')).toBeUndefined();
  });

  it('support in difficulty; "sorry to hear" is support, not an apology', () => {
    const s = run([['My mom is in the hospital', true], ["I'm so sorry to hear that. I'm here for you."]]);
    expect(find(s, 'reached_out_difficulty')?.actor).toBe('them');
    expect(find(s, 'apology_received')).toBeUndefined();
  });

  it('apologies from them', () => {
    expect(find(run([["I'm really sorry about what I said last night"], ['thank you', true]]), 'apology_received')?.actor).toBe('them');
    expect(find(run([['my bad, I forgot'], ['np', true]]), 'apology_received')).toBeDefined();
    expect(find(run([["I'm sorry, I was wrong", true], ['its ok']]), 'apology_received')).toBeUndefined();
  });

  it('ignores apologies about reply timing', () => {
    expect(find(run([['sorry for the late reply!'], ['no worries', true]]), 'apology_received')).toBeUndefined();
    expect(find(run([["I'm sorry, just seeing this"], ['np', true]]), 'apology_received')).toBeUndefined();
  });
});

describe('suggestion hygiene', () => {
  const busy: [string, boolean?][] = [
    ['Hey, are you free Saturday?'],
    ['yes! let’s grab lunch', true],
    ["I'll bring the tickets"],
    ['Also could you lend me $300 until Friday?'],
    ['my bad, forgot to ask earlier'],
    ["ugh I can't make it Saturday after all, how about next week?"],
    ["no worries, I'll call you", true],
    ['let’s get dinner next week then'],
  ];

  it('proposes at most one suggestion per type and merges triggers', () => {
    const s = run(busy);
    const t = types(s);
    expect(new Set(t).size).toBe(t.length);
    expect(find(s, 'plans_made')?.triggers.length).toBeGreaterThan(1);
    expect(find(s, 'plans_made')?.actor).toBe('them');
  });

  it('every trigger refers to a message in the conversation', () => {
    seq = 0;
    const messages = busy.map(([t, me]) => msg(t, me ?? false));
    const guids = new Set(messages.map((m) => m.guid));
    for (const s of suggest(messages, true).suggestions) for (const g of s.triggers) expect(guids.has(g)).toBe(true);
  });

  it('notes are neutral templates that never quote the messages', () => {
    const s = run(busy);
    const words = (x: string) => x.toLowerCase().match(/[a-z']+/g) ?? [];
    for (const sug of s) {
      expect(sug.note).toMatch(/^(By text: |Conversation by text\.)/);
      for (const [text] of busy) {
        const w = words(text);
        // No run of four consecutive message words appears in a note.
        for (let i = 0; i + 4 <= w.length; i++) expect(sug.note.toLowerCase()).not.toContain(w.slice(i, i + 4).join(' '));
      }
    }
  });

  it('no field anywhere represents response time or message timing', () => {
    seq = 0;
    const convs = extractConversations(
      busy.map(([t, me]) => msg(t, me ?? false)),
      true,
    );
    const keys = new Set<string>();
    const walk = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) keys.add(k), walk(v);
    };
    walk(convs.map((c) => c.suggestions));
    for (const k of keys) expect(k).not.toMatch(/latenc|respon|repl|delay|elapsed|duration|wait|minute|second|hour|time|sentat/i);
    for (const c of convs) for (const s of c.suggestions) expect(s.note).not.toMatch(/\d{1,2}:\d{2}|minutes?|hours?|repl|respon/i);
  });
});
