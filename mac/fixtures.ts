/** Test fixtures: Messages and Contacts databases with the real table/column names. */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SQLITE3 } from './sqlite.ts';

const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const sql = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;

function exec(dbPath: string, script: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  execFileSync(SQLITE3, ['-init', '/dev/null', dbPath], { input: script, stdio: ['pipe', 'ignore', 'pipe'] });
}

/**
 * An NSAttributedString typedstream as Messages writes to `attributedBody`: header,
 * class chain, the NSString payload with its length prefix, then attribute runs.
 */
export function typedstream(text: string): Uint8Array {
  const payload = new TextEncoder().encode(text);
  const n = payload.length;
  const length =
    n < 0x80 ? [n] : n <= 0xffff ? [0x81, n & 0xff, n >> 8] : [0x82, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];
  const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  return Uint8Array.from([
    0x04, 0x0b, ...ascii('streamtyped'), 0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84,
    0x12, ...ascii('NSAttributedString'), 0x00, 0x84, 0x84, 0x08, ...ascii('NSObject'), 0x00, 0x85, 0x92, 0x84, 0x84, 0x84,
    0x08, ...ascii('NSString'), 0x01, 0x94, 0x84, 0x01, 0x2b, ...length, ...payload,
    0x86, 0x84, 0x02, ...ascii('iI'), 0x01, 0x0a, 0x92, 0x84, 0x84, 0x84, 0x0c, ...ascii('NSDictionary'), 0x00, 0x94, 0x84,
    0x01, 0x69, 0x01, 0x92, 0x84, 0x96, 0x96, 0x1d, ...ascii('__kIMMessagePartAttributeName'), 0x86, 0x92, 0x84, 0x84, 0x84,
    0x08, ...ascii('NSNumber'), 0x00, 0x84, 0x84, 0x07, ...ascii('NSValue'), 0x00, 0x94, 0x84, 0x01, 0x2a, 0x84, 0x99, 0x99,
    0x00, 0x86, 0x86, 0x86,
  ]);
}

export interface FixtureMessage {
  chat: number;
  /** handle ROWID of the sender for received messages; 0 for sent ones in modern databases. */
  handle?: number;
  fromMe?: boolean;
  text?: string | null;
  /** Store the text only in attributedBody (text column NULL), as recent macOS does. */
  bodyOnly?: boolean;
  at: Date;
  service?: string;
  associatedType?: number;
  itemType?: number;
  attachments?: boolean;
}

export interface MessagesDb {
  handle(id: string, service?: string): number;
  /** style 45 = one-to-one, 43 = group. */
  chat(handleIds: number[], style?: number): number;
  message(m: FixtureMessage): { rowid: number; guid: string };
  /** Creates or extends the database file with everything added since the last write. */
  write(path: string): void;
}

