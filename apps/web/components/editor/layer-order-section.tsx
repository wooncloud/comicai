'use client';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LayerOrder, LayerOrderAction } from '@/lib/use-layer-reorder';
import { InspectorSection } from './inspector-section';

/**
 * 맨 앞으로 → 맨 뒤로, 한 줄. 글자 없이 아이콘만 둔다 — 네 동작이 모양으로 구별되고,
 * 글자까지 넣으면 두 줄을 차지해 정작 자주 만지는 값들이 아래로 밀린다. 이름은
 * 툴팁과 스크린 리더(`aria-label`)가 말한다.
 */
const BUTTONS: readonly {
  action: LayerOrderAction;
  label: string;
  icon: typeof ArrowUp;
  forward: boolean;
}[] = [
  { action: 'toFront', label: '맨 앞으로', icon: ArrowUpToLine, forward: true },
  { action: 'forward', label: '앞으로', icon: ArrowUp, forward: true },
  { action: 'backward', label: '뒤로', icon: ArrowDown, forward: false },
  { action: 'toBack', label: '맨 뒤로', icon: ArrowDownToLine, forward: false },
];

/** 말풍선·텍스트·직선 인스펙터의 "순서" 구역. */
export function LayerOrderSection({ order }: { order: LayerOrder }) {
  return (
    <InspectorSection icon={Layers} title="순서">
      <div className="grid grid-cols-4 gap-1.5">
        {BUTTONS.map(({ action, label, icon: Icon, forward }) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            className="h-8 px-0"
            onClick={() => order.onReorder(action)}
            disabled={forward ? !order.canMoveForward : !order.canMoveBackward}
            title={label}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    </InspectorSection>
  );
}
