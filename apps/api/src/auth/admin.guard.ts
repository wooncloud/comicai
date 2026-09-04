import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isAdminEmail, parseAdminEmails } from '@comicai/types';
import type { AuthedRequest } from './session.guard';

/**
 * 환경변수 `ADMIN_EMAILS` 의 허용 목록.
 *
 * 모듈 로드 시 한 번만 파싱한다. 요청마다 다시 쪼갤 이유가 없고, 운영 중에
 * 값이 바뀌면 재기동해야 한다는 점이 오히려 명확하다.
 *
 * 코드에 이메일을 적지 않는 이유: 이 저장소는 공개다.
 */
const ADMIN_EMAILS = parseAdminEmails(process.env.ADMIN_EMAILS);

export function isAdmin(email: string): boolean {
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
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Partial<AuthedRequest>>();
    const email = req.user?.email;
    // 관리자가 아닌 것과 목록이 비어 있는 것을 구분해 알려 주지 않는다.
    // 어느 쪽인지 알려 주면 설정 상태를 탐색할 수 있다.
    if (!email || !isAdmin(email)) {
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    return true;
  }
}
