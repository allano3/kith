import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCaptureBundle, type CaptureBundle } from '../src/capture/types.ts';
import { isSealed, unseal } from '../src/store/crypto.ts';
import { friendIndex, loadState, resolveFriends, runCapture, type CaptureConfig, type CapturePaths, type RunOptions } from './capture.ts';
import { messagesDb, type MessagesDb } from './fixtures.ts';
import { readMessages } from './messages.ts';

const PASS = 'correct horse battery';
const NOW = new Date(2026, 8, 27, 23, 0, 0);
const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3600_000);

let dir: string;
let paths: CapturePaths;
let db: MessagesDb;
let config: CaptureConfig;
const g: Record<string, string> = {};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kith-capture-'));
  paths = {
    kithDir: join(dir, '.kith'),
    configFile: join(dir, '.kith/capture.json'),
    stateFile: join(dir, '.kith/state.json'),
    logFile: join(dir, '.kith/capture.log'),
    chatDb: join(dir, 'chat.db'),
    addressBookDir: join(dir, 'AddressBook'),
  };
  config = {
    friends: [
      { name: 'Sarah', handles: ['+1 (555) 123-4567'] },
      { name: 'Sam', handles: ['Sam@Example.com'] },
      { name: 'Priya', handles: ['+15550001111'] },
    ],
    includeSent: true,
    includeGroupChats: false,
    outputDir: join(dir, 'iCloud/Kith'),
    retentionDays: 14,
  };

  db = messagesDb();
  const sarah = db.handle('+15551234567');
  const sarahSms = db.handle('+15551234567', 'SMS');
  const sam = db.handle('sam@example.com');
  const stranger = db.handle('+15559999999');
  const cSarah = db.chat([sarah]);
  const cSarahSms = db.chat([sarahSms]);
  const cSam = db.chat([sam]);
  const cStranger = db.chat([stranger]);
  const group = db.chat([sarah, sam, stranger], 43);

  g.old = db.message({ chat: cSarah, handle: sarah, text: 'From last week', at: hoursAgo(72) }).guid;
  g.dinner = db.message({ chat: cSarah, handle: sarah, text: 'Dinner Friday?', at: hoursAgo(5) }).guid;
  g.reply = db.message({ chat: cSarah, fromMe: true, text: 'Yes! 7pm?', at: hoursAgo(4.9) }).guid;
  g.tapback = db.message({ chat: cSarah, handle: sarah, text: 'Loved “Yes! 7pm?”', associatedType: 2000, at: hoursAgo(4.8) }).guid;
  g.system = db.message({ chat: cSarah, handle: sarah, text: null, itemType: 1, at: hoursAgo(4.7) }).guid;
  g.sms = db.message({ chat: cSarahSms, handle: sarahSms, text: 'Running late, sorry', bodyOnly: true, service: 'SMS', at: hoursAgo(3) }).guid;
  g.photo = db.message({ chat: cSam, handle: sam, text: '\uFFFC', attachments: true, at: hoursAgo(2) }).guid;
  g.empty = db.message({ chat: cSam, handle: sam, text: null, at: hoursAgo(1.5) }).guid;
  g.stranger = db.message({ chat: cStranger, handle: stranger, text: 'hi', at: hoursAgo(1) }).guid;
  g.groupIn = db.message({ chat: group, handle: sarah, text: 'Group hello', at: hoursAgo(0.5) }).guid;
  g.groupOut = db.message({ chat: group, fromMe: true, text: 'Group reply', at: hoursAgo(0.4) }).guid;
  db.write(paths.chatDb);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (c: CaptureConfig, afterRowId = 0, since: Date | undefined = hoursAgo(24)) =>
  readMessages(paths.chatDb, {
    afterRowId,
    since,
    includeSent: c.includeSent,
    includeGroupChats: c.includeGroupChats,
    friendByHandle: friendIndex(resolveFriends(c, paths.addressBookDir)),
  }).messages;

describe('readMessages', () => {
  it('keeps 1:1 conversations with configured friends only, both directions, across services and handle formats', () => {
    const got = read(config);
    expect(got.map((m) => m.guid)).toEqual([g.dinner, g.reply, g.sms, g.photo]);
    expect(got.map((m) => [m.friend, m.fromMe, m.text, m.service])).toEqual([
      ['Sarah', false, 'Dinner Friday?', 'iMessage'],
      ['Sarah', true, 'Yes! 7pm?', 'iMessage'],
      ['Sarah', false, 'Running late, sorry', 'SMS'],
      ['Sam', false, '[attachment]', 'iMessage'],
    ]);
  });

  it('orders by time and converts Apple nanosecond dates to ISO', () => {
    expect(read(config)[0].sentAt).toBe(hoursAgo(5).toISOString());
  });

  it('leaves out the user’s own messages when includeSent is off', () => {
    expect(read({ ...config, includeSent: false }).map((m) => m.guid)).toEqual([g.dinner, g.sms, g.photo]);
  });

  it('includes group chats only when enabled, and then only friends’ own messages', () => {
    const guids = read({ ...config, includeGroupChats: true }).map((m) => m.guid);
    expect(guids).toContain(g.groupIn);
    expect(guids).not.toContain(g.groupOut);
    expect(guids).not.toContain(g.stranger);
  });

  it('starts after the given ROWID', () => {
    expect(read(config, 6, undefined).map((m) => m.guid)).toEqual([g.photo]);
  });
});

