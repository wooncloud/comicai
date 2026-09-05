import { Global, Module } from '@nestjs/common';
import { TokensService } from './tokens.service';
import { TokensController } from './tokens.controller';

/**
 * 전역이다. 토큰 차감이 붙는 자리가 렌더 워커·일관성 생성·인증(가입 지급)·관리자로
 * 흩어져 있어서, 모듈마다 import 를 늘리면 새 소비 지점이 생길 때마다 빠뜨리기 쉽다.
 */
@Global()
@Module({
  // 컨트롤러도 여기 산다. 예전에는 `BillingModule` 이 모듈 경계를 넘어 이 파일의
  // 컨트롤러를 등록했는데, 그러면 `/me/tokens` 가 어디서 켜지는지 grep 으로만 알 수 있다.
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
