'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiPaths, type AdminUserRow } from '@comicai/types';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { formatTokens } from '@/lib/tokens';

interface Props {
  user: AdminUserRow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * 운영자 지급·회수.
 *
 * 지급과 회수를 한 화면에서 부호로 가른다 — API 가 그렇게 생겼고, 무엇보다 **사유가
 * 양쪽 모두 필수**이기 때문이다. 두 화면으로 가르면 회수 쪽에만 사유를 빠뜨리기 쉬운데
 * 나중에 "왜 깎였나" 를 묻는 것은 늘 회수 쪽이다.
 */
export function TokenGrantDialog({ user, onOpenChange }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  const n = Number(amount);
  const valid = Number.isInteger(n) && n !== 0 && memo.trim().length > 0;

  const submit = useMutation({
    mutationFn: () =>
      api<{ balance: number }>(ApiPaths.adminUserTokens(user!.id), {
        method: 'POST',
        body: JSON.stringify({ amount: n, memo: memo.trim() }),
      }),
    onSuccess: ({ balance }) => {
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
      toast.push('success', `처리했습니다. 잔액 ${formatTokens(balance)}토큰.`);
      close();
    },
    onError: (err) => toast.push('error', errorMessage(err, '토큰을 조정')),
  });

  function close() {
    setAmount('');
    setMemo('');
    onOpenChange(false);
  }

  return (
    <Dialog open={user !== null} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>토큰 조정</DialogTitle>
          <DialogDescription>
            {user?.email} · 현재 {formatTokens(user?.tokenBalance ?? 0)}토큰
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-body-sm">수량</span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="예: 50 (회수는 -50)"
            />
            {/* 부호가 곧 방향이라, 무엇이 일어날지 미리 문장으로 보여 준다. */}
            {Number.isInteger(n) && n !== 0 ? (
              <span className="text-caption text-muted-foreground">
                {n > 0
                  ? `${formatTokens(n)}토큰을 지급합니다.`
                  : `${formatTokens(-n)}토큰을 회수합니다.`}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-body-sm">사유</span>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={200}
              placeholder="원장에 남습니다. 나중에 되짚을 수 있게."
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            닫기
          </Button>
          <Button disabled={!valid || submit.isPending} onClick={() => submit.mutate()}>
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
