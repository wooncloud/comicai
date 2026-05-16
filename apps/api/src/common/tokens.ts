import { createHash, randomBytes } from 'crypto';

export function urlSafeToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hexToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
