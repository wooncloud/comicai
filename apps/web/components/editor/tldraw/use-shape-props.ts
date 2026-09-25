'use client';
import { useCallback, useSyncExternalStore } from 'react';
import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw';

/**
 * 인스펙터가 자기 셰이프의 `props` 를 읽고 고친다.
 *
 * **왜 구독하나.** 예전에는 에디터 라우트가 선택된 셰이프 레코드를 통째로 state 에 들고
 * 인스펙터에 내려줬다. 레코드는 옮길 때마다 새 객체가 되므로, 말풍선 하나를 끄는 동안
 * 라우트 전체(상단바·사이드바·인스펙터)가 포인터 속도로 다시 그려졌다. 컷만은 그걸 피하려고
 * DTO 스냅샷을 읽었는데, 그러다 보니 테두리 값이 캔버스와 어긋났다.
 *
 * 이제 라우트는 "무엇이 선택됐나" 만 들고, 값은 인스펙터가 여기서 읽는다. tldraw 는 이동처럼
 * `props` 가 없는 갱신이면 `props` 객체를 그대로 두므로(`applyPartialToRecordWithProps`),
 * 끄는 동안에는 이 훅이 같은 참조를 돌려주고 아무것도 다시 그려지지 않는다.
 *
 * `useValue` 를 쓰지 않는 이유: tldraw 런타임 import 가 되어, 에디터 라우트의 정적
 * import 사슬로 tldraw 번들 전체가 끌려온다(`ToolRail` 을 `dynamic` 으로 뺀 이유와 같다).
 *
 * 셰이프가 지워졌으면 `props` 는 undefined 다.
 */
export function useShapeProps<S extends TLShape>(editor: Editor, shapeId: TLShapeId) {
  const subscribe = useCallback(
    // 셰이프는 document 레코드다. 포인터 위치(session)가 바뀔 때마다 깨어날 이유가 없다.
    (onChange: () => void) => editor.store.listen(onChange, { scope: 'document' }),
    [editor],
  );
  const read = useCallback(
    () => editor.getShape<S>(shapeId)?.props as S['props'] | undefined,
    [editor, shapeId],
  );
  const props = useSyncExternalStore(subscribe, read, read);

  /*
   * **바뀐 키만 넘긴다.** `updateShape` 는 props 를 부분 병합한다. 전체를 스프레드해
   * 넘기면, 그 사이 서버가 채워 준 id(`bubbleId` 등)가 null 이던 옛 값으로 되돌아갈 수
   * 있다 — 그러면 그 뒤 이 도형의 모든 편집이 저장 큐에서 "id 없음" 으로 걸러져, 색을
   * 한 번 바꿨을 뿐인데 영구히 저장되지 않았다.
   */
  const patch = useCallback(
    (next: Partial<S['props']>) => {
      const shape = editor.getShape<S>(shapeId);
      if (!shape) return;
      editor.updateShape({ id: shapeId, type: shape.type, props: next } as TLShapePartial<S>);
    },
    [editor, shapeId],
  );

  return { props, patch };
}
