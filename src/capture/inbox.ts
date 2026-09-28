/**
 * Pure state transitions for the text-capture inbox. VaultContext wraps these;
 * keeping them pure makes import, dedupe and review testable without React.
 *
 * Message text lives only in `capture.pending` and is removed the moment its
 * conversation is reviewed; afterwards only the message GUIDs and dates remain
 * (for dedupe), plus whatever interactions the user chose to add.
 */
import { emptyCapture, newId, newInteraction } from '../domain/factory';
import { INTERACTION_TYPE } from '../domain/taxonomy';
import type { CaptureState, CaptureSuggestion, Interaction, ISODate, PendingConversation, PendingMessage, Person, Vault } from '../domain/types';
import { deriveCommitments } from '../engine/commitments';
import { needsPause, pauseAndReflect } from '../engine/pause';
import { addDays } from '../engine/time';
import { CONVERSATION_GAP_MS, extractConversations, localDay, splitConversations } from './extract';
import type { CaptureBundle, CapturedMessage } from './types';

/** Reviewed GUIDs older than this are forgotten; bundles never reach that far back. */
export const REVIEWED_RETENTION_DAYS = 120;

export interface ImportSummary {
  /** This bundle id was imported before; nothing changed. */
  alreadyImported: boolean;
  /** New or extended conversations now awaiting review. */
  conversations: number;
  /** Distinct friends among those conversations. */
  people: number;
  /** Messages skipped because they were already imported or reviewed. */
  duplicates: number;
  /** Conversations whose sender still needs to be matched to a person. */
  unresolved: number;
  /** Messages dropped because their sender is ignored. */
  ignored: number;
}

export function captureOf(v: Vault): CaptureState {
  return v.capture ?? emptyCapture();
}

function withCapture(v: Vault, fn: (c: CaptureState) => CaptureState): Vault {
  return { ...v, capture: fn(captureOf(v)) };
}

/** Alias first, then a unique case-insensitive exact name match among active people. */
export function resolveFriend(c: CaptureState, people: Person[], friend: string): string | null {
  const alias = c.aliases[friend];
  if (alias && people.some((p) => p.id === alias)) return alias;
  const name = friend.trim().toLocaleLowerCase();
  const matches = people.filter((p) => !p.archived && p.name.trim().toLocaleLowerCase() === name);
  return matches.length === 1 ? matches[0].id : null;
}

/** Open plans a cancellation could resolve, newest first. */
export function openPlans(v: Vault, personId: string, asOf: ISODate) {
  return deriveCommitments(
    v.interactions.filter((i) => i.personId === personId),
    asOf,
  )
    .filter((c) => c.kind === 'plans' && c.status === 'open')
    .sort((a, b) => b.item.date.localeCompare(a.item.date) || b.item.createdAt.localeCompare(a.item.createdAt));
}

/** Proposes linking pending cancellations to the person's most recent open plans. */
function proposeLinks(v: Vault, conv: PendingConversation, asOf: ISODate): PendingConversation {
  if (!conv.personId) return conv;
  const latest = openPlans(v, conv.personId, asOf)[0];
  if (!latest) return conv;
  return {
    ...conv,
    suggestions: conv.suggestions.map((s) => (s.type === 'cancelled_plans' && s.status === 'pending' && !s.relatesTo ? { ...s, relatesTo: latest.item.id } : s)),
  };
}

function pruneReviewed(list: CaptureState['reviewedGuids'], asOf: ISODate): CaptureState['reviewedGuids'] {
  const horizon = addDays(asOf, -REVIEWED_RETENTION_DAYS);
  return list.filter((r) => r.date >= horizon);
}

function isMessage(m: unknown): m is CapturedMessage {
  const x = m as CapturedMessage;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof x.guid === 'string' &&
    typeof x.friend === 'string' &&
    x.friend.trim() !== '' &&
    typeof x.text === 'string' &&
    typeof x.sentAt === 'string' &&
    !Number.isNaN(Date.parse(x.sentAt))
  );
}

/**
 * Adds a bundle's messages to the inbox. Skips bundles already imported,
 * messages already pending or reviewed, and ignored senders. New messages that
 * continue a pending conversation (e.g. across the nightly cut-off) extend it,
 * keeping any review already done on it.
 */
