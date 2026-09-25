'use client';
import { Layers, Type } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import {
  PAGE_TEXT_FONT_FAMILIES,
  PAGE_TEXT_FONT_LABEL,
  type PageTextFontFamily,
} from '@comicai/types';
import type { PageTextShape } from './tldraw/page-text-shape';
import { Field, InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { ColorField } from '@/components/ui/color-field';
import { NumberField } from './number-field';
import { AlignToggle } from './align-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LayerOrderControls } from './layer-order-controls';
import type { LayerOrderAction } from '@/lib/use-layer-reorder';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  shape: PageTextShape;
  canMoveForward?: boolean;
  canMoveBackward?: boolean;
  onReorder?: (action: LayerOrderAction) => void;
}

export function PageTextInspector({
  editor,
  shapeId,
  shape,
  canMoveForward,
  canMoveBackward,
  onReorder,
}: Props) {
  const p = shape.props;

  /*
   * **바뀐 키만 넘긴다.** `updateShape` 는 props 를 부분 병합하므로 스프레드가
   * 필요 없고, 스프레드하면 오히려 해롭다 — `shape` 는 선택 시점의 스냅샷이라
   * 그 사이 서버가 채워 준 `textId` 이 아직 null 인 낡은 값일 수 있다. 그걸
   * 되쓰면 id 가 다시 null 이 되고, 그 뒤 이 도형의 모든 편집이 저장 큐에서
   * "id 없음" 으로 걸러진다 — 색을 한 번 바꿨을 뿐인데 영구히 저장되지 않았다.
   */
  function patch(next: Partial<PageTextShape['props']>) {
    editor.updateShape<PageTextShape>({ id: shapeId, type: 'page-text', props: next });
  }

  return (
    <InspectorShell
      title={`텍스트${p.textId ? '' : ' · 저장 중…'}`}
      onDelete={() => editor.deleteShapes([shapeId])}
      deleteLabel="텍스트 삭제"
    >
      <InspectorSection icon={Type} title="텍스트">
        <Field label="폰트">
          <Select
            value={p.fontFamily}
            onValueChange={(v) => patch({ fontFamily: v as PageTextFontFamily })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TEXT_FONT_FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  <span style={{ fontFamily: f }}>{PAGE_TEXT_FONT_LABEL[f]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="정렬">
          <AlignToggle value={p.textAlign} onChange={(v) => patch({ textAlign: v })} />
        </Field>

        <Field label="크기">
          <div className="flex items-center gap-2">
            <NumberField
              value={p.fontSize}
              min={6}
              max={200}
              step={1}
              onCommit={(v) => patch({ fontSize: v })}
              ariaLabel="글자 크기"
            />
            <span className="text-caption text-muted-foreground">px</span>
          </div>
        </Field>

        <Field label="색">
          <ColorField
            value={p.color}
            onCommit={(v) => patch({ color: v })}
            ariaLabel="글자 색"
            variant="panel"
          />
        </Field>
      </InspectorSection>

      {onReorder && (
        <InspectorSection icon={Layers} title="순서">
          <LayerOrderControls
            canMoveForward={canMoveForward ?? false}
            canMoveBackward={canMoveBackward ?? false}
            onReorder={onReorder}
            disabled={!p.textId}
          />
        </InspectorSection>
      )}
    </InspectorShell>
  );
}
