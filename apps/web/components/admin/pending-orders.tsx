'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiPaths, type AdminOrderRow } from '@comicai/types';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { errorMessage } from '@/lib/error-message';
import { formatKrw, formatTokens } from '@/lib/tokens';

/**
 * 입금 확인을 기다리는 충전 요청.
 *
 * 운영자가 실제로 하는 일은 **통장에 찍힌 금액·입금자와 이 목록을 맞춰 보는 것**이다.
 * 그래서 금액과 이메일이 한 줄에서 같이 읽혀야 한다 — 두 값이 떨어져 있으면 목록이
 * 있어도 눈이 왕복한다.
 *
 * 화면 맨 위에 둔다. 운영자가 이 페이지에 오는 이유가 대체로 이것이고, 이게 밀리면
 * 사용자는 돈을 보내 놓고 기다린다.
 */
export function PendingOrders({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data: orders } = useQuery<AdminOrderRow[]>({
    queryKey: qk.adminOrders(),
    queryFn: () => api<AdminOrderRow[]>(`${ApiPaths.adminOrders}?status=pending`),
    enabled,
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api(ApiPaths.adminOrderMarkPaid(id), { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.adminOrders() });
      // 지급되면 그 사용자의 잔액이 바뀐다. 아래 표가 옛 숫자를 들고 있으면
      // 운영자가 "안 들어갔나" 하고 한 번 더 누른다.
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
      toast.push('success', '토큰을 지급했습니다.');
    },
    onError: (err) => toast.push('error', errorMessage(err, '지급을 처리')),
  });

  return (
    <section className="mt-8">
      <h2 className="text-title-md font-medium">
        입금 확인 대기
        {orders && orders.length > 0 ? (
          <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-caption text-amber-700 dark:text-amber-300">
            {orders.length}건
          </span>
        ) : null}
      </h2>

      {orders === undefined ? (
        <p className="mt-3 text-body-sm text-muted-foreground">불러오는 중…</p>
      ) : orders.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted-foreground">처리할 요청이 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-body-sm">
            <thead className="border-b border-border bg-muted/40 text-caption text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">입금자명 · 가입 이메일</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">금액</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">지급 토큰</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">접수</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            {/* 오래 기다린 것이 위다(서버가 createdAt asc 로 준다). */}
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="max-w-0 px-3 py-2">
                    {/*
                      통장에 찍히는 것은 **입금자명**이고 가입 이메일과 아무 관계가 없다.
                      그래서 이름이 위, 이메일이 아래다 — 운영자가 맞춰 보는 축이 이름이다.
                      옛 주문에는 이름이 없으므로 그때는 이메일로 떨어진다.
                    */}
                    <div className="truncate font-medium">{o.depositorName ?? o.email}</div>
                    <div className="truncate text-caption text-muted-foreground">
                      {o.depositorName ? `${o.email} · ` : ''}
                      {o.packageId}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {formatKrw(o.amountKrw)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatTokens(o.tokens)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-caption text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markPaid.isPending}
                      onClick={() => {
                        void (async () => {
                          // 지급은 되돌리는 경로가 회수(admin_revoke)뿐이라 한 번 묻는다.
                          const ok = await confirm({
                            title: `${o.email} 에게 ${formatTokens(o.tokens)}토큰을 지급할까요?`,
                            body: `${o.depositorName ? `${o.depositorName} 이름으로 ` : ''}${formatKrw(o.amountKrw)} 입금을 확인했을 때만 누르세요. 지급하면 사용자가 바로 쓸 수 있습니다.`,
                            confirmLabel: '지급',
                          });
                          if (ok) markPaid.mutate(o.id);
                        })();
                      }}
                    >
                      입금 확인
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
