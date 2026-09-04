import type { TLShapeId } from 'tldraw';

/**
 * tldraw shape id 를 만든다. `createShapeId` 와 결과가 같다.
 *
 * **왜 tldraw 것을 안 쓰는가.** `createShapeId` 는 값 import 라, 이 헬퍼를 쓰는
 * 모듈이 tldraw 번들 전체를 끌어온다. 그 모듈들(동기화 훅 5개, 페이지 프레임)은
 * 에디터 페이지가 **정적으로** import 하므로, 그 한 줄 때문에 `dynamic()` 으로
 * 미뤄 둔 tldraw 384kB(gzip)가 초기 로드에 그대로 실렸다 — 실제로 그 경계가
 * 지연시키던 건 18kB 뿐이었다.
 *
 * 원본은 `` `shape:${id ?? uniqueId()}` `` 한 줄이고, 우리 호출부는 전부 id 를
 * 명시하므로 이 구현으로 충분하다. 타입만 import 하는 것은 컴파일 시 지워진다.
 */
export function shapeId(id: string): TLShapeId {
  return `shape:${id}` as TLShapeId;
}
