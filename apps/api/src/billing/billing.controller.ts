import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { TokenOrderCreateSchema, type TokenOrderDTO, type TokenPackagesDTO } from '@comicai/types';
import { AuthedRequest } from '../auth/session.guard';
import { BillingService } from './billing.service';

class OrderCreateDto {
  static zodSchema = TokenOrderCreateSchema;
  packageId!: string;
  depositorName?: string;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('packages')
  packages(): TokenPackagesDTO {
    return this.billing.packages();
  }

  @Get('orders')
  async list(@Req() req: AuthedRequest): Promise<TokenOrderDTO[]> {
    return this.billing.listOrders(req.user.id);
  }

  /**
   * 주문을 만든다. **토큰은 아직 들어가지 않는다** — `pending` 으로 남고, 결제가 확인돼야
   * 지급된다. 지금은 그 확인을 운영자가 한다.
   */
  @Post('orders')
  async create(@Req() req: AuthedRequest, @Body() body: OrderCreateDto): Promise<TokenOrderDTO> {
    return this.billing.createOrder(req.user.id, body.packageId, body.depositorName);
  }

  /** 아직 처리되지 않은 주문 접기. 잘못 누른 것이 영원히 남지 않게 한다. */
  @Delete('orders/:id')
  @HttpCode(204)
  async cancel(@Req() req: AuthedRequest, @Param('id') id: string): Promise<void> {
    await this.billing.cancelOrder(req.user.id, id);
  }
}
