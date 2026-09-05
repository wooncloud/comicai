'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ApiPaths,
  MODEL_TOKEN_COST,
  type TokenLedgerEntryDTO,
  type TokenOrderDTO,
  type TokenPackagesDTO,
} from '@comicai/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { errorMessage } from '@/lib/error-message';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { qk } from '@/lib/query-keys';
import {
  LEDGER_KIND_LABEL,
  ORDER_STATUS_LABEL,
  affordableText,
  formatKrw,
  formatTokens,
  useTokenBalance,
} from '@/lib/tokens';

const HISTORY_LIMIT = 30;

export default function BillingSettingsPage() {
  return (
    <div className="space-y-10">
      <BalanceSection />
      <PackagesSection />
      <OrdersSection />
      <HistorySection />
    </div>
  );
}

function BalanceSection() {
  const { data, isError } = useTokenBalance();

  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">잔액</h2>
      {isError ? (
        <p className="text-body-sm text-muted-foreground">잔액을 불러오지 못했습니다.</p>
      ) : (
        <>
          <p className="text-display-md font-semibold tabular-nums">
            {data ? formatTokens(data.balance) : '—'}
            <span className="ml-1.5 text-body-sm font-normal text-muted-foreground">토큰</span>
          </p>
          {/*
            "몇 장 만들 수 있는가" 가 사용자가 실제로 묻는 것이다. 모델마다 값이 다르므로
            서버가 계산해 준 `affordable` 을 그대로 쓴다 — 화면이 나눗셈하면 단가가
            바뀔 때 두 곳이 갈라진다.
          */}
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm text-muted-foreground">
            {MODEL_OPTIONS.map((m) => {
              // null 은 "비용이 없어 제한 없음" 이고 undefined 는 "아직 못 읽음" 이다.
              // 둘을 같이 다루면 한쪽이 0 이나 NaN 으로 새어 나간다.
              const text = affordableText(data ? data.affordable[m.id] : undefined);
              return (
                <li key={m.id}>
                  {m.label} <span className="tabular-nums text-foreground">{text}</span>
                  <span className="ml-1 text-caption">
                    (장당 {formatTokens(MODEL_TOKEN_COST[m.id])})
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function PackagesSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery<TokenPackagesDTO>({
    queryKey: qk.billingPackages(),
    queryFn: () => api<TokenPackagesDTO>(ApiPaths.billingPackages),
    throwOnError: false,
  });

  const create = useMutation({
    mutationFn: (packageId: string) =>
      api<TokenOrderDTO>(ApiPaths.billingOrders, {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: qk.billingOrders() });
      toast.push(
        'success',
        `충전 요청을 접수했습니다. 입금이 확인되면 ${formatTokens(order.tokens)}토큰이 들어옵니다.`,
      );
    },
    onError: (err) => toast.push('error', errorMessage(err, '충전을 요청')),
  });

  if (isError) {
    return (
      <section className="space-y-3">
        <h2 className="text-title-lg font-semibold">충전</h2>
        <p className="text-body-sm text-muted-foreground">패키지를 불러오지 못했습니다.</p>
      </section>
    );
  }

  /*
   * `notice` 는 **어떻게 돈을 내는지**다. 비어 있으면 주문 버튼을 내지 않는다.
   *
   * 안내 없이 버튼만 있으면 누른 사용자는 주문이 생긴 것도 모르고 다음에 할 일도
   * 모른 채 남는다 — 성공한 것처럼 보이기 때문에 버튼이 없는 것보다 나쁘다.
   * 서버도 같은 조건으로 주문을 거부하므로, 여기서 감추는 것은 그 규칙의 표시일 뿐
   * 유일한 방어가 아니다.
   */
  const open = data != null && data.notice !== null;

  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">충전</h2>

      {data && !open ? (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-body-sm text-muted-foreground [text-wrap:pretty]">
          지금은 충전을 받고 있지 않습니다. 준비되면 이 화면에서 안내드리겠습니다.
        </p>
      ) : null}

      {open ? (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-body-sm [text-wrap:pretty]">
          <span className="font-medium">자동 결제는 아직 없습니다.</span> 아래에서 충전을 요청하시면
          접수되고, 입금이 확인된 뒤 토큰이 들어옵니다.
          <span className="mt-2 block whitespace-pre-wrap text-muted-foreground">
            {data.notice}
          </span>
        </p>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-3">
        {(data?.packages ?? []).map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-title-lg font-semibold tabular-nums">
                {formatTokens(p.tokens)}
                <span className="ml-1 text-body-sm font-normal text-muted-foreground">토큰</span>
              </p>
              <p className="text-body-sm text-muted-foreground tabular-nums">
                {formatKrw(p.amountKrw)}
              </p>
            </div>
            {open ? (
              <Button
                size="sm"
                variant="outline"
                disabled={create.isPending}
                onClick={() => create.mutate(p.id)}
              >
                충전 요청
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrdersSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery<TokenOrderDTO[]>({
    queryKey: qk.billingOrders(),
    queryFn: () => api<TokenOrderDTO[]>(ApiPaths.billingOrders),
    throwOnError: false,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api<void>(ApiPaths.billingOrder(id), { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.billingOrders() });
      toast.push('success', '충전 요청을 취소했습니다.');
    },
    onError: (err) => toast.push('error', errorMessage(err, '요청을 취소')),
  });

  // 요청이 없으면 절 자체를 내지 않는다. 로딩 중에도 마찬가지다 — 빈 테두리 상자가
  // 잠깐 떴다가 채워지는 것보다 없다가 나타나는 편이 덜 산만하다.
  if (isError || !data || data.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">충전 요청</h2>
      <ul className="divide-y divide-border rounded-md border border-border text-body-sm">
        {data.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="tabular-nums">
                {formatTokens(o.tokens)}토큰 · {formatKrw(o.amountKrw)}
              </p>
              <p className="text-caption text-muted-foreground">
                {new Date(o.createdAt).toLocaleDateString('ko-KR')} 접수
                {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString('ko-KR')} 지급` : ''}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <span
                className={
                  o.status === 'paid'
                    ? 'rounded bg-emerald-500/10 px-2 py-0.5 text-caption text-emerald-700 dark:text-emerald-300'
                    : 'rounded bg-secondary px-2 py-0.5 text-caption text-muted-foreground'
                }
              >
                {ORDER_STATUS_LABEL[o.status]}
              </span>
              {/*
                취소를 막지 않는다. 같은 패키지를 두 번 사는 것은 정상이고, 잘못 누른
                요청이 영원히 "확인 중" 으로 남는 쪽이 더 나쁘다.
              */}
              {o.status === 'pending' ? (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: '충전 요청을 취소할까요?',
                        body: '아직 입금하지 않으셨다면 그대로 취소해도 됩니다. 이미 보내셨다면 취소하지 마세요.',
                        confirmLabel: '요청 취소',
                      });
                      if (ok) cancel.mutate(o.id);
                    })();
                  }}
                  className="text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  취소
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistorySection() {
  const [expanded, setExpanded] = useState(false);
  const { data, isError } = useQuery<TokenLedgerEntryDTO[]>({
    queryKey: qk.tokenHistory(),
    queryFn: () => api<TokenLedgerEntryDTO[]>(`${ApiPaths.myTokenHistory}?limit=${HISTORY_LIMIT}`),
    throwOnError: false,
  });

  const rows = expanded ? (data ?? []) : (data ?? []).slice(0, 8);

  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">사용 내역</h2>
      {isError ? (
        <p className="text-body-sm text-muted-foreground">내역을 불러오지 못했습니다.</p>
      ) : data?.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">아직 움직임이 없습니다.</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border text-body-sm">
            {rows.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate">
                    {LEDGER_KIND_LABEL[e.kind]}
                    {e.memo ? <span className="ml-1.5 text-muted-foreground">{e.memo}</span> : null}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="flex-none text-right tabular-nums">
                  {/* 부호를 그대로 보여 준다. "얼마 나갔나" 가 이 화면의 질문이다. */}
                  <p
                    className={
                      e.amount < 0 ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    {e.amount > 0 ? '+' : ''}
                    {formatTokens(e.amount)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    잔액 {formatTokens(e.balanceAfter)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {!expanded && (data?.length ?? 0) > rows.length ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-body-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              더 보기
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
