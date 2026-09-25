'use client';
import { Type } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import type { PageTextShape } from './tldraw/page-text-shape';
import { useShapeProps } from './tldraw/use-shape-props';
import { InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { TextStyleFields } from './text-style-fields';
import { LayerOrderSection } from './layer-order-section';
import type { LayerOrder } from '@/lib/use-layer-reorder';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  order: LayerOrder;
}

export function PageTextInspector({ editor, shapeId, order }: Props) {
  const { props: p, patch } = useShapeProps<PageTextShape>(editor, shapeId);
  if (!p) return null;

  return (
    <InspectorShell
      title={`텍스트${p.textId ? '' : ' · 저장 중…'}`}
      onDelete={() => editor.deleteShapes([shapeId])}
      deleteLabel="텍스트 삭제"
    >
      <InspectorSection icon={Type} title="텍스트">
        <TextStyleFields label="글자" value={p} onChange={patch} />
      </InspectorSection>

      <LayerOrderSection order={order} />
    </InspectorShell>
  );
}
