'use client';
import { PANEL_SHAPE_PRESETS, type PanelShapeType } from '@comicai/types';
import { outlinePathFor } from './tldraw/panel-geometry';
import { cn } from '@/lib/cn';

interface Props {
  value: PanelShapeType;
  onChange: (variant: PanelShapeType) => void;
  disabled?: boolean;
}

const LABELS: Record<PanelShapeType, string> = {
  rect: '직사각형',
  rounded: '둥근 사각',
  oval: '타원',
  diamond: '다이아',
  parallelogram: '평행사변',
  polygon: '다각형',
};

export function PanelShapePicker({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-caption text-muted-foreground">모양</label>
      <div className="grid grid-cols-3 gap-2">
        {PANEL_SHAPE_PRESETS.map((v) => (
          <ShapeButton
            key={v}
            variant={v}
            label={LABELS[v]}
            active={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
          />
        ))}
      </div>
    </div>
  );
}

interface BtnProps {
  variant: PanelShapeType;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ShapeButton({ variant, label, active, disabled, onClick }: BtnProps) {
  const path = outlinePathFor(variant, 40, 28);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cn(
        'flex flex-col items-center gap-1 rounded border px-2 py-2 text-caption transition-colors',
        active
          ? 'border-foreground bg-muted'
          : 'border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/50 hover:text-foreground',
        disabled && 'opacity-50',
      )}
    >
      <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
