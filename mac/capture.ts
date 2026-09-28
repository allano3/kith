import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CaptureBundle, CapturedMessage } from '../src/capture/types.ts';
import { deriveKey, seal } from '../src/store/crypto.ts';
import { handleKey, resolveContact } from './contacts.ts';
import { readMessages } from './messages.ts';

export interface FriendConfig {
  /** Must match the person's name in Kith. */
  name: string;
  /** Name in macOS Contacts, when it differs from `name`. */
  contact?: string;
  /** Explicit phone numbers / emails; when present, Contacts is not consulted. */
  handles?: string[];
}

export interface CaptureConfig {
  friends: FriendConfig[];
  includeSent: boolean;
  includeGroupChats: boolean;
  outputDir: string;
  /** Bundles this script wrote more than this many days ago are deleted. 0 keeps them all. */
  retentionDays: number;
}

export interface CaptureState {
  lastRowId: number;
  lastRun: string;
}

export interface CapturePaths {
  kithDir: string;
  configFile: string;
  stateFile: string;
  logFile: string;
  chatDb: string;
  addressBookDir: string;
}

export function defaultPaths(home = homedir()): CapturePaths {
  const kithDir = join(home, '.kith');
  return {
    kithDir,
    configFile: join(kithDir, 'capture.json'),
    stateFile: join(kithDir, 'state.json'),
    logFile: join(kithDir, 'capture.log'),
    chatDb: join(home, 'Library/Messages/chat.db'),
    addressBookDir: join(home, 'Library/Application Support/AddressBook'),
  };
}

export const DEFAULT_CONFIG: CaptureConfig = {
  friends: [],
  includeSent: true,
  includeGroupChats: false,
  outputDir: '~/Library/Mobile Documents/com~apple~CloudDocs/Kith',
  retentionDays: 14,
};

export function expandHome(p: string, home = homedir()): string {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p;
}

export class ConfigError extends Error {}

