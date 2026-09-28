/**
 * Turns captured text messages into *suggested* interactions. Pure and
 * deterministic; nothing here is logged without the user's explicit tap.
 *
 * Rules are deliberately conservative English phrase matches for observable
 * events only (plans, cancellations, promises, requests, congratulations,
 * check-ins, support, apologies). They never infer tone, feelings, interest or
 * motive, and timestamps are used only to order messages and split
 * conversations — never as reply timing.
 */
import { INTERACTION_TYPE } from '../domain/taxonomy';
import type { Actor, CaptureSuggestion, Focus, InteractionTypeId, ISODate, PendingMessage, RequestKind, TrustDomainId } from '../domain/types';

/** Messages further apart than this start a new conversation (internal only). */
export const CONVERSATION_GAP_MS = 6 * 60 * 60 * 1000;

export interface ExtractedConversation {
  /** GUID of the first message. */
  id: string;
  date: ISODate;
  /** Who sent the first message; `unknown` when only incoming messages were captured. */
  initiator: Actor;
  messages: PendingMessage[];
  suggestions: CaptureSuggestion[];
}

/** Local calendar date of an ISO timestamp. */
export function localDay(iso: string): ISODate {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Orders messages and splits them wherever consecutive messages are ≥ 6 hours apart. */
export function splitConversations<M extends { sentAt: string; guid: string }>(messages: M[]): M[][] {
  const sorted = [...messages].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.guid.localeCompare(b.guid));
  const out: M[][] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const m of sorted) {
    const t = Date.parse(m.sentAt);
    if (!out.length || t - prev >= CONVERSATION_GAP_MS) out.push([]);
    out[out.length - 1].push(m);
    prev = t;
  }
  return out;
}

// ── Phrase rules ─────────────────────────────────────────────────────────────

/** Lowercases and folds typographic apostrophes/quotes so rules match iPhone text. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`´]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ');
}

const NEGATED = /\b(no|not|don't|dont|doesn't|doesnt|didn't|didnt|never|won't|wont|shouldn't|no need to|without)\s+(\w+\s+){0,2}$/;

/** True if `re` matches somewhere not preceded (within three words) by a negation. */
function affirmed(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    if (!NEGATED.test(text.slice(0, m.index))) return true;
  }
  return false;
}

const matchesAny = (text: string, res: RegExp[]) => res.some((re) => re.test(text));
const anyAffirmed = (text: string, res: RegExp[]) => res.some((re) => affirmed(text, re));

const DAY = '(?:mon|tues|tue|wednes|wed|thurs|thu|fri|satur|sat|sun)(?:day)?';
const MEAL = '(?:dinner|coffee|lunch|drinks?|breakfast|brunch|a drink|a coffee|a beer|beers|food|a bite|tacos|pizza)';
const YOU = '(?:you|u|ya)';