/** Builds a chat.db incrementally; call `write` to create the file. */
export function messagesDb(): MessagesDb {
  const lines: string[] = [
    `CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE, id TEXT NOT NULL, country TEXT, service TEXT NOT NULL, uncanonicalized_id TEXT, person_centric_id TEXT, UNIQUE (id, service));`,
    `CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, style INTEGER, state INTEGER, account_id TEXT, properties BLOB, chat_identifier TEXT, service_name TEXT, room_name TEXT, account_login TEXT, is_archived INTEGER DEFAULT 0, last_addressed_handle TEXT, display_name TEXT, group_id TEXT, is_filtered INTEGER DEFAULT 0, successful_query INTEGER DEFAULT 1);`,
    `CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, text TEXT, replace INTEGER DEFAULT 0, service_center TEXT, handle_id INTEGER DEFAULT 0, subject TEXT, country TEXT, attributedBody BLOB, version INTEGER DEFAULT 0, type INTEGER DEFAULT 0, service TEXT, account TEXT, account_guid TEXT, error INTEGER DEFAULT 0, date INTEGER, date_read INTEGER, date_delivered INTEGER, is_delivered INTEGER DEFAULT 0, is_finished INTEGER DEFAULT 0, is_emote INTEGER DEFAULT 0, is_from_me INTEGER DEFAULT 0, is_empty INTEGER DEFAULT 0, is_read INTEGER DEFAULT 0, is_sent INTEGER DEFAULT 0, cache_has_attachments INTEGER DEFAULT 0, item_type INTEGER DEFAULT 0, other_handle INTEGER DEFAULT 0, group_title TEXT, group_action_type INTEGER DEFAULT 0, associated_message_guid TEXT, associated_message_type INTEGER DEFAULT 0, balloon_bundle_id TEXT, thread_originator_guid TEXT, date_edited INTEGER DEFAULT 0, date_retracted INTEGER DEFAULT 0);`,
    `CREATE TABLE chat_message_join (chat_id INTEGER REFERENCES chat (ROWID) ON DELETE CASCADE, message_id INTEGER REFERENCES message (ROWID) ON DELETE CASCADE, message_date INTEGER DEFAULT 0, PRIMARY KEY (chat_id, message_id));`,
    `CREATE TABLE chat_handle_join (chat_id INTEGER REFERENCES chat (ROWID) ON DELETE CASCADE, handle_id INTEGER REFERENCES handle (ROWID) ON DELETE CASCADE, UNIQUE(chat_id, handle_id));`,
  ];
  let handles = 0;
  let chats = 0;
  let messages = 0;
  return {
    handle(id: string, service = 'iMessage'): number {
      lines.push(`INSERT INTO handle (ROWID, id, service) VALUES (${++handles}, ${sql(id)}, ${sql(service)});`);
      return handles;
    },
    /** style 45 = one-to-one, 43 = group. */
    chat(handleIds: number[], style = 45): number {
      chats++;
      lines.push(`INSERT INTO chat (ROWID, guid, style, chat_identifier) VALUES (${chats}, 'chat-${chats}', ${style}, 'chat${chats}');`);
      for (const h of handleIds) lines.push(`INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (${chats}, ${h});`);
      return chats;
    },
    message(m: FixtureMessage): { rowid: number; guid: string } {
      const rowid = ++messages;
      const guid = `GUID-${rowid}`;
      const ns = BigInt(m.at.getTime() - APPLE_EPOCH_MS) * 1_000_000n;
      const text = m.text ?? null;
      const body = text === null ? 'NULL' : `X'${hex(typedstream(text))}'`;
      lines.push(
        `INSERT INTO message (ROWID, guid, text, attributedBody, handle_id, service, date, date_read, is_from_me, cache_has_attachments, item_type, associated_message_type) VALUES (` +
          [rowid, sql(guid), m.bodyOnly ? 'NULL' : sql(text), body, m.fromMe ? 0 : (m.handle ?? 0), sql(m.service ?? 'iMessage'), ns.toString(), ns.toString(), m.fromMe ? 1 : 0, m.attachments ? 1 : 0, m.itemType ?? 0, m.associatedType ?? 0].join(', ') +
          ');',
        `INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES (${m.chat}, ${rowid}, ${ns});`,
      );
      return { rowid, guid };
    },
    /** Creates or extends the database file with everything added since the last write. */
    write(path: string): void {
      exec(path, lines.join('\n'));
      lines.length = 0;
    },
  };
}

export interface FixtureContact {
  first?: string;
  last?: string;
  nickname?: string;
  phones?: string[];
  emails?: string[];
}

/** A Contacts store (AddressBook-v22.abcddb) with the given people. */
export function writeContactsDb(path: string, people: FixtureContact[]): void {
  const lines = [
    'CREATE TABLE ZABCDRECORD (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, Z_OPT INTEGER, ZFIRSTNAME VARCHAR, ZLASTNAME VARCHAR, ZMIDDLENAME VARCHAR, ZNICKNAME VARCHAR, ZORGANIZATION VARCHAR);',
    'CREATE TABLE ZABCDPHONENUMBER (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, Z_OPT INTEGER, ZOWNER INTEGER, ZLABEL VARCHAR, ZFULLNUMBER VARCHAR);',
    'CREATE TABLE ZABCDEMAILADDRESS (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, Z_OPT INTEGER, ZOWNER INTEGER, ZLABEL VARCHAR, ZADDRESS VARCHAR, ZADDRESSNORMALIZED VARCHAR);',
  ];
  people.forEach((p, i) => {
    const pk = i + 1;
    lines.push(`INSERT INTO ZABCDRECORD (Z_PK, Z_ENT, ZFIRSTNAME, ZLASTNAME, ZNICKNAME) VALUES (${pk}, 22, ${sql(p.first)}, ${sql(p.last)}, ${sql(p.nickname)});`);
    for (const ph of p.phones ?? []) lines.push(`INSERT INTO ZABCDPHONENUMBER (Z_ENT, ZOWNER, ZLABEL, ZFULLNUMBER) VALUES (20, ${pk}, '_$!<Mobile>!$_', ${sql(ph)});`);
    for (const em of p.emails ?? []) lines.push(`INSERT INTO ZABCDEMAILADDRESS (Z_ENT, ZOWNER, ZADDRESS, ZADDRESSNORMALIZED) VALUES (19, ${pk}, ${sql(em)}, ${sql(em.toLowerCase())});`);
  });
  exec(path, lines.join('\n'));
}
