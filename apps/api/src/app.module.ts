import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfMiddleware } from './common/csrf.middleware';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { OAuthModule } from './auth/oauth/oauth.module';
import { EmailModule } from './email/email.module';
import { MeModule } from './me/me.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ProjectsModule } from './projects/projects.module';
import { ConsistencyModule } from './consistency/consistency.module';
import { PagesModule } from './pages/pages.module';
import { PanelsModule } from './panels/panels.module';
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
    ThrottlerModule.forRoot([
      { name: 'default', ttl: seconds(60), limit: 120 },
      { name: 'strict', ttl: seconds(60), limit: 10 },
    ]),
    MetricsModule,
    EmailModule,
    AuthModule,
    OAuthModule,
    MeModule,
    ApiKeysModule,
    ProjectsModule,
    ConsistencyModule,
    PagesModule,
    PanelsModule,
    RenderModule,
    ExportModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
