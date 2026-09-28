import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { queryRows } from './sqlite.ts';

/**
 * Comparison key for a phone number or email. Emails compare case-insensitively;
 * phones compare on their last 10 digits so "+1 (555) 123-4567", "555.123.4567"
 * and "15551234567" all match. Short codes compare on all their digits.
 */
export function handleKey(handle: string): string {
  const h = handle.trim();
  if (h.includes('@')) return `e:${h.toLowerCase()}`;
  const digits = h.replace(/\D/g, '');
  return `p:${digits.length > 10 ? digits.slice(-10) : digits}`;
}

export interface ContactCandidate {
  /** "First Last" (or nickname / organisation when there is no personal name). */
  displayName: string;
  nickname?: string;
  handles: string[];
}

export class ContactMatchError extends Error {
  readonly query: string;
  /** Contacts that matched equally well (empty when nothing matched). */
  readonly candidates: ContactCandidate[];
  constructor(query: string, candidates: ContactCandidate[], message: string) {
    super(message);
    this.query = query;
    this.candidates = candidates;
  }
}

/** The main Contacts store plus one per account under Sources/. Missing directory → none. */
export function addressBookDatabases(addressBookDir: string): string[] {
  const dbs: string[] = [];
  const root = join(addressBookDir, 'AddressBook-v22.abcddb');
  if (existsSync(root)) dbs.push(root);
  const sources = join(addressBookDir, 'Sources');
  if (existsSync(sources)) {
    for (const entry of readdirSync(sources)) {
      const db = join(sources, entry, 'AddressBook-v22.abcddb');
      if (existsSync(db)) dbs.push(db);
    }
  }
  return dbs;
}

interface RecordRow {
  pk: number;
  first: string | null;
  last: string | null;
  nick: string | null;
  org: string | null;
}

interface HandleRow {
  owner: number;
  value: string | null;
}

const squash = (s: string | null | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function readContacts(db: string): ContactCandidate[] {
  const records = queryRows<RecordRow>(
    db,
    'SELECT Z_PK AS pk, ZFIRSTNAME AS first, ZLASTNAME AS last, ZNICKNAME AS nick, ZORGANIZATION AS org FROM ZABCDRECORD',
  );
  const handles = new Map<number, string[]>();
  const phones = queryRows<HandleRow>(db, 'SELECT ZOWNER AS owner, ZFULLNUMBER AS value FROM ZABCDPHONENUMBER');
  const emails = queryRows<HandleRow>(db, 'SELECT ZOWNER AS owner, ZADDRESS AS value FROM ZABCDEMAILADDRESS');
  for (const row of [...phones, ...emails]) {
    if (!row.value?.trim()) continue;
    const list = handles.get(row.owner) ?? [];
    list.push(row.value.trim());
    handles.set(row.owner, list);
  }
  const out: ContactCandidate[] = [];
  for (const r of records) {
    const personal = [r.first, r.last].map((s) => s?.trim()).filter(Boolean).join(' ');
    const displayName = personal || r.nick?.trim() || r.org?.trim() || '';
    if (!displayName) continue;
    out.push({ displayName, nickname: r.nick?.trim() || undefined, handles: handles.get(r.pk) ?? [] });
  }
  return out;
}

/**
 * Finds the phone numbers and emails for a Contacts name. Prefers an exact full-name
 * match, then nickname, then first name alone. Several different people at the best
 * tier, or nobody, is an error that lists the candidates. The same person synced
 * through several accounts (same full name) is merged.
 */
export function resolveContact(query: string, addressBookDir: string): { contact: string; handles: string[] } {
  const q = squash(query);
  const all = addressBookDatabases(addressBookDir).flatMap(readContacts);
  const tiers: ((c: ContactCandidate) => boolean)[] = [
    (c) => squash(c.displayName) === q,
    (c) => squash(c.nickname) === q,
    (c) => squash(c.displayName.split(' ')[0]) === q,
  ];
  const matches = tiers.map((test) => all.filter(test)).find((m) => m.length > 0) ?? [];
  if (matches.length === 0) {
    const partial = all.filter((c) => squash(c.displayName).includes(q) || squash(c.nickname).includes(q));
    throw new ContactMatchError(
      query,
      partial,
      `No contact named "${query}" in Contacts.` +
        (partial.length ? ` Similar: ${partial.map((c) => c.displayName).join(', ')}.` : '') +
        ' Use --contact "<exact Contacts name>" or --handle.',
    );
  }
  const people = new Map<string, ContactCandidate>();
  for (const m of matches) {
    const key = squash(m.displayName);
    const prev = people.get(key);
    people.set(key, prev ? { ...prev, handles: [...prev.handles, ...m.handles] } : m);
  }
  if (people.size > 1) {
    const list = [...people.values()];
    throw new ContactMatchError(
      query,
      list,
      `"${query}" matches several contacts: ${list.map((c) => c.displayName).join(', ')}. Use --contact with the full name, or --handle.`,
    );
  }
  const [person] = people.values();
  const seen = new Set<string>();
  const handles = person.handles.filter((h) => !seen.has(handleKey(h)) && seen.add(handleKey(h)));
  if (handles.length === 0) {
    throw new ContactMatchError(query, [person], `Contact "${person.displayName}" has no phone number or email. Add one with --handle.`);
  }
  return { contact: person.displayName, handles };
}
