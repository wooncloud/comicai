import type { Request } from 'express';

/**
 * 세션 기록용 클라이언트 정보.
 *
 * **`req.ip` 만 쓴다.** 예전에는 `X-Forwarded-For` 의 **맨 앞 값**을 `req.ip` 보다
 * 우선했는데, 그게 정확히 클라이언트가 위조할 수 있는 부분이다. 세션을 탈취한
 * 공격자가 로그인 요청에 아무 IP나 붙이면 `/me/sessions` 의 "로그인된 기기" 에 그
 * 값이 그대로 박혔고, 피해자가 낯선 접속을 확인하려 해도 실제 출처를 볼 수 없었다 —
 * 그 화면의 존재 이유가 무력화된다.
 *
 * Express 는 `trust proxy` 설정대로 XFF 를 이미 계산해 `req.ip` 에 넣어 준다
 * (`bootstrap.ts` 에서 `1` — 가장 가까운 프록시 하나만 신뢰). 그 값을 그대로 쓴다.
 */
export function sessionMetaFromRequest(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip || undefined,
    userAgent: req.headers['user-agent'] || undefined,
  };
}
