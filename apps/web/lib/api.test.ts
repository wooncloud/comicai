import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api, ApiError } from './api';
import { API_PREFIX } from '@comicai/types';

const ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

describe('lib/api', () => {
  it('envelope `data` 필드를 풀어 반환한다', async () => {
    server.use(
      http.get(`${ORIGIN}${API_PREFIX}/ping`, () => HttpResponse.json({ data: { pong: true } })),
    );
    const res = await api<{ pong: boolean }>('/ping');
    expect(res).toEqual({ pong: true });
  });

  it('non-2xx 응답을 ApiError로 throw 한다', async () => {
    server.use(
      http.get(`${ORIGIN}${API_PREFIX}/forbidden`, () =>
        HttpResponse.json(
          { error: { code: 'RESOURCE_FORBIDDEN', message: '권한 없음' } },
          { status: 403 },
        ),
      ),
    );
    await expect(api('/forbidden')).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_FORBIDDEN',
    });
    await expect(api('/forbidden')).rejects.toBeInstanceOf(ApiError);
  });
});
