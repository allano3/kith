import { addDays } from '../engine/time';
import { defaultSettings, newInteraction, newPerson } from './factory';
import type { Actor, Interaction, InteractionTypeId, ISODate, Person, Vault } from './types';

/**
 * A fictional, self-consistent dataset relative to `asOf`, so every feature has
 * something real to show: a steady inner-circle friend, a friend whose plans
 * rarely hold, someone reappearing with a business proposal, a friendship
 * repaired after conflict, two dating interests, a dormant friendship, a
 * coworker with boundary friction, and a mentor.
 */
export function demoVault(asOf: ISODate): Vault {
  const people: Person[] = [];
  const interactions: Interaction[] = [];
  const ago = (d: number) => addDays(asOf, -d);
  const add = (person: Person, daysAgo: number, type: InteractionTypeId, actor: Actor, extra: Partial<Interaction> = {}) => {
    const i = newInteraction({ personId: person.id, type, date: ago(daysAgo), actor, ...extra });
    interactions.push(i);
    return i;
  };
  const person = (p: Parameters<typeof newPerson>[0]) => {
    const created = newPerson(p);
    people.push(created);
    return created;
  };

  // ── Marcus: long, steady, trusted; strong career advice, unproven on investments ──
  const marcus = person({
    name: 'Marcus',
    categories: ['inner_circle', 'mentor'],
    circle: 1,
    since: '2016',
    contexts: ['College'],
    notes: 'Roommate sophomore year. Best man at my wedding.',
    domainTrust: { career: { level: 'strong' } },
    values: { Integrity: 'reinforces', Growth: 'reinforces' },
  });
  for (const [d, actor, type] of [
    [700, 'them', 'phone_call'], [640, 'me', 'met_in_person'], [560, 'them', 'text_conversation'], [480, 'me', 'phone_call'],
    [400, 'them', 'met_in_person'], [330, 'both', 'met_in_person'], [260, 'me', 'text_conversation'], [200, 'them', 'phone_call'],
    [150, 'me', 'met_in_person'], [95, 'them', 'text_conversation'], [60, 'me', 'phone_call'], [30, 'them', 'met_in_person'], [12, 'them', 'phone_call'],
  ] as [number, Actor, InteractionTypeId][]) {
    add(marcus, d, type, actor, { focus: 'connection', balance: 'balanced', mood: d % 2 ? 'good' : 'uplifted' });
  }
  add(marcus, 520, 'reached_out_difficulty', 'them', { note: 'Drove up the weekend after Dad’s surgery.', significance: 'milestone', greenFlags: ['present_in_difficulty'] });
  add(marcus, 505, 'advice_received', 'them', { trustDomain: 'career', outcome: 'helpful', note: 'Told me to negotiate the offer. Got 12% more.' });
  add(marcus, 350, 'advice_received', 'them', { trustDomain: 'career', outcome: 'helpful', note: 'Suggested I talk to my manager before quitting.' });
  add(marcus, 210, 'advice_received', 'them', { trustDomain: 'career', outcome: 'helpful' });
  add(marcus, 300, 'vulnerability_shared', 'me', { reception: 'supportive', note: 'Talked about the burnout.' });
  add(marcus, 290, 'confidence_kept', 'them');
  add(marcus, 120, 'confidence_kept', 'them');
  const mp1 = add(marcus, 180, 'promise_made', 'them', { note: 'Intro to his friend at the design studio', dueDate: ago(160) });
  add(marcus, 165, 'promise_kept', 'them', { relatesTo: mp1.id });
  const mp2 = add(marcus, 90, 'promise_made', 'them', { note: 'Review my portfolio', dueDate: ago(75) });
  add(marcus, 78, 'promise_kept', 'them', { relatesTo: mp2.id });
  const mp3 = add(marcus, 45, 'promise_made', 'them', { note: 'Help me move the couch' });
  add(marcus, 40, 'promise_kept', 'them', { relatesTo: mp3.id });
  add(marcus, 240, 'celebrated_success', 'them', { note: 'Took me to dinner when I got the promotion.', greenFlags: ['celebrated_without_envy'] });
  add(marcus, 100, 'text_conversation', 'them', { focus: 'support', greenFlags: ['honest_feedback', 'spoke_truth'], note: 'Told me plainly the side project was distracting me.', influence: 'toward' });
  add(marcus, 9, 'advice_received', 'them', {
    trustDomain: 'financial',
    outcome: 'pending',
    conflictOfInterest: 'unknown',
    independentEvidence: 'unknown',
    note: 'Thinks I should move savings into a small-cap fund he likes.',
  });

  // ── James: reliable, initiates, celebrates — but the user hasn't reached out lately ──
  const james = person({ name: 'James', categories: ['close_friend'], circle: 2, since: '2019', contexts: ['Climbing gym'], values: { Health: 'reinforces', Adventure: 'reinforces' } });
  for (const [d, actor] of [[420, 'them'], [360, 'me'], [310, 'them'], [250, 'them'], [205, 'me'], [170, 'them'], [140, 'them'], [118, 'me'], [95, 'them'], [70, 'them']] as [number, Actor][]) {
    add(james, d, d % 3 ? 'met_in_person' : 'text_conversation', actor, { focus: 'connection', balance: 'balanced', mood: 'good', influence: 'toward' });
  }
  add(james, 230, 'celebrated_success', 'them', { note: 'Organized drinks for my 30th.' });
  add(james, 160, 'help_received', 'them', { trustDomain: 'practical', note: 'Helped me fix the bike.' });
  add(james, 130, 'boundary_respected', 'them', { note: 'Didn’t push when I said I needed a quiet weekend.' });
  const jp1 = add(james, 200, 'plans_made', 'them', { dueDate: ago(190) });
  add(james, 190, 'met_in_person', 'both', { relatesTo: jp1.id });
  const jp2 = add(james, 110, 'promise_made', 'them', { note: 'Lend me the tent', dueDate: ago(100) });
  add(james, 101, 'promise_kept', 'them', { relatesTo: jp2.id });
  const jp3 = add(james, 200, 'promise_made', 'them', { note: 'Belay certification together', dueDate: ago(170) });
  add(james, 172, 'promise_kept', 'them', { relatesTo: jp3.id });
  const jp4 = add(james, 300, 'promise_made', 'them', { note: 'Share the route guide', dueDate: ago(290) });
  add(james, 288, 'promise_kept', 'them', { relatesTo: jp4.id });
  add(james, 66, 'promise_made', 'me', { note: 'Send him the photos from the trip', dueDate: ago(55) });

  // ── Sarah: warm but plans rarely hold; user carries initiation ──
  const sarah = person({ name: 'Sarah', categories: ['friend'], circle: 2, since: '2021', contexts: ['Book club'], capacityNote: 'Started a demanding new job in the spring' });
  for (const [d, actor] of [[330, 'them'], [290, 'me'], [250, 'me'], [210, 'me'], [180, 'me'], [150, 'them'], [120, 'me'], [95, 'me'], [70, 'me'], [45, 'me'], [20, 'me']] as [number, Actor][]) {
    add(sarah, d, 'text_conversation', actor, { focus: 'connection', balance: d < 100 ? 'mostly_them' : 'balanced', mood: d < 100 ? 'drained' : 'good' });
  }
  const sp = [
    add(sarah, 240, 'plans_made', 'me', { note: 'Coffee', dueDate: ago(233) }),
    add(sarah, 200, 'plans_made', 'me', { note: 'Dinner', dueDate: ago(195) }),
    add(sarah, 160, 'plans_made', 'both', { note: 'Hike', dueDate: ago(152) }),
    add(sarah, 110, 'plans_made', 'me', { note: 'Farmers market', dueDate: ago(104) }),
    add(sarah, 60, 'plans_made', 'me', { note: 'Coffee on Saturday', dueDate: ago(55) }),
    add(sarah, 30, 'plans_made', 'me', { note: 'Movie', dueDate: ago(26) }),
  ];
  add(sarah, 234, 'cancelled_plans', 'them', { relatesTo: sp[0].id, rescheduleOffered: true });
  add(sarah, 195, 'met_in_person', 'both', { relatesTo: sp[1].id, mood: 'good' });
  add(sarah, 153, 'cancelled_plans', 'them', { relatesTo: sp[2].id, rescheduleOffered: true });
  add(sarah, 105, 'cancelled_plans', 'me', { relatesTo: sp[3].id, rescheduleOffered: true, note: 'I got sick.' });
  add(sarah, 55, 'cancelled_plans', 'them', { relatesTo: sp[4].id, rescheduleOffered: false, note: 'Cancelled the morning of and did not propose another time.' });
  add(sarah, 26, 'cancelled_plans', 'them', { relatesTo: sp[5].id, rescheduleOffered: false });
  add(sarah, 140, 'reached_out_difficulty', 'them', { note: 'Called when she heard about the breakup.' });

  // ── Michael: long silence, then a business proposal ──
  const michael = person({ name: 'Michael', categories: ['acquaintance', 'professional_friend'], circle: 3, since: '2020', contexts: ['Former coworker'] });
  add(michael, 560, 'met_in_person', 'me', { focus: 'connection' });
  add(michael, 500, 'text_conversation', 'them', { focus: 'request', note: 'Asked for an intro to my manager.' });
  add(michael, 470, 'introduction_referral', 'me', { trustDomain: 'introductions' });
  add(michael, 430, 'text_conversation', 'them', { focus: 'opportunity' });
  const mk1 = add(michael, 420, 'plans_made', 'them', { note: 'Lunch', dueDate: ago(410) });
  add(michael, 411, 'rescheduled_plans', 'them', { relatesTo: mk1.id, dueDate: ago(395) });
  add(michael, 396, 'cancelled_plans', 'them', { relatesTo: mk1.id, rescheduleOffered: false });
  const mk2 = add(michael, 330, 'plans_made', 'me', { note: 'Drinks', dueDate: ago(320) });
  add(michael, 321, 'cancelled_plans', 'them', { relatesTo: mk2.id, rescheduleOffered: true });
  add(michael, 300, 'phone_call', 'me', { focus: 'connection' });
  add(michael, 260, 'text_conversation', 'me', { focus: 'connection' });
  add(michael, 250, 'promise_made', 'them', { note: 'Send over the contract template' });
  add(michael, 12, 'request_made', 'them', {
    requestKind: 'business_proposal',
    trustDomain: 'business',
    conflictOfInterest: 'yes',
    independentEvidence: 'unknown',
    note: 'Wants me to invest time and $15k in a new venture. Wants an answer this week.',
    decision: { status: 'open' },
  });

  // ── David: reliability concerns last year, repaired and improving ──
  const david = person({ name: 'David', categories: ['friend', 'in_transition'], circle: 3, since: '2018', contexts: ['Church'], values: { Faith: 'reinforces' } });
  for (const [d, actor] of [[520, 'me'], [470, 'them'], [420, 'me'], [380, 'them'], [300, 'them'], [240, 'me'], [170, 'them'], [140, 'me'], [110, 'them'], [80, 'them'], [50, 'me'], [25, 'them']] as [number, Actor][]) {
    add(david, d, d > 250 ? 'text_conversation' : 'met_in_person', actor, { focus: 'connection' });
  }
  for (const d of [500, 440, 390]) {
    const p = add(david, d, 'promise_made', 'them', { dueDate: ago(d - 10) });
    add(david, d - 12, 'promise_broken', 'them', { relatesTo: p.id });
  }
  add(david, 360, 'conflict', 'both', { note: 'Talked about him repeatedly not showing up.', mood: 'hurt' });
  add(david, 355, 'apology_received', 'them', { greenFlags: ['apologized_sincerely'] });
  add(david, 350, 'issue_discussed', 'both');
  add(david, 340, 'forgiven', 'me');
  for (const d of [160, 120, 90, 40]) {
    const p = add(david, d, 'promise_made', 'them', { dueDate: ago(d - 7) });
    add(david, d - 6, 'promise_kept', 'them', { relatesTo: p.id });
  }
  add(david, 60, 'behavior_improved', 'them', { note: 'Has shown up for every commitment since spring.' });

  // ── Priya: dating, mutual interest emerging ──
  const priya = person({ name: 'Priya', categories: ['dating_interest'], circle: null, since: ago(80).slice(0, 7) });
  for (const [d, actor, type] of [
    [80, 'me', 'text_conversation'], [74, 'them', 'text_conversation'], [66, 'them', 'phone_call'], [58, 'me', 'text_conversation'],
    [40, 'them', 'text_conversation'], [33, 'both', 'met_in_person'], [26, 'them', 'text_conversation'], [19, 'me', 'phone_call'],
    [14, 'them', 'met_in_person'], [8, 'them', 'text_conversation'], [3, 'me', 'met_in_person'],
  ] as [number, Actor, InteractionTypeId][]) {
    add(priya, d, type, actor, { focus: 'connection', balance: 'balanced', greenFlags: d === 26 ? ['remembered_details', 'curious_about_me'] : [] });
  }
  add(priya, 60, 'invitation', 'me', { inviteResponse: 'alternative' });
  add(priya, 36, 'invitation', 'them', { inviteResponse: 'accepted' });
  add(priya, 2, 'plans_made', 'them', { note: 'Botanical garden', dueDate: ago(-5) });

  // ── Alex: dating, mostly one-directional effort ──
  const alex = person({ name: 'Alex', categories: ['dating_interest'], circle: null, since: ago(70).slice(0, 7) });
  for (const [d, actor] of [[70, 'me'], [62, 'them'], [55, 'me'], [47, 'me'], [38, 'me'], [30, 'me'], [21, 'me'], [12, 'me']] as [number, Actor][]) {
    add(alex, d, 'text_conversation', actor, { balance: d < 40 ? 'mostly_them' : 'balanced' });
  }
  add(alex, 50, 'invitation', 'me', { inviteResponse: 'declined' });
  add(alex, 28, 'invitation', 'me', { inviteResponse: 'no_response' });
  add(alex, 64, 'met_in_person', 'both');

  // ── Lena: dormant, once close ──
  const lena = person({ name: 'Lena', categories: ['dormant', 'former_close'], circle: 3, since: '2012', contexts: ['Hometown'], capacityNote: 'Moved to Berlin, two small kids' });
  for (const d of [900, 780, 690, 600, 500, 420, 335]) add(lena, d, d % 2 ? 'phone_call' : 'text_conversation', d % 3 ? 'them' : 'me', { focus: 'connection', balance: 'balanced', mood: 'uplifted' });
  add(lena, 610, 'reached_out_difficulty', 'them', { significance: 'milestone', note: 'Flew in for the funeral.' });

  // ── Tom: coworker, boundary friction ──
  const tom = person({ name: 'Tom', categories: ['professional_friend'], circle: 3, contexts: ['Work'] });
  for (const [d, actor, focus] of [[200, 'them', 'request'], [150, 'them', 'request'], [120, 'me', 'connection'], [90, 'them', 'opportunity'], [60, 'them', 'request'], [30, 'them', 'request']] as [number, Actor, 'request' | 'opportunity' | 'connection'][]) {
    add(tom, d, 'text_conversation', actor, { focus });
  }
  add(tom, 140, 'boundary_crossed', 'them', { note: 'Kept messaging over the weekend after I asked him not to.' });
  add(tom, 85, 'felt_pressured', 'them', { note: 'Pushed me to cover his shift.', concerns: ['guilt_after_no'] });
  add(tom, 29, 'boundary_crossed', 'them', { note: 'Shared my salary with the team.' });
  add(tom, 150, 'help_offered', 'me');
  add(tom, 60, 'help_offered', 'me');

  // ── Grace: mentor ──
  const grace = person({ name: 'Grace', categories: ['mentor'], circle: 3, since: '2022', contexts: ['Church', 'Mentoring'], domainTrust: { spiritual: { level: 'strong' }, career: { level: 'some' } } });
  for (const [d, actor] of [[360, 'me'], [300, 'them'], [240, 'me'], [180, 'me'], [120, 'them'], [60, 'me'], [18, 'them']] as [number, Actor][]) {
    add(grace, d, 'met_in_person', actor, { focus: 'support', balance: 'mostly_me', influence: 'toward', mood: 'uplifted' });
  }
  add(grace, 300, 'advice_received', 'them', { trustDomain: 'spiritual', outcome: 'helpful' });
  add(grace, 240, 'advice_received', 'them', { trustDomain: 'career', outcome: 'helpful' });
  add(grace, 120, 'advice_received', 'them', { trustDomain: 'spiritual', outcome: 'helpful' });
  add(grace, 60, 'advice_received', 'them', { trustDomain: 'career', outcome: 'mixed' });
  add(grace, 180, 'confidence_kept', 'them');

  return {
    version: 1,
    people,
    interactions,
    settings: { ...defaultSettings(), values: ['Faith', 'Integrity', 'Growth', 'Health', 'Adventure'] },
  };
}
