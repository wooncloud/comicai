import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * `/v1/metrics` 접근 제어.
 *
 * 예전에는 아무 제한이 없었다. 저장소가 공개라 경로는 이미 알려져 있고, 응답에는
 * 프로세스 메모리·이벤트루프 지연 같은 내부 상태뿐 아니라 엔드포인트별 실패율과
 * 모델별 총 생성 건수(= 사업 지표)가 그대로 들어 있다.
 *
 * **토큰이 설정되지 않았으면 아무도 못 본다.** 설정을 깜빡했을 때 전체 공개가 되는
 * 것보다 스크레이퍼가 404 를 받는 쪽이 안전하다 — AdminGuard 와 같은 판단이다.
 *
 * 403 이 아니라 404 인 이유: 인증 실패를 알려 주면 "여기에 메트릭이 있다" 는 사실을
 * 확인해 준다. FeatureFlagGuard 도 같은 이유로 404 를 쓴다.
 */
@Injectable()
export class MetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_TOKEN?.trim();
    if (!expected) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const provided = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (provided !== expected) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });

    return true;
  }
}
