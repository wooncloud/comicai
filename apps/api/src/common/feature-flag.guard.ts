import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isFlagOn } from '@comicai/types';

/**
 * 꺼진 기능의 엔드포인트를 통째로 막는다.
 *
 * 화면에서 링크만 없애는 것으로는 부족하다 — 예전 URL 을 기억하는 브라우저,
 * 북마크, 그리고 브라우저를 거치지 않는 호출이 그대로 남는다.
 *
 * 403 이 아니라 **404** 를 던진다. "권한이 없다" 는 그 기능이 존재한다는 뜻이라,
 * 아직 공개하지 않은 기능의 존재를 알려 주게 된다. 꺼진 기능은 없는 기능이다.
 */
function featureGuard(envName: string): new () => CanActivate {
  @Injectable()
  class FeatureGuard implements CanActivate {
    canActivate(): boolean {
      if (!isFlagOn(process.env[envName])) {
        throw new NotFoundException({ code: 'NOT_FOUND' });
      }
      return true;
    }
  }
  return FeatureGuard;
}

/**
 * 사용자가 직접 넣는 AI 서비스 키(BYOK) 기능.
 *
 * 결제 + 사용량 과금으로 방향을 바꾸는 중이라 기본은 꺼짐이다. 코드를 지우지 않고
 * 플래그로 덮어 둔 것은, 과금이 자리 잡기 전까지 되돌릴 여지를 남기기 위해서다.
 * 켜려면 `.env` 에 `FEATURE_API_KEYS=1`.
 */
export const ApiKeysFeatureGuard = featureGuard('FEATURE_API_KEYS');
