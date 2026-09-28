import type { ISODate } from '../domain/types';

const DAY = 86_400_000;

export function toDate(d: ISODate): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`);
}

export function isoDay(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function today(): ISODate {
  const now = new Date();
  return isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

export function addDays(d: ISODate, n: number): ISODate {
  return isoDay(new Date(toDate(d).getTime() + n * DAY));
}

/** Parses `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` to the first day of the period. */
export function parseSince(since: string | undefined): ISODate | null {
  if (!since) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(since.trim());
  if (!m) return null;
  return `${m[1]}-${m[2] ?? '01'}-${m[3] ?? '01'}`;
}

export function monthsBetween(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) / 30.44;
}

/** Human duration: "3 weeks", "5 months", "2 years". */
export function humanSpan(days: number): string {
  const d = Math.abs(days);
  if (d < 14) return plural(d, 'day');
  if (d < 60) return plural(Math.round(d / 7), 'week');
  if (d < 730) return plural(Math.round(d / 30.44), 'month');
  return plural(Math.round(d / 365.25), 'year');
}

export function formatDate(d: ISODate): string {
  return toDate(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatMonth(d: ISODate): string {
  return toDate(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${num(n)} ${n === 1 ? word : pluralWord}`;
}

/** "once", "twice", "three times". */
export function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${num(n)} times`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Spells small numbers ("four"), digits otherwise. `cap` capitalizes for sentence starts. */
export function num(n: number, cap = false): string {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}
