import { describe, expect, it } from 'vitest';
import { deriveKey, seal, unseal, WrongPassphraseError } from './crypto';

describe('vault encryption', () => {
  it('round-trips with the right passphrase and rejects the wrong one', async () => {
    const key = await deriveKey('correct horse battery staple', undefined, 1000);
    const sealed = await seal(key, JSON.stringify({ secret: 'Marcus kept my confidence' }));
    expect(sealed.data).not.toContain('Marcus');
    const { plaintext } = await unseal(sealed, 'correct horse battery staple');
    expect(JSON.parse(plaintext)).toEqual({ secret: 'Marcus kept my confidence' });
    await expect(unseal(sealed, 'wrong')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a fresh IV for every save', async () => {
    const key = await deriveKey('pw', undefined, 1000);
    const a = await seal(key, 'same');
    const b = await seal(key, 'same');
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
  });
});
