import { DEFAULT_PAGE_SIZE } from '@comicai/types';

/**
 * 저장된 `page.size` 를 읽는다. 형태가 깨진 쪽은 새 페이지의 기본 크기로 채운다.
 *
 * size 는 Json 컬럼이라 타입 캐스팅이 실제 값을 보장하지 않는다. 형태가 깨진 행이
 * 하나 있으면 에디터가 통째로 죽으므로(page-size-select 가 value.w 를 그대로 읽는다)
 * 경계에서 흡수한다.
 *
 * DTO 를 만드는 쪽과 내보내기가 **같은 함수**를 쓴다. 예전에는 서비스 안의 private
 * 함수였고 폴백이 800×1200 이라 기본 크기(`DEFAULT_PAGE_SIZE`)와 이미 어긋나 있었으며,
 * 내보내기는 캐스트만 해서 같은 행이 에디터에서는 800×1200, 파일에서는 1×1 이 됐다.
 */
export function readPageSize(raw: unknown): { w: number; h: number } {
  const s = raw as { w?: unknown; h?: unknown } | null | undefined;
  const w = typeof s?.w === 'number' && s.w > 0 ? s.w : DEFAULT_PAGE_SIZE.w;
  const h = typeof s?.h === 'number' && s.h > 0 ? s.h : DEFAULT_PAGE_SIZE.h;
  return { w, h };
}
