import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { prisma } from '@comicai/db';
import { isAdminEmail, parseAdminEmails } from '@comicai/types';
import type { AuthedRequest } from './session.guard';
import { apiError } from '../common/api-error';

/**
 * 환경변수 `ADMIN_EMAILS` 의 허용 목록.
 *
 * 모듈 로드 시 한 번만 파싱한다. 요청마다 다시 쪼갤 이유가 없고, 운영 중에
 * 값이 바뀌면 재기동해야 한다는 점이 오히려 명확하다.
 *
 * 코드에 이메일을 적지 않는 이유: 이 저장소는 공개다.
 */
const ADMIN_EMAILS = parseAdminEmails(process.env.ADMIN_EMAILS);

/**
 * 운영자인가. **이메일 인증을 마친 계정만** 인정한다.
 *
 * 목록에 적힌 이메일에 아직 계정이 없으면, 그 주소를 아는 사람이 **먼저 가입해
 * 선점**할 수 있다. 저장소가 공개라 운영자 이메일은 `git log` 에 그대로 보이므로
 * 이건 이론이 아니다. 메일함을 실제로 가진 사람만 통과하게 해야 그 경로가 닫힌다.
 *
 * 그래서 운영자는 한 번은 인증 메일을 받아야 한다 — 목록에 이름이 올랐다는 것만으로는
 * 부족하다.
 */
export function isAdmin(email: string, emailVerifiedAt: Date | null): boolean {
  if (!emailVerifiedAt) return false;
  return isAdminEmail(email, ADMIN_EMAILS);
}

/**
 * 관리자 전용 라우트 가드.
 *
 * **반드시 `SessionGuard` 뒤에 온다** — `req.user` 를 채우는 것은 그쪽이다.
 * 순서가 뒤바뀌면 `req.user` 가 undefined 라서 여기서 터진다(그래도 통과는
 * 시키지 않으니 열리지는 않는다).
 *
 * 화면을 숨기는 것만으로는 아무것도 막지 못한다. URL 을 직접 치면 그만이고,
 * API 는 브라우저를 거치지 않고도 부를 수 있다. 실제 차단은 여기서 한다.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Partial<AuthedRequest>>();
    const userId = req.user?.id;
    // 관리자가 아닌 것과 목록이 비어 있는 것을 구분해 알려 주지 않는다.
    // 어느 쪽인지 알려 주면 설정 상태를 탐색할 수 있다.
    if (!userId) throw new ForbiddenException(apiError({ code: 'FORBIDDEN' }));

    // 세션에는 인증 시각이 없다. 운영자 라우트에서만 도는 쿼리 한 번이다.
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!row || !isAdmin(row.email, row.emailVerifiedAt)) {
      throw new ForbiddenException(apiError({ code: 'FORBIDDEN' }));
    }
    return true;
  }
}