export function importBundle(v: Vault, bundle: CaptureBundle, asOf: ISODate, now: string): { vault: Vault; summary: ImportSummary } {
  const c = captureOf(v);
  const summary: ImportSummary = { alreadyImported: false, conversations: 0, people: 0, duplicates: 0, unresolved: 0, ignored: 0 };
  if (c.importedBundles.includes(bundle.id)) return { vault: v, summary: { ...summary, alreadyImported: true } };

  const seen = new Set([...c.reviewedGuids.map((r) => r.guid), ...c.pending.flatMap((p) => p.messages.map((m) => m.guid))]);
  const byFriend = new Map<string, PendingMessage[]>();
  const includesSent = bundle.includesSent === true;
  for (const m of bundle.messages) {
    if (!isMessage(m)) continue;
    if (c.ignored.includes(m.friend)) {
      summary.ignored++;
      continue;
    }
    if (seen.has(m.guid)) {
      summary.duplicates++;
      continue;
    }
    seen.add(m.guid);
    const list = byFriend.get(m.friend) ?? [];
    list.push({ guid: m.guid, fromMe: includesSent && m.fromMe === true, sentAt: m.sentAt, text: m.text });
    byFriend.set(m.friend, list);
  }

  let pending = c.pending;
  const touched: PendingConversation[] = [];
  for (const [friend, fresh] of byFriend) {
    const existing = pending.filter((p) => p.friend === friend);
    const extendable = existing.filter((p) => {
      const first = Date.parse(p.messages[0].sentAt);
      const last = Date.parse(p.messages[p.messages.length - 1].sentAt);
      return fresh.some((m) => {
        const t = Date.parse(m.sentAt);
        return t > first - CONVERSATION_GAP_MS && t < last + CONVERSATION_GAP_MS;
      });
    });
    const groups = splitConversations([...extendable.flatMap((p) => p.messages), ...fresh]);
    const replaced = new Set<PendingConversation>();
    for (const group of groups) {
      const guids = new Set(group.map((m) => m.guid));
      const prior = extendable.filter((p) => p.messages.some((m) => guids.has(m.guid)));
      if (!group.some((m) => fresh.includes(m))) continue; // an existing conversation, unchanged
      const groupIncludesSent = includesSent && prior.every((p) => p.includesSent);
      const [extracted] = extractConversations(group, groupIncludesSent);
      const priorSuggestions = prior.flatMap((p) => p.suggestions);
      // Keep the user's work on suggestions they already touched; keep added entries even if no longer detected.
      const suggestions: CaptureSuggestion[] = extracted.suggestions.map((s) => priorSuggestions.find((o) => o.id === s.id && o.status !== 'pending') ?? s);
      for (const o of priorSuggestions) if (o.status === 'added' && !suggestions.some((s) => s.id === o.id)) suggestions.push(o);
      prior.forEach((p) => replaced.add(p));
      const personId = prior.find((p) => p.personId)?.personId ?? resolveFriend(c, v.people, friend);
      touched.push(
        proposeLinks(
          v,
          { id: extracted.id, friend, personId, date: extracted.date, includesSent: groupIncludesSent, messages: extracted.messages, suggestions },
          asOf,
        ),
      );
    }
    pending = pending.filter((p) => !replaced.has(p));
  }

  summary.conversations = touched.length;
  summary.people = new Set(touched.map((t) => t.friend)).size;
  summary.unresolved = touched.filter((t) => !t.personId).length;
  return {
    vault: withCapture(v, (cap) => ({
      ...cap,
      pending: [...pending, ...touched],
      importedBundles: [...cap.importedBundles, bundle.id],
      reviewedGuids: pruneReviewed(cap.reviewedGuids, asOf),
      lastImportAt: now,
    })),
    summary,
  };
}

/**
 * Matches a sender to a person (remembering an alias when the names differ), or
 * with `null` ignores the sender permanently and discards their pending text.
 */
export function assignSender(v: Vault, friend: string, personId: string | null, asOf: ISODate): Vault {
  return withCapture(v, (c) => {
    const aliases = Object.fromEntries(Object.entries(c.aliases).filter(([name]) => name !== friend));
    if (personId === null) {
      return {
        ...c,
        aliases,
        ignored: c.ignored.includes(friend) ? c.ignored : [...c.ignored, friend],
        pending: c.pending.filter((p) => p.friend !== friend),
      };
    }
    const person = v.people.find((p) => p.id === personId);
    const sameName = person?.name.trim().toLocaleLowerCase() === friend.trim().toLocaleLowerCase();
    return {
      ...c,
      aliases: sameName ? aliases : { ...aliases, [friend]: personId },
      pending: c.pending.map((p) => (p.friend === friend && !p.personId ? proposeLinks(v, { ...p, personId }, asOf) : p)),
    };
  });
}

/** Removes a conversation and its text, keeping only its GUIDs and dates for dedupe. */
export function finishConversation(v: Vault, convId: string, asOf: ISODate): Vault {
  return withCapture(v, (c) => {
    const conv = c.pending.find((p) => p.id === convId);
    if (!conv) return c;
    const reviewed = conv.messages.map((m) => ({ guid: m.guid, date: localDay(m.sentAt) }));
    return { ...c, pending: c.pending.filter((p) => p.id !== convId), reviewedGuids: pruneReviewed([...c.reviewedGuids, ...reviewed], asOf) };
  });
}

