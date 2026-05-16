import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExportRequestSchema } from '@comicai/types';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { ExportService } from './export.service';

class ExportDto {
  static zodSchema = ExportRequestSchema;
  format!: 'png' | 'jpg';
  dpi?: number;
}

@Controller()
@UseGuards(SessionGuard)
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Post('pages/:id/export')
  async export(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: ExportDto) {
    return this.svc.exportPage(req.user.id, id, body.format);
  }
}
