import { NotFoundException } from '@nestjs/common';
import type { ErrorCode } from '@comicai/types';
import { apiError } from './api-error';

/**
 * 페이지 직속 오브젝트(말풍선 · 페이지 텍스트 · 페이지 직선) 세 모듈이 공유하는 조각.
 *
 * 셋은 `assertOwned` · 순서 채번 · 소유권 판정이 **표현까지 같다.** 네 번째 오브젝트를
 * 추가하면 네 번째 벌이 생기는 자리라, 도메인 이름만 다른 부분을 인자로 뺐다.
 *
 * 조회 자체(`prisma.speechBubble` / `pageText` / `pageLine`)는 각 서비스에 남는다.
 * Prisma 델리게이트는 모델마다 다른 제네릭 타입이라 셋을 하나의 파라미터로 받으려면
 * 캐스트가 필요한데, **소유권 검사 경로에서 타입을 느슨하게 만들 이유가 없다.**
 * 대신 조회 결과의 모양과 판정 규칙만 여기서 고정한다.
 */
export interface PageChildRow {
  id: string;
  pageId: string;
  style: unknown;
  page: { project: { userId: string } };
}

/** 세 모듈이 같은 컬럼을 읽는다. select 가 어긋나면 아래 판정이 컴파일에서 걸린다. */
export const PAGE_CHILD_SELECT = {
  id: true,
  pageId: true,
  style: true,
  page: { select: { project: { select: { userId: true } } } },
} as const;

/**
 * 소유권 판정. **남의 것도, 없는 것도 똑같이 404 다** — 403 이면 "그 id 는 실존하며
 * 남의 것" 이 확인되어, id 를 훑는 것만으로 남의 리소스 존재 여부를 열거할 수 있다.
 * 자세한 근거는 `projects.service.ts` 의 `assertOwned`.
 */
export function assertPageChildOwned(
  row: PageChildRow | null,
  userId: string,
  code: ErrorCode,
): { id: string; pageId: string; style: unknown } {
  if (row?.page.project.userId !== userId) throw new NotFoundException(apiError({ code }));
  return { id: row.id, pageId: row.pageId, style: row.style };
}

/** 맨 위에 쌓기 위한 다음 순서 값. 비어 있으면 0. */
export function nextOrder(max: { _max: { order: number | null } }): number {
  return (max._max.order ?? -1) + 1;
}
