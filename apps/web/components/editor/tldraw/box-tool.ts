'use client';
import {
  StateNode,
  createShapeId,
  type Editor,
  type TLShapeId,
  type TLStateNodeConstructor,
} from 'tldraw';

/** 편집을 연다 — 선택하고, 편집 도형으로 삼고, 편집 상태로. */
function openEditing(editor: Editor, id: TLShapeId): void {
  editor.select(id);
  editor.setEditingShape(id);
  editor.setCurrentTool('select.editing_shape');
}

/**
 * 도구가 `select` 로 돌아간 **다음 프레임**에 편집을 연다.
 *
 * 다각형은 꼭짓점을 다 찍은 순간 동기적으로 만들어지는데, 그 직후 베이스가
 * `setCurrentTool('select')` 로 덮는다. 같은 틱에 편집을 열면 그 호출에 지워진다.
 * 그 사이 취소되어 도형이 없으면 아무것도 하지 않는다.
 */
export function openEditingNextFrame(editor: Editor, id: TLShapeId): void {
  requestAnimationFrame(() => {
    if (!editor.getShape(id)) return;
    openEditing(editor, id);
  });
}

/**
 * 드래그로 새로 그린 도형을 **손을 뗀 뒤** 편집으로 연다.
 *
 * 클릭 생성은 도구가 그 자리에서 편집으로 보내면 된다. 드래그 생성은 `select.resizing`
 * 으로 넘어가 거기서 끝나므로 도구에는 끝났다는 신호가 오지 않는다. `ShapeUtil.onResizeEnd`
 * 도 **생성 드래그에서는 불리지 않는다** — 운영에서 확인했다. 그래서 다음 pointerup 을
 * 한 번만 듣고, 리사이즈 상태가 정리된 다음 프레임에 연다.
 */
function openEditingAfterDrag(editor: Editor, id: TLShapeId): void {
  const run = () => {
    window.removeEventListener('pointerup', run, true);
    openEditingNextFrame(editor, id);
  };
  window.addEventListener('pointerup', run, true);
}

interface BoxToolSpec {
  shapeType: string;
  /** 클릭만 했을 때의 크기. 끌어서 만들면 끈 만큼이다. */
  clickSize: { w: number; h: number };
  /**
   * 도구마다 다른 props(말풍선의 `variant`). **나머지는 적지 않는다** — tldraw 가
   * 만들 때 셰이프의 `getDefaultProps()` 로 채운다. 예전에는 도구가 기본값을 다시
   * 적어 두어서, 공용 기본값을 바꿔도 새로 만든 도형에는 반영되지 않았다.
   */
  props?: (tool: StateNode) => Record<string, unknown>;
}

/**
 * 끌거나 클릭해 상자 도형 하나를 만들고 **곧바로 편집으로 여는** 도구의 두 상태.
 * 말풍선(네 모양)과 자유 텍스트가 같이 쓴다 — 두 파일에 같은 상태 기계가 복사돼 있었다.
 *
 * tldraw 의 `BaseBoxShapeTool` 을 쓰지 않는 이유: 클릭만 한 경로는 `onCreate` 를 부르지
 * 않고 기본 props 그대로 만들어, 어떤 모양의 풍선 도구를 골라도 늘 타원이 나왔다.
 */
export function boxToolStates(spec: BoxToolSpec): TLStateNodeConstructor[] {
  class Idle extends StateNode {
    static override id = 'idle';
    override onEnter(): void {
      this.editor.setCursor({ type: 'cross', rotation: 0 });
    }
    override onPointerDown(): void {
      this.parent.transition('pointing');
    }
    override onCancel(): void {
      this.editor.setCurrentTool('select');
    }
  }

  class Pointing extends StateNode {
    static override id = 'pointing';

    private create(x: number, y: number, size: { w: number; h: number }): TLShapeId {
      const id = createShapeId();
      this.editor.createShape({
        id,
        type: spec.shapeType,
        x,
        y,
        props: { ...spec.props?.(this.parent), ...size },
      });
      return id;
    }

    override onPointerMove(): void {
      if (!this.editor.inputs.isDragging) return;
      const { originPagePoint } = this.editor.inputs;
      const markId = this.editor.markHistoryStoppingPoint(`creating:${spec.shapeType}`);
      const id = this.create(originPagePoint.x, originPagePoint.y, { w: 1, h: 1 });
      this.editor.select(id);
      this.editor.setCurrentTool('select.resizing', {
        target: 'selection',
        handle: 'bottom_right',
        isCreating: true,
        creatingMarkId: markId,
        creationCursorOffset: { x: 1, y: 1 },
      });
      openEditingAfterDrag(this.editor, id);
    }

    override onPointerUp(): void {
      const { originPagePoint } = this.editor.inputs;
      const { w, h } = spec.clickSize;
      this.editor.markHistoryStoppingPoint(`creating:${spec.shapeType}:click`);
      const id = this.create(originPagePoint.x - w / 2, originPagePoint.y - h / 2, { w, h });
      /*
       * 만들었으면 다음에 할 일은 글자를 쓰는 것이다 — 바로 편집으로 연다. 예전에는
       * 상자만 만들고 select 로 돌아가, 타이핑이 아무 데도 안 들어갔다. 빈 상자만
       * 필요하면 Esc 한 번이면 빠져나온다.
       */
      openEditing(this.editor, id);
    }

    override onCancel(): void {
      this.parent.transition('idle');
    }
    override onInterrupt(): void {
      this.parent.transition('idle');
    }
  }

  return [Idle, Pointing];
}
