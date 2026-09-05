import { Global, Module } from '@nestjs/common';
import { TokensService } from './tokens.service';

/**
 * 전역이다. 토큰 차감이 붙는 자리가 렌더 워커·일관성 생성·인증(가입 지급)·관리자로
 * 흩어져 있어서, 모듈마다 import 를 늘리면 새 소비 지점이 생길 때마다 빠뜨리기 쉽다.
 */
@Global()
@Module({
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
