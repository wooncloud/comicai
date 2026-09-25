import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  API_PREFIX,
  ApiPaths,
  type TokenBalanceDTO,
  type TokenLedgerEntryDTO,
  type TokenOrderDTO,
} from '@comicai/types';
import { server } from '../mocks/server';
import { TokenBalance } from '@/components/shell/token-balance';
import { useBillingOrders, useTokenBalance, useTokenHistory } from './tokens';
import type { ReactNode } from 'react';

const ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (p: string) => `${ORIGIN}${API_PREFIX}${p}`;

/**
 * 전역 설정(staleTime: 30초, refetchOnWindowFocus: false)을 그대로 재현한 테스트용 클라이언트.
 * 토큰 쿼리들이 전역 기본값을 덮어쓰고 정상 동작하는지 검증한다.
 */
function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('토큰 쿼리 포커스 복귀 갱신 (refetchOnWindowFocus: always)', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
  });

  it('useTokenBalance: 전역 staleTime(30초) 이내라도 포커스 이벤트 발생 시 잔액을 다시 읽는다', async () => {
    let callCount = 0;
    server.use(
      http.get(url(ApiPaths.myTokens), () => {
        callCount++;
        const balance = callCount === 1 ? 10 : 50;
        return HttpResponse.json({
          data: {
            balance,
            costs: { 'gemini-3.1-flash-image-preview': 1, 'gpt-image-2': 4, mock: 0 },
            affordable: {
              'gemini-3.1-flash-image-preview': balance,
              'gpt-image-2': Math.floor(balance / 4),
              mock: null,
            },
          } satisfies TokenBalanceDTO,
        });
      }),
    );

    const { result } = renderHook(() => useTokenBalance(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.data?.balance).toBe(10));
    expect(callCount).toBe(1);

    // 포커스 복귀 시뮬레이션: 비활성화 후 포커스 획득
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(result.current.data?.balance).toBe(50));
    expect(callCount).toBe(2);
  });

  it('useBillingOrders: 포커스 복귀 시 내 충전 요청을 다시 읽는다', async () => {
    let callCount = 0;
    server.use(
      http.get(url(ApiPaths.billingOrders), () => {
        callCount++;
        const status = callCount === 1 ? 'pending' : 'paid';
        return HttpResponse.json({
          data: [
            {
              id: 'ord_1',
              packageId: 'pkg_1',
              depositorName: '홍길동',
              tokens: 100,
              amountKrw: 10000,
              status,
              provider: 'manual',
              createdAt: '2026-09-22T00:00:00.000Z',
              paidAt: status === 'paid' ? '2026-09-22T00:01:00.000Z' : null,
            },
          ] satisfies TokenOrderDTO[],
        });
      }),
    );

    const { result } = renderHook(() => useBillingOrders(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('pending'));
    expect(callCount).toBe(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('paid'));
    expect(callCount).toBe(2);
  });

  it('useTokenHistory: 포커스 복귀 시 토큰 사용 내역을 다시 읽는다', async () => {
    let callCount = 0;
    server.use(
      http.get(url(ApiPaths.myTokenHistory), () => {
        callCount++;
        return HttpResponse.json({
          data: (callCount === 1
            ? []
            : [
                {
                  id: 'entry_1',
                  amount: 50,
                  balanceAfter: 50,
                  kind: 'purchase',
                  label: '충전 50토큰',
                  refId: 'ord_1',
                  createdAt: '2026-09-22T00:00:00.000Z',
                },
              ]) satisfies TokenLedgerEntryDTO[],
        });
      }),
    );

    const { result } = renderHook(() => useTokenHistory(30), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(callCount).toBe(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(callCount).toBe(2);
  });

  it('TokenBalance 헤더 컴포넌트: 창 포커스 시 잔액 배지가 갱신된다', async () => {
    let callCount = 0;
    server.use(
      http.get(url(ApiPaths.myTokens), () => {
        callCount++;
        const balance = callCount === 1 ? 5 : 25;
        return HttpResponse.json({
          data: {
            balance,
            costs: { 'gemini-3.1-flash-image-preview': 1, 'gpt-image-2': 4, mock: 0 },
            affordable: {
              'gemini-3.1-flash-image-preview': balance,
              'gpt-image-2': Math.floor(balance / 4),
              mock: null,
            },
          } satisfies TokenBalanceDTO,
        });
      }),
    );

    render(<TokenBalance />, { wrapper: createWrapper(client) });

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(callCount).toBe(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(screen.getByText('25')).toBeInTheDocument());
    expect(callCount).toBe(2);
  });
});

describe('입금 대기(pending) 주문 존재 시 주기 조회 (가짜 타이머)', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });

  it('대기(pending) 주문이 있을 때만 60초 주기 조회가 켜진다', async () => {
    let orderCalls = 0;
    server.use(
      http.get(url('/billing/orders'), () => {
        orderCalls++;
        return HttpResponse.json({
          data: [
            {
              id: 'ord_pending',
              packageId: 'pkg_1',
              depositorName: '홍길동',
              tokens: 100,
              amountKrw: 10000,
              status: 'pending',
              provider: 'manual',
              createdAt: '2026-09-22T00:00:00.000Z',
              paidAt: null,
            },
          ] satisfies TokenOrderDTO[],
        });
      }),
    );

    // 대기 주문이 있으므로 refetchInterval: 60_000 전달
    renderHook(() => useBillingOrders({ refetchInterval: 60_000 }), {
      wrapper: createWrapper(client),
    });

    // 초기 호출
    await vi.advanceTimersByTimeAsync(0);
    expect(orderCalls).toBe(1);

    // 30초 경과: 아직 60초가 안 되었으므로 추가 호출 없음
    await vi.advanceTimersByTimeAsync(30_000);
    expect(orderCalls).toBe(1);

    // 30초 추가 경과 (총 60초): 주기 조회 발생
    await vi.advanceTimersByTimeAsync(30_000);
    expect(orderCalls).toBe(2);

    // 다시 60초 경과: 3번째 주기 조회 발생
    await vi.advanceTimersByTimeAsync(60_000);
    expect(orderCalls).toBe(3);
  });

  it('대기(pending) 주문이 없을 때는 주기 조회가 꺼진다 (불필요한 요청 금지)', async () => {
    let orderCalls = 0;
    server.use(
      http.get(url(ApiPaths.billingOrders), () => {
        orderCalls++;
        return HttpResponse.json({
          data: [
            {
              id: 'ord_paid',
              packageId: 'pkg_1',
              depositorName: '홍길동',
              tokens: 100,
              amountKrw: 10000,
              status: 'paid',
              provider: 'manual',
              createdAt: '2026-09-22T00:00:00.000Z',
              paidAt: '2026-09-22T00:01:00.000Z',
            },
          ] satisfies TokenOrderDTO[],
        });
      }),
    );

    // 대기 주문이 없으므로 refetchInterval: false 전달
    renderHook(() => useBillingOrders({ refetchInterval: false }), {
      wrapper: createWrapper(client),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(orderCalls).toBe(1);

    // 120초가 지나도 추가 요청이 발생하지 않아야 한다
    await vi.advanceTimersByTimeAsync(120_000);
    expect(orderCalls).toBe(1);
  });

  it('대기 주문이 있을 때 잔액(useTokenBalance)도 60초마다 주기 조회된다', async () => {
    let balanceCalls = 0;
    server.use(
      http.get(url(ApiPaths.myTokens), () => {
        balanceCalls++;
        return HttpResponse.json({
          data: {
            balance: 10,
            costs: { 'gemini-3.1-flash-image-preview': 1, 'gpt-image-2': 4, mock: 0 },
            affordable: { 'gemini-3.1-flash-image-preview': 10, 'gpt-image-2': 2, mock: null },
          } satisfies TokenBalanceDTO,
        });
      }),
    );

    renderHook(() => useTokenBalance({ refetchInterval: 60_000 }), {
      wrapper: createWrapper(client),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(balanceCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(balanceCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(balanceCalls).toBe(3);
  });
});
