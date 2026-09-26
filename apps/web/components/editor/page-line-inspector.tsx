'use client';
import { Slash } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import { PAGE_LINE_STROKE_STYLES, type PageLineStrokeStyle } from '@comicai/types';
import type { PageLineShape } from './tldraw/page-line-shape';
import { useShapeProps } from './tldraw/use-shape-props';
import { Field, InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { ColorField } from '@/components/ui/color-field';
import { SliderField, STROKE_WIDTH_RANGE } from './slider-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LayerOrderSection } from './layer-order-section';
import type { LayerOrder } from '@/lib/use-layer-reorder';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  order: LayerOrder;
}

const STROKE_STYLE_LABEL: Record<PageLineStrokeStyle, string> = {
  solid: '실선',
  dashed: '점선',
};

export function PageLineInspector({ editor, shapeId, order }: Props) {
  const { props: p, patch } = useShapeProps<PageLineShape>(editor, shapeId);
  if (!p) return null;

  return (
    <InspectorShell
      title={`직선${p.lineId ? '' : ' · 저장 중…'}`}
      onDelete={() => editor.deleteShapes([shapeId])}
      deleteLabel="직선 삭제"
    >
      <InspectorSection icon={Slash} title="선">
        <Field label="색">
          <ColorField
            value={p.strokeColor}
            onChange={(v) => patch({ strokeColor: v })}
            ariaLabel="선 색"
          />
        </Field>

        <Field label="굵기">
          <SliderField
            {...STROKE_WIDTH_RANGE}
            value={p.strokeWidth}
            onChange={(v) => patch({ strokeWidth: v })}
            ariaLabel="선 굵기"
          />
        </Field>

        <Field label="종류">
          <Select
            value={p.strokeStyle}
            onValueChange={(v) => patch({ strokeStyle: v as PageLineStrokeStyle })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_LINE_STROKE_STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STROKE_STYLE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </InspectorSection>

      <LayerOrderSection order={order} />
    </InspectorShell>
  );
}
