import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfMiddleware } from './common/csrf.middleware';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { TokensModule } from './tokens/tokens.module';
import { BillingModule } from './billing/billing.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { OAuthModule } from './auth/oauth/oauth.module';
import { EmailModule } from './email/email.module';
import { MeModule } from './me/me.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AdminModule } from './admin/admin.module';
import { ProjectsModule } from './projects/projects.module';
import { ConsistencyModule } from './consistency/consistency.module';
import { PagesModule } from './pages/pages.module';
import { PanelsModule } from './panels/panels.module';
import { SpeechBubblesModule } from './speech-bubbles/speech-bubbles.module';
import { PageTextsModule } from './page-texts/page-texts.module';
import { PageLinesModule } from './page-lines/page-lines.module';
import { RenderModule } from './render/render.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              },
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
            '*.apiKey',
            '*.api_key',
            '*.secret',
            '*.token',
            '*.ciphertext',
            '*.password',
            '*.passwordHash',
          ],
          censor: '***',
        },
        autoLogging: { ignore: (req) => req.url === '/healthz' },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: seconds(60), limit: 120 }]),
    TokensModule,
    BillingModule,
    MetricsModule,
    EmailModule,
    AuthModule,
    OAuthModule,
    MeModule,
    ApiKeysModule,
    AdminModule,
    ProjectsModule,
    ConsistencyModule,
    PagesModule,
    PanelsModule,
    SpeechBubblesModule,
    PageTextsModule,
    PageLinesModule,
    RenderModule,
    ExportModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    /*
     * 인증을 **기본값**으로 만든다. 예전에는 컨트롤러마다 `@UseGuards(SessionGuard)` 를
     * 붙였고 4곳(health/metrics/auth/oauth)이 의도적으로 없었다. 그러면 가드를 잊은 새
     * 컨트롤러는 인증도 CSRF 도 없는 상태가 된다 — `CsrfMiddleware` 가 "세션 쿠키 없는
     * 요청" 을 통과시키기 때문이다(가드가 401 로 막아 줄 것을 전제한다).
     * 서로를 전제하는 두 밑단 중 하나가 opt-in 이면, 잊었을 때 둘 다 사라진다.
     *
     * 공개가 필요한 곳은 `@Public()` 로 표시한다. 순서상 이 가드가 컨트롤러 가드보다
     * 먼저 돌므로, AdminGuard 등은 `req.user` 를 그대로 받는다.
     */
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
