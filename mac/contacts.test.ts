import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { friendIndex, resolveFriends, type CaptureConfig } from './capture.ts';
import { ContactMatchError, handleKey, resolveContact } from './contacts.ts';
import { writeContactsDb } from './fixtures.ts';

describe('handleKey', () => {
  it('matches phone numbers across formatting and country prefix', () => {
    const key = handleKey('+15551234567');
    for (const v of ['+1 (555) 123-4567', '555.123.4567', '15551234567', ' 555 123 4567 ']) expect(handleKey(v)).toBe(key);
    expect(handleKey('+15551234568')).not.toBe(key);
  });

  it('matches emails case-insensitively and never confuses them with phones', () => {
    expect(handleKey('Sarah@Example.COM')).toBe(handleKey('sarah@example.com'));
    expect(handleKey('5551234567@example.com')).not.toBe(handleKey('5551234567'));
  });
});

describe('resolveContact', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'kith-ab-'));
    writeContactsDb(join(dir, 'AddressBook-v22.abcddb'), [
      { first: 'Sarah', last: 'Whitfield', phones: ['+1 (555) 123-4567'] },
      { first: 'Sarah', last: 'Jones', emails: ['sj@example.com'] },
      { first: 'Tom', last: 'Okafor', nickname: 'Tommo', phones: ['555-222-3333'] },
      { first: 'Nadia', last: 'Haddad' },
    ]);
    // The same person synced through a second account, with an extra email.
    writeContactsDb(join(dir, 'Sources/ACCOUNT-1/AddressBook-v22.abcddb'), [
      { first: 'Sarah', last: 'Whitfield', phones: ['5551234567'], emails: ['sarah@x.com'] },
    ]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('merges handles for one person across Contacts sources, deduplicating by number', () => {
    const r = resolveContact('sarah  whitfield', dir);
    expect(r.contact).toBe('Sarah Whitfield');
    expect(r.handles.map(handleKey).sort()).toEqual([handleKey('sarah@x.com'), handleKey('5551234567')].sort());
  });

  it('matches by nickname or unique first name', () => {
    expect(resolveContact('Tommo', dir).contact).toBe('Tom Okafor');
    expect(resolveContact('Tom', dir).contact).toBe('Tom Okafor');
  });

  it('rejects an ambiguous name and lists the candidates', () => {
    const err = (() => {
      try {
        resolveContact('Sarah', dir);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ContactMatchError);
    expect((err as ContactMatchError).candidates.map((c) => c.displayName).sort()).toEqual(['Sarah Jones', 'Sarah Whitfield']);
  });

  it('rejects unknown names and contacts without any handle', () => {
    expect(() => resolveContact('Priya', dir)).toThrow(ContactMatchError);
    expect(() => resolveContact('Nadia Haddad', dir)).toThrow(ContactMatchError);
  });

  it('uses config handles as given and Contacts for friends without them', () => {
    const config: CaptureConfig = {
      friends: [
        { name: 'Sam', handles: ['+44 7700 900123'] },
        { name: 'Sarah', contact: 'Sarah Whitfield' },
        { name: 'Tom' },
      ],
      includeSent: true,
      includeGroupChats: false,
      outputDir: '/tmp',
      retentionDays: 14,
    };
    const [sam, sarah, tom] = resolveFriends(config, dir);
    expect(sam).toEqual({ name: 'Sam', handles: ['+44 7700 900123'], source: { kind: 'config' } });
    expect(sarah.source).toEqual({ kind: 'contacts', contact: 'Sarah Whitfield' });
    expect(tom.handles).toEqual(['555-222-3333']);
  });

  it('refuses a handle claimed by two friends', () => {
    expect(() =>
      friendIndex([
        { name: 'Sarah', handles: ['+1 555 123 4567'], source: { kind: 'config' } },
        { name: 'Sam', handles: ['5551234567'], source: { kind: 'config' } },
      ]),
    ).toThrow();
  });
});
