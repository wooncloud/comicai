import type { INestApplication, NestInterceptor } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Nest 앱에 글로벌 파이프라인을 적용한다. main.ts(production)와 통합 테스트(setup.ts)가
 * 동일한 미들웨어 체인을 사용하도록 한곳에서 정의.
 */
export function applyAppPipeline(
  app: INestApplication,
  options: { extraInterceptors?: NestInterceptor[] } = {},
): void {
  /*
   * 리버스 프록시(Cloudflare 터널) 뒤에서 실제 클라이언트 IP 를 읽는다.
   *
   * 없으면 req.ip 가 모든 요청에 대해 프록시 컨테이너의 IP 하나가 되어,
   * rate limit 이 사용자별이 아니라 **서비스 전체 합계**가 된다. 한 명이 로그인을
   * 몇 번 틀리면 그 1분 동안 전원이 로그인하지 못한다.
   *
   * 1 = 가장 가까운 프록시 하나만 신뢰. Cloudflare 는 클라이언트가 보낸
   * X-Forwarded-For 뒤에 실제 IP 를 덧붙이고 Express 는 오른쪽 끝을 취하므로
   * 헤더 위조로는 못 속인다. 단, api 포트가 인터넷에 직접 열려 있으면 프록시를
   * 건너뛴 요청이 XFF 를 마음대로 넣을 수 있다 — infra/compose/full.yml 이
   * 4000 을 루프백에만 바인딩하는 이유다. 그 둘은 세트다.
   */
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('v1', { exclude: ['healthz'] });
  // `SessionGuard` · `CsrfMiddleware` · OAuth 콜백은 `req.cookies` 를 옵셔널 체이닝
  // 없이 인덱싱한다. 앱을 만드는 경로가 여기 하나뿐이라 그게 성립한다 — 이 줄을
  // 빼거나 이 함수를 거치지 않고 앱을 조립하면 첫 요청부터 전부 500 이 된다.
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(
    ...(options.extraInterceptors ?? []),
    new ResponseEnvelopeInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
