import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export function loadMasterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error('MASTER_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`MASTER_KEY must be ${KEY_BYTES} bytes base64`);
  }
  return buf;
}

export interface SealedSecret {
  ciphertext: string; // base64 of [encrypted | authTag]
  nonce: string; // base64
}

export function seal(plaintext: string, masterKey: Buffer = loadMasterKey()): SealedSecret {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, masterKey, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ct, tag]).toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

export function open(sealed: SealedSecret, masterKey: Buffer = loadMasterKey()): string {
  const both = Buffer.from(sealed.ciphertext, 'base64');
  const tag = both.subarray(both.length - 16);
  const ct = both.subarray(0, both.length - 16);
  const decipher = createDecipheriv(ALGO, masterKey, Buffer.from(sealed.nonce, 'base64'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
