import { Controller, Get, Query, Req } from '@nestjs/common';
import type { TokenBalanceDTO, TokenLedgerEntryDTO } from '@comicai/types';
import { AuthedRequest } from '../auth/session.guard';
import { TokensService } from './tokens.service';

/**
 * 내 토큰. 읽기 전용이다 — 잔액을 바꾸는 길은 렌더(차감)·구매·운영자 지급뿐이고,
 * 사용자가 직접 부를 수 있는 자리를 만들면 그게 곧 잔액 조작 경로가 된다.
 */
@Controller('me/tokens')
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  @Get()
  async balance(@Req() req: AuthedRequest): Promise<TokenBalanceDTO> {
    return this.tokens.balanceDto(req.user.id);
  }

  @Get('history')
  async history(
    @Req() req: AuthedRequest,
    @Query('limit') limit?: string,
  ): Promise<TokenLedgerEntryDTO[]> {
    // 문자열이 숫자가 아니면 NaN 이고, 서비스가 그걸 기본값으로 되돌린다.
    const n = Number(limit);
    return this.tokens.history(req.user.id, Number.isFinite(n) ? n : undefined);
  }
}