async function openBundle(file: string): Promise<CaptureBundle> {
  const sealed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  expect(isSealed(sealed)).toBe(true);
  const payload: unknown = JSON.parse((await unseal(sealed as never, PASS)).plaintext);
  expect(isCaptureBundle(payload)).toBe(true);
  return payload as CaptureBundle;
}

const capture = (over: Partial<RunOptions> = {}) =>
  runCapture({ config, friends: resolveFriends(config, paths.addressBookDir), paths, passphrase: PASS, dryRun: false, now: NOW, ...over });

describe('runCapture', () => {
  it('writes a private sealed bundle that unseals to the captured conversations', { timeout: 30_000 }, async () => {
    const result = await capture();
    expect(result.bundleFile).toBeDefined();
    const file = result.bundleFile!;
    expect(file.startsWith(join(dir, 'iCloud/Kith/kith-capture-2026-09-27-'))).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const bundle = await openBundle(file);
    expect(bundle.messages.map((m) => m.guid)).toEqual([g.dinner, g.reply, g.sms, g.photo]);
    expect(bundle.friends).toEqual(['Sarah', 'Sam', 'Priya']);
    expect(bundle.includesSent).toBe(true);
    expect([bundle.from, bundle.to]).toEqual([hoursAgo(5).toISOString(), hoursAgo(2).toISOString()]);
    expect(result.perFriend.find((f) => f.name === 'Priya')).toMatchObject({ received: 0, sent: 0 });
    expect(loadState(paths.stateFile)?.lastRowId).toBe(11);
  });

  it('catches up from the last ROWID on the next run and advances state when nothing matched', { timeout: 30_000 }, async () => {
    await capture();
    // Two nights later: one new message from Sam, one from a stranger.
    const later = new Date(NOW.getTime() + 48 * 3600_000);
    const sam = db.handle('sam@example.com', 'SMS');
    const c = db.chat([sam]);
    const late = db.message({ chat: c, handle: sam, text: 'Missed you at the thing', at: hoursAgo(30, later) });
    db.message({ chat: 4, handle: 4, text: 'spam', at: hoursAgo(1, later) });
    db.write(paths.chatDb);

    const second = await capture({ now: later });
    expect((await openBundle(second.bundleFile!)).messages.map((m) => m.guid)).toEqual([late.guid]);
    expect(loadState(paths.stateFile)?.lastRowId).toBe(13);

    const third = await capture({ now: new Date(later.getTime() + 24 * 3600_000) });
    expect(third.bundleFile).toBeUndefined();
    expect(loadState(paths.stateFile)?.lastRun).toBe(new Date(later.getTime() + 24 * 3600_000).toISOString());
  });

  it('--since re-reads from a date regardless of saved state', async () => {
    mkdirSync(paths.kithDir, { recursive: true });
    writeFileSync(paths.stateFile, JSON.stringify({ lastRowId: 11, lastRun: NOW.toISOString() }));
    expect((await capture({ dryRun: true })).messages).toBe(0);
    expect((await capture({ dryRun: true, since: hoursAgo(96) })).messages).toBe(5);
  });

  it('a dry run reports counts and writes nothing', async () => {
    const result = await capture({ dryRun: true, passphrase: undefined });
    expect(result.messages).toBe(4);
    expect(result.perFriend.find((f) => f.name === 'Sarah')).toMatchObject({ received: 2, sent: 1, firstDate: '2026-09-27' });
    expect(existsSync(paths.stateFile)).toBe(false);
    expect(existsSync(config.outputDir)).toBe(false);
  });

  it('does not advance state when the bundle cannot be written', async () => {
    mkdirSync(join(dir, 'iCloud'), { recursive: true });
    writeFileSync(join(dir, 'iCloud/Kith'), 'not a folder');
    await expect(capture()).rejects.toThrow();
    expect(existsSync(paths.stateFile)).toBe(false);
  });

  it('deletes only its own bundles older than retentionDays', { timeout: 30_000 }, async () => {
    mkdirSync(config.outputDir, { recursive: true });
    for (const name of ['kith-capture-2026-09-01-abc123.json', 'kith-capture-2026-09-20-abc123.json', 'kith-2026-09-01.json', 'notes.txt'])
      writeFileSync(join(config.outputDir, name), '{}');
    const result = await capture();
    expect(result.pruned).toEqual(['kith-capture-2026-09-01-abc123.json']);
    expect(readdirSync(config.outputDir).sort()).toEqual(
      ['kith-2026-09-01.json', 'kith-capture-2026-09-20-abc123.json', result.bundleFile!.split('/').pop()!, 'notes.txt'].sort(),
    );
  });
});
