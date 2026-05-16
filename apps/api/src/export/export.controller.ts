import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { ExportService } from './export.service';

const ExportSchema = z.object({
  format: z.enum(['png', 'jpg']).default('png'),
});

class ExportDto { static zodSchema = ExportSchema; format!: 'png' | 'jpg' }

@Controller()
@UseGuards(SessionGuard)
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Post('pages/:id/export')
  async export(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: ExportDto) {
    return this.svc.exportPage(req.user.id, id, body.format);
  }
}