export function parseConfig(json: string): CaptureConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ConfigError(`capture.json is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError('capture.json must be a JSON object.');
  const c = { ...DEFAULT_CONFIG, ...(raw as Partial<CaptureConfig>) };
  if (!Array.isArray(c.friends)) throw new ConfigError('"friends" must be a list.');
  const names = new Set<string>();
  for (const f of c.friends) {
    if (typeof f?.name !== 'string' || !f.name.trim()) throw new ConfigError('Every friend needs a "name".');
    if (names.has(f.name.trim().toLowerCase())) throw new ConfigError(`"${f.name}" is listed twice.`);
    names.add(f.name.trim().toLowerCase());
    if (f.contact !== undefined && typeof f.contact !== 'string') throw new ConfigError(`"contact" for ${f.name} must be text.`);
    if (f.handles !== undefined && !(Array.isArray(f.handles) && f.handles.every((h) => typeof h === 'string' && h.trim())))
      throw new ConfigError(`"handles" for ${f.name} must be a list of phone numbers or emails.`);
  }
  if (typeof c.includeSent !== 'boolean' || typeof c.includeGroupChats !== 'boolean')
    throw new ConfigError('"includeSent" and "includeGroupChats" must be true or false.');
  if (typeof c.outputDir !== 'string' || !c.outputDir.trim()) throw new ConfigError('"outputDir" must be a folder path.');
  if (typeof c.retentionDays !== 'number' || !(c.retentionDays >= 0)) throw new ConfigError('"retentionDays" must be 0 or more.');
  return c;
}

export function loadConfig(file: string): CaptureConfig {
  if (!existsSync(file)) throw new ConfigError(`No config at ${file}. Run: npm run capture -- setup`);
  return parseConfig(readFileSync(file, 'utf8'));
}

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export function writePrivateFile(file: string, content: string): void {
  const tmp = join(dirname(file), `.${basename(file)}.tmp`);
  writeFileSync(tmp, content, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

export function saveConfig(file: string, config: CaptureConfig): void {
  writePrivateFile(file, `${JSON.stringify(config, null, 2)}\n`);
}

export function loadState(file: string): CaptureState | undefined {
  if (!existsSync(file)) return undefined;
  const s = JSON.parse(readFileSync(file, 'utf8')) as CaptureState;
  return typeof s.lastRowId === 'number' ? s : undefined;
}

export interface ResolvedFriend {
  name: string;
  handles: string[];
  /** Where the handles came from: the config, or the Contacts card with this name. */
  source: { kind: 'config' } | { kind: 'contacts'; contact: string };
}

/** Resolves every friend's handles; throws on the first friend that can't be resolved. */
export function resolveFriends(config: CaptureConfig, addressBookDir: string): ResolvedFriend[] {
  return config.friends.map((f) => {
    if (f.handles?.length) return { name: f.name, handles: f.handles, source: { kind: 'config' } };
    const { contact, handles } = resolveContact(f.contact ?? f.name, addressBookDir);
    return { name: f.name, handles, source: { kind: 'contacts', contact } };
  });
}

/** handleKey → friend name. One handle claimed by two friends is a config error. */
export function friendIndex(friends: ResolvedFriend[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const f of friends) {
    for (const h of f.handles) {
      const key = handleKey(h);
      const other = index.get(key);
      if (other && other !== f.name) throw new ConfigError(`${h} belongs to both ${other} and ${f.name}.`);
      index.set(key, f.name);
    }
  }
  return index;
}

const BUNDLE_FILE = /^kith-capture-(\d{4}-\d{2}-\d{2})-[0-9a-f]{6}\.json$/;

export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Deletes this script's own bundles dated more than `days` days before `now`. Returns the names removed. */
export function pruneBundles(dir: string, days: number, now: Date): string[] {
  if (days <= 0 || !existsSync(dir)) return [];
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    const m = BUNDLE_FILE.exec(name);
    if (!m) continue;
    const [y, mo, d] = m[1].split('-').map(Number);
    if (new Date(y, mo - 1, d) < cutoff) {
      unlinkSync(join(dir, name));
      removed.push(name);
    }
  }
  return removed;
}

export interface FriendSummary {
  name: string;
  received: number;
  sent: number;
  /** Local dates (YYYY-MM-DD) of the first and last message, when there are any. */
  firstDate?: string;
  lastDate?: string;
}

export interface RunOptions {
  config: CaptureConfig;
  friends: ResolvedFriend[];
  paths: CapturePaths;
  /** Capture passphrase; required unless dryRun. */
  passphrase?: string;
  since?: Date;
  dryRun: boolean;
  now: Date;
}

export interface RunResult {
  messages: number;
  perFriend: FriendSummary[];
  /** Absolute path of the sealed bundle, when one was written. */
  bundleFile?: string;
  pruned: string[];
  /** State after the run (unchanged on a dry run). */
  lastRowId: number;
}

export async function runCapture(opts: RunOptions): Promise<RunResult> {
  const { config, paths, now } = opts;
  const previous = loadState(paths.stateFile);
  // --since re-reads from a date regardless of state; the app dedupes by message GUID.
  // A first run with neither reads the last 24 hours.
  const afterRowId = opts.since ? 0 : (previous?.lastRowId ?? 0);
  const since = opts.since ?? (previous ? undefined : new Date(now.getTime() - 24 * 3600_000));
  const { highRowId, messages } = readMessages(paths.chatDb, {
    afterRowId,
    since,
    includeSent: config.includeSent,
    includeGroupChats: config.includeGroupChats,
    friendByHandle: friendIndex(opts.friends),
  });

  const perFriend: FriendSummary[] = opts.friends.map((f) => {
    const mine = messages.filter((m) => m.friend === f.name);
    return {
      name: f.name,
      received: mine.filter((m) => !m.fromMe).length,
      sent: mine.filter((m) => m.fromMe).length,
      firstDate: mine[0] && localDate(new Date(mine[0].sentAt)),
      lastDate: mine.at(-1) && localDate(new Date(mine.at(-1)!.sentAt)),
    };
  });
  const lastRowId = Math.max(highRowId, previous?.lastRowId ?? 0);
  if (opts.dryRun) return { messages: messages.length, perFriend, pruned: [], lastRowId: previous?.lastRowId ?? 0 };

  let bundleFile: string | undefined;
  const outputDir = expandHome(config.outputDir);
  if (messages.length > 0) {
    if (!opts.passphrase) throw new Error('No capture passphrase.');
    bundleFile = await writeBundle(outputDir, buildBundle(config, messages, now), opts.passphrase, now);
  }
  // Only now is it safe to move past these messages.
  mkdirSync(paths.kithDir, { recursive: true, mode: 0o700 });
  writePrivateFile(paths.stateFile, `${JSON.stringify({ lastRowId, lastRun: now.toISOString() } satisfies CaptureState)}\n`);
  const pruned = pruneBundles(outputDir, config.retentionDays, now);
  return { messages: messages.length, perFriend, bundleFile, pruned, lastRowId };
}

function buildBundle(config: CaptureConfig, messages: CapturedMessage[], now: Date): CaptureBundle {
  const times = messages.map((m) => m.sentAt).sort();
  return {
    format: 'kith-capture',
    v: 1,
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    from: times[0],
    to: times[times.length - 1],
    includesSent: config.includeSent,
    friends: config.friends.map((f) => f.name),
    messages,
  };
}

async function writeBundle(dir: string, bundle: CaptureBundle, passphrase: string, now: Date): Promise<string> {
  const sealed = await seal(await deriveKey(passphrase), JSON.stringify(bundle));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `kith-capture-${localDate(now)}-${bundle.id.replace(/-/g, '').slice(0, 6)}.json`);
  writePrivateFile(file, JSON.stringify(sealed));
  return file;
}

/** One line per run for the log: counts only, never message text. */
export function summaryLine(r: RunResult, now: Date, dryRun: boolean): string {
  const sent = r.perFriend.reduce((n, f) => n + f.sent, 0);
  const active = r.perFriend.filter((f) => f.received + f.sent > 0).length;
  const out = dryRun ? 'dry run, nothing written' : r.bundleFile ? `wrote ${r.bundleFile.split('/').pop()}` : 'no bundle needed';
  return `${now.toISOString()} ${r.messages} messages (${r.messages - sent} received, ${sent} sent) from ${active} of ${r.perFriend.length} friends; ${out}; pruned ${r.pruned.length}; last ROWID ${r.lastRowId}`;
}
