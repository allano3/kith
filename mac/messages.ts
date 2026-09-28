import type { CapturedMessage } from '../src/capture/types.ts';
import { handleKey } from './contacts.ts';
import { queryRows } from './sqlite.ts';

/** Messages stores dates relative to 2001-01-01T00:00:00Z. */
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
/** chat.style for one-to-one conversations (43 is a group). */
export const STYLE_ONE_TO_ONE = 45;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const NSSTRING = new TextEncoder().encode('NSString');
const utf8 = new TextDecoder('utf-8');

/**
 * Extracts the plain text from `message.attributedBody`, an NSAttributedString in
 * NeXTSTEP typedstream form. The string payload follows the "NSString" class
 * marker and a '+' type tag, prefixed by its byte length: one byte, or 0x81 and a
 * 2-byte little-endian length, or 0x82 and a 4-byte one. Returns null when the
 * blob has no string payload.
 */
export function decodeAttributedBody(blob: Uint8Array | string): string | null {
  const bytes = typeof blob === 'string' ? hexToBytes(blob) : blob;
  const at = indexOfBytes(bytes, NSSTRING);
  if (at < 0) return null;
  let i = at + NSSTRING.length;
  const tagLimit = Math.min(bytes.length, i + 32);
  while (i < tagLimit && bytes[i] !== 0x2b) i++;
  if (i >= tagLimit) return null;
  i++;
  let len = bytes[i++];
  if (len === 0x81) {
    len = bytes[i] | (bytes[i + 1] << 8);
    i += 2;
  } else if (len === 0x82) {
    len = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    i += 4;
  }
  if (len === undefined || i + len > bytes.length) return null;
  return utf8.decode(bytes.subarray(i, i + len));
}

/** Modern macOS stores nanoseconds; very old databases stored seconds. Yields ms since 2001. */
const MS2001 = 'CASE WHEN m.date > 100000000000 THEN m.date / 1000000 ELSE m.date * 1000 END';

export interface ReadOptions {
  /** Only messages with ROWID greater than this. */
  afterRowId: number;
  /** Only messages at or after this time (first run / --since). */
  since?: Date;
  includeSent: boolean;
  includeGroupChats: boolean;
  /** handleKey(handle) → friend name. */
  friendByHandle: Map<string, string>;
}

export interface ReadResult {
  /** Highest message ROWID in the database when the read began; the next run starts after it. */
  highRowId: number;
  messages: CapturedMessage[];
}

interface ChatHandleRow {
  chatId: number;
  style: number;
  handleRowId: number;
  handle: string;
}

interface MessageRow {
  rowid: number;
  guid: string;
  text: string | null;
  body: string | null;
  fromMe: number;
  service: string | null;
  hasAttachments: number;
  ms2001: number;
  handleRowId: number;
  chatId: number;
}

/** Reads new messages in conversations with configured friends, oldest first. */
export function readMessages(chatDb: string, opts: ReadOptions): ReadResult {
  const [{ hi }] = queryRows<{ hi: number | null }>(chatDb, 'SELECT MAX(ROWID) AS hi FROM message');
  const highRowId = hi ?? 0;
  if (highRowId <= opts.afterRowId) return { highRowId: opts.afterRowId, messages: [] };

  const participants = queryRows<ChatHandleRow>(
    chatDb,
    `SELECT c.ROWID AS chatId, c.style AS style, h.ROWID AS handleRowId, h.id AS handle
       FROM chat c
       JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
       JOIN handle h ON h.ROWID = chj.handle_id`,
  );
  const chatHandles = new Map<number, { style: number; handles: ChatHandleRow[] }>();
  for (const p of participants) {
    const chat = chatHandles.get(p.chatId) ?? { style: p.style, handles: [] };
    chat.handles.push(p);
    chatHandles.set(p.chatId, chat);
  }
  // 1:1 chat → its friend. Group chat (opt-in) → friend per participant handle.
  const directFriend = new Map<number, string>();
  const groupChats = new Set<number>();
  const friendByHandleRow = new Map<number, string>();
  for (const [chatId, chat] of chatHandles) {
    const friends = chat.handles.map((h) => opts.friendByHandle.get(handleKey(h.handle)));
    if (chat.style === STYLE_ONE_TO_ONE && chat.handles.length === 1) {
      if (friends[0]) directFriend.set(chatId, friends[0]);
    } else if (opts.includeGroupChats && friends.some(Boolean)) {
      groupChats.add(chatId);
      chat.handles.forEach((h, i) => friends[i] && friendByHandleRow.set(h.handleRowId, friends[i]));
    }
  }
  const chatIds = [...directFriend.keys(), ...groupChats];
  if (chatIds.length === 0) return { highRowId, messages: [] };

  const rows = queryRows<MessageRow>(
    chatDb,
    `SELECT m.ROWID AS rowid, m.guid AS guid, m.text AS text,
            CASE WHEN m.attributedBody IS NULL THEN NULL ELSE hex(m.attributedBody) END AS body,
            m.is_from_me AS fromMe, m.service AS service, m.cache_has_attachments AS hasAttachments,
            ${MS2001} AS ms2001, m.handle_id AS handleRowId, cmj.chat_id AS chatId
       FROM message m
       JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      WHERE m.ROWID > ${Math.floor(opts.afterRowId)} AND m.ROWID <= ${highRowId}
        AND cmj.chat_id IN (${chatIds.join(',')})
        AND m.associated_message_type = 0
        AND m.item_type = 0
        ${opts.includeSent ? '' : 'AND m.is_from_me = 0'}
        ${opts.since ? `AND ${MS2001} >= ${opts.since.getTime() - APPLE_EPOCH_MS}` : ''}
      ORDER BY m.ROWID`,
  );

  const messages: CapturedMessage[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.guid)) continue;
    const fromMe = r.fromMe === 1;
    const friend = directFriend.get(r.chatId) ?? (fromMe ? undefined : friendByHandleRow.get(r.handleRowId));
    // Sent messages in a group chat have no single addressee, so they are skipped.
    if (!friend) continue;
    const raw = r.text || (r.body ? decodeAttributedBody(r.body) : null) || '';
    // U+FFFC marks where an attachment sat inline.
    const text = raw.replace(/\uFFFC/g, '').trim() || (r.hasAttachments ? '[attachment]' : '');
    if (!text) continue;
    seen.add(r.guid);
    messages.push({
      guid: r.guid,
      friend,
      fromMe,
      sentAt: new Date(r.ms2001 + APPLE_EPOCH_MS).toISOString(),
      text,
      service: r.service ?? 'unknown',
    });
  }
  return { highRowId, messages };
}