const CANCEL = [
  /\b(?:can't|cant|cannot|can not|won't|wont|couldn't|couldnt|not going to|not gonna|unable to) make it\b/,
  /\bdon'?t think i(?: can|'ll be able to| will be able to) make it\b/,
  /\b(?:have|need|got|going|gonna|'ll have|will have|must|might have) to (?:cancel|bail|postpone)\b/,
  /\bgotta (?:cancel|bail|postpone)\b/,
  /\bcancel(?:l?ing)? (?:on (?:you|u|ya)|tonight|tomorrow|our|plans|dinner|lunch|coffee|drinks)\b/,
  /\bbail(?:ing)? on (?:you|u|ya|tonight|tomorrow)\b/,
  /\brain ?check\b/,
  /\bsomething(?:'s| has| just)? (?:came|come) up\b/,
  /\b(?:won't|wont|will not|not going to|not gonna|am not able to|i'm not able to) be able to (?:make|come|join|go|meet|see|do|get there|hang)\b/,
  /\bcan't (?:come|do) (?:tonight|tomorrow|today|this)\b/,
];

const RESCHEDULE = [
  new RegExp(`\\banother (?:time|day|night|week|weekend|${DAY})\\b`),
  /\bdifferent (?:time|day|night)\b/,
  /\bre-?schedul/,
  /\bpostpone\b/,
  new RegExp(`\\bnext (?:week|weekend|time|month|${DAY})\\b`),
  new RegExp(`\\bhow about (?:we|next|this|tomorrow|the|${DAY}|\\d|${MEAL})`),
  new RegExp(`\\bwhat about (?:next|this|tomorrow|${DAY})\\b`),
  new RegExp(`\\b(?:tomorrow|${DAY}|next week) instead\\b`),
  /\bcan we (?:do|move|push|try)\b/,
  /\bmake it up to (?:you|u)\b/,
  /\blater (?:this|next) week\b/,
];

const PLANS = [
  /\blet'?s (?:grab|meet|meet up|hang|hang out|catch up|get together)\b/,
  new RegExp(`\\blet'?s (?:get|do|have) ${MEAL}`),
  new RegExp(`\\blet'?s (?:do|plan) (?:something|${DAY}|this|next|tomorrow)\\b`),
  new RegExp(`\\b(?:are|r) ${YOU} free\\b`),
  new RegExp(`\\b(?:want|wanna|do ${YOU} want) to (?:grab|get|meet|hang|catch up|get together)\\b`),
  new RegExp(`\\b(?:want|wanna) (?:grab|get|meet|hang)\\b`),
  new RegExp(`\\b(?:want|wanna) (?:to )?(?:get |grab )?${MEAL}`),
  new RegExp(`\\b(?:up for|down for|free for) ${MEAL}`),
];

const PROMISE_VERB =
  "(?:send|call|bring|get|text|pay|drop|pick|email|mail|introduce|return|give|cover|book|share|look into|check|reach out|find|make sure|follow up|set up|ship|forward|write|come by|be there)";
const PROMISE = [new RegExp(`\\bi(?:'ll| will| ?ll) ${PROMISE_VERB}\\b`), /\bi promise\b/];

const MONEY_CUE = /\b(?:need|could|can|would|lend|borrow|loan|spot|front|send me|help me|short on)\b/;
const MONEY = [
  /\b(?:borrow|lend(?: me| us)?|loan(?: me| us)?|spot me|front me)\b[^.?!]{0,25}?(?:money|cash|\$ ?\d|\d+ ?(?:k|grand|bucks|dollars)\b|a (?:few|couple) (?:hundred|thousand|grand|bucks)|some (?:money|cash))/,
  new RegExp(`\\b(?:could|can|would) ${YOU} (?:lend|loan|spot|front) (?:me|us)\\b`),
  new RegExp(`\\bpay ${YOU} back\\b`),
  /\b(?:venmo|cashapp|cash app|zelle|paypal) me\b/,
  /\bspot me\b/,
];
/** Amounts of $1,000+ count only with a request cue in the same message. */
const BIG_AMOUNT = /\$ ?(?:\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?|\b\d+ ?(?:k|grand)\b/;

const BUSINESS = [
  /\binvest(?:ing)? in (?:my|our|this|the company|the business)\b/,
  /\b(?:want|like|interested|would you|could you|consider|chance) (?:to |in )?invest(?:ing)?\b/,
  /\binvest(?:ment|ing)? opportunity\b/,
  /\blooking for investors\b/,
  /\bbusiness (?:opportunity|idea|proposal|deal)\b/,
  /\b(?:joint|new|my|our) venture\b/,
  /\b(?:my|our|a|the|new) start-?up\b/,
  /\bpartner (?:on|with me|up)\b/,
  /\bgo into business\b/,
  /\bget in on (?:this|it)\b/,
];

const INTRODUCTION = [/\bintroduce me\b/, /\bintro (?:me )?to\b/, /\bconnect me (?:with|to)\b/, /\bput me in touch\b/];

const FAVOR = [/\b(?:do me a|ask (?:you )?a|need a|huge|big|massive) favou?r\b/, /\bhelp me (?:move|with (?:the|my) move)\b/, /\bhelp (?:me )?moving\b/];

const CONGRATS = [
  /\bcongrat(?:s|z|ulations)?\b/,
  /\bhappy (?:birthday|bday|b-day|anniversary)\b/,
  /\bhbd\b/,
  new RegExp(`\\bso proud of ${YOU}\\b`),
  /\bwell deserved\b/,
];
/** Thanking someone for their congratulations is not congratulating. */
const THANKS_FOR = /\b(?:thanks|thank you|thx|ty)(?: so much)?(?: for(?: the)?)?\s*$/;
const CELEBRATION_EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+$/u;
const CELEBRATION_EMOJI = /[\u{1F389}\u{1F973}\u{1F382}\u{1F38A}\u{1F37E}]/u;

const CHECK_IN = [
  new RegExp(`\\bhow (?:are|r) ${YOU}\\b`),
  new RegExp(`\\bhow (?:have|'ve) ${YOU} been\\b`),
  new RegExp(`\\bhow ${YOU} been\\b`),
  /\bhow(?:'s| is) (?:it going|everything|life|things)\b/,
  new RegExp(`\\bthinking (?:of|about) ${YOU}\\b`),
  /\b(?:just )?checking in\b/,
  new RegExp(`\\bhope (?:you're|you are|ur|youre) (?:doing )?(?:well|ok|okay|good)\\b`),
];

const SUPPORT = [
  /\bsorry to hear\b/,
  /\bsorry for your loss\b/,
  /\bmy condolences\b/,
  new RegExp(`\\bhere for ${YOU}\\b`),
  /\banything i can do\b/,
  /\blet me know if (?:you need|there's|there is) anything\b/,
  new RegExp(`\\bhow (?:are|r) ${YOU} holding up\\b`),
  /\bsending (?:you )?(?:love|hugs|strength)\b/,
];

const APOLOGY = [
  /\b(?:i'm|im|i am) (?:so |really |very |truly )?sorry\b(?! to hear| for your loss| about your| that happened| you)/,
  /\bmy apologies\b/,
  /\bi apologi[sz]e\b/,
  /\bmy bad\b/,
  /\bsorry (?:about|for) (?:that|earlier|yesterday|last night|the other day|being|what i|how i)\b/,
];
/** Apologies for reply timing are ignored: response time is never evidence. */
const REPLY_TIMING = /\b(?:late|slow|delayed) (?:reply|response|text)|\bnot (?:getting back|replying|responding)|\btaking so long|\bthe delay\b|\bjust seeing this\b|\bget(?:ting)? back to (?:you|u)\b/;

// ── Suggestion building ─────────────────────────────────────────────────────

type Kind = 'contact' | 'cancel' | 'plans' | 'promise' | 'request' | 'congrats' | 'support' | 'apology';

interface Hit {
  kind: Kind;
  index: number;
  fromMe: boolean;
  requestKind?: RequestKind;
}

const REQUEST_ORDER: RequestKind[] = ['money', 'business_proposal', 'introduction', 'major_favor'];
export const REQUEST_DOMAIN: Partial<Record<RequestKind, TrustDomainId>> = {
  money: 'financial',
  business_proposal: 'business',
  introduction: 'introductions',
  major_favor: 'practical',
};
const REQUEST_NOTE: Partial<Record<RequestKind, string>> = {
  money: 'By text: asked to borrow money.',
  business_proposal: 'By text: proposed a business opportunity.',
  introduction: 'By text: asked for an introduction.',
  major_favor: 'By text: asked for a favor.',
};

function requestKindOf(t: string): RequestKind | undefined {
  if (matchesAny(t, MONEY)) return 'money';
  // "Invest $15k in my venture" is a business proposal, even though it names an amount.
  if (matchesAny(t, BUSINESS)) return 'business_proposal';
  if (BIG_AMOUNT.test(t) && MONEY_CUE.test(t)) return 'money';
  if (matchesAny(t, INTRODUCTION)) return 'introduction';
  if (matchesAny(t, FAVOR)) return 'major_favor';
  return undefined;
}

function isCongrats(raw: string, t: string): boolean {
  if (CELEBRATION_EMOJI_ONLY.test(raw.trim()) && CELEBRATION_EMOJI.test(raw)) return true;
  for (const re of CONGRATS) {
    const m = re.exec(t);
    if (m && !THANKS_FOR.test(t.slice(0, m.index))) return true;
  }
  return false;
}

function isApology(t: string): boolean {
  return matchesAny(t, APOLOGY) && !REPLY_TIMING.test(t) && !matchesAny(t, SUPPORT);
}

/** Every rule that fires on one message. */
function classify(m: PendingMessage, index: number): Hit[] {
  const t = normalize(m.text);
  const hits: Hit[] = [];
  const add = (kind: Kind, extra: Partial<Hit> = {}) => hits.push({ kind, index, fromMe: m.fromMe, ...extra });
  if (anyAffirmed(t, CANCEL)) add('cancel');
  if (anyAffirmed(t, PLANS)) add('plans');
  if (matchesAny(t, PROMISE)) add('promise');
  const requestKind = requestKindOf(t);
  if (requestKind) add('request', { requestKind });
  if (isCongrats(m.text, t)) add('congrats');
  if (matchesAny(t, SUPPORT)) add('support');
  if (isApology(t)) add('apology');
  return hits;
}

function actorOf(fromMe: boolean): Actor {
  return fromMe ? 'me' : 'them';
}

const WHO: Record<'me' | 'them', string> = { me: 'I', them: 'they' };

/**
 * Builds suggestions for one conversation: always one contact entry, then at
 * most one suggestion per event type, merging the messages that triggered it.
 */
export function suggest(messages: PendingMessage[], includesSent: boolean): { initiator: Actor; suggestions: CaptureSuggestion[] } {
  const initiator: Actor = includesSent && messages.length ? actorOf(messages[0].fromMe) : 'unknown';
  const hits = messages.flatMap(classify);
  const cancelHits = hits.filter((h) => h.kind === 'cancel');

  /** Hits of a kind whose sender may be the actor of `type`, grouped under the first such sender. */
  const pick = (kind: Kind, type: InteractionTypeId, filter: (h: Hit) => boolean = () => true) => {
    const eligible = hits.filter((h) => h.kind === kind && actorOf(h.fromMe) in INTERACTION_TYPE[type].actors && filter(h));
    if (!eligible.length) return null;
    const fromMe = eligible[0].fromMe;
    return { actor: actorOf(fromMe) as 'me' | 'them', hits: eligible.filter((h) => h.fromMe === fromMe) };
  };

  const suggestions: CaptureSuggestion[] = [];
  const push = (type: InteractionTypeId, actor: Actor, note: string, triggers: Hit[], extra: Partial<CaptureSuggestion> = {}) =>
    suggestions.push({ id: type, type, actor, note, triggers: [...new Set(triggers.map((h) => messages[h.index].guid))], status: 'pending', ...extra });

  const cancel = pick('cancel', 'cancelled_plans');
  const plans = pick('plans', 'plans_made');
  const promise = pick('promise', 'promise_made');
  const request = pick('request', 'request_made');
  const congrats = pick('congrats', 'celebrated_success');
  const support = pick('support', 'reached_out_difficulty');
  // An apology next to the same sender's cancellation ("sorry, can't make it") is part of the cancellation.
  const apology = pick('apology', 'apology_received', (h) => !cancelHits.some((c) => c.fromMe === h.fromMe && Math.abs(c.index - h.index) <= 1));

  // A check-in counts only in the initiator's opening messages, before the other side replies.
  let checkIn: Hit[] = [];
  if (initiator === 'me' || initiator === 'them') {
    const fromMe = initiator === 'me';
    const opening = messages.findIndex((m) => m.fromMe !== fromMe);
    const end = opening === -1 ? messages.length : opening;
    checkIn = messages
      .slice(0, end)
      .flatMap((m, index) => (matchesAny(normalize(m.text), CHECK_IN) ? [{ kind: 'contact' as const, index, fromMe }] : []));
  }

  // ── Contact entry ──
  const focus: Focus = request
    ? request.hits.some((h) => h.requestKind === 'business_proposal') && !request.hits.some((h) => h.requestKind === 'money')
      ? 'opportunity'
      : 'request'
    : congrats
      ? 'celebration'
      : support
        ? 'support'
        : 'connection';
  if (checkIn.length && focus === 'connection' && initiator !== 'unknown' && initiator !== 'both') {
    push('initiated_contact', initiator, `By text: ${WHO[initiator]} checked in.`, checkIn, { focus: 'connection' });
  } else {
    push('text_conversation', initiator, 'Conversation by text.', [], { focus });
  }

  // ── Events ──
  if (cancel) {
    // Another time proposed by the canceller, from just before the cancellation onwards.
    const from = cancel.hits[0].index - 1;
    const offered = messages.some((m, i) => m.fromMe === (cancel.actor === 'me') && i >= from && matchesAny(normalize(m.text), RESCHEDULE));
    push(
      'cancelled_plans',
      cancel.actor,
      `By text: ${WHO[cancel.actor]} cancelled plans${offered ? ' and proposed another time' : ''}.`,
      cancel.hits,
      { rescheduleOffered: offered },
    );
  }
  if (plans) push('plans_made', plans.actor, `By text: ${WHO[plans.actor]} proposed plans to meet.`, plans.hits);
  if (promise) push('promise_made', promise.actor, `By text: ${WHO[promise.actor]} promised to do something.`, promise.hits);
  if (request) {
    const kinds = new Set(request.hits.map((h) => h.requestKind));
    const requestKind = REQUEST_ORDER.find((k) => kinds.has(k)) ?? 'other';
    push('request_made', 'them', REQUEST_NOTE[requestKind] ?? 'By text: made a request.', request.hits, {
      requestKind,
      trustDomain: REQUEST_DOMAIN[requestKind],
    });
  }
  if (congrats) push('celebrated_success', congrats.actor, congrats.actor === 'them' ? 'By text: congratulated me.' : 'By text: I congratulated them.', congrats.hits);
  if (support) {
    push(
      'reached_out_difficulty',
      support.actor,
      support.actor === 'them' ? 'By text: reached out during a hard time.' : 'By text: I reached out during a hard time.',
      support.hits,
    );
  }
  if (apology) push('apology_received', 'them', 'By text: apologized.', apology.hits);

  return { initiator, suggestions };
}

/** Splits one friend's messages into conversations with suggestions. */
export function extractConversations(messages: PendingMessage[], includesSent: boolean): ExtractedConversation[] {
  return splitConversations(messages).map((msgs) => {
    const { initiator, suggestions } = suggest(msgs, includesSent);
    return { id: msgs[0].guid, date: localDay(msgs[0].sentAt), initiator, messages: msgs, suggestions };
  });
}
