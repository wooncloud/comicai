import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { API_PREFIX } from '@comicai/types';
import { server } from '../mocks/server';
import { useProject } from './use-project';
import type { ReactNode } from 'react';

const ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useProject', () => {
  it('GET /projects/:id 결과를 반환한다', async () => {
    server.use(
      http.get(`${ORIGIN}${API_PREFIX}/projects/p_abc`, () =>
        HttpResponse.json({
          data: {
            id: 'p_abc',
            userId: 'u_test',
            name: '훅 테스트 프로젝트',
            thumbnail: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    );

    const { result } = renderHook(() => useProject('p_abc'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current?.id).toBe('p_abc'));
    expect(result.current?.name).toBe('훅 테스트 프로젝트');
  });

  it('projectId 미지정 시 페치하지 않고 null을 반환한다', () => {
    const { result } = renderHook(() => useProject(undefined), { wrapper: wrapper() });
    expect(result.current).toBeNull();
  });
});