function updateSuggestion(v: Vault, convId: string, sugId: string, fn: (s: CaptureSuggestion) => CaptureSuggestion): Vault {
  return withCapture(v, (c) => ({
    ...c,
    pending: c.pending.map((p) => (p.id === convId ? { ...p, suggestions: p.suggestions.map((s) => (s.id === sugId ? fn(s) : s)) } : p)),
  }));
}

/** Finishes the conversation once every suggestion has been added or skipped. */
function finishIfDone(v: Vault, convId: string, asOf: ISODate): Vault {
  const conv = captureOf(v).pending.find((p) => p.id === convId);
  return conv && conv.suggestions.every((s) => s.status !== 'pending') ? finishConversation(v, convId, asOf) : v;
}

/** What the user may change on a suggestion before adding it. */
export type SuggestionPatch = Partial<Pick<CaptureSuggestion, 'actor' | 'note' | 'focus' | 'requestKind' | 'trustDomain' | 'rescheduleOffered' | 'relatesTo'>>;

export function editSuggestion(v: Vault, convId: string, sugId: string, patch: SuggestionPatch): Vault {
  return updateSuggestion(v, convId, sugId, (s) => ({ ...s, ...patch }));
}

export function skipSuggestion(v: Vault, convId: string, sugId: string, asOf: ISODate): Vault {
  return finishIfDone(
    updateSuggestion(v, convId, sugId, (s) => ({ ...s, status: 'skipped' })),
    convId,
    asOf,
  );
}

/** The interaction a suggestion would log, limited to the fields its type allows. */
export function suggestionToInteraction(v: Vault, conv: PendingConversation, s: CaptureSuggestion, asOf: ISODate, id = newId()): Interaction {
  if (!conv.personId) throw new Error('Choose who this conversation is with first.');
  const def = INTERACTION_TYPE[s.type];
  const entry = newInteraction({ id, personId: conv.personId, type: s.type, date: conv.date, significance: 'routine' });
  if (s.actor in def.actors) entry.actor = s.actor;
  const note = s.note.trim();
  if (note) entry.note = note;
  if (def.fields.includes('focus') && s.focus) entry.focus = s.focus;
  if (def.fields.includes('requestKind') && s.requestKind) entry.requestKind = s.requestKind;
  if (def.fields.includes('trustDomain') && s.trustDomain) entry.trustDomain = s.trustDomain;
  if (def.fields.includes('rescheduleOffered') && s.rescheduleOffered !== undefined) entry.rescheduleOffered = s.rescheduleOffered;
  if (def.fields.includes('commitment') && s.relatesTo && openPlans(v, conv.personId, asOf).some((c) => c.item.id === s.relatesTo)) {
    entry.relatesTo = s.relatesTo;
  }
  return entry;
}

/**
 * Logs a suggestion. Requests that differ from the relationship's pattern are
 * saved with an open decision (Pause & Reflect), exactly as when logged by hand.
 */
export function addSuggestion(
  v: Vault,
  convId: string,
  sugId: string,
  asOf: ISODate,
  id = newId(),
): { vault: Vault; entry: Interaction; paused: boolean } {
  const conv = captureOf(v).pending.find((p) => p.id === convId);
  const s = conv?.suggestions.find((x) => x.id === sugId);
  if (!conv || !s || s.status !== 'pending') throw new Error('This suggestion is no longer in the inbox.');
  let entry = suggestionToInteraction(v, conv, s, asOf, id);
  const person = v.people.find((p) => p.id === entry.personId);
  const paused = Boolean(person && needsPause(entry) && pauseAndReflect(person, v.interactions, entry).triggered);
  if (paused) entry = { ...entry, decision: { status: 'open' } };

  let next: Vault = { ...v, interactions: [...v.interactions, entry] };
  next = updateSuggestion(next, convId, sugId, (x) => ({ ...x, status: 'added', interactionId: entry.id }));
  if (s.type === 'plans_made') {
    // A cancellation later in the same conversation most likely cancels these plans.
    const order = (guid: string | undefined) => conv.messages.findIndex((m) => m.guid === guid);
    const cancel = conv.suggestions.find((x) => x.type === 'cancelled_plans' && x.status === 'pending');
    if (cancel && order(cancel.triggers[0]) > order(s.triggers[0])) next = editSuggestion(next, convId, cancel.id, { relatesTo: entry.id });
  }
  return { vault: finishIfDone(next, convId, asOf), entry, paused };
}

/** Deleting a person drops their pending conversations (and text) and any alias pointing at them. */
export function forgetPerson(c: CaptureState, personId: string): CaptureState {
  return {
    ...c,
    pending: c.pending.filter((p) => p.personId !== personId),
    aliases: Object.fromEntries(Object.entries(c.aliases).filter(([, id]) => id !== personId)),
  };
}
