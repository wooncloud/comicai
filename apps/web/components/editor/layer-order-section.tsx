'use client';
import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LayerOrder, LayerOrderAction } from '@/lib/use-layer-reorder';
import { InspectorSection } from './inspector-section';

/** 위 줄은 앞으로, 아래 줄은 뒤로 — 쌓인 순서를 눈으로 따라가게 둔다. */
const BUTTONS: readonly {
  action: LayerOrderAction;
  label: string;
  icon: typeof ChevronUp;
  forward: boolean;
}[] = [
  { action: 'toFront', label: '맨 앞으로', icon: ChevronsUp, forward: true },
  { action: 'forward', label: '앞으로', icon: ChevronUp, forward: true },
  { action: 'backward', label: '뒤로', icon: ChevronDown, forward: false },
  { action: 'toBack', label: '맨 뒤로', icon: ChevronsDown, forward: false },
];

/** 말풍선·텍스트·직선 인스펙터의 "순서" 구역. */
export function LayerOrderSection({ order }: { order: LayerOrder }) {
  return (
    <InspectorSection icon={Layers} title="순서">
      <div className="grid grid-cols-2 gap-1.5">
        {BUTTONS.map(({ action, label, icon: Icon, forward }) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-caption"
            onClick={() => order.onReorder(action)}
            disabled={forward ? !order.canMoveForward : !order.canMoveBackward}
            title={label}
            aria-label={label}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </InspectorSection>
  );
}
