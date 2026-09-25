'use client';
import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LayerOrderAction } from '@/lib/use-layer-reorder';

interface Props {
  canMoveForward: boolean;
  canMoveBackward: boolean;
  onReorder: (action: LayerOrderAction) => void;
  disabled?: boolean;
}

export function LayerOrderControls({
  canMoveForward,
  canMoveBackward,
  onReorder,
  disabled = false,
}: Props) {
  /* 제목은 감싸는 `InspectorSection` 이 그린다 — 여기서 또 그리면 제목이 두 줄이 된다. */
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-caption gap-1 px-2"
          onClick={() => onReorder('toFront')}
          disabled={disabled || !canMoveForward}
          title="맨 앞으로"
          aria-label="맨 앞으로"
        >
          <ChevronsUp className="h-3.5 w-3.5" />맨 앞으로
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-caption gap-1 px-2"
          onClick={() => onReorder('forward')}
          disabled={disabled || !canMoveForward}
          title="앞으로"
          aria-label="앞으로"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          앞으로
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-caption gap-1 px-2"
          onClick={() => onReorder('backward')}
          disabled={disabled || !canMoveBackward}
          title="뒤로"
          aria-label="뒤로"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          뒤로
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-caption gap-1 px-2"
          onClick={() => onReorder('toBack')}
          disabled={disabled || !canMoveBackward}
          title="맨 뒤로"
          aria-label="맨 뒤로"
        >
          <ChevronsDown className="h-3.5 w-3.5" />맨 뒤로
        </Button>
      </div>
    </div>
  );
}
