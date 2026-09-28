/**
 * Contract between the Mac capture script (mac/kith-capture.ts) and the app.
 *
 * The Mac script reads Messages' chat.db on a daily or weekly schedule, keeps only 1:1 conversations
 * with the friends listed in its config, and writes a CaptureBundle sealed with
 * the same format as vault backups (src/store/crypto.ts `seal`), using a
 * separate capture passphrase. The app imports it into a review inbox; message
 * text is discarded once each conversation has been reviewed.
 */

export interface CapturedMessage {
  /** Messages GUID — the dedupe key across overlapping bundles. */
  guid: string;
  /** Friend name from the Mac config; normally identical to the Kith person's name. */
  friend: string;
  /** True for messages the user sent (only present when the bundle `includesSent`). */
  fromMe: boolean;
  /**
   * ISO 8601 timestamp. Used only to order messages and group conversations —
   * never displayed or analysed as reply latency.
   */
  sentAt: string;
  /** Plain text. Attachments become "[attachment]"; reactions/tapbacks are excluded. */
  text: string;
  /** Transport as reported by Messages ("iMessage", "SMS", "RCS"…). */
  service: string;
}

export interface CaptureBundle {
  format: 'kith-capture';
  v: 1;
  /** Random UUID; the app ignores bundles it has already imported. */
  id: string;
  createdAt: string;
  /** ISO range of message timestamps this bundle covers. */
  from: string;
  to: string;
  /** Whether the user's own messages in these conversations are included (needed to know who initiated). */
  includesSent: boolean;
  /** All configured friend names, including ones with no messages in this range. */
  friends: string[];
  messages: CapturedMessage[];
}

export function isCaptureBundle(x: unknown): x is CaptureBundle {
  const b = x as CaptureBundle;
  return typeof b === 'object' && b !== null && b.format === 'kith-capture' && b.v === 1 && Array.isArray(b.messages);
}
