import { prisma } from '@comicai/db';
import type { ImageRef } from '@comicai/types';

/**
 * `refImages` JSON 배열에 원소를 **원자적으로** 덧붙인다.
 *
 * 예전에는 소유권 검사가 돌려준 배열을 읽어 `[...기존, 새것]` 으로 통째 덮어썼다.
 * 그러면 동시 업로드가 유실된다 — 참조 이미지 3장을 한 번에 드래그하면 셋 다 같은
 * 배열을 읽고 각자 덮어써서 **최종 1장만 남고 나머지 2장은 S3 고아**가 된다.
 * 컨트롤러가 한 번에 12장까지 받으므로(`consistency.controller.ts:87`) 가정이 아니라
 * 평범한 사용에서 일어난다.
 *
 * Postgres 의 `jsonb || jsonb` 는 한 문장 안에서 읽고 쓰므로 동시 실행이 서로를 잃지
 * 않는다. Prisma 에는 JSON 배열 append 프리미티브가 없어 raw SQL 로 간다 — 값은 전부
 * 파라미터로 바인딩되므로 문자열 조립이 아니다.
 */
export async function appendPanelRefImages(panelId: string, refs: ImageRef[]): Promise<void> {
  if (refs.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "panels"
       SET "ref_images" = COALESCE("ref_images", '[]'::jsonb) || ${JSON.stringify(refs)}::jsonb
     WHERE "id" = ${panelId}`;
}

/**
 * 엔티티 쪽은 `version` 도 함께 올린다. 같은 문장 안에서 올려야 덧붙인 장수와 버전이
 * 어긋나지 않는다.
 *
 * `updated_at` 은 Prisma 의 `@updatedAt` 이 **클라이언트에서** 채우는 값이라 이 경로를
 * 타면 손으로 넣어야 한다. 빠뜨리면 이미지를 추가해도 목록 정렬(`updatedAt desc`)이
 * 움직이지 않는다. `panels` 에는 그 컬럼 자체가 없다.
 */
export async function appendEntityRefImages(entityId: string, refs: ImageRef[]): Promise<void> {
  if (refs.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "consistency_entities"
       SET "ref_images" = COALESCE("ref_images", '[]'::jsonb) || ${JSON.stringify(refs)}::jsonb,
           "version" = "version" + 1,
           "updated_at" = now()
     WHERE "id" = ${entityId}`;
}
