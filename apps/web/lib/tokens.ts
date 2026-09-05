'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  ApiPaths,
  MODEL_TOKEN_COST,
  type ModelId,
  type TokenBalanceDTO,
  type TokenLedgerKind,
  type TokenOrderStatus,
} from '@comicai/types';
import { api } from './api';
import { qk } from './query-keys';

/**
 * 원장 항목의 문구.
 *
 * `Record<TokenLedgerKind, …>` 라 종류가 늘면 여기서 컴파일 에러가 난다. 빠뜨리면
 * 사용자는 "왜 줄었는지" 자리에 영문 enum 을 보게 되는데, 그 화면은 돈 이야기라
 * 모르는 단어가 하나만 있어도 문의가 된다.
 */
export const LEDGER_KIND_LABEL: Record<TokenLedgerKind, string> = {
  signup_grant: '가입 지급',
  purchase: '충전',
  render: '그림 생성',
  refund: '환급',
  admin_grant: '운영자 지급',
  admin_revoke: '운영자 회수',
};

export const ORDER_STATUS_LABEL: Record<TokenOrderStatus, string> = {
  // 사용자에게 pending 은 "결제 대기" 가 아니다 — 우리가 입금을 확인하는 중이다.
  pending: '확인 중',
  paid: '지급 완료',
  canceled: '취소됨',
  failed: '실패',
};

/** 원 단위 정수를 그대로 찍는다. 나누거나 곱하지 않는다. */
export function formatKrw(amountKrw: number): string {
  return `${amountKrw.toLocaleString('ko-KR')}원`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString('ko-KR');
}

/**
 * 잔액.
 *
 * **`throwOnError` 를 켜지 않는다.** 이 훅은 에디터 헤더에서도 돌고, 잔액 조회가
 * 실패했다고 편집 화면이 오류 경계로 바뀌면 **작업 중이던 것을 잃는다.** 잔액은
 * 없어도 그림을 그릴 수 있지만 캔버스는 없으면 아무것도 못 한다.
 */
export function useTokenBalance() {
  return useQuery<TokenBalanceDTO>({
    queryKey: qk.tokenBalance(),
    queryFn: () => api<TokenBalanceDTO>(ApiPaths.myTokens),
    throwOnError: false,
  });
}

/**
 * 렌더가 끝난 뒤 잔액·내역을 다시 읽는다.
 *
 * 낙관적으로 깎지 않는다. 실패·시간초과·취소는 **자동 환급**되므로 화면이 미리 깎아
 * 두면 되돌리는 코드를 또 써야 하고, 그 코드가 환급 규칙과 어긋나는 순간 숫자가
 * 영원히 틀어진다. 서버가 진실이다.
 */
export function useRefreshTokens() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.tokenBalance() });
    void queryClient.invalidateQueries({ queryKey: qk.tokenHistory() });
  }, [queryClient]);
}

/**
 * "몇 장 만들 수 있는가" 를 문장으로.
 *
 * `null` 은 "비용이 없어 제한 없음"(mock), `undefined` 는 "아직 못 읽음" 이다. 한 삼항으로
 * 뭉개면 한쪽이 `0장` 이나 `NaN장` 으로 새어 나간다 — 잔액 화면에서 0장은 "못 만든다" 는
 * 뜻이라 사실과 정반대가 된다.
 */
export function affordableText(n: number | null | undefined): string {
  if (n === undefined) return '—';
  return n === null ? '제한 없음' : `${formatTokens(n)}장`;
}

export interface Affordability {
  cost: number;
  /** 잔액이 모자라 지금은 시작할 수 없다. */
  short: boolean;
  /** 잔액을 아직 못 읽었다 — 모르는 것과 부족한 것은 다르다. */
  unknown: boolean;
}

/**
 * 이 모델로 지금 한 장 만들 수 있는가.
 *
 * 잔액을 못 읽었을 때 `short` 로 접으면 **잔액 조회가 실패한 사용자의 버튼이 잠긴다.**
 * 그건 서버가 막을 일이지 화면이 추측으로 막을 일이 아니다. 그래서 세 상태다.
 */
export function affordability(balance: TokenBalanceDTO | undefined, model: ModelId): Affordability {
  const cost = MODEL_TOKEN_COST[model];
  if (!balance) return { cost, short: false, unknown: true };
  return { cost, short: balance.balance < cost, unknown: false };
}
