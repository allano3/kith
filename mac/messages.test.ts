import { describe, expect, it } from 'vitest';
import { typedstream } from './fixtures.ts';
import { decodeAttributedBody } from './messages.ts';

describe('decodeAttributedBody', () => {
  it('reads a short string with a one-byte length', () => {
    expect(decodeAttributedBody(typedstream('Dinner Friday?'))).toBe('Dinner Friday?');
  });

  it('reads a string over 127 bytes using the 0x81 two-byte length form', () => {
    const long = 'Congratulations on the new job! '.repeat(8) + 'Let me know when you want to celebrate — my treat 🎉';
    const blob = typedstream(long);
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(127);
    expect(blob.includes(0x81, 30)).toBe(true);
    expect(decodeAttributedBody(blob)).toBe(long);
  });

  it('accepts the hex form sqlite returns', () => {
    const hex = Array.from(typedstream('héllo ✓'), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    expect(decodeAttributedBody(hex)).toBe('héllo ✓');
  });

  it('returns null for blobs without a string payload', () => {
    expect(decodeAttributedBody(new TextEncoder().encode('streamtyped NSDictionary'))).toBeNull();
    const truncated = typedstream('This text is cut off').subarray(0, 90);
    expect(decodeAttributedBody(truncated)).toBeNull();
  });
});
