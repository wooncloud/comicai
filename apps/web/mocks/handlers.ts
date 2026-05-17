import { http, HttpResponse } from 'msw';
import { API_PREFIX, type ProjectDTO, type SessionUser } from '@comicai/types';

// API_BASE = NEXT_PUBLIC_API_URL ?? 'http://localhost:4000' + API_PREFIX.
const ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (p: string) => `${ORIGIN}${API_PREFIX}${p}`;

// envelope 헬퍼 — lib/api.ts가 `{ data: T }`을 푸는 형태와 맞춤.
const ok = <T>(data: T) => HttpResponse.json({ data });

export const handlers = [
  http.get(url('/me'), () =>
    ok<SessionUser>({
      id: 'u_test',
      email: 'test@example.com',
      displayName: '테스터',
      avatarUrl: null,
    }),
  ),

  http.get(url('/projects'), () =>
    ok<ProjectDTO[]>([
      {
        id: 'p_1',
        userId: 'u_test',
        name: '테스트 프로젝트',
        thumbnail: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  ),
];
