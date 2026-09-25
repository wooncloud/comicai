import { prisma } from '@comicai/db';
import { StoragePrefix } from '../storage/storage.service';

/**
 * 페이지들이 저장소에 남긴 것의 prefix — 컷마다의 업로드·콘티·렌더 결과와 페이지 내보내기.
 *
 * **DB 에서 지우기 전에** 불러야 한다. 컷 행은 페이지와 함께 cascade 로 사라지는데,
 * 컷에는 자기 prefix 가 있고 페이지에는 없어서, 지운 뒤에는 어느 컷이었는지 알 길이 없다.
 *
 * 페이지 한 장을 지울 때와 화 하나를 지울 때가 같이 쓴다. 예전에는 페이지 삭제만 이
 * 청소를 들고 있어서, 화가 생긴 뒤 **화를 지우면 그 안 컷의 그림이 전부 저장소에 남았다.**
 */
export async function pageObjectPrefixes(
  userId: string,
  projectId: string,
  pageIds: readonly string[],
): Promise<string[]> {
  const panels = await prisma.panel.findMany({
    where: { pageId: { in: [...pageIds] } },
    select: { id: true },
  });
  return [
    ...panels.map((p) => StoragePrefix.panel(projectId, p.id)),
    ...pageIds.map((id) => StoragePrefix.pageExports(userId, id)),
  ];
}
