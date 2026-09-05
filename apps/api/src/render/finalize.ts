import { prisma, type Prisma } from '@comicai/db';
import { IN_PROGRESS_RENDER_STATUSES, type TerminalRenderStatus } from '@comicai/types';
import type { TokensService } from '../tokens/tokens.service';

/**
 * 렌더 잡을 종결 상태로 옮기고, 결과를 못 냈으면 토큰을 돌려준다.
 *
 * **이 두 가지는 한 몸이어야 한다.** 예전에는 종결 상태를 쓰는 곳이 셋이었고
 * (워커의 성공·실패 경로, 취소, 그리고 예외 마감 `finalizeOrphan`) 환급은 그중 둘에만
 * 손으로 붙어 있었다. 빠진 하나는 잡을 `failed` 로 마감하면서 토큰을 그대로 태웠다 —
 * 환급이 빠진 것은 아무 오류도 내지 않고, BYOK 로 그린 잡과 구별되지 않는다.
 *
 * 이 파일이 하는 일은 "종결 상태를 쓰는 유일한 길" 을 만드는 것이다. 나중에 네 번째
 * 마감 경로(타임아웃 청소, 관리자 강제 취소, stalled 수거)가 생겨도 환급을 잊을 수 없다.
 * 자격 증명을 내주는 자리에 계량을 둔 것과 같은 이유다(`model-credentials.ts`).
 *
 * 조건부 갱신인 이유: 이미 종결된 잡을 다시 덮으면 성공한 잡이 '취소' 가 되거나 분류된
 * 에러가 'unknown' 으로 지워진다. 갱신이 성사됐을 때만 `true` 를 돌려주므로, 호출부는
 * 그때만 SSE 를 쏘면 된다.
 *
 * @returns 이 호출이 실제로 상태를 바꿨는가
 */
export async function finalizeRenderJob(
  tokens: TokensService,
  jobId: string,
  status: TerminalRenderStatus,
  opts: { reason: string; data?: Prisma.RenderJobUpdateInput },
): Promise<boolean> {
  const { count } = await prisma.renderJob.updateMany({
    where: { id: jobId, status: { in: [...IN_PROGRESS_RENDER_STATUSES] } },
    data: { ...opts.data, status, finishedAt: new Date() },
  });

  if (count === 0) {
    /*
     * 경합에서 졌다 — 다른 쪽이 먼저 종결했다.
     *
     * **그래도 환급은 봐야 한다.** 흔한 순서가 이렇다: 사용자가 취소를 누르는데 그
     * 시점에는 워커가 아직 키를 안 받아 갔다 → 취소 쪽 환급은 원장에 찾을 것이 없어
     * 그냥 지나간다 → 그 뒤 워커가 차감하고, 결과를 만들고, 여기서 진다. 예전에는
     * 그대로 `return` 해서 **사용자가 취소한 그림값이 그대로 탔다.**
     *
     * 이긴 쪽이 성공이면 돌려주지 않는다. stalled 재큐로 워커 둘이 같은 잡을 처리하면
     * 진 쪽이 여기 오는데, 차감은 잡 id 로 하나뿐이라 그걸 돌려주면 성공한 그림이
     * 공짜가 된다.
     */
    const row = await prisma.renderJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (row && row.status !== 'succeeded') await tokens.refundRender(jobId, opts.reason);
    return false;
  }

  // 성공만 값을 받았다. 나머지는 결과가 없으므로 돌려준다 — 차감된 적이 없으면
  // (BYOK·mock) `refundRender` 가 알아서 아무것도 하지 않는다.
  if (status !== 'succeeded') await tokens.refundRender(jobId, opts.reason);
  return true;
}
