// Vault crypto: passphrase → AES-GCM round-trips. Uses WebCrypto, which Node
// 18+ exposes as the global `crypto` (same API the extension runs on).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptText, decryptText, isValidVaultBlob } from '../lib/vault.js';

test('vault round-trips unicode content', async () => {
  const blob = await encryptText('correct horse battery', 'IBAN DE89 3704 ✈️ 文字');
  assert.equal(isValidVaultBlob(blob), true);
  assert.equal(await decryptText('correct horse battery', blob), 'IBAN DE89 3704 ✈️ 文字');
});

test('wrong passphrase is rejected', async () => {
  const blob = await encryptText('right', 'secret text');
  await assert.rejects(() => decryptText('wrong', blob));
});

test('tampered ciphertext is rejected', async () => {
  const blob = await encryptText('right', 'secret text');
  const tampered = { ...blob, ct: blob.ct.slice(0, -4) + 'AAAA' };
  await assert.rejects(() => decryptText('right', tampered));
});

test('tampered salt is rejected', async () => {
  const blob = await encryptText('right', 'secret text');
  const tampered = { ...blob, salt: blob.salt.slice(0, -2) + 'AA' };
  await assert.rejects(() => decryptText('right', tampered));
});

test('salt and IV are unique per encryption', async () => {
  const a = await encryptText('p', 'same text');
  const b = await encryptText('p', 'same text');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});

test('isValidVaultBlob rejects junk shapes', () => {
  assert.equal(isValidVaultBlob(null), false);
  assert.equal(isValidVaultBlob('x'), false);
  assert.equal(isValidVaultBlob({}), false);
  assert.equal(isValidVaultBlob({ v: 1, salt: 'a', iv: 'b', ct: '' }), false);
  assert.equal(isValidVaultBlob({ v: 2, salt: 'a', iv: 'b', ct: 'c' }), false);
  assert.equal(isValidVaultBlob({ v: 1, salt: 'a', iv: 'b', ct: 'c' }), true);
});
