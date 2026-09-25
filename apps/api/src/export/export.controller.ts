import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { EpisodeExportSchema, ExportRequestSchema, type EpisodeExportMode } from '@comicai/types';
import { AuthedRequest } from '../auth/session.guard';
import { ExportService } from './export.service';

class ExportDto {
  static zodSchema = ExportRequestSchema;
  format!: 'png' | 'jpg';
  dpi?: number;
}
class EpisodeExportDto {
  static zodSchema = EpisodeExportSchema;
  format!: 'png' | 'jpg';
  dpi?: number;
  mode!: EpisodeExportMode;
}

@Controller()
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Post('pages/:id/export')
  async export(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: ExportDto) {
    return this.svc.exportPage(req.user.id, id, body.format, body.dpi);
  }

  /** 화 한 편. 결과가 **여러 장일 수 있다** — 이어 붙여도 너무 길면 나눈다. */
  @Post('episodes/:id/export')
  async exportEpisode(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: EpisodeExportDto,
  ) {
    return this.svc.exportEpisode(req.user.id, id, body.format, body.dpi, body.mode);
  }
}
