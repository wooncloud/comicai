'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiPaths, type TokenOrderDTO, type TokenPackage } from '@comicai/types';
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
import { formatKrw, formatTokens } from '@/lib/tokens';

interface Props {
  pkg: TokenPackage | null;
  /** 입금 방법. 이게 없으면 애초에 이 다이얼로그가 열리지 않는다. */
  notice: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * 충전 요청을 확인하는 자리.
 *
 * 카드에서 바로 주문을 만들지 않는 이유가 둘이다. 하나는 **입금자명을 받아야 해서**이고,
 * 다른 하나는 돈이 오가는 요청이라 **입금 방법을 보는 화면과 누르는 화면이 같아야**
 * 하기 때문이다. 안내를 위에서 읽고 아래로 스크롤해 버튼을 누르면, 정작 누르는 순간에는
 * 어디로 보낼지 안 보인다.
 */
export function ChargeDialog({ pkg, notice, onOpenChange }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [depositorName, setDepositorName] = useState('');
  const name = depositorName.trim();

  function close() {
    setDepositorName('');
    onOpenChange(false);
  }

  const create = useMutation({
    mutationFn: () =>
      api<TokenOrderDTO>(ApiPaths.billingOrders, {
        method: 'POST',
        body: JSON.stringify({ packageId: pkg!.id, depositorName: name }),
      }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: qk.billingOrders() });
      toast.push(
        'success',
        `충전 요청을 접수했습니다. 입금이 확인되면 ${formatTokens(order.tokens)}토큰이 들어옵니다.`,
      );
      close();
    },
    onError: (err) => toast.push('error', errorMessage(err, '충전을 요청')),
  });

  return (
    <Dialog open={pkg !== null} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>충전 요청</DialogTitle>
          <DialogDescription>
            {pkg ? `${formatTokens(pkg.tokens)}토큰 · ${formatKrw(pkg.amountKrw)}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-4 py-3 text-body-sm [text-wrap:pretty]">
            {notice}
          </p>

          <label className="block space-y-1">
            <span className="text-body-sm">입금자명 (통장에 찍힐 이름)</span>
            <Input
              autoFocus
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              maxLength={40}
              placeholder="예: 홍길동"
            />
            {/*
              스키마에서는 선택이지만 **폼에서는 받는다.** 통장에 찍히는 것은 입금자명이고
              가입 이메일과 아무 관계가 없다 — 가족 명의, 회사 명의, 예금주명. 비워 두면
              운영자가 금액만으로 짝을 지어야 하고, 같은 날 같은 패키지가 둘이면 그게
              불가능해진다.
            */}
            <span className="text-caption text-muted-foreground">
              이 이름으로 입금해 주세요. 확인이 이 이름으로 이뤄집니다.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            닫기
          </Button>
          <Button disabled={name.length === 0 || create.isPending} onClick={() => create.mutate()}>
            충전 요청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
