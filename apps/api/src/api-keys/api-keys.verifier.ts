/**
 * BYOK 키 검증. spec 03-api-contracts.md POST /api-keys/:id/verify.
 * provider별 가벼운 read-only probe(모델 목록 조회)로 401/403만 잡고 빠르게 반환.
 */

export interface VerifyResult {
  ok: boolean;
  status: number;
  category?: 'auth' | 'transient' | 'unknown';
  message: string;
}

export async function verifyApiKey(
  provider: 'gemini' | 'openai',
  secret: string,
  signal?: AbortSignal,
): Promise<VerifyResult> {
  try {
    const res =
      provider === 'gemini'
        ? await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
              secret,
            )}`,
            { signal },
          )
        : await fetch('https://api.openai.com/v1/models', {
            headers: { authorization: `Bearer ${secret}` },
            signal,
          });
    if (res.ok) return { ok: true, status: res.status, message: 'verified' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, category: 'auth', message: 'invalid credentials' };
    }
    if (res.status >= 500) {
      return { ok: false, status: res.status, category: 'transient', message: 'provider error' };
    }
    return { ok: false, status: res.status, category: 'unknown', message: `http ${res.status}` };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, status: 0, category: 'transient', message: 'aborted' };
    }
    return { ok: false, status: 0, category: 'transient', message: (err as Error).message };
  }
}
